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
    return { async unbind() {}, async startTLS(o) { calls.push(['starttls', o.servername, o.ca.length > 1]); },
      async bind() { calls.push(['bind']); }, async search() { return { searchEntries: [], searchReferences: [] }; } };
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

test('an untrusted directory certificate is described: who it is for, who issued it, and what to do', async () => {
  const { ldapCertReport } = await import('../server/ldap.js');
  const dir = await startLdaps();
  const port = dir.address().port;
  try {
    const cfg = { url: `ldaps://localhost:${port}`, searchBase: 'dc=test', serviceDn: 'cn=svc,dc=test', servicePassword: 'x', group: 'G', loginAttr: 'sAMAccountName' };
    /* No CA added: the issuer to add is named. */
    const none = await ldapCertReport(cfg);
    assert.match(none.text, /certificate of dc01\.example\.test, issued by Test-Root-CA, valid until \d\d\.\d\d\.\d{4}/);
    assert.match(none.text, /Add the certificate of Test-Root-CA under CA certificate/);
    /* Another CA added (the -1 case): it is said that it did not issue it, and which one did. */
    const other = await ldapCertReport({ ...cfg, caPem: fixture('other-ca.crt').toString() });
    assert.match(other.text, /The CA certificate in Settings \(Other-Root-CA\) did not issue it: add the certificate of Test-Root-CA instead/);
    /* The right CA, but an IP address in the server address: the names it is made for. */
    const ip = await ldapCertReport({ ...cfg, url: `ldaps://127.0.0.1:${port}`, caPem });
    assert.equal(ip.trustedByAdded, true);
    assert.match(ip.text, /made for dc01\.example\.test, localhost, not for 127\.0\.0\.1: use one of these names/);
    /* Through Test connection, without running openssl anywhere. */
    const srv = await startServer({ ldapConfig: () => ({ ...cfg, bindTemplate: '{login}' }) });
    try {
      const a = await signIn(srv, 'admin', 'adminpass123');
      const r = await srv.call('POST', '/api/ldap/test', { cookie: a.cookie });
      assert.equal(r.status, 502);
      assert.match(r.json.error, /presented the certificate of dc01\.example\.test, issued by Test-Root-CA/);
    } finally { await srv.close(); }
  } finally { dir.close(); }
});

test('a domain controller certificate with a 1024-bit key: refused, and the report says why and what to do', async () => {
  const tlsMod = await import('node:tls');
  const { ldapCertReport, ldapHint } = await import('../server/ldap.js');
  /* A server that presents the weak certificate, as an old domain controller does. Only the handshake matters. */
  const server = tlsMod.createServer({ cert: fixture('dc-weak.crt'), key: fixture('dc-weak.key'), ciphers: 'DEFAULT@SECLEVEL=0' }, s => s.end());
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const cfg = { url: `ldaps://localhost:${server.address().port}`, searchBase: 'dc=test', serviceDn: 'cn=svc', servicePassword: 'x', group: 'G', loginAttr: 'sAMAccountName', caPem };
    /* What Node says to it at security level 2, the default of the Node 26 image (older Nodes accept 1024 bits). */
    const err = await new Promise(resolve => { const s = tlsMod.connect({ host: 'localhost', port: server.address().port, ca: caPem, ciphers: 'DEFAULT@SECLEVEL=2' }, () => { s.end(); resolve(null); }); s.on('error', resolve); });
    assert.match(String(err && err.message), /key too (weak|small)/i, 'Node refuses the weak key: ' + (err && err.message));
    assert.match(ldapHint(err.message), /too short.*2048 bits/);
    const r = await ldapCertReport(cfg);
    assert.equal(r.bits, 1024); assert.equal(r.weak, true);
    assert.match(r.text, /dc-weak\.example\.test, issued by Test-Root-CA, valid until .*, with a 1024-bit RSA key\. That key is too short/);
    assert.ok(!/did not issue it/.test(r.text), 'the CA is the right one');
  } finally { server.close(); }
});

test('"Accept old certificates" lets a 1024-bit key through at security level 1, only when chosen, and still checks the CA', async () => {
  const tlsMod = await import('node:tls');
  const { LEGACY_CIPHERS } = await import('../server/ldap.js');
  const server = tlsMod.createServer({ cert: fixture('dc-weak.crt'), key: fixture('dc-weak.key'), ciphers: 'DEFAULT@SECLEVEL=0' }, s => s.end());
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const tryTls = opts => new Promise(resolve => { const s = tlsMod.connect({ host: 'localhost', port, ...opts }, () => { s.end(); resolve('ok'); }); s.on('error', e => resolve(e.message)); });
  try {
    assert.match(await tryTls({ ca: caPem, ciphers: 'DEFAULT@SECLEVEL=2' }), /key too (weak|small)/, 'refused as the Node 26 image does');
    assert.equal(await tryTls({ ca: caPem, ciphers: LEGACY_CIPHERS }), 'ok', 'accepted with old certificates allowed');
    assert.match(await tryTls({ ca: fixture('other-ca.crt'), ciphers: LEGACY_CIPHERS }), /self[- ]signed|unable to (verify|get)/i, 'the CA is still checked');
  } finally { server.close(); }
  /* The option reaches the connection only when it is on, for ldaps:// and StartTLS. */
  const seen = [];
  const fake = opts => { seen.push(['connect', opts.tlsOptions && opts.tlsOptions.ciphers]); return { async unbind() {}, async startTLS(o) { seen.push(['starttls', o.ciphers]); }, async bind() {}, async search() { return { searchEntries: [], searchReferences: [] }; } }; };
  const base = { searchBase: 'dc=test', serviceDn: 'cn=svc', servicePassword: 'x', group: 'G', loginAttr: 'sAMAccountName', createClient: fake };
  await ldapListUsers({ ...base, url: 'ldaps://dc01.example.test' });
  await ldapListUsers({ ...base, url: 'ldaps://dc01.example.test', legacyTls: 'on' });
  await ldapListUsers({ ...base, url: 'ldap://dc01.example.test', security: 'starttls', legacyTls: 'on' });
  assert.deepEqual(seen, [['connect', undefined], ['connect', LEGACY_CIPHERS], ['connect', undefined], ['starttls', LEGACY_CIPHERS]]);
  /* Saved in Settings as 'on'; anything else is off. */
  const srv = await startServer();
  try {
    saveState(srv.db, { ...loadState(srv.db), ldap: { url: 'ldaps://dc01.example.test', legacyTls: 'on' } });
    assert.equal(ldapConfigOf(srv.db, {}).legacyTls, 'on');
    saveState(srv.db, { ...loadState(srv.db), ldap: { url: 'ldaps://dc01.example.test', legacyTls: 'yes please' } });
    assert.equal(ldapConfigOf(srv.db, {}).legacyTls, '');
  } finally { await srv.close(); }
});
