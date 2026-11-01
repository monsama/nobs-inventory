/* Device photos: only pictures are kept, their metadata (EXIF: camera, GPS) is taken out, viewers see them, only an
   admin adds or removes them, and they go with their device. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn, seedBasics } from './helpers.js';
import { imageType, stripJpeg, stripWebp, PHOTO_MAX } from '../server/device-images.js';
import { loadState, saveState } from '../server/state.js';
import { setPassword } from '../server/auth.js';

const seg = (marker, body) => { const b = Buffer.from(body); const h = Buffer.alloc(4); h[0] = 0xff; h[1] = marker; h.writeUInt16BE(b.length + 2, 2); return Buffer.concat([h, b]); };
/* A small JPEG as a camera writes it: JFIF, then EXIF with a GPS position, a comment, the picture data. */
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, 'JFIF\0\x01\x01\0\0\x01\0\x01\0\0'), seg(0xe1, 'Exif\0\0GPS 47.3769N 8.5417E'), seg(0xfe, 'Taken by a phone'),
  seg(0xdb, 'quant-table'), seg(0xda, 'scan-head'), Buffer.from('picture-bytes'), Buffer.from([0xff, 0xd9])]);
const b64 = b => b.toString('base64');

test('the picture type is read from its bytes, and a JPEG loses its metadata', () => {
  assert.equal(imageType(jpeg()), 'image/jpeg');
  assert.equal(imageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), '');
  assert.equal(imageType(Buffer.from('89504e470d0a1a0a0000', 'hex')), 'image/png');
  const clean = stripJpeg(jpeg());
  assert.ok(!clean.includes('GPS'), 'the GPS position is gone');
  assert.ok(!clean.includes('Taken by'), 'the comment is gone');
  assert.ok(clean.includes('JFIF') && clean.includes('picture-bytes'), 'the picture stays');
  assert.throws(() => stripJpeg(Buffer.from([0xff, 0xd8, 0x00, 0x00, 0x00])), /cannot be read/);
});

test('photos of a device: add, list, view, caption, remove; viewers only look; they go with the device', async () => {
  const srv = await startServer();
  try {
    seedBasics(srv.db);
    const s = loadState(srv.db);
    s.users.push({ id: 'u-v', login: 'viewer', name: 'Vera Viewer', source: 'manual', role: 'viewer', active: true });
    saveState(srv.db, s);
    const a = await signIn(srv, 'admin', 'adminpass123');
    setPassword(srv.db, 'u-v', 'viewerpass123');
    const v = await signIn(srv, 'viewer', 'viewerpass123');
    const add = (cookie, extra = {}) => srv.call('POST', '/api/objects/o2/images', { cookie, body: { name: 'label.jpg', caption: 'Label', data: b64(jpeg()), thumb: b64(jpeg()), w: 800, h: 600, ...extra } });

    const r = await add(a.cookie);
    assert.equal(r.status, 200, r.text);
    const img = r.json.image;
    assert.match(img.id, /^img-[0-9a-f]{24}$/);
    assert.equal(img.by, 'Administrator');
    assert.equal((await add(a.cookie, { data: b64(Buffer.from('<svg onload="alert(1)"/>')) })).status, 400, 'not a picture');
    assert.equal((await add(a.cookie, { w: 0 })).status, 400);
    assert.equal((await srv.call('POST', '/api/objects/nope/images', { cookie: a.cookie, body: {} })).status, 404);
    assert.ok(v.cookie, 'the viewer signed in');
    assert.equal((await add(v.cookie)).status, 403, 'a viewer does not add');

    const list = await srv.call('GET', '/api/objects/o2/images', { cookie: v.cookie });
    assert.deepEqual(list.json.images.map(x => x.caption), ['Label']);
    assert.equal(list.json.max, PHOTO_MAX);
    const full = await fetch(`${srv.base}/api/images/${img.id}`, { headers: { cookie: v.cookie } });
    assert.equal(full.headers.get('content-type'), 'image/jpeg');
    assert.equal(full.headers.get('x-content-type-options'), 'nosniff');
    assert.match(full.headers.get('cache-control'), /private/);
    const bytes = Buffer.from(await full.arrayBuffer());
    assert.ok(!bytes.includes('GPS'), 'kept without its GPS position');
    assert.equal((await fetch(`${srv.base}/api/images/${img.id}`)).status, 401, 'not without signing in');

    assert.equal((await srv.call('PATCH', `/api/images/${img.id}`, { cookie: a.cookie, body: { caption: 'Back side' } })).json.image.caption, 'Back side');
    const second = (await add(a.cookie)).json.image;
    assert.equal((await srv.call('DELETE', `/api/images/${second.id}`, { cookie: a.cookie })).status, 200);
    assert.equal((await srv.call('GET', '/api/objects/o2/images', { cookie: a.cookie })).json.images.length, 1);

    /* The device deleted for good: its photo goes too. */
    const st = await srv.call('GET', '/api/state', { cookie: a.cookie });
    const rev = st.json.revs && st.json.revs['object|o2'];
    const del = await srv.call('POST', '/api/changes', { cookie: a.cookie, body: { puts: [], dels: [{ kind: 'object', id: 'o2', base: rev ?? 1 }] } });
    assert.equal(del.status, 200, del.text);
    assert.equal(srv.db.prepare('SELECT COUNT(*) AS n FROM device_images').get().n, 0);
    assert.equal((await fetch(`${srv.base}/api/images/${img.id}`, { headers: { cookie: a.cookie } })).status, 404);
  } finally { await srv.close(); }
});

