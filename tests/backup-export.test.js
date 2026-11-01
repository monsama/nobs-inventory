/* The copy of the backups outside the server: optional, only to the folder the server names, encrypted with a password
   kept on the server; restored in the app or on any computer. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startServer, signIn } from './helpers.js';
import { loadState, saveState } from '../server/state.js';
import { decryptBackup, exportOnce, exportDir, isEncryptedBackup } from '../server/backup-export.js';
import { healthReport } from '../server/health.js';

test('an encrypted copy reads back with its password only, and only the last ones are kept', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-exp-'));
  try {
    const text = JSON.stringify({ version: 't', state: { objs: [{ id: 'o1', name: 'Łukasz-PC' }] }, pad: 'x'.repeat(200000) });
    const produce = async w => { for (let i = 0; i < text.length; i += 7000) await w(text.slice(i, i + 7000)); };
    for (let d = 1; d <= 4; d++) await exportOnce(dir, 'correct horse battery', produce, { keep: 3, now: new Date(2026, 10, d, 2, 30) });
    const files = fs.readdirSync(dir).sort();
    assert.deepEqual(files, ['nobs-backup-2026-11-02-0230.nobsbak', 'nobs-backup-2026-11-03-0230.nobsbak', 'nobs-backup-2026-11-04-0230.nobsbak'], 'the oldest went, no half-written file is left');
    const buf = fs.readFileSync(path.join(dir, files[2]));
    assert.ok(isEncryptedBackup(buf));
    assert.ok(!buf.includes(Buffer.from('Łukasz')) && buf.length < text.length / 5, 'encrypted and compressed');
    assert.equal(decryptBackup(buf, 'correct horse battery'), text);
    assert.throws(() => decryptBackup(buf, 'wrong password!'), /password is wrong/);
    const changed = Buffer.from(buf); changed[60] ^= 1;
    assert.throws(() => decryptBackup(changed, 'correct horse battery'), /password is wrong, or the file was changed/);
    // the script on any computer
    const out = execFileSync(process.execPath, ['scripts/decrypt-backup.mjs', path.join(dir, files[2])], { env: { ...process.env, NI_BACKUP_PASSWORD: 'correct horse battery' }, maxBuffer: 1e7 }).toString();
    assert.equal(out, text);
    fs.writeFileSync(path.join(dir, 'someone-elses.txt'), 'x');
    await exportOnce(dir, 'correct horse battery', produce, { keep: 1, now: new Date(2026, 10, 9, 2, 30) });
    assert.deepEqual(fs.readdirSync(dir).sort(), ['nobs-backup-2026-11-09-0230.nobsbak', 'someone-elses.txt'], 'other files in the folder are left alone');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('only an absolute folder the server names', () => {
  assert.equal(exportDir({}), null);
  assert.equal(exportDir({ NI_BACKUP_EXPORT_DIR: 'relative/dir' }), null);
  assert.equal(exportDir({ NI_BACKUP_EXPORT_DIR: '/offsite/' }), '/offsite');
});

test('the copy from Settings: off without a folder, a password first, then copied, shown in Health and restored', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-exp2-'));
  const before = process.env.NI_BACKUP_EXPORT_DIR;
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    delete process.env.NI_BACKUP_EXPORT_DIR;
    let x = (await srv.call('GET', '/api/backup-export', { cookie: a.cookie })).json;
    assert.equal(x.dir, false);
    assert.equal((await srv.call('PUT', '/api/backup-export', { cookie: a.cookie, body: { on: true } })).status, 400, 'nothing to turn on');
    process.env.NI_BACKUP_EXPORT_DIR = dir;
    assert.equal((await srv.call('POST', '/api/backup-export/run', { cookie: a.cookie })).status, 400, 'no password yet');
    assert.equal((await srv.call('POST', '/api/backup-export/password', { cookie: a.cookie, body: { password: 'short' } })).status, 400);
    x = (await srv.call('POST', '/api/backup-export/password', { cookie: a.cookie, body: { password: 'a long enough secret' } })).json;
    assert.ok(x.passwordSet); assert.ok(!JSON.stringify(x).includes('a long enough secret'), 'the password never comes back');
    x = (await srv.call('PUT', '/api/backup-export', { cookie: a.cookie, body: { on: true, keep: 5 } })).json;
    assert.equal(x.on, true); assert.equal(x.keep, 5);
    const s = loadState(srv.db);
    saveState(srv.db, { ...s, objs: [{ id: 'o1', code: 'INV-1', type: 'pc', name: 'PC-KEEP', status: 'active', loc: '', ovr: {}, feed: null }] });
    x = (await srv.call('POST', '/api/backup-export/run', { cookie: a.cookie })).json;
    assert.equal(x.last.ok, true); assert.match(x.last.file, /^nobs-backup-.*\.nobsbak$/);
    const file = fs.readFileSync(path.join(dir, x.last.file));
    assert.ok(!file.includes(Buffer.from('a long enough secret')));
    const h = (await srv.call('GET', '/api/health/details', { cookie: a.cookie })).json.checks.find(c => c.name === 'Copy outside the server');
    assert.equal(h.state, 'ok', JSON.stringify(h));
    // restored from that file: with the password typed, with the one set here, refused with a wrong one
    saveState(srv.db, { ...loadState(srv.db), objs: [] });
    const restore = pw => fetch(`${srv.base}/api/backups/restore-encrypted`, { method: 'POST', body: file, headers: { cookie: a.cookie, 'content-type': 'application/octet-stream', ...(pw ? { 'x-backup-password': pw } : {}) } });
    assert.equal((await restore('not the password')).status, 400);
    assert.equal(loadState(srv.db).objs.length, 0);
    assert.equal((await restore('')).status, 200);
    assert.equal(loadState(srv.db).objs[0].name, 'PC-KEEP');
    // a viewer cannot see or change any of it
    const v = await srv.call('GET', '/api/backup-export');
    assert.equal(v.status, 401);
    // a failing folder is reported
    fs.rmSync(dir, { recursive: true, force: true });
    const bad = await srv.call('POST', '/api/backup-export/run', { cookie: a.cookie });
    assert.equal(bad.status, 400);
    assert.ok(!String(bad.json.error).includes(dir), 'the server path is not shown');
    assert.equal(healthReport(srv.db, loadState(srv.db), { version: 't', copy: { dir: true, on: true, last: { at: new Date().toISOString(), ok: false, error: 'x' } } }).checks.find(c => c.name === 'Copy outside the server').state, 'bad');
  } finally {
    if (before === undefined) delete process.env.NI_BACKUP_EXPORT_DIR; else process.env.NI_BACKUP_EXPORT_DIR = before;
    await srv.close(); fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the restore test: the newest copy (or backup) restored into memory and counted, never into the inventory', async () => {
  const { runRestoreTest, lastRestoreTest } = await import('../server/restore-test.js');
  const { takeBackup } = await import('../server/backup.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-rt-'));
  const before = process.env.NI_BACKUP_EXPORT_DIR;
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    delete process.env.NI_BACKUP_EXPORT_DIR;
    // nothing to test yet: said, and kept as failed
    srv.db.exec('DELETE FROM backups');
    assert.equal((await srv.call('POST', '/api/restore-test', { cookie: a.cookie })).status, 400);
    assert.match(lastRestoreTest(srv.db).error, /no backup to test/);
    // a backup here: restored in memory, the inventory untouched
    saveState(srv.db, { ...loadState(srv.db), objs: [{ id: 'o1', code: 'INV-1', type: 'pc', name: 'PC-ONE', status: 'active', loc: '' }, { id: 'o2', code: 'INV-2', type: 'pc', name: 'PC-TWO', status: 'active', loc: '' }] });
    takeBackup(srv.db, 'by hand');
    const revsBefore = JSON.stringify(srv.db.prepare("SELECT * FROM revs WHERE NOT (kind = 'setting' AND id = 'restoreTest') ORDER BY kind, id").all());
    const x = (await srv.call('POST', '/api/restore-test', { cookie: a.cookie })).json;
    assert.equal(x.restoreTest.ok, true, JSON.stringify(x.restoreTest)); assert.equal(x.restoreTest.from, 'backup'); assert.equal(x.restoreTest.objects, 2);
    assert.equal(JSON.stringify(srv.db.prepare("SELECT * FROM revs WHERE NOT (kind = 'setting' AND id = 'restoreTest') ORDER BY kind, id").all()), revsBefore, 'nothing written to the inventory');
    // only its own result, with a new revision, so pages see it
    assert.ok(srv.db.prepare("SELECT rev FROM revs WHERE kind = 'setting' AND id = 'restoreTest'").get().rev >= 2);
    let h = (await srv.call('GET', '/api/health/details', { cookie: a.cookie })).json.checks.find(c => c.name === 'Restore test');
    assert.equal(h.state, 'ok'); assert.match(h.value, /2 devices came back/);
    // with the copy outside on, the newest copy is the one tested
    process.env.NI_BACKUP_EXPORT_DIR = dir;
    await srv.call('POST', '/api/backup-export/password', { cookie: a.cookie, body: { password: 'a long enough secret' } });
    await srv.call('PUT', '/api/backup-export', { cookie: a.cookie, body: { on: true } });
    await srv.call('POST', '/api/backup-export/run', { cookie: a.cookie });
    const r = await runRestoreTest(srv.db, null, process.env).catch(e => e);
    assert.ok(r instanceof Error, 'the wrong key cannot read the password');
    const ok = (await srv.call('POST', '/api/restore-test', { cookie: a.cookie })).json.restoreTest;
    assert.equal(ok.from, 'copy'); assert.match(ok.name, /\.nobsbak$/); assert.equal(ok.objects, 2);
    // a copy that was changed fails the test, and Health says so
    const f = fs.readdirSync(dir).find(n => n.endsWith('.nobsbak')), buf = fs.readFileSync(path.join(dir, f)); buf[60] ^= 1; fs.writeFileSync(path.join(dir, f), buf);
    assert.equal((await srv.call('POST', '/api/restore-test', { cookie: a.cookie })).status, 400);
    h = (await srv.call('GET', '/api/health/details', { cookie: a.cookie })).json.checks.find(c => c.name === 'Restore test');
    assert.equal(h.state, 'bad'); assert.ok(!h.value.includes(dir), 'no server path');
    // kept through a full save of the page
    saveState(srv.db, loadState(srv.db));
    assert.ok(lastRestoreTest(srv.db));
  } finally {
    if (before === undefined) delete process.env.NI_BACKUP_EXPORT_DIR; else process.env.NI_BACKUP_EXPORT_DIR = before;
    await srv.close(); fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the copy to cloud storage: Azure with its SAS URL, S3 signed; nothing of the token in what is kept', async () => {
  const { runExport, lastExport, saveExportSettings } = await import('../server/backup-export.js');
  const { setAppSecret } = await import('../server/app-secrets.js');
  const { cloudTarget } = await import('../server/backup-cloud.js');
  const crypto = await import('node:crypto');
  const key = crypto.randomBytes(32);
  const srv = await startServer({ sheetKey: key });
  try {
    setAppSecret(srv.db, key, 'backupExportPassword', 'a long enough secret');
    saveExportSettings(srv.db, { on: true, keep: 3 });
    const calls = [];
    const fake = status => async (url, init) => { calls.push({ url: String(url), init }); return { ok: status < 300, status, text: async () => '<Error><Code>AccessDenied</Code></Error>' }; };
    // Azure: PUT to the container with the SAS token, as a block blob
    const az = { NI_BACKUP_EXPORT_AZURE_URL: 'https://acct.blob.core.windows.net/nobs?sv=2022&sp=cw&sig=SECRETSIG' };
    const r = await runExport(srv.db, key, az, new Date(2026, 10, 1, 2, 30), fake(201));
    assert.equal(r.cloud, 'Azure Blob Storage');
    assert.equal(calls[0].url, `https://acct.blob.core.windows.net/nobs/${r.file}?sv=2022&sp=cw&sig=SECRETSIG`);
    assert.equal(calls[0].init.method, 'PUT'); assert.equal(calls[0].init.headers['x-ms-blob-type'], 'BlockBlob');
    assert.ok(Buffer.from(calls[0].init.body).subarray(0, 8).equals(Buffer.from('NOBSENC1')), 'the encrypted file');
    assert.ok(!JSON.stringify(lastExport(srv.db)).includes('SECRETSIG'));
    // S3: signed with the key, refused here: the status is kept, never the address or key
    const s3 = { NI_BACKUP_EXPORT_S3_URL: 'https://s3.eu-central-1.amazonaws.com/bucket/nobs', NI_BACKUP_EXPORT_S3_REGION: 'eu-central-1', NI_BACKUP_EXPORT_S3_ACCESS_KEY: 'AKIATEST', NI_BACKUP_EXPORT_S3_SECRET_KEY: 'TOPSECRETKEY' };
    await assert.rejects(runExport(srv.db, key, s3, new Date(2026, 10, 2, 2, 30), fake(403)), /S3 refused the upload \(403 AccessDenied\)/);
    const c = calls[1];
    assert.match(c.url, /^https:\/\/s3\.eu-central-1\.amazonaws\.com\/bucket\/nobs\/nobs-backup-2026-11-02-0230\.nobsbak$/);
    assert.match(c.init.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIATEST\/\d{8}\/eu-central-1\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    const kept = JSON.stringify(lastExport(srv.db));
    assert.ok(kept.includes('403') && !kept.includes('TOPSECRETKEY') && !kept.includes('amazonaws'));
    assert.equal(cloudTarget({ NI_BACKUP_EXPORT_AZURE_URL: 'http://x.blob.core.windows.net/c?sig=1' }).error, 'NI_BACKUP_EXPORT_AZURE_URL needs https and a SAS token (…?sv=…&sig=…).');
    assert.match(cloudTarget({ NI_BACKUP_EXPORT_S3_URL: 'https://s3.example/b' }).error, /ACCESS_KEY/);
  } finally { await srv.close(); }
});
