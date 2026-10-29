/* Ports: a router, firewall or physical server has a port view like a switch, and from its card Ports shows that device. Software: a package lists its devices in a table. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import { loadState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-ports-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  // A router with 8 ports and a PC on its port 2.
  await p.evaluate(async () => {
    const core = await import('/js/01-core.js');
    core.objs.push({ id: 'rt1', code: 'INV-9001', type: 'router', name: 'RTR-EDGE', status: 'active', loc: core.objs[0].loc, ports: 8, pfx: 'Gi0/', ovr: {}, feed: null });
    core.rels.push({ id: 'rt-link', from: 'o2', to: 'rt1', kind: 'connected', port: 2, vlan: null });
  });
  // From the router's card, Ports opens the router's own port view.
  await p.evaluate(async () => { const views = await import('/js/02-views.js'); views.openObj('rt1'); });
  await p.waitForSelector('#tabsbar [data-tab=net]');
  await p.click('#tabsbar [data-tab=net]');
  await until(p, async () => (await import('/js/01-core.js')).st.portsDevice === 'rt1');
  assert.equal(await p.inputValue('#portsDevice'), 'rt1', 'the router is shown, not the first switch');
  assert.equal(await p.locator('#view .port').count(), 8, 'the router has its 8 ports');
  assert.ok(await p.locator('#view .port.used[data-port="2"]').count() === 1, 'port 2 is shown as used');
  assert.match(await p.textContent('#view'), /Gi0\/2|Gi0\/ ?2/, 'the port is named with the router naming');
  // A switch card still shows that switch.
  await p.evaluate(async () => { const views = await import('/js/02-views.js'); views.openObj('o1'); });
  await p.click('#tabsbar [data-tab=net]');
  await until(p, async () => (await import('/js/01-core.js')).st.portsDevice === 'o1');
  assert.equal(await p.inputValue('#portsDevice'), 'o1', 'a switch card shows its own switch');
  // Software: clicking a package lists the devices that have it, in a table with the version on each.
  await p.evaluate(async () => {
    const core = await import('/js/01-core.js');
    core.objs.find(o => o.id === 'o2').software = [{ name: 'Tool X', version: '1.2' }];
    core.objs.find(o => o.id === 'rt1').software = [{ name: 'Tool X', version: '9.9' }];
  });
  await p.click('#tabsbar [data-tab=sw]');
  await p.click('tr[data-sw="Tool X"]');
  // the devices open in place, right under the package
  await p.waitForSelector('tr[data-sw="Tool X"] + tr.sw-detail');
  assert.equal(await p.getAttribute('tr[data-sw="Tool X"] .sw-tg', 'aria-expanded'), 'true', 'the package says it is open');
  const rows = await p.$$eval('tr.sw-detail table.sw-sub tbody tr', trs => trs.map(tr => tr.textContent));
  assert.equal(rows.length, 2, 'both devices with the package are listed in a table: ' + rows.join(' | '));
  assert.ok(rows.some(t => t.includes('RTR-EDGE') && t.includes('9.9')), 'the router row has its version');
  assert.ok(rows.some(t => t.includes('1.2')), 'the PC row has its version');
  assert.equal(await p.locator('tr.sw-detail .vchip.odd').count(), 1, 'with two versions, the one that differs is marked');
  // a second click closes it; a search for a device opens the packages it has
  await p.click('tr[data-sw="Tool X"]');
  assert.equal(await p.locator('tr.sw-detail').count(), 0, 'a second click closes the package');
  await p.fill('#swQ', 'RTR-EDGE');
  await p.waitForSelector('tr[data-sw="Tool X"] + tr.sw-detail');
  await p.fill('#swQ', 'no such thing');
  await p.waitForSelector('#swBody >> text=Nothing matches');
  await p.fill('#swQ', '');
  // keyboard only: the chevron is a button; Enter opens the package, Enter again closes it
  await p.focus('tr[data-sw="Tool X"] .sw-tg'); await p.keyboard.press('Enter');
  await p.waitForSelector('tr[data-sw="Tool X"] + tr.sw-detail');
  await p.keyboard.press('Enter');
  assert.equal(await p.locator('tr.sw-detail').count(), 0, 'Enter on the chevron closes the package again');
  // Port groups: a named range of the router's ports, with a kind; an overlapping range is refused.
  await p.evaluate(async () => { const views = await import('/js/02-views.js'); views.openObj('rt1'); });
  await p.click('#tabsbar [data-tab=net]');
  await until(p, async () => (await import('/js/01-core.js')).st.portsDevice === 'rt1');
  await p.fill('#pgName', 'Uplinks'); await p.fill('#pgFrom', '7'); await p.fill('#pgTo', '8'); await p.fill('#pgKind', 'SFP+');
  await p.click('#pgAdd');
  await until(p, async () => ((await import('/js/01-core.js')).objs.find(o => o.id === 'rt1').portGroups || []).length === 1);
  assert.match(await p.textContent('#view .panelbox:has(#pgAdd)'), /Uplinks[\s\S]*Ports Gi0\/7–Gi0\/8 · SFP\+/, 'the group is listed with its ports and kind');
  await p.fill('#pgName', 'Clash'); await p.fill('#pgFrom', '8'); await p.fill('#pgTo', '8');
  await p.click('#pgAdd');
  await until(p, async () => /already in a group/.test(document.querySelector('#toast').textContent));
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).objs.find(o => o.id === 'rt1').portGroups.length), 1, 'the overlapping group is not added');
  // With a type selected, the locations count only objects of that type.
  const rtSite = await p.evaluate(async () => (await import('/js/01-core.js')).objs.find(o => o.id === 'rt1').loc.split(' / ')[0]);
  await p.click('#typeList [data-type=router]');
  assert.equal(await p.textContent(`#locList [data-loc="${rtSite}"] .cnt`), '1', 'the site of the router counts the one router');
  await p.click('#clearF');
  // The relation dropdown explains the kind it has chosen, and each option has its explanation as a tooltip.
  await p.evaluate(async () => { const views = await import('/js/02-views.js'); views.openObj('rt1'); });
  await p.waitForSelector('#arKind');
  await p.selectOption('#arKind', 'connected');
  assert.match(await p.getAttribute('#arKind', 'title'), /port of a switch, router, firewall or patch panel/, 'the connected tooltip');
  await p.selectOption('#arKind', 'uplink');
  assert.match(await p.getAttribute('#arKind', 'title'), /upstream device/, 'the uplink tooltip follows the choice');
  assert.ok(await p.$eval('#arKind option[value=hosted]', o => o.title.length > 0), 'every kind has its tooltip');
  // A field saves when it is left, without the Save button.
  await p.evaluate(async () => { const views = await import('/js/02-views.js'); views.openObj('rt1'); });
  await p.waitForSelector('[data-k=model]');
  await p.fill('[data-k=model]', 'RTR-2000'); await p.press('[data-k=model]', 'Tab');
  for (let i = 0; i < 150 && !(loadState(db).objs.find(o => o.id === 'rt1') || {}).model; i++) await new Promise(r => setTimeout(r, 100));
  assert.equal((loadState(db).objs.find(o => o.id === 'rt1') || {}).model, 'RTR-2000', 'the field is saved when it is left');
  // A switch with no port count: attaching to it shows a hint, and the connection can still be made.
  await p.evaluate(async () => { const core = await import('/js/01-core.js'); core.objs.push({ id: 'sw0', code: 'INV-9002', type: 'switch', name: 'SW-NOPORTS', status: 'active', loc: core.objs[0].loc, ovr: {}, feed: null }); });
  await p.evaluate(async () => { const views = await import('/js/02-views.js'); views.openObj('o2'); });
  await p.waitForSelector('#arKind');
  await p.selectOption('#arKind', 'connected');
  await p.selectOption('#arTo', 'sw0');
  assert.match(await p.textContent('#arHint'), /SW-NOPORTS has no port count yet/, 'the hint for a switch without ports');
  // New object only creates; Link object connects one that exists, and the link follows its type.
  await p.click('#newBtn'); await p.waitForSelector('#nName');
  assert.equal(await p.locator('#nExist').count(), 0, 'no existing-object picker in New object');
  await p.click('#nCancel');
  await p.evaluate(async () => { const core = await import('/js/01-core.js'); const loc = core.objs[0].loc;
    core.objs.push({ id: 'mon1', code: 'INV-9201', type: 'monitor', name: 'MON-1', status: 'active', loc, ovr: {}, feed: null });
    core.objs.push({ id: 'pcx', code: 'INV-9202', type: 'pc', name: 'PC-X', status: 'active', loc, ovr: {}, feed: null }); });
  await p.click('#linkBtn'); await p.waitForSelector('#lkObj');
  await p.selectOption('#lkObj', 'mon1');
  assert.equal(await p.textContent('label[for="lkTo"]'), 'Attached to');
  assert.equal(await p.isVisible('#lkPort'), false, 'a monitor has no port');
  assert.ok(await p.$eval('#lkTo', s => [...s.options].some(o => o.value === 'pcx') && ![...s.options].some(o => o.value === 'sw0')), 'a monitor goes on a computer');
  await p.selectOption('#lkTo', 'pcx'); await p.click('#lkOk');
  assert.ok(await p.evaluate(async () => (await import('/js/01-core.js')).rels.some(r => r.from === 'mon1' && r.to === 'pcx' && r.kind === 'attached')));
  await p.click('#linkBtn'); await p.waitForSelector('#lkObj');
  await p.selectOption('#lkObj', 'pcx');
  assert.equal(await p.textContent('label[for="lkTo"]'), 'Plug into');
  assert.equal(await p.isVisible('#lkPort'), true);
  await p.click('#lkCancel');
  // a server that is a virtual machine runs on a server
  await p.evaluate(async () => { const core = await import('/js/01-core.js'); const loc = core.objs[0].loc;
    core.objs.push({ id: 'vmx', code: 'INV-9203', type: 'server', kind: 'vm', name: 'VM-X', status: 'active', loc, ovr: {}, feed: null });
    core.objs.push({ id: 'hostx', code: 'INV-9204', type: 'server', name: 'HOST-X', status: 'active', loc, ovr: {}, feed: null }); });
  await p.click('#linkBtn'); await p.waitForSelector('#lkObj');
  await p.selectOption('#lkObj', 'vmx');
  assert.equal(await p.textContent('label[for="lkTo"]'), 'Runs on');
  await p.selectOption('#lkTo', 'hostx'); await p.click('#lkOk');
  assert.ok(await p.evaluate(async () => (await import('/js/01-core.js')).rels.some(r => r.from === 'vmx' && r.to === 'hostx' && r.kind === 'hosted')));
  // LAG: a LAG on one switch links the LAG of the same size on the other; a single port inside a LAG is not offered.
  await p.evaluate(async () => {
    const core = await import('/js/01-core.js'); const loc = core.objs[0].loc;
    core.objs.push({ id: 'lagA', code: 'INV-9101', type: 'switch', name: 'LAG-A', status: 'active', loc, ports: 24, sfp: 4, pfx: '1/', ovr: {}, feed: null, portGroups: [{ name: 'Core', from: 25, to: 26, lag: true }] });
    core.objs.push({ id: 'lagB', code: 'INV-9102', type: 'switch', name: 'LAG-B', status: 'active', loc, ports: 24, sfp: 4, pfx: '1/', ovr: {}, feed: null, portGroups: [{ name: 'Peer', from: 25, to: 26, lag: true }] });
    const views = await import('/js/02-views.js'); views.openObj('lagA');
  });
  await p.waitForSelector('#arKind');
  await p.selectOption('#arKind', 'uplink');
  await p.selectOption('#arTo', 'lagB');
  await p.waitForSelector('#arLag:not([hidden])');
  await p.selectOption('#arLag', 'Peer');
  await p.waitForSelector('#arFromLag:not([hidden])');
  await p.click('#arAdd');
  await until(p, async () => (await import('/js/01-core.js')).rels.some(r => r.lag === 'Peer' && r.fromLag === 'Core' && r.port === null));
  assert.match(await p.textContent('#view'), /LAG Peer/, 'the LAG link is listed on the card');
  // On the Ports view, every member of a linked LAG is in use and shows the device on the other end, not "free".
  await p.evaluate(async () => { const core = await import('/js/01-core.js'); core.st.portsDevice = 'lagB'; core.st.portNo = 25; core.st.tab = 'net'; (await import('/js/07-render.js')).render(); });
  await p.waitForSelector('.port[data-port="26"]');
  assert.match(await p.getAttribute('.port[data-port="26"]', 'class'), /upl|used/, 'a LAG member port shows as in use');
  assert.match(await p.textContent('#net'), /2 of 28 ports in use/);
  assert.match(await p.textContent('#net'), /Part of the LAG Peer, linked to\s*LAG-A/);
  assert.equal(await p.locator('#assignBtn').count(), 0, 'a LAG member port offers no single plug-in');
  // A free port: plug in a device the inventory has, with the switch and the port already chosen
  await p.evaluate(async () => {
    const core = await import('/js/01-core.js');
    core.objs.push({ id: 'pc77', code: 'INV-9077', type: 'pc', name: 'PC-PLUG-ME', status: 'active', loc: core.objs[0].loc, ovr: {}, feed: null });
    core.st.portNo = 3; (await import('/js/07-render.js')).render();
  });
  await p.waitForSelector('#assignBtn');
  await p.click('#assignBtn');
  await p.waitForSelector('#lkObj');
  assert.equal(await p.inputValue('#lkTo'), 'lagB'); assert.equal(await p.inputValue('#lkPort'), '3');
  await p.selectOption('#lkObj', 'pc77');
  assert.equal(await p.inputValue('#lkTo'), 'lagB', 'choosing the device keeps the switch'); assert.equal(await p.inputValue('#lkPort'), '3');
  await p.click('#lkOk');
  await until(p, async () => (await import('/js/01-core.js')).rels.some(r => r.from === 'pc77' && r.to === 'lagB' && r.port === 3));
  await p.evaluate(async () => { const core = await import('/js/01-core.js'); core.st.portNo = null; core.st.tab = 'cards'; });
  // A port held by a retired device is taken over by a new connection; the retired device's connection is removed.
  await p.evaluate(async () => {
    const core = await import('/js/01-core.js'); const loc = core.objs[0].loc;
    core.objs.push({ id: 'old1', code: 'INV-9401', type: 'pc', name: 'OLD-PC', status: 'retired', loc, ovr: {}, feed: null });
    core.rels.push({ id: 'oldlink', from: 'old1', to: 'o1', kind: 'connected', port: 9, vlan: null });
    const views = await import('/js/02-views.js'); views.openObj('o3');
  });
  await p.waitForSelector('#arKind');
  await p.selectOption('#arKind', 'connected'); await p.selectOption('#arTo', 'o1'); await p.fill('#arPort', '9'); await p.click('#arAdd');
  await until(p, async () => (await import('/js/01-core.js')).rels.some(r => r.from === 'o3' && r.to === 'o1' && r.port === 9));
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).rels.some(r => r.id === 'oldlink')), false, 'the retired connection is removed');
  // Port setup: a count that would drop a used port is refused; a larger count is saved; a port has a description.
  await p.evaluate(async () => { const views = await import('/js/02-views.js'); views.openObj('rt1'); });
  await p.click('#tabsbar [data-tab=net]');
  await until(p, async () => (await import('/js/01-core.js')).st.portsDevice === 'rt1');
  await p.fill('#psPorts', '1'); await p.press('#psPorts', 'Tab');   /* saved when the field is left */
  assert.match(await p.textContent('#psMsg'), /block this change/, 'a count below a used port is refused');
  await p.fill('#psPorts', '10'); await p.press('#psPorts', 'Tab');
  await until(p, async () => (await import('/js/01-core.js')).objs.find(o => o.id === 'rt1').ports === 10);
  await p.click('#view .port[data-port="2"]');
  await p.fill('#pnDesc', 'Printer, 3rd floor'); await p.press('#pnDesc', 'Tab');
  await until(p, async () => (await import('/js/01-core.js')).objs.find(o => o.id === 'rt1').portNotes?.[2] === 'Printer, 3rd floor');
  assert.match(await p.getAttribute('#view .port[data-port="2"]', 'title'), /Printer, 3rd floor/, 'the description shows on the port');
  // Notes: an entry with a title and a link is added and reaches the server.
  await p.evaluate(async () => { const views = await import('/js/02-views.js'); views.openObj('o1'); });
  await p.waitForSelector('#enAdd');
  await p.fill('#enTitle', 'Warranty'); await p.fill('#enLink', 'https://files.example.ch/warranty.pdf'); await p.click('#enAdd');
  for (let i = 0; i < 150 && !(loadState(db).objs.find(o => o.id === 'o1').entries || []).length; i++) await new Promise(r => setTimeout(r, 100));
  assert.equal(loadState(db).objs.find(o => o.id === 'o1').entries[0].title, 'Warranty', 'the note is saved');
  assert.deepEqual(errors, [], 'page errors');
  console.log('device ports: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
