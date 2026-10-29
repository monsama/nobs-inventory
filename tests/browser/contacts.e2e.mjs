/* Browser test of contacts: the Contacts tab groups internal people and each IT partner, a contact's devices open in the
   table, a device page sets its internal and external responsible, the table sets them for many devices at once, and
   deleting a contact takes it off its devices. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-contacts-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
saveState(db, { ...s0,
  company: { name: 'Example AG' },
  contacts: [
    { id: 'k1', kind: 'internal', name: 'Viktor Hug', role: 'IT lead', email: 'viktor@example.ch', phone: '+41 41 000 00 01' },
    { id: 'k2', kind: 'external', name: 'Sara Netz', company: 'Muster IT AG', role: 'Network', email: 'sara@muster-it.ch', mobile: '+41 79 000 00 02' },
    { id: 'k3', kind: 'external', name: 'Service desk', company: 'Muster IT AG', phone: '+41 41 000 00 03', note: 'Mo–Fr 7–18' },
  ],
  objs: [
    { id: 'o1', code: 'INV-0001', type: 'switch', name: 'SW-CORE', status: 'active', ports: 24, ovr: {}, feed: null, respIn: 'k1', respEx: 'k2' },
    { id: 'o2', code: 'INV-0002', type: 'pc', name: 'PC-1', status: 'active', ovr: {}, feed: null },
    { id: 'o3', code: 'INV-0003', type: 'pc', name: 'PC-2', status: 'active', ovr: {}, feed: null },
  ], rels: [], history: {} });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none in previews */ } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const shots = process.env.NI_SHOTS;
/* Waits until the server has what the page saved. */
const stored = async (check, ms = 8000) => { const t0 = Date.now(); while (!check(loadState(db))) { if (Date.now() - t0 > ms) throw new Error('not saved in time'); await new Promise(r => setTimeout(r, 100)); } };
try {
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForSelector('.card');

  // the tab: internal first, then the partner with its two people
  await page.click('[data-tab=contacts]'); await page.waitForSelector('.cn-card');
  assert.deepEqual(await page.locator('.cn-group > .hdr').evaluateAll(h => h.map(x => x.firstChild.textContent.trim())), ['Internal · Example AG', 'Muster IT AG']);
  assert.equal(await page.getAttribute('.cn-card:has-text("Sara Netz") a[href^="tel:"]', 'href'), 'tel:+41790000002');
  if (shots) await page.locator('#view').screenshot({ path: path.join(shots, 'contacts.png') });
  // a contact's devices open in the table, with the filter in the sidebar
  await page.click('.cn-card:has-text("Viktor Hug") [data-cndevs]');
  await page.waitForSelector('table.grid');
  assert.deepEqual(await page.locator('table.grid tbody tr .rowopen').allTextContents(), ['SW-CORE']);
  assert.match(await page.textContent('#respList'), /Viktor Hug/);
  await page.click('#respList [data-resp]');
  assert.equal(await page.locator('table.grid tbody tr').count(), 3, 'the filter is gone');

  // the device page sets the responsible
  await page.evaluate(async () => (await import('/js/02-views.js')).openObj('o2'));
  await page.waitForSelector('[data-resp=external]');
  await page.selectOption('[data-resp=external]', 'k3');
  await stored(st => st.objs.find(o => o.id === 'o2').respEx === 'k3');
  assert.equal(loadState(db).objs.find(o => o.id === 'o2').respEx, 'k3');
  assert.match(loadState(db).history.o2[0].msg, /External responsible set to Service desk/);
  assert.match(await page.textContent('.resp'), /\+41 41 000 00 03/);
  if (shots) await page.locator('.panelbox:has(.resp)').screenshot({ path: path.join(shots, 'device-resp.png') });

  // many at once from the table
  await page.click('[data-tab=table]'); await page.waitForSelector('table.grid');
  await page.check('[data-sel=o2]'); await page.check('[data-sel=o3]');
  await page.selectOption('#bkResp', 'internal:k1');
  await stored(st => st.objs.every(o => o.respIn === 'k1'));
  assert.deepEqual(loadState(db).objs.map(o => o.respIn || ''), ['k1', 'k1', 'k1']);

  // deleting a contact takes it off its devices
  await page.click('[data-tab=contacts]'); await page.waitForSelector('.cn-card');
  await page.click('.cn-card:has-text("Service desk") [data-cnedit]');
  await page.click('#cnDel');
  // asked in the app's own dialog first, which names the devices that lose it
  await page.waitForSelector('#cfOk');
  assert.match(await page.textContent('#mdl'), /Delete the contact Service desk\?[\s\S]*loses? this responsible/);
  await page.click('#cfOk');
  await stored(st => st.contacts.length === 2);
  const st = loadState(db);
  assert.equal(st.contacts.length, 2);
  assert.equal(st.objs.find(o => o.id === 'o2').respEx, undefined);

  // a new contact, checked before it is saved
  await page.click('#cnNew');
  await page.check('[name=cnKindPick][value=external]');
  await page.fill('#cn_name', 'Max Print'); await page.fill('#cn_company', 'Print AG'); await page.fill('#cn_email', 'not-an-address');
  await page.click('#cnOk');
  assert.match(await page.textContent('#cnErr'), /not an e-mail address/);
  await page.fill('#cn_email', 'max@print.ch'); await page.click('#cnOk');
  await stored(st => st.contacts.some(c => c.name === 'Max Print'));
  assert.ok(loadState(db).contacts.some(c => c.name === 'Max Print' && c.company === 'Print AG' && c.kind === 'external'));

  assert.deepEqual(errors, []);
  console.log('contacts: all checks passed');
} finally { await browser.close(); server.close(); }
