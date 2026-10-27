import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { startServer, signIn } from './helpers.js';
import { loadState, saveState } from '../server/state.js';
import { setPassword } from '../server/auth.js';
import { takeBackup, restoreBackup } from '../server/backup.js';
import { pdfText } from './pdf-text.js';
import { newPassword, purgePasswords, sheetKeyOf, openSheet, sealSheet, getSheet, PASSWORD_DAYS } from '../server/sheets.js';

/* Entry sheets: a person's devices and the initial password of their AD account, kept sealed so they can be printed
   again; the password goes from the kept sheet once changed, or after PASSWORD_DAYS days. */
const seed = srv => {
  const s = loadState(srv.db);
  saveState(srv.db, { ...s,
    users: [...s.users, { id: 'u-anna', login: '', name: 'Anna Muster', dept: 'Logistik', role: 'viewer', groups: [], source: 'manual', active: true },
      { id: 'u-view', login: 'viewer', name: 'Vera Viewer', dept: '', role: 'viewer', groups: [], source: 'manual', active: true }],
    objs: [
      { id: 'o1', code: 'INV-0001', type: 'pc', name: 'WIL-NB-001', model: 'Dell Latitude 5440', serial: 'SN-1', status: 'active', loc: '', ovr: {}, feed: null, uid: 'u-anna' },
      { id: 'o2', code: 'INV-0002', type: 'monitor', name: 'MON-001', model: 'Dell P2422H', serial: 'SN-2', status: 'active', loc: '', ovr: {}, feed: null, uid: 'u-anna' },
    ], rels: [], history: {} });
  setPassword(srv.db, 'u-view', 'viewerpass123');
};

test('an initial password is four groups of four, with upper and lower case and digits, nothing easily misread', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const p = newPassword();
    assert.match(p, /^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
    assert.ok(/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p), p);
    assert.ok(!/[0O1lI]/.test(p), 'no easily misread character: ' + p);
    seen.add(p);
  }
  assert.equal(seen.size, 200, 'every password is different');
});

test('a sheet is made from the inventory, kept sealed, opened again, and its password can be marked as changed', async () => {
  const key = crypto.randomBytes(32);
  const srv = await startServer({ sheetKey: key });
  try {
    seed(srv);
    const a = await signIn(srv, 'admin', 'adminpass123');
    const made = await srv.call('POST', '/api/sheets', { cookie: a.cookie, body: { userId: 'u-anna', deviceIds: ['o1', 'o2'], login: 'amuster', note: 'Start 1 November' } });
    assert.equal(made.status, 200, JSON.stringify(made.json));
    const { id, sheet } = made.json;
    assert.equal(sheet.person.name, 'Anna Muster');
    assert.equal(sheet.login, 'amuster');
    assert.deepEqual(sheet.devices.map(d => d.serial), ['SN-1', 'SN-2']);
    assert.match(sheet.password, /^[A-Za-z2-9-]{19}$/);

    // stored sealed: neither the password nor the name is readable in the database, the state, a backup or the log
    const raw = srv.db.prepare('SELECT data FROM sheets WHERE id = ?').get(id).data;
    for (const secret of [sheet.password, 'Anna Muster', 'amuster']) assert.ok(!raw.includes(secret), 'readable in the database: ' + secret);
    const backupId = takeBackup(srv.db, 'test');
    const backup = srv.db.prepare('SELECT data FROM backups WHERE id = ?').get(backupId).data;
    assert.ok(!backup.includes(sheet.password), 'the password is readable in a backup');
    assert.ok(JSON.parse(backup).sheets.some(r => r.id === id), 'the sealed sheet is in the backup');
    // not even with the key: a backup keeps the sheet without its password, so marking it changed later holds there too
    const inBackup = JSON.parse(backup).sheets.find(r => r.id === id);
    assert.equal(inBackup.password, 'expired');
    assert.equal(openSheet(key, inBackup.data).password, undefined, 'the password is in the backup\'s sealed sheet');
    const state = (await srv.call('GET', '/api/state', { cookie: a.cookie })).text;
    const log = JSON.stringify(srv.db.prepare('SELECT action FROM audit').all());
    assert.ok(!state.includes(sheet.password) && !log.includes(sheet.password), 'the password is in the state or the log');

    // listed, opened again with the password, then marked as changed: the password leaves the kept sheet
    const list = (await srv.call('GET', '/api/sheets?user=u-anna', { cookie: a.cookie })).json;
    assert.deepEqual(list.sheets.map(s => [s.id, s.password]), [[id, 'kept']]);
    assert.equal((await srv.call('GET', '/api/sheets/' + id, { cookie: a.cookie })).json.sheet.password, sheet.password);
    // as a PDF, with the company's name: the password is on it while the kept sheet has it
    const s0 = loadState(srv.db); saveState(srv.db, { ...s0, company: { name: 'Argolite AG', logo: '' } });
    const pdfOf = async () => { const r = await fetch(srv.base + `/api/sheets/${id}/pdf`, { headers: { cookie: a.cookie } }); return { r, text: pdfText(Buffer.from(await r.arrayBuffer())) }; };
    let pdf = await pdfOf();
    assert.equal(pdf.r.status, 200);
    assert.equal(pdf.r.headers.get('content-type'), 'application/pdf');
    assert.match(pdf.r.headers.get('content-disposition'), /entry-sheet-Anna-Muster-\d{4}-\d{2}-\d{2}\.pdf/);
    for (const t of [sheet.password, 'Anna Muster', 'Argolite AG', 'SN-1', 'MON-001', 'Start 1 November', 'Entry sheet']) assert.ok(pdf.text.includes(t), 'not on the PDF: ' + t);
    assert.equal((await srv.call('POST', `/api/sheets/${id}/changed`, { cookie: a.cookie })).status, 200);
    const again = (await srv.call('GET', '/api/sheets/' + id, { cookie: a.cookie })).json;
    assert.equal(again.password, 'changed');
    assert.equal(again.sheet.password, undefined, 'the password is gone from the kept sheet');
    assert.deepEqual(again.sheet.devices.map(d => d.name), ['WIL-NB-001', 'MON-001'], 'the rest of the sheet stays');
    pdf = await pdfOf();
    assert.ok(!pdf.text.includes(sheet.password), 'the password is still on the PDF');
    assert.ok(pdf.text.includes('no longer on this copy'));

    // a viewer may not see, make or open sheets
    const v = await signIn(srv, 'viewer', 'viewerpass123');
    assert.equal((await srv.call('GET', '/api/sheets?user=u-anna', { cookie: v.cookie })).status, 403);
    assert.equal((await srv.call('GET', '/api/sheets/' + id, { cookie: v.cookie })).status, 403);
    assert.equal((await fetch(srv.base + `/api/sheets/${id}/pdf`, { headers: { cookie: v.cookie } })).status, 403);
    assert.equal((await srv.call('POST', '/api/sheets', { cookie: v.cookie, body: { userId: 'u-anna', deviceIds: [], login: 'x' } })).status, 403);

    // what the inventory does not hold is refused
    assert.equal((await srv.call('POST', '/api/sheets', { cookie: a.cookie, body: { userId: 'u-anna', deviceIds: ['nope'], login: 'x' } })).status, 400);
    assert.equal((await srv.call('POST', '/api/sheets', { cookie: a.cookie, body: { userId: 'u-anna', deviceIds: [] } })).status, 400, 'a sign-in name is needed');
    assert.equal((await srv.call('DELETE', '/api/sheets/' + id, { cookie: a.cookie })).status, 200);
    assert.equal((await srv.call('GET', '/api/sheets/' + id, { cookie: a.cookie })).status, 404);
  } finally { await srv.close(); }
});

