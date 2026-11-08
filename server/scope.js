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
/* Whether a plan (by its site) is one the scope sc lets a viewer see. */
export const planInScope = (plan, sc) => !sc || (!sc.own && !!plan && sc.sites.includes(plan.site));
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
  /* Floor plans: those of the sites they see (a plan names its site); none for someone who sees only their own devices. */
  if (Array.isArray(s.plans)) s.plans = sc.own ? [] : s.plans.filter(p => p && sc.sites.includes(p.site));
  /* Inventory checks of their sites, and those of the whole inventory with what they found cut to the devices they
     see: no names of other sites' devices, and none of the scanned texts no device matched (serial numbers). */
  const cut = t => {
    if (!t || t.scope) return t;
    const c = { ...t };
    if (Array.isArray(c.unknown)) c.unknown = [];
    if (c.result) c.result = { ...c.result, missing: (c.result.missing || []).filter(m => m && ids.has(m.id)), moved: (c.result.moved || []).filter(m => m && ids.has(m.id)), unknown: [] };
    return c;
  };
  s.stocktakes = sc.own ? [] : (s.stocktakes || []).filter(t => !t.scope || sc.sites.includes(String(t.scope).split(' / ')[0])).map(cut);
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
  /* The revisions of what was sent only: the ids of other sites' devices, links and histories say how many there are. */
  if (s.revs && typeof s.revs === 'object') {
    const relIds = new Set(s.rels.map(r => String(r.id)));
    s.revs = Object.fromEntries(Object.entries(s.revs).filter(([k]) => {
      const i = k.indexOf('|'), kind = k.slice(0, i), id = k.slice(i + 1);
      return kind === 'object' ? ids.has(id) : kind === 'history' ? ids.has(id) : kind === 'rel' ? relIds.has(id) : true;
    }));
  }
  return s;
}
