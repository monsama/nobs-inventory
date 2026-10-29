/* Browser test of costs: a device's price, a contract made from the Contracts tab with its devices and notice date,
   shown on the device page; a licence in the Software view, over-used; and the overview leading to the lists. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-costs-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const sw = n => [{ name: 'Microsoft 365 Apps for enterprise - de-de', version: '16.0.' + n }];
const s0 = loadState(db);
saveState(db, { ...s0, locs: ['Bern / Lager', 'Luzern / Büro'],
  objs: [
    { id: 'o1', code: 'INV-0001', type: 'switch', name: 'SW-CORE', status: 'active', loc: 'Bern / Lager', ports: 24, sfp: 4, ovr: {}, feed: null },
    { id: 'o2', code: 'INV-0002', type: 'pc', name: 'PC-1', status: 'active', loc: 'Bern / Lager', software: sw(1), warranty: day(-5), ovr: {}, feed: null },
    { id: 'o3', code: 'INV-0003', type: 'pc', name: 'PC-2', status: 'active', loc: 'Luzern / Büro', software: sw(2), price: 1290, ovr: {}, feed: null },
    { id: 'o4', code: 'INV-0004', type: 'pc', name: 'PC-3', status: 'repair', loc: 'Luzern / Büro', software: sw(3), ovr: {}, feed: null },
  ], rels: [], history: {} });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none in previews */ } });
