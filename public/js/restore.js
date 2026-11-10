/* Undoing one change from a history instead of restoring a whole backup: which entries can be set back, and the patch
   that does it. A device field edited on its page is noted with the field and both values (fieldNote); a settings
   change in the log keeps its old value beside the shown one (server/audit-diff.js). Shared by the page and the
   server. No DOM. */

/* Fields that are not a plain value: the user (a hand-out), the type and port counts (they change the page and the
   connections). Their changes are noted but not restorable. */
export const NO_RESTORE = ['user', 'type', 'ports', 'sfp', 'units'];
/* The longest value kept in a history entry or the log to be set back; a longer one is not restorable. */
export const RESTORE_MAX = 500;
const empty = v => v === undefined || v === null || v === '';
const same = (a, b) => (empty(a) && empty(b)) || JSON.stringify(a) === JSON.stringify(b);

/* A device's field: k, or custom.<key> for a field of its type. */
export const fieldValue = (o, k) => k.startsWith('custom.') ? (o.custom || {})[k.slice(7)] : o[k];
/* The extra a history entry of a field edit carries: the field, and the values before and after (left out when empty). */
export function fieldNote(k, from, to) {
  const fit = v => !empty(v) && (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= RESTORE_MAX));
  /* A value too long (or not a plain value) is not kept: the entry is then noted as cut, and is not restorable. */
  const cut = [from, to].some(v => !empty(v) && !fit(v));
  return { f: k, ...(fit(from) ? { from } : {}), ...(fit(to) ? { to } : {}), ...(cut ? { cut: true } : {}) };
}
/* The history line of a field edit, values as shown on the page. */
export const editText = (label, a, b) => empty(a) ? `${label} set to ${b}` : empty(b) ? `${label} cleared (was ${a})` : `${label} changed from ${a} to ${b}`;
/* Whether history entry h of device o can be set back, and how: { k, value, current, changedSince }, else null.
   owned(k) says a sync writes the field now (it would set it again): those get no Restore. */
/** @param {(k: string) => boolean} [owned] */
export function fieldRestore(h, o, owned = () => false) {
  if (!h || typeof h.f !== 'string' || !h.f || h.cut || NO_RESTORE.includes(h.f)) return null;
  /* from or to left out: the field was empty then. */
  const k = h.f, value = h.from, current = fieldValue(o, k);
  if (k.startsWith('custom.') ? !k.slice(7) : !/^[a-z][a-zA-Z0-9]*$/.test(k)) return null;
  /* Retiring has its checklist, and bringing a device back is a choice of its own. */
  if (k === 'status' && (value === 'retired' || current === 'retired' || empty(value))) return null;
  if (k === 'name' && empty(value)) return null;
  if (owned(k)) return null;
  if (same(current, value)) return null;
  return { k, value, current, changedSince: !same(current, h.to) };
}
/* The fields the restore writes: { k: value }, a custom field within custom; undefined means the field is emptied. */
export function fieldPatch(o, k, value) {
  if (!k.startsWith('custom.')) return { [k]: empty(value) ? undefined : value };
  const custom = { ...(o.custom || {}) };
  if (empty(value)) delete custom[k.slice(7)]; else custom[k.slice(7)] = value;
  return { custom };
}
export function applyPatch(o, patch) {
  for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete o[k]; else o[k] = v; }
  return o;
}

/* ---------- settings (the log) ---------- */
/* Settings never set back from the log: where the map's boxes are (a preference, not logged), and those the server
   keeps for itself. A key that names a secret is never kept with its value in the first place. */
export const SETTING_NO_RESTORE = ['mapPos'];
export const SECRET_KEY = /pass(word)?|secret|token|private|apikey|credential/i;
/* Keys that would reach the object prototype when walked: never kept for a restore, never set back. */
const PROTO_KEY = k => k === '__proto__' || k === 'constructor' || k === 'prototype';
const prim = v => v === undefined || v === null || ['string', 'number', 'boolean'].includes(typeof v);
/* What the log keeps to set a changed value back: the path as keys, and the values before and after when they are plain
   values (left out when unset). null when it cannot be kept whole: a list, an object, a picture, a long text, a secret. */
export function rawOf(keys, before, after) {
  if (keys.some(k => SECRET_KEY.test(k) || PROTO_KEY(k)) || !prim(before) || !prim(after)) return null;
  if ([before, after].some(v => typeof v === 'string' && (v.length > RESTORE_MAX || /^data:/.test(v)))) return null;
  return { keys, ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}) };
}
/* Whether change c of a logged settings change (detail { setting, changes }) can be set back: { keys, value, unset }. */
export function settingRestore(setting, c, pageSettings = null) {
  if (typeof setting !== 'string' || SETTING_NO_RESTORE.includes(setting) || (pageSettings && !pageSettings.includes(setting))) return null;
  const raw = c && c.raw;
  if (!raw || !Array.isArray(raw.keys) || raw.keys.some(k => typeof k !== 'string' || SECRET_KEY.test(k) || PROTO_KEY(k))) return null;
  if (c.before === '(hidden)' || !prim(raw.before) || !prim(raw.after)) return null;
  /* The whole setting unset before: setting it back would delete it, which a restore does not do. */
  if (!raw.keys.length && !('before' in raw)) return null;
  return { keys: raw.keys, value: raw.before, unset: !('before' in raw), after: raw.after };
}
export const valueAt = (v, keys) => keys.reduce((x, k) => (x && typeof x === 'object' && !Array.isArray(x) && Object.hasOwn(x, k) ? x[k] : undefined), v);
/* The setting with the value at keys set back (a copy; the objects on the way are made where missing). */
export function settingPatch(current, r) {
  if (!r.keys.length) return r.value;
  if (r.keys.some(PROTO_KEY)) return undefined;
  const out = current && typeof current === 'object' && !Array.isArray(current) ? structuredClone(current) : {};
  let x = out;
  for (const k of r.keys.slice(0, -1)) { if (!Object.hasOwn(x, k) || !x[k] || typeof x[k] !== 'object' || Array.isArray(x[k])) x[k] = {}; x = x[k]; }
  const last = r.keys.at(-1);
  if (r.unset) delete x[last]; else x[last] = r.value;
  return out;
}
/* Changed since the logged change: the value now is not the one it was changed to. */
export const settingChangedSince = (current, r) => !same(valueAt(current, r.keys), r.after);
