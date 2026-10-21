import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openDb, audit } from './db.js';
import { createApp } from './app.js';
import { loadState, saveState } from './state.js';
import { setPassword, hasPassword } from './auth.js';
import { mergeFeed } from './feed.js';

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

export function startScheduler(db, env, log = console.log) {
  if (!env.NI_FEED_CSV) return null;
  return setInterval(() => {
    const now = new Date();
    if (now.getHours() === 6 && now.getMinutes() === 0) {
      try { log('feed sync', runFeedFile(db, env.NI_FEED_CSV, now)); } catch (e) { log('feed sync failed:', e.message); }
    }
  }, 60_000);
}

export function configFromEnv(env) {
  return {
    url: env.NI_LDAP_URL,
    bindTemplate: env.NI_LDAP_BIND || '{login}',
    searchBase: env.NI_LDAP_BASE || '',
    loginAttr: env.NI_LDAP_LOGIN_ATTR || 'sAMAccountName',
    adminGroup: env.NI_LDAP_ADMIN_GROUP || ''
  };
}

export function start(env = process.env) {
  const dataDir = env.NI_DATA || path.resolve('data');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = openDb(path.join(dataDir, 'inventory.db'));
  bootstrap(db, env);
  const ldap = env.NI_LDAP_URL ? configFromEnv(env) : null;
  const app = createApp({ db, ldap, secureCookie: env.NI_SECURE_COOKIE === '1' });
  const port = Number(env.NI_PORT || 8080);
  const server = app.listen(port, () => console.log(`NOBS Inventory on http://localhost:${port}`));
  const timer = startScheduler(db, env);
  server.on('close', () => { if (timer) clearInterval(timer); db.close(); });
  return { server, db };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
