/* The same person found twice (Lansweeper, the directory, Entra, by hand): found, merged on the server with devices,
   entry sheets and the sign-in, and not made again by the next sync. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duplicateGroups, keepOf, normName, mergePeople, pairKey } from '../public/js/people-match.js';
import { startServer, signIn } from './helpers.js';
import { loadState, saveState } from '../server/state.js';
import { setPassword } from '../server/auth.js';
import { mergeRecords } from '../server/feed.js';

const P = (id, name, extra = {}) => ({ id, name, role: 'none', groups: [], active: true, source: 'manual', ...extra });

test('names read the same in any order and with or without accents', () => {
  assert.equal(normName('Muster, Anna'), normName('anna MUSTER'));
  assert.equal(normName('Zoë Brönnimann'), normName('Zoe Bronnimann'));
  assert.notEqual(normName('Anna Muster'), normName('Anna Mustermann'));
});

test('duplicates: by login across domains, e-mail or UPN; by name only when no login tells them apart', () => {
  const users = [
    P('l1', 'Anna Muster', { source: 'ldap', login: 'amuster', profile: { mail: 'anna.muster@corp.example' } }),
    P('s1', 'amuster', { source: 'lansweeper', login: 'CORP\\amuster' }),
    P('e1', 'Anna Muster', { source: 'entra', login: 'anna.muster@corp.example', entra: { upn: 'anna.muster@corp.example' } }),
    P('m1', 'Muster, Anna'),
    P('l2', 'Ben Keller', { source: 'ldap', login: 'bkeller' }), P('l3', 'Ben Keller', { source: 'ldap', login: 'bkeller2' }),
    P('s2', 'Cla Test', { source: 'lansweeper', login: 'ctest' }), P('s3', 'Cla Test', { source: 'lansweeper', login: 'cla.other' }),
    P('m2', 'Dora Nobody'),
  ];
  const groups = duplicateGroups(users);
  assert.equal(groups.length, 1, JSON.stringify(groups));
  assert.deepEqual(groups[0].ids.sort(), ['e1', 'l1', 'm1', 's1']); assert.equal(groups[0].why, 'login');
  assert.equal(keepOf(users.filter(u => groups[0].ids.includes(u.id))).id, 'l1', 'the directory\'s record is kept');
  const apart = duplicateGroups(users, [pairKey('l1', 'm1'), pairKey('s1', 'm1'), pairKey('e1', 'm1')]);
  assert.deepEqual(apart[0].ids.sort(), ['e1', 'l1', 's1'], 'not the same: left out');
  assert.equal(duplicateGroups([P('a', 'Eva Roth'), P('b', 'Roth, Eva', { source: 'lansweeper' })])[0].why, 'name');
});

test('a merge moves devices, keeps what the kept one lacks, and the other names as aliases', () => {
  const s = { users: [P('l1', 'Anna Muster', { source: 'ldap', login: 'amuster' }), P('s1', 'Muster Anna', { source: 'lansweeper', login: 'anna.m', dept: 'Sales', role: 'viewer' })],
    objs: [{ id: 'o1', uid: 's1', user: 'Muster Anna' }, { id: 'o2', uid: 'l1' }], history: {} };
  assert.throws(() => mergePeople(s, 's1', 'l1'), /comes from the directory/);
  const r = mergePeople(s, 'l1', 's1', '01.11.2026 10:00');
  assert.equal(r.moved, 1);
  assert.equal(s.objs[0].uid, 'l1');
  assert.deepEqual(s.users.map(u => u.id), ['l1']);
  assert.equal(s.users[0].dept, 'Sales'); assert.equal(s.users[0].role, 'viewer');
  assert.deepEqual(s.users[0].aliases, ['anna.m', 'Muster Anna']);
  assert.match(s.history.o1[0].msg, /merged into Anna Muster/);
});

test('merged on the server: sheets and sign-in go along, a backup first, and Lansweeper finds the person by the alias', async () => {
  const srv = await startServer();
  try {
    const s = loadState(srv.db);
    saveState(srv.db, { ...s, users: [...s.users, P('m1', 'Anna Muster', { login: 'anna', role: 'viewer' }), P('s1', 'amuster', { source: 'lansweeper', login: 'amuster' })],
      objs: [{ id: 'o1', code: 'INV-1', type: 'pc', name: 'PC-1', status: 'active', loc: '', uid: 's1', ovr: {}, feed: null }] });
    setPassword(srv.db, 'm1', 'annapass1234');
    srv.db.prepare("INSERT INTO sheets (id, user_id, created, by, password, data) VALUES ('sh1', 's1', '2026-10-01', 'admin', 'none', 'x')").run();
    const a = await signIn(srv, 'admin', 'adminpass123');
    assert.equal((await srv.call('POST', '/api/users/merge', { cookie: a.cookie, body: { keep: 'm1', drop: 'u-admin' } })).status, 400, 'not your own account');
    const r = await srv.call('POST', '/api/users/merge', { cookie: a.cookie, body: { keep: 'm1', drop: 's1' } });
    assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.moved, 1);
    const st = loadState(srv.db);
    assert.equal(st.objs[0].uid, 'm1'); assert.ok(!st.users.some(u => u.id === 's1'));
    assert.deepEqual(st.users.find(u => u.id === 'm1').aliases, ['amuster']);
    assert.equal(srv.db.prepare("SELECT user_id FROM sheets WHERE id = 'sh1'").get().user_id, 'm1');
    assert.ok(srv.db.prepare("SELECT 1 FROM backups WHERE reason = 'before merging two people'").get());
    assert.equal((await signIn(srv, 'anna', 'annapass1234')).status, 200, 'the kept one still signs in');
    // Lansweeper names the device's user by the old login: the merged person, not a new one
    const s2 = loadState(srv.db);
    mergeRecords(s2, [{ name: 'PC-1', serial: '', user: 'amuster', userName: 'Anna Muster', userDept: 'Sales', type: 'pc' }]);
    assert.equal(s2.users.filter(u => /muster|amuster/i.test(u.name)).length, 1, 'no new person');
  } finally { await srv.close(); }
});
