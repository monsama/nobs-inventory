/* Filling a device's empty fields from the directories: Microsoft Graph (Intune) and Active Directory.
   Who wins: a value set by hand, then Lansweeper, then Graph, then AD. Where each value came from is noted in o.src
   (field → 'hand', 'ls', 'graph' or 'ad'), so a stronger source can replace a weaker one and the page can show the
   source beside the field. A directory replaces only another directory's value; one without a note (from before the
   notes) it never replaces. */
export const FILL_SOURCES = { graph: 'Intune', ad: 'Active Directory' };
const RANK = { ad: 1, graph: 2 };

/* Sets o[k] to value from src when the rules allow it. Returns true when the device changed. A first fill and a change
   are written to the history (s.history), as Lansweeper's changes are. */
export function fillField(s, o, k, value, src, at, label = k) {
  const v = String(value ?? '').trim();
  if (!v || o[k] === v) return false;
  /* A source a person picked for this field is the only one that writes it, whatever the order of the others. */
  const pick = pickOf(o, k);
  if (pick && pick !== src) return false;   /* By hand ('hand') included: set or cleared by hand, never filled */
  if (!pick) {
    const had = o.src && o.src[k];
    if (o[k] && !(RANK[had] && RANK[had] <= RANK[src])) return false;
  }
  if (s && s.history && o.id) {
    const msg = o[k] ? `${FILL_SOURCES[src]}: ${label} changed from ${o[k]} to ${v}` : `${FILL_SOURCES[src]}: ${label} filled in: ${v}`;
    (s.history[o.id] ??= []).unshift({ t: at, msg });
  }
  o[k] = v;
  (o.src ??= {})[k] = src;
  return true;
}

/* Whether Lansweeper writes field k of device o: a person picked it for the field, or none was picked and the policy
   (Settings → Lansweeper) lets it. The lists (software, links) are Lansweeper's unless the policy turns them off. */
export const lsWrites = (s, o, k) => s.feedOn !== false && (pickOf(o, k) ? pickOf(o, k) === 'ls'
  : ['software', 'links'].includes(k) ? (s.policy || {})[k] !== false : !!(s.policy || {})[k]);
/* The same, for a device linked to Lansweeper. */
export const lsOwns = (s, o, k) => !!o.feed && lsWrites(s, o, k);

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
