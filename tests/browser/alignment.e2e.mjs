/* Browser test of vertical alignment across the views and Settings, on a wide screen and a phone: tables of the same
   kind in one view have their columns at the same places (the Software tab's open packages), the one-line contents of a
   table row sit on one line, and the items of a toolbar or list row are centred on one line. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-align-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const s = loadState(db), room = s.objs[0].loc;
s.plans = [{ id: 'pl1', name: 'EG', site: room.split(' / ')[0], areas: [{ id: 'ar1', name: 'Office', room, x: 10, y: 10, w: 30, h: 30, rects: [{ x: 10, y: 10, w: 30, h: 30 }] }] }];
Object.assign(s.objs.find(o => o.id === 'o1'), { rack: 'R-SRV', u: 30, h: 1 });
Object.assign(s.objs.find(o => o.id === 'o2'), { user: 'Anna Beispiel-Langername', inAd: true, os: 'Windows 11 Enterprise 23H2 (10.0.22631)', software: [{ name: 'Mozilla Firefox (x64 de)', version: '128.0.3' }, { name: '7-Zip 24.08 (x64)', version: '24.08' }], ip: '10.10.1.25', warranty: '2026-12-01' });
Object.assign(s.objs.find(o => o.id === 'o3'), { adGone: '2026-11-10', software: [{ name: '7-Zip 24.08 (x64)', version: '24.08' }] });
s.rels = [{ id: 'l1', from: 'o2', to: 'o1', kind: 'connected', port: 3, vlan: null }];
s.contracts = [{ id: 'c1', name: 'Support Firewall and Switches long name', kind: 'support', supplier: 'Netzwerk Partner AG', ref: 'SR-4711', cost: 1900, per: 'year', end: '2027-06-30', renew: 12, notice: 3, devices: ['o1'] }];
s.contacts = [{ id: 'k1', kind: 'external', name: 'Petra Netz', company: 'Netzwerk Partner AG', role: 'Account manager', email: 'petra@example.com', phone: '+41 31 000 00 00' }, { id: 'k2', kind: 'internal', name: 'Jörg Intern', role: 'Workplace' }];
s.licences = [{ id: 'li1', name: '7-Zip', seats: 1 }];
saveState(db, s);

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const report = [];
const CHECK = () => {
  const out = [];
  const vis = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
  const sig = el => el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const path = el => { const a = []; let e = el; for (let i = 0; e && i < 3; i++, e = e.parentElement) a.unshift(sig(e)); return a.join('>'); };
  const root = document.querySelector('#mdl[open]') || document.body;
  const center = el => { const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()].filter(r => r.width > 0 && r.height > 0); if (!rs.length) return null; const top = Math.min(...rs.map(r => r.top)), bot = Math.max(...rs.map(r => r.bottom)); return bot - top > 28 ? null : (top + bot) / 2; };
  // A. tables of the same kind in one view: same header, columns at the same places
  const groups = {};
  for (const t of root.querySelectorAll('table')) { if (!vis(t)) continue; const ths = [...t.querySelectorAll(':scope > thead > tr > th')].filter(vis); if (ths.length < 2) continue; const k = ths.map(x => x.textContent.trim()).join('|'); (groups[k] ||= []).push(ths.map(x => Math.round(x.getBoundingClientRect().left - t.getBoundingClientRect().left))); }
  for (const [k, list] of Object.entries(groups)) if (list.length > 1 && new Set(list.map(x => x.join(','))).size > 1) out.push('tables "' + k.slice(0, 40) + '" differ: ' + [...new Set(list.map(x => x.join(',')))].slice(0, 3).join(' / '));
  // B. table rows: one-line cell contents centred on one line
  for (const tr of root.querySelectorAll('tbody tr')) {
    if (tr.closest('table.stack, table.contracts') && innerWidth <= 760) continue;   // stacked into cards on a phone, on purpose
    if (!vis(tr)) continue;
    const cs = [...tr.children].filter(vis).map(td => [td, center(td)]).filter(([, c]) => c !== null);
    if (cs.length < 2) continue;
    const ys = cs.map(x => x[1]), d = Math.max(...ys) - Math.min(...ys);
    if (d > 3) { const lo = cs.find(x => x[1] === Math.max(...ys))[0]; out.push(`row off by ${Math.round(d)}px: ${path(tr)} (lowest ${sig(lo)} "${lo.textContent.trim().slice(0, 20)}")`); }
  }
  // C. flex rows: items centred on one line
  for (const box of root.querySelectorAll('#toolbar, .lrow, .item, .hdr, .ds-gonerow, .addrel, .selbar, .fb-person, .qe-row, .cn-head, .ov-row, .sw-dev, .rowacts, .jbar, .ofacts > *, .relrow, .mf, .ct-person, .gr-pick label, .side-pinrow, .tabsbar, #tabsbar, .topbar, header, .pl-bar, .rk-item, .status, #status, .lic-table td')) {
    if (!vis(box)) continue; const bs = getComputedStyle(box); if (!/flex/.test(bs.display) || bs.flexDirection.startsWith('column') || bs.flexWrap === 'wrap') continue;
    const br = box.getBoundingClientRect();
    const kids = [...box.children].filter(vis).filter(k => getComputedStyle(k).position !== 'absolute').map(k => [k, k.getBoundingClientRect()]).filter(([, r]) => r.height < br.height * 0.95 && r.height < 44);
    if (kids.length < 2) continue;
    const ys = kids.map(([, r]) => (r.top + r.bottom) / 2), d = Math.max(...ys) - Math.min(...ys);
    if (d > 3) { const lo = kids[ys.indexOf(Math.max(...ys))][0], hi = kids[ys.indexOf(Math.min(...ys))][0]; out.push(`flex off by ${Math.round(d)}px: ${path(box)} (${sig(hi)} vs ${sig(lo)} "${lo.textContent.trim().slice(0, 16)}")`); }
  }
  return [...new Set(out)];
};
const views = [['overview'], ['cards'], ['table'], ['plans'], ['net', { portsDevice: 'o1', portNo: 3 }], ['ips'], ['prn'], ['rack', { rackId: 'R-SRV' }], ['sw', { swOpen: ['7-Zip 24.08 (x64)', 'Mozilla Firefox (x64 de)'] }], ['contracts'], ['contacts'], ['o2'], ['o1']];
try {
  for (const [vp, tag, scheme] of [[{ width: 1440, height: 900 }, 'wide', 'light'], [{ width: 1440, height: 900 }, 'wide dark', 'dark'], [{ width: 390, height: 844 }, 'phone', 'light']]) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, ...(tag === 'phone' ? { isMobile: true, hasTouch: true } : {}) });
    await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); localStorage.setItem('ni-card-join', '1'); } catch { /* none */ } });
    const p = await ctx.newPage(); p.on('pageerror', e => report.push(`${tag} page error ${e.message}`));
    await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
    await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
    await p.waitForSelector('#cards .lrow');
    for (const [tab, extra] of views) {
      await p.evaluate(async ([t, ex]) => { const c = await import('/js/01-core.js'); if (c.byId(t)) { (await import('/js/02-views.js')).openObj(t); return; } c.st.tab = t; if (ex) Object.assign(c.st, ex); (await import('/js/07-render.js')).render(); }, [tab, extra || null]);
      await p.waitForTimeout(250);
      const bad = await p.evaluate(CHECK);
      if (bad.length) report.push(`${tag} ${tab}: ` + bad.join(' || '));
    }
    for (const st of ['locations', 'users', 'types', 'sources', 'feed', 'directory', 'entra', 'health', 'backups', 'log']) {
      await p.evaluate(async t => { const c = await import('/js/01-core.js'); c.st.setTab = t; (await import('/js/04-settings.js')).openSettings(); }, st);
      await p.waitForTimeout(300);
      const bad = await p.evaluate(CHECK);
      if (bad.length) report.push(`${tag} settings/${st}: ` + bad.join(' || '));
      await p.evaluate(async () => (await import('/js/19-modal.js')).closeModal());
    }
    /* The dialogs people use most. */
    const dialogs = [
      ['new device', async () => (await import('/js/05-new-object.js')).newObjModal({ type: 'pc' })],
      ['retire', async () => { const c = await import('/js/01-core.js'); (await import('/js/03-object-modals.js')).retireModal(c.byId('o2')); }],
      ['hand out', async () => (await import('/js/27-handout.js')).handOutModal(['o3'])],
      ['bulk edit', async () => (await import('/js/views-bulk-edit.js')).bulkEditModal(['o2', 'o3'])],
      ['contract', async () => { const c = await import('/js/01-core.js'); (await import('/js/09-costs.js')).contractModal(c.COSTS.contracts[0]); }],
      ['licence', async () => { const c = await import('/js/01-core.js'); (await import('/js/09-costs.js')).licenceModal(c.COSTS.licences[0]); }],
      ['contact', async () => { const c = await import('/js/01-core.js'); (await import('/js/11-contacts.js')).contactModal(c.CONTACTS.list[0]); }],
      ['retire several', async () => { const c = await import('/js/01-core.js'); (await import('/js/gone-retire.js')).retireGoneModal([c.byId('o2'), c.byId('o3')]); }],
    ];
    for (const [label, open] of dialogs) {
      await p.evaluate(async () => (await import('/js/19-modal.js')).closeModal());
      await p.evaluate(open);
      await p.waitForTimeout(250);
      const bad = await p.evaluate(CHECK);
      if (bad.length) report.push(`${tag} dialog ${label}: ` + bad.join(' || '));
    }
    await p.evaluate(async () => (await import('/js/19-modal.js')).closeModal());
    await ctx.close();
  }
  assert.deepEqual(report, [], 'alignment');
  console.log('vertical alignment: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
