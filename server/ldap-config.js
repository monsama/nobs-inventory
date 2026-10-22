import { readSecret } from './secrets.js';

/* The directory settings. They are edited in Settings → LDAP sync and saved in the inventory, so an administrator
   can change them without a restart. The service account's password is never stored there: it comes from the
   server's environment (NI_LDAP_SERVICE_PASSWORD, or NI_LDAP_SERVICE_PASSWORD_FILE for a secret file). The settings
   from the environment (NI_LDAP_URL and the rest) still work and are used when nothing is saved in the inventory. */
const FIELDS = ['url', 'bindTemplate', 'searchBase', 'loginAttr', 'userFilter', 'group', 'adminGroup', 'serviceDn'];
const clean = v => (typeof v === 'string' ? v.trim().slice(0, 500) : '');

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
  };
}

/* The directory settings in use now: the saved ones when there is an address, else the environment's. */
export function ldapConfigOf(db, env) {
  const row = db.prepare("SELECT data FROM docs WHERE kind = 'setting' AND id = 'ldap'").get();
  const saved = row ? (JSON.parse(row.data) || {}) : {};
  if (!clean(saved.url)) return env.NI_LDAP_URL ? configFromEnv(env) : null;
  const cfg = { bindTemplate: '{login}', loginAttr: 'sAMAccountName', ...Object.fromEntries(FIELDS.map(k => [k, clean(saved[k])])) };
  for (const k of ['bindTemplate', 'loginAttr']) if (!cfg[k]) cfg[k] = k === 'bindTemplate' ? '{login}' : 'sAMAccountName';
  return { ...cfg, searchBase: cfg.searchBase, caFile: env.NI_LDAP_CA || '', allowPlain: env.NI_LDAP_ALLOW_PLAIN === '1',
    servicePassword: readSecret(env, 'NI_LDAP_SERVICE_PASSWORD') };
}
