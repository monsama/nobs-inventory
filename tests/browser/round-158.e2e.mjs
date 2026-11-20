/* Browser test of round 158: the List's rows all have two lines (the description, else the serial number); a row's
   status and an ended warranty are small icons in fixed places, named in their tooltip; the Pending devices tab is a
   switch (pressed again, or Esc, back to the inventory) with no bar of its own; the tab on the filters' edge hides them;
   quick edit sets the description. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { storedBy, until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r158-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, more) => ({ id, code: 'INV-' + id, type: 'pc', name: 'PC-' + id, status: 'active', loc: '', ovr: {}, ...more });
saveState(db, { ...loadState(db), objs: [
  dev('a', { purpose: 'Reception desk' }),
  dev('b', { serial: 'SN-4711', status: 'stock' }),
  dev('c', { warranty: '2020-01-31', status: 'stock' }),
  dev('d', { warranty: '2020-01-31' }),
  dev('w', { name: 'NEW-PC', code: '', review: { src: 'lansweeper', at: new Date().toISOString() } }),
], rels: [], history: {} });
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
  const row = id => `#cards .lrow[data-open="${id}"]`;

  // two lines on every row: the description, else the serial number, else an empty line; all rows as tall
  assert.equal((await p.textContent(`${row('a')} .c-desc`)).trim(), 'Reception desk');
  assert.equal((await p.textContent(`${row('b')} .c-desc.alt`)).trim(), 'SN-4711');
  assert.equal(await p.locator(`${row('d')} .c-name.nodesc`).count(), 1, 'nothing under the name: it sits in the middle');
  const heights = await p.$$eval('#cards .lrow', rs => rs.map(r => r.clientHeight));
  assert.equal(new Set(heights).size, 1, 'every row as tall: ' + heights.join(', '));

  // the state as icons in fixed places, named
  assert.equal(await p.getAttribute(`${row('b')} .st-ico.stock`, 'aria-label'), 'In stock');
  assert.match(await p.getAttribute(`${row('d')} .st-ico.wty-ended`, 'aria-label'), /Warranty ended on/);
  assert.equal(await p.locator(`${row('a')} .st-ico[role=img]`).count(), 0, 'In use and in warranty: no icon');
  const xOf = sel => p.$eval(sel, el => Math.round(el.getBoundingClientRect().left));
  assert.equal(await xOf(`${row('c')} .st-ico.wty-ended`), await xOf(`${row('d')} .st-ico.wty-ended`), 'the warranty icon in the same place with or without a status');
  assert.equal(await p.locator('#cards .chip', { hasText: /Warranty ended|In stock/ }).count(), 0, 'no word chips any more');
  assert.equal(await p.$eval(`${row('a')} .c-chips`, el => el.innerHTML.trim()), '', 'nothing to say: no state cell (on a phone no empty line)');

  // Pending devices: the tab is a switch; no bar of its own; Esc goes back too
  const scope = () => p.evaluate(async () => (await import('/js/01-core.js')).st.scope);
  await p.click('#tabsbar .tab-review');
  await until(p, async () => (await import('/js/01-core.js')).st.scope === 'review');
  assert.equal(await p.getAttribute('#tabsbar .tab-review', 'aria-pressed'), 'true');
  assert.equal(await p.locator('#fbar .fb-inbox').count(), 0, 'no bar over Pending devices');
  await p.waitForSelector(row('w'));
  await p.click('#tabsbar .tab-review');
  await until(p, async () => (await import('/js/01-core.js')).st.scope === null);
  assert.equal(await p.getAttribute('#tabsbar .tab-review', 'aria-pressed'), 'false');
  await p.click('#tabsbar .tab-review'); await until(p, async () => (await import('/js/01-core.js')).st.scope === 'review');
  await p.click('#view'); await p.keyboard.press('Escape');
  await until(p, async () => (await import('/js/01-core.js')).st.scope === null);
  assert.equal(await scope(), null);
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('tab-review')), true, 'the focus is on the Pending tab');

  // the tab on the filters' edge hides them; the strip brings them back
  await p.hover('#side'); await p.click('#sideGrip .side-fold');
  await until(p, async () => !(await import('/js/02-views.js')).sidePinned());
  await p.click('#sideRail');
  await until(p, async () => (await import('/js/02-views.js')).sidePinned());

  // quick edit: the description, Enter saves, one Undo
  await p.hover(row('d')); await p.click(`${row('d')} .qedit-btn`); await p.waitForSelector('#qeDesc');
  await p.fill('#qeDesc', 'Spare for the lab'); await p.press('#qeDesc', 'Enter');
  await stored(st => st.objs.find(o => o.id === 'd').purpose === 'Spare for the lab');
  assert.equal(await p.evaluate(() => document.querySelector('#qedit').matches(':popover-open')), true, 'the box stays open: Tab goes on to Location');
  assert.equal((await p.textContent(`${row('d')} .c-desc`)).trim(), 'Spare for the lab');
  await p.click('#toast .t-undo');
  await stored(st => !st.objs.find(o => o.id === 'd').purpose);

  assert.deepEqual(errors, []);
  console.log('round 158: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
