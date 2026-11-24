/* Browser test: Data quality "In stock, but someone uses it" lists devices in stock that have a user, or whose primary
   user in Intune is a person here and that were seen lately; and a status a person sets takes the automatic mark away. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-stk-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const today = new Date().toISOString().slice(0, 10), old = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
const s0 = loadState(db), person = (id, name, more) => ({ id, login: '', name, dept: '', role: 'viewer', groups: [], source: 'manual', active: true, ...more });
const dev = (id, more) => ({ id, code: 'INV-' + id, type: 'notebook', name: 'NB-' + id, status: 'stock', loc: '', ovr: {}, ...more });
saveState(db, { ...s0, users: [...s0.users, person('ub', 'Beat', { entra: { upn: 'beat@corp.example' } })], history: {}, rels: [], objs: [
  dev('withuser', { user: 'jdoe', stockAuto: true }),
  dev('intune', { graph: { join: 'AzureAd', owner: 'beat@corp.example', ownerName: 'Beat B.', lastSync: today } }),
  dev('stale', { graph: { join: 'AzureAd', owner: 'beat@corp.example', ownerName: 'Beat B.', lastSync: old } }),
  dev('nobody'),
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

  const ids = await p.evaluate(async () => { const c = await import('/js/01-core.js'); return c.objs.filter(o => c.QUALITY.stockused[2](o)).map(o => o.id); });
  assert.deepEqual(ids.sort(), ['intune', 'withuser']);
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); Object.assign(c.st, { tab: 'table', quality: 'stockused' }); (await import('/js/07-render.js')).view(); });
  await until(p, () => document.querySelectorAll('#view table.grid tbody tr').length === 2);
  assert.match(await p.textContent('.fb-qfix'), /In stock, but someone uses it/);

  // a person sets the status: the device is no longer in stock by itself
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('withuser'));
  await p.waitForSelector('select[data-k="status"]');
  await p.selectOption('select[data-k="status"]', 'active');
  await storedBy(() => loadState(db), s => { const o = s.objs.find(x => x.id === 'withuser'); return o.status === 'active' && !o.stockAuto; });
  assert.deepEqual(errors, []);
  console.log('stock used: ok');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
