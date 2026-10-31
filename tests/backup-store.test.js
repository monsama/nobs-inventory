/* Backups kept as parts: a second backup with one device changed stores little more than that device; photos are in
   every backup and stored once; a backup downloaded as a file brings the photos back; backups from before are
   converted, and parts no backup lists any more are removed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn, seedBasics } from './helpers.js';
import { takeBackup } from '../server/backup.js';
import { loadBackup, backupStorage, convertOldBackups, collectParts } from '../server/backup-store.js';
import { loadState, saveState } from '../server/state.js';

const seg = (marker, body) => { const b = Buffer.from(body); const h = Buffer.alloc(4); h[0] = 0xff; h[1] = marker; h.writeUInt16BE(b.length + 2, 2); return Buffer.concat([h, b]); };
const jpeg = fill => Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xdb, 'q'), seg(0xda, 's'), Buffer.alloc(200000, fill), Buffer.from([0xff, 0xd9])]);
const parts = db => db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM backup_parts').get();

test('backups store each part once, photos included, and a downloaded backup brings everything back', async () => {
  const srv = await startServer();
  try {
    const db = srv.db;
    seedBasics(db);
    const a = await signIn(srv, 'admin', 'adminpass123');
    const photo = (await srv.call('POST', '/api/objects/o2/images', { cookie: a.cookie, body: { name: 'label.jpg', data: jpeg(7).toString('base64'), thumb: jpeg(1).toString('base64'), w: 800, h: 600 } })).json.image;
    assert.ok(photo, 'photo added');

    const first = takeBackup(db, 'by hand');
    const after1 = parts(db);
    const s = loadState(db); s.objs.find(o => o.id === 'o3').name = 'ZH-PC-0142-RENAMED'; saveState(db, s);
    const second = takeBackup(db, 'by hand');
    const after2 = parts(db);
    /* The second backup adds the changed device (and settings that changed), not the photo or the other devices again. */
    assert.ok(after2.n - after1.n <= 3, `added ${after2.n - after1.n} parts`);
    assert.ok(after2.bytes - after1.bytes < 5000, `added ${after2.bytes - after1.bytes} bytes`);
    assert.ok(backupStorage(db) < 2 * 200000 + 100000, 'the photo is stored once for both backups');

    const b1 = loadBackup(db, db.prepare('SELECT data, format FROM backups WHERE id = ?').get(first));
    assert.equal(b1.state.objs.find(o => o.id === 'o3').name, 'ZH-PC-0142');
    assert.equal(b1.photos.length, 1);
    assert.equal(Buffer.from(b1.photos[0].data, 'base64').length, Buffer.from(jpeg(7)).length);

    /* Downloaded as a file, the photo removed here, and restored from that file: the photo is back. */
    const file = await srv.call('GET', `/api/backups/${second}/download`, { cookie: a.cookie, type: 'text' });
    assert.equal(file.status, 200);
    assert.equal(JSON.parse(file.text).photos.length, 1);
    await srv.call('DELETE', `/api/images/${photo.id}`, { cookie: a.cookie });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM device_images').get().n, 0);
    const r = await srv.call('POST', '/api/backups/restore-file', { cookie: a.cookie, type: 'text', body: file.text });
    assert.equal(r.status, 200, r.text);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM device_images').get().n, 1);
    assert.equal(loadState(db).objs.find(o => o.id === 'o3').name, 'ZH-PC-0142-RENAMED');

    /* Restoring from the list works the same. */
    assert.equal((await srv.call('POST', `/api/backups/${first}/restore`, { cookie: a.cookie })).status, 200);
    assert.equal(loadState(db).objs.find(o => o.id === 'o3').name, 'ZH-PC-0142');

    /* Removing backups frees their parts. */
    for (const { id } of db.prepare('SELECT id FROM backups').all()) await srv.call('DELETE', `/api/backups/${id}`, { cookie: a.cookie });
    assert.equal(parts(db).n, 0);
  } finally { await srv.close(); }
});

test('backups from before (the whole inventory as JSON) are converted to parts, and read the same', async () => {
  const srv = await startServer();
  try {
    const db = srv.db;
    seedBasics(db);
    const old = JSON.stringify({ version: 1, created: '2026-01-01T00:00:00.000Z', reason: 'by hand', state: { ...(() => { const s = loadState(db); return { objs: s.objs, rels: s.rels, users: s.users, types: s.types, history: s.history }; })(), settings: { currency: 'CHF' } }, planImages: [], sheets: [] });
    const id = Number(db.prepare('INSERT INTO backups (at, reason, objects, data) VALUES (?, ?, ?, ?)').run('2026-01-01T00:00:00.000Z', 'by hand', 5, old).lastInsertRowid);
    assert.equal(convertOldBackups(db), 1);
    collectParts(db);
    const row = db.prepare('SELECT data, format, size FROM backups WHERE id = ?').get(id);
    assert.equal(row.format, 2);
    const back = loadBackup(db, row);
    const was = JSON.parse(old);
    assert.deepEqual(back.state.objs, was.state.objs);
    assert.deepEqual(back.state.settings, was.state.settings);
    assert.deepEqual(back.photos, []);
    assert.equal(convertOldBackups(db), 0, 'only once');
  } finally { await srv.close(); }
});
