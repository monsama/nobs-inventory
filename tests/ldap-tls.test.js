import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ldap from 'ldapjs';
import { startServer, signIn } from './helpers.js';
import { ldapListUsers, ldapHint, PLAIN_LDAP_ERROR } from '../server/ldap.js';
import { parseCaCerts, ldapConfigOf } from '../server/ldap-config.js';
import { PAGE_SETTINGS, loadState, saveState } from '../server/state.js';

/* How the directory connection is secured: a company CA added in Settings, StartTLS on ldap://, and unencrypted only
   when chosen. The certificates in fixtures/ldap are a test CA and a server certificate it issued. */
const fixture = name => fs.readFileSync(new URL('./fixtures/ldap/' + name, import.meta.url));
const caDer = fixture('ca.cer'), caPem = fixture('ca.crt').toString(), dcPem = fixture('dc.crt').toString();
const b64 = v => Buffer.from(v).toString('base64');

test('a CA certificate is taken as Windows exports it (DER) or as PEM; a server certificate or another file is refused', () => {
  const der = parseCaCerts(b64(caDer));
  assert.deepEqual(der.certs.map(c => c.name), ['Test-Root-CA']);
  assert.match(der.pem, /^-----BEGIN CERTIFICATE-----/);
  assert.equal(parseCaCerts(b64(caPem)).pem, der.pem);
  assert.throws(() => parseCaCerts(b64(dcPem)), /dc01\.example\.test is a server's own certificate.*Test-Root-CA/);
  assert.throws(() => parseCaCerts(b64('not a certificate')), /not a certificate/);
  assert.throws(() => parseCaCerts(''), /Choose the CA certificate/);
});

/* An LDAPS server with the certificate the test CA issued. */
function startLdaps() {
  const dir = ldap.createServer({ certificate: dcPem, key: fixture('dc.key').toString() });
  dir.bind('dc=test', (req, res, next) => { res.end(); return next(); });
  dir.search('dc=test', (req, res, next) => { res.end(); return next(); });
  return new Promise(resolve => dir.listen(0, '127.0.0.1', () => resolve(dir)));
}

test('ldaps:// to a server whose certificate a company CA issued: refused without the CA, works with it', async () => {
  const dir = await startLdaps();
  try {
    const cfg = { url: `ldaps://localhost:${dir.address().port}`, searchBase: 'dc=test', serviceDn: 'cn=svc,dc=test', servicePassword: 'x', group: 'Inventory', loginAttr: 'sAMAccountName' };
    const err = await ldapListUsers(cfg).then(() => null, e => e);
    assert.ok(err, 'not trusted without the CA');
    assert.match(ldapHint(err.message), /Add the certificate of the CA that issued it under CA certificate in Settings/);
    assert.deepEqual(await ldapListUsers({ ...cfg, caPem }), [], 'trusted with the CA added');
  } finally { dir.close(); }
});

test('StartTLS: an ldap:// address is upgraded before the sign-in, checked against its own name; unencrypted only when chosen', async () => {
  const calls = [];
  const fake = opts => {
    calls.push(['connect', opts.url, !!opts.tlsOptions]);
    return { on() {}, unbind() {}, starttls(o, controls, cb) { calls.push(['starttls', o.servername, o.ca.length > 1]); cb(null); },
      bind(dn, pw, cb) { calls.push(['bind']); cb(null); }, search(base, o, cb) { cb(null, { on(ev, f) { if (ev === 'end') f(); } }); } };
  };
  const cfg = { url: 'ldap://dc01.example.test', searchBase: 'dc=test', serviceDn: 'cn=svc', servicePassword: 'x', group: 'G', loginAttr: 'sAMAccountName', createClient: fake };
  await assert.rejects(ldapListUsers(cfg), e => e.message === PLAIN_LDAP_ERROR);
  assert.deepEqual(calls, [], 'nothing is sent unencrypted');
  await ldapListUsers({ ...cfg, security: 'starttls', caPem });
  assert.deepEqual(calls, [['connect', 'ldap://dc01.example.test', false], ['starttls', 'dc01.example.test', true], ['bind']]);
  calls.length = 0;
  await ldapListUsers({ ...cfg, allowPlain: true });
  assert.deepEqual(calls.map(c => c[0]), ['connect', 'bind'], 'unencrypted when it was allowed');
});

test('Settings: the security choice reaches the connection, and the CA is added and removed by an admin only', async () => {
  const srv = await startServer();
  try {
    const s = loadState(srv.db);
    saveState(srv.db, { ...s, ldap: { url: 'ldap://dc01.example.test', security: 'plain', searchBase: 'DC=example,DC=test' } });
    assert.equal(ldapConfigOf(srv.db, {}).allowPlain, true, 'None in Settings allows ldap:// unencrypted');
    saveState(srv.db, { ...loadState(srv.db), ldap: { url: 'ldap://dc01.example.test', security: 'starttls' } });
    assert.deepEqual([ldapConfigOf(srv.db, {}).security, ldapConfigOf(srv.db, {}).allowPlain], ['starttls', false]);
    saveState(srv.db, { ...loadState(srv.db), ldap: { url: 'ldap://dc01.example.test', security: 'anything' } });
    assert.equal(ldapConfigOf(srv.db, {}).security, '', 'an unknown choice is not taken');

    const a = await signIn(srv, 'admin', 'adminpass123');
    const bad = await srv.call('POST', '/api/ldap/ca', { cookie: a.cookie, body: { file: b64(dcPem) } });
    assert.equal(bad.status, 400);
    const ok = await srv.call('POST', '/api/ldap/ca', { cookie: a.cookie, body: { file: b64(caDer) } });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.match(ldapConfigOf(srv.db, {}).caPem, /BEGIN CERTIFICATE/, 'used for the next connection');
    assert.equal(loadState(srv.db).ldapCa.certs[0].name, 'Test-Root-CA');
    assert.ok(!PAGE_SETTINGS.includes('ldapCa'), 'only the server writes it');
    assert.equal((await srv.call('DELETE', '/api/ldap/ca', { cookie: a.cookie })).status, 200);
    assert.equal(loadState(srv.db).ldapCa, undefined);
  } finally { await srv.close(); }
});

test('the server\'s secrets go only where they were meant to: Lansweeper\'s API, and the directory server the password was saved for', async () => {
  const { lansweeperConfigOf, graphql } = await import('../server/lansweeper.js');
  /* A Lansweeper API address changed in Settings to another host does not get the server's token. */
  const srv0 = await startServer();
  try {
    saveState(srv0.db, { ...loadState(srv0.db), lansweeper: { endpoint: 'https://attacker.example/graphql' } });
    const ls = lansweeperConfigOf(srv0.db, { NI_LS_TOKEN: 'SERVER-TOKEN' });
    assert.match(ls.endpointProblem, /not Lansweeper's/);
    let sent = false;
    await assert.rejects(graphql(ls, '{x}', {}, async () => { sent = true; return { ok: true, json: async () => ({}) }; }), /not Lansweeper's/);
    assert.equal(sent, false, 'nothing is sent');
    saveState(srv0.db, { ...loadState(srv0.db), lansweeper: { endpoint: 'https://eu.api.lansweeper.com/api/v2/graphql' } });
    assert.equal(lansweeperConfigOf(srv0.db, { NI_LS_TOKEN: 'SERVER-TOKEN' }).endpointProblem, undefined, 'Lansweeper\'s own hosts are fine');
    /* The server's LDAP password is for the server NI_LDAP_URL names. */
    saveState(srv0.db, { ...loadState(srv0.db), ldap: { url: 'ldaps://evil.example', serviceDn: 'cn=svc' } });
    const lc = ldapConfigOf(srv0.db, { NI_LDAP_URL: 'ldaps://dc01.example.test', NI_LDAP_SERVICE_PASSWORD: 'SERVER-PW' });
    assert.equal(lc.servicePassword, '');
    await assert.rejects(ldapListUsers(lc), /is for dc01\.example\.test, not evil\.example/);
  } finally { await srv0.close(); }

  /* The password saved in Settings is tied to the directory server it was saved for. */
  let url = 'ldaps://dc01.example.test';
  const srv = await startServer({ ldapConfig: () => ({ url, serviceDn: 'cn=svc', searchBase: 'dc=test', group: 'G', loginAttr: 'sAMAccountName', bindTemplate: '{login}' }) });
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    assert.equal((await srv.call('POST', '/api/ldap/password', { cookie: a.cookie, body: { password: 'svc-secret' } })).status, 200);
    url = 'ldaps://evil.example';
    const r = await srv.call('POST', '/api/ldap/sync', { cookie: a.cookie });
    assert.notEqual(r.status, 200);
    assert.match(JSON.stringify(r.json), /saved for dc01\.example\.test.*Save the password again/);
  } finally { await srv.close(); }
});
