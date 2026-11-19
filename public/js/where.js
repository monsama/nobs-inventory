/* Whether a device may no longer be there, and why: gone from every source it was in, else not seen by any source for
   90 days, else not scanned by Lansweeper for 3 months. Shared by the page (Overview, filters) and the server (the
   weekly mail), so both count the same devices. No browser code here. */
import { stampTime } from './dates.js';
import { graphSeen } from './intune.js';
import { goneAllWith } from './gone.js';

export const SCAN_OLD_DAYS = 90;
export const UNSEEN_DAYS = 90;
/* The day limits an admin can choose (Settings → Data sources → Gone devices), kept as setting whereDays
   { unseen, scan }; 90 days each when not set. */
export const WHERE_DAY_CHOICES = [30, 60, 90, 120, 180, 365];
export function whereDaysProblem(v){
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return 'The limits of Where are they? must be a list of days.';
  for (const k of Object.keys(v)) if (!['unseen', 'scan'].includes(k) || !WHERE_DAY_CHOICES.includes(v[k])) return `The limits of Where are they? are ${WHERE_DAY_CHOICES.join(', ')} days.`;
  return null;
}
/** The context of the rule from the saved settings (s or the page's st): the newest push day, whether Lansweeper is
    used, and the day limits. @returns {{lsPresence: any, lsLive: boolean, unseenDays: number, scanDays: number}} */
export const whereCtxOf = (s, lsLive) => ({ lsPresence: s.lsPresence || null, lsLive, unseenDays: (s.whereDays && s.whereDays.unseen) || UNSEEN_DAYS, scanDays: (s.whereDays && s.whereDays.scan) || SCAN_OLD_DAYS });
/* A device Lansweeper tries to scan but has never scanned: a week's grace for one it found only just now. */
export const NEVER_SCANNED_GRACE_DAYS = 7;
const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const daysAgo = (day, today) => (+today - +new Date(day + 'T00:00:00')) / 86400000;
/* The day the grace counts from: when Lansweeper found it, or, from a Lansweeper that does not say, when it came here. */
const foundDay = f => isDay(f.firstSeen) ? f.firstSeen : (() => { const t = stampTime(f.linked || f.created); return t ? new Date(t).toISOString().slice(0, 10) : ''; })();
const lsCounts = (o, lsLive) => !!(lsLive && o.feed && !o.excluded && !o.detached);

/** lsLive: Lansweeper is on and its data is used. */
export const neverScannedWith = (o, lsLive, today = new Date()) => lsCounts(o, lsLive) && !o.feed.scanned && isDay(o.feed.tried)
  && !(foundDay(o.feed) && daysAgo(foundDay(o.feed), today) <= NEVER_SCANNED_GRACE_DAYS);
export const scanOldWith = (o, lsLive, today = new Date(), days = SCAN_OLD_DAYS) => neverScannedWith(o, lsLive, today)
  || (lsCounts(o, lsLive) && isDay(o.feed.scanned) && daysAgo(o.feed.scanned, today) > days);

/* When each source last saw the device: [source, day, the value as given], only real days. */
/** @returns {[string, string, string][]} */
export const seenDates = o => /** @type {[string, any][]} */ ([['Lansweeper', o.feed && !o.excluded && !o.detached && o.feed.scanned], ['AD', o.ad && o.ad.logon], ...graphSeen(o.graph),
  ['Defender', o.defender && o.defender.lastSeen], ['Autopilot', o.autopilot && o.autopilot.lastContact]])
  .map(([src, v]) => /** @type {[string, string, string]} */ ([src, String(v || '').slice(0, 10), String(v || '')])).filter(([, d]) => isDay(d) && d > '2000');

/* Days since any source last saw it (whole days, by the calendar), or null when none ever has. */
export function lastSeenDays(o, today = new Date()){
  const all = seenDates(o); if (!all.length) return null;
  const newest = all.map(x => x[1]).sort().pop();
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((t - Date.parse(newest + 'T00:00:00Z')) / 864e5));
}

/* The strongest sign that a device in use may be missing: 'gone', 'unseen', 'scan' or ''. */
/** @param {any} o @param {{lsPresence?: any, lsLive?: boolean, unseenDays?: number, scanDays?: number}} ctx @param {Date} [today] */
export function whereSign(o, ctx, today = new Date()){
  const { lsPresence, lsLive = false, unseenDays = UNSEEN_DAYS, scanDays = SCAN_OLD_DAYS } = ctx;
  if (o.status === 'retired') return '';
  if (goneAllWith(o, lsPresence)) return 'gone';
  const d = lastSeenDays(o, today);
  if (d !== null && d > unseenDays) return 'unseen';
  if (scanOldWith(o, lsLive, today, scanDays)) return 'scan';
  return '';
}
/* Days in words: 90 days, 6 months, a year. */
export const span = n => n === 365 ? 'a year' : n % 30 === 0 && n >= 60 && n !== 90 ? `${n / 30} months` : n === 90 ? '3 months' : `${n} days`;
/** What a sign says, with the limits in force. */
export const whereLabel = (k, ctx = {}) => k === 'gone' ? 'gone from every source' : k === 'unseen' ? `not seen for ${(ctx.unseenDays || UNSEEN_DAYS) === 90 ? '90 days' : span(ctx.unseenDays)}`
  : k === 'scan' ? `not scanned by Lansweeper for ${span(ctx.scanDays || SCAN_OLD_DAYS)}` : '';
export const WHERE_LABELS = { gone: whereLabel('gone'), unseen: whereLabel('unseen'), scan: whereLabel('scan') };
/* The devices with a sign, and the counts per sign: { ids, n: {gone, unseen, scan}, parts: ['2 gone from every source', ...] }. */
export function whereAreThey(objs, ctx, today = new Date()){
  const n = { gone: 0, unseen: 0, scan: 0 }, ids = [], by = { gone: [], unseen: [], scan: [] };
  for (const o of objs){ const k = whereSign(o, ctx, today); if (k){ n[k]++; ids.push(o.id); by[k].push(o); } }
  return { ids, n, by, parts: Object.keys(n).filter(k => n[k]).map(k => `${n[k]} ${whereLabel(k, ctx)}`) };
}
