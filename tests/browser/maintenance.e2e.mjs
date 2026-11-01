/* Browser test of recurring maintenance: a task added on a device's page, overdue on the Overview and in Needs
   attention, done from there (the next due date moves on, the history says so), and listed in the Table with its column. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { eventually } from './until.mjs';
import { addInterval, todayDay } from '../../public/js/maintenance.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-maint-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const today = todayDay(), dot = d => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const past = addInterval(today, -10, 'd');
saveState(db, { ...loadState(db), history: {}, sites: ['Bern'], locs: ['Bern / Server'],
  objs: [{ id: 'u1', code: 'INV-1', type: 'other', name: 'UPS-1', status: 'active', loc: 'Bern / Server', ovr: {}, feed: null },
    { id: 'a1', code: 'INV-2', type: 'other', name: 'AC-1', status: 'active', loc: 'Bern / Server', ovr: {}, feed: null }] });
const stored = id => loadState(db).objs.find(o => o.id === id);
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

  // added on the device's page: what, every 6 months, first due ten days ago
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('u1'));
  await p.waitForSelector('#mtPanel');
  assert.match(await p.textContent('#mtPanel'), /No recurring maintenance/);
  await p.click('#mtAdd'); await p.waitForSelector('#mtWhat');
  await p.fill('#mtWhat', 'Test the UPS battery'); await p.fill('#mtEvery', '6'); await p.selectOption('#mtUnit', 'm');
  await p.fill('#mtDue', dot(past)); await p.press('#mtDue', 'Tab');
  await p.click('#mtSave');
  await eventually(() => stored('u1').maint?.[0]?.due === past);
  assert.deepEqual([stored('u1').maint[0].every, stored('u1').maint[0].unit], [6, 'm']);
  await p.waitForSelector('#mtPanel .chip.bad');
  assert.match(await p.textContent('#mtPanel'), new RegExp(`Test the UPS battery · every 6 months[\\s\\S]*overdue since ${dot(past).replace(/\./g, '\\.')}`));

  // on the Overview: overdue in Needs attention and in Maintenance due; done from there, with a note
  await p.click('#tabsbar [data-tab=overview]'); await p.waitForSelector('#ovMaint');
  assert.match(await p.textContent('[data-ovmt="late"]'), /1\s*Maintenance overdue\s*UPS-1: Test the UPS battery/);
  assert.match(await p.textContent('#ovMaint'), /Maintenance due\s*1 overdue · 0 within 30 days[\s\S]*UPS-1/);
  await p.click('[data-ovmtdone="u1|' + stored('u1').maint[0].id + '"]'); await p.waitForSelector('#mtNote');
  assert.match(await p.textContent('#mtNext'), new RegExp(`Next due: ${dot(addInterval(today, 6, 'm')).replace(/\./g, '\\.')}`));
  await p.fill('#mtNote', 'Battery fine'); await p.click('#mtOk');
  await eventually(() => stored('u1').maint[0].due === addInterval(today, 6, 'm'));
  assert.deepEqual(stored('u1').maint[0].log, [{ at: today, by: 'Administrator', note: 'Battery fine' }]);
  await eventually(() => (loadState(db).history.u1 || []).some(h => /Maintenance done: Test the UPS battery .* by Administrator \(Battery fine\); next due/.test(h.msg)));
  await p.waitForSelector('#ovMaint', { state: 'detached' });
  assert.equal(await p.locator('[data-ovmt="late"]').count(), 0, 'nothing overdue any more');

  // a second one, overdue: Needs attention opens it in the Table, with the Next maintenance column after Name
  await p.evaluate(async d => { const c = await import('/js/01-core.js'); c.objs.find(o => o.id === 'a1').maint = [{ id: 'mx', what: 'Change the filter', every: 3, unit: 'm', due: d }]; const r = await import('/js/07-render.js'); r.queueServerSave(); r.view(); }, past);
  await eventually(() => stored('a1').maint?.length === 1);
  await p.waitForSelector('[data-ovmt="late"]');
  await p.click('[data-ovmt="late"]'); await p.waitForSelector('table.grid');
  assert.match(await p.textContent('#fbar'), /Maintenance overdue/);
  assert.equal(await p.locator('table.grid tbody tr').count(), 1);
  const heads = await p.$$eval('table.grid thead th', t => t.map(x => x.textContent.trim()));
  assert.match(heads[heads.findIndex(h => /^Name/.test(h)) + 1], /^Next maintenance/);
  assert.match(await p.textContent('table.grid tbody'), new RegExp(`AC-1[\\s\\S]*${dot(past).replace(/\./g, '\\.')} · Change the filter`));
  // the device opens from its row on the Overview
  await p.click('#tabsbar [data-tab=overview]'); await p.waitForSelector('#ovMaint');
  await p.click('#ovMaint .ov-row'); await p.waitForSelector('#mtPanel');
  assert.match(await p.textContent('#mtPanel'), /Change the filter · every 3 months/);
  assert.deepEqual(errors, []);
  console.log('maintenance: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
