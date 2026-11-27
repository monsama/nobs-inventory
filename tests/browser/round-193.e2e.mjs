/* Browser test of round 193: the views bar spans the window and lines up with the view under it, with filters or
   without; a message said while a dialog is open shows beside the dialog, not over it; Hand out does not offer the
   sign-in account that has no devices. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r193-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
saveState(db, { ...s0, locs: ['Zürich / IT'], history: {},
  users: [...s0.users, { id: 'p1', name: 'Finn Graf', role: 'none', active: true, source: 'manual', groups: [] }],
  objs: [{ id: 'pa', code: 'INV-pa', type: 'pc', name: 'PC-A', status: 'stock', loc: 'Zürich / IT', ovr: {}, serial: 'S-pa', model: 'Model X' }] });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const go = (p, t) => p.evaluate(async t => { (await import('/js/01-core.js')).st.tab = t; (await import('/js/07-render.js')).view(); }, t);
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(base); await p.waitForSelector('#lgUser'); await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk'); await p.waitForSelector('#cards .lrow');

  // 1. the views bar: the same place in every view, the full width, and the view starts under it
  const at = () => p.evaluate(() => { const b = document.getElementById('tabsbar').getBoundingClientRect(), c = document.getElementById('content').getBoundingClientRect(), t = document.querySelector('#tabsbar .tab').getBoundingClientRect();
    return { tab: Math.round(t.left), barL: Math.round(b.left), barW: Math.round(b.width), under: Math.round(c.top) >= Math.round(b.bottom) }; });
  await go(p, 'cards'); const a = await at(); await go(p, 'overview'); const b = await at();
  assert.deepEqual(b, a, 'the bar stays put'); assert.equal(a.barL, 0); assert.equal(a.barW, 1400); assert.equal(a.under, true);
  assert.equal(await p.evaluate(() => Math.round(document.getElementById('content').getBoundingClientRect().left)), 0, 'no filters: the view starts at the left edge');

  // 2. a message while a dialog is open shows beside the dialog
  await go(p, 'cards');
  await p.evaluate(async () => (await import('/js/27-handout.js')).handOutModal(['pa']));
  await p.waitForSelector('#hoQ');
  await p.evaluate(async () => (await import('/js/01-core.js')).toast('A note'));
  await p.waitForTimeout(400);
  const over = await p.evaluate(() => { const t = document.getElementById('toast').getBoundingClientRect(), m = document.querySelector('#mdl .box').getBoundingClientRect();
    return t.height > 0 && (t.bottom <= m.top || t.top >= m.bottom) && t.top >= 0 && t.bottom <= innerHeight; });
  assert.equal(over, true, 'the message is beside the dialog, on screen');

  // 3. Hand out offers people, not the sign-in account
  const names = await p.$$eval('#hoList [data-hop]', b => b.map(x => x.textContent));
  assert.ok(names.some(n => /Finn Graf/.test(n)), names.join('|'));
  assert.ok(!names.some(n => /Administrator/.test(n)), names.join('|'));
  //    nor as a new person when its name or login is typed
  await p.fill('#hoQ', 'admin'); await p.waitForTimeout(100);
  assert.equal(await p.$('#hoList [data-honew]'), null, 'no new person for the sign-in account');
  assert.match(await p.textContent('#hoList'), /account to sign in with/);
  await p.click('#hoNo');
  //    nor in the search
  await p.fill('#search', 'admini'); await p.waitForTimeout(400);
  assert.doesNotMatch(await p.textContent('#gsList'), /Hand out a device to Administrator/);
  await p.fill('#search', ''); await p.keyboard.press('Escape');

  // 4. a phone: the tabs fit their bar; a tap beside the filter drawer only closes it
  const { devices } = await import('playwright');
  const ph = await browser.newContext({ ...devices['Pixel 7'] });
  await ph.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const m = await ph.newPage(); m.on('pageerror', e => errors.push(e.message));
  await m.goto(base); await m.waitForSelector('#lgUser'); await m.fill('#lgUser', 'admin'); await m.fill('#lgPw', 'adminpass123'); await m.click('#lgOk'); await m.waitForSelector('#cards .lrow');
  assert.equal(await m.evaluate(() => { const b = document.getElementById('tabsbar').getBoundingClientRect(); return [...document.querySelectorAll('#tabsbar .tab')].every(t => { const r = t.getBoundingClientRect(); return r.top >= b.top && r.bottom <= b.bottom; }); }), true, 'the tabs are whole');
  await m.click('#sideBtn'); await m.waitForFunction(() => document.body.classList.contains('side-open'));
  const row = await m.$eval('#cards .lrow', e => { const r = e.getBoundingClientRect(); return { x: innerWidth - 20, y: r.top + r.height / 2 }; });
  await m.touchscreen.tap(row.x, row.y); await m.waitForTimeout(300);
  assert.equal(await m.evaluate(() => document.body.classList.contains('side-open')), false, 'the drawer closed');
  assert.equal(await m.evaluate(async () => (await import('/js/01-core.js')).st.open.length), 0, 'nothing opened under it');

  assert.deepEqual(errors, []);
  console.log('round 193: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
