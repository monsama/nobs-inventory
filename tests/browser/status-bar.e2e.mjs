/* The status bar shows whether changes reached the server and when Lansweeper last sent data, in place of a fixed
   "API ok": a change is saved, a server that cannot be reached is shown and the change is sent again once it answers,
   a sync older than two days is marked, and a turned-off sync says so. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-status-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const p2 = n => String(n).padStart(2, '0');
const stamp = d => `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
const old = stamp(new Date(Date.now() - 5 * 864e5)), fresh = stamp(new Date(Date.now() - 3600e3));
saveState(db, { ...s0, locs: ['HQ'], sites: ['HQ'],
  objs: [
    { id: 'a', code: 'INV-0001', type: 'pc', name: 'PC-1', status: 'active', loc: 'HQ', ovr: {}, feed: { src: 'lansweeper', key: 'k1', seen: old } },
    { id: 'b', code: 'INV-0002', type: 'pc', name: 'PC-2', status: 'active', loc: 'HQ', ovr: {}, feed: null },
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
  const text = sel => p.$eval(sel, e => e.textContent.trim());
  assert.equal(await p.$$eval('.statusbar', b => b[0].textContent.includes('API ok')), false);
  assert.equal(await text('#stSave'), 'All changes saved');

  // the newest sync is five days old: shown with a warning dot
  assert.equal(await text('#stSync'), 'Lansweeper ' + old);
  assert.equal(await p.$eval('#stSync .dot', e => e.classList.contains('warn')), true);

  // a fresh sync is plain
  await p.evaluate(async t => { const c = await import('/js/01-core.js'); c.byId('b').feed = { src: 'lansweeper', key: 'k2', seen: t }; (await import('/js/07-render-plans.js')).renderStatus(); }, fresh);
  assert.equal(await text('#stSync'), 'Lansweeper ' + fresh);
  assert.equal(await p.$eval('#stSync .dot', e => e.classList.contains('warn')), false);

  // the sync turned off
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.useLansweeper = false; (await import('/js/07-render-plans.js')).renderStatus(); });
  assert.equal(await text('#stSync'), 'Lansweeper off');
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.useLansweeper = true; c.byId('b').feed = null; (await import('/js/07-render-plans.js')).renderStatus(); });

  // the server cannot be reached: the change waits, and is sent once the server answers
  await p.route('**/api/changes', r => r.abort());
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.byId('b').name = 'PC-2b'; await (await import('/js/07-render-plans.js')).flushSave(); });
  assert.equal(await text('#stSave'), 'Server not reachable');
  assert.equal(await p.$eval('#stSave .bad', e => e.classList.contains('chip')), true, 'a red chip, not just a dot');
  await p.unroute('**/api/changes');
  await p.evaluate(async () => { document.activeElement && document.activeElement.blur(); await (await import('/js/07-render-plans.js')).checkForChanges(); });
  await until(p, async () => document.querySelector('#stSave').textContent.trim() === 'All changes saved');
  assert.equal(loadState(db).objs.find(o => o.id === 'b').name, 'PC-2b');

  // a sign-in that has ended does not leave "Saving…" behind
  await p.route('**/api/changes', r => r.fulfill({ status: 401, body: '{}' }));
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.byId('b').name = 'PC-2c'; await (await import('/js/07-render-plans.js')).flushSave(); });
  assert.equal(await text('#stSave'), 'Not saved');
  await p.unroute('**/api/changes');

  assert.deepEqual(errors, []);
  console.log('status bar: ok');
} finally { await browser.close(); server.close(); }
