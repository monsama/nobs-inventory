/* Running the inventory: data quality on the Overview (each line lists its devices), reports as PDF and Excel, the
   health of the server in Maintenance, and settings changes in the log with what they changed. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-ops-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const old = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10);
saveState(db, { ...loadState(db), useLansweeper: false, sites: ['Bern'], locs: ['Bern / EG'], history: {},
  objs: [
    { id: 'a', code: 'INV-0001', type: 'notebook', name: 'NB-A', status: 'active', loc: 'Bern / EG', serial: 'S1', user: 'Anna', feed: null },
    { id: 'b', code: 'INV-0002', type: 'notebook', name: 'NB-B', status: 'active', serial: 'S2', feed: null },
    { id: 'c', code: 'INV-0003', type: 'pc', name: 'PC-C', status: 'active', loc: 'Bern / EG', feed: null, user: 'Beat', inAd: true, ad: { logon: old } },
    { id: 'd', code: 'INV-0004', type: 'pc', name: 'PC-D', status: 'active', loc: 'Bern / EG', serial: 'S4', user: 'Cleo', feed: null, os: 'Windows 11',
      vals: { os: { ad: ['Windows 10', '2026-10-01'], graph: ['Windows 11', '2026-10-02'] } } },
  ] });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
/* Waits here, in the test, until check() holds: up to 8 seconds. */
const wait = async check => { const t0 = Date.now(); while (!(await check())) { if (Date.now() - t0 > 8000) throw new Error('timed out: ' + check); await new Promise(r => setTimeout(r, 100)); } };
try {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => !!(await import('/js/01-core.js')).st.meId);

  // The directory checks: someone who left, a computer account disabled in AD, Intune naming someone else
  const dir = await p.evaluate(async () => {
    const core = await import('/js/01-core.js');
    const people = [{ id: 'u1', name: 'Anna', login: 'anna', source: 'ldap', active: false }, { id: 'u2', name: 'Beat', login: 'beat', source: 'ldap', active: true, entra: { upn: 'beat@corp.example' } }];
    core.setPeople(people);
    const t = k => o => core.QUALITY[k][2](o);
    const r = {
      leaver: [t('leaver')({ uid: 'u1', status: 'active' }), t('leaver')({ uid: 'u2', status: 'active' }), t('leaver')({ uid: 'u1', status: 'retired' })],
      ad: [t('addisabled')({ status: 'active', ad: { disabled: true } }), t('addisabled')({ status: 'stock', ad: { disabled: true } })],
      owner: [t('ownerdiff')({ uid: 'u2', status: 'active', graph: { owner: 'beat@corp.example' } }), t('ownerdiff')({ uid: 'u2', status: 'active', graph: { owner: 'cleo@corp.example' } })],
    };
    core.setPeople((await import('/js/04-settings.js')).USERS);
    return r;
  });
  assert.deepEqual(dir, { leaver: [true, false, false], ad: [true, false], owner: [false, true] });

  // Data quality: one of four complete; each line lists its devices, with a filter chip to take off
  await p.click('#tabsbar [data-tab=overview]'); await p.waitForSelector('.ov-q');
  const q = await p.textContent('.panelbox:has(.ov-q)');
  assert.match(q, /1 of 4 complete/); assert.match(q, /25%/);
  assert.match(q, /1\s*No location/); assert.match(q, /1\s*No serial number/); assert.match(q, /1\s*No user/); assert.match(q, /1\s*Not seen for 90 days/); assert.match(q, /1\s*Sources disagree/);
  await p.click('[data-ovq=noserial]');
  await p.waitForSelector('#fbar .fchip[data-fx=quality]');
  assert.match(await p.textContent('#fbar'), /Data quality: No serial number/);
  assert.deepEqual(await p.evaluate(async () => (await import('/js/01-core.js')).filtered().map(o => o.name)), ['PC-C']);
  await p.click('#fbar .fchip[data-fx=quality]');
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).st.quality), null);

  // Reports: a choice of report and its options, the files by the links
  await p.click('#tabsbar [data-tab=overview]'); await p.click('#ovReports'); await p.waitForSelector('#rpPdf');
  assert.equal(await p.isVisible('#rpGroup'), true); assert.equal(await p.isVisible('#rpYear'), false);
  await p.selectOption('#rpGroup', 'dept');
  assert.match(await p.getAttribute('#rpPdf', 'href'), /^api\/reports\/inventory\?group=dept&.*format=pdf$/);
  await p.check('[name=rpKind][value=costs]');
  assert.equal(await p.isVisible('#rpYear'), true); assert.equal(await p.isVisible('#rpGroup'), false);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#rpXlsx')]);
  assert.match(dl.suggestedFilename(), /^nobs-costs-\d{4}-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const [dp] = await Promise.all([p.waitForEvent('download'), p.click('#rpPdf')]);
  assert.equal(fs.readFileSync(await dp.path()).subarray(0, 5).toString(), '%PDF-');
  await p.click('#rpCancel');

  // Health in Maintenance: no backup yet needs a look; after one, the line is OK
  await p.click('#setBtn'); await p.click('#setTabs [data-st=maintenance]'); await p.waitForSelector('.hl-list');
  const health = await p.textContent('#setMaint');
  assert.match(health, /Health\s*Something needs a look/);
  assert.match(health, /Check\s*Last backup\s*None yet/);
  assert.match(health, /Off\s*Lansweeper\s*Not set up/);
  await p.click('#bkNew'); await p.waitForSelector('#setMaint .grid.mini td');
  await p.click('#hlAgain');
  await wait(async () => /OK\s*Last backup\s*less than an hour ago/.test(await p.textContent('#setMaint')));

  // A settings change is in the log with what it changed, under the Settings filter and found by search
  await p.click('#setTabs [data-st=locations]');
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.LOCS.push('Bern / 1. OG'); (await import('/js/07-render.js')).queueServerSave(); });
  await wait(() => loadState(db).locs.includes('Bern / 1. OG'));
  await p.click('#setTabs [data-st=log]'); await p.waitForSelector('[data-logf=settings]');
  await p.click('[data-logf=settings]'); await p.waitForSelector('.lg-detail');
  assert.match(await p.textContent('#setLog tbody'), /setting changed: locations/);
  await p.click('.lg-detail summary');
  assert.match(await p.textContent('.lg-detail'), /1 change\s*added Bern \/ 1\. OG/);
  await p.click('[data-logf=all]'); await p.fill('#logQ', '1. OG');
  await wait(async () => (await p.locator('#setLog .grid.mini > tbody > tr').count()) === 1);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'logQ', 'the search keeps its focus');

  assert.deepEqual(errors, []);
  console.log('operations: all checks passed');
} finally { await browser.close(); server.close(); }
