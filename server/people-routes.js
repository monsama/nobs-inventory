/* People: two records of one person merged by an admin, and My devices (anyone signed in confirms a device they have,
   or reports a problem with it). Split out of app.js. */
import { mergePeople } from '../public/js/people-match.js';
import { stamp } from '../public/js/dates.js';
import { autoBackup } from './backup.js';
import { audit } from './db.js';
import { sendReportMail } from './digest.js';
import { HttpError } from './errors.js';
import { loadState, movePersonRows, saveState } from './state.js';

export function registerPeopleRoutes(app, { db, requireUser, requireAdmin, mailTransport, smtpNow }) {
  /* Two records of one person merged (public/js/people-match.js): devices, entry sheets and the sign-in go to the one
     kept, the other's login and name stay as aliases so a sync finds the person again. A backup is taken first. */
  app.post('/api/users/merge', requireUser, requireAdmin, (req, res, next) => {
    try {
      const { keep, drop } = req.body || {};
      const s = loadState(db), k = s.users.find(u => u.id === keep), d = s.users.find(u => u.id === drop);
      if (!k || !d) throw new HttpError(404, 'No such person.');
      if (d.id === req.user.id) throw new HttpError(400, 'Your own account cannot be merged away: keep it.');
      const hadLogin = !!k.login;
      autoBackup(db, 'before merging two people');
      let r;
      try { r = mergePeople(s, k.id, d.id, stamp(new Date())); } catch (e) { throw new HttpError(400, e.message); }
      saveState(db, s);
      movePersonRows(db, k.id, d.id, hadLogin);
      audit(db, req.user.id, `people merged: ${d.name} into ${k.name} (${r.moved} device${r.moved === 1 ? '' : 's'})`);
      res.json({ ok: true, moved: r.moved });
    } catch (e) { next(e); }
  });
  /* My devices: anyone signed in confirms they have a device they are the user of, or reports a problem with it (an
     admin sees it on the device and in Data quality). Nothing else of the device can be changed this way. */
  const myDevice = req => {
    const s = loadState(db), o = s.objs.find(x => x.id === String(req.params.id) && !x.review);
    if (!o || o.uid !== req.user.id) throw new HttpError(404, 'This is not one of your devices.');
    return { s, o };
  };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  app.post('/api/my/devices/:id/confirm', requireUser, (req, res, next) => {
    try {
      const { s, o } = myDevice(req), by = req.user.name || req.user.login;
      const prev = o.verified ? { at: o.verified.at, ...(o.verified.by ? { by: o.verified.by } : {}), ...(o.verified.st ? { st: o.verified.st } : {}) } : undefined;
      o.verified = { at: today(), by, ...(prev ? { prev } : {}) };
      (s.history[o.id] ??= []).unshift({ t: stamp(new Date()), msg: `Confirmed by its user ${by}` });
      saveState(db, s); audit(db, req.user.id, `device confirmed by its user: ${o.name}`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  app.post('/api/my/devices/:id/report', requireUser, (req, res, next) => {
    try {
      const text = String((req.body || {}).text || '').trim().slice(0, 500);
      if (!text) throw new HttpError(400, 'Say what is wrong.');
      const { s, o } = myDevice(req), by = req.user.name || req.user.login;
      o.reported = { at: new Date().toISOString(), by: String(by).slice(0, 120), text };
      (s.history[o.id] ??= []).unshift({ t: stamp(new Date()), msg: `Problem reported by ${by}: ${text}` });
      saveState(db, s); audit(db, req.user.id, `problem reported on ${o.name}`);
      /* At once to the admins, when turned on: after answering, so a slow mail server does not hold the page. */
      res.json({ ok: true });
      sendReportMail(db, o, o.reported, process.env, mailTransport, smtpNow()).then(sent => { if (sent) audit(db, null, `e-mail sent: problem reported on ${o.name}`); },
        e => audit(db, null, `e-mail about the problem on ${o.name} failed: ${String(e.message || e).slice(0, 200)}`));
    } catch (e) { next(e); }
  });
}
