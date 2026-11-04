/* Floor plans: an image per site or room, areas drawn on it, devices placed on it, racks dropped on it; the dialogs
   to add, edit and clear plans and areas. */
import { $$, $, menuHtml, LOCS, PLANS, SITES, TYPES, byId, esc, hist, isAttached, markHand, now, objs, rackUnits, rels, restoreSnapshot, rid, setPlans, snapshot, st, tcol, tico, toast, toastUndo } from './01-core.js';
import { RACKABLE, TYPE_U, isAdmin, rackCheck, siteOf, who } from './04-settings.js';
import { closeGroup, groupPins } from './13-plan-groups.js';
import { closeModal, modal } from './19-modal.js';
import { followOnTop } from './03-object-modals.js';
import { openObj } from './02-views.js';
import { queueServerSave, render } from './07-render.js';
import { html, rawHtml } from './html.js';

/* ---------- floor plans ---------- */
/* An image per site or room, areas drawn on it, and devices placed by position (in percent of the image). */
export let planSel = null;
export let planMode = 'view';
export let planPlace = null;
export let planDraw = null;
export let planDrag = null;
let pinClicked = false;   /* a pin was just opened or dropped by the pointer: its click event does nothing more */
let planListDrag = null, listDragDone = false;   /* a device dragged from the list; a drag is not also a click */
/* The rack pin under a point of the screen that a device can be mounted in, or null. */
function rackPinAt(cx, cy, o){
  if (!o || !RACKABLE.includes(o.type)) return null;
  const pin = document.elementsFromPoint(cx, cy).map(el => /** @type {HTMLElement} */ (el.closest && el.closest('[data-pin]'))).find(el => el && el.dataset.pin !== o.id);
  const r = pin ? byId(pin.dataset.pin) : null;
  return r && r.type === 'rack' ? r : null;
}
const markRack = r => $$('[data-pin]').forEach(el => el.classList.toggle('pl-droprack', !!r && el.dataset.pin === r.id));
/* Mount a device in a rack on the plan: the first free place from the top for its height is offered. */
export function rackDropModal(o, rack){
  const h0 = TYPE_U[o.type] ?? 1, units = rackUnits(rack);
  const freeU = h => { for (let u = units - h + 1; u >= 1; u--) if (!rackCheck(rack.id, u, h, o.id)) return u; return null; };
  const u0 = freeU(h0);
  modal(html`<div class="mh">Mount ${o.name} in ${rack.name}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="rdU">Start U</label><input id="rdU" type="number" min="1" max="${units}" value="${u0 ?? ''}">
      <label for="rdH">Height (U)</label><input id="rdH" type="number" min="1" max="${units}" value="${h0}">
    </div><p class="note" id="rdErr">${u0 == null ? `${rack.name} has no ${h0} U free.` : `U${u0} is the first free place from the top. ${o.name} then shows in the rack's card on the plan.`}</p></div>
    <div class="mf"><button id="rdCancel">Cancel</button><button id="rdOk" class="primary">Mount</button></div>`, 'sm');
  $('#rdCancel').onclick = closeModal;
  $('#rdOk').onclick = () => {
    const u = +$('#rdU').value, h = +$('#rdH').value, err = rackCheck(rack.id, u, h, o.id);
    if (err){ $('#rdErr').textContent = err; return; }
    const prevRack = o.rack;
    Object.assign(o, {rack: rack.id, u, h}); delete o.ontop; delete o.planPos;
    if (rack.loc){ o.loc = rack.loc; markHand(o, 'loc'); }
    followOnTop(o, prevRack);
    hist(o, now(), `Mounted in ${rack.name} at U${u}, ${h} U high, by ${who()}`);
    queueServerSave(); closeModal(); toast(`${o.name} mounted in ${rack.name} at U${u}`); renderPlans();
  };
  $('#rdU').focus();
}
/* The area under a point of the screen, with the place on the plan in percent, or null. */
function dropSpot(plan, cx, cy){
  const c = $('#plCanvas'); if (!c || !plan) return null;
  const r = c.getBoundingClientRect();
  if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
  const x = pctOf(cx, r.left, r.width), y = pctOf(cy, r.top, r.height);
  return {x, y, area: areaAt(plan, x, y)};
}
/* The rectangles of an area being drawn, before Done. */
export let planParts = [];
/* The area that new rectangles are added to, after it is clicked. */
export let planEditArea = null;
let planAreaDrag = null;
/* A rectangle of the chosen area being resized by one of its handles: which rectangle, which side(s), and how it was. */
let planResize = null;
export let planZoom = 1;
/* Ctrl + wheel steps not drawn yet (see renderPlans). */
const planWheel = { dy: 0, at: null, raf: 0 };
export const planById = id => PLANS.find(p => p.id === id);
/* Where a device sits on a plan: its own place, or, for a device already in the location of an area, the centre of that area. */
export const planPosOf = (plan, o) => {
  /* A retired device is kept for the record, not shown on a plan. */
  if (o.status === 'retired') return null;
  if (o.planPos) return o.planPos.plan === plan.id ? o.planPos : null;
  const a = plan.site ? (plan.areas || []).find(a => areaLocName(plan, a) === o.loc) : null;
  return a ? {plan: plan.id, x: round1(a.x + a.w / 2), y: round1(a.y + a.h / 2), auto: true} : null;
};
/* A device that goes with another one on a plan: a monitor or accessory attached to a device, or a device mounted in a
   rack. While its host is on the plan it is listed in the host's card, not drawn as a pin of its own. */
export const planHostOf = o => {
  const att = rels.find(r => r.from === o.id && isAttached(r.kind));
  const h = att ? byId(att.to) : o.rack ? byId(o.rack) : null;
  return h && h.status !== 'retired' && h !== o ? h : null;
};
/* Where each device on the plan is drawn. One placed by hand is where it was put. One shown because it is in an area's
   room carries the area's largest rectangle (box), so the page can spread those over the area in a grid by the pixels
   the plan has (13-plan-groups.js) instead of stacking them in its middle. */
export function planLayout(plan){
  return planDevices(plan).map(o => {
    const pos = planPosOf(plan, o);
    const a = pos.auto ? (plan.areas || []).find(x => areaLocName(plan, x) === o.loc) : null;
    return {o, x: pos.x, y: pos.y, auto: !!pos.auto, area: a ? a.id : null, box: a ? areaRects(a).reduce((b, q) => q.w * q.h > b.w * b.h ? q : b) : null};
  });
}
export const planDevices = plan => {
  const on = objs.filter(o => planPosOf(plan, o)), ids = new Set(on.map(o => o.id));
  return on.filter(o => { const h = planHostOf(o); return !(h && ids.has(h.id)); });
};
/* What goes with a device on the plan: its attached devices, or what is mounted in a rack (top to bottom). */
export const planRiders = host => objs.filter(o => o.status !== 'retired' && planHostOf(o) === host)
  .sort((a, b) => (b.u ?? -1) - (a.u ?? -1) || a.name.localeCompare(b.name));
export const pctOf = (client, start, size) => Math.max(0, Math.min(100, (client - start) / size * 100));
export const round1 = v => Math.round(v * 10) / 10;
/* The image comes from the server (saved apart from the inventory); older plans may still carry it inline. */
export const planImgSrc = p => p.image || (p.imageAt ? `api/plans/${encodeURIComponent(p.id)}/image?v=${p.imageAt}` : '');
/* An area is one or more rectangles, drawn one after the other; x, y, w, h keep the box around them. */
export const areaRects = a => a.rects && a.rects.length ? a.rects : [{x: a.x, y: a.y, w: a.w, h: a.h}];
export const boxOf = rects => {
  const x0 = Math.min(...rects.map(r => r.x)), y0 = Math.min(...rects.map(r => r.y));
  const x1 = Math.max(...rects.map(r => r.x + r.w)), y1 = Math.max(...rects.map(r => r.y + r.h));
  return {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
};
const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export const areaAt = (plan, x, y) => (plan.areas || []).find(a => areaRects(a).some(r => inRect(r, x, y)));
/* Moves rectangles by dx, dy (in percent of the image), stopping them at the edge of the plan. */
const shiftRects = (rects, dx, dy) => {
  const b = boxOf(rects);
  const k = Math.max(-b.x, Math.min(100 - b.x - b.w, dx)), j = Math.max(-b.y, Math.min(100 - b.y - b.h, dy));
  return {dx: k, dy: j, rects: rects.map(r => ({...r, x: r.x + k, y: r.y + j}))};
};
/* Snapping: an edge drawn or dragged near the edge of another area (or of the plan) lands on it, so rooms sit flush
   and one can be drawn round the corner of another. SNAP_PX is how near, in screen pixels; Alt held turns it off. */
const SNAP_PX = 8;
/* The edges to snap to: every area but the one moved, the parts of the area being drawn, and the plan's own edges. */
const snapLines = (plan, skipId) => {
  const rects = [...(plan.areas || []).filter(a => a.id !== skipId).flatMap(areaRects), ...planParts];
  return { xs: [0, 100, ...rects.flatMap(r => [r.x, r.x + r.w])], ys: [0, 100, ...rects.flatMap(r => [r.y, r.y + r.h])] };
};
/* The nearest line to v within tol, or null. */
const nearest = (v, lines, tol) => { let best = null; for (const l of lines) if (Math.abs(l - v) <= tol && (best === null || Math.abs(l - v) < Math.abs(best - v))) best = l; return best; };
/* A point snapped on each axis on its own; also says which lines it took, to show them. */
const snapPoint = (plan, x, y, box, off) => {
  if (off) return { x, y, gx: null, gy: null };
  const L = snapLines(plan, null), tx = SNAP_PX / box.width * 100, ty = SNAP_PX / box.height * 100;
  const gx = nearest(x, L.xs, tx), gy = nearest(y, L.ys, ty);
  return { x: gx ?? x, y: gy ?? y, gx, gy };
};
/* How far to nudge rectangles moved by dx, dy so one of their edges lands on a line: the smallest nudge per axis. */
const snapShift = (plan, skipId, rects, dx, dy, box, off) => {
  if (off) return { dx, dy, gx: null, gy: null };
  const L = snapLines(plan, skipId), tx = SNAP_PX / box.width * 100, ty = SNAP_PX / box.height * 100;
  const best = (edges, lines, tol) => { let n = null, g = null; for (const e of edges) { const l = nearest(e, lines, tol); if (l !== null && (n === null || Math.abs(l - e) < Math.abs(n))) { n = l - e; g = l; } } return [n, g]; };
  const [nx, gx] = best(rects.flatMap(r => [r.x + dx, r.x + r.w + dx]), L.xs, tx);
  const [ny, gy] = best(rects.flatMap(r => [r.y + dy, r.y + r.h + dy]), L.ys, ty);
  return { dx: dx + (nx ?? 0), dy: dy + (ny ?? 0), gx, gy };
};
/* The guide lines of a snap, drawn over the plan while the pointer is down; gone with null. */
const showGuides = (c, gx, gy) => {
  c.querySelectorAll('.pl-guide').forEach(el => el.remove());
  if (gx !== null && gx !== undefined) { const el = document.createElement('div'); el.className = 'pl-guide v'; el.style.left = gx + '%'; c.appendChild(el); }
  if (gy !== null && gy !== undefined) { const el = document.createElement('div'); el.className = 'pl-guide h'; el.style.top = gy + '%'; c.appendChild(el); }
};
/* An area is a location: "Site / Area". An area that was given an existing room keeps that room; otherwise the room is
   named after the area. Reading the name changes nothing, so drawing a plan never brings back a deleted room. */
export const areaLocName = (plan, area) => area.room && LOCS.includes(area.room) ? area.room : `${plan.site} / ${area.name}`;
/* The area's location, added to the locations (and its site to the sites) when a device is placed in the area or the
   area is drawn. */
export function areaLoc(plan, area){
  if (!SITES.includes(plan.site)) SITES.push(plan.site);
  const v = areaLocName(plan, area);
  if (!LOCS.includes(v)) LOCS.push(v);
  return v;
}
/* A device placed inside an area takes that area as its location. Returns the area's name, or null. */
export function locateOnPlan(plan, o, x, y){
  const a = areaAt(plan, x, y);
  if (!a || !plan.site) return null;
  o.loc = areaLoc(plan, a); markHand(o, 'loc');
  return a.name;
}
/* The list of devices not on the plan: beside the plan for those who place devices, folded away for the others (the
   plan gets the room); either way a button shows or hides it, remembered in this browser. */
const SIDE_KEY = 'ni-pl-side';
const sideOpen = () => { try { const v = localStorage.getItem(SIDE_KEY); return v === null ? isAdmin() : v === '1'; } catch { return isAdmin(); } };
const setSideOpen = on => { try { localStorage.setItem(SIDE_KEY, on ? '1' : '0'); } catch { /* not kept */ } };
/* Draws the Plans tab: the bar (pick a plan, zoom, and for an admin new plan, draw area and the Plan… menu), the list
   of devices not on the plan and the plan itself, then wires them all. Viewers can look, search and open devices;
   drawing, placing and dragging are for admins only. */
export function renderPlans(){
  $('#toolbar').innerHTML = '';   /* the plans have their own bar; the toolbar of the tab before is not kept */
  const plan = planById(planSel) || PLANS[0] || null;
  planSel = plan ? plan.id : null;
  const editArea = planEditArea && plan ? (plan.areas || []).find(a => a.id === planEditArea) : null;
  const bar = html`<div class="pl-bar">
      ${PLANS.length ? html`<select id="plSel" aria-label="Floor plan">${PLANS.map(p => html`<option value="${p.id}" ${plan && p.id === plan.id ? 'selected' : ''}>${p.name}${p.site ? ' · ' + p.site : ''}</option>`)}</select>` : html`<span class="muted">No floor plans yet.</span>`}
      ${isAdmin() ? html`<button id="plNew" ${PLANS.length ? html`class="primary"` : ''}>New plan</button>` : ''}
      ${plan ? html`${isAdmin() ? html`<span class="pl-sep"></span>
        <button id="plArea" class="${planMode === 'area' ? 'on' : ''}" title="Drag on the plan to mark an area">Draw area</button>
        ${editArea && planMode === 'view' ? html`<button id="plAreaEdit" title="Rename the area or choose its room">Edit ${editArea.name}</button><button id="plAreaAdd" title="Draw more rectangles for this area">Add rectangle to ${editArea.name}</button>` : ''}
        ${planMode === 'area' && planParts.length ? html`<button id="plAreaDone" class="primary">Done with ${planParts.length} ${planParts.length === 1 ? 'rectangle' : 'rectangles'}</button><button id="plAreaDiscard">Discard</button>` : ''}
        ${rawHtml(menuHtml('Plan…', html`<button id="plEdit" title="Rename the plan or change its site">Edit plan</button><button id="plReplace">Replace image</button>
        <button id="plDel" class="danger-text">Delete plan</button>`, { id: 'plMenu' }))}` : ''}
        <button type="button" id="plSideBtn" aria-pressed="${String(sideOpen())}" title="Show or hide the list of devices not on this plan">${sideOpen() ? 'Hide device list' : 'Device list'}</button>
        <span class="pl-zoom"><button id="plZoomOut" aria-label="Zoom out" title="Zoom out (Ctrl + wheel)">−</button><button id="plZoomReset" title="Actual size" class="pl-zv">${Math.round(planZoom * 100)}%</button><button id="plZoomIn" aria-label="Zoom in" title="Zoom in (Ctrl + wheel)">+</button></span>` : ''}
      <span class="grow"></span>
      ${plan ? html`<span class="muted">${(plan.areas || []).length} ${(plan.areas || []).length === 1 ? 'area' : 'areas'} · ${planDevices(plan).length} ${planDevices(plan).length === 1 ? 'device' : 'devices'}</span>` : ''}
    </div>`;
  const body = plan ? html`<div class="pl-body${sideOpen() ? '' : ' side-off'}">
      <aside class="pl-side"><div class="pl-shead">Devices not on this plan</div>
        <div class="pl-q">
          <div class="pl-filters"><select id="plType" aria-label="Type of device"><option value="">All types</option>${Object.entries(TYPES).filter(([k]) => objs.some(o => o.type === k)).map(([k, v]) => html`<option value="${k}" ${st.plType === k ? 'selected' : ''}>${v.label}</option>`)}</select>
          <select id="plWhere" aria-label="Where the device is"><option value="">Anywhere</option>${plan && plan.site ? html`<option value="site" ${st.plWhere === 'site' ? 'selected' : ''}>At ${plan.site}</option>` : ''}<option value="none" ${st.plWhere === 'none' ? 'selected' : ''}>No location</option></select></div></div>
        <div class="pl-list" id="plList"></div>
        <p class="note pl-tip">${planPlace ? `Click the plan to place ${planPlace.name}. Press Esc to cancel.` : planEditArea && isAdmin() ? 'Drag the area to move it, or one of the squares on its edge to change its size. Alt turns off snapping.' : 'Drag a device into an area, or choose it and click the plan. Drag a placed device to move it.'}</p></aside>
      <div class="pl-stage" id="plStage">${rawHtml(planCanvas(plan))}</div></div>`
    : html`<div class="pl-empty"><p>Add a floor plan: upload an image of a floor or room, mark areas on it, and place the devices.</p>${isAdmin() ? html`<button class="primary" id="plNew2">New plan</button>` : ''}</div>`;
  $('#view').innerHTML = html`<div class="plans">${bar}${body}</div>`;
  /* The bar's buttons and the zoom. */
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('#plNew', () => planModal(null)); on('#plNew2', () => planModal(null));
  on('#plSideBtn', () => { setSideOpen(!sideOpen()); renderPlans(); });
  const sel = $('#plSel'); if (sel) sel.onchange = () => { planSel = sel.value; planPlace = null; planMode = 'view'; planParts = []; planZoom = 1; renderPlans(); };
  on('#plArea', () => { planMode = planMode === 'area' ? 'view' : 'area'; planPlace = null; planParts = []; planEditArea = null; renderPlans(); });
  on('#plAreaAdd', () => { planMode = 'area'; planPlace = null; planParts = []; renderPlans(); });
  on('#plAreaDone', () => planEditArea ? addPartsToArea(plan) : areaModal(plan, planParts));
  on('#plAreaDiscard', () => { planParts = []; renderPlans(); });
  on('#plReplace', () => planModal(plan));
  on('#plEdit', () => planEditModal(plan));
  on('#plAreaEdit', () => { const a = (plan.areas || []).find(x => x.id === planEditArea); if (a) areaEditModal(plan, a); });
  /* A zoom keeps one point of the plan where it is on the screen: the pointer for Ctrl + wheel (and a pinch on a
     touchpad), the middle of the view for the buttons. The plan is drawn again at the new size, then scrolled back. */
  const zoom = (v, at) => {
    const next = Math.max(0.5, Math.min(3, Math.round(v * 1000) / 1000));
    const stage = $('#plStage'), cv = $('#plCanvas');
    if (next === planZoom) return;
    if (!stage || !cv){ planZoom = next; renderPlans(); return; }
    const sr = stage.getBoundingClientRect(), cr = cv.getBoundingClientRect();
    const px = at ? at.x : sr.left + sr.width / 2, py = at ? at.y : sr.top + sr.height / 2;
    const fx = (px - cr.left) / cr.width, fy = (py - cr.top) / cr.height;
    const keep = { left: stage.scrollLeft, top: stage.scrollTop };
    planZoom = next; renderPlans();
    const s2 = $('#plStage'), c2 = $('#plCanvas'); if (!s2 || !c2) return;
    s2.scrollLeft = keep.left; s2.scrollTop = keep.top;
    const r2 = c2.getBoundingClientRect();
    s2.scrollLeft += r2.left + fx * r2.width - px; s2.scrollTop += r2.top + fy * r2.height - py;
  };
  on('#plZoomOut', () => zoom(planZoom - 0.25)); on('#plZoomIn', () => zoom(planZoom + 0.25)); on('#plZoomReset', () => zoom(1));
  /* Ctrl + wheel zooms at the pointer, as in a map or a picture viewer; the wheel alone still scrolls. Several wheel
     steps in one frame are one zoom, so a fast wheel or a touchpad does not draw the plan many times over. */
  const stage = $('#plStage');
  if (stage) stage.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    planWheel.dy += e.deltaY * (e.deltaMode === 1 ? 33 : 1); planWheel.at = { x: e.clientX, y: e.clientY };
    if (!planWheel.raf) planWheel.raf = requestAnimationFrame(() => { const f = Math.pow(1.0015, -planWheel.dy); planWheel.dy = 0; planWheel.raf = 0; zoom(planZoom * f, planWheel.at); });
  }, { passive: false });
  on('#plDel', () => deletePlanModal(plan));
  if (!plan) return;
  renderPlanList(plan);
  $('#plType').onchange = e => { st.plType = e.target.value || null; renderPlanList(plan); };
  $('#plWhere').onchange = e => { st.plWhere = e.target.value || null; renderPlanList(plan); };
  $('#plList').onclick = e => { const b = e.target.closest('[data-plitem]'); if (!b || listDragDone) return; const o = byId(b.dataset.plitem); planPlace = planPlace && planPlace.id === o.id ? null : o; planMode = 'view'; renderPlans(); };
  /* A device can also be dragged from the list into an area: it is placed where it is dropped and gets the area's room. */
  $('#plList').onpointerdown = e => {
    const b = e.target.closest('[data-plitem]'); if (!b || e.button !== 0 || !isAdmin()) return;
    listDragDone = false;
    planListDrag = {id: b.dataset.plitem, sx: e.clientX, sy: e.clientY, moved: false, ghost: null, label: b.querySelector('.pl-n').textContent};
  };
  /* The plan: drawing areas, placing a device, and its pins and areas. */
  const c = $('#plCanvas');
  c.onpointerdown = e => {
    if (e.target.closest('.pl-pin,.pl-x') || e.button !== 0) return;
    /* A click beside an open group only closes it. */
    if (closeGroup()) return;
    const r = c.getBoundingClientRect();
    const x = pctOf(e.clientX, r.left, r.width), y = pctOf(e.clientY, r.top, r.height);
    if (planMode === 'area'){ const s = snapPoint(plan, x, y, r, e.altKey); planDraw = {x0: s.x, y0: s.y, x1: s.x, y1: s.y}; showGuides(c, s.gx, s.gy); return; }
    /* A click on the plan beside the chosen area lets it go (its handles go away). */
    if (planEditArea && !planPlace){ planEditArea = null; renderPlans(); return; }
    if (planPlace && isAdmin()){
      if (!areaAt(plan, x, y)){ toast('A device goes inside an area. Draw the area first.'); return; }
      placeDevice(plan, planPlace, round1(x), round1(y));
    }
  };
  /* A pin opens its device from the keyboard (Enter), and for someone who may only look; a pointer that may edit opens
     it on release instead (07: pointerup), so a drag does not also open it. */
  c.querySelectorAll('[data-pin]').forEach(p => p.onclick = e => { if (pinClicked || e.target.closest('[data-unpin]')) return; openObj(p.dataset.pin); });
  c.querySelectorAll('[data-pin]').forEach(p => p.onpointerdown = e => { if (e.target.closest('[data-unpin]') || !isAdmin()) return; e.stopPropagation(); planDrag = {id: p.dataset.pin, moved: false, x: 0, y: 0, orig: (byId(p.dataset.pin) || {}).planPos || null}; });
  /* × takes the device off the plan. Its place on the plan is cleared; the device itself stays in the inventory. */
  c.querySelectorAll('[data-unpin]').forEach(x => {
    x.onpointerdown = e => e.stopPropagation();
    x.onclick = e => {
      e.stopPropagation();
      if (!isAdmin()) return;
      const o = byId(x.dataset.unpin); if (!o) return;
      /* The plan shows where devices are: a device in the room of one of its areas leaves that room (and its place on
         the plan). One placed by hand outside every area's room only loses its place. */
      const inRoom = (plan.areas || []).some(a => areaLocName(plan, a) === o.loc);
      delete o.planPos; delete o.planOff;
      if (inRoom){ const was = o.loc; o.loc = ''; hist(o, now(), `Removed from ${was} by ${who()}`); queueServerSave(); toast(o.name + ' is out of the location'); }
      else { hist(o, now(), `Removed from ${plan.name} by ${who()}`); queueServerSave(); toast(o.name + ' is off the plan'); }
      renderPlans();
    };
  });
  /* Pins that cover each other are grouped; a device dragged out of a group's list is moved like one from the side list. */
  groupPins(c, (id, e, label, onMove) => { if (!isAdmin()) return; listDragDone = false; planListDrag = {id, sx: e.clientX, sy: e.clientY, moved: false, ghost: null, label, onMove}; });
  c.querySelectorAll('[data-area]').forEach(b => b.onclick = e => { e.stopPropagation(); const a = plan.areas.find(x => x.id === b.dataset.area); if (a) areaRemoveModal(plan, a); });
  /* In view mode an area is moved by dragging it. The devices whose pins are inside it move with it. */
  c.querySelectorAll('[data-area-drag]').forEach(el => el.onpointerdown = e => {
    if (e.button !== 0 || !isAdmin() || planPlace || planMode !== 'view' || e.target.closest('[data-area]')) return;
    const area = plan.areas.find(a => a.id === el.dataset.areaDrag); if (!area) return;
    e.stopPropagation();
    const r = c.getBoundingClientRect(), rects = areaRects(area).map(q => ({...q}));
    /* Where the pins are drawn now (an area's own devices spread over it), so each keeps its place in the moved area. */
    /* An area's own devices (by room) go with it; one shown for another area's room stays, wherever it is drawn. */
    const pins = [...c.querySelectorAll('.pl-pin')].filter(el => !el.dataset.parea || el.dataset.parea === area.id)
      .map(el => ({id: el.dataset.pin, x: parseFloat(el.dataset.homeX || el.style.left), y: parseFloat(el.dataset.homeY || el.style.top), own: el.dataset.parea === area.id}))
      .filter(p => p.own || rects.some(q => inRect(q, p.x, p.y)));
    planAreaDrag = {area, planId: plan.id, rects, pins, x0: pctOf(e.clientX, r.left, r.width), y0: pctOf(e.clientY, r.top, r.height), dx: 0, dy: 0, moved: false};
  });
  /* A handle of the chosen area changes the size of its rectangle. */
  c.querySelectorAll('[data-rh]').forEach(h => h.onpointerdown = e => {
    if (e.button !== 0 || !isAdmin()) return;
    const area = (plan.areas || []).find(a => a.id === planEditArea); if (!area) return;
    e.stopPropagation(); e.preventDefault();
    const [i, d] = h.dataset.rh.split(':'), rects = areaRects(area).map(q => ({...q}));
    planResize = {area, planId: plan.id, i: +i, d, rects, before: JSON.stringify({rects: area.rects, x: area.x, y: area.y, w: area.w, h: area.h}), rect: rects[+i], moved: false};
  });
}
/* The colours an area can have. A name, not a free value: the page draws it from its own CSS (one class per colour),
   in light and dark. Blue is the default and is not stored. */
export const AREA_COLORS = [['blue', 'Blue'], ['green', 'Green'], ['teal', 'Teal'], ['amber', 'Amber'], ['orange', 'Orange'], ['red', 'Red'], ['pink', 'Pink'], ['purple', 'Purple'], ['grey', 'Grey']];
const areaColor = a => AREA_COLORS.some(([k]) => k === (a && a.color)) ? a.color : 'blue';
/* The row of colour swatches in the area dialogs, as radio buttons (arrow keys move between them). */
const colorPicker = cur => html`<label>Colour</label><div class="ar-colors" role="radiogroup" aria-label="Colour of the area">${AREA_COLORS.map(([k, label]) => html`<label class="ar-sw ac-${k}" title="${label}"><input type="radio" name="arColor" value="${k}" ${k === cur ? 'checked' : ''} aria-label="${label}"><span></span></label>`)}</div>`;
const pickedColor = () => { const v = /** @type {HTMLInputElement|null} */ (document.querySelector('input[name=arColor]:checked')); return v ? v.value : 'blue'; };
const setColor = (area, c) => { if (c === 'blue') delete area.color; else area.color = c; };
/* The handles of the chosen area, for an admin in view mode: on each of its rectangles one at every corner and one in the
   middle of every side. Dragging one changes the size of that rectangle (07-style pointer handlers below). */
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const handleAt = (r, d) => ({ x: d.includes('w') ? r.x : d.includes('e') ? r.x + r.w : r.x + r.w / 2, y: d.includes('n') ? r.y : d.includes('s') ? r.y + r.h : r.y + r.h / 2 });
function resizeHandles(plan){
  const a = planEditArea && planMode === 'view' && isAdmin() ? (plan.areas || []).find(x => x.id === planEditArea) : null;
  if (!a) return '';
  return String(html`${areaRects(a).map((r, i) => HANDLES.map(d => { const p = handleAt(r, d); return html`<span class="pl-h pl-h-${d}" data-rh="${i}:${d}" style="left:${p.x}%;top:${p.y}%" title="Drag to change the size; Alt: without snapping"></span>`; }))}`);
}
/* The rectangle r resized: the sides in d (n, e, s, w) moved to the point x, y (in percent), each snapped on its own to
   the edges of the other areas, the area's other rectangles and the plan's border. It keeps at least MIN_SIDE percent. */
const MIN_SIDE = 2;
function resized(plan, area, i, r, d, x, y, box, off){
  const others = areaRects(area).filter((_, k) => k !== i);
  const L = snapLines(plan, area.id), xs = [...L.xs, ...others.flatMap(q => [q.x, q.x + q.w])], ys = [...L.ys, ...others.flatMap(q => [q.y, q.y + q.h])];
  const tx = SNAP_PX / box.width * 100, ty = SNAP_PX / box.height * 100;
  const gx = off ? null : nearest(x, xs, tx), gy = off ? null : nearest(y, ys, ty);
  const sx = gx ?? x, sy = gy ?? y;
  let x0 = r.x, x1 = r.x + r.w, y0 = r.y, y1 = r.y + r.h;
  if (d.includes('w')) x0 = Math.min(sx, x1 - MIN_SIDE); if (d.includes('e')) x1 = Math.max(sx, x0 + MIN_SIDE);
  if (d.includes('n')) y0 = Math.min(sy, y1 - MIN_SIDE); if (d.includes('s')) y1 = Math.max(sy, y0 + MIN_SIDE);
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(100, x1); y1 = Math.min(100, y1);
  return { rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, gx: d.includes('w') || d.includes('e') ? gx : null, gy: d.includes('n') || d.includes('s') ? gy : null };
}
/* An area is drawn as one shape: its rectangles are filled together and outlined once, with no edges between them.
   attrs: markup of attributes, made by html``. */
export function areaShape(rects, cls = '', attrs = ''){
  const xs = [...new Set(rects.flatMap(r => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap(r => [r.y, r.y + r.h]))].sort((a, b) => a - b);
  /* A cell of the grid is part of the area when its middle is inside one of the rectangles. */
  const on = (i, j) => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= ys.length - 1) return false;
    const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
    return rects.some(r => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h);
  };
  let fill = '', edge = '';
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    if (!on(i, j)) continue;
    const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
    fill += `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;
    /* Only the sides that border the outside are outlined. */
    if (!on(i, j - 1)) edge += `M${x0} ${y0}H${x1}`;
    if (!on(i, j + 1)) edge += `M${x0} ${y1}H${x1}`;
    if (!on(i - 1, j)) edge += `M${x0} ${y0}V${y1}`;
    if (!on(i + 1, j)) edge += `M${x1} ${y0}V${y1}`;
  }
  return String(html`<svg class="pl-area${cls}" ${rawHtml(attrs)} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="pl-area-fill" d="${fill}"/><path class="pl-area-edge" d="${edge}"/></svg>`);
}
/* The name of an area and its ×, placed at the top left of the area. */
export function areaTag(a, removable, count = 0){
  const r = areaRects(a)[0];
  return String(html`<div class="pl-area-tag ac-${areaColor(a)}" data-area-tag="${a.id}" style="left:${r.x}%;top:${r.y}%"><span>${a.name}</span>${count ? html`<span class="pl-acount" title="${count} ${count === 1 ? 'device' : 'devices'} in this area">${count}</span>` : ''}${removable ? html`<button class="pl-x" data-area="${a.id}" aria-label="Remove area ${a.name}" title="Remove area">×</button>` : ''}</div>`);
}
/* The devices that go with a pin, in its card: "In this rack" for a rack, "Attached" for anything else. */
function ridersHtml(o){
  const list = planRiders(o);
  if (!list.length) return '';
  const shown = list.slice(0, 8).map(x => html`<span class="pl-rider">${rawHtml(tico(x.type, 'tico sm'))}${o.type === 'rack' && x.u != null && !x.ontop ? html`<b class="mono">U${x.u}</b> ` : ''}${x.name}</span>`);
  return html`<span class="pl-riders"><span class="muted">${o.type === 'rack' ? 'In this rack' : 'Attached'}</span>${shown}${list.length > 8 ? html`<span class="muted">and ${list.length - 8} more</span>` : ''}</span>`;
}
export function planCanvas(plan){
  const cursor = planMode === 'area' ? 'crosshair' : planPlace ? 'copy' : 'default';
  const src = planImgSrc(plan), layout = planLayout(plan);
  /* Without a picture the plan still has room to draw on, with a line saying what to do. */
  return String(html`<div class="pl-canvas${src ? '' : ' noimg'}" id="plCanvas" style="cursor:${cursor};width:${planZoom * 100}%">
    ${src ? html`<img src="${src}" alt="Floor plan ${plan.name}" draggable="false">` : (plan.areas || []).length ? '' : html`<div class="pl-noimg">No picture yet. Use Plan… → Replace image to add the floor plan, then draw areas and place devices on it.</div>`}
    ${(plan.areas || []).map(a => rawHtml(areaShape(areaRects(a), ` ac-${areaColor(a)}${planMode === 'view' ? ' movable' : ''}${planEditArea === a.id ? ' editing' : ''}`, String(html`data-area-drag="${a.id}"`)) + areaTag(a, planMode !== 'area' && isAdmin(), layout.filter(p => p.area ? p.area === a.id : areaRects(a).some(q => inRect(q, p.x, p.y))).length)))}
    ${rawHtml(resizeHandles(plan))}
    ${planParts.length ? rawHtml(areaShape(planParts, ' pending')) : ''}
    ${layout.map(({o, box, area, ...pos}) => html`<button class="pl-pin${pos.auto ? ' auto' : ''}${(box ? box.y : pos.y) < 35 ? ' below' : ''}" data-pin="${o.id}"${box ? html` data-box="${box.x},${box.y},${box.w},${box.h}" data-parea="${area}"` : ''} style="left:${pos.x}%;top:${pos.y}%;--tc:${tcol(o.type)}">${rawHtml(tico(o.type, 'tico sm'))}<span class="pl-code">${o.name || o.code || ''}</span>${planRiders(o).length ? html`<span class="pl-rcount" aria-hidden="true">+${planRiders(o).length}</span>` : ''}<span class="pl-card"><b>${o.name}</b><span>${TYPES[o.type] ? TYPES[o.type].label : ''}${o.model ? ' · ' + o.model : ''}</span><span class="muted">${[o.code, o.loc || 'No location'].filter(Boolean).join(' · ')}</span>${ridersHtml(o)}</span><span class="pl-unpin" data-unpin="${o.id}" aria-label="Remove ${o.name} from the plan" title="${(plan.areas || []).some(a => areaLocName(plan, a) === o.loc) ? 'Remove from this location' : 'Remove from the plan'}">×</span></button>`)}
  </div>`);
}
export function renderPlanList(plan){
  /* The search at the top narrows this list and marks what it finds on the plan. */
  const q = (st.q || '').trim().toLowerCase();
  const placed = planDevices(plan).map(o => o.id), onPlan = new Set(placed);
  const rides = o => { const h = planHostOf(o); return h && onPlan.has(h.id); };
  /* The list can be narrowed to one type, and to the devices at the plan's site or those without a location. */
  const where = st.plWhere === 'site' && plan && plan.site ? o => String(o.loc || '').split(' / ')[0] === plan.site : st.plWhere === 'none' ? o => !o.loc : () => true;
  const rows = objs.filter(o => !onPlan.has(o.id) && !rides(o) && o.status !== 'retired' && (!st.plType || o.type === st.plType) && where(o)
    && (!q || [o.name, o.code, o.serial, o.model].some(v => v && String(v).toLowerCase().includes(q)))).slice(0, 300);
  $('#plList').innerHTML = rows.length ? html`${rows.map(o => html`<button class="pl-item ${planPlace && planPlace.id === o.id ? 'on' : ''}" data-plitem="${o.id}">${rawHtml(tico(o.type, 'tico sm'))}<span class="pl-n">${o.name}</span><span class="muted">${TYPES[o.type].short}</span></button>`)}` : '<p class="note pl-none">No devices to place.</p>';
}
/* Places device o on the plan at x, y (percent) and gives it the room of the area there, with an Undo. A device at
   another site is asked about first, unless sure is set. Saved and drawn again. */
