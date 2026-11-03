/* The directory (LDAP) and Lansweeper: their settings, tests, syncs, the push with its token and script, the CSV
   import and the type rules. Split out of app.js. */
import fs from 'node:fs';
import path from 'node:path';
import { audit } from './db.js';
import { KNOWN_TYPES, loadState, saveState } from './state.js';
import { ldapEnabled, ldapHint, ldapListUsers, ldapCertReport, isCertError, isUnreachable } from './ldap.js';
import { parseCaCerts, ldapPinOf } from './ldap-config.js';
import { cleanIpLocations } from './lsnet.js';
import { feedChanged, mergeFeed, mergeRecords, recordsFromJson, typeFor, typeSetByHand } from './feed.js';
import { feedTokenInfo, createFeedToken, revokeFeedToken, feedTokenValid } from './feed-token.js';
import { autoBackup } from './backup.js';
import { syncLansweeper } from './lansweeper.js';
import { probeCert } from './proxy-cert.js';
import { syncLdapUsers } from './ldap-sync.js';
import { recordSync, runRecorded } from './sync-runs.js';
import { setAppSecret, appSecretSetAt, dropAppSecret } from './app-secrets.js';
import { HttpError } from './errors.js';

export function registerSyncRoutes(app, ctx) {
  const { db, throttle, auditQuiet, requireUser, requireAdmin, cfgLs, cfgLdap, ldap, ldapConfig, ldapPasswordFromServer, SECRET_KEY, feedToken, certProbe, publicDir } = ctx;
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
      const host = ldapPinOf((ldapConfig ? ldapConfig() : ldap) || {});
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
  /* Test connection: reads the users of the saved directory settings and says how many are in scope. */
  app.post('/api/ldap/test', requireUser, requireAdmin, async (req, res, next) => {
    try {
      const lc = cfgLdap();
      if (!ldapEnabled(lc)) throw new HttpError(400, 'Enter the directory server in Settings → Active Directory first.');
      const people = await ldapListUsers(lc);
      res.json({ people: people.length, admins: people.filter(p => p.admin).length });
    } catch (e) {
      if (e instanceof HttpError) return next(e);
      /* A certificate that is not trusted: what the server presented, so nobody has to look on the server. */
      const report = isCertError(e.message) ? await ldapCertReport(cfgLdap()).catch(() => null) : null;
      const hint = report ? report.text : ldapHint(e.message);
      /* Not reached: the same words whatever the reason (refused, no such host, timed out), so the test says nothing about
         what else listens on the network. */
      if (isUnreachable(e.message)) return next(new HttpError(502, ldapHint('connect')));
      next(new HttpError(502, (hint || 'The directory cannot be read.') + ' (' + String(e.message).slice(0, 200) + ')'));
    }
  });

  /* The type rules applied to the devices already in the inventory. Without ids: the devices whose type would change.
     With ids: those of them change, after a backup. A type set by hand is never changed, nor a device that is not from
     Lansweeper or is retired. */
  /* Set by hand: marked so when changed on the device page, or an earlier change by a person is in its history. */
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
      const counts = await runRecorded(db, 'lansweeper', () => {
        if (!ls) throw new HttpError(400, 'No Lansweeper API token is set on the server. Set NI_LS_TOKEN or NI_LS_TOKEN_FILE.');
        return syncLansweeper(db, ls);
      }, 'api');
      res.json({ counts });
    } catch (e) { audit(db, null, 'Lansweeper sync failed: ' + e.message); next(e); }
  });

  app.post('/api/ldap/sync', requireUser, requireAdmin, async (req, res, next) => {
    try {
      /* Switched off in Settings: not run, and not recorded as a run. Sign-in with AD accounts is not affected. */
      if (loadState(db).useAd === false) throw new HttpError(403, 'The Active Directory sync is turned off in Settings → Active Directory. Sign-in with AD accounts is not affected.');
      const lc = cfgLdap();
      /* Recorded as a failed run too, so the Sync button says why the directory was not read. */
      const counts = await runRecorded(db, 'ldap', async () => {
        if (!ldapEnabled(lc)) throw new HttpError(400, 'Enter the directory server in Settings → Active Directory first.');
        try { return await syncLdapUsers(db, lc); }
        catch (e) {
          if (e instanceof HttpError) throw e;
          console.error('directory sync:', e.message);
          /* A certificate that is not trusted: what the server presented, as Test connection says it. */
          const report = isCertError(e.message) ? await ldapCertReport(lc).catch(() => null) : null;
          throw new HttpError(503, report ? 'The directory could not be read. ' + report.text : 'The directory could not be read. Check the service account.');
        }
      });
      res.json({ counts });
    } catch (e) { next(e); }
  });

  /* Lansweeper pushes its assets from a script on its own server (scripts/Lansweeper-Push.ps1), with the token made
     in Settings → Feed (feed-token.js) or set by the administrator (NI_FEED_TOKEN). Without a token, this route
     refuses every request. */
  app.post('/api/feed/push', (req, res, next) => {
    let pushing = false;
    try {
      /* Wrong tokens count against the address, the same way wrong passwords do, so a token cannot be guessed by trying. */
      const keys = ['push:' + (req.ip || '')];
      if (throttle.blocked(keys)) throw new HttpError(429, 'Too many wrong feed tokens. Try again in 15 minutes.');
      const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
      if (!feedTokenValid(db, m && m[1], feedToken)){ throttle.recordFailure(keys); throw new HttpError(401, 'The feed token is wrong, or none is set on the server.'); }
      lsRequire('push');
      pushing = true;
      const records = req.body && req.body.records;
      if (!Array.isArray(records)) throw new HttpError(400, 'Send the assets as {"records": [...]}.');
      if (records.length > 20000) throw new HttpError(413, 'Too many assets in one push. Send them in parts.');
      const s = loadState(db);
      const counts = mergeRecords(s, recordsFromJson(records), new Date(), cleanIpLocations(req.body.ipLocations));
      if (feedChanged(counts)) { autoBackup(db, 'before a Lansweeper push', { hourly: true }); saveState(db, s); }
      audit(db, null, 'feed push: ' + JSON.stringify(counts));
      recordSync(db, 'lansweeper', { ok: true, counts, how: 'push' });
      res.json({ counts });
    } catch (e) {
      /* A wrong or throttled token is somebody else's request: logged quietly. */
      if (pushing) audit(db, null, 'feed push failed: ' + e.message); else auditQuiet('push:' + (req.ip || ''), 'feed push failed: ' + e.message);
      /* Only a push with the right token counts as a run: a wrong token is somebody else's request. */
      if (pushing) recordSync(db, 'lansweeper', { ok: false, error: e.message, how: 'push' });
      next(e);
    }
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
  /* The SHA-1 thumbprint of the certificate the proxy presents for a host name, as Windows writes it ('' when it cannot
     be read). The push script pins it, so a certificate Windows does not trust (the self-signed one of a new install)
     works without a question; a trusted one is not affected by the pin. */
  const proxyThumbprint = async hostname => { const c = await probeCert(certProbe, hostname); return c && c.fingerprint ? c.fingerprint.replace(/:/g, '').toUpperCase() : ''; };
  /* The push script, with this server's address and certificate thumbprint already in it. */
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
      const counts = mergeFeed(s, text, new Date(), { byHand: true });
      if (feedChanged(counts)) { autoBackup(db, 'before a Lansweeper import'); saveState(db, s); }
      audit(db, req.user.id, 'feed import: ' + JSON.stringify(counts));
      res.json({ counts });
    } catch (e) { audit(db, null, 'Lansweeper import failed: ' + e.message); next(e); }
  });
}
