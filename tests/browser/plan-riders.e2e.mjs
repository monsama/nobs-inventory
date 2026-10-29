/* On a floor plan, a monitor attached to a PC is shown in the PC's card, not as a pin; a switch dropped on a rack is
   mounted in it (first free U from the top) and then shown in the rack's card. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
const shots = process.env.NI_SHOTS;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-riders-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const o = (id, type, name, extra = {}) => ({ id, code: 'INV-' + id, type, name, status: 'active', loc: 'Zürich HQ / Hall', ovr: {}, feed: null, ...extra });
saveState(db, { ...s0, locs: ['Zürich HQ / Hall'], sites: ['Zürich HQ'],
  objs: [o('p1', 'pc', 'PC-1', { planPos: { plan: 'pl1', x: 15, y: 15 } }), o('m1', 'monitor', 'MON-1'),
    o('r1', 'rack', 'RACK-1', { units: 42, planPos: { plan: 'pl1', x: 32, y: 32 } }), o('s1', 'switch', 'SW-1', { loc: '', ports: 24 })],
  rels: [{ id: 'a1', from: 'm1', to: 'p1', kind: 'attached', port: null, vlan: null }],
  plans: [{ id: 'pl1', name: 'EG', site: 'Zürich HQ', areas: [{ id: 'ar1', name: 'Hall', room: 'Zürich HQ / Hall', x: 5, y: 5, w: 40, h: 40, rects: [{ x: 5, y: 5, w: 40, h: 40 }] }] }],
  history: {} });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'plans'; (await import('/js/20-plans.js')).renderPlans(); });
  await p.waitForSelector('[data-pin=p1]');
  // the monitor goes with its PC: no pin, not in the list, named in the PC's card
  assert.equal(await p.locator('[data-pin=m1]').count(), 0, 'no pin for the attached monitor');
  assert.equal(await p.locator('[data-plitem=m1]').count(), 0, 'the attached monitor is not offered to place');
  assert.match(await p.textContent('[data-pin=p1] .pl-card'), /Attached\s*MON-1/);
  assert.match(await p.textContent('[data-pin=p1] .pl-rcount'), /\+1/);
  if (shots){ await p.hover('[data-pin=p1]'); await p.waitForTimeout(150); await p.locator('#plCanvas').screenshot({ path: path.join(shots, 'plan-attached.png') }); }
  // drag the switch from the list onto the rack: mounted at the top, then shown in the rack's card
  const item = await p.locator('[data-plitem=s1]').boundingBox(), rack = await p.locator('[data-pin=r1]').boundingBox();
  await p.mouse.move(item.x + 20, item.y + item.height / 2); await p.mouse.down();
  await p.mouse.move(rack.x + rack.width / 2, rack.y + rack.height / 2, { steps: 10 });
  assert.match(await p.getAttribute('[data-pin=r1]', 'class'), /pl-droprack/, 'the rack is marked as the drop target');
  await p.mouse.up();
  await p.waitForSelector('#rdU');
  assert.equal(await p.inputValue('#rdU'), '42', 'the first free U from the top');
  await p.click('#rdOk');
  await until(p, async () => (await import('/js/01-core.js')).byId('s1').rack === 'r1');
  const sw = await p.evaluate(async () => (await import('/js/01-core.js')).byId('s1'));
  assert.deepEqual([sw.u, sw.h, sw.loc], [42, 1, 'Zürich HQ / Hall'], 'mounted at U42, in the rack\'s room');
  assert.equal(await p.locator('[data-pin=s1]').count(), 0, 'a device in a rack on the plan has no pin of its own');
  assert.match(await p.textContent('[data-pin=r1] .pl-card'), /In this rack\s*U42 SW-1/);
  if (shots){ await p.hover('[data-pin=r1]'); await p.waitForTimeout(150); await p.locator('#plCanvas').screenshot({ path: path.join(shots, 'plan-rack.png') }); }
  assert.deepEqual(errors, [], 'page errors');
  console.log('plan riders and racks: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
