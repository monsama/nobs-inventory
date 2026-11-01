/* Runs the browser tests (tests/browser/*.e2e.mjs) side by side: each file starts its own server on a free port with
   its own database and its own browser, so several can run at once. A file that fails has its output shown.
     node scripts/browser-tests.mjs              every file
     node scripts/browser-tests.mjs --shard 2/3  the second of three parts (CI runs the parts on separate machines)
     node scripts/browser-tests.mjs flows phone  only these files
   NI_TEST_JOBS sets how many run at once (default: half the CPU cores, 2 to 4). */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'tests', 'browser');
const args = process.argv.slice(2);
let files = fs.readdirSync(dir).filter(f => f.endsWith('.e2e.mjs')).sort();
const si = args.indexOf('--shard');
if (si >= 0) {
  const [k, n] = String(args[si + 1] || '').split('/').map(Number);
  if (!(n >= 1 && k >= 1 && k <= n)) { console.error('--shard takes k/n, e.g. 2/3'); process.exit(2); }
  /* Spread by turns over the sorted list, so each part gets a share of the long files too. */
  files = files.filter((_, i) => i % n === k - 1);
  args.splice(si, 2);
}
if (args.length) files = files.filter(f => args.some(a => f === a || f === `${a}.e2e.mjs`));
if (!files.length) { console.error('No browser test matches.'); process.exit(2); }

const jobs = Math.max(1, Number(process.env.NI_TEST_JOBS) || Math.min(4, Math.max(2, Math.floor(os.cpus().length / 2))));
const started = Date.now();
const failed = [];
let next = 0, done = 0;

const run = file => new Promise(resolve => {
  const t0 = Date.now(), out = [];
  const p = spawn(process.execPath, [path.join(dir, file)], { cwd: root, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
  p.stdout.on('data', b => out.push(b)); p.stderr.on('data', b => out.push(b));
  p.on('close', code => {
    done++;
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const text = Buffer.concat(out).toString();
    if (code === 0) console.log(`ok   ${file} (${secs} s) ${text.trim().split('\n').at(-1)}`);
    else { failed.push(file); console.log(`FAIL ${file} (${secs} s)\n${text.trim().split('\n').slice(-40).map(l => '     ' + l).join('\n')}`); }
    resolve();
  });
});
const worker = async () => { while (next < files.length) await run(files[next++]); };
console.log(`${files.length} browser test files, ${jobs} at a time`);
await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker));
console.log(`\n${done - failed.length} of ${done} passed in ${((Date.now() - started) / 1000).toFixed(0)} s${failed.length ? `; failed: ${failed.join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
