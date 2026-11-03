/* Settings → System: the log, health, the certificate people see, the mail server and the weekly e-mail. Split out of
   app.js. */
import { audit, writeDoc } from './db.js';
import { healthReport } from './health.js';
import { buildDigest, digestSettings, lastDigest, saveDigestSettings, sendDigest, sendTestMail, mailFailure, smtpConfig, smtpSettingsProblem } from './digest.js';
import { exportSet, exportSettings, lastExport } from './backup-export.js';
import { lastRestoreTest } from './restore-test.js';
import { settingOf, loadState } from './state.js';
import { feedTokenInfo } from './feed-token.js';
import { certReport, probeCert } from './proxy-cert.js';
import crypto from 'node:crypto';
import { setAppSecret, appSecretSetAt, dropAppSecret } from './app-secrets.js';
import { HttpError } from './errors.js';
import { imageStats } from './device-images.js';

/* Adds the Settings → System routes: the certificate people see (/api/certificate, anyone signed in), and for admins
   the log, the health details, the mail server (/api/smtp and its test) and the weekly e-mail (/api/digest, its preview
   and send now). It also puts sendDigest on app.locals for the scheduler. */
export function registerSettingsRoutes(app, ctx) {
  const { db, requireUser, requireAdmin, cfgLs, cfgLdap, cfgGraph, SECRET_KEY, feedToken, mailTransport, certProbe, diskSpace, smtpNow, APP_VERSION } = ctx;
  /* The certificate people get when they open the inventory: names, issuer, end, and whether it expires soon. Read from
     the proxy for the name the page was opened by, at most every ten minutes per name. Public facts only. */
  const certSeen = new Map();
  app.get('/api/certificate', requireUser, async (req, res, next) => {
    try {
      const host = String(req.hostname || '').replace(/^\[|\]$/g, '');
      if (!/^[A-Za-z0-9.-]{1,253}$|^[0-9a-fA-F:.]{2,45}$/.test(host)) return res.json({ certificate: null, reason: 'The name this page was opened by could not be read.' });
      const seen = certSeen.get(host);
      if (seen && Date.now() - seen.at < 600000 && req.query.fresh !== '1') return res.json(seen.body);
      const c = await probeCert(certProbe, host);
      const body = c ? { certificate: certReport(c, host) } : { certificate: null, reason: 'The proxy in front of the inventory could not be asked: another proxy may serve it (NI_PROXY=none).' };
      if (certSeen.size > 20) certSeen.clear();
      certSeen.set(host, { at: Date.now(), body });
      res.json(body);
    } catch (e) { next(e); }
  });
  /* The log: what was synced, saved, restored and signed in, and what failed. Admins only. */
  app.get('/api/log', requireUser, requireAdmin, (req, res, next) => {
    try {
      const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 300));
      const names = new Map(loadState(db).users.map(u => [String(u.id), u.name || u.login || '']));
      const rows = db.prepare('SELECT at, user_id, action, detail FROM audit ORDER BY id DESC LIMIT ?').all(limit);
      const isError = /fail|refus|error|throttl|denied|wrong|could not|not set|not allowed/i;
      const detailOf = d => { try { return d ? JSON.parse(d) : null; } catch { return null; } };
      res.json({ entries: rows.map(r => ({ at: r.at, who: r.user_id ? (names.get(String(r.user_id)) || 'Unknown user') : 'Server', action: r.action, level: isError.test(r.action) ? 'error' : 'info', ...(r.detail ? { detail: detailOf(r.detail) } : {}) })) });
    } catch (e) { next(e); }
  });
  /* Health (Settings → System → Health): the server, backups, syncs, certificates and the log, each ok, warn, bad or off. */
  const healthNow = () => {
      const s = loadState(db), g = cfgGraph();
      let graphCert = null;
      if (g && g.certPem) { try { graphCert = new Date(new crypto.X509Certificate(g.certPem).validTo).toISOString(); } catch { /* unreadable: not shown */ } }
      const on = { lansweeper: s.useLansweeper !== false && (!!cfgLs() || !!feedTokenInfo(db) || !!feedToken || !!process.env.NI_FEED_CSV), ldap: !!cfgLdap(), graph: !!g };
      return healthReport(db, s, { version: APP_VERSION, on, graphCert, photos: imageStats(db), copy: { dir: exportSet(), ...exportSettings(db), last: lastExport(db) }, restore: lastRestoreTest(db), ...(diskSpace ? { diskSpace } : {}) });
  };
  app.get('/api/health/details', requireUser, requireAdmin, (req, res, next) => {
    try { res.set('Cache-Control', 'no-store').json(healthNow()); } catch (e) { next(e); }
  });
  /* The weekly e-mail to the admins (server/digest.js): only when the server names a mail server. */
  const digestNow = () => {
    const s = loadState(db), h = healthNow(), set = digestSettings(db);
    const last = h.checks.find(c => c.name === 'Last backup'), copy = h.checks.find(c => c.name === 'Copy outside the server');
    return buildDigest(s, { link: set.link || process.env.NI_PUBLIC_URL || '', backups: last ? last.value : '', copy: copy && copy.state !== 'off' ? copy.value : '', health: h.checks });
  };
  const smtpInfo = () => {
    const c = smtpNow(), v = settingOf(db, 'smtp') || {};
    if (c && c.source === 'server') return { source: 'server', host: c.host, port: c.port, user: c.auth ? c.auth.user : '', from: c.from };
    return { source: c ? 'app' : null, host: v.host || '', port: v.port || 587, security: v.security || 'starttls', user: v.user || '', from: v.from || '', passwordSet: appSecretSetAt(db, 'smtpPassword') || '' };
  };
  app.put('/api/smtp', requireUser, requireAdmin, (req, res, next) => {
    try {
      if (smtpConfig(process.env)) throw new HttpError(409, 'The mail server is set on the server (NI_SMTP_HOST): change it there.');
      const b = req.body || {}, before = settingOf(db, 'smtp') || {};
      const v = { host: String(b.host || '').trim(), port: Number(b.port), security: String(b.security || 'starttls'), user: String(b.user || '').trim(), from: String(b.from || '').trim() };
      const p = smtpSettingsProblem(v); if (p) throw new HttpError(400, p);
      const pw = typeof b.password === 'string' ? b.password : '';
      if (pw.length > 500) throw new HttpError(400, 'The password is too long.');
      writeDoc(db, 'setting', 'smtp', v);
      /* The password goes with the server, the security and the user it was given for: another host, port, security or
         user (or none), and it is dropped unless a new one is given, so it cannot be sent somewhere, or in a way, it was
         not meant for (a weaker security would let it go in clear text). */
      if (pw) setAppSecret(db, SECRET_KEY, 'smtpPassword', pw);
      else if (b.clearPassword || !v.user || before.host !== v.host || before.port !== v.port || before.security !== v.security || before.user !== v.user) dropAppSecret(db, 'smtpPassword');
      audit(db, req.user.id, `mail server set: ${v.host}:${v.port} (${v.security})${v.user ? ', with sign-in' : ''}`);
      res.json(digestInfo());
    } catch (e) { next(e); }
  });
  app.delete('/api/smtp', requireUser, requireAdmin, (req, res, next) => {
    try {
      db.prepare("DELETE FROM docs WHERE kind = 'setting' AND id = 'smtp'").run();
      db.prepare("INSERT INTO revs (kind, id, rev) VALUES ('setting', 'smtp', 1) ON CONFLICT(kind, id) DO UPDATE SET rev = rev + 1").run();
      dropAppSecret(db, 'smtpPassword');
      audit(db, req.user.id, 'mail server removed');
      res.json(digestInfo());
    } catch (e) { next(e); }
  });
  app.post('/api/smtp/test', requireUser, requireAdmin, async (req, res, next) => {
    try { await sendTestMail(smtpNow(), String((req.body || {}).to || '').trim(), mailTransport); audit(db, req.user.id, 'test e-mail sent'); res.json({ ok: true }); }
    catch (e) { const why = mailFailure(e); audit(db, req.user.id, 'test e-mail failed: ' + why); next(new HttpError(400, why)); }
  });
  app.locals.sendDigest = async (now = new Date()) => { const m = digestNow(); await sendDigest(db, m, process.env, now, mailTransport, smtpNow()); audit(db, null, `weekly e-mail sent (${m.count} item${m.count === 1 ? '' : 's'})`); return m; };
  const digestInfo = () => ({ smtp: !!smtpNow(), mail: smtpInfo(), ...digestSettings(db), last: lastDigest(db) });
  app.get('/api/digest', requireUser, requireAdmin, (req, res) => res.set('Cache-Control', 'no-store').json(digestInfo()));
  app.put('/api/digest', requireUser, requireAdmin, (req, res, next) => {
    try {
      const b = req.body || {}, cur = digestSettings(db);
      if ((b.on || b.reports) && !smtpNow()) throw new HttpError(400, 'No mail server is set: set it below first.');
      saveDigestSettings(db, { ...cur, ...b });
      const link = typeof b.link === 'string' && /^https?:\/\/[^\s"<>]{1,300}$/.test(b.link) ? b.link : cur.link;
      if (link) writeDoc(db, 'setting', 'digest', { ...settingOf(db, 'digest'), link });
      const d = digestSettings(db);
      audit(db, req.user.id, `weekly e-mail: ${d.on ? 'on' : 'off'}${d.reports ? ', reported problems at once' : ''}, to ${d.to.length} address${d.to.length === 1 ? '' : 'es'}`);
      res.json(digestInfo());
    } catch (e) { next(e.status ? new HttpError(e.status, e.message) : e); }
  });
  app.get('/api/digest/preview', requireUser, requireAdmin, (req, res) => { const m = digestNow(); res.set('Cache-Control', 'no-store').json({ subject: m.subject, text: m.text }); });
  app.post('/api/digest/send', requireUser, requireAdmin, async (req, res, next) => {
    try { await app.locals.sendDigest(); res.json(digestInfo()); }
    catch (e) { audit(db, req.user.id, 'weekly e-mail failed: ' + e.message); next(new HttpError(400, e.message)); }
  });
}
