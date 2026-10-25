/* Ports on a device whose type usually has none: hidden until it has ports, added from More, hidden again at 0.
   A switch always shows them. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-ports-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
saveState(db, { ...loadState(db), objs: [
  { id: 'p1', code: 'INV-1', type: 'printer', name: 'PRN-1', status: 'active', loc: '', ovr: {}, feed: null },
  { id: 's1', code: 'INV-2', type: 'switch', name: 'SW-1', status: 'active', loc: '', ports: 24, sfp: 4, ovr: {}, feed: null },
], rels: [], history: {} });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const open = id => page.evaluate(async id => (await import('/js/02-views.js')).openObj(id), id);
try {
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForSelector('.card');
  await open('p1'); await page.waitForSelector('.obj .form');
  assert.equal(await page.locator('[data-k=ports]').count(), 0, 'a printer without ports shows no port fields');
  await page.click('details.menu summary'); await page.click('#addPortsBtn');
  await page.waitForSelector('[data-k=ports]');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.k), 'ports', 'the cursor is in Ports');
  await page.fill('[data-k=ports]', '2'); await page.locator('[data-k=ports]').press('Tab');
  await page.waitForFunction(async () => (await import('/js/01-core.js')).byId('p1').ports === 2);
  await open('s1'); await open('p1'); await page.waitForSelector('[data-k=ports]');
  await page.click('details.menu summary');
  assert.equal(await page.locator('#addPortsBtn').count(), 0, 'a device with ports is not offered them again');
  await page.keyboard.press('Escape');
  await page.fill('[data-k=ports]', '0'); await page.locator('[data-k=ports]').press('Tab');
  await page.waitForFunction(async () => (await import('/js/01-core.js')).byId('p1').ports === 0);
  await open('s1'); await open('p1'); await page.waitForSelector('.obj .form');
  assert.equal(await page.locator('[data-k=ports]').count(), 0, 'back at 0 the fields are hidden again');
  await open('s1'); await page.waitForSelector('[data-k=ports]');
  await page.click('details.menu summary');
  assert.equal(await page.locator('#addPortsBtn').count(), 0, 'a switch has its ports anyway');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('optional ports: all checks passed');
} finally { await browser.close(); server.close(); }
