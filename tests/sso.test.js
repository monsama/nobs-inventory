/* Sign in with Microsoft: the whole round trip against a stand-in for Microsoft that signs its ID tokens with its own key.
   Only a known user with a role gets in; a token from another tenant or app, a forged one, or a sign-in started in
   another browser does not. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startServer, signIn } from './helpers.js';
import { loadState, saveState } from '../server/state.js';
import { forgetTenantMeta, userForClaims } from '../server/sso.js';

const certPem = fs.readFileSync(new URL('./fixtures/graph/test.crt', import.meta.url), 'utf8');
const keyPem = fs.readFileSync(new URL('./fixtures/graph/test.key', import.meta.url), 'utf8');
const TENANT = '11111111-2222-3333-4444-555555555555', CLIENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const graphConfig = () => ({ tenant: TENANT, clientId: CLIENT, certPem, keyPem });
const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;
const ms = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...ms.publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig' };
const sign = (claims, key = ms.privateKey, kid = 'k1') => {
  const p = [{ alg: 'RS256', kid, typ: 'JWT' }, claims].map(o => Buffer.from(JSON.stringify(o)).toString('base64url')).join('.');
  return `${p}.${crypto.sign('sha256', Buffer.from(p), key).toString('base64url')}`;
};

/* Microsoft: its configuration and keys, and the token endpoint, which hands out the token the test sets up next. */
function fakeMicrosoft() {
  const seen = { token: [] };
  let next = null;
  const f = async (url, init = {}) => {
    const u = String(url);
    const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
    if (u.endsWith('/.well-known/openid-configuration')) return json({ issuer: ISSUER, jwks_uri: 'https://keys.example/keys', token_endpoint: `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token` });
    if (u === 'https://keys.example/keys') return json({ keys: [jwk] });
    if (u.endsWith('/oauth2/v2.0/token')) { const b = new URLSearchParams(String(init.body)); seen.token.push(b); return json({ id_token: next(b) }); }
    throw new Error('unexpected ' + u);
  };
  return { f, seen, set: fn => { next = fn; } };
}

test('sign in with Microsoft: the round trip, and what is refused', async () => {
  forgetTenantMeta();
  const msft = fakeMicrosoft();
  const srv = await startServer({ graphConfig, graphFetch: msft.f });
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    assert.equal((await srv.call('GET', '/api/me')).json.sso, false, 'off by default');
    assert.equal((await fetch(srv.base + '/api/sso/start', { redirect: 'manual' })).status, 404);
    const s = loadState(srv.db);
    s.users.push({ id: 'ldap-amu', login: 'amuster', name: 'Anna Muster', source: 'ldap', role: 'viewer', active: true },
      { id: 'e-none', login: 'bfrei@corp.example', name: 'Beat Frei', source: 'entra', role: 'none', active: true, entra: { id: 'oid-b', upn: 'bfrei@corp.example' } });
    saveState(srv.db, s);
    assert.equal((await srv.call('POST', '/api/graph/settings', { cookie: a.cookie, body: { sso: 'on' } })).status, 200);
    assert.equal((await srv.call('GET', '/api/me')).json.sso, true);

    /* One sign-in: start (a redirect to Microsoft with PKCE and a bound cookie), then Microsoft's redirect back. */
    const round = async (claims, { cookie = true, key } = {}) => {
      const st = await fetch(srv.base + '/api/sso/start', { redirect: 'manual' });
      assert.equal(st.status, 302);
      const to = new URL(st.headers.get('location'));
      assert.equal(to.origin + to.pathname, `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`);
      assert.equal(to.searchParams.get('code_challenge_method'), 'S256');
      assert.equal(to.searchParams.get('redirect_uri'), `${srv.base}/api/sso/callback`);
      const bind = st.headers.get('set-cookie').split(';')[0];
      msft.set(b => sign({ iss: ISSUER, aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 600, nonce: to.searchParams.get('nonce'), ...claims(b) }, key));
      const cb = await fetch(`${srv.base}/api/sso/callback?code=c1&state=${to.searchParams.get('state')}`, { redirect: 'manual', headers: cookie ? { cookie: bind } : {} });
      const session = (cb.headers.getSetCookie() || []).find(c => /^ni_session=[^;]+/.test(c) && !/Max-Age=0/.test(c));
      return { where: cb.headers.get('location'), session: session && session.split(';')[0] };
    };
    const ok = await round(() => ({ preferred_username: 'amuster@corp.example', oid: 'oid-a' }));
    assert.equal(ok.where, '../../');
    assert.ok(ok.session, 'signed in');
    assert.equal((await srv.call('GET', '/api/me', { cookie: ok.session })).json.user.name, 'Anna Muster');
    const tb = msft.seen.token.at(-1);
    assert.equal(tb.get('grant_type'), 'authorization_code'); assert.ok(tb.get('code_verifier')); assert.ok(tb.get('client_assertion'), 'the app proves itself with its certificate');
    assert.equal((await round(() => ({ preferred_username: 'nobody@corp.example', oid: 'x' }))).where, '../../?sso=unknown');
    assert.equal((await round(() => ({ preferred_username: 'bfrei@corp.example', oid: 'oid-b' }))).where, '../../?sso=norole');
    assert.equal((await round(() => ({ preferred_username: 'amuster@corp.example', iss: 'https://login.microsoftonline.com/other/v2.0' }))).where, '../../?sso=failed', 'another tenant');
    assert.equal((await round(() => ({ preferred_username: 'amuster@corp.example', aud: 'another-app' }))).where, '../../?sso=failed', 'another app');
    assert.equal((await round(() => ({ preferred_username: 'amuster@corp.example' }), { key: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey })).where, '../../?sso=failed', 'a forged signature');
    assert.equal((await round(() => ({ preferred_username: 'amuster@corp.example' }), { cookie: false })).where, '../../?sso=failed', 'started in another browser');
    const log = (await srv.call('GET', '/api/log', { cookie: a.cookie })).json.entries.map(e => e.action);
    assert.ok(log.includes('sign in with Microsoft (amuster@corp.example)'));
    assert.ok(log.some(l => /refused: nobody@corp\.example is not a user/.test(l)));
    assert.ok(log.some(l => /failed: the token is from another tenant/.test(l)));
  } finally { await srv.close(); }
  // who a token stands for
  const users = [{ id: '1', login: 'amuster', source: 'ldap' }, { id: '2', login: 'x', entra: { id: 'OID-2', upn: 'cleo@corp.example' } }, { id: '3', login: 'dora@corp.example', active: false }];
  assert.equal(userForClaims(users, { oid: 'oid-2' }).id, '2');
  assert.equal(userForClaims(users, { preferred_username: 'Cleo@corp.example' }).id, '2');
  assert.equal(userForClaims(users, { preferred_username: 'amuster@corp.example' }).id, '1');
  assert.equal(userForClaims(users, { preferred_username: 'dora@corp.example' }), null, 'not a deactivated user');
});
