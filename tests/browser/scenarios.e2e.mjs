/* Scenarios through the page, on a server that holds the sample inventory: connect objects with ports, edit and
   save, plug a new object into a port, retire, move and mount in racks, import CSV, relation delete, LDAP status,
   a Lansweeper export through the feed, and that edits survive a reload. Each step clicks the controls a person
   would use; the state is read back only to confirm the result. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import { loadState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-scen-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const page = async (ctx) => { const p = await ctx.newPage(); p.on('pageerror', e => { errors.push(e.message); console.error('page error:', e.stack || e.message); }); return p; };
const ctxOpts = { viewport: { width: 1400, height: 900 } };
const signIn = async (p) => { await p.goto(base + '/'); await p.waitForSelector('#lgUser'); await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk'); await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); }); };

// Opens an object's page the way a person does: find it in the table and click its name.
const openByName = async (p, name) => {
  await p.click('#tabsbar [data-tab=table]');
  await p.locator('table.grid td b', { hasText: new RegExp(`^${name}$`) }).first().click();
  await until(p, async n => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName(n) && __mods[0].st.tab === __mods[0].byName(n).id); }, name);
};
const waitServer = async (fn, what) => { for (let i = 0; i < 60; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 100)); } assert.fail('the server did not get: ' + what); };
const state = (p, fn, arg) => p.evaluate(fn, arg);
const idOf = (p, name) => state(p, async n => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName(n).id); }, name);

try {
  const ctx = await browser.newContext(ctxOpts);
  const p = await page(ctx);
  await signIn(p);

  // Connect a PC to a switch port, and refuse a port that is taken.
  await openByName(p, 'ZH-NB-0201');
  await p.selectOption('#arKind', 'connected');
  await p.selectOption('#arTo', await idOf(p, 'SW-ZH-2OG-01'));
  await p.fill('#arPort', '7'); await p.click('#arAdd');
  await p.waitForSelector('.relrow:has-text("SW-ZH-2OG-01")');
  assert.ok(await state(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].rels.some(r => r.from === __mods[0].byName('ZH-NB-0201').id && r.port === 7)); }), 'the relation was not stored with port 7');
  await p.selectOption('#arKind', 'connected'); await p.selectOption('#arTo', await idOf(p, 'SW-ZH-2OG-01'));   /* the page redraws, so the form starts again */
  await p.fill('#arPort', '7'); await p.click('#arAdd');
  await p.waitForFunction(() => /already taken/.test(document.querySelector('#toast').textContent));
  assert.equal(await state(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].rels.filter(r => r.to === __mods[0].byName('SW-ZH-2OG-01').id && r.port === 7).length); }), 1, 'a taken port was added twice');

  // Edit: change the model, save, and check the new value is stored.
  await openByName(p, 'ZH-PC-0142');
  const id = await idOf(p, 'ZH-PC-0142');
  await p.fill(`#f_${id}_model`, 'SCENARIO MODEL'); await p.waitForSelector('#saveBtn:not([disabled])');
  await p.click('#saveBtn');
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('ZH-PC-0142').model === 'SCENARIO MODEL'); });

  // A new object plugged into a port from the New object dialog (port 15 is free in the sample).
  await p.click('#newBtn'); await p.waitForSelector('#nName');
  await p.fill('#nName', 'SCEN-SIP-1'); await p.selectOption('#nType', 'sip');
  await p.selectOption('#nUp', await idOf(p, 'SW-ZH-2OG-01')); await p.fill('#nPort', '15'); await p.click('#nOk');
  assert.ok(await state(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].rels.some(r => r.from === __mods[0].byName('SCEN-SIP-1').id && r.port === 15)); }), 'the new object was not plugged into port 15');

  // Delete a relation from the object page.
  const before = await state(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].rels.length); });
  await openByName(p, 'ZH-NB-0201');
  await p.locator('.relrow', { hasText: 'SW-ZH-2OG-01' }).locator('[data-delrel]').click();
  assert.equal(await state(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].rels.length); }), before - 1, 'the relation was not removed');

  // Delete an object for good: it leaves the inventory with its relations.
  await openByName(p, 'SCEN-SIP-1');
  const sipId = await idOf(p, 'SCEN-SIP-1');
  await p.click('details.menu > summary'); await p.click('#purgeBtn'); await p.click('#pgOk');
  assert.equal(await state(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('SCEN-SIP-1') === undefined); }), true, 'the object was not deleted');
  assert.equal(await state(p, async id => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].rels.some(r => r.from === id || r.to === id)); }, sipId), false, 'the deleted object still has relations');
  // Retire an object.
  await openByName(p, 'MON-0433');
  await p.click('details.menu > summary'); await p.click('#delBtn'); await p.click('#rtOk');
  assert.equal(await state(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('MON-0433').status); }), 'retired', 'the object was not retired');

  // Rack: a new switch is mounted at U10, then moved to the other rack at U3 from its object page.
  await p.click('#newBtn'); await p.waitForSelector('#nName');
  await p.fill('#nName', 'SCEN-SW-1'); await p.selectOption('#nType', 'switch'); await p.click('#nOk');
  await p.click('#tabsbar [data-tab=rack]');
  await p.click('#rkMount'); await p.waitForSelector('#mdDev');
  await p.selectOption('#mdDev', await idOf(p, 'SCEN-SW-1')); await p.fill('#mdU', '10'); await p.click('#mdOk');
  assert.equal(await state(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('SCEN-SW-1').rack); }), 'R-SRV', 'the device was not mounted in the rack');
  await openByName(p, 'SCEN-SW-1');
  await p.selectOption('[data-rk=rack]', 'R-2OG'); await p.fill('[data-rk=u]', '3');
  await p.click('#saveBtn');
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('SCEN-SW-1').rack === 'R-2OG'); });
  assert.equal(await state(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('SCEN-SW-1').u); }), 3, 'the device did not move to U3');

  // CSV import through the dialog.
  await p.click('#tabsbar [data-tab=table]'); await p.click('#csvImp'); await p.waitForSelector('#csvText');
  await p.fill('#csvText', 'name,type,model\nCSV-A,pc,Model A\nCSV-B,sip,Model B');
  await p.waitForSelector('#csvGo:not([disabled])'); await p.click('#csvGo');
  assert.ok(await state(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (!!__mods[0].byName('CSV-A') && !!__mods[0].byName('CSV-B')); }), 'the CSV rows were not imported');

  // LDAP: without a server address the test and sync are off; an address saved here is used by the server.
  await p.click('#setBtn'); await p.click('#setTabs [data-st=directory]');
  assert.equal(await p.isDisabled('#ldapSync'), true, 'the LDAP sync is on without a server address');
  await p.fill('#lk_url', 'ldaps://127.0.0.1:1'); await p.press('#lk_url', 'Tab');
  await waitServer(() => loadState(db).ldap && loadState(db).ldap.url === 'ldaps://127.0.0.1:1', 'the LDAP address');
  await p.click('#ldapTest');
  await p.waitForFunction(() => document.querySelector('#ldapMsg').textContent.length > 0, null, { timeout: 15000 });
  assert.ok(!(await p.textContent('#setLdap')).includes('NI_LDAP_URL'), 'the pane still asks for environment variables');
  await p.click('#setClose');

  // Feed: a Lansweeper export creates an object; a second export with a new IP updates it.
  await p.click('#setBtn'); await p.click('#setTabs [data-st=feed]');
  const csv1 = path.join(dir, 'feed1.csv');
  fs.writeFileSync(csv1, 'AssetName,Serial,IPAddress,OS\nFEED-PC-1,SN-FEED-1,10.1.1.5,Windows 11\n');
  await p.setInputFiles('#feedUp', csv1);
  await p.waitForFunction(() => /Import: 1 new/.test(document.querySelector('#toast').textContent));
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.some(o => o.name === 'FEED-PC-1')); });
  assert.equal(await state(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('FEED-PC-1').ip); }), '10.1.1.5', 'the feed did not set the IP');
  const csv2 = path.join(dir, 'feed2.csv');   /* a new file name, so the input reports a change */
  fs.writeFileSync(csv2, 'AssetName,Serial,IPAddress,OS\nFEED-PC-1,SN-FEED-1,10.1.1.9,Windows 11\n');
  await p.setInputFiles('#feedUp', csv2);
  await p.waitForFunction(() => /1 updated/.test(document.querySelector('#toast').textContent));
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('FEED-PC-1').ip === '10.1.1.9'); }, null, { timeout: 5000 });   /* the page reloads the new values just after the message */
  await p.click('#setClose');
  await ctx.close();

  // An edit is kept after a reload.
  const ctx2 = await browser.newContext(ctxOpts);
  const q = await page(ctx2);
  await signIn(q);
  await openByName(q, 'SRV-ZH-HV01');
  const kid = await idOf(q, 'SRV-ZH-HV01');
  await q.fill(`#f_${kid}_model`, 'KEPT MODEL'); await q.click('#saveBtn');
  await until(q, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('SRV-ZH-HV01').model === 'KEPT MODEL'); });
  await until(q, async () => (await (await fetch('api/state', { credentials: 'same-origin' })).json()).objs.find(o => o.name === 'SRV-ZH-HV01')?.model === 'KEPT MODEL', null, { timeout: 10000, polling: 200 });
  await q.reload(); await q.waitForSelector('#lgUser, #tabsbar');
  if (await q.isVisible('#lgUser')) { await q.fill('#lgUser', 'admin'); await q.fill('#lgPw', 'adminpass123'); await q.click('#lgOk'); }
  await until(q, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); }, null, { timeout: 10000 });
  assert.equal(await state(q, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('SRV-ZH-HV01').model); }), 'KEPT MODEL', 'the edit was not kept after reload');
  assert.equal(await state(q, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('SCEN-SIP-1') === undefined); }), true, 'a deleted object came back after reload');
  await ctx2.close();

  assert.deepEqual(errors, [], 'page errors');
  console.log('browser scenarios: all checks passed');
} finally {
  await browser.close(); await new Promise(r => server.close(r)); db.close();
}
