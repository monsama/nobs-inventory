/* A device's life in one list, newest first: bought, the warranty's end, added here or first found by a source, handed
   out and taken back, moved, its status, maintenance done, its contracts, the planned replacement, retired. Built from
   what the inventory already keeps: the device, its history, its contracts and the lifetimes (lifecycle.js). Each event
   has a kind (its icon) and a tone: ok (green, fine), warn (amber, needs a look), bad (red, a problem), gone (grey,
   retired) or '' (plain). Shared by the page and the tests. No DOM. */
import { contractStatus } from './costs.js';
import { dueOf } from './lifecycle.js';
import { stampTime } from './dates.js';

const STATUS_TEXT = { active: 'In use', stock: 'In stock', retired: 'Retired' };
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/* A day (YYYY-MM-DD) as a moment, at the start of that day where the page is; and as people read it. */
const dayTime = v => { const m = DAY.exec(v || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : 0; };
const dayShown = v => { const m = DAY.exec(v || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; };

/* What one history line says of the device's life, or null: the field edits noted with their values first (restore.js
   fieldNote), then the lines the page and the syncs write as text. */
export function historyEvent(h) {
  const msg = String((h && h.msg) || '');
  if (h && h.f === 'user') return h.to ? { kind: 'user', tone: 'ok', text: `Handed out to ${h.to}` } : h.from ? { kind: 'back', tone: '', text: `Taken back from ${h.from}` } : null;
  if (h && h.f === 'loc') return { kind: 'move', tone: '', text: h.to ? `Moved to ${h.to}` : 'Location cleared' };
  if (h && h.f === 'status' && STATUS_TEXT[h.to]) return h.to === 'retired' ? { kind: 'retired', tone: 'gone', text: 'Retired' } : { kind: 'status', tone: h.to === 'active' ? 'ok' : '', text: STATUS_TEXT[h.to] };
  if (h && h.f) return null;
  let m;
  if ((m = /^(?:Given to|Handed out to) (.+?)(?: \(was [^)]*\))?(?:, to (.+?))? by /.exec(msg))) return { kind: 'user', tone: 'ok', text: `Handed out to ${m[1]}${m[2] ? `, to ${m[2]}` : ''}` };
  if ((m = /^In use from now on: given to (.+?) by /.exec(msg))) return { kind: 'user', tone: 'ok', text: `Handed out to ${m[1]}` };
  if ((m = /^Taken back into stock(?: from (.+?))?(?:, to (.+?))? by /.exec(msg))) return { kind: 'back', tone: '', text: `Taken back${m[1] ? ` from ${m[1]}` : ''} into stock${m[2] ? `, to ${m[2]}` : ''}` };
  if ((m = /^(.+?) no longer has it: taken into stock/.exec(msg))) return { kind: 'back', tone: '', text: `Taken back from ${m[1]} into stock` };
  if ((m = /^(?:Lansweeper: )?Location (?:changed from .*? to|set to) (.+?)(?= from | by |: | \(|$)/.exec(msg))) return { kind: 'move', tone: '', text: `Moved to ${m[1]}` };
  if ((m = /^Moved back to (.+?):/.exec(msg))) return { kind: 'move', tone: '', text: `Moved back to ${m[1]}` };
  if (/^Retired\b/.test(msg)) return { kind: 'retired', tone: 'gone', text: 'Retired' };
  if (/^Obsolete, a second record of .+: retired/.test(msg)) return { kind: 'retired', tone: 'gone', text: 'Retired as a second record' };
  if ((m = /^Accepted into the inventory by .+? \(found by (.+?)\)/.exec(msg))) return { kind: 'added', tone: 'ok', text: `Added to the inventory, found by ${m[1]}` };
  if (/^Created manually\b/.test(msg)) return { kind: 'added', tone: 'ok', text: 'Added by hand' };
  if ((m = /^Duplicated from (.+)$/.exec(msg))) return { kind: 'added', tone: 'ok', text: `Added as a copy of ${m[1]}` };
  if ((m = /^Added from (.+?)(?: by .*| \(.*\))?$/.exec(msg))) return { kind: 'added', tone: 'ok', text: `Added from ${m[1]}` };
  if ((m = /^(?:Found in|Registered in) (.+?)(?:, not set up yet)?: waiting in To review$/.exec(msg))) return { kind: 'seen', tone: 'ok', text: `First found in ${m[1]}` };
  return null;
}

/* The events of device o: [{ kind, tone, text, when, at, future }], newest first; events still to come (the warranty's
   end, a contract's end, the replacement) are at the top. history is the device's history (newest first), contracts
   those that list it, life the lifetimes per type (setting lifecycle). */
export function timelineOf(o, { history = [], contracts = [], life = {}, today = new Date() } = {}) {
  const out = [], now = today.getTime(), todayDay = isoDay(today), retired = o.status === 'retired';
  const add = (kind, tone, text, at, when) => { if (at) out.push({ kind, tone, text, when, at, future: at > now }); };
  const addDay = (kind, tone, text, day) => add(kind, tone, text, dayTime(day), dayShown(day));
  if (o.purchased) addDay('buy', 'ok', 'Purchased', o.purchased);
  if (DAY.test(o.warranty || '')) {
    const ended = o.warranty < todayDay, soon = !ended && dayTime(o.warranty) - now <= 90 * 864e5;
    addDay('warranty', retired ? '' : ended || soon ? 'warn' : 'ok', ended ? 'Warranty ended' : 'Warranty ends', o.warranty);
  }
  for (const h of history || []) {
    const e = historyEvent(h), at = stampTime(h && h.t);
    if (e && at) add(e.kind, e.tone, e.text, at, String(h.t).slice(0, 10));
  }
  /* Where the history has no line of its being added (cut short, or older than it): what the sources noted. */
  const f = o.feed || {};
  if (!out.some(e => e.kind === 'added' || e.kind === 'seen')) {
    if (f.created) add('added', 'ok', 'Added from Lansweeper', stampTime(f.created), String(f.created).slice(0, 10));
    else if (f.linked) add('seen', 'ok', 'Linked to Lansweeper', stampTime(f.linked), String(f.linked).slice(0, 10));
  }
  if (DAY.test(f.firstSeen || '')) addDay('seen', 'ok', 'First found by Lansweeper', f.firstSeen);
  for (const m of Array.isArray(o.maint) ? o.maint : []) for (const l of Array.isArray(m.log) ? m.log : []) if (DAY.test(l.at || '')) addDay('maint', 'ok', `Maintenance done: ${m.what}${l.by ? ` by ${l.by}` : ''}`, l.at);
  for (const c of contracts || []) {
    if (DAY.test(c.start || '')) addDay('contract', '', `Contract ${c.name} starts`, c.start);
    const cs = c.end ? contractStatus(c, today) : null;
    if (cs && cs.end) addDay('contract', cs.state === 'ended' || retired ? '' : cs.state === 'ok' ? 'ok' : 'warn', `Contract ${c.name} ${cs.state === 'ended' ? 'ended' : c.renew > 0 ? 'renews' : 'ends'}`, cs.end);
  }
  const due = retired || o.review ? null : dueOf(o, life);
  if (due) {
    const y = today.getFullYear(), from = due.from === 'purchase' ? 'by its lifetime' : 'when its warranty ends';
    /* Due this year or overdue is where the device stands now: it goes at today, above what has happened. */
    add('replace', due.year < y ? 'bad' : due.year === y ? 'warn' : '', due.year < y ? `Replacement overdue since ${due.year}` : due.year === y ? `Replacement due this year, ${from}` : `Replacement planned, ${from}`, due.year <= y ? now : new Date(due.year, 0, 1).getTime(), String(due.year));
  }
  return out.sort((a, b) => b.at - a.at);
}
