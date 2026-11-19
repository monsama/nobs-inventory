/* Browser test of picking several contracts or contacts at once (delete with one Undo, move contacts to a company with
   one Undo), of the push sizes under Gone devices (a short day marked), and of the one Overview row for devices that may
   no longer be there. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-bulk-lists-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const stored = check => storedBy(() => loadState(db), check);
const old = new Date(Date.now() - 200 * 864e5).toISOString();
const dev = (id, name, more = {}) => ({ id, code: 'INV-' + id, type: 'pc', name, status: 'active', loc: '', ovr: {}, feed: null, added: '2026-01-01T08:00:00.000Z', ...more });
saveState(db, { ...s0,
  lsPresence: { day: '2026-11-19', n: 3, since: '2026-11-01', full: { day: '2026-11-18', n: 3 }, short: { day: '2026-11-17', n: 1, of: 3 },
    days: [{ day: '2026-11-18', n: 3 }, { day: '2026-11-17', n: 1 }, { day: '2026-11-16', n: 3 }] },
  objs: [
    dev('a', 'PC-ANNA', { respIn: 'k2', feed: { sys: 'Lansweeper', ref: 'r1', inPush: '2026-11-19', scanned: '2026-11-18' } }),
    dev('b', 'PC-OLD', { inAd: true, ad: { logon: old } }),
  ],
  contracts: [
    { id: 'c1', name: 'Support Firewall', kind: 'support', supplier: 'Netz AG', cost: 900, per: 'year', devices: [] },
    { id: 'c2', name: 'Lease Notebooks', kind: 'lease', supplier: 'Leasing GmbH', cost: 50, per: 'month', devices: ['a'] },
    { id: 'c3', name: 'Printer service', kind: 'support', supplier: 'Print AG', cost: 100, per: 'year', devices: [] },
  ],
  contacts: [
    { id: 'k1', kind: 'external', name: 'Petra Netz', company: 'Netz AG' },
    { id: 'k2', kind: 'internal', name: 'Jörg Intern' },
    { id: 'k3', kind: 'internal', name: 'Lea Helper' },
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
  await p.waitForSelector('#cards .lrow');
  const go = tab => p.evaluate(async t => { const c = await import('/js/01-core.js'); c.st.tab = t; c.st.q = ''; (await import('/js/07-render.js')).render(); }, tab);

  // Contracts: two picked, one bar, deleted together; one Undo brings both back in their place
  await go('contracts'); await p.waitForSelector('table.contracts [data-ctsel="c1"]');
  assert.equal(await p.$('.selbar'), null, 'no bar before anything is picked');
  await p.check('[data-ctsel="c1"]'); await p.check('[data-ctsel="c3"]');
  await until(p, () => /2 selected/.test(document.querySelector('.selbar')?.textContent || ''));
  await p.click('[data-ctbulk="del"]'); await p.waitForSelector('#cfOk');
  await p.click('#cfOk');
  await stored(st => st.contracts.length === 1 && st.contracts[0].id === 'c2');
  await p.click('#toast .t-undo');
  await stored(st => st.contracts.map(c => c.id).join() === 'c1,c2,c3');

  // Contacts: two moved to a company (they become its external contacts), one Undo puts them back
  await go('contacts'); await p.waitForSelector('[data-cnsel="k2"]');
  await p.check('[data-cnsel="k2"]'); await p.check('[data-cnsel="k3"]');
  await until(p, () => /2 selected/.test(document.querySelector('.selbar')?.textContent || ''));
  await p.click('[data-cnbulk="move"]'); await p.waitForSelector('#mvCo');
  await p.click('[data-mvco="Netz AG"]');
  assert.equal(await p.inputValue('#mvCo'), 'Netz AG');
  await p.click('#mvOk');
  await stored(st => ['k2', 'k3'].every(id => { const c = st.contacts.find(x => x.id === id); return c.kind === 'external' && c.company === 'Netz AG'; }));
  await p.click('#toast .t-undo');
  await stored(st => ['k2', 'k3'].every(id => { const c = st.contacts.find(x => x.id === id); return c.kind === 'internal' && !c.company; }));

  // ...and deleted: the device they were responsible for loses them, Undo gives it back
  await p.check('[data-cnsel="k2"]'); await p.check('[data-cnsel="k3"]');
  await p.click('[data-cnbulk="del"]'); await p.waitForSelector('#cfOk');
  assert.match(await p.textContent('.modal .mb'), /1 device loses its responsible/);
  await p.click('#cfOk');
  await stored(st => st.contacts.length === 1 && !st.objs.find(o => o.id === 'a').respIn);
  await p.click('#toast .t-undo');
  await stored(st => st.contacts.length === 3 && st.objs.find(o => o.id === 'a').respIn === 'k2');

  // Data sources: the push sizes of the last days, the short one marked
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.SYNC.lansweeper = { at: new Date().toISOString(), ok: true }; c.st.setTab = 'sources'; (await import('/js/04-settings.js')).openSettings(); });
  await p.waitForSelector('.ds-pushsizes .ds-bar');
  assert.equal(await p.$$eval('.ds-pushsizes .ds-bar', b => b.length), 3);
  assert.equal(await p.$$eval('.ds-pushsizes .ds-bar.short', b => b.length), 1);
  await p.evaluate(async () => (await import('/js/19-modal.js')).closeModal());

  // Overview: one row for the device not seen for 90 days, leading to it
  await go('overview'); await p.waitForSelector('[data-ovmissing]');
  assert.match(await p.textContent('[data-ovmissing]'), /1\s*Where are they\?\s*1 not seen for 90 days/);
  await p.click('[data-ovmissing]');
  await until(p, () => document.querySelectorAll('tr[data-open]').length === 1 && !!document.querySelector('tr[data-open="b"]'));

  assert.deepEqual(errors, [], 'page errors');
  console.log('bulk lists, push sizes and the Overview row: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
