import { openDb } from './repo/server/db.js';
import { bootstrap } from './repo/server/index.js';
import { loadState } from './repo/server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];
export function makeData({ nObj = 5000, nUsers = 1500, nContacts = 200, sw = 40 } = {}) {
  const sites = ['Zürich HQ', 'Bern', 'Basel'];
  const locs = sites.flatMap(s => Array.from({ length: 20 }, (_, i) => `${s} / Room ${i + 1}`));
  const depts = ['IT', 'Finance', 'Sales', 'HR', 'Ops', 'Legal'];
  const users = Array.from({ length: nUsers }, (_, i) => ({ id: 'u' + i, login: 'user' + i, name: `Person ${i} Lastname${i % 97}`, dept: pick(depts), role: 'viewer', groups: [], source: 'ldap', active: true }));
  const contacts = Array.from({ length: nContacts }, (_, i) => ({ id: 'k' + i, kind: i % 3 ? 'external' : 'internal', name: 'Contact ' + i, company: i % 3 ? 'Partner ' + (i % 15) : undefined, email: `c${i}@example.ch` })).map(c => (c.company === undefined && delete c.company, c));
  const objs = [], rels = [], history = {};
  const mix = [['switch', 100], ['patch', 20], ['server', 30], ['vm', 50], ['pc', 1500], ['notebook', 1100], ['monitor', 1200], ['ios', 250], ['android', 150], ['printer', 300], ['accesspoint', 100], ['other', 200]];
  let n = 0;
  const swList = [];
  const softwareList = Array.from({ length: 300 }, (_, i) => ({ name: 'App ' + i, version: '1.' + (i % 10) }));
  for (const [type, count] of mix) for (let i = 0; i < count && n < nObj; i++) {
    n++;
    const id = 'o' + n;
    const u = ['pc', 'notebook', 'monitor', 'ios', 'android'].includes(type) ? users[Math.floor(rnd() * users.length)] : null;
    const o = { id, code: 'INV-' + String(n).padStart(4, '0'), type, name: `${type.toUpperCase()}-${String(n).padStart(5, '0')}`, status: rnd() < 0.05 ? 'retired' : 'active',
      ovr: {}, model: 'Model ' + (n % 40), serial: 'SN' + (100000 + n), loc: pick(locs),
      feed: { sys: 'Lansweeper', ref: String(n), seen: '20.10.2026 03:00', assetType: type, scanned: '2026-10-20' } };
    if (!['monitor', 'patch'].includes(type)) { o.ip = `10.${(n >> 8) & 255}.${n & 255}.${(n % 200) + 10}`; o.mac = Array.from({ length: 6 }, (_, j) => ((n * (j + 7)) & 255).toString(16).padStart(2, '0')).join(':'); o.os = type === 'pc' || type === 'notebook' ? 'Windows 10.0.22631' : ''; }
    if (u) { o.uid = u.id; o.user = u.name; }
    if (type === 'switch') { o.ports = 48; o.sfp = 4; o.pfx = '1/'; swList.push(o); }
    if (type === 'patch') o.ports = 24;
    if (rnd() < 0.3) o.respIn = pick(contacts.filter(c => c.kind === 'internal')).id;
    if (rnd() < 0.3) o.respEx = pick(contacts.filter(c => c.kind === 'external')).id;
    o.warranty = '2027-0' + (1 + (n % 9)) + '-15';
    if ((type === 'pc' || type === 'notebook') && sw) o.software = Array.from({ length: sw }, (_, j) => ({ ...softwareList[(n * 7 + j * 13) % 300], src: 'Lansweeper' }));
    if (['pc', 'notebook', 'ios', 'android'].includes(type)) o.graph = { id: 'g' + n, join: 'Entra joined', managed: 'Intune', compliance: rnd() < 0.1 ? 'noncompliant' : 'compliant', encrypted: 'yes', owner: u ? u.login + '@corp.ch' : '', lastSync: '2026-10-20T00:00:00Z', seen: '20.10.2026 03:00' };
    objs.push(o);
    history[id] = Array.from({ length: 5 }, (_, j) => ({ t: '0' + (j + 1) + '.09.2026 14:30', msg: 'Lansweeper: IP changed from 10.0.0.' + j + ' to 10.0.0.' + (j + 1) }));
  }
  // connect pcs/printers/ap to switch ports, monitors attached to pcs
  let port = 0, rid = 0;
  const pcs = objs.filter(o => o.type === 'pc');
  for (const o of objs) {
    if (['pc', 'printer', 'accesspoint', 'server'].includes(o.type)) { const s = swList[Math.floor(port / 48)]; if (!s) continue; rels.push({ id: 'r' + (++rid), from: o.id, to: s.id, kind: 'connected', port: (port % 48) + 1, vlan: null }); port++; }
    if (o.type === 'monitor') rels.push({ id: 'r' + (++rid), from: o.id, to: pcs[rid % pcs.length].id, kind: 'attached', port: null, vlan: null, src: 'Lansweeper' });
  }
  return { objs, rels, users, contacts, history, locs, sites };
}

export function seedDb(file, opts) {
  const db = openDb(file);
  bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
  const admin = loadState(db).users.find(u => u.login === 'admin');
  const d = makeData(opts);
  const put = db.prepare('INSERT OR REPLACE INTO docs (kind, id, data) VALUES (?, ?, ?)');
  const rev = db.prepare('INSERT OR REPLACE INTO revs (kind, id, rev) VALUES (?, ?, 1)');
  db.exec('BEGIN');
  const w = (k, id, v) => { put.run(k, id, JSON.stringify(v)); rev.run(k, id); };
  for (const o of d.objs) w('object', o.id, o);
  for (const r of d.rels) w('rel', r.id, r);
  for (const u of [admin, ...d.users]) w('user', u.id, u);
  for (const [k, h] of Object.entries(d.history)) w('history', k, h);
  w('setting', 'contacts', d.contacts); w('setting', 'locs', d.locs); w('setting', 'sites', d.sites); w('setting', 'feedOn', true);
  w('setting', 'seq', 100 + d.objs.length); w('setting', 'codeN', d.objs.length);
  db.exec('COMMIT');
  return { db, data: d };
}
export const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ni-perf-')), 'inventory.db');
