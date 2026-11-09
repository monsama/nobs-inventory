/* Print the list on screen: as cards or as a table, only the devices the filters leave, with the filters said at the top. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-print-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  /* The print dialog is not opened in the test: printing is noted instead. */
  await ctx.addInitScript(() => { window.print = () => { window.__printed = true; }; });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  // only the PCs
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.type = 'pc'; c.st.tab = 'cards'; (await import('/js/07-render.js')).render(); });
  await p.waitForSelector('#printMenu');
  const pcs = await p.evaluate(async () => (await import('/js/01-core.js')).filtered().map(o => o.name));
  const open = async kind => {
    await p.click('#printMenu .menu-btn');
    const [w] = await Promise.all([ctx.waitForEvent('page'), p.click(`#printMenu [data-print="${kind}"]`)]);
    await w.waitForLoadState(); await until(w, () => window.__printed === true);
    return w;
  };
  const cards = await open('cards');
  assert.deepEqual(await cards.$$eval('.pv-cards .card .nm', ns => ns.map(n => n.textContent.trim())), pcs, 'the cards printed are the ones shown');
  assert.match(await cards.textContent('.pv-head p'), new RegExp(`${pcs.length} devices · Type: PC`));
  assert.equal(await cards.locator('.pv-cards .card button:visible').count(), 0, 'buttons are printed');
  if (process.env.NI_SHOTS) await cards.screenshot({ path: path.join(process.env.NI_SHOTS, 'print-cards.png'), fullPage: true });
  await cards.close();
  // as a table, from the Table: its columns, its rows
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'table'; (await import('/js/07-render.js')).render(); });
  await p.waitForSelector('table.grid');
  const heads = await p.$$eval('#view table.grid thead th[data-ck]', ths => ths.map(t => t.textContent.trim()));
  const table = await open('table');
  assert.deepEqual(await table.$$eval('.pv-table thead th', ths => ths.map(t => t.textContent.trim())), heads);
  assert.equal(await table.locator('.pv-table tbody tr').count(), pcs.length);
  if (process.env.NI_SHOTS) await table.screenshot({ path: path.join(process.env.NI_SHOTS, 'print-table.png'), fullPage: true });
  await table.close();
  assert.deepEqual(errors, [], 'page errors');
  console.log('print view: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
