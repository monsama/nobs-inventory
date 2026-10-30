/* Fields Intune or AD filled in say so on the device; a value typed there is the page's from then on. The AD account's
   last logon and creation day, and a phone's number, IMEI and owner from Intune, show on the device. Settings turns
   the filling on and off for each. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-fill-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const old = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10);
saveState(db, { ...loadState(db), locs: ['HQ'], sites: ['HQ'],
  graph: { tenant: '1b2c3d4e-5f60-4a1b-9c2d-3e4f5a6b7c8d', clientId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d' },
  objs: [
    { id: 's1', code: 'INV-0001', type: 'server', name: 'SRV-01', status: 'active', loc: 'HQ', ovr: {}, feed: null, inAd: true,
      os: 'Windows Server 2019 Standard (10.0.17763)', domain: 'corp.ch', src: { os: 'ad', domain: 'ad' }, ad: { logon: old, created: '2020-01-02', managedBy: 'Anna Muster', services: ['SQL Server', 'Remote Desktop'] } },
    { id: 'm1', code: 'INV-0002', type: 'mobile', name: 'iPhone Ana', status: 'active', loc: 'HQ', ovr: {}, feed: null, os: 'iOS 18.1', src: { os: 'graph' },
      graph: { join: 'Entra registered', managed: 'mdm', compliance: 'compliant', os: 'iOS 18.1', phone: '+41 79 123 45 67', imei: '351234567890123', ownership: 'Company', free: '32 GB', category: 'Sales phones', supervised: 'yes', seen: '27.10.2026 06:00' },
      autopilot: { groupTag: 'Sales', order: 'PO-7', state: 'enrolled', seen: '27.10.2026 06:00' } },
    { id: 'v1', code: 'INV-0005', type: 'notebook', name: 'NB-7', status: 'active', loc: 'HQ', ovr: {}, feed: null, os: 'Windows 11 Pro', src: { os: 'ad' },
      vals: { os: { graph: ['Windows 11 Enterprise', '2026-10-28T07:42:00Z'], ad: ['Windows 11 Pro', '2026-10-24'] } } },
    /* Found by the directory sync, waiting in To review: one seen today, one not for 200 days */
    { id: 'n20', code: 'INV-0003', type: 'notebook', name: 'NB-20', status: 'active', loc: '', ovr: {}, feed: null, inAd: true, os: 'Windows 11 Enterprise (10.0.22631)', domain: 'corp.ch',
      src: { os: 'ad', domain: 'ad' }, ad: { logon: new Date().toISOString().slice(0, 10), created: '2024-01-02' }, review: { src: 'ad', at: '27.10.2026 06:00' } },
    { id: 'pold', code: 'INV-0004', type: 'pc', name: 'PC-OLD', status: 'active', loc: '', ovr: {}, feed: null, inAd: true, os: 'Windows 10 Pro', ad: { logon: old }, review: { src: 'ad', at: '27.10.2026 06:00' } },
  ], rels: [], history: {} });
