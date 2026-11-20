/* Browser test of how new devices come in: the inventory says how many wait in Pending devices and of which types (also beside
   each type on the left), each waiting card says why, the clear ones are added by their type at once (with Undo), and
   the devices added show New and under Added this week. Settings offer adding straight in as the default. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-new-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db), old = '2026-01-05T08:00:00.000Z', at = '17.11.2026 08:00';
const wait = (id, name, type, more = {}) => ({ id, code: null, name, type, status: 'active', loc: '', ovr: {}, feed: { sys: 'Lansweeper', ref: id, seen: at, created: at }, review: { src: 'lansweeper', at }, ...more });
saveState(db, { ...s0,
  objs: [
    { id: 'o1', code: 'INV-0001', type: 'pc', name: 'OLD-PC-1', serial: 'S-OLD-1', status: 'active', loc: '', ovr: {}, feed: null, added: old },
    { id: 'o2', code: 'INV-0002', type: 'notebook', name: 'OLD-NB-1', serial: 'S-DUP', status: 'active', loc: '', ovr: {}, feed: null, added: old },
    wait('w1', 'PC-A', 'pc', { serial: 'SA' }), wait('w2', 'PC-B', 'pc', { serial: 'SB' }), wait('w3', 'PC-C', 'pc', { serial: 'SC' }),
    wait('w4', 'NB-A', 'notebook', { serial: 'NA' }), wait('w5', 'NB-B', 'notebook', { serial: 'NB' }),
    wait('w6', '10.0.0.77', 'other', { ip: '10.0.0.77' }),
    wait('w7', 'NB-RENAMED', 'notebook', { serial: 'S-DUP' }),
  ], rels: [], history: {} });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await p.waitForSelector('#cards .lrow');

  // the Pending tab says how many wait; no line over the inventory about it, nothing beside the types on the left
  assert.match(await p.textContent('#tabsbar .tab-review'), /7/);
  assert.equal(await p.locator('#fbar .fb-wait').count(), 0, 'no banner over the inventory');
  assert.equal(await p.locator('#typeList .cnt-wait').count(), 0, 'no +N beside the types');
  assert.equal((await p.textContent('#typeList [data-type="pc"] .cnt')).trim(), '1', 'the count is the inventory\'s');

  // Pending devices: each card says why it waits; the clear ones are offered by type
  await p.click('#tabsbar [data-tab=review]');
  await until(p, () => document.querySelectorAll('#cards .card').length === 7);
  const why = async id => (await p.textContent(`#cards .card[data-open="${id}"] .rv-why`)).trim();
  assert.match(await why('w6'), /Only an IP address/);
  assert.match(await why('w7'), /Possible duplicate: same serial number as OLD-NB-1/);
  assert.match(await why('w1'), /Nothing unclear: the next sync adds it to the inventory/);
  // filtered by why they wait
  const seg = async k => (await p.textContent(`#fbar [data-ckwhy="${k}"]`)).replace(/\s+/g, ' ').trim();
  assert.equal(await seg(''), 'All 7'); assert.equal(await seg('clear'), 'Nothing unclear 5'); assert.equal(await seg('dup'), 'Possible duplicate 1'); assert.equal(await seg('ip'), 'Address only 1');
  await p.click('#fbar [data-ckwhy="dup"]');
  await until(p, () => document.querySelectorAll('#cards .card').length === 1);
  await p.click('#fbar [data-ckwhy=""]');
  await until(p, () => document.querySelectorAll('#cards .card').length === 7);
  assert.equal(await p.locator('[data-addtype]').count(), 0, 'no Add at once: the filter and Accept all do it');

  // the three clear PCs in at once (Nothing unclear, only PCs, Accept all), with the date they came; Undo puts them back; again, and they stay
  const acceptClearPcs = async () => {
    await p.click('#fbar [data-ckwhy="clear"]');
    await p.evaluate(async () => { (await import('/js/01-core.js')).st.type = 'pc'; (await import('/js/07-render.js')).view(); });
    await until(p, () => document.querySelectorAll('#cards .card').length === 3);
    await p.click('#rvAcceptAll'); await p.click('#cfOk');
    await until(p, async () => (await import('/js/01-core.js')).objs.filter(o => /^PC-[ABC]$/.test(o.name)).length === 3);
  };
  await acceptClearPcs();
  assert.ok(await p.evaluate(async () => (await import('/js/01-core.js')).objs.filter(o => /^PC-[ABC]$/.test(o.name)).every(o => Date.parse(o.added))), 'each has the date it was added');
  await p.click('#toast button');
  await until(p, async () => (await import('/js/01-core.js')).objs.every(o => !/^PC-[ABC]$/.test(o.name)));
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.type = null; c.st.rvWhy = ''; (await import('/js/07-render.js')).view(); });
  await acceptClearPcs();
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.type = null; c.st.rvWhy = ''; (await import('/js/07-render.js')).view(); });

  // back in the inventory: New on the cards added now, not on the old ones; Added this week lists only them
  await p.click('#tabsbar .tab-review');
  await p.waitForSelector('#cards .card[data-open="w1"]');
  assert.equal(await p.locator('#cards .card[data-open="w1"] .mk-new').count(), 1, 'New on a device added now');
  assert.equal(await p.locator('#cards .card[data-open="o1"] .mk-new').count(), 0, 'no New on an old one');
  // opened, it is no news any more: not after going back, not after a reload
  await p.click('#cards .card[data-open="w1"] .card-open');
  await p.click('#tabsbar [data-tab=cards]');
  await p.waitForSelector('#cards .card[data-open="w1"]');
  await p.waitForTimeout(700);
  assert.equal(await p.locator('#cards .card[data-open="w1"] .mk-new').count(), 0, 'no New once opened');
  await p.reload(); await p.waitForSelector('#cards .card[data-open="w1"]');
  assert.equal(await p.locator('#cards .card[data-open="w1"] .mk-new').count(), 0, 'still none after a reload');
  await p.click('#statList [data-newweek]');
  await until(p, async () => document.querySelectorAll('#cards .card').length === 3);
  assert.match(await p.textContent('#fbar'), /Added: in the last 7 days/);

  // Settings: straight in is the default, waiting a choice
  await p.click('#setBtn');
  await p.evaluate(async () => { (await import('/js/01-core.js')).st.setTab = 'feed'; (await import('/js/04-settings.js')).renderSetPane(); });
  await p.waitForSelector('#intake_lansweeper', { state: 'attached' });
  assert.equal(await p.inputValue('#intake_lansweeper'), 'direct');
  assert.match(await p.textContent('#intake_lansweeper'), /Add to the inventory \(recommended\)/);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('new devices: all checks passed');
} finally { await browser.close(); server.close(); }
