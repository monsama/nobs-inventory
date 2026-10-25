import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

/* scripts/update.sh on an archive install, with docker and the downloads faked. The old script installs the new code and
   hands over to the new version's own script, so a secret the new version needs (and the old script does not know) is
   made before Compose starts. A new version that does not become healthy is switched back. */
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sh = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, { mode: 0o755 }); };

function setup({ health = 'healthy' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-update-'));
  const install = path.join(root, 'install'), bin = path.join(root, 'bin'), rel = path.join(root, 'releases', 'v2.0.0'), src = path.join(root, 'src');
  // The new release: this repository's code, as version 2.0.0, whose Compose file needs secrets/sheet_key.
  fs.mkdirSync(src, { recursive: true });
  for (const f of ['scripts', 'server', 'public', 'docker-compose.yml', 'package.json', 'Dockerfile', 'Caddyfile', '.env.example', 'README.md', 'deploy-nobs.sh', 'package-lock.json'])
    fs.cpSync(path.join(repo, f), path.join(src, 'nobs-inventory-2.0.0', f), { recursive: true });
  fs.writeFileSync(path.join(src, 'nobs-inventory-2.0.0', 'VERSION'), '2.0.0\n');
  fs.mkdirSync(rel, { recursive: true });
  execFileSync('tar', ['-czf', path.join(rel, 'nobs-inventory-2.0.0.tar.gz'), '-C', src, 'nobs-inventory-2.0.0']);
  execFileSync('sh', ['-c', 'sha256sum nobs-inventory-2.0.0.tar.gz > nobs-inventory-2.0.0.tar.gz.sha256'], { cwd: rel });
  // The installed version 1.0.0: the same code, but an update script that knows nothing of sheet_key (as 0.9.7's did).
  fs.cpSync(path.join(src, 'nobs-inventory-2.0.0'), install, { recursive: true });
  fs.writeFileSync(path.join(install, 'VERSION'), '1.0.0\n');
  const upd = path.join(install, 'scripts', 'update.sh');
  fs.writeFileSync(upd, fs.readFileSync(upd, 'utf8').split('\n').filter(l => !l.includes('sheet_key')).join('\n'), { mode: 0o755 });
  fs.mkdirSync(path.join(install, 'secrets')); fs.writeFileSync(path.join(install, 'secrets', 'feed_token'), '');
  fs.writeFileSync(path.join(install, '.env'), 'NI_IMAGE=ghcr.io/monsama/nobs-inventory:1.0.0\n');
  // docker: Compose refuses to start without a declared secret file; health as asked.
  sh(path.join(bin, 'docker'), `#!/bin/bash
echo "docker $*" >> "${root}/docker.log"
case "$1" in
  inspect) [[ "$*" == *State.Running* ]] && echo true || echo ${health} ;;
  cp) echo db > "$3" ;;
  compose) [ -s secrets/sheet_key ] || { echo "secret sheet_key: file does not exist" >&2; exit 1; } ;;
esac
exit 0
`);
  sh(path.join(bin, 'chown'), '#!/bin/sh\nexit 0\n');
  sh(path.join(bin, 'curl'), `#!/bin/bash
url="\${@: -1}"; out=""; while [ $# -gt 0 ]; do [ "$1" = -o ] && out="$2"; shift; done
case "$url" in
  *api.github.com*) echo '{"tag_name": "v2.0.0"}' ;;
  *) f="${root}/releases/\${url#*/download/}"; [ -f "$f" ] || exit 22; if [ -n "$out" ] && [ "$out" != /dev/null ]; then cp "$f" "$out"; fi ;;
esac
`);
  return { root, install, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, NI_RELEASE_URL: 'https://github.com/monsama/nobs-inventory/releases/download', NI_RELEASE_API: 'https://api.github.com/repos/x/y/releases/latest' } };
}
const run = s => spawnSync('bash', ['scripts/update.sh'], { cwd: s.install, env: s.env, encoding: 'utf8' });

test('an update to a version that needs a new secret: the new version\'s script makes it, and the update goes through', () => {
  const s = setup();
  const r = run(s);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Updated to 2\.0\.0/);
  assert.equal(fs.readFileSync(path.join(s.install, 'VERSION'), 'utf8').trim(), '2.0.0');
  assert.match(fs.readFileSync(path.join(s.install, '.env'), 'utf8'), /NI_IMAGE=ghcr\.io\/monsama\/nobs-inventory:2\.0\.0/);
  assert.ok(fs.statSync(path.join(s.install, 'secrets', 'sheet_key')).size > 20, 'the sheet key was made');
  assert.ok(fs.readFileSync(path.join(s.install, 'scripts', 'update.sh'), 'utf8').includes('sheet_key'), 'the new script is installed');
});

test('a new version that does not become healthy is switched back: the old code and the old image', () => {
  const s = setup({ health: 'unhealthy' });
  const r = run(s);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not healthy - switching back/);
  assert.equal(fs.readFileSync(path.join(s.install, 'VERSION'), 'utf8').trim(), '1.0.0', 'the old code is back');
  assert.match(fs.readFileSync(path.join(s.install, '.env'), 'utf8'), /NI_IMAGE=ghcr\.io\/monsama\/nobs-inventory:1\.0\.0/);
});