export function placeDevice(plan, o, x, y, sure = false){
  /* A device at another site would move there: that is asked first, not done quietly. */
  const a = areaAt(plan, x, y), to = a && plan.site ? areaLocName(plan, a) : '', fromSite = String(o.loc || '').split(' / ')[0];
  if (!sure && to && fromSite && plan.site && fromSite !== plan.site){
    modal(html`<div class="mh">Move ${o.name} to ${plan.site}?</div><div class="mb"><p class="note">${o.name} is in <b>${o.loc}</b>. Placing it in the area ${a.name} of this plan sets its location to <b>${to}</b>.</p></div>
      <div class="mf"><button id="pmCancel">Cancel</button><button id="pmOk" class="primary">Move to ${plan.site}</button></div>`, 'sm');
    $('#pmCancel').onclick = () => { closeModal(); planPlace = null; renderPlans(); };
    $('#pmOk').onclick = () => { closeModal(); placeDevice(plan, o, x, y, true); };
    return;
  }
  const was = snapshot([o]), wasLoc = o.loc;
  o.planPos = {plan: plan.id, x, y}; delete o.planOff;
  const area = locateOnPlan(plan, o, x, y);
  hist(o, now(), `Placed on ${plan.name}${area ? ' in ' + area : ''} by ${who()}`);
  /* The pin just placed is marked for a moment and kept out of a group, so it can be seen where it went. */
  st.planFlash = o.id;
  planPlace = null; queueServerSave(); renderPlans();
  toastUndo(`${o.name} placed${area ? ' in ' + area : ''}${o.loc !== wasLoc ? ` · location now ${o.loc}` : ''}`, () => { restoreSnapshot(was, 'Placing undone by ' + who()); queueServerSave(); renderPlans(); });
}
/* From a device's page: its floor plan, with the device marked and in view. */
export function showOnPlan(o){
  if (!o.planPos || !planById(o.planPos.plan)) return;
  planSel = o.planPos.plan; planMode = 'view'; planPlace = null;
  st.planFlash = o.id; st.tab = 'plans'; render({ save: false });
}
export function drawPreview(){
  const c = $('#plCanvas'); if (!c || !planDraw) return;
  let p = $('#plPreview');
  if (!p){ p = document.createElement('div'); p.id = 'plPreview'; p.className = 'pl-preview'; c.appendChild(p); }
  const d = planDraw;
  Object.assign(p.style, {left: Math.min(d.x0, d.x1) + '%', top: Math.min(d.y0, d.y1) + '%', width: Math.abs(d.x1 - d.x0) + '%', height: Math.abs(d.y1 - d.y0) + '%'});
}
document.addEventListener('pointermove', e => {
  const c = $('#plCanvas'); if (!c) return;
  if (planListDrag){
    const d = planListDrag;
    if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 5){
      d.moved = true; if (d.onMove) d.onMove();
      d.ghost = document.createElement('div'); d.ghost.className = 'pl-ghost'; d.ghost.textContent = d.label; document.body.appendChild(d.ghost);
      document.body.classList.add('pl-dragging');
    }
    if (d.moved){
      d.ghost.style.left = e.clientX + 12 + 'px'; d.ghost.style.top = e.clientY + 8 + 'px';
      const spot = dropSpot(planById(planSel), e.clientX, e.clientY), rack = rackPinAt(e.clientX, e.clientY, byId(d.id));
      markRack(rack);
      c.querySelectorAll('[data-area-drag]').forEach(el => el.classList.toggle('droptarget', !rack && !!(spot && spot.area && spot.area.id === el.dataset.areaDrag)));
    }
  }
  if (planDraw){
    const r = c.getBoundingClientRect(), pl = planById(planSel);
    const s = pl ? snapPoint(pl, pctOf(e.clientX, r.left, r.width), pctOf(e.clientY, r.top, r.height), r, e.altKey) : { x: pctOf(e.clientX, r.left, r.width), y: pctOf(e.clientY, r.top, r.height), gx: null, gy: null };
    planDraw.x1 = s.x; planDraw.y1 = s.y; showGuides(c, s.gx, s.gy); drawPreview();
  }
  if (planResize){
    const r = c.getBoundingClientRect(), d = planResize, pl = planById(d.planId);
    if (pl){
      const n = resized(pl, d.area, d.i, d.rects[d.i], d.d, pctOf(e.clientX, r.left, r.width), pctOf(e.clientY, r.top, r.height), r, e.altKey);
      d.rect = n.rect; d.moved = true; showGuides(c, n.gx, n.gy);
      /* The shape, its name tag and the handles are drawn again from the rectangles as they are now. */
      const rects = d.rects.map((q, k) => k === d.i ? n.rect : q), box = boxOf(rects);
      const svg = c.querySelector(`svg[data-area-drag="${d.area.id}"]`);
      if (svg){ const t = document.createElement('template'); t.innerHTML = areaShape(rects, svg.getAttribute('class').replace(/^pl-area/, ''), String(html`data-area-drag="${d.area.id}"`)); svg.replaceWith(t.content.firstElementChild); }
      const tag = /** @type {HTMLElement|null} */ (c.querySelector(`[data-area-tag="${d.area.id}"]`)); if (tag){ tag.style.left = box.x + '%'; tag.style.top = box.y + '%'; }
      c.querySelectorAll(`[data-rh^="${d.i}:"]`).forEach(h => { const p = handleAt(n.rect, /** @type {HTMLElement} */ (h).dataset.rh.split(':')[1]); /** @type {HTMLElement} */ (h).style.left = p.x + '%'; /** @type {HTMLElement} */ (h).style.top = p.y + '%'; });
    }
  }
  if (planAreaDrag){
    const r = c.getBoundingClientRect(), d = planAreaDrag;
    const pl = planById(d.planId), raw = { dx: pctOf(e.clientX, r.left, r.width) - d.x0, dy: pctOf(e.clientY, r.top, r.height) - d.y0 };
    const sn = pl ? snapShift(pl, d.area.id, d.rects, raw.dx, raw.dy, r, e.altKey) : { ...raw, gx: null, gy: null };
    const sh = shiftRects(d.rects, sn.dx, sn.dy);
    showGuides(c, sn.gx, sn.gy);
    d.dx = sh.dx; d.dy = sh.dy; d.moved = d.moved || Math.abs(sh.dx) + Math.abs(sh.dy) > 0.2;
    /* The shape and its name tag follow the pointer by the drag's offset; the drop writes the new place. */
    const tx = d.dx * r.width / 100, ty = d.dy * r.height / 100;
    c.querySelectorAll(`[data-area-drag="${d.area.id}"],[data-area-tag="${d.area.id}"]`).forEach(el => { el.style.transform = `translate(${tx}px, ${ty}px)`; });
    d.pins.forEach(p => { const pin = c.querySelector(`[data-pin="${esc(p.id)}"]`); if (pin){ pin.style.left = p.x + d.dx + '%'; pin.style.top = p.y + d.dy + '%'; } });
  }
  if (planDrag){
    const r = c.getBoundingClientRect();
    planDrag.x = pctOf(e.clientX, r.left, r.width); planDrag.y = pctOf(e.clientY, r.top, r.height); planDrag.moved = true;
    const pin = c.querySelector(`[data-pin="${esc(planDrag.id)}"]`);
    if (pin){ pin.style.left = planDrag.x + '%'; pin.style.top = planDrag.y + '%'; }
    planDrag.rack = rackPinAt(e.clientX, e.clientY, byId(planDrag.id)); markRack(planDrag.rack);
  }
});
document.addEventListener('pointerup', e => {
  { const c = $('#plCanvas'); if (c) showGuides(c, null, null); }
  if (planListDrag){
    const d = planListDrag; planListDrag = null;
    if (d.moved){
      listDragDone = true; setTimeout(() => { listDragDone = false; }, 0);
      d.ghost.remove(); document.body.classList.remove('pl-dragging');
      $$('.droptarget').forEach(el => el.classList.remove('droptarget'));
      const plan = planById(planSel), o = byId(d.id), spot = dropSpot(plan, e.clientX, e.clientY), rack = rackPinAt(e.clientX, e.clientY, o);
      markRack(null);
      if (o && rack) rackDropModal(o, rack);
      else if (o && spot){
        if (spot.area) placeDevice(plan, o, round1(spot.x), round1(spot.y));
        else toast('A device goes inside an area. Drop it on one.');
      }
    }
  }
  if (planDraw){
    const d = planDraw; planDraw = null;
    const rect = {x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0)};
    if (rect.w > 2 && rect.h > 2) planParts = [...planParts, rect];
    renderPlans();
  }
  if (planResize){
    const d = planResize; planResize = null;
    if (d.moved){
      const r1 = v => round1(v), q = d.rect;
      d.area.rects = d.rects.map((x, k) => k === d.i ? {x: r1(q.x), y: r1(q.y), w: r1(q.w), h: r1(q.h)} : x);
      const box = boxOf(d.area.rects); Object.assign(d.area, {x: round1(box.x), y: round1(box.y), w: round1(box.w), h: round1(box.h)});
      queueServerSave(); renderPlans();
      const area = d.area, before = JSON.parse(d.before);
      toastUndo(`${area.name} resized`, () => { for (const k of ['rects', 'x', 'y', 'w', 'h']) { if (before[k] === undefined) delete area[k]; else area[k] = before[k]; } queueServerSave(); renderPlans(); });
    }
  }
  if (planAreaDrag){
    const d = planAreaDrag; planAreaDrag = null;
    if (d.moved){
      d.area.rects = shiftRects(d.rects, d.dx, d.dy).rects.map(q => ({x: round1(q.x), y: round1(q.y), w: round1(q.w), h: round1(q.h)}));
      const box = boxOf(d.area.rects); Object.assign(d.area, {x: round1(box.x), y: round1(box.y), w: round1(box.w), h: round1(box.h)});
      d.pins.forEach(p => { const o = byId(p.id); if (!o) return; o.planPos = {plan: d.planId, x: round1(p.x + d.dx), y: round1(p.y + d.dy)}; hist(o, now(), `Moved with the area ${d.area.name} by ${who()}`); });
      queueServerSave(); renderPlans();
    } else { planEditArea = d.area.id; renderPlans(); }
  }
  if (planDrag){
    const d = planDrag; planDrag = null;
    if (d.moved){
      const o = byId(d.id);
      const pl = planById(planSel);
      markRack(null);
      if (o && d.rack){ if (d.orig) o.planPos = d.orig; else delete o.planPos; renderPlans(); rackDropModal(o, d.rack); return; }
      if (o && pl){
        const area = areaAt(pl, d.x, d.y);
        if (!area){ if (d.orig) o.planPos = d.orig; else delete o.planPos; toast('A device stays inside an area. Drop it inside one.'); }
        else { o.planPos = {plan: pl.id, x: round1(d.x), y: round1(d.y)}; delete o.planOff; locateOnPlan(pl, o, d.x, d.y); hist(o, now(), `Moved on the plan into ${area.name} by ${who()}`); queueServerSave(); }
      }
      renderPlans();
    } else openObj(d.id);
    pinClicked = true; setTimeout(() => { pinClicked = false; }, 0);
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && st.tab === 'plans' && (planPlace || planMode === 'area' || planEditArea)){ planPlace = null; planMode = 'view'; planParts = []; planEditArea = null; renderPlans(); }
});
/* Adds the rectangles drawn to the area that was clicked, and widens its box to take them. */
export function addPartsToArea(plan){
  const area = (plan.areas || []).find(a => a.id === planEditArea), drawn = planParts;
  planParts = []; planEditArea = null; planMode = 'view';
  if (!area){ renderPlans(); return; }
  const rects = [...areaRects(area), ...drawn].map(q => ({x: round1(q.x), y: round1(q.y), w: round1(q.w), h: round1(q.h)}));
  const box = boxOf(rects);
  Object.assign(area, {rects, x: round1(box.x), y: round1(box.y), w: round1(box.w), h: round1(box.h)});
  queueServerSave(); toast('Area changed'); renderPlans();
}
/* Asks before removing an area from the plan. Devices placed inside it lose their place on the plan; their locations
   and history stay. */
