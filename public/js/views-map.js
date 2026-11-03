/* The relations map: layout, drawing, zoom and the toolbar (split out of 02-views.js, which re-exports it). */
import { isAttached, $, menuHtml, STATUS, TYPES, byId, filtered, objs, portLabel, rels, st, tcol, tico, toast, used } from './01-core.js';
import { queueServerSave, render, view } from './07-render.js';
import { isAdmin } from './04-settings.js';
import { bindHiddenHits, hiddenHits, openObj } from './02-views.js';
import { html, rawHtml } from './html.js';
/* ---------- relationship map ----------
   Like the ER diagram in NOBS SQL: boxes with a header, right-angled lines between them, the line's kind and port
   written on it. Hover a box to light up its lines. Drag a box to move it, drag the background to pan, Ctrl + wheel to zoom. */
export const MAP = {zoom:1, px:24, py:24, drag:null, L:null, found:null};
export const MAP_W = 200, MAP_STEP = 340;
/* A text inside a box is cut to the box's width, with an ellipsis; the full text is the tooltip. */
const fitMap = (t, px) => {
  const text = String(t ?? ''), max = Math.floor((MAP_W - 16) / (px * 0.56));
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
};
export const mapLines = o => [o.model, o.ip || o.user || (o.ext ? 'Ext ' + o.ext : ''), o.type === 'patch' ? (o.ports || 24) + ' ports · ' + used(o) + ' used' : o.type === 'storage' ? [o.cap, o.proto].filter(Boolean).join(' · ') : o.kind === 'vm' ? 'Virtual machine' : ''].filter(Boolean);
/* Every box has the same height, so the rows line up across a column. */
export const mapH = () => 91;

export function mapLayout(nodes){
  const ids = new Set(nodes.map(o => o.id));
  /* Attached devices are left out of the map unless asked for, so the map shows the network. Showing one object's
     relations shows all of them, its monitors and accessories included, and the object itself even without any. */
  const focused = !!MAP.focused;
  const E = rels.filter(r => ids.has(r.from) && ids.has(r.to) && (focused || st.mapAttached || !isAttached(r.kind)));
  const connected = new Set(E.flatMap(r => [r.from, r.to]));
  /* With attached devices off, a device that is only attached to another one (a monitor on a PC) is left out too, not
     drawn as a loose box; a monitor attached to nothing still shows when objects without relations are shown. */
  const attachedOnly = o => !connected.has(o.id) && rels.some(r => r.from === o.id && isAttached(r.kind) && ids.has(r.to));
  const list = st.mapOnly && !focused ? nodes.filter(o => connected.has(o.id)) : nodes.filter(o => focused || st.mapAttached || !attachedOnly(o));
  const inList = new Set(list.map(o => o.id));
  const edges = E.filter(r => inList.has(r.from) && inList.has(r.to));
  /* Columns by distance from the switches, so the core sits left and everything hangs off it to the right. */
  const adj = {}; edges.forEach(r => { (adj[r.from] ??= []).push(r.to); (adj[r.to] ??= []).push(r.from); });
  const depth = {}, q = list.filter(o => ['firewall','router','switch'].includes(o.type) && !edges.some(r => r.kind === 'uplink' && r.from === o.id)).map(o => o.id);
  q.forEach(id => depth[id] = 0);
  for (let i = 0; i < q.length; i++) (adj[q[i]] || []).forEach(n => { if (!(n in depth)){ depth[n] = depth[q[i]] + 1; q.push(n); } });
  /* Groups without a switch, router or firewall (a PC with its monitors) start from their best-connected object, so the
     monitors sit one column to the right of their PC instead of beside it. */
  list.filter(o => (adj[o.id] || []).length && !(o.id in depth)).sort((a, b) => adj[b.id].length - adj[a.id].length).forEach(o => {
    if (o.id in depth) return;
    depth[o.id] = 0;
    const qq = [o.id];
    for (let i = 0; i < qq.length; i++) (adj[qq[i]] || []).forEach(n => { if (!(n in depth)){ depth[n] = depth[qq[i]] + 1; qq.push(n); } });
  });
  const maxD = Math.max(0, ...Object.values(depth));
  list.forEach(o => { if (!(o.id in depth)) depth[o.id] = maxD + 1; });
  const cols = {};
  list.forEach(o => (cols[depth[o.id]] ??= []).push(o));
  /* Each column is ordered by the height of the boxes it is linked to in the column before, so lines run mostly straight. */
  const pos = {}, ypos = {};
  Object.keys(cols).map(Number).sort((a,b) => a - b).forEach(d => {
    const bary = o => {
      const ns = (adj[o.id] || []).filter(n => depth[n] === d - 1 && n in ypos);
      return ns.length ? ns.reduce((sum, n) => sum + ypos[n], 0) / ns.length : Infinity;
    };
    let y = 24;
    cols[d].map(o => [o, bary(o)]).sort(([a, ba], [b, bb]) => {
      if (ba !== bb) return ba === Infinity ? 1 : bb === Infinity ? -1 : ba - bb;
      return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
    }).forEach(([o]) => {
      ypos[o.id] = y;
      pos[o.id] = st.mapPos[o.id] ?? {x: 24 + d * MAP_STEP, y};
      y += mapH(o) + 24;
    });
  });
  return {list, edges, pos};
}

