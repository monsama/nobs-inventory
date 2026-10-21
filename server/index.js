import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openDb, audit } from './db.js';
import { createApp } from './app.js';
import { loadState, saveState } from './state.js';
import { setPassword, hasPassword } from './auth.js';
import { mergeFeed } from './feed.js';
import { syncLansweeper, DEFAULT_ENDPOINT } from './lansweeper.js';
import { syncLdapUsers } from './ldap-sync.js';

/* First start: one admin account, so someone can sign in and add the rest. Its password comes from
   NI_ADMIN_PASSWORD; without that a random one is printed once. */
export function bootstrap(db, env, log = console.log) {
  const s = loadState(db);
  let admin = s.users.find(u => u.login === 'admin');
  if (!admin) {
    admin = { id: 'u-admin', login: 'admin', name: 'Administrator', dept: '', groups: [], source: 'manual', active: true, role: 'admin' };
    const hasAdmin = s.users.some(u => u.role === 'admin');
    if (!hasAdmin) { s.users.push(admin); saveState(db, s); }
  }
  if (!hasPassword(db, admin.id)) {
    const pw = env.NI_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
    setPassword(db, admin.id, pw);
    audit(db, null, 'admin account created');
    if (!env.NI_ADMIN_PASSWORD) log(`First start: admin password is ${pw} (change it under Settings → Users).`);
  }
}

/* Nightly Lansweeper import from a report file, when one is configured and the feed is on. */
export function runFeedFile(db, file, now = new Date()) {
  const s = loadState(db);
  if (s.feedOn === false || s.feedSync === false) return { skipped: true };
  const counts = mergeFeed(s, fs.readFileSync(file, 'utf8'), now);
  saveState(db, s);
  audit(db, null, 'feed sync: ' + JSON.stringify(counts));
  return counts;
}

/* Nightly at 06:00: the Lansweeper API when a token is set, otherwise the report file; then the directory users. */
export function startScheduler(db, env, { lansweeper = null, ldap = null } = {}, log = console.log) {
  if (!lansweeper && !env.NI_FEED_CSV && !ldap) return null;
  let lastRun = '';
  return setInterval(async () => {
    const now = new Date();
    const key = now.toDateString();
    if (now.getHours() !== 6 || now.getMinutes() !== 0 || lastRun === key) return;
    lastRun = key;
    if (lansweeper) {
      try { log('lansweeper sync', await syncLansweeper(db, lansweeper, now)); } catch (e) { log('lansweeper sync failed:', e.message); }
    } else if (env.NI_FEED_CSV) {
      try { log('feed sync', runFeedFile(db, env.NI_FEED_CSV, now)); } catch (e) { log('feed sync failed:', e.message); }
    }
    if (ldap) {
      try { log('ldap sync', await syncLdapUsers(db, ldap)); } catch (e) { log('ldap sync failed:', e.message); }
    }
  }, 30_000);
}

export function configFromEnv(env) {
  return {
    url: env.NI_LDAP_URL,
    bindTemplate: env.NI_LDAP_BIND || '{login}',
    searchBase: env.NI_LDAP_BASE || '',
    loginAttr: env.NI_LDAP_LOGIN_ATTR || 'sAMAccountName',
    adminGroup: env.NI_LDAP_ADMIN_GROUP || '',
    group: env.NI_LDAP_GROUP || '',
    serviceDn: env.NI_LDAP_SERVICE_DN || '',
    servicePassword: env.NI_LDAP_SERVICE_PASSWORD || '',
    userFilter: env.NI_LDAP_USER_FILTER || '',
    caFile: env.NI_LDAP_CA || ''
  };
}

export function lansweeperFromEnv(env) {
  if (!env.NI_LS_TOKEN) return null;
  return {
    endpoint: env.NI_LS_URL || DEFAULT_ENDPOINT,
    token: env.NI_LS_TOKEN,
    authScheme: env.NI_LS_AUTH_SCHEME || 'Token',
    site: env.NI_LS_SITE || ''
  };
}

export function start(env = process.env) {
  const dataDir = env.NI_DATA || path.resolve('data');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = openDb(path.join(dataDir, 'inventory.db'));
  bootstrap(db, env);
  const ldap = env.NI_LDAP_URL ? configFromEnv(env) : null;
  const lansweeper = lansweeperFromEnv(env);
  /* Secure cookies by default in production (the Docker image); off only when NI_SECURE_COOKIE=0 for plain-HTTP testing. */
  const secure = env.NI_SECURE_COOKIE ? env.NI_SECURE_COOKIE === '1' : env.NODE_ENV === 'production';
  const app = createApp({ db, ldap, lansweeper, secureCookie: secure });
  const port = Number(env.NI_PORT || 8080);
  const server = app.listen(port, () => console.log(`NOBS Inventory on http://localhost:${port}`));
  const timer = startScheduler(db, env, { lansweeper, ldap });
  server.on('close', () => { if (timer) clearInterval(timer); db.close(); });
  return { server, db };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
