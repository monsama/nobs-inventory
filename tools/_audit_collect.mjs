import { chromium } from 'playwright';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { bootstrap } from '../server/index.js';
import { loadState, saveState } from '../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const OUT = '/tmp/claude-0/-home-user/8927aac5-f5c3-5b05-9ae4-75766fc799db/scratchpad/audit';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-audit-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const loc = 'Zürich HQ / Büro 2.OG';
const b = (id, type, name, extra = {}) => ({ id, code: 'INV-' + id.slice(1).padStart(4, '0'), type, name, status: 'active', feed: null, ovr: {}, model: 'Test model', serial: 'SN-' + name, loc, ...extra });
const objs = [
  b('o1', 'switch', 'SW-ZH-2OG-01', { ports: 24, pfx: '1/', sfp: 4, ip: '10.10.20.12', rack: 'R-SRV', u: 40 }),
  b('o2', 'pc', 'ZH-NB-0201', { ip: '10.10.20.50', os: 'Windows 11', user: 'Anna Muster', software: [{ name: 'Office', version: '16.0' }, { name: '7-Zip', version: '23' }] }),
  b('o3', 'pc', 'ZH-PC-0142', { software: [{ name: 'Office', version: '15.0' }] }),
  b('o4', 'monitor', 'MON-0433', { status: 'stock' }),
  b('o5', 'server', 'SRV-ZH-HV01', { os: 'Windows Server 2022', rack: 'R-SRV', u: 30, h: 2, software: [{ name: '7-Zip', version: '23' }] }),
  b('o6', 'patch', 'PP-2OG-A', { ports: 24, rack: 'R-SRV', u: 41 }),
  b('R-SRV', 'rack', 'ZH-SRV-RACK-01', { code: 'INV-0901', units: 42 }),
];
const history = {}; objs.forEach(o => { history[o.id] = [{ t: '02.09.2026 14:30', msg: 'Created manually' }]; });
const s = loadState(db); const admin = s.users.find(u => u.login === 'admin');
saveState(db, { ...s, objs, rels: [
  { id: 'r1', from: 'o2', to: 'o1', kind: 'connected', port: 3, vlan: 20 },
  { id: 'r2', from: 'o4', to: 'o2', kind: 'attached', port: null, vlan: null },
  { id: 'r3', from: 'o5', to: 'o1', kind: 'connected', port: 5, vlan: 10 },
  { id: 'r4', from: 'o3', to: 'o6', kind: 'connected', port: 2, vlan: null },
], history, users: admin ? [admin] : [], locs: [loc, 'Bern / Lager'], racks: [], types: {},
  vlans: [{ vid: 10, name: 'Servers' }, { vid: 20, name: 'Office', desc: 'Clients' }],
  subnets: [{ name: 'Office', vid: 20, cidr: '10.10.20.0/24', gateway: '10.10.20.1', dns: ['10.10.20.2'], ranges: [], types: ['pc'] }],
  policy: null, ldap: null, mapPos: {}, feedOn: true, feedSync: true, seq: 200, codeN: objs.length, rseq: 0 });
