/* What a sync changed on the devices' fields, for Settings → Data sources: per field, how many devices it changed and
   how many it filled in, and which (up to 500), so "Lansweeper changed IP address on 14 devices" links to them. Read from
   the history lines the sync wrote ("Lansweeper: IP address changed from … to …", "Intune: Model filled in: …"). */
const PREFIX = { ls: 'Lansweeper', graph: 'Intune', ad: 'Active Directory' };
export const historyLens = s => new Map(Object.entries(s.history || {}).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]));
export function noteChanges(s, src, lens, now = new Date()) {
  const re = new RegExp(`^${PREFIX[src]}: (.+?) (changed from |filled in: )`);
  const changed = {}, filled = {}, ids = new Set();
  for (const [id, list] of Object.entries(s.history || {})) {
    const fresh = (list || []).length - (lens.get(id) || 0);
    for (const h of (list || []).slice(0, Math.max(0, fresh))) {
      const m = re.exec((h && h.msg) || ''); if (!m) continue;
      const to = m[2].startsWith('changed') ? changed : filled;
      to[m[1]] = (to[m[1]] || 0) + 1; ids.add(id);
    }
  }
  /* A push comes in batches: what the batches of one run (within ten minutes) changed is added up. */
  const prev = (s.syncChanges || {})[src];
  if (prev && now - Date.parse(prev.at) < 600000 && Date.parse(prev.at) <= now) {
    for (const [k, n] of Object.entries(prev.changed || {})) changed[k] = (changed[k] || 0) + n;
    for (const [k, n] of Object.entries(prev.filled || {})) filled[k] = (filled[k] || 0) + n;
    for (const id of prev.ids || []) ids.add(id);
  }
  if (!ids.size && prev && now - Date.parse(prev.at) < 600000) return;
  s.syncChanges = { ...(s.syncChanges || {}), [src]: { at: now.toISOString(), changed, filled, ids: [...ids].slice(0, 500), n: ids.size } };
}
