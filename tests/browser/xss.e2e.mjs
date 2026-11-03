/* Browser test that names are text, never markup: a device, a person, a contact and a contract named like an image tag
   with a script, shown in the main views, the device page, the search and Settings, put no image in the page and run
   nothing. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { openSetTab } from './until.mjs';

const BAD = '<img src=x onerror=alert(1)>';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-xss-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const loc = `Bern / ${BAD}`;
saveState(db, { ...s0, locs: [loc],
  contacts: [{ id: 'k1', kind: 'external', name: 'Kim ' + BAD, company: 'Firm ' + BAD, role: BAD, email: 'k@example.ch', note: BAD }],
  contracts: [{ id: 'c1', name: 'Support ' + BAD, kind: 'support', supplier: BAD, end: '2027-12-31', renew: 12, notice: 3, cost: 100, per: 'year', devices: ['o1'], contacts: ['k1'], note: BAD }],
  licences: [{ id: 'l1', name: 'Office ' + BAD, seats: 1 }],
  objs: [
    { id: 'o1', code: 'INV-0001', type: 'switch', name: 'SW ' + BAD, status: 'active', ovr: {}, feed: null, loc, model: BAD, serial: BAD, ports: 8, ip: '10.0.0.5', uid: 'ldap-amu', respEx: 'k1',
      notes: BAD, software: [{ name: 'Office ' + BAD, version: BAD }], urls: [{ url: 'https://example.ch', label: BAD }], maint: [{ id: 'm1', what: BAD, every: 1, unit: 'y', due: '2026-12-01' }] },
    { id: 'o2', code: 'INV-0002', type: 'pc', name: 'PC ' + BAD, status: 'active', ovr: {}, feed: null, loc, uid: 'ldap-amu', software: [{ name: 'Office ' + BAD, version: '1' }] },
    { id: 'R1', code: 'INV-0901', type: 'rack', name: 'Rack ' + BAD, status: 'active', ovr: {}, feed: null, loc, units: 12 },
    { id: 'o3', code: 'INV-0003', type: 'server', name: 'SRV ' + BAD, status: 'active', ovr: {}, feed: null, loc, rack: 'R1', u: 3, h: 2 },
  ],
  rels: [{ id: 'l1', from: 'o2', to: 'o1', kind: 'connected', port: 2, lag: null, vlan: null }],
  history: { o1: [{ t: '02.09.2026 14:30', msg: 'Created ' + BAD }] },
  users: [...s0.users, { id: 'ldap-amu', login: 'amu', name: 'Anna ' + BAD, dept: BAD, source: 'ldap', role: 'viewer', groups: [BAD], active: true, profile: { title: BAD, office: BAD, from: 'ldap' } }] });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); localStorage.setItem('ni-all-fields', '1'); } catch { /* none in previews */ } });
const page = await ctx.newPage();
const errors = [], dialogs = [];
page.on('pageerror', e => errors.push(e.message));
page.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
/* No image of the name anywhere, and nothing ran: checked after each view. */
const clean = async where => {
  await page.waitForTimeout(150);
  assert.equal(await page.locator('img[src="x"]').count(), 0, `an image from a name in ${where}`);
  assert.deepEqual(dialogs, [], `a script ran in ${where}`);
};
const tab = async t => { await page.evaluate(async t => { (await import('/js/01-core.js')).st.tab = t; (await import('/js/07-render.js')).view(); }, t); await clean(t); };
try {
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForSelector('.card');
  assert.match(await page.textContent('.card[data-open=o1] .nm'), /<img src=x onerror=alert\(1\)>/, 'the name shows as text');
  await clean('cards');
  for (const t of ['table', 'overview', 'map', 'plans', 'net', 'rack', 'sw', 'contracts', 'contacts', 'stocktake']) await tab(t);
  for (const id of ['o1', 'o2', 'o3', 'R1']) { await page.evaluate(async id => (await import('/js/02-views.js')).openObj(id), id); await clean('the page of ' + id); }
  assert.match(await page.textContent('#objTitle'), /<img src=x/);
  // the contract and the contact in their dialogs
  await tab('contracts'); await page.click('[data-contract=c1]'); await page.waitForSelector('#ctName'); await clean('the contract dialog');
  assert.equal(await page.inputValue('#ctName'), 'Support ' + BAD);
  await page.click('#ctCancel');
  await tab('contacts'); await page.click('[data-cnedit=k1]'); await page.waitForSelector('#cn_name'); await clean('the contact dialog');
  await page.click('#cnCancel');
  // a person's devices, the search, and Settings → Users
  await page.evaluate(async () => (await import('/js/04-settings.js')).showDevicesOf('ldap-amu')); await clean('a person\'s devices');
  await page.fill('#search', 'img'); await page.waitForTimeout(300); await clean('the search');
  await page.fill('#search', '');
  await page.click('#setBtn'); await openSetTab(page, 'users'); await page.waitForSelector('#setUsers table'); await clean('Settings → Users');
  await openSetTab(page, 'locations'); await clean('Settings → Locations');
  assert.deepEqual(errors, []);
  console.log('names as text: all checks passed');
} finally { await browser.close(); server.close(); }
