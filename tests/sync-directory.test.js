import { test } from 'node:test';
import assert from 'node:assert/strict';
import ldap from 'ldapjs';
import { applyGraph, applyGraphPeople, addSecureBoot } from '../server/graph.js';
import { syncLdapUsers } from '../server/ldap-sync.js';
import { loadState, saveState } from '../server/state.js';
import { startServer } from './helpers.js';

/* Entra / Intune and the directory: what a sync may change, and what it must leave alone. */
const NOW = new Date('2026-11-08T10:00:00Z');
const dev = (id, name, more = {}) => ({ id, code: 'INV-' + id, type: 'pc', name, status: 'active', ovr: {}, feed: null, ...more });
const state = (objs, users = []) => ({ objs, rels: [], users, locs: [], types: {}, history: {}, codeN: 10, seq: 110 });
const rec = (more = {}) => ({ graphId: 'g1', aadId: '11111111-2222-3333-4444-555555555555', join: 'Entra joined', managed: 'mdm', enrolled: '', lastSync: '2026-11-08T08:00:00Z', lastCheckIn: '2026-11-08T08:00:00Z',
  lastSignIn: '', compliance: 'compliant', encrypted: 'yes', owner: 'anna@corp.example', ownerName: 'Anna Muster', name: 'PC-1', serial: 'S1', ...more });

test('Intune\'s primary user is bound only to a device in use, never to one in stock or retired', () => {
  const g = { owner: 'anna@corp.example', ownerName: 'Anna Muster', aadId: 'x' };
  const s = state([dev('a', 'PC-A', { graph: g }), dev('b', 'PC-B', { status: 'stock', graph: g }), dev('c', 'PC-C', { status: 'retired', graph: g })],
    [{ id: 'u1', login: 'anna', name: 'Anna Muster', role: 'none', active: true, groups: [], source: 'ldap', entra: { id: 'e1', upn: 'anna@corp.example' } }]);
  applyGraphPeople(s, [{ id: 'e1', userPrincipalName: 'anna@corp.example', displayName: 'Anna Muster', accountEnabled: true }], 'match', NOW);
  assert.deepEqual(s.objs.map(o => o.uid || null), ['u1', null, null]);
});

test('someone added from Entra and deleted there has left', () => {
  const s = state([], [{ id: 'u2', login: 'ben', name: 'Ben', role: 'none', active: true, groups: [], source: 'entra', entra: { id: 'e2', upn: 'ben@corp.example' } }]);
  applyGraphPeople(s, [], 'match', NOW);
  const p = s.users[0];
  assert.deepEqual([p.active, p.leftAt, !!p.entra.gone], [false, NOW.toISOString(), true]);
});

test('devices are found by Entra\'s device id after a rename; a merged record or the empty id never gets in the way', () => {
  const aad = '11111111-2222-3333-4444-555555555555';
  /* renamed in Entra, no serial number */
  let s = state([dev('a', 'PC-OLDNAME', { graph: { id: 'g1', aadId: aad } })]);
  let c = applyGraph(s, [rec({ name: 'PC-NEWNAME', serial: '' })], NOW);
  assert.deepEqual([c.matched, c.unmatched], [1, 0]);
  /* a record merged into the device keeps the same serial: still one device */
  s = state([dev('a', 'PC-1', { serial: 'S1', graph: { compliance: 'noncompliant' } }), dev('m', 'pc-1.corp.example', { serial: 'S1', excluded: true, review: { merged: 'a', ignored: 'x' } })]);
  c = applyGraph(s, [rec({ aadId: '' })], NOW);
  assert.deepEqual([c.matched, c.ambiguous], [1, 0]);
  assert.equal(s.objs[0].graph.compliance, 'compliant');
  /* Intune's all-zero id is no id: two phones with it are two phones */
  s = state([dev('p1', 'PHONE-1', { type: 'android', serial: 'P1' }), dev('p2', 'PHONE-2', { type: 'android', serial: 'P2' })]);
  const zero = '00000000-0000-0000-0000-000000000000';
  applyGraph(s, [rec({ graphId: 'x1', aadId: zero, name: 'PHONE-1', serial: 'P1' }), rec({ graphId: 'x2', aadId: zero, name: 'PHONE-2', serial: 'P2' })], NOW);
  applyGraph(s, [rec({ graphId: 'x1', aadId: zero, name: 'PHONE-1', serial: 'P1' }), rec({ graphId: 'x2', aadId: zero, name: 'PHONE-2', serial: 'P2' })], NOW);
  assert.deepEqual(s.objs.map(o => o.graph.id), ['x1', 'x2']);
});

