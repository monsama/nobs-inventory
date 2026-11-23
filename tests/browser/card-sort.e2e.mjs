/* Browser test of the List's headings: sort by name both ways and back, by user with devices without one last, the
   choice kept after a reload; a monitor shows its PC's user and location; the description is in the name's title. */
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
  dev('3', 'PC-10', '2026-03-01T08:00:00.000Z', { purpose: 'Front desk', warranty: '2027-01-01', user: 'Alex Example', loc: 'HQ / Office' }),
  dev('1', 'PC-2', '2026-05-01T08:00:00.000Z', { warranty: '2026-12-01' }),
  dev('2', 'PC-1', '2026-01-01T08:00:00.000Z'),
  { id: 'm', code: 'INV-m', type: 'monitor', name: 'MON-1', status: 'active', loc: '', ovr: {}, feed: null, added: '2026-02-01T08:00:00.000Z' },
], rels: [{ id: 'r1', from: 'm', to: '3', kind: 'attached' }], history: {} });

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
  const order = () => p.evaluate(() => [...document.querySelectorAll('#cards .card')].map(c => c.querySelector('.nm').textContent.trim()).filter(n => n !== 'MON-1'));

  // a monitor: the user and location of the PC it is attached to, marked; no warranty anywhere
  const mon = await p.textContent('#cards .card[data-open="m"]');
  assert.match(mon, /Alex Example/); assert.match(mon, /Office/); assert.match(mon, /via PC-10/);
  assert.equal(await p.getAttribute('#cards .card[data-open="m"] .c-loc', 'title'), 'HQ / Office', 'one site shown: the room, the whole location in the tooltip (its own now: an attached device takes its host\'s, follow-host.js)');
  assert.doesNotMatch(mon, /Warranty/);
  assert.doesNotMatch(await p.textContent('#cards .card[data-open="1"]'), /Warranty/, 'no warranty on a PC');

  // by name: numbers in names in their order, then turned round, then back to the list's own order
  await p.click('[data-csort="name"]');
  await until(p, () => document.querySelector('#cards .card:not([data-open="m"]) .nm').textContent.trim() === 'PC-1');
  assert.deepEqual(await order(), ['PC-1', 'PC-2', 'PC-10']);
  assert.match(await p.getAttribute('[data-csort="name"]', 'aria-label'), /ascending/);
  await p.click('[data-csort="name"]');
  await until(p, () => document.querySelector('#cards .card:not([data-open="m"]) .nm').textContent.trim() === 'PC-10');
  assert.deepEqual(await order(), ['PC-10', 'PC-2', 'PC-1']);
  assert.match(await p.getAttribute('[data-csort="name"]', 'aria-label'), /descending/);
  await p.click('[data-csort="name"]');
  await until(p, () => !document.querySelector('.lh-sort.on'));

  // by user: the one with a user first, those without last
  await p.click('[data-csort="user"]');
  await until(p, () => document.querySelector('#cards .card:not([data-open="m"]) .nm').textContent.trim() === 'PC-10');
  assert.equal((await order())[0], 'PC-10');

  // kept in this browser
  await p.reload(); await p.waitForSelector('#cards .card');
  assert.equal(await p.getAttribute('[data-csort="user"]', 'class'), 'lh-sort on');
  assert.equal((await order())[0], 'PC-10');

  // the description is the name's title, not a line of its own
  assert.match(await p.getAttribute('#cards .card[data-open="3"] .card-open', 'title'), /Front desk/);
  await p.click('[data-csort="user"]'); await p.click('[data-csort="user"]');
  await until(p, () => !document.querySelector('.lh-sort.on'));
  assert.deepEqual(errors, [], 'no page errors');
  console.log('card sort: all checks passed');
} finally { await browser.close(); server.close(); }
