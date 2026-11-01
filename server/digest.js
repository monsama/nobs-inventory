/* The weekly e-mail to the admins: what needs doing, in one short list, with a link to the inventory. Warranties that
   end soon or ended on devices in use, contract notices due, people who left with devices out, problems users reported, devices waiting in To
   review, the last backup and the copy outside the server, and what Health marks bad. Optional: only when the server
   names a mail server (NI_SMTP_*), and turned on in Settings → Maintenance with the addresses to send to. Nothing secret
   goes in it; the mail server's password stays on the server. */
import nodemailer from 'nodemailer';
import { readSecret } from './secrets.js';
import { writeDoc } from './db.js';
import { contractStatus } from '../public/js/costs.js';
import { dateText } from '../public/js/dates.js';
import { dueTasks, todayDay } from '../public/js/maintenance.js';

const WARRANTY_SOON = 90;
const getDoc = (db, id, dflt) => { const r = db.prepare("SELECT data FROM docs WHERE kind = 'setting' AND id = ?").get(id); try { return r ? JSON.parse(r.data) : dflt; } catch { return dflt; } };
const putDoc = (db, id, v) => writeDoc(db, 'setting', id, v);

/* The mail server the server names, or null. Port 465 is TLS from the start; others use STARTTLS when offered. */
export function smtpConfig(env = process.env) {
  const host = String(env.NI_SMTP_HOST || '').trim();
  if (!host) return null;
  const port = Number(env.NI_SMTP_PORT) || 587;
  return { host, port, secure: port === 465, requireTLS: env.NI_SMTP_STARTTLS !== '0' && port !== 465 && port !== 25,
    ...(env.NI_SMTP_USER ? { auth: { user: env.NI_SMTP_USER, pass: readSecret(env, 'NI_SMTP_PASSWORD') } } : {}),
    from: String(env.NI_SMTP_FROM || env.NI_SMTP_USER || 'nobs-inventory@localhost').trim() };
}
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
export const digestSettings = db => ({ on: false, to: [], day: 1, hour: 7, ...getDoc(db, 'digest', {}) });
export function saveDigestSettings(db, v) {
  const to = [...new Set((Array.isArray(v.to) ? v.to : String(v.to || '').split(/[\s,;]+/)).map(x => String(x).trim()).filter(Boolean))];
  const bad = to.find(x => !EMAIL.test(x) || x.length > 200);
  if (bad) throw Object.assign(new Error(`${bad} is not an e-mail address.`), { status: 400 });
  if (to.length > 20) throw Object.assign(new Error('At most 20 addresses.'), { status: 400 });
  const day = Math.min(6, Math.max(0, Math.floor(Number(v.day)))), hour = Math.min(23, Math.max(0, Math.floor(Number(v.hour))));
  putDoc(db, 'digest', { on: !!v.on && to.length > 0, reports: !!v.reports && to.length > 0, to, day: Number.isFinite(day) ? day : 1, hour: Number.isFinite(hour) ? hour : 7 });
}
export const lastDigest = db => getDoc(db, 'digestRun', null);

