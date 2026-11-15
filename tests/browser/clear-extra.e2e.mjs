/* Clear inventory with what the syncs bring back: the people from AD, Entra and Lansweeper (not admins, not you, not
   the user of a kept device), the rooms and sites nothing kept uses, the models no kept device uses; and in any case
   the lists about the deleted devices. What is still used stays. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-clr-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const person = (id, source, role = 'none') => ({ id, login: id, name: 'Person ' + id, dept: '', role, groups: [], source, active: true });
saveState(db, { ...s0,
  users: [...s0.users, person('u-ldap', 'ldap', 'viewer'), person('u-entra-admin', 'entra', 'admin'), person('u-manual', 'manual'), person('u-ls', 'lansweeper'), person('u-ls2', 'lansweeper')],
  locs: ['HQ / Office', 'Branch / Store', 'Branch / Lab', 'Plant / Hall'], sites: ['HQ', 'Branch', 'Plant'], stockRooms: { Plant: 'Plant / Hall' },
  models: ['M-Kept', 'M-Gone', 'M-Mapped'], modelMap: { 'Vendor 123': 'M-Mapped' },
  syncChanges: { lansweeper: [{ at: '2026-11-01T06:00:00Z', n: 1, fields: {} }] },
  objs: [
    { id: 'a', code: 'INV-a', type: 'pc', name: 'PC-KEPT', status: 'active', excluded: true, loc: 'HQ / Office', model: 'M-Kept', uid: 'u-ls', user: 'Person u-ls' },
    { id: 'b', code: 'INV-b', type: 'pc', name: 'PC-GONE', status: 'active', loc: 'Branch / Store', model: 'M-Gone', uid: 'u-ldap', user: 'Person u-ldap' },
  ], rels: [], history: {} });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length === 2);
  await p.evaluate(async () => (await import('/js/server-save.js')).clearConfirm());
  await p.waitForSelector('#clrOk');
  for (const b of ['#clrPeople', '#clrPlaces', '#clrModels']) assert.equal(await p.isChecked(b), false, b + ' is ticked from the start');
  await p.check('#clrPeople'); await p.check('#clrPlaces'); await p.check('#clrModels');
  await p.fill('#clrWord', 'CLEAR'); await p.click('#clrOk');
  await storedBy(() => loadState(db), s => !s.users.some(u => u.id === 'u-ldap') && !s.syncChanges, 20000);
  const s = loadState(db);
  assert.deepEqual(s.objs.map(o => o.name), ['PC-KEPT'], 'the excluded device stays, the other goes');
  assert.deepEqual(s.users.map(u => u.id).filter(id => id.startsWith('u-') && id !== 'u-admin').sort(), ['u-entra-admin', 'u-ls', 'u-manual'], 'people: an admin, one added by hand and the user of a kept device stay');
  assert.ok(s.users.some(u => u.login === 'admin'), 'you stay');
  assert.deepEqual(s.locs, ['HQ / Office', 'Plant / Hall'], 'rooms: the kept device\'s and the store room stay');
  assert.deepEqual(s.sites, ['HQ', 'Plant']);
  assert.deepEqual(s.models, ['M-Kept', 'M-Mapped'], 'models: the kept device\'s and the mapped one stay');
  assert.deepEqual(s.modelMap, { 'Vendor 123': 'M-Mapped' });
  await p.waitForFunction(() => /Also removed: 2 people, unused rooms, unused sites, unused models/.test(document.querySelector('#toast').textContent), null, { timeout: 5000 });
  assert.deepEqual(errors, [], 'page errors');
  console.log('clear with what the syncs bring back: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
