/* Browser test of the empty start and the demo: no sample data before sign-in, a fresh server starts empty,
   About shows the version and licence, and the demo is loaded only when a browser asks for it. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const SAMPLE_DEVICE = 'SRV-ZH-HV01';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-demo-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const app = createApp({ db });
const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
/* Opens each Settings tab and checks it draws. */
const walkSettings = async (p) => {
  await p.waitForSelector('#setTabs');
  for (const tab of ['feed', 'locations', 'types', 'users', 'ldap', 'policy', 'about']) {
    await p.click(`#setTabs [data-st=${tab}]`); await p.waitForTimeout(120);
    assert.ok((await p.locator('#setPane').innerHTML()).length > 50, `Settings tab "${tab}" is empty`);
  }
};
const newPage = async (ctx) => { const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); return p; };
try {
  // 1. A server: the sign-in screen shows no inventory, and a fresh server starts empty.
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await newPage(ctx);
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  assert.ok(!(await page.textContent('body')).includes(SAMPLE_DEVICE), 'sample data is visible before sign-in');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForSelector('#wEmpty');
  assert.equal(await page.locator('#wDemo').count(), 0, 'the server offers no demo');
  await page.click('#wEmpty');
  await page.waitForTimeout(200);
  assert.ok(!(await page.textContent('#view')).includes(SAMPLE_DEVICE), 'a fresh server shows sample devices');

  // 2. About: the version from the server and the licence text.
  await page.click('#setBtn'); await page.click('#setTabs [data-st=about]');
  await page.waitForSelector('#setAbout:has-text("Version")');
  const about = await page.textContent('#setAbout');
  assert.match(about, /Version 0\.2\.5/, 'About shows the version');
  assert.match(about, /GNU General Public License version 3/, 'About shows the licence');
  assert.match(about, /Copyright © 2026 Viktor Ljuca/);
  await page.click('#setClose');
  assert.match(await page.textContent('#verFoot'), /NOBS Inventory 0\.2\.5/, 'the footer shows the version');

  // 3. Without a server (the page opened as a file) the demo is loaded only on request.
  const file = 'file://' + path.join(fileURLToPath(new URL('../../public/index.html', import.meta.url)));
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const local = await newPage(ctx2);
  await local.goto(file); await local.waitForSelector('#wEmpty');
  assert.equal(await local.evaluate(() => typeof window.NI_DEMO), 'undefined', 'the demo is loaded before it is asked for');
  assert.ok(!(await local.textContent('body')).includes(SAMPLE_DEVICE), 'sample data is visible before the demo is loaded');
  await local.click('#wDemo');
  await local.waitForFunction(() => typeof window.NI_DEMO === 'function');
  await local.waitForSelector(`text=${SAMPLE_DEVICE}`);
  assert.ok((await local.textContent('body')).includes(SAMPLE_DEVICE), 'the demo did not show its devices');
  await local.waitForFunction(() => !document.querySelector('#mdl'));   /* the welcome dialog closes once the demo is in */
  await local.click('#setBtn');
  await walkSettings(local);
  await local.click('#setClose');
  for (const tab of ['net', 'rack', 'map', 'table']) { await local.click(`#tabsbar [data-tab=${tab}]`); await local.waitForTimeout(100); }
  await ctx2.close();

  // 4. The empty browser start: every Settings tab and the switch and rack views draw without an error.
  const ctx3 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const empty = await newPage(ctx3);
  await empty.goto(file); await empty.waitForSelector('#wEmpty');
  await empty.click('#wEmpty');
  await empty.click('#setBtn');
  await walkSettings(empty);
  await empty.click('#setClose');
  for (const tab of ['net', 'rack', 'map']) { await empty.click(`#tabsbar [data-tab=${tab}]`); await empty.waitForTimeout(100); }
  await ctx3.close();

  assert.deepEqual(errors, [], 'page errors');
  console.log('browser demo and empty start: all checks passed');
} finally {
  await browser.close(); await new Promise(r => server.close(r)); db.close();
}
