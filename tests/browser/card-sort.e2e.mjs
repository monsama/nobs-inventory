/* Browser test of the cards' Sort by: by name both ways, newest added first, devices without a value last, the choice
   kept after a reload; and the fifth line of every card, its description. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-sort-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const dev = (id, name, added, more = {}) => ({ id, code: 'INV-' + id, type: 'pc', name, status: 'active', loc: '', ovr: {}, feed: null, added, ...more });
saveState(db, { ...s0, objs: [
  dev('3', 'PC-10', '2026-03-01T08:00:00.000Z', { purpose: 'Front desk', warranty: '2027-01-01' }),
  dev('1', 'PC-2', '2026-05-01T08:00:00.000Z', { warranty: '2026-12-01' }),
  dev('2', 'PC-1', '2026-01-01T08:00:00.000Z'),
], rels: [], history: {} });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await p.waitForSelector('#cards .card');
  const order = () => p.evaluate(() => [...document.querySelectorAll('#cards .card')].map(c => c.querySelector('.nm').textContent.trim()));

  // by name: numbers in names in their order, then turned round
  await p.selectOption('#cardSort', 'name');
  await until(p, () => document.querySelector('#cards .card .nm').textContent.trim() === 'PC-1');
  assert.deepEqual(await order(), ['PC-1', 'PC-2', 'PC-10']);
  assert.match(await p.textContent('#cardDir'), /A to Z/);
  await p.click('#cardDir');
  await until(p, () => document.querySelector('#cards .card .nm').textContent.trim() === 'PC-10');
  assert.deepEqual(await order(), ['PC-10', 'PC-2', 'PC-1']);
  assert.match(await p.textContent('#cardDir'), /Z to A/);

  // date added starts with the newest
  await p.selectOption('#cardSort', 'added');
  await until(p, () => document.querySelector('#cards .card .nm').textContent.trim() === 'PC-2');
  assert.deepEqual(await order(), ['PC-2', 'PC-10', 'PC-1']);
  assert.match(await p.textContent('#cardDir'), /Newest first/);

  // warranty end: the one without goes last, both ways
  await p.selectOption('#cardSort', 'warranty');
  await until(p, () => document.querySelector('#cards .card .nm').textContent.trim() === 'PC-2');
  assert.deepEqual(await order(), ['PC-2', 'PC-10', 'PC-1']);
  await p.click('#cardDir');
  await until(p, () => document.querySelector('#cards .card .nm').textContent.trim() === 'PC-10');
  assert.deepEqual(await order(), ['PC-10', 'PC-2', 'PC-1']);

  // kept in this browser
  await p.reload(); await p.waitForSelector('#cards .card');
  assert.equal(await p.inputValue('#cardSort'), 'warranty');
  assert.deepEqual(await order(), ['PC-10', 'PC-2', 'PC-1']);

  // the fifth line of every card: its description
  const lines = await p.evaluate(() => [...document.querySelectorAll('#cards .card[data-open="3"] .card-open dt, #cards .card[data-open="3"] .kv .k')].map(e => e.textContent.trim()));
  const text = await p.textContent('#cards .card[data-open="3"]');
  assert.match(text, /Description\s*Front desk/, 'the description shows: ' + lines.join(','));
  assert.match(await p.textContent('#cards .card[data-open="1"]'), /Description\s*-/, 'a dash where there is none');

  // back to the default order
  await p.selectOption('#cardSort', '');
  await until(p, () => !document.querySelector('#cardDir'));
  assert.deepEqual(errors, [], 'no page errors');
  console.log('card sort: all checks passed');
} finally { await browser.close(); server.close(); }
