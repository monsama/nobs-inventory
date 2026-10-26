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
  // sorting a column draws every row first, so the sort sees them all
  await page.locator('table.grid thead th', { hasText: 'Name' }).first().click();
  await page.locator('table.grid thead th', { hasText: 'Name' }).first().click();
  assert.equal(await page.locator('table.grid tbody tr').count(), N);
  assert.equal(await page.locator('table.grid tbody tr .rowopen').first().textContent(), 'PC-0799', 'sorted the other way over every row');

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
