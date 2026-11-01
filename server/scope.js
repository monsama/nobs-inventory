/* What a viewer or an editor may see (Settings → Users): everything, only the devices of some sites (by the first part
   of the location), or (a viewer) only their own devices ("my devices": the ones they are the user of). Admins see
   everything. An editor changes what they see, and only that (editorProblem). Applied by
   the server to what it sends (devices, their links, history, photos, reports, labels), so the rest never reaches them. */
export const siteOf = o => String((o && o.loc) || '').split(' / ')[0];
export function scopeOf(u) {
  if (!u || u.role === 'admin') return null;
  if (u.own && u.role !== 'editor') return { own: u.id };
  return Array.isArray(u.sites) && u.sites.length ? { sites: u.sites } : null;
}
export const inScope = (o, sc) => !sc || (sc.own ? !!o && o.uid === sc.own && !o.review : sc.sites.includes(siteOf(o)));
export const scopeKey = sc => (!sc ? '' : sc.own ? 'own' : 'sites:' + sc.sites.join('|'));
export function scopeState(s, sc) {
  if (!sc) return s;
  s.objs = (s.objs || []).filter(o => inScope(o, sc));
  const ids = new Set(s.objs.map(o => o.id));
  s.rels = (s.rels || []).filter(r => ids.has(r.from) && ids.has(r.to));
  s.history = Object.fromEntries(Object.entries(s.history || {}).filter(([k]) => ids.has(k)));
  s.stocktakes = sc.own ? [] : (s.stocktakes || []).filter(t => !t.scope || sc.sites.includes(String(t.scope).split(' / ')[0]));
  if (sc.own) { s.contracts = []; s.licences = []; s.users = (s.users || []).filter(u => u.id === sc.own || u.role === 'admin'); }
  /* The devices a sync found twice, and what each sync changed: only about the devices they see (names and serial
     numbers of other sites' devices are in them). */
  if (Array.isArray(s.graphAmbiguous)) s.graphAmbiguous = sc.own ? [] : s.graphAmbiguous.filter(a => (a.devices || []).length && a.devices.every(id => ids.has(id)));
  if (s.syncChanges && typeof s.syncChanges === 'object') {
    const keep = run => ({ ...run, ids: (run.ids || []).filter(id => ids.has(id)) });
    s.syncChanges = sc.own ? {} : Object.fromEntries(Object.entries(s.syncChanges).map(([k, c]) => {
      const run = keep(c); run.n = run.ids.length;
      if (Array.isArray(c.earlier)) run.earlier = c.earlier.map(keep).map(e => ({ ...e, n: e.ids.length }));
      return [k, run];
    }));
  }
  return s;
}

/* Whether an editor's save (POST /api/changes) stays within what they may change: devices, their connections and their
   history, in their sites when limited to some (before and after the change); new rooms in those sites; the stocktakes
   of those sites. Never people, types or other settings. '' when it does, else what does not. s: the stored inventory. */
const EDITOR_SETTINGS = ['locs', 'stocktakes'];
export function editorProblem(body, s, sc) {
  const puts = (body && body.puts) || [], dels = (body && body.dels) || [];
  const objs = new Map((s.objs || []).map(o => [o.id, o]));
  const next = new Map(objs);
  for (const c of dels) if (c && c.kind === 'object') next.delete(c.id);
  for (const c of puts) if (c && c.kind === 'object' && c.value) next.set(c.id, c.value);
  const ok = o => !o || inScope(o, sc);
  const site = loc => !sc || sc.sites.includes(String(loc).split(' / ')[0]);
  for (const c of [...puts, ...dels]) {
    if (!c || typeof c !== 'object') continue;
    const isDel = !puts.includes(c);
    if (c.kind === 'object') {
      if (!ok(objs.get(c.id)) || (!isDel && !inScope(c.value || {}, sc))) return `${(c.value && c.value.name) || (objs.get(c.id) || {}).name || 'A device'} is not in a site you may change.`;
    } else if (c.kind === 'rel') {
      const old = (s.rels || []).find(r => String(r.id) === c.id), v = isDel ? null : c.value || {};
      for (const r of [old, v]) if (r && (!ok(next.get(r.from) || objs.get(r.from)) || !ok(next.get(r.to) || objs.get(r.to)))) return 'A connection to a device outside your sites cannot be changed.';
    } else if (c.kind === 'history') {
      if (!ok(next.get(c.id) || objs.get(c.id))) return 'The history of a device outside your sites cannot be changed.';
    } else if (c.kind === 'setting' && EDITOR_SETTINGS.includes(c.id) && !isDel) {
      if (c.id === 'locs') {
        const before = new Set(s.locs || []), after = Array.isArray(c.value) ? c.value : [];
        if ([...before].some(l => !after.includes(l)) || after.some(l => !before.has(l) && !site(l))) return 'Only an admin can remove rooms, or add them outside your sites.';
      } else {
        const key = t => JSON.stringify(t), before = new Map((s.stocktakes || []).map(t => [t.id, t])), after = Array.isArray(c.value) ? c.value : [];
        const mine = t => !sc || (t && t.scope && site(t.scope));
        const changed = [...after.filter(t => !before.has(t.id) || key(before.get(t.id)) !== key(t)), ...[...before.values()].filter(t => !after.some(x => x.id === t.id))];
        if (changed.some(t => !mine(t) || (before.has(t.id) && !mine(before.get(t.id))))) return 'Only stocktakes of your sites can be started or changed.';
      }
    } else return c.kind === 'user' ? 'Only an admin can add or change people.' : c.kind === 'type' ? 'Only an admin can change object types.' : 'Only an admin can change the settings.';
  }
  return '';
}
