/* Finding and doing: the search at the top lists actions (New device, the views, handing out to a person found) and
   Settings sections; Find a setting in Settings opens a section; long notes in Settings show one line with More; a
   subnet deleted comes back with Undo. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy, openSetTab } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-find-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
saveState(db, { ...s0, sites: ['HQ'], locs: ['HQ / Office'], users: [...s0.users, { id: 'p1', login: 'anna', name: 'Anna Example', dept: 'Sales', role: 'none', groups: [], source: 'manual', active: true }],
  subnets: [{ name: 'Office', cidr: '10.1.1.0/24', gateway: '10.1.1.1', dns: [], types: [], ranges: [] }],
  objs: [{ id: 'a', code: 'INV-a', type: 'pc', name: 'PC-A', status: 'active', subnet: '10.1.1.0/24', ip: '10.1.1.5' }, { id: 'r', code: 'INV-r', type: 'pc', name: 'PC-OLD', status: 'retired' }], rels: [], history: {} });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length === 2);
  const hits = () => p.$$eval('#gsList li', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));

  // actions: a view by another word, New device, handing out to a person found
  await p.fill('#search', 'ip list'); await p.waitForSelector('#gsList li[data-i]');
  assert.ok((await hits()).some(t => t.startsWith('Go to IP addresses')), 'no action for the IP list: ' + (await hits()).join(' | '));
  await p.press('#search', 'Enter');
  await until(p, async () => (await import('/js/01-core.js')).st.tab === 'ips');
  await p.fill('#search', 'anna'); await p.waitForSelector('#gsList li[data-i]');
  assert.ok((await hits()).some(t => t.startsWith('Hand out a device to Anna Example')), 'no hand-out action for a person found');
  await p.fill('#search', 'new dev'); await p.waitForSelector('#gsList li[data-i]');
  await p.click('#gsList li[data-i]:has-text("New device")'); await p.waitForSelector('#nName');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);

  // a Settings section from the search at the top: opens its page and brings it into view
  await p.fill('#search', 'push token'); await p.waitForSelector('#gsList li[data-i]');
  assert.ok((await hits()).some(t => /^Push token\s*Settings → Data sources → Lansweeper/.test(t)), (await hits()).join(' | '));
  await p.click('#gsList li[data-i]:has-text("Push token")');
  await until(p, async () => (await import('/js/01-core.js')).st.setTab === 'feed');

  // Find a setting in the dialog: arrows and Enter
  await p.fill('#setFind', 'store'); await p.waitForSelector('#setFindList [data-sf]');
  assert.match(await p.textContent('#setFindList'), /Store rooms/);
  await p.press('#setFind', 'Enter');
  await until(p, async () => (await import('/js/01-core.js')).st.setTab === 'locations');
  /* store rooms are set on the sites and rooms, so that section is brought into view */
  await p.waitForSelector('#setPane .panelbox.set-flash:has(> .hdr:has-text("Sites and rooms"))');

  // a long note under a section's title: one line and More; More shows the rest
  await openSetTab(p, 'subnets'); await p.waitForSelector('#setSubnets');
  await openSetTab(p, 'backups'); await p.waitForSelector('.note.clamp .note-more');
  const n = p.locator('.note.clamp').first();
  const h1 = await n.evaluate(e => e.getBoundingClientRect().height);
  await n.locator('.note-more').click();
  assert.ok(await n.evaluate(e => e.classList.contains('open')), 'More did not open the note');
  assert.ok(await n.evaluate(e => e.getBoundingClientRect().height) > h1 + 10, 'the note did not show the rest');

  // a subnet deleted, then Undo: back, and the device on it too
  await openSetTab(p, 'subnets'); await p.waitForSelector('[data-sx="0"]');
  await p.click('[data-sx="0"]');
  await storedBy(() => loadState(db), s => !(s.subnets || []).length);
  assert.equal(loadState(db).objs[0].subnet, undefined);
  await p.click('#toast .t-undo');
  await storedBy(() => loadState(db), s => (s.subnets || []).length === 1 && s.objs[0].subnet === '10.1.1.0/24');
  await p.keyboard.press('Escape');
  // a retired device: no adders, Bring back to stock with Undo
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('r')); await p.waitForSelector('#bringBack');
  assert.equal(await p.locator('.obj.is-retired .addrel:visible, .obj.is-retired .xadd:visible').count(), 0, 'adders shown on a retired device');
  await p.click('#bringBack');
  await storedBy(() => loadState(db), s => s.objs.find(o => o.id === 'r').status === 'stock');
  assert.deepEqual(errors, [], 'page errors');
  console.log('find and actions: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
