/* Browser test of the restyled views: the Overview's figures as one strip (in use and in stock, each opening its list),
   Floor plans with New plan in the Plan… menu and the count first, Racks with the usage meter and Mount device on the
   right, Ports with the front panel first, the port's description in its own panel and the setup last. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { seedBasics } from '../helpers.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-mviews-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const s = loadState(db), room = s.objs[0].loc;
s.plans = [{ id: 'pl1', name: 'EG', site: room.split(' / ')[0], areas: [{ id: 'ar1', name: 'Office', room, x: 10, y: 10, w: 30, h: 30, rects: [{ x: 10, y: 10, w: 30, h: 30 }] }] }];
Object.assign(s.objs.find(o => o.id === 'o1'), { rack: 'R-SRV', u: 30, h: 1 });
s.rels = [{ id: 'l1', from: 'o2', to: 'o1', kind: 'connected', port: 3, vlan: null }];
saveState(db, s);
const stored = check => storedBy(() => loadState(db), check);
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  const go = (tab, more = {}) => p.evaluate(async ([t, m]) => { const c = await import('/js/01-core.js'); c.st.tab = t; Object.assign(c.st, m); (await import('/js/07-render.js')).render(); }, [tab, more]);

  // the Overview: in use and in stock side by side in one strip; In stock opens the devices in stock
  await go('overview'); await p.waitForSelector('.ov-kpis');
  assert.match(await p.textContent('.ov-kpis'), /Devices in use\s*6.*In stock\s*1/s);
  await p.click('.ov-kpis [data-ovs="stock"]');
  await until(p, async () => (await import('/js/01-core.js')).st.tab === 'table');
  await until(p, () => document.querySelectorAll('#view tbody tr').length === 1);
  assert.match(await p.textContent('#view tbody'), /MON-0433/);

  // Floor plans: the count right after the picker; New plan is in the Plan… menu, not a button of its own
  await go('plans'); await p.waitForSelector('#plSel');
  assert.equal(await p.evaluate(() => document.querySelector('#plSel').nextElementSibling.classList.contains('pl-cnt')), true, 'the count comes first');
  assert.equal(await p.isVisible('#plNew'), false);
  await p.click('#plMenu .menu-btn'); await p.waitForSelector('#plNew', { state: 'visible' });
  await p.click('#plNew'); await p.waitForSelector('#mdl');
  await p.keyboard.press('Escape');

  // Racks: how full as a meter, Mount device on the right; the side panel lists the device by its unit
  await go('rack', { rackId: 'R-SRV' }); await p.waitForSelector('.rk-meter');
  assert.match(await p.textContent('#toolbar .rk-use'), /1 of 42 U used/);
  assert.match(await p.textContent('.rackside'), /42 U, 41 free.*U30\s*SW-ZH-2OG-01/s);
  assert.ok(await p.evaluate(() => document.querySelector('#rkMount').getBoundingClientRect().left > document.querySelector('#rkSel').getBoundingClientRect().right + 300), 'actions on the right');

  // Ports: the front panel first, the setup last; the port's description is in the port's panel and saves
  await go('net', { portsDevice: 'o1', portNo: 3 }); await p.waitForSelector('#net .face');
  const heads = await p.locator('#net .panelbox > .hdr').allTextContents();
  assert.match(heads[0], /^Front panel/); assert.match(heads[1], /^Port 1\/3/); assert.equal(heads.at(-1), 'Port setup');
  assert.equal(await p.locator('#net .panelbox', { hasText: 'Port 1/3' }).locator('#pnDesc').count(), 1);
  await p.fill('#pnDesc', 'Desk 4'); await p.press('#pnDesc', 'Tab');
  await stored(st => (st.objs.find(o => o.id === 'o1').portNotes || {})[3] === 'Desk 4');

  assert.deepEqual(errors, [], 'page errors');
  console.log('modern views: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
