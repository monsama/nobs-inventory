/* Browser test of device photos: a camera picture (with EXIF and a GPS position) is added from the file picker, made
   smaller and sent without its metadata; its preview shows, it opens large with the next one, gets a caption, and is
   removed. A viewer sees the photos but no Add or Remove. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { setPassword } from '../../server/auth.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { eventually, openSetTab } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-photos-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
saveState(db, { ...s0, users: [...s0.users, { id: 'u-v', login: 'viewer', name: 'Vera Viewer', source: 'manual', role: 'viewer', active: true }],
  objs: [{ id: 'o1', code: 'INV-0001', type: 'switch', name: 'SW-01', status: 'active', ports: 8, ovr: {}, feed: null }], rels: [], history: {} });
setPassword(db, 'u-v', 'viewerpass123');
const until = (check, ms = 8000) => eventually(check, ms);

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const shots = process.env.NI_SHOTS;
const errors = [];
const signIn = async (login, pw) => {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none in previews */ } });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', login); await page.fill('#lgPw', pw); await page.click('#lgOk');
  await page.waitForSelector('.card');
  await page.evaluate(async () => (await import('/js/02-views.js')).openObj('o1'));
  /* Read, then shown: with photos as their panel; with none, offered on the Add line (opened here to add some). */
  await page.waitForSelector('#phPanel:not([hidden]) .ph-grid:not(:has-text("Loading")), [data-xadd=photos]');
  if (await page.locator('[data-xadd=photos]').count()) await page.click('[data-xadd=photos]');
  await page.waitForSelector('#phPanel .ph-grid:not(:has-text("Loading"))');
  return page;
};
try {
  const page = await signIn('admin', 'adminpass123');
  assert.match(await page.textContent('#phPanel'), /No photos yet/);
  /* A 3000 × 2000 camera picture, made in the browser, with an EXIF block holding a GPS position put in after JFIF. */
  const made = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 3000; c.height = 2000;
    const x = c.getContext('2d'); x.fillStyle = '#3a7'; x.fillRect(0, 0, 3000, 2000); x.fillStyle = '#fff'; x.font = '200px sans-serif'; x.fillText('SN-12345', 300, 1000);
    const b = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9))).arrayBuffer());
    const exif = new TextEncoder().encode('Exif\0\0GPS 47.3769N 8.5417E');
    const seg = new Uint8Array(4 + exif.length); seg.set([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255]); seg.set(exif, 4);
    const out = new Uint8Array(b.length + seg.length); out.set(b.subarray(0, 2)); out.set(seg, 2); out.set(b.subarray(2), 2 + seg.length);
    let s = ''; for (const v of out) s += String.fromCharCode(v); return btoa(s);
  });
  const file = path.join(dir, 'label.jpg'); fs.writeFileSync(file, Buffer.from(made, 'base64'));
  assert.ok(fs.readFileSync(file).includes('GPS'), 'the test picture has a GPS position');
  await page.setInputFiles('#phFile', [file, file]);
  await until(async () => (await page.$$('.ph-thumb')).length === 2);
  const rows = db.prepare('SELECT * FROM device_images').all();
  assert.equal(rows.length, 2);
  assert.ok(Math.max(rows[0].w, rows[0].h) <= 2560, 'made smaller');
  assert.ok(['image/jpeg', 'image/webp'].includes(rows[0].mime), rows[0].mime);
  assert.ok(!Buffer.from(rows[0].data).includes('GPS'), 'sent without its GPS position');
  await until(() => /2 photos added by Administrator/.test(loadState(db).history.o1?.[0]?.msg || ''));
  if (shots) await page.screenshot({ path: path.join(shots, 'photos-panel.png') });

  /* Large, the next one with the arrow key, a caption. */
  await page.click('.ph-thumb[data-ph="0"]');
  await page.waitForSelector('.ph-modal .ph-big img');
  await until(() => page.evaluate(() => { const i = document.querySelector('.ph-big img'); return i.complete && i.naturalWidth > 0; }));
  assert.match(await page.textContent('.ph-modal .mh'), /photo 1 of 2/);
  await page.keyboard.press('ArrowRight');
  await page.waitForSelector('.ph-modal .mh:has-text("photo 2 of 2")');
  await page.fill('#phCaption', 'Label on the back'); await page.press('#phCaption', 'Tab');
  await until(() => db.prepare("SELECT COUNT(*) AS n FROM device_images WHERE caption = 'Label on the back'").get().n === 1);
  if (shots) await page.screenshot({ path: path.join(shots, 'photos-viewer.png') });
  /* Removed: asked once in place. */
  await page.click('#phDel'); assert.equal((await page.textContent('#phDel')).trim(), 'Remove for good');
  await page.click('#phDel');
  await page.waitForSelector('.ph-modal .mh:has-text("photo 1 of 1")');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM device_images').get().n, 1);
  await page.click('#phClose');
  assert.equal((await page.$$('.ph-thumb')).length, 1);

  /* Smallest without a visible loss: a photo becomes WebP (smaller than the JPEG at the same quality); a screenshot
     stays lossless; a small upright JPEG is kept as it is, byte for byte (but its metadata). */
  const picks = await page.evaluate(async () => {
    const { prepare } = await import('/js/23-photos.js');
    const make = async (w, h, type, q, noise) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
      const img = x.createImageData(w, h);
      for (let i = 0; i < img.data.length; i += 4) { const v = noise ? (Math.sin(i / 97) * 60 + 120 + (i % 7) * 9) : ((i / 4) % w < w / 2 ? 30 : 220); img.data[i] = v; img.data[i + 1] = v * 0.8; img.data[i + 2] = 255 - v; img.data[i + 3] = 255; }
      x.putImageData(img, 0, 0); if (!noise) { x.fillStyle = '#000'; x.font = '40px sans-serif'; x.fillText('Settings → Network', 20, 80); }
      const b = await new Promise(r => c.toBlob(r, type, q));
      return new File([b], 'p.' + type.split('/')[1], { type });
    };
    const decode = b64 => atob(b64).slice(0, 12);
    const photo = await make(3000, 2000, 'image/jpeg', 0.95, true), shot = await make(1200, 800, 'image/png', undefined, false), small = await make(800, 600, 'image/jpeg', 0.6, true);
    const [a, b, c] = [await prepare(photo), await prepare(shot), await prepare(small)];
    /* The same picture at 2560 px as JPEG and as WebP at the quality used: what is sent is the smaller one. */
    const bmp = await createImageBitmap(photo), cv = document.createElement('canvas'); cv.width = 2560; cv.height = Math.round(2000 * 2560 / 3000); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const sizeAs = (type) => new Promise(r => cv.toBlob(x => r(x.size), type, 0.85));
    const both = [await sizeAs('image/jpeg'), await sizeAs('image/webp')];
    return { photo: [decode(a.data), a.bytes, photo.size, Math.min(...both)], shot: [decode(b.data), b.bytes, shot.size], small: [c.bytes, small.size] };
  });
  assert.match(picks.photo[0], /^RIFF....WEBP|^\xff\xd8\xff/, 'a photo as WebP or JPEG');
  assert.ok(picks.photo[1] <= picks.photo[3] * 1.02, `the smaller of the two: ${picks.photo[1]} vs ${picks.photo[3]}`);
  assert.ok(picks.photo[1] < picks.photo[2] / 2, 'much smaller than the camera file');
  assert.ok(picks.shot[1] <= picks.shot[2], 'a screenshot never larger than its PNG');
  assert.ok(/^RIFF....WEBP|^\x89PNG/.test(picks.shot[0]), 'and lossless');
  assert.equal(picks.small[0], picks.small[1], 'a small JPEG kept as it is');

  /* Make photos smaller (Maintenance): a big PNG photo stored before is replaced by a smaller one under a new id. */
  const big = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1200; const x = c.getContext('2d'); const img = x.createImageData(1600, 1200);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.sin(i / 53) * 70 + 120 + (i % 11) * 5; img.data[i] = v; img.data[i + 1] = 200 - v / 2; img.data[i + 2] = v / 3; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0);
    const toB64 = async b => { const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
    const png = await new Promise(r => c.toBlob(r, 'image/png')), jpg = await new Promise(r => { const t = document.createElement('canvas'); t.width = 160; t.height = 120; t.getContext('2d').drawImage(c, 0, 0, 160, 120); t.toBlob(r, 'image/jpeg', 0.8); });
    const r = await fetch('api/objects/o1/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'old.png', data: await toB64(png), thumb: await toB64(jpg), w: 1600, h: 1200 }) });
    return (await r.json()).image;
  });
  assert.equal(big.mime, 'image/png');
  const before = db.prepare('SELECT SUM(bytes) AS b FROM device_images').get().b;
  await page.click('#setBtn'); await openSetTab(page, 'maintenance');
  await page.waitForSelector('#psRun');
  assert.match(await page.textContent('#psStatus'), /2 photos of devices and racks/);
  await page.click('#psRun');
  await until(() => page.evaluate(() => /Done: /.test(document.querySelector('#psStatus')?.textContent || '')), 30000);
  assert.match(await page.textContent('#psStatus'), /Done: 1 of 2 photos made smaller/);
  const after = db.prepare('SELECT * FROM device_images').all();
  assert.equal(after.length, 2);
  assert.ok(!after.some(r => r.id === big.id), 'under a new id');
  const re = after.find(r => r.name === 'old.png');
  assert.ok(re.bytes < big.bytes * 0.85, `smaller: ${re.bytes} < ${big.bytes}`);
  assert.ok(db.prepare('SELECT SUM(bytes) AS b FROM device_images').get().b < before);
  await page.keyboard.press('Escape');

  /* A viewer: the photo, no Add, no Remove. */
  const vp = await signIn('viewer', 'viewerpass123');
  // what the device does not have is named in one line for someone who only reads
  assert.match(await vp.textContent('#xNone'), /^No links,.* recorded\.$/);
  assert.equal(await vp.locator('#xAdd').count(), 0);
  assert.equal((await vp.$$('.ph-thumb')).length, 2);
  assert.equal(await vp.$('#phAdd'), null);
  await vp.click('.ph-thumb'); await vp.waitForSelector('.ph-modal');
  assert.equal(await vp.$('#phDel'), null);
  assert.equal(await vp.$('#phCaption'), null);
  /* The last photo removed: the panel stays, now with its × like any empty extra, and the × puts it back on Add. */
  await vp.close();
  for (let left = (await page.$$('.ph-thumb')).length; left > 0; left--) {
    await page.click('.ph-thumb'); await page.waitForSelector('#phDel');
    await page.click('#phDel'); await page.click('#phDel');
    await page.waitForFunction(n => document.querySelectorAll('.ph-thumb').length < n, left);
    if (await page.$('.ph-modal')) await page.click('#phClose');
  }
  await page.waitForSelector('[data-xhide=photos]');
  await page.click('[data-xhide=photos]');
  await page.waitForSelector('[data-xadd=photos]');
  assert.deepEqual(errors, []);
  console.log('photos: ok');
} finally { await browser.close(); server.close(); db.close(); }
