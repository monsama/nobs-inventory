/* Browser test of labels and scanning: labels for the selected devices come as a PDF; an address from a label
   (?o=INV-…) opens the device after sign-in; a stocktake reads a label's QR code from the camera (a fake camera showing
   the code; this Chromium has no BarcodeDetector, so it is the QR reader every browser gets). */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import qrcode from 'qrcode-generator';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-labels-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const dev = (id, code, name) => ({ id, code, type: 'notebook', name, status: 'active', loc: 'Bern / EG', feed: null, ovr: {} });
saveState(db, { ...s0, history: {}, locs: ['Bern / EG'],
  objs: [dev('o1', 'INV-0001', 'NB-ONE'), dev('o2', 'INV-0002', 'NB-TWO')],
  stocktakes: [{ id: 'st1', name: 'Bern now', scope: 'Bern', started: new Date().toISOString(), by: 'admin' }] });

/* A fake camera: a Y4M video of the QR code of INV-0002's label. */
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const q = qrcode(0, 'M'); q.addData(`${base}/?o=INV-0002`, 'Byte'); q.make();
const n = q.getModuleCount(), cell = 8, W = 640, H = 480, off = Math.floor((H - n * cell) / 2);
const Y = Buffer.alloc(W * H, 235);
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c))
  for (let y = 0; y < cell; y++) Y.fill(16, (off + r * cell + y) * W + off + c * cell, (off + r * cell + y) * W + off + (c + 1) * cell);
const UV = Buffer.alloc(W * H / 2, 128);
const y4m = path.join(dir, 'qr.y4m');
fs.writeFileSync(y4m, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), ...Array.from({ length: 5 }, () => [Buffer.from('FRAME\n'), Y, UV]).flat()]));

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
  args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`] });
const errors = [];
const until = async (check, ms = 10000) => { const t0 = Date.now(); while (!(await check())) { if (Date.now() - t0 > ms) throw new Error('not in time: ' + check); await new Promise(r => setTimeout(r, 100)); } };
try {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 }, permissions: ['camera'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); localStorage.setItem('ni-start-hidden', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));

  // a label's address: the device opens once signed in
  await p.goto(`${base}/?o=INV-0001`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(() => p.evaluate(async () => (await import('/js/01-core.js')).st.tab === 'o1'));
  assert.equal(new URL(p.url()).search, '', 'the address is cleaned');

  // labels for the selected devices
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'table'; c.st.bulk = new Set(['o1', 'o2']); (await import('/js/07-render.js')).render(); });
  await p.click('#bkLabels'); await p.waitForSelector('#lbFormat');
  assert.match(await p.textContent('#mdl .mh'), /Labels for 2 devices/);
  await p.selectOption('#lbFormat', 'a4-65');
  assert.equal(await p.isVisible('#lbSkip'), true);
  await p.fill('#lbSkip', '3');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#lbPdf')]);
  assert.match(dl.suggestedFilename(), /^nobs-labels-.*\.pdf$/);
  const pdf = fs.readFileSync(await dl.path());
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  await p.selectOption('#lbFormat', 'roll-62x29');
  assert.equal(await p.isVisible('#lbSkip'), false, 'a label printer has no sheet to start on');
  await p.click('#lbCancel');

  // the stocktake reads the label from the camera
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'stocktake'; (await import('/js/07-render.js')).render(); });
  await p.click('#stkCam');
  await until(() => p.evaluate(async () => { const o = (await import('/js/01-core.js')).objs.find(x => x.id === 'o2'); return !!(o.verified && o.verified.st === 'st1'); }), 20000);
  assert.match(await p.textContent('#camLast'), /NB-TWO.*confirmed/);
  await p.click('#camDone');
  assert.equal(await p.evaluate(() => [...document.querySelectorAll('video')].some(v => v.srcObject && v.srcObject.active)), false, 'the camera is off');

  assert.deepEqual(errors, []);
  console.log('labels and scan: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
