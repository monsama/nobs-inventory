/* Browser test of Gone from a source: under More filters, one source in particular, any, or every source a device was in;
   the device page names the sources and which are gone; the Table shows a Gone from column with the filter. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-gone-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const dev = (id, more = {}) => ({ id, code: 'INV-' + id, type: 'pc', name: 'PC-' + id.toUpperCase(), status: 'active', loc: '', ovr: {}, feed: null, added: '2026-01-01T08:00:00.000Z', ...more });
const lsf = day => ({ sys: 'Lansweeper', ref: 'r' + day, seen: '01.11.2026 08:00', inPush: day });
saveState(db, { ...s0, lsPresence: { day: '2026-11-18', since: '2026-11-01' }, objs: [
  dev('a', { feed: lsf('2026-11-18'), inAd: true }),                                           // listed everywhere
  dev('b', { feed: { ...lsf('2026-11-10'), ref: 'rb' }, inAd: true }),                          // gone from Lansweeper only
  dev('c', { feed: { ...lsf('2026-11-09'), ref: 'rc' }, adGone: '2026-11-12', graph: { gone: '12.11.2026 06:00' } }),   // gone from all three
  dev('d', { graph: { gone: '14.11.2026 06:00' } }),                                           // its one source, gone
  dev('e', { status: 'retired', adGone: '2026-11-01' }),                                       // retired: never listed
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
  const names = () => p.evaluate(() => [...document.querySelectorAll('#cards .lrow .nm')].map(e => e.textContent.trim()).sort());

  // the group lists each source a device has been in, with counts
  if (!(await p.isVisible('#goneList'))) await p.click('#moreFilters summary');
  const counts = Object.fromEntries(await p.$$eval('#goneList [data-gone]', bs => bs.map(b => [b.dataset.gone, b.querySelector('.cnt').textContent])));
  assert.deepEqual(counts, { any: '3', all: '2', ls: '2', ad: '1', graph: '2' });

  await p.click('#goneList [data-gone="ls"]');
  await until(p, () => document.querySelectorAll('#cards .lrow').length === 2);
  assert.deepEqual(await names(), ['PC-B', 'PC-C']);
  assert.match(await p.textContent('.fchip[data-fx="gone"]'), /Gone: from Lansweeper/, 'a chip says what filters');
  await p.click('#goneList [data-gone="all"]');
  await until(p, () => document.querySelectorAll('#cards .lrow').length === 2);
  assert.deepEqual(await names(), ['PC-C', 'PC-D'], 'gone from every source it was in');

  // the device page: its sources, the ones gone marked
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('b'));
  await p.waitForSelector('.obj .ofacts');
  assert.match(await p.textContent('.obj .ofacts'), /Sources\s*Lansweeper gone · AD/);
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('c'));
  await until(p, () => /Gone from all/.test(document.querySelector('.obj .ofacts').textContent));

  // the Table: the Gone from column comes in with the filter
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'table'; c.st.gone = 'any'; (await import('/js/07-render.js')).render(); });
  await p.waitForSelector('table.grid');
  const tbl = await p.textContent('table.grid');
  assert.match(tbl, /Gone from/); assert.match(tbl, /PC-B.*Lansweeper/s); assert.match(tbl, /All: Lansweeper, Active Directory, Entra & Intune/);

  assert.deepEqual(errors, [], 'page errors');
  console.log('gone from a source: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
