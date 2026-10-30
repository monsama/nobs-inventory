/* Settings → Data sources: the page lists every field a sync knows (from sync-map.js, the lists the syncs use) and says
   what each source does with it under the current settings, changing as they change. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { AD_FILL, GRAPH_FILL, LS_FIELDS, LS_FILL } from '../../public/js/sync-map.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-ds-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
saveState(db, { ...loadState(db), policy: { ...(loadState(db).policy || {}), ip: true, disk: false }, intake: { lansweeper: 'direct' },
  sites: ['Bern'], locs: ['Bern / EG'], history: {},
  objs: [{ id: 'a', code: 'INV-0001', type: 'pc', name: 'PC-A', status: 'active', feed: null, inAd: true, ad: { location: 'Raum 3.12' } },
    { id: 'b', code: 'INV-0002', type: 'pc', name: 'PC-B', status: 'active', feed: null, inAd: true, ad: { location: 'Raum 3.12' } },
    { id: 'c', code: 'INV-0003', type: 'pc', name: 'PC-C', status: 'active', feed: null, inAd: true, ad: { location: 'bern / eg' } },
    { id: 'd', code: 'INV-0004', type: 'pc', name: 'PC-D', status: 'active', feed: { sys: 'Lansweeper', ref: '4', location: 'HQ / Lager' } },
    { id: 'e', code: 'INV-0005', type: 'pc', name: 'PC-E', status: 'active', feed: { sys: 'Lansweeper', ref: '5' }, os: 'Windows 11 (LS)', src: { os: 'ls' },
      vals: { os: { ls: ['Windows 11 (LS)', '2026-10-28'], ad: ['Windows 11 Pro (AD)', '2026-10-27'] } } }] });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => !!(await import('/js/01-core.js')).st.meId);
  await p.click('#setBtn'); await p.click('#setTabs [data-st=sources]'); await p.waitForSelector('.ds-matrix');
  // one row per field any sync knows
  const fields = new Set([...LS_FIELDS, ...Object.keys(LS_FILL), ...Object.keys(GRAPH_FILL), ...Object.keys(AD_FILL), 'loc']);
  assert.equal(await p.locator('.ds-matrix tbody tr:not(.ds-grp)').count(), fields.size);
  const row = label => p.locator('.ds-matrix tbody tr', { has: p.locator(`th:text-is("${label}")`) });
  /* What a row says: the sources in their order, with those only shown, and the sentence. */
  const chain = label => row(label).locator('.ds-chain').evaluate(td => td.textContent.replace(/\s*›\s*/g, ' › ').replace(/\s+/g, ' ').trim());
  const how = label => row(label).locator('.ds-how').textContent();
  assert.equal(await chain('IP address'), '1Lansweeper');
  assert.equal(await how('IP address'), 'Lansweeper sets it at every scan.');
  assert.equal(await chain('Disks'), '1Intune shown only: Lansweeper', 'Intune comes first where Lansweeper only shows its value');
  assert.equal(await chain('Operating system'), '1Lansweeper › 2Intune › 3AD');
  assert.equal(await how('Operating system'), 'Lansweeper sets it at every scan; if it stays empty, Intune and AD fill it, in this order.');
  assert.equal(await chain('Description'), '1AD', 'only AD knows it');
  assert.deepEqual(await p.locator('.ds-grp').allTextContents(), ['Network', 'Hardware', 'System', 'Place and description', 'Purchase and warranty']);
  assert.match(await p.textContent('.ds-cards'), /Lansweeper[\s\S]*New devices go straight into the inventory/);
  assert.match(await p.textContent('#setSources'), /LAPS passwords and BitLocker recovery keys are never read/);
  const stored = async check => { const t0 = Date.now(); while (!check(loadState(db))) { if (Date.now() - t0 > 8000) throw new Error('not saved'); await new Promise(r => setTimeout(r, 100)); } };
  // a setting changed on the Lansweeper tab shows here at once
  await p.click('#setTabs [data-st=feed]'); await p.waitForSelector('[data-pol=disk]');
  await p.check('[data-pol=disk]');
  await p.click('#setTabs [data-st=sources]'); await p.waitForSelector('.ds-matrix');
  assert.equal(await chain('Disks'), '1Lansweeper › 2Intune');
  // Change…: the sources as a list, moved up and down, what it means said as it changes
  const reorderOs = async () => {
    await row('Operating system').locator('[data-dsedit]').click(); await p.waitForSelector('#dsList');
    await p.click('[data-dsup=ad]'); await p.click('[data-dsup=ad]'); await p.click('[data-dsup=graph]');
    assert.match(await p.textContent('#dsList'), /1\s*Active Directory[\s\S]*2\s*Entra & Intune[\s\S]*3\s*Lansweeper/);
    assert.equal(await p.textContent('#dsSays'), 'AD fills it and replaces what the others filled; if it stays empty, Intune and Lansweeper fill it, in this order.');
    await p.click('#dsSave');
  };
  await reorderOs();
  // first a preview of what it changes: Cancel leaves everything as it was
  await p.waitForSelector('#dpOk');
  assert.match(await p.textContent('#mdl .mb'), /1 device gets another value[\s\S]*PC-E[\s\S]*Windows 11 \(LS\)\s*Windows 11 Pro \(AD\)\s*AD/);
  await p.click('#dpCancel');
  await p.waitForSelector('.ds-matrix');
  assert.equal(await chain('Operating system'), '1Lansweeper › 2Intune › 3AD');
  await reorderOs();
  await p.click('#dpOk'); await p.waitForSelector('.ds-matrix');
  await stored(st => JSON.stringify((st.fieldOrder || {}).os) === '["ad","graph","ls"]');
  assert.equal(await chain('Operating system'), '1AD › 2Intune › 3Lansweeper');
  assert.match(await row('Operating system').locator('th').textContent(), /Custom/, 'a field set here is marked');
  await p.click('#toast .t-undo');
  await stored(st => !(st.fieldOrder || {}).os);
  // a source not ticked is only shown, and Lansweeper's box on its tab follows
  await row('IP address').locator('[data-dsedit]').click(); await p.waitForSelector('#dsList');
  await p.uncheck('[data-dsuse=ls]');
  assert.match(await p.textContent('#dsSays'), /No source writes it: it is kept as typed\. Lansweeper is shown beside the field\./);
  await p.click('#dsSave'); await p.waitForSelector('.ds-matrix');
  await stored(st => JSON.stringify((st.fieldOrder || {}).ip) === '[]' && st.policy.ip === false);
  assert.equal(await chain('IP address'), 'Kept as typed shown only: Lansweeper');
  await p.click('#setTabs [data-st=feed]'); await p.waitForSelector('[data-pol=ip]');
  assert.equal(await p.isChecked('[data-pol=ip]'), false);
  await p.check('[data-pol=ip]');
  await p.click('#setTabs [data-st=sources]'); await p.waitForSelector('.ds-matrix');
  assert.equal(await chain('IP address'), '1Lansweeper');
  // one field back to its default, from its dialog; then all of them
  await row('IP address').locator('[data-dsedit]').click(); await p.click('#dsDefault');
  await stored(st => !(st.fieldOrder || {}).ip);
  await p.waitForSelector('.ds-matrix');
  await row('Disks').locator('[data-dsedit]').click(); await p.uncheck('[data-dsuse=graph]'); await p.click('#dsSave');
  await stored(st => JSON.stringify((st.fieldOrder || {}).disk) === '["ls"]');
  await p.click('#dsReset');
  await stored(st => !Object.keys(st.fieldOrder || {}).length);
  assert.equal(await p.locator('#dsReset').count(), 0);
  // Settings → Locations lists the location texts of the sources; one used as a new room places its devices there, Undo takes it back
  await p.click('#setTabs [data-st=locations]'); await p.waitForSelector('#adLocs');
  assert.match(await p.textContent('#adLocs'), /Raum 3\.12\s*AD\s*2/);
  assert.match(await p.textContent('#adLocs'), /bern \/ eg\s*AD\s*1\s*Is a room here/);
  assert.match(await p.textContent('#adLocs'), /HQ \/ Lager\s*Lansweeper\s*1/);
  // the office of a device's user: off until turned on, kept on the server
  assert.equal(await p.isChecked('#locOffice'), false);
  await p.check('#locOffice');
  await stored(st => st.locFromOffice === true);
  await p.selectOption('#adLocs .lrow:has-text("Raum 3.12") [data-admap]', 'site:Bern');
  await stored(st => st.locs.includes('Bern / Raum 3.12') && (st.locMap || {})['Raum 3.12'] === 'Bern / Raum 3.12' && st.objs.filter(o => o.loc === 'Bern / Raum 3.12').length === 2);
  assert.match(await p.textContent('#adLocs'), /→ Bern \/ Raum 3\.12/);
  await p.click('#toast .t-undo');
  await stored(st => !st.locs.includes('Bern / Raum 3.12') && !(st.locMap || {})['Raum 3.12'] && st.objs.every(o => !o.loc));
  assert.deepEqual(errors, []);
  console.log('data sources: all checks passed');
} finally { await browser.close(); server.close(); }
