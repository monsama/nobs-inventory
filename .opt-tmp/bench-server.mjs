import { seedDb, tmpFile } from './seedp.mjs';
import { loadState, saveState, checkState, applyChanges } from './repo/server/state.js';
import { mergeRecords, recordsFromJson } from './repo/server/feed.js';
import { applyGraph, applyGraphPeople } from './repo/server/graph.js';
import { autoBackup } from './repo/server/backup.js';
const SW = +(process.env.SW ?? 0);
const t = (label, fn, n = 3) => { let best = Infinity, out; for (let i = 0; i < n; i++) { const a = performance.now(); out = fn(); best = Math.min(best, performance.now() - a); } console.log(label.padEnd(48), best.toFixed(1), 'ms'); return out; };
const { db, data } = seedDb(tmpFile(), { sw: SW });
const s0 = t('loadState', () => loadState(db));
t('JSON.stringify(state)', () => JSON.stringify(s0));
t('checkState', () => { const s = loadState(db); const a = performance.now(); checkState(s); return performance.now() - a; });
t('saveState unchanged (incl. its loadState+check)', () => { const s = loadState(db); delete s.revs; delete s.empty; saveState(db, s); }, 2);
t('autoBackup (takeBackup)', () => autoBackup(db, 'bench'), 2);
// applyChanges one object
t('applyChanges: 1 object', () => { const revs = loadState(db).revs; const o = { ...data.objs[10], purpose: 'p' + Math.random() }; return applyChanges(db, { puts: [{ kind: 'object', id: o.id, value: o, base: revs['object|' + o.id] }], dels: [] }); }, 3);
// feed push records
const recs = data.objs.filter(o => o.feed).map(o => ({ name: o.name, serial: o.serial, ip: o.ip, mac: o.mac, os: o.os, model: o.model, assetType: o.type, ref: o.feed.ref }));
const recsUser = data.objs.filter(o => o.feed).map(o => { const u = data.users.find(x => x.id === o.uid); return { name: o.name, serial: o.serial, ip: o.ip, mac: o.mac, os: o.os, model: o.model, assetType: o.type, ref: o.feed.ref, user: u ? u.login : '', userName: u ? u.name : '', userDept: u ? u.dept : '' }; });
const recsNew = recs.map((r, i) => ({ ...r, name: 'NEW-' + i, serial: 'NSN' + i, ref: 'n' + i }));
t('mergeRecords 5000 matched, no user', () => mergeRecords(loadState(db), recordsFromJson(recs)), 2);
t('mergeRecords 5000 matched, with user+dept', () => mergeRecords(loadState(db), recordsFromJson(recsUser)), 2);
t('mergeRecords 5000 all new', () => mergeRecords(loadState(db), recordsFromJson(recsNew)), 1);
const recsLinks = recs.map(r => r.assetType === 'pc' ? { ...r, links: [{ kind: 'attached', ref: String(data.objs.find(o => o.type === 'monitor').feed.ref), port: '' }] } : r);
t('mergeRecords 5000 matched, 1500 with a link', () => mergeRecords(loadState(db), recordsFromJson(recsLinks)), 1);
t('  of which loadState', () => loadState(db), 1);
// graph
const gRecs = data.objs.filter(o => o.graph).map(o => ({ graphId: o.graph.id, aadId: 'a' + o.id, intune: true, name: o.name, serial: o.serial, join: 'Entra joined', managed: 'Intune', enrolled: '', lastSync: '2026-10-25T00:00:00Z', compliance: 'compliant', encrypted: 'yes', owner: o.graph.owner, ownerName: o.user || '', os: o.os, platform: 'Windows', lastCheckIn: '2026-10-25T00:00:00Z', lastSignIn: '', model: o.model, mac: o.mac, ram: '16 GB', disk: '512 GB' }));
while (gRecs.length < 5000) gRecs.push({ ...gRecs[0], graphId: 'x' + gRecs.length, name: 'UNMATCHED-' + gRecs.length, serial: 'U' + gRecs.length });
const gUsers = Array.from({ length: 3000 }, (_, i) => ({ id: 'e' + i, userPrincipalName: 'user' + i + '@corp.ch', displayName: 'Person ' + i, department: 'IT', accountEnabled: true, onPremisesSamAccountName: i < 1500 ? 'user' + i : '', onPremisesSyncEnabled: i < 1500 }));
t('applyGraph 5000 records', () => applyGraph(loadState(db), gRecs), 2);
t('applyGraphPeople 3000 users, match', () => applyGraphPeople(loadState(db), gUsers, 'match'), 2);
{ // add mode: owners not yet people
  const s = loadState(db); s.users = s.users.slice(0, 2); // admin + 1 so owners become new
  const a = performance.now(); const c = applyGraphPeople(s, gUsers, 'add'); console.log('applyGraphPeople add mode (adds', c.added, ')'.padEnd(16), (performance.now() - a).toFixed(1), 'ms');
}
