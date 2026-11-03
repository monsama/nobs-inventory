/* Saved views of the device list: its filters, search, columns, column filters and sort under a name, shared by all
   (setting savedViews). Pure functions, shared by the page, the server (savedViewsProblem) and the tests. */

/* The sidebar filters a view keeps: text (an id or a name) or on/off. Lists made elsewhere (a data-quality check, a
   list from the Overview, To review) are left out: they are not filters one picks again. */
export const VIEW_FILTERS = { type: 's', loc: 's', status: 's', warranty: 's', intune: 's', osFam: 's', resp: 's', person: 's', adGroup: 's', scanOld: 'b', twins: 'b', live: 'b' };
export const VIEW_TABS = ['cards', 'table', 'map'];
export const VIEWS_MAX = 50;
const COLS_MAX = 60, TEXT_MAX = 200, KEY_MAX = 40, NAME_MAX = 80;

/* The table's kept state (filters, widths, sort, order by column position) carried to where its columns are now: keys
   are the shown columns' keys in order (column 0 is the tick box). Changes tv and returns it. */
export function remapTable(tv, keys) {
  if (Array.isArray(tv.keys) && tv.keys.join() !== keys.join()) {
    const to = ci => +ci === 0 ? 0 : keys.indexOf(tv.keys[+ci - 1]) + 1 || null;
    const move = obj => Object.fromEntries(Object.entries(obj || {}).map(([ci, v]) => [to(ci), v]).filter(([ci]) => ci !== null));
    tv.filters = move(tv.filters); tv.widths = move(tv.widths);
    if (tv.sort) tv.sort = to(tv.sort.ci) === null ? null : { ...tv.sort, ci: to(tv.sort.ci) };
    if (Array.isArray(tv.order)) { const kept = tv.order.map(to).filter(ci => ci !== null); tv.order = [...kept, ...keys.map((_, i) => i + 1).filter(ci => !kept.includes(ci))]; }
  }
  tv.keys = keys;
  return tv;
}

/* The view the list shows now. cols: the keys of the columns shown; tv: the table's kept state, whose column order,
   column filters and sort are kept by column key, so they survive columns shown or hidden later. */
export function serializeView(st, { cols = [], tv = null } = {}) {
  const filters = {};
  for (const [k, t] of Object.entries(VIEW_FILTERS)) { const v = st[k]; if (t === 'b' ? v === true : typeof v === 'string' && v) filters[k] = v; }
  const keys = tv && Array.isArray(tv.keys) ? tv.keys : [];
  /* The columns in the order the table shows them (column 0, the tick box, aside). */
  const ord = tv && Array.isArray(tv.order) ? tv.order.filter(ci => ci > 0).map(ci => keys[ci - 1]).filter(k => cols.includes(k)) : [];
  cols = [...new Set([...ord, ...cols])];
  const colFilters = {};
  for (const [ci, q] of Object.entries((tv && tv.filters) || {})) { const k = keys[+ci - 1], t = String(q || '').trim(); if (k && t) colFilters[k] = t; }
  const sc = tv && tv.sort && keys[tv.sort.ci - 1];
  return { tab: VIEW_TABS.includes(st.tab) ? st.tab : 'table', q: String(st.q || '').trim(), filters, cols: [...cols], sort: sc ? { col: sc, dir: tv.sort.dir < 0 ? -1 : 1 } : null, colFilters };
}
/* Whether two views show the same (their names and ids aside). */
const VIEW_PARTS = ['tab', 'q', 'filters', 'cols', 'sort', 'colFilters'];
const sorted = o => Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => a.localeCompare(b)));
const canon = v => JSON.stringify([v.tab, v.q || '', sorted(v.filters), [...(v.cols || [])].sort(), v.sort || null, sorted(v.colFilters)]);
export const sameView = (a, b) => !!a && !!b && canon(a) === canon(b);

/* Puts a view's filters and search on the page state (every filter it does not name is taken off) and its tab. */
export function applyViewFilters(view, st) {
  for (const [k, t] of Object.entries(VIEW_FILTERS)) st[k] = (view.filters || {})[k] ?? (t === 'b' ? false : null);
  st.q = view.q || '';
  if (VIEW_TABS.includes(view.tab)) st.tab = view.tab;
  return st;
}
/* The columns to hide for a view: every one that can be hidden and is not among its columns. */
export const hiddenFor = (view, hideable) => hideable.filter(k => !(view.cols || []).includes(k));
/* The table's kept state for a view: tv (or a new one) carried to the columns now shown (keys), with the view's column
   order, column filters and sort; widths stay as they were. */