test('metadata goes wherever it hides: after the end of a JPEG, in a PNG chunk, in the preview', async () => {
  const { stripPng, cleanImage } = await import('../server/device-images.js');
  const withTail = Buffer.concat([jpeg(), Buffer.from('MPF GPS 47.37N trailing picture')]);
  assert.ok(!stripJpeg(withTail).includes('GPS'), 'data after the end marker is cut');
  const chunk = (type, body) => { const b = Buffer.from(body); const h = Buffer.alloc(8); h.writeUInt32BE(b.length, 0); h.write(type, 4, 'latin1'); return Buffer.concat([h, b, Buffer.alloc(4)]); };
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', 'x'.repeat(13)), chunk('eXIf', 'GPS 47.37N'), chunk('tEXt', 'Comment\0secret'), chunk('IDAT', 'pixels'), chunk('IEND', '')]);
  const clean = stripPng(png);
  assert.ok(!clean.includes('GPS') && !clean.includes('secret'), 'EXIF and text chunks are gone');
  assert.ok(clean.includes('pixels') && clean.includes('IEND'), 'the picture stays');
  assert.ok(!cleanImage(withTail).includes('GPS'));
});

/* A WebP as a camera app writes it: VP8X announcing EXIF, the picture, and an EXIF chunk with a GPS position. */
const chunk = (type, body) => { const b = Buffer.from(body); const h = Buffer.alloc(8); h.write(type, 0, 'latin1'); h.writeUInt32LE(b.length, 4); return Buffer.concat([h, b, b.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]); };
const webp = () => { const body = Buffer.concat([chunk('VP8X', Buffer.from([0x08, 0, 0, 0, 9, 0, 0, 9, 0, 0])), chunk('VP8 ', 'picture-bytes'), chunk('EXIF', 'GPS 47.3769N 8.5417E'), chunk('XMP ', '<x:xmpmeta>me</x:xmpmeta>')]);
  const head = Buffer.alloc(12); head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(body.length + 4, 4); head.write('WEBP', 8, 'latin1'); return Buffer.concat([head, body]); };

test('a WebP loses its EXIF and XMP, and the flags that announced them; an animation is refused', () => {
  const w = webp(), clean = stripWebp(w);
  assert.equal(imageType(clean), 'image/webp');
  assert.ok(!clean.includes('GPS') && !clean.includes('xmpmeta'));
  assert.ok(clean.includes('picture-bytes'));
  assert.equal(clean.readUInt32LE(4), clean.length - 8, 'the RIFF size fits');
  assert.equal(clean[20] & 0x0c, 0, 'no EXIF or XMP flag');
  const anim = Buffer.concat([w.subarray(0, 12), chunk('ANIM', 'x')]);
  assert.throws(() => stripWebp(anim), /still picture/);
});

test('a photo made smaller: stored under a new id only when smaller; all photos listed for admins only', async () => {
  const srv = await startServer();
  try {
    seedBasics(srv.db);
    const a = await signIn(srv, 'admin', 'adminpass123');
    const id = loadState(srv.db).objs[0].id;
    const big = Buffer.concat([jpeg(), Buffer.alloc(0)]);
    const pad = Buffer.concat([big.subarray(0, big.length - 2), Buffer.from('x'.repeat(4000)), Buffer.from([0xff, 0xd9])]);
    const add = await srv.call('POST', `/api/objects/${id}/images`, { cookie: a.cookie, body: { name: 'big.jpg', caption: 'Label', data: b64(pad), thumb: b64(jpeg()), w: 800, h: 600 } });
    assert.equal(add.status, 200, add.text);
    const old = add.json.image;
    const list = await srv.call('GET', '/api/images', { cookie: a.cookie });
    assert.deepEqual(list.json.images.map(x => [x.id, x.obj_id]), [[old.id, id]]);
    assert.equal((await srv.call('GET', '/api/images')).status, 401);
    // a WebP, smaller: replaces it under a new id, with its caption; the old address is gone
    const r = await srv.call('POST', `/api/images/${old.id}/replace`, { cookie: a.cookie, body: { data: b64(webp()), thumb: b64(jpeg()), w: 800, h: 600 } });
    assert.equal(r.status, 200, r.text);
    assert.notEqual(r.json.image.id, old.id); assert.equal(r.json.image.caption, 'Label'); assert.equal(r.json.image.mime, 'image/webp');
    assert.equal((await srv.call('GET', `/api/images/${old.id}`, { cookie: a.cookie })).status, 404);
    const got = await fetch(`${srv.base}/api/images/${r.json.image.id}`, { headers: { cookie: a.cookie } });
    assert.equal(got.headers.get('content-type'), 'image/webp');
    assert.ok(!Buffer.from(await got.arrayBuffer()).includes('GPS'), 'its metadata taken out');
    // not smaller: refused, the photo stays
    assert.equal((await srv.call('POST', `/api/images/${r.json.image.id}/replace`, { cookie: a.cookie, body: { data: b64(pad), thumb: b64(jpeg()), w: 800, h: 600 } })).status, 409);
  } finally { await srv.close(); }
});
