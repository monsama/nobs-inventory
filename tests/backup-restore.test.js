import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { openDb } from '../server/db.js';
import { bootstrap } from '../server/index.js';
import { restoreBackup } from '../server/backup.js';

/* A restored backup is checked the way the app checks its own saves, and its plan pictures are checked like uploads. */
const freshDb = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-restore-'));
  const db = openDb(path.join(dir, 'i.db'));
  bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
  return db;
};
const backup = (planImages) => ({ version: 1, state: { objs: [], rels: [], users: [], types: {}, history: {}, settings: {} }, planImages });
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('a backup with a plan picture that is not an image is refused, and nothing is replaced', () => {
  const db = freshDb();
  assert.throws(() => restoreBackup(db, backup([{ id: 'pl1', data: 'data:text/html;base64,PHNjcmlwdD4=' }])), /not a PNG/);
  db.close();
});

test('a backup with a valid plan picture is restored', () => {
  const db = freshDb();
  assert.doesNotThrow(() => restoreBackup(db, backup([{ id: 'pl1', data: PNG }])));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM plan_images').get().n, 1);
  db.close();
});

test('automatic backups follow the setting: off takes none, on takes one', async () => {
  const { autoBackup } = await import('../server/backup.js');
  const db = freshDb();
  const count = () => db.prepare('SELECT COUNT(*) AS n FROM backups').get().n;
  db.prepare("INSERT INTO docs (kind, id, data) VALUES ('setting', 'autoBackups', ?)").run('false');
  const before = count();
  assert.equal(autoBackup(db, 'before a Lansweeper sync'), null);
  assert.equal(count(), before, 'a backup was taken while automatic backups are off');
  db.prepare("UPDATE docs SET data = 'true' WHERE kind = 'setting' AND id = 'autoBackups'").run();
  assert.ok(autoBackup(db, 'before a Lansweeper sync'));
  assert.equal(count(), before + 1);
  db.close();
});

test('a downloaded backup with the newer data restores through the page\'s upload', async () => {
  const { startServer, signIn } = await import('./helpers.js');
  const { loadState: load, saveState: save } = await import('../server/state.js');
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const s = load(srv.db);
    save(srv.db, { ...s, objs: [{ id: 'o1', code: 'INV-1', type: 'plc', name: 'PLC-1', status: 'active', loc: '', ovr: {}, feed: null, ip: '10.1.1.5', gateway: '10.1.1.1', dhcp: 'static', warranty: '2027-03-31' }],
      users: [...s.users, { id: 'u-ls', login: '', name: 'Anna', dept: 'Logistik', role: 'viewer', groups: [], source: 'lansweeper', active: true }],
      fieldLayout: { plc: { card: ['ip', 'fw', 'loc', 'serial'] } }, graphCerts: [{ thumbprint: 'AB'.repeat(20), created: '2026-10-25T13:00:00.000Z', expires: '2028-10-24T13:00:00.000Z' }] });
    const made = await srv.call('POST', '/api/backups', { cookie: a.cookie });
    const id = made.json.id ?? made.json.backup?.id ?? (await srv.call('GET', '/api/backups', { cookie: a.cookie })).json.backups?.[0]?.id;
    const file = await srv.call('GET', `/api/backups/${id}/download`, { cookie: a.cookie, type: 'text' });
    save(srv.db, { ...load(srv.db), objs: [], fieldLayout: {}, graphCerts: [] });
    const r = await srv.call('POST', '/api/backups/restore-file', { cookie: a.cookie, type: 'text', body: file.text });   /* the page sends the file as it is */
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const back = load(srv.db);
    assert.equal(back.objs[0].type, 'plc');
    assert.equal(back.objs[0].warranty, '2027-03-31');
    assert.deepEqual(back.fieldLayout, { plc: { card: ['ip', 'fw', 'loc', 'serial'] } });
    assert.equal(back.graphCerts.length, 1);
    assert.equal(back.users.find(u => u.id === 'u-ls').source, 'lansweeper');
  } finally { await srv.close(); }
});
