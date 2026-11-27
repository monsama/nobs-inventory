/* Browser test of round 191: Replace can put the replaced device in stock; New device from a port asks the VLAN;
   Needs attention lists a contract that ended lately and licences ending; Shift + click ticks a range in the Table. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r191-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const dev = (id, type, name, more) => ({ id, code: 'INV-' + id, type, name, status: 'active', loc: 'Zürich / IT', ovr: {}, serial: 'S-' + id, model: 'Model X', ...more });
const s0 = loadState(db);
saveState(db, { ...s0, locs: ['Zürich / IT', 'Zürich / Lager'], stockRooms: { 'Zürich': 'Zürich / Lager' }, history: {}, vlans: [{ vid: 20, name: 'Office' }],
  users: [...s0.users, { id: 'p1', name: 'Ana Bell', role: 'none', active: true, source: 'manual', groups: [] }],
  contracts: [{ id: 'c1', name: 'Old support', kind: 'support', cost: 100, per: 'year', end: day(-10), renew: 0, devices: [] }],
  licences: [{ id: 'l1', name: 'Office Suite', seats: 5, end: day(20) }],
  objs: [dev('core', 'switch', 'SW-CORE', { ports: 24 }), dev('pa', 'pc', 'PC-A', { uid: 'p1', user: 'Ana Bell' }), dev('pb', 'pc', 'PC-B'),
    ...[1, 2, 3, 4].map(i => dev('t' + i, 'notebook', 'NB-T' + i)), dev('d1', 'pc', 'PC-DUP1', { serial: 'SN-SAME' }), dev('d2', 'pc', 'PC-DUP2', { serial: 'SN-SAME' })],
  rels: [{ id: 'r1', from: 'pa', to: 'core', kind: 'connected', port: 5, vlan: 20 }] });
const stored = check => storedBy(() => loadState(db), check);
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await p.waitForSelector('#cards .lrow');

  // 1. Replace PC-A with PC-B, PC-A into stock in the store room
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.portsDevice = 'core'; c.st.portNo = 5; c.st.tab = 'net'; (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('[data-replace="r1"]'); await p.click('[data-replace="r1"]');
  await p.waitForSelector('#lkStock'); await p.check('#lkStock');
  await p.fill('#lkQ', 'PC-B'); await p.press('#lkQ', 'Enter');
  await stored(st => { const a = st.objs.find(o => o.id === 'pa'); return a.status === 'stock' && !a.uid && a.loc === 'Zürich / Lager' && st.rels.some(r => r.from === 'pb' && r.port === 5); });
  await p.click('#toast .t-undo');
  await stored(st => { const a = st.objs.find(o => o.id === 'pa'); return a.status === 'active' && a.uid === 'p1' && st.rels.some(r => r.id === 'r1'); });

  // 2. New device from a port: the VLAN is asked and kept
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.portNo = 9; (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('#assignNewBtn'); await p.click('#assignNewBtn');
  await p.waitForSelector('#nName'); await p.fill('#nName', 'PRN-NEW');
  await p.evaluate(() => { const d = document.getElementById('nMore'); if (d) d.open = true; });
  await p.selectOption('#nVlan', '20'); await p.click('#nOk');
  await stored(st => { const o = st.objs.find(x => x.name === 'PRN-NEW'); return o && o.loc === 'Zürich / IT' && o.status === 'active' && st.rels.some(r => r.from === o.id && r.port === 9 && r.vlan === 20); });

  //    Take back of a device on a port: unplugged too (ticked), with Undo
  await p.evaluate(async () => (await import('/js/27-handout.js')).takeBackModal([(await import('/js/01-core.js')).byId('pa')]));
  await p.waitForSelector('#tbUnplug'); assert.equal(await p.isChecked('#tbUnplug'), true); await p.click('#tbOk');
  await stored(st => st.objs.find(o => o.id === 'pa').status === 'stock' && !st.rels.some(r => r.id === 'r1'));
  await p.click('#toast .t-undo');
  await stored(st => st.objs.find(o => o.id === 'pa').status === 'active' && st.rels.some(r => r.id === 'r1'));

  // 3. Needs attention: the contract that ended, the licence ending
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'overview'; (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('#view');
  const ov = await p.textContent('#view');
  assert.match(ov, /Contract ended.*Old support/s); assert.match(ov, /Licence ending.*Office Suite/s);
  assert.match(ov, /Serial number used twice/);

  // 4. Table: Shift + click ticks the rows between
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'table'; c.st.q = 'NB-T'; c.st.bulk = new Set(); (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('[data-sel="t1"]'); await p.click('[data-sel="t1"]');
  await p.click('[data-sel="t4"]', { modifiers: ['Shift'] });
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).st.bulk.size), 4);

  assert.deepEqual(errors, []);
  console.log('round 191: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
