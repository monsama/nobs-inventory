/* Browser test of what Lansweeper brings beyond the device: the gateway is checked against the subnet, DHCP or static is
   shown, a warranty that ends soon or has ended is marked and can be filtered, and subnets the adapters report are offered. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-lsfields-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const s0 = loadState(db);
saveState(db, { ...s0,
  locs: ['Willisau / Lager'],
  subnets: [{ name: 'Office', vid: null, cidr: '10.10.20.0/24', gateway: '10.10.20.1', dns: ['10.10.1.5'], ranges: [], types: ['pc'] }],
  lsNets: [{ cidr: '172.21.108.0/24', devices: 3, gateway: '172.21.108.1', dns: ['172.21.1.5'], name: 'Willisau Lager',
    types: [{ type: 'pc', count: 2 }, { type: 'printer', count: 1 }],
    seen: [{ use: 'DHCP', from: '172.21.108.100', to: '172.21.108.180', count: 2 }, { use: 'Static', from: '172.21.108.10', to: '172.21.108.10', count: 1 }] }],
  objs: [
    { id: 'o1', code: 'INV-0001', type: 'pc', name: 'PC-SOON', status: 'active', loc: 'Willisau / Lager', ip: '10.10.20.5', gateway: '10.10.20.254', dhcp: 'dhcp', warranty: day(30), purchased: '2023-04-01', ovr: {}, feed: null },
    { id: 'o2', code: 'INV-0002', type: 'pc', name: 'PC-ENDED', status: 'active', loc: 'Willisau / Lager', ip: '10.10.20.6', gateway: '10.10.20.1', dhcp: 'static', warranty: day(-10), ovr: {}, feed: null },
    { id: 'o3', code: 'INV-0003', type: 'pc', name: 'PC-FINE', status: 'active', loc: 'Willisau / Lager', warranty: day(400), ovr: {}, feed: null },
  ], rels: [], history: {} });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none in previews */ } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const shots = process.env.NI_SHOTS;
