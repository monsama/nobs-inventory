/* Browser test of what can be done with devices selected in the List: Retire… (all ticked, one Undo) and Delete… (for
   good; a device Lansweeper still sends is offered Retire and exclude instead), from the List's bar and the Table's
   Actions menu. And the quick-edit pencil has room of its own at the end of a row: it never covers Last seen. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-pickdel-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, more) => ({ id, code: 'INV-' + id, type: 'pc', name: 'PC-' + id, status: 'stock', loc: '', ovr: {}, ...more });
saveState(db, { ...loadState(db), objs: [dev('a'), dev('b'), dev('c'), dev('d', { feed: { sys: 'Lansweeper', ref: 'r-d' } }), dev('e')], rels: [], history: {} });
const stored = check => storedBy(() => loadState(db), check);

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
  const pick = ids => p.evaluate(async ids => { const c = await import('/js/01-core.js'); c.st.bulk = new Set(ids); (await import('/js/07-render.js')).view(); }, ids);

  // the pencil sits in room of its own: left of it ends the Last seen cell
  await p.hover('#cards .lrow[data-open="a"]');
  const gap = await p.evaluate(() => { const r = document.querySelector('#cards .lrow[data-open="a"]'), b = r.querySelector('.qedit-btn').getBoundingClientRect(), s = r.querySelector('.seen').getBoundingClientRect(); return b.left - s.right; });
  assert.ok(gap >= 0, `the pencil does not cover Last seen (${gap})`);

  // Retire…: the selected, all ticked, no reason proposed; the selection is cleared; Undo brings them back
  await pick(['a', 'b']);
  await p.click('#cdRetire'); await p.waitForSelector('#grOk');
  assert.equal(await p.textContent('#grOk'), 'Retire 2');
  assert.equal(await p.inputValue('#grWhy'), '');
  await p.fill('#grWhy', 'Sold'); await p.click('#grOk');
  await stored(st => ['a', 'b'].every(id => st.objs.find(o => o.id === id).status === 'retired'));
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).st.bulk.size), 0, 'selection cleared');
  await p.click('#toast .t-undo');
  await stored(st => ['a', 'b'].every(id => st.objs.find(o => o.id === id).status === 'stock'));

  // Delete…: for good; Lansweeper's device is offered Retire and exclude
  await pick(['c', 'd']);
  await p.click('#cdDelete'); await p.waitForSelector('#dmOk');
  assert.match(await p.textContent('#mdl .mb'), /Lansweeper still has 1 of them/);
  await p.click('#dmExcl');
  await stored(st => { const d = st.objs.find(o => o.id === 'd'); return d.status === 'retired' && d.excluded === true && !!st.objs.find(o => o.id === 'c'); });
  await pick(['c', 'e']);
  await p.click('#cdDelete'); await p.waitForSelector('#dmOk');
  assert.equal(await p.locator('#dmExcl').count(), 0, 'nothing to exclude');
  await p.click('#dmOk');
  await stored(st => !st.objs.some(o => o.id === 'c' || o.id === 'e'));

  // the Table's Actions menu has the same
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'table'; c.st.bulk = new Set(['a']); (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('#bkAct');
  await p.selectOption('#bkAct', 'retire'); await p.waitForSelector('#grOk'); await p.click('#grOk');
  await stored(st => st.objs.find(o => o.id === 'a').status === 'retired');
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.bulk = new Set(['b']); (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('#bkAct'); await p.selectOption('#bkAct', 'delete'); await p.waitForSelector('#dmOk'); await p.click('#dmOk');
  await stored(st => !st.objs.some(o => o.id === 'b'));
  await until(p, () => !document.querySelector('#mdl'));

  assert.deepEqual(errors, [], 'page errors');
  console.log('retire and delete the selected: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
