/* Settings → Data sources: the page lists every field a sync knows (from sync-map.js, the lists the syncs use) and says
   what each source does with it under the current settings, changing as they change. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { AD_FILL, GRAPH_FILL, LS_FIELDS, LS_FILL } from '../../public/js/sync-map.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-ds-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
saveState(db, { ...loadState(db), policy: { ...(loadState(db).policy || {}), ip: true, disk: false }, intake: { lansweeper: 'direct' },
  sites: ['Bern'], locs: ['Bern / EG'], history: {},
  syncChanges: { ls: { at: '2026-10-30T10:00:00.000Z', changed: { 'IP address': 1 }, filled: {}, ids: ['d'], n: 1,
    earlier: [{ at: '2026-10-20T10:00:00.000Z', changed: { Model: 2 }, filled: {}, ids: ['a', 'b'], n: 2 }] } },
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
  assert.equal(await how('IP address'), 'Lansweeper keeps it up to date at every scan.');
  assert.equal(await chain('Disks'), '1Entra & Intune shown only: Lansweeper', 'Intune comes first where Lansweeper only shows its value');
  assert.equal(await chain('Operating system'), '1Lansweeper › 2Entra & Intune › 3AD');
  assert.equal(await how('Operating system'), 'Lansweeper keeps it up to date at every scan; Entra & Intune keeps it up to date where Lansweeper has no value; AD keeps it up to date where Lansweeper and Entra & Intune have no value.');
  assert.equal(await chain('Description'), '1AD', 'only AD knows it');
  assert.deepEqual(await p.locator('.ds-grp').allTextContents(), ['Network', 'Hardware', 'System', 'Place and description', 'Purchase and warranty']);
  assert.match(await p.textContent('.ds-cards'), /Lansweeper[\s\S]*New devices go straight into the inventory/);
  assert.match(await p.textContent('#setSources'), /LAPS passwords and BitLocker recovery keys are never read/);
  const stored = (check, ms = 8000) => storedBy(() => loadState(db), check, ms);
  // what the last sync changed, and the runs before it, each opening its devices
  assert.match(await p.textContent('.ds-cards'), /Changed IP address on 1\s*Show the device[\s\S]*Earlier runs \(1\)/);
  await p.click('.ds-earlier summary'); await p.click('.ds-earlier [data-dsrun="0"]');
  await p.waitForSelector('#fbar');
  assert.match(await p.textContent('#fbar'), /Changed by Lansweeper on/);
  assert.equal(await p.locator('table.grid tbody tr').count(), 2);
  await p.click('#setBtn'); await p.click('#setTabs [data-st=sources]'); await p.waitForSelector('.ds-matrix');
  // a setting changed on the Lansweeper tab shows here at once
  await p.click('#setTabs [data-st=feed]'); await p.waitForSelector('[data-pol=disk]');
  await p.check('[data-pol=disk]');
  await p.click('#setTabs [data-st=sources]'); await p.waitForSelector('.ds-matrix');
  assert.equal(await chain('Disks'), '1Lansweeper › 2Entra & Intune');
  // Change…: the sources as a list, moved up and down, what it means said as it changes
  const reorderOs = async () => {
    await row('Operating system').locator('[data-dsedit]').click(); await p.waitForSelector('#dsList');
    await p.click('[data-dsup=ad]'); await p.click('[data-dsup=ad]'); await p.click('[data-dsup=graph]');
    assert.match(await p.textContent('#dsList'), /1\s*Active Directory[\s\S]*2\s*Entra & Intune[\s\S]*3\s*Lansweeper/);
    assert.equal(await p.textContent('#dsSays'), 'AD keeps it up to date; Entra & Intune keeps it up to date where AD has no value; Lansweeper keeps it up to date where AD and Entra & Intune have no value.');
    await p.click('#dsSave');
  };
  await reorderOs();
  // first a preview of what it changes: Cancel leaves everything as it was
  await p.waitForSelector('#dpOk');
  assert.match(await p.textContent('#mdl .mb'), /1 device gets another value[\s\S]*PC-E[\s\S]*Windows 11 \(LS\)\s*Windows 11 Pro \(AD\)\s*AD/);
  await p.click('#dpCancel');
  await p.waitForSelector('.ds-matrix');
  assert.equal(await chain('Operating system'), '1Lansweeper › 2Entra & Intune › 3AD');
  await reorderOs();
  await p.click('#dpOk'); await p.waitForSelector('.ds-matrix');
  await stored(st => JSON.stringify((st.fieldOrder || {}).os) === '["ad","graph","ls"]');
  assert.equal(await chain('Operating system'), '1AD › 2Entra & Intune › 3Lansweeper');
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
  // Only if empty: AD then fills the field only while it is empty; the row says so, Back to the default clears it
  await row('Operating system').locator('[data-dsedit]').click(); await p.waitForSelector('#dsList');
  await p.selectOption('[data-dsmode=ad]', 'fill');
  assert.match(await p.textContent('#dsSays'), /AD writes it only while it is empty\.$/);
  await p.click('#dsSave');
  if (await p.locator('#dpOk').count()) await p.click('#dpOk');
  await stored(st => ((st.fieldMode || {}).os || {}).ad === 'fill');
  await p.waitForSelector('.ds-matrix');
  assert.match(await row('Operating system').locator('.ds-chain').textContent(), /only if empty/);
  await row('Operating system').locator('[data-dsedit]').click(); await p.click('#dsDefault');
  if (await p.locator('#dpOk').count()) await p.click('#dpOk');
  await stored(st => !(st.fieldMode || {}).os);
  // a value set by hand: counted on its row, opened as a list, given back to the sources (with Undo)
  saveState(db, { ...loadState(db), objs: loadState(db).objs.map(o => o.id === 'e' ? { ...o, os: 'Typed', src: { os: 'hand' } } : o) });
  await p.reload(); await until(p, async () => !!(await import('/js/01-core.js')).st.meId);
  await p.click('#setBtn'); await p.click('#setTabs [data-st=sources]'); await p.waitForSelector('.ds-matrix');
  await p.click('[data-dshand=os]');
  await p.waitForSelector('[data-handback]');
  assert.match(await p.textContent('body'), /Set by hand: Operating system/);
  await p.click('[data-handback]');
  await stored(st => st.objs.find(o => o.id === 'e').src?.os !== 'hand');
  await p.click('#toast .t-undo');
  await stored(st => st.objs.find(o => o.id === 'e').src?.os === 'hand');
  await p.click('#setBtn'); await p.click('#setTabs [data-st=sources]'); await p.waitForSelector('.ds-matrix');
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