/* Right-angled routes, one per relation. Each end gets its own connection point on the box side it leaves from:
   the points on a side are spread evenly and follow the order of the boxes at the other end, so lines do not fan out
   from one spot. Lines that share a gap between two columns (or two stacked rows) get separate lanes in that gap,
   so their runs stay apart. The label sits at the end that has the port. */
export function mapRoutes(L){
  const items = L.edges.map(r => {
    const pa = L.pos[r.from], pb = L.pos[r.to];
    if (pa.x + MAP_W < pb.x) return {r, pa, pb, sa: 'R', sb: 'L', across: true};
    if (pb.x + MAP_W < pa.x) return {r, pa, pb, sa: 'L', sb: 'R', across: true};
    return pa.y < pb.y ? {r, pa, pb, sa: 'B', sb: 'T', across: false} : {r, pa, pb, sa: 'T', sb: 'B', across: false};
  });
  const h = mapH(), sides = {};
  items.forEach((it, i) => {
    (sides[it.r.from + '|' + it.sa] ??= []).push({i, end: 'a', side: it.sa, id: it.r.from, o: it.pb});
    (sides[it.r.to + '|' + it.sb] ??= []).push({i, end: 'b', side: it.sb, id: it.r.to, o: it.pa});
  });
  const pt = {};
  Object.values(sides).forEach(group => {
    group.sort((p, q) => p.o.y - q.o.y || p.o.x - q.o.x);
    const p0 = L.pos[group[0].id];
    group.forEach((g, k) => {
      const f = (k + 0.5) / group.length;
      const across = 16 + (MAP_W - 32) * f, down = 28 + (h - 38) * f;
      pt[g.i + g.end] = g.side === 'R' ? {x: p0.x + MAP_W, y: p0.y + down}
        : g.side === 'L' ? {x: p0.x, y: p0.y + down}
        : g.side === 'T' ? {x: p0.x + across, y: p0.y}
        : {x: p0.x + across, y: p0.y + h};
    });
  });
  /* Lanes: the channel between two columns (or two rows), shared by every line that crosses it. */
  const gaps = {};
  items.forEach((it, i) => {
    const A = pt[i + 'a'], B = pt[i + 'b'];
    const key = it.across ? 'x' + Math.min(it.pa.x, it.pb.x) + '_' + Math.max(it.pa.x, it.pb.x) : 'y' + it.pa.x + '_' + Math.min(it.pa.y, it.pb.y) + '_' + Math.max(it.pa.y, it.pb.y);
    const g = gaps[key] ??= it.across
      ? {from: Math.min(it.pa.x, it.pb.x) + MAP_W, to: Math.max(it.pa.x, it.pb.x), list: []}
      : {from: Math.min(it.pa.y, it.pb.y) + h, to: Math.max(it.pa.y, it.pb.y), list: []};
    g.list.push({i, mid: it.across ? (A.y + B.y) / 2 : (A.x + B.x) / 2});
  });
  const lane = {};
  Object.values(gaps).forEach(g => {
    g.list.sort((p, q) => p.mid - q.mid);
    g.list.forEach((e, k) => lane[e.i] = g.from + (g.to - g.from) * (k + 1) / (g.list.length + 1));
  });
  return items.map((it, i) => {
    const A = pt[i + 'a'], B = pt[i + 'b'];
    const d = it.across ? `M${A.x} ${A.y}H${lane[i]}V${B.y}H${B.x}` : `M${A.x} ${A.y}V${lane[i]}H${B.x}V${B.y}`;
    const lx = it.sb === 'L' ? B.x - 6 : B.x + 6, ly = it.sb === 'B' ? B.y + 12 : B.y - 5;
    return {d, A, B, lx, ly, anchor: it.sb === 'L' ? 'end' : 'start'};
  });
}
export const MAP_SHORT = {attached:'attached', connected:'connected', uplink:'uplink', hosted:'runs on', patched:'patched'};

