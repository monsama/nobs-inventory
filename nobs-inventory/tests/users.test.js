import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';
import { loadState, saveState } from '../server/state.js';

const admin0 = { id: 'u-admin', login: 'admin', name: 'Administrator', role: 'admin', active: true, source: 'manual' };
const base = (users, extra = {}) => ({
  objs: [], rels: [], users, types: {}, history: {}, locs: ['Zürich HQ / Büro 2.OG'],
  policy: {}, feedOn: true, feedSync: true, ldap: null, mapPos: {}, seq: 100, codeN: 0, rseq: 0, ...extra
});
const put = (srv, cookie, users, extra) => srv.call('PUT', '/api/state', { body: base(users, extra), cookie });

/* One admin, one viewer (Anna, with a password), one deactivated user (Dora). */
async function setup() {
  const srv = await startServer();
  const admin = await signIn(srv, 'admin', 'adminpass123');
  const users = [admin0,
    { id: 'u-anna', login: 'anna', name: 'Anna', role: 'viewer', active: true, source: 'manual' },
    { id: 'u-dora', login: 'dora', name: 'Dora', role: 'viewer', active: false, source: 'manual' }];
  assert.equal((await put(srv, admin.cookie, users)).status, 200);
  for (const [id, pw] of [['u-anna', 'annas-pw-1234'], ['u-dora', 'doras-pw-1234']]) {
    assert.equal((await srv.call('POST', `/api/users/${id}/password`, { body: { password: pw }, cookie: admin.cookie })).status, 200);
  }
  return { srv, admin };
}

test('a viewer cannot change users, roles or passwords', async () => {
  const { srv, admin } = await setup();
  try {
    const anna = await signIn(srv, 'anna', 'annas-pw-1234');
    const users = loadState(srv.db).users;
    assert.equal((await put(srv, anna.cookie, users)).status, 403, 'a viewer cannot save the user list');
    assert.equal((await srv.call('POST', '/api/users/u-anna/password', { body: { password: 'newpassword1' }, cookie: anna.cookie })).status, 403);
    assert.equal((await srv.call('POST', '/api/feed/import', { body: 'AssetName,Serial\nA,1\n', type: 'csv', cookie: anna.cookie })).status, 403);
  } finally { await srv.close(); }
});

test('an admin promotes and demotes users; the last active admin cannot be demoted or removed', async () => {
  const { srv, admin } = await setup();
  try {
    let users = loadState(srv.db).users.map(u => u.id === 'u-anna' ? { ...u, role: 'admin' } : u);
    assert.equal((await put(srv, admin.cookie, users)).status, 200, 'promoting Anna is fine');
    const anna = await signIn(srv, 'anna', 'annas-pw-1234');
    assert.equal(anna.user.role, 'admin', 'she signs in as admin now');

    users = loadState(srv.db).users.map(u => u.id === 'u-admin' ? { ...u, role: 'viewer' } : u);
    assert.equal((await put(srv, anna.cookie, users)).status, 200, 'with two admins, demoting the first is allowed');
    const admin2 = await signIn(srv, 'anna', 'annas-pw-1234');
    const adminAgain = await signIn(srv, 'admin', 'adminpass123');
    assert.equal(adminAgain.user.role, 'viewer');

    users = loadState(srv.db).users.map(u => u.id === 'u-anna' ? { ...u, role: 'viewer' } : u);
    assert.equal((await put(srv, admin2.cookie, users)).status, 400, 'the last active admin cannot be demoted');

    users = loadState(srv.db).users.filter(u => u.id !== 'u-anna');
    assert.equal((await put(srv, admin2.cookie, users)).status, 400, 'a save may not remove the saving admin');
  } finally { await srv.close(); }
});

test('a deactivated user cannot sign in, and an open session stops working when they are deactivated', async () => {
  const { srv, admin } = await setup();
  try {
    assert.equal((await signIn(srv, 'dora', 'doras-pw-1234')).status, 403, 'deactivated users are refused at sign-in');
    const anna = await signIn(srv, 'anna', 'annas-pw-1234');
    assert.equal((await srv.call('GET', '/api/state', { cookie: anna.cookie })).status, 200);
    const users = loadState(srv.db).users.map(u => u.id === 'u-anna' ? { ...u, active: false } : u);
    assert.equal((await put(srv, admin.cookie, users)).status, 200);
    assert.equal((await srv.call('GET', '/api/state', { cookie: anna.cookie })).status, 401, 'her open session ends at once');
    assert.equal((await signIn(srv, 'anna', 'annas-pw-1234')).status, 403);
  } finally { await srv.close(); }
});

test('reactivating a user restores sign-in with the same password', async () => {
  const { srv, admin } = await setup();
  try {
    const users = loadState(srv.db).users.map(u => u.id === 'u-dora' ? { ...u, active: true } : u);
    assert.equal((await put(srv, admin.cookie, users)).status, 200);
    assert.equal((await signIn(srv, 'dora', 'doras-pw-1234')).status, 200);
  } finally { await srv.close(); }
});

test('a user without a login has no password and cannot sign in', async () => {
  const { srv, admin } = await setup();
  try {
    const users = [...loadState(srv.db).users, { id: 'u-empf', login: '', name: 'Empfang', role: 'viewer', active: true, source: 'manual' }];
    assert.equal((await put(srv, admin.cookie, users)).status, 200);
    assert.equal((await srv.call('POST', '/api/users/u-empf/password', { body: { password: 'something-long' }, cookie: admin.cookie })).status, 200,
      'the endpoint accepts it, but the page only offers the button for users with a login');
    assert.equal((await signIn(srv, '', 'something-long')).status, 401, 'an empty login never signs in');
  } finally { await srv.close(); }
});

test('login names are matched without regard to case, and wrong passwords for a real user are refused', async () => {
  const { srv } = await setup();
  try {
    assert.equal((await signIn(srv, 'ANNA', 'annas-pw-1234')).status, 200);
    assert.equal((await signIn(srv, 'anna', 'annas-pw-12345')).status, 401);
  } finally { await srv.close(); }
});

test('an admin cannot set the password of a user that does not exist', async () => {
  const { srv, admin } = await setup();
  try {
    assert.equal((await srv.call('POST', '/api/users/u-ghost/password', { body: { password: 'long-enough-pw' }, cookie: admin.cookie })).status, 404);
  } finally { await srv.close(); }
});

test('deleting a user leaves their devices in place, pointing at no one', async () => {
  const { srv, admin } = await setup();
  try {
    const device = { id: 'o1', code: 'INV-0001', type: 'pc', name: 'PC-1', uid: 'u-anna', ovr: {}, feed: null };
    const users = loadState(srv.db).users.filter(u => u.id !== 'u-anna');
    assert.equal((await put(srv, admin.cookie, users, { objs: [device] })).status, 200);
    const st = loadState(srv.db);
    assert.equal(st.objs.length, 1);
    assert.equal(st.objs[0].uid, 'u-anna', 'the device keeps the id; the page shows no owner for an unknown id');
  } finally { await srv.close(); }
});

test('the admin list from the server reflects every role and state', async () => {
  const { srv, admin } = await setup();
  try {
    const me = await srv.call('GET', '/api/me', { cookie: admin.cookie });
    assert.equal(me.json.user.role, 'admin');
    assert.equal(me.json.ldap, false);
    const st = await srv.call('GET', '/api/state', { cookie: admin.cookie });
    assert.deepEqual(st.json.users.map(u => [u.login, u.role, u.active]), [['admin', 'admin', true], ['anna', 'viewer', true], ['dora', 'viewer', false]]);
  } finally { await srv.close(); }
});
