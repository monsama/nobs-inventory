/* Browser test of round 166: a host says how many VMs run on it (List, Table), a VM on a retired host is a data quality
   item, the places from AD that are no room yet are made rooms from the list (Settings opens with them ticked), and the
   dialogs: Your account resets their kept sizes and places, the resize corner takes the arrow keys. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r166-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, more) => ({ id, code: 'INV-' + id, type: 'server', name: 'SRV-' + id, status: 'active', loc: 'Main / Office', ovr: {}, ...more });
const hosted = (id, from, to) => ({ id, from, to, kind: 'hosted', port: null, vlan: null });
saveState(db, { ...loadState(db), sites: ['Main'], locs: ['Main / Office'], objs: [
  dev('h1', { kind: 'physical', name: 'HV-01', os: 'Windows Server 2022' }), dev('h2', { kind: 'physical', name: 'HV-02', status: 'retired' }),
  dev('v1', { kind: 'vm' }), dev('v2', { kind: 'vm' }), dev('v3', { kind: 'vm' }), dev('v4', { kind: 'vm', status: 'retired' }),
  dev('n1', { type: 'notebook', name: 'NB-1', loc: '', inAd: true, ad: { location: 'Annex Hall' } }),
  dev('n2', { type: 'notebook', name: 'NB-2', loc: '', inAd: true, ad: { location: 'Bern 2. OG' } }),
], rels: [hosted('r1', 'v1', 'h1'), hosted('r2', 'v2', 'h1'), hosted('r3', 'v3', 'h2'), hosted('r4', 'v4', 'h1')], history: {} });

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
  const view = async (set) => p.evaluate(async set => { const c = await import('/js/01-core.js'); Object.assign(c.st, set); (await import('/js/07-render.js')).view(); }, set);

  // a host says how many VMs run on it (a retired VM does not count); a VM does not
  assert.equal((await p.textContent('#cards .lrow[data-open="h1"] .c-det')).trim(), 'Windows Server 2022 · 2 VMs');
  assert.match(await p.getAttribute('#cards .lrow[data-open="h1"] .c-det', 'title'), /2 virtual machines run on it/);
  assert.doesNotMatch(await p.textContent('#cards .lrow[data-open="v1"] .c-det'), /VM/);

  // a VM on a retired host: one data quality item
  await view({ tab: 'overview' });
  await p.waitForSelector('[data-ovq="hostgone"]');
  assert.match(await p.textContent('[data-ovq="hostgone"]'), /^1/);

  // places from AD that are no room yet: the bar over the list opens Settings with them ticked
  await view({ tab: 'cards', quality: 'locnew' });
  await p.waitForSelector('[data-locrooms]');
  assert.match(await p.textContent('#fbar .fb-qfix'), /2 places from AD not a room yet.*Annex Hall, Bern 2\. OG/);
  await p.click('[data-locrooms]');
  await p.waitForSelector('#adBulkGo');
  assert.equal((await p.textContent('#adBulkGo')).trim(), 'Create 2 rooms');
  assert.equal(await p.locator('#adLocs [data-adpick]:checked').count(), 2);
  await p.click('#adBulkGo');
  await until(p, async () => { const c = await import('/js/01-core.js'); return c.LOCS.includes('Main / Annex Hall') && c.LOCS.includes('Main / Bern 2. OG'); });
  await p.keyboard.press('Escape');
  await until(p, () => !document.querySelector('#mdl[open]'));

  // dialogs: the resize corner takes the arrow keys; Your account forgets the kept sizes and places
  await view({ quality: '' });
  await p.evaluate(async () => (await import('/js/signin.js')).accountModal()); await p.waitForSelector('#mdl #acPlaces');
  assert.equal(await p.isDisabled('#acPlaces'), true, 'nothing kept yet');
  const w0 = await p.evaluate(() => document.querySelector('#mdl .box').getBoundingClientRect().width);
  await p.focus('#mdl .dlg-grip'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
  assert.equal(await p.evaluate(() => Math.round(document.querySelector('#mdl .box').getBoundingClientRect().width)), Math.round(w0) + 40);
  await p.keyboard.press('Escape'); await until(p, () => !document.querySelector('#mdl[open]'));
  await p.evaluate(async () => (await import('/js/signin.js')).accountModal()); await p.waitForSelector('#mdl #acPlaces');
  assert.equal(Math.round(await p.evaluate(() => document.querySelector('#mdl .box').getBoundingClientRect().width)), Math.round(w0) + 40, 'opens as large as it was left');
  assert.match(await p.textContent('#acPlacesNote'), /1 dialog opens where and as large as you left it/);
  await p.click('#acPlaces');
  assert.equal(await p.isDisabled('#acPlaces'), true);
  assert.equal(await p.evaluate(() => localStorage.getItem('ni-dlg-pos')), null);
  assert.match(await p.textContent('#acPlacesNote'), /Every dialog opens in the middle/);

  assert.deepEqual(errors, []);
  console.log('round 166: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
