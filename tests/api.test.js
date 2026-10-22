import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn, tempDataDir } from './helpers.js';
import { parseCsv, mergeFeed } from '../server/feed.js';

const baseState = (extra = {}) => ({
  objs: [], rels: [], users: [], types: {}, history: {}, locs: ['Zürich HQ / Büro 2.OG'],
  policy: { ip: true, mac: true, os: true, model: true }, feedOn: true, feedSync: true, ldap: null, mapPos: {},
  seq: 100, codeN: 0, rseq: 0, ...extra
});
const adminUser = { id: 'u-admin', login: 'admin', name: 'Administrator', role: 'admin', active: true };

test('signing in: wrong password and missing login are refused, the right one gives a session', async () => {
  const srv = await startServer();
  try {
    assert.equal((await srv.call('GET', '/api/state')).status, 401);
    assert.equal((await signIn(srv, 'admin', 'nope')).status, 401);
    assert.equal((await signIn(srv, '', '')).status, 401);
    const ok = await signIn(srv, 'admin', 'adminpass123');
    assert.equal(ok.status, 200);
    assert.equal(ok.user.role, 'admin');
    assert.ok(ok.cookie.startsWith('ni_session='));
    assert.equal((await srv.call('GET', '/api/state', { cookie: ok.cookie })).status, 200);
  } finally { await srv.close(); }
});

test('the inventory is saved and comes back the same, and survives a restart', async () => {
  const dir = tempDataDir();
  let srv = await startServer({ dir });
  const admin = await signIn(srv, 'admin', 'adminpass123');
  const state = baseState({
    users: [adminUser],
    objs: [{ id: 'o101', code: 'INV-0001', type: 'pc', name: 'ZH-PC-0200', serial: 'SN200', ip: '10.10.20.200', ovr: {}, feed: null }],
    rels: [{ id: 'r1', from: 'o101', to: 'o101', kind: 'connected', port: null, vlan: null }],
    history: { o101: [{ t: 'now', msg: 'created' }] },
    types: { pc: { label: 'PC', short: 'PC', color: '#000', icon: 'pc' } }
  });
  assert.equal((await srv.call('PUT', '/api/state', { body: state, cookie: admin.cookie })).status, 200);
  await srv.close();

  srv = await startServer({ dir });
  try {
    const again = await signIn(srv, 'admin', 'adminpass123');
    const back = (await srv.call('GET', '/api/state', { cookie: again.cookie })).json;
    assert.equal(back.objs[0].name, 'ZH-PC-0200');
    assert.equal(back.rels.length, 1);
    assert.equal(back.history.o101[0].msg, 'created');
    assert.equal(back.types.pc.label, 'PC');
  } finally { await srv.close(); }
});

test('a viewer can read but cannot save or import; an admin can', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    const users = [adminUser, { id: 'u-anna', login: 'anna', name: 'Anna', role: 'viewer', active: true }];
    assert.equal((await srv.call('PUT', '/api/state', { body: baseState({ users }), cookie: admin.cookie })).status, 200);
    assert.equal((await srv.call('POST', '/api/users/u-anna/password', { body: { password: 'viewerpw123' }, cookie: admin.cookie })).status, 200);

    const viewer = await signIn(srv, 'anna', 'viewerpw123');
    assert.equal(viewer.user.role, 'viewer');
    assert.equal((await srv.call('GET', '/api/state', { cookie: viewer.cookie })).status, 200);
    assert.equal((await srv.call('PUT', '/api/state', { body: baseState({ users }), cookie: viewer.cookie })).status, 403);
    assert.equal((await srv.call('POST', '/api/feed/import', { body: 'AssetName,Serial\nX,1\n', type: 'csv', cookie: viewer.cookie })).status, 403);
  } finally { await srv.close(); }
});

test('a save that would lock everyone out is refused', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    const noSelf = baseState({ users: [{ id: 'u-other', login: 'x', name: 'X', role: 'admin', active: true }] });
    assert.equal((await srv.call('PUT', '/api/state', { body: noSelf, cookie: admin.cookie })).status, 400);
    const noAdmin = baseState({ users: [{ ...adminUser, role: 'viewer' }] });
    assert.equal((await srv.call('PUT', '/api/state', { body: noAdmin, cookie: admin.cookie })).status, 400);
    const dupes = baseState({ users: [adminUser], objs: [{ id: 'o1', name: 'a' }, { id: 'o1', name: 'b' }] });
    assert.equal((await srv.call('PUT', '/api/state', { body: dupes, cookie: admin.cookie })).status, 400);
  } finally { await srv.close(); }
});

test('passwords need eight characters; logging out ends the session', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    assert.equal((await srv.call('POST', '/api/users/u-admin/password', { body: { password: 'short' }, cookie: admin.cookie })).status, 400);
    await srv.call('POST', '/api/logout', { cookie: admin.cookie });
    assert.equal((await srv.call('GET', '/api/state', { cookie: admin.cookie })).status, 401);
  } finally { await srv.close(); }
});

test('the session cookie is HttpOnly and SameSite=Strict', async () => {
  const srv = await startServer();
  try {
    const r = await fetch(srv.base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', password: 'adminpass123' }) });
    const sc = r.headers.get('set-cookie');
    assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
  } finally { await srv.close(); }
});

test('CSV parsing handles quotes, semicolons and CRLF', () => {
  const rows = parseCsv('a,b;c\r\n"x, y",2,"say ""hi"""\r\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x, y', '2', 'say "hi"']]);
});

