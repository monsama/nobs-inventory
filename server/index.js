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
import { graphConfigOf, syncGraph } from './graph.js';
import { isDue, scheduleOf } from '../public/js/schedule.js';
import { autoBackup } from './backup.js';
import { migrateState } from './migrate.js';
import { purgePasswords, sheetKeyOf } from './sheets.js';
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

/* The syncs the server runs by itself, each on its schedule from Settings (scheduleOf): the Lansweeper API when a token
   is set, otherwise the report file; the directory users; Microsoft Graph. Due in the same minute, they run in that order,
   so the devices Lansweeper adds are there for Graph to match. Kept passwords on entry sheets are cleared daily at 06:00. */
export function startScheduler(db, env, { lansweeperConfig = null, ldapConfig = null, sheetKey = null, graphConfig = null } = {}, log = console.log) {
  if (!lansweeperConfig && !env.NI_FEED_CSV && !ldapConfig && !sheetKey && !graphConfig) return null;
  const done = {};
  const once = (key, now) => { const k = `${now.toDateString()} ${now.getHours()}:${now.getMinutes()}`; if (done[key] === k) return false; done[key] = k; return true; };
  return setInterval(async () => {
    const now = new Date();
    /* Anything that throws here (a secret file that can no longer be read, say) is logged; it must not stop the server. */
    try {
      if (sheetKey && now.getHours() === 6 && now.getMinutes() === 0 && once('sheets', now)) { const n = purgePasswords(db, sheetKey, now); if (n) log('entry sheets: password removed from', n); }
      const cur = loadState(db), plan = scheduleOf(cur);
      const due = job => isDue(plan[job], now) && once(job, now);
      const lsOn = cur.useLansweeper !== false;
      if (due('lansweeper')) {
        const ls = lansweeperConfig && lsOn && cur.lsSource === 'api' ? lansweeperConfig() : null;
        if (ls) {
          try { log('lansweeper sync', await syncLansweeper(db, ls, now)); } catch (e) { log('lansweeper sync failed:', e.message); audit(db, null, 'Lansweeper sync failed: ' + e.message); }
        } else if (env.NI_FEED_CSV && lsOn && cur.lsSource !== 'api') {
          try { log('feed sync', runFeedFile(db, env.NI_FEED_CSV, now)); } catch (e) { log('feed sync failed:', e.message); audit(db, null, 'feed file sync failed: ' + e.message); }
        }
      }
      if (due('ldap')) {
        const lc = ldapConfig ? ldapConfig() : null;
        if (lc) {
          try { log('ldap sync', await syncLdapUsers(db, lc)); } catch (e) { log('ldap sync failed:', e.message); audit(db, null, 'LDAP sync failed: ' + e.message); }
        }
      }
      if (due('graph')) {
        const gc = graphConfig ? graphConfig() : null;
        if (gc) {
          try { const c = await syncGraph(db, gc, now); log('graph sync', c); audit(db, null, 'Microsoft Graph sync: ' + JSON.stringify(c)); } catch (e) { log('graph sync failed:', e.message); audit(db, null, 'Microsoft Graph sync failed: ' + e.message); }
        }
      }
    } catch (e) { log('scheduled sync failed:', e.message); try { audit(db, null, 'Scheduled sync failed: ' + e.message); } catch { /* the log is best effort */ } }
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
  const sheetKey = sheetKeyOf(env, dataDir);
  const app = createApp({ db, ldapConfig, lansweeperConfig, graphConfig, feedToken: resolved.NI_FEED_TOKEN, secureCookie: secure, sheetKey });
  const port = Number(env.NI_PORT || 8080);
  const server = app.listen(port, () => console.log(`NOBS Inventory on http://localhost:${port}`));
  const timer = startScheduler(db, env, { lansweeperConfig, ldapConfig: () => app.locals.ldapConfig(), sheetKey, graphConfig: () => app.locals.graphConfig() });
  server.on('close', () => { if (timer) clearInterval(timer); db.close(); });
  return { server, db };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
