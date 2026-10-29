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
    { id: 'd', code: 'INV-0004', type: 'pc', name: 'PC-D', status: 'active', feed: { sys: 'Lansweeper', ref: '4', location: 'HQ / Lager' } }] });
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
  assert.equal(await p.locator('.ds-matrix tbody tr').count(), fields.size);
  const row = label => p.locator('.ds-matrix tbody tr', { has: p.locator(`th:text-is("${label}")`) });
  /* What a cell says: the chosen entry of its list for an admin, its text otherwise. */
  const say = (label, n) => row(label).locator('td').nth(n).evaluate(td => { const s = td.querySelector('select'); return (s ? s.selectedOptions[0].text : td.textContent).trim(); });
  assert.equal(await say('IP address', 0), '1. Writes');
  assert.equal(await say('Disks', 0), 'Shown only');
  assert.equal(await say('Disks', 1), '1. First', 'Intune comes first where Lansweeper only shows its value');
  assert.equal(await say('Operating system', 1), '2. Fills empty');
  assert.equal(await say('Operating system', 3), 'Lansweeper → Intune → AD');
  assert.equal(await say('Description', 0), '—', 'Lansweeper does not know it');
  assert.match(await p.textContent('.ds-cards'), /Lansweeper[\s\S]*New devices go straight into the inventory/);
  assert.match(await p.textContent('#setSources'), /LAPS passwords and BitLocker recovery keys are never read/);
  const stored = async check => { const t0 = Date.now(); while (!check(loadState(db))) { if (Date.now() - t0 > 8000) throw new Error('not saved'); await new Promise(r => setTimeout(r, 100)); } };
  // a setting changed on the Lansweeper tab shows here at once
  await p.click('#setTabs [data-st=feed]'); await p.waitForSelector('[data-pol=disk]');
  await p.check('[data-pol=disk]');
  await p.click('#setTabs [data-st=sources]'); await p.waitForSelector('.ds-matrix');
  assert.equal(await say('Disks', 0), '1. Writes');
  assert.equal(await say('Disks', 1), '2. Fills empty');
  // the order of a field: set here, kept on the server, with Undo
  await row('Operating system').locator('[data-dso]').selectOption('ad,graph,ls');
  await stored(st => JSON.stringify((st.fieldOrder || {}).os) === '["ad","graph","ls"]');
  assert.equal(await say('Operating system', 2), '1. First'); assert.equal(await say('Operating system', 0), '3. Fills empty');
  assert.equal(await row('Operating system').getAttribute('class'), 'ds-set', 'a field set here is marked');
  await p.click('#toast .t-undo');
  await stored(st => !(st.fieldOrder || {}).os);
  // a source set to Shown only leaves the order, and Lansweeper's box on its tab follows
  await row('IP address').locator('[data-dss=ls]').selectOption('off');
  await stored(st => JSON.stringify((st.fieldOrder || {}).ip) === '[]' && st.policy.ip === false);
  assert.equal(await say('IP address', 3), '—');
  await p.click('#setTabs [data-st=feed]'); await p.waitForSelector('[data-pol=ip]');
  assert.equal(await p.isChecked('[data-pol=ip]'), false);
  await p.check('[data-pol=ip]');
  await p.click('#setTabs [data-st=sources]'); await p.waitForSelector('.ds-matrix');
  assert.equal(await say('IP address', 0), '1. Writes');
  // back to the defaults
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
