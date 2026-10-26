/* When the server syncs by itself: each source on its own interval from a start time (every 4 hours from 06:00 runs at
   02:00, 06:00, 10:00, …), or not at all. Shared by the server (which runs them) and the page (which sets and shows
   them). No browser code here. */
export const SCHEDULE_JOBS = { lansweeper: 'Lansweeper', ldap: 'LDAP directory', graph: 'Microsoft Graph' };
export const DEFAULT_SCHEDULE = { lansweeper: { every: 24, at: '06:00' }, ldap: { every: 24, at: '06:00' }, graph: { every: 4, at: '06:00' } };
/* 0 is off: only Sync now. The others divide a day, so the times are the same every day. */
export const EVERY_HOURS = [0, 1, 2, 3, 4, 6, 8, 12, 24];
const AT = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function scheduleProblem(sched) {
  if (sched == null) return null;
  if (typeof sched !== 'object' || Array.isArray(sched)) return 'The sync schedule is a record.';
  for (const [job, v] of Object.entries(sched)) {
    if (!SCHEDULE_JOBS[job]) return `${job} is not a sync that can be scheduled.`;
    if (!v || typeof v !== 'object' || !EVERY_HOURS.includes(v.every)) return `${SCHEDULE_JOBS[job]}: the interval is one of ${EVERY_HOURS.join(', ')} hours (0 is off).`;
    if (!AT.test(String(v.at || ''))) return `${SCHEDULE_JOBS[job]}: the start time is written as HH:MM, e.g. 06:00.`;
  }
  return null;
}
/* The schedule in use: what was set, else the default, per source. */
export const scheduleOf = s => Object.fromEntries(Object.keys(SCHEDULE_JOBS).map(k => {
  const v = s && s.syncSchedule && s.syncSchedule[k];
  return [k, v && EVERY_HOURS.includes(v.every) && AT.test(String(v.at || '')) ? { every: v.every, at: v.at } : DEFAULT_SCHEDULE[k]];
}));
const minutesOf = at => { const m = AT.exec(at); return +m[1] * 60 + +m[2]; };
/* Whether a source is due in this minute. */
export function isDue(job, now) {
  if (!job.every) return false;
  const diff = ((now.getHours() * 60 + now.getMinutes()) - minutesOf(job.at) + 1440) % 1440;
  return diff % (job.every * 60) === 0;
}
/* The next time it runs, from now, as HH:MM, or '' when it is off. */
export function nextRun(job, now = new Date()) {
  if (!job.every) return '';
  for (let i = 1; i <= 1440; i++) {
    const t = new Date(now.getTime() + i * 60000);
    if (isDue(job, t)) return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  }
  return '';
}
/* How a schedule reads: "every 4 hours from 06:00", "daily at 06:00", "off". */
export const scheduleText = job => !job.every ? 'off, only Sync now' : job.every === 24 ? `daily at ${job.at}` : `every ${job.every} ${job.every === 1 ? 'hour' : 'hours'} from ${job.at}`;
