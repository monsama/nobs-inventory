/* Recurring maintenance on any object: a UPS battery to test, firmware to update, a filter to change, a fire
   extinguisher to have checked. Each task on an object (o.maint) says what, how often (every n days, weeks, months or
   years) and when it is due next; "done" keeps the date, who and a note, and moves the next due date on by the
   interval from the day it was done. Shared by the page and the server (the check of a save, the weekly e-mail). No DOM. */
export const MAINT_UNITS = { d: ['day', 'days'], w: ['week', 'weeks'], m: ['month', 'months'], y: ['year', 'years'] };
export const MAINT_MAX = 20;         /* tasks on one object */
export const MAINT_LOG = 20;         /* the last times done that are kept on a task (older ones are in the history) */
export const MAINT_SOON_DAYS = 30;   /* due within this many days: listed as due soon */
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = v => typeof v === 'string' && DAY.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));
const pad = n => String(n).padStart(2, '0');
/* Today as YYYY-MM-DD in local time. */
export const todayDay = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
/* day plus the interval; a month or year from the 31st lands on the last day of a shorter month. */
export function addInterval(day, every, unit) {
  const [y, m, d] = day.split('-').map(Number), n = Number(every) || 0;
  if (unit === 'd' || unit === 'w') {
    const t = new Date(Date.UTC(y, m - 1, d + n * (unit === 'w' ? 7 : 1)));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  const months = (y * 12 + (m - 1)) + n * (unit === 'y' ? 12 : 1), ty = Math.floor(months / 12), tm = months % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${pad(tm + 1)}-${pad(Math.min(d, last))}`;
}
export const everyText = m => `every ${m.every === 1 ? '' : m.every + ' '}${MAINT_UNITS[m.unit][m.every === 1 ? 0 : 1]}`;
/* Days from today to the task's due date (negative: overdue). */
export const daysTo = (day, today) => Math.round((Date.parse(day + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5);
export const dueState = (m, today) => { const n = daysTo(m.due, today); return n < 0 ? 'late' : n <= MAINT_SOON_DAYS ? 'soon' : 'ok'; };
/* After done on day: the record kept, and the next due date from that day. */
export function doneTask(m, day, by, note = '') {
  const entry = { at: day, by: String(by || '').slice(0, 120), ...(note ? { note: String(note).slice(0, 500) } : {}) };
  return { ...m, due: addInterval(day, m.every, m.unit), last: day, log: [entry, ...(m.log || [])].slice(0, MAINT_LOG) };
}
/* The tasks due within days (overdue ones included) on objects in use, soonest first: [{ o, m, days }]. */
export function dueTasks(objs, today, within = MAINT_SOON_DAYS) {
  const out = [];
  for (const o of objs || []) {
    if (o.review || o.status === 'retired' || !Array.isArray(o.maint)) continue;
    for (const m of o.maint) { const days = daysTo(m.due, today); if (days <= within) out.push({ o, m, days }); }
  }
  return out.sort((a, b) => a.days - b.days || String(a.o.name).localeCompare(String(b.o.name)));
}
/* The task due next on an object, or null. */
export const nextTask = o => (Array.isArray(o.maint) && o.maint.length ? [...o.maint].sort((a, b) => a.due.localeCompare(b.due))[0] : null);

/* What is wrong with an object's list of tasks, or ''. */
export function maintProblem(list) {
  if (!Array.isArray(list) || list.length > MAINT_MAX) return `Maintenance is a list of at most ${MAINT_MAX} tasks.`;
  const ids = new Set();
  for (const m of list) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !m.id || m.id.length > 40 || ids.has(m.id)) return 'Each maintenance task has its own id.';
    ids.add(m.id);
    if (typeof m.what !== 'string' || !m.what.trim() || m.what.length > 120) return 'A maintenance task says what is done, in up to 120 characters.';
    if (!Number.isInteger(m.every) || m.every < 1 || m.every > 999 || !MAINT_UNITS[m.unit]) return `${m.what}: the interval is a number of days, weeks, months or years.`;
    if (!isDay(m.due)) return `${m.what}: the next due date is a date.`;
    if (m.last !== undefined && !isDay(m.last)) return `${m.what}: the last time done is a date.`;
    if (m.log !== undefined && (!Array.isArray(m.log) || m.log.length > MAINT_LOG || m.log.some(e => !e || !isDay(e.at) || typeof e.by !== 'string' || e.by.length > 120 || (e.note !== undefined && (typeof e.note !== 'string' || e.note.length > 500)))))
      return `${m.what}: the record of when it was done is a list of dates, who and a note.`;
  }
  return '';
}
