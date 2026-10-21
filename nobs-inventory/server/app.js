import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit } from './db.js';
import { loadState, saveState } from './state.js';
import { setPassword, checkLocalPassword, createSession, sessionUserId, endSession, readCookie } from './auth.js';
import { ldapEnabled, ldapLogin, inGroup } from './ldap.js';
import { mergeFeed } from './feed.js';
import { syncLansweeper } from './lansweeper.js';
import { syncLdapUsers } from './ldap-sync.js';
import { HttpError } from './errors.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const publicDir = path.join(here, '..', 'public');
const COOKIE = 'ni_session';

export function createApp({ db, ldap = null, lansweeper = null, secureCookie = false }) {
  const app = express();
  app.disable('x-powered-by');
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

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.get('/api/me', (req, res) => {
    const u = currentUser(req);
    res.json({ user: u ? me(u) : null, ldap: ldapEnabled(ldap), lansweeper: !!lansweeper });
  });

  app.post('/api/login', async (req, res, next) => {
    try {
      const login = String(req.body?.login ?? '').trim();
      const password = String(req.body?.password ?? '');
      if (!login || !password) throw new HttpError(401, 'Enter your login and password.');
      const s = loadState(db);
      let user = s.users.find(u => u.login && u.login.toLowerCase() === login.toLowerCase()) || null;
      let ok = !!user && checkLocalPassword(db, user.id, password);
      if (!ok && ldapEnabled(ldap)) {
        let d;
        try { d = await ldapLogin(ldap, login, password); }
        catch (e) { console.error('directory:', e.message); throw new HttpError(503, 'The directory cannot be reached right now.'); }
        if (d && !inGroup(d, ldap.group)) { audit(db, null, 'sign in refused, not in group: ' + login); throw new HttpError(403, 'This account is not in a group that may use the inventory.'); }
        if (d) {
          const isAdmin = inGroup(d, ldap.adminGroup) && !!ldap.adminGroup;
          if (!user) user = { id: 'ldap-' + login.toLowerCase(), login, name: d.name, dept: d.dept, groups: d.groups, source: 'ldap', active: true, role: 'viewer' };
          Object.assign(user, { name: d.name, dept: d.dept, groups: d.groups, source: 'ldap', role: isAdmin ? 'admin' : 'viewer' });
          saveUserDoc(user);
          ok = true;
        }
      }
      if (!ok || !user) { audit(db, null, 'failed sign in for ' + login); throw new HttpError(401, 'That login and password do not match.'); }
      if (user.active === false) throw new HttpError(403, 'This account is deactivated.');
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

  app.post('/api/users/:id/password', requireUser, requireAdmin, (req, res, next) => {
    try {
      const u = userDoc(req.params.id);
      if (!u) throw new HttpError(404, 'No such user.');
      const password = String(req.body?.password ?? '');
      if (password.length < 8) throw new HttpError(400, 'Use at least 8 characters.');
      setPassword(db, u.id, password);
      audit(db, req.user.id, 'set password for ' + u.login);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.post('/api/feed/sync', requireUser, requireAdmin, async (req, res, next) => {
    try {
      if (!lansweeper) throw new HttpError(400, 'No Lansweeper API is configured. Set NI_LS_TOKEN on the server.');
      const counts = await syncLansweeper(db, lansweeper);
      res.json({ counts });
    } catch (e) { next(e); }
  });

  app.post('/api/ldap/sync', requireUser, requireAdmin, async (req, res, next) => {
    try {
      if (!ldapEnabled(ldap)) throw new HttpError(400, 'Directory sign-in is not configured. Set NI_LDAP_URL on the server.');
      let counts;
      try { counts = await syncLdapUsers(db, ldap); }
      catch (e) { if (e instanceof HttpError) throw e; console.error('directory sync:', e.message); throw new HttpError(503, 'The directory could not be read. Check the service account.'); }
      res.json({ counts });
    } catch (e) { next(e); }
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

  app.use(express.static(publicDir, { index: 'index.html' }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Something went wrong.' : err.message });
  });
  return app;
}
