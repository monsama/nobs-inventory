/* Sign in with Microsoft (Entra ID), when turned on in Settings → Entra & Intune. The same app registration and
   certificate as the Graph sync: the OpenID Connect code flow with PKCE, the app proving itself with a signed assertion
   (no client secret). The ID token Microsoft returns is checked here: its signature against the tenant's published keys,
   its issuer (the tenant), audience (this app), time and nonce. The person is then one of the inventory's users, found
   by their Entra object ID, user principal name or e-mail; nobody new is let in by it. */
import crypto from 'node:crypto';
import { clientAssertion } from './graph.js';

const LOGIN = 'https://login.microsoftonline.com';
const SCOPE = 'openid profile email';
const PENDING_MS = 10 * 60 * 1000;
const b64url = b => Buffer.from(b).toString('base64url');

/* The sign-ins started and not finished yet, by their state: kept here for ten minutes. */
const pending = new Map();
function sweep(now) { for (const [k, v] of pending) if (v.until < now) pending.delete(k); }

/* Starts a sign-in: where to send the browser, and the value bound to it in a cookie, so a sign-in started in another
   browser cannot be finished in this one. */
export function startSso(cfg, redirectUri, now = Date.now()) {
  sweep(now);
  /* Many unfinished sign-ins (someone calling start in a loop): the oldest make room, not all of them. */
  while (pending.size >= 1000) pending.delete(pending.keys().next().value);
  const state = b64url(crypto.randomBytes(24)), nonce = b64url(crypto.randomBytes(24)), verifier = b64url(crypto.randomBytes(48)), bind = b64url(crypto.randomBytes(24));
  pending.set(state, { nonce, verifier, bind, redirectUri, until: now + PENDING_MS });
  const q = new URLSearchParams({ client_id: cfg.clientId, response_type: 'code', redirect_uri: redirectUri, response_mode: 'query', scope: SCOPE, state, nonce,
    code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256', prompt: 'select_account' });
  return { url: `${LOGIN}/${encodeURIComponent(cfg.tenant)}/oauth2/v2.0/authorize?${q}`, bind };
}

/* The tenant's issuer and signing keys, from its OpenID configuration: read once an hour. */
const meta = new Map();
async function tenantMeta(cfg, fetchImpl, now) {
  const m = meta.get(cfg.tenant);
  if (m && m.until > now) return m;
  const conf = await (await fetchImpl(`${LOGIN}/${encodeURIComponent(cfg.tenant)}/v2.0/.well-known/openid-configuration`, { signal: AbortSignal.timeout(15000) })).json();
  if (!conf.issuer || !conf.jwks_uri) throw new Error('the tenant\'s sign-in settings could not be read');
  const keys = (await (await fetchImpl(conf.jwks_uri, { signal: AbortSignal.timeout(15000) })).json()).keys || [];
  const fresh = { issuer: conf.issuer, tokenUrl: conf.token_endpoint || `${LOGIN}/${cfg.tenant}/oauth2/v2.0/token`, keys, until: now + 3600000 };
  meta.set(cfg.tenant, fresh);
  return fresh;
}
export const forgetTenantMeta = () => meta.clear();

/* Checks an ID token and returns its claims; throws with a short reason when anything is not right. */
export async function verifyIdToken(cfg, token, nonce, fetchImpl = fetch, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('no ID token');
  const head = JSON.parse(Buffer.from(parts[0], 'base64url').toString()), claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  if (head.alg !== 'RS256') throw new Error('an unexpected token type');
  let m = await tenantMeta(cfg, fetchImpl, now);
  let jwk = m.keys.find(k => k.kid === head.kid);
  /* Microsoft rolls its keys: an unknown one means read them again, once. */
  if (!jwk) { meta.delete(cfg.tenant); m = await tenantMeta(cfg, fetchImpl, now); jwk = m.keys.find(k => k.kid === head.kid); }
  if (!jwk) throw new Error('the token is signed with an unknown key');
  const ok = crypto.verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), crypto.createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('the token\'s signature is not right');
  const t = Math.floor(now / 1000), skew = 300;
  if (claims.iss !== m.issuer) throw new Error('the token is from another tenant');
  if (claims.aud !== cfg.clientId) throw new Error('the token is for another app');
  if (!(claims.exp > t - skew) || (claims.nbf && claims.nbf > t + skew)) throw new Error('the token has expired');
  if (claims.nonce !== nonce) throw new Error('the sign-in does not match');
  return claims;
}

/* Finishes a sign-in: checks the state and its cookie, swaps the code for the tokens and checks the ID token. */
export async function finishSso(cfg, { state, code, bind }, fetchImpl = fetch, now = Date.now()) {
  sweep(now);
  const p = pending.get(String(state || ''));
  pending.delete(String(state || ''));
  if (!p || !bind || p.bind.length !== String(bind).length || !crypto.timingSafeEqual(Buffer.from(p.bind), Buffer.from(String(bind)))) throw new Error('the sign-in was started elsewhere or too long ago');
  const m = await tenantMeta(cfg, fetchImpl, now);
  const body = new URLSearchParams({ client_id: cfg.clientId, grant_type: 'authorization_code', code: String(code || ''), redirect_uri: p.redirectUri, code_verifier: p.verifier, scope: SCOPE,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: clientAssertion(cfg, new Date(now)) });
  const r = await fetchImpl(m.tokenUrl, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id_token) throw new Error(String(j.error_description || j.error || `Microsoft answered ${r.status}`).split('\r')[0].slice(0, 200));
  return verifyIdToken(cfg, j.id_token, p.nonce, fetchImpl, now);
}

/* The inventory's user the claims stand for: by Entra object ID first. The address in the token (preferred_username,
   upn, email) is not proof of who someone is, so it is used only when no user is linked to that object ID, never for a
   user linked to another object ID, and never for a guest (a token from another home tenant: its address is theirs).
   Then a user principal name (an Entra user's, or a login or e-mail that is it), then the directory login that is the
   name before the @, when the address is in one of the organisation's own domains (those of its users' addresses) and
   only one user has that login. */
export function userForClaims(users, claims) {
  const low = v => String(v || '').trim().toLowerCase();
  const oid = low(claims.oid), upn = low(claims.preferred_username || claims.upn || claims.email);
  const live = users.filter(u => u.active !== false);
  const one = list => list.length === 1 ? list[0] : null;
  const byOid = oid && one(live.filter(u => u.entra && low(u.entra.id) === oid));
  if (byOid) return byOid;
  if (oid && users.some(u => u.entra && low(u.entra.id) === oid)) return null;
  /* A guest's token names its home tenant in idp (a member's has none, or this tenant); acct 1 is a guest, too. */
  const guest = (!!claims.idp && !(claims.tid && low(claims.idp).includes(low(claims.tid)))) || String(claims.acct) === '1';
  if (!upn || guest) return null;
  const free = live.filter(u => !(u.entra && u.entra.id) || !oid || low(u.entra.id) === oid);
  const byUpn = one(free.filter(u => (u.entra && low(u.entra.upn) === upn) || low(u.login) === upn || (u.profile && low(u.profile.mail) === upn)));
  if (byUpn) return byUpn;
  const at = upn.lastIndexOf('@');
  if (at < 1) return null;
  const domainOf = v => { const t = low(v), i = t.lastIndexOf('@'); return i > 0 ? t.slice(i + 1) : ''; };
  const own = new Set(users.flatMap(u => [u.entra && u.entra.upn, u.profile && u.profile.mail, u.login].map(domainOf)).filter(Boolean));
  if (!own.has(upn.slice(at + 1))) return null;
  return one(free.filter(u => u.source === 'ldap' && low(u.login) === upn.slice(0, at)));
}
