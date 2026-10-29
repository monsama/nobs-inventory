/* Filling a device's empty fields from the directories: Microsoft Graph (Intune) and Active Directory.
   Who wins: a value set by hand (or the source picked on the device), then the sources in the field's order (Settings →
   Data sources; sync-map.js fieldOrder and maySet, which the page reads too). Where each value came from is noted in o.src
   (field → 'hand', 'ls', 'graph' or 'ad'), so a source before another can replace its value and the page can show the
   source beside the field. */
import { ORDER_FIELDS, maySet } from '../public/js/sync-map.js';
export const FILL_SOURCES = { graph: 'Intune', ad: 'Active Directory' };

/* Sets o[k] to value from src when the order allows it. Returns true when the device changed. A first fill and a change
   are written to the history (s.history), as Lansweeper's changes are. */
export function fillField(s, o, k, value, src, at, label = k) {
  const v = String(value ?? '').trim();
  if (!v || o[k] === v) return false;
  if (!maySet(s, o, k, src)) return false;
  if (s && s.history && o.id) {
    const msg = o[k] ? `${FILL_SOURCES[src]}: ${label} changed from ${o[k]} to ${v}` : `${FILL_SOURCES[src]}: ${label} filled in: ${v}`;
    (s.history[o.id] ??= []).unshift({ t: at, msg });
  }
  o[k] = v;
  (o.src ??= {})[k] = src;
  return true;
}

/* Whether Lansweeper writes field k of device o: for a field the sources set, as its order says (maySet); else a person
   picked it for the field, or none was picked and the policy (Settings → Lansweeper) lets it. The lists (software,
   links) are Lansweeper's unless the policy turns them off. */
export const lsWrites = (s, o, k) => s.feedOn !== false && (ORDER_FIELDS.includes(k) ? maySet(s, o, k, 'ls') : pickOf(o, k) ? pickOf(o, k) === 'ls'
  : ['software', 'links'].includes(k) ? (s.policy || {})[k] !== false : !!(s.policy || {})[k]);

/* What each source says of a field, kept beside the value so a person can see them side by side and pick one:
   o.vals[k][src] = [value, as of], where "as of" is the source's own time for it (Lansweeper's last scan, Intune's last
   check-in, the last AD logon). A source that says nothing of the field any more is dropped from it. */
export const PICK_SOURCES = ['ls', 'graph', 'ad', 'hand'];
export function noteValue(o, k, src, value, asOf = '') {
  const v = String(value ?? '').trim();
  if (!v) {
    if (o.vals && o.vals[k] && src in o.vals[k]) { delete o.vals[k][src]; if (!Object.keys(o.vals[k]).length) delete o.vals[k]; if (!Object.keys(o.vals).length) delete o.vals; }
    return;
  }
  ((o.vals ??= {})[k] ??= {})[src] = [v.slice(0, 1000), String(asOf || '').slice(0, 40)];
}
/* The source a person picked for field k of o ('ls', 'graph', 'ad' or 'hand'), or none: then the order above decides.
   'hand' is a value set (or cleared) by hand that no sync touches; it also holds for the lists (software, links) and the
   type, which the type rules then leave alone. */
export const pickOf = (o, k) => (o.pick && o.pick[k]) || '';
/* Before the picker, a device kept such choices in o.ovr: false for "kept by hand", true for "Lansweeper fills it in" (only
   telling where the policy said otherwise). They become picks, and o.ovr goes. Returns true when o changed. */
export function liftOvr(o, policy = {}) {
  if (!o || typeof o !== 'object' || !('ovr' in o)) return false;
  const ovr = o.ovr && typeof o.ovr === 'object' && !Array.isArray(o.ovr) ? o.ovr : {};
  for (const [k, v] of Object.entries(ovr)) {
    if (typeof v !== 'boolean' || (o.pick && o.pick[k])) continue;
    const listDefault = ['software', 'links'].includes(k) ? policy[k] !== false : !!policy[k];
    if (v === false) (o.pick ??= {})[k] = 'hand';
    else if (!listDefault) (o.pick ??= {})[k] = 'ls';
  }
  delete o.ovr;
  return true;
}

/* Notes where field k's value came from: 'hand', 'ls' (Lansweeper), 'graph' or 'ad'. */
export function markSource(o, k, src) { (o.src ??= {})[k] = src; }
/* A field left empty is nobody's. */
export function dropFill(o, k) {
  if (!o.src || !(k in o.src)) return;
  delete o.src[k];
  if (!Object.keys(o.src).length) delete o.src;
}

/* What a person's card says of them, from the directory or Entra: job title, phones, office, manager and e-mail. Only
   the fields that have something, each cut to 200 characters. */
export const PROFILE_FIELDS = ['title', 'phone', 'mobile', 'office', 'manager', 'mail'];
export const profileFields = f => Object.fromEntries(PROFILE_FIELDS.map(k => [k, String(f[k] ?? '').trim().slice(0, 200)]).filter(([, v]) => v));

/* Location texts from the sources (AD's location, Lansweeper's building and location, a user's office) and the rooms
   here: the room a text names, or the room it is mapped to in Settings → Locations (s.locMap; s.adLocMap before 0.9.65).
   A text that names no room gives none: free text never makes a location. */
const lowText = v => String(v || '').trim().toLowerCase();
export function mappedRoom(s, text) {
  const t = lowText(text); if (!t) return '';
  const locs = s.locs || [];
  const map = { ...(s.adLocMap || {}), ...(s.locMap || {}) };
  const mapped = Object.entries(map).find(([k]) => lowText(k) === t);
  return locs.find(l => lowText(l) === t) || (mapped && locs.includes(mapped[1]) ? mapped[1] : '');
}
/* With "Use the office of the device's user" on (Settings → Locations), a device without a location gets the room its
   user's office (from AD or Entra) names or is mapped to. A location picked or set by hand is never touched. Returns how
   many devices got one. */
export function officeLocations(s, at) {
  if (!s.locFromOffice) return 0;
  const people = new Map((s.users || []).map(u => [u.id, u]));
  let n = 0;
  for (const o of s.objs || []) {
    if (o.loc || o.status === 'retired' || o.excluded || o.detached || !o.uid) continue;
    const u = people.get(o.uid), office = u && u.profile && u.profile.office;
    /* Noted as the source the office came from: AD, or Entra (Intune's place in the order). */
    const src = u && u.profile && u.profile.from === 'entra' ? 'graph' : 'ad';
    if (pickOf(o, 'loc') && pickOf(o, 'loc') !== src) continue;
    const room = office && mappedRoom(s, office);
    if (!room) continue;
    o.loc = room; markSource(o, 'loc', src);
    ((s.history ??= {})[o.id] ??= []).unshift({ t: at, msg: `Location set to ${room} from the office of ${u.name} (${office})` });
    n++;
  }
  return n;
}
/* A price as Lansweeper or a person writes it: 1'234.50, 1.234,50, 1234,50 or CHF 980.-; null when it is no amount. */
export function priceOf(v) {
  let t = String(v ?? '').replace(/[^\d.,-]/g, '').replace(/-+$/, '');
  if (!t) return null;
  const dot = t.lastIndexOf('.'), comma = t.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) t = dot > comma ? t.replace(/,/g, '') : t.replace(/\./g, '').replace(',', '.');
  else if (comma >= 0) t = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if ((t.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 1e9 ? Math.round(n * 100) / 100 : null;
}
