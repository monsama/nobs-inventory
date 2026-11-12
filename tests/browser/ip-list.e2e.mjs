/* IP addresses: one row per address (also a second adapter's), in address order, with how it is given (static,
   dynamic, or dynamic by its DHCP range), its subnet and its problems; the filters and the search narrow it; with one
   subnet picked the free addresses show; the assignment set here is saved on the device with a history line. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-ips-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, name, more) => ({ id, code: 'INV-' + id, type: 'pc', name, status: 'active', feed: null, ...more });
saveState(db, { ...loadState(db),
  subnets: [{ name: 'Office', cidr: '10.1.1.0/28', gateway: '10.1.1.1', dns: [], types: [], ranges: [{ from: '10.1.1.2', to: '10.1.1.7', use: 'Static' }, { from: '10.1.1.8', to: '10.1.1.14', use: 'DHCP' }] }],
  objs: [
    dev('a', 'PC-A', { ip: '10.1.1.5', dhcp: 'static', mac: 'aa:aa:aa:aa:aa:01' }),
    dev('b', 'PC-B', { ip: '10.1.1.5' }),
    dev('c', 'PC-C', { ip: '10.1.1.9' }),
    dev('d', 'PC-D', { ip: '10.1.1.10', dhcp: 'static', nics: [{ name: 'Wi-Fi', ip: '192.168.5.20', dhcp: 'dhcp' }] }),
    dev('e', 'PC-E', { ip: '10.1.1.1' }),
    dev('r', 'PC-R', { ip: '10.1.1.3', status: 'retired' }),
  ],
  rels: [], history: {} });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);

  // the Network tab, then IP addresses in its switch
  await p.click('#tabsbar .tab:has-text("Network")');
  await p.click('.vswitch [data-vsw="ips"]');
  await p.waitForSelector('table.grid.ips');
  const rows = () => p.$$eval('table.grid.ips tbody tr:not(.ip-free)', trs => trs.map(tr => [...tr.cells].map(c => c.textContent.replace(/\s+/g, ' ').trim())));
  let r = await rows();
  assert.deepEqual(r.map(x => x[0]), ['10.1.1.1', '10.1.1.5', '10.1.1.5', '10.1.1.9', '10.1.1.10', '192.168.5.20'], 'not every address in use, in order (a retired device left out)');
  const row = (ip, name) => r.find(x => x[0] === ip && x[1].startsWith(name));
  assert.match(row('10.1.1.5', 'PC-A')[7], /Also on PC-B/, 'the clash is not named');
  assert.match(row('10.1.1.1', 'PC-E')[7], /gateway of Office/i);
  assert.match(row('10.1.1.10', 'PC-D')[7], /Static, but inside a DHCP range/);
  assert.match(row('192.168.5.20', 'PC-D')[1], /Wi-Fi/, 'the second adapter is not named');
  assert.match(row('192.168.5.20', 'PC-D')[3], /Dynamic \(DHCP\)/);
  assert.match(await p.textContent('#ipCount'), /6 addresses · 2 static · 2 dynamic · 2 not known/);
  // PC-C has no assignment set: its address is in the DHCP range, so it reads as dynamic by its range
  assert.equal(await p.$eval('[data-ipas="c"]', s => s.selectedOptions[0].textContent), 'Not set (DHCP range)');

  // filters: only problems, the assignment, and the search
  await p.check('#ipProblems'); r = await rows();
  assert.deepEqual(r.map(x => x[1].split(' ')[0]), ['PC-E', 'PC-A', 'PC-B', 'PC-D'], 'only problems shows the wrong rows');
  await p.uncheck('#ipProblems');
  await p.selectOption('#ipAssign', 'static'); r = await rows();
  assert.deepEqual(r.map(x => x[1].split(' ')[0]), ['PC-A', 'PC-D']);
  await p.selectOption('#ipAssign', '');
  await p.fill('#search', '192.168'); await until(p, () => document.querySelectorAll('table.grid.ips tbody tr').length === 1);

  await p.fill('#search', '');
  // one subnet with its free addresses: the static range's free ones, the DHCP range kept apart, the gateway named
  await p.selectOption('#ipSub', '10.1.1.0/28'); await p.check('#ipFree');
  const free = await p.$$eval('table.grid.ips tr.ip-free', trs => trs.map(tr => [...tr.cells].map(c => c.textContent.trim()).join(' ').replace(/\s+/g, ' ')));
  assert.ok(free.some(t => /^10\.1\.1\.2 Free/.test(t)), 'a free static address is not listed');
  assert.ok(free.some(t => /^10\.1\.1\.8 DHCP range/.test(t)), 'the DHCP range is not marked');
  assert.match(await p.textContent('#ipCount'), / free$/);

  // the assignment set here: saved on the device, with a history line, and the row says so
  await p.selectOption('[data-ipas="b"]', 'dhcp');
  await storedBy(() => loadState(db), s => s.objs.find(o => o.id === 'b').dhcp === 'dhcp');
  const s = loadState(db);
  assert.ok((s.history.b || []).some(h => /IP assignment set to Dynamic \(DHCP\)/.test(h.msg)), 'no history line');
  assert.equal(await p.$eval('[data-ipas="b"]', el => el.value), 'dhcp');

  // the device page shows the field by its new name, also on a device where it is not set
  await p.click('table.grid.ips a[data-open="c"]');
  await p.waitForSelector('#f_c_dhcp');
  assert.match(await p.textContent('label[for="f_c_dhcp"]'), /IP assignment/);
  assert.deepEqual(await p.$$eval('#f_c_dhcp option', os => os.map(o => o.textContent)), ['Not known', 'Static', 'Dynamic (DHCP)']);
  assert.deepEqual(errors, [], 'page errors');
  console.log('ip list: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
