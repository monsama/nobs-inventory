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

function connect(config) {
  /* A plain ldap:// connection sends the password unencrypted. It needs an explicit opt-in (NI_LDAP_ALLOW_PLAIN=1). */
  if (/^ldap:\/\//i.test(config.url) && !config.allowPlain) throw new Error('The directory address starts with ldap://, which sends passwords unencrypted. Use ldaps:// or set NI_LDAP_ALLOW_PLAIN=1.');
  const opts = { url: config.url, timeout: 8000, connectTimeout: 8000 };
  if (config.caFile) opts.tlsOptions = { ca: [fs.readFileSync(config.caFile)] };
  const client = ldap.createClient(opts);
  // Connection errors also reach the pending bind or search callback; without this listener they would crash the server.
  client.on('error', () => {});
  return client;
}
function close(client) { try { client.unbind(() => {}); } catch (e) { /* already closed */ } }
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
export const inGroup = (profile, group) => !group || profile.groups.some(g => same(g, group));

/* Checks the login and password. Returns the profile, or null when the password is wrong. Throws when the
   directory cannot be reached, so the caller can tell the two apart. */
export async function ldapLogin(config, login, password) {
  if (!password || !LOGIN_OK.test(login)) return null;
  const client = connect(config);
  try {
    await bind(client, config.bindTemplate.replace('{login}', login), password);
    const [entry] = await ldapSearch(client, config.searchBase, `(${config.loginAttr}=${escapeFilter(login)})`);
    return entry ? profileOf(entry.attrs, config) : null;
  } catch (err) {
    if (err instanceof ldap.InvalidCredentialsError) return null;
    throw err;
  } finally { close(client); }
}

/* Every user the sync covers, read with the service account. */
export async function ldapListUsers(config) {
  if (!config.serviceDn) throw new Error('NI_LDAP_SERVICE_DN is not set, so the directory cannot be read.');
  const client = connect(config);
  try {
    await bind(client, config.serviceDn, config.servicePassword);
    const entries = await ldapSearch(client, config.searchBase, config.userFilter || '(objectClass=person)');
    return entries.map(e => profileOf(e.attrs, config)).filter(p => p.login);
  } finally { close(client); }
}
