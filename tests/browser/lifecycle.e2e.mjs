/* Browser test of the replacement plan on the Overview: devices due per year, the lifetimes and prices set in its dialog,
   the budget per year, and a year opening its devices in the Table. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { eventually } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-life-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const y = new Date().getFullYear();
const dev = (id, type, purchased, extra = {}) => ({ id, code: 'INV-' + id, type, name: 'D-' + id, status: 'active', loc: 'Bern / EG', purchased, ovr: {}, feed: null, ...extra });
saveState(db, { ...loadState(db), history: {}, sites: ['Bern'], locs: ['Bern / EG'],
  objs: [dev('a', 'notebook', `${y - 6}-01-10`), dev('b', 'notebook', `${y - 3}-02-01`), dev('c', 'notebook', `${y - 3}-03-01`), dev('d', 'pc', '', { warranty: `${y + 2}-05-31` }), dev('e', 'pc', '')] });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-start-hidden', '1'); localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await eventually(() => p.evaluate(async () => !!(await import('/js/01-core.js')).st.meId));
  await p.click('#tabsbar [data-tab=overview]'); await p.waitForSelector('#ovPlan');
  const text = async () => (await p.innerText('#ovPlan')).replace(/\s+/g, ' ');
  // notebooks last 4 years by default: a overdue, b and c next year; d at its warranty's end; e has neither date
  assert.match(await text(), /Replacement plan 4 planned/);
  assert.match(await text(), new RegExp(`Overdue 1 ${y} 0 ${y + 1} 2 ${y + 2} 1`));
  assert.match(await text(), /1 device has neither date\. Add replacement prices/);
  // prices: the budget per year
  await p.click('#ovLife'); await p.waitForSelector('[data-lfp=notebook]');
  await p.fill('[data-lfp=notebook]', '1500'); await p.fill('[data-lfy=pc]', '6'); await p.fill('[data-lfp=pc]', '900');
  await p.click('#lfOk');
  await eventually(() => { const l = loadState(db).lifecycle || {}; return l.notebook?.price === 1500 && l.notebook?.years === 4 && l.pc?.years === 6 && l.pc?.price === 900; });
  await p.waitForSelector('#ovPlan .ov-cost');
  assert.match(await text(), new RegExp(`${y + 1} 2 CHF 3[’',]?000`));
  // a year opens its devices
  await p.click(`[data-ovplan="${y + 1}"]`);
  await p.waitForSelector('table.grid');
  assert.match(await p.textContent('#fbar'), new RegExp(`Due for replacement in ${y + 1}`));
  assert.equal(await p.locator('table.grid tbody tr').count(), 2);
  assert.deepEqual(errors, []);
  console.log('lifecycle: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
