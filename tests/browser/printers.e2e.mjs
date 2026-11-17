/* Printers on a device page: a computer lists the printers Lansweeper found on it (only real ones), each linked to its
   printer device where one is found; a USB printer is added as a device attached to the computer in one click; a
   printer lists the computers that use it. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-prn-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
saveState(db, { ...loadState(db), locs: ['HQ / Floor 2'],
  objs: [
    { id: 'pc', code: 'INV-1', type: 'pc', name: 'PC-1', status: 'active', loc: 'HQ / Floor 2', feed: { sys: 'Lansweeper', ref: '1' },
      lsPrinters: [{ name: 'Floor 2 MFP', port: 'IP_10.0.0.9', kind: 'ip', ip: '10.0.0.9', driver: 'Universal PCL6' }, { name: 'Desk label printer', port: 'USB001', kind: 'usb', driver: 'Label 4' }, { name: 'Plotter', port: 'WSD-1', kind: 'net' }] },
    { id: 'p2', code: 'INV-2', type: 'printer', name: 'PRN-2OG', ip: '10.0.0.9', status: 'active', feed: null },
  ],
  rels: [], history: {} });
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
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('pc'));
  await p.waitForSelector('table.prn-table');
  const rows = () => p.$$eval('table.prn-table tbody tr', trs => trs.map(tr => [...tr.cells].map(c => c.textContent.replace(/\s+/g, ' ').trim())));
  let r = await rows();
  assert.deepEqual(r.map(x => x[1]), ['Network', 'USB', 'Network']);
  assert.equal(r[0][3], 'PRN-2OG', 'the network printer is not matched by its address');
  assert.equal(r[2][3], 'Add as device', 'a network printer not in the inventory can be added too');
  // the USB printer: added as a device, attached to the computer, in its room
  await p.click('[data-prnadd="1"]');
  await storedBy(() => loadState(db), s => s.objs.some(o => o.type === 'printer' && o.name === 'Desk label printer'));
  const s = loadState(db), d = s.objs.find(o => o.name === 'Desk label printer');
  assert.deepEqual([d.model, d.loc], ['Label 4', 'HQ / Floor 2']);
  assert.ok(s.rels.some(x => x.from === d.id && x.to === 'pc' && x.kind === 'attached'), 'not attached to the computer');
  await until(p, () => /Desk label printer/.test(document.querySelectorAll('table.prn-table tbody tr')[1].cells[3].textContent));
  // the printer's page: the computers that use it
  await p.click('table.prn-table a[data-open="p2"]');
  await p.waitForSelector('table.prn-table');
  r = await rows();
  assert.deepEqual(r.map(x => x[0]), ['PC-1']);
  // Network → Printers: each printer once, how many computers use it, and those not in the inventory added from here
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'prn'; (await import('/js/07-render.js')).render(); });
  await p.waitForSelector('table.prns tbody tr');
  const view = () => p.$$eval('table.prns tbody tr', trs => trs.map(tr => [...tr.cells].map(c => c.textContent.replace(/\s+/g, ' ').trim())));
  let v = await view();
  assert.equal(v.length, 3, 'one row per printer: ' + JSON.stringify(v));
  assert.ok(v.some(x => /PRN-2OG/.test(x[0]) && x[3] === '1 computer' && x[4] === 'In the inventory'));
  assert.match(await p.textContent('#prnCount'), /3 printers · 1 not in the inventory/);
  await p.selectOption('#prnShow', 'missing');
  v = await view(); assert.equal(v.length, 1); assert.match(v[0][0], /Plotter/);
  await p.click('table.prns [data-prnadd]');
  await storedBy(() => loadState(db), s => s.objs.some(o => o.type === 'printer' && o.name === 'Plotter'));
  const pl = loadState(db).objs.find(o => o.name === 'Plotter');
  assert.ok(!loadState(db).rels.some(x => x.from === pl.id), 'a network printer is attached to nobody');
  await p.waitForSelector('table.prns tbody tr td.muted');
  // the computers using a printer open in the Table
  await p.selectOption('#prnShow', '');
  await p.click('table.prns tbody tr:first-child [data-prnusers]');
  await until(p, async () => (await import('/js/01-core.js')).st.tab === 'table');
  assert.match(await p.textContent('#fbar'), /Computers using/);
  assert.deepEqual(errors, [], 'page errors');
  console.log('printers: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
