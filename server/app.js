import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit } from './db.js';
import { KNOWN_TYPES, SETTING_KEYS, PAGE_SETTINGS, loadState, saveState, applyChanges, describeChanges, factoryReset, clearConnections } from './state.js';
import { setPassword, passwordProblem, checkLocalPassword, createSession, sessionUserId, endSession, endOtherSessions, listSessions, endSessionById, readCookie } from './auth.js';
import { ldapEnabled, ldapHint, ldapLogin, ldapListUsers, ldapCertReport, isCertError } from './ldap.js';
import { parseCaCerts, ldapHostOf } from './ldap-config.js';
import { cleanIpLocations } from './lsnet.js';
import { feedChanged, mergeFeed, mergeRecords, recordsFromJson, typeFor } from './feed.js';
import { feedTokenInfo, createFeedToken, revokeFeedToken, feedTokenValid } from './feed-token.js';
import { autoBackup, takeBackup, restoreBackup } from './backup.js';
import { syncLansweeper } from './lansweeper.js';
import { entraThumbprintOf, syncGraph, testGraph, addGraphDevices } from './graph.js';
import { dropGraphKey, graphCertPem, graphKeyPair, graphSettingsProblem, hasGraphKey, initGraphKeys, storeGraphKey } from './graph-keys.js';
import { sheetPdf } from './sheet-pdf.js';
import { PASSWORD_DAYS, createSheet, deleteSheet, getSheet, initSheets, listSheets, markChanged, purgePasswords } from './sheets.js';
import { generateGraphCert } from './cert.js';
import crypto from 'node:crypto';
import tls from 'node:tls';
import { syncLdapUsers } from './ldap-sync.js';
import { getAppSecret, setAppSecret, appSecretSetAt, dropAppSecret } from './app-secrets.js';
import { HttpError } from './errors.js';
import { createThrottle } from './throttle.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const publicDir = path.join(here, '..', 'public');
const COOKIE = 'ni_session';
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version;

