/* The web server: setup, the checks every request passes (browser protections, same origin, body size), sign-in
   helpers, and the route groups mounted from their own files. */
import express from 'express';
import fs from 'node:fs';
import dns from 'node:dns/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit } from './db.js';
import { smtpConfig } from './digest.js';
import { registerApiRoutes } from './api-routes.js';
import { registerPeopleRoutes } from './people-routes.js';
import { settingOf, loadState } from './state.js';
import { sessionUserId, readCookie } from './auth.js';
import { ldapPinOf, ldapPinProblem } from './ldap-config.js';
import { feedTokenValid } from './feed-token.js';
import { setBackupSheetKey } from './backup.js';
import { graphKeyPair, initGraphKeys } from './graph-keys.js';
import { initSheets } from './sheets.js';
import crypto from 'node:crypto';
import { getAppSecret, setAppSecret } from './app-secrets.js';
import { HttpError } from './errors.js';
import { createThrottle } from './throttle.js';
import { registerDeviceImages } from './device-images.js';
import { registerSessionRoutes } from './session-routes.js';
import { registerStateRoutes } from './state-routes.js';
import { registerSyncRoutes } from './sync-routes.js';
import { registerGraphRoutes } from './graph-routes.js';
import { registerSheetRoutes } from './sheet-routes.js';
import { registerSettingsRoutes } from './settings-routes.js';
import { registerBackupRoutes } from './backup-routes.js';
import { registerLiveEvents } from './live-events.js';
import { registerLogRoutes } from './log-routes.js';
import { registerViewMailRoutes } from './view-mail.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const publicDir = path.join(here, '..', 'public');
/* Over HTTPS the session cookie is a __Host- cookie: only this host can set it, so another site behind the same proxy
   (a wiki on a sibling name) cannot plant a session of its own in the browser. */
const cookieName = secure => secure ? '__Host-ni_session' : 'ni_session';
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version;

