/* Floor plan pins in tight spots: devices shown because they are in an area's room are spread over the area, not
   stacked; pins that still cover each other become one group with their count; a small group fans out around its
   marker, a big one lists its devices (click opens, drag moves); zooming in takes groups apart; each area shows its
   count; a group with a device that needs attention is marked. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
const shots = process.env.NI_SHOTS;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-plgroups-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const o = (id, loc, extra = {}) => ({ id, code: 'INV-' + id, type: 'pc', name: 'PC-' + id, status: 'active', loc, ovr: {}, feed: null, ...extra });
const many = (pfx, n, loc, extra = () => ({})) => Array.from({ length: n }, (_, i) => o(pfx + (i + 1), loc, extra(i)));
const area = (id, name, x, y, w, h) => ({ id, name, room: 'HQ / ' + name, x, y, w, h, rects: [{ x, y, w, h }] });
saveState(db, { ...s0, locs: ['HQ / Hall', 'HQ / Desk', 'HQ / Store'], sites: ['HQ'],
  objs: [
    ...many('h', 6, 'HQ / Hall'),                                               // a big area: spread, no groups
    ...many('d', 4, 'HQ / Desk', i => i === 0 ? { warranty: '2020-01-01' } : {}), // a small area: one group of 4, one needing attention
    ...many('s', 12, 'HQ / Store'),                                             // a small area with many: a list
  ],
  rels: [],
  plans: [{ id: 'pl1', name: 'EG', site: 'HQ', areas: [area('a1', 'Hall', 3, 5, 60, 55), area('a2', 'Desk', 70, 8, 12, 14), area('a3', 'Store', 70, 62, 6, 8)] }],
  history: {} });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'plans'; (await import('/js/07-render-plans.js')).renderPlans(); });
  await p.waitForSelector('.pl-group');

  // the big area: six pins spread out, none covering another, none grouped
  const boxes = await p.$$eval('[data-pin^=h]', ps => ps.map(e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, hidden: e.classList.contains('grouped') }; }));
  assert.equal(boxes.length, 6);
  assert.ok(boxes.every(b => !b.hidden), 'no pin of the hall is grouped');
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert.ok(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t, `pins ${i} and ${j} of the hall overlap`);
  }
  // each area says how many devices it has
  assert.deepEqual(await p.$$eval('.pl-area-tag .pl-acount', es => es.map(e => e.textContent)), ['6', '4', '12']);

  // the desk: one group of four, marked for the device whose warranty has ended
  const desk = p.locator('.pl-group', { hasText: /^4/ });
  assert.equal(await desk.count(), 1);
  assert.match(await desk.getAttribute('class'), /attn/);
  assert.match(await desk.getAttribute('aria-label'), /4 devices: PC-d1, PC-d2, PC-d3, PC-d4/);
  // clicked, its pins fan out apart from each other; a click beside it closes it again
  await desk.click();
  assert.equal(await p.locator('.pl-pin.fanned').count(), 4);
  const fanned = await p.$$eval('.pl-pin.fanned', ps => ps.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }));
  assert.equal(new Set(fanned.map(String)).size, 4, 'each fanned pin has its own place');
  if (shots) await p.locator('#plCanvas').screenshot({ path: path.join(shots, 'plan-fan.png') });
  const cv = await p.locator('#plCanvas').boundingBox();
  await p.mouse.click(cv.x + 20, cv.y + cv.height - 20);
  assert.equal(await p.locator('.pl-pin.fanned').count(), 0, 'closed by a click beside it');
  assert.equal(await p.locator('[data-pin^=d].grouped').count(), 4);
  // an open fan is put back when the plan changes size, so no pin keeps its fanned-out place
  await desk.click();
  assert.equal(await p.locator('.pl-pin.fanned').count(), 4);
  await p.setViewportSize({ width: 1200, height: 820 });
  await until(p, () => !document.querySelector('.pl-pin.fanned'));
  assert.equal(await p.locator('[data-pin^=d].grouped').count(), 4);
  await p.setViewportSize({ width: 1300, height: 850 });
  await until(p, () => document.querySelectorAll('[data-pin^=d].grouped').length === 4);
  // a pin opens its device from the keyboard too
  await p.focus('[data-pin=h1]'); await p.keyboard.press('Enter');
  await p.waitForSelector('#f_h1_name');
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'plans'; (await import('/js/07-render-plans.js')).renderPlans(); });
  await p.waitForSelector('.pl-group');
  // a fanned pin is opened by clicking it
  await desk.click();
  await p.click('[data-pin=d2]');
  await p.waitForSelector('#f_d2_name');
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'plans'; (await import('/js/07-render-plans.js')).renderPlans(); });
  await p.waitForSelector('.pl-group');

  // the store: twelve devices are a list; a row opens its device
  const store = p.locator('.pl-group', { hasText: /^12/ });
  await store.click();
  await p.waitForSelector('.pl-glist');
  assert.equal(await p.locator('.pl-glist [data-gopen]').count(), 12);
  assert.equal(await p.locator('.pl-pin.fanned').count(), 0, 'a big group is listed, not fanned');
  if (shots) await p.locator('#plCanvas').screenshot({ path: path.join(shots, 'plan-list.png') });
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('.pl-glist').count(), 0, 'Escape closes the list');
  // a row dragged into the hall places that device there, by hand
  await store.click(); await p.waitForSelector('.pl-glist');
  const row = await p.locator('.pl-glist [data-gopen=s5]').boundingBox(), cv2 = await p.locator('#plCanvas').boundingBox();
  await p.mouse.move(row.x + 30, row.y + row.height / 2); await p.mouse.down();
  await p.mouse.move(cv2.x + cv2.width * 0.33, cv2.y + cv2.height * 0.52, { steps: 12 }); await p.mouse.up();   // inside the hall (3–63 %, 5–60 %)
  await until(p, async () => { const o = (await import('/js/01-core.js')).byId('s5'); return !!(o.planPos && o.loc === 'HQ / Hall'); });
  await p.waitForSelector('[data-pin=s5]', { state: 'attached' });

  // zoomed in far enough, the desk's pins no longer cover each other and its group is gone
  for (let i = 0; i < 8; i++) await p.click('#plZoomIn');
  await until(p, () => !document.querySelector('.pl-group[aria-label^="4 devices"]'));
  assert.equal(await p.locator('[data-pin^=d].grouped').count(), 0);

  assert.deepEqual(errors, []);
  console.log('plan groups: all checks passed');
} finally { await browser.close(); server.close(); }
