/* Open objects have a row of their own under the views: hidden while none is open, a tab per object with its full name
   as tooltip, a click opens it, × closes it, Close all closes them all. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-objbar-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 800 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  await p.waitForSelector('#tabsbar [data-tab=cards]');
  assert.equal(await p.isHidden('#objbar'), true, 'no row while nothing is open');
  assert.equal(await p.locator('#tabsbar .objtab').count(), 0, 'the views row holds only views');

  await p.click('.card[data-open=o1]');
  await p.waitForSelector('#objbar [data-tab=o1]');
  assert.equal(await p.isVisible('#objbar'), true);
  assert.equal(await p.locator('#closeAllTabs').count(), 0, 'Close all only with two or more open');
  const name = await p.evaluate(async () => (await import('/js/01-core.js')).byId('o1').name);
  assert.equal(await p.getAttribute('#objbar [data-tab=o1] .mono', 'title'), name, 'the full name as tooltip');

  await p.click('#tabsbar [data-tab=cards]'); await p.click('.card[data-open=o2]');
  await p.waitForSelector('#objbar [data-tab=o2].active');
  // a click on an open object's tab shows it; × closes it
  await p.click('#objbar [data-tab=o1]');
  await until(p, async () => (await import('/js/01-core.js')).st.tab === 'o1');
  await p.click('#objbar [data-close=o2]');
  await until(p, async () => !(await import('/js/01-core.js')).st.open.includes('o2'));
  // Close all
  await p.click('#tabsbar [data-tab=cards]'); await p.click('.card[data-open=o3]');
  await p.waitForSelector('#closeAllTabs');
  await p.click('#closeAllTabs');
  await until(p, async () => (await import('/js/01-core.js')).st.open.length === 0);
  assert.equal(await p.isHidden('#objbar'), true, 'the row goes when the last object is closed');
  assert.deepEqual(errors, [], 'page errors');
  console.log('open objects row: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
