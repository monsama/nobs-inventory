/* Browser test: a switch's page has Ports at the end of its tabs, with the ports in use, and it opens the switch's port
   view; a PC has none. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-pgo-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, type, name, more) => ({ id, code: 'INV-' + id, type, name, status: 'active', loc: '', ovr: {}, ...more });
saveState(db, { ...loadState(db), history: {}, objs: [dev('s1', 'switch', 'SW-1', { ports: 24, sfp: 2 }), dev('s2', 'switch', 'SW-2', { ports: 8 }), dev('pc', 'pc', 'PC-1'), dev('pc2', 'pc', 'PC-2')],
  rels: [{ id: 'r1', from: 'pc', to: 's1', kind: 'connected', port: 5, vlan: null }, { id: 'r2', from: 'pc2', to: 's1', kind: 'connected', port: 7, vlan: null }] });

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
  const open = id => p.evaluate(async id => (await import('/js/02-views.js')).openObj(id), id);
  await open('pc'); await p.waitForSelector('.otabs');
  assert.equal(await p.locator('[data-portsgo]').count(), 0, 'a PC has no Ports');
  await open('s1'); await p.waitForSelector('[data-portsgo]');
  assert.match(await p.textContent('[data-portsgo]'), /Ports 2 of 26/);
  if (process.env.SHOT) await p.locator('.otabs').screenshot({ path: process.env.SHOT });
  await p.click('[data-portsgo]');
  await until(p, () => !!document.querySelector('#portsDevice') && document.querySelector('#portsDevice').value === 's1');
  // another switch opens on its own ports
  await open('s2'); await p.waitForSelector('[data-portsgo]');
  await p.click('[data-portsgo]');
  await until(p, () => !!document.querySelector('#portsDevice') && document.querySelector('#portsDevice').value === 's2');
  assert.deepEqual(errors, []);
  console.log('ports go: ok');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
