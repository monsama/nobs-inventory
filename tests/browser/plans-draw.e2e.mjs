/* A plan without a picture still lists the devices and lets an area be drawn on it. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { until } from './until.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-plan-'));
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
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  await p.evaluate(async (png) => {
    const put = await fetch('api/state', {credentials:'same-origin'}); const d = await put.json();
    d.plans = [{id:'pl1', name:'EG', site:'Zürich HQ', areas:[]}];
    const save = await fetch('api/state', {method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify(d)});
    const img = {status: 0};
    return [save.status, img.status];
  }, png);
  await p.reload(); await p.waitForSelector('#lgUser, #tabsbar');
  if (await p.isVisible('#lgUser')) { await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk'); }
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); });
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render.js')]); __mods[0].st.tab = 'plans'; __mods[1].render(); });
  await p.waitForSelector('#plList');
  // the list beside the plan folds away and comes back (an admin starts with it shown)
  assert.equal(await p.getAttribute('#plSideBtn', 'aria-pressed'), 'true');
  await p.click('#plSideBtn'); await p.waitForSelector('#plList', { state: 'hidden' });
  await p.click('#plSideBtn'); await p.waitForSelector('#plList');
  assert.equal(await p.locator('#plList .pl-item').count(), 7, 'the devices not on the plan are not listed');
  await p.click('#plArea');
  const box = await p.locator('#plCanvas').boundingBox();
  assert.ok(box.height >= 300, 'a plan without a picture has no room to draw on: ' + box.height);
  await p.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 6 });
  await p.mouse.up();
  await p.click('#plAreaDone');
  await p.waitForTimeout(300);
  assert.equal(await p.isVisible('#arName'), true, 'the area dialog did not open after Done');
  assert.equal(await p.evaluate(() => document.querySelector('#toolbar').textContent.trim()), '', 'the toolbar of another tab is still shown on the plans');
  // The area dialog offers the rooms of the plan's site: picking one gives the area that room.
  const rooms = await p.$$eval('#arRoom option', os => os.map(o => o.textContent.trim()));
  assert.ok(rooms.includes('Büro 2.OG'), 'the existing room is not offered: ' + rooms.join(' | '));
  await p.selectOption('#arRoom', 'Zürich HQ / Büro 2.OG');
  assert.equal(await p.inputValue('#arName'), 'Büro 2.OG', 'the area is not named after the room');
  // a colour picked in the dialog is kept and drawn
  await p.click('.ar-sw.ac-green');
  await p.click('#arOk');
  await until(p, async () => (await import('/js/20-plans.js')).planById('pl1').areas.some(a => a.room === 'Zürich HQ / Büro 2.OG' && a.color === 'green'));
  assert.equal(await p.locator('svg.pl-area.ac-green').count(), 1, 'the area is not drawn in its colour');

  // a second area drawn a few pixels off the first one's corner snaps onto its edges: the rooms sit flush
  await p.click('#plArea');
  const b2 = await p.locator('#plCanvas').boundingBox();
  await p.mouse.move(b2.x + b2.width * 0.5 + 4, b2.y + b2.height * 0.2 - 3);
  await p.mouse.down();
  await p.mouse.move(b2.x + b2.width * 0.8, b2.y + b2.height * 0.5 + 5, { steps: 6 });
  assert.ok(await p.locator('.pl-guide').count() >= 1, 'no guide line shows where it snaps');
  await p.mouse.up();
  assert.equal(await p.locator('.pl-guide').count(), 0, 'the guide lines stay after the pointer is up');
  const [first, drawn] = await p.evaluate(async () => { const m = await import('/js/20-plans.js'); return [m.planById('pl1').areas[0].rects?.[0] || m.planById('pl1').areas[0], m.planParts[0]]; });
  assert.ok(Math.abs(drawn.x - (first.x + first.w)) < 0.01, `the left edge did not snap to the first area's right edge: ${drawn.x} vs ${first.x + first.w}`);
  assert.ok(Math.abs(drawn.y - first.y) < 0.01, `the top edge did not snap to the first area's top: ${drawn.y} vs ${first.y}`);
  assert.ok(Math.abs(drawn.y + drawn.h - (first.y + first.h)) < 0.01, 'the bottom edge did not snap to the first area\'s bottom');
  // flush against an area is a room of its own (rooms share walls): a new area, with adding to that one a choice away
  await p.click('#plAreaDone'); await p.waitForSelector('#arTo');
  const firstId = await p.evaluate(async () => (await import('/js/20-plans.js')).planById('pl1').areas[0].id);
  assert.equal(await p.inputValue('#arTo'), '', 'a flush rectangle is offered as a new area');
  await p.selectOption('#arTo', firstId);
  assert.equal(await p.isVisible('#arName'), false, 'no name to give when adding to an area');
  assert.match(await p.textContent('#arOk'), /^Add to Büro 2\.OG$/);
  await p.click('#arOk');
  await until(p, async () => { const pl = (await import('/js/20-plans.js')).planById('pl1'); return pl.areas.length === 1 && pl.areas[0].rects.length === 2; });
  // drawn over an area, it grows that area at once, as overlapping rectangles make one shape; with Undo
  await p.click('#plArea');
  const bo = await p.locator('#plCanvas').boundingBox();
  await p.mouse.move(bo.x + bo.width * 0.3, bo.y + bo.height * 0.4); await p.mouse.down();
  await p.mouse.move(bo.x + bo.width * 0.45, bo.y + bo.height * 0.66, { steps: 4 }); await p.mouse.up();
  assert.equal((await p.textContent('#plAreaDone')).trim(), 'Done: add to Büro 2.OG');
  await p.click('#plAreaDone');
  await until(p, async () => { const pl = (await import('/js/20-plans.js')).planById('pl1'); return pl.areas.length === 1 && pl.areas[0].rects.length === 3; });
  assert.equal(await p.locator('#arTo').count(), 0, 'no dialog for a drawing over one area');
  await p.click('#toast .t-undo');
  await until(p, async () => (await import('/js/20-plans.js')).planById('pl1').areas[0].rects.length === 2);
  // a new area is still one choice away
  await p.click('#plArea');
  const b3 = await p.locator('#plCanvas').boundingBox();
  await p.mouse.move(b3.x + b3.width * 0.82, b3.y + b3.height * 0.7); await p.mouse.down();
  await p.mouse.move(b3.x + b3.width * 0.95, b3.y + b3.height * 0.9, { steps: 4 }); await p.mouse.up();
  await p.click('#plAreaDone'); await p.waitForSelector('#arTo');
  assert.equal(await p.inputValue('#arTo'), '', 'an area away from the others starts as a new one');
  assert.equal(await p.isVisible('#arName'), true);
  // the parts that touch carry one name; a part apart from them carries the name too, without the count and ×
  assert.equal(await p.locator(`[data-area-tag="${firstId}"]`).count(), 1, 'two touching rectangles are one part');
  await p.selectOption('#arTo', firstId); await p.click('#arOk');
  await until(p, async () => (await import('/js/20-plans.js')).planById('pl1').areas[0].rects.length === 3);
  await p.waitForSelector(`[data-area-tag="${firstId}"].pl-area-more`);
  assert.equal(await p.locator(`[data-area-tag="${firstId}"]`).count(), 2);
  assert.equal((await p.textContent(`[data-area-tag="${firstId}"].pl-area-more`)).trim(), 'Büro 2.OG');
  assert.equal(await p.locator(`[data-area-tag="${firstId}"].pl-area-more .pl-x`).count(), 0, 'the area is removed from its first name only');
  const more = await p.locator(`[data-area-tag="${firstId}"].pl-area-more`).boundingBox(), cv = await p.locator('#plCanvas').boundingBox();
  assert.ok(more.x > cv.x + cv.width * 0.8 && more.y > cv.y + cv.height * 0.65, 'the name is not on the part apart');
  assert.deepEqual(errors, [], 'page errors');
  console.log('plans: drawing an area works without a picture: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir,{recursive:true,force:true}); }