const stored = async (check, ms = 8000) => { const t0 = Date.now(); while (!check(loadState(db))) { if (Date.now() - t0 > ms) throw new Error('not saved in time'); await new Promise(r => setTimeout(r, 100)); } };
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  // the Sources panel opens on Entra & Intune, the part this test reads
  await p.waitForFunction(async () => !!(await import('/js/01-core.js')).st); await p.evaluate(async () => { (await import('/js/01-core.js')).st.srcTab = 'graph'; });
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  await p.evaluate(async () => { (await import('/js/01-core.js')).SYNC.graph = true; (await import('/js/07-render.js')).render(); });

  // the server: where its fields came from, and its AD account
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('s1'));
  // the AD account has its own tab in the Sources panel (or its own panel when AD is the only source)
  await p.waitForSelector('#view .panelbox:has(.hdr:has-text("Active Directory"))');
  if (await p.locator('[data-srctab=ad]').count()) { await p.click('[data-srctab=ad]'); assert.equal(await p.isVisible('#srcbody-ad'), true); }
  const form = await p.textContent('#view .panelbox:has(.hdr:has-text("Active Directory"))');
  const mark = k => p.evaluate(k => { const m = document.querySelector(`#f_s1_${k}`).closest('.ctlrow').querySelector('.fsrc'); return m ? [m.dataset.src, m.title] : null; }, k);
  const [osSrc, osTip] = await mark('os');
  assert.equal(osSrc, 'ad'); assert.match(osTip, /From the computer account in Active Directory.*Typing a value here keeps yours/);
  assert.equal((await mark('name')) && (await mark('name'))[0], 'hand', 'a device no sync has: typed by hand');
  const oldDay = old.split("-").reverse().join(".");
  assert.match(form, new RegExp(`Last logon ${oldDay}\\s*over 90 days ago`));
  assert.match(form, /created 02.01.2020/);
  assert.match(form, /Managed by Anna Muster/);
  assert.match(form, /SQL Server/, 'what it runs, from its service principal names');
  // a click on a source mark shows where the value is from (here only AD) and when; a click elsewhere or Escape closes it
  const osMark = p.locator('#f_s1_os >> xpath=ancestor::div[contains(@class,"ctlrow")]//span[contains(@class,"fsrc")]');
  assert.match(await osMark.getAttribute('title'), /From the computer account in Active Directory/);
  await osMark.click();
  assert.match(await p.textContent('#fsrcPop'), new RegExp(`Automatic[\\s\\S]*Active Directory\\s*in use\\s*Windows Server 2019 Standard[\\s\\S]*last logon ${oldDay.replace(/\./g, '\\.')}`));
  await p.click('#objTitle');
  assert.equal(await p.locator('#fsrcPop').count(), 0, 'closed by a click elsewhere');
  await osMark.focus(); await p.keyboard.press('Enter');
  await p.waitForSelector('#fsrcPop');
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('#fsrcPop').count(), 0, 'closed by Escape');
  if (process.env.NI_SHOTS) await p.locator('#view .panelbox:has(.hdr:text("Properties"))').screenshot({ path: path.join(process.env.NI_SHOTS, 'directory-fill.png') });

  // typed over: the value is the page's, marked as set by hand, and no sync fills it again
  await p.fill('#f_s1_os', 'Windows Server 2019 Datacenter'); await p.press('#f_s1_os', 'Tab');
  await stored(st => st.objs.find(o => o.id === 's1').os === 'Windows Server 2019 Datacenter');
  const s1 = loadState(db).objs.find(o => o.id === 's1');
  assert.deepEqual(s1.src, { os: 'hand', domain: 'ad' }, 'the system set by hand, the domain still AD\'s');
  await until(p, () => document.querySelector('#f_s1_os').closest('.ctlrow').querySelector('.fsrc[data-src="hand"]'));

  // a field the sources disagree on: the mark has a dot, a click lists each source with its time, picking one uses it
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('v1'));
  const vMark = p.locator('#f_v1_os >> xpath=ancestor::div[contains(@class,"ctlrow")]//span[contains(@class,"fsrc")]');
  assert.match(await vMark.getAttribute('class'), /fsrc-multi/);
  await vMark.click();
  await p.waitForSelector('#fsrcPop.pick');
  const pop = await p.textContent('#fsrcPop');
  assert.match(pop, /Entra & Intune\s*newest\s*Windows 11 Enterprise\s*last check-in 28\.10\.2026/);
  assert.match(pop, /Active Directory\s*in use\s*Windows 11 Pro\s*last logon 24\.10\.2026/);
  await p.click('#fsrcPop [data-pick=graph]');
  await stored(st => { const o = st.objs.find(x => x.id === 'v1'); return o.os === 'Windows 11 Enterprise' && o.pick && o.pick.os === 'graph' && o.src.os === 'graph'; });
  await until(p, () => document.querySelector('#f_v1_os').value === 'Windows 11 Enterprise');
  // fixed: the mark has a lock, the picker says so and goes back to automatic
  await until(p, () => document.querySelector('#f_v1_os').closest('.ctlrow').querySelector('.fsrc.fsrc-picked .fsrc-lock'));
  await p.locator('#f_v1_os >> xpath=ancestor::div[contains(@class,"ctlrow")]//span[contains(@class,"fsrc")]').first().click();
  await p.waitForSelector('#fsrcPop.pick');
  assert.match(await p.textContent('#fsrcPop .sp-head'), /Fixed to Entra & Intune/);
  await p.click('#fsrcPop .sp-foot [data-pick=""]');
  await stored(st => { const o = st.objs.find(x => x.id === 'v1'); return !(o.pick && o.pick.os); });
  await until(p, () => !document.querySelector('#f_v1_os').closest('.ctlrow').querySelector('.fsrc-lock'));

  // the phone: what Intune says of it
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('m1'));
  await p.waitForSelector('.panelbox:has(.hdr:has-text("Entra & Intune"))');
  const panel = await p.textContent('.panelbox:has(.hdr:has-text("Entra & Intune"))');
  for (const t of ['CategorySales phones', 'SupervisedYes', 'AutopilotGroup tag Sales · order PO-7 · enrolled', 'Phone number+41 79 123 45 67', 'IMEI351234567890123', 'Owned byCompany', 'Free storage32 GB']) assert.ok(panel.replace(/\s+/g, '').includes(t.replace(/\s+/g, '')), 'panel: ' + t);
  assert.match(await p.getAttribute('#f_m1_os >> xpath=ancestor::div[contains(@class,"ctlrow")]//span[contains(@class,"fsrc")]', 'title'), /From Microsoft Entra & Intune.*Typing a value here keeps yours/);

  // Settings: both switches are on by default and are saved when turned off
  await p.evaluate(async () => (await import('/js/04-settings.js')).openSettings());
  await p.click('#setTabs [data-st=directory]');
  await p.waitForSelector('#lk_fillAd');
  assert.equal(await p.isChecked('#lk_fillAd'), true);
  await p.uncheck('#lk_fillAd');
  await stored(st => st.fillAd === false);
  assert.equal(await p.inputValue('#intake_ad'), 'review', 'new devices from AD wait in To review by default');
  await p.selectOption('#intake_ad', 'direct');
  await stored(st => st.intake && st.intake.ad === 'direct');
  await p.click('#setTabs [data-st=entra]');
  await p.waitForSelector('#gFill');
  assert.equal(await p.isChecked('#gFill'), true);
  await p.uncheck('#gFill');
  await stored(st => st.fillGraph === false);

  await p.click('.wc-close');

  // To review: the two AD devices, in no count; the stale one grey and left out of Accept all
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).objs.length), 3, 'waiting devices are not in the inventory');
  await p.click('#tabsbar [data-tab=review]');
  const pold = '#view .card[data-open="pold"]';
  await p.waitForSelector(pold);
  assert.equal(await p.locator('#view .card[data-open]').count(), 2);
  assert.match(await p.getAttribute(pold, 'class'), /stale/);
  assert.match(await p.textContent(pold), /Old/);
  assert.match(await p.textContent('#rvAcceptAll'), /Accept 1 recently seen/);
  // the old ones on their own in the sidebar, and Accept all takes them only when ticked
  await p.click('#scopeList [data-rvold]');
  await p.waitForSelector('#view .card[data-open="n20"]', { state: 'detached' });
  assert.equal(await p.locator('#view .card[data-open]').count(), 1);
  await p.click('#fbar [data-fx=rvOld]');
  await p.waitForSelector('#view .card[data-open="n20"]');
  await p.click('#rvAcceptAll'); await p.waitForSelector('#cfOld');
  assert.equal((await p.textContent('#cfOk')).trim(), 'Accept 1');
  await p.check('#cfOld'); assert.equal((await p.textContent('#cfOk')).trim(), 'Accept 2');
  await p.click('#cfCancel');
  // ignore, undo, ignore again: kept out of every sync, listed under Ignored, and back from there
  await p.click(pold + ' .cardtick'); await p.click('#rvIgnore');
  await p.waitForSelector(pold, { state: 'detached' });
  await p.click('#toast .t-undo');
  await p.waitForSelector(pold);
  await p.click(pold + ' .cardtick'); await p.click('#rvIgnore');
  await stored(st => { const o = st.objs.find(x => x.id === 'pold'); return o.review.ignored && o.excluded === true; });
  await p.click('#scopeList [data-scope=ignored]');
  await p.waitForSelector('#rvRestoreAll');
  assert.match(await p.textContent('#fbar'), /1 ignored device/);
  assert.equal((await p.textContent('#rvRestoreAll')).trim(), 'Unignore all 1');
  // picked: Unignore, or Accept straight into the inventory; the device page offers the same
  await p.click(pold + ' .cardtick');
  assert.deepEqual([(await p.textContent('#rvRestore')).trim(), (await p.textContent('#rvAccept')).trim()], ['Unignore 1', 'Accept 1']);
  await p.click(pold + ' .cardtick');
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('pold'));
  await p.waitForSelector('[data-rvpage=restore]');
  assert.equal((await p.textContent('[data-rvpage=restore]')).trim(), '↩ Unignore');
  await p.click('[data-rvpage=restore]');
  await stored(st => { const o = st.objs.find(x => x.id === 'pold'); return o.review && !o.review.ignored && !o.excluded; });
  await p.click('#tabsbar [data-tab=cards]');
  await p.click('#scopeList [data-scope=review]');
  await p.click(pold + ' .cardtick'); await p.click('#rvIgnore');
  await stored(st => st.objs.find(x => x.id === 'pold').review.ignored);
  // accept all: only the one seen recently, after the app's own question
  await p.click('#rvAcceptAll'); await p.click('#cfOk');
  await stored(st => !st.objs.find(o => o.id === 'n20').review);
  const nb = loadState(db).objs.find(o => o.id === 'n20');
  assert.equal(nb.type, 'notebook'); assert.equal(nb.inAd, true);
  assert.match(loadState(db).history.n20[0].msg, /Accepted into the inventory by .* \(found by Active Directory\)/);
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).objs.some(o => o.id === 'n20')), true);
  // accepted: saved and loaded again from the server at once; Undo still takes it back afterwards
  await p.waitForFunction(async () => (await import('/js/01-core.js')).UNDO.epoch > 1);
  await p.click('#toast .t-undo');
  await stored(st => { const o = st.objs.find(x => x.id === 'n20'); return o.review && !o.review.ignored; });

  assert.deepEqual(errors, []);
  console.log('directory fill: all checks passed');
} finally { await browser.close(); server.close(); }
