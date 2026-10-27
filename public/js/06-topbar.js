import { $, st } from './01-core.js';
import { newObjModal, linkObjModal } from './05-new-object.js';
import { me, openSettings } from './04-settings.js';
import { accountModal, loginModal, signOut, view } from './07-render-plans.js';
import { openObj } from './02-views.js';
/* ---------- top bar ---------- */
/* A type or room picked in the sidebar is the one the new object starts with. */
$('#linkBtn').onclick = () => linkObjModal();
$('#newBtn').onclick = () => newObjModal({type: st.type || null, loc: st.loc && st.loc.includes(' / ') ? st.loc : null});
$('#whoBtn').onclick = () => (me() ? accountModal() : loginModal());
$('#signOutBtn').onclick = () => signOut();
$('#setBtn').onclick = openSettings;
$('#themeBtn').onclick = () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('ni-theme', root.dataset.theme); } catch { /* Browser storage can be blocked (a private window): then the choice is simply not kept. */ }
};
$('#search').addEventListener('input', e => { st.q = e.target.value; if (!['cards','table','map'].includes(st.tab)) st.tab = 'cards'; view(); });
/* A link inside a row or card (a device's web interface) opens itself, not the device. */
document.addEventListener('click', e => { const t = e.target.closest('[data-open]'); if (t && !e.target.closest('[data-close]') && !e.target.closest('a[href]')) openObj(t.dataset.open); });

/* ---------- tables: columns can be resized and moved ----------
   The order and widths of each table are kept by its place (tab and position), in the browser. */
export let TBL = {};
const COL_DRAG = 'application/x-ni-column';
try { TBL = JSON.parse(localStorage.getItem('ni-cols') || '{}'); } catch { TBL = {}; }
export const saveTBL = () => { try { localStorage.setItem('ni-cols', JSON.stringify(TBL)); } catch { /* Browser storage can be blocked (a private window): then the choice is simply not kept. */ } };
/* On an object's page the tab is the object's id, so each object opened keeps its own entry; they are small, and a
   table that has other columns now starts over from its default order (applyTable). */
/* A table that sorts and filters its data before drawing (data-data) is drawn again when a column is sorted or
   filtered, so the sort and the filter see every row, also those not drawn. focusFilter: the filter box to put the
   cursor back in. */
