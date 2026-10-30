/* Stocktake: start one for a site, confirm by ticking and by scanning, move a device found elsewhere, note something
   unknown, finish with what is missing, and the lists as files. The device page says when it was confirmed. Sign in
   with Microsoft: the button and what the sign-in says when it did not work. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-stk-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
saveState(db, { ...loadState(db), useLansweeper: false, sites: ['Bern', 'Zürich'], locs: ['Bern / EG', 'Bern / 1. OG', 'Zürich / Lager'], history: {},
  objs: [
    { id: 'a', code: 'INV-0001', type: 'notebook', name: 'NB-A', serial: 'SA1', status: 'active', loc: 'Bern / EG', feed: null },
    { id: 'b', code: 'INV-0002', type: 'pc', name: 'PC-B', serial: 'SB2', status: 'active', loc: 'Bern / 1. OG', feed: null },
    { id: 'c', code: 'INV-0003', type: 'monitor', name: 'MON-C', serial: 'SC3', status: 'stock', loc: 'Bern / EG', feed: null },
    { id: 'z', code: 'INV-0009', type: 'pc', name: 'PC-Z', serial: 'SZ9', status: 'active', loc: 'Zürich / Lager', feed: null },
    { id: 'r', code: 'INV-0010', type: 'pc', name: 'PC-OLD', serial: 'SR0', status: 'retired', loc: 'Bern / EG', feed: null },
  ] });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const wait = async check => { const t0 = Date.now(); while (!(await check())) { if (Date.now() - t0 > 8000) throw new Error('timed out: ' + check); await new Promise(r => setTimeout(r, 100)); } };
const obj = id => loadState(db).objs.find(o => o.id === id);
try {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  // the sign-in says why Microsoft's sign-in did not let someone in; no Microsoft button while it is off
  await p.goto(base + '?sso=unknown'); await p.waitForSelector('#lgUser');
  assert.match(await p.textContent('#lgErr'), /not a user of the inventory/);
  assert.equal(await p.locator('.lg-ms').count(), 0);
  assert.equal(new URL(p.url()).search, '', 'the address is cleaned');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => !!(await import('/js/01-core.js')).st.meId);

  // start a stocktake of the Bern site from the Overview: three devices (not the retired one, not Zürich)
  await p.click('#tabsbar [data-tab=overview]'); await p.click('#ovStock'); await p.waitForSelector('#stkPlace');
  await p.selectOption('#stkPlace', 'Bern');
  assert.equal(await p.textContent('#stkCount'), '3 devices');
  await p.fill('#stkName', 'Bern autumn'); await p.click('#stkStart');
  await p.waitForSelector('#stkScan');
  assert.match(await p.textContent('.stk-prog'), /0 of 3/);
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'stkScan', null, { timeout: 5000 });   /* ready to scan */
  assert.equal(await p.locator('#tabsbar [data-tab=stocktake]').count(), 1, 'its tab shows while it runs');
  // by scan (serial number), by tick, and one found here that is recorded in Zürich: moved
  await p.fill('#stkScan', 'sa1'); await p.press('#stkScan', 'Enter');
  await p.waitForFunction(() => /NB-A<\/b> confirmed/.test(document.querySelector('#stkLast').innerHTML));
  await p.click('[data-stk=b]');
  await p.fill('#stkScan', 'INV-0009'); await p.press('#stkScan', 'Enter');
  await p.waitForSelector('#stmMove'); await p.selectOption('#stmTo', 'Bern / EG'); await p.click('#stmMove');
  await p.fill('#stkScan', 'XYZ-404'); await p.press('#stkScan', 'Enter');
  await p.waitForFunction(() => /not in the inventory/.test(document.querySelector('#stkLast').textContent));
  await wait(() => obj('z').loc === 'Bern / EG' && obj('z').verified && obj('z').verified.from === 'Zürich / Lager' && obj('b').verified && obj('a').verified.by === 'Administrator');
  assert.match(await p.textContent('.stk-prog'), /3 of 4\s*1 moved here\s*1 not in the inventory/);
  assert.equal(await p.locator('.stk-row').count(), 1, 'only the open one is listed');
  // unticked: taken back
  await p.click('[data-stkf=done]'); await p.click('[data-stk=b]');
  await wait(() => !obj('b').verified);
  await p.click('[data-stkf=open]');
  // finish: one missing (the monitor), the result kept, with its files
  await p.click('#stkFinish'); await p.waitForSelector('#stfOk');
  assert.match(await p.textContent('.stk-sum'), /2\s*confirmed\s*2\s*missing\s*1\s*moved here\s*1\s*not in the inventory/);
  await p.click('#stfOk');
  await wait(() => { const t = loadState(db).stocktakes[0]; return t.finished && t.result.missing.length === 2 && t.result.moved[0].from === 'Zürich / Lager' && t.result.unknown[0] === 'XYZ-404'; });
  await p.waitForSelector('.stk .grid.mini');
  assert.match(await p.textContent('.stk .grid.mini tbody'), /Bern autumn\s*Bern[\s\S]*2 of 4\s*2\s*1/);
  const [pdf] = await Promise.all([p.waitForEvent('download'), p.click('.stk .grid.mini a:text("PDF")')]);
  assert.equal(fs.readFileSync(await pdf.path()).subarray(0, 5).toString(), '%PDF-');
  // the device page says when it was confirmed; one is confirmed there on its own, with Undo
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('a'));
  await p.waitForSelector('.stk-note');
  assert.match(await p.textContent('.stk-note'), /Confirmed on site \d\d\.\d\d\.\d{4} by Administrator \(Bern autumn\)/);
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('c'));
  await p.waitForSelector('[data-verify=c]'); await p.click('[data-verify=c]');
  await wait(() => !!obj('c').verified && !obj('c').verified.st);
  // the Overview counts devices not confirmed for a year once a stocktake is done
  await p.click('#tabsbar [data-tab=overview]'); await p.waitForSelector('.ov-q');
  assert.match(await p.textContent('.panelbox:has(.ov-q)'), /1\s*Not confirmed on site for 12 months/, 'PC-B only');
  assert.deepEqual(errors, []);
  console.log('stocktake: all checks passed');
} finally { await browser.close(); server.close(); }
