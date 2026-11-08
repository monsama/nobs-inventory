import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

/* scripts/backup-mac.sh: an encrypted backup carries a check made from its passphrase, and restore.sh opens it only
   when the file is as it was made. Run with bash and openssl as the scripts are. */
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const lib = path.join(root, 'scripts', 'backup-mac.sh');
const sh = (script, env = {}) => spawnSync('bash', ['-c', `. "${lib}"; ${script}`], { encoding: 'utf8', env: { ...process.env, ...env } });

test('the HMAC worked out in the shell is HMAC-SHA256', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-'));
  try {
    const f = path.join(dir, 'data'); const data = crypto.randomBytes(70000); fs.writeFileSync(f, data);
    const key = crypto.randomBytes(32);
    /* keys with bytes that turn into 0, '%' or '\' once padded are the ones a careless printf gets wrong */
    for (const k of [key, Buffer.alloc(32, 0x36), Buffer.alloc(32, 0x13), Buffer.alloc(32, 0x6a)]) {
      const r = sh(`mac_file "${k.toString('hex')}" "${f}"`);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout.trim(), crypto.createHmac('sha256', k).update(data).digest('hex'));
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a sealed backup opens with its passphrase, not when changed or with another one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-'));
  try {
    const pw = path.join(dir, 'pw'), enc = path.join(dir, 'a.enc'), sealed = path.join(dir, 'a.sealed'), out = path.join(dir, 'out');
    fs.writeFileSync(pw, 'correct horse battery\n'); fs.writeFileSync(enc, crypto.randomBytes(5000));
    let r = sh(`mac_seal "file:${pw}" "${enc}" "${sealed}"`);
    assert.equal(r.status, 0, r.stderr);
    assert.match(fs.readFileSync(sealed, 'latin1').split('\n')[0], /^NOBSMAC1 [0-9a-f]{16} [0-9a-f]{64}$/);
    r = sh(`mac_open "file:${pw}" "${sealed}" "${out}"`);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(fs.readFileSync(out), fs.readFileSync(enc), 'the encrypted part comes back as it was');
    /* one bit changed anywhere after the first line */
    const b = fs.readFileSync(sealed); b[b.length - 100] ^= 1; fs.writeFileSync(path.join(dir, 'changed'), b);
    assert.equal(sh(`mac_open "file:${pw}" "${path.join(dir, 'changed')}" "${out}"`).status, 1);
    assert.equal(fs.existsSync(out), false, 'a changed file leaves nothing to open');
    /* a typed passphrase (env:) that is wrong */
    assert.equal(sh(`mac_open env:P "${sealed}" "${out}"`, { P: 'wrong' }).status, 1);
    assert.equal(sh(`mac_open env:P "${sealed}" "${out}"`, { P: 'correct horse battery' }).status, 0, 'the passphrase typed opens it (file: reads only the first line)');
    /* made before the check: told apart, so restore.sh can ask */
    assert.equal(sh(`mac_open "file:${pw}" "${enc}" "${out}"`).status, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('backup.sh seals what it encrypts and restore.sh checks before it decrypts', () => {
  const backup = fs.readFileSync(path.join(root, 'scripts', 'backup.sh'), 'utf8');
  const restore = fs.readFileSync(path.join(root, 'scripts', 'restore.sh'), 'utf8');
  assert.match(backup, /mac_seal "file:\$BACKUP_PASSPHRASE_FILE"/);
  assert.ok(restore.indexOf('mac_open') > 0 && restore.indexOf('mac_open') < restore.indexOf('openssl enc -d'), 'checked first');
  assert.match(restore, /BACKUP_ALLOW_UNCHECKED/);
});