function redrawFromData(t, focusFilter = null, focusHeader = null){
  if (!t.dataset.data) return false;
  view();
  /* The new table gets its filter row now, not when the page notices it, so the cursor can go back into its box. */
  document.querySelectorAll('table.grid').forEach(setupTable);
  /* Found by the column it filters, not by its place: moved columns put the boxes in another order. */
  if (focusFilter !== null){ const box = document.querySelector(`table.grid tr.fr input[data-fci="${focusFilter}"]`); if (box){ box.focus(); box.setSelectionRange(box.value.length, box.value.length); } }
  else if (focusHeader !== null){ const th = document.querySelector(`table.grid thead tr:first-child th[data-ci="${focusHeader}"]`); if (th) th.focus(); }
  return true;
}
export function tableKey(t){
  const scope = t.closest('#mdl') || $('#view');
  return (t.closest('#mdl') ? 'modal' : 'view') + ':' + st.tab + ':' + [...scope.querySelectorAll('table.grid')].indexOf(t);
}
export function applyTable(t){
  const s = TBL[tableKey(t)]; const head = t.tHead && t.tHead.rows[0];
  if (!s || !head) return;
  /* A kept order that is not every column once (a damaged entry, or a table that has other columns now) starts over. */
  const n = head.cells.length;
  if (!Array.isArray(s.order) || s.order.length !== n || new Set(s.order).size !== n || !s.order.every(i => Number.isInteger(i) && i >= 0 && i < n)) s.order = [...Array(n).keys()];
  if (!s.widths || typeof s.widths !== 'object') s.widths = {};
  /* Cells are moved only when the columns are in another order than drawn: moving every cell of thousands of rows costs. */
  if (s.order.some((c, i) => c !== i)) [...t.rows].forEach(r => { const cells = r._orig; if (cells && cells.length === s.order.length) s.order.forEach(i => r.appendChild(cells[i])); });
  /* A column is as wide as it was dragged to, or as its default (data-w). When every column has a width, the table is
     exactly as wide as its columns, so the box around it scrolls sideways instead of squeezing them. */
  const ws = [...head.cells].map(th => s.widths[th.dataset.ci] || +th.dataset.w || 0);
  const all = ws.every(Boolean);
  t.style.tableLayout = all || Object.keys(s.widths).length ? 'fixed' : '';
  [...head.cells].forEach((th, i) => { th.style.width = ws[i] ? ws[i] + 'px' : ''; });
  t.style.width = all ? ws.reduce((a, b) => a + b, 0) + 'px' : '';
  t.style.minWidth = all ? '100%' : '';
  /* Columns marked to stay (selection, code, name) stay on the left while the table scrolls, as long as they come first. */
  let left = 0, pinned = 0;
  for (const th of head.cells){ if (!th.dataset.pin || !th.style.width) break; t.style.setProperty('--pin' + pinned, left + 'px'); left += parseFloat(th.style.width); pinned++; }
  t.dataset.pinned = pinned;
  applyView(t);
}
/* Sorting and filtering on the rows, after the columns are in their order. Numbers and dates sort by value. */
export const dateKey = v => { const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})(?: (\d{2}):(\d{2}))?/); return m ? Number(m[3] + m[2] + m[1] + (m[4] || '00') + (m[5] || '00')) : null; };
export const numKey = v => /^-?\d+([.,]\d+)?$/.test(v) ? parseFloat(v.replace(',', '.')) : null;
export function cmpCells(x, y){
  const dx = dateKey(x), dy = dateKey(y); if (dx !== null && dy !== null) return dx - dy;
  const nx = numKey(x), ny = numKey(y); if (nx !== null && ny !== null) return nx - ny;
  return x.localeCompare(y, 'de', {numeric: true});
}
export function applyView(t){
  const s = TBL[tableKey(t)], head = t.tHead && t.tHead.rows[0];
  if (!s || !head) return;
  const heads = [...head.cells];
  const ciAt = heads.map(th => +th.dataset.ci);                 // visual position -> original column
  heads.forEach(th => th.dataset.sort = s.sort && +th.dataset.ci === s.sort.ci ? (s.sort.dir > 0 ? 'asc' : 'desc') : '');
  /* The sort is announced too, not only drawn. */
  heads.forEach(th => { if (th.dataset.sort) th.setAttribute('aria-sort', th.dataset.sort === 'asc' ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort'); });
  /* A table drawn already sorted and filtered (data-data: the device table) is left as drawn. */
  if (t.dataset.data) return;
  const rows = [...t.tBodies].flatMap(tb => [...tb.rows]);
  const at = (row, ci) => { const c = row.cells[ciAt.indexOf(ci)]; return c ? c.textContent.trim() : ''; };
  const filters = Object.entries(s.filters).filter(([, q]) => q);
  rows.forEach(r => { r.style.display = filters.every(([ci, q]) => at(r, +ci).toLowerCase().includes(q.toLowerCase())) ? '' : 'none'; });
  if (s.sort){
    rows.sort((a, b) => s.sort.dir * cmpCells(at(a, s.sort.ci), at(b, s.sort.ci)));
    const tb = t.tBodies[0]; if (tb) rows.forEach(r => tb.appendChild(r));
  }
}
export function resizeStart(e, t, th){
  e.preventDefault(); e.stopPropagation();
  const s = TBL[tableKey(t)], x0 = e.clientX, w0 = th.getBoundingClientRect().width;
  const move = ev => { th.style.width = Math.max(40, w0 + ev.clientX - x0) + 'px'; t.style.tableLayout = 'fixed'; };
  const up = () => {
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
    s.widths[th.dataset.ci] = Math.round(th.getBoundingClientRect().width); saveTBL(); applyTable(t);
  };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
}
export function setupTable(t){
  const head = t.tHead && t.tHead.rows[0];
  if (!head || t.dataset.tb) return;
  t.dataset.tb = '1';
  const key = tableKey(t);
  const n = head.cells.length;
  const s = TBL[key] || (TBL[key] = {order: null, widths: {}, filters: {}, sort: null});
  s.filters ??= {}; s.sort ??= null;
  if (!s.order || s.order.length !== n) s.order = [...Array(n).keys()];
  [...head.cells].forEach((th, i) => th.dataset.ci = i);
  /* A filter box under each header, on the big tables only. */
  if (!t.classList.contains('mini')){
    const fr = document.createElement('tr'); fr.className = 'fr';
    [...head.cells].forEach((th, i) => {
      const c = document.createElement('th');
      if (th.querySelector('input')){ fr.appendChild(c); return; }   /* the select-all column has nothing to filter */
      const inp = document.createElement('input');
      inp.placeholder = 'filter'; inp.dataset.fci = i; inp.value = s.filters[i] || ''; inp.draggable = false; inp.setAttribute('aria-label', 'Filter ' + th.textContent.trim());
      inp.addEventListener('input', () => { const cur = TBL[tableKey(t)]; cur.filters[i] = inp.value; saveTBL(); if (!redrawFromData(t, i)) applyView(t); });
      c.appendChild(inp); fr.appendChild(c);
    });
    head.parentNode.appendChild(fr);
  }
  [...t.rows].forEach(r => r._orig = [...r.cells]);
  [...head.cells].forEach(th => {
    th.draggable = true;
    const rz = document.createElement('span'); rz.className = 'rz'; th.appendChild(rz);
    rz.addEventListener('pointerdown', e => resizeStart(e, t, th));
    /* The column travels under its own type, so a tab or card dropped on a header is not taken for a column. */
    th.addEventListener('dragstart', e => { e.dataTransfer.setData(COL_DRAG, th.dataset.ci); e.dataTransfer.effectAllowed = 'move'; });
    const sortBy = () => {
      const cur = TBL[tableKey(t)], ci = +th.dataset.ci;
      cur.sort = cur.sort && cur.sort.ci === ci ? {ci, dir: -cur.sort.dir} : {ci, dir: 1};
      saveTBL(); if (!redrawFromData(t, null, ci)) applyView(t);
    };
    th.addEventListener('click', e => { if (!e.target.classList.contains('rz')) sortBy(); });
    /* Sorting works from the keyboard too: Tab to a column header, Enter or Space. */
    th.tabIndex = 0;
    th.addEventListener('keydown', e => { if (e.target === th && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); sortBy(); } });
    th.addEventListener('dragover', e => { if (!e.dataTransfer.types.includes(COL_DRAG)) return; e.preventDefault(); th.classList.add('over'); });
    th.addEventListener('dragleave', () => th.classList.remove('over'));
    th.addEventListener('drop', e => {
      e.preventDefault(); th.classList.remove('over');
      const raw = e.dataTransfer.getData(COL_DRAG), from = +raw, to = +th.dataset.ci;
      const s2 = TBL[tableKey(t)];
      if (raw === '' || from === to || !s2) return;
      const fromPos = s2.order.indexOf(from), toPos = s2.order.indexOf(to);
      if (fromPos < 0 || toPos < 0) return;
      s2.order.splice(fromPos, 1);
      const newTo = s2.order.indexOf(to);
      s2.order.splice(fromPos < toPos ? newTo + 1 : newTo, 0, from);
      saveTBL(); applyTable(t);
    });
  });
  applyTable(t);
}
/* Any table drawn later, in the page or in a dialog, gets the same behaviour. Links that only act on a click (no
   address), such as a table row's name, can be reached with Tab and used with Enter. */
const keyboardReach = () => document.querySelectorAll('a.link:not([href]):not([tabindex])').forEach(el => {
  el.tabIndex = 0;
  if (el.tagName === 'A') el.setAttribute('role', 'link');
});
new MutationObserver(() => { document.querySelectorAll('table.grid').forEach(setupTable); keyboardReach(); }).observe(document.body, {childList: true, subtree: true});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.defaultPrevented) return;
  const el = e.target;
  if (el.matches && el.matches('a.link:not([href])')){ e.preventDefault(); el.click(); }
});

