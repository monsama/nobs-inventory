import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* docker-compose.yml: every secret the app reads (an NI_*_FILE under /run/secrets) is mounted into the app, declared at
   the end with its file, and made by the install and update scripts. A secret declared but not mounted is not in the
   container, and the app does not start (0.9.10 shipped with sheet_key so). */
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
const app = compose.slice(compose.indexOf('\n  app:'), compose.indexOf('\n  proxy:') > 0 ? compose.indexOf('\n  proxy:') : undefined);

test('every secret the app reads is mounted into it, declared with its file, and made by the scripts', () => {
  const read = [...app.matchAll(/NI_\w+_FILE: \/run\/secrets\/(\w+)/g)].map(m => m[1]);
  /* The app's secrets list: from its secrets: key to the next key of the service. */
  const list = app.slice(app.indexOf('    secrets:') + 1); const end = list.search(/\n {4}\w/);
  const mounted = [...(end > 0 ? list.slice(0, end) : list).matchAll(/^ {6}- (\w+)$/gm)].map(m => m[1]);
  const declared = [...compose.slice(compose.lastIndexOf('\nsecrets:')).matchAll(/^ {2}(\w+):\n {4}file: \.\/secrets\/(\w+)$/gm)].map(m => m[1]);
  assert.ok(read.length >= 5, 'the secrets the app reads: ' + read);
  for (const s of read) {
    assert.ok(mounted.includes(s), `${s} is read by the app but not mounted into it`);
    assert.ok(declared.includes(s), `${s} is not declared with its file`);
  }
  assert.deepEqual([...mounted].sort(), [...declared].sort(), 'mounted and declared secrets differ');
  const deploy = fs.readFileSync(path.join(root, 'deploy-nobs.sh'), 'utf8'), update = fs.readFileSync(path.join(root, 'scripts', 'update.sh'), 'utf8');
  for (const s of declared) {
    assert.ok(deploy.includes(s), `deploy-nobs.sh does not make secrets/${s}`);
    if (s !== 'admin_password' && s !== 'ldap_service_password' && s !== 'ls_token') assert.ok(update.includes(`secrets/${s}`), `update.sh does not make secrets/${s} for an older install`);
  }
});

/* The live updates (/api/events, Server-Sent Events) pass the shared proxy as they come: not compressed, which would hold
   them back, and not buffered by reverse_proxy. The site file is the one proxy-lib.sh writes from NI_HOST. */
test('the shared proxy neither compresses nor buffers the live updates', () => {
  const caddy = fs.readFileSync(path.join(root, 'proxy', 'Caddyfile'), 'utf8');
  const start = caddy.indexOf('(headers) {'), headers = caddy.slice(start, caddy.indexOf('\n}\n', start));
  assert.doesNotMatch(headers, /^\s*encode zstd gzip\s*$/m, 'encode without a matcher compresses the event stream');
  assert.match(headers, /@compressible \{[^}]*not header Accept text\/event-stream\*[^}]*not path \/api\/events[^}]*\}/);
  assert.match(headers, /^\s*encode @compressible zstd gzip$/m);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-site-'));
  try {
    fs.writeFileSync(path.join(dir, '.env'), 'NI_HOST=inventory.example.ch\n');
    const r = spawnSync('bash', ['-c', '. "$1" && proxy_site', 'x', path.join(root, 'scripts', 'proxy-lib.sh')], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const site = fs.readFileSync(path.join(dir, 'proxy', 'sites', 'inventory.caddy'), 'utf8');
    assert.match(site, /^\treverse_proxy nobs-inventory:8080 \{\n\t\tflush_interval -1\n\t\}\n\}\n$/m);
    assert.match(site, /^\timport tls_and_headers$/m, 'install-cert.sh still finds the line it replaces');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