try {
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForSelector('.card');

  // the sidebar counts and filters by warranty
  assert.match(await page.textContent('[data-warranty=soon]'), /1$/);
  assert.match(await page.textContent('[data-warranty=ended]'), /1$/);
  await page.click('[data-warranty=soon]');
  assert.deepEqual(await page.locator('.card .nm').allTextContents(), ['PC-SOON'], 'the filter shows the device whose warranty ends soon');
  assert.match(await page.textContent('.card'), /Warranty\s*ends/);
  if (shots) await page.locator('#side').screenshot({ path: path.join(shots, 'side-warranty.png') });
  await page.click('[data-warranty=soon]');

  // the device page: DHCP, a gateway that is not the subnet's, the warranty note
  await page.click('.card[data-open=o1]'); await page.waitForSelector('.obj .form');
  assert.equal(await page.inputValue('[data-k=dhcp]'), 'dhcp');
  assert.match(await page.textContent('.obj .form'), /Not the gateway of Office, which is 10\.10\.20\.1/);
  assert.match(await page.textContent('.obj .form'), /The warranty ends within 90 days/);
  assert.equal(await page.inputValue('[data-k=warranty]'), day(30));
  if (shots) await page.locator('.obj .col .panelbox').first().screenshot({ path: path.join(shots, 'device-network.png') });

  // a date typed on the page is saved as a date
  await page.fill('[data-k=warranty]', '2030-01-31'); await page.locator('[data-k=warranty]').press('Tab');
  await page.waitForFunction(async () => (await import('/js/01-core.js')).byId('o1').warranty === '2030-01-31');

  // Settings: a subnet the adapters report is offered, and Use fills in the form
  await page.click('#setBtn'); await page.click('#setTabs [data-st=vlans]'); await page.waitForSelector('.sn-suggest');
  assert.match(await page.textContent('.sn-suggest'), /172\.21\.108\.0\/24.*3 devices.*Willisau Lager/s);
  await page.click('[data-snuse="0"]');
  // Use opens the editor filled in: name, gateway, the device types seen there, and a range per kind of address seen
  await page.waitForSelector('.sn-edit[data-sub="new"]');
  assert.equal(await page.inputValue('.sn-edit [data-sc]'), '172.21.108.0/24');
  assert.equal(await page.inputValue('.sn-edit [data-sn]'), 'Willisau Lager');
  assert.equal(await page.inputValue('.sn-edit [data-sg]'), '172.21.108.1');
  assert.deepEqual(await page.locator('.sn-edit [data-sty]:checked').evaluateAll(cs => cs.map(c => c.value)), ['pc', 'printer']);
  assert.deepEqual(await page.locator('.sn-range').evaluateAll(rs => rs.map(r => [r.querySelector('[data-rf]').value, r.querySelector('[data-rt]').value, r.querySelector('[data-ru]').value])),
    [['172.21.108.100', '172.21.108.180', 'DHCP'], ['172.21.108.10', '172.21.108.10', 'Static']]);
  assert.match(await page.textContent('.sn-hint'), /3 devices of 2 types.*DHCP: 2, Static: 1.*check them against your DHCP server/s);
  if (shots) await page.locator('#setSubnets').screenshot({ path: path.join(shots, 'subnet-suggest.png') });
  await page.click('.sn-edit [data-ssave]'); await page.waitForSelector('[data-sedit="0"]');
  assert.equal(await page.locator('.sn-suggest').count(), 0, 'a subnet once added is no longer offered');
  if (shots) await page.locator('#setSubnets').screenshot({ path: path.join(shots, 'subnet-list.png') });

  // A device Lansweeper has not scanned for over three months is flagged to be checked by hand: on its card, its page,
  // in the sidebar and on the overview. One scanned recently is not.
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const core = await import('/js/01-core.js');
    const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
    core.byId('o1').feed = { sys: 'Lansweeper', ref: '1', scanned: day(400) }; core.byId('o2').feed = { sys: 'Lansweeper', ref: '2', scanned: day(5) };
    core.st.tab = 'cards'; (await import('/js/07-render-plans.js')).render();
  });
  await page.waitForSelector('.card[data-open=o1]');
  assert.match(await page.textContent('.card[data-open=o1]'), /Check by hand/);
  assert.doesNotMatch(await page.textContent('.card[data-open=o2]'), /Check by hand/);
  assert.match(await page.textContent('#chkList'), /Check by hand\s*1/);
  await page.click('#chkList [data-scanold]');
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 1);
  await page.click('#chkList [data-scanold]');
  await page.evaluate(async () => { const core = await import('/js/01-core.js'); core.st.tab = 'overview'; (await import('/js/07-render-plans.js')).render(); });
  await page.waitForSelector('[data-ovscan]');
  assert.match(await page.textContent('[data-ovscan]'), /1\s*Check by hand.*not scanned by Lansweeper for over 3 months/s);
  await page.evaluate(async () => (await import('/js/02-views.js')).openObj('o1'));
  await page.waitForSelector('.lsbox');
  assert.match(await page.textContent('.lsbox'), /Last scanned.*Check by hand.*has not scanned it for over three months/s);

  // disks as one bar per drive: how full it is and the space left; red from 90 % used
  await page.evaluate(async () => { const c = await import('/js/01-core.js'); c.byId('o1').disk = "C: 20/237 GB; D: 1'812/1'863 GB"; (await import('/js/02-views.js')).openObj('o1'); });
  await page.waitForSelector('.disks .disk');
  assert.equal(await page.locator('.disks .disk').count(), 2);
  assert.match(await page.textContent('.disks'), /C:\s*20 GB free of 237 GB.*D:\s*1.812 GB free of 1.863 GB/s);
  assert.match(await page.getAttribute('.disks .disk >> nth=0', 'class'), /bad/, 'C: is 92 % used');
  assert.doesNotMatch(await page.getAttribute('.disks .disk >> nth=1', 'class'), /bad|warn/, 'D: has room');
  if (shots) await page.locator('.disks').screenshot({ path: path.join(shots, 'disks.png') });

  assert.deepEqual(errors, [], 'no page errors');
  console.log('lansweeper fields: all checks passed');
} finally { await browser.close(); server.close(); }
