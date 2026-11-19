/* Browser test of what came with Gone from a source: Retire these N from the filter bar (with Undo), the Overview's line
   for devices no source lists, the address following the open device or view (and reopening it), saved views on the
   Contracts toolbar, / going to a list's own search, a colour picked for a type shown as picked, and the List's Directory column without overlaps. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-gonex-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const dev = (id, more = {}) => ({ id, code: 'INV-' + id, type: 'pc', name: 'PC-' + id.toUpperCase(), status: 'active', loc: '', ovr: {}, feed: null, added: '2026-01-01T08:00:00.000Z', ...more });
saveState(db, { ...s0,
  types: { ...(s0.types || {}), switch: { label: 'Switch', short: 'Switch', color: '#c2410c', icon: 'switch' }, printer: { label: 'Printer', short: 'Printer', color: '#123456', icon: 'printer' } },
  objs: [dev('a', { inAd: true }), dev('b', { adGone: '2026-11-10' }), dev('c', { graph: { gone: '12.11.2026 06:00' }, adGone: '2026-11-11' })],
  contracts: [{ id: 'c1', name: 'Lease Notebooks', kind: 'lease', cost: 50, per: 'month', devices: [] }, { id: 'c2', name: 'Support Firewall', kind: 'support', devices: [] }],
  rels: [], history: {} });
const stored = check => storedBy(() => loadState(db), check);
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

  // a colour picked for a type is shown as picked
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).tcol('printer')), '#123456');

  // the Overview: a line for the devices no source lists any more, leading to them
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'overview'; (await import('/js/07-render.js')).render(); });
  await p.waitForSelector('[data-ovmissing]');
  assert.match(await p.textContent('[data-ovmissing]'), /2\s*Where are they\?\s*2 gone from every source/);
  await p.click('[data-ovmissing]');
  await until(p, () => document.querySelectorAll('#cards .lrow').length === 2);

  // Retire these 2: a reason proposed, each retired with a history line, one Undo
  await p.click('#fbar [data-goneretire]'); await p.waitForSelector('#grWhy');
  assert.equal(await p.inputValue('#grWhy'), 'Gone from every source it was in');
  await p.click('#grOk');
  await stored(st => ['b', 'c'].every(id => st.objs.find(o => o.id === id).status === 'retired') && st.objs.find(o => o.id === 'a').status === 'active');
  assert.match(loadState(db).history.b[0].msg, /Retired by .*: Gone from every source it was in/);
  await p.click('#toast button');
  await stored(st => ['b', 'c'].every(id => st.objs.find(o => o.id === id).status === 'active'));

  // the address follows: a device, a view; reloading opens it again
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('a'));
  await until(p, () => /[?&]o=INV-a/.test(location.search));
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'contracts'; (await import('/js/07-render.js')).render(); });
  await until(p, () => location.search === '?v=contracts');
  await p.reload();
  await p.waitForSelector('table.contracts');

  // Contracts: / goes to its own search; a view saved there is listed on its toolbar and brings the search back
  await p.click('table.contracts'); await p.keyboard.press('/');
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.id), 'vq');
  await p.keyboard.type('lease');
  await until(p, () => !/Support Firewall/.test(document.querySelector('table.contracts tbody').textContent));
  await p.click('#lvMenu .menu-btn'); await p.click('#lvSave');
  await p.fill('#svName', 'Leases'); await p.click('#svOk');
  await stored(st => (st.savedViews || []).some(v => v.name === 'Leases' && v.tab === 'contracts' && v.q === 'lease'));
  assert.equal(await p.locator('#viewList [data-savedview]').count(), 0, 'not in the sidebar of the device lists');
  await p.fill('#vq', ''); await p.press('#vq', 'Escape');
  await until(p, () => /Support Firewall/.test(document.querySelector('table.contracts tbody').textContent));
  await p.click('#lvMenu .menu-btn'); await p.click('#lvMenu [data-lvopen]');
  await until(p, () => !/Support Firewall/.test(document.querySelector('table.contracts tbody').textContent));
  assert.equal(await p.inputValue('#vq'), 'lease');

  // the List's Directory column: AD, Entra, Intune and Defender side by side, none past its cell or over another
  await p.evaluate(async () => { localStorage.setItem('ni-card-join', '1'); });
  await p.goto(base + '/'); await p.waitForSelector('#cards .lrow');
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.SYNC.graph = true; c.SYNC.defender = true; c.st.tab = 'cards'; c.st.q = ''; (await import('/js/07-render.js')).render(); });
  await p.waitForSelector('#cards .lrow .c-dir .jb');
  assert.deepEqual(await p.evaluate(() => { const out = [];
    for (const cell of document.querySelectorAll('#cards .lrow .c-dir')) { const cr = cell.getBoundingClientRect(); if (!cr.width) continue;
      const bs = [...cell.querySelectorAll('.jb')].map(b => b.getBoundingClientRect());
      bs.forEach((r, i) => { if (r.right > cr.right + 0.5) out.push('past its cell'); if (i && r.left < bs[i - 1].right) out.push('over another'); }); }
    return [...new Set(out)]; }), []);
  assert.equal(await p.locator('#cards .lrow .c-dir .jb').first().locator('b').getAttribute('data-s'), 'AD');

  assert.deepEqual(errors, [], 'page errors');
  console.log('gone extras: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
