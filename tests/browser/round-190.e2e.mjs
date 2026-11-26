/* Browser test of round 190: plugging into a port asks for its VLAN; a person with no devices gets one line, not an
   empty table; on a phone the Filters button stays, greyed out, where a view has no filters. */
import { chromium, devices } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r190-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, type, name, more) => ({ id, code: 'INV-' + id, type, name, status: 'active', loc: 'Zürich / IT', ovr: {}, serial: 'S-' + id, model: 'Model X', ...more });
const s0 = loadState(db);
saveState(db, { ...s0, locs: ['Zürich / IT'], history: {}, vlans: [{ vid: 20, name: 'Office' }, { vid: 30, name: 'Voice' }],
  users: [...s0.users, { id: 'p1', name: 'Mia Graf', role: 'none', active: true, source: 'manual', groups: [] }],
  objs: [dev('core', 'switch', 'SW-CORE', { ports: 24 }), dev('pa', 'pc', 'PC-A'), dev('h1', 'pc', 'DESKTOP-4AE2F1'), dev('h2', 'pc', 'DESKTOP-4A2F1')], rels: [] });
const stored = check => storedBy(() => loadState(db), check);
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const signIn = async p => { await p.goto(base); await p.waitForSelector('#lgUser'); await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk'); await p.waitForSelector('#search'); };
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await signIn(p);

  // 1. plug in at a port: the VLAN is asked and kept
  await p.evaluate(async () => (await import('/js/05-new-object.js')).linkObjModal({ to: 'core', port: 4 }));
  await p.waitForSelector('#lkVlan'); await p.selectOption('#lkVlan', '30');
  await p.fill('#lkQ', 'PC-A'); await p.press('#lkQ', 'Enter');
  await stored(st => st.rels.some(r => r.from === 'pa' && r.port === 4 && r.vlan === 30));

  //    a search for a hostname finds that one, not one that differs by an "e" (the ae/oe/ue rule is for words)
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.q = 'desktop-4ae2f1'; c.st.tab = 'cards'; (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('#cards .lrow[data-open="h1"]');
  assert.equal(await p.locator('#cards .lrow').count(), 1);
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.q = ''; (await import('/js/07-render.js')).view(); });

  // 2. a person with no devices: one line, no table
  await p.evaluate(async () => (await import('/js/04-settings.js')).showDevicesOf('p1'));
  await p.waitForSelector('.empty-person');
  assert.equal(await p.locator('#view table.grid').count(), 0);

  // 3. phone: the Filters button stays, disabled, in a view without filters
  const phone = await browser.newContext({ ...devices['Pixel 7'] });
  await phone.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const m = await phone.newPage(); m.on('pageerror', e => errors.push(e.message));
  await signIn(m);
  const btn = () => m.evaluate(() => { const b = document.getElementById('sideBtn'); return [b.disabled, getComputedStyle(b).display !== 'none', Math.round(document.getElementById('search').getBoundingClientRect().left)]; });
  await m.evaluate(async () => { (await import('/js/01-core.js')).st.tab = 'cards'; (await import('/js/07-render.js')).view(); });
  const a = await btn();
  await m.evaluate(async () => { (await import('/js/01-core.js')).st.tab = 'overview'; (await import('/js/07-render.js')).view(); });
  const b = await btn();
  assert.deepEqual([a[0], a[1], b[0], b[1]], [false, true, true, true]);
  assert.equal(b[2], a[2], 'the search does not move');

  assert.deepEqual(errors, []);
  console.log('round 190: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