/* What the mail says, from the inventory as saved: { subject, text, html, count }. */
export function buildDigest(s, { link = '', backups = null, copy = null, health = [] } = {}, today = new Date()) {
  const live = (s.objs || []).filter(o => !o.review && o.status !== 'retired');
  const days = d => Math.floor((new Date(d + 'T23:59:59') - today) / 864e5);
  const wEnded = live.filter(o => o.status === 'active' && /^\d{4}-\d{2}-\d{2}$/.test(o.warranty || '') && days(o.warranty) < 0);
  const wSoon = live.filter(o => /^\d{4}-\d{2}-\d{2}$/.test(o.warranty || '') && days(o.warranty) >= 0 && days(o.warranty) <= WARRANTY_SOON).sort((a, b) => a.warranty.localeCompare(b.warranty));
  const due = (s.contracts || []).map(c => ({ c, st: contractStatus(c, today) })).filter(x => ['soon', 'late'].includes(x.st.state)).sort((a, b) => (a.st.days ?? 0) - (b.st.days ?? 0));
  const held = new Map();
  for (const o of live) if (o.uid && o.status !== 'stock') held.set(o.uid, (held.get(o.uid) || 0) + 1);
  const leavers = (s.users || []).filter(u => u.active === false && held.get(u.id));
  const review = (s.objs || []).filter(o => o.review && !o.review.ignored).length;
  const reported = live.filter(o => o.reported && !o.reported.done).sort((a, b) => String(a.reported.at).localeCompare(String(b.reported.at)));
  const sections = [];
  const list = (items, fmt, max = 10) => [...items.slice(0, max).map(fmt), ...(items.length > max ? [`… and ${items.length - max} more`] : [])];
  if (wEnded.length) sections.push([`Warranty ended on ${wEnded.length} device${wEnded.length === 1 ? '' : 's'} in use`, list(wEnded, o => `${o.name}${o.code ? ` (${o.code})` : ''}: ended ${dateText(o.warranty)}`)]);
  if (wSoon.length) sections.push([`Warranty ends within ${WARRANTY_SOON} days on ${wSoon.length} device${wSoon.length === 1 ? '' : 's'}`, list(wSoon, o => `${o.name}${o.code ? ` (${o.code})` : ''}: ${dateText(o.warranty)}`)]);
  if (due.length) sections.push([`Contract notice due on ${due.length} contract${due.length === 1 ? '' : 's'}`, list(due, x => `${x.c.name}: ${x.st.state === 'late' ? 'notice date passed' : 'give notice by'} ${dateText(x.st.noticeBy || x.st.end)}`)]);
  if (leavers.length) sections.push([`${leavers.length} ${leavers.length === 1 ? 'person' : 'people'} left with devices still out`, list(leavers, u => `${u.name}: ${held.get(u.id)} device${held.get(u.id) === 1 ? '' : 's'}${u.leftAt ? `, left ${u.leftBy ? 'before ' : ''}${dateText(u.leftAt.slice(0, 10))}` : ''}`)]);
  /* Recurring maintenance overdue or due in the next two weeks (the mail comes weekly). */
  const maint = dueTasks(s.objs, todayDay(today), 14), mLate = maint.filter(x => x.days < 0).length;
  if (maint.length) sections.push([`Maintenance: ${mLate ? `${mLate} overdue${maint.length > mLate ? `, ${maint.length - mLate} due within 14 days` : ''}` : `${maint.length} due within 14 days`}`,
    list(maint, x => `${x.o.name}${x.o.code ? ` (${x.o.code})` : ''}: ${x.m.what}, ${x.days < 0 ? 'overdue since' : 'due'} ${dateText(x.m.due)}`)]);
  if (reported.length) sections.push([`${reported.length} problem${reported.length === 1 ? '' : 's'} reported by users, not done yet`, list(reported, o => `${o.name}: ${o.reported.text} (${o.reported.by}, ${dateText(String(o.reported.at).slice(0, 10))})`)]);
  if (review) sections.push([`${review} device${review === 1 ? '' : 's'} waiting in To review`, ['Found by a sync, not in the inventory yet: accept or ignore them.']]);
  const bad = health.filter(c => c.state === 'bad');
  if (bad.length) sections.push(['Health', bad.map(c => `${c.area} · ${c.name}: ${c.value}`)]);
  const backupLine = backups ? [`Last backup: ${backups}`] : [];
  if (copy) backupLine.push(`Copy outside the server: ${copy}`);
  const count = sections.length;
  const subject = count ? `NOBS Inventory: ${count} thing${count === 1 ? '' : 's'} to look at` : 'NOBS Inventory: nothing needs attention';
  const text = [count ? 'This week:' : 'Nothing needs attention this week.', '', ...sections.flatMap(([h, lines]) => [h, ...lines.map(l => `  - ${l}`), '']), ...backupLine, '', link ? `Open the inventory: ${link}` : '', '', 'Sent by NOBS Inventory. Change or turn off in Settings → Maintenance.'].join('\n');
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:14px;color:#111;max-width:640px">
<p>${count ? 'This week:' : 'Nothing needs attention this week.'}</p>${sections.map(([h, lines]) => `<h3 style="font-size:15px;margin:16px 0 4px">${esc(h)}</h3><ul style="margin:0;padding-left:20px">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`).join('')}
${backupLine.length ? `<p style="color:#555;margin-top:16px">${backupLine.map(esc).join('<br>')}</p>` : ''}${link ? `<p><a href="${esc(link)}">Open the inventory</a></p>` : ''}
<p style="color:#777;font-size:12px">Sent by NOBS Inventory. Change or turn off in Settings → Maintenance.</p></div>`;
  return { subject, text, html, count };
}

/* Sends it (transport given in tests); the result is kept for Settings. */
export async function sendDigest(db, mail, env = process.env, now = new Date(), transport = null) {
  const cfg = smtpConfig(env), set = digestSettings(db);
  try {
    if (!cfg) throw new Error('No mail server is set on the server (NI_SMTP_HOST).');
    if (!set.to.length) throw new Error('No address to send to.');
    const t = transport || nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, requireTLS: cfg.requireTLS, ...(cfg.auth ? { auth: cfg.auth } : {}), connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
    await t.sendMail({ from: cfg.from, to: set.to.join(', '), subject: mail.subject, text: mail.text, html: mail.html });
    putDoc(db, 'digestRun', { at: now.toISOString(), ok: true, to: set.to.length, items: mail.count });
  } catch (e) {
    putDoc(db, 'digestRun', { at: now.toISOString(), ok: false, error: String(e.message || e).slice(0, 300) });
    throw e;
  }
}

/* A problem a device's user reported, sent at once to the same addresses (when turned on in Settings → Maintenance).
   Says the device, who and what, and links to it; nothing else of the inventory. */
export function buildReportMail(o, rep, link = '') {
  const where = [o.code, o.loc].filter(Boolean).join(' · ');
  const url = link && o.code ? `${link.replace(/\/?$/, '/')}?o=${encodeURIComponent(o.code)}` : link;
  const subject = `NOBS Inventory: problem reported on ${o.name}`;
  const text = [`${rep.by} reported a problem with ${o.name}${where ? ` (${where})` : ''}:`, '', rep.text, '', url ? `Open the device: ${url}` : '', '', 'Mark it as done on the device or in the Overview. Sent by NOBS Inventory; turn off in Settings → Maintenance.'].join('\n');
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:14px;color:#111;max-width:640px"><p><b>${esc(rep.by)}</b> reported a problem with <b>${esc(o.name)}</b>${where ? ` (${esc(where)})` : ''}:</p>
<blockquote style="margin:8px 0;padding:6px 12px;border-left:3px solid #ccc">${esc(rep.text)}</blockquote>${url ? `<p><a href="${esc(url)}">Open the device</a></p>` : ''}
<p style="color:#777;font-size:12px">Mark it as done on the device or in the Overview. Sent by NOBS Inventory; turn off in Settings → Maintenance.</p></div>`;
  return { subject, text, html };
}
export async function sendReportMail(db, o, rep, env = process.env, transport = null) {
  const cfg = smtpConfig(env), set = digestSettings(db);
  if (!cfg || !set.reports || !set.to.length) return false;
  const m = buildReportMail(o, rep, set.link || env.NI_PUBLIC_URL || '');
  const t = transport || nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, requireTLS: cfg.requireTLS, ...(cfg.auth ? { auth: cfg.auth } : {}), connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
  await t.sendMail({ from: cfg.from, to: set.to.join(', '), subject: m.subject, text: m.text, html: m.html });
  return true;
}
