/* An edit not saved yet is never dropped: not when the sign-in ends and the person signs in again, not when the page
   reads the inventory again (after a sync or an import), and a restore replaces it on purpose. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-unsaved-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
saveState(db, { ...s0, locs: ['HQ'], sites: ['HQ'], objs: [{ id: 'a', code: 'INV-a', type: 'pc', name: 'PC-A', status: 'active', loc: 'HQ', ovr: {}, feed: null }], rels: [], history: {} });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const onServer = () => loadState(db).objs.find(o => o.id === 'a').purpose;
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  const signIn = async () => { await p.waitForSelector('#lgUser'); await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk'); await until(p, async () => !document.querySelector('#lgUser')); };
  await p.goto(base + '/'); await signIn();
  await until(p, async () => (await import('/js/01-core.js')).objs.length === 1);
  const edit = v => p.evaluate(async v => { const c = await import('/js/01-core.js'); c.byId('a').purpose = v; (await import('/js/07-render.js')).queueServerSave(); }, v);

  // the sign-in ends before the edit is saved: after signing in again, it is saved
  await ctx.clearCookies();
  await edit('kept across sign-in');
  await signIn();
  await until(p, async () => (await import('/js/01-core.js')).byId('a').purpose === 'kept across sign-in');
  for (let i = 0; i < 30 && onServer() !== 'kept across sign-in'; i++) await p.waitForTimeout(100);
  assert.equal(onServer(), 'kept across sign-in', 'the edit reached the server');

  // the page reads the inventory again right after an edit (as after a sync or an import): the edit is saved first
  await edit('kept across reload');
  await p.evaluate(async () => (await import('/js/07-render.js')).reloadFromServer());
  assert.equal(onServer(), 'kept across reload');
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).byId('a').purpose), 'kept across reload');

  // the server cannot be reached: the edit stays on the page after a reload, and is saved later
  await p.route('**/api/changes', r => r.abort());
  await edit('kept while offline');
  await p.evaluate(async () => (await import('/js/07-render.js')).reloadFromServer());
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).byId('a').purpose), 'kept while offline', 'still on the page');
  await p.unroute('**/api/changes');
  await p.evaluate(async () => (await import('/js/07-render.js')).flushSave());
  assert.equal(onServer(), 'kept while offline', 'saved once the server answers');

  assert.deepEqual(errors, []);
  console.log('unsaved edits: all checks passed');
} finally { await browser.close(); server.close(); }
