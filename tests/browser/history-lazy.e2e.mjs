/* The page loads the inventory without the devices' history and reads a device's history when its page opens; a line
   added to a device whose history the page never read is saved on top of the stored ones, none lost. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-hist-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, name) => ({ id, code: 'INV-' + id, type: 'pc', name, status: 'active', feed: null });
saveState(db, { ...loadState(db), objs: [dev('a', 'PC-A'), dev('b', 'PC-B')], rels: [],
  history: { a: [{ t: '2026-11-02 09:00', msg: 'Moved to HQ / Office' }, { t: '2026-11-01 08:00', msg: 'Created by hand' }], b: [{ t: '2026-11-01 08:00', msg: 'Created by hand' }] } });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [], asked = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  p.on('request', r => { if (/\/api\/(state|history)/.test(r.url())) asked.push(new URL(r.url()).pathname + new URL(r.url()).search); });
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length === 2);
  assert.ok(asked.includes('/api/state?history=0'), 'the inventory was loaded with its history: ' + asked.join(', '));
  assert.equal(await p.evaluate(async () => Object.keys((await import('/js/01-core.js')).HISTORY).length), 0, 'history came with the inventory');

  // a line added to B, whose history the page has not read: saved on top of the stored one
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.hist(c.byId('b'), c.now(), 'Label printed'); (await import('/js/server-save.js')).queueServerSave(); });
  await storedBy(() => loadState(db), s => (s.history.b || []).length === 2);
  assert.deepEqual(loadState(db).history.b.map(h => h.msg), ['Label printed', 'Created by hand'], 'a line was lost');

  // A's page: its history is read and shown, and only then
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('a'));
  await p.waitForSelector('#histPanel .cnt');
  await until(p, () => document.querySelector('#histPanel .cnt').textContent.trim() === '2');
  assert.ok(asked.includes('/api/history/a'));
  assert.match(await p.textContent('#histPanel'), /Moved to HQ \/ Office/);
  // a field edited there: one more line, the two stored ones stay, nothing twice
  await p.fill('#f_a_purpose', 'Reception');
  await p.press('#f_a_purpose', 'Tab');
  await storedBy(() => loadState(db), s => (s.history.a || []).length === 3);
  const h = loadState(db).history.a.map(x => x.msg);
  assert.equal(new Set(h).size, 3, 'a line twice: ' + h.join(' | '));
  assert.ok(h.includes('Moved to HQ / Office') && h.includes('Created by hand'));
  // opened again: not read again
  const n = asked.filter(x => x === '/api/history/a').length;
  await p.evaluate(async () => (await import('/js/07-render.js')).render());
  await p.waitForTimeout(300);
  assert.equal(asked.filter(x => x === '/api/history/a').length, n, 'the history was read again');
  assert.deepEqual(errors, [], 'page errors');
  console.log('history on demand: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
