/* An area is made of rectangles, and dragging it moves the devices placed inside it. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { until } from './until.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-move-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); });
  // A plan with one area of two rectangles, and PC o2 placed inside its lower rectangle.
  await p.evaluate(async () => {
    const d = await (await fetch('api/state', {credentials: 'same-origin'})).json();
    d.plans = [{id: 'pl1', name: 'EG', site: 'Zürich HQ', areas: [{id: 'ar1', name: 'Hall', x: 10, y: 10, w: 20, h: 20, rects: [{x: 10, y: 10, w: 20, h: 10}, {x: 10, y: 20, w: 8, h: 10}]}]}];
    d.objs.find(o => o.id === 'o2').planPos = {plan: 'pl1', x: 12, y: 25};
    const save = await fetch('api/state', {method: 'PUT', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(d)});
    if (save.status !== 200) throw new Error('save failed ' + save.status);
  });
  await p.reload(); await p.waitForSelector('#lgUser, #tabsbar');
  if (await p.isVisible('#lgUser')) { await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk'); }
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); });
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render-plans.js')]); __mods[0].st.tab = 'plans'; __mods[1].renderPlans(); });
  await p.waitForSelector('#plCanvas');
  const box = await p.locator('#plCanvas').boundingBox();
  const at = (x, y) => [box.x + box.width * x / 100, box.y + box.height * y / 100];
  // Drag the area from its top rectangle by 10 % across and 5 % down.
  const [sx, sy] = at(20, 15), [ex, ey] = at(30, 20);
  await p.mouse.move(sx, sy); await p.mouse.down(); await p.mouse.move(ex, ey, { steps: 6 }); await p.mouse.up();
  await until(p, async () => { const a = (await import('/js/07-render-plans.js')).planById('pl1').areas[0]; return Math.abs(a.rects[0].x - 20) < 0.3; });
  const plan = await p.evaluate(async () => (await import('/js/07-render-plans.js')).planById('pl1'));
  const area = plan.areas[0];
  assert.deepEqual(area.rects.map(r => [r.x, r.y]), [[20, 15], [20, 25]], 'both rectangles moved together');
  assert.equal(area.x, 20, 'the box of the area moved too');
  const pc = await p.evaluate(async () => (await import('/js/01-core.js')).objs.find(o => o.id === 'o2').planPos);
  assert.deepEqual([pc.x, pc.y], [22, 30], 'the device inside the area moved with it');
  // A device dragged from the list into the area is placed where it is dropped and gets the area's room;
  // dropped outside any area it stays off the plan.
  const drag = async (id, [tx, ty]) => {
    const it = await p.locator(`[data-plitem=${id}]`).boundingBox();
    await p.mouse.move(it.x + 20, it.y + it.height / 2); await p.mouse.down();
    await p.mouse.move(tx, ty, { steps: 8 }); await p.mouse.up();
  };
  await drag('o3', at(80, 80));
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).byId('o3').planPos), undefined, 'outside an area: not placed');
  await drag('o3', at(37, 23));
  await until(p, async () => !!(await import('/js/01-core.js')).byId('o3').planPos);
  const o3 = await p.evaluate(async () => (await import('/js/01-core.js')).byId('o3'));
  assert.deepEqual([o3.planPos.plan, Math.round(o3.planPos.x), Math.round(o3.planPos.y)], ['pl1', 37, 23], 'placed where dropped');
  assert.equal(o3.loc, 'Zürich HQ / Hall', 'the device is in the area\'s room');
  assert.ok(await p.isVisible('[data-pin=o3]'), 'the device shows on the plan');
  // A clicked area takes more rectangles: Add rectangle draws one, Done widens the area to take it.
  const [cx, cy] = at(25, 17);
  await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.up();
  await p.waitForSelector('#plAreaAdd');
  await p.click('#plAreaAdd');
  const [dx0, dy0] = at(60, 60), [dx1, dy1] = at(70, 70);
  await p.mouse.move(dx0, dy0); await p.mouse.down(); await p.mouse.move(dx1, dy1, { steps: 4 }); await p.mouse.up();
  await p.click('#plAreaDone');
  await until(p, async () => (await import('/js/07-render-plans.js')).planById('pl1').areas[0].rects.length === 3);
  const grown = (await p.evaluate(async () => (await import('/js/07-render-plans.js')).planById('pl1').areas[0]));
  assert.ok(grown.w >= 49, 'the area is widened to take the new rectangle: width ' + grown.w);
  assert.deepEqual(errors, [], 'page errors');
  console.log('plan areas: moving an area moves its devices, all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); }