test(`the password leaves a kept sheet after ${PASSWORD_DAYS} days; a sealed sheet opens only with its key`, async () => {
  const key = crypto.randomBytes(32);
  const srv = await startServer({ sheetKey: key });
  try {
    seed(srv);
    const a = await signIn(srv, 'admin', 'adminpass123');
    const { id } = (await srv.call('POST', '/api/sheets', { cookie: a.cookie, body: { userId: 'u-anna', deviceIds: ['o1'], login: 'amuster' } })).json;
    assert.equal(purgePasswords(srv.db, key, new Date(Date.now() + (PASSWORD_DAYS - 1) * 86400000)), 0, 'kept before the time is up');
    assert.equal(purgePasswords(srv.db, key, new Date(Date.now() + (PASSWORD_DAYS + 1) * 86400000)), 1);
    const r = srv.db.prepare('SELECT * FROM sheets WHERE id = ?').get(id);
    assert.equal(r.password, 'expired');
    assert.equal(openSheet(key, r.data).password, undefined);
    assert.throws(() => openSheet(crypto.randomBytes(32), r.data), /cannot be read with the server's sheet key/);
  } finally { await srv.close(); }
});

test('the key comes from NI_SHEET_KEY when set, else from a key file made once in the data folder, readable only by the server', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-key-'));
  const k1 = sheetKeyOf({}, dir);
  assert.equal(fs.statSync(path.join(dir, 'sheet.key')).mode & 0o777, 0o600);
  assert.deepEqual(sheetKeyOf({}, dir), k1, 'the same key on the next start');
  const set = sheetKeyOf({ NI_SHEET_KEY: 'a key set by the admin' }, dir);
  assert.notDeepEqual(set, k1);
  assert.equal(set.length, 32);
  const sealed = sealSheet(set, { a: 1 });
  assert.deepEqual(openSheet(sheetKeyOf({ NI_SHEET_KEY: 'a key set by the admin' }, dir), sealed), { a: 1 });
});

test('a restore adds the sheets that are missing and keeps those that are there', async () => {
  const key = crypto.randomBytes(32);
  const srv = await startServer({ sheetKey: key });
  try {
    seed(srv);
    const a = await signIn(srv, 'admin', 'adminpass123');
    const one = (await srv.call('POST', '/api/sheets', { cookie: a.cookie, body: { userId: 'u-anna', deviceIds: ['o1'], login: 'amuster' } })).json.id;
    const two = (await srv.call('POST', '/api/sheets', { cookie: a.cookie, body: { userId: 'u-anna', deviceIds: ['o2'], login: 'amuster' } })).json.id;
    const backup = JSON.parse(srv.db.prepare('SELECT data FROM backups WHERE id = ?').get(takeBackup(srv.db, 'test')).data);
    await srv.call('POST', `/api/sheets/${one}/changed`, { cookie: a.cookie });
    await srv.call('DELETE', '/api/sheets/' + two, { cookie: a.cookie });
    restoreBackup(srv.db, backup, key);
    const rows = Object.fromEntries(srv.db.prepare('SELECT id, password FROM sheets').all().map(r => [r.id, r.password]));
    assert.equal(rows[one], 'changed', 'a restore does not bring back a password removed since');
    assert.equal(rows[two], 'expired', 'a sheet deleted since comes back from the backup, without its password');
    assert.equal(getSheet(srv.db, key, two).sheet.password, undefined);
    srv.db.prepare('DELETE FROM sheets WHERE id = ?').run(two);
    restoreBackup(srv.db, backup, crypto.randomBytes(32));
    // a backup holds no password at all, so even restored with another key the sheet comes back only as expired
    assert.equal(srv.db.prepare('SELECT password FROM sheets WHERE id = ?').get(two).password, 'expired');
  } finally { await srv.close(); }
});