/* The drawing as SVG markup. The same markup is used on screen and in the export.
   Line labels are hidden until a line is hovered, or until Labels is switched on. */
export function mapInner(L){
  const routes = mapRoutes(L);
  const edges = L.edges.map((r, i) => {
    const a = byId(r.from), b = byId(r.to), p = routes[i];
    const label = MAP_SHORT[r.kind] + (r.port != null ? ' · ' + portLabel(b, r.port) : '');
    return html`<g class="mline" data-from="${a.id}" data-to="${b.id}">
      <path class="mhit" d="${p.d}" fill="none" stroke="transparent" stroke-width="10"/>
      <path d="${p.d}" fill="none" stroke="var(--line)" stroke-width="1.4"/>
      <circle cx="${p.A.x}" cy="${p.A.y}" r="3" fill="var(--line)"/><circle cx="${p.B.x}" cy="${p.B.y}" r="3" fill="var(--line)"/>
      <text class="mlab" x="${p.lx}" y="${p.ly}" text-anchor="${p.anchor}" font-size="10" font-family="var(--mono)" fill="var(--muted)" stroke="var(--bg)" stroke-width="3" paint-order="stroke">${label}</text></g>`;
  });
  const nodes = L.list.map(o => {
    const p = L.pos[o.id], h = mapH(o), lines = mapLines(o), c = tcol(o.type);
    /* The header names the type next to the code, so each box says what it is (PC, Switch, Server …). */
    return html`<g class="mnode${MAP.found === o.id ? ' found' : ''}" data-id="${o.id}" transform="translate(${p.x} ${p.y})"><title>${o.name} · ${TYPES[o.type] ? TYPES[o.type].label : o.type}</title>
      <rect width="${MAP_W}" height="${h}" rx="5" fill="var(--bg)" stroke="var(--bd)"/>
      <rect width="${MAP_W}" height="20" rx="5" fill="var(--panel2)"/><rect y="12" width="${MAP_W}" height="8" fill="var(--panel2)"/>
      <rect width="3" height="${h}" rx="1.5" fill="${c}"/>
      <text x="9" y="14" font-size="10" fill="var(--muted)"><tspan font-family="var(--mono)">${o.code}</tspan> · ${TYPES[o.type] ? (o.status !== 'active' ? TYPES[o.type].short : TYPES[o.type].label) : o.type}</text>
      <text x="8" y="36" font-size="13" font-weight="600" font-family="var(--mono)" fill="var(--fg)">${fitMap(o.name, 13)}<title>${o.name}</title></text>
      ${lines.map((t, i) => html`<text x="8" y="${52 + i * 15}" font-size="11" fill="var(--muted)">${fitMap(t, 11)}<title>${t}</title></text>`)}
      ${o.status !== 'active' ? html`<text x="${MAP_W - 8}" y="14" text-anchor="end" font-size="10" fill="#fff">${STATUS[o.status].label}</text>` : ''}
    </g>`;
  });
  return String(html`<g class="medges">${edges}</g><g class="mnodes">${nodes}</g>`);
}
/* Key for the map: which colour is which type, and what a line label says. */
export function mapLegend(L){
  const types = [...new Set(L.list.map(o => o.type))];
  return html`<details class="maplegend" aria-label="Map key"><summary>Legend</summary><div class="lgbody">
    <b>Boxes</b><div class="lgtypes">${types.map(t => html`<span>${rawHtml(tico(t, 'tico sm'))}${TYPES[t].label}</span>`)}</div>
    <b>Lines</b><div class="lgtext">Label: how the two are linked, and the port at the far end. Hover a box to light up its links, or a line to read its label. The chain runs left to right from the top.</div></div></details>`;
}
export function mapApply(){
  const g = $('#mapG'); if (g) g.setAttribute('transform', `translate(${MAP.px} ${MAP.py}) scale(${MAP.zoom})`);
  const z = $('#mapZoomReset'); if (z) z.textContent = Math.round(MAP.zoom * 100) + '%';
}
/* Zooms the map to z, keeping the point (mx, my) of the drawing area where it is: the pointer for Ctrl + wheel, the
   middle for the buttons. */
