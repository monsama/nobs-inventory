/* Sweep 0.9.192: a sync never merges a switched-off record with a live one, a merge takes no role from a switched-off
   record, and a restore takes CORP\jdoe for the jdoe already here. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePeople, mergeSamePeople } from '../public/js/people-match.js';
import { loadState, saveState } from '../server/state.js';
import { restoreBackup } from '../server/backup.js';
import { startServer } from './helpers.js';

test('a sync leaves a switched-off record and a live one apart', () => {
  const s = { objs: [], history: {}, users: [
    { id: 'v', name: 'J Doe', login: 'jdoe', source: 'manual', role: 'viewer', active: true },
    { id: 'off', name: 'jdoe', login: 'CORP\\jdoe', source: 'lansweeper', role: 'admin', active: false }] };
  assert.equal(mergeSamePeople(s), 0);
  assert.deepEqual(s.users.map(u => [u.id, u.role]), [['v', 'viewer'], ['off', 'admin']]);
});

test('merged by hand, a switched-off record gives no role', () => {
  const s = { objs: [], history: {}, users: [{ id: 'k', name: 'J Doe', source: 'ldap', role: 'viewer' }, { id: 'd', name: 'jdoe', source: 'lansweeper', role: 'admin', active: false }] };
  mergePeople(s, 'k', 'd');
  assert.equal(s.users[0].role, 'viewer');
});

test('a restore does not bring back CORP\\jdoe beside the jdoe here', async () => {
  const srv = await startServer();
  try {
    const cur = loadState(srv.db);
    saveState(srv.db, { ...cur, users: [...cur.users, { id: 'here', name: 'J Doe', login: 'jdoe', source: 'manual', role: 'viewer', active: true, groups: [] }] });
    restoreBackup(srv.db, { version: 1, state: { objs: [], rels: [], types: {}, history: {}, settings: {}, users: [{ id: 'old', name: 'jdoe', login: 'CORP\\jdoe', source: 'ldap', role: 'admin', active: true, groups: [] }] } });
    assert.equal(loadState(srv.db).users.some(u => u.id === 'old'), false);
  } finally { await srv.close(); }
});
