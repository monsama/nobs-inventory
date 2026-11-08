/* Browser test of fixes from the November sweep: Enter signs in; Retired in the Status field goes through the Retire dialog; picking the value in use on a number field (a switch's ports) keeps
   it a number, so later saves still go through; "Back to automatic" follows the order set in Settings → Data sources;
   a save of more changes than the server takes at once is sent in batches. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { storedBy, until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-sweep-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s = loadState(db);
s.objs = [
  { id: 'w1', code: 'INV-0001', type: 'switch', name: 'SW-1', status: 'active', ports: 24, feed: null },
  { id: 'r1', code: 'INV-0003', type: 'pc', name: 'PC-OLD', status: 'active', feed: null },
  { id: 'v1', code: 'INV-0002', type: 'pc', name: 'PC-V', status: 'active', feed: null, os: 'Windows 11 Enterprise', src: { os: 'graph' },
    vals: { os: { graph: ['Windows 11 Enterprise', '2026-11-06T08:00:00Z'], ad: ['Windows 11 Pro', '2026-11-05'] } }, pick: { os: 'graph' }, graph: { id: 'g1', managed: 'Intune', lastCheckIn: '2026-11-06T08:00:00Z' }, ad: { logon: '2026-11-05' } }];
s.fieldOrder = { os: ['ad', 'graph'] };
saveState(db, s);
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const obj = id => loadState(db).objs.find(o => o.id === id);
const mark = (p, id) => p.locator(`#${id} >> xpath=ancestor::div[contains(@class,"ctlrow")]//span[contains(@class,"fsrc")]`).first();
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); localStorage.setItem('ni-all-fields', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  // Enter in the password field signs in, as the button does
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.press('#lgPw', 'Enter');
  await until(p, async () => !!(await import('/js/01-core.js')).st.meId);

  // a number field: the value in use picked stays a number, and the next edit is saved
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('w1'));
  await p.waitForSelector('#f_w1_ports');
  await mark(p, 'f_w1_ports').click(); await p.waitForSelector('#fsrcPop [data-pick=hand]');
  await p.click('#fsrcPop [data-pick=hand]');
  await storedBy(() => obj('w1'), o => o.pick && o.pick.ports === 'hand');
  assert.equal(typeof obj('w1').ports, 'number', 'the ports became text');
  await p.fill('#f_w1_name', 'SW-1A'); await p.keyboard.press('Tab');
  await storedBy(() => obj('w1'), o => o.name === 'SW-1A');
  // Tab after the edit keeps the keyboard's place: the focus is not dropped to the page when the field is saved
  await p.waitForTimeout(200);
  assert.notEqual(await p.evaluate(() => document.activeElement && document.activeElement.tagName), 'BODY', 'the focus fell to the page after saving a field');

  // automatic follows the order set for the field: AD first, so AD's value
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('v1'));
  await p.waitForSelector('#f_v1_os');
  await mark(p, 'f_v1_os').click(); await p.waitForSelector('#fsrcPop.pick');
  await p.click('#fsrcPop .sp-foot [data-pick=""]');
  await storedBy(() => obj('v1'), o => !(o.pick && o.pick.os) && o.os === 'Windows 11 Pro' && o.src.os === 'ad');
  // and the picker names that order
  await until(p, () => !document.querySelector('#f_v1_os').closest('.ctlrow').querySelector('.fsrc-lock'));
  await mark(p, 'f_v1_os').click(); await p.waitForSelector('#fsrcPop.pick');
  assert.match(await p.textContent('#fsrcPop .sp-foot'), /Active Directory, then Entra & Intune/, 'the picker does not tell the order set');

  // Retired picked in the Status field opens the Retire dialog; the field keeps the status until then
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('r1'));
  await p.waitForSelector('#f_r1_status');
  await p.selectOption('#f_r1_status', 'retired');
  await p.waitForSelector('#rtOk');
  assert.equal(await p.inputValue('#f_r1_status'), 'active', 'the field took Retired before the dialog');
  assert.equal(obj('r1').status, 'active', 'retired without the dialog');
  await p.click('#rtOk');
  await storedBy(() => obj('r1'), o => o.status === 'retired');
  await until(p, () => /Retired/.test(document.querySelector('#toolbar').textContent));
  // more changes than the server takes at once go in batches of at most 4000
  const sizes = await p.evaluate(async () => { const { batches } = await import('/js/server-save.js'); const dels = Array.from({ length: 9001 }, (_, i) => ({ kind: 'history', id: 'h' + i })); return batches([], dels).map(b => b.dels.length); });
  assert.deepEqual(sizes, [4000, 4000, 1001]);
  assert.deepEqual(errors, [], 'page errors');
  console.log('sweep fixes: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
