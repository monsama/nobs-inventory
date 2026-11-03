/* Photos of a device: the label on its back, how it is cabled, where it stands. Kept in their own table, apart from the
   inventory, so they do not count against its size and a save never sends them. The page makes each photo smaller and
   takes its metadata out (EXIF: camera, time, GPS position) before it is sent; the server checks again what it gets: a
   JPEG, PNG or WebP picture by its first bytes, within the sizes below, with the JPEG metadata blocks taken out once more.
   Everyone signed in sees them; an admin adds, captions and removes them. */
import { inScope, scopeOf } from './scope.js';
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
    if (m === 0xda) {
      /* The picture data, to its end marker: anything after it (a second picture a phone appends, with its own
         metadata) is left out. In the data a 0xFF byte is always followed by 0x00 or a restart marker, so the first
         FF D9 is the end. */
      const end = buf.indexOf(Buffer.from([0xff, 0xd9]), i + 2);
      out.push(end < 0 ? buf.subarray(i) : buf.subarray(i, end + 2));
      return Buffer.concat(out);
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) throw new HttpError(400, 'This JPEG picture cannot be read.');
    const drop = (m >= 0xe1 && m <= 0xef && m !== 0xe2) || m === 0xfe;
    if (!drop) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  throw new HttpError(400, 'This JPEG picture cannot be read.');
}

/* A PNG with only the chunks that draw the picture: text, time and EXIF chunks (camera, GPS) are left out. */
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'pHYs']);
/* Walks the chunks after the signature and keeps those in PNG_KEEP, up to IEND. A cut-off file, or one without IEND, is
   refused with a 400. */
export function stripPng(buf) {
  const out = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString('latin1', i + 4, i + 8), end = i + 12 + len;
    if (end > buf.length) throw new HttpError(400, 'This PNG picture cannot be read.');
    if (PNG_KEEP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') return Buffer.concat(out);
  }
  throw new HttpError(400, 'This PNG picture cannot be read.');
}
/* A WebP with only the chunks that draw the picture: EXIF and XMP (camera, GPS) go, and the flags that announced them. */
const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ICCP']);
/* Walks the RIFF chunks, keeps those in WEBP_KEEP, clears the EXIF and XMP flags in VP8X and writes a new RIFF header
   for the new length. An animation, or a file with no picture chunk, is refused. */
export function stripWebp(buf) {
  const out = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const type = buf.toString('latin1', i, i + 4), len = buf.readUInt32LE(i + 4), end = i + 8 + len + (len % 2);
    if (i + 8 + len > buf.length) throw new HttpError(400, 'This WebP picture cannot be read.');
    if (type === 'ANIM' || type === 'ANMF') throw new HttpError(400, 'Send a still picture, not an animation.');
    if (WEBP_KEEP.has(type)) {
      const chunk = Buffer.from(buf.subarray(i, Math.min(end, buf.length)));
      if (type === 'VP8X' && len >= 1) chunk[8] &= ~0x0c;   /* no EXIF (0x08), no XMP (0x04) */
      out.push(chunk);
    }
    i = end;
  }
  if (!out.some(c => /^VP8[ L]/.test(c.toString('latin1', 0, 4)))) throw new HttpError(400, 'This WebP picture cannot be read.');
  const body = Buffer.concat(out), head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(body.length + 4, 4); head.write('WEBP', 8, 'latin1');
  return Buffer.concat([head, body]);
}
/* A picture without its metadata, whatever sent it (the page, a script, a backup file). */
export const cleanImage = buf => { const t = imageType(buf); return t === 'image/jpeg' ? stripJpeg(buf) : t === 'image/png' ? stripPng(buf) : t === 'image/webp' ? stripWebp(buf) : buf; };
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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

/* Adds the photo routes: a device's photos listed and added (/api/objects/:id/images), moved to another device in a
   merge, one photo or its preview (GET /api/images/:id), its caption and its removal, and for Health the list of all
   photos and a smaller copy replacing one. Viewers only read, and only devices in their scope. */
