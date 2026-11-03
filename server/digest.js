/* The weekly e-mail to the admins: what needs doing, in one short list, with a link to the inventory. Warranties that
   end soon or ended on devices in use, contract notices due, people who left with devices out, problems users reported, devices waiting in To
   review, the last backup and the copy outside the server, and what Health marks bad. Optional: only when the server
   names a mail server (NI_SMTP_*), and turned on in Settings → System → E-mail with the addresses to send to. Nothing secret
   goes in it; the mail server's password stays on the server. */
import nodemailer from 'nodemailer';
import { readSecret } from './secrets.js';
import { writeDoc } from './db.js';
import { dateText } from '../public/js/dates.js';
import { WARRANTY_SOON_DAYS, attention } from '../public/js/notices.js';
import { MAIL_ADDRESS } from '../public/js/saved-views.js';

const getDoc = (db, id, dflt) => { const r = db.prepare("SELECT data FROM docs WHERE kind = 'setting' AND id = ?").get(id); try { return r ? JSON.parse(r.data) : dflt; } catch { return dflt; } };
const putDoc = (db, id, v) => writeDoc(db, 'setting', id, v);

/* The mail server: the one the server names (NI_SMTP_*), which wins, or else the one set in Settings → System → E-mail
   (saved: { host, port, security, user, from, pass }, the password kept sealed apart). null when neither. security is
   starttls (the default, port 587), tls (from the start, port 465) or none (a relay inside the network, port 25). */
export const SMTP_SECURITY = ['starttls', 'tls', 'none'];
/* Returns the mail transport's options ({ source, host, port, secure, requireTLS, auth, from }) or null. saved is the
   setting with its password already unsealed (app.js). */
export function smtpConfig(env = process.env, saved = null) {
  const host = String(env.NI_SMTP_HOST || '').trim();
  if (host) {
    const port = Number(env.NI_SMTP_PORT) || 587;
    return { source: 'server', host, port, secure: port === 465, requireTLS: env.NI_SMTP_STARTTLS !== '0' && port !== 465 && port !== 25,
      ...(env.NI_SMTP_USER ? { auth: { user: env.NI_SMTP_USER, pass: readSecret(env, 'NI_SMTP_PASSWORD') } } : {}),
      from: String(env.NI_SMTP_FROM || env.NI_SMTP_USER || 'nobs-inventory@localhost').trim() };
  }
  if (!saved || !saved.host) return null;
  const sec = SMTP_SECURITY.includes(saved.security) ? saved.security : 'starttls';
  return { source: 'app', host: saved.host, port: Number(saved.port) || (sec === 'tls' ? 465 : sec === 'none' ? 25 : 587), secure: sec === 'tls', requireTLS: sec === 'starttls',
    ...(saved.user ? { auth: { user: saved.user, pass: saved.pass || '' } } : {}), from: String(saved.from || saved.user || 'nobs-inventory@localhost').trim() };
}
/* What is wrong with a mail server set in Settings, or ''. */
export function smtpSettingsProblem(v) {
  if (!v || typeof v !== 'object') return 'The mail server is a record.';
  if (typeof v.host !== 'string' || !/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i.test(v.host.trim())) return 'The mail server is a host name or an IP address, such as smtp.example.com.';
  if (!Number.isInteger(v.port) || v.port < 1 || v.port > 65535) return 'The port is a number from 1 to 65535.';
  if (!SMTP_SECURITY.includes(v.security)) return 'The security is STARTTLS, TLS or none.';
  if (v.user !== undefined && (typeof v.user !== 'string' || v.user.length > 200 || /[\r\n]/.test(v.user))) return 'The user name is text of up to 200 characters.';
  if (v.from !== undefined && v.from !== '' && (typeof v.from !== 'string' || v.from.length > 200 || !EMAIL.test(v.from))) return 'The sender is an e-mail address.';
  return '';
}
export const transportOf = cfg => nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, requireTLS: cfg.requireTLS, ...(cfg.auth ? { auth: cfg.auth } : {}), connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
/* A test mail, to see the server, its sign-in and the sender work. */
export async function sendTestMail(cfg, to, transport = null) {
  if (!cfg) throw Object.assign(new Error('No mail server is set.'), { ours: true });
  if (!EMAIL.test(String(to || '')) || String(to).length > 200) throw Object.assign(new Error('Give the address to send the test to.'), { ours: true });
  await (transport || transportOf(cfg)).sendMail({ from: cfg.from, to, subject: 'NOBS Inventory: test e-mail', text: 'This is a test from NOBS Inventory (Settings → System → E-mail). The mail server works.' });
}
/* Why a test mail failed, in a few kinds only: the mail server's own answer is not passed on, since it would let the
   test reach any host and port and read back what answers there (a service banner). */