const server = await new Promise(r => { const sv = createApp({ db }).listen(0, '127.0.0.1', () => r(sv)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch({ args: ['--no-sandbox'] }));

const collect = (view) => {
  const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const path = e => { const p = []; let n = e; for (let i = 0; n && n.nodeType === 1 && i < 4; i++, n = n.parentElement) { p.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.classList.length ? '.' + [...n.classList].join('.') : '')); if (n.id) break; } return p.join(' > '); };
  const txt = e => (e.innerText || e.value || e.getAttribute('aria-label') || e.title || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  const S = (e, ks) => { const cs = getComputedStyle(e); const o = {}; ks.forEach(k => o[k] = cs[k]); const r = e.getBoundingClientRect(); o.h = Math.round(r.height * 10) / 10; o.w = Math.round(r.width); return o; };
  const out = [];
  const root = document;
  root.querySelectorAll('button, .btnlike, details.menu>summary').forEach(e => { if (!vis(e)) return; out.push({ kind: 'button', view, path: path(e), cls: e.className, text: txt(e), style: e.getAttribute('style') || '', ...S(e, ['fontSize', 'fontWeight', 'paddingLeft', 'paddingRight', 'borderRadius', 'fontFamily', 'backgroundColor', 'color', 'textTransform']) }); });
  root.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea').forEach(e => { if (!vis(e)) return; out.push({ kind: 'input', view, path: path(e), cls: e.className, text: e.tagName + ':' + (e.type || '') + ' ' + (e.placeholder || e.id || ''), style: e.getAttribute('style') || '', ...S(e, ['fontSize', 'paddingLeft', 'paddingTop', 'borderRadius', 'fontFamily']) }); });
  root.querySelectorAll('.hdr, th, .lrow.head > *, .note, label, .pl-shead, .relgroup, .tabs-cap, .modal .mh, .lempty, .empty, legend, dt').forEach(e => { if (!vis(e)) return; out.push({ kind: e.matches('.hdr') ? 'hdr' : e.matches('th') ? 'th' : e.matches('.lrow.head > *') ? 'lhead' : e.matches('.note') ? 'note' : e.matches('label') ? 'label' : e.matches('.modal .mh') ? 'mh' : 'misc:' + e.className, view, path: path(e), cls: e.className, text: txt(e), style: e.getAttribute('style') || '', ...S(e, ['fontSize', 'fontWeight', 'textTransform', 'letterSpacing', 'color', 'paddingLeft', 'paddingTop', 'backgroundColor']) }); });
  // inline colors
  root.querySelectorAll('[style]').forEach(e => { if (!vis(e)) return; const st = e.getAttribute('style'); if (/#[0-9a-f]{3,6}\b|rgb|(?<![-\w])(white|black|red|green|blue|orange)\b/i.test(st)) { const cs = getComputedStyle(e); let bg = 'rgba(0, 0, 0, 0)', n = e; while (n && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { bg = getComputedStyle(n).backgroundColor; n = n.parentElement; } out.push({ kind: 'inlinecolor', view, path: path(e), text: txt(e), style: st, color: cs.color, bg }); } });
  // font families of text
  const fams = {};
  root.querySelectorAll('body *').forEach(e => { if (!vis(e) || !e.childNodes.length) return; if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return; const f = getComputedStyle(e).fontFamily; const k = f.slice(0, 40); (fams[k] ||= []).push(path(e) + ' «' + txt(e).slice(0, 25) + '»'); });
  out.push({ kind: 'fonts', view, fams: Object.fromEntries(Object.entries(fams).map(([k, v]) => [k, { n: v.length, ex: v.slice(0, 30) }])) });
  // panel paddings
  root.querySelectorAll('.panelbox > :not(.hdr)').forEach(e => { if (!vis(e)) return; const cs = getComputedStyle(e); out.push({ kind: 'panelchild', view, path: path(e), cls: e.className, pad: cs.padding, gap: cs.gap, margin: cs.margin }); });
  // all visible text elements' font sizes, for a census
  return out;
};

const all = [];
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, colorScheme: scheme });
  await ctx.addInitScript(() => localStorage.setItem('ni-started', '1'));
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await p.waitForFunction(() => /Admin/.test(document.querySelector('#whoBtn').textContent));
  const shot = async n => p.screenshot({ path: `${OUT}/${scheme}-${n}.png` });
  for (const t of ['cards', 'table', 'map', 'plans', 'net', 'rack', 'sw']) {
    await p.click(`#tabsbar [data-tab=${t}]`); await p.waitForTimeout(400);
    if (t === 'sw') { await p.click('tr[data-sw="Office"]').catch(() => {}); await p.waitForTimeout(200); }
    all.push(...(await p.evaluate(collect, `${scheme}:${t}`))); await shot(t);
  }
  for (const [id, n] of [['o2', 'pc'], ['o1', 'switch']]) {
    await p.evaluate(async id => (await import('/js/02-views.js')).openObj(id), id); await p.waitForTimeout(400);
    all.push(...(await p.evaluate(collect, `${scheme}:dev-${n}`))); await shot('dev-' + n);
  }
  await p.click('#newBtn'); await p.waitForTimeout(400);
  all.push(...(await p.evaluate(collect, `${scheme}:new`))); await shot('new');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  if (await p.locator('.modal').count()) await p.evaluate(() => document.querySelector('#modalHost').innerHTML = '');
  await p.click('#setBtn'); await p.waitForTimeout(300);
  for (const tab of ['feed', 'directory', 'locations', 'vlans', 'types', 'users', 'maintenance', 'log', 'about']) {
    await p.click(`#setTabs [data-st=${tab}]`); await p.waitForTimeout(400);
    all.push(...(await p.evaluate(collect, `${scheme}:set-${tab}`))); await shot('set-' + tab);
  }
  await ctx.close();
}
fs.writeFileSync(`${OUT}/data.json`, JSON.stringify(all));
console.log('rows', all.length);
await browser.close(); await new Promise(r => server.close(r)); db.close();
