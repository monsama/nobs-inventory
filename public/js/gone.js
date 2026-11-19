/* Which sync sources a device has been in and which no longer list it: one rule for the page (Gone from a source, the
   device page, the Table, the Overview) and the server (the weekly e-mail). P is the newest Lansweeper push day
   (s.lsPresence). No DOM here. */
import { dateText, stampTime } from './dates.js';

/* The sources a device has been in, and whether each still lists it. Lansweeper: the day it was last in a push
   (feed.inPush, else the day this tracking began) against the last full push day (P.full: one that brought at least
   half as many devices as the full day before it), two days apart at least, so a push that broke off gives no false
   alarm. Active Directory: the day its computer account went (adGone).
   Entra & Intune: the time the sync no longer found it (graph.gone). A detached or excluded device is no longer
   Lansweeper's; a retired one has gone on purpose and is never listed. */
export const SOURCE_NAMES = { ls: 'Lansweeper', ad: 'Active Directory', graph: 'Entra & Intune' };
const isoDay = v => /^\d{4}-\d{2}-\d{2}/.test(v || '') ? Date.parse(String(v).slice(0, 10) + 'T00:00:00Z') / 864e5 : NaN;
/** @returns {{src: string, name: string, gone: boolean, when: string}[]} */
export function sourcesOfWith(o, P){
  const out = [];
  if (o.feed && o.feed.sys === 'Lansweeper' && !o.detached && !o.excluded){
    /* Against the last full push day (one that brought about as many devices as usual), two days on at least. */
    /* Never in a push yet: counted from when tracking began, or from when it came (a file uploaded by hand), the later. */
    const t = stampTime(o.feed.linked || o.feed.created), came = t ? new Date(t).toISOString().slice(0, 10) : '';
    const from = [P && P.since, came].filter(Boolean).sort().pop() || '';
    const last = o.feed.inPush || from, ref = P && P.full && P.full.day;
    const gone = !!(ref && last && isoDay(ref) - isoDay(last) >= 2);
    out.push({ src: 'ls', name: SOURCE_NAMES.ls, gone, when: gone ? (o.feed.inPush ? `last sent by Lansweeper on ${dateText(o.feed.inPush)}` : `not sent by Lansweeper since ${dateText(from)}`) : '' });
  }
  if (o.inAd || o.adGone) out.push({ src: 'ad', name: SOURCE_NAMES.ad, gone: !o.inAd && !!o.adGone, when: !o.inAd && o.adGone ? `its computer account went on ${dateText(o.adGone)}` : '' });
  if (o.graph) out.push({ src: 'graph', name: SOURCE_NAMES.graph, gone: !!o.graph.gone, when: o.graph.gone ? `no longer found since ${String(o.graph.gone).slice(0, 10)}` : '' });
  return out;
}
/** Gone from every source it was in (and in one at least); a retired device never. */
export const goneAllWith = (o, P) => { if (o.status === 'retired') return false; const s = sourcesOfWith(o, P); return s.length > 0 && s.every(x => x.gone); };