export function registerDeviceImages(app, { db, requireUser, requireAdmin, audit }) {
  ensureImagesTable(db);
  /* A viewer limited to some sites sees the photos of their devices only (server/scope.js). */
  const objectOf = (id, req = null) => {
    if (!/^[\w.-]{1,80}$/.test(String(id || ''))) throw new HttpError(404, 'No such device.');
    const row = db.prepare("SELECT data FROM docs WHERE kind = 'object' AND id = ?").get(String(id));
    if (!row) throw new HttpError(404, 'No such device.');
    const o = JSON.parse(row.data);
    if (req && !inScope(o, scopeOf(req.user))) throw new HttpError(404, 'No such device.');
    return o;
  };
  /* A photo and its preview as sent: JPEG, PNG or WebP (preview JPEG or WebP), within the sizes, metadata taken out. */
  const pictureOf = b => {
    let data = b64(b.data), thumb = b64(b.thumb);
    if (!data || !thumb) throw new HttpError(400, 'Send the photo and its preview.');
    const mime = imageType(data);
    if (!PHOTO_TYPES.includes(mime) || !['image/jpeg', 'image/webp'].includes(imageType(thumb))) throw new HttpError(400, 'Send a JPEG, PNG or WebP photo.');
    if (data.length > PHOTO_BYTES) throw new HttpError(413, `The photo is larger than ${PHOTO_BYTES / 1048576} MB.`);
    if (thumb.length > THUMB_BYTES) throw new HttpError(413, 'The preview of the photo is too large.');
    data = cleanImage(data); thumb = cleanImage(thumb);
    const w = Math.round(Number(b.w)), h = Math.round(Number(b.h));
    if (!(w > 0 && w <= 10000 && h > 0 && h <= 10000)) throw new HttpError(400, 'The size of the photo is missing.');
    return { data, thumb, mime, w, h };
  };
  const imageRow = id => {
    if (!/^img-[0-9a-f]{24}$/.test(String(id || ''))) throw new HttpError(404, 'No such photo.');
    const r = db.prepare('SELECT * FROM device_images WHERE id = ?').get(String(id));
    if (!r) throw new HttpError(404, 'No such photo.');
    return r;
  };

  app.get('/api/objects/:id/images', requireUser, (req, res, next) => {
    try {
      objectOf(req.params.id, req);
      const rows = db.prepare('SELECT id, name, caption, mime, w, h, bytes, created, by FROM device_images WHERE obj_id = ? ORDER BY created, id').all(req.params.id);
      res.set('Cache-Control', 'no-store').json({ images: rows.map(meta), max: PHOTO_MAX });
    } catch (e) { next(e); }
  });

  /* A new photo: checked and cleaned by pictureOf, within the count per device and the room for all photos together. */
  app.post('/api/objects/:id/images', requireUser, requireAdmin, (req, res, next) => {
    try {
      const o = objectOf(req.params.id, req);
      const b = req.body || {};
      const { data, thumb, mime, w, h } = pictureOf(b);
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

  /* A record folded into a device as the same device: its photos go to that device, as many as it has room for. */
  app.post('/api/objects/:id/images/move', requireUser, requireAdmin, (req, res, next) => {
    try {
      const from = objectOf(req.params.id, req), to = objectOf(req.body && req.body.to, req);
      const rows = db.prepare('SELECT id FROM device_images WHERE obj_id = ? ORDER BY created, id').all(from.id);
      const room = Math.max(0, PHOTO_MAX - db.prepare('SELECT COUNT(*) AS n FROM device_images WHERE obj_id = ?').get(to.id).n);
      const move = rows.slice(0, room);
      for (const r of move) db.prepare('UPDATE device_images SET obj_id = ? WHERE id = ?').run(to.id, r.id);
      if (move.length) audit(db, req.user.id, `${move.length} photo${move.length === 1 ? '' : 's'} moved from ${from.name} to ${to.name}`);
      res.json({ moved: move.length, left: rows.length - move.length });
    } catch (e) { next(e); }
  });

  /* The photo itself, or its preview. An id is never used twice and a photo never changes, so the browser keeps it. */
  app.get('/api/images/:id', requireUser, (req, res, next) => {
    try {
      const r = imageRow(req.params.id);
      objectOf(r.obj_id, req);
      const thumb = req.query.size === 'thumb', type = thumb ? imageType(Buffer.from(r.thumb)) || 'image/jpeg' : r.mime;
      const ext = type === 'image/jpeg' ? 'jpg' : type.split('/')[1];
      const file = `${r.name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^\w .-]+/g, '_').slice(0, 80) || 'photo'}.${ext}`;
      res.set({ 'Content-Type': type, 'Cache-Control': 'private, max-age=31536000, immutable',
        'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename="${file}"`, 'Content-Security-Policy': "default-src 'none'; sandbox" })
        .send(Buffer.from(thumb ? r.thumb : r.data));
    } catch (e) { next(e); }
  });

  /* All photos, for Make photos smaller (Settings → System → Health): what each is, not the pictures. */
  app.get('/api/images', requireUser, requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store').json({ images: db.prepare('SELECT id, obj_id, name, mime, w, h, bytes, LENGTH(thumb) AS tbytes FROM device_images ORDER BY bytes DESC').all() });
  });
  /* The same photo, smaller: stored under a new id (a photo's id never shows other bytes, so browsers may keep it), with
     its name, caption, date and who added it; the old one goes. Only when it is smaller. */
  app.post('/api/images/:id/replace', requireUser, requireAdmin, (req, res, next) => {
    try {
      const r = imageRow(req.params.id);
      const o = objectOf(r.obj_id, req);
      const p = pictureOf(req.body || {});
      if (p.data.length + p.thumb.length >= r.bytes + Buffer.from(r.thumb).length) throw new HttpError(409, 'The new picture is not smaller: the photo stays as it is.');
      const id = `img-${crypto.randomBytes(12).toString('hex')}`;
      db.exec('BEGIN');
      try {
        db.prepare('INSERT INTO device_images (id, obj_id, name, caption, mime, w, h, bytes, created, by, data, thumb) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, r.obj_id, r.name, r.caption, p.mime, p.w, p.h, p.data.length, r.created, r.by, p.data, p.thumb);
        db.prepare('DELETE FROM device_images WHERE id = ?').run(r.id);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      /* In the log like adding and removing one: a photo swapped for another is seen. */
      audit(db, req.user.id, `photo replaced on ${o && o.name ? o.name : r.obj_id}: ${r.name}`);
      res.json({ image: meta({ ...r, id, mime: p.mime, w: p.w, h: p.h, bytes: p.data.length }), before: r.bytes });
    } catch (e) { next(e); }
  });

  /* A new caption. Not written to the log. */
  app.patch('/api/images/:id', requireUser, requireAdmin, (req, res, next) => {
    try {
      const r = imageRow(req.params.id);
      objectOf(r.obj_id, req);
      const caption = text(req.body && req.body.caption, 200);
      db.prepare('UPDATE device_images SET caption = ? WHERE id = ?').run(caption, r.id);
      res.json({ image: meta({ ...r, caption }) });
    } catch (e) { next(e); }
  });

  app.delete('/api/images/:id', requireUser, requireAdmin, (req, res, next) => {
    try {
      const r = imageRow(req.params.id);
      /* Also for a device already gone. */
      db.prepare('DELETE FROM device_images WHERE id = ?').run(r.id);
      let name = r.obj_id;
      try { name = objectOf(r.obj_id).name; } catch { /* the device is gone: its id is named */ }
      audit(db, req.user.id, `photo removed from ${name}`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
}
