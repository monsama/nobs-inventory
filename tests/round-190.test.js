/* Sweep 0.9.190: a one-word name merged away is no login; a Lansweeper user given by login finds nobody by name, one
   given by a full name finds the person; a backup brings back nobody who could sign in with a role. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePeople } from '../public/js/people-match.js';
import { mergeRecords } from '../server/feed.js';
import { loadState, saveState } from '../server/state.js';
import { restoreBackup } from '../server/backup.js';
import { startServer } from './helpers.js';

test('a one-word name merged away is no alias; a full name and a Lansweeper login-name are', () => {
  const one = { objs: [], history: {}, users: [{ id: 'k', name: 'Max Muster', login: 'mmuster', source: 'ldap', role: 'admin' }, { id: 'd', name: 'Max', source: 'manual', role: 'none' }] };
  mergePeople(one, 'k', 'd');
  assert.deepEqual(one.users[0].aliases || [], []);
  const two = { objs: [], history: {}, users: [{ id: 'k', name: 'Max Muster', login: 'mmuster', source: 'ldap', role: 'none' }, { id: 'd', name: 'Max M.', source: 'manual', role: 'none' }, { id: 'l', name: 'mmax', source: 'lansweeper', role: 'none' }] };
  mergePeople(two, 'k', 'd'); mergePeople(two, 'k', 'l');
  assert.deepEqual(two.users[0].aliases, ['mmax', 'Max M.'], 'logins first');
});

test('the push: a login finds nobody by name; a full name finds the person, whatever their login', () => {
  const s = { objs: [{ id: 'o1', code: 'INV-1', type: 'pc', name: 'PC-1', status: 'active', loc: '', ovr: {}, feed: { sys: 'Lansweeper', ref: '1', seen: '' }, user: 'Anna Muster' },
    { id: 'o2', code: 'INV-2', type: 'pc', name: 'PC-CG', status: 'active', loc: '', ovr: {}, feed: { sys: 'Lansweeper', ref: '2', seen: '' }, user: 'cgraf' }], rels: [], types: {}, history: {}, locs: [],
    users: [{ id: 'anna', name: 'Anna Muster', login: 'amuster', source: 'ldap', role: 'none', active: true, groups: [] }, { id: 'eve', name: 'cgraf', source: 'manual', role: 'viewer', own: true, active: true, groups: [] }] };
  mergeRecords(s, [{ ref: '1', name: 'PC-1', user: 'Anna Muster', userDept: 'IT' }, { ref: '2', name: 'PC-CG', user: 'cgraf', userName: 'Carl Graf', userDept: 'IT' }]);
  assert.equal(s.users.filter(u => u.name === 'Anna Muster').length, 1, 'no second Anna');
  assert.notEqual(s.objs.find(o => o.id === 'o2').uid, 'eve');
});

test('restored: a person who could sign in by an alias, or gets a login at start, has no role or is off', async () => {
  const srv = await startServer();
  try {
    const cur = loadState(srv.db);
    saveState(srv.db, cur);
    restoreBackup(srv.db, { version: 1, state: { objs: [], rels: [], types: {}, history: {}, settings: {}, users: [
      { id: 'x1', name: 'J Doe', source: 'manual', role: 'admin', active: true, aliases: ['jdoe@corp.example'], groups: [] },
      { id: 'x2', name: 'jdoe2', source: 'lansweeper', role: 'viewer', active: true, groups: [] }] } });
    const st = loadState(srv.db), x1 = st.users.find(u => u.id === 'x1'), x2 = st.users.find(u => u.id === 'x2');
    assert.equal(x1.role, 'none');
    assert.ok(x2.active === false || x2.role === 'none', JSON.stringify(x2));
  } finally { await srv.close(); }
});
