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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-photos-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
saveState(db, { ...s0, users: [...s0.users, { id: 'u-v', login: 'viewer', name: 'Vera Viewer', source: 'manual', role: 'viewer', active: true }],
  objs: [{ id: 'o1', code: 'INV-0001', type: 'switch', name: 'SW-01', status: 'active', ports: 8, ovr: {}, feed: null }], rels: [], history: {} });
setPassword(db, 'u-v', 'viewerpass123');
const until = async (check, ms = 8000) => { const t0 = Date.now(); while (!(await check())) { if (Date.now() - t0 > ms) throw new Error('not in time'); await new Promise(r => setTimeout(r, 100)); } };

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
  assert.equal(rows[0].mime, 'image/jpeg');
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

  /* A viewer: the photo, no Add, no Remove. */
  const vp = await signIn('viewer', 'viewerpass123');
  assert.equal((await vp.$$('.ph-thumb')).length, 1);
  assert.equal(await vp.$('#phAdd'), null);
  await vp.click('.ph-thumb'); await vp.waitForSelector('.ph-modal');
  assert.equal(await vp.$('#phDel'), null);
  assert.equal(await vp.$('#phCaption'), null);
  assert.deepEqual(errors, []);
  console.log('photos: ok');
} finally { await browser.close(); server.close(); db.close(); }
