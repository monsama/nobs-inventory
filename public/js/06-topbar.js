/* ---------- top bar ---------- */
$('#newBtn').onclick = () => newObjModal();
$('#whoBtn').onclick = () => (me() ? accountModal() : loginModal());
$('#signOutBtn').onclick = () => signOut();
$('#setBtn').onclick = openSettings;
$('#themeBtn').onclick = () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('ni-theme', root.dataset.theme); } catch { /* Browser storage can be blocked (a private window): then the choice is simply not kept. */ }
};
$('#searchAll').addEventListener('change', e => { st.searchAll = e.target.checked; render(); });
$('#search').addEventListener('input', e => { st.q = e.target.value; if (!['cards','table','map'].includes(st.tab)) st.tab = 'cards'; render(); });
document.addEventListener('click', e => { const t = e.target.closest('[data-open]'); if (t && !e.target.closest('[data-close]')) openObj(t.dataset.open); });

/* ---------- tables: columns can be resized and moved ----------
   The order and widths of each table are kept by its place (tab and position), in the browser. */
let TBL = {};
try { TBL = JSON.parse(localStorage.getItem('ni-cols') || '{}'); } catch { TBL = {}; }
const saveTBL = () => { try { localStorage.setItem('ni-cols', JSON.stringify(TBL)); } catch { /* Browser storage can be blocked (a private window): then the choice is simply not kept. */ } };
function tableKey(t){
  const scope = t.closest('#mdl') || $('#view');
  return (t.closest('#mdl') ? 'modal' : 'view') + ':' + st.tab + ':' + [...scope.querySelectorAll('table.grid')].indexOf(t);
}
function applyTable(t){
  const s = TBL[tableKey(t)]; const head = t.tHead && t.tHead.rows[0];
  if (!s || !head) return;
  [...t.rows].forEach(r => { const cells = r._orig; if (cells && cells.length === s.order.length) s.order.forEach(i => r.appendChild(cells[i])); });
  t.style.tableLayout = Object.keys(s.widths).length ? 'fixed' : '';
  [...head.cells].forEach(th => { const w = s.widths[th.dataset.ci]; th.style.width = w ? w + 'px' : ''; });
  applyView(t);
}
/* Sorting and filtering on the rows, after the columns are in their order. Numbers and dates sort by value. */
const dateKey = v => { const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})(?: (\d{2}):(\d{2}))?/); return m ? Number(m[3] + m[2] + m[1] + (m[4] || '00') + (m[5] || '00')) : null; };
const numKey = v => /^-?\d+([.,]\d+)?$/.test(v) ? parseFloat(v.replace(',', '.')) : null;
function cmpCells(x, y){
  const dx = dateKey(x), dy = dateKey(y); if (dx !== null && dy !== null) return dx - dy;
  const nx = numKey(x), ny = numKey(y); if (nx !== null && ny !== null) return nx - ny;
  return x.localeCompare(y, 'de', {numeric: true});
}
function applyView(t){
  const s = TBL[tableKey(t)], head = t.tHead && t.tHead.rows[0];
  if (!s || !head) return;
  const heads = [...head.cells];
  const ciAt = heads.map(th => +th.dataset.ci);                 // visual position -> original column
  heads.forEach(th => th.dataset.sort = s.sort && +th.dataset.ci === s.sort.ci ? (s.sort.dir > 0 ? 'asc' : 'desc') : '');
  const rows = [...t.tBodies].flatMap(tb => [...tb.rows]);
  const at = (row, ci) => { const c = row.cells[ciAt.indexOf(ci)]; return c ? c.textContent.trim() : ''; };
  const filters = Object.entries(s.filters).filter(([, q]) => q);
  rows.forEach(r => { r.style.display = filters.every(([ci, q]) => at(r, +ci).toLowerCase().includes(q.toLowerCase())) ? '' : 'none'; });
  if (s.sort){
    rows.sort((a, b) => s.sort.dir * cmpCells(at(a, s.sort.ci), at(b, s.sort.ci)));
    const tb = t.tBodies[0]; if (tb) rows.forEach(r => tb.appendChild(r));
  }
}
function resizeStart(e, t, th){
  e.preventDefault(); e.stopPropagation();
  const s = TBL[tableKey(t)], x0 = e.clientX, w0 = th.getBoundingClientRect().width;
  const move = ev => { th.style.width = Math.max(40, w0 + ev.clientX - x0) + 'px'; t.style.tableLayout = 'fixed'; };
  const up = () => {
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
    s.widths[th.dataset.ci] = Math.round(th.getBoundingClientRect().width); saveTBL(); applyTable(t);
  };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
}
function setupTable(t){
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
      inp.placeholder = 'filter'; inp.value = s.filters[i] || ''; inp.draggable = false; inp.setAttribute('aria-label', 'Filter ' + th.textContent.trim());
      inp.addEventListener('input', () => { const cur = TBL[tableKey(t)]; cur.filters[i] = inp.value; saveTBL(); applyView(t); });
      c.appendChild(inp); fr.appendChild(c);
    });
    head.parentNode.appendChild(fr);
  }
  [...t.rows].forEach(r => r._orig = [...r.cells]);
  [...head.cells].forEach(th => {
    th.draggable = true;
    const rz = document.createElement('span'); rz.className = 'rz'; th.appendChild(rz);
    rz.addEventListener('pointerdown', e => resizeStart(e, t, th));
    th.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', th.dataset.ci); e.dataTransfer.effectAllowed = 'move'; });
    th.addEventListener('click', e => {
      if (e.target.classList.contains('rz')) return;
      const cur = TBL[tableKey(t)], ci = +th.dataset.ci;
      cur.sort = cur.sort && cur.sort.ci === ci ? {ci, dir: -cur.sort.dir} : {ci, dir: 1};
      saveTBL(); applyView(t);
    });
    th.addEventListener('dragover', e => { e.preventDefault(); th.classList.add('over'); });
    th.addEventListener('dragleave', () => th.classList.remove('over'));
    th.addEventListener('drop', e => {
      e.preventDefault(); th.classList.remove('over');
      const from = +e.dataTransfer.getData('text/plain'), to = +th.dataset.ci;
      const s2 = TBL[tableKey(t)];
      if (from === to || !s2) return;
      const fromPos = s2.order.indexOf(from), toPos = s2.order.indexOf(to);
      s2.order.splice(fromPos, 1);
      const newTo = s2.order.indexOf(to);
      s2.order.splice(fromPos < toPos ? newTo + 1 : newTo, 0, from);
      saveTBL(); applyTable(t);
    });
  });
  applyTable(t);
}
/* Any table drawn later, in the page or in a dialog, gets the same behaviour. */
new MutationObserver(() => document.querySelectorAll('table.grid').forEach(setupTable)).observe(document.body, {childList: true, subtree: true});

