import ldap from 'ldapjs';
import fs from 'node:fs';

/* Directory access: sign-in checks a user's own password against the directory and never stores it. Sync reads
   the users with a service account. Both use the same connection settings. */
export const ldapEnabled = config => !!config?.url;
// All user attributes: asking for a named list made some directory stand-ins drop values, and the page reads only what it needs.
const USER_ATTRS = ['*'];
const LOGIN_OK = /^[\w.@-]{1,64}$/;

const escapeFilter = v => String(v).replace(/[\\*()\0]/g, c => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'));
const cnOf = dn => String(dn).replace(/^CN=/i, '').split(',')[0];
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
/* A group given as a distinguished name (CN=…,OU=…) is matched with its nested groups too. */
const isDn = g => /=/.test(String(g || ''));
/* Active Directory's "in chain" rule: true when the user is in the group directly or through groups nested in it. */
const chain = dn => `(memberOf:1.2.840.113556.1.4.1941:=${escapeFilter(dn)})`;

function connect(config) {
  /* A plain ldap:// connection sends the password unencrypted. It needs an explicit opt-in (NI_LDAP_ALLOW_PLAIN=1). */
  if (/^ldap:\/\//i.test(config.url) && !config.allowPlain) throw new Error('The directory address starts with ldap://, which sends passwords unencrypted. Use ldaps:// or set NI_LDAP_ALLOW_PLAIN=1.');
  const opts = { url: config.url, timeout: 8000, connectTimeout: 8000 };
  if (config.caFile) opts.tlsOptions = { ca: [fs.readFileSync(config.caFile)] };
  const client = (config.createClient || ldap.createClient)(opts);
  // Connection errors also reach the pending bind or search callback; without this listener they would crash the server.
  client.on('error', () => {});
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
  const client = connect(config);
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

/* Every user the sync covers, read with the service account: the members of the sign-in group, each with admin set
   when they are in the admin group. */
/* What the usual directory errors mean, in the words of the settings. Active Directory puts the reason of a failed bind
   in the message (data 52e, 775, …). */
const LDAP_HINTS = [
  [/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ETIMEDOUT|timed? ?out|connect/i, 'The directory server cannot be reached. Check the server address and port (ldaps:// uses 636, ldap:// 389) and that the firewall lets this server through.'],
  [/certificate|self[- ]signed|UNABLE_TO_VERIFY|CERT_|altnames/i, 'The directory server\'s TLS certificate is not trusted, or does not match the address. Use the name the certificate is made for, or give the server the CA certificate.'],
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
  const client = connect(config);
  try {
    await bind(client, config.serviceDn, config.servicePassword);
    const list = await ldapSearch(client, computerBaseOf(config), '(objectClass=computer)');
    return list.map(e => ({ name: e.attrs.cn?.[0] || '', dns: e.attrs.dnshostname?.[0] || '', groups: [...new Set((e.attrs.memberof ?? []).map(cnOf))].sort((a, b) => a.localeCompare(b)) }))
      .filter(c => c.name);
  } finally { close(client); }
}

export async function ldapListUsers(config) {
  if (!config.serviceDn) throw new Error('NI_LDAP_SERVICE_DN is not set, so the directory cannot be read.');
  const client = connect(config);
  try {
    await bind(client, config.serviceDn, config.servicePassword);
    const userFilter = config.userFilter || '(objectClass=person)';
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
