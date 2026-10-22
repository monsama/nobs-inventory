import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit } from './db.js';
import { loadState, saveState, applyChanges, factoryReset } from './state.js';
import { setPassword, checkLocalPassword, createSession, sessionUserId, endSession, readCookie } from './auth.js';
import { ldapEnabled, ldapLogin, ldapListUsers } from './ldap.js';
import { mergeFeed, mergeRecords, recordsFromJson } from './feed.js';
import { feedTokenInfo, createFeedToken, revokeFeedToken, feedTokenValid } from './feed-token.js';
import { syncLansweeper } from './lansweeper.js';
import { syncLdapUsers } from './ldap-sync.js';
import { HttpError } from './errors.js';
import { createThrottle } from './throttle.js';
import { DUMMY } from './password.js';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
export const publicDir = path.join(here, '..', 'public');
const COOKIE = 'ni_session';
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version;

export function createApp({ db, ldap = null, ldapConfig = null, lansweeper = null, lansweeperConfig = null, feedToken = null, secureCookie = false }) {
  const cfgLs = () => (lansweeperConfig ? lansweeperConfig() : lansweeper);
  /* The directory settings are read when they are needed, so a change in Settings applies without a restart. */
  const cfgLdap = () => (ldapConfig ? ldapConfig() : ldap);
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
  app.use(express.json({ limit: '6mb' }));
  app.use(express.text({ type: ['text/plain', 'text/csv'], limit: '6mb' }));

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
    res.json({ user: u ? me(u) : null, ldap: ldapEnabled(cfgLdap()), lansweeper: !!cfgLs() });
  });

  /* One answer for every failed sign-in: wrong login, wrong password, deactivated, not in the group. This keeps
     account names from being discovered, and the throttle counts every failure against the login and the address. */
  const FAILED = 'The login or password is not right.';
  app.post('/api/login', async (req, res, next) => {
    try {
      const login = String(req.body?.login ?? '').trim().slice(0, 200);
      const password = String(req.body?.password ?? '');
      const keys = ['login:' + login.toLowerCase(), 'ip:' + (req.ip || '')];
      if (throttle.blocked(keys)) { audit(db, null, 'sign in throttled for ' + login); throw new HttpError(429, 'Too many failed sign-ins. Try again in 15 minutes.'); }
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
      if (!ok && ldapEnabled(lc)) {
        let d;
        try { d = await ldapLogin(lc, login, password); }
        catch (e) { console.error('directory:', e.message); throw new HttpError(503, 'The directory cannot be reached right now.'); }
        if (d && d.allowed) {
          const isAdmin = !!d.admin;
          if (!user) user = { id: 'ldap-' + login.toLowerCase(), login, name: d.name, dept: d.dept, groups: d.groups, source: 'ldap', active: true, role: 'viewer' };
          Object.assign(user, { name: d.name, dept: d.dept, groups: d.groups, source: 'ldap', role: isAdmin ? 'admin' : 'viewer' });
          saveUserDoc(user);
          ok = true;
        } else if (d) { audit(db, null, 'sign in refused, not in group: ' + login); }
      }
      if (!ok || !user || user.active === false) {
        throttle.recordFailure(keys);
        audit(db, null, 'failed sign in for ' + login);
        throw new HttpError(401, FAILED);
      }
      throttle.clearFailures(keys);
      /* Each sign-in gets its own session (up to a few per user); the oldest end when the limit is passed. */
      const token = createSession(db, user.id);
      audit(db, user.id, 'sign in');
      res.setHeader('Set-Cookie', cookie(token, 43200));
      res.json({ user: me(user) });
    } catch (e) { next(e); }
  });

  app.post('/api/logout', (req, res) => {
    endSession(db, readCookie(req.headers.cookie, COOKIE));
    res.setHeader('Set-Cookie', cookie('', 0));
    res.json({ ok: true });
  });

  app.get('/api/state', requireUser, (req, res) => {
    const s = loadState(db); delete s.empty;
    if (req.user.role !== 'admin') delete s.ldap;   /* directory settings are for admins */
    res.json(s);
  });

  app.put('/api/state', requireUser, requireAdmin, (req, res, next) => {
    try {
      const incoming = req.body;
      if (!incoming || typeof incoming !== 'object') throw new HttpError(400, 'Send the inventory as JSON.');
      const users = incoming.users || [];
      if (!users.some(u => u.id === req.user.id)) throw new HttpError(400, 'Keep your own user in the list.');
      if (!users.some(u => u.role === 'admin' && u.active !== false)) throw new HttpError(400, 'At least one active admin is needed.');
      saveState(db, incoming);
      audit(db, req.user.id, 'save inventory');
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  /* Factory reset: the whole inventory, and every account but the one asking, is removed. Needs the typed word. */
  app.post('/api/factory-reset', requireUser, requireAdmin, (req, res, next) => {
    try {
      if (!req.body || req.body.confirm !== 'FACTORY RESET') throw new HttpError(400, 'Type FACTORY RESET to confirm.');
      audit(db, req.user.id, 'factory reset');
      factoryReset(db, req.user.id);
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
      const result = applyChanges(db, req.body, guard);
      audit(db, req.user.id, 'save changes');
      res.json(result);
    } catch (e) { next(e); }
  });

  app.post('/api/users/:id/password', requireUser, requireAdmin, (req, res, next) => {
    try {
      const u = userDoc(req.params.id);
      if (!u) throw new HttpError(404, 'No such user.');
      if (u.source === 'ldap') throw new HttpError(400, 'Directory users sign in with their directory password.');
      const password = String(req.body?.password ?? '');
      if (password.length < 8) throw new HttpError(400, 'Use at least 8 characters.');
      if (password.length > 256) throw new HttpError(400, 'Use at most 256 characters.');
      setPassword(db, u.id, password);
      audit(db, req.user.id, 'set password for ' + u.login);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  /* Test connection: reads the users of the saved directory settings and says how many are in scope. */
  app.post('/api/ldap/test', requireUser, requireAdmin, async (req, res, next) => {
    try {
      const lc = cfgLdap();
      if (!ldapEnabled(lc)) throw new HttpError(400, 'Enter the directory server in Settings → LDAP sync first.');
      const people = await ldapListUsers(lc);
      res.json({ people: people.length });
    } catch (e) {
      next(e instanceof HttpError ? e : new HttpError(502, 'The directory cannot be read: ' + e.message));
    }
  });

  app.post('/api/feed/sync', requireUser, requireAdmin, async (req, res, next) => {
    try {
      const ls = cfgLs();
      if (!ls) throw new HttpError(400, 'No Lansweeper API token is set on the server. Set NI_LS_TOKEN or NI_LS_TOKEN_FILE.');
      const counts = await syncLansweeper(db, ls);
      res.json({ counts });
    } catch (e) { next(e); }
  });

  app.post('/api/ldap/sync', requireUser, requireAdmin, async (req, res, next) => {
    try {
      const lc = cfgLdap();
      if (!ldapEnabled(lc)) throw new HttpError(400, 'Enter the directory server in Settings → LDAP sync first.');
      let counts;
      try { counts = await syncLdapUsers(db, lc); }
      catch (e) { if (e instanceof HttpError) throw e; console.error('directory sync:', e.message); throw new HttpError(503, 'The directory could not be read. Check the service account.'); }
      res.json({ counts });
    } catch (e) { next(e); }
  });

  /* Lansweeper pushes its assets from a script on its own server (scripts/Lansweeper-Push.ps1), with the token the
     administrator set (NI_FEED_TOKEN). Without a token set, this route refuses every request. */
  app.post('/api/feed/push', (req, res, next) => {
    try {
      const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
      if (!feedTokenValid(db, m && m[1], feedToken)) throw new HttpError(401, 'The feed token is wrong, or none is set on the server.');
      const records = req.body && req.body.records;
      if (!Array.isArray(records)) throw new HttpError(400, 'Send the assets as {"records": [...]}.');
      if (records.length > 20000) throw new HttpError(413, 'Too many assets in one push. Send them in parts.');
      const s = loadState(db);
      const counts = mergeRecords(s, recordsFromJson(records));
      saveState(db, s);
      audit(db, null, 'feed push: ' + JSON.stringify(counts));
      res.json({ counts });
    } catch (e) { next(e); }
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
  app.get('/api/feed/push-script', requireUser, requireAdmin, (req, res, next) => {
    try {
      const text = fs.readFileSync(path.join(publicDir, '..', 'scripts', 'Lansweeper-Push.ps1'), 'utf8');
      const origin = `${req.protocol}://${req.get('host')}`;
      res.attachment('Lansweeper-Push.ps1').type('text/plain; charset=utf-8')
        .send(text.replace(/NobsUrl(\s*)=\s*'[^']*'/, (_, sp) => `NobsUrl${sp}= '${origin}'`));
    } catch (e) { next(e); }
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
  app.post('/api/feed/import', requireUser, requireAdmin, (req, res, next) => {
    try {
      const text = typeof req.body === 'string' ? req.body : '';
      if (!text) throw new HttpError(400, 'Send the export as CSV text.');
      const s = loadState(db);
      const counts = mergeFeed(s, text);
      saveState(db, s);
      audit(db, req.user.id, 'feed import: ' + JSON.stringify(counts));
      res.json({ counts });
    } catch (e) { next(e); }
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
