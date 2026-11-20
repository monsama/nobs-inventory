/* Browser test of round 159, a calmer page: no line over the inventory about Pending devices (its tab counts them, the
   bell does not), no Add at once; the count only while the list is narrowed; Save view, export and print in one ⋯
   menu; a quiet status bar (nothing said when all is saved, the version in About only); a List column empty on every
   row takes no room; one site shown: the rooms only, the site in the heading; no Hide link above the filters. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r159-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, more) => ({ id, code: 'INV-' + id, type: 'pc', name: 'PC-' + id, status: 'active', loc: 'Main / Office', ovr: {}, ...more });
saveState(db, { ...loadState(db), sites: ['Main', 'Annex'], locs: ['Main / Office', 'Main / Lab', 'Annex / Hall'], objs: [
  dev('a', { user: 'Alex Example' }), dev('b', { loc: 'Main / Lab' }), dev('c', { type: 'notebook', loc: 'Annex / Hall', ip: '10.0.0.5' }),
  dev('w', { name: 'NEW-PC', code: '', review: { src: 'lansweeper', at: new Date().toISOString() } }),
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
  const go = (k, v) => p.evaluate(async ([k, v]) => { const c = await import('/js/01-core.js'); c.st[k] = v; (await import('/js/07-render.js')).view(); }, [k, v]);

  // Pending devices: counted on its tab only; no banner, not in the bell
  assert.equal(await p.locator('#fbar .fb-wait').count(), 0, 'no line over the inventory');
  assert.match(await p.textContent('#tabsbar .tab-review'), /1/);
  assert.equal(await p.evaluate(() => [...document.querySelectorAll('#bellPop .bell-item')].some(i => /Pending/.test(i.textContent))), false, 'the bell does not count them again');
  // ... and no Add at once in it
  await p.click('#tabsbar .tab-review'); await until(p, async () => (await import('/js/01-core.js')).st.scope === 'review');
  assert.equal(await p.locator('[data-addtype]').count(), 0);
  await p.click('#tabsbar .tab-review'); await until(p, async () => (await import('/js/01-core.js')).st.scope === null);

  // the count only while something narrows the list
  assert.doesNotMatch(await p.textContent('#toolbar'), /of 3 devices/, 'the whole inventory: no count');
  await go('type', 'notebook');
  assert.match(await p.textContent('#toolbar'), /1 of 3 devices/);
  await go('type', null);

  // one ⋯ menu: Save view…, export, print
  assert.equal(await p.locator('#toolbar #svSave').isVisible(), false, 'Save view is in the menu, not in the bar');
  await p.click('#toolbar .tb-more .menu-btn');
  assert.match(await p.textContent('#printMenu .menubox'), /Save view….*Excel or CSV.*Print/s);
  await p.click('#svSave'); await p.waitForSelector('#svName');
  assert.equal(await p.evaluate(() => !!document.querySelector('#printMenu .menubox:popover-open')), false, 'the menu closes on a pick');
  await p.evaluate(async () => (await import('/js/19-modal.js')).closeModal());

  // the status bar: nothing said while all is saved; no version in it
  await until(p, () => document.querySelector('#stSave').textContent.trim() === '');
  assert.equal(await p.locator('#verFoot').count(), 0);

  // a column empty on every row takes no room; IP comes back with a device that has one
  await go('type', 'pc');
  assert.equal(await p.evaluate(() => document.querySelector('#cards').classList.contains('no-ip')), true, 'no IP on any PC: no IP column');
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('#cards')).getPropertyValue('--w-ip').trim()), '0px');
  await go('type', null);
  assert.equal(await p.evaluate(() => document.querySelector('#cards').classList.contains('no-ip')), false, 'a notebook has one: the column is there');

  // one site shown: the rooms only, the site in the heading; two sites: the whole location
  await go('type', 'pc');
  assert.equal((await p.textContent('#cards .lrow[data-open="b"] .c-loc')).trim(), 'Lab');
  assert.equal(await p.getAttribute('#cards .lrow[data-open="b"] .c-loc', 'title'), 'Main / Lab');
  assert.match(await p.textContent('#cards .lhead .c-loc'), /Room in Main/);
  await go('type', null);
  assert.equal((await p.textContent('#cards .lrow[data-open="b"] .c-loc')).trim(), 'Main / Lab');

  // no Hide link above the filters: the tab on their edge does it
  assert.equal(await p.isVisible('#sidePin'), false);

  assert.deepEqual(errors, []);
  console.log('round 159: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
