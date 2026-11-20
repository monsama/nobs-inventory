/* Browser test of round 157: Move to room… for the devices selected in the List and the Table (the rooms grouped by
   site, Move off until a room is picked, one Undo, kept from the next sync), and the still copy of Settings behind a
   dialog opened from it: no lookup in the page finds its ids. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r157-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, more) => ({ id, code: 'INV-' + id, type: 'pc', name: 'PC-' + id, status: 'stock', loc: 'Main / Shop', ovr: {}, ...more });
saveState(db, { ...loadState(db), sites: ['Main', 'Annex'], locs: ['Main / Shop', 'Annex / Hall'],
  objs: [dev('a'), dev('b', { loc: '' }), dev('c', { feed: { sys: 'Lansweeper', ref: 'r-c' } })], rels: [], history: {} });
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

  // List: Move to room…, grouped by site, Move off until a room is picked
  await pick(['a', 'b', 'c']);
  await p.click('#cdMove'); await p.waitForSelector('#mvLoc');
  assert.match(await p.textContent('#mdl .mh'), /Move 3 devices/);
  assert.deepEqual(await p.$$eval('#mvLoc optgroup', g => g.map(x => x.label)), ['Main', 'Annex', 'Add']);
  assert.equal(await p.isDisabled('#mvOk'), true, 'Move waits for a room');
  await p.selectOption('#mvLoc', 'Annex / Hall');
  assert.equal(await p.isDisabled('#mvOk'), false);
  await p.press('#mvLoc', 'Enter');
  await stored(st => st.objs.every(o => o.loc === 'Annex / Hall'));
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.id), 'cdMove', 'the focus is back on Move to room…');
  assert.match(await p.textContent('#toast'), /3 devices moved to Annex \/ Hall/);
  const c = await p.evaluate(async () => { const k = await import('/js/01-core.js'); return k.byId('c'); });
  assert.equal(c.pick && c.pick.loc, 'hand', 'kept from the next sync: ' + JSON.stringify(c.pick));
  await p.click('#toast .t-undo');
  await stored(st => st.objs.find(o => o.id === 'a').loc === 'Main / Shop' && st.objs.find(o => o.id === 'b').loc === '');

  // Table: Actions → Move to room…; a New room made in the dialog takes them
  await pick(['a', 'b']);
  await p.evaluate(async () => { (await import('/js/01-core.js')).st.tab = 'table'; (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('#bkAct'); await p.selectOption('#bkAct', 'move'); await p.waitForSelector('#mvLoc');
  await p.selectOption('#mvLoc', '__newroom'); await p.waitForSelector('.locnew input');
  await p.selectOption('.locnew select', 'Main'); await p.fill('.locnew input', 'Lab'); await p.press('.locnew input', 'Enter');
  assert.equal(await p.inputValue('#mvLoc'), 'Main / Lab');
  await p.click('#mvOk');
  await stored(st => st.locs.includes('Main / Lab') && ['a', 'b'].every(id => st.objs.find(o => o.id === id).loc === 'Main / Lab'));
  assert.equal(await p.locator('#mdl').count(), 0, 'the dialog is closed');

  // Settings behind a dialog opened from it: the still copy keeps its look, but its ids are out of the page's reach
  await p.evaluate(async () => { const k = await import('/js/01-core.js'); k.st.setTab = 'mail'; (await import('/js/04-settings.js')).openSettings(); });
  await p.waitForSelector('#dgPreview'); await p.waitForLoadState('networkidle'); await p.click('#dgPreview');
  await p.waitForSelector('#mdl:not(:has(#setPane)) .mh');
  assert.equal(await p.evaluate(() => { const g = document.querySelector('#mdlGhost'); return getComputedStyle(g.shadowRoot.querySelector('.box')).boxShadow === 'none' && !!g.shadowRoot.querySelector('#setPane') && !document.getElementById('setPane') && !document.querySelector('#setMaint'); }), true);
  await p.click('#dgClose'); await p.waitForSelector('#mdl #setPane');
  assert.equal(await p.locator('#mdlGhost').count(), 0);

  await p.evaluate(async () => (await import('/js/19-modal.js')).closeModal()); await p.waitForSelector('#mdl', { state: 'detached' });
  // Show all holds for the list it was asked on: another search draws the first rows only again
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); for (let i = 0; i < 700; i++) c.objs.push({ id: 'x' + i, code: 'X-' + i, type: 'pc', name: 'BULK-' + i, status: 'stock', loc: '', ovr: {} });
    c.st.tab = 'cards'; c.st.q = ''; (await import('/js/07-render.js')).view(); });
  await p.click('#cardsAll');
  assert.equal(await p.locator('#cards .lrow').count(), 703);
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.q = 'BULK'; (await import('/js/07-render.js')).view(); });
  assert.equal(await p.locator('#cardsAll').count(), 1, 'a new search starts with the first rows');
  assert.equal(await p.locator('#cards .lrow').count(), 500);
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.objs.splice(c.objs.findIndex(o => o.id === 'x0'), 700); c.st.q = ''; (await import('/js/07-render.js')).view(); });

  assert.deepEqual(errors, []);
  console.log('round 157: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
