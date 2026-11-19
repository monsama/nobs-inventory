/* Browser test of the filters beside the list (wider than a phone): no Filters button in the bar; their edge is dragged to
   change the width (kept in this browser); dragged to the left edge they fold away into a thin strip, which shows the
   filters in force and opens them again by a click or a drag; the edge works by keyboard too. A phone keeps the drawer. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-side-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
saveState(db, { ...loadState(db), objs: [{ id: 'a', code: 'INV-a', type: 'pc', name: 'PC-a', status: 'active', ovr: {} }], rels: [], history: {} });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await p.waitForSelector('#cards .lrow');
  const sideW = () => p.evaluate(() => { const s = document.querySelector('#side'); return s.offsetParent ? Math.round(s.getBoundingClientRect().width) : 0; });
  const grip = async () => { const b = await p.locator('#sideGrip').boundingBox(); return { x: b.x + b.width / 2, y: b.y + 200 }; };

  // open by default on a wide screen; no Filters button in the bar
  assert.equal(await p.isVisible('#sideBtn'), false, 'no Filters button');
  assert.equal(await sideW(), 250);
  // drag the edge wider: the width follows and is kept
  let g = await grip();
  await p.mouse.move(g.x, g.y); await p.mouse.down(); await p.mouse.move(g.x + 60, g.y, { steps: 5 }); await p.mouse.up();
  assert.ok(Math.abs(await sideW() - 310) <= 4, `wider (${await sideW()})`);
  assert.ok(Math.abs(Number(await p.evaluate(() => localStorage.getItem('ni-side-w'))) - 310) <= 4);
  // drag it to the left edge: it folds away, the strip shows; the width before is kept
  g = await grip();
  await p.mouse.move(g.x, g.y); await p.mouse.down(); await p.mouse.move(30, g.y, { steps: 8 }); await p.mouse.up();
  await until(p, () => document.body.classList.contains('side-shut'));
  assert.equal(await sideW(), 0);
  assert.equal(await p.isVisible('#sideRail'), true);
  // the strip shows how many filters are in force
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.type = 'pc'; (await import('/js/07-render.js')).view(); });
  assert.equal(await p.textContent('#sideRailN'), '1');
  assert.match(await p.getAttribute('#sideRail', 'aria-label'), /1 in force/);
  // a click on the strip opens them as wide as before
  await p.click('#sideRail');
  await until(p, () => !document.body.classList.contains('side-shut'));
  assert.ok(Math.abs(await sideW() - 310) <= 4, 'as wide as before');
  // Hide folds them away; dragging the strip out opens them, as wide as dragged
  await p.click('#sidePin'); await until(p, () => document.body.classList.contains('side-shut'));
  const r = await p.locator('#sideRail').boundingBox();
  await p.mouse.move(r.x + 5, r.y + 100); await p.mouse.down(); await p.mouse.move(r.x + 220, r.y + 100, { steps: 8 }); await p.mouse.up();
  await until(p, () => !document.body.classList.contains('side-shut'));
  assert.ok(Math.abs(await sideW() - 220) <= 8, `dragged out (${await sideW()})`);
  // by keyboard: → wider, Enter folds away and opens again
  await p.focus('#sideGrip'); const w0 = await sideW();
  await p.keyboard.press('ArrowRight'); assert.equal(await sideW(), w0 + 20);
  await p.keyboard.press('Enter'); await until(p, () => document.body.classList.contains('side-shut'));
  await p.focus('#sideRail'); await p.keyboard.press('Enter'); await until(p, () => !document.body.classList.contains('side-shut'));
  // kept after a reload
  await p.reload(); await p.waitForSelector('#cards .lrow');
  assert.equal(await sideW(), w0 + 20);

  // a phone keeps the Filters button and the drawer
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const m = await phone.newPage(); m.on('pageerror', e => errors.push(e.message));
  await m.goto(`http://127.0.0.1:${server.address().port}/`); await m.waitForSelector('#lgUser');
  await m.fill('#lgUser', 'admin'); await m.fill('#lgPw', 'adminpass123'); await m.click('#lgOk');
  await m.waitForSelector('#cards .lrow');
  assert.equal(await m.isVisible('#sideBtn'), true);
  assert.equal(await m.isVisible('#sideRail'), false);
  assert.equal(await m.isVisible('#sideGrip'), false);
  await phone.close();

  assert.deepEqual(errors, [], 'page errors');
  console.log('filters beside the list: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
