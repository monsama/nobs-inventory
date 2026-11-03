/* What a viewer may see (Settings → Users): everything, only the devices of some sites (by the first part of the
   location), or only their own devices ("my devices": the ones they are the user of). Admins see everything. Applied by
   the server to what it sends (devices, their links, history, photos, reports, labels), so the rest never reaches them. */
export const siteOf = o => String((o && o.loc) || '').split(' / ')[0];
export function scopeOf(u) {
  if (!u || u.role === 'admin') return null;
  if (u.own) return { own: u.id };
  return Array.isArray(u.sites) && u.sites.length ? { sites: u.sites } : null;
}
export const inScope = (o, sc) => !sc || (sc.own ? !!o && o.uid === sc.own && !o.review : sc.sites.includes(siteOf(o)));
export const scopeKey = sc => (!sc ? '' : sc.own ? 'own' : 'sites:' + sc.sites.join('|'));
/* Cuts an inventory down to what the scope sc (from scopeOf) lets a viewer see: changes s in place and returns it; no
   scope leaves it whole. Someone who sees only their own devices also gets no contracts or licences, and of the people
   only themselves and the admins. */
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
