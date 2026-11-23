/* Browser test of round 170: Sources disagree shows what differs. In the Table the cells whose sources differ are marked,
   say what each source says and open the picker; Compare and pick… lists every differing field by field, with each
   source's value to pick, one source for all of a field, and Undo. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r170-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const at = '2026-11-20';
const dev = (id, model, ls, graph, more = {}) => ({ id, code: 'INV-' + id, type: 'notebook', name: 'NB-' + id, status: 'active', loc: '', ovr: {}, model,
  src: { model: 'ls' }, vals: { model: { ls: [ls, at], graph: [graph, at] } }, feed: { sys: 'Lansweeper', ref: id }, ...more });
saveState(db, { ...loadState(db), sites: ['Main'], locs: ['Main / Office'], objs: [
  dev('1', 'ThinkPad T14', 'ThinkPad T14', 'ThinkPad T14 Gen 4'), dev('2', 'EliteBook 840', 'EliteBook 840', 'HP EliteBook 840 G9'),
  dev('3', 'Latitude 5440', 'Latitude 5440', 'Latitude 5440'),
], rels: [], history: {} });

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
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); Object.assign(c.st, { tab: 'table', quality: 'conflict' }); (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('table.grid tbody tr');

  // the Table: the differing cell is marked, says what each source says, and its mark opens the picker (not the device)
  assert.equal(await p.locator('table.grid tbody tr').count(), 2, 'the device whose sources agree is not listed');
  const cell = 'tr[data-open="1"] td.disagree';
  assert.match(await p.getAttribute(cell, 'title'), /Lansweeper: ThinkPad T14 · Entra & Intune: ThinkPad T14 Gen 4/);
  await p.click(cell + ' .fsrc');
  await p.waitForSelector('#fsrcPop .sp-row');
  assert.equal(await p.evaluate(() => !!document.querySelector('.obj, #objView')), false, 'the device did not open');
  await p.keyboard.press('Escape');

  // Compare and pick…: grouped by field, each source's value; a pick fixes the field and leaves the list
  await p.click('[data-cmpsrc]'); await p.waitForSelector('#mdl .cmp-group');
  assert.equal(await p.locator('#mdl .cmp-row').count(), 2);
  assert.match(await p.textContent('#mdl .cmp-head'), /Model\s*2 devices/);
  await p.click('#mdl [data-cmp="1|model|graph"]');
  await until(p, () => document.querySelectorAll('#mdl .cmp-row').length === 1);
  await storedBy(() => loadState(db), s => { const o = s.objs.find(x => x.id === '1'); return o.model === 'ThinkPad T14 Gen 4' && o.pick.model === 'graph'; });

  // one source for all of a field
  await p.click('#mdl [data-cmpall="model|graph"]');
  await p.waitForSelector('#mdl [data-cmpdlg] .muted');
  assert.match(await p.textContent('#mdl [data-cmpdlg]'), /The sources agree on every device listed now/);
  await storedBy(() => loadState(db), s => s.objs.find(x => x.id === '2').model === 'HP EliteBook 840 G9');

  // Undo puts it back
  await p.click('#toast button');
  await storedBy(() => loadState(db), s => { const o = s.objs.find(x => x.id === '2'); return o.model === 'EliteBook 840' && !(o.pick && o.pick.model); });
  await until(p, () => document.querySelectorAll('#mdl .cmp-row').length === 1);

  assert.deepEqual(errors, []);
  console.log('round 170: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
