/* Where the app keeps its backups: every backup holds everything (the inventory, plan pictures, entry sheets and the
   device photos), but each part is stored once. A backup is a list of parts by their content (a SHA-256 hash): a device,
   one record's history, a setting, a picture. A part that did not change since the last backup is the same part and is
   not stored again, so ten backups of an inventory where a few devices changed take little more room than one, and a
   photo is kept once however many backups have it. Parts are compressed (gzip), pictures are not (they are already).
   When backups are removed, the parts no backup lists any more go (collect). A backup downloaded as a file is whole
   again: the same JSON as before, with the photos in it. */
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { ensureImagesTable } from './device-images.js';

export function ensureBackupStore(db) {
  db.exec('CREATE TABLE IF NOT EXISTS backup_parts (hash TEXT PRIMARY KEY, gz INTEGER NOT NULL, data BLOB NOT NULL)');
  const cols = db.prepare('PRAGMA table_info(backups)').all().map(c => c.name);
  /* 2: the backup is a list of parts (manifest); 1, before 0.9.75: the whole backup as JSON in data. */
  if (!cols.includes('format')) db.exec('ALTER TABLE backups ADD COLUMN format INTEGER NOT NULL DEFAULT 1');
  if (!cols.includes('size')) db.exec('ALTER TABLE backups ADD COLUMN size INTEGER');
  ensureImagesTable(db);
  const ic = db.prepare('PRAGMA table_info(device_images)').all().map(c => c.name);
  if (!ic.includes('data_hash')) db.exec('ALTER TABLE device_images ADD COLUMN data_hash TEXT');
  if (!ic.includes('thumb_hash')) db.exec('ALTER TABLE device_images ADD COLUMN thumb_hash TEXT');
}

const hashOf = buf => crypto.createHash('sha256').update(buf).digest('base64url').slice(0, 32);

/* Stores one part (once) and returns its hash. */
function putPart(db, buf, { gz = true } = {}) {
  const h = hashOf(buf);
  if (!db.prepare('SELECT 1 FROM backup_parts WHERE hash = ?').get(h)) db.prepare('INSERT INTO backup_parts (hash, gz, data) VALUES (?, ?, ?)').run(h, gz ? 1 : 0, gz ? zlib.gzipSync(buf, { level: 6 }) : buf);
  return h;
}
function getPart(db, h) {
  const r = db.prepare('SELECT gz, data FROM backup_parts WHERE hash = ?').get(String(h));
  if (!r) throw new Error('A part of this backup is missing.');
  return r.gz ? zlib.gunzipSync(r.data) : Buffer.from(r.data);
}
const getJson = (db, h) => JSON.parse(getPart(db, h).toString());

/* A photo's bytes are hashed once (a photo never changes) and the hash kept with it. */
function photoHashes(db) {
  for (const r of db.prepare('SELECT id FROM device_images WHERE data_hash IS NULL OR thumb_hash IS NULL').all()) {
    const x = db.prepare('SELECT data, thumb FROM device_images WHERE id = ?').get(r.id);
    db.prepare('UPDATE device_images SET data_hash = ?, thumb_hash = ? WHERE id = ?').run(hashOf(Buffer.from(x.data)), hashOf(Buffer.from(x.thumb)), r.id);
  }
}

/* Stores a whole backup (the object takeBackup makes; the device photos are read from their table) as parts. Returns
   its list of parts as JSON, and its size as a file. */
export function storeBackup(db, data, { photos = true } = {}) {
  ensureBackupStore(db);
  const s = data.state;
  let size = 0;
  const putJson = (db2, v) => { const b = Buffer.from(JSON.stringify(v)); size += b.length; return putPart(db2, b); };
  const m = {
    v: 2, version: data.version, created: data.created, reason: data.reason,
    objs: s.objs.map(o => putJson(db, o)),
    history: Object.fromEntries(Object.entries(s.history || {}).map(([k, h]) => [k, putJson(db, h)])),
    rels: putJson(db, s.rels), users: putJson(db, s.users), types: putJson(db, s.types),
    settings: Object.fromEntries(Object.entries(s.settings || {}).map(([k, v]) => [k, putJson(db, v)])),
    planImages: (data.planImages || []).map(im => putJson(db, im)),
    sheets: putJson(db, data.sheets || []),
    photos: [],
  };
  if (photos) photoHashes(db);
  if (photos) for (const p of db.prepare('SELECT id, obj_id, name, caption, mime, w, h, bytes, created, by, data_hash, thumb_hash FROM device_images ORDER BY id').all()) {
    const has = h => !!db.prepare('SELECT 1 FROM backup_parts WHERE hash = ?').get(h);
    let d = p.data_hash, t = p.thumb_hash;
    if (!has(d) || !has(t)) {
      const x = db.prepare('SELECT data, thumb FROM device_images WHERE id = ?').get(p.id);
      d = putPart(db, Buffer.from(x.data), { gz: false }); t = putPart(db, Buffer.from(x.thumb), { gz: false });
    }
    const { data_hash, thumb_hash, ...meta } = p;   // eslint-disable-line no-unused-vars
    m.photos.push({ meta: putJson(db, meta), data: d, thumb: t });
    size += Math.ceil(p.bytes / 3) * 4 + 200;
  }
  return { manifest: JSON.stringify(m), size };
}

