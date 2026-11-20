/* Browser test of where a device's location comes from, set in place in Settings → Locations: the sources in order
   with a switch each (no dialog), arrows to change the order, the texts of a source switched off not listed, and Undo. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import { fieldOrder } from '../../public/js/sync-map.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-locsrc-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const stored = check => storedBy(() => loadState(db), check);
const dev = (id, more) => ({ id, code: 'INV-' + id, type: 'pc', name: 'PC-' + id, status: 'active', loc: '', ovr: {}, ...more });
saveState(db, { ...s0, sites: ['Site A'], locs: ['Site A'],
  objs: [dev('a', { ad: { location: 'Buchhaltung' } }), dev('b', { feed: { sys: 'Lansweeper', ref: 'r1', location: 'Werkstatt' } })], rels: [], history: {} });

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
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.setTab = 'locations'; (await import('/js/04-settings.js')).openSettings(); });
  await p.waitForSelector('.locsrc');
  /* A switch is clicked where a person does: on it (its box is hidden under the drawn switch). */
  const flip = sel => p.locator(sel).locator('xpath=..').click();
  const order = () => p.$$eval('.locsrc .ls-item.on:not(.ls-fallback) .ls-name b', b => b.map(x => x.textContent));
  const texts = () => p.$$eval('#adLocs .lrow.adloc:not(.head) .adloc-text', t => t.map(x => x.textContent));

  // by default AD only: its text listed, Lansweeper's not
  assert.deepEqual(await order(), ['Active Directory']);
  assert.deepEqual(await texts(), ['Buchhaltung']);
  // Lansweeper on (last), no dialog: its text appears
  await flip('[data-locon="ls"]');
  await stored(st => fieldOrder(st, 'loc').join() === 'ad,ls');
  assert.equal(await p.evaluate(() => !!document.querySelector('#dpOk')), false, 'no preview dialog to confirm');
  await until(p, () => document.querySelectorAll('#adLocs .lrow.adloc:not(.head)').length === 2);
  // Lansweeper first
  await p.click('[data-locmv="ls|-1"]');
  await stored(st => fieldOrder(st, 'loc').join() === 'ls,ad');
  assert.deepEqual(await order(), ['Lansweeper', 'Active Directory']);
  // AD off: its text goes from the list; Undo brings it back
  await flip('[data-locon="ad"]');
  await stored(st => fieldOrder(st, 'loc').join() === 'ls');
  assert.deepEqual(await texts(), ['Werkstatt']);
  await p.click('#toast .t-undo');
  await stored(st => fieldOrder(st, 'loc').join() === 'ls,ad');
  await until(p, () => document.querySelectorAll('#adLocs .lrow.adloc:not(.head)').length === 2);
  // all off: the row stays, to switch one on again
  await flip('[data-locon="ad"]'); await stored(st => fieldOrder(st, 'loc').join() === 'ls');
  await flip('[data-locon="ls"]'); await stored(st => !fieldOrder(st, 'loc').length);
  await p.waitForSelector('.locsrc [data-locon="ad"]');
  assert.match(await p.textContent('#adLocs'), /switch one on above/);
  // the user's office: its own switch
  await flip('#locOffice'); await stored(st => st.locFromOffice === true);

  // a dialog opened from Settings (the weekly e-mail's preview) keeps Settings in sight behind it, still; closing brings Settings back
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.setTab = 'mail'; (await import('/js/04-settings.js')).openSettings(); });
  await p.waitForSelector('#dgPreview'); await p.click('#dgPreview');
  await p.waitForSelector('#mdl:not(:has(#setPane)) .mh');
  assert.equal(await p.evaluate(() => { const g = document.querySelector('#mdlGhost'); return !!g && g.inert && !!g.shadowRoot.querySelector('.box.settings #setPane') && !document.getElementById('setPane'); }), true, 'Settings stays behind, inert');
  /* and looks as Settings does: its menu on the left, the pane beside it (styled by its ids) */
  assert.equal(await p.evaluate(() => { const g = document.querySelector('#mdlGhost'), t = g.shadowRoot.querySelector('#setTabs').getBoundingClientRect(), pn = g.shadowRoot.querySelector('#setPane').getBoundingClientRect(); return t.right <= pn.left + 1 && t.height > 300; }), true, 'the copy keeps the Settings layout');
  if (process.env.GHOST) await p.screenshot({ path: process.env.GHOST });
  await p.keyboard.press('Escape');
  await p.waitForSelector('#mdl #setPane');
  assert.equal(await p.$$eval('#mdlGhost', g => g.length), 0, 'the picture is gone once Settings is back');
  await p.evaluate(async () => (await import('/js/19-modal.js')).closeModal());
  assert.equal(await p.$$eval('#mdlGhost', g => g.length), 0);

  // renamed in AD: devices in Site A / Raum 1 now say "Raum 2"; the old text is mapped and no device says it any more
  saveState(db, { ...loadState(db), locs: ['Site A', 'Site A / Raum 1'], locMap: { 'Raum 1': 'Site A / Raum 1' }, fieldOrder: null, policy: { ...(loadState(db).policy || {}), loc: false },
    objs: [dev('c', { loc: 'Site A / Raum 1', ad: { location: 'Raum 2' } }), dev('d', { loc: 'Site A / Raum 1', ad: { location: 'Raum 2' } })] });
  await p.reload(); await until(p, async () => !!(await import('/js/01-core.js')).st.meId);
  if (!(await p.locator('#mdl #setPane').count())) await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.setTab = 'locations'; (await import('/js/04-settings.js')).openSettings(); });
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.setTab = 'locations'; (await import('/js/04-settings.js')).renderSetPane(); });
  await p.waitForSelector('.loc-renamed .lr-item');
  assert.match(await p.textContent('.loc-renamed'), /Renamed in AD\? 2 devices in Site A \/ Raum 1 now say “Raum 2” instead of “Raum 1”\./);
  // Keep: the new text goes to the same room, the old one is dropped; Undo puts it back
  await p.click('[data-lrkeep="0"]');
  await stored(st => st.locMap['Raum 2'] === 'Site A / Raum 1' && !('Raum 1' in st.locMap));
  await p.click('#toast .t-undo');
  await stored(st => st.locMap['Raum 1'] === 'Site A / Raum 1' && !('Raum 2' in st.locMap));
  // Keep and rename: the room is called after the new text, its devices go along; one Undo for both
  await p.waitForSelector('[data-lrren="0"]');
  assert.match(await p.textContent('[data-lrren="0"]'), /Keep and rename to Site A \/ Raum 2/);
  await p.click('[data-lrren="0"]');
  await stored(st => st.locs.includes('Site A / Raum 2') && !st.locs.includes('Site A / Raum 1') && st.locMap['Raum 2'] === 'Site A / Raum 2' && st.objs.every(o => o.loc === 'Site A / Raum 2'));
  assert.equal(await p.locator('.loc-renamed').count(), 0, 'nothing left to ask');
  await p.click('#toast .t-undo');
  await stored(st => st.locs.includes('Site A / Raum 1') && !st.locs.includes('Site A / Raum 2') && st.locMap['Raum 1'] === 'Site A / Raum 1' && st.objs.every(o => o.loc === 'Site A / Raum 1'));

  assert.deepEqual(errors, [], 'page errors');
  console.log('location sources: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
