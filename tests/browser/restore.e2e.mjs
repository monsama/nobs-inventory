/* Browser test of undoing one change: a device field set back from its history (with Undo, and asked first when it was
   changed again since; none for lines that are not a field edit, nor for a field a sync writes), and a setting set back
   from Settings → System → Log. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { eventually, openSetTab, until } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-restore-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, extra = {}) => ({ id, code: 'INV-' + id, type: 'pc', name: 'PC-' + id, status: 'active', loc: 'Bern / EG', ovr: {}, feed: null, ...extra });
saveState(db, { ...loadState(db), locs: ['Bern / EG'], sites: ['Bern'], currency: 'CHF',
  objs: [dev('p1', { supplier: 'Alpha' }), dev('p2', { os: 'Windows 11', pick: { os: 'ls' }, feed: { sys: 'Lansweeper', ref: 'r2', seen: '01.11.2026 08:00' } })],
  history: {
    p1: [{ t: '01.11.2026 08:00', msg: 'Relation "connected to SW-1" added by Admin' }],
    p2: [{ t: '01.11.2026 08:00', msg: 'Operating system changed from Windows 10 to Windows 11 by Admin', f: 'os', from: 'Windows 10', to: 'Windows 11' }] } });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-start-hidden', '1'); localStorage.setItem('ni-started', '1'); localStorage.setItem('ni-all-fields', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => !!(await import('/js/01-core.js')).st.meId);
  const stored = id => loadState(db).objs.find(o => o.id === id);

  // an edit by hand: its own line, with Restore; the older line that is not a field edit has none
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('p1'));
  await p.waitForSelector('#f_p1_supplier');
  await p.fill('#f_p1_supplier', 'Beta'); await p.keyboard.press('Tab');
  await eventually(() => stored('p1').supplier === 'Beta');
  await p.waitForSelector('.hist li:first-child [data-hrestore]');
  assert.match(await p.textContent('.hist li:first-child'), /Supplier changed from Alpha to Beta by Administrator/);
  assert.equal(await p.locator('.hist li', { hasText: 'Relation' }).locator('[data-hrestore]').count(), 0, 'a relation is not a field edit');

  // Restore: set back at once, saved, noted, with Undo
  await p.click('.hist li:first-child [data-hrestore]');
  await eventually(() => stored('p1').supplier === 'Alpha');
  assert.match(await p.textContent('.hist li:first-child'), /Supplier restored from \d\d\.\d\d\.\d{4} \d\d:\d\d: Beta → Alpha by Administrator/);
  assert.equal(await p.inputValue('#f_p1_supplier'), 'Alpha');
  assert.match(await p.textContent('#toast'), /Supplier restored to Alpha/);
  await p.click('#toast .t-undo');
  await eventually(() => stored('p1').supplier === 'Beta');
  assert.match(await p.textContent('.hist li:first-child'), /Supplier back to Beta \(restore undone\)/);

  // changed again since: asked first, with the value now and the one to set back
  await p.fill('#f_p1_supplier', 'Gamma'); await p.keyboard.press('Tab');
  await eventually(() => stored('p1').supplier === 'Gamma');
  await p.locator('.hist li', { hasText: 'Supplier changed from Alpha to Beta' }).locator('[data-hrestore]').click();
  await p.waitForSelector('#cfOk');
  assert.match(await p.textContent('#mdl'), /changed again after[\s\S]*Now: Gamma[\s\S]*Restore: Alpha/);
  await p.click('#cfOk');
  await eventually(() => stored('p1').supplier === 'Alpha');
  assert.equal(stored('p1').src.supplier, 'hand', 'saved as an edit by hand');

  // a field a sync writes (fixed to Lansweeper) has no Restore
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('p2'));
  await p.waitForSelector('#f_p2_os');
  assert.equal(await p.locator('.hist [data-hrestore]').count(), 0);

  // a setting from the log: the currency, changed and set back
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.COSTS.currency = 'EUR'; await (await import('/js/07-render.js')).flushSave(); });
  await eventually(() => loadState(db).currency === 'EUR');
  await p.click('#setBtn'); await openSetTab(p, 'log');
  await p.waitForSelector('#setLog [data-lgr]', { state: 'attached' });
  const row = p.locator('#setLog tr', { hasText: 'setting changed: currency' }).first();
  await row.locator('summary').click();
  await row.locator('[data-lgr]').click();
  await p.waitForSelector('#cfOk');
  assert.match(await p.textContent('#mdl'), /Now: EUR[\s\S]*Restore: CHF/);
  await p.click('#cfOk');
  await eventually(() => loadState(db).currency === 'CHF');
  await until(p, async () => (await import('/js/01-core.js')).COSTS.currency === 'CHF');
  const top = db.prepare('SELECT action FROM audit ORDER BY id DESC LIMIT 1').get().action;
  assert.match(top, /^setting changed: currency, the value restored from /);
  await p.waitForSelector('#setLog');
  await until(p, () => /restored from/.test(document.querySelector('#setLog').textContent));
  assert.deepEqual(errors, []);
  console.log('restore: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