export function createApp({ db, ldap = null, ldapConfig = null, lansweeper = null, lansweeperConfig = null, graphConfig = null, feedToken = null, secureCookie = false, sheetKey = null, graphFetch = fetch, certProbe = { host: 'nobs-proxy', port: 443 } }) {
  /* Entry sheets are sealed with this key. Without one (tests), a key for this process only. */
  const SECRET_KEY = sheetKey || crypto.randomBytes(32), SHEET_KEY = SECRET_KEY;
  initSheets(db);
  initGraphKeys(db);
  const cfgLs = () => (lansweeperConfig ? lansweeperConfig() : lansweeper);
  /* The directory settings are read when they are needed, so a change in Settings applies without a restart. The service
     account's password is the server's (NI_LDAP_SERVICE_PASSWORD) when it has one, else the one saved in Settings. */
  const cfgLdap = () => {
    let c = ldapConfig ? ldapConfig() : ldap;
    /* The CA certificate added in Settings, whichever way the settings came. */
    if (c && !c.caPem) { const r = db.prepare("SELECT data FROM docs WHERE kind = 'setting' AND id = 'ldapCa'").get(); const pem = r && JSON.parse(r.data)?.pem; if (pem) c = { ...c, caPem: pem }; }
    if (!c || c.servicePassword || c.passwordProblem) return c;
    const saved = getAppSecret(db, SECRET_KEY, 'ldapServicePassword');
    if (!saved) return c;
    /* The password saved here goes only to the directory server it was saved for. One saved before this was kept is
       tied to the server it is first used with. */
    const host = ldapHostOf(c.url), pinned = getAppSecret(db, SECRET_KEY, 'ldapServicePasswordHost');
    if (!pinned && host) setAppSecret(db, SECRET_KEY, 'ldapServicePasswordHost', host);
    else if (pinned && pinned !== host) return { ...c, passwordProblem: `The service password was saved for ${pinned}; the directory server is now ${host}. Save the password again for it.` };
    return { ...c, servicePassword: saved };
  };
  const ldapPasswordFromServer = () => { const c = ldapConfig ? ldapConfig() : ldap; return !!(c && c.servicePassword); };
  const app = express();
  app.disable('x-powered-by');
  /* Caddy is the only proxy in front of the app: its forwarded address is the client's, so login throttling is per user. */
  app.set('trust proxy', 1);
  const throttle = createThrottle();
  /* Browser protections: the page's script is a file of its own, so no inline script runs. */
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  /* Requests from another site are refused before anything is done: a browser names where a request comes from (Origin,
     Sec-Fetch-Site), and a change must come from this app's own page. The Lansweeper push signs in with its token and
     comes from a script, not a browser. Tools that send neither header are not browsers and are let through. */
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/feed/push') return next();
    const site = req.get('sec-fetch-site'), origin = req.get('origin');
    let sameOrigin = true;
    if (site && !['same-origin', 'none'].includes(site)) sameOrigin = false;
    if (origin) { try { sameOrigin = sameOrigin && new URL(origin).host === req.get('host'); } catch { sameOrigin = false; } }
    if (!sameOrigin) return res.status(403).json({ error: 'This request did not come from the inventory\'s own page.' });
    next();
  });
  /* A large body is read only for a signed-in admin, or for the push with its token: nobody else can make the server
     read megabytes before being turned away. */
  app.use('/api', (req, res, next) => {
    const big = Number(req.get('content-length') || 0) > 1048576 || !!req.get('transfer-encoding');
    if (!big) return next();
    const ok = req.path === '/feed/push'
      ? feedTokenValid(db, (/^Bearer (.+)$/.exec(req.get('authorization') || '') || [])[1], feedToken)
      : currentUser(req)?.role === 'admin';
    if (ok) return next();
    res.set('Connection', 'close').status(401).json({ error: 'Sign in as an admin first.' });
  });
  /* A backup can be larger than a normal save; the largest is a full backup with its history and plan pictures. */
  app.use(express.json({ limit: '30mb' }));
  /* A backup file comes with its floor-plan pictures (up to 2 MB each), so its upload has a higher limit of its own. */
  const textBody = express.text({ type: ['text/plain', 'text/csv'], limit: '30mb' });
  const backupBody = express.text({ type: ['text/plain', 'text/csv'], limit: '200mb' });
  app.use((req, res, next) => (req.path === '/api/backups/restore-file' ? backupBody : textBody)(req, res, next));

  const userDoc = id => { const r = db.prepare("SELECT data FROM docs WHERE kind = 'user' AND id = ?").get(id); return r ? JSON.parse(r.data) : null; };
  /* A deactivated user loses access at once, even with a session that is still open. */
  const currentUser = req => { const uid = sessionUserId(db, readCookie(req.headers.cookie, COOKIE)); const u = uid ? userDoc(uid) : null; return u && u.active !== false ? u : null; };
  const me = u => ({ id: u.id, login: u.login, name: u.name, role: u.role === 'admin' ? 'admin' : 'viewer' });
  const cookie = (token, maxAge) => `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secureCookie ? '; Secure' : ''}`;
  const saveUserDoc = u => db.prepare("INSERT INTO docs (kind, id, data) VALUES ('user', ?, ?) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data").run(u.id, JSON.stringify(u));

  const requireUser = (req, res, next) => {
    const u = currentUser(req);
    if (!u) return next(new HttpError(401, 'Sign in first.'));
    req.user = u; next();
  };
  const requireAdmin = (req, res, next) => (req.user.role === 'admin' ? next() : next(new HttpError(403, 'Only an admin can change this.')));

  app.get('/api/health', (req, res) => res.json({ ok: true, version: APP_VERSION }));

  app.get('/api/me', (req, res) => {
    const u = currentUser(req);
    res.json({ user: u ? me(u) : null, ldap: ldapEnabled(cfgLdap()), lansweeper: !!cfgLs(), graph: !!cfgGraph() });
  });

  /* One answer for every failed sign-in: wrong login, wrong password, deactivated, not in the group. This keeps
     account names from being discovered, and the throttle counts every failure against the login and the address. */
  const FAILED = 'The login or password is not right.';
  app.post('/api/login', async (req, res, next) => {
    try {
      const login = String(req.body?.login ?? '').trim().slice(0, 200);
      const password = String(req.body?.password ?? '');
      const keys = ['login:' + login.toLowerCase(), 'ip:' + (req.ip || '')];
      if (throttle.blocked(keys)) {
        const known = db.prepare("SELECT data FROM docs WHERE kind = 'user'").all().some(r => String(JSON.parse(r.data).login || '').toLowerCase() === login.toLowerCase());
        audit(db, null, 'sign in throttled for ' + (known ? login : 'an unknown login'));
        throw new HttpError(429, 'Too many failed sign-ins. Try again in 15 minutes.');
      }
      if (!login || !password || password.length > 256) { throttle.recordFailure(keys); throw new HttpError(401, FAILED); }
      let user = null;   /* only the user records are read; a sign-in does not load the whole inventory */
      for (const r of db.prepare("SELECT data FROM docs WHERE kind = 'user'").all()) {
        const u = JSON.parse(r.data);
        if (u.login && u.login.toLowerCase() === login.toLowerCase()) { user = u; break; }
      }
      let ok = false;
      if (user) ok = checkLocalPassword(db, user.id, password);
      else checkLocalPassword(db, 'none', password);   /* same work for an unknown login */
      const lc = cfgLdap();
      /* The directory signs in its own users and new logins only. A local account with the same login is never taken
         over by it: that would let a directory user sign in as, and demote, the local admin. */
      if (!ok && ldapEnabled(lc) && (!user || user.source === 'ldap')) {
        let d;
        try { d = await ldapLogin(lc, login, password); }
        catch (e) { console.error('directory:', e.message); throw new HttpError(503, 'The directory cannot be reached right now.'); }
        if (d && d.allowed) {
          let isAdmin = !!d.admin;
          if (!user) user = { id: 'ldap-' + login.toLowerCase(), login, name: d.name, dept: d.dept, groups: d.groups, source: 'ldap', active: true, role: 'viewer' };
          /* The last active admin stays one, as in the sync: a renamed or emptied admin group must not lock everyone out. */
          if (!isAdmin && user.role === 'admin' && user.active !== false
            && !loadState(db).users.some(u => String(u.id) !== String(user.id) && u.role === 'admin' && u.active !== false)) {
            isAdmin = true;
            audit(db, user.id, 'sign in: kept as admin, the last active one (not in the admin group any more)');
          }
          Object.assign(user, { name: d.name, dept: d.dept, groups: d.groups, source: 'ldap', role: isAdmin ? 'admin' : 'viewer' });
          if (user.active !== false) { saveUserDoc(user); bumpUser(user.id); }   /* a new revision, so a page holding the old record cannot save it back */
          ok = true;
        } else if (d) { audit(db, null, 'sign in refused, not in group: ' + login); }
      }
      if (!ok || !user || user.active === false) {
        throttle.recordFailure(keys);
        /* The login as typed is logged only when it is one: a password typed into the login field must not end up in the log. */
        audit(db, null, 'failed sign in for ' + (user ? user.login : 'an unknown login'));
        throw new HttpError(401, FAILED);
      }
      throttle.clearFailures(keys.slice(0, 1));   /* only this login: a success must not clear the address count */
      /* Each sign-in gets its own session (up to a few per user); the oldest end when the limit is passed. */
      const token = createSession(db, user.id, req.get('user-agent') || '');
      audit(db, user.id, 'sign in');
      res.setHeader('Set-Cookie', cookie(token, 43200));
      res.json({ user: me(user) });
    } catch (e) { next(e); }
  });

  /* Your own account: the name and department, and the password. Nobody else's, and not the role. */
  const bumpUser = id => db.prepare("INSERT INTO revs (kind, id, rev) VALUES ('user', ?, 1) ON CONFLICT(kind, id) DO UPDATE SET rev = rev + 1").run(String(id));
  app.put('/api/me', requireUser, (req, res, next) => {
    try {
      const u = userDoc(req.user.id);
      if (!u) throw new HttpError(404, 'No such user.');
      const clean = v => String(v ?? '').trim().slice(0, 100);
      const first = clean(req.body?.first), last = clean(req.body?.last), dept = clean(req.body?.dept);
      if (!first && !last) throw new HttpError(400, 'Give a first or last name.');
      if (u.source === 'ldap') { u.dept = dept; }   /* the directory keeps the name */
      else Object.assign(u, { first, last, name: [first, last].filter(Boolean).join(' '), dept });
      saveUserDoc(u); bumpUser(u.id);
      audit(db, u.id, 'changed own details');
      res.json({ ok: true, me: me(u) });
    } catch (e) { next(e); }
  });
  app.get('/api/me/sessions', requireUser, (req, res) => {
    res.json({ sessions: listSessions(db, req.user.id, readCookie(req.headers.cookie, COOKIE)) });
  });
  /* Ends one of your sessions. Ending the one you are using signs you out. */
  app.delete('/api/me/sessions/:id', requireUser, (req, res, next) => {
    try {
      if (!endSessionById(db, req.user.id, req.params.id)) throw new HttpError(404, 'No such session.');
      audit(db, req.user.id, 'ended a session');
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  app.post('/api/me/password', requireUser, (req, res, next) => {
    try {
      const u = userDoc(req.user.id);
      if (!u) throw new HttpError(404, 'No such user.');
      if (u.source === 'ldap') throw new HttpError(400, 'Directory users change their password in the directory.');
      const keys = ['me:' + u.id];
      if (throttle.blocked(keys)) throw new HttpError(429, 'Too many tries. Try again in 15 minutes.');
      if (!checkLocalPassword(db, u.id, String(req.body?.current ?? ''))){ throttle.recordFailure(keys); throw new HttpError(400, 'The current password is not right.'); }
      const password = String(req.body?.password ?? '');
      const problem = passwordProblem(password, u.login);
      if (problem) throw new HttpError(400, problem);
      setPassword(db, u.id, password);
      endOtherSessions(db, u.id, readCookie(req.headers.cookie, COOKIE));
      audit(db, u.id, 'changed own password');
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  app.post('/api/logout', (req, res) => {
    endSession(db, readCookie(req.headers.cookie, COOKIE));
    res.setHeader('Set-Cookie', cookie('', 0));
    res.json({ ok: true });
  });

  app.get('/api/state', requireUser, (req, res) => {
    const s = loadState(db); delete s.empty;
    if (req.user.role !== 'admin') {   /* directory settings and sign-in names are for admins */
      delete s.ldap;
      s.users = s.users.map(({ login, groups, ...u }) => u);
    }
    res.json(s);
  });

  app.put('/api/state', requireUser, requireAdmin, (req, res, next) => {
    try {
      const incoming = req.body;
      if (!incoming || typeof incoming !== 'object') throw new HttpError(400, 'Send the inventory as JSON.');
      const users = incoming.users || [];
      if (!users.some(u => u.id === req.user.id)) throw new HttpError(400, 'Keep your own user in the list.');
      if (!users.some(u => u.role === 'admin' && u.active !== false)) throw new HttpError(400, 'At least one active admin is needed.');
      /* Settings only the server writes (connections, sync results, certificates) are kept as they are, whatever is sent,
         as with every other save. The counters only go up anyway. */
      const cur = loadState(db), next = { ...incoming };
      for (const k of SETTING_KEYS) {
        if (PAGE_SETTINGS.includes(k) || ['seq', 'codeN', 'rseq'].includes(k)) continue;
        if (cur[k] !== undefined) next[k] = cur[k]; else delete next[k];
      }
      saveState(db, next);
      audit(db, req.user.id, 'save inventory');
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  /* Factory reset: the whole inventory, and every account but the one asking, is removed. Needs the typed word. */
  app.post('/api/factory-reset', requireUser, requireAdmin, (req, res, next) => {
    try {
      if (!req.body || req.body.confirm !== 'FACTORY RESET') throw new HttpError(400, 'Type FACTORY RESET to confirm.');
      const backups = req.body.backups === true;
      audit(db, req.user.id, 'factory reset' + (backups ? ', backups deleted' : ''));
      factoryReset(db, req.user.id, { backups });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  /* The connections to other systems are removed: LDAP and Microsoft Graph settings, Graph's certificates and keys,
     the Lansweeper API settings and push token. The inventory itself stays. */
  app.post('/api/connections/clear', requireUser, requireAdmin, (req, res, next) => {
    try {
      clearConnections(db);
      audit(db, req.user.id, 'connections removed: LDAP, Microsoft Graph with its certificates, Lansweeper API and push token');
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  /* The page saves only what changed. See applyChanges for how a conflict is handled. */
  app.post('/api/changes', requireUser, requireAdmin, (req, res, next) => {
    try {
      const guard = s => {
        if (!s.users.some(u => u.id === req.user.id)) throw new HttpError(400, 'Keep your own user in the list.');
        if (!s.users.some(u => u.role === 'admin' && u.active !== false)) throw new HttpError(400, 'At least one active admin is needed.');
      };
      /* The names of objects and users being removed are read before they are gone. */
      const removes = Array.isArray(req.body?.dels) && req.body.dels.some(c => c && (c.kind === 'object' || c.kind === 'user'));
      const before = removes ? loadState(db) : null;
      const result = applyChanges(db, req.body, guard);
      const skipped = result && Array.isArray(result.conflicts) && result.conflicts.length ? ` (${result.conflicts.length} not saved: changed by someone else first)` : '';
      audit(db, req.user.id, describeChanges(req.body, before) + skipped);
      res.json(result);
    } catch (e) { next(e); }
  });

  app.post('/api/users/:id/password', requireUser, requireAdmin, (req, res, next) => {
    try {
      const u = userDoc(req.params.id);
      if (!u) throw new HttpError(404, 'No such user.');
      if (u.source === 'ldap') throw new HttpError(400, 'Directory users sign in with their directory password.');
      const password = String(req.body?.password ?? '');
      const problem = passwordProblem(password, u.login);
      if (problem) throw new HttpError(400, problem);
      setPassword(db, u.id, password);
      endOtherSessions(db, u.id, readCookie(req.headers.cookie, COOKIE));
      audit(db, req.user.id, 'set password for ' + u.login);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  /* The service account's password: set or replaced here, removed here, never read back. The server's own setting wins. */
  app.get('/api/ldap/password', requireUser, requireAdmin, (req, res) => {
    res.json({ source: ldapPasswordFromServer() ? 'server' : appSecretSetAt(db, 'ldapServicePassword') ? 'app' : null, setAt: appSecretSetAt(db, 'ldapServicePassword') });
  });
  app.post('/api/ldap/password', requireUser, requireAdmin, (req, res, next) => {
    try {
      const pw = req.body && typeof req.body.password === 'string' ? req.body.password : '';
      if (!pw) throw new HttpError(400, 'Enter the password.');
      if (pw.length > 256) throw new HttpError(400, 'The password is longer than 256 characters.');
      setAppSecret(db, SECRET_KEY, 'ldapServicePassword', pw);
      /* Tied to the directory server it is saved for. */
      const host = ldapHostOf(((ldapConfig ? ldapConfig() : ldap) || {}).url || '');
      if (host) setAppSecret(db, SECRET_KEY, 'ldapServicePasswordHost', host); else dropAppSecret(db, 'ldapServicePasswordHost');
      audit(db, req.user.id, 'directory service account password saved');
      res.json({ ok: true, setAt: appSecretSetAt(db, 'ldapServicePassword') });
    } catch (e) { next(e); }
  });
  app.delete('/api/ldap/password', requireUser, requireAdmin, (req, res) => {
    dropAppSecret(db, 'ldapServicePassword'); dropAppSecret(db, 'ldapServicePasswordHost');
    audit(db, req.user.id, 'directory service account password removed');
    res.json({ ok: true });
  });
  /* The nightly run reads the directory with the same settings and password. */
  app.locals.ldapConfig = cfgLdap;
  /* Test connection: reads the users of the saved directory settings and says how many are in scope. */
  /* The CA certificate the directory server's certificate is checked against. Public, so it is kept with the settings. */
  app.post('/api/ldap/ca', requireUser, requireAdmin, (req, res, next) => {
    try {
      const { pem, certs } = parseCaCerts(req.body && req.body.file);
      const s = loadState(db);
      s.ldapCa = { pem, certs, at: new Date().toISOString(), by: req.user.name || req.user.login || '' };
      saveState(db, s);
      audit(db, req.user.id, 'directory CA certificate added: ' + certs.map(c => c.name).join(', '));
      res.json({ certs });
    } catch (e) { next(e); }
  });
  app.delete('/api/ldap/ca', requireUser, requireAdmin, (req, res, next) => {
    try { const s = loadState(db); delete s.ldapCa; saveState(db, s); audit(db, req.user.id, 'directory CA certificate removed'); res.json({ ok: true }); }
    catch (e) { next(e); }
  });
  app.post('/api/ldap/test', requireUser, requireAdmin, async (req, res, next) => {
    try {
      const lc = cfgLdap();
      if (!ldapEnabled(lc)) throw new HttpError(400, 'Enter the directory server in Settings → LDAP sync first.');
      const people = await ldapListUsers(lc);
      res.json({ people: people.length, admins: people.filter(p => p.admin).length });
    } catch (e) {
      if (e instanceof HttpError) return next(e);
      /* A certificate that is not trusted: what the server presented, so nobody has to look on the server. */
      const report = isCertError(e.message) ? await ldapCertReport(cfgLdap()).catch(() => null) : null;
      const hint = report ? report.text : ldapHint(e.message);
      next(new HttpError(502, (hint || 'The directory cannot be read.') + ' (' + String(e.message).slice(0, 200) + ')'));
    }
  });

  /* The type rules applied to the devices already in the inventory. Without ids: the devices whose type would change.
     With ids: those of them change, after a backup. A type set by hand is never changed, nor a device that is not from
     Lansweeper or is retired. */
  /* Set by hand: marked so when changed on the device page, or an earlier change by a person is in its history. */
  const typeSetByHand = (s, o) => (o.ovr && o.ovr.type === false) || (s.history[o.id] || []).some(h => /^Type changed from .+ by (?!the type rules)/.test(h.msg || ''));
  const retypes = s => s.objs.filter(o => o.feed && o.feed.sys === 'Lansweeper' && o.status !== 'retired' && o.type !== 'rack' && !typeSetByHand(s, o))
    .map(o => ({ o, to: typeFor(s, o.feed.assetType, o.model, o.feed.role, o.name, o.feed.chassis) }))
    .filter(x => x.to !== x.o.type && (KNOWN_TYPES.includes(x.to) || (s.types || {})[x.to]));
  app.post('/api/feed/retype', requireUser, requireAdmin, (req, res, next) => {
    try {
      const s = loadState(db);
      const list = retypes(s);
      const ids = Array.isArray(req.body && req.body.ids) ? new Set(req.body.ids.map(String)) : null;
      if (!ids) return res.json({ changes: list.map(({ o, to }) => ({ id: o.id, code: o.code, name: o.name, model: o.model || '', assetType: o.feed.assetType || '', from: o.type, to })) });
      const pick = list.filter(x => ids.has(x.o.id));
      if (!pick.length) return res.json({ changed: 0 });
      autoBackup(db, 'before applying the type rules');
      const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
      for (const { o, to } of pick) {
        (s.history[o.id] ??= []).unshift({ t: now, msg: `Type changed from ${o.type} to ${to} by the type rules (${req.user.name || req.user.login})` });
        o.type = to;
      }
      saveState(db, s);
      audit(db, req.user.id, `type rules applied to ${pick.length} devices`);
      res.json({ changed: pick.length });
    } catch (e) { next(e); }
  });
  app.post('/api/feed/sync', requireUser, requireAdmin, async (req, res, next) => {
    try {
      lsRequire('api');
      const ls = cfgLs();
      if (!ls) throw new HttpError(400, 'No Lansweeper API token is set on the server. Set NI_LS_TOKEN or NI_LS_TOKEN_FILE.');
      const counts = await syncLansweeper(db, ls);
      res.json({ counts });
    } catch (e) { audit(db, null, 'Lansweeper sync failed: ' + e.message); next(e); }
  });

  /* Microsoft Graph: the join status, enrolment and compliance of the devices, read with a certificate.
     Set up in Settings: the tenant and app (client) id, and a certificate made here, whose key the server keeps sealed.
     NI_GRAPH_TENANT, NI_GRAPH_CLIENT_ID, NI_GRAPH_CERT and NI_GRAPH_KEY on the server, when all set, take precedence. */
  const graphSettings = () => loadState(db).graph || {};
  const graphFromApp = () => {
    const g = graphSettings();
    const pair = g.tenant && g.clientId ? graphKeyPair(db, SHEET_KEY, g.thumbprint) : null;
    return pair ? { tenant: g.tenant, clientId: g.clientId, ...pair } : null;
  };
  const cfgGraph = () => (graphConfig && graphConfig()) || graphFromApp();
  const graphSource = () => (graphConfig && graphConfig() ? 'server' : graphFromApp() ? 'app' : null);
  const editGraph = fn => { const s = loadState(db); s.graph = fn({ ...(s.graph || {}) }); const p = graphSettingsProblem(s.graph); if (p) throw new HttpError(400, p); saveState(db, s); };

  /* The certificates made here and the one the server signs in with: public details only, never a key. Each is listed by
     its SHA-1 thumbprint, which is what Entra shows for an uploaded certificate. */
  app.get('/api/graph/status', requireUser, requireAdmin, (req, res) => {
    const g = cfgGraph(), set = graphSettings();
    let used = null;
    if (g) { const x = new crypto.X509Certificate(g.certPem); used = { expires: new Date(x.validTo).toISOString(), thumbprint: entraThumbprintOf(g.certPem) }; }
    const certs = (loadState(db).graphCerts || []).map(c => ({ ...c, inUse: !!used && c.thumbprint === used.thumbprint, chosen: c.thumbprint === set.thumbprint, onServer: hasGraphKey(db, c.thumbprint) }));
    res.json({ configured: !!g, source: graphSource(), tenant: set.tenant || '', clientId: set.clientId || '', ...(used || {}), certs });
  });
  /* The tenant and the app (client) id, from the app registration's Overview page in Entra. */
  app.post('/api/graph/settings', requireUser, requireAdmin, (req, res, next) => {
    try {
      const b = req.body || {};
      editGraph(g => ({ ...g, tenant: String(b.tenant || '').trim(), clientId: String(b.clientId || '').trim() }));
      audit(db, req.user.id, 'Microsoft Graph settings saved');
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  /* A new certificate. The server keeps it with its key, sealed; the answer holds the certificate only. The first one made
     is the one used, until another is chosen. */
  app.post('/api/graph/cert', requireUser, requireAdmin, (req, res, next) => {
    try {
      const made = generateGraphCert();
      const thumbprint = entraThumbprintOf(made.certPem);
      storeGraphKey(db, SHEET_KEY, thumbprint, made.certPem, made.keyPem);
      const s = loadState(db);
      s.graphCerts = [{ thumbprint, created: new Date().toISOString(), expires: made.expires, by: req.user.name || req.user.login || '' }, ...(s.graphCerts || [])].slice(0, 20);
      if (!(s.graph && s.graph.thumbprint && hasGraphKey(db, s.graph.thumbprint))) s.graph = { ...(s.graph || {}), thumbprint };
      saveState(db, s);
      audit(db, req.user.id, `Microsoft Graph certificate ${thumbprint} created, expires ${made.expires}`);
      res.json({ thumbprint, certPem: made.certPem, expires: made.expires });
    } catch (e) { next(e); }
  });
  /* The certificate to upload to Entra, any time. It is public; the key stays on the server. */
  app.get('/api/graph/cert/:thumbprint/cer', requireUser, requireAdmin, (req, res, next) => {
    try {
      const t = String(req.params.thumbprint).toUpperCase();
      const pem = graphCertPem(db, t);
      res.set('Content-Type', 'application/x-pem-file').set('Content-Disposition', `attachment; filename="nobs-graph-${t.slice(0, 8)}.cer"`).send(pem);
    } catch (e) { next(e); }
  });
  /* Sign in with this certificate from now on. Upload it to Entra first, or the sign-in fails. */
  app.post('/api/graph/cert/:thumbprint/use', requireUser, requireAdmin, (req, res, next) => {
    try {
      const t = String(req.params.thumbprint).toUpperCase();
      if (!hasGraphKey(db, t)) throw new HttpError(404, 'This certificate is not on the server.');
      editGraph(g => ({ ...g, thumbprint: t }));
      audit(db, req.user.id, `Microsoft Graph certificate ${t} in use`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  /* Takes a certificate off the list and deletes its key here. It does not touch Entra: delete it there too. */
  app.delete('/api/graph/cert/:thumbprint', requireUser, requireAdmin, (req, res, next) => {
    try {
      const s = loadState(db), t = String(req.params.thumbprint).toUpperCase();
      const g = cfgGraph();
      /* One set in the server's environment is not the app's to remove. The one the app signs in with can go when that is
         asked for: Graph then stops until another certificate is created or chosen. */
      if (graphSource() === 'server' && g && entraThumbprintOf(g.certPem) === t) throw new HttpError(400, 'This certificate is set in the server settings (NI_GRAPH_CERT). Remove it there.');
      const inUse = s.graph && s.graph.thumbprint === t;
      if (inUse && req.query.inUse !== '1') throw new HttpError(400, 'This is the certificate the server signs in with. Use another one first, or confirm removing it.');
      if (inUse) delete s.graph.thumbprint;
      s.graphCerts = (s.graphCerts || []).filter(c => c.thumbprint !== t);
      saveState(db, s);
      dropGraphKey(db, t);
      audit(db, req.user.id, `Microsoft Graph certificate ${t} removed`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  const graphMissing = () => new HttpError(400, 'Microsoft Graph is not set up yet: give the directory (tenant) ID and the application (client) ID, and create a certificate.');
  /* Signs in and reads one device of each list, so a missing upload or permission is named before a sync. */
  app.post('/api/graph/test', requireUser, requireAdmin, async (req, res, next) => {
    try {
      const g = cfgGraph();
      if (!g) throw graphMissing();
      res.json(await testGraph(g, graphFetch));
    } catch (e) { next(e); }
  });
  app.post('/api/graph/sync', requireUser, requireAdmin, async (req, res, next) => {
    try {
      const g = cfgGraph();
      if (!g) throw graphMissing();
      const counts = await syncGraph(db, g, new Date(), graphFetch);
      audit(db, null, 'Microsoft Graph sync: ' + JSON.stringify(counts));
      res.json({ counts });
    } catch (e) { audit(db, null, 'Microsoft Graph sync failed: ' + e.message); next(e); }
  });
  /* Adds devices Graph has that the inventory does not: the ones picked, or all of them. */
  app.post('/api/graph/add', requireUser, requireAdmin, (req, res, next) => {
    try {
      const ids = req.body && req.body.ids === 'all' ? 'all' : Array.isArray(req.body && req.body.ids) ? req.body.ids.map(String).slice(0, 2000) : null;
      if (!ids) throw new HttpError(400, 'Say which devices to add.');
      const added = addGraphDevices(db, ids, req.user.name || req.user.login || 'an admin');
      audit(db, req.user.id, `added ${added.length} devices from Microsoft Graph`);
      res.json({ added: added.length });
    } catch (e) { next(e); }
  });
  /* The nightly run uses the same connection as the buttons. */
  app.locals.graphConfig = cfgGraph;
  /* Entry sheets: admins only. The password is in the answer that makes the sheet and in a re-download until it is
     marked as changed or PASSWORD_DAYS have passed; it is never written to the log. */
  app.get('/api/sheets', requireUser, requireAdmin, (req, res, next) => {
    try { purgePasswords(db, SHEET_KEY); res.json({ sheets: listSheets(db, String(req.query.user || '')), passwordDays: PASSWORD_DAYS }); } catch (e) { next(e); }
  });
  app.post('/api/sheets', requireUser, requireAdmin, (req, res, next) => {
    try {
      const made = createSheet(db, SHEET_KEY, loadState(db), req.body || {}, req.user.name || req.user.login || '');
      audit(db, req.user.id, `entry sheet ${made.id} made for ${made.sheet.person.name} (${made.sheet.devices.length} devices)`);
      res.json(made);
    } catch (e) { next(e); }
  });
  app.get('/api/sheets/:id', requireUser, requireAdmin, (req, res, next) => {
    try { purgePasswords(db, SHEET_KEY); const s = getSheet(db, SHEET_KEY, req.params.id); audit(db, req.user.id, `entry sheet ${s.id} opened`); res.json(s); } catch (e) { next(e); }
  });
  /* The sheet as a PDF, with the company's name and logo. It holds the password while the kept sheet does. */
  app.get('/api/sheets/:id/pdf', requireUser, requireAdmin, async (req, res, next) => {
    try {
      purgePasswords(db, SHEET_KEY);
      const s = getSheet(db, SHEET_KEY, req.params.id);
      const pdf = await sheetPdf(s.sheet, loadState(db).company || {});
      audit(db, req.user.id, `entry sheet ${s.id} downloaded as PDF`);
      const file = `entry-sheet-${s.sheet.person.name.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${String(s.sheet.issued).slice(0, 10)}.pdf`;
      res.type('application/pdf').attachment(file).set('Cache-Control', 'no-store').send(pdf);
    } catch (e) { next(e); }
  });
  app.post('/api/sheets/:id/changed', requireUser, requireAdmin, (req, res, next) => {
    try { markChanged(db, SHEET_KEY, req.params.id); audit(db, req.user.id, `entry sheet ${req.params.id}: password marked as changed, removed from the sheet`); res.json({ ok: true }); } catch (e) { next(e); }
  });
  app.delete('/api/sheets/:id', requireUser, requireAdmin, (req, res, next) => {
    try { deleteSheet(db, req.params.id); audit(db, req.user.id, `entry sheet ${req.params.id} deleted`); res.json({ ok: true }); } catch (e) { next(e); }
  });
  app.post('/api/ldap/sync', requireUser, requireAdmin, async (req, res, next) => {
    try {
      const lc = cfgLdap();
      if (!ldapEnabled(lc)) throw new HttpError(400, 'Enter the directory server in Settings → LDAP sync first.');
      let counts;
      try { counts = await syncLdapUsers(db, lc); }
      catch (e) {
        if (e instanceof HttpError) throw e;
        console.error('directory sync:', e.message);
        /* A certificate that is not trusted: what the server presented, as Test connection says it. */
        const report = isCertError(e.message) ? await ldapCertReport(lc).catch(() => null) : null;
        throw new HttpError(503, report ? 'The directory could not be read. ' + report.text : 'The directory could not be read. Check the service account.');
      }
      res.json({ counts });
    } catch (e) { next(e); }
  });

  /* Lansweeper pushes its assets from a script on its own server (scripts/Lansweeper-Push.ps1), with the token the
     administrator set (NI_FEED_TOKEN). Without a token set, this route refuses every request. */
  app.post('/api/feed/push', (req, res, next) => {
    try {
      /* Wrong tokens count against the address, the same way wrong passwords do, so a token cannot be guessed by trying. */
      const keys = ['push:' + (req.ip || '')];
      if (throttle.blocked(keys)) throw new HttpError(429, 'Too many wrong feed tokens. Try again in 15 minutes.');
      const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
      if (!feedTokenValid(db, m && m[1], feedToken)){ throttle.recordFailure(keys); throw new HttpError(401, 'The feed token is wrong, or none is set on the server.'); }
      lsRequire('push');
      const records = req.body && req.body.records;
      if (!Array.isArray(records)) throw new HttpError(400, 'Send the assets as {"records": [...]}.');
      if (records.length > 20000) throw new HttpError(413, 'Too many assets in one push. Send them in parts.');
      const s = loadState(db);
      const counts = mergeRecords(s, recordsFromJson(records), new Date(), cleanIpLocations(req.body.ipLocations));
      if (feedChanged(counts)) { autoBackup(db, 'before a Lansweeper push'); saveState(db, s); }
      audit(db, null, 'feed push: ' + JSON.stringify(counts));
      res.json({ counts });
    } catch (e) { audit(db, null, 'feed push failed: ' + e.message); next(e); }
  });

  /* The push token, made in Settings → Feed. Only its hash is kept. */
  app.get('/api/feed/push-token', requireUser, requireAdmin, (req, res) => {
    const row = db.prepare("SELECT at, action FROM audit WHERE action LIKE 'feed push: %' ORDER BY id DESC LIMIT 1").get();
    const last = row ? { at: row.at, counts: JSON.parse(row.action.slice('feed push: '.length)) } : null;
    res.json({ info: feedTokenInfo(db), last });
  });
  app.post('/api/feed/push-token', requireUser, requireAdmin, (req, res, next) => {
    try {
      const token = createFeedToken(db);
      audit(db, req.user.id, 'feed push token created');
      res.json({ token, info: feedTokenInfo(db) });
    } catch (e) { next(e); }
  });
  app.delete('/api/feed/push-token', requireUser, requireAdmin, (req, res, next) => {
    try {
      revokeFeedToken(db);
      audit(db, req.user.id, 'feed push token revoked');
      res.json({ info: null });
    } catch (e) { next(e); }
  });
  /* The push script, with this server's address already in it. */
  /* The SHA-1 thumbprint of the certificate the proxy presents for a host name, as Windows writes it ('' when it cannot
     be read). The push script pins it, so a certificate Windows does not trust (the self-signed one of a new install)
     works without a question; a trusted one is not affected by the pin. */
  const proxyThumbprint = hostname => new Promise(resolve => {
    const ip = /^[\d.]+$|:/.test(hostname);
    const sock = tls.connect({ host: certProbe.host, port: certProbe.port, servername: ip ? undefined : hostname, rejectUnauthorized: false }, () => {
      const c = sock.getPeerCertificate();
      sock.end();
      resolve(c && c.fingerprint ? c.fingerprint.replace(/:/g, '').toUpperCase() : '');
    });
    sock.setTimeout(3000, () => { sock.destroy(); resolve(''); });
    sock.on('error', () => resolve(''));
  });
  app.get('/api/feed/push-script', requireUser, requireAdmin, async (req, res, next) => {
    try {
      const text = fs.readFileSync(path.join(publicDir, '..', 'scripts', 'Lansweeper-Push.ps1'), 'utf8');
      /* The address is written into a script that people run, so only a plain host name or address is accepted. */
      const host = req.get('host') || '';
      if (!/^[A-Za-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-fA-F:.]+\](:\d{1,5})?$/.test(host)) throw new HttpError(400, 'The address of this server could not be read from the request.');
      const origin = `${req.protocol}://${host}`;
      const thumb = req.protocol === 'https' ? await proxyThumbprint(host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '')) : '';
      res.attachment('Lansweeper-Push.ps1').type('text/plain; charset=utf-8')
        .send(text.replace(/NobsUrl(\s*)=\s*'[^']*'/, (_, sp) => `NobsUrl${sp}= '${origin}'`)
          .replace(/NobsCertThumbprint(\s*)=\s*'[^']*'/, (_, sp) => `NobsCertThumbprint${sp}= '${/^[0-9A-F]{40}$/.test(thumb) ? thumb : ''}'`));
    } catch (e) { next(e); }
  });

  /* The log: what was synced, saved, restored and signed in, and what failed. Admins only. */
  app.get('/api/log', requireUser, requireAdmin, (req, res, next) => {
    try {
      const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 300));
      const names = new Map(loadState(db).users.map(u => [String(u.id), u.name || u.login || '']));
      const rows = db.prepare('SELECT at, user_id, action FROM audit ORDER BY id DESC LIMIT ?').all(limit);
      const isError = /fail|refus|error|throttl|denied|wrong|could not|not set|not allowed/i;
      res.json({ entries: rows.map(r => ({ at: r.at, who: r.user_id ? (names.get(String(r.user_id)) || 'Unknown user') : 'Server', action: r.action, level: isError.test(r.action) ? 'error' : 'info' })) });
    } catch (e) { next(e); }
  });
  /* Backups: the list, a new one by hand, download, restore (from the list or from a file), and delete. Admins only. */
  app.get('/api/backups', requireUser, requireAdmin, (req, res) => {
    res.json({ backups: db.prepare('SELECT id, at, reason, objects, LENGTH(data) AS bytes FROM backups ORDER BY id DESC').all() });
  });
  app.post('/api/backups', requireUser, requireAdmin, (req, res, next) => {
    try { const id = takeBackup(db, 'by hand'); audit(db, req.user.id, 'backup taken by hand'); res.json({ id }); }
    catch (e) { next(e); }
  });
  app.get('/api/backups/:id/download', requireUser, requireAdmin, (req, res, next) => {
    try {
      const row = db.prepare('SELECT at, data FROM backups WHERE id = ?').get(Number(req.params.id));
      if (!row) throw new HttpError(404, 'No such backup.');
      res.attachment(`nobs-backup-${row.at.slice(0, 19).replace(/[:T]/g, '-')}.json`).type('application/json').send(row.data);
    } catch (e) { next(e); }
  });
  app.post('/api/backups/:id/restore', requireUser, requireAdmin, (req, res, next) => {
    try {
      const row = db.prepare('SELECT data FROM backups WHERE id = ?').get(Number(req.params.id));
      if (!row) throw new HttpError(404, 'No such backup.');
      takeBackup(db, 'before a restore');
      restoreBackup(db, JSON.parse(row.data));
      audit(db, req.user.id, 'restored backup ' + req.params.id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  app.post('/api/backups/restore-file', requireUser, requireAdmin, (req, res, next) => {
    try {
      let data;
      try { data = JSON.parse(typeof req.body === 'string' ? req.body : ''); } catch { throw new HttpError(400, 'This file is not a backup of NOBS Inventory.'); }
      takeBackup(db, 'before a restore from file');
      restoreBackup(db, data);
      audit(db, req.user.id, 'restored a backup from a file');
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  app.delete('/api/backups/:id', requireUser, requireAdmin, (req, res, next) => {
    try { db.prepare('DELETE FROM backups WHERE id = ?').run(Number(req.params.id)); audit(db, req.user.id, 'backup deleted'); res.json({ ok: true }); }
    catch (e) { next(e); }
  });
  /* Floor-plan images are kept apart from the inventory, so they do not count against its size. */
  const planId = req => { if (!/^[A-Za-z0-9_-]{1,64}$/.test(req.params.id)) throw new HttpError(400, 'No such plan.'); return req.params.id; };
  app.put('/api/plans/:id/image', requireUser, requireAdmin, (req, res, next) => {
    try {
      const id = planId(req);
      const data = typeof req.body === 'string' ? req.body : '';
      if (!/^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) throw new HttpError(400, 'Send a PNG, JPEG, GIF or WebP image.');
      if (data.length > 2000000) throw new HttpError(413, 'The image is too large.');
      db.prepare('INSERT INTO plan_images (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(id, data);
      audit(db, req.user.id, 'plan image saved');
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  app.get('/api/plans/:id/image', requireUser, (req, res, next) => {
    try {
      const row = db.prepare('SELECT data FROM plan_images WHERE id = ?').get(planId(req));
      if (!row) throw new HttpError(404, 'No image for this plan.');
      const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(row.data);
      res.type(m[1]).set('Cache-Control', 'private, max-age=3600').send(Buffer.from(m[2], 'base64'));
    } catch (e) { next(e); }
  });
  app.delete('/api/plans/:id/image', requireUser, requireAdmin, (req, res, next) => {
    try { db.prepare('DELETE FROM plan_images WHERE id = ?').run(planId(req)); audit(db, req.user.id, 'plan image removed'); res.json({ ok: true }); }
    catch (e) { next(e); }
  });
  /* One automatic source at a time: the script push, or the API sync. A manual CSV import is always allowed when Lansweeper is on. */
  const lsRequire = mode => {
    const s = loadState(db);
    if (s.useLansweeper === false) throw new HttpError(403, 'Lansweeper is turned off in Settings → Feed.');
    if (mode === 'push' && s.lsSource === 'api') throw new HttpError(403, 'Lansweeper is set to API sync in Settings → Feed. Switch to script push to use it.');
    if (mode === 'api' && s.lsSource !== 'api') throw new HttpError(403, 'Lansweeper is set to script push in Settings → Feed. Switch to API sync to run it.');
  };
  app.post('/api/feed/import', requireUser, requireAdmin, (req, res, next) => {
    try { lsRequire(); } catch (e) { return next(e); }
    try {
      const text = typeof req.body === 'string' ? req.body : '';
      if (!text) throw new HttpError(400, 'Send the export as CSV text.');
      const s = loadState(db);
      const counts = mergeFeed(s, text);
      if (feedChanged(counts)) { autoBackup(db, 'before a Lansweeper import'); saveState(db, s); }
      audit(db, req.user.id, 'feed import: ' + JSON.stringify(counts));
      res.json({ counts });
    } catch (e) { audit(db, null, 'Lansweeper import failed: ' + e.message); next(e); }
  });

  /* The page itself is never cached, so an update is seen at once; scripts and styles are cached and revalidated. */
  app.use(express.static(publicDir, { index: 'index.html', maxAge: 0, setHeaders: (res, file) => { if (!file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Send valid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'The request is too large.' });
    res.status(status).json({ error: status === 500 ? 'Something went wrong.' : err.message });
  });
  return app;
}
