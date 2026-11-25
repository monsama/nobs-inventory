/* Browser test: the Sources tab says which switch port Lansweeper sees a device on, and warns when the inventory has it
   plugged in elsewhere (set by hand, so kept). */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-swp-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const today = new Date().toISOString().slice(0, 10);
const dev = (id, type, name, more) => ({ id, code: 'INV-' + id, type, name, status: 'active', loc: '', ovr: {}, feed: { sys: 'Lansweeper', ref: id, scanned: today }, ...more });
saveState(db, { ...loadState(db), useLansweeper: true, history: {}, objs: [
  dev('sw', 'switch', 'SW03', { ports: 24 }), dev('sw4', 'switch', 'SW04', { ports: 24 }),
  dev('a', 'pc', 'PC-SAME', { feed: { sys: 'Lansweeper', ref: 'a', scanned: today, plug: { to: 'sw', port: 22 } } }),
  dev('b', 'pc', 'PC-HAND', { feed: { sys: 'Lansweeper', ref: 'b', scanned: today, plug: { to: 'sw', port: 5 } } }),
], rels: [{ id: 'r1', from: 'a', to: 'sw', kind: 'connected', port: 22, vlan: null, src: 'Lansweeper' }, { id: 'r2', from: 'b', to: 'sw4', kind: 'connected', port: 3, vlan: null }] });

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
  const sources = async id => {
    await p.evaluate(async id => (await import('/js/02-views.js')).openObj(id), id);
    await p.click('[data-otabgo="sources"]');
    await p.waitForSelector('dt:text("Switch port")');
    return p.locator('dt:text("Switch port") + dd').textContent();
  };
  const same = await sources('a');
  assert.match(same, /SW03 · port 22/); assert.doesNotMatch(same, /elsewhere/);
  if (process.env.SHOT) await p.locator('dt:text("Switch port")').locator('xpath=..').screenshot({ path: process.env.SHOT });
  assert.match(await sources('b'), /SW03 · port 5.*plugged in elsewhere \(set by hand, so kept\)/s);
  assert.deepEqual(errors, []);
  console.log('switch port: ok');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
