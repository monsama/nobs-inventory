/* Browser test of renaming places: a room renamed takes along the store room set for its site, a saved view filtering
   on it, a location text mapped to it, and a plan area that only names it (its devices stay on the plan); a site
   renamed does the same for the store room's site and room. And × on a plan pin takes the device out of its room
   with Undo, marked as by hand, so a sync does not put the room back. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { seedBasics } from '../helpers.js';
import { storedBy, until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-rename-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const s = loadState(db);
const old = 'Zürich HQ / Open office';
if (!s.locs.includes(old)) s.locs.push(old);
if (!s.locs.includes('Zürich HQ / Lager')) s.locs.push('Zürich HQ / Lager');
s.objs.push({ id: 'o20', code: 'INV-0020', type: 'pc', name: 'OPEN-PC', status: 'active', ovr: {}, feed: null, loc: old, src: { loc: 'ad' } });
s.plans = [{ id: 'pl1', name: 'EG', site: 'Zürich HQ', areas: [{ id: 'ar1', name: 'Open office', x: 10, y: 10, w: 30, h: 30, rects: [{ x: 10, y: 10, w: 30, h: 30 }] }] }];
s.stockRooms = { 'Zürich HQ': 'Zürich HQ / Lager' };
s.savedViews = [{ id: 'v1', name: 'Open office', filters: { loc: old } }];
s.locMap = { 'OG Open': old };
saveState(db, s);
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => !!(await import('/js/01-core.js')).st.meId);

  // the room the area only names, renamed: the area, the saved view and the mapped text follow; the device stays on the plan
  await p.evaluate(async o => (await import('/js/settings-network.js')).renameLoc(o, 'Zürich HQ / Großraum'), old);
  await storedBy(() => loadState(db), t => t.objs.find(o => o.id === 'o20').loc === 'Zürich HQ / Großraum'
    && t.plans[0].areas[0].room === 'Zürich HQ / Großraum' && t.savedViews[0].filters.loc === 'Zürich HQ / Großraum' && t.locMap['OG Open'] === 'Zürich HQ / Großraum');
  await p.click('[data-tab=plans]'); await p.waitForSelector('#plCanvas');
  await p.waitForSelector('[data-pin="o20"]');

  // the store room renamed: its site keeps it under the new name
  await p.evaluate(async () => (await import('/js/settings-network.js')).renameLoc('Zürich HQ / Lager', 'Zürich HQ / Store'));
  await storedBy(() => loadState(db), t => t.stockRooms['Zürich HQ'] === 'Zürich HQ / Store');
  // the site renamed: the store room's site and room follow
  await p.evaluate(async () => (await import('/js/settings-network.js')).renameSite('Zürich HQ', 'Zürich Campus'));
  await storedBy(() => loadState(db), t => t.stockRooms['Zürich Campus'] === 'Zürich Campus / Store' && !t.stockRooms['Zürich HQ']
    && t.savedViews[0].filters.loc === 'Zürich Campus / Großraum');

  // × on the pin: out of the room, by hand (no sync fills it again), with Undo
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'plans'; (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('[data-pin="o20"]');
  await p.hover('[data-pin="o20"]'); await p.click('[data-unpin="o20"]');
  await storedBy(() => loadState(db), t => { const o = t.objs.find(x => x.id === 'o20'); return o.loc === '' && o.pick && o.pick.loc === 'hand'; });
  await p.click('#toast .t-undo');
  await storedBy(() => loadState(db), t => { const o = t.objs.find(x => x.id === 'o20'); return o.loc === 'Zürich Campus / Großraum' && !(o.pick && o.pick.loc); });
  assert.deepEqual(errors, [], 'page errors');
  console.log('rename places: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
