/* Sign-in timing, the LDAP ports an address saved in Settings may use, and what a connection test says when nothing answers. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import { ldapPortProblem } from '../server/ldap-config.js';
import { isUnreachable, ldapHint } from '../server/ldap.js';

test('a failed sign-in takes the same time, whether the login exists or not', async () => {
  const srv = await startServer({ loginFailMs: 300 });
  try {
    const timed = async login => { const t = Date.now(); const r = await fetch(srv.base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, password: 'wrong' }) }); assert.equal(r.status, 401); return Date.now() - t; };
    assert.ok(await timed('admin') >= 290, 'a known login waits');
    assert.ok(await timed('nobody-here') >= 290, 'an unknown login waits as long');
  } finally { await srv.close(); }
});

test('a directory address saved in Settings uses an LDAP port, or one the server allows', () => {
  for (const u of ['ldaps://dc1.corp.ch', 'ldap://dc1.corp.ch', 'ldaps://dc1.corp.ch:636', 'ldap://dc1:3268', 'ldaps://dc1:3269']) assert.equal(ldapPortProblem(u, {}), '', u);
  assert.match(ldapPortProblem('ldap://10.0.0.5:22', {}), /Port 22 is not a directory port/);
  assert.equal(ldapPortProblem('ldaps://dc1:10636', { NI_LDAP_PORTS: '10636, 10389' }), '');
});

test('nothing answering reads the same whatever the reason, so the test cannot map the network', () => {
  for (const m of ['connect ECONNREFUSED 10.0.0.5:389', 'getaddrinfo ENOTFOUND dc9', 'connection timed out', 'connect EHOSTUNREACH 10.1.1.1:636']) assert.ok(isUnreachable(m), m);
  assert.ok(!isUnreachable('unable to verify the first certificate'));
  assert.match(ldapHint('connect'), /cannot be reached/);
});

test('an icon cannot hide an attribute behind a > inside quotes; the directory settings never name LAPS or BitLocker', async () => {
  const { svgProblem } = await import('../server/state.js');
  const { ldapSettingsProblem } = await import('../server/ldap.js');
  assert.ok(svgProblem('<path id="r>" onmouseover="alert(1)" d="M0 0h24v24H0z"/>'));
  assert.ok(!svgProblem('<path d="M0 0h24" fill="none"/><circle cx="1" cy="2" r="3"/>'));
  assert.match(ldapSettingsProblem({ loginAttr: 'ms-Mcs-AdmPwd' }), /LAPS or BitLocker/);
  assert.match(ldapSettingsProblem({ loginAttr: 'sAMAccountName', userFilter: '(objectClass=msFVE-RecoveryInformation)' }), /LAPS or BitLocker/);
  assert.match(ldapSettingsProblem({ loginAttr: 'cn)(x' }), /one attribute/);
  assert.equal(ldapSettingsProblem({ loginAttr: 'userPrincipalName', userFilter: '(objectClass=person)' }), '');
});

test('a body outside /api is never read, and a malformed session cookie is no session', async () => {
  const { readCookie } = await import('../server/auth.js');
  assert.equal(readCookie('ni_session=%', 'ni_session'), null);
  assert.equal(readCookie('a=1; ni_session=x%20y', 'ni_session'), 'x y');
  const srv = await startServer({});
  try {
    const big = JSON.stringify({ x: 'a'.repeat(3 * 1048576) });
    const r = await fetch(srv.base + '/somewhere', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: big });
    assert.equal(r.status, 404);
    const me = await fetch(srv.base + '/api/me', { headers: { cookie: 'ni_session=%' } });
    assert.notEqual(me.status, 500, 'a broken cookie is not a server error');
  } finally { await srv.close(); }
});

test('a compressed body is refused before it is read, and refused pushes do not flood the log', async () => {
  const { startServer } = await import('./helpers.js');
  const zlib = await import('node:zlib');
  const srv = await startServer();
  try {
    const body = zlib.gzipSync(Buffer.from(JSON.stringify({ login: 'x'.repeat(5_000_000), password: 'y' })));
    const r = await fetch(srv.base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', Origin: srv.base }, body });
    assert.equal(r.status, 415);
    const before = srv.db.prepare('SELECT COUNT(*) AS n FROM audit').get().n;
    for (let i = 0; i < 30; i++) await fetch(srv.base + '/api/feed/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' }, body: '{"records":[]}' });
    assert.ok(srv.db.prepare('SELECT COUNT(*) AS n FROM audit').get().n - before <= 2, 'one line a minute for an address');
  } finally { await srv.close(); }
});

test('a backup file cannot bring in a person with a role whom Microsoft sign-in would find', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const { openDb } = await import('../server/db.js');
  const { bootstrap } = await import('../server/index.js');
  const { restoreBackup } = await import('../server/backup.js');
  const { loadState } = await import('../server/state.js');
  const db = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ni-rs-')), 'i.db'));
  bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
  const users = [{ id: 'u-x', login: '', name: 'X', role: 'admin', active: true, entra: { id: 'oid-x' } }, { id: 'u-y', login: '', name: 'Y', role: 'viewer', active: true, source: 'lansweeper' }];
  restoreBackup(db, { version: 1, state: { objs: [], rels: [], users, types: {}, history: {}, settings: {} } });
  const s = loadState(db);
  assert.equal(s.users.find(u => u.id === 'u-x').role, 'none');
  assert.equal(s.users.find(u => u.id === 'u-y').role, 'viewer', 'a device owner without any way to sign in comes back as it was');
  db.close();
});