export function tableStateFor(view, tv, keys) {
  const t = remapTable(JSON.parse(JSON.stringify(tv || { order: null, widths: {}, filters: {}, sort: null })), keys);
  const pos = k => (view.cols || []).indexOf(k);
  const inView = keys.map((k, i) => [k, i + 1]).filter(([k]) => pos(k) >= 0).sort((a, b) => pos(a[0]) - pos(b[0])).map(([, ci]) => ci);
  t.order = [0, ...inView, ...keys.map((_, i) => i + 1).filter(ci => !inView.includes(ci))];
  t.filters = Object.fromEntries(Object.entries(view.colFilters || {}).map(([k, q]) => [keys.indexOf(k) + 1, q]).filter(([ci]) => ci > 0));
  const si = view.sort ? keys.indexOf(view.sort.col) + 1 : 0;
  t.sort = si ? { ci: si, dir: view.sort.dir } : null;
  return t;
}

/* Saving under a name: a view of that name (any case) is replaced in place, else the view is added at the end. */
export function upsertView(list, view, name, newId) {
  const n = String(name || '').trim(), at = list.findIndex(v => v.name.toLowerCase() === n.toLowerCase());
  const keep = { ...Object.fromEntries(VIEW_PARTS.map(k => [k, view[k]])), name: n };
  return at >= 0 ? list.map((v, i) => i === at ? { ...keep, id: v.id } : v) : [...list, { ...keep, id: newId }];
}
export const renameView = (list, id, name) => list.map(v => v.id === id ? { ...v, name: String(name).trim() } : v);
export const removeView = (list, id) => list.filter(v => v.id !== id);

/* Why a list of saved views cannot be stored, or null. */
export function savedViewsProblem(list) {
  if (list === undefined || list === null) return null;
  if (!Array.isArray(list) || list.length > VIEWS_MAX) return `Saved views are a list of up to ${VIEWS_MAX}.`;
  const str = (v, max) => typeof v === 'string' && v.length <= max;
  const ids = new Set();
  for (const v of list) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return 'A saved view is a record.';
    if (Object.keys(v).some(k => !['id', 'name', ...VIEW_PARTS].includes(k))) return 'A saved view has only a name, filters, a search, columns and a sort.';
    if (!str(v.id, KEY_MAX) || !v.id || ids.has(v.id)) return 'Each saved view has an id of its own.';
    ids.add(v.id);
    if (!str(v.name, NAME_MAX) || !v.name.trim()) return `A saved view has a name of up to ${NAME_MAX} characters.`;
    if (v.tab !== undefined && !VIEW_TABS.includes(v.tab)) return `${v.name}: the view is Cards, Table or Relations.`;
    if (v.q !== undefined && !str(v.q, TEXT_MAX)) return `${v.name}: the search is text of up to ${TEXT_MAX} characters.`;
    const f = v.filters ?? {};
    if (!f || typeof f !== 'object' || Array.isArray(f) || Object.entries(f).some(([k, x]) => !VIEW_FILTERS[k] || (VIEW_FILTERS[k] === 'b' ? typeof x !== 'boolean' : !str(x, TEXT_MAX))))
      return `${v.name}: the filters are the sidebar's.`;
    if (v.cols !== undefined && (!Array.isArray(v.cols) || v.cols.length > COLS_MAX || v.cols.some(c => !str(c, KEY_MAX)))) return `${v.name}: the columns are a list of column names.`;
    if (v.sort !== undefined && v.sort !== null && (typeof v.sort !== 'object' || Array.isArray(v.sort) || !str(v.sort.col, KEY_MAX) || ![1, -1].includes(v.sort.dir) || Object.keys(v.sort).length !== 2))
      return `${v.name}: the sort is a column and a direction.`;
    const cf = v.colFilters ?? {};
    if (!cf || typeof cf !== 'object' || Array.isArray(cf) || Object.keys(cf).length > COLS_MAX || Object.entries(cf).some(([k, x]) => k.length > KEY_MAX || !str(x, TEXT_MAX)))
      return `${v.name}: the column filters are text by column.`;
  }
  return null;
}
