/* What needs attention now: warranties that end soon or ended on devices in use, maintenance due, contract notices,
   problems users reported, devices waiting in To review, devices on a patch panel port that leads nowhere, and for admins a sync that failed or is late and a restore
   test or backup copy that failed. The bell in the top bar lists them (notices); the weekly e-mail is made from the same
   lists (attention). Each notice has an id and a fingerprint of what it says, so one hidden comes back once it changes.
   No DOM: the server and the tests import it. */
import { contractStatus } from './costs.js';
import { dateText } from './dates.js';
import { MAINT_SOON_DAYS, dueTasks, todayDay } from './maintenance.js';
import { scheduleOf, syncState } from './schedule.js';
import { patchGaps } from './cabling.js';

/* Warranty: a date as YYYY-MM-DD. Soon is within 90 days; the sidebar filters on both. */
export const WARRANTY_SOON_DAYS = 90;
export const warrantyState = (o, today = new Date()) => {
  if (!o.warranty || !/^\d{4}-\d{2}-\d{2}$/.test(o.warranty)) return null;
  const days = Math.floor((new Date(o.warranty + 'T23:59:59').getTime() - today.getTime()) / 86400000);
  return days < 0 ? 'ended' : days <= WARRANTY_SOON_DAYS ? 'soon' : 'ok';
};

/* The lists, from the inventory as saved (s.objs may hold the devices waiting in To review too): warranties ended and
   ending on devices in use, contracts whose notice is due or passed, maintenance due within maintWithin days (overdue
   first), open reported problems (oldest first) and the devices waiting in To review. */
export function attention(s, today = new Date(), { maintWithin = MAINT_SOON_DAYS } = {}) {
  const all = s.objs || [];
  const live = all.filter(o => !o.review && o.status !== 'retired'), inUse = live.filter(o => o.status === 'active');
  const byDay = (a, b) => a.warranty.localeCompare(b.warranty);
  return {
    wEnded: inUse.filter(o => warrantyState(o, today) === 'ended').sort(byDay),
    wSoon: inUse.filter(o => warrantyState(o, today) === 'soon').sort(byDay),
    contracts: (s.contracts || []).map(c => ({ c, st: contractStatus(c, today) })).filter(x => ['soon', 'late'].includes(x.st.state)).sort((a, b) => (a.st.days ?? 0) - (b.st.days ?? 0)),
    maint: dueTasks(live, todayDay(today), maintWithin),
    reported: live.filter(o => o.reported && !o.reported.done).sort((a, b) => String(a.reported.at).localeCompare(String(b.reported.at))),
    review: all.filter(o => o.review && !o.review.ignored),
  };
}

