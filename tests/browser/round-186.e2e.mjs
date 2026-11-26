/* Browser test of round 186: a price that is not a number keeps the price saved; quick edit saves a second edit of the
   description too; the Table's Set status → Retired opens the Retire dialog, and → In stock for a device with a user
   the take-back, so no device is retired or in stock with a user still on it. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r186-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, type, name, more) => ({ id, code: 'INV-' + id, type, name, status: 'active', loc: '', ovr: {}, serial: 'S-' + id, ...more });
const s0 = loadState(db);
saveState(db, { ...s0, history: {}, users: [...s0.users, { id: 'p1', name: 'Pia Muster', role: 'none', active: true, source: 'manual', groups: [] }], objs: [
  dev('d1', 'notebook', 'NB-PRICE', { price: 1290 }),
  dev('d2', 'notebook', 'NB-DESC'),
  dev('d3', 'notebook', 'NB-RET', { uid: 'p1' }),
  dev('d4', 'notebook', 'NB-STOCK', { uid: 'p1' }),
  dev('w1', 'switch', 'SW-OLD', { ports: 8 }), dev('d5', 'pc', 'PC-ON-SW'),
], rels: [{ id: 'r1', from: 'd5', to: 'w1', kind: 'connected', port: 2, vlan: null }] });
const stored = check => storedBy(() => loadState(db), check);

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); localStorage.setItem('ni-all-fields', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await p.waitForSelector('#cards .lrow');
  const row = id => `#cards .lrow[data-open="${id}"]`;

  // 1. a price that is not a number: the saved price stays, the field shows it again
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('d1'));
  await p.waitForSelector('#view [data-k=price]');
  await p.fill('#view [data-k=price]', '1290 CHF'); await p.locator('#view [data-k=price]').press('Tab');
  await until(p, () => /price is a number/.test(document.querySelector('#toast')?.textContent || ''));
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).byId('d1').price), 1290);
  assert.equal(await p.inputValue('#view [data-k=price]'), '1290');
  await p.fill('#view [data-k=price]', '1500'); await p.locator('#view [data-k=price]').press('Tab');
  await stored(st => st.objs.find(o => o.id === 'd1').price === 1500);
  await p.click('[data-close="d1"]');
  await p.waitForSelector(row('d2'));

  // 2. quick edit: a second edit of the description is saved too
  await p.hover(row('d2')); await p.click(`${row('d2')} .qedit-btn`); await p.waitForSelector('#qeDesc');
  await p.fill('#qeDesc', 'First'); await p.press('#qeDesc', 'Enter');
  await stored(st => st.objs.find(o => o.id === 'd2').purpose === 'First');
  await p.fill('#qeDesc', 'Second'); await p.press('#qeDesc', 'Enter');
  await stored(st => st.objs.find(o => o.id === 'd2').purpose === 'Second');
  await p.keyboard.press('Escape');

  // 3. Table: Set status → Retired opens the Retire dialog, which takes the user away
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'table'; c.st.bulk = new Set(['d3', 'w1']); (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('#bkAct');
  await p.selectOption('#bkAct', 'status:retired'); await p.waitForSelector('#grOk'); await p.click('#grOk');
  await stored(st => { const o = st.objs.find(x => x.id === 'd3'); return o.status === 'retired' && !o.uid && !st.rels.some(r => r.to === 'w1'); });
  //    → In stock for a device with a user: the take-back
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.bulk = new Set(['d4']); (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('#bkAct');
  await p.selectOption('#bkAct', 'status:stock');
  await until(p, () => !!document.querySelector('dialog[open]'));
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).byId('d4').status), 'active', 'nothing changed before the take-back');

  assert.deepEqual(errors, []);
  console.log('round 186: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
