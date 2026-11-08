/* Browser test of fixes from the November sweep: Enter signs in; Retired in the Status field goes through the Retire dialog; picking the value in use on a number field (a switch's ports) keeps
   it a number, so later saves still go through; "Back to automatic" follows the order set in Settings → Data sources;
   New device asks before what was typed is dropped and says when another device has the serial number;
   Last seen filters the list (never seen); Export CSV gives the columns shown, named after the filter, or all fields;
   Settings → Users says a short password under the row as it is typed, and a person without a login has No sign-in;
   a save of more changes than the server takes at once is sent in batches. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { openSetTab, storedBy, until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-sweep-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s = loadState(db);
s.objs = [
  { id: 'w1', code: 'INV-0001', type: 'switch', name: 'SW-1', status: 'active', ports: 24, serial: 'SN-77', feed: null },
  { id: 'r1', code: 'INV-0003', type: 'pc', name: 'PC-OLD', status: 'active', feed: null },
  { id: 'k1', code: 'INV-0009', type: 'rack', name: 'RACK-A', status: 'active', serial: 'RK-SN-9931', feed: null },
  { id: 'v1', code: 'INV-0002', type: 'pc', name: 'PC-V', status: 'active', feed: null, os: 'Windows 11 Enterprise', src: { os: 'graph' },
    vals: { os: { graph: ['Windows 11 Enterprise', '2026-11-06T08:00:00Z'], ad: ['Windows 11 Pro', '2026-11-05'] } }, pick: { os: 'graph' }, graph: { id: 'g1', managed: 'Intune', lastCheckIn: '2026-11-06T08:00:00Z' }, ad: { logon: '2026-11-05' } }];
s.fieldOrder = { os: ['ad', 'graph'] };
s.savedViews = [{ id: 'sv1', name: 'Racks only', filters: { type: 'rack' } }];
saveState(db, s);
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const obj = id => loadState(db).objs.find(o => o.id === id);
const mark = (p, id) => p.locator(`#${id} >> xpath=ancestor::div[contains(@class,"ctlrow")]//span[contains(@class,"fsrc")]`).first();
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); localStorage.setItem('ni-all-fields', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  // Enter in the password field signs in, as the button does
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.press('#lgPw', 'Enter');
  await until(p, async () => !!(await import('/js/01-core.js')).st.meId);

  // a number field: the value in use picked stays a number, and the next edit is saved
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('w1'));
  await p.waitForSelector('#f_w1_ports');
  await mark(p, 'f_w1_ports').click(); await p.waitForSelector('#fsrcPop [data-pick=hand]');
  await p.click('#fsrcPop [data-pick=hand]');
  await storedBy(() => obj('w1'), o => o.pick && o.pick.ports === 'hand');
  assert.equal(typeof obj('w1').ports, 'number', 'the ports became text');
  await p.fill('#f_w1_name', 'SW-1A'); await p.keyboard.press('Tab');
  await storedBy(() => obj('w1'), o => o.name === 'SW-1A');
  // Tab after the edit keeps the keyboard's place: the focus is not dropped to the page when the field is saved
  await p.waitForTimeout(200);
  assert.notEqual(await p.evaluate(() => document.activeElement && document.activeElement.tagName), 'BODY', 'the focus fell to the page after saving a field');
  // the toast says what changed, with Undo, and Undo puts the old name back
  assert.match(await p.textContent('#toast'), /Saved SW-1A · Name: SW-1 → SW-1A/);
  await p.click('#toast .t-undo');
  await storedBy(() => obj('w1'), o => o.name === 'SW-1' && typeof o.ports === 'number');

  // automatic follows the order set for the field: AD first, so AD's value
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('v1'));
  await p.waitForSelector('#f_v1_os');
  await mark(p, 'f_v1_os').click(); await p.waitForSelector('#fsrcPop.pick');
  await p.click('#fsrcPop .sp-foot [data-pick=""]');
  await storedBy(() => obj('v1'), o => !(o.pick && o.pick.os) && o.os === 'Windows 11 Pro' && o.src.os === 'ad');
  // and the picker names that order
  await until(p, () => !document.querySelector('#f_v1_os').closest('.ctlrow').querySelector('.fsrc-lock'));
  await mark(p, 'f_v1_os').click(); await p.waitForSelector('#fsrcPop.pick');
  assert.match(await p.textContent('#fsrcPop .sp-foot'), /Active Directory, then Entra & Intune/, 'the picker does not tell the order set');

  // In stock picked for a device someone has: one message says both, and its Undo puts the person and the status back
  const meId = await p.evaluate(async () => { const c = await import('/js/01-core.js'); const o = c.byId('v1'); o.uid = c.st.meId; o.status = 'active'; (await import('/js/04-settings.js')).bindUser(o); (await import('/js/07-render.js')).queueServerSave(); return c.st.meId; });
  await storedBy(() => obj('v1'), o => o.uid === meId);
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('v1'));
  await p.waitForSelector('#f_v1_status'); await p.selectOption('#f_v1_status', 'stock');
  await until(p, () => /Saved PC-V · Status: In use → In stock\. In stock: .+ no longer has it/.test(document.querySelector('#toast').textContent));
  await storedBy(() => obj('v1'), o => o.status === 'stock' && !o.uid);
  await p.click('#toast .t-undo');
  await storedBy(() => obj('v1'), o => o.status === 'active' && o.uid === meId);
  // a day that is not one is said under its field, and goes when it is right
  await p.fill('#view [data-k=warranty]', '2027-13-45'); await p.press('#view [data-k=warranty]', 'Tab');
  await p.waitForSelector('#view .df-err:has-text("is not a day")');
  await p.fill('#view [data-k=warranty]', '31.12.2027'); await p.press('#view [data-k=warranty]', 'Tab');
  await until(p, () => !document.querySelector('#view .df-err'));
  await storedBy(() => obj('v1'), o => o.warranty === '2027-12-31');
  // Retired picked in the Status field opens the Retire dialog; the field keeps the status until then
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('r1'));
  await p.waitForSelector('#f_r1_status');
  await p.selectOption('#f_r1_status', 'retired');
  await p.waitForSelector('#rtOk');
  assert.equal(await p.inputValue('#f_r1_status'), 'active', 'the field took Retired before the dialog');
  assert.equal(obj('r1').status, 'active', 'retired without the dialog');
  await p.click('#rtOk');
  await storedBy(() => obj('r1'), o => o.status === 'retired');
  await until(p, () => /Retired/.test(document.querySelector('#toolbar').textContent));
  // New device: closed with a name typed, it says so first and stays; closed again, it goes
  await p.keyboard.press('Escape'); await p.keyboard.press('n'); await p.waitForSelector('#nName');
  await p.fill('#nName', 'PC-NEW'); await p.keyboard.press('Escape');
  await p.waitForSelector('#mdl .leave-warn');
  assert.equal(await p.inputValue('#nName'), 'PC-NEW', 'the typed name was dropped');
  await p.click('#nCancel'); await until(p, () => !document.querySelector('#mdl'));
  // a serial number another device has: said once, Create again adds it
  await p.keyboard.press('n'); await p.waitForSelector('#nName');
  await p.fill('#nName', 'PC-TWIN'); await p.click('#nMore summary'); await p.fill('#nSerial', 'sn-77 '); await p.click('#nOk');
  await p.waitForSelector('#nSerialNote');
  assert.match(await p.textContent('#nSerialNote'), /INV-0001 SW-1 has this serial number/);
  await p.click('#nOk');
  await storedBy(() => loadState(db), t => t.objs.some(o => o.name === 'PC-TWIN'));
  // Last seen → never: only the devices no source has seen; the export of the shown columns is named after it
  await p.evaluate(async () => { (await import('/js/01-core.js')).st.tab = 'table'; (await import('/js/07-render.js')).render(); }); await p.waitForSelector('#tblCount');
  await p.evaluate(() => { document.querySelector('#moreFilters').open = true; });
  await p.click('[data-seen=never]');
  await until(p, () => document.querySelector('#tblCount').textContent.trim().startsWith('4 of '));
  assert.match(await p.textContent('#filterBar, .filterbar, body'), /Last seen: never/);
  const rows = await p.evaluate(() => [...document.querySelectorAll('#view tbody tr[data-open]')].map(r => r.dataset.open).sort());
  assert.ok(!rows.includes('v1'), 'a device Intune saw is listed as never seen');
  await p.click('#csvMenu .menu-btn');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#csvShown')]);
  assert.match(dl.suggestedFilename(), /^inventory-never-seen-by-a-source-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = fs.readFileSync(await dl.path(), 'utf8').replace(/^\ufeff/, '');
  const head = text.split('\r\n')[0], shownHead = await p.evaluate(() => [...document.querySelectorAll('#view thead th[data-ck]')].map(th => th.textContent.trim()).join(','));
  assert.equal(head, shownHead, 'the export does not have the columns shown');
  assert.ok(!/Edited|,New/.test(text), 'a mark beside a value is in the data: ' + text.split('\r\n')[1]);
  assert.equal(text.split('\r\n').length, 5, 'the export does not have the rows shown');
  await p.click('#csvMenu .menu-btn');
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('#csvBtn')]);
  assert.match(fs.readFileSync(await dl2.path(), 'utf8'), /^\ufeffcode,name,type,model,serial/);
  await p.click('[data-fx=seen]');
  // Settings → Users: a short password is said under the row; someone without a login shows No sign-in
  await p.click('#setBtn'); await openSetTab(p, 'users'); await p.waitForSelector('#nuAdd');
  await p.fill('#nuFirst', 'Nora'); await p.fill('#nuLogin', 'nora'); await p.fill('#nuPw', 'short');
  await until(p, () => /at least 12 characters: 7 more/.test(document.querySelector('#nuPwNote').textContent));
  await p.click('#nuAdd');
  assert.ok(!loadState(db).users?.some?.(u => u.login === 'nora'), 'added with a short password');
  await p.fill('#nuLogin', ''); await p.fill('#nuPw', '');
  await until(p, () => document.querySelector('#nuPwNote').textContent === '');
  await p.click('#nuAdd');
  await p.waitForSelector('#setUsers td.muted:has-text("No sign-in")');
  // a Settings field saved as it is left (it draws its form again): Tab still goes on to the next field
  await openSetTab(p, 'directory'); await p.waitForSelector('#lk_url');
  await p.focus('#lk_url'); await p.keyboard.type('ldaps://dc1.corp.example'); await p.keyboard.press('Tab');
  await until(p, () => document.activeElement && document.activeElement.id === 'lk_security');
  await p.keyboard.press('Escape');
  // the search at the top finds a rack by its serial number and a saved view by its name, which opens it
  await p.fill('#search', 'rk-sn-9931');
  await p.waitForSelector('#gsList li[role=option]:has-text("RACK-A")');
  await p.fill('#search', 'racks only');
  await p.waitForSelector('#gsList .gs-head:has-text("Views")');
  await p.click('#gsList li[role=option]:has-text("Racks only")');
  await until(p, async () => (await import('/js/01-core.js')).st.type === 'rack');
  await p.fill('#search', ''); await p.keyboard.press('Escape');
  // more changes than the server takes at once go in batches of at most 4000
  const sizes = await p.evaluate(async () => { const { batches } = await import('/js/server-save.js'); const dels = Array.from({ length: 9001 }, (_, i) => ({ kind: 'history', id: 'h' + i })); return batches([], dels).map(b => b.dels.length); });
  assert.deepEqual(sizes, [4000, 4000, 1001]);
  assert.deepEqual(errors, [], 'page errors');
  console.log('sweep fixes: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
