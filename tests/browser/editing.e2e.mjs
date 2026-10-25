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

  // no racks: New rack opens New object with the type Rack
  await core(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'rack'; (await import('/js/07-render-plans.js')).render(); });
  await p.waitForSelector('#rackNew'); await p.click('#rackNew');
  await p.waitForSelector('#nType');
  assert.equal(await p.inputValue('#nType'), 'rack');
  assert.deepEqual(errors, [], 'page errors');
  console.log('editing after adding: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
