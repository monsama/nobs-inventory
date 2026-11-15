/* The server ends itself when it is stuck, so Docker's restart policy brings it back: the watchdog when the main thread
   stops answering, the health check after repeated database failures. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { healthCheck, HEALTH_FAILS } from '../server/watchdog.js';

test('a main thread that stops answering is ended by the watchdog', () => {
  const code = `import('./server/watchdog.js').then(({ startWatchdog }) => { startWatchdog({ NI_WATCHDOG_SECONDS: '2' }); setTimeout(() => { const end = Date.now() + 15000; while (Date.now() < end) {} console.log('not ended'); }, 1000); });`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 20000 });
  assert.equal(r.signal, 'SIGKILL', 'the stuck process was not ended');
  assert.match(r.stderr, /watchdog: the server did not answer/);
  assert.doesNotMatch(r.stdout, /not ended/);
});

test('a server that answers is left alone, and 0 turns the watchdog off', async () => {
  const code = `import('./server/watchdog.js').then(({ startWatchdog }) => { const stop = startWatchdog({ NI_WATCHDOG_SECONDS: '2' }); setTimeout(() => { stop(); console.log('fine'); }, 4000); startWatchdog({ NI_WATCHDOG_SECONDS: '0' }); });`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0); assert.match(r.stdout, /fine/);
});

test('the health check ends the server after repeated database failures, not after one', () => {
  const db = new DatabaseSync(':memory:'); const ended = [];
  const check = healthCheck(db, { exit: c => ended.push(c), log: () => {} });
  assert.equal(check(), true);
  db.close();
  for (let i = 1; i < HEALTH_FAILS; i++) assert.equal(check(), false);
  assert.deepEqual(ended, [], 'ended too early');
  check();
  assert.deepEqual(ended, [1]);
});