export function areaRemoveModal(plan, area){
  modal(html`<div class="mh">Remove ${area.name}?</div>
    <div class="mb"><p class="note">Devices placed inside it leave the plan, and so do devices in its location. Nothing in the inventory changes: locations and history stay as they are.</p></div>
    <div class="mf"><button id="arrCancel">Cancel</button><button id="arrOk" class="danger-text">Remove area</button></div>`, 'sm');
  $('#arrCancel').onclick = closeModal;
  $('#arrOk').onclick = () => {
    /* Removing an area is a change to the plan only: devices placed by hand inside it lose that place on the plan, and devices
       in its location leave the plan on their own. Locations and history are not changed. */
    const rects = areaRects(area);
    for (const o of planDevices(plan)) if (o.planPos && rects.some(q => inRect(q, o.planPos.x, o.planPos.y))) delete o.planPos;
    plan.areas = plan.areas.filter(a => a.id !== area.id); queueServerSave(); closeModal(); toast('Area removed'); renderPlans();
  };
}
/* The New area dialog for the rectangles just drawn: a name and a room of the plan's site (or a new room named like
   the area). Adds the area to the plan and its room to the locations, and saves. */
export function areaModal(plan, rects){
  /* The rooms that already exist on this plan's site. */
  const rooms = LOCS.filter(l => siteOf(l) === plan.site && l.includes(' / '));
  modal(html`<div class="mh">New area</div><div class="mb"><div class="form" style="padding:0">
      <label for="arName">Name</label><input id="arName" placeholder="e.g. Open office, Server room" maxlength="60">
      <label for="arRoom">Room</label><select id="arRoom" aria-label="Room of this area"><option value="">A new room, named like the area</option>${rooms.map(l => html`<option value="${l}">${l.split(' / ').slice(1).join(' / ')}</option>`)}</select>
      ${colorPicker('blue')}
    </div>
    <p class="note">An area is a named place on this plan. Devices placed inside it are in its room. Choose a room that already exists, or leave it to create one.</p></div>
    <div class="mf"><button id="arCancel">Cancel</button><button id="arOk" class="primary">Add area</button></div>`, 'sm');
  $('#arCancel').onclick = () => { closeModal(); renderPlans(); };
  /* Picking an existing room names the area after it, unless a name is typed. */
  $('#arRoom').onchange = e => { if (e.target.value && !$('#arName').value.trim()) $('#arName').value = e.target.value.split(' / ').slice(1).join(' / '); };
  $('#arOk').onclick = () => {
    const room = $('#arRoom').value || null;
    const name = $('#arName').value.trim() || (room ? room.split(' / ').slice(1).join(' / ') : '');
    if (!name){ toast('Give the area a name.'); return; }
    const box = boxOf(rects);
    const area = {id: 'ar' + rid(), name, x: round1(box.x), y: round1(box.y), w: round1(box.w), h: round1(box.h), rects: rects.map(q => ({x: round1(q.x), y: round1(q.y), w: round1(q.w), h: round1(q.h)}))};
    if (room) area.room = room;
    setColor(area, pickedColor());
    plan.areas = [...(plan.areas || []), area];
    if (plan.site) areaLoc(plan, area);
    planMode = 'view'; planParts = []; queueServerSave(); closeModal(); toast('Area added'); renderPlans();
  };
  $('#arName').focus();
}
export function loadPlanImage(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
    img.src = url;
  });
}
/* Reduced to 1800 px wide and saved as JPEG, so a plan stays small in the inventory. */
export function shrinkPlanImage(img){
  const k = Math.min(1, 1800 / img.naturalWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
/* The New floor plan dialog (name, site, image), or with existing the Replace image one. The image is made smaller,
   uploaded to the server on its own (api/plans/…/image) and the plan saved. */
export function planModal(existing){
  modal(html`<div class="mh">${existing ? 'Replace image' : 'New floor plan'}</div><div class="mb">
    <div class="form" style="padding:0">${existing ? '' : html`<label for="plName">Name</label><input id="plName" placeholder="e.g. Ground floor" maxlength="60"><label for="plSite">Site</label><select id="plSite">${SITES.map(s => html`<option>${s}</option>`)}</select>`}
    <label for="plFile">Image</label><div class="filepick"><label class="btnlike" tabindex="0" role="button">Choose image…<input id="plFile" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden></label><span class="muted" id="plFileName">No image chosen</span></div></div>
    <p class="note">PNG, JPG, GIF or WebP.</p></div>
    <div class="mf"><button id="plCancel">Cancel</button><button id="plOk" class="primary">Save</button></div>`, 'sm');
  $('#plCancel').onclick = closeModal;
  $('#plFile').onchange = e => { const f = e.target.files[0]; $('#plFileName').textContent = f ? f.name : 'No image chosen'; };
  $('#plOk').onclick = async () => {
    const name = existing ? existing.name : $('#plName').value.trim();
    const file = $('#plFile').files[0];
    if (!name){ toast('Give the plan a name.'); return; }
    if (!file){ toast('Choose an image.'); return; }
    let img;
    try { img = await loadPlanImage(file); } catch { toast('That file is not an image.'); return; }
    const data = shrinkPlanImage(img);
    if (data.length > 1500000){ toast('The image is still too large. Use a smaller one.'); return; }
    const p = existing || {id: 'pl' + rid(), name, site: $('#plSite').value, areas: []};
    const r = await fetch('api/plans/' + encodeURIComponent(p.id) + '/image', {method: 'PUT', headers: {'Content-Type': 'text/plain'}, credentials: 'same-origin', body: data});
    if (!r.ok){ const j = await r.json().catch(() => ({})); toast(j.error || 'The image could not be saved.'); return; }
    delete p.image; p.imageAt = Date.now();
    if (!existing){ PLANS.push(p); planSel = p.id; }
    planMode = 'view'; queueServerSave(); closeModal(); toast(existing ? 'Plan saved' : 'Plan added'); renderPlans();
  };
  if (!existing) $('#plName').focus();
}
/* A plan's name can be changed at any time; its site only while it has no areas, since each area is a room of the site. */
export function planEditModal(plan){
  const locked = (plan.areas || []).length > 0;
  modal(html`<div class="mh">Edit ${plan.name}</div><div class="mb"><div class="form" style="padding:0">
      <label for="peName">Name</label><input id="peName" maxlength="60" value="${plan.name}">
      <label for="peSite">Site</label><select id="peSite" ${locked ? 'disabled' : ''}>${[...new Set([...SITES, plan.site].filter(Boolean))].map(x => html`<option ${x === plan.site ? 'selected' : ''}>${x}</option>`)}</select></div>
    ${locked ? html`<p class="note">The site stays while the plan has areas: each area is a room of ${plan.site}.</p>` : ''}</div>
    <div class="mf"><button id="peCancel">Cancel</button><button id="peOk" class="primary">Save</button></div>`, 'sm');
  $('#peCancel').onclick = closeModal;
  $('#peOk').onclick = () => {
    const name = $('#peName').value.trim();
    if (!name){ toast('Give the plan a name.'); return; }
    plan.name = name; if (!locked) plan.site = $('#peSite').value;
    queueServerSave(); closeModal(); toast('Plan saved'); renderPlans();
  };
  $('#peName').focus();
}
/* An area can be renamed and given another room of the plan's site. Devices already in its room stay there: an area
   without a room of its own keeps the one named after it, so renaming it moves nobody. */
export function areaEditModal(plan, area){
  const own = `${plan.site} / ${area.name}`;
  const cur = area.room || (LOCS.includes(own) ? own : '');
  const rooms = [...new Set([...LOCS.filter(l => siteOf(l) === plan.site && l.includes(' / ')), cur].filter(Boolean))];
  modal(html`<div class="mh">Edit ${area.name}</div><div class="mb"><div class="form" style="padding:0">
      <label for="aeName">Name</label><input id="aeName" maxlength="60" value="${area.name}">
      <label for="aeRoom">Room</label><select id="aeRoom">${cur ? '' : html`<option value="">A new room, named like the area</option>`}${rooms.map(l => html`<option value="${l}" ${l === cur ? 'selected' : ''}>${l.split(' / ').slice(1).join(' / ')}</option>`)}</select>
      ${colorPicker(areaColor(area))}</div>
    <p class="note">Devices placed inside the area get its room as their location.</p></div>
    <div class="mf"><button id="aeCancel">Cancel</button><button id="aeOk" class="primary">Save</button></div>`, 'sm');
  $('#aeCancel').onclick = closeModal;
  $('#aeOk').onclick = () => {
    const name = $('#aeName').value.trim(), room = $('#aeRoom').value;
    if (!name){ toast('Give the area a name.'); return; }
    area.name = name;
    if (room) area.room = room; else delete area.room;
    setColor(area, pickedColor());
    queueServerSave(); closeModal(); toast('Area saved'); renderPlans();
  };
  $('#aeName').focus();
}
/* Asks before deleting a plan: its areas go and its image is removed from the server. Devices placed on it stay in
   the inventory, off any plan. */
export function deletePlanModal(plan){
  modal(html`<div class="mh">Delete ${plan.name}?</div><div class="mb"><p class="note">The plan and its areas are removed. Devices placed on it stay in the inventory, but are no longer shown on a plan.</p></div>
    <div class="mf"><button id="dpCancel">Cancel</button><button id="dpOk" class="danger-text">Delete plan</button></div>`, 'sm');
  $('#dpCancel').onclick = closeModal;
  $('#dpOk').onclick = () => {
    objs.forEach(o => { if (o.planPos && o.planPos.plan === plan.id) delete o.planPos; });
    setPlans(PLANS.filter(p => p !== plan)); planSel = null; planMode = 'view'; planPlace = null;
    fetch('api/plans/' + encodeURIComponent(plan.id) + '/image', {method: 'DELETE', credentials: 'same-origin'}).catch(() => {});
    queueServerSave(); closeModal(); toast('Plan deleted'); renderPlans();
  };
}
