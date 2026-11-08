/* Sign-in: with a password (local or the directory), with Microsoft (SSO), sign-out, your own account and sessions,
   and an admin setting someone's password. Split out of app.js. */
import { audit } from './db.js';
import { applyGroupRole, groupsOf } from '../public/js/group-roles.js';
import { finishSso, startSso, userForClaims } from './sso.js';
import { settingOf, freeUserId, loadState } from './state.js';
import { setPassword, passwordProblem, checkLocalPassword, createSession, endSession, endOtherSessions, listSessions, endSessionById, readCookie } from './auth.js';
import { ldapEnabled, ldapLogin, ldapMembership } from './ldap.js';
import { feedTokenInfo } from './feed-token.js';
import { HttpError } from './errors.js';

/* Adds the sign-in routes: GET /api/me (who is signed in, which connections are set up), sign-in with Microsoft
   (/api/sso/start and /api/sso/callback), POST /api/login and /api/logout, your own details, sessions and password
   (/api/me...), and an admin setting a local user's password (POST /api/users/:id/password). */
export function registerSessionRoutes(app, ctx) {
  const { db, throttle, auditQuiet, requireUser, requireAdmin, currentUser, me, userDoc, saveUserDoc, bumpUser, COOKIE, cookie, secureCookie, loginFailMs, cfgLs, cfgLdap, ldapSignIn, cfgGraph, graphSettings, feedToken, graphFetch } = ctx;
  app.get('/api/me', (req, res) => {
    const u = currentUser(req);
    res.json({ user: u ? me(u) : null, ldap: ldapEnabled(cfgLdap()), lansweeper: !!cfgLs(), graph: !!cfgGraph(), sso: ssoOn(),
      /* Signed in: whether a push or a nightly file is set up for Lansweeper, so the page says so before the first data came. */
      ...(u ? { lansweeperFeed: !!feedTokenInfo(db) || !!feedToken || !!process.env.NI_FEED_CSV } : {}) });
  });

  /* Sign in with Microsoft (server/sso.js), when turned on in Settings → Entra & Intune and Graph is set up. The browser
     goes to Microsoft and comes back to the callback; a cookie bound to the start keeps a sign-in begun elsewhere out. */
  const ssoOn = () => graphSettings().sso === 'on' && !!cfgGraph();
  const SSO_COOKIE = secureCookie ? '__Host-ni_sso' : 'ni_sso';
  const ssoCookie = (v, age) => `${SSO_COOKIE}=${v}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secureCookie ? '; Secure' : ''}`;
  const callbackUrl = req => `${req.protocol}://${req.get('host')}${req.baseUrl || ''}/api/sso/callback`;
  app.get('/api/sso/start', (req, res, next) => {
    try {
      if (!ssoOn()) throw new HttpError(404, 'Sign-in with Microsoft is not turned on.');
      const { url, bind } = startSso(cfgGraph(), callbackUrl(req));
      res.setHeader('Set-Cookie', ssoCookie(bind, 600));
      res.redirect(302, url);
    } catch (e) { next(e); }
  });
  app.get('/api/sso/callback', async (req, res) => {
    /* Back to the page, which says what went wrong by the code; the reason is in the log. */
    const back = (code, cookies = []) => { res.setHeader('Set-Cookie', [ssoCookie('', 0), ...cookies]); res.redirect(302, `../../${code ? `?sso=${code}` : ''}`); };
    try {
      if (!ssoOn()) return back('off');
      /* Anyone can call this address: only Microsoft's error code is logged (not text a caller made up), and a flood once a minute. */
      if (req.query.error) { const code = /^[a-z_]{1,40}$/.test(String(req.query.error)) ? String(req.query.error) : 'unknown'; auditQuiet('sso-refused:' + req.ip, `sign in with Microsoft refused by Microsoft (${code})`); return back('denied'); }
      const claims = await finishSso(cfgGraph(), { state: req.query.state, code: req.query.code, bind: readCookie(req.headers.cookie, SSO_COOKIE) }, graphFetch);
      let user = userForClaims(loadState(db).users, claims);
      const who = String(claims.preferred_username || claims.upn || claims.email || claims.oid || '').slice(0, 200);
      if (!user) { audit(db, null, `sign in with Microsoft refused: ${who} is not a user of the inventory`); return back('unknown'); }
      /* Entra groups in the token (when the app registration sends the groups claim): kept, and with the directory's
         groups they give a role and sites (Settings → Users → Viewers from groups). */
      /* Without the groups claim (not set up, or more groups than a token holds) the Entra groups kept from before go: a
         role an Entra group gave is not kept on an old list. */
      {
        const ids = Array.isArray(claims.groups) ? claims.groups.filter(g => typeof g === 'string' && g.length <= 64).slice(0, 500) : [];
        const before = user.role, changed = JSON.stringify(user.entraGroups || []) !== JSON.stringify(ids);
        if (ids.length) { user.entraGroups = ids; user.entraGroupsAt = new Date().toISOString(); } else { delete user.entraGroups; delete user.entraGroupsAt; }
        if (applyGroupRole(user, settingOf(db, 'groupRoles'), groupsOf(user)) || changed) {
          saveUserDoc(user); bumpUser(user.id);
          if (user.role !== before) audit(db, user.id, `role from groups: ${user.role}${user.sites ? ' (' + user.sites.join(', ') + ')' : ''}`);
        }
      }
      if (user.role === 'none') { audit(db, user.id, 'sign in with Microsoft refused: no role'); return back('norole'); }
      /* A directory user is checked as at a password sign-in: still in the directory and in its sign-in group, and admin
         only while in the admin group (the last active admin stays one). Without a service account the role the last
         sync gave stands. */
      const lc = cfgLdap();
      if (user.source === 'ldap' && ldapEnabled(lc)) {
        const m = await ldapMembership(lc, user.login);
        /* Read again after waiting on the directory: an admin may have changed the account meanwhile. */
        const id = user.id;
        user = loadState(db).users.find(u => u.id === id);
        if (!user || user.active === false || user.role === 'none') return back('norole');
        if (m && !(m.found && m.allowed)) { audit(db, user.id, `sign in with Microsoft refused: ${m.found ? 'not in the sign-in group' : 'not in the directory'}`); return back('norole'); }
        const lastAdmin = !loadState(db).users.some(u => String(u.id) !== String(user.id) && u.role === 'admin' && u.active !== false);
        if (m && user.role === 'admin' && !m.admin && !lastAdmin) {
          /* As at a password sign-in: no access until an admin gives a role again. */
          user.role = 'none'; saveUserDoc(user); bumpUser(user.id);
          audit(db, user.id, 'sign in with Microsoft refused: not in the admin group any more');
          return back('norole');
        } else if (m && m.admin && user.role !== 'admin') { user.role = 'admin'; saveUserDoc(user); bumpUser(user.id); }
      }
      const token = createSession(db, user.id, req.get('user-agent') || '');
      audit(db, user.id, `sign in with Microsoft (${who})`);
      back('', [cookie(token, 43200)]);
    } catch (e) {
      auditQuiet('sso-failed:' + req.ip, `sign in with Microsoft failed: ${String(e.message || e).split(/[\r\n]/)[0].slice(0, 200)}`);
      back('failed');
    }
  });

  /* One answer for every failed sign-in: wrong login, wrong password, deactivated, not in the group. This keeps
     account names from being discovered, and the throttle counts every failure against the login and the address. */
  const FAILED = 'The login or password is not right.';
  app.post('/api/login', async (req, res, next) => {
    /* A failed sign-in answers after the same time (loginFailMs) whatever failed: a local account or one checked against
       the directory, a known or unknown login. The time does not tell which logins exist, and guessing is slower. */
    const t0 = Date.now();
    const failFloor = () => new Promise(r => setTimeout(r, Math.max(0, loginFailMs - (Date.now() - t0))));
    try {
      const login = String(req.body?.login ?? '').trim().slice(0, 200);
      const password = String(req.body?.password ?? '');
      const keys = ['login:' + login.toLowerCase(), 'ip:' + (req.ip || '')];
      if (throttle.blocked(keys)) {
        const known = db.prepare("SELECT data FROM docs WHERE kind = 'user'").all().some(r => String(JSON.parse(r.data).login || '').toLowerCase() === login.toLowerCase());
        auditQuiet('throttled:' + (req.ip || ''), 'sign in throttled for ' + (known ? login : 'an unknown login'));
        throw new HttpError(429, 'Too many failed sign-ins. Try again in 15 minutes.');
      }
      if (!login || !password || password.length > 256) { throttle.recordFailure(keys); await failFloor(); throw new HttpError(401, FAILED); }
      /* Only the user records are read; a sign-in does not load the whole inventory. */
      const findUser = () => {
        for (const r of db.prepare("SELECT data FROM docs WHERE kind = 'user'").all()) {
          const u = JSON.parse(r.data);
          if (u.login && u.login.toLowerCase() === login.toLowerCase()) return u;
        }
        return null;
      };
      let user = findUser();
      let ok = false;
      if (user) ok = checkLocalPassword(db, user.id, password);
      else checkLocalPassword(db, 'none', password);   /* same work for an unknown login */
      const lc = cfgLdap();
      /* The directory signs in its own users, new logins and persons Lansweeper or Entra named by their login (who
         become its users). A local account with the same login is never taken over by it: that would let a directory user sign in
         as, and demote, the local admin. */
      if (!ok && ldapEnabled(lc) && (!user || ['ldap', 'lansweeper', 'entra'].includes(user.source))) {
        /* Only to the directory sign-ins are set up for (app.js ldapSignIn): a changed address pauses it. */
        const si = ldapSignIn();
        if (si.problem) { auditQuiet('ldap-paused', si.problem); throttle.recordFailure(keys); await failFloor(); throw new HttpError(503, si.say || si.problem); }
        /* At most two sign-ins of one address wait on the directory at once, so a burst cannot outrun the failure count. */
        const ipKey = keys[1];
        if (!throttle.enter(ipKey)) { await failFloor(); throw new HttpError(429, 'Too many sign-ins at once. Try again in a moment.'); }
        let d;
        try { d = await ldapLogin(si.c, login, password); }
        /* Counted as a failed try too: an outage must not give unlimited guesses at the local passwords. */
        catch (e) { console.error('directory:', e.message); throttle.recordFailure(keys); await failFloor(); throw new HttpError(503, 'The directory cannot be reached right now.'); }
        finally { throttle.leave(ipKey); }
        if (d && d.allowed) si.keep();
        if (d && d.allowed) {
          /* Read again after waiting on the directory: a second sign-in of the same login may have created the account
             meanwhile (two would share one login and stop every save), or an admin may have deactivated it or changed
             its role. Nothing below waits, so no other request comes between this read and the save. */
          user = findUser();
          if (user && !['ldap', 'lansweeper', 'entra'].includes(user.source)) { throttle.recordFailure(keys); await failFloor(); throw new HttpError(401, FAILED); }
          let isAdmin = !!d.admin;
          const wasLansweeper = !!user && (user.source === 'lansweeper' || user.source === 'entra');
          /* Someone new from the directory has no access (role none) until an admin gives them one; the admin group is admin. */
          if (!user) user = { id: freeUserId(loadState(db).users, 'ldap-' + login.toLowerCase()), login, name: d.name, dept: d.dept, groups: d.groups, source: 'ldap', active: true, role: 'none' };
          /* The last active admin stays one, as in the sync: a renamed or emptied admin group must not lock everyone out. */
          if (!isAdmin && user.role === 'admin' && user.active !== false
            && !loadState(db).users.some(u => String(u.id) !== String(user.id) && u.role === 'admin' && u.active !== false)) {
            isAdmin = true;
            audit(db, user.id, 'sign in: kept as admin, the last active one (not in the admin group any more)');
          }
          /* The directory's department; with none there, one Entra or Lansweeper gave stays (deptFrom says whose). */
          const keepDept = !d.dept && user.dept && (['entra', 'lansweeper'].includes(user.deptFrom) || user.source === 'lansweeper');
          if (keepDept && !user.deptFrom) user.deptFrom = 'lansweeper';
          Object.assign(user, { name: d.name, dept: keepDept ? user.dept : d.dept, groups: d.groups, source: 'ldap', role: isAdmin ? 'admin' : user.role === 'viewer' ? 'viewer' : 'none' });
          if (d.dept) delete user.deptFrom;
          if (Array.isArray(d.groupDns) && d.groupDns.length) user.groupDns = d.groupDns; else delete user.groupDns;
          if (!isAdmin) applyGroupRole(user, settingOf(db, 'groupRoles'), groupsOf(user, d.groups, d.groupDns));
          if (user.active !== false) {
            saveUserDoc(user); bumpUser(user.id);   /* a new revision, so a page holding the old record cannot save it back */
            if (wasLansweeper) db.prepare('DELETE FROM credentials WHERE user_id = ?').run(user.id);   /* the directory checks the password now */
          }
          ok = true;
        } else if (d) { audit(db, null, 'sign in refused, not in group: ' + login); }
      }
      if (!ok || !user || user.active === false) {
        throttle.recordFailure(keys);
        await failFloor();
        /* The login as typed is logged only when it is one: a password typed into the login field must not end up in the log. */
        if (user) audit(db, null, 'failed sign in for ' + user.login);
        else auditQuiet('unknown:' + (req.ip || ''), 'failed sign in for an unknown login');
        throw new HttpError(401, FAILED);
      }
      throttle.clearFailures(keys.slice(0, 1)); throttle.rememberSuccess(keys);   /* only this login: a success must not clear the address count */
      /* The right password, but no access given yet: said plainly, so the person knows whom to ask. */
      if (user.role === 'none') {
        audit(db, user.id, 'sign in refused: no role');
        throw new HttpError(403, 'Your account has no access to the inventory yet. An admin can give you the viewer role in Settings → Users.');
      }
      /* Each sign-in gets its own session (up to a few per user); the oldest end when the limit is passed. */
      const token = createSession(db, user.id, req.get('user-agent') || '');
      audit(db, user.id, 'sign in');
      res.setHeader('Set-Cookie', cookie(token, 43200));
      res.json({ user: me(user) });
    } catch (e) { next(e); }
  });

  /* Your own account: the name and department, and the password. Nobody else's, and not the role. */
  app.put('/api/me', requireUser, (req, res, next) => {
    try {
      const u = userDoc(req.user.id);
      if (!u) throw new HttpError(404, 'No such user.');
      const clean = v => String(v ?? '').trim().slice(0, 100);
      const first = clean(req.body?.first), last = clean(req.body?.last), dept = clean(req.body?.dept);
      if (!first && !last) throw new HttpError(400, 'Give a first or last name.');
      /* A directory user's name and department come from the directory (the next sync would undo them here). */
      if (u.source !== 'ldap') { Object.assign(u, { first, last, name: [first, last].filter(Boolean).join(' '), dept }); delete u.deptFrom; }
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
  /* Your own new password: local accounts only, with the current one (wrong tries are throttled). Your other sessions
     end. */
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

  /* An admin sets a local user's password: every session of that user ends but the one making the request. Directory
     users are refused. */
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
}
