/* Scenarios through the page: connect objects with ports, edit and save, retire, mount in a rack,
   import CSV, and on a server check that an edit is kept after a reload. Each step clicks the controls
   a person would use; the state is read back only to confirm the result. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const file = 'file://' + path.join(fileURLToPath(new URL('../../public/index.html', import.meta.url)));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-scen-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const page = async (ctx) => { const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); return p; };
const ctxOpts = { viewport: { width: 1400, height: 900 } };

// Opens an object's page the way a person does: find it in the table and click its name.
const openByName = async (p, name) => {
  await p.click('#tabsbar [data-tab=table]');
  await p.locator('table.grid td', { hasText: new RegExp(`^${name}$`) }).first().click();
  await p.waitForFunction(n => byName(n) && st.tab === byName(n).id, name);
};
const state = (p, fn, arg) => p.evaluate(fn, arg);
const idOf = (p, name) => state(p, n => byName(n).id, name);

try {
  // Demo: connect a PC to a switch port, and refuse a port that is taken.
  const ctx = await browser.newContext(ctxOpts);
  const p = await page(ctx);
  await p.goto(file); await p.waitForSelector('#wDemo');
  await p.click('#wDemo'); await p.waitForFunction(() => objs.length > 0);
  await openByName(p, 'ZH-NB-0201');
  await p.selectOption('#arKind', 'connected');
  await p.selectOption('#arTo', await idOf(p, 'SW-ZH-2OG-01'));
  await p.fill('#arPort', '7'); await p.click('#arAdd');
  await p.waitForSelector('.relrow:has-text("SW-ZH-2OG-01")');
  assert.ok(await state(p, () => rels.some(r => r.from === byName('ZH-NB-0201').id && r.port === 7)), 'the relation was not stored with port 7');
  await p.selectOption('#arKind', 'connected'); await p.selectOption('#arTo', await idOf(p, 'SW-ZH-2OG-01'));   /* the page redraws, so the form starts again */
  await p.fill('#arPort', '7'); await p.click('#arAdd');
  await p.waitForFunction(() => /already taken/.test(document.querySelector('#toast').textContent));
  assert.equal(await state(p, () => rels.filter(r => r.to === byName('SW-ZH-2OG-01').id && r.port === 7).length), 1, 'a taken port was added twice');
  // Edit: change the model, save, and check the new value is stored.
  await openByName(p, 'ZH-PC-0142');
  const id = await idOf(p, 'ZH-PC-0142');
  await p.fill(`#f_${id}_model`, 'SCENARIO MODEL'); await p.waitForSelector('#saveBtn:not([disabled])');
  await p.click('#saveBtn');
  await p.waitForFunction(() => byName('ZH-PC-0142').model === 'SCENARIO MODEL');
  // New object plugged into a port through the New object dialog.
  await p.click('#newBtn'); await p.waitForSelector('#nName');
  await p.fill('#nName', 'SCEN-SIP-1'); await p.selectOption('#nType', 'sip');
  await p.selectOption('#nUp', await idOf(p, 'SW-ZH-2OG-01')); await p.fill('#nPort', '15'); await p.click('#nOk');
  assert.ok(await state(p, () => rels.some(r => r.from === byName('SCEN-SIP-1').id && r.port === 15)), 'the new object was not plugged into port 15');
  // Retire an object.
  await openByName(p, 'MON-0433');
  await p.click('details.menu > summary'); await p.click('#delBtn');
  assert.equal(await state(p, () => byName('MON-0433').status), 'retired', 'the object was not retired');
  // Rack: mount a device at U20.
  await p.click('#tabsbar [data-tab=rack]');
  /* every device in the demo is already racked, so a new switch is made first */
  await p.click('#newBtn'); await p.waitForSelector('#nName');
  await p.fill('#nName', 'SCEN-SW-1'); await p.selectOption('#nType', 'switch'); await p.click('#nOk');
  await p.click('#tabsbar [data-tab=rack]');
  await p.click('#rkMount'); await p.waitForSelector('#mdDev');
  const dev = await idOf(p, 'SCEN-SW-1');
  await p.selectOption('#mdDev', dev); await p.fill('#mdU', '10'); await p.click('#mdOk');
  assert.equal(await state(p, d => byId(d).rack, dev), 'R-SRV', 'the device was not mounted in the rack');
  // Delete a relation from the object page.
  const before = await state(p, () => rels.length);
  await openByName(p, 'ZH-NB-0201');
  await p.locator('.relrow', { hasText: 'SW-ZH-2OG-01' }).locator('[data-delrel]').click();
  assert.equal(await state(p, () => rels.length), before - 1, 'the relation was not removed');
  assert.equal(await state(p, () => rels.some(r => r.from === byName('ZH-NB-0201').id && r.to === byName('SW-ZH-2OG-01').id)), false, 'the relation is still there');
  // Move the mounted switch to the other rack, at U3, from its object page.
  await openByName(p, 'SCEN-SW-1');
  await p.selectOption('[data-rk=rack]', 'R-2OG'); await p.fill('[data-rk=u]', '3');
  await p.click('#saveBtn');
  await p.waitForFunction(() => byName('SCEN-SW-1').rack === 'R-2OG');
  assert.equal(await state(p, () => byName('SCEN-SW-1').u), 3, 'the device did not move to U3');
  // LDAP sync from Settings: the plan is shown, applied, and the new user is there.
  await p.click('#setBtn'); await p.click('#setTabs [data-st=ldap]');
  await p.click('#ldapSync'); await p.waitForSelector('#ldapApply');
  await p.click('#ldapApply');
  await p.waitForFunction(() => USERS.some(u => u.login === 'a.frei'));
  await p.click('#setClose');
  // CSV import through the dialog.
  await p.click('#tabsbar [data-tab=table]'); await p.click('#csvImp'); await p.waitForSelector('#csvText');
  await p.fill('#csvText', 'name,type,model\nCSV-A,pc,Model A\nCSV-B,sip,Model B');
  await p.waitForSelector('#csvGo:not([disabled])'); await p.click('#csvGo');
  assert.ok(await state(p, () => !!byName('CSV-A') && !!byName('CSV-B')), 'the CSV rows were not imported');
  await ctx.close();

  // Server: an edit is kept after a reload.
  const ctx2 = await browser.newContext(ctxOpts);
  const q = await page(ctx2);
  await q.goto(base + '/'); await q.waitForSelector('#lgUser');
  await q.fill('#lgUser', 'admin'); await q.fill('#lgPw', 'adminpass123'); await q.click('#lgOk');
  await q.waitForSelector('#wEmpty'); await q.click('#wEmpty');
  await q.click('#newBtn'); await q.waitForSelector('#nName');
  await q.fill('#nName', 'KEEP-1'); await q.selectOption('#nType', 'pc'); await q.click('#nOk');
  await openByName(q, 'KEEP-1');
  const kid = await idOf(q, 'KEEP-1');
  await q.fill(`#f_${kid}_model`, 'KEPT MODEL'); await q.click('#saveBtn');
  await q.waitForFunction(() => byName('KEEP-1').model === 'KEPT MODEL');
  await q.waitForTimeout(1500);
  await q.reload(); await q.waitForSelector('#lgUser, #tabsbar');
  if (await q.isVisible('#lgUser')) { await q.fill('#lgUser', 'admin'); await q.fill('#lgPw', 'adminpass123'); await q.click('#lgOk'); }
  await q.waitForFunction(() => typeof objs !== 'undefined' && objs.length > 0, null, { timeout: 10000 });
  assert.equal(await state(q, () => byName('KEEP-1').model), 'KEPT MODEL', 'the edit was not kept after reload');
  // Feed: upload a Lansweeper export; a second export with a new IP updates the same object.
  await q.click('#setBtn'); await q.click('#setTabs [data-st=feed]');
  const csv = path.join(dir, 'feed1.csv');
  fs.writeFileSync(csv, 'AssetName,Serial,IPAddress,OS\nFEED-PC-1,SN-FEED-1,10.1.1.5,Windows 11\n');
  await q.setInputFiles('#feedUp', csv);
  await q.waitForFunction(() => /Import: 1 new/.test(document.querySelector('#toast').textContent));
  await q.waitForFunction(() => objs.some(o => o.name === 'FEED-PC-1'));
  assert.equal(await state(q, () => byName('FEED-PC-1').ip), '10.1.1.5', 'the feed did not set the IP');
  const csv2 = path.join(dir, 'feed2.csv');   /* a new file name, so the input reports a change */
  fs.writeFileSync(csv2, 'AssetName,Serial,IPAddress,OS\nFEED-PC-1,SN-FEED-1,10.1.1.9,Windows 11\n');
  await q.setInputFiles('#feedUp', csv2);
  await q.waitForFunction(() => /1 updated/.test(document.querySelector('#toast').textContent));
  assert.equal(await state(q, () => byName('FEED-PC-1').ip), '10.1.1.9', 'the feed did not update the IP');
  await q.click('#setClose');
  await ctx2.close();

  assert.deepEqual(errors, [], 'page errors');
  console.log('browser scenarios: all checks passed');
} finally {
  await browser.close(); await new Promise(r => server.close(r)); db.close();
}