const page = await ctx.newPage();
page.on('dialog', d => d.accept());
const errors = []; page.on('pageerror', e => errors.push(e.message));
const shots = process.env.NI_SHOTS;
const core = () => page.evaluate(async () => { const m = await import('/js/01-core.js'); return { contracts: m.COSTS.contracts, licences: m.COSTS.licences, o1: m.byId('o1'), o2: m.byId('o2') }; });
try {
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForSelector('.card');

  // a price typed with a comma is saved as a number
  await page.click('.card[data-open=o2]'); await page.waitForSelector('.obj .form');
  await page.fill('[data-k=price]', "1'499,50"); await page.locator('[data-k=price]').press('Tab');
  await page.fill('[data-k=supplier]', 'Brack'); await page.locator('[data-k=supplier]').press('Tab');
  await page.waitForFunction(async () => (await import('/js/01-core.js')).byId('o2').price === 1499.5);

  // a contract from the Contracts tab, with a device found by name; notice due soon
  await page.click('[data-tab=contracts]');
  assert.match(await page.textContent('#view'), /No contracts yet/);
  await page.click('#ctNew');
  await page.fill('#ctName', 'Switch maintenance');
  await page.fill('#ctSupplier', 'HPE');
  await page.fill('#ctEnd', day(70));
  await page.selectOption('#ctRenew', '12');
  await page.fill('#ctNotice', '1');
  await page.fill('#ctCost', '1200');
  await page.fill('#ctDevQ', 'SW-CO');
  await page.check('[data-ctdev=o1]');
  await page.click('#ctOk');
  await page.waitForSelector('table.contracts');
  assert.match(await page.textContent('table.contracts'), /Switch maintenance.*Maintenance.*HPE.*1.*CHF 1.?200.*per year.*Give notice by/s);
  assert.match(await page.textContent('#toolbar'), /1 due within 60 days/);
  const c = (await core()).contracts[0];
  assert.deepEqual([c.name, c.renew, c.notice, c.cost, c.devices], ['Switch maintenance', 12, 1, 1200, ['o1']]);
  // the summary: what the contracts cost this year and the next two (no start date, renews: the whole year each)
  const y = new Date().getFullYear();
  assert.match(await page.textContent('.ct-sum'), new RegExp(`${y}CHF 1.?200this year.*${y + 1}CHF 1.?200next year.*${y + 2}CHF 1.?200the year after.*${y} by kindMaintenanceCHF 1.?200`, 's'));
  // Edit opens the contract to change it
  await page.click('table.contracts button[aria-label="Edit Switch maintenance"]');
  await page.fill('#ctCost', '1500'); await page.click('#ctOk');
  await page.waitForFunction(async () => (await import('/js/01-core.js')).COSTS.contracts[0].cost === 1500);
  await page.click('table.contracts button[aria-label="Edit Switch maintenance"]');
  await page.fill('#ctCost', '1200'); await page.click('#ctOk');
  await page.waitForFunction(async () => (await import('/js/01-core.js')).COSTS.contracts[0].cost === 1200);
  if (shots) await page.screenshot({ path: path.join(shots, 'contracts.png') });

  // on the device page; a second contract is started from there with the device in it
  await page.evaluate(async () => (await import('/js/02-views.js')).openObj('o1'));
  await page.waitForSelector('#ctAddDev');
  assert.match(await page.textContent('.obj'), /Contracts\s*1.*Switch maintenance.*Give notice by/s);
  await page.click('#ctAddDev');
  await page.fill('#ctName', 'Leased switch'); await page.selectOption('#ctKind', 'lease'); await page.selectOption('#ctRenew', '0');
  assert.equal(await page.isChecked('[data-ctdev=o1]'), true, 'the device the contract was started from is in it');
  await page.click('#ctOk');
  await page.waitForFunction(async () => (await import('/js/01-core.js')).COSTS.contracts.length === 2);

  // a licence in the Software view: three devices have it, two seats
  await page.click('[data-tab=sw]'); await page.waitForSelector('#licNew');
  await page.click('#licNew');
  await page.fill('#licName', 'Microsoft 365 Apps');
  assert.match(await page.textContent('#licErr'), /3 devices/);
  await page.fill('#licSeats', '2'); await page.click('#licOk');
  await page.waitForSelector('.lic .chip.bad');
  assert.match(await page.textContent('.lic'), /3 used \/ 2 seats.*1 over/s);
  assert.match(await page.textContent('#swBody'), /Microsoft 365 Apps.*Licence/s, 'the package row shows its licence');
  assert.match(await page.getAttribute('#swBody .lic-mark', 'title'), /Microsoft 365 Apps: 3 of 2 seats used, 1 over/);
  assert.match(await page.getAttribute('#swBody .lic-mark', 'class'), /over/, 'marked as over-used');
  if (shots) await page.screenshot({ path: path.join(shots, 'licences.png') });

  // the overview: figures and what needs attention, each leading to the list
  await page.click('[data-tab=overview]'); await page.waitForSelector('.ov');
  const ov = await page.textContent('.ov');
  assert.match(ov, /Devices in use\s*3/);
  assert.match(ov, /Warranty ended.*Contract notice due.*Licences over-used.*In repair/s);
  assert.match(ov, /Value of devices in use\s*CHF 2.?789\.50/);
  if (shots) await page.screenshot({ path: path.join(shots, 'overview.png') });
  await page.click('[data-ovw=ended]');
  await page.waitForFunction(() => document.querySelectorAll('#view tbody tr').length === 1);
  assert.match(await page.textContent('#view tbody'), /PC-1/);
  await page.click('[data-tab=overview]');
  await page.click('[data-ovt=pc]');
  await page.waitForSelector('.card');
  assert.equal(await page.locator('.card').count(), 3, 'the PCs');
  await page.click('[data-tab=overview]');
  await page.click('[data-ovtab=sw]'); await page.waitForSelector('.lic');

  // saved on the server (saves are batched: wait for the batch)
  await page.evaluate(async () => (await import('/js/07-render.js')).flushSave());
  const saved = loadState(db);
  assert.equal(saved.contracts.length, 2);
  assert.equal(saved.licences[0].seats, 2);
  assert.equal(saved.objs.find(o => o.id === 'o2').supplier, 'Brack');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('costs: all checks passed');
} finally { await browser.close(); server.close(); }