export function createApp({ db, ldap = null, ldapConfig = null, lansweeper = null, lansweeperConfig = null, graphConfig = null, feedToken = null, secureCookie = false, sheetKey = null, graphFetch = fetch, diskSpace = undefined, mailTransport = null, certProbe = { host: 'nobs-proxy', port: 443 }, trustedProxy = '', loginFailMs = 0 }) {
  /* Entry sheets are sealed with this key. Without one (tests), a key for this process only. */
  const SECRET_KEY = sheetKey || crypto.randomBytes(32), SHEET_KEY = SECRET_KEY;
  setBackupSheetKey(SHEET_KEY);
  initSheets(db);
  initGraphKeys(db);
  const cfgLs = () => (lansweeperConfig ? lansweeperConfig() : lansweeper);
  /* The directory settings are read when they are needed, so a change in Settings applies without a restart. The service
     account's password is the server's (NI_LDAP_SERVICE_PASSWORD) when it has one, else the one saved in Settings. */
  const cfgLdap = () => {
    let c = ldapConfig ? ldapConfig() : ldap;
    /* The CA certificate added in Settings, whichever way the settings came. */
    if (c && !c.caPem) { const r = db.prepare("SELECT data FROM docs WHERE kind = 'setting' AND id = 'ldapCa'").get(); const pem = r && JSON.parse(r.data)?.pem; if (pem) c = { ...c, caPem: pem }; }
    /* The server's password with no NI_LDAP_URL naming its directory: tied to the directory it is first used with, like
       one saved here, so an address changed in Settings later (or by someone with a stolen session) does not get it. */
    if (c && c.envPasswordUnpinned && c.servicePassword) {
      const pin = ldapPinOf(c), pinned = getAppSecret(db, SECRET_KEY, 'ldapEnvPasswordHost'), problem = ldapPinProblem(pinned, c);
      if (problem) return { ...c, servicePassword: '', passwordProblem: `The service password on the server (NI_LDAP_SERVICE_PASSWORD) ${problem}. Set NI_LDAP_URL to the server, or change the settings back.` };
      if (pin && pinned !== pin && (!pinned || !pinned.includes('|') || pin.endsWith('|tls'))) setAppSecret(db, SECRET_KEY, 'ldapEnvPasswordHost', pin);
    }
    if (!c || c.servicePassword || c.passwordProblem) return c;
    const saved = getAppSecret(db, SECRET_KEY, 'ldapServicePassword');
    if (!saved) return c;
    /* The password saved here goes only to the directory server it was saved for. One saved before this was kept is
       tied to the server it is first used with: the first read of the settings (any caller, also /api/me) pins it. */
    const pin = ldapPinOf(c), pinned = getAppSecret(db, SECRET_KEY, 'ldapServicePasswordHost'), problem = ldapPinProblem(pinned, c);
    if (problem) return { ...c, passwordProblem: `The service password ${problem}. Save the password again for it.` };
    /* Pinned at first use; a pin from before (the host only) gets the encryption now in use, and turning it on tightens it. */
    if (pin && pinned !== pin && (!pinned || !pinned.includes('|') || pin.endsWith('|tls'))) setAppSecret(db, SECRET_KEY, 'ldapServicePasswordHost', pin);
    return { ...c, servicePassword: saved };
  };
  const ldapPasswordFromServer = () => { const c = ldapConfig ? ldapConfig() : ldap; return !!(c && c.servicePassword); };
  const app = express();
  app.disable('x-powered-by');
  /* Caddy is the only proxy in front of the app: the client address it forwards is believed only when the request
     comes from Caddy itself (trustedProxy, its container name, looked up again every minute as its address can change)
     or from this machine. Another container on the shared proxy network cannot make up addresses to get past the
     sign-in throttle. */
  const proxyAddrs = new Set();
  const plainAddr = a => String(a || '').replace(/^::ffff:/, '');
  if (trustedProxy) {
    /* One address, the one the name has now: an address left from before (the proxy removed, its address given to
       another container) is not trusted any more. */
    const look = () => dns.lookup(trustedProxy).then(x => { proxyAddrs.clear(); proxyAddrs.add(plainAddr(x.address)); }).catch(() => proxyAddrs.clear());
    look(); const t = setInterval(look, 60_000); t.unref();
  }
  app.set('trust proxy', (addr, i) => i === 0 && (['127.0.0.1', '::1'].includes(plainAddr(addr)) || proxyAddrs.has(plainAddr(addr))));
  const throttle = createThrottle();
  /* Requests from people not signed in are logged at most once a minute per address and kind, with how many more came:
     a flood of them cannot push the log's older lines out. */
  const quiet = new Map();
  const auditQuiet = (key, msg) => {
    const t = Date.now(), q = quiet.get(key);
    if (q && t - q.at < 60000) { q.n++; return; }
    if (quiet.size > 5000) quiet.clear();
    quiet.set(key, { at: t, n: 0 });
    audit(db, null, q && q.n ? `${msg} (and ${q.n} more like it from this address in the minute before)` : msg);
  };
  /* Browser protections: the page's script is a file of its own, so no inline script runs. */
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
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
    /* A compressed body is never unpacked (inflate: false below): a few KB could become hundreds of MB before any check. */
    const enc = String(req.get('content-encoding') || 'identity').toLowerCase();
    if (enc !== 'identity') return res.set('Connection', 'close').status(415).json({ error: 'Send the request uncompressed.' });
    const big = Number(req.get('content-length') || 0) > 1048576 || !!req.get('transfer-encoding');
    if (!big) return next();
    /* A token checked here counts against the address like one checked by the push itself, so it cannot be guessed here. */
    const pushKeys = ['push:' + (req.ip || '')];
    if (req.path === '/feed/push' && throttle.blocked(pushKeys)) return res.set('Connection', 'close').status(429).json({ error: 'Too many wrong feed tokens. Try again in 15 minutes.' });
    const ok = req.path === '/feed/push'
      ? feedTokenValid(db, (/^Bearer (.+)$/.exec(req.get('authorization') || '') || [])[1], feedToken)
      : currentUser(req)?.role === 'admin';
    if (!ok && req.path === '/feed/push') throttle.recordFailure(pushKeys);
    if (ok) return next();
    res.set('Connection', 'close').status(401).json({ error: 'Sign in as an admin first.' });
  });
  /* A backup can be larger than a normal save; the largest is a full backup with its history and plan pictures. */
  /* Bodies are read only under /api, after the check above: a request elsewhere is never parsed. */
  app.use('/api', express.json({ limit: '30mb', inflate: false }));
  /* A backup file comes with its floor-plan pictures (up to 2 MB each), so its upload has a higher limit of its own. */
  const textBody = express.text({ type: ['text/plain', 'text/csv'], limit: '30mb', inflate: false });
  const backupBody = express.text({ type: ['text/plain', 'text/csv'], limit: '200mb', inflate: false });
  app.use('/api', (req, res, next) => (req.path === '/backups/restore-file' ? backupBody : textBody)(req, res, next));

  const userDoc = id => { const r = db.prepare("SELECT data FROM docs WHERE kind = 'user' AND id = ?").get(id); return r ? JSON.parse(r.data) : null; };
  /* A deactivated user loses access at once, even with a session that is still open. */
  /* A user with the role none has no access either: a session they hold ends at the next request. */
  const currentUser = req => { const uid = sessionUserId(db, readCookie(req.headers.cookie, COOKIE)); const u = uid ? userDoc(uid) : null; return u && u.active !== false && u.role !== 'none' ? u : null; };
  const me = u => ({ id: u.id, login: u.login, name: u.name, role: u.role === 'admin' ? 'admin' : 'viewer' });
  const COOKIE = cookieName(secureCookie);
  const cookie = (token, maxAge) => `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secureCookie ? '; Secure' : ''}`;
  /* A user record written outside a checked save (sign-in, own name). It never gives a login a second account: two would
     make every later save fail the check that logins are distinct. */
  const saveUserDoc = u => {
    const lc = String(u.login || '').toLowerCase();
    const twin = db.prepare("SELECT data FROM docs WHERE kind = 'user' AND id <> ?").all(u.id).some(r => String(JSON.parse(r.data).login || '').toLowerCase() === lc);
    if (lc && twin) throw new HttpError(409, 'Another account already has this login.');
    db.prepare("INSERT INTO docs (kind, id, data) VALUES ('user', ?, ?) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data").run(u.id, JSON.stringify(u));
  };

  const requireUser = (req, res, next) => {
    const u = currentUser(req);
    if (!u) return next(new HttpError(401, 'Sign in first.'));
    req.user = u; next();
  };
  const requireAdmin = (req, res, next) => (req.user.role === 'admin' ? next() : next(new HttpError(403, 'Only an admin can change this.')));

  app.get('/api/health', (req, res) => res.json({ ok: true, version: APP_VERSION }));

  /* Microsoft Graph: the join status, enrolment and compliance of the devices, read with a certificate.
     Set up in Settings: the tenant and app (client) id, and a certificate made here, whose key the server keeps sealed.
     NI_GRAPH_TENANT, NI_GRAPH_CLIENT_ID, NI_GRAPH_CERT and NI_GRAPH_KEY on the server, when all set, take precedence. */
  const graphSettings = () => loadState(db).graph || {};
  const graphFromApp = () => {
    const g = graphSettings();
    const pair = g.tenant && g.clientId ? graphKeyPair(db, SHEET_KEY, g.thumbprint) : null;
    return pair ? { tenant: g.tenant, clientId: g.clientId, ...pair } : null;
  };
  /* How far the people from Entra go (Settings): the same whichever way the connection is set. */
  const cfgGraph = () => { const c = (graphConfig && graphConfig()) || graphFromApp(); return c ? { ...c, people: graphSettings().people || 'match', defender: graphSettings().defender || 'off', autopilot: graphSettings().autopilot || 'off', secureBoot: graphSettings().secureBoot || 'off' } : null; };
  const graphSource = () => (graphConfig && graphConfig() ? 'server' : graphFromApp() ? 'app' : null);
  /* The mail server: the server's (NI_SMTP_*) or the one set here, its password kept sealed (app_secrets), never sent. */
  const smtpSaved = () => { const v = settingOf(db, 'smtp'); return v && v.host ? { ...v, pass: getAppSecret(db, SECRET_KEY, 'smtpPassword') } : null; };
  const smtpNow = () => smtpConfig(process.env, smtpSaved());
  app.locals.smtpOn = () => !!smtpNow();
  /* A user record written outside a save gets a new revision, so a page holding the old one cannot save it back. */
  const bumpUser = id => db.prepare("INSERT INTO revs (kind, id, rev) VALUES ('user', ?, 1) ON CONFLICT(kind, id) DO UPDATE SET rev = rev + 1").run(String(id));

  /* The route groups, each in its own file, with what they share. */
  const ctx = { db, throttle, auditQuiet, requireUser, requireAdmin, currentUser, me, userDoc, saveUserDoc, bumpUser, COOKIE, cookie, secureCookie, loginFailMs,
    cfgLs, cfgLdap, ldap, ldapConfig, ldapPasswordFromServer, cfgGraph, graphSettings, graphSource, SECRET_KEY, SHEET_KEY, feedToken, graphFetch,
    mailTransport, certProbe, diskSpace, smtpNow, APP_VERSION, publicDir };
  /* Live updates (server/live-events.js): first, so a check follows every change made through the routes below. */
  registerLiveEvents(app, ctx);
  registerSessionRoutes(app, ctx);
  registerStateRoutes(app, ctx);
  registerSyncRoutes(app, ctx);
  registerGraphRoutes(app, ctx);
  registerSheetRoutes(app, ctx);
  registerSettingsRoutes(app, ctx);
  registerViewMailRoutes(app, ctx);
  registerBackupRoutes(app, ctx);
  registerPeopleRoutes(app, { db, requireUser, requireAdmin, mailTransport, smtpNow });
  registerApiRoutes(app, { db, requireUser, requireAdmin, throttle });
  registerLogRoutes(app, { db, requireUser, requireAdmin });
  /* Photos of devices (server/device-images.js). */
  registerDeviceImages(app, { db, requireUser, requireAdmin, audit });

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
