/* Stocktake: which devices were confirmed on site, when and by whom. Shared by the page and the server: what a device's
   confirmation and a stocktake look like, which devices a stocktake covers, and what it found. No DOM. */

/* The devices a stocktake covers: those not retired, at its place (a site, or one room of it; '' is everywhere). */
export const inScope = (o, scope) => !scope || o.loc === scope || String(o.loc || '').startsWith(scope + ' / ');
export const stocktakeDevices = (objs, scope) => objs.filter(o => o.status !== 'retired' && !o.review && inScope(o, scope));
/* Confirmed in this stocktake. */
export const confirmedIn = (o, id) => !!(o.verified && o.verified.st === id);
/* Days since a device was last confirmed on site, or null when it never was. */
export const daysSinceVerified = (o, today = new Date()) => {
  const d = o.verified && /^\d{4}-\d{2}-\d{2}$/.test(o.verified.at) ? Date.parse(o.verified.at + 'T00:00:00Z') : NaN;
  return Number.isFinite(d) ? Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - d) / 864e5) : null;
};
export const STOCKTAKE_DAYS = 365;

/* What a stocktake found, kept with it when it is finished: how many it covered and were confirmed, the ones missing and
   moved (by name, so the list stays readable when a device is renamed or removed later), and what was not known. */
export function stocktakeResult(t, objs) {
  const list = stocktakeDevices(objs, t.scope);
  const all = objs.filter(o => confirmedIn(o, t.id));
  const brief = o => ({ id: o.id, name: o.name || '', code: o.code || '', loc: o.loc || '' });
  return {
    total: new Set([...list, ...all].map(o => o.id)).size, confirmed: all.length,
    missing: list.filter(o => !confirmedIn(o, t.id)).slice(0, 5000).map(brief),
    moved: all.filter(o => o.verified.from !== undefined).slice(0, 5000).map(o => ({ ...brief(o), from: o.verified.from || '' })),
    unknown: (t.unknown || []).slice(0, 1000).map(u => u.text),
  };
}

/* What may be saved: a device's confirmation, and the list of stocktakes. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const text = (v, n) => typeof v === 'string' && v.length <= n;
export function verifiedProblem(v) {
  if (v === undefined) return '';
  const one = x => !!x && typeof x === 'object' && !Array.isArray(x) && DAY.test(x.at || '') && text(x.by ?? '', 120) && text(x.st ?? '', 40) && text(x.from ?? '', 200);
  if (!one(v) || (v.prev !== undefined && (!one(v.prev) || v.prev.prev !== undefined))) return 'The confirmation on site has a day, who confirmed it and, from a stocktake, which one.';
  return '';
}
export function stocktakesProblem(list) {
  if (list === undefined) return '';
  if (!Array.isArray(list) || list.length > 50) return 'The stocktakes are a list of up to 50.';
  if (new Set(list.map(t => t && t.id)).size !== list.length) return 'Each stocktake has its own id.';
  const item = m => !!m && typeof m === 'object' && ['id', 'name', 'code', 'loc', 'from'].every(k => m[k] === undefined || text(m[k], 200));
  for (const t of list) {
    if (!t || typeof t !== 'object' || !text(t.id, 40) || !t.id || !text(t.name, 120) || !t.name.trim() || !text(t.scope ?? '', 200) || !text(t.started, 40) || !text(t.by ?? '', 120)) return 'A stocktake has an id, a name, a place and when it started.';
    if (t.unknown !== undefined && (!Array.isArray(t.unknown) || t.unknown.length > 1000 || t.unknown.some(u => !u || !text(u.text, 200) || !text(u.at ?? '', 40)))) return 'A stocktake keeps up to 1000 things scanned that were not known.';
    if (t.finished !== undefined && !text(t.finished, 40)) return 'A stocktake is finished on a day.';
    const r = t.result;
    if (r !== undefined && (!r || typeof r !== 'object' || !Number.isFinite(r.total) || !Number.isFinite(r.confirmed) || !Array.isArray(r.missing) || r.missing.length > 5000 || !Array.isArray(r.moved) || r.moved.length > 5000 || !Array.isArray(r.unknown) || r.unknown.length > 1000
      || !r.missing.every(item) || !r.moved.every(item) || !r.unknown.every(u => text(u, 200)))) return 'A finished stocktake keeps what it found.';
  }
  return '';
}
