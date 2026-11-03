/* Browser test of the person view, the To review card actions, getting started and Settings' first tab: a person who
   left shows their devices with their own bar and Take all back; Accept on a card takes a record in (a notebook nobody
   has goes into stock); a new inventory shows its first steps; Settings opens on Locations. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { eventually } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-rebuild-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const dev = (id, name, extra = {}) => ({ id, code: 'INV-' + id, type: 'notebook', name, status: 'active', feed: null, ovr: {}, ...extra });
saveState(db, { ...s0, history: {},
  users: [...s0.users, { id: 'u-dino', login: '', name: 'Dino Brunner', dept: 'Sales', source: 'manual', role: 'none', active: false }, { id: 'u-anna', login: '', name: 'Anna Muster', source: 'manual', role: 'none', active: true }],
  objs: [dev('d1', 'NB-DINO', { uid: 'u-dino' }), dev('d2', 'PH-DINO', { type: 'ios', uid: 'u-dino' }), dev('a1', 'NB-ANNA', { uid: 'u-anna' }),
    dev('r1', 'NB-NEW-1', { review: { src: 'lansweeper', at: '01.11.2026 08:00' } }), dev('r2', 'NB-NEW-2', { review: { src: 'lansweeper', at: '01.11.2026 08:00' } })] });
const until = (check, ms = 8000) => eventually(check, ms);

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(() => p.evaluate(async () => !!(await import('/js/01-core.js')).st.meId));

  // getting started: no sites and no company name yet, devices there
  await p.click('#tabsbar [data-tab=overview]'); await p.waitForSelector('.panelbox.start');
  assert.match(await p.textContent('.panelbox.start'), /2 of 4 done/);
  // hand-backs open: Dino left with two devices; a click opens his devices
  await p.waitForSelector('[data-ovhb="u-dino"]');
  assert.match(await p.textContent('[data-ovhb="u-dino"]'), /Dino Brunner.*2 devices/);
  assert.equal(await p.locator('[data-ovhb="u-anna"]').count(), 0, 'someone still there is not listed');
  await p.click('[data-ovhb="u-dino"]');
  await until(() => p.evaluate(async () => (await import('/js/01-core.js')).st.person === 'u-dino'));
  await p.click('#tabsbar [data-tab=overview]'); await p.waitForSelector('.panelbox.start');
  assert.equal(await p.locator('.start-step.done').count(), 2, 'people and devices are there');

  // Settings opens on Locations
  await p.click('[data-start="locations"]'); await p.waitForSelector('#setTabs');
  assert.equal((await p.textContent('#setTabs .tab')).trim(), 'Locations', 'the first tab');
  await p.keyboard.press('Escape');

  // the person view: Dino left, two devices, Take all back
  await p.evaluate(async () => (await import('/js/settings-users.js')).showDevicesOf('u-dino'));
  await p.waitForSelector('#fbar .fb-person');
  const bar = await p.textContent('#fbar .fb-person');
  assert.match(bar, /Dino Brunner/); assert.match(bar, /left/); assert.match(bar, /2 devices/); assert.match(bar, /Hand-back list/);
  assert.equal(await p.locator('#view table.grid[data-data] tbody tr').count(), 2, 'only his devices');
  await p.click('[data-pact="back"]'); await p.click('#tbOk');
  await until(() => { const s = loadState(db); return ['d1', 'd2'].every(id => { const o = s.objs.find(x => x.id === id); return o.status === 'stock' && !o.uid; }); });
  assert.equal(loadState(db).objs.find(o => o.id === 'a1').uid, 'u-anna', 'other people keep theirs');

  // To review: Accept on the card; a notebook nobody has goes into stock
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.person = null; c.st.live = false; c.st.scope = 'review'; c.st.tab = 'cards'; (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('[data-rvc="accept"][data-rvid="r1"]');
  await p.click('[data-rvc="accept"][data-rvid="r1"]');
  await until(() => { const o = loadState(db).objs.find(x => x.id === 'r1'); return o && !o.review && o.status === 'stock'; });
  assert.deepEqual(errors, []);
  console.log('rebuilds: all checks passed');
} finally { await browser.close(); server.close(); db.close(); }
