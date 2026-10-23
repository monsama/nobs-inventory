/* Browser test of Settings on a fresh server: every tab draws, and the admin can clear the inventory. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-settings-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const app = createApp({ db });
const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await context.addInitScript(() => localStorage.setItem('ni-started', '1'));
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForFunction(() => /Admin/.test(document.querySelector('#whoBtn').textContent));
  await page.click('#setBtn');
  for (const tab of ['feed', 'locations', 'types', 'users', 'maintenance', 'log', 'about']) {
    await page.click(`#setTabs [data-st=${tab}]`); await page.waitForTimeout(120);
    const len = (await page.locator('#setPane').innerHTML()).length;
    assert.ok(len > 100, `Settings tab "${tab}" is empty`);
  }
  assert.equal(errors.length, 0, 'no page errors: ' + errors.join('; '));
  // push token: created in the app, shown once, a download is offered
  await page.click('#setTabs [data-st=feed]'); await page.waitForSelector('#pushNew:not([disabled])');
  await page.click('#pushNew'); await page.waitForSelector('#pushTok');
  assert.ok((await page.inputValue('#pushTok')).length >= 30, 'a token is shown after creating it');
  assert.equal(await page.isDisabled('#pushScript'), false, 'the script can be downloaded once a token exists');
  // clear the inventory: two clicks, devices gone, admin and settings kept
  saveState(db, { ...loadState(db), objs: [{ id: 'o1', code: 'INV-0001', type: 'pc', name: 'PC-X', ovr: {}, feed: null }], rels: [], history: {} });
  await page.click('#setTabs [data-st=feed]');
  await page.click('#setReset'); await page.waitForSelector('#clrOk');
  await page.fill('#clrWord', 'clear'); assert.equal(await page.isDisabled('#clrOk'), true, 'lower case confirms');
  await page.fill('#clrWord', 'CLEAR'); await page.click('#clrOk'); await page.waitForTimeout(400);
  assert.equal(loadState(db).objs.length, 0, 'devices are cleared on the server');
  assert.ok(loadState(db).users.some(u => u.role === 'admin'), 'the admin stays');
  console.log('browser settings: all checks passed');
} finally {
  await browser.close(); await new Promise(r => server.close(r)); db.close();
}