export function mapZoomTo(z, mx, my){
  const svg = $('#mapSvg'); if (!svg) return;
  if (mx === undefined){ mx = svg.clientWidth / 2; my = svg.clientHeight / 2; }
  const z0 = MAP.zoom, z1 = Math.min(2.5, Math.max(0.3, z));
  MAP.px = mx - (mx - MAP.px) * (z1 / z0); MAP.py = my - (my - MAP.py) * (z1 / z0); MAP.zoom = z1; mapApply();
}
export function mapBox(L){
  const xs = L.list.map(o => L.pos[o.id].x), ys = L.list.map(o => L.pos[o.id].y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const x1 = Math.max(...L.list.map(o => L.pos[o.id].x + MAP_W)), y1 = Math.max(...L.list.map(o => L.pos[o.id].y + mapH(o)));
  return {x0, y0, x1, y1};
}
export function mapFit(){
  const L = MAP.L; if (!L || !L.list.length || !$('#mapSvg')) return;
  const svg = $('#mapSvg'), W = svg.clientWidth, H = svg.clientHeight, b = mapBox(L);
  const z = Math.min((W - 60) / (b.x1 - b.x0), (H - 60) / (b.y1 - b.y0), 1.2);
  MAP.zoom = z; MAP.px = (W - (b.x0 + b.x1) * z) / 2; MAP.py = (H - (b.y0 + b.y1) * z) / 2; mapApply();
}
export function mapHighlight(id){
  const svg = $('#mapSvg'); if (!svg) return;
  if (!id){ svg.classList.remove('focus'); svg.querySelectorAll('.hi').forEach(e => e.classList.remove('hi')); return; }
  const nb = new Set([id]);
  svg.querySelectorAll('.mline').forEach(l => { const hit = l.dataset.from === id || l.dataset.to === id; l.classList.toggle('hi', hit); if (hit){ nb.add(l.dataset.from); nb.add(l.dataset.to); } });
  svg.querySelectorAll('.mnode').forEach(n => n.classList.toggle('hi', nb.has(n.dataset.id)));
  svg.classList.add('focus');
}
export function mapExportSvg(){
  const L = MAP.L, b = mapBox(L), pad = 20, w = b.x1 - b.x0 + 2 * pad, h = b.y1 - b.y0 + 2 * pad;
  const shifted = {...L, pos: Object.fromEntries(Object.entries(L.pos).map(([k,p]) => [k, {x: p.x - b.x0 + pad, y: p.y - b.y0 + pad}]))};
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="system-ui, sans-serif">${mapInner(shifted)}</svg>`;
  const cs = getComputedStyle(document.documentElement);
  /* A colour token is light-dark(…): a probe element resolves it to the colour on screen now, so the file has plain colours. */
  const probe = document.body.appendChild(document.createElement('i'));
  const value = n => {
    const v = cs.getPropertyValue(n).trim();
    if (!v.startsWith('light-dark(')) return v || '#888';
    probe.style.color = `var(${n})`; return getComputedStyle(probe).color || '#888';
  };
  try { return s.replace(/var\((--[\w-]+)\)/g, (m, n) => value(n)); } finally { probe.remove(); }
}

/* The toolbar controls that redraw the map; bound also when the map is empty, so it can be switched back. */
function bindMapToolbar(){
  $('#mapOnly').onchange = e => { st.mapOnly = e.target.checked; view(); };
  $('#mapFocus').onchange = e => { st.mapFocus = e.target.value || null; MAP.found = null; view(); };
  $('#mapAttached').onchange = e => { st.mapAttached = e.target.checked; MAP.found = null; view(); };
  $('#mapLabels').onchange = e => { st.mapLabels = e.target.checked; const svg = $('#mapSvg'); if (svg) svg.classList.toggle('labels', st.mapLabels); };
  /* The same zoom control as on the floor plan: the steps of the plan's buttons, around the middle of the map. */
  $('#mapZoomOut').onclick = () => mapZoomTo(MAP.zoom / 1.25);
  $('#mapZoomIn').onclick = () => mapZoomTo(MAP.zoom * 1.25);
  $('#mapZoomReset').onclick = () => mapZoomTo(1);
}
export function renderMap(){
  /* Showing one object's relations: that object and the objects linked to it directly, and nothing else. */
  /* Only a device in the inventory: a record in To review is not drawn, so it would leave an empty map. */
  const focus = st.mapFocus && objs.find(o => o.id === st.mapFocus) || null;
  if (st.mapFocus && !focus) st.mapFocus = null;
  const around = focus ? new Set([focus.id, ...rels.filter(r => r.from === focus.id || r.to === focus.id).flatMap(r => [r.from, r.to])]) : null;
  /* With a filter on (a type, a place, a search), the map shows the objects it finds and the objects linked to them, so
     a notebook's monitor or switch is drawn with it; a relation needs both ends on the map. */
  const found = around ? null : filtered(), narrowed = !!found && found.length < objs.length;
  let nodes = around ? objs.filter(o => around.has(o.id)) : found;
  if (narrowed){
    const ids = new Set(found.map(o => o.id));
    rels.filter(r => (ids.has(r.from) || ids.has(r.to)) && (st.mapAttached || !isAttached(r.kind))).forEach(r => { ids.add(r.from); ids.add(r.to); });
    nodes = objs.filter(o => ids.has(o.id));
  }
  const linked = new Set(rels.flatMap(r => [r.from, r.to]));   /* once, not a pass over the relations per object */
  const withRelations = objs.filter(o => o === focus || linked.has(o.id)).sort((a, b) => a.name.localeCompare(b.name));
  $('#toolbar').innerHTML = html`<span class="muted" id="mapCount"></span><span class="tbsep"></span>
    <span class="tbgroup"><label class="muted" for="mapFocus">Relations of</label>
    <select id="mapFocus" aria-label="Show only the relations of this device"><option value="">All devices</option>${withRelations.map(o => html`<option value="${o.id}" ${focus && focus.id === o.id ? 'selected' : ''}>${o.name}</option>`)}</select></span>
    <label class="pchk"><input type="checkbox" id="mapOnly" ${st.mapOnly?'checked':''}> Only objects with relations</label>
    <label class="pchk"><input type="checkbox" id="mapLabels" ${st.mapLabels?'checked':''}> Labels</label>
    <label class="pchk"><input type="checkbox" id="mapAttached" ${st.mapAttached?'checked':''}> Attached devices</label>
    <div class="grow"></div><span class="tbgroup"><span class="pl-zoom"><button id="mapZoomOut" aria-label="Zoom out" title="Zoom out (Ctrl + wheel)">−</button><button id="mapZoomReset" title="Actual size" class="pl-zv">${Math.round(MAP.zoom * 100)}%</button><button id="mapZoomIn" aria-label="Zoom in" title="Zoom in (Ctrl + wheel)">+</button></span><button id="mapFitBtn" title="Zoom so the whole map fits">Fit</button>
    ${rawHtml(menuHtml('More', '<button id="mapReset">Reset layout</button><button id="mapExport">Export SVG</button>'))}</span>`;
  MAP.nodes = nodes;   /* a drag lays out these again, so a focused map keeps its own boxes */
  MAP.focused = !!focus;
  MAP.L = mapLayout(nodes);
  /* The first object the search finds is marked on the map. */
  { const t = st.q.trim().toLowerCase(), hit = t && MAP.L.list.find(o => (o.code + ' ' + o.name).toLowerCase().includes(t)); MAP.found = hit ? hit.id : null; }
  if (!MAP.L.list.length){
    $('#mapCount').textContent = '0 devices';
    $('#view').innerHTML = narrowed
      ? (!found.length && hiddenHits()) || (found.length
        ? html`<div class="empty">None of the ${found.length} devices in the current filter ${found.length === 1 ? 'has' : 'have'} relations. <a class="link" id="mapClr">Clear filters</a> to see the whole map.</div>`
        : html`<div class="empty">No device matches the current filter. <a class="link" id="mapClr">Clear filters</a> to see the whole map.</div>`)
      : '<div class="empty">Nothing to draw yet: link two devices on a device\'s page.</div>';
    const clr = $('#mapClr'); if (clr) clr.onclick = () => $('#clearF').click();
    bindHiddenHits();
    bindMapToolbar();
    return;
  }
  const nL = MAP.L.list.length, nE = MAP.L.edges.length;
  $('#mapCount').textContent = `${nL} ${nL === 1 ? 'device' : 'devices'} · ${nE} ${nE === 1 ? 'relation' : 'relations'}`;
  $('#view').innerHTML = html`<div class="mapwrap"><svg id="mapSvg" role="img" aria-label="Relations map"><g id="mapG">${rawHtml(mapInner(MAP.L))}</g></svg>
    <div class="maphint">Drag a box to move it · drag the background to pan · Ctrl + wheel to zoom · click a box to open it</div>${mapLegend(MAP.L)}</div>`;
  const svg = $('#mapSvg');
  /* A right click on a box shows only its relations (the same as Relations of in the toolbar). */
  svg.addEventListener('contextmenu', e => {
    const n = e.target.closest('.mnode'); if (!n) return;
    e.preventDefault(); st.mapFocus = n.dataset.id; MAP.found = null; view();
  });
  svg.addEventListener('pointerdown', e => {
    const n = e.target.closest('.mnode');
    MAP.drag = n ? {id: n.dataset.id, sx: e.clientX, sy: e.clientY, ox: MAP.L.pos[n.dataset.id].x, oy: MAP.L.pos[n.dataset.id].y, moved: false}
                 : {pan: true, sx: e.clientX, sy: e.clientY, ox: MAP.px, oy: MAP.py, moved: false};
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', e => {
    const d = MAP.drag;
    if (!d){ const n = e.target.closest('.mnode'); mapHighlight(n ? n.dataset.id : null); return; }
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (!d.moved) return;
    if (d.pan){ MAP.px = d.ox + dx; MAP.py = d.oy + dy; mapApply(); return; }
    st.mapPos[d.id] = {x: d.ox + dx / MAP.zoom, y: d.oy + dy / MAP.zoom};
    MAP.L = mapLayout(MAP.nodes); $('#mapG').innerHTML = mapInner(MAP.L);
    mapHighlight(d.id);
  });
  /* A box moved by an admin is saved (the layout is shared); a viewer's moves stay on this page until it is reloaded. */
  svg.addEventListener('pointerup', () => { const d = MAP.drag; MAP.drag = null; if (d && !d.pan && !d.moved) openObj(d.id); else if (d && !d.pan && isAdmin()) queueServerSave(); });
  svg.addEventListener('pointerleave', () => { if (!MAP.drag) mapHighlight(null); });
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    if (!e.ctrlKey){ MAP.px -= e.deltaX; MAP.py -= e.deltaY; mapApply(); return; }
    const r = svg.getBoundingClientRect();
    mapZoomTo(MAP.zoom * (e.deltaY < 0 ? 1.1 : 0.91), e.clientX - r.left, e.clientY - r.top);
  }, {passive: false});
  bindMapToolbar();
  svg.classList.toggle('labels', st.mapLabels);
  $('#mapFitBtn').onclick = mapFit;
  $('#mapReset').onclick = () => { st.mapPos = {}; render(); mapFit(); };
  $('#mapExport').onclick = e => {
    e.target.closest('details').open = false;
    const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + mapExportSvg()], {type: 'image/svg+xml'});
    const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: 'relations.svg'});
    document.body.appendChild(a); a.click(); a.remove(); toast('Exported relations.svg');
  };
  mapApply();
  requestAnimationFrame(mapFit);
  setTimeout(mapFit, 60);
}
window.addEventListener('resize', () => { if (st.tab === 'map' && MAP.L) mapFit(); });
