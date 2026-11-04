/* Browser test of changing the size of an area on a floor plan: a click on the area chooses it and shows its handles;
   dragging the bottom-right corner makes it bigger, an edge snaps onto a neighbour's, it never gets smaller than 2% or
   leaves the plan; the change is saved and Undo takes it back. Esc and a click beside it let the area go. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { seedBasics } from '../helpers.js';
import { storedBy, until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-plresize-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const s = loadState(db);
s.plans = [{ id: 'pl1', name: 'EG', site: 'Zürich HQ', areas: [
  { id: 'ar1', name: 'Hall', x: 10, y: 10, w: 20, h: 20, rects: [{ x: 10, y: 10, w: 20, h: 20 }] },
  { id: 'ar2', name: 'Lager', x: 50, y: 10, w: 20, h: 20, rects: [{ x: 50, y: 10, w: 20, h: 20 }] }] }];
saveState(db, s);
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const hall = () => loadState(db).plans[0].areas.find(a => a.id === 'ar1');
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => !!(await import('/js/01-core.js')).st.meId);
  await p.click('[data-tab=plans]'); await p.waitForSelector('#plCanvas');
  const cb = await p.locator('#plCanvas').boundingBox();
  const at = (x, y) => [cb.x + cb.width * x / 100, cb.y + cb.height * y / 100];

  // no handles until the area is chosen; a click on it chooses it
  assert.equal(await p.locator('[data-rh]').count(), 0, 'handles before the area is chosen');
  await p.mouse.click(...at(20, 20)); await p.waitForSelector('[data-rh="0:se"]');
  assert.equal(await p.locator('[data-rh]').count(), 8, 'a corner and a side handle each');

  // the bottom-right corner dragged out to 40,45: bigger, saved
  const h = await p.locator('[data-rh="0:se"]').boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down();
  await p.mouse.move(...at(40, 45), { steps: 6 }); await p.mouse.up();
  await storedBy(hall, a => Math.abs(a.w - 30) < 0.6 && Math.abs(a.h - 35) < 0.6 && a.x === 10 && a.y === 10);
  const r0 = hall().rects[0];
  assert.ok(Math.abs(r0.w - 30) < 0.6 && Math.abs(r0.h - 35) < 0.6, 'the rectangle has the new size: ' + JSON.stringify(r0));

  // the right side dragged close to Lager's left edge (50) lands on it
  const e1 = await p.locator('[data-rh="0:e"]').boundingBox();
  await p.mouse.move(e1.x + e1.width / 2, e1.y + e1.height / 2); await p.mouse.down();
  await p.mouse.move(cb.x + cb.width * 0.5 - 4, e1.y + e1.height / 2, { steps: 6 }); await p.mouse.up();
  await storedBy(hall, a => a.rects[0].x + a.rects[0].w === 50);

  // Undo puts the last size back
  await p.click('#toast .t-undo');
  await storedBy(hall, a => Math.abs(a.rects[0].w - 30) < 0.6);

  // dragged past its other side: it keeps 2%, and it stays on the plan
  const w1 = await p.locator('[data-rh="0:w"]').boundingBox();
  await p.mouse.move(w1.x + w1.width / 2, w1.y + w1.height / 2); await p.mouse.down();
  await p.mouse.move(cb.x + cb.width * 0.9, w1.y + w1.height / 2, { steps: 6 }); await p.mouse.up();
  await storedBy(hall, a => Math.abs(a.rects[0].w - 2) < 0.2);
  const n1 = await p.locator('[data-rh="0:n"]').boundingBox();
  await p.mouse.move(n1.x + n1.width / 2, n1.y + n1.height / 2); await p.mouse.down();
  await p.mouse.move(n1.x + n1.width / 2, cb.y - 60, { steps: 6 }); await p.mouse.up();
  await storedBy(hall, a => a.rects[0].y === 0);

  // Esc lets the area go; so does a click beside it
  await p.keyboard.press('Escape'); await until(p, () => !document.querySelector('[data-rh]'));
  await p.mouse.click(...at(60, 20)); await p.waitForSelector('[data-rh]');
  await p.mouse.click(...at(90, 90)); await until(p, () => !document.querySelector('[data-rh]'));
  assert.deepEqual(errors, [], 'page errors');
  console.log('plans resize: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
