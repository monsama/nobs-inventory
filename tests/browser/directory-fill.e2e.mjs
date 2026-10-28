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
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  await p.evaluate(async () => { (await import('/js/01-core.js')).SYNC.graph = true; (await import('/js/07-render-plans.js')).render(); });

  // the server: where its fields came from, and its AD account
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('s1'));
  await p.waitForSelector('text=AD account');
  const form = await p.textContent('#view .form');
  const mark = k => p.evaluate(k => { const m = document.querySelector(`#f_s1_${k}`).closest('.ctlrow').querySelector('.fsrc'); return m ? [m.dataset.src, m.title] : null; }, k);
  const [osSrc, osTip] = await mark('os');
  assert.equal(osSrc, 'ad'); assert.match(osTip, /From the computer account in Active Directory.*Typing a value here keeps yours/);
  assert.equal((await mark('name')) && (await mark('name'))[0], 'hand', 'a device no sync has: typed by hand');
  assert.match(form, new RegExp(`Last logon ${old}\\s*over 90 days ago`));
  assert.match(form, /created 2020-01-02/);
  assert.match(form, /Managed by Anna Muster/);
  assert.match(form, /SQL Server/, 'what it runs, from its service principal names');
  // a click on a source mark shows its tooltip; a click elsewhere or Escape closes it
  const osMark = p.locator('#f_s1_os >> xpath=ancestor::div[contains(@class,"ctlrow")]//span[contains(@class,"fsrc")]');
  await osMark.click();
  assert.match(await p.textContent('#fsrcPop'), /From the computer account in Active Directory/);
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

  // the phone: what Intune says of it
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('m1'));
  await p.waitForSelector('.panelbox:has(.hdr:text("Entra & Intune"))');
  const panel = await p.textContent('.panelbox:has(.hdr:text("Entra & Intune"))');
  for (const t of ['CategorySales phones', 'SupervisedYes', 'AutopilotGroup tag Sales · order PO-7 · enrolled', 'Phone number+41 79 123 45 67', 'IMEI351234567890123', 'Owned byCompany', 'Free storage32 GB']) assert.ok(panel.replace(/\s+/g, '').includes(t.replace(/\s+/g, '')), 'panel: ' + t);
  assert.match(await p.getAttribute('#f_m1_os >> xpath=ancestor::div[contains(@class,"ctlrow")]//span[contains(@class,"fsrc")]', 'title'), /From Microsoft Entra \/ Intune.*Typing a value here keeps yours/);

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
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).objs.length), 2, 'waiting devices are not in the inventory');
  await p.click('#tabsbar [data-tab=review]');
  await p.waitForSelector('.rv-item');
  assert.equal(await p.locator('.rv-item').count(), 2);
  assert.match(await p.getAttribute('.rv-item[data-rv="pold"]', 'class'), /stale/);
  assert.match(await p.textContent('#rvAcceptAll'), /Accept 1 recently seen/);
  // ignore, undo, ignore again: kept out of every sync, listed under Ignored, and back from there
  await p.click('[data-rvignore="pold"]');
  await p.waitForSelector('.rv-item[data-rv="pold"]', { state: 'detached' });
  await p.click('#toast .t-undo');
  await p.waitForSelector('.rv-item[data-rv="pold"]');
  await p.click('[data-rvignore="pold"]');
  await stored(st => { const o = st.objs.find(x => x.id === 'pold'); return o.review.ignored && o.excluded === true; });
  await p.click('[data-rvsrc="ignored"]');
  await p.waitForSelector('[data-rvrestore="pold"]');
  await p.click('[data-rvsrc=""]');
  // accept all: only the one seen recently
  p.once('dialog', d => d.accept());
  await p.click('#rvAcceptAll');
  await stored(st => !st.objs.find(o => o.id === 'n20').review);
  const nb = loadState(db).objs.find(o => o.id === 'n20');
  assert.equal(nb.type, 'notebook'); assert.equal(nb.inAd, true);
  assert.match(loadState(db).history.n20[0].msg, /Accepted into the inventory by .* \(found by Active Directory\)/);
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).objs.some(o => o.id === 'n20')), true);

  assert.deepEqual(errors, []);
  console.log('directory fill: all checks passed');
} finally { await browser.close(); server.close(); }
