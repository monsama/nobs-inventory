/* Browser test of round 163: the Table's Kind, Runs on and Directory columns (hidden at first, picked under Columns); the
   Overview's servers split into virtual and physical, and servers whose Kind is not known as a data quality item that
   opens them in the Table. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r163-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, more) => ({ id, code: 'INV-' + id, type: 'server', name: 'SRV-' + id, status: 'active', loc: 'Main / Server room', ovr: {}, ...more });
saveState(db, { ...loadState(db), sites: ['Main'], locs: ['Main / Server room'], objs: [
  dev('h1', { name: 'HV-01', kind: 'physical', inAd: true }), dev('v1', { name: 'APP-01', kind: 'vm' }), dev('v2', { name: 'APP-02', kind: 'vm' }), dev('n1', { name: 'OLD-01' }), dev('p1', { type: 'pc', name: 'PC-01', inAd: true }),
], rels: [{ id: 'r1', from: 'v1', to: 'h1', kind: 'hosted', port: null, vlan: null }], history: {} });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await p.waitForSelector('#cards .lrow');

  // the Table: the three columns are hidden at first, then shown with the Network set
  const go = (k, v) => p.evaluate(async ([k, v]) => { const c = await import('/js/01-core.js'); c.st[k] = v; (await import('/js/07-render.js')).view(); }, [k, v]);
  await go('tab', 'table'); await p.waitForSelector('table.grid tbody tr');
  const heads = () => p.evaluate(() => [...document.querySelectorAll('table.grid thead th')].map(t => t.textContent.trim()));
  assert.equal((await heads()).some(h => /^(Kind|Runs on|Directory)/.test(h)), false, 'hidden at first');
  await p.evaluate(async () => { const t = await import('/js/views-table.js'); t.setHiddenCols(t.tableCols().filter(c => !['type', 'kind', 'host', 'ip', 'mac', 'loc', 'conn', 'dir', 'status', 'seen', 'name'].includes(c.k)).map(c => c.k)); (await import('/js/07-render.js')).view(); });
  await until(p, () => [...document.querySelectorAll('table.grid thead th')].some(t => /Runs on/.test(t.textContent)));
  const cell = (name, col) => p.evaluate(([name, col]) => { const hs = [...document.querySelectorAll('table.grid thead th')].map(t => t.textContent.trim()); const i = hs.findIndex(h => h.startsWith(col));
    const tr = [...document.querySelectorAll('table.grid tbody tr')].find(r => r.textContent.includes(name)); return tr ? tr.children[i].textContent.trim() : null; }, [name, col]);
  assert.equal(await cell('APP-01', 'Kind'), 'Virtual machine');
  assert.equal(await cell('OLD-01', 'Kind'), 'Not known');
  assert.equal(await cell('APP-01', 'Runs on'), 'HV-01');
  assert.equal(await cell('APP-02', 'Runs on'), '');
  assert.match(await cell('PC-01', 'Directory'), /^AD joined/, 'the words in the cell (export, sort)');
  assert.equal(await cell('HV-01', 'Directory'), '', 'servers have none, as in the List');
  assert.equal(await p.locator('table.grid td.c-dir .jb b[data-k="AD"]').first().isVisible(), true, 'the short marks');

  // the Overview: the split, and the data quality item that opens the servers not known
  await go('tab', 'overview'); await p.waitForSelector('[data-ovt="server"]', { state: 'attached' });
  assert.match(await p.getAttribute('[data-ovt="server"]', 'title'), /^Server · 2 virtual, 1 physical: /);
  await p.click('[data-ovq="nokind"]');
  await until(p, () => document.querySelectorAll('table.grid tbody tr').length === 1);
  assert.match(await p.textContent('table.grid tbody'), /OLD-01/);

  assert.deepEqual(errors, []);
  console.log('round 163: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
