/* Browser test of the way from an AD location text to a floor plan: in Settings → Locations a text AD sends is used as a
   new room, and devices without a location get it at once; an area drawn on the plan with that room then shows all of
   them, without placing each. What does not show: a device whose location was set by hand stays where it is, a monitor
   attached to a device is in that device's card, a retired device is not on the plan. A device that comes later with
   the same text (the next AD sync) shows in the area too. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { applyComputers } from '../../server/ldap-sync.js';
import { seedBasics } from '../helpers.js';
import { openSetTab, storedBy, until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-adloc-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const s = loadState(db);
const site = s.objs[0].loc.split(' / ')[0], handRoom = s.objs[0].loc, text = 'ZH 3.OG Ost', room = `${site} / ${text}`;
if (!s.sites.includes(site)) s.sites.push(site);
const dev = (id, type, name, extra = {}) => ({ id, code: 'INV-' + id.slice(1).padStart(4, '0'), type, name, status: 'active', feed: null, ovr: {}, loc: '', ad: { location: text }, ...extra });
s.objs.push(
  dev('o81', 'pc', 'OST-PC-1'),
  dev('o82', 'notebook', 'OST-NB-2'),
  dev('o83', 'printer', 'OST-PRN-3', { loc: handRoom, src: { loc: 'hand' } }),
  dev('o84', 'monitor', 'OST-MON-4'),
  dev('o85', 'pc', 'OST-OLD-5', { status: 'retired' }));
s.rels.push({ id: 'r84', from: 'o84', to: 'o81', kind: 'attached', port: null, vlan: null });
s.plans = [{ id: 'pl1', name: '3. OG', site, areas: [] }];
saveState(db, s);
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const obj = id => loadState(db).objs.find(o => o.id === id);
const pins = p => p.evaluate(() => [...document.querySelectorAll('#plCanvas .pl-pin')].map(el => el.dataset.pin).sort());
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => !!(await import('/js/01-core.js')).st.meId);

  // 1. Settings → Locations: the AD text used as a new room of the site
  await p.click('#setBtn'); await openSetTab(p, 'locations');
  const sel = p.locator(`#adLocs select[aria-label="Use ${text} as"]`);
  await sel.waitFor();
  await sel.selectOption(`site:${site}`);
  await storedBy(() => loadState(db), t => t.locs.includes(room) && t.objs.find(o => o.id === 'o81').loc === room && t.objs.find(o => o.id === 'o82').loc === room);
  assert.equal(obj('o83').loc, handRoom, 'a location set by hand was changed');
  await p.keyboard.press('Escape');

  // 2. On the plan: an area drawn and given that room
  await p.click('[data-tab=plans]'); await p.waitForSelector('#plCanvas');
  assert.deepEqual(await pins(p), [], 'devices on the plan before an area has their room');
  const cb = await p.locator('#plCanvas').boundingBox();
  await p.click('#plArea');
  await p.mouse.move(cb.x + cb.width * 0.1, cb.y + cb.height * 0.1); await p.mouse.down();
  await p.mouse.move(cb.x + cb.width * 0.6, cb.y + cb.height * 0.6, { steps: 6 }); await p.mouse.up();
  await p.click('#plAreaDone'); await p.waitForSelector('#arRoom');
  await p.selectOption('#arRoom', room);
  assert.equal(await p.inputValue('#arName'), text, 'the area is not named after the room');
  await p.click('#arOk');
  await storedBy(() => loadState(db), t => t.plans[0].areas.length === 1 && t.plans[0].areas[0].room === room);

  // 3. every device in the room is in the area; the hand-set one, the attached monitor and the retired one are not pins
  await until(p, () => document.querySelectorAll('#plCanvas .pl-pin').length === 2);
  assert.deepEqual(await pins(p), ['o81', 'o82'], 'the area does not show the devices of its room');
  assert.match(await p.textContent('[data-pin="o81"] .pl-card'), /OST-MON-4/, 'the attached monitor is not in its device\'s card');
  assert.equal((await p.textContent('#plCanvas [data-area-tag] .pl-acount')).trim(), '2', 'the area does not count its devices');
  assert.equal(obj('o81').planPos, undefined, 'a device was placed by hand: it should show by its room');

  // 4. a device the next AD sync brings with the same text shows in the area too
  const t = loadState(db);
  t.objs.push(dev('o86', 'pc', 'OST-PC-6', { ad: undefined }));
  applyComputers(t, [{ name: 'OST-PC-6', location: text, groups: [] }]);
  assert.equal(t.objs.find(o => o.id === 'o86').loc, room, 'the sync did not give the new device the room');
  saveState(db, t);
  await p.evaluate(async () => (await import('/js/server-load.js')).reloadFromServer());
  await until(p, () => !!document.querySelector('#plCanvas [data-pin="o86"]'));
  assert.deepEqual(await pins(p), ['o81', 'o82', 'o86']);
  assert.deepEqual(errors, [], 'page errors');
  console.log('ad location to plan: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