/* A backup made whole again, as one object; the photos with their bytes as base64. */
export function loadBackup(db, row, { photos = true } = {}) {
  if (Number(row.format) !== 2) return JSON.parse(row.data);
  const m = JSON.parse(row.data);
  const settings = Object.fromEntries(Object.entries(m.settings).map(([k, h]) => [k, getJson(db, h)]));
  return {
    version: m.version, created: m.created, reason: m.reason,
    state: { objs: m.objs.map(h => getJson(db, h)), rels: getJson(db, m.rels), users: getJson(db, m.users), types: getJson(db, m.types),
      history: Object.fromEntries(Object.entries(m.history).map(([k, h]) => [k, getJson(db, h)])), settings },
    planImages: m.planImages.map(h => getJson(db, h)),
    sheets: getJson(db, m.sheets),
    ...(photos ? { photos: m.photos.map(p => ({ ...getJson(db, p.meta), data: getPart(db, p.data).toString('base64'), thumb: getPart(db, p.thumb).toString('base64') })) } : {}),
  };
}

/* Writes a backup as a file, part by part, so one with many photos is never held in memory whole. */
export function writeBackupFile(db, row, write) {
  if (Number(row.format) !== 2) { write(row.data); return; }
  const whole = loadBackup(db, row, { photos: false });
  const head = JSON.stringify(whole);
  write(head.slice(0, -1) + ',"photos":[');
  const m = JSON.parse(row.data);
  m.photos.forEach((p, i) => write((i ? ',' : '') + JSON.stringify({ ...getJson(db, p.meta), data: getPart(db, p.data).toString('base64'), thumb: getPart(db, p.thumb).toString('base64') })));
  write(']}');
}

/* The parts no backup lists any more are removed. */
export function collectParts(db) {
  ensureBackupStore(db);
  const keep = new Set();
  for (const r of db.prepare('SELECT data FROM backups WHERE format = 2').all()) {
    const m = JSON.parse(r.data);
    [...m.objs, ...Object.values(m.history), m.rels, m.users, m.types, ...Object.values(m.settings), ...m.planImages, m.sheets].forEach(h => keep.add(h));
    for (const p of m.photos) { keep.add(p.meta); keep.add(p.data); keep.add(p.thumb); }
  }
  const del = db.prepare('DELETE FROM backup_parts WHERE hash = ?');
  let n = 0;
  for (const r of db.prepare('SELECT hash FROM backup_parts').all()) if (!keep.has(r.hash)) { del.run(r.hash); n++; }
  return n;
}

/* Backups taken before 0.9.75 (each the whole inventory as JSON) are turned into parts once, which frees the room they
   took twice. */
export function convertOldBackups(db) {
  ensureBackupStore(db);
  const rows = db.prepare('SELECT id FROM backups WHERE format = 1').all();
  for (const { id } of rows) {
    const r = db.prepare('SELECT data FROM backups WHERE id = ?').get(id);
    let data; try { data = JSON.parse(r.data); } catch { continue; }
    if (!data || !data.state) continue;
    db.exec('SAVEPOINT backup');
    try {
      /* An old backup has no photos: its list of them stays empty. */
      const { manifest } = storeBackup(db, data, { photos: false });
      db.prepare('UPDATE backups SET format = 2, data = ?, size = ? WHERE id = ?').run(manifest, r.data.length, id);
      db.exec('RELEASE backup');
    } catch (e) { db.exec('ROLLBACK TO backup'); db.exec('RELEASE backup'); throw e; }
  }
  return rows.length;
}

/* What the backups take on disk: their lists and their parts. */
export function backupStorage(db) {
  ensureBackupStore(db);
  const a = db.prepare('SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM backups').get().n;
  const b = db.prepare('SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM backup_parts').get().n;
  return Number(a) + Number(b);
}

/* A backup as the text of its file, by its id (as a download gives it). */
export function backupFileText(db, id) {
  const row = db.prepare('SELECT data, format FROM backups WHERE id = ?').get(Number(id));
  if (!row) return null;
  let out = '';
  writeBackupFile(db, row, c => { out += c; });
  return out;
}
