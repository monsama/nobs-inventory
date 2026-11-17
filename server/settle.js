/* Devices waiting in To check with nothing unclear go into the inventory by themselves, when their source adds new devices
   straight in (Settings → the source → New devices). Those are the ones that waited from before new devices went straight
   in, and ones whose question went away (a device seen again, the device it looked like a second record of retired).
   What still needs a person stays: an ignored or merged record, a possible duplicate (same serial number or name as
   another device, or a docking station's second record), one known only by its IP address, and one no source has seen
   for 90 days or more. The same rules as the reasons on the cards in To check (public/js/15-review.js waitReason). */
import { graphSeen } from '../public/js/intune.js';
import { isPlaceholderSerial } from '../public/js/serials.js';
import { intakeOf } from './state.js';
import { stampTime } from '../public/js/dates.js';

const STALE_DAYS = 90;
const PERSONAL = ['pc', 'notebook', 'mobile', 'android', 'ios'];
const SRC = { lansweeper: 'Lansweeper', ad: 'Active Directory', graph: 'Entra & Intune' };
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const lc = v => String(v || '').toLowerCase();

/* Days since any source last saw it; null when none ever did (no reason to wait). */
function daysUnseen(o, now){
  const dates = [o.feed && !o.excluded && !o.detached && o.feed.scanned, o.ad && o.ad.logon, ...graphSeen(o.graph).map(([, v]) => v),
    o.defender && o.defender.lastSeen, o.autopilot && o.autopilot.lastContact]
    .map(v => String(v || '').slice(0, 10)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d > '2000');
  if (!dates.length) return null;
  const last = dates.sort().at(-1), today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - Date.parse(last + 'T00:00:00Z')) / 864e5);
}

/** @returns {number} how many were added */
export function settleWaiting(s, stampText, now = new Date()){
  const open = s.objs.filter(o => o.status !== 'retired' && !(o.review && (o.review.ignored || o.review.merged)));
  const bySerial = new Map(), byName = new Map();
  for (const o of open){
    if (o.serial && !isPlaceholderSerial(o.serial)) bySerial.set(lc(o.serial), (bySerial.get(lc(o.serial)) || 0) + 1);
    if (o.name) byName.set(lc(o.name), (byName.get(lc(o.name)) || 0) + 1);
  }
  let n = 0;
  for (const o of open){
    if (!o.review || o.excluded || o.detached || intakeOf(s, o.review.src) !== 'direct') continue;
    if (!o.name || (IPV4.test(o.name) && !o.serial)) continue;
    if (o.serial && !isPlaceholderSerial(o.serial) && bySerial.get(lc(o.serial)) > 1) continue;
    if (byName.get(lc(o.name)) > 1) continue;
    /* A docking station's record: a DNS name whose first part is another device's name. */
    if (!o.serial && !o.notTwin && /^[^.\s]+\.[^.\s]+/.test(o.name) && byName.get(lc(o.name).split('.')[0])) continue;
    const days = daysUnseen(o, now);
    if (days != null && days > STALE_DAYS) continue;
    const src = SRC[o.review.src] || o.review.src;
    /* Added as of when it was found, so a device that waited for months does not show as New now. */
    const found = stampTime(o.review.at);
    delete o.review; o.added = new Date(found && found < now.getTime() ? found : now.getTime()).toISOString();
    /* A computer or phone nobody has is in stock, not in use (as when a person accepts it). */
    const stock = PERSONAL.includes(o.type) && o.status === 'active' && !o.uid && !o.user && !o.hotdesk;
    if (stock) o.status = 'stock';
    ((s.history ??= {})[o.id] ??= []).unshift({ t: stampText, msg: `Added to the inventory: nothing unclear (found by ${src})${stock ? ', in stock: nobody has it yet' : ''}` });
    n++;
  }
  return n;
}
