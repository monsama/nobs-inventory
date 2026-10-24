import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openDb, audit } from './db.js';
import { createApp } from './app.js';
import { loadState, saveState } from './state.js';
import { setPassword, hasPassword, passwordProblem } from './auth.js';
import { feedChanged, mergeFeed } from './feed.js';
import { syncLansweeper, lansweeperConfigOf } from './lansweeper.js';
import { graphConfigOf } from './graph.js';
import { autoBackup } from './backup.js';
import { migrateState } from './migrate.js';
import { readSecret } from './secrets.js';
import { syncLdapUsers } from './ldap-sync.js';
import { ldapConfigOf } from './ldap-config.js';

/* First start: one admin account, so someone can sign in and add the rest. Its password comes from
   NI_ADMIN_PASSWORD; without that a random one is printed once. */
export function bootstrap(db, env, log = console.log) {
  const s = loadState(db);
  if (migrateState(s)) saveState(db, s);
  let admin = s.users.find(u => u.login === 'admin');
  if (!admin) {
    admin = { id: 'u-admin', login: 'admin', name: 'Administrator', dept: '', groups: [], source: 'manual', active: true, role: 'admin' };
    const hasAdmin = s.users.some(u => u.role === 'admin');
    if (!hasAdmin) { s.users.push(admin); saveState(db, s); }
  }
  if (!hasPassword(db, admin.id)) {
    const pw = env.NI_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
    const weak = env.NI_ADMIN_PASSWORD ? passwordProblem(pw, admin.login) : null;
    if (weak) log(`Warning: NI_ADMIN_PASSWORD does not meet the password rules (${weak}). Change it under Settings → Users.`);
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
  if (feedChanged(counts)) { autoBackup(db, 'before the nightly feed file sync'); saveState(db, s); }
  audit(db, null, 'feed sync: ' + JSON.stringify(counts));
  return counts;
}

/* Nightly at 06:00: the Lansweeper API when a token is set, otherwise the report file; then the directory users. */
export function startScheduler(db, env, { lansweeperConfig = null, ldapConfig = null } = {}, log = console.log) {
  if (!lansweeperConfig && !env.NI_FEED_CSV && !ldapConfig) return null;
  let lastRun = '';
  return setInterval(async () => {
    const now = new Date();
    const key = now.toDateString();
    if (now.getHours() !== 6 || now.getMinutes() !== 0 || lastRun === key) return;
    lastRun = key;
    const cur = loadState(db);
    const lsOn = cur.useLansweeper !== false;
    const ls = lansweeperConfig && lsOn && cur.lsSource === 'api' ? lansweeperConfig() : null;
    if (ls) {
      try { log('lansweeper sync', await syncLansweeper(db, ls, now)); } catch (e) { log('lansweeper sync failed:', e.message); audit(db, null, 'Lansweeper sync failed: ' + e.message); }
    } else if (env.NI_FEED_CSV && lsOn && cur.lsSource !== 'api') {
      try { log('feed sync', runFeedFile(db, env.NI_FEED_CSV, now)); } catch (e) { log('feed sync failed:', e.message); audit(db, null, 'feed file sync failed: ' + e.message); }
    }
    const lc = ldapConfig ? ldapConfig() : null;
    if (lc) {
      try { log('ldap sync', await syncLdapUsers(db, lc)); } catch (e) { log('ldap sync failed:', e.message); audit(db, null, 'LDAP sync failed: ' + e.message); }
    }
  }, 30_000);
}

export { configFromEnv } from './ldap-config.js';


export function start(env = process.env) {
  const dataDir = env.NI_DATA || path.resolve('data');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = openDb(path.join(dataDir, 'inventory.db'));
  const resolved = { ...env, NI_ADMIN_PASSWORD: readSecret(env, 'NI_ADMIN_PASSWORD'), NI_LDAP_SERVICE_PASSWORD: readSecret(env, 'NI_LDAP_SERVICE_PASSWORD'), NI_LS_TOKEN: readSecret(env, 'NI_LS_TOKEN'), NI_FEED_TOKEN: readSecret(env, 'NI_FEED_TOKEN') };
  bootstrap(db, resolved);
  const ldapConfig = () => ldapConfigOf(db, resolved);
  const lansweeperConfig = () => lansweeperConfigOf(db, resolved);
  /* Secure cookies by default in production (the Docker image); off only when NI_SECURE_COOKIE=0 for plain-HTTP testing. */
  const secure = env.NI_SECURE_COOKIE ? env.NI_SECURE_COOKIE === '1' : env.NODE_ENV === 'production';
  const graphConfig = () => graphConfigOf(resolved);
  const app = createApp({ db, ldapConfig, lansweeperConfig, graphConfig, feedToken: resolved.NI_FEED_TOKEN, secureCookie: secure });
  const port = Number(env.NI_PORT || 8080);
  const server = app.listen(port, () => console.log(`NOBS Inventory on http://localhost:${port}`));
  const timer = startScheduler(db, env, { lansweeperConfig, ldapConfig });
  server.on('close', () => { if (timer) clearInterval(timer); db.close(); });
  return { server, db };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