export function mailFailure(e, what = 'the test e-mail') {
  if (e && e.ours) return e.message;
  const c = String((e && e.code) || ''), m = String((e && e.message) || '');
  if (c === 'EAUTH') return 'The mail server refused the sign-in: check the user and the password.';
  if (c === 'ETLS' || /TLS|SSL|certificate/i.test(m)) return 'The secure connection to the mail server failed: check the security setting and its certificate.';
  if (['ECONNECTION', 'ECONNREFUSED', 'ETIMEDOUT', 'EDNS', 'ESOCKET', 'EHOSTUNREACH', 'ENOTFOUND', 'EPROTOCOL'].includes(c)) return 'The mail server could not be reached as a mail server: check the server, the port and the firewall.';
  if (c === 'EENVELOPE') return 'The mail server refused the sender or the address.';
  return `The mail server did not accept ${what}.`;
}
const EMAIL = MAIL_ADDRESS;
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
  /* The same lists as the bell in the page (public/js/notices.js); maintenance due in the next two weeks, as the mail comes weekly. */
  const { wEnded, wSoon, contracts: due, maint, reported, review: waiting } = attention(s, today, { maintWithin: 14 });
  const held = new Map();
  for (const o of live) if (o.uid && o.status !== 'stock') held.set(o.uid, (held.get(o.uid) || 0) + 1);
  const leavers = (s.users || []).filter(u => u.active === false && held.get(u.id));
  const review = waiting.length;
  const sections = [];
  const list = (items, fmt, max = 10) => [...items.slice(0, max).map(fmt), ...(items.length > max ? [`… and ${items.length - max} more`] : [])];
  if (wEnded.length) sections.push([`Warranty ended on ${wEnded.length} device${wEnded.length === 1 ? '' : 's'} in use`, list(wEnded, o => `${o.name}${o.code ? ` (${o.code})` : ''}: ended ${dateText(o.warranty)}`)]);
  if (wSoon.length) sections.push([`Warranty ends within ${WARRANTY_SOON_DAYS} days on ${wSoon.length} device${wSoon.length === 1 ? '' : 's'} in use`, list(wSoon, o => `${o.name}${o.code ? ` (${o.code})` : ''}: ${dateText(o.warranty)}`)]);
  if (due.length) sections.push([`Contract notice due on ${due.length} contract${due.length === 1 ? '' : 's'}`, list(due, x => `${x.c.name}: ${x.st.state === 'late' ? 'notice date passed' : 'give notice by'} ${dateText(x.st.noticeBy || x.st.end)}`)]);
  if (leavers.length) sections.push([`${leavers.length} ${leavers.length === 1 ? 'person' : 'people'} left with devices still out`, list(leavers, u => `${u.name}: ${held.get(u.id)} device${held.get(u.id) === 1 ? '' : 's'}${u.leftAt ? `, left ${u.leftBy ? 'before ' : ''}${dateText(u.leftAt.slice(0, 10))}` : ''}`)]);
  /* Recurring maintenance overdue or due in the next two weeks. */
  const mLate = maint.filter(x => x.days < 0).length;
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
  const text = [count ? 'This week:' : 'Nothing needs attention this week.', '', ...sections.flatMap(([h, lines]) => [h, ...lines.map(l => `  - ${l}`), '']), ...backupLine, '', link ? `Open the inventory: ${link}` : '', '', 'Sent by NOBS Inventory. Change or turn off in Settings → System → E-mail.'].join('\n');
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:14px;color:#111;max-width:640px">
<p>${count ? 'This week:' : 'Nothing needs attention this week.'}</p>${sections.map(([h, lines]) => `<h3 style="font-size:15px;margin:16px 0 4px">${esc(h)}</h3><ul style="margin:0;padding-left:20px">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`).join('')}
${backupLine.length ? `<p style="color:#555;margin-top:16px">${backupLine.map(esc).join('<br>')}</p>` : ''}${link ? `<p><a href="${esc(link)}">Open the inventory</a></p>` : ''}
<p style="color:#777;font-size:12px">Sent by NOBS Inventory. Change or turn off in Settings → System → E-mail.</p></div>`;
  return { subject, text, html, count };
}

/* Sends it (transport given in tests); the result is kept for Settings. */
export async function sendDigest(db, mail, env = process.env, now = new Date(), transport = null, cfg = smtpConfig(env)) {
  const set = digestSettings(db);
  try {
    if (!cfg) throw new Error('No mail server is set (Settings → System → E-mail, or NI_SMTP_HOST on the server).');
    if (!set.to.length) throw new Error('No address to send to.');
    const t = transport || transportOf(cfg);
    await t.sendMail({ from: cfg.from, to: set.to.join(', '), subject: mail.subject, text: mail.text, html: mail.html });
    putDoc(db, 'digestRun', { at: now.toISOString(), ok: true, to: set.to.length, items: mail.count });
  } catch (e) {
    putDoc(db, 'digestRun', { at: now.toISOString(), ok: false, error: String(e.message || e).slice(0, 300) });
    throw e;
  }
}

/* A problem a device's user reported, sent at once to the same addresses (when turned on in Settings → System → E-mail).
   Says the device, who and what, and links to it; nothing else of the inventory. */
export function buildReportMail(o, rep, link = '') {
  const where = [o.code, o.loc].filter(Boolean).join(' · ');
  const url = link && o.code ? `${link.replace(/\/?$/, '/')}?o=${encodeURIComponent(o.code)}` : link;
  const subject = `NOBS Inventory: problem reported on ${o.name}`;
  const text = [`${rep.by} reported a problem with ${o.name}${where ? ` (${where})` : ''}:`, '', rep.text, '', url ? `Open the device: ${url}` : '', '', 'Mark it as done on the device or in the Overview. Sent by NOBS Inventory; turn off in Settings → System → E-mail.'].join('\n');
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:14px;color:#111;max-width:640px"><p><b>${esc(rep.by)}</b> reported a problem with <b>${esc(o.name)}</b>${where ? ` (${esc(where)})` : ''}:</p>
<blockquote style="margin:8px 0;padding:6px 12px;border-left:3px solid #ccc">${esc(rep.text)}</blockquote>${url ? `<p><a href="${esc(url)}">Open the device</a></p>` : ''}
<p style="color:#777;font-size:12px">Mark it as done on the device or in the Overview. Sent by NOBS Inventory; turn off in Settings → System → E-mail.</p></div>`;
  return { subject, text, html };
}
export async function sendReportMail(db, o, rep, env = process.env, transport = null, cfg = smtpConfig(env)) {
  const set = digestSettings(db);
  if (!cfg || !set.reports || !set.to.length) return false;
  const m = buildReportMail(o, rep, set.link || env.NI_PUBLIC_URL || '');
  const t = transport || transportOf(cfg);
  await t.sendMail({ from: cfg.from, to: set.to.join(', '), subject: m.subject, text: m.text, html: m.html });
  return true;
}
