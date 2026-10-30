/* Browser test of merging a second record into its device: a dock's DNS-named record merges from its page (its address
   becomes an adapter of the device, its monitor goes along, Undo puts it back); accepting a device the inventory has
   asks first and offers Merge; To review shows which other sources know a device and filters by AD or Entra. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-merge-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const day = new Date().toISOString().slice(0, 10);
const s0 = loadState(db);
saveState(db, { ...s0,
  objs: [
    { id: 'n35', code: 'INV-0001', type: 'notebook', name: 'NB-35', serial: 'MP2V76BR', ip: '10.1.2.107', status: 'active', feed: null },
    { id: 'd35', code: 'INV-0002', type: 'other', name: 'nb-35.corp.example', ip: '10.1.2.104', mac: '64:c9:01:e3:9c:d1', status: 'active', feed: null },
    { id: 'm1', code: 'INV-0003', type: 'monitor', name: 'MON-1', serial: 'M1', status: 'active', feed: null },
    { id: 'p7', code: 'INV-0004', type: 'pc', name: 'PC-7', serial: 'P7', status: 'active', feed: null },
    { id: 'r7', code: 'INV-0005', type: 'pc', name: 'PC-7', ip: '10.1.4.7', status: 'active', feed: null, inAd: true, review: { src: 'lansweeper', at: day + ' 08:00' } },
    { id: 'r8', code: 'INV-0006', type: 'pc', name: 'PC-8', status: 'active', feed: null, review: { src: 'lansweeper', at: day + ' 08:00' } },
  ],
  rels: [{ id: 'a1', from: 'm1', to: 'd35', kind: 'attached', port: null, vlan: null }], history: {} });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const stored = async (check, ms = 8000) => { const t0 = Date.now(); while (!check(loadState(db))) { if (Date.now() - t0 > ms) throw new Error('not saved in time'); await new Promise(r => setTimeout(r, 100)); } };
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);

  // the device itself says it has a probable second record, on its card and its page, and resolves it from there
  await p.click('#tabsbar [data-tab=cards]');
  assert.match(await p.textContent('#cards .card[data-open="n35"] .rv-twin'), /Also as nb-35\.corp\.example/);
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('n35'));
  await p.waitForSelector('#twResolve');
  assert.match(await p.textContent('.rv-banner'), /nb-35\.corp\.example is most likely a second record of this device/);
  await p.click('#twResolve'); await p.waitForSelector('.dup-cmp');
  assert.match(await p.textContent('.dup-cmp'), /nb-35\.corp\.example[\s\S]*NB-35/);
  await p.click('#dupCancel');
  // the dock's record merges from its page: address as an adapter of NB-35, the monitor with it, kept as ignored
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('d35'));
  await p.waitForSelector('#twMerge');
  assert.match(await p.textContent('#twMerge'), /Merge into NB-35/);
  await p.click('#twMerge');
  await until(p, async () => { const c = await import('/js/01-core.js'); return !c.objs.some(o => o.id === 'd35'); });
  const after = await p.evaluate(async () => { const c = await import('/js/01-core.js'); const n = c.byId('n35'), d = c.byId('d35');
    return [n.accessories, c.rels.find(r => r.id === 'a1').to, d.review.ignored ? 'ignored' : '', d.review.merged, d.excluded]; });
  assert.deepEqual(after, [[{ name: 'Docking station', kind: 'Dock', mac: '64:c9:01:e3:9c:d1', seenAs: 'nb-35.corp.example' }], 'n35', 'ignored', 'n35', true]);
  assert.match(await p.textContent('.rv-banner'), /Merged into NB-35/);
  // Undo puts all of it back
  await p.click('#toast .t-undo');
  await until(p, async () => { const c = await import('/js/01-core.js'); return c.objs.some(o => o.id === 'd35') && !c.byId('n35').accessories && c.rels.find(r => r.id === 'a1').to === 'd35'; });
  // the Duplicates list picks it, and Merge works from the pick too
  await p.click('#tabsbar [data-tab=cards]');
  await p.click('#dupList [data-twins]');
  // the card says what it probably is; its chip opens Resolve, with both side by side and what differs marked
  assert.match(await p.textContent('#cards .card[data-open="d35"] .rv-twin'), /Probably NB-35/);
  await p.click('#cards .card[data-open="d35"] .rv-twin');
  await p.waitForSelector('.dup-cmp');
  assert.equal(await p.locator('.dup-cmp tr.dup-diff').count() >= 2, true, 'name and address differ');
  assert.equal(await p.isChecked('[name=dupWay][value=dock]'), true, 'a DNS-named record is a dock by default');
  // Not a duplicate: off the list for good, and Check again on its page brings it back
  await p.check('[name=dupWay][value=notdup]'); await p.click('#dupOk');
  await p.waitForSelector('#cards .card[data-open="d35"]', { state: 'detached' });
  await stored(st => st.objs.find(o => o.id === 'd35').notTwin === true);
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('d35'));
  await p.waitForSelector('#twAgain'); await p.click('#twAgain');
  await stored(st => st.objs.find(o => o.id === 'd35').notTwin === undefined);
  await p.click('#tabsbar [data-tab=cards]');
  await p.waitForSelector('#cards .card[data-open="d35"]');
  // picked from the Duplicates list: Resolve, as a dock
  await p.click('#cards .card[data-open="d35"] .cardtick');
  await p.click('#rvResolve'); await p.click('#dupOk');
  await stored(st => { const d = st.objs.find(o => o.id === 'd35'); return d.review && d.review.merged === 'n35' && d.excluded && (st.objs.find(o => o.id === 'n35').accessories || []).length === 1 && st.rels.find(r => r.id === 'a1').to === 'n35'; });
  await p.click('#fbar [data-fx=twins]');
  // the device lists what was merged into it, and Unmerge takes it out again: back in To review, the adapter gone
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('n35'));
  await p.waitForSelector('.nics.merged');
  assert.match(await p.textContent('.nics.merged'), /nb-35\.corp\.example[\s\S]*10\.1\.2\.104/);
  await p.click('[data-unmerge="d35"]');
  await stored(st => { const d = st.objs.find(o => o.id === 'd35'); return d.review && !d.review.merged && !d.review.ignored && !d.excluded && !st.objs.find(o => o.id === 'n35').accessories; });
  await p.click('#toast .t-undo');
  await stored(st => st.objs.find(o => o.id === 'd35').review.merged === 'n35' && (st.objs.find(o => o.id === 'n35').accessories || []).length === 1);
  await p.click('#tabsbar [data-tab=cards]');

  // the dock shows among the device's attachments, with its MAC address
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('n35'));
  await p.waitForSelector('.entries-box');
  assert.match(await p.textContent('.ctlrow.entries'), /Docking station[\s\S]*Dock[\s\S]*64:c9:01:e3:9c:d1/);
  // the merged record says which attachment it is kept as, with Open and Unmerge as buttons
  assert.match(await p.textContent('.nics.merged'), /nb-35\.corp\.example\s*Docking station/);
  assert.equal(await p.locator('.nics.merged button.mini').count(), 2);
  // removing the attachment takes the record out of Merged records: still ignored, so no sync brings it back; Undo both
  await p.click('.entries-box [data-delacc="0"]');
  await stored(st => { const d = st.objs.find(o => o.id === 'd35'); return !d.review.merged && d.review.ignored && d.excluded && !st.objs.find(o => o.id === 'n35').accessories; });
  assert.equal(await p.locator('.nics.merged').count(), 0);
  await p.click('#toast .t-undo');
  await stored(st => st.objs.find(o => o.id === 'd35').review.merged === 'n35' && (st.objs.find(o => o.id === 'n35').accessories || []).length === 1);
  await p.waitForSelector('.nics.merged');
  // a shared dock at a desk: kept as a device of its own, not flagged again
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.objs.push({ id: 'd98', code: 'INV-0098', type: 'notebook', name: 'nb-35.desk.example', mac: '00:11:22:33:44:55', status: 'active', feed: null }); (await import('/js/07-render.js')).render(); });
  await p.evaluate(async () => (await import('/js/15-review.js')).resolveModal([(await import('/js/01-core.js')).byId('d98')]));
  await p.check('[name=dupWay][value=desk]'); assert.equal((await p.textContent('#dupOk')).trim(), 'Keep as dock');
  await p.click('#dupOk');
  await stored(st => { const d = st.objs.find(o => o.id === 'd98'); return d && d.notTwin === true && d.type === 'other' && d.purpose === 'Docking station'; });
  // Obsolete: a second record retired and excluded
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.objs.push({ id: 'd99', code: 'INV-0099', type: 'other', name: 'pc-7.corp.example', status: 'active', feed: null }); (await import('/js/07-render.js')).render(); });
  await p.evaluate(async () => (await import('/js/15-review.js')).resolveModal([(await import('/js/01-core.js')).byId('d99')]));
  await p.check('[name=dupWay][value=obsolete]'); await p.click('#dupOk');
  await stored(st => { const d = st.objs.find(o => o.id === 'd99'); return d && d.status === 'retired' && d.excluded === true; });

  // To review: the other sources that know a device, and the filter by AD or Entra
  await p.click('#tabsbar [data-tab=review]');
  await p.waitForSelector('#cards .card[data-open="r7"]');
  assert.match(await p.textContent('#cards .card[data-open="r7"]'), /also AD/);
  await p.click('#scopeList [data-rvknown]');
  await until(p, () => document.querySelectorAll('#cards .card').length === 1);
  await p.click('#fbar [data-fx=rvKnown]');
  await until(p, () => document.querySelectorAll('#cards .card').length === 2);

  // accepting PC-7, which the inventory has, asks first: Accept anyway makes a second one (undone), Merge folds it in
  await p.click('#cards .card[data-open="r7"] .cardtick');
  await p.click('#rvAccept');
  await p.waitForSelector('#cfMerge');
  assert.match(await p.textContent('#mdl'), /PC-7.*→.*PC-7/s);
  await p.click('#cfOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.filter(o => o.name === 'PC-7').length === 2);
  await p.click('#toast .t-undo');
  await until(p, async () => (await import('/js/01-core.js')).objs.filter(o => o.name === 'PC-7').length === 1);
  await p.click('#cards .card[data-open="r7"] .cardtick');
  await p.click('#rvAccept'); await p.click('#cfMerge');
  await stored(st => { const r = st.objs.find(o => o.id === 'r7'); return r.review.merged === 'p7' && (st.objs.find(o => o.id === 'p7').nics || []).some(n => n.ip === '10.1.4.7'); });
  assert.equal(await p.locator('#cards .card').count(), 1, 'PC-8 still waits');

  assert.deepEqual(errors, []);
  console.log('merge: all checks passed');
} finally { await browser.close(); server.close(); }
