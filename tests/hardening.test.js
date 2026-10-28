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
