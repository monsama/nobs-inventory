/* Browser test of a stocktake without a connection: devices confirmed offline are kept on the device, survive the page
   being closed, and are saved once it is opened again with the connection back. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { eventually } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-off-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const dev = id => ({ id, code: 'INV-' + id, type: 'notebook', name: 'NB-' + id, status: 'active', loc: 'Bern / UG', ovr: {}, feed: null });
saveState(db, { ...s0, history: {}, locs: ['Bern / UG'], objs: [dev('k1'), dev('k2')],
  stocktakes: [{ id: 'st1', name: 'Basement', scope: 'Bern / UG', started: new Date().toISOString(), by: 'admin' }] });
const until = (check, ms = 10000) => eventually(check, ms);
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-start-hidden', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(url); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(() => p.evaluate(async () => !!(await import('/js/01-core.js')).st.meId));
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'stocktake'; (await import('/js/07-render.js')).render(); });
  await p.waitForSelector('[data-stk="k1"]');

  await ctx.setOffline(true);
  await p.click('[data-stk="k1"]');
  await until(() => p.evaluate(() => !!localStorage.getItem('ni-offline')));
  assert.match(await p.textContent('#status, #statusbar, body'), /No connection/);
  assert.equal(loadState(db).objs.find(o => o.id === 'k1').verified, undefined, 'not on the server yet');
  await p.close();

  // the connection is back; the page opened again (the session is still signed in)
  await ctx.setOffline(false);
  const q = await ctx.newPage(); q.on('pageerror', e => errors.push(e.message));
  await q.goto(url);
  await until(() => { const o = loadState(db).objs.find(x => x.id === 'k1'); return !!(o.verified && o.verified.st === 'st1'); });
  await until(() => q.evaluate(() => !localStorage.getItem('ni-offline')), 10000);
  assert.deepEqual(errors.filter(e => !/Failed to fetch|NetworkError/.test(e)), []);
  console.log('offline stocktake: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
