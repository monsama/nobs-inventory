/* Browser test of round 162: a small icon on a List row whose device has gone from every source it was in (none for a
   device only ever entered by hand, nor for one still in a source); the Kind of servers under Server in the sidebar
   (Virtual, Physical, Not known) as a filter with its chip; and Kind (servers) in the bulk edit. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r162-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, more) => ({ id, code: 'INV-' + id, type: 'server', name: 'SRV-' + id, status: 'active', loc: 'Main / Server room', ovr: {}, ...more });
saveState(db, { ...loadState(db), sites: ['Main'], locs: ['Main / Server room'], objs: [
  dev('v1', { kind: 'vm', inAd: true }),
  dev('v2', { kind: 'vm', adGone: '2026-10-01' }),
  dev('p1', { kind: 'physical', inAd: true }),
  dev('n1', {}), dev('n2', {}),
  dev('h1', { type: 'pc', name: 'PC-HAND' }),
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

  // gone from every source it was in: the icon, with the source and when in its label; none for the others
  const gone = id => p.locator(`#cards .lrow[data-open="${id}"] .st-ico.gone`);
  assert.equal(await gone('v2').count(), 1);
  assert.match(await gone('v2').getAttribute('aria-label'), /^No longer in any source: Active Directory \(its computer account went on/);
  for (const id of ['v1', 'p1', 'n1', 'h1']) assert.equal(await gone(id).count(), 0, `${id}: no icon`);

  // the Kind under Server: counts, a filter, its chip; Server itself takes it off
  const kind = k => p.locator(`#typeList [data-srvkind="${k}"]`);
  assert.deepEqual(await Promise.all(['vm', 'physical', 'none'].map(async k => (await kind(k).locator('.cnt').textContent()).trim())), ['2', '1', '2']);
  await kind('none').click();
  await until(p, () => document.querySelectorAll('#cards .lrow').length === 2);
  assert.match(await p.textContent('#fbar'), /Kind: Not known/);
  assert.equal(await kind('none').evaluate(b => b.classList.contains('sel')), true);
  await p.click('#typeList [data-type="server"]');
  await until(p, () => document.querySelectorAll('#cards .lrow').length === 5);
  assert.doesNotMatch(await p.textContent('#fbar'), /Kind:/);

  // Back after a Kind: the list before it, with no Kind left in force
  await kind('vm').click(); await until(p, () => document.querySelectorAll('#cards .lrow').length === 2);
  await p.goBack(); await until(p, async () => (await import('/js/01-core.js')).st.srvKind == null);
  await until(p, () => document.querySelectorAll('#cards .lrow').length === 5);

  // bulk: Kind (servers) for the two not known
  await kind('none').click(); await until(p, () => document.querySelectorAll('#cards .lrow').length === 2);
  await p.evaluate(async () => (await import('/js/views-bulk-edit.js')).bulkEditModal(['n1', 'n2', 'h1']));
  await p.waitForSelector('#beRows .be-row');
  assert.equal(await p.locator('#beOk').isDisabled(), true);
  assert.doesNotMatch(await p.textContent('#bePrev'), /Kind/, 'Kind is not the first row: no Kind error before anything is picked');
  await p.selectOption('#beRows .be-f', 'kind');
  await p.selectOption('#beRows .be-v select', 'physical');
  await until(p, () => /Apply to 2 devices/.test(document.querySelector('#beOk').textContent));
  await p.click('#beOk'); await p.waitForSelector('#mdl', { state: 'detached' });
  assert.deepEqual(await p.evaluate(async () => { const c = await import('/js/01-core.js'); return ['n1', 'n2', 'h1'].map(id => c.byId(id).kind || ''); }), ['physical', 'physical', '']);
  await until(p, () => document.querySelectorAll('#cards .lrow').length === 0 || !!document.querySelector('#cards .empty, #cards .nomatch'));
  assert.equal(await p.locator('#cards .lrow').count(), 0, 'none left Not known');

  assert.deepEqual(errors, []);
  console.log('round 162: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
