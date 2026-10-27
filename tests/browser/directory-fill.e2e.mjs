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
      os: 'Windows Server 2019 Standard (10.0.17763)', domain: 'corp.ch', src: { os: 'ad', domain: 'ad' }, ad: { logon: old, created: '2020-01-02' } },
    { id: 'm1', code: 'INV-0002', type: 'mobile', name: 'iPhone Ana', status: 'active', loc: 'HQ', ovr: {}, feed: null, os: 'iOS 18.1', src: { os: 'graph' },
      graph: { join: 'Entra registered', managed: 'mdm', compliance: 'compliant', os: 'iOS 18.1', phone: '+41 79 123 45 67', imei: '351234567890123', ownership: 'Company', free: '32 GB', seen: '27.10.2026 06:00' } },
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
  assert.match(form, /From Active Directory: typing a value here keeps yours/);
  assert.match(form, new RegExp(`Last logon ${old}\\s*over 90 days ago`));
  assert.match(form, /created 2020-01-02/);
  if (process.env.NI_SHOTS) await p.locator('#view .panelbox:has(.hdr:text("Properties"))').screenshot({ path: path.join(process.env.NI_SHOTS, 'directory-fill.png') });

  // typed over: the value is the page's, the note goes, and no sync fills it again
  await p.fill('#f_s1_os', 'Windows Server 2019 Datacenter'); await p.press('#f_s1_os', 'Tab');
  await stored(st => st.objs.find(o => o.id === 's1').os === 'Windows Server 2019 Datacenter');
  const s1 = loadState(db).objs.find(o => o.id === 's1');
  assert.deepEqual(s1.src, { domain: 'ad' }, 'only the domain is still AD\'s');
  await until(p, () => document.querySelector('#view .form').textContent.match(/From Active Directory/g)?.length === 1);
  assert.equal((await p.textContent('#view .form')).match(/From Active Directory/g).length, 1, 'one note left: the domain');

  // the phone: what Intune says of it
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('m1'));
  await p.waitForSelector('.panelbox:has(.hdr:text("Entra & Intune"))');
  const panel = await p.textContent('.panelbox:has(.hdr:text("Entra & Intune"))');
  for (const t of ['Phone number+41 79 123 45 67', 'IMEI351234567890123', 'Owned byCompany', 'Free storage32 GB']) assert.ok(panel.replace(/\s+/g, '').includes(t.replace(/\s+/g, '')), 'panel: ' + t);
  assert.match(await p.textContent('#view .form'), /From Intune: typing a value here keeps yours/);

  // Settings: both switches are on by default and are saved when turned off
  await p.evaluate(async () => (await import('/js/04-settings.js')).openSettings());
  await p.click('#setTabs [data-st=directory]');
  await p.waitForSelector('#lk_fillAd');
  assert.equal(await p.isChecked('#lk_fillAd'), true);
  await p.uncheck('#lk_fillAd');
  await stored(st => st.fillAd === false);
  await p.waitForSelector('#gFill');
  assert.equal(await p.isChecked('#gFill'), true);
  await p.uncheck('#gFill');
  await stored(st => st.fillGraph === false);

  assert.deepEqual(errors, []);
  console.log('directory fill: all checks passed');
} finally { await browser.close(); server.close(); }
