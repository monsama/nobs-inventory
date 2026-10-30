/* What a settings change changed, for the log: each changed value by its path, before and after, or the items added to
   and removed from a list (by their names). Passwords, tokens and keys are never written, only that they changed;
   pictures are named, not stored. At most 40 lines per setting, each value cut to 160 characters. */
const SECRET = /pass(word)?|secret|token|private|apikey|credential/i;
const MAX = 40;
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const short = v => {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'string' && /^data:image\//.test(v)) return '(picture)';
  const t = typeof v === 'string' ? v : JSON.stringify(v);
  return t.length > 160 ? t.slice(0, 159) + '…' : t;
};
/* An item of a list by what names it: a contact, location, subnet, rule… */
const label = x => isObj(x) ? String(x.name || x.title || x.label || x.cidr || x.login || x.id || short(x)) : short(x);

export function settingDiff(before, after, path = '', out = []) {
  if (out.length >= MAX || JSON.stringify(before) === JSON.stringify(after)) return out;
  const last = path.split('.').pop();
  if (SECRET.test(last)) { out.push({ path, before: '(hidden)', after: '(hidden)' }); return out; }
  if ((isObj(before) || before == null) && (isObj(after) || after == null) && (isObj(before) || isObj(after))) {
    for (const k of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) settingDiff((before || {})[k], (after || {})[k], path ? `${path}.${k}` : k, out);
    return out;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const keyed = list => new Map(list.map(x => [JSON.stringify(x), x]));
    const b = keyed(before), a = keyed(after);
    const added = [...a.keys()].filter(k => !b.has(k)).map(k => label(a.get(k)));
    const removed = [...b.keys()].filter(k => !a.has(k)).map(k => label(b.get(k)));
    /* An item edited in place is removed and added under the same name: it is changed. */
    const changed = added.filter(n => removed.includes(n));
    const entry = { path };
    if (changed.length) entry.changed = changed.slice(0, 20);
    if (added.length > changed.length) entry.added = added.filter(n => !changed.includes(n)).slice(0, 20);
    if (removed.length > changed.length) entry.removed = removed.filter(n => !changed.includes(n)).slice(0, 20);
    if (Object.keys(entry).length === 1) { entry.before = short(before); entry.after = short(after); }   /* only the order changed */
    out.push(entry);
    return out;
  }
  out.push({ path, before: short(before), after: short(after) });
  return out;
}
