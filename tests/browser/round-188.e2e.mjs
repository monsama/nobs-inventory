/* Browser test of round 188: the tabs stay in place in views without filters; the user in a device's key facts opens
   their devices; a used port moves to another port or is replaced, each with Undo; contracts are cards on a phone;
   a plain message closes when the view changes. */
import { chromium, devices } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r188-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, type, name, more) => ({ id, code: 'INV-' + id, type, name, status: 'active', loc: 'Zürich / IT', ovr: {}, serial: 'S-' + id, model: 'Model X', ...more });
const s0 = loadState(db);
saveState(db, { ...s0, locs: ['Zürich / IT'], history: {},
  users: [...s0.users, { id: 'p1', name: 'Finn Graf', role: 'none', active: true, source: 'manual', groups: [] }],
  contracts: [{ id: 'c1', name: 'Lease Notebooks 2023 with a long name', kind: 'lease', supplier: 'Leasing GmbH', cost: 1200.5, per: 'year', end: '2027-12-31', renew: 12, notice: 3, devices: ['nb'] }],
  objs: [dev('core', 'switch', 'SW-CORE', { ports: 24 }), dev('pa', 'pc', 'PC-A'), dev('pb', 'pc', 'PC-B'), dev('nb', 'notebook', 'NB-FINN', { uid: 'p1', user: 'Finn Graf' })],
  rels: [{ id: 'r1', from: 'pa', to: 'core', kind: 'connected', port: 5, vlan: null }] });
const stored = check => storedBy(() => loadState(db), check);
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const signIn = async p => { await p.goto(base); await p.waitForSelector('#lgUser'); await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk'); await p.waitForSelector('#cards .lrow'); };
const go = (p, t) => p.evaluate(async t => { (await import('/js/01-core.js')).st.tab = t; (await import('/js/07-render.js')).view(); }, t);
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await signIn(p);

  // 1. the tabs stay where they are, with the filters shown and folded
  const xs = () => p.$$eval('#tabsbar .tab', t => t.slice(0, 4).map(x => Math.round(x.getBoundingClientRect().left)));
  for (const pin of ['1', '0']) {
    await p.evaluate(v => localStorage.setItem('ni-side-pin', v), pin);
    await go(p, 'cards'); const a = await xs(); await go(p, 'overview'); const b = await xs();
    assert.deepEqual(b, a, `filters ${pin === '1' ? 'shown' : 'folded'}`);
  }
  await p.evaluate(() => localStorage.setItem('ni-side-pin', '1'));

  // 2. the user in the key facts opens their devices
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('nb'));
  await p.waitForSelector('[data-showperson="p1"]'); await p.click('[data-showperson="p1"]');
  await until(p, async () => (await import('/js/01-core.js')).st.person === 'p1');

  // 3. a used port: Move to another port, then Undo; Replace with another device, then Undo
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.person = null; c.st.portsDevice = 'core'; c.st.portNo = 5; c.st.tab = 'net'; (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('[data-moveport="r1"]'); await p.click('[data-moveport="r1"]');
  await p.waitForSelector('#mpPort'); await p.selectOption('#mpPort', '9'); await p.click('#mpOk');
  await stored(st => st.rels.find(r => r.id === 'r1').port === 9);
  await p.click('#toast .t-undo');
  await stored(st => st.rels.find(r => r.id === 'r1').port === 5);
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.portNo = 5; (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('[data-replace="r1"]'); await p.click('[data-replace="r1"]');
  await p.waitForSelector('#lkQ'); assert.match(await p.textContent('#mdl .mh'), /Replace PC-A on SW-CORE · 5/);
  await p.fill('#lkQ', 'PC-B'); await p.press('#lkQ', 'Enter');
  await stored(st => st.rels.some(r => r.from === 'pb' && r.to === 'core' && r.port === 5) && !st.rels.some(r => r.id === 'r1'));
  await p.click('#toast .t-undo');
  await stored(st => st.rels.some(r => r.id === 'r1' && r.port === 5) && !st.rels.some(r => r.from === 'pb'));

  // 4. a plain message closes when the view changes
  await p.evaluate(async () => (await import('/js/01-core.js')).toast('Just a note'));
  await go(p, 'cards');
  assert.equal(await p.evaluate(() => document.getElementById('toast').classList.contains('off')), true);

  // 5. contracts on a phone: cards, nothing past the right edge, the cost on one line
  const phone = await browser.newContext({ ...devices['Pixel 7'] });
  await phone.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const m = await phone.newPage(); m.on('pageerror', e => errors.push(e.message));
  await signIn(m); await go(m, 'contracts'); await m.waitForSelector('table.contracts tbody tr');
  const over = await m.evaluate(() => { const w = document.documentElement.clientWidth; return [...document.querySelectorAll('table.contracts td, table.contracts tr, .ct-sum *')].filter(e => e.getBoundingClientRect().right > w + 1).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right) + '/' + w + ' ' + e.textContent.slice(0, 30)).concat(document.documentElement.scrollWidth > w ? ['page ' + document.documentElement.scrollWidth] : []); });
  assert.deepEqual(over, [], 'no contract cell past the right edge');
  assert.match(await m.textContent('table.contracts td[data-l="Cost"]'), /CHF 1.?200\.50/);
  if (process.env.NI_SHOTS) await m.screenshot({ path: path.join(process.env.NI_SHOTS, 'contracts-phone.png') });
  /* The cost on one line, and each total within its tile. */
  const costLines = await m.$eval('table.contracts td[data-l="Cost"]', e => { const r = document.createRange(); r.selectNodeContents(e); return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size; });
  assert.equal(costLines, 1, 'the cost on one line');
  assert.equal(await m.$$eval('.ct-sum .ov-tv', t => t.every(e => e.scrollWidth <= e.clientWidth + 1 && e.getBoundingClientRect().right <= e.closest('.ov-tile').getBoundingClientRect().right)), true, 'the totals fit their tiles');

  assert.deepEqual(errors, []);
  console.log('round 188: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
