/* Browser test of the parts every list shares: the Export menu (Excel or CSV from the List opens the Table's), the same
   "Nothing matches" with Clear filters, the map's SVG export, a sort kept from before the List that no heading shows
   is dropped, the heading tick says what it does and keeps the focus, and phones can sort and select all. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-std-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const dev = (id, name, added, more = {}) => ({ id, code: 'INV-' + id, type: 'pc', name, status: 'active', loc: '', ovr: {}, feed: null, added, ...more });
saveState(db, { ...s0, objs: [
  dev('a', 'PC-B', '2026-03-01T08:00:00.000Z', { ip: '10.0.0.2', software: [{ name: 'Tool A', version: '1' }] }),
  dev('b', 'PC-A', '2026-05-01T08:00:00.000Z', { ip: '10.0.0.1' }),
  { id: 's', code: 'INV-s', type: 'switch', name: 'SW-1', status: 'active', loc: '', ovr: {}, feed: null, added: '2026-01-01T08:00:00.000Z', ports: 8, sfp: 0 },
], rels: [{ id: 'r1', from: 'a', to: 's', kind: 'uplink' }], history: {} });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const signIn = async (vp, init) => {
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
  await ctx.addInitScript(init || (() => {}));
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await p.waitForSelector('#cards .lrow');
  return p;
};
try {
  // a sort kept from before the List (date added) has no heading: the list's own order instead, nothing hidden
  const p = await signIn({ width: 1300, height: 800 }, () => { try { localStorage.setItem('ni-card-sort', JSON.stringify({ k: 'added', dir: -1 })); } catch { /* none */ } });
  assert.equal(await p.locator('.lh-sort.on').count(), 0);
  assert.deepEqual(await p.locator('#cards .lrow .nm').allTextContents(), ['PC-B', 'PC-A', 'SW-1'], 'the list keeps its own order');

  // the heading tick: says what it does, selects all, then clears; the focus stays on it
  assert.equal(await p.getAttribute('#view [data-pickall]', 'aria-label'), 'Select every device shown');
  await p.focus('#view [data-pickall]'); await p.keyboard.press('Enter');
  await until(p, () => document.querySelectorAll('#cards .lrow.picked').length === 3);
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.matches('#view [data-pickall]')), true, 'the focus is kept');
  assert.equal(await p.getAttribute('#view [data-pickall]', 'aria-label'), 'Clear the selection');
  await p.keyboard.press('Enter');
  await until(p, () => !document.querySelector('#cards .lrow.picked'));
  // a row's tick keeps the focus too
  await p.focus('#cards .lrow[data-open="b"] .cardtick'); await p.keyboard.press('Enter');
  await until(p, () => !!document.querySelector('#cards .lrow.picked[data-open="b"]'));
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.matches('.lrow[data-open="b"] .cardtick')), true);
  await p.keyboard.press('Escape');

  // Export in the List: Excel or CSV opens the Table with its Export menu open, printing is in the same menu
  await p.click('#printMenu .menu-btn');
  assert.match(await p.textContent('#printMenu .menubox'), /Excel or CSV.*Print as a list.*Print as a table/s);
  await p.click('#printMenu [data-goexport]');
  await p.waitForSelector('table.grid');
  await until(p, () => !!document.querySelector('#csvMenu .menubox:popover-open'));
  assert.match(await p.textContent('#csvMenu .menubox'), /CSV.*Print as a list.*Print as a table/s);
  await p.keyboard.press('Escape');

  // the same "Nothing matches" on every list, and its Clear filters clears the list's own filters too
  for (const tab of ['cards', 'ips', 'sw', 'map']) {
    await p.evaluate(async t => { const c = await import('/js/01-core.js'); c.st.tab = t; c.st.q = 'zzz-nothing'; if (t === 'ips') c.st.ipAssign = 'static'; (await import('/js/07-render.js')).render(); }, tab);
    await p.waitForSelector('#view [data-clearall]', { timeout: 4000 }).catch(async () => { throw new Error(tab + ': ' + (await p.textContent('#view')).slice(0, 200)); });
    assert.match(await p.textContent('#view'), /Nothing matches “zzz-nothing”\./, tab);
    await p.click('#view [data-clearall]');
    await until(p, async () => { const c = await import('/js/01-core.js'); return c.st.q === '' && !c.st.ipAssign; });
  }

  // the map's SVG export downloads (it used to throw)
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'map'; c.st.q = ''; (await import('/js/07-render.js')).render(); });
  await p.waitForSelector('#mapExportMenu .menu-btn');
  await p.click('#mapExportMenu .menu-btn');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#mapExport')]);
  assert.match(dl.suggestedFilename(), /\.svg$/);
  assert.equal(await p.isVisible('#mapReset'), true, 'Reset layout is a button of its own');

  // a phone: no headings, but Sort by and Select all in the toolbar
  const ph = await signIn({ width: 390, height: 800 });
  assert.equal(await ph.isVisible('#cards .lhead'), false);
  await ph.selectOption('#cardSortM', 'name:1');
  await until(ph, () => document.querySelector('#cards .lrow .nm').textContent.trim() === 'PC-A');
  await ph.selectOption('#cardSortM', 'name:-1');
  await until(ph, () => document.querySelector('#cards .lrow .nm').textContent.trim() === 'SW-1');
  await ph.click('#toolbar [data-pickall]');
  await until(ph, () => document.querySelectorAll('#cards .lrow.picked').length === 3);

  assert.deepEqual(errors, [], 'page errors');
  console.log('standard gui: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
