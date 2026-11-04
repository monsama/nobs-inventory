/* Browser test of the floor plan tools: Undo after moving an area, taking one rectangle of an area away, the arrow
   keys on the chosen area (Shift: its size), duplicating an area, texts on the plan (add, drag, change, remove),
   showing one type of device, Fit and panning a zoomed plan, and printing it with a list of the devices by area. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { seedBasics } from '../helpers.js';
import { storedBy, until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-pltools-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const s = loadState(db);
const room = s.objs[0].loc;
s.plans = [{ id: 'pl1', name: 'EG', site: room.split(' / ')[0], areas: [
  { id: 'ar1', name: 'Office', room, x: 10, y: 10, w: 20, h: 20, rects: [{ x: 10, y: 10, w: 20, h: 20 }] },
  { id: 'ar2', name: 'Hall', x: 50, y: 50, w: 30, h: 30, rects: [{ x: 50, y: 50, w: 15, h: 30 }, { x: 65, y: 50, w: 15, h: 15 }] }] }];
saveState(db, s);
const types = [...new Set(s.objs.filter(o => o.loc === room).map(o => o.type))];
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const plan = () => loadState(db).plans[0];
const area = id => plan().areas.find(a => a.id === id);
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => !!(await import('/js/01-core.js')).st.meId);
  await p.click('[data-tab=plans]'); await p.waitForSelector('#plCanvas');
  const box = async () => p.locator('#plCanvas').boundingBox();
  let cb = await box();
  const at = (x, y) => [cb.x + cb.width * x / 100, cb.y + cb.height * y / 100];

  // 1. moving an area by dragging it has Undo
  await p.mouse.move(...at(20, 15)); await p.mouse.down(); await p.mouse.move(...at(25, 15), { steps: 5 }); await p.mouse.up();
  await storedBy(() => area('ar1'), a => a.x > 13);
  await p.click('#toast .t-undo');
  await storedBy(() => area('ar1'), a => a.x === 10 && a.rects[0].x === 10);

  // 2. one rectangle of an area of several taken away (an area of one has no ×), with Undo
  await p.mouse.click(...at(20, 15)); await p.waitForSelector('[data-rh]');
  assert.equal(await p.locator('[data-rx]').count(), 0, 'an area of one rectangle offers to remove it');
  await p.mouse.click(...at(55, 70)); await p.waitForSelector('[data-rx="1"]');
  await p.click('[data-rx="1"]');
  await storedBy(() => area('ar2'), a => a.rects.length === 1 && a.w === 15);
  await p.click('#toast .t-undo');
  await storedBy(() => area('ar2'), a => a.rects.length === 2 && a.w === 30);

  // 3. arrow keys move the chosen area by 1%, Shift + arrow makes it bigger; one Undo for the steps
  await p.mouse.click(...at(20, 15)); await p.waitForSelector('[data-rh]');
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowDown');
  await storedBy(() => area('ar1'), a => a.x === 12 && a.y === 11);
  await p.keyboard.press('Shift+ArrowRight');
  await storedBy(() => area('ar1'), a => a.w === 21);
  await p.click('#toast .t-undo');
  await storedBy(() => area('ar1'), a => a.x === 10 && a.y === 10 && a.w === 20);

  // 8. Duplicate: a copy beside it, chosen, with its own name; Undo takes it away
  await p.mouse.click(...at(20, 15)); await p.waitForSelector('#plAreaMenu');
  await p.click('#plAreaMenu .menu-btn'); await p.click('#plAreaDup');
  await storedBy(plan, pl => pl.areas.length === 3 && pl.areas[2].name === 'Office 2' && pl.areas[2].x === 13 && pl.areas[2].w === 20 && !pl.areas[2].room);
  await p.waitForSelector('#plAreaMenu .menu-btn:has-text("Office 2")');
  await p.click('#toast .t-undo');
  await storedBy(plan, pl => pl.areas.length === 2);

  // 7. a text: added where clicked, dragged, changed, removed
  await p.keyboard.press('Escape');
  await p.click('#plText'); await p.mouse.click(...at(40, 5));
  await p.waitForSelector('#lbText'); await p.fill('#lbText', 'Entrance'); await p.click('#lbOk');
  await storedBy(plan, pl => (pl.labels || []).length === 1 && pl.labels[0].text === 'Entrance' && Math.abs(pl.labels[0].x - 40) < 1);
  await p.waitForSelector('.pl-label:has-text("Entrance")');
  const lb = await p.locator('.pl-label').boundingBox();
  await p.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2); await p.mouse.down(); await p.mouse.move(...at(45, 8), { steps: 5 }); await p.mouse.up();
  await storedBy(plan, pl => Math.abs(pl.labels[0].x - 45) < 1.5);
  await p.click('.pl-label'); await p.waitForSelector('#lbText');
  await p.fill('#lbText', 'Main entrance'); await p.click('#lbOk');
  await storedBy(plan, pl => pl.labels[0].text === 'Main entrance');
  await p.click('.pl-label'); await p.waitForSelector('#lbDel'); await p.click('#lbDel');
  await storedBy(plan, pl => !(pl.labels || []).length);
  await p.click('#toast .t-undo');
  await storedBy(plan, pl => (pl.labels || []).length === 1);

  // 6. Show one type: only its pins are on the plan
  if (types.length > 1) {
    await p.selectOption('#plShow', types[0]);
    await until(p, t => [...document.querySelectorAll('#plCanvas .pl-pin')].length > 0, types[0]);
    const shown = await p.evaluate(async () => { const c = await import('/js/01-core.js'); return [...document.querySelectorAll('#plCanvas .pl-pin')].map(el => c.byId(el.dataset.pin).type); });
    assert.ok(shown.every(t => t === types[0]), 'other types are shown: ' + shown.join(','));
    await p.selectOption('#plShow', '');
  }

  // 5. Fit, and a zoomed plan panned with the middle button
  await p.click('#plZoomIn'); await p.click('#plZoomIn'); await p.click('#plZoomIn');
  const st0 = await p.evaluate(() => [document.querySelector('#plStage').scrollLeft, document.querySelector('#plStage').scrollTop]);
  const sb = await p.locator('#plStage').boundingBox();
  await p.mouse.move(sb.x + 300, sb.y + 200); await p.mouse.down({ button: 'middle' }); await p.mouse.move(sb.x + 200, sb.y + 150, { steps: 4 }); await p.mouse.up({ button: 'middle' });
  const st1 = await p.evaluate(() => [document.querySelector('#plStage').scrollLeft, document.querySelector('#plStage').scrollTop]);
  assert.ok(st1[0] - st0[0] > 50, 'the middle button did not pan the plan: ' + st0 + ' → ' + st1);
  await p.click('#plZoomFit');
  const fit = await p.evaluate(() => { const s = document.querySelector('#plStage'), c = document.querySelector('#plCanvas').getBoundingClientRect(); return [c.width <= s.clientWidth + 1, c.height <= s.clientHeight + 1]; });
  assert.deepEqual(fit, [true, true], 'Fit does not show the whole plan');

  // 4. Print: a window with the plan, the text and the devices by area
  const [win] = await Promise.all([p.waitForEvent('popup'), (async () => { await p.click('#plMenu .menu-btn'); await p.click('#plPrint'); })()]);
  await win.waitForLoadState();
  const doc = await win.content();
  assert.match(doc, /<h2[^>]*>EG/, 'the plan name is missing');
  assert.match(doc, /Main entrance/, 'the text is missing');
  assert.match(doc, /Office \(\d+\)/, 'the devices of the area are not listed');
  assert.equal(await win.locator('.pl-pin').count() > 0, true, 'no pins in the print');
  assert.equal(await win.locator('[data-rh], .pl-unpin:visible').count(), 0, 'edit handles in the print');
  await win.close();
  assert.deepEqual(errors, [], 'page errors');
  console.log('plans tools: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
