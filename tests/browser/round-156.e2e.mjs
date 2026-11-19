/* Browser test of: the description as a second line in the List (left out in compact rows); the location list grouped
   by site with New room… beside it (quick edit and the device page); Draw on plan… from a room (the area gets the room);
   a folded sidebar section saying its filter; More filters kept open or shut. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r156-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
saveState(db, { ...loadState(db), sites: ['Main', 'Annex'], locs: ['Main / Shop', 'Annex / Hall'],
  plans: [{ id: 'p1', site: 'Main', name: 'Ground floor', areas: [] }],
  objs: [{ id: 'a', code: 'INV-a', type: 'pc', name: 'PC-a', status: 'active', ovr: {}, loc: 'Main / Shop', purpose: 'Reception desk, front left' },
    { id: 'b', code: 'INV-b', type: 'pc', name: 'PC-b', status: 'active', ovr: {}, loc: '' }], rels: [], history: {} });
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

  // the description: a second line under the name; none for a device without one; left out in compact rows
  assert.equal(await p.textContent('#cards .lrow[data-open="a"] .c-desc'), 'Reception desk, front left');
  assert.equal(await p.locator('#cards .lrow[data-open="b"] .c-desc').count(), 0);
  await p.evaluate(() => document.body.classList.add('dense'));
  assert.equal(await p.isVisible('#cards .lrow[data-open="a"] .c-desc'), false);
  await p.evaluate(() => document.body.classList.remove('dense'));

  // quick edit: rooms under their site, New room… adds one and moves the device there
  await p.hover('#cards .lrow[data-open="b"]'); await p.click('#cards .lrow[data-open="b"] .qedit-btn');
  await p.waitForSelector('#qeLoc');
  assert.deepEqual(await p.$$eval('#qeLoc optgroup', g => g.map(x => x.label)), ['Main', 'Annex', '―']);
  await p.selectOption('#qeLoc', '__newroom');
  await p.waitForSelector('.locnew input');
  assert.equal(await p.inputValue('#qeLoc'), '', 'the list keeps what it had');
  await p.selectOption('.locnew select', 'Annex'); await p.fill('.locnew input', 'Lab'); await p.press('.locnew input', 'Enter');
  await stored(st => st.locs.includes('Annex / Lab') && st.objs.find(o => o.id === 'b').loc === 'Annex / Lab');
  await p.keyboard.press('Escape');

  // the device page: the same list
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('a'));
  await p.waitForSelector('select.locpick[data-k="loc"]');
  assert.equal(await p.inputValue('select.locpick[data-k="loc"]'), 'Main / Shop');
  assert.ok((await p.$$eval('select.locpick[data-k="loc"] optgroup[label="Annex"] option', o => o.map(x => x.textContent))).includes('Lab'));

  // Draw on plan… from a room: the plan opens to draw, the area gets the room
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.setTab = 'locations'; (await import('/js/04-settings.js')).openSettings(); });
  await p.click('[data-plsel="room:Main / Shop"]'); await p.waitForSelector('#plDraw');
  await p.click('#plDraw');
  await until(p, async () => (await import('/js/01-core.js')).st.tab === 'plans');
  await p.waitForSelector('.pl-stage svg, .pl-stage canvas, .pl-stage');
  const box = await p.locator('.pl-stage').boundingBox();
  await p.mouse.move(box.x + 60, box.y + 60); await p.mouse.down(); await p.mouse.move(box.x + 200, box.y + 160, { steps: 6 }); await p.mouse.up();
  if (await p.locator('#plAreaDone').count()) await p.click('#plAreaDone');
  await p.waitForSelector('#arRoom');
  assert.equal(await p.inputValue('#arRoom'), 'Main / Shop'); assert.equal(await p.inputValue('#arName'), 'Shop');
  await p.click('#arOk');
  await stored(st => st.plans[0].areas.length === 1 && st.plans[0].areas[0].room === 'Main / Shop');

  // a folded section says its filter; More filters kept open after a reload
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'cards'; c.st.type = 'pc'; (await import('/js/07-render.js')).render(); });
  await p.click('#side .sidesec[data-sec="types"] .sec-t');
  await until(p, () => document.querySelector('#side .sidesec[data-sec="types"]').classList.contains('collapsed'));
  assert.match(await p.textContent('#side .sidesec[data-sec="types"] .sec-sum'), /PC/);
  assert.equal(await p.isVisible('#side .sidesec[data-sec="types"] .sec-sum'), true);
  await p.click('#moreFilters > summary');
  const was = await p.evaluate(() => document.querySelector('#moreFilters').open);
  await p.reload(); await p.waitForSelector('#cards .lrow');
  assert.equal(await p.evaluate(() => document.querySelector('#moreFilters').open), was, 'More filters as it was left');

  assert.deepEqual(errors, [], 'page errors');
  console.log('round 156: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
