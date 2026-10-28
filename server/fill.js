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
  if (o.ovr && o.ovr[k] === false) return false;     /* set or cleared by hand: never filled */
  const had = o.src && o.src[k];
  if (o[k] && !(RANK[had] && RANK[had] <= RANK[src])) return false;
  if (s && s.history && o.id) {
    const msg = o[k] ? `${FILL_SOURCES[src]}: ${label} changed from ${o[k]} to ${v}` : `${FILL_SOURCES[src]}: ${label} filled in: ${v}`;
    (s.history[o.id] ??= []).unshift({ t: at, msg });
  }
  o[k] = v;
  (o.src ??= {})[k] = src;
  return true;
}

/* Whether Lansweeper fills field k of device o in: the device is linked to it and the policy (or the device's own tick) lets it. */
export const lsOwns = (s, o, k) => !!o.feed && s.feedOn !== false && (o.ovr && k in o.ovr ? o.ovr[k] !== false : !!(s.policy || {})[k]);

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
