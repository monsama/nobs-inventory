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

test('merging keeps the higher role, admin above viewer', async () => {
  const { mergePeople } = await import('../public/js/people-match.js');
  const s = { users: [{ id: 'k', name: 'Eva', role: 'admin', source: 'ldap' }, { id: 'd', name: 'Eva', role: 'viewer', source: 'lansweeper' }], objs: [] };
  mergePeople(s, 'k', 'd'); assert.equal(s.users[0].role, 'admin');
  const s2 = { users: [{ id: 'k', name: 'Eva', role: 'viewer', source: 'ldap' }, { id: 'd', name: 'Eva', role: 'admin', source: 'manual' }], objs: [] };
  mergePeople(s2, 'k', 'd'); assert.equal(s2.users[0].role, 'admin');
});

test('records that share a login (without its domain) or the UPN Entra knows are merged after a sync', async () => {
  const { mergeSamePeople, exactKeys } = await import('../public/js/people-match.js');
  assert.deepEqual([...exactKeys({ login: 'CORP\\AMuster', entra: { upn: 'anna.muster@corp.example' }, aliases: ['Anna Muster', 'amuster2'] })].sort(), ['amuster', 'amuster2', 'anna.muster@corp.example']);
  const s = { users: [
    { id: 'l', name: 'Anna Muster', login: 'amuster', aliases: ['anna.muster@corp.example'], role: 'viewer', source: 'ldap' },
    { id: 'ls', name: 'amuster', login: 'CORP\\amuster', role: 'none', source: 'lansweeper' },
    { id: 'en', name: 'Anna M.', login: 'anna.muster@corp.example', role: 'none', source: 'entra', entra: { id: 'e1', upn: 'anna.muster@corp.example' } },
    { id: 'm', name: 'Anna', login: 'amuster', role: 'admin', source: 'manual' },
    { id: 'b', name: 'Ben', login: 'bkeller', role: 'none', source: 'lansweeper' },
    { id: 'b2', name: 'Ben K', login: 'bkeller', role: 'none', source: 'lansweeper' }],
    objs: [{ id: 'o1', uid: 'ls', user: 'amuster' }, { id: 'o2', uid: 'en', user: 'Anna M.' }], peopleNotSame: ['b|b2'] };
  assert.equal(mergeSamePeople(s), 2);
  assert.deepEqual(s.users.map(u => u.id), ['l', 'm', 'b', 'b2'], 'Lansweeper and Entra records go into the directory one; a hand-made account and a pair marked not the same stay');
  assert.deepEqual(s.objs.map(o => [o.uid, o.user]), [['l', 'Anna Muster'], ['l', 'Anna Muster']]);
  assert.equal(s.users[0].entra.id, 'e1');
  assert.equal(mergeSamePeople(s), 0, 'nothing left to merge');
});

test('a Lansweeper push whose user is the login of a directory person merges into them, sign-in and all', async () => {
  const srv = await startServer();
  try {
    const s = loadState(srv.db);
    s.users.push(P('ldap-amuster', 'Anna Muster', { login: 'amuster', source: 'ldap', role: 'viewer', aliases: ['anna.muster@corp.example'] }),
      P('ls-x', 'anna.muster@corp.example', { login: 'anna.muster@corp.example', source: 'lansweeper' }));
    s.objs = [{ id: 'n1', code: 'INV-1', type: 'notebook', name: 'NB-1', status: 'active', loc: '', feed: { sys: 'Lansweeper', ref: '7', seen: '' }, uid: 'ls-x', user: 'anna.muster@corp.example' }];
    saveState(srv.db, s);
    setPassword(srv.db, 'ls-x', 'lspassword12345');
    const st = loadState(srv.db);
    const counts = mergeRecords(st, [{ ref: '7', name: 'NB-1', user: 'CORP\\amuster', userName: 'Anna Muster', userDept: 'IT' }]);
    assert.equal(counts.merged, 1);
    saveState(srv.db, st);
    const after = loadState(srv.db);
    assert.deepEqual(after.users.filter(u => /muster/i.test(u.name + u.login)).map(u => u.id), ['ldap-amuster']);
    assert.equal(after.objs[0].uid, 'ldap-amuster');
    assert.equal(srv.db.prepare('SELECT COUNT(*) AS n FROM credentials WHERE user_id = ?').get('ls-x').n, 0, 'the merged-away record keeps no password');
    const log = srv.db.prepare("SELECT action FROM audit WHERE action LIKE 'people merged by a sync%'").all().map(r => r.action);
    assert.deepEqual(log, ['people merged by a sync: anna.muster@corp.example (Lansweeper) into Anna Muster (AD), same login']);
  } finally { await srv.close(); }
});

test('a person Lansweeper made with the login as the name (before 0.9.28) is merged into the directory account', async () => {
  const { mergeSamePeople } = await import('../public/js/people-match.js');
  const s = { users: [
    { id: 'd1', login: 'Ljucav', name: 'Ljuca Viktor', source: 'ldap', active: true, role: 'none', groups: [] },
    { id: 'l1', login: '', name: 'ljucav', dept: 'IT', source: 'lansweeper', active: true, role: 'none', groups: [] },
    { id: 'l2', login: '', name: 'Anna Muster', source: 'lansweeper', active: true, role: 'none', groups: [] },
  ], objs: [{ id: 'o1', uid: 'l1', user: 'ljucav' }] };
  assert.equal(mergeSamePeople(s), 1);
  assert.deepEqual(s.users.map(u => u.id), ['d1', 'l2'], 'a full name is not taken for a login');
  assert.deepEqual([s.objs[0].uid, s.objs[0].user], ['d1', 'Ljuca Viktor'], 'the device moves to the directory account');
  assert.equal(s.users[0].dept, 'IT');
});
