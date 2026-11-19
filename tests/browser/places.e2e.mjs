/* Browser test of Settings → Locations as a list and its detail: pick a room; rename it (its devices follow); the store
   room switch; a name in the sources added and removed (chips); a room merged into another (devices, names and plan
   areas go along, one Undo); an empty room deleted; and the search. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-places-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, loc, adText) => ({ id, code: 'INV-' + id, type: 'pc', name: 'PC-' + id, status: 'active', ovr: {}, loc, ...(adText ? { ad: { location: adText } } : {}) });
saveState(db, { ...loadState(db), sites: ['Main', 'Annex'], locs: ['Main / Shop', 'Main / Old shop', 'Main / Store', 'Annex / Hall'],
  locMap: { 'WS shop': 'Main / Old shop' },
  plans: [{ id: 'p1', site: 'Main', name: 'Ground floor', areas: [{ id: 'a1', name: 'Old shop', room: 'Main / Old shop', x: 0, y: 0, w: 10, h: 10 }] }],
  objs: [dev('a', 'Main / Shop'), dev('b', 'Main / Old shop', 'WS shop'), dev('c', '', 'Shop 2'),
    { id: 'pp', code: 'INV-pp', type: 'patch', name: 'PP-1', status: 'active', ovr: {}, loc: 'Main / Shop', ports: 24, outlets: { P01: { name: 'A-01', loc: 'Main / Old shop' } } }], rels: [], history: {} });
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
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.setTab = 'locations'; (await import('/js/04-settings.js')).openSettings(); });
  await p.waitForSelector('.lc-split');
  const pick = async key => { await p.click(`[data-plsel="${key}"]`); await p.waitForSelector(key.startsWith('room:') ? `[data-plroom="${key.slice(5)}"]` : `[data-plsite="${key.slice(5)}"]`); };

  // the first site is open; its store room is picked there
  assert.ok(await p.locator('[data-plsite="Main"]').count());
  await p.selectOption('[data-stock="Main"]', 'Main / Store');
  await stored(st => st.stockRooms && st.stockRooms.Main === 'Main / Store');
  // a room: devices, floor plan, names in the sources
  await pick('room:Main / Old shop');
  assert.match(await p.textContent('[data-plroom="Main / Old shop"]'), /1 device[\s\S]*Ground floor › Old shop[\s\S]*WS shop/);
  // rename: the device and the name follow
  await p.fill('#plRoomName', 'Workshop'); await p.press('#plRoomName', 'Enter');
  await stored(st => st.locs.includes('Main / Workshop') && st.objs.find(o => o.id === 'b').loc === 'Main / Workshop' && st.locMap['WS shop'] === 'Main / Workshop');
  await p.waitForSelector('[data-plroom="Main / Workshop"]');
  // the store room switch: this room becomes the site's store room, Undo puts the old one back
  await p.locator('#plStore').locator('xpath=..').click();
  await stored(st => st.stockRooms.Main === 'Main / Workshop');
  await p.click('#toast .t-undo');
  await stored(st => st.stockRooms.Main === 'Main / Store');
  // a name from the sources added: the device without a location gets the room; the chip × removes the name
  await p.waitForSelector('#plAddName');
  await p.selectOption('#plAddName', 'Shop 2');
  await stored(st => st.locMap['Shop 2'] === 'Main / Workshop' && st.objs.find(o => o.id === 'c').loc === 'Main / Workshop');
  await p.waitForSelector('[data-plunname="Shop 2"]'); await p.click('[data-plunname="Shop 2"]');
  await stored(st => !('Shop 2' in st.locMap) && st.objs.find(o => o.id === 'c').loc === 'Main / Workshop');
  // merge into Main / Shop: devices, names and the plan area go along; one Undo puts it all back
  await p.selectOption('#plMerge', 'Main / Shop');
  await stored(st => !st.locs.includes('Main / Workshop') && st.objs.filter(o => o.loc === 'Main / Shop').length === 4 && st.locMap['WS shop'] === 'Main / Shop' && st.plans[0].areas[0].room === 'Main / Shop'
    && st.objs.find(o => o.id === 'pp').outlets.P01.loc === 'Main / Shop');
  await p.waitForSelector('[data-plroom="Main / Shop"]');
  /* a change made after the merge stays when the merge is undone */
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.locMap = { ...c.st.locMap, 'Later name': 'Annex / Hall' }; (await import('/js/07-render.js')).queueServerSave(); });
  await stored(st => st.locMap['Later name'] === 'Annex / Hall');
  await p.click('#toast .t-undo');
  await stored(st => st.locs.includes('Main / Workshop') && st.objs.find(o => o.id === 'b').loc === 'Main / Workshop' && st.locMap['WS shop'] === 'Main / Workshop' && st.plans[0].areas[0].room === 'Main / Workshop'
    && st.objs.find(o => o.id === 'pp').outlets.P01.loc === 'Main / Workshop' && st.locMap['Later name'] === 'Annex / Hall');
  // an empty room is deleted (Undo brings it back); one with devices only merges
  await pick('room:Annex / Hall');
  await p.click('#plRoomDel');
  await stored(st => !st.locs.includes('Annex / Hall'));
  await p.click('#toast .t-undo');
  await stored(st => st.locs.includes('Annex / Hall'));
  await pick('room:Main / Shop');
  assert.equal(await p.locator('#plRoomDel').count(), 0, 'a room with devices is merged, not deleted');
  // the search finds a room by a name in the sources
  await p.fill('#plFind', 'ws sh');
  await until(p, () => [...document.querySelectorAll('.lc-room')].map(b => b.textContent).join() .includes('Workshop') && document.querySelectorAll('.lc-room').length === 1);
  assert.deepEqual(errors, [], 'page errors');
  console.log('sites and rooms: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
