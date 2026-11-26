/* Sweep 0.9.189: someone who signs in cannot take another's devices by their name; a role from a group stays one
   through a merge; an admin switching a person on or off is the admin's doing, whatever Entra or the directory do. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePeople } from '../public/js/people-match.js';
import { applyGraphPeople } from '../server/graph.js';
import { loadState, saveState, applyChanges } from '../server/state.js';
import { setPassword } from '../server/auth.js';
import { mergeRecords } from '../server/feed.js';
import { startServer, signIn } from './helpers.js';

test('a viewer named after another person\'s login does not get their device', async () => {
  const srv = await startServer();
  try {
    const s = loadState(srv.db);
    saveState(srv.db, { ...s, users: [...s.users, { id: 'u-vera', login: 'vera', name: 'Vera', role: 'viewer', own: true, active: true, source: 'manual', groups: [] }] });
    setPassword(srv.db, 'u-vera', 'verapass12345');
    const v = await signIn(srv, 'vera', 'verapass12345');
    const r = await srv.call('PUT', '/api/me', { cookie: v.cookie, body: { first: 'admin', last: '' } });
    assert.equal(r.status, 400, 'the login of the admin');
    // a name left over from before the check: the sync still makes the person by the login
    const st = loadState(srv.db); st.users.find(u => u.id === 'u-vera').name = 'cgraf'; saveState(srv.db, st);
    const s2 = loadState(srv.db);
    mergeRecords(s2, [{ name: 'PC-CG', serial: 'S9', user: 'cgraf', userName: 'Carl Graf', userDept: 'IT', type: 'pc' }]);
    const pc = s2.objs.find(o => o.name === 'PC-CG');
    assert.notEqual(pc && pc.uid, 'u-vera');
  } finally { await srv.close(); }
});

test('a merge carries where the role came from', () => {
  const s = { objs: [], history: {}, users: [{ id: 'k', name: 'Ana', source: 'ldap', role: 'none' }, { id: 'd', name: 'ana', source: 'entra', role: 'viewer', sites: ['Bern'], roleBy: 'Bern-Viewers' }] };
  mergePeople(s, 'k', 'd');
  assert.deepEqual([s.users[0].role, s.users[0].roleBy], ['viewer', 'Bern-Viewers']);
  const t = { objs: [], history: {}, users: [{ id: 'k', name: 'Ana', source: 'ldap', role: 'viewer' }, { id: 'd', name: 'ana', source: 'entra', role: 'viewer', roleBy: 'G' }] };
  mergePeople(t, 'k', 'd');
  assert.equal(t.users[0].roleBy, undefined, 'given by hand on one: by hand');
});

test('switched off by an admin after Entra had: a restored account stays off', async () => {
  const srv = await startServer();
  try {
    const s = loadState(srv.db);
    saveState(srv.db, { ...s, users: [...s.users, { id: 'bea', login: 'bea@x.ch', name: 'Bea', role: 'none', active: true, entraOff: true, source: 'entra', groups: [], entra: { id: 'e1', upn: 'bea@x.ch', enabled: false } }] });
    const rev = srv.db.prepare("SELECT rev FROM revs WHERE kind = 'user' AND id = 'bea'").get().rev;
    const bea = loadState(srv.db).users.find(u => u.id === 'bea');
    applyChanges(srv.db, { puts: [{ kind: 'user', id: 'bea', base: rev, value: { ...bea, active: false } }], dels: [] });
    const st = loadState(srv.db);
    assert.equal(st.users.find(u => u.id === 'bea').entraOff, false);
    applyGraphPeople(st, [{ id: 'e1', userPrincipalName: 'bea@x.ch', displayName: 'Bea', accountEnabled: true, userType: 'Member' }], 'match', new Date());
    assert.equal(st.users.find(u => u.id === 'bea').active, false);
  } finally { await srv.close(); }
});