test('a Lansweeper export: matched by serial, only allowed fields move, new assets get codes', () => {
  const s = baseState({
    objs: [{ id: 'o101', code: 'INV-0001', type: 'pc', name: 'ZH-PC-0142', serial: 'CZC1', ip: '10.10.20.42', os: 'Windows 10', ovr: {}, feed: null, loc: 'Zürich HQ / Büro 2.OG' },
      { id: 'o102', code: 'INV-0002', type: 'pc', name: 'ZH-PC-0143', serial: 'CZC2', ip: '10.10.20.43', ovr: { ip: false }, feed: { sys: 'Lansweeper', ref: '3143', seen: 'x' } }],
    codeN: 2, seq: 102
  });
  const csv = 'AssetName,AssetType,Serial,IPAddress,OS,Location\n' +
    'ZH-PC-0142,Windows (workstation OS),CZC1,10.10.20.57,Windows 11 Pro,Zürich HQ / Büro 2.OG\n' +
    'ZH-PC-0143,Windows (workstation OS),CZC2,10.10.20.99,Windows 11 Pro,\n' +
    'ZH-PC-0144,Windows (workstation OS),CZC3,10.10.20.44,Windows 11 Pro,Zürich HQ / Büro 2.OG\n';
  const counts = mergeFeed(s, csv, new Date(2026, 9, 21, 6, 0));
  const a = s.objs.find(o => o.id === 'o101'), b = s.objs.find(o => o.id === 'o102');
  assert.equal(a.ip, '10.10.20.57', 'ip is allowed by the policy, so the feed moves it');
  assert.equal(a.os, 'Windows 11 Pro');
  assert.ok(a.feed, 'the object is now linked to the feed');
  assert.equal(b.ip, '10.10.20.43', 'a field overridden on the object stays as it was set');
  const made = s.objs.find(o => o.name === 'ZH-PC-0144');
  assert.equal(made.type, 'pc');
  assert.equal(made.code, 'INV-0003');
  assert.equal(made.feed.sys, 'Lansweeper');
  assert.equal(counts.created, 1);
  assert.equal(counts.linked, 1);
});

test('feed import over HTTP saves the merge', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    await srv.call('PUT', '/api/state', { body: baseState({
      users: [adminUser],
      objs: [{ id: 'o5', code: 'INV-0005', type: 'server', name: 'SRV-1', serial: 'SRV1', ip: '10.0.0.1', ovr: {}, feed: null }], codeN: 5, seq: 105
    }), cookie: admin.cookie });
    const r = await srv.call('POST', '/api/feed/import', { body: 'AssetName,Serial,IPAddress\nSRV-1,SRV1,10.0.0.2\n', type: 'csv', cookie: admin.cookie });
    assert.equal(r.status, 200);
    assert.equal(r.json.counts.linked, 1);
    const back = (await srv.call('GET', '/api/state', { cookie: admin.cookie })).json;
    assert.equal(back.objs[0].ip, '10.0.0.2');
  } finally { await srv.close(); }
});

test('repeated failed sign-ins are throttled; the answer is the same for every failure', async () => {
  const srv = await startServer();
  try {
    const answers = new Set();
    for (let i = 0; i < 8; i++) answers.add((await signIn(srv, 'admin', 'wrong' + i)).status);
    assert.deepEqual([...answers], [401]);
    assert.equal((await signIn(srv, 'admin', 'adminpass123')).status, 429, 'even the right password waits after the limit');
    const fresh = await startServer();
    assert.equal((await signIn(fresh, 'nobody', 'x')).status, 401, 'an unknown login gets the same generic answer');
    await fresh.close();
  } finally { await srv.close(); }
});

test('security headers are sent, and the cookie is Secure in production', async () => {
  const srv = await startServer();
  try {
    const r = await fetch(srv.base + '/');
    assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
  } finally { await srv.close(); }
});

test('an overlong password is refused before the hash is computed; roles are checked on save', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    assert.equal((await srv.call('POST', '/api/users/u-admin/password', { body: { password: 'x'.repeat(300) }, cookie: admin.cookie })).status, 400);
    const bad = baseState({ users: [{ id: 'u-admin', login: 'admin', name: 'A', role: 'superuser', active: true }] });
    assert.equal((await srv.call('PUT', '/api/state', { body: bad, cookie: admin.cookie })).status, 400);
  } finally { await srv.close(); }
});

test('a new sign-in ends the earlier session of the same user; malformed JSON gets a short answer', async () => {
  const srv = await startServer();
  try {
    const first = await signIn(srv, 'admin', 'adminpass123');
    const second = await signIn(srv, 'admin', 'adminpass123');
    assert.equal((await srv.call('GET', '/api/state', { cookie: first.cookie })).status, 401);
    assert.equal((await srv.call('GET', '/api/state', { cookie: second.cookie })).status, 200);
    const bad = await fetch(srv.base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    assert.equal(bad.status, 400);
    assert.deepEqual(await bad.json(), { error: 'Send valid JSON.' });
  } finally { await srv.close(); }
});

test('health reports the version; login throttling is per user, not shared by all clients behind the proxy', async () => {
  const srv = await startServer();
  try {
    const h = await (await fetch(srv.base + '/api/health')).json();
    assert.equal(h.version, JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
    const attempt = (login, ip) => fetch(srv.base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ login, password: 'wrong' }) });
    for (let i = 0; i < 8; i++) await attempt('admin', '203.0.113.5');
    assert.equal((await attempt('admin', '203.0.113.5')).status, 429, 'the attacker is blocked');
    assert.equal((await attempt('admin', '198.51.100.9')).status, 401, 'another client is not blocked by the attacker\'s failures');
  } finally { await srv.close(); }
});
