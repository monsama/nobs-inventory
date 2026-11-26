/* Browser test of round 189: a name in any order filters the List as the search does; Replace takes a device from
   another port of the same switch; Hand out's room question is marked; the search lists Software once. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r189-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, type, name, more) => ({ id, code: 'INV-' + id, type, name, status: 'active', loc: 'Zürich / IT', ovr: {}, serial: 'S-' + id, model: 'Model X', ...more });
const s0 = loadState(db);
saveState(db, { ...s0, locs: ['Zürich / IT', 'Zürich / Lager'], stockRooms: { 'Zürich': 'Zürich / Lager' }, history: {},
  users: [...s0.users, { id: 'p1', name: 'Finn Graf', role: 'none', active: true, source: 'manual', groups: [] }],
  objs: [dev('core', 'switch', 'SW-CORE', { ports: 24 }), dev('pa', 'pc', 'PC-A'), dev('pb', 'pc', 'PC-B'), dev('nb', 'notebook', 'NB-FINN', { uid: 'p1', user: 'Finn Graf' }),
    dev('st1', 'notebook', 'NB-STOCK', { status: 'stock', loc: 'Zürich / Lager' })],
  rels: [{ id: 'r1', from: 'pa', to: 'core', kind: 'connected', port: 5, vlan: null }, { id: 'r2', from: 'pb', to: 'core', kind: 'connected', port: 7, vlan: null }] });
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

  // 1. a name in any order filters the List as it does the search
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.q = 'graf finn'; (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('#cards .lrow[data-open="nb"]');
  assert.equal(await p.locator('#cards .lrow').count(), 1);
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.q = ''; (await import('/js/07-render.js')).view(); });

  // 2. Replace on port 5 with the device on port 7 of the same switch: it moves
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.portsDevice = 'core'; c.st.portNo = 5; c.st.tab = 'net'; (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('[data-replace="r1"]'); await p.click('[data-replace="r1"]');
  await p.waitForSelector('#lkQ'); await p.fill('#lkQ', 'PC-B'); await p.press('#lkQ', 'Enter');
  await stored(st => { const b = st.rels.filter(r => r.from === 'pb'); return b.length === 1 && b[0].port === 5 && !st.rels.some(r => r.from === 'pa'); });

  // 3. Hand out from the store room without a room picked: the room field is marked red
  await p.evaluate(async () => (await import('/js/27-handout.js')).handOutModal(['st1']));
  await p.waitForSelector('#hoQ'); await p.fill('#hoQ', 'Finn'); await p.press('#hoQ', 'Enter'); await p.click('#hoOk');
  await p.waitForSelector('#hoLoc.bad');
  assert.notEqual(await p.$eval('#hoLoc', e => getComputedStyle(e).borderTopColor), 'rgb(214, 217, 222)');
  await p.keyboard.press('Escape');

  // 4. "licence": Software once
  await p.fill('#search', 'licence'); await p.waitForSelector('#gsList li[data-i]');
  const sw = await p.$$eval('#gsList li[data-i]', l => l.filter(x => /Software/.test(x.textContent)).length);
  assert.equal(sw, 1, await p.textContent('#gsList'));

  // 5. accents left out find the room; a name typed puts the person first (Enter opens them)
  await p.fill('#search', 'zurich lager'); await p.waitForSelector('#gsList li[data-i]:has-text("Lager")');
  await p.fill('#search', 'finn'); await p.waitForSelector('#gsList li[data-i]');
  assert.match(await p.textContent('#gsList li[data-i]'), /Finn Graf/);

  assert.deepEqual(errors, []);
  console.log('round 189: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
