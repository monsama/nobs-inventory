/* Things added once can be changed later: a user's name and department (their devices move with the name), a domain's
   name (its objects move with it), a port group (a linked LAG keeps its link under a new name), a floor plan's name and
   an area's name and room. An empty Racks view offers New rack. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-edit-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const sw = (id, name, groups) => ({ id, code: 'INV-' + id, type: 'switch', name, status: 'active', loc: 'Zürich HQ / Büro', ports: 24, sfp: 4, pfx: '1/', ovr: {}, feed: null, portGroups: groups });
saveState(db, { ...s0,
  locs: ['Zürich HQ / Büro'], sites: ['Zürich HQ'], domains: [{ name: 'corp.example.ch' }],
  users: [...s0.users, { id: 'u-b', login: '', name: 'Beat Keller', dept: 'IT', role: 'viewer', groups: [], source: 'manual', active: true }],
  objs: [
    { id: 'p1', code: 'INV-0001', type: 'pc', name: 'PC-1', status: 'active', loc: 'Zürich HQ / Büro', ovr: {}, feed: null, user: 'Beat Keller', domain: 'corp.example.ch' },
    sw('s1', 'SW-A', [{ name: 'Core', from: 25, to: 26, lag: true }]), sw('s2', 'SW-B', [{ name: 'Peer', from: 25, to: 26, lag: true }]),
  ],
  rels: [{ id: 'l1', from: 's1', to: 's2', kind: 'uplink', port: null, lag: 'Peer', fromLag: 'Core', vlan: null }],
  plans: [{ id: 'pl1', name: 'EG', site: 'Zürich HQ', areas: [{ id: 'ar1', name: 'Büro', x: 10, y: 10, w: 30, h: 30, rects: [{ x: 10, y: 10, w: 30, h: 30 }] }] }],
  history: {} });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  const core = f => p.evaluate(f);

  // a user's name and department; the device moves to the new name
  await p.click('#setBtn'); await p.click('#setTabs [data-st=users]');
  await p.fill('#setUsers [aria-label="Name of Beat Keller"]', 'Beat Keller-Frei'); await p.keyboard.press('Tab');
  await until(p, async () => (await import('/js/01-core.js')).byId('p1').user === 'Beat Keller-Frei');
  await p.fill('#setUsers [aria-label="Department of Beat Keller-Frei"]', 'Logistik'); await p.keyboard.press('Tab');
  await until(p, async () => (await import('/js/04-settings.js')).USERS.find(u => u.id === 'u-b').dept === 'Logistik');
  assert.equal(await p.locator('#setUsers [aria-label="Name of Administrator"]').count(), 1, 'a manual admin can be renamed too');

  // a domain's name; the object moves with it
  await p.click('#setTabs [data-st=vlans]'); await p.waitForSelector('[data-dname="0"]');
  await p.fill('[data-dname="0"]', 'ad.example.ch'); await p.keyboard.press('Tab');
  await until(p, async () => (await import('/js/01-core.js')).byId('p1').domain === 'ad.example.ch');
  // domains the devices are in that the list does not have are offered: Add takes one, Add all the rest
  await core(async () => { const c = await import('/js/01-core.js'); c.byId('s1').domain = 'argo.intern'; c.byId('s2').domain = 'argo.intern'; c.byId('p1').domain = 'lab.local';
    (await import('/js/04-settings.js')).renderSetDomains(); });
  assert.match(await p.textContent('#setDomains .sn-suggest'), /argo\.intern\s*2 devices.*lab\.local\s*1 device/s);
  await p.click('[data-dmuse="0"]');
  await until(p, async () => (await import('/js/01-core.js')).DOMAINS.some(d => d.name === 'argo.intern'));
  assert.equal(await p.locator('#dmUseAll').count(), 0, 'Add all only with two or more left');
  await p.click('[data-dmuse="0"]');
  await until(p, async () => (await import('/js/01-core.js')).DOMAINS.some(d => d.name === 'lab.local'));
  assert.equal(await p.locator('#setDomains .sn-suggest').count(), 0, 'nothing left to offer');
  await p.click('#setClose');

  // a linked LAG renamed: the link follows; its size cannot change while linked
  await core(async () => { const c = await import('/js/01-core.js'); c.st.portsDevice = 's1'; c.st.tab = 'net'; (await import('/js/07-render-plans.js')).render(); });
  await p.waitForSelector('[data-editgroup="0"]'); await p.click('[data-editgroup="0"]');
  assert.equal(await p.inputValue('#pgName'), 'Core');
  await p.fill('#pgTo', '27'); await p.click('#pgAdd');
  assert.equal(await core(async () => (await import('/js/01-core.js')).byId('s1').portGroups[0].to), 26, 'a linked LAG keeps its size');
  await p.fill('#pgTo', '26'); await p.fill('#pgName', 'Uplink'); await p.click('#pgAdd');
  await until(p, async () => (await import('/js/01-core.js')).byId('s1').portGroups[0].name === 'Uplink');
  assert.equal(await core(async () => (await import('/js/01-core.js')).rels.find(r => r.id === 'l1').fromLag), 'Uplink', 'the link follows the new name');
  assert.equal(await p.locator('#pgCancel').count(), 0, 'the form is back to adding');

  // a plan's name, an area's name; the area keeps the room the devices are in
  await core(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'plans'; (await import('/js/07-render-plans.js')).render(); });
  await p.waitForSelector('#plEdit'); await p.click('#plEdit');
  assert.equal(await p.isDisabled('#peSite'), true, 'the site stays while the plan has areas');
  await p.fill('#peName', 'Erdgeschoss'); await p.click('#peOk');
  await until(p, async () => (await import('/js/07-render-plans.js')).planById('pl1').name === 'Erdgeschoss');
  const box = await p.locator('#plCanvas').boundingBox();
  await p.mouse.move(box.x + box.width * 0.13, box.y + box.height * 0.37); await p.mouse.down(); await p.mouse.up();
  await p.waitForSelector('#plAreaEdit'); await p.click('#plAreaEdit');
  assert.equal(await p.inputValue('#aeRoom'), 'Zürich HQ / Büro', 'the area\'s room is chosen');
  await p.fill('#aeName', 'Büro Nord'); await p.click('#aeOk');
  const area = await core(async () => (await import('/js/07-render-plans.js')).planById('pl1').areas[0]);
  assert.deepEqual([area.name, area.room], ['Büro Nord', 'Zürich HQ / Büro'], 'renamed, in the same room');

  // Use all adds every subnet Lansweeper suggests: a gateway outside its subnet is left out, an overlap is skipped
  await core(async () => {
    const c = await import('/js/01-core.js');
    c.SUBNETS.push({ name: 'Old', cidr: '10.10.30.0/24', vid: null, gateway: '', dns: [], ranges: [], types: [] });
    c.st.lsNets = [
      { cidr: '172.21.110.0/24', devices: 25, gateway: '172.21.110.1', dns: ['172.21.1.5'], name: 'Lager', types: [{ type: 'pc', count: 20 }], seen: [{ use: 'DHCP', from: '172.21.110.50', to: '172.21.110.90', count: 20 }] },
      { cidr: '10.100.100.0/24', devices: 3, gateway: '192.168.1.1', dns: [], name: '' },
      { cidr: '10.10.30.0/25', devices: 2, gateway: '10.10.30.1', dns: [] },
    ];
    c.st.setTab = 'vlans'; (await import('/js/04-settings.js')).openSettings();
  });
  await p.waitForSelector('#snUseAll');
  assert.match(await p.textContent('#snUseAll'), /Use all 3/);
  /* Use all and each Use are one size. */
  const sizes = await p.$$eval('#setSubnets .sn-suggest button', bs => bs.map(b => { const r = b.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }));
  assert.ok(sizes.length > 1 && new Set(sizes).size === 1, 'suggestion buttons are the same size: ' + sizes.join(', '));
  await p.click('#snUseAll');
  await until(p, async () => (await import('/js/01-core.js')).SUBNETS.length === 3);
  const nets = await core(async () => (await import('/js/01-core.js')).SUBNETS.map(n => [n.cidr, n.name, n.gateway, n.types.join(','), n.ranges.length]));
  assert.deepEqual(nets.slice(1), [['172.21.110.0/24', 'Lager', '172.21.110.1', 'pc', 1], ['10.100.100.0/24', '10.100.100.0/24', '', '', 0]]);
  assert.match(await p.textContent('#toast'), /Added 2 subnets; 10\.100\.100\.0\/24 without its gateway 192\.168\.1\.1; skipped 10\.10\.30\.0\/25/);
  await p.click('#setClose');

  // a device whose address is in a subnet takes that subnet, its gateway and its DNS servers without storing them
  await core(async () => {
    const c = await import('/js/01-core.js');
    c.SUBNETS.push({ name: 'Office', cidr: '10.20.0.0/24', vid: null, gateway: '10.20.0.1', dns: ['10.20.0.5', '10.20.0.6'], ranges: [{ from: '10.20.0.100', to: '10.20.0.120', use: 'Static' }], types: [] });
    c.byId('p1').ip = '10.20.0.42';
    (await import('/js/02-views.js')).openObj('p1');
  });
  await p.waitForSelector('#f_p1_subnet');
  assert.match(await p.textContent('#f_p1_subnet option[value=""]'), /Auto: Office · 10\.20\.0\.0\/24 \(from the address\)/);
  assert.equal(await p.getAttribute('#f_p1_gateway', 'placeholder'), '10.20.0.1 · from Office');
  assert.equal(await p.getAttribute('#f_p1_dns', 'placeholder'), '10.20.0.5, 10.20.0.6 · from Office');
  assert.equal(await p.inputValue('#f_p1_gateway'), '', 'the gateway is not written into the device');
  // the address lists the free ones of its subnet: the first free first, one in use left out; a taken one typed is named
  await core(async () => { const c = await import('/js/01-core.js'); c.objs.push({ id: 'p9', code: 'INV-0099', type: 'pc', name: 'PC-NINE', status: 'active', loc: c.byId('p1').loc, ovr: {}, feed: null, ip: '10.20.0.100' }); });
  await p.click('.combo:has(#f_p1_ip) .combo-arrow');
  await p.waitForSelector('#f_p1_ip_list li');
  assert.deepEqual((await p.$$eval('#f_p1_ip_list li', ls => ls.slice(0, 2).map(l => l.textContent.trim()))), ['10.20.0.101 · first free (Static)', '10.20.0.102 · free (Static)']);
  await p.click('#f_p1_ip_list li >> nth=0');
  assert.equal(await p.inputValue('#f_p1_ip'), '10.20.0.101');
  // set to DHCP, the list says so above the static addresses, and that line cannot be picked
  await p.selectOption('#f_p1_dhcp', 'dhcp');
  await p.click('.combo:has(#f_p1_ip) .combo-arrow'); await p.waitForSelector('#f_p1_ip_list li.off');
  assert.equal((await p.textContent('#f_p1_ip_list li >> nth=0')).trim(), 'This device gets its address from DHCP. Free static addresses:');
  await p.click('#f_p1_ip_list li >> nth=0', { force: true });
  assert.equal(await p.inputValue('#f_p1_ip'), '10.20.0.101', 'the hint is not picked');
  await p.keyboard.press('Escape'); await p.selectOption('#f_p1_dhcp', '');
  await p.fill('#f_p1_ip', '10.20.0.11');
  assert.deepEqual(await p.$$eval('#f_p1_ip_list li', ls => ls.map(l => l.textContent.trim().split(' ')[0])), ['10.20.0.110', '10.20.0.111', '10.20.0.112', '10.20.0.113', '10.20.0.114', '10.20.0.115', '10.20.0.116', '10.20.0.117', '10.20.0.118', '10.20.0.119'], 'typing narrows the list');
  await p.fill('#f_p1_ip', '10.20.0.100');
  assert.equal(await p.textContent('#f_p1_ip_note'), 'In use by PC-NINE.');
  await p.fill('#f_p1_ip', '10.20.0.1');
  assert.equal(await p.textContent('#f_p1_ip_note'), 'This address is the gateway of Office.');
  await p.fill('#f_p1_ip', '10.20.0.42'); await p.press('#f_p1_ip', 'Escape');
  assert.equal(await p.isHidden('#f_p1_ip_note'), true);
  await core(async () => { const c = await import('/js/01-core.js'); c.objs.splice(c.objs.findIndex(o => o.id === 'p9'), 1); });
  if (process.env.NI_SHOTS){ await p.locator('#f_p1_subnet').scrollIntoViewIfNeeded(); const b = await p.locator('#f_p1_ip').boundingBox(); await p.screenshot({ path: path.join(process.env.NI_SHOTS, 'subnet-inherit.png'), clip: { x: b.x - 140, y: b.y - 10, width: 560, height: 230 } }); }
  await p.fill('#f_p1_gateway', '10.20.0.254'); await p.locator('#f_p1_gateway').press('Tab');
  await until(p, async () => (await import('/js/01-core.js')).byId('p1').gateway === '10.20.0.254');

  // the sidebar: a search stays on while switching types and looks within the type; a type clicked again shows all
  assert.equal(await p.locator('#searchAll').count(), 0, 'no separate All devices option');
  await core(async () => { const c = await import('/js/01-core.js'); (await import('/js/03-object-modals.js')).closeModal(); c.st.tab = 'cards'; (await import('/js/07-render-plans.js')).render(); });
  await p.fill('#search', 'SW-'); await p.waitForTimeout(200);
  const cards = () => p.$$eval('#view .card', cs => cs.map(c => c.dataset.open).sort());
  assert.deepEqual(await cards(), ['s1', 's2'], 'both switches match');
  await p.click('#typeList [data-type=pc]');
  assert.deepEqual(await cards(), [], 'the search looks within PCs');
  await p.click('#typeList [data-type=switch]');
  assert.deepEqual(await cards(), ['s1', 's2']);
  await p.click('#typeList [data-type=switch]');
  assert.equal(await core(async () => (await import('/js/01-core.js')).st.type), null, 'a type clicked again goes back to all');
  await p.fill('#search', ''); await p.waitForTimeout(150);

  // leaving Settings, also with Escape, draws the view behind it again: a renamed type shows on the cards at once
  await core(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'cards'; c.st.setTab = 'types'; (await import('/js/04-settings.js')).openSettings(); });
  await core(async () => { (await import('/js/01-core.js')).TYPES.pc.label = 'Workstation'; });
  await p.keyboard.press('Escape');
  await p.waitForSelector('#setPane', { state: 'detached' });
  assert.match(await p.textContent('#typeList'), /Workstation/, 'the sidebar shows the new name after Settings is left');

  // no racks: New rack opens the rack dialog: name, room, height, model and serial, nothing a rack does not have
  await core(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'rack'; (await import('/js/07-render-plans.js')).render(); });
  await p.waitForSelector('#rackNew'); await p.click('#rackNew');
  await p.waitForSelector('#rnName');
  assert.deepEqual(await p.$$eval('#mdl .form label', ls => ls.map(l => l.textContent)), ['Name', 'Room', 'Height', 'Model', 'Serial number']);
  await p.fill('#rnName', 'RACK-A'); await p.fill('#rnUnits', '24'); await p.click('#rnOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.some(o => o.type === 'rack' && o.name === 'RACK-A' && o.units === 24));
  // with a rack there, the Racks bar has New rack and Open rack, as Floor plans has New plan
  await p.waitForSelector('#rkNew');
  await p.click('#rkNew'); await p.waitForSelector('#rnName');
  await p.fill('#rnName', 'rack-a'); await p.click('#rnOk');
  assert.match(await p.textContent('#rnErr'), /already a rack named rack-a/);
  await p.click('#rnCancel');
  await p.click('#rkOpen');
  await p.waitForSelector('[data-k=units]');
  assert.equal(await p.locator('[data-k=user], [data-k=ip]').count(), 0, 'a rack page has no user and no network fields');
  assert.deepEqual(errors, [], 'page errors');
  console.log('editing after adding: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
