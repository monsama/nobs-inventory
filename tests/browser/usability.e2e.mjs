/* Browser test of the usability round: what filters are in force, retiring that clears what a device holds (with
   Undo), a new person given a device, saving said in the toolbar, the floor plan finding and placing devices, the
   keyboard, the sidebar, the Ports default, the New object dialog and contract notice dates. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-ux-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const o = (id, type, name, extra = {}) => ({ id, code: 'INV-' + id, type, name, status: 'active', loc: 'HQ / Hall', ovr: {}, feed: null, ...extra });
const pad = n => String(n).padStart(2, '0'), d = new Date(Date.now() + 20 * 864e5);
const s0 = loadState(db);
saveState(db, { ...s0, locs: ['HQ / Hall', 'Branch / Office'], sites: ['HQ', 'Branch'],
  users: [...s0.users, { id: 'u-jdoe', login: '', name: 'Jane Doe', dept: 'Sales', role: 'viewer', groups: [], source: 'manual', active: true }],
  objs: [
    o('sw1', 'switch', 'SW-CORE', { ports: 24, sfp: 4, pfx: '1/' }),
    o('srv1', 'server', 'SRV-APP', { ports: 4 }),
    o('nb1', 'notebook', 'NB-0001', { uid: 'u-jdoe', planPos: { plan: 'pl1', x: 30, y: 30 }, respEx: 'k1' }),
    o('mon1', 'monitor', 'MON-0001'),
    o('nb2', 'notebook', 'NB-0002', { loc: 'Branch / Office' }),
  ],
  rels: [{ id: 'r1', from: 'nb1', to: 'sw1', kind: 'connected', port: 3 }, { id: 'r2', from: 'mon1', to: 'nb1', kind: 'attached', port: null }],
  plans: [{ id: 'pl1', name: 'EG', site: 'HQ', areas: [{ id: 'a1', name: 'Hall', room: 'HQ / Hall', x: 5, y: 5, w: 60, h: 60, rects: [{ x: 5, y: 5, w: 60, h: 60 }] }] }],
  contacts: [{ id: 'k1', kind: 'external', name: 'Peter Partner', company: 'IT Partner AG' }],
  /* Renews on the 20th day from now with 3 months' notice: the notice date has passed. */
  contracts: [{ id: 'c1', name: 'Lease NB', kind: 'lease', per: 'month', cost: 50, renew: 12, notice: 3, end: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, devices: ['nb1'] }],
  history: {} });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', dlg => dlg.accept());
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  const core = (f, arg) => p.evaluate(f, arg);
  const obj = id => core(async id => { const c = await import('/js/01-core.js'); return JSON.parse(JSON.stringify(c.byId(id))); }, id);

  // 7. types without devices are folded; the list can show them
  assert.match(await p.textContent('#typeList'), /\+ \d+ more types without devices/);
  assert.equal(await p.locator('#typeList [data-type=modem]').count(), 0);
  await p.click('#typeList [data-alltypes="1"]');
  assert.equal(await p.locator('#typeList [data-type=modem]').count(), 1);

  // 1. the filters in force show over the list, each taken off on its own
  await p.click('#tabsbar [data-tab=cards]');
  await p.click('#typeList [data-type=notebook]');
  await p.fill('#search', 'NB-0002');
  await p.waitForSelector('#fbar:not([hidden])');
  assert.match(await p.textContent('#fbar'), /Type: Notebook.*Search: “NB-0002”.*Clear all/s);
  assert.equal(await p.locator('#typeList .item.sel[data-type=""]').count(), 0, '"All objects" is not marked while a filter is on');
  await p.click('#fbar [data-fx=type]');
  assert.equal(await core(async () => (await import('/js/01-core.js')).st.type), null);
  assert.match(await p.textContent('#fbar'), /Search/);
  await p.click('#fbar [data-fx=q]');
  await p.waitForSelector('#fbar[hidden]', { state: 'attached' });
  assert.equal(await p.inputValue('#search'), '');

  // 6. Enter in the search opens the one object found; its name takes the focus
  await p.fill('#search', 'SRV-APP'); await p.press('#search', 'Enter');
  await p.waitForSelector('#objTitle');
  assert.equal(await core(() => document.activeElement.id), 'objTitle');
  await p.fill('#search', ''); await p.dispatchEvent('#search', 'input');

  // 8. Ports opens on the switch, not on the server that comes first
  await core(async () => { const c = await import('/js/01-core.js'); c.st.portsDevice = null; try { localStorage.removeItem('ni-ports-device'); } catch { /* not kept */ } });
  await p.click('#tabsbar [data-tab=net]');
  assert.equal(await p.inputValue('#portsDevice'), 'sw1');

  // 9. New object on the switch's page: plugged into it, the port picked from the free ones, a taken one said at the field
  await core(async () => (await import('/js/02-views.js')).openObj('sw1'));
  await core(async () => (await import('/js/05-new-object.js')).newObjModal());
  assert.equal(await p.inputValue('#nLoc'), 'HQ / Hall', 'the place of the device it was opened on');
  assert.equal(await p.inputValue('#nUp'), 'sw1');
  await p.click('#nPort'); await p.press('#nPort', 'ArrowDown');
  const offered = await p.$$eval('#nPort_list li', ls => ls.map(l => l.textContent));
  assert.ok(offered.includes('1/1') && !offered.includes('1/3') && offered.includes('1/25 (SFP)'), offered.slice(0, 5).join());
  await p.press('#nPort', 'Escape');
  await p.fill('#nName', 'NB-0003'); await p.selectOption('#nType', 'notebook'); await p.selectOption('#nUp', 'sw1'); await p.fill('#nPort', '3');
  await p.press('#nName', 'Enter');   /* Enter does what Create does */
  await p.waitForSelector('#nPortNote:not([hidden])');
  assert.match(await p.textContent('#nPortNote'), /Port 3 on SW-CORE is already taken/);
  await p.fill('#nPort', '7'); await p.press('#nPort', 'Enter');
  await until(p, async () => (await import('/js/01-core.js')).objs.some(o => o.name === 'NB-0003'));
  await p.keyboard.press('Escape');
  // from the Cards (no device open), there is no location unless one is picked
  await p.click('#tabsbar [data-tab=cards]');
  await core(async () => (await import('/js/05-new-object.js')).newObjModal());
  assert.equal(await p.inputValue('#nLoc'), '');
  await p.click('#nCancel');

  // 4. saving is said in the toolbar: Save shows only while a field holds a change
  await core(async () => (await import('/js/02-views.js')).openObj('nb2'));
  await p.waitForSelector('#objSaved', { state: 'attached' });   /* empty until it is first saved here */
  assert.equal(await p.isVisible('#saveBtn'), false);
  await p.fill('#f_nb2_model', 'ThinkPad T14');
  assert.equal(await p.isVisible('#saveBtn'), true);
  assert.match(await p.textContent('#objSaved'), /Not saved yet/);
  await p.press('#f_nb2_model', 'Tab');
  await until(p, () => /^Saved \d\d:\d\d$/.test(document.querySelector('#objSaved').textContent));
  assert.equal(await p.isVisible('#saveBtn'), false);

  // 3. a new person, added from the device and given it in one step
  await p.selectOption('#f_nb2_user', '__new');
  await p.waitForSelector('#npFirst');
  await p.fill('#npFirst', 'Max'); await p.fill('#npLast', 'Neu'); await p.fill('#npDept', 'IT');
  await p.click('#npOk');
  await until(p, async () => { const c = await import('/js/01-core.js'); return c.byId('nb2').user === 'Max Neu'; });

  // 10. a renewal whose notice date has passed is amber, and the due ones can be shown alone
  await p.click('#tabsbar [data-tab=contracts]');
  assert.match(await p.textContent('.contracts tbody'), /Notice passed · renews/);
  assert.match(await p.textContent('#ctDueBtn'), /1 notice passed/);

  // 5. the device's page leads to its plan, where it is marked; pins carry names
  await core(async () => (await import('/js/02-views.js')).openObj('nb1'));
  await p.click('#onPlanBtn');
  await p.waitForSelector('[data-pin=nb1].flash');
  assert.match(await p.textContent('[data-pin=nb1] .pl-code'), /NB-0001/);
  // the top search stays on the plan and marks what it finds
  await p.fill('#search', 'NB-0001');
  assert.equal(await core(async () => (await import('/js/01-core.js')).st.tab), 'plans');
  await p.waitForSelector('#plCanvas.searching [data-pin=nb1].hit');
  await p.fill('#search', ''); await p.dispatchEvent('#search', 'input');
  // placing a device of another site asks first
  await core(async () => { const r = await import('/js/07-render-plans.js'), c = await import('/js/01-core.js'); r.placeDevice(c.PLANS[0], c.byId('nb2'), 20, 20); });
  await p.waitForSelector('#pmOk');
  assert.match(await p.textContent('#mdl'), /NB-0002 is in Branch \/ Office.*HQ \/ Hall/s);
  await p.click('#pmOk');
  await until(p, async () => (await import('/js/01-core.js')).byId('nb2').loc === 'HQ / Hall');

  // 2. retiring clears what the device holds, with a reason; Undo puts it all back
  await core(async () => (await import('/js/02-views.js')).openObj('nb1'));
  await p.click('details.menu > summary'); await p.click('#delBtn');
  await p.waitForSelector('.rt-ties');
  assert.equal(await p.locator('.rt-ties input:checked').count(), 6, 'user, port, attached monitor, plan, contract, responsible');
  await p.fill('#rtWhy', 'broken screen');
  await p.click('#rtOk');
  await until(p, async () => (await import('/js/01-core.js')).byId('nb1').status === 'retired');
  const gone = await obj('nb1');
  assert.ok(!gone.uid && !gone.planPos && !gone.respEx, 'user, plan and responsible taken off');
  assert.equal(await core(async () => (await import('/js/01-core.js')).rels.filter(r => r.from === 'nb1' || r.to === 'nb1').length), 0);
  assert.deepEqual(await core(async () => (await import('/js/01-core.js')).COSTS.contracts[0].devices), []);
  assert.match(await core(async () => (await import('/js/01-core.js')).HISTORY.nb1[0].msg), /Retired by .*: broken screen/);
  await p.click('#toast .t-undo');
  await until(p, async () => (await import('/js/01-core.js')).byId('nb1').status === 'active');
  const back = await obj('nb1');
  assert.ok(back.uid === 'u-jdoe' && back.planPos && back.respEx === 'k1', 'Undo put the device back as it was');
  assert.equal(await core(async () => (await import('/js/01-core.js')).rels.filter(r => r.from === 'nb1' || r.to === 'nb1').length), 2);
  assert.deepEqual(await core(async () => (await import('/js/01-core.js')).COSTS.contracts[0].devices), ['nb1']);
  // and the server has it as it is now
  await until(p, async () => (await (await fetch('api/state', { credentials: 'same-origin' })).json()).objs.find(o => o.id === 'nb1').status === 'active');

  // an Undo offered before a reload from the server is refused: its records are no longer the page's
  await core(async () => { const c = await import('/js/01-core.js'); c.toastUndo('Test change', () => { window.__undone = true; }); });
  await core(async () => (await import('/js/07-render-plans.js')).reloadFromServer());
  await p.click('#toast .t-undo');
  assert.match(await p.textContent('#toast'), /reloaded since, so this can no longer be undone/);
  assert.equal(await core(() => !!window.__undone), false);
  // an amount above what the server takes is refused on the page, not by every save after it
  assert.equal(await core(async () => (await import('/js/09-costs.js')).num('2000000000') === undefined), true);
  assert.equal(await core(async () => (await import('/js/09-costs.js')).num('1\'200.50')), 1200.5);

  assert.deepEqual(errors, []);
  console.log('usability: all checks passed');
} finally { await browser.close(); server.close(); }
