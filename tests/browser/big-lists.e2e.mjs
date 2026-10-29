/* Browser test of a big inventory: cards and table rows are drawn in part with a way to show all; sorting a column
   draws every row first; an unchanged inventory is answered 304 to the page's poll. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-big-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const N = 800;
saveState(db, { ...loadState(db), objs: Array.from({ length: N }, (_, i) => ({ id: 'o' + i, code: 'INV-' + String(i).padStart(4, '0'), type: 'pc', name: 'PC-' + String(i).padStart(4, '0'), status: 'active', ovr: {}, feed: null })), seq: N + 100, codeN: N });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none in previews */ } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForSelector('.card');
  assert.equal(await page.locator('.card').count(), 500, 'the first 500 cards');
  await page.click('#cardsAll');
  assert.equal(await page.locator('.card').count(), N);

  await page.click('[data-tab=table]'); await page.waitForSelector('table.grid');
  assert.equal(await page.locator('table.grid tbody tr').count(), 500, 'the first 500 rows');
  assert.ok(await page.isVisible('#tableAll'));
  // sorting and filtering a column work on every device, also those not drawn; still only the first 500 are drawn
  await page.locator('table.grid thead th', { hasText: 'Name' }).first().click();
  await page.locator('table.grid thead th', { hasText: 'Name' }).first().click();
  assert.equal(await page.locator('table.grid tbody tr').count(), 500);
  assert.equal(await page.locator('table.grid tbody tr .rowopen').first().textContent(), 'PC-0799', 'sorted the other way over every row');
  const nameFilter = page.locator('table.grid tr.fr th').nth(2).locator('input');
  await nameFilter.fill('PC-07');
  assert.equal(await page.locator('table.grid tbody tr').count(), 100, 'the filter sees every device');
  assert.equal(await page.evaluate(() => document.activeElement.placeholder), 'filter', 'the cursor stays in the filter box');
  assert.equal(await page.inputValue('table.grid tr.fr th:nth-child(3) input'), 'PC-07');
  await nameFilter.fill('');

  // select all takes every device the filters leave, also those not drawn
  await page.locator('table.grid tr.fr th').nth(2).locator('input').fill('PC-0');
  await page.check('#selAll');
  assert.equal(await page.evaluate(async () => (await import('/js/01-core.js')).st.bulk.size), N, 'all 800, not the 500 drawn');
  await page.click('#bkClear');
  await page.locator('table.grid tr.fr th').nth(2).locator('input').fill('');

  // sorting from the keyboard keeps the cursor on the header
  const sortTh = page.locator('table.grid thead tr:first-child th', { hasText: 'Name' }).first();
  await sortTh.focus(); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.tagName + ' ' + document.activeElement.textContent.trim()), 'TH Name');

  // with columns moved, typing goes on in the same filter box
  await page.evaluate(async () => {
    const t = await import('/js/06-topbar.js'), r = await import('/js/07-render.js');
    const s = t.TBL['view:table:0']; const n = s.order.length; s.order = [0, 2, 1, ...[...Array(n).keys()].slice(3)]; s.filters = {}; s.sort = null; t.saveTBL(); r.view();
  });
  const box = page.locator('table.grid tr.fr input[data-fci="2"]');
  await box.click(); await page.keyboard.type('PC-07');
  assert.deepEqual(await page.evaluate(async () => (await import('/js/06-topbar.js')).TBL['view:table:0'].filters), { 2: 'PC-07' });
  assert.equal(await page.locator('table.grid tbody tr').count(), 100);

  // the poll: nothing changed, so the server answers 304 without the inventory
  const status = await page.evaluate(async () => {
    const r1 = await fetch('api/state', { credentials: 'same-origin', cache: 'no-store' });
    const r2 = await fetch('api/state', { credentials: 'same-origin', cache: 'no-store', headers: { 'If-None-Match': r1.headers.get('etag') } });
    return [r1.status, r2.status];
  });
  assert.deepEqual(status, [200, 304]);

  assert.deepEqual(errors, []);
  console.log('big lists: all checks passed');
} finally { await browser.close(); server.close(); }
