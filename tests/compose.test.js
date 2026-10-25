import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path';

/* docker-compose.yml: every secret the app reads (an NI_*_FILE under /run/secrets) is mounted into the app, declared at
   the end with its file, and made by the install and update scripts. A secret declared but not mounted is not in the
   container, and the app does not start (0.9.10 shipped with sheet_key so). */
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
const app = compose.slice(compose.indexOf('\n  app:'), compose.indexOf('\n  proxy:') > 0 ? compose.indexOf('\n  proxy:') : undefined);

test('every secret the app reads is mounted into it, declared with its file, and made by the scripts', () => {
  const read = [...app.matchAll(/NI_\w+_FILE: \/run\/secrets\/(\w+)/g)].map(m => m[1]);
  const mounted = [...app.slice(app.indexOf('    secrets:')).matchAll(/^ {6}- (\w+)$/gm)].map(m => m[1]);
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
