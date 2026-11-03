/* Saved views sent by mail: the devices a view lists, as the Excel file of the Reports (public/js/reports.js,
   server/report-files.js), to the addresses set on the view, on its schedule (public/js/saved-views.js) or with Send
   now. The devices are picked by the page's own filter (filtered() in public/js/01-core.js, after applyViewFilters), so
   the mail lists what the page does. The last send of each view is kept (setting viewMailRuns, for admins) and every
   send is in the log. Uses the mail server of the weekly e-mail (server/digest.js); nothing secret goes in the mail. */
import { applyViewFilters, mailDue } from '../public/js/saved-views.js';
import { buildReport } from '../public/js/reports.js';
import { dateText } from '../public/js/dates.js';
import { reportXlsx } from './report-files.js';
import { audit, writeDoc } from './db.js';
import { loadState, settingOf } from './state.js';
import { digestSettings, mailFailure, transportOf } from './digest.js';
import { HttpError } from './errors.js';

/* The page's core module (its filter), loaded by its address: the server's type check then leaves its browser code out. */
const core = await import(new URL('../public/js/01-core.js', import.meta.url).href);

/* The devices the view lists. The page's filter reads the page's state (st, the devices, the people and contacts): it
   is filled from the saved inventory for this one call and emptied after. Synchronous, so nothing else runs between. */
export function viewDevices(s, view, { graphOn = false } = {}) {
  const keep = { ...core.st }, all = s.objs || [];
  try {
    core.objs.splice(0, core.objs.length, ...all.filter(o => !o.review));
    core.REVIEW.splice(0, core.REVIEW.length, ...all.filter(o => o.review));
    core.CONTACTS.list = s.contacts || [];
    core.setPeople(s.users || []);
    core.SYNC.graph = !!graphOn;
    Object.assign(core.st, { useLansweeper: s.useLansweeper !== false, feedOn: s.feedOn ?? true, graphAmbiguous: s.graphAmbiguous || [], stocktakes: s.stocktakes || [],
      scope: null, rvSrc: '', ids: null, quality: null, handField: null });
    applyViewFilters(view, core.st);
    return core.filtered();
  } finally {
    core.objs.length = 0; core.REVIEW.length = 0; core.CONTACTS.list = []; core.setPeople([]); core.SYNC.graph = false;
    for (const k of Object.keys(core.st)) if (!(k in keep)) delete core.st[k];
    Object.assign(core.st, keep);
  }
}

const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pad = n => String(n).padStart(2, '0');
/* The mail: { subject, text, html, attachment: { filename, content } }. */
export function buildViewMail(s, view, list, { link = '', today = new Date() } = {}) {
  const r = buildReport(s, { kind: 'inventory', group: 'none', ids: list.map(o => o.id) }, today);
  const day = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const n = `${list.length} device${list.length === 1 ? '' : 's'}`;
  const file = `${String(view.name).replace(/[^\p{L}\p{N} _-]+/gu, ' ').trim().replace(/\s+/g, '-').slice(0, 60) || 'view'}-${day}.xlsx`;
  const subject = `NOBS Inventory: ${view.name} (${n})`;
  const foot = 'Sent by NOBS Inventory. Change or stop it on the view: Views in the sidebar, Edit.';
  const text = [`The saved view “${view.name}” lists ${n} today (${dateText(day)}). They are in the attached Excel file.`, '', link ? `Open the inventory: ${link}` : '', '', foot].join('\n');
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:14px;color:#111;max-width:640px"><p>The saved view <b>${esc(view.name)}</b> lists ${n} today (${dateText(day)}). They are in the attached Excel file.</p>
${link ? `<p><a href="${esc(link)}">Open the inventory</a></p>` : ''}<p style="color:#777;font-size:12px">${esc(foot)}</p></div>`;
  return { subject, text, html, count: list.length, attachment: { filename: file, content: reportXlsx({ ...r, title: view.name }), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } };
}

/* The last send of each view, kept for views still there. */
export const viewMailRuns = db => settingOf(db, 'viewMailRuns') || {};
function record(db, id, run) {
  const views = new Set((settingOf(db, 'savedViews') || []).map(v => v.id));
  writeDoc(db, 'setting', 'viewMailRuns', Object.fromEntries([...Object.entries(viewMailRuns(db)).filter(([k]) => views.has(k) && k !== id), [id, run]]));
}

/* Sends one view now. by: who asked (null: the schedule). Throws an HttpError with what went wrong, in a few words. */
export async function sendViewMail(db, id, { cfg = null, transport = null, now = new Date(), graphOn = false, link = '', by = null } = {}) {
  const s = loadState(db), view = (s.savedViews || []).find(v => v.id === id);
  if (!view) throw new HttpError(404, 'This view is no longer there.');
  const to = (view.mail && view.mail.to) || [];
  if (!cfg) throw new HttpError(400, 'No mail server is set (Settings → System → E-mail, or NI_SMTP_HOST on the server).');
  if (!to.length) throw new HttpError(400, 'Give the addresses to send it to.');
  /* A list of twins the page's filter indexed for an earlier call is dropped at the end of its task: wait for that. */
  await null;
  const m = buildViewMail(s, view, viewDevices(s, view, { graphOn }), { link, today: now });
  try {
    await (transport || transportOf(cfg)).sendMail({ from: cfg.from, to: to.join(', '), subject: m.subject, text: m.text, html: m.html, attachments: [m.attachment] });
  } catch (e) {
    const why = mailFailure(e, 'the mail');
    record(db, id, { at: now.toISOString(), ok: false, error: why });
    audit(db, by, `saved view “${view.name}” by mail failed: ${why}`);
    throw new HttpError(400, why);
  }
  const run = { at: now.toISOString(), ok: true, to: to.length, n: m.count };
  record(db, id, run);
  audit(db, by, `saved view “${view.name}” sent by mail to ${to.length} address${to.length === 1 ? '' : 'es'} (${m.count} device${m.count === 1 ? '' : 's'})`);
  return run;
}

/* The views due in one of the minutes the scheduler looks at (once: whether this minute was not handled yet). */
export const viewsDue = (db, mins, once) => (settingOf(db, 'savedViews') || []).filter(v => v.mail && mins.some(t => mailDue(v.mail, t) && once('view:' + v.id, t)));

export function registerViewMailRoutes(app, { db, requireUser, requireAdmin, mailTransport, smtpNow, cfgGraph }) {
  const send = (id, by, now = new Date()) => sendViewMail(db, id, { cfg: smtpNow(), transport: mailTransport, now, graphOn: !!cfgGraph(), by,
    link: digestSettings(db).link || process.env.NI_PUBLIC_URL || '' });
  app.locals.sendViewMail = (id, now) => send(id, null, now);
  /* Whether mail can be sent, and the last send of each view. */
  app.get('/api/view-mail', requireUser, requireAdmin, (req, res) => res.set('Cache-Control', 'no-store').json({ smtp: !!smtpNow(), runs: viewMailRuns(db) }));
  app.post('/api/views/:id/send', requireUser, requireAdmin, async (req, res, next) => {
    try { res.json({ ok: true, last: await send(String(req.params.id), req.user.id) }); } catch (e) { next(e); }
  });
}
