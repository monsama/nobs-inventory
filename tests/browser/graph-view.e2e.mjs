/* What Microsoft Graph reports shows in the inventory: a panel on the device (join, Intune, compliance, encryption,
   primary user, last contact), a sidebar group and Overview tiles for devices that are not compliant, not encrypted,
   not heard of for 30 days or not in Entra at all, and in Settings the devices Graph has that the inventory does not,
   to be added. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-graph-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const recent = new Date(Date.now() - 2 * 864e5).toISOString(), old = new Date(Date.now() - 60 * 864e5).toISOString();
const pc = (id, name, graph) => ({ id, code: 'INV-' + id, type: 'pc', name, status: 'active', loc: 'HQ', ovr: {}, feed: null, ...(graph ? { graph } : {}) });
saveState(db, { ...s0, locs: ['HQ'], sites: ['HQ'],
  graph: { tenant: '1b2c3d4e-5f60-4a1b-9c2d-3e4f5a6b7c8d', clientId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d' },
  graphUnmatched: [{ id: 'm9', name: 'iPhone Ana', serial: 'F2LX', model: 'Apple iPhone 15', os: 'iOS 18.1', platform: 'iOS', owner: 'Ana Muster', join: 'Registered', managed: 'mdm', compliance: 'compliant', lastSync: recent }],
  objs: [
    { ...pc('a', 'PC-OK'), os: 'Windows 11 Pro', graph: { join: 'Entra joined', managed: 'mdm', compliance: 'compliant', encrypted: 'yes', ownerName: 'Ana Muster', owner: 'ana@contoso.ch', os: 'Windows 10.0.22631', lastCheckIn: recent, seen: '26.10.2026 06:00' } },
    { ...pc('b', 'PC-BAD'), os: 'Windows 10 Pro', graph: { join: 'Domain joined', managed: 'mdm', compliance: 'noncompliant', encrypted: 'no', lastCheckIn: old, seen: '26.10.2026 06:00' } },
    { ...pc('c', 'PC-NONE'), inAd: true },
    /* Listed twice in Entra (an old record from before a reinstall); gone from Entra since the last sync; a name used twice here. */
    pc('d', 'PC-DUP', { join: 'Entra joined', managed: 'mdm', compliance: 'compliant', lastCheckIn: recent, seen: '26.10.2026 06:00', others: [{ id: 'x1', join: 'Entra registered', managed: '', serial: '', last: old }] }),
    pc('e', 'PC-GONE', { join: 'Entra joined', managed: 'mdm', compliance: 'compliant', lastCheckIn: recent, seen: '25.10.2026 06:00', gone: '26.10.2026 06:00' }),
    { ...pc('k1', 'KIOSK'), type: 'switch' }, { ...pc('k2', 'kiosk'), type: 'switch' },
    /* Retired: counted nowhere on the Overview, so the lists it opens leave it out too. */
    { ...pc('r1', 'PC-OLD'), status: 'retired', os: 'Windows 10 Pro' },
  ], rels: [], history: {},
  graphAmbiguous: [{ name: 'Kiosk', serial: '', by: 'name', devices: ['k1', 'k2'], records: 1 }] });
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
  /* Graph counts as set up for the page, as it would after a sync with a certificate. */
  await p.evaluate(async () => { (await import('/js/01-core.js')).SYNC.graph = true; (await import('/js/07-render-plans.js')).render(); });

  // the panel on a device
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('a'));
  await p.waitForSelector('.panelbox:has(.hdr:text("Entra & Intune"))');
  const panel = await p.textContent('.panelbox:has(.hdr:text("Entra & Intune"))');
  for (const t of ['Entra joined', 'Joined to Microsoft Entra only', 'Managed', 'Compliant', 'Encrypted', 'Ana Muster', 'Windows 10.0.22631']) assert.ok(panel.includes(t), 'panel: ' + t);
  if (process.env.NI_SHOTS) await p.locator('.panelbox:has(.hdr:text("Entra & Intune"))').screenshot({ path: path.join(process.env.NI_SHOTS, 'graph-panel.png') });
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('b'));
  await p.waitForSelector('text=over 30 days ago');
  assert.match(await p.textContent('.panelbox:has(.hdr:text("Entra & Intune"))'), /Hybrid joined.*Not compliant.*Not encrypted/s);
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('c'));
  await p.waitForSelector('text=Not found in Microsoft Entra or Intune');
  assert.match(await p.textContent('.panelbox:has(.hdr:text("Entra & Intune"))'), /joined to AD only/);

  // the sidebar group filters
  const count = k => p.textContent(`#grList [data-intune="${k}"] .cnt`);
  assert.deepEqual([await count('noncompliant'), await count('unencrypted'), await count('stale'), await count('missing')], ['1', '1', '1', '2'], 'a device gone from Entra counts as not in it');
  assert.deepEqual([await count('duplicates'), await count('ambiguous')], ['1', '2']);
  if (process.env.NI_SHOTS) await p.locator('#grHdr').screenshot({ path: path.join(process.env.NI_SHOTS, 'graph-side-h.png') });
  await p.click('#grList [data-intune="missing"]');
  assert.deepEqual(await p.evaluate(async () => (await import('/js/01-core.js')).filtered().map(o => o.id)), ['c', 'e']);
  await p.click('#grList [data-intune="missing"]');
  // how each device is joined: Entra, hybrid (Graph's ServerAd, once called Domain joined), AD only (from the LDAP sync)
  assert.deepEqual([await count('entra'), await count('hybrid'), await count('adonly')], ['2', '1', '1'], 'a device gone from Entra is not Entra joined');
  // duplicates in Entra, a device gone from it, and a record that fits two devices here, on the device
  const graphText = async id => { await p.evaluate(async i => (await import('/js/02-views.js')).openObj(i), id); await p.waitForSelector('.panelbox:has(.hdr:text("Entra & Intune"))'); return p.textContent('.panelbox:has(.hdr:text("Entra & Intune"))'); };
  assert.match(await graphText('d'), /2 records in Entra.*Entra registered.*last heard of.*Delete old records/s);
  assert.match(await graphText('e'), /Gone.*Not in Entra or Intune any more since the sync of 26\.10\.2026/s);
  assert.match(await graphText('k1'), /Not matched.*named Kiosk.*INV-k2 kiosk.*distinct names/s);
  assert.equal(await p.locator('#grList [data-intune="registered"]').count(), 0, 'a kind that does not occur is not listed');
  assert.match(await p.getAttribute('#grList [data-intune="hybrid"]', 'title'), /on-premises Active Directory and registered in Microsoft Entra/);
  await p.click('#grList [data-intune="adonly"]');
  assert.deepEqual(await p.evaluate(async () => (await import('/js/01-core.js')).filtered().map(o => o.id)), ['c']);
  await p.click('#grList [data-intune="adonly"]');

  // the Overview tiles open the list
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'overview'; (await import('/js/07-render-plans.js')).render(); });
  await p.click('[data-ovintune="noncompliant"]');
  assert.deepEqual(await p.evaluate(async () => (await import('/js/01-core.js')).filtered().map(o => o.id)), ['b']);
  // the Overview: how devices are joined, Intune, operating systems, and Windows 10 under Needs attention
  const ids = () => p.evaluate(async () => (await import('/js/01-core.js')).filtered().map(o => o.id));
  const overview = async () => { await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'overview'; (await import('/js/07-render-plans.js')).render(); }); await p.waitForSelector('.ov-split'); };
  await overview();
  if (process.env.NI_SHOTS) await p.screenshot({ path: path.join(process.env.NI_SHOTS, 'overview-join.png'), fullPage: true });
  assert.match(await p.textContent('.panelbox:has(.hdr:text("How devices are joined"))'), /Entra joined.*2.*Hybrid joined.*1.*AD joined only.*1/s);
  await p.click('.ov-row[data-ovintune="hybrid"]'); assert.deepEqual(await ids(), ['b']);
  await overview(); await p.click('.ov-bar[data-ovintune="duplicates"]'); assert.deepEqual(await ids(), ['d']);
  assert.equal(await p.locator('#grList [data-intune="duplicates"].sel').count(), 1, 'the filter shows in the sidebar while it filters');
  await overview(); await p.click('.ov-bar[data-ovintune="managed"]'); assert.deepEqual(await ids(), ['a', 'b', 'd']);
  assert.equal(await p.locator('#grList [data-intune="managed"]').count(), 1, 'an Overview-only filter shows while it filters');
  // a column filter typed in the table before does not hide what the Overview opens
  await p.evaluate(async () => { const t = await import('/js/06-topbar.js'); Object.values(t.TBL).forEach(x => { x.filters = { name: 'zzz' }; }); });
  await overview(); await p.click('.ov-row[data-ovos="Windows 10"]'); assert.deepEqual(await ids(), ['b'], 'the retired Windows 10 device is not in the list, as it is not in the count');
  assert.ok(await p.evaluate(async () => Object.values((await import('/js/06-topbar.js')).TBL).every(x => !Object.keys(x.filters || {}).length)), 'column filters are cleared');
  assert.equal(await p.locator('#statList [data-live].sel').count(), 1, 'Not retired shows in the sidebar while it filters');
  assert.match(await p.textContent('#osList'), /Windows 10/);
  await p.click('#osList [data-osfam]'); assert.equal((await ids()).length, 7, 'the way out of the system filter');
  assert.deepEqual(await p.evaluate(async () => { const { osFamily } = await import('/js/01-core.js');
    return ['Windows 10.0.22631', 'Windows 10.0.19045', 'Microsoft Windows 11 Enterprise', 'Win 10 Pro', 'Windows Server 2019 Standard', 'Windows Server 2012 R2 Datacenter', 'macOS 14.5', 'iPadOS 17.1', 'Android 14', 'Ubuntu 22.04', 'Win 2019', 'Win 2012 R2', 'Windows 2016 Standard', 'Windows 2000', 'VMware ESXi 8.0', 'Windows 10 Enterprise (10.0.22631)', 'Windows 10 Pro (10.0.19045)', 'Cisco IOS XE 17.9', 'FortiOS v7.2.8', ''].map(os => osFamily({ os })); }),
    ['Windows 11', 'Windows 10', 'Windows 11', 'Windows 10', 'Windows Server 2019', 'Windows Server 2012 R2', 'macOS', 'iOS / iPadOS', 'Android', 'Linux', 'Windows Server 2019', 'Windows Server 2012 R2', 'Windows Server 2016', 'Windows (other)', 'VMware ESXi', 'Windows 11', 'Windows 10', 'Cisco IOS', 'FortiOS', '']);
  // no system, or one not known: the name or model may say it
  assert.deepEqual(await p.evaluate(async () => { const { osFamily } = await import('/js/01-core.js');
    return [{ name: 'FortiGate_40F_Office' }, { name: 'acmeesxi21.corp.local' }, { name: 'jdoe-iphone' }, { name: 'PRN-01', os: 'Weird OS 2' }, { name: 'PRN-02' }].map(osFamily); }),
    ['FortiOS', 'VMware ESXi', 'iOS / iPadOS', 'Other', '']);

  // Settings: the device Graph has that the inventory does not, added from there
  await p.click('#clearF');
  await p.click('#setBtn'); await p.click('#setTabs [data-st=directory]');
  await p.waitForSelector('#guList');
  assert.match(await p.textContent('#gaList'), /Kiosk.*name.*INV-k1 KIOSK.*INV-k2 kiosk/s);
  if (process.env.NI_SHOTS){ await p.click('.wc-max'); await p.locator('.gu-box:has(#guList)').screenshot({ path: path.join(process.env.NI_SHOTS, 'graph-unmatched.png') }); }
  assert.match(await p.textContent('#guList'), /iPhone Ana.*iOS 18\.1.*Apple iPhone 15.*F2LX.*Ana Muster/s);
  await p.check('[data-gu="m9"]'); await p.click('#guAdd');
  await until(p, async () => (await import('/js/01-core.js')).objs.some(o => o.name === 'iPhone Ana'));
  const added = await p.evaluate(async () => { const o = (await import('/js/01-core.js')).objs.find(x => x.name === 'iPhone Ana'); return [o.type, o.serial, o.code]; });
  assert.deepEqual(added, ['ios', 'F2LX', 'INV-0001']);
  await p.waitForSelector('#guList', { state: 'detached' });
  // a model corrected by hand on a device added from Graph is kept from the next sync
  await p.click('.wc-close');
  const id = await p.evaluate(async () => (await import('/js/01-core.js')).objs.find(x => x.name === 'iPhone Ana').id);
  await p.evaluate(async i => (await import('/js/02-views.js')).openObj(i), id);
  await p.fill(`#f_${id}_model`, 'iPhone 15 (blue)'); await p.press(`#f_${id}_model`, 'Tab');
  await until(p, async () => (await import('/js/01-core.js')).objs.find(x => x.name === 'iPhone Ana').ovr.model === false);
  assert.deepEqual(errors, []);
  console.log('graph in the inventory: ok');
} finally { await browser.close(); server.close(); }
