/* At phone width (390 px) the main screens fit the screen: no sideways scrolling of the page. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-phone-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await p.waitForFunction(() => objs.length > 0);
  const sideways = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const problems = [];
  for (const tab of ['cards', 'table', 'map', 'plans', 'net', 'rack', 'sw']) {
    await p.evaluate(t => { st.tab = t; render(); }, tab);
    await p.waitForTimeout(150);
    const extra = await sideways();
    if (extra > 1) problems.push(`${tab}: ${extra}px wider than the screen`);
  }
  await p.click('#setBtn');
  for (const tab of ['feed', 'locations', 'types', 'users', 'maintenance', 'log', 'about']) {
    await p.click(`#setTabs [data-st=${tab}]`).catch(() => {});
    await p.waitForTimeout(150);
    const extra = await sideways();
    if (extra > 1) problems.push(`settings ${tab}: ${extra}px wider than the screen`);
  }
  assert.deepEqual(problems, [], 'screens wider than the phone');
  assert.deepEqual(errors, [], 'page errors');
  console.log('phone width: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
