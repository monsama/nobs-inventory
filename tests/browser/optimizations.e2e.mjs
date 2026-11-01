/* Browser test of the optimizations: a new object gets a user and a status; the Table listed by a data-quality check
   brings its column next to Name and selects all for the fixing action; the sidebar only shows on lists; Settings
   tables are cards on a phone; the Reports dialog offers only the listed devices and the hand-back list by person; a
   finished stocktake shows its missing devices in the Table. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-opt-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const dev = (id, name, extra = {}) => ({ id, code: 'INV-' + id, type: 'notebook', name, status: 'active', loc: 'Bern / EG', feed: null, ovr: {}, ...extra });
saveState(db, { ...s0, history: {}, locs: ['Bern / EG', 'Bern / OG'],
  users: [...s0.users, { id: 'u-anna', login: '', name: 'Anna Muster', dept: 'Sales', source: 'manual', role: 'none', active: true }],
  objs: [dev('a1', 'NB-ANNA', { uid: 'u-anna' }), dev('n1', 'NB-NOLOC-1', { loc: '' }), dev('n2', 'NB-NOLOC-2', { loc: '' }), dev('m1', 'NB-GONE')],
  stocktakes: [{ id: 'st1', name: 'Stocktake test', scope: 'Bern', started: '2026-10-01T08:00:00Z', by: 'admin', finished: '2026-10-01T09:00:00Z', finishedBy: 'admin',
    result: { total: 2, confirmed: 1, missing: [{ id: 'm1', name: 'NB-GONE', code: 'INV-m1', loc: 'Bern / EG' }], moved: [], unknown: [] } }] });
const until = async (check, ms = 8000) => { const t0 = Date.now(); while (!(await check())) { if (Date.now() - t0 > ms) throw new Error('not in time: ' + check); await new Promise(r => setTimeout(r, 100)); } };

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const shots = process.env.NI_SHOTS || '';
try {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); localStorage.setItem('ni-start-hidden', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(() => p.evaluate(async () => !!(await import('/js/01-core.js')).st.meId));
  const go = (patch) => p.evaluate(async patch => { const c = await import('/js/01-core.js'); const v = await import('/js/02-views.js'); v.resetFilters(); Object.assign(c.st, patch); (await import('/js/07-render.js')).render(); }, patch);

  // the sidebar: on the Overview none, on the Table it is there
  await p.click('#tabsbar [data-tab=overview]'); await p.waitForSelector('.panelbox');
  assert.equal(await p.isVisible('#side'), false, 'no sidebar on the Overview');
  await go({ tab: 'table' });
  assert.equal(await p.isVisible('#side'), true, 'the sidebar on the Table');

  // data quality: no location → Location next to Name, Select all, then Move to location has the focus
  await go({ tab: 'table', quality: 'noloc', live: true });
  await p.waitForSelector('#fbar .fb-qfix');
  const heads = await p.$$eval('#view table.grid[data-data] thead th', ths => ths.map(t => t.textContent.trim()));
  assert.equal(heads[heads.indexOf('Name') + 1], 'Location', 'the column of the check comes next to Name: ' + heads.join(', '));
  if (shots) await p.screenshot({ path: path.join(shots, 'quality.png') });
  await p.click('#qfixSel');
  await until(() => p.evaluate(() => document.activeElement && document.activeElement.id === 'bkLoc'));
  assert.match(await p.textContent('.pick-n'), /2 selected/);
  await p.selectOption('#bkLoc', 'Bern / OG');
  await until(() => p.evaluate(async () => (await import('/js/01-core.js')).objs.filter(o => o.loc === 'Bern / OG').length === 2));

  // the check taken off: the Table's own layout is back, Location not next to Name any more
  await go({ tab: 'table' });
  const back = await p.$$eval('#view table.grid[data-data] thead th', ths => ths.map(t => t.textContent.trim()));
  assert.notEqual(back[back.indexOf('Name') + 1], 'Location', 'the moved column does not stay: ' + back.join(', '));
  assert.equal(await p.locator('#fbar .fb-qfix').count(), 0);

  // the Report… button of a filtered Table: only the listed devices
  await go({ tab: 'table', q: 'NB-ANNA' });
  await p.click('#rpBtn'); await p.waitForSelector('#rpOnly');
  assert.match(await p.textContent('label:has(#rpOnly)'), /Only the 1 device/);
  // the hand-back list: by person, and the files only once a person is picked
  await p.check('[name=rpKind][value=handback]');
  assert.equal(await p.isVisible('#rpPerson'), true);
  assert.equal(await p.isVisible('label:has(#rpOnly)'), false, 'no list choice for the hand-back list');
  assert.equal(await p.getAttribute('#rpPdf', 'aria-disabled'), 'true');
  await p.selectOption('#rpPerson', 'u-anna');
  assert.match(await p.getAttribute('#rpPdf', 'href'), /handback\?.*id=u-anna/);
  if (shots) await p.screenshot({ path: path.join(shots, 'reports.png') });
  await p.check('[name=rpKind][value=inventory]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#rpXlsx')]);
  assert.match(dl.suggestedFilename(), /^nobs-inventory-.*\.xlsx$/);
  await p.click('#rpCancel');

  // a finished stocktake: Show missing lists them in the Table
  await go({ tab: 'stocktake' });
  await p.click('[data-stkmiss="st1"]');
  await until(() => p.evaluate(async () => (await import('/js/01-core.js')).st.tab === 'table'));
  const rows = await p.$$eval('#view table.grid[data-data] tbody tr', trs => trs.map(t => t.dataset.open));
  assert.deepEqual(rows, ['m1']);
  assert.match(await p.textContent('#fbar'), /Missing in Stocktake test/);

  // a new object: a notebook for nobody goes into stock, given to someone it is in use
  await p.evaluate(async () => (await import('/js/05-new-object.js')).newObjModal({ type: 'notebook' }));
  await p.waitForSelector('#nUser');
  assert.equal(await p.inputValue('#nStatus'), 'stock');
  await p.selectOption('#nUser', 'u-anna');
  assert.equal(await p.inputValue('#nStatus'), 'active');
  assert.equal(await p.locator('#nUser option', { hasText: 'Administrator' }).count(), 0, 'the built-in admin is no user of devices');
  await p.fill('#nName', 'NB-NEW-77');
  await p.click('#nOk');
  await until(() => p.evaluate(async () => { const o = (await import('/js/01-core.js')).objs.find(x => x.name === 'NB-NEW-77'); return !!o && o.uid === 'u-anna' && o.user === 'Anna Muster' && o.status === 'active'; }));

  // an entry sheet from a device: only that device ticked, no password; made and printed without one
  await p.evaluate(() => { window.print = () => {}; });
  await p.evaluate(async () => { const s = await import('/js/04-settings.js'); (await import('/js/08-sheets.js')).sheetModal(s.USERS.find(u => u.id === 'u-anna'), null, { only: 'a1' }); });
  await p.waitForSelector('#sheetPwOn');
  assert.equal(await p.isChecked('#sheetPwOn'), false, 'from a device: no new password unless wanted');
  assert.equal(await p.isChecked('[data-sdev="a1"]'), true);
  assert.equal(await p.locator('[data-sdev]:checked').count(), 1, 'only the device it was opened from');
  await p.click('#sheetMake');
  await p.waitForSelector('.sheet-acts');
  assert.equal(await p.textContent('#sheetErr'), '', 'no error after making it');
  assert.match(await p.textContent('#mdl'), /No password/);
  assert.equal(await p.isChecked('#sheetPwOn'), false, 'the dialog drawn again keeps the choice');
  await p.click('#sheetClose');

  // on a phone: Settings → Users as cards, each cell named
  await p.setViewportSize({ width: 390, height: 800 });
  await go({ tab: 'table' });
  await p.evaluate(async () => { (await import('/js/01-core.js')).st.setTab = 'users'; (await import('/js/04-settings.js')).openSettings(); });
  await p.waitForSelector('#setUsers table.stack tbody tr');
  await until(() => p.evaluate(() => [...document.querySelectorAll('#setUsers table.stack > tbody > tr > td')].some(td => td.dataset.label === 'Login')));
  assert.equal(await p.isVisible('#setUsers table.stack thead'), false, 'no header row on a phone');
  const wide = await p.evaluate(() => { const t = document.querySelector('#setUsers table.stack'); return t.scrollWidth <= t.parentElement.clientWidth + 1; });
  assert.ok(wide, 'the cards fit the phone');
  if (shots) await p.screenshot({ path: path.join(shots, 'phone-users.png') });

  assert.deepEqual(errors, []);
  console.log('optimizations: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
