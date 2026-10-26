/* People from Entra beside the inventory's: who is in Entra is noted, the primary users of devices can be added, and
   nobody from LDAP, Lansweeper or added by hand is changed by it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGraphPeople, fetchGraphAll } from '../server/graph.js';
import { checkState } from '../server/state.js';

const NOW = new Date(2026, 9, 26, 10, 0);
const entra = (id, upn, name, extra = {}) => ({ id, userPrincipalName: upn, displayName: name, accountEnabled: true, userType: 'Member', ...extra });
const base = () => ({ objs: [
    { id: 'o1', code: 'INV-0001', type: 'notebook', name: 'NB-1', status: 'active', ovr: {}, feed: null, graph: { owner: 'cloud@example.ch', ownerName: 'Cloud Only' }, user: 'Cloud Only' },
    { id: 'o2', code: 'INV-0002', type: 'notebook', name: 'NB-2', status: 'active', ovr: {}, feed: null, graph: { owner: 'anna@example.ch', ownerName: 'Anna Muster' } },
  ], rels: [], types: {}, history: {}, locs: [],
  users: [
    { id: 'ldap-anna', login: 'anna', name: 'Anna Muster', dept: 'IT', role: 'admin', source: 'ldap', active: true },
    { id: 'ls1', login: 'bea', name: 'bea', role: 'viewer', source: 'lansweeper', active: true },
    { id: 'm1', login: '', name: 'Hand Made', role: 'viewer', source: 'manual', active: true },
  ] });
const USERS = [
  entra('e1', 'anna@example.ch', 'Anna M. (Entra)', { onPremisesSamAccountName: 'anna', onPremisesSyncEnabled: true, department: 'Other' }),
  entra('e2', 'bea@example.ch', 'Bea Beispiel', { onPremisesSamAccountName: 'bea', department: 'Einkauf' }),
  entra('e3', 'cloud@example.ch', 'Cloud Only', { department: 'Sales', accountEnabled: false }),
];

test('match: people in Entra are noted, an LDAP person keeps what the directory says, a Lansweeper one gets its empty name and department', () => {
  const s = base();
  const c = applyGraphPeople(s, USERS, 'match', NOW);
  assert.equal(c.inEntra, 2); assert.equal(c.added, 0);
  const [anna, bea, hand] = s.users;
  assert.deepEqual([anna.entra.id, anna.entra.synced, anna.name, anna.dept], ['e1', true, 'Anna Muster', 'IT']);
  assert.deepEqual([bea.entra.upn, bea.name, bea.dept], ['bea@example.ch', 'Bea Beispiel', 'Einkauf']);
  assert.equal(hand.entra, undefined, 'nobody without a login is matched');
  assert.equal(s.users.length, 3, 'nobody is added');
  checkState(s);
});

test('add: the primary user of a device becomes a person from Entra, and the device is theirs', () => {
  const s = base();
  const c = applyGraphPeople(s, USERS, 'add', NOW);
  assert.equal(c.added, 1);
  const p = s.users.find(u => u.source === 'entra');
  assert.deepEqual([p.login, p.name, p.dept, p.active, p.role], ['cloud@example.ch', 'Cloud Only', 'Sales', false, 'viewer']);
  assert.equal(s.objs[0].uid, p.id, 'the device names them');
  assert.equal(s.objs[1].uid, 'ldap-anna', 'the LDAP person gets the device Intune names them on');
  checkState(s);
  // gone from Entra: the note says so, nothing is deleted
  const again = applyGraphPeople(s, USERS.filter(u => u.id !== 'e2'), 'add', new Date(2026, 9, 27));
  assert.equal(again.gone, 1);
  assert.ok(s.users.find(u => u.id === 'ls1').entra.gone);
});

test('off reads nobody; a person is matched by Entra id after a rename of the login', () => {
  const s = base();
  assert.deepEqual(applyGraphPeople(s, USERS, 'off', NOW), { inEntra: 0, added: 0, gone: 0, bound: 0 });
  applyGraphPeople(s, USERS, 'match', NOW);
  s.users[1].login = 'bea.b';
  applyGraphPeople(s, USERS, 'match', NOW);
  assert.equal(s.users[1].entra.id, 'e2');
  assert.equal(s.users[1].entra.gone, undefined);
});

test('without User.Read.All the devices still sync and the reason is given; with it, members are read and guests left out', async () => {
  const fs = await import('node:fs');
  const certPem = fs.readFileSync(new URL('./fixtures/graph/test.crt', import.meta.url), 'utf8');
  const keyPem = fs.readFileSync(new URL('./fixtures/graph/test.key', import.meta.url), 'utf8');
  const cfg = { tenant: 'contoso.onmicrosoft.com', clientId: 'app-1', keyPem, certPem, people: 'match' };
  const reply = users => async url => {
    if (url.includes('/token')) return { ok: true, json: async () => ({ access_token: 'T' }) };
    if (url.includes('/users')) return users ? { ok: true, json: async () => ({ value: users }) } : { ok: false, status: 403, json: async () => ({}) };
    return { ok: true, json: async () => ({ value: [] }) };
  };
  const denied = await fetchGraphAll(cfg, NOW, reply(null));
  assert.deepEqual(denied.records, []);
  assert.equal(denied.users, null);
  assert.match(denied.peopleError, /User\.Read\.All/);
  const ok = await fetchGraphAll(cfg, NOW, reply([...USERS, entra('g1', 'guest#EXT#@example.ch', 'Guest', { userType: 'Guest' })]));
  assert.deepEqual(ok.users.map(u => u.id), ['e1', 'e2', 'e3']);
  let asked = false;
  await fetchGraphAll({ ...cfg, people: 'off' }, NOW, async url => { if (url.includes('/users')) asked = true; return reply([])(url); });
  assert.equal(asked, false, 'off does not read people at all');
});
