/* Browser test of round 169: on a device's page, what AD says of its location (a place that is no room yet, made one in
   Settings; another room, moved there with one click), and a device attached to another follows its location: the
   field shows it and cannot be picked, and moving the computer moves its monitor in the same save. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r169-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, more) => ({ id, code: 'INV-' + id, type: 'notebook', name: 'NB-' + id, status: 'active', loc: 'Main / Office', ovr: {}, inAd: true, ...more });
saveState(db, { ...loadState(db), sites: ['Main'], locs: ['Main / Office', 'Main / Lab'], locMap: { Lab: 'Main / Lab' }, objs: [
  dev('n1', { ad: { location: 'Endkontrolle' } }), dev('n2', { ad: { location: 'Lab' } }),
  dev('pc', { type: 'pc', name: 'PC-1', inAd: false }), dev('m', { type: 'monitor', name: 'MON-1', loc: '', inAd: false }),
], rels: [{ id: 'r1', from: 'm', to: 'pc', kind: 'attached', port: null, vlan: null }], history: {} });

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
  const open = id => p.evaluate(async id => (await import('/js/02-views.js')).openObj(id), id);

  // the server's save at start already put the monitor where its computer is
  assert.equal(loadState(db).objs.find(o => o.id === 'm').loc, 'Main / Office');

  // AD names a place that is no room yet: said under the location, and made a room in Settings
  await open('n1'); await p.waitForSelector('.fieldnote.loc-ad');
  assert.match(await p.textContent('.fieldnote.loc-ad'), /AD: Endkontrolle is no room here yet/);
  await p.click('[data-locroom]');
  await p.waitForSelector('#adBulkGo');
  assert.equal((await p.textContent('#adBulkGo')).trim(), 'Create 1 room');
  await p.keyboard.press('Escape'); await until(p, () => !document.querySelector('#mdl[open]'));

  // AD names another room: one click moves it there
  await open('n2'); await p.waitForSelector('[data-locuse]');
  assert.match(await p.textContent('.fieldnote.loc-ad'), /AD: Lab is the room Main \/ Lab/);
  await p.click('[data-locuse]');
  await storedBy(() => loadState(db), s => s.objs.find(o => o.id === 'n2').loc === 'Main / Lab');

  // an attached device: its location is its computer's, shown and not picked
  await open('m'); await p.waitForSelector('.fieldnote.loc-host');
  assert.match(await p.textContent('.fieldnote.loc-host'), /Follows PC-1, the device it is attached to/);
  assert.equal(await p.isDisabled('select[data-k="loc"]'), true);

  // the computer moves: its monitor goes along in the same save
  await open('pc'); await p.waitForSelector('select[data-k="loc"]');
  await p.selectOption('select[data-k="loc"]', 'Main / Lab');
  await storedBy(() => loadState(db), s => s.objs.find(o => o.id === 'pc').loc === 'Main / Lab' && s.objs.find(o => o.id === 'm').loc === 'Main / Lab');
  assert.match(loadState(db).history.m[0].msg, /Location changed from Main \/ Office to Main \/ Lab: it is attached to PC-1/);

  assert.deepEqual(errors, []);
  console.log('round 169: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
