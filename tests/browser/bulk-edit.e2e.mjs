/* Browser test of Edit fields… for several devices: three picked in the Table, the supplier set and the notes cleared,
   the preview checked (with the note on a field Lansweeper writes), applied with a history line per device and field
   that the device page can restore, then all of it undone at once. A bad day stops the edit. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { eventually, until } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-bulkedit-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, extra = {}) => ({ id, code: 'INV-' + id, type: 'pc', name: 'PC-' + id, status: 'active', loc: 'Bern / EG', ovr: {}, feed: null, ...extra });
saveState(db, { ...loadState(db), locs: ['Bern / EG'], sites: ['Bern'], currency: 'CHF',
  objs: [dev('p1', { supplier: 'Alpha', notes: 'Spare charger in the drawer' }),
    dev('p2', { supplier: 'Beta', notes: 'Old note', pick: { supplier: 'ls' }, feed: { sys: 'Lansweeper', ref: 'r2', seen: '01.11.2026 08:00' } }),
    dev('p3'), dev('p4', { supplier: 'Delta', notes: 'Not picked' })] });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-start-hidden', '1'); localStorage.setItem('ni-started', '1'); localStorage.setItem('ni-all-fields', '1'); localStorage.setItem('ni-hist-open', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => !!(await import('/js/01-core.js')).st.meId);
  const stored = id => loadState(db).objs.find(o => o.id === id);

  // three picked in the Table: Edit fields… in the actions
  await p.evaluate(async () => { (await import('/js/01-core.js')).st.tab = 'table'; (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('table.grid');
  for (const id of ['p1', 'p2', 'p3']) await p.check(`[data-sel=${id}]`);
  await p.selectOption('#bkAct', 'edit');
  await p.waitForSelector('#beRows .be-row');
  assert.match(await p.textContent('#mdl .mh'), /Edit fields of 3 devices/);
  assert.match(await p.textContent('#mdl .mb'), /Name, serial number, IP address and MAC address are not offered: each device has its own/);
  const offered = await p.$$eval('#beRows .be-f option', os => os.map(o => o.value));
  assert.deepEqual(offered.filter(k => ['name', 'serial', 'ip', 'mac'].includes(k)), [], 'unique fields are not offered');
  assert.ok(['model', 'supplier', 'purchased', 'warranty', 'price', 'invoice', 'os', 'notes'].every(k => offered.includes(k)));

  // supplier set, notes cleared
  await p.selectOption('.be-row:nth-child(1) .be-f', 'supplier');
  await p.fill('#be_v0_supplier', 'Acme');
  await p.click('#beAdd');
  await p.selectOption('.be-row:nth-child(2) .be-f', 'notes');
  await p.selectOption('.be-row:nth-child(2) .be-op', 'clear');
  const prev = await p.textContent('#bePrev');
  assert.match(prev, /Supplier: 3 of 3 devices change/);
  assert.match(prev, /1 device takes this from Lansweeper: setting it here keeps your value/);
  assert.match(prev, /PC-p1\s*Alpha\s*→\s*Acme/);
  assert.match(prev, /PC-p3\s*empty\s*→\s*Acme/);
  assert.match(prev, /Notes: 2 of 3 devices cleared \(1 already empty\)/);
  assert.match(prev, /PC-p1\s*Spare charger in the drawer\s*→\s*empty/);
  assert.equal(await p.textContent('#beOk'), 'Apply to 3 devices');

  // a day that is not one stops it, until the row is taken out again
  await p.click('#beAdd');
  await p.selectOption('.be-row:nth-child(3) .be-f', 'purchased');
  await p.fill('.be-row:nth-child(3) .be-v input[data-date]', '31.13.2026');
  await until(p, () => /is not a day/.test(document.querySelector('#bePrev').textContent));
  assert.equal(await p.isDisabled('#beOk'), true);
  await p.click('.be-row:nth-child(3) .be-x');
  assert.equal(await p.isDisabled('#beOk'), false);

  await p.click('#beOk');
  await eventually(() => ['p1', 'p2', 'p3'].every(id => stored(id).supplier === 'Acme'));
  await eventually(() => !stored('p1').notes && !stored('p2').notes);
  assert.equal(stored('p4').supplier, 'Delta', 'a device not picked is left alone');
  assert.equal(stored('p4').notes, 'Not picked');
  assert.equal(stored('p2').pick.supplier, 'hand', 'set here: kept from the sync');
  assert.equal(stored('p1').src.supplier, 'hand');
  assert.match(await p.textContent('#toast'), /3 devices changed: Supplier, Notes/);

  // one history line per device and field, with both values
  const hist = loadState(db).history;
  const line = (id, f) => (hist[id] || []).filter(h => h.f === f);
  assert.equal(line('p1', 'supplier').length, 1);
  assert.deepEqual({ ...line('p1', 'supplier')[0], t: '' }, { t: '', msg: 'Supplier changed from Alpha to Acme by Administrator (bulk)', f: 'supplier', from: 'Alpha', to: 'Acme' });
  assert.match(line('p2', 'supplier')[0].msg, /Supplier changed from Beta to Acme by Administrator \(bulk\) · kept from the syncs/);
  assert.deepEqual({ ...line('p3', 'supplier')[0], t: '' }, { t: '', msg: 'Supplier set to Acme by Administrator (bulk)', f: 'supplier', to: 'Acme' });
  assert.deepEqual({ ...line('p1', 'notes')[0], t: '' }, { t: '', msg: 'Notes cleared (was Spare charger in the drawer) by Administrator (bulk)', f: 'notes', from: 'Spare charger in the drawer' });
  assert.equal(line('p3', 'notes').length, 0, 'no line where nothing changed');

  // the device page offers Restore on those lines
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('p1'));
  await p.waitForSelector('#f_p1_supplier');
  assert.equal(await p.locator('.hist li', { hasText: 'Supplier changed from Alpha to Acme' }).locator('[data-hrestore]').count(), 1);
  assert.equal(await p.locator('.hist li', { hasText: 'Notes cleared' }).locator('[data-hrestore]').count(), 1);

  // one Undo for the whole edit
  await p.click('#toast .t-undo');
  await eventually(() => stored('p1').supplier === 'Alpha' && stored('p2').supplier === 'Beta' && stored('p3').supplier === undefined);
  assert.equal(stored('p1').notes, 'Spare charger in the drawer');
  assert.equal(stored('p2').notes, 'Old note');
  assert.equal(stored('p2').pick.supplier, 'ls', 'the source picked before is back');
  assert.match(loadState(db).history.p3[0].msg, /Bulk edit undone by Administrator/);

  // Cards picked: the same dialog from their bar
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.bulk = new Set(['p1', 'p4']); c.st.tab = 'cards'; (await import('/js/07-render.js')).view(); });
  await p.click('#cdEdit');
  await p.waitForSelector('#beRows .be-row');
  assert.match(await p.textContent('#mdl .mh'), /Edit fields of 2 devices/);
  await p.click('#beNo');
  assert.deepEqual(errors, []);
  console.log('bulk-edit: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
