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
    dev('a', 'PC-ANNA', { respIn: 'k2', feed: { sys: 'Lansweeper', ref: 'r1', inPush: '2026-11-19', scanned: '2026-11-18' }, software: [{ name: 'Office Suite', version: '16.0' }, { name: '7-Zip', version: '24.08' }] }),
    dev('b', 'PC-OLD', { inAd: true, ad: { logon: old } }),
    dev('g', 'PC-GONE', { adGone: '2026-11-01' }),
  ],
  licences: [
    { id: 'l1', name: 'Office Suite', seats: 5, cost: 100, per: 'year' },
    { id: 'l2', name: '7-Zip', seats: 1, per: 'year' },
    { id: 'l3', name: 'Viewer', seats: 2, per: 'year' },
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
  // no software with the list: the licence counts come from the server; a device's software when its page opens
  await until(p, async () => !!(await import('/js/07-render.js')).SW.licUse);
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).objs.some(o => Object.hasOwn(o, 'software'))), false, 'not every device\'s software at sign-in');
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('a'));
  await until(p, () => /Office Suite/.test(document.querySelector('#view').textContent));
  assert.equal(await p.evaluate(async () => (await import('/js/07-render.js')).pendingChanges().puts.length), 0, 'reading the software is no change');
  // an Undo of a change made before the software was read keeps it
  assert.equal(await p.evaluate(async () => { const c = await import('/js/01-core.js'), o = c.byId('a'); const was = JSON.parse(JSON.stringify(o)); delete was.software;
    c.restoreSnapshot([[o, was]], 'test'); return (o.software || []).length; }), 2);
  // a change since, sent without software, has none in the page's copy; the others are given what the page knows
  assert.deepEqual(await p.evaluate(async () => { const r = await import('/js/07-render.js'), c = await import('/js/01-core.js');
    const copy = r.SERVER.copy; if (!copy || !copy.swLean) return 'no lean copy';
    const o = { ...copy.objs.find(x => x.id === 'b') }; return [!('software' in o), c.byId('a').software.length]; }), [true, 2]);
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

  // ...changed together: a new supplier on both, the rest as it was; Undo puts back each one's own
  await p.check('[data-ctsel="c1"]'); await p.check('[data-ctsel="c3"]');
  await p.click('[data-ctbulk="edit"]'); await p.waitForSelector('#bkSup');
  await p.click('#bkOk'); assert.match(await p.textContent('#bkErr'), /Nothing filled in/);
  await p.fill('#bkSup', 'Service AG'); await p.click('#bkOk');
  await stored(st => st.contracts.filter(c => c.supplier === 'Service AG').map(c => c.id).join() === 'c1,c3' && st.contracts.find(c => c.id === 'c1').cost === 900);
  await p.click('#toast .t-undo');
  await stored(st => st.contracts.find(c => c.id === 'c1').supplier === 'Netz AG' && st.contracts.find(c => c.id === 'c3').supplier === 'Print AG');

  // Software: licences picked and deleted together, one Undo; the counts come from the software read after the list
  await go('sw'); await p.waitForSelector('[data-licsel="l1"]');
  assert.match(await p.textContent('.lic-table'), /1 used \/ 5 seats/);
  await p.check('[data-licsel="l2"]'); await p.check('[data-licsel="l3"]');
  await p.click('[data-licbulk="del"]'); await p.waitForSelector('#cfOk'); await p.click('#cfOk');
  await stored(st => st.licences.map(l => l.id).join() === 'l1');
  await p.click('#toast .t-undo');
  await stored(st => st.licences.map(l => l.id).join() === 'l1,l2,l3');
  // a device's own software, and a save of the device keeps it
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('a'));
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.byId('a').note = 'checked'; (await import('/js/07-render.js')).queueServerSave(); });
  await stored(st => { const o = st.objs.find(x => x.id === 'a'); return o.note === 'checked' && o.software.length === 2; });

  // Contacts: two moved to a company (they become its external contacts), one Undo puts them back
  await go('contacts'); await p.waitForSelector('[data-cnsel="k2"]');
  await p.check('[data-cnsel="k2"]'); await p.check('[data-cnsel="k3"]');
  await until(p, () => /2 selected/.test(document.querySelector('.selbar')?.textContent || ''));
  await p.click('[data-cnbulk="move"]'); await p.waitForSelector('#mvCo');
  await p.click('[data-mvco="Netz AG"]');
  assert.equal(await p.inputValue('#mvCo'), 'Netz AG');
  await p.click('#mvOk');
  // moved out, Jörg is no longer PC-ANNA's internal responsible
  await stored(st => ['k2', 'k3'].every(id => { const c = st.contacts.find(x => x.id === id); return c.kind === 'external' && c.company === 'Netz AG'; }) && !st.objs.find(o => o.id === 'a').respIn);
  await p.click('#toast .t-undo');
  await stored(st => ['k2', 'k3'].every(id => { const c = st.contacts.find(x => x.id === id); return c.kind === 'internal' && !c.company; }) && st.objs.find(o => o.id === 'a').respIn === 'k2');

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
  // the limits of Where are they?: not seen after a year, so PC-OLD (200 days) no longer counts; back to 90 days
  await p.selectOption('#wdUnseen', '365');
  await stored(st => st.whereDays && st.whereDays.unseen === 365);
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).whereOf((await import('/js/01-core.js')).objs.filter(o => o.status !== 'retired')).ids.join()), 'g');
  await p.selectOption('#wdUnseen', '90');
  await stored(st => !st.whereDays || !st.whereDays.unseen);
  await p.evaluate(async () => (await import('/js/19-modal.js')).closeModal());
  // the sidebar has it too
  await go('cards'); await p.evaluate(() => { document.querySelector('#moreFilters').open = true; }); await p.click('#seenList [data-where]');
  await until(p, () => document.querySelectorAll('#cards .lrow').length === 2 && !!document.querySelector('#fbar [data-goneretire]'));
  await p.click('#seenList [data-where]');

  // Overview: one row for the devices that may be missing, leading to them
  await go('overview'); await p.waitForSelector('[data-ovmissing]');
  assert.match(await p.textContent('[data-ovmissing]'), /2\s*Where are they\?\s*1 gone from every source · 1 not seen for 90 days/);
  await p.click('[data-ovmissing]');
  await until(p, () => document.querySelectorAll('tr[data-open]').length === 2 && !!document.querySelector('tr[data-open="b"]') && !!document.querySelector('tr[data-open="g"]'));
  // Retire from there: the one gone from every source is ticked, the one only not seen is left to confirm
  await p.click('#fbar [data-goneretire]'); await p.waitForSelector('[data-grid="g"]');
  assert.equal(await p.isChecked('[data-grid="g"]'), true); assert.equal(await p.isChecked('[data-grid="b"]'), false);
  assert.equal(await p.textContent('#grOk'), 'Retire 1');
  await p.click('#grOk');
  await stored(st => st.objs.find(o => o.id === 'g').status === 'retired' && st.objs.find(o => o.id === 'b').status === 'active');

  // the weekly e-mail's preview, also without a mail server: the mail as it would go out, with Where are they?
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.setTab = 'mail'; (await import('/js/04-settings.js')).openSettings(); });
  await p.waitForSelector('#dgPreview'); await p.click('#dgPreview');
  await p.waitForSelector('iframe.dg-frame');
  const mail = await p.$eval('iframe.dg-frame', f => f.contentDocument.body.textContent);
  assert.match(mail, /Where are they\?/); assert.match(mail, /PC-OLD/);
  assert.doesNotMatch(await p.getAttribute('iframe.dg-frame', 'sandbox'), /allow-scripts/, 'the mail runs nothing (no scripts allowed)');
  assert.equal(await p.$eval('iframe.dg-frame', f => f.contentDocument.querySelector('base').target), '_blank', 'its link opens a tab of its own');
  await p.evaluate(async () => (await import('/js/19-modal.js')).closeModal());
  await p.evaluate(async () => (await import('/js/19-modal.js')).closeModal());

  // Filters: Hide folds them into the strip at the left, a click on it opens them again (side-resize.e2e.mjs: dragging)
  await go('cards'); await p.waitForSelector('#sideGrip .side-fold');
  await p.hover('#side'); await p.click('#sideGrip .side-fold'); await until(p, () => document.body.classList.contains('side-shut'));
  await p.click('#sideRail'); await until(p, () => !document.body.classList.contains('side-shut'));

  assert.deepEqual(errors, [], 'page errors');
  console.log('bulk lists, licences, lazy software, push sizes and Where are they?: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
