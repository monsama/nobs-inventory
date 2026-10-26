import ldap from 'ldapjs';
import fs from 'node:fs';
import { HttpError } from './errors.js';
import tls, { rootCertificates as tlsRootCertificates } from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { isIP } from 'node:net';

/* Directory access: sign-in checks a user's own password against the directory and never stores it. Sync reads
   the users with a service account. Both use the same connection settings. */
export const ldapEnabled = config => !!config?.url;
/* All user attributes: asking for a named list made some directory stand-ins drop values, and the page reads only what it needs. */
const USER_ATTRS = ['*'];
const LOGIN_OK = /^[\w.@-]{1,64}$/;
export const DEFAULT_USER_FILTER = '(&(objectClass=person)(!(objectClass=computer)))';

const escapeFilter = v => String(v).replace(/[\\*()\0]/g, c => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'));
const cnOf = dn => String(dn).replace(/^CN=/i, '').split(',')[0];
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
/* A group given as a distinguished name (CN=…,OU=…) is matched with its nested groups too. */
const isDn = g => /=/.test(String(g || ''));
/* Active Directory's "in chain" rule: true when the user is in the group directly or through groups nested in it. */
const chain = dn => `(memberOf:1.2.840.113556.1.4.1941:=${escapeFilter(dn)})`;

/* Opens the connection. An ldaps:// address is encrypted from the start. An ldap:// address is upgraded with StartTLS
   when that is chosen, before anything else is sent; unencrypted it needs an explicit choice (in Settings, or
   NI_LDAP_ALLOW_PLAIN=1), since it sends the passwords readable. The certificate is checked against the server's name. */
export const LEGACY_CIPHERS = 'DEFAULT@SECLEVEL=1';
export const PLAIN_LDAP_ERROR = 'The directory address starts with ldap://, which sends passwords unencrypted. Choose StartTLS under Connection security in Settings, or use ldaps://. Unencrypted can be allowed there too (or with NI_LDAP_ALLOW_PLAIN=1).';
async function connect(config) {
  const plain = /^ldap:\/\//i.test(config.url);
  const startTls = plain && config.security === 'starttls';
  if (plain && !startTls && !config.allowPlain) throw new Error(PLAIN_LDAP_ERROR);
  /* The CA added in Settings and the one named by NI_LDAP_CA, on top of the public ones Node trusts. */
  const ca = [config.caFile ? fs.readFileSync(config.caFile) : null, config.caPem || null].filter(Boolean);
  const tlsOpts = {
    ...(ca.length ? { ca: [...tlsRootCertificates, ...ca] } : {}),
    /* Old certificates, only when chosen in Settings: RSA keys from 1024 bits (security level 1 instead of 2). The
       certificate is still checked against the CA and the name; the connection stays encrypted. */
    ...(config.legacyTls === 'on' ? { ciphers: LEGACY_CIPHERS } : {}),
  };
  const opts = { url: config.url, timeout: 8000, connectTimeout: 8000 };
  if (!plain && Object.keys(tlsOpts).length) opts.tlsOptions = tlsOpts;
  const client = (config.createClient || ldap.createClient)(opts);
  // Connection errors also reach the pending bind or search callback; without this listener they would crash the server.
  client.on('error', () => {});
  if (startTls) {
    const host = new URL(config.url).hostname.replace(/^\[|\]$/g, '');
    /* An address is no TLS server name: it is sent only for a host name (an address is still checked against the certificate). */
    try { await new Promise((resolve, reject) => client.starttls({ ...tlsOpts, host, ...(isIP(host) ? {} : { servername: host }) }, [], e => (e ? reject(e) : resolve()))); }
    catch (e) { close(client); throw e; }
  }
  return client;
}
function close(client) { try { client.unbind(() => {}); } catch { /* already closed */ } }
const bind = (client, dn, password) => new Promise((resolve, reject) => client.bind(dn, password, e => (e ? reject(e) : resolve())));

function normalize(entry) {
  const attrs = {};
  for (const a of entry.pojo?.attributes ?? []) attrs[a.type.toLowerCase()] = [].concat(a.values);
  return { dn: entry.pojo?.objectName ?? '', attrs };
}
export function ldapSearch(client, base, filter, attributes = USER_ATTRS) {
  return new Promise((resolve, reject) => {
    const out = [];
    /* Paged, so a directory with more users than one answer holds is read in full. A directory that does not page
       answers in one piece instead. */
    client.search(base, { scope: 'sub', filter, attributes, paged: { pageSize: 500 } }, (err, res) => {
      if (err) return reject(err);
      res.on('searchEntry', e => out.push(normalize(e)));
      res.on('pageError', () => {});
      res.on('error', reject);
      res.on('end', () => resolve(out));
    });
  });
}

export function profileOf(attrs, config) {
  const first = k => attrs[k.toLowerCase()]?.[0] ?? '';
  const login = first(config.loginAttr);
  return {
    login,
    name: first('displayName') || login,
    dept: first('department'),
    mail: first('mail'),
    groups: (attrs.memberof ?? []).map(cnOf)
  };
}
/* Membership of the groups the user is directly in. Used when a group is given by name. */
export const inGroup = (profile, group) => !group || profile.groups.some(g => same(g, group));
/* A group given by name is matched against memberOf. A directory that does not send memberOf (OpenLDAP needs its memberof
   overlay) matches nobody, which looks the same as a wrong group, so the server says so once in its log. */
let warnedNoMemberOf = false;

/* Whether the user is in a group: by distinguished name, nested groups count; by name, only direct membership. */
async function isMember(client, config, login, profile, group) {
  if (!group) return true;
  if (!isDn(group)) {
    if (!warnedNoMemberOf && !profile.groups.length) { warnedNoMemberOf = true; console.warn('directory: the group is given by name, but no user came with memberOf. Give the group as its full DN, or make the directory send memberOf.'); }
    return inGroup(profile, group);
  }
  const hit = await ldapSearch(client, config.searchBase, `(&(${config.loginAttr}=${escapeFilter(login)})${chain(group)})`, ['cn']);
  return hit.length > 0;
}

/* Checks the login and password. Returns the profile with allowed (may sign in) and admin (is an admin), or null
   when the password is wrong. Throws when the directory cannot be reached, so the caller can tell the two apart. */
export async function ldapLogin(config, login, password) {
  if (!password || !LOGIN_OK.test(login)) return null;
  const client = await connect(config);
  try {
    await bind(client, config.bindTemplate.replace('{login}', login), password);
    const [entry] = await ldapSearch(client, config.searchBase, `(${config.loginAttr}=${escapeFilter(login)})`);
    if (!entry) return null;
    const profile = profileOf(entry.attrs, config);
    profile.allowed = await isMember(client, config, login, profile, config.group);
    profile.admin = !!config.adminGroup && await isMember(client, config, login, profile, config.adminGroup);
    return profile;
  } catch (err) {
    if (err instanceof ldap.InvalidCredentialsError) return null;
    throw err;
  } finally { close(client); }
}

/* The directory server's certificate, read without trusting it, to say why it is not trusted: who it is for, who issued
   it, until when, and whether the CA added in Settings issued it. So nobody has to run openssl on the server. */
const cnOf2 = name => (String(name || '').match(/CN=([^\n,]+)/) || [])[1] || String(name || '').split('\n')[0];
const day = t => { const d = new Date(t); return isNaN(d) ? String(t) : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };
export const isCertError = message => /certificate|self[- ]signed|UNABLE_TO_VERIFY|CERT_|altnames|unable to (verify|get)/i.test(String(message || ''));
async function peerChain(config) {
  const u = new URL(config.url), host = u.hostname.replace(/^\[|\]$/g, ''), servername = isIP(host) ? undefined : host;
  if (/^ldaps:/i.test(config.url)) {
    return new Promise((resolve, reject) => {
      const s = tls.connect({ host, port: Number(u.port) || 636, servername, rejectUnauthorized: false, ciphers: 'DEFAULT@SECLEVEL=0' }, () => { const c = s.getPeerCertificate(true); s.end(); resolve(c); });
      s.setTimeout(8000, () => { s.destroy(); reject(new Error('timed out')); });
      s.on('error', reject);
    });
  }
  if (config.security !== 'starttls') return null;
  const client = (config.createClient || ldap.createClient)({ url: config.url, timeout: 8000, connectTimeout: 8000 });
  client.on('error', () => {});
  try {
    await new Promise((resolve, reject) => client.starttls({ host, servername, rejectUnauthorized: false, ciphers: 'DEFAULT@SECLEVEL=0' }, [], e => (e ? reject(e) : resolve())));
    return client._socket && client._socket.getPeerCertificate ? client._socket.getPeerCertificate(true) : null;
  } finally { close(client); }
}
export async function ldapCertReport(config, now = new Date()) {
  const peer = await peerChain(config);
  if (!peer || !peer.raw) return null;
  /* The chain as the server sent it: its own certificate first, then any CA certificates it sent along. */
  const chain = [];
  for (let c = peer, n = 0; c && c.raw && n < 6; n++) { chain.push(new X509Certificate(c.raw)); if (c.issuerCertificate === c) break; c = c.issuerCertificate; }
  const leaf = chain[0], host = new URL(config.url).hostname;
  const names = String(leaf.subjectAltName || '').split(/,\s*/).map(x => x.replace(/^(DNS|IP Address):/, '')).filter(Boolean);
  const pems = [config.caPem || '', config.caFile ? fs.readFileSync(config.caFile, 'utf8') : ''].join('\n').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
  const cas = pems.map(p => { try { return new X509Certificate(p); } catch { return null; } }).filter(Boolean);
  const issued = c => cas.some(ca => c.checkIssued(ca) && c.verify(ca.publicKey));
  const byAdded = chain.some(issued);
  const matches = !!(isIP(host) ? leaf.checkIP(host) : leaf.checkHost(host));
  const expired = new Date(leaf.validTo) < now;
  /* Current TLS refuses RSA keys under 2048 bits ("key too weak"): the certificate has to be renewed with a longer key. */
  const key = leaf.publicKey.asymmetricKeyDetails || {}, type = leaf.publicKey.asymmetricKeyType;
  const bits = key.modulusLength || 0, weak = type === 'rsa' && bits > 0 && bits < 2048;
  const parts = [`The server presented the certificate of ${cnOf2(leaf.subject)}, issued by ${cnOf2(leaf.issuer)}, valid until ${day(leaf.validTo)}${bits ? `, with a ${bits}-bit ${String(type).toUpperCase()} key` : ''}.`];
  if (weak) parts.push(`That key is too short: TLS today needs at least 2048 bits. Renew the domain controller's certificate with a 2048-bit key (a template duplicated from Kerberos Authentication, minimum key size 2048).${config.legacyTls === 'on' ? '' : ' Until then, "Accept old certificates" in Settings lets the inventory connect.'}`);
  if (expired) parts.push(`It has expired: the domain controller needs a new one.`);
  if (!matches) parts.push(`It is made for ${names.join(', ') || cnOf2(leaf.subject)}, not for ${host}: use ${names.length > 1 ? "one of these names" : "that name"} in the server address.`);
  if (cas.length && !byAdded) parts.push(`The CA certificate in Settings (${cas.map(c => cnOf2(c.subject)).join(', ')}) did not issue it: add the certificate of ${cnOf2(chain[chain.length - 1].issuer)} instead.`);
  if (!cas.length) parts.push(`Add the certificate of ${cnOf2(chain[chain.length - 1].issuer)} under CA certificate in Settings.`);
  return { text: parts.join(' '), subject: cnOf2(leaf.subject), issuer: cnOf2(leaf.issuer), validTo: leaf.validTo, names, matches, expired, bits, weak, trustedByAdded: byAdded };
}

/* What the usual directory errors mean, in the words of the settings. Active Directory puts the reason of a failed bind
   in the message (data 52e, 775, …). */
const LDAP_HINTS = [
  [/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ETIMEDOUT|timed? ?out|connect/i, 'The directory server cannot be reached. Check the server address and port (ldaps:// uses 636, ldap:// 389) and that the firewall lets this server through.'],
  [/key too (weak|small)/i, 'The domain controller\'s certificate has a key that is too short (TLS today needs at least 2048 bits): renew it with a 2048-bit key. Until then, "Accept old certificates" in Settings lets the inventory connect.'],
  [/certificate|self[- ]signed|UNABLE_TO_VERIFY|CERT_|altnames/i, 'The directory server\'s certificate is not trusted, or does not match the address. Add the certificate of the CA that issued it under CA certificate in Settings (on Windows: the root CA certificate from AD Certificate Services, exported as .cer), and use the name the certificate is made for (dc01.example.ch, not an IP address).'],
  [/data 775/i, 'The service account is locked out.'],
  [/data 533/i, 'The service account is disabled.'],
  [/data (532|773)/i, 'The service account\'s password has expired or must be changed.'],
  [/data 701/i, 'The service account has expired.'],
  [/\b49\b|Invalid ?Credentials|data 52e/i, 'The service account\'s sign-in name or password is wrong.'],
  [/\b32\b|No ?Such ?Object/i, 'The search base does not exist. Copy it from the directory, e.g. OU=Users,DC=example,DC=ch.'],
  [/NI_LDAP_SERVICE_DN/, 'Give the service account in Settings (and its password on the server) so the directory can be read.'],
];
export const ldapHint = message => (LDAP_HINTS.find(([re]) => re.test(String(message || ''))) || [])[1] || null;

/* Where the computer accounts are: the base set in Settings, else the whole domain the user search base is in (its DC= parts),
   since computers usually sit outside the users' OU. */
export const computerBaseOf = config => {
  if (config.computerBase) return config.computerBase;
  const dcs = String(config.searchBase || '').split(',').map(x => x.trim()).filter(x => /^DC=/i.test(x));
  return dcs.length ? dcs.join(',') : config.searchBase;
};
/* The computer accounts with the groups each is a direct member of, by group name. */
export async function ldapListComputers(config) {
  if (!config.serviceDn) throw new Error('NI_LDAP_SERVICE_DN is not set, so the directory cannot be read.');
  /* No password is never sent: an empty one is an anonymous sign-in to Active Directory. */
  if (config.passwordProblem) throw new HttpError(400, config.passwordProblem);
  if (!config.servicePassword) throw new HttpError(400, 'The service account has no password: save it in Settings, or set NI_LDAP_SERVICE_PASSWORD on the server.');
  const client = await connect(config);
  try {
    await bind(client, config.serviceDn, config.servicePassword);
    const list = await ldapSearch(client, computerBaseOf(config), '(objectClass=computer)');
    return list.map(e => ({ name: e.attrs.cn?.[0] || '', dns: e.attrs.dnshostname?.[0] || '', groups: [...new Set((e.attrs.memberof ?? []).map(cnOf))].sort((a, b) => a.localeCompare(b)) }))
      .filter(c => c.name);
  } finally { close(client); }
}

/* Every user the sync covers, read with the service account: the members of the sign-in group, each with admin set
   when they are in the admin group. */
export async function ldapListUsers(config) {
  if (!config.serviceDn) throw new Error('NI_LDAP_SERVICE_DN is not set, so the directory cannot be read.');
  /* No password is never sent: an empty one is an anonymous sign-in to Active Directory. */
  if (config.passwordProblem) throw new HttpError(400, config.passwordProblem);
  if (!config.servicePassword) throw new HttpError(400, 'The service account has no password: save it in Settings, or set NI_LDAP_SERVICE_PASSWORD on the server.');
  const client = await connect(config);
  try {
    await bind(client, config.serviceDn, config.servicePassword);
    /* In Active Directory a computer account is a person too: it is left out, so PC01$ never becomes a user. */
    const userFilter = config.userFilter || DEFAULT_USER_FILTER;
    const members = async group => (await ldapSearch(client, config.searchBase, `(&${userFilter}${chain(group)})`))
      .map(e => profileOf(e.attrs, config)).filter(p => p.login);
    const everyone = (await ldapSearch(client, config.searchBase, userFilter)).map(e => profileOf(e.attrs, config)).filter(p => p.login);
    const sameLogin = (a, list) => { const set = new Set(list.map(p => p.login.toLowerCase())); return p => set.has(p.login.toLowerCase()); };
    const people = isDn(config.group) ? everyone.filter(sameLogin(null, await members(config.group)))
      : everyone.filter(p => inGroup(p, config.group));
    const isAdmin = !config.adminGroup ? () => false
      : isDn(config.adminGroup) ? sameLogin(null, await members(config.adminGroup))
      : p => inGroup(p, config.adminGroup);
    return people.map(p => ({ ...p, admin: isAdmin(p) }));
  } finally { close(client); }
}
