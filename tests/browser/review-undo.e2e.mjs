/* Undo right after Accept in To review: the page loads the inventory again after an Accept, and an Undo clicked while
   that is under way must not be overwritten by it. The device is back in To review on the page and on the server, and
   the view shows it there without a reload. And any Undo draws the view again. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-review-undo-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const day = new Date().toISOString().slice(0, 10);
const s0 = loadState(db);
saveState(db, { ...s0,
  objs: [
    { id: 'p1', code: 'INV-0001', type: 'pc', name: 'PC-1', serial: 'S1', status: 'active', feed: null },
    { id: 'r8', code: 'INV-0002', type: 'pc', name: 'PC-8', serial: 'S8', status: 'active', feed: null, review: { src: 'lansweeper', at: day + ' 08:00' } },
  ],
  rels: [], history: {} });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const stored = (check, ms = 8000) => storedBy(() => loadState(db), check, ms);
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  await p.click('#tabsbar [data-tab=review]');
  await p.waitForSelector('#cards .card[data-open="r8"]');

  // Accept, then Undo at once: while the page is still loading the inventory again (held back here so the Undo
  // surely lands before the server's copy comes in)
  await p.route('**/api/state', async r => { if (r.request().method() === 'GET') await new Promise(x => setTimeout(x, 1200)); await r.continue(); });
  await p.click('#cards .card[data-open="r8"] [data-rvc="accept"]');
  await p.waitForSelector('#toast .t-undo');
  await p.click('#toast .t-undo');

  // the page shows it back in To review, and stays so once the reload after Accept has come in
  await p.waitForTimeout(2500);
  const where = await p.evaluate(async () => { const c = await import('/js/01-core.js'); return [c.REVIEW.some(o => o.id === 'r8'), c.objs.some(o => o.id === 'r8')]; });
  assert.deepEqual(where, [true, false], 'the device is back in To review on the page');
  await until(p, () => !!document.querySelector('#cards .card[data-open="r8"] [data-rvc="accept"]'), 4000);
  // and on the server
  await stored(s => { const o = s.objs.find(x => x.id === 'r8'); return o && o.review && !o.review.ignored; });

  // any Undo draws the view again, also one whose own step only puts the data back
  await p.unroute('**/api/state');
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.toastUndo('Renamed', () => { c.REVIEW.find(o => o.id === 'r8').name = 'PC-8 again'; }); });
  await p.click('#toast .t-undo');
  await until(p, () => /PC-8 again/.test(document.querySelector('#cards .card[data-open="r8"]')?.textContent || ''), 4000);
  assert.deepEqual(errors, [], 'page errors');
  console.log('review undo: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
