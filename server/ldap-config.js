import crypto from 'node:crypto';
import { readSecret } from './secrets.js';
import { HttpError } from './errors.js';

/* The directory settings. They are edited in Settings → LDAP sync and saved in the inventory, so an administrator
   can change them without a restart. The service account's password is never stored there: it comes from the
   server's environment (NI_LDAP_SERVICE_PASSWORD, or NI_LDAP_SERVICE_PASSWORD_FILE for a secret file). The settings
   from the environment (NI_LDAP_URL and the rest) still work and are used when nothing is saved in the inventory. */
const FIELDS = ['url', 'security', 'bindTemplate', 'searchBase', 'loginAttr', 'userFilter', 'group', 'adminGroup', 'serviceDn', 'computerBase', 'computerGroups'];
/* How an ldap:// address is secured: StartTLS (encrypted from the first message on), or plain (unencrypted, chosen
   knowingly). An ldaps:// address is encrypted anyway. */
export const SECURITY = ['', 'starttls', 'plain'];
const clean = v => (typeof v === 'string' ? v.trim().slice(0, 500) : '');
/* The sign-in name Active Directory takes when none is set: the login at the domain the search base names
   (DC=example,DC=ch -> {login}@example.ch). Without DC parts, the login as it is. */
export const defaultBindTemplate = searchBase => {
  const dcs = [...String(searchBase || '').matchAll(/(?:^|,)\s*DC\s*=\s*([^,]+)/gi)].map(m => m[1].trim()).filter(Boolean);
  return dcs.length ? `{login}@${dcs.join('.')}` : '{login}';
};

/* The CA certificate the directory server's certificate is checked against, added in Settings: a file as Windows exports
   it (.cer, DER or Base-64) or a PEM with the whole chain. Only CA certificates are taken; the server's own certificate
   is refused, as it cannot vouch for itself once it is renewed. Returns the PEM and what each certificate is. */
const cnOf = name => (String(name || '').match(/CN=([^\n,]+)/) || [])[1] || String(name || '').split('\n')[0];
export function parseCaCerts(base64) {
  const buf = Buffer.from(String(base64 || ''), 'base64');
  if (!buf.length || buf.length > 200000) throw new HttpError(400, 'Choose the CA certificate file (.cer, .crt or .pem).');
  const text = buf.toString('latin1');
  const blocks = /-----BEGIN CERTIFICATE-----/.test(text) ? text.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [] : [buf];
  const certs = [];
  for (const b of blocks.slice(0, 10)) {
    let c;
    try { c = new crypto.X509Certificate(b); } catch { throw new HttpError(400, 'This file is not a certificate. Export the CA certificate as .cer (DER or Base-64).'); }
    certs.push(c);
  }
  if (!certs.length) throw new HttpError(400, 'This file has no certificate in it.');
  const leaf = certs.find(c => !c.ca);
  if (leaf) throw new HttpError(400, `${cnOf(leaf.subject)} is a server's own certificate, not a CA's. Export the certificate of the CA that issued it (${cnOf(leaf.issuer)}).`);
  return {
    pem: certs.map(c => c.toString().trim()).join('\n') + '\n',
    certs: certs.map(c => ({ name: cnOf(c.subject), issuer: cnOf(c.issuer), expires: new Date(c.validTo).toISOString(), sha256: c.fingerprint256 })),
  };
}
export const ldapHostOf = u => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
const savedCa = db => { const r = db.prepare("SELECT data FROM docs WHERE kind = 'setting' AND id = 'ldapCa'").get(); const v = r ? JSON.parse(r.data) : null; return v && typeof v.pem === 'string' ? v.pem : ''; };

export function configFromEnv(env) {
  return {
    url: env.NI_LDAP_URL,
    bindTemplate: env.NI_LDAP_BIND || '{login}',
    searchBase: env.NI_LDAP_BASE || '',
    loginAttr: env.NI_LDAP_LOGIN_ATTR || 'sAMAccountName',
    adminGroup: env.NI_LDAP_ADMIN_GROUP || '',
    group: env.NI_LDAP_GROUP || '',
    serviceDn: env.NI_LDAP_SERVICE_DN || '',
    servicePassword: readSecret(env, 'NI_LDAP_SERVICE_PASSWORD'),
    userFilter: env.NI_LDAP_USER_FILTER || '',
    caFile: env.NI_LDAP_CA || '',
    allowPlain: env.NI_LDAP_ALLOW_PLAIN === '1',
    security: env.NI_LDAP_STARTTLS === '1' ? 'starttls' : '',
    computerBase: env.NI_LDAP_COMPUTER_BASE || '',
    computerGroups: env.NI_LDAP_COMPUTER_GROUPS === '0' ? 'off' : '',
  };
}

/* The directory settings in use now: the saved ones when there is an address, else the environment's. */
export function ldapConfigOf(db, env) {
  const row = db.prepare("SELECT data FROM docs WHERE kind = 'setting' AND id = 'ldap'").get();
  const saved = row ? (JSON.parse(row.data) || {}) : {};
  if (!clean(saved.url)) return env.NI_LDAP_URL ? { ...configFromEnv(env), caPem: savedCa(db) } : null;
  const cfg = Object.fromEntries(FIELDS.map(k => [k, clean(saved[k])]));
  if (!cfg.bindTemplate) cfg.bindTemplate = defaultBindTemplate(cfg.searchBase);
  if (!cfg.loginAttr) cfg.loginAttr = 'sAMAccountName';
  if (!SECURITY.includes(cfg.security)) cfg.security = '';
  /* The server's service password goes only to the directory the server names (NI_LDAP_URL), when it names one: an
     address changed in Settings does not get it. */
  const envPw = readSecret(env, 'NI_LDAP_SERVICE_PASSWORD'), envHost = ldapHostOf(env.NI_LDAP_URL || '');
  const pwHere = !envPw || !envHost || envHost === ldapHostOf(cfg.url);
  return { ...cfg, searchBase: cfg.searchBase, caFile: env.NI_LDAP_CA || '', allowPlain: env.NI_LDAP_ALLOW_PLAIN === '1' || cfg.security === 'plain',
    servicePassword: pwHere ? envPw : '', caPem: savedCa(db),
    ...(pwHere ? {} : { passwordProblem: `The service password on the server (NI_LDAP_SERVICE_PASSWORD) is for ${envHost}, not ${ldapHostOf(cfg.url)}. Set NI_LDAP_URL to the new server, or change the address back.` }) };
}