/* A short fingerprint of a list of keys (FNV-1a), so a notice about many devices stays small in the browser's storage. */
export const fingerprint = keys => {
  let h = 0x811c9dc5;
  for (const ch of keys.join('\n')) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${keys.length}:${h.toString(16)}`;
};
const SYNC_NAMES = { lansweeper: 'Lansweeper', ldap: 'Active Directory', graph: 'Entra & Intune' };
const plural = (n, one, more) => `${n} ${n === 1 ? one : more}`;
const names = (list, name = o => o.name) => list.slice(0, 3).map(name).join(', ') + (list.length > 3 ? ` and ${list.length - 3} more` : '');
const SEV = { bad: 0, warn: 1 };

/* The notices: [{ id, sev ('bad' red, 'warn' amber), title, text, fp, go }], red first. go says where a click leads:
   { device }, { table: filters }, { overview: section id }, { tab }, { review: true } or { settings: tab }.
   admin: the syncs and backups are listed; sites: only devices of these sites (a viewer limited to them), and only
   contracts that cover one of them; sources: the syncs set up here. */
export function notices(s, { admin = false, sites = null, sources = [], today = new Date() } = {}) {
  const inSite = o => !sites || sites.includes(String(o.loc || '').split(' / ')[0]);
  const objs = (s.objs || []).filter(inSite), seen = new Set(objs.map(o => o.id));
  const contracts = sites ? (s.contracts || []).filter(c => (c.devices || []).some(id => seen.has(id))) : s.contracts || [];
  const a = attention({ objs, contracts }, today);
  const out = [];
  const devices = (list, table) => list.length === 1 ? { device: list[0].id } : { table };
  if (a.wEnded.length) out.push({ id: 'warranty-ended', sev: 'bad', title: 'Warranty ended', text: `${plural(a.wEnded.length, 'device', 'devices')} in use: ${names(a.wEnded)}`,
    fp: fingerprint(a.wEnded.map(o => o.id)), go: devices(a.wEnded, { warranty: 'ended', status: 'active' }) });
  if (a.wSoon.length) out.push({ id: 'warranty-soon', sev: 'warn', title: 'Warranty ends soon', text: `${plural(a.wSoon.length, 'device', 'devices')} within ${WARRANTY_SOON_DAYS} days: ${names(a.wSoon)}`,
    fp: fingerprint(a.wSoon.map(o => o.id)), go: devices(a.wSoon, { warranty: 'soon', status: 'active' }) });
  const late = a.maint.filter(x => x.days < 0), due = a.maint.filter(x => x.days >= 0);
  const task = x => `${x.o.name}: ${x.m.what}`, taskKey = x => `${x.o.id}/${x.m.id}/${x.m.due}`;
  if (late.length) out.push({ id: 'maint-late', sev: 'bad', title: 'Maintenance overdue', text: names(late, task), fp: fingerprint(late.map(taskKey)),
    go: late.length === 1 ? { device: late[0].o.id } : { overview: 'ovMaint' } });
  if (due.length) out.push({ id: 'maint-due', sev: 'warn', title: `Maintenance due within ${MAINT_SOON_DAYS} days`, text: names(due, task), fp: fingerprint(due.map(taskKey)),
    go: due.length === 1 ? { device: due[0].o.id } : { overview: 'ovMaint' } });
  for (const { c, st } of a.contracts) out.push({ id: `contract-${c.id}`, sev: st.state === 'late' ? 'bad' : 'warn',
    title: st.state === 'late' ? `Notice date passed: ${c.name}` : `Contract notice due: ${c.name}`,
    text: st.state === 'late' ? `It renews on ${dateText(st.end)}` : st.noticeBy ? `Give notice by ${dateText(st.noticeBy)}` : `It ends on ${dateText(st.end)}`,
    fp: `${st.state}|${st.noticeBy || st.end}`, go: { tab: 'contracts' } });
  for (const o of a.reported) out.push({ id: `reported-${o.id}`, sev: 'warn', title: `Problem reported: ${o.name}`, text: `${o.reported.text}${o.reported.by ? ` (${o.reported.by})` : ''}`,
    fp: String(o.reported.at), go: { device: o.id } });
  if (a.review.length) out.push({ id: 'review', sev: 'warn', title: 'Waiting in To review', text: `${plural(a.review.length, 'device', 'devices')} found by a sync: accept or ignore ${a.review.length === 1 ? 'it' : 'them'}`,
    fp: fingerprint(a.review.map(o => o.id)), go: { review: true } });
  /* Devices on a panel port with no patch cord and no trunk on the panel: the patch list has a gap (s.rels, when given). */
  const gaps = Array.isArray(s.rels) ? patchGaps(objs.filter(o => !o.review), s.rels) : [];
  if (gaps.length) out.push({ id: 'patch-gaps', sev: 'warn', title: 'Patch list gaps', text: `${plural(gaps.length, 'device', 'devices')} on a patch panel port without a patch cord or trunk: ${names(gaps)}`,
    fp: fingerprint(gaps.map(o => o.id)), go: devices(gaps, { ids: { label: 'Patch list gaps', ids: gaps.map(o => o.id) } }) });
  if (admin) {
    const plan = scheduleOf(s), runs = s.syncRuns || {};
    for (const src of sources) {
      const r = runs[src], state = syncState(r, plan[src], today.getTime());
      if (state === 'failed') out.push({ id: `sync-${src}`, sev: 'bad', title: `${SYNC_NAMES[src]} sync failed`, text: String(r.error || 'The last run failed.').slice(0, 160), fp: `failed|${r.at}`, go: { settings: src } });
      else if (state === 'late') out.push({ id: `sync-${src}`, sev: 'warn', title: `${SYNC_NAMES[src]} sync is late`, text: `It last ran on ${dateText(String(r.at).slice(0, 10))}, less often than planned`, fp: `late|${r.at}`, go: { settings: src } });
    }
    const rt = s.restoreTest, copy = s.backupExportRun;
    if (rt && rt.ok === false) out.push({ id: 'restore-test', sev: 'bad', title: 'Restore test failed', text: String(rt.error || 'The newest backup could not be restored.').slice(0, 160), fp: String(rt.at), go: { settings: 'backups' } });
    if (copy && copy.ok === false) out.push({ id: 'backup-copy', sev: 'bad', title: 'Backup copy outside the server failed', text: String(copy.error || 'The copy could not be made.').slice(0, 160), fp: String(copy.at), go: { settings: 'backups' } });
  }
  return out.map((n, i) => [n, i]).sort(([x, i], [y, j]) => SEV[x.sev] - SEV[y.sev] || i - j).map(([n]) => n);
}

/* Hidden notices are kept as { id: fingerprint }: a notice stays hidden only while it says the same. */
export const shownNotices = (list, hidden) => list.filter(n => !hidden || hidden[n.id] !== n.fp);
/* Hides one; what is kept is only about notices still listed, so it does not grow. */
export const hideNotice = (hidden, n, list) => Object.fromEntries([...list.filter(x => x.id !== n.id && hidden && hidden[x.id] === x.fp).map(x => [x.id, x.fp]), [n.id, n.fp]]);