test('a new machine that took a retired one\'s name is offered; the retired one by its serial is not', () => {
  const s = state([dev('r', 'PC-01', { status: 'retired', serial: 'OLD1' })]);
  const c = applyGraph(s, [rec({ name: 'PC-01', serial: 'NEW2' }), rec({ graphId: 'g2', name: 'PC-01', serial: 'OLD1' })], NOW);
  assert.deepEqual([c.unmatched, c.retired], [1, 1]);
});

test('a Secure Boot read that was throttled keeps what the device had', () => {
  const s = state([dev('a', 'PC-1', { serial: 'S1', graph: { secureBoot: 'on', secureBootAt: '2026-11-01' } })]);
  const records = [rec({ intuneId: 'i1' })];
  addSecureBoot(records, new Map([['i1', { keep: true }]]));
  applyGraph(s, records, NOW);
  assert.equal(s.objs[0].graph.secureBoot, 'on');
});

/* A directory stand-in, as in ldap.test.js. */
function startDirectory(people) {
  const dir = ldap.createServer();
  dir.bind('dc=test', (req, res, next) => { if (req.dn.toString().toLowerCase() === 'cn=svc,ou=service,dc=test' && req.credentials === 'svc-secret') { res.end(); return next(); } return next(new ldap.InvalidCredentialsError()); });
  dir.search('dc=test', (req, res, next) => { for (const [dn, p] of Object.entries(people)) if (req.filter.matches(p)) res.send({ dn, attributes: p }); res.end(); return next(); });
  return new Promise(resolve => dir.listen(0, '127.0.0.1', () => resolve(dir)));
}
const person = (login, uac = '512') => ({ sAMAccountName: [login], displayName: [login.toUpperCase()], memberOf: ['CN=Inventory-Users,OU=Groups,DC=test'], userAccountControl: [uac], objectClass: ['person'] });
const cfg = url => ({ url, allowPlain: true, searchBase: 'dc=test', loginAttr: 'sAMAccountName', group: 'Inventory-Users', serviceDn: 'cn=svc,ou=service,dc=test', servicePassword: 'svc-secret', userFilter: '(objectClass=person)', computerGroups: 'off' });

test('the directory sync switches off a disabled account, and an empty answer switches off nobody', async () => {
  const people = { 'cn=anna,dc=test': person('anna'), 'cn=ben,dc=test': person('ben') };
  const dir = await startDirectory(people);
  const srv = await startServer();
  const url = `ldap://127.0.0.1:${dir.address().port}`;
  try {
    saveState(srv.db, { ...loadState(srv.db), users: [{ id: 'u-admin', login: 'admin', name: 'Admin', role: 'admin', active: true, groups: [], source: 'manual' }] });
    await syncLdapUsers(srv.db, cfg(url));
    people['cn=ben,dc=test'].userAccountControl = ['514'];   /* disabled in AD, still in the group */
    const r = await syncLdapUsers(srv.db, cfg(url));
    assert.equal(r.deactivated, 1);
    const ben = loadState(srv.db).users.find(u => u.login === 'ben');
    assert.equal(ben.active, false); assert.ok(ben.leftAt);
    delete people['cn=anna,dc=test']; delete people['cn=ben,dc=test'];
    await assert.rejects(syncLdapUsers(srv.db, cfg(url)), /named nobody/);
    assert.equal(loadState(srv.db).users.find(u => u.login === 'anna').active, true, 'one empty answer switched everybody off');
  } finally { await srv.close(); dir.close(); }
});
