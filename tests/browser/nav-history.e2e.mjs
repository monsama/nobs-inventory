/* Back and forward: the browser's buttons (and a mouse's side buttons, which send the same) move between the views seen,
   the tab and the sidebar filters. Typing in a list's filter is one step, not one per letter. Back closes an open dialog
   first and keeps the view behind it. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-nav-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
saveState(db, { ...loadState(db), locs: ['HQ'], sites: ['HQ'],
  objs: [
    { id: 'a', code: 'INV-0001', type: 'pc', name: 'PC-1', status: 'active', loc: 'HQ', ovr: {}, feed: null },
    { id: 'b', code: 'INV-0002', type: 'printer', name: 'PRN-1', status: 'active', loc: 'HQ', ovr: {}, feed: null },
  ], rels: [], history: {} });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  const st = () => p.evaluate(async () => { const { st } = await import('/js/01-core.js'); return { tab: st.tab, type: st.type, q: st.q, open: [...st.open] }; });
  const tab = async t => { await p.click(`#tabsbar [data-tab="${t}"]`); await until(p, async t => (await import('/js/01-core.js')).st.tab === t, t); };

  await tab('cards');
  await tab('table');
  await p.click('#typeList [data-type="printer"]'); await until(p, async () => (await import('/js/01-core.js')).st.type === 'printer');
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('a'));
  await until(p, async () => (await import('/js/01-core.js')).st.tab === 'a');

  await p.goBack(); await until(p, async () => (await import('/js/01-core.js')).st.tab === 'table');
  assert.equal((await st()).type, 'printer', 'back: the table with the printer filter');
  await p.goBack(); await until(p, async () => !(await import('/js/01-core.js')).st.type);
  assert.equal((await st()).tab, 'table', 'back: the table without the filter');
  await p.goBack(); await until(p, async () => (await import('/js/01-core.js')).st.tab === 'cards');
  await p.goForward(); await p.goForward(); await p.goForward();
  await until(p, async () => (await import('/js/01-core.js')).st.tab === 'a');
  assert.equal(await p.inputValue('#f_a_name'), 'PC-1', 'forward: the device page again');

  // a device's page closed since opens again when going back to it
  await tab('cards');
  await p.evaluate(async () => (await import('/js/02-views.js')).closeObjTab('a'));
  assert.ok(!(await st()).open.includes('a'));
  await p.goBack(); await until(p, async () => (await import('/js/01-core.js')).st.tab === 'a');
  assert.ok((await st()).open.includes('a'), 'the tab is back');

  // typing in a list's filter is one step
  await tab('cards');
  await p.fill('#listQ', 'P'); await p.fill('#listQ', 'PR'); await p.fill('#listQ', 'PRN');
  await until(p, async () => (await import('/js/01-core.js')).st.q === 'PRN');
  await tab('table');
  await p.goBack(); await until(p, async () => (await import('/js/01-core.js')).st.tab === 'cards');
  assert.equal((await st()).q, 'PRN', 'back to the cards with the filter as it was typed');

  // back with a dialog open closes the dialog and stays on the view
  await p.evaluate(async () => (await import('/js/04-settings.js')).openSettings());
  await p.waitForSelector('#mdl');
  await p.goBack(); await until(p, () => !document.querySelector('#mdl'));
  assert.equal((await st()).tab, 'cards', 'the view behind the dialog stays');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('back and forward: all checks passed');
} finally { await browser.close(); server.close(); }
