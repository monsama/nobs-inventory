/* Browser test of round 194: with the filters folded the views bar starts where the view does, in views with and
   without filters; on a phone the SFP ports do not touch, a rack unit and the user in a device's facts are a tap high,
   and Settings' tabs wrap; a serial changed is counted at once in "Serial number used twice". */
import { chromium, devices } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r194-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const d = (id, type, name, more) => ({ id, code: 'INV-' + id, type, name, status: 'active', loc: 'Zürich / IT', ovr: {}, serial: 'S-' + id, model: 'M', ...more });
saveState(db, { ...s0, locs: ['Zürich / IT'], history: {},
  users: [...s0.users, { id: 'p1', name: 'Lea Bachmann', role: 'none', active: true, source: 'manual', groups: [] }],
  objs: [d('rk', 'rack', 'RACK-A', { units: 12 }), d('core', 'switch', 'SW-1', { ports: 24, sfp: 4, rack: 'rk', u: 3, h: 1 }), d('pa', 'pc', 'PC-A', { uid: 'p1', user: 'Lea Bachmann' }), d('pb', 'pc', 'PC-B')] });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const go = (p, t, extra = {}) => p.evaluate(async ([t, extra]) => { const c = await import('/js/01-core.js'); Object.assign(c.st, extra); c.st.tab = t; (await import('/js/07-render.js')).view(); }, [t, extra]);
const open = async (opt, pin) => {
  const ctx = await browser.newContext(opt);
  await ctx.addInitScript(v => { try { localStorage.setItem('ni-started', '1'); localStorage.setItem('ni-side-pin', v); } catch { /* none */ } }, pin);
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(base); await p.waitForSelector('#lgUser'); await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk'); await p.waitForSelector('#cards .lrow');
  return p;
};
try {
  // 1. filters folded: the first tab and the view's bar start at the same x, in both kinds of view
  const p = await open({ viewport: { width: 1000, height: 700 } }, '0');
  const lefts = () => p.evaluate(() => [document.querySelector('#tabsbar .tab'), document.querySelector('#toolbar > *, #view > *')].map(e => Math.round(e.getBoundingClientRect().left)));
  await go(p, 'cards'); const a = await lefts(); await go(p, 'overview'); const b = await lefts();
  assert.equal(a[0], a[1], 'Devices: the tabs start where the toolbar does'); assert.deepEqual(b, a, 'Overview: the same');

  //    a serial changed is counted at once
  const dup = () => p.evaluate(async () => { const c = await import('/js/01-core.js'); return c.QUALITY.dupserial[2](c.objs.find(o => o.id === 'pa')); });
  assert.equal(await dup(), false);
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.objs.find(o => o.id === 'pb').serial = 'S-pa'; });
  assert.equal(await dup(), true, 'the second device with the serial is seen at once');

  // 2. a phone
  const m = await open(devices['Pixel 7'], '0');
  await go(m, 'net', { portsDevice: 'core' }); await m.waitForSelector('.pgroup.sfp .port');
  const sfp = await m.$$eval('.pgroup.sfp .port', ps => ps.map(e => e.getBoundingClientRect()).map(r => [Math.round(r.left), Math.round(r.right), Math.round(r.top)]));
  for (const x of sfp) for (const y of sfp) if (x !== y && x[2] === y[2] && x[0] < y[0]) assert.ok(x[1] < y[0], 'SFP ports apart: ' + JSON.stringify(sfp));
  await go(m, 'rack', { rack: 'rk' }); await m.waitForSelector('.rack .unit');
  assert.ok(await m.$eval('.rack .unit', e => e.getBoundingClientRect().height) >= 36, 'a rack unit is a tap high');
  await m.evaluate(async () => (await import('/js/02-views.js')).openObj('pa')); await m.waitForSelector('[data-showperson]');
  assert.ok(await m.$eval('[data-showperson]', e => e.getBoundingClientRect().height) >= 36, 'the user is a tap high');
  await m.evaluate(async () => (await import('/js/04-settings.js')).openSettings()); await m.waitForSelector('#setTabs .tab');
  assert.equal(await m.$$eval('#setTabs > .settabs > .tab', t => t.every(e => e.getBoundingClientRect().right <= document.documentElement.clientWidth)), true, 'every Settings tab can be seen');

  assert.deepEqual(errors, []);
  console.log('round 194: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
