/* Browser test of round 164: under the room, what AD (or the user's office) gives as location when it is not that room:
   a place that is no room here yet (new), or another room; nothing when they agree. The same in the Table's AD location
   column and as two data quality items on the Overview. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r164-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, more) => ({ id, code: 'INV-' + id, type: 'notebook', name: 'NB-' + id, status: 'active', loc: 'Main / Office', ovr: {}, inAd: true, ...more });
saveState(db, { ...loadState(db), sites: ['Main'], locs: ['Main / Office', 'Main / Lab'], locMap: { Lab: 'Main / Lab' }, objs: [
  dev('1', { ad: { location: 'Main / Office' } }), dev('2', { ad: { location: 'Bern 2. OG' } }), dev('3', { ad: { location: 'lab' } }), dev('4', { loc: '', ad: { location: 'Annex Hall' } }), dev('5', {}), dev('6', { loc: '', ad: { location: 'Lab' } }),
  dev('7', { loc: '', inAd: false, uid: 'u1' }), dev('h', { type: 'pc', name: 'PC-H', inAd: false }), dev('m', { type: 'monitor', name: 'MON-M', loc: '', inAd: false, ad: { location: 'Bern 2. OG' } }),
], rels: [{ id: 'r1', from: 'm', to: 'h', kind: 'attached', port: null, vlan: null }], users: [...loadState(db).users, { id: 'u1', name: 'Pat Example', login: 'pat', role: 'viewer', profile: { office: 'Annex Hall' } }], history: {} });

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

  const line = id => p.evaluate(id => { const e = document.querySelector(`#cards .lrow[data-open="${id}"] .c-lsrc`); return e ? [e.className.replace('c-lsrc ', ''), e.textContent.trim()] : null; }, id);
  assert.equal(await line('1'), null, 'AD and the room agree: nothing more');
  assert.deepEqual(await line('2'), ['ls-new', 'AD: Bern 2. OG new']);
  assert.deepEqual(await line('3'), ['ls-diff', 'AD: lab'], 'mapped to another room');
  assert.deepEqual(await line('4'), ['ls-new', 'AD: Annex Hall new']);
  assert.equal(await p.locator('#cards .lrow[data-open="4"] .c-ll').count(), 0, 'no room: the AD line alone');
  assert.equal(await line('5'), null);
  assert.deepEqual(await line('6'), ['ls-fill', 'AD: Lab'], 'a room the device does not have yet: not counted as differing');
  assert.equal(await line('7'), null, 'the user\'s office only with "Use the office of the device\'s user" on');
  assert.equal((await p.textContent('#cards .lrow[data-open="m"] .c-ll')).trim(), 'Office', 'an attached device keeps its host\'s room above the AD line');
  assert.match(await p.getAttribute('#cards .lrow[data-open="3"] .c-lsrc', 'title'), /is the room Main \/ Lab, not Main \/ Office/);

  // the Overview: two data quality items, which open the devices in the Table with the AD location column's words
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'overview'; (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('[data-ovq="locnew"]');
  assert.match(await p.textContent('[data-ovq="locnew"]'), /^3/);
  assert.match(await p.textContent('[data-ovq="locdiff"]'), /^1/);
  await p.click('[data-ovq="locnew"]');
  await until(p, () => document.querySelectorAll('table.grid tbody tr').length === 3);

  assert.deepEqual(errors, []);
  console.log('round 164: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
