/* Browser test of round 184: closing a device goes back to the Table it was opened from; links the Lansweeper sync made
   are marked under Relations, and Sources takes Lansweeper's switch port over one set by hand; the port view marks a
   port where Lansweeper sees a device the inventory has elsewhere, and its port map leaves attached monitors out; a
   personal device (only registered in Entra) offers no Hand out nor Confirm on site and shows its owner in the List;
   the empty bell points to Data quality. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r184-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const today = new Date().toISOString().slice(0, 10);
const dev = (id, type, name, more) => ({ id, code: 'INV-' + id, type, name, status: 'active', loc: '', ovr: {}, serial: 'S-' + id, ...more });
saveState(db, { ...loadState(db), useLansweeper: true, history: {}, objs: [
  dev('s1', 'switch', 'SW-1', { ports: 24, feed: { sys: 'Lansweeper', ref: 's1', scanned: today } }),
  dev('s2', 'switch', 'SW-2', { ports: 24 }),
  dev('pa', 'pc', 'PC-A', { feed: { sys: 'Lansweeper', ref: 'pa', scanned: today, plug: { to: 's1', port: 3 } } }),
  dev('pb', 'pc', 'PC-B', { feed: { sys: 'Lansweeper', ref: 'pb', scanned: today, plug: { to: 's1', port: 14 } } }),
  dev('mo', 'monitor', 'MON-A'),
  dev('pn', 'pc', 'PC-NAME', { feed: { sys: 'Lansweeper', ref: 'pn', scanned: today, plug: { to: 's1', port: 'Gi1/0/14' } } }),
  dev('pf', 'pc', 'PC-FAR', { feed: { sys: 'Lansweeper', ref: 'pf', scanned: today, plug: { to: 's1', port: 30 } } }),
  dev('nb', 'notebook', 'MY-MAC', { serial: '', graph: { join: 'Registered', owner: 'zoe@corp.example', ownerName: 'Zoe Z.' } }),
], rels: [
  { id: 'r1', from: 'pa', to: 's1', kind: 'connected', port: 3, vlan: null, src: 'Lansweeper' },
  { id: 'r2', from: 'pb', to: 's2', kind: 'connected', port: 7, vlan: null },
  { id: 'r3', from: 'mo', to: 'pa', kind: 'attached', port: null, vlan: null },
  { id: 'r4', from: 'pn', to: 's2', kind: 'connected', port: 1, vlan: null },
  { id: 'r5', from: 'pf', to: 's2', kind: 'connected', port: 2, vlan: null },
] });

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
  const tab = () => p.evaluate(async () => (await import('/js/01-core.js')).st.tab);

  // 1. from the Table into a device and back: the Table again
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'table'; (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('table.grid tbody tr');
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('pa'));
  await p.waitForSelector('[data-close="pa"]'); await p.click('[data-close="pa"]');
  await until(p, async () => (await import('/js/01-core.js')).st.tab === 'table');
  assert.equal(await tab(), 'table');
  // opened from another view (the Overview): back to the List, not to an older Table
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'overview'; (await import('/js/07-render.js')).view(); });
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('pa'));
  await p.waitForSelector('[data-close="pa"]'); await p.click('[data-close="pa"]');
  await until(p, async () => (await import('/js/01-core.js')).st.tab === 'cards');

  // 2. Relations mark the sync's link; Sources takes Lansweeper's port over the one set by hand
  const open = async (id, t) => { await p.evaluate(async id => (await import('/js/02-views.js')).openObj(id), id); await p.waitForSelector('.otabs'); if (t) await p.click(`[data-otabgo="${t}"]`); };
  await open('pa', 'relations');
  assert.match(await p.textContent('[data-pane="relations"]'), /Lansweeper/);
  await open('pb', 'sources'); await p.waitForSelector('[data-plugtake]');
  assert.match(await p.textContent('[data-plugtake]'), /Use Lansweeper's: SW-1 · port 14/);
  // a port given as a name, or one the switch does not have: said, but nothing to take over
  for (const id of ['pn', 'pf']) { await open(id, 'sources'); await p.waitForSelector('dt:text("Switch port")'); assert.equal(await p.locator('[data-plugtake]').count(), 0, id); }

  // 3. the port view marks port 14, and its map leaves the monitor out
  await p.click('[data-otabgo="details"]').catch(() => {});
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.portsDevice = 's1'; c.st.tab = 'net'; (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('.port[data-port="14"]');
  assert.equal(await p.evaluate(() => document.querySelector('.port[data-port="14"]').classList.contains('lsdiff')), true);
  assert.match(await p.textContent('.lsdiff-box'), /Port 14\s*PC-B/);
  assert.doesNotMatch(await p.textContent('.lsdiff-box'), /NaN|PC-NAME/, 'a port given as a name is no port here');
  assert.doesNotMatch(await p.textContent('#view'), /MON-A/, 'no monitor behind the PC');

  // ... and taking Lansweeper's port moves PC-B there
  await open('pb', 'sources'); await p.waitForSelector('[data-plugtake]'); await p.click('[data-plugtake]');
  await storedBy(() => loadState(db), s => { const r = s.rels.filter(r => r.from === 'pb' && r.kind === 'connected'); return r.length === 1 && r[0].to === 's1' && r[0].port === 14 && r[0].src === 'Lansweeper'; });

  // 4. a personal device: no Hand out, no Confirm on site, its owner in the List
  await open('nb');
  assert.equal(await p.locator('#handOutBtn').count(), 0);
  assert.doesNotMatch(await p.textContent('#view'), /Confirm on site/);
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'cards'; c.st.type = 'registered'; (await import('/js/07-render.js')).view(); });
  await until(p, () => /Zoe Z\./.test(document.querySelector('#cards').textContent));

  // 5. the empty bell points to Data quality
  await p.evaluate(() => { const b = document.getElementById('bellBtn'); b.hidden = false; });
  await p.evaluate(() => document.getElementById('bellPop').showPopover());
  await until(p, () => !!document.querySelector('[data-bellqgo]'));
  assert.match(await p.textContent('[data-bellqgo]'), /Data quality: \d+ devices? to complete/);
  await p.click('[data-bellqgo]');
  await p.waitForSelector('#ovQuality');
  assert.deepEqual(errors, []);
  console.log('round 184: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
