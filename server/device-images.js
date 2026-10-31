/* Photos of a device: the label on its back, how it is cabled, where it stands. Kept in their own table, apart from the
   inventory, so they do not count against its size and a save never sends them. The page makes each photo smaller and
   takes its metadata out (EXIF: camera, time, GPS position) before it is sent; the server checks again what it gets: a
   JPEG, PNG or WebP picture by its first bytes, within the sizes below, with the JPEG metadata blocks taken out once more.
   Everyone signed in sees them; an admin adds, captions and removes them. */
import crypto from 'node:crypto';
import { HttpError } from './errors.js';

export const PHOTO_MAX = 30;                    /* per device */
export const PHOTO_BYTES = 6 * 1048576;         /* one photo, as sent (the page sends at most 2560 px) */
export const THUMB_BYTES = 400 * 1024;          /* its preview */
export const PHOTOS_TOTAL = 4 * 1073741824;     /* all of them together */

export function ensureImagesTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS device_images (id TEXT PRIMARY KEY, obj_id TEXT NOT NULL, name TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '',
    mime TEXT NOT NULL, w INTEGER NOT NULL, h INTEGER NOT NULL, bytes INTEGER NOT NULL, created TEXT NOT NULL, by TEXT NOT NULL, data BLOB NOT NULL, thumb BLOB NOT NULL);
    CREATE INDEX IF NOT EXISTS device_images_obj ON device_images (obj_id);`);
}

/* The picture type by its first bytes, whatever the request says it is. */
export function imageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}

/* A JPEG without its metadata: the APP1 to APP15 blocks (EXIF, XMP, IPTC, …) and comments go, the picture stays. APP0
   (JFIF) and APP2 (the colour profile) are kept. Anything it cannot read is refused rather than passed on. */
export function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) throw new HttpError(400, 'This JPEG picture cannot be read.');
    const m = buf[i + 1];
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { out.push(buf.subarray(i, i + 2)); i += 2; continue; }
    if (m === 0xda) { out.push(buf.subarray(i)); return Buffer.concat(out); }   /* the picture data, to the end */
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) throw new HttpError(400, 'This JPEG picture cannot be read.');
    const drop = (m >= 0xe1 && m <= 0xef && m !== 0xe2) || m === 0xfe;
    if (!drop) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  throw new HttpError(400, 'This JPEG picture cannot be read.');
}

const b64 = v => typeof v === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(v) ? Buffer.from(v, 'base64') : null;
const text = (v, n) => [...String(v ?? '')].map(ch => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch).join('').trim().slice(0, n);
const meta = r => ({ id: r.id, name: r.name, caption: r.caption, mime: r.mime, w: r.w, h: r.h, bytes: r.bytes, created: r.created, by: r.by });

/* Photos of devices that are no longer in the inventory (deleted, or not in a restored backup) go with them. */
export function purgeOrphanImages(db) {
  ensureImagesTable(db);
  return Number(db.prepare("DELETE FROM device_images WHERE obj_id NOT IN (SELECT id FROM docs WHERE kind = 'object')").run().changes);
}

export function imageStats(db) {
  ensureImagesTable(db);
  const r = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(bytes + LENGTH(thumb)), 0) AS bytes, COUNT(DISTINCT obj_id) AS devices FROM device_images').get();
  return { n: Number(r.n), bytes: Number(r.bytes), devices: Number(r.devices) };
}

export function registerDeviceImages(app, { db, requireUser, requireAdmin, audit }) {
  ensureImagesTable(db);
  const objectOf = id => {
    if (!/^[\w.-]{1,80}$/.test(String(id || ''))) throw new HttpError(404, 'No such device.');
    const row = db.prepare("SELECT data FROM docs WHERE kind = 'object' AND id = ?").get(String(id));
    if (!row) throw new HttpError(404, 'No such device.');
    return JSON.parse(row.data);
  };
  const imageRow = id => {
    if (!/^img-[0-9a-f]{24}$/.test(String(id || ''))) throw new HttpError(404, 'No such photo.');
    const r = db.prepare('SELECT * FROM device_images WHERE id = ?').get(String(id));
    if (!r) throw new HttpError(404, 'No such photo.');
    return r;
  };

  app.get('/api/objects/:id/images', requireUser, (req, res, next) => {
    try {
      objectOf(req.params.id);
      const rows = db.prepare('SELECT id, name, caption, mime, w, h, bytes, created, by FROM device_images WHERE obj_id = ? ORDER BY created, id').all(req.params.id);
      res.set('Cache-Control', 'no-store').json({ images: rows.map(meta), max: PHOTO_MAX });
    } catch (e) { next(e); }
  });

  app.post('/api/objects/:id/images', requireUser, requireAdmin, (req, res, next) => {
    try {
      const o = objectOf(req.params.id);
      const b = req.body || {};
      let data = b64(b.data);
      const thumb = b64(b.thumb);
      if (!data || !thumb) throw new HttpError(400, 'Send the photo and its preview.');
      const mime = imageType(data);
      if (!mime || imageType(thumb) !== 'image/jpeg') throw new HttpError(400, 'Send a JPEG, PNG or WebP photo.');
      if (data.length > PHOTO_BYTES) throw new HttpError(413, `The photo is larger than ${PHOTO_BYTES / 1048576} MB.`);
      if (thumb.length > THUMB_BYTES) throw new HttpError(413, 'The preview of the photo is too large.');
      if (mime === 'image/jpeg') data = stripJpeg(data);
      const w = Math.round(Number(b.w)), h = Math.round(Number(b.h));
      if (!(w > 0 && w <= 10000 && h > 0 && h <= 10000)) throw new HttpError(400, 'The size of the photo is missing.');
      const count = db.prepare('SELECT COUNT(*) AS n FROM device_images WHERE obj_id = ?').get(o.id).n;
      if (count >= PHOTO_MAX) throw new HttpError(409, `A device keeps up to ${PHOTO_MAX} photos. Remove one first.`);
      if (imageStats(db).bytes + data.length > PHOTOS_TOTAL) throw new HttpError(507, 'There is no room for more photos: remove some first.');
      const row = { id: `img-${crypto.randomBytes(12).toString('hex')}`, name: text(b.name, 120) || 'Photo', caption: text(b.caption, 200), mime, w, h, bytes: data.length,
        created: new Date().toISOString(), by: text(req.user.name || req.user.login, 120) };
      db.prepare('INSERT INTO device_images (id, obj_id, name, caption, mime, w, h, bytes, created, by, data, thumb) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(row.id, o.id, row.name, row.caption, row.mime, row.w, row.h, row.bytes, row.created, row.by, data, thumb);
      audit(db, req.user.id, `photo added to ${o.name}`);
      res.json({ image: meta(row) });
    } catch (e) { next(e); }
  });

  /* The photo itself, or its preview. An id is never used twice and a photo never changes, so the browser keeps it. */
  app.get('/api/images/:id', requireUser, (req, res, next) => {
    try {
      const r = imageRow(req.params.id);
      const thumb = req.query.size === 'thumb';
      const ext = thumb || r.mime === 'image/jpeg' ? 'jpg' : r.mime.split('/')[1];
      const file = `${r.name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^\w .-]+/g, '_').slice(0, 80) || 'photo'}.${ext}`;
      res.set({ 'Content-Type': thumb ? 'image/jpeg' : r.mime, 'Cache-Control': 'private, max-age=31536000, immutable',
        'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename="${file}"`, 'Content-Security-Policy': "default-src 'none'; sandbox" })
        .send(Buffer.from(thumb ? r.thumb : r.data));
    } catch (e) { next(e); }
  });

  app.patch('/api/images/:id', requireUser, requireAdmin, (req, res, next) => {
    try {
      const r = imageRow(req.params.id);
      const caption = text(req.body && req.body.caption, 200);
      db.prepare('UPDATE device_images SET caption = ? WHERE id = ?').run(caption, r.id);
      res.json({ image: meta({ ...r, caption }) });
    } catch (e) { next(e); }
  });

  app.delete('/api/images/:id', requireUser, requireAdmin, (req, res, next) => {
    try {
      const r = imageRow(req.params.id);
      db.prepare('DELETE FROM device_images WHERE id = ?').run(r.id);
      let name = r.obj_id;
      try { name = objectOf(r.obj_id).name; } catch { /* the device is gone: its id is named */ }
      audit(db, req.user.id, `photo removed from ${name}`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
}
