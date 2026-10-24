import { setAppVersion, setPlans } from './01-core.js';
import { setUsers } from './04-settings.js';
import { MODELS, DOMAINS, FIELD_LAYOUT, TYPE_FIELDS, bindFullTextOnHover, fullTextTooltips, $, APP_VERSION, DEFAULT_TYPES, FIELD_LABEL, HISTORY, LOCS, VLANS, PLANS, PW_MIN, SITES, TYPES, byId, esc, hist, now, objs, rels, rid, st, tcol, tico, toast } from './01-core.js';
import { USERS, applyRole, bindUser, canEdit, me, pushDate, siteOf, who } from './04-settings.js';
import { FIXED_TABS, openObj, renderCards, renderMap, renderPorts, renderSide, renderTable, renderTabs } from './02-views.js';
import { closeModal, modal, renderObj, renderRack, renderSoftware } from './03-object-modals.js';
import { newObjModal } from './05-new-object.js';
/* ---------- render ---------- */
/* ---------- floor plans ---------- */
/* An image per site or room, areas drawn on it, and devices placed by position (in percent of the image). */
export let planSel = null;
export let planMode = 'view';
export let planPlace = null;
export let planDraw = null;
export let planDrag = null;
/* The rectangles of an area being drawn, before Done. */
export let planParts = [];
/* The area that new rectangles are added to, after it is clicked. */
export let planEditArea = null;
let planAreaDrag = null;
export let planZoom = 1;
export const planById = id => PLANS.find(p => p.id === id);
/* Where a device sits on a plan: its own place, or, for a device already in the location of an area, the centre of that area. */
export const planPosOf = (plan, o) => {
  /* A retired device is kept for the record, not shown on a plan. */
  if (o.status === 'retired') return null;
  if (o.planPos) return o.planPos.plan === plan.id ? o.planPos : null;
  /* A device taken off this plan stays off until it is placed again. */
  if (o.planOff === plan.id) return null;
  const a = plan.site ? (plan.areas || []).find(a => areaLoc(plan, a) === o.loc) : null;
  return a ? {plan: plan.id, x: round1(a.x + a.w / 2), y: round1(a.y + a.h / 2), auto: true} : null;
};
export const planDevices = plan => objs.filter(o => planPosOf(plan, o));
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
/* An area is a location: "Site / Area". It is added to the locations the first time it is used. */
export function areaLoc(plan, area){
  if (!SITES.includes(plan.site)) SITES.push(plan.site);
  /* An area that was given an existing room keeps that room; otherwise the room is named after the area. */
  if (area.room && LOCS.includes(area.room)) return area.room;
  const v = `${plan.site} / ${area.name}`;
  if (!LOCS.includes(v)) LOCS.push(v);
  return v;
}
/* A device placed inside an area takes that area as its location. Returns the area's name, or null. */
export function locateOnPlan(plan, o, x, y){
  const a = areaAt(plan, x, y);
  if (!a || !plan.site) return null;
  o.loc = areaLoc(plan, a);
  return a.name;
}
export function renderPlans(){
  $('#toolbar').innerHTML = '';   /* the plans have their own bar; the toolbar of the tab before is not kept */
  const plan = planById(planSel) || PLANS[0] || null;
  planSel = plan ? plan.id : null;
  const editArea = planEditArea && plan ? (plan.areas || []).find(a => a.id === planEditArea) : null;
  const bar = `<div class="pl-bar">
      ${PLANS.length ? `<select id="plSel" aria-label="Floor plan">${PLANS.map(p => `<option value="${p.id}" ${plan && p.id === plan.id ? 'selected' : ''}>${esc(p.name)}${p.site ? ' · ' + esc(p.site) : ''}</option>`).join('')}</select>` : '<span class="muted">No floor plans yet</span>'}
      <button id="plNew" class="primary">New plan</button>
      ${plan ? `<span class="pl-sep"></span>
        <button id="plArea" class="${planMode === 'area' ? 'on' : ''}" title="Drag on the plan to mark an area">Draw area</button>
        ${editArea && planMode === 'view' ? `<button id="plAreaAdd" title="Draw more rectangles for this area">Add rectangle to ${esc(editArea.name)}</button>` : ''}
        ${planMode === 'area' && planParts.length ? `<button id="plAreaDone" class="primary">Done with ${planParts.length} ${planParts.length === 1 ? 'rectangle' : 'rectangles'}</button><button id="plAreaDiscard">Discard</button>` : ''}
        <button id="plReplace">Replace image</button>
        <button id="plDel" class="danger-text">Delete plan</button>
        <span class="pl-zoom"><button id="plZoomOut" aria-label="Zoom out" title="Zoom out">−</button><button id="plZoomReset" title="Actual size" class="pl-zv">${Math.round(planZoom * 100)}%</button><button id="plZoomIn" aria-label="Zoom in" title="Zoom in">+</button></span>` : ''}
      <span class="grow"></span>
      ${plan ? `<span class="muted">${(plan.areas || []).length} areas · ${planDevices(plan).length} devices</span>` : ''}
    </div>`;
  const body = plan ? `<div class="pl-body">
      <aside class="pl-side"><div class="pl-shead">Devices not on this plan</div>
        <div class="pl-q"><input id="plQ" type="search" placeholder="Search devices" aria-label="Search devices"></div>
        <div class="pl-list" id="plList"></div>
        <p class="note pl-tip">${planPlace ? `Click the plan to place ${esc(planPlace.name)}. Press Esc to cancel.` : 'Choose a device, then click the plan to place it. Drag a placed device to move it.'}</p></aside>
      <div class="pl-stage" id="plStage">${planCanvas(plan)}</div></div>`
    : `<div class="pl-empty"><p>Add a floor plan: upload an image of a floor or room, mark areas on it, and place the devices.</p><button class="primary" id="plNew2">New plan</button></div>`;
  $('#view').innerHTML = `<div class="plans">${bar}${body}</div>`;
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('#plNew', () => planModal(null)); on('#plNew2', () => planModal(null));
  const sel = $('#plSel'); if (sel) sel.onchange = () => { planSel = sel.value; planPlace = null; planMode = 'view'; planParts = []; planZoom = 1; renderPlans(); };
  on('#plArea', () => { planMode = planMode === 'area' ? 'view' : 'area'; planPlace = null; planParts = []; planEditArea = null; renderPlans(); });
  on('#plAreaAdd', () => { planMode = 'area'; planPlace = null; planParts = []; renderPlans(); });
  on('#plAreaDone', () => planEditArea ? addPartsToArea(plan) : areaModal(plan, planParts));
  on('#plAreaDiscard', () => { planParts = []; renderPlans(); });
  on('#plReplace', () => planModal(plan));
  const zoom = v => { planZoom = Math.max(0.5, Math.min(3, Math.round(v * 100) / 100)); renderPlans(); };
  on('#plZoomOut', () => zoom(planZoom - 0.25)); on('#plZoomIn', () => zoom(planZoom + 0.25)); on('#plZoomReset', () => zoom(1));
  on('#plDel', () => deletePlanModal(plan));
  if (!plan) return;
  renderPlanList(plan);
  $('#plQ').oninput = () => renderPlanList(plan);
  $('#plList').onclick = e => { const b = e.target.closest('[data-plitem]'); if (!b) return; const o = byId(b.dataset.plitem); planPlace = planPlace && planPlace.id === o.id ? null : o; planMode = 'view'; renderPlans(); };
  const c = $('#plCanvas');
  c.onpointerdown = e => {
    if (e.target.closest('.pl-pin,.pl-x') || e.button !== 0) return;
    const r = c.getBoundingClientRect();
    const x = pctOf(e.clientX, r.left, r.width), y = pctOf(e.clientY, r.top, r.height);
    if (planMode === 'area'){ planDraw = {x0: x, y0: y, x1: x, y1: y}; return; }
    if (planPlace && canEdit()){
      if (!areaAt(plan, x, y)){ toast('A device goes inside an area. Draw the area first.'); return; }
      placeDevice(plan, planPlace, round1(x), round1(y));
    }
  };
  c.querySelectorAll('[data-pin]').forEach(p => p.onpointerdown = e => { if (e.target.closest('[data-unpin]') || !canEdit()) return; e.stopPropagation(); planDrag = {id: p.dataset.pin, moved: false, x: 0, y: 0, orig: (byId(p.dataset.pin) || {}).planPos || null}; });
  /* × takes the device off the plan. Its place on the plan is cleared; the device itself stays in the inventory. */
  c.querySelectorAll('[data-unpin]').forEach(x => {
    x.onpointerdown = e => e.stopPropagation();
    x.onclick = e => {
      e.stopPropagation();
      if (!canEdit()) return;
      const o = byId(x.dataset.unpin); if (!o) return;
      delete o.planPos; o.planOff = plan.id; hist(o, now(), `Removed from ${plan.name} by ${who()}`); queueServerSave();
      toast(o.name + ' is off the plan'); renderPlans();
    };
  });
  c.querySelectorAll('[data-area]').forEach(b => b.onclick = e => { e.stopPropagation(); const a = plan.areas.find(x => x.id === b.dataset.area); if (a) areaRemoveModal(plan, a); });
  /* In view mode an area is moved by dragging it. The devices whose pins are inside it move with it. */
  c.querySelectorAll('[data-area-drag]').forEach(el => el.onpointerdown = e => {
    if (e.button !== 0 || !canEdit() || planPlace || planMode !== 'view' || e.target.closest('[data-area]')) return;
    const area = plan.areas.find(a => a.id === el.dataset.areaDrag); if (!area) return;
    e.stopPropagation();
    const r = c.getBoundingClientRect(), rects = areaRects(area).map(q => ({...q}));
    const pins = planDevices(plan).map(o => ({o, pos: planPosOf(plan, o)})).filter(({pos}) => rects.some(q => inRect(q, pos.x, pos.y))).map(({o, pos}) => ({id: o.id, x: pos.x, y: pos.y}));
    planAreaDrag = {area, planId: plan.id, rects, pins, x0: pctOf(e.clientX, r.left, r.width), y0: pctOf(e.clientY, r.top, r.height), dx: 0, dy: 0, moved: false};
  });
}
export function planCanvas(plan){
  const cursor = planMode === 'area' ? 'crosshair' : planPlace ? 'copy' : 'default';
  const src = planImgSrc(plan);
  /* Without a picture the plan still has room to draw on, with a line saying what to do. */
  return `<div class="pl-canvas${src ? '' : ' noimg'}" id="plCanvas" style="cursor:${cursor};width:${planZoom * 100}%">
    ${src ? `<img src="${esc(src)}" alt="Floor plan ${esc(plan.name)}" draggable="false">` : `<div class="pl-noimg">No picture yet. Use Replace image to add the floor plan, then draw areas and place devices on it.</div>`}
    ${(plan.areas || []).map(a => areaRects(a).map((r, i) => `<div class="pl-area${planMode === 'view' ? ' movable' : ''}${planEditArea === a.id ? ' editing' : ''}" data-area-drag="${a.id}" style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%">${i ? '' : `<span>${esc(a.name)}</span>${planMode === 'area' ? '' : `<button class="pl-x" data-area="${a.id}" aria-label="Remove area ${esc(a.name)}" title="Remove area">×</button>`}`}</div>`).join('')).join('')}
    ${planParts.map(r => `<div class="pl-area pending" style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%"></div>`).join('')}
    ${planDevices(plan).map(o => { const pos = planPosOf(plan, o); return `<button class="pl-pin${pos.auto ? ' auto' : ''}" data-pin="${o.id}" style="left:${pos.x}%;top:${pos.y}%;background:${tcol(o.type)}" title="${esc(o.name)}"><i></i>${esc(o.name)}<span class="pl-unpin" data-unpin="${o.id}" aria-label="Remove ${esc(o.name)} from the plan" title="Remove from the plan">×</span></button>`; }).join('')}
  </div>`;
}
export function renderPlanList(plan){
  const q = (($('#plQ') && $('#plQ').value) || '').trim().toLowerCase();
  const placed = planDevices(plan).map(o => o.id);
  const rows = objs.filter(o => !placed.includes(o.id) && o.status !== 'retired' && (!q || [o.name, o.code, o.serial, o.model].some(v => v && String(v).toLowerCase().includes(q)))).slice(0, 300);
  $('#plList').innerHTML = rows.length ? rows.map(o => `<button class="pl-item ${planPlace && planPlace.id === o.id ? 'on' : ''}" data-plitem="${o.id}">${tico(o.type, 'tico sm')}<span class="pl-n">${esc(o.name)}</span><span class="muted">${esc(TYPES[o.type].short)}</span></button>`).join('') : '<p class="note pl-none">No devices to place.</p>';
}
export function placeDevice(plan, o, x, y){
  o.planPos = {plan: plan.id, x, y}; delete o.planOff;
  const area = locateOnPlan(plan, o, x, y);
  hist(o, now(), `Placed on ${plan.name}${area ? ' in ' + area : ''} by ${who()}`);
  planPlace = null; queueServerSave(); renderPlans();
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
  if (planDraw){ const r = c.getBoundingClientRect(); planDraw.x1 = pctOf(e.clientX, r.left, r.width); planDraw.y1 = pctOf(e.clientY, r.top, r.height); drawPreview(); }
  if (planAreaDrag){
    const r = c.getBoundingClientRect(), d = planAreaDrag;
    const sh = shiftRects(d.rects, pctOf(e.clientX, r.left, r.width) - d.x0, pctOf(e.clientY, r.top, r.height) - d.y0);
    d.dx = sh.dx; d.dy = sh.dy; d.moved = d.moved || Math.abs(sh.dx) + Math.abs(sh.dy) > 0.2;
    c.querySelectorAll(`[data-area-drag="${d.area.id}"]`).forEach((el, i) => { el.style.left = sh.rects[i].x + '%'; el.style.top = sh.rects[i].y + '%'; });
    d.pins.forEach(p => { const pin = c.querySelector(`[data-pin="${p.id}"]`); if (pin){ pin.style.left = p.x + d.dx + '%'; pin.style.top = p.y + d.dy + '%'; } });
  }
  if (planDrag){
    const r = c.getBoundingClientRect();
    planDrag.x = pctOf(e.clientX, r.left, r.width); planDrag.y = pctOf(e.clientY, r.top, r.height); planDrag.moved = true;
    const pin = c.querySelector(`[data-pin="${planDrag.id}"]`);
    if (pin){ pin.style.left = planDrag.x + '%'; pin.style.top = planDrag.y + '%'; }
  }
});
document.addEventListener('pointerup', () => {
  if (planDraw){
    const d = planDraw; planDraw = null;
    const rect = {x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0)};
    if (rect.w > 2 && rect.h > 2) planParts = [...planParts, rect];
    renderPlans();
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
      if (o && pl){
        const area = areaAt(pl, d.x, d.y);
        if (!area){ if (d.orig) o.planPos = d.orig; else delete o.planPos; toast('A device stays inside an area. Drop it inside one.'); }
        else { o.planPos = {plan: pl.id, x: round1(d.x), y: round1(d.y)}; delete o.planOff; locateOnPlan(pl, o, d.x, d.y); hist(o, now(), `Moved on the plan into ${area.name} by ${who()}`); queueServerSave(); }
      }
      renderPlans();
    } else openObj(d.id);
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && st.tab === 'plans' && (planPlace || planMode === 'area')){ planPlace = null; planMode = 'view'; planParts = []; renderPlans(); }
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
/* Removing an area asks first. Devices placed by hand stay where they are; devices shown only because of its location leave the plan. */
export function areaRemoveModal(plan, area){
  modal(`<div class="mh">Remove ${esc(area.name)}?</div>
    <div class="mb"><p class="note">Devices placed by hand inside it stay where they are on the plan. Devices that were only shown there, because they are in its location, leave the plan.</p></div>
    <div class="mf"><button id="arrCancel">Cancel</button><button id="arrOk" class="danger-text">Remove area</button></div>`, 'sm');
  $('#arrCancel').onclick = closeModal;
  $('#arrOk').onclick = () => { plan.areas = plan.areas.filter(a => a.id !== area.id); queueServerSave(); closeModal(); toast('Area removed'); renderPlans(); };
}
export function areaModal(plan, rects){
  /* The rooms that already exist on this plan's site. */
  const rooms = LOCS.filter(l => siteOf(l) === plan.site && l.includes(' / '));
  modal(`<div class="mh">New area</div><div class="mb"><div class="form" style="padding:0">
      <label for="arName">Name</label><input id="arName" placeholder="e.g. Open office, Server room" maxlength="60">
      <label for="arRoom">Room</label><select id="arRoom" aria-label="Room of this area"><option value="">A new room, named like the area</option>${rooms.map(l => `<option value="${esc(l)}">${esc(l.split(' / ').slice(1).join(' / '))}</option>`).join('')}</select>
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
export function planModal(existing){
  modal(`<div class="mh">${existing ? 'Replace image' : 'New floor plan'}</div><div class="mb">
    <div class="form" style="padding:0">${existing ? '' : `<label for="plName">Name</label><input id="plName" placeholder="e.g. Ground floor" maxlength="60"><label for="plSite">Site</label><select id="plSite">${SITES.map(s => `<option>${esc(s)}</option>`).join('')}</select>`}
    <label for="plFile">Image</label><input id="plFile" type="file" accept="image/png,image/jpeg,image/gif,image/webp"></div>
    <p class="note">PNG, JPG, GIF or WebP.</p></div>
    <div class="mf"><button id="plCancel">Cancel</button><button id="plOk" class="primary">Save</button></div>`, 'sm');
  $('#plCancel').onclick = closeModal;
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
    planMode = 'view'; queueServerSave(); closeModal(); toast('Plan saved'); renderPlans();
  };
  if (!existing) $('#plName').focus();
}
export function deletePlanModal(plan){
  modal(`<div class="mh">Delete ${esc(plan.name)}?</div><div class="mb"><p class="note">The plan and its areas are removed. Devices placed on it stay in the inventory, but are no longer shown on a plan.</p></div>
    <div class="mf"><button id="dpCancel">Cancel</button><button id="dpOk" class="danger-text">Delete plan</button></div>`, 'sm');
  $('#dpCancel').onclick = closeModal;
  $('#dpOk').onclick = () => {
    objs.forEach(o => { if (o.planPos && o.planPos.plan === plan.id) delete o.planPos; });
    setPlans(PLANS.filter(p => p !== plan)); planSel = null; planMode = 'view'; planPlace = null;
    fetch('api/plans/' + encodeURIComponent(plan.id) + '/image', {method: 'DELETE', credentials: 'same-origin'}).catch(() => {});
    queueServerSave(); closeModal(); toast('Plan deleted'); renderPlans();
  };
}
export function render(){
  renderSide(); renderTabs();
  if (st.tab === 'cards') renderCards();
  else if (st.tab === 'table') renderTable();
  else if (st.tab === 'map') renderMap();
  else if (st.tab === 'plans') renderPlans();
  else if (st.tab === 'net') renderPorts();
  else if (st.tab === 'rack') renderRack();
  else if (st.tab === 'sw') renderSoftware();
  else renderObj(byId(st.tab));
  fullTextTooltips();
  bindFullTextOnHover();
  $('#stObjs').textContent = objs.length + ' objects';
  $('#stRels').textContent = rels.length + ' relations';
  applyRole();
  saveData();
}
/* Everything is kept in this browser (not on a server yet), so a reload keeps the work. */
/* The inventory as one object. The server stores it. */
export const SERVER = {on: false, ldap: false, lansweeper: false, timer: null, revs: {}, base: null, busy: false, again: false, watching: false};
export function saveData(){ queueServerSave(); }
/* Saving. The page remembers, for every record, what it last saw (SERVER.base) and the revision the server gave it
   (SERVER.revs). A save sends only the records that differ from what it saw, each with that revision. A record that
   changed on the server since is not saved; the page then shows the newer version. */
export const PREFERENCES = ['mapPos'];
export function documents(){
  const m = new Map();
  objs.forEach(o => m.set('object|' + o.id, {kind:'object', id:o.id, value:o}));
  rels.forEach(r => m.set('rel|' + r.id, {kind:'rel', id:String(r.id), value:r}));
  USERS.forEach(u => m.set('user|' + u.id, {kind:'user', id:u.id, value:u}));
  Object.entries(TYPES).forEach(([k, t]) => m.set('type|' + k, {kind:'type', id:k, value:t}));
  Object.entries(HISTORY).forEach(([k, h]) => { if (h.length) m.set('history|' + k, {kind:'history', id:k, value:h}); });
  const settings = {autoBackups: st.autoBackups !== false, fieldLayout: FIELD_LAYOUT, locs: LOCS, sites: SITES, vlans: VLANS, domains: DOMAINS, models: MODELS, typeFields: TYPE_FIELDS, lansweeper: st.lansweeper, policy: st.policy, feedOn: st.feedOn, feedSync: st.feedSync, ldap: st.ldap, mapPos: st.mapPos, plans: PLANS, useLansweeper: st.useLansweeper !== false, lsSource: st.lsSource === 'api' ? 'api' : 'push', typeMap: st.typeMap || {}, modelMap: st.modelMap || {}, skipIpOnly: !!st.skipIpOnly, backupKeep: st.backupKeep || 10};
  Object.entries(settings).forEach(([k, v]) => m.set('setting|' + k, {kind:'setting', id:k, value:v}));
  return m;
}
export function setBaseline(){
  SERVER.base = new Map();
  for (const [k, d] of documents()) SERVER.base.set(k, JSON.stringify(d.value));
}
export function pendingChanges(){
  const now = documents(), puts = [], dels = [];
  for (const [k, d] of now){
    const json = JSON.stringify(d.value);
    if (SERVER.base.get(k) === json) continue;
    const pref = d.kind === 'setting' && PREFERENCES.includes(d.id);
    puts.push({key:k, kind:d.kind, id:d.id, value:d.value, json, base: pref ? null : (SERVER.revs[k] ?? 0)});
  }
  for (const k of SERVER.base.keys()){
    if (now.has(k)) continue;
    const i = k.indexOf('|');
    dels.push({key:k, kind:k.slice(0, i), id:k.slice(i + 1), base: SERVER.revs[k] ?? 0});
  }
  return {puts, dels};
}
/* Saves now, without waiting for the pause after an edit: a new object gets its code straight away. */
export function flushSave(){ clearTimeout(SERVER.timer); return sendChanges(); }
export function queueServerSave(){
  if (!SERVER.base) return;   /* nothing has been loaded yet */
  clearTimeout(SERVER.timer);
  SERVER.timer = setTimeout(sendChanges, 400);
}
/* Changes are sent in batches of about BATCH.bytes, so a large edit is not refused as too big. Each batch is saved on its own. */
export const BATCH = { bytes: 2000000 };
export function batches(puts, dels){
  const out = []; let cur = {puts: [], dels: []}, size = 0;
  const add = (kind, c) => {
    const n = (c.json || '').length + String(c.id || '').length + 100;
    if (size + n > BATCH.bytes && (cur.puts.length || cur.dels.length)){ out.push(cur); cur = {puts: [], dels: []}; size = 0; }
    cur[kind].push(c); size += n;
  };
  puts.forEach(c => add('puts', c)); dels.forEach(c => add('dels', c));
  if (cur.puts.length || cur.dels.length) out.push(cur);
  return out;
}
/* A save that asks while another is in progress waits for that one, so the caller knows what was sent. */
export function sendChanges(){
  if (SERVER.busy){ SERVER.again = true; return SERVER.inflight; }
  SERVER.inflight = sendNow();
  return SERVER.inflight;
}
async function sendNow(){
  if (!canEdit()) return;
  const pending = pendingChanges();
  if (!pending.puts.length && !pending.dels.length) return;
  SERVER.busy = true;
  try {
    for (const {puts, dels} of batches(pending.puts, pending.dels)) {
      const body = {puts: puts.map(({kind, id, value, base}) => ({kind, id, value, base})), dels: dels.map(({kind, id, base}) => ({kind, id, base}))};
      const r = await fetch('api/changes', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify(body)});
      if (r.status === 401){ loginModal('Your sign-in has ended. Sign in again.'); return; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok){ toast('Not saved: ' + (j.error || r.status)); return; }
      for (const [id, code] of Object.entries(j.codes || {})){ const o = byId(id); if (o) o.code = code; }
      if (Object.keys(j.codes || {}).length) render();
      const sent = new Map([...puts, ...dels].map(c => [c.key, c]));
      for (const [key, rev] of Object.entries(j.revs || {})){
        const c = sent.get(key); if (!c) continue;
        SERVER.revs[key] = rev;
        if (c.json === undefined){ SERVER.base.delete(key); continue; }
        const v = JSON.parse(c.json); if (j.codes && j.codes[c.id]) v.code = j.codes[c.id];
        SERVER.base.set(key, JSON.stringify(v));
      }
      if (j.conflicts && j.conflicts.length){
        const KIND_NAME = { object: 'an object', rel: 'a connection', setting: 'a setting', user: 'a user', type: 'an object type', history: 'a history entry' };
      const names = j.conflicts.map(k => { const c = sent.get(k); return c && c.value && c.value.name ? c.value.name : KIND_NAME[k.split('|')[0]] || k; });
        const refused = j.conflicts.map(k => sent.get(k)).filter(c => c && c.kind === 'object' && c.json)
          .map(c => ({ id: c.id, name: c.value.name, mine: JSON.parse(c.json), base: JSON.parse(SERVER.base.get(c.key) || 'null') }));
        toast('Not saved, changed by someone else: ' + names.join(', ') + '. The newer version is shown.');
        await reloadFromServer();
        const items = refused.map(r => {
          const now = byId(r.id);
          return { id: r.id, name: r.name, gone: !now, fields: now ? changedFields(r.mine, r.base).map(k => ({ k, mine: r.mine[k], theirs: now[k] })) : [] };
        }).filter(i => i.gone || i.fields.length);
        if (items.length) refusedModal(items);
      }
    }
  } catch {
    toast('Not saved: the server cannot be reached.');
  } finally {
    SERVER.busy = false;
    if (SERVER.again){ SERVER.again = false; queueServerSave(); }
  }
}
/* The fields a person changed on an object, to offer them again after a refused save. */
export const NOT_EDITED = ['id', 'code', 'ovr', 'feed'];
export function changedFields(mine, base){ return Object.keys(mine).filter(k => !NOT_EDITED.includes(k) && JSON.stringify(mine[k]) !== JSON.stringify((base || {})[k])); }
export const shown = v => (v && typeof v === 'object') ? JSON.stringify(v) : String(v ?? '');
/* Shows what a person changed and the newer version, so a refused edit is not lost. */
export function refusedModal(items){
  modal(`<div class="mh">Not saved: changed by someone else</div>
    <div class="mb"><p class="note">Someone else saved these records first, so your changes were not saved. The inventory shows their version. You can apply your changes again.</p>
      ${items.map(it => `<div class="panelbox"><div class="hdr">${esc(it.name)}${it.gone ? ' <span class="muted">· deleted by someone else</span>' : ''}</div>
        ${it.fields.length ? `<table class="grid mini" style="min-width:0"><thead><tr><th>Field</th><th>Yours</th><th>Theirs</th></tr></thead><tbody>${it.fields.map(f => `<tr><td>${esc(FIELD_LABEL[f.k] || f.k)}</td><td>${esc(shown(f.mine))}</td><td>${esc(shown(f.theirs))}</td></tr>`).join('')}</tbody></table>` : ''}
      </div>`).join('')}</div>
    <div class="mf"><button id="rfKeep">Keep theirs</button><button id="rfApply" class="primary">Apply mine again</button></div>`, 'wide');
  $('#rfKeep').onclick = closeModal;
  $('#rfApply').onclick = () => {
    let n = 0;
    for (const it of items){ const o = byId(it.id); if (!o || it.gone) continue; for (const f of it.fields){ o[f.k] = f.mine; n++; } }
    closeModal(); saveData(); render(); toast(n ? 'Your changes are applied again' : 'Nothing to apply');
  };
}
/* Loads the inventory and its revisions from the server, and makes it the base for the next save. */
export async function reloadFromServer(){
  const r = await fetch('api/state', {credentials: 'same-origin'});
  if (r.status === 401){ loginModal(); return false; }
  if (!r.ok){ toast('The inventory could not be loaded.'); return false; }
  const d = await r.json();
  applyState(d);
  dropMissingTabs();
  SERVER.revs = d.revs || {};
  setBaseline();
  render();
  return true;
}
/* An object open in a tab may have been deleted by someone else: its tab is closed. */
export function dropMissingTabs(){
  const gone = id => !FIXED_TABS[id] && !byId(id);
  st.open = st.open.filter(id => !gone(id));
  st.tabIds = st.tabIds.filter(id => !gone(id));
  if (gone(st.tab)) st.tab = 'table';
}
/* Other people's saves show up here: every 15 seconds and when the window gets focus. Nothing is replaced while there
   are unsaved changes, a dialog is open, or someone is typing. */
export async function checkForChanges(){
  if (!SERVER.base || SERVER.busy || document.querySelector('#mdl')) return;
  if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  const {puts, dels} = pendingChanges();
  if (puts.length || dels.length) return;
  const r = await fetch('api/state', {credentials: 'same-origin'});
  if (!r.ok) return;
  const d = await r.json();
  const revs = d.revs || {};
  const changed = Object.keys(revs).some(k => (SERVER.revs[k] ?? 0) !== revs[k]) || Object.keys(SERVER.revs).some(k => !(k in revs));
  if (changed) await reloadFromServer();
}
export function applyState(d){
  objs.splice(0, objs.length, ...d.objs);
  rels.splice(0, rels.length, ...d.rels);
  Object.keys(HISTORY).forEach(k => delete HISTORY[k]); Object.assign(HISTORY, d.history);
  setUsers(d.users); LOCS.splice(0, LOCS.length, ...d.locs);
  SITES.splice(0, SITES.length, ...(d.sites || []));
  VLANS.splice(0, VLANS.length, ...(d.vlans || []));
  DOMAINS.splice(0, DOMAINS.length, ...(d.domains || []));
  MODELS.splice(0, MODELS.length, ...(d.models || []));
  for (const k of Object.keys(FIELD_LAYOUT)) delete FIELD_LAYOUT[k];
  Object.assign(FIELD_LAYOUT, d.fieldLayout || {});
  for (const k of Object.keys(TYPE_FIELDS)) delete TYPE_FIELDS[k];
  Object.assign(TYPE_FIELDS, d.typeFields || {});
  PLANS.splice(0, PLANS.length, ...(d.plans || []));
  st.useLansweeper = d.useLansweeper !== false; st.lsSource = d.lsSource === 'api' ? 'api' : 'push';
  st.autoBackups = d.autoBackups !== false; st.typeMap = d.typeMap || {}; st.modelMap = d.modelMap || {}; st.skipIpOnly = !!d.skipIpOnly; st.backupKeep = d.backupKeep || 10;
  LOCS.forEach(l => { const x = l.split(' / ')[0]; if (!SITES.includes(x)) SITES.push(x); });   /* locations saved before sites existed */
  if (d.types){   /* the built-in types are always there; the saved ones add to them or change them */
    Object.keys(TYPES).forEach(k => delete TYPES[k]); Object.assign(TYPES, JSON.parse(JSON.stringify({ ...DEFAULT_TYPES, ...d.types })));
  }
  /* A new server has no saved policy yet: start from the defaults so the Settings panes can be drawn. */
  Object.assign(st, {policy: d.policy || {ip:true, mac:true, os:true, model:true, cpu:true, ram:true, fw:true, boot:true, disk:false, av:false, domain:true, user:false, loc:false, status:false}, feedOn: d.feedOn ?? true, feedSync: d.feedSync ?? true, ldap: d.ldap ?? {url: '', bindDn: '', base: '', filter: '', group: '', nightly: true, disable: true, last: null}, mapPos: d.mapPos || {}, lansweeper: d.lansweeper || {}});
  objs.forEach(bindUser);
}
/* Reset: in this browser it forgets the saved copy. On the server it clears the devices, relations and history
   for everyone, and keeps users, locations, types and the saved settings. The admin's button needs a second click. */
/* Clears the devices, relations and history on the server for everyone. Users, locations, types and settings stay. */
/* Clearing deletes every device, so it asks first, and only goes ahead when the word CLEAR is typed. */
export function clearConfirm(){
  modal(`<div class="mh">Clear the whole inventory?</div>
    <div class="mb"><p class="note">This deletes every device on the server, with its relations and history, for everyone. Users, locations, sites, racks and settings stay, and so do the objects excluded from sync unless you tick the box below. It cannot be undone: only a backup brings the devices back.</p>
      <label class="pchk" style="display:flex;gap:6px;align-items:center;margin:8px 0"><input type="checkbox" id="clrAll"> Also delete the objects excluded from sync (protected)</label>
      <label class="note" for="clrWord" style="display:block;margin-top:6px">Type CLEAR to confirm</label><input id="clrWord" autocomplete="off" aria-label="Type CLEAR" style="width:100%"></div>
    <div class="mf"><button id="clrCancel">Cancel</button><button id="clrOk" class="danger-text" disabled>Clear inventory</button></div>`, 'sm');
  $('#clrWord').oninput = () => { $('#clrOk').disabled = $('#clrWord').value.trim() !== 'CLEAR'; };
  $('#clrWord').focus();
  $('#clrCancel').onclick = closeModal;
  $('#clrOk').onclick = () => clearAll();
}
/* Clears the devices, relations and history on the server, all of them, including any another person added since
   this page loaded. Users, locations, types and settings stay. */
export async function clearAll(){
  if (!canEdit()){ toast('Only an admin can clear the inventory.'); return; }
  const r = await fetch('api/state', {credentials: 'same-origin'});
  if (!r.ok){ toast('The inventory could not be loaded.'); return; }
  const d = await r.json();
  /* Objects excluded from sync are kept, unless the box to delete protected objects is ticked. Relations and history of
     the removed objects go with them; relations between kept objects stay. */
  const deleteAll = !!($('#clrAll') && $('#clrAll').checked);
  /* Racks stay, as the dialog says: they are objects, so they are kept here as well. */
  const removed = new Set(d.objs.filter(o => o.type !== 'rack' && (deleteAll || !o.excluded)).map(o => o.id));
  const kept = d.objs.length - removed.size;
  const dels = [
    ...d.objs.filter(o => removed.has(o.id)).map(o => ({kind:'object', id:o.id})),
    ...d.rels.filter(x => removed.has(x.from) || removed.has(x.to)).map(x => ({kind:'rel', id:String(x.id)})),
    ...Object.keys(d.history).filter(id => removed.has(id)).map(id => ({kind:'history', id})),
  ].map(c => ({...c, base: d.revs[c.kind + '|' + c.id] ?? 0}));
  const res = await fetch('api/changes', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({puts: [], dels})});
  const j = await res.json().catch(() => ({}));
  if (!res.ok){ toast('Not cleared: ' + (j.error || res.status)); return; }
  closeModal();
  await reloadFromServer();
  toast(j.conflicts && j.conflicts.length ? 'Cleared, except ' + j.conflicts.length + ' record(s) that someone changed meanwhile' : (kept ? 'Cleared. ' + kept + ' excluded object' + (kept === 1 ? ' kept' : 's kept') : 'Inventory cleared'));
}
/* Keyboard: N new object, / search, C T M R switch views, ? the list. Not while typing or in a dialog. */
export const SHORTCUTS = [['N','New object'],['/','Search'],['C','Cards'],['T','Table'],['M','Relationships'],['R','Racks'],['Esc','Close a dialog'],['?','This list']];
export function shortcutsModal(){
  modal(`<div class="mh">Keyboard shortcuts</div><div class="mb"><table class="grid mini" style="min-width:0"><tbody>
    ${SHORTCUTS.map(([k, t]) => `<tr><td class="mono"><b>${k}</b></td><td>${t}</td></tr>`).join('')}</tbody></table></div>
    <div class="mf"><button id="scClose" class="primary">Done</button></div>`, 'sm');
  $('#scClose').onclick = closeModal;
}
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest('input, textarea, select') || $('#mdl')) return;
  const key = e.key.toLowerCase();
  if (e.key === '?'){ e.preventDefault(); shortcutsModal(); return; }
  if (e.key === '/'){ e.preventDefault(); $('#search').focus(); return; }
  if (key === 'n' && canEdit()){ e.preventDefault(); newObjModal(); return; }
  const tab = {c: 'cards', t: 'table', m: 'map', r: 'rack'}[key];
  if (tab){ st.tab = tab; render(); }
});

/* The version comes from the server. It is shown in the footer and in Settings → About. */
export async function loadVersion(){
  if (!APP_VERSION){
    try { const r = await fetch('api/health', {credentials: 'same-origin'}); if (r.ok) setAppVersion((await r.json()).version || ''); } catch { /* no version is shown when it cannot be read */ }
  }
  const foot = $('#verFoot'); if (foot) foot.textContent = 'NOBS Inventory ' + APP_VERSION;
  return APP_VERSION;
}
export async function boot(){
  loadVersion();
  let info = null;
  try { const r = await fetch('api/me', {credentials: 'same-origin'}); if (r.ok) info = await r.json(); } catch { info = null; }
  if (!info){ showUnreachable(); return; }
  SERVER.on = true; SERVER.ldap = info.ldap; SERVER.lansweeper = info.lansweeper;
  if (!info.user){ clearInventory(); render(); loginModal(); return; }
  await loadFromServer(info.user);
}
/* The page works only with its server. Without one nothing is shown; the dialog offers to try again. */
export function showUnreachable(){
  document.body.classList.add('signed-out');
  modal(`<div class="mh">NOBS Inventory</div><div class="mb"><p class="note" style="color:var(--danger)">The inventory server cannot be reached. Check that it is running, then try again.</p></div>
    <div class="mf"><button id="unTry" class="primary">Try again</button></div>`, 'sm free locked');
  $('#unTry').onclick = () => location.reload();
}
/* Before sign-in the page holds no inventory. */
export function clearInventory(){
  objs.length = 0; rels.length = 0; LOCS.length = 0; VLANS.length = 0; DOMAINS.length = 0; setUsers([]);
  for (const k of Object.keys(FIELD_LAYOUT)) delete FIELD_LAYOUT[k];
  for (const k of Object.keys(TYPE_FIELDS)) delete TYPE_FIELDS[k];
  Object.keys(HISTORY).forEach(k => delete HISTORY[k]);
  st.open = []; st.tab = 'cards';
}
export async function loadFromServer(user){
  if (!(await reloadFromServer())) return;
  document.body.classList.remove('signed-out');
  st.meId = user.id;
  if (!SERVER.watching){ SERVER.watching = true; setInterval(checkForChanges, 15000); window.addEventListener('focus', checkForChanges); }
  render();
}/* Sign in with a login and password. The server checks the account, or the directory when LDAP is set up. */
export function loginModal(err = '', login = ''){
  document.body.classList.add('signed-out');
  modal(`<div class="mh">Sign in to NOBS Inventory</div>
    <div class="mb"><form id="loginForm" class="form" style="padding:0">
      <label for="lgUser">Login</label><input id="lgUser" value="${esc(login)}" autocomplete="username" required>
      <label for="lgPw">Password</label><input id="lgPw" type="password" autocomplete="current-password" required>
    </form><p class="note" id="lgErr" style="color:var(--danger)">${esc(err)}</p></div>
    <div class="mf"><button id="lgOk" class="primary">Sign in</button></div>`, 'sm free locked');
  const go = async () => {
    const login = $('#lgUser').value;
    const r = await fetch('api/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin',
      body: JSON.stringify({login, password: $('#lgPw').value})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ loginModal(j.error || 'Sign in failed.', login); return; }
    closeModal(); await loadFromServer(j.user);
  };
  $('#lgOk').onclick = go;
  $('#loginForm').addEventListener('submit', e => { e.preventDefault(); go(); });
  (login ? $('#lgPw') : $('#lgUser')).focus();
}
/* The browsers this account is signed in on. A session ends on its own after two hours without use. */
export const browserName = ua => {
  const b = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? b + ' on ' + os : b;
};
export async function loadMySessions(){
  const box = $('#acSessions'); if (!box) return;
  const r = await fetch('api/me/sessions', {credentials: 'same-origin'});
  if (!r.ok){ box.innerHTML = '<p class="note">The sessions could not be loaded.</p>'; return; }
  const list = (await r.json()).sessions;
  const others = list.filter(x => !x.current).length;
  box.innerHTML = list.length ? `<div class="sess-list">${list.map(x => `<div class="sess">
      <div class="sess-main"><div class="sess-name">${esc(browserName(x.agent))}${x.current ? '<span class="sess-here">This browser</span>' : ''}</div><div class="sess-when">Last used ${esc(pushDate(x.last))}</div></div>
      ${x.current ? '' : `<button data-endsess="${esc(x.id)}" aria-label="End this session">End</button>`}</div>`).join('')}</div>
    <div class="sess-foot"><button id="acEndOthers" ${others ? '' : 'disabled'}>End all other sessions</button></div>` : '<p class="note">No browsers are signed in.</p>';
  box.querySelectorAll('[data-endsess]').forEach(b => b.onclick = async () => { await fetch('api/me/sessions/' + encodeURIComponent(b.dataset.endsess), {method: 'DELETE', credentials: 'same-origin'}); loadMySessions(); });
  if ($('#acEndOthers')) $('#acEndOthers').onclick = async () => { for (const x of list.filter(y => !y.current)) await fetch('api/me/sessions/' + encodeURIComponent(x.id), {method: 'DELETE', credentials: 'same-origin'}); toast('Other browsers are signed out'); loadMySessions(); };
}
/* Your own account: name and department, and the password. Directory users keep their name and password in the directory. */
export function accountModal(){
  const u = me(), ldap = u.source === 'ldap';
  const parts = (u.name || '').split(' ');
  modal(`<div class="mh">Your account</div>
    <div class="mb"><div class="form" style="padding:0">
      <label>Login</label><div class="mono" style="padding:4px 0">${esc(u.login || '—')}${ldap ? ' · directory' : ''}</div>
      <label for="acFirst">First name</label><input id="acFirst" value="${esc(u.first ?? parts[0] ?? '')}" ${ldap ? 'disabled' : ''}>
      <label for="acLast">Last name</label><input id="acLast" value="${esc(u.last ?? parts.slice(1).join(' '))}" ${ldap ? 'disabled' : ''}>
      <label for="acDept">Department</label><input id="acDept" value="${esc(u.dept || '')}">
    </div>
    ${ldap ? '<p class="note">Your name and password come from the directory.</p>' : `<div class="hdr" style="margin:14px -14px 8px">Password</div>
    <div class="form" style="padding:0">
      <label for="acCur">Current</label><input id="acCur" type="password" autocomplete="current-password">
      <label for="acNew">New</label><input id="acNew" type="password" autocomplete="new-password" placeholder="At least ${PW_MIN} characters">
      <label for="acNew2">Repeat</label><input id="acNew2" type="password" autocomplete="new-password">
    </div>`}
    <div class="hdr" style="margin:14px -14px 8px">Signed-in browsers</div>
    <div id="acSessions"><p class="note">Loading…</p></div>
    <p class="note" id="acErr"></p></div>
    <div class="mf"><button id="acClose">Close</button><button id="acPw" ${ldap ? 'hidden' : ''}>Change password</button><button id="acSave" class="primary">Save</button></div>`, 'sm');
  loadMySessions();
  const fail = msg => { $('#acErr').textContent = msg; };
  $('#acClose').onclick = closeModal;
  $('#acSave').onclick = async () => {
    if (ldap){ closeModal(); return; }
    const first = $('#acFirst').value.trim(), last = $('#acLast').value.trim();
    if (!first && !last) return fail('Give a first or last name.');
    const r = await fetch('api/me', {method: 'PUT', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({first, last, dept: $('#acDept').value.trim()})});
    if (!r.ok) return fail((await r.json().catch(() => ({}))).error || 'The details could not be saved.');
    closeModal(); await reloadFromServer(); toast('Saved');
  };
  $('#acPw').onclick = async () => {
    const cur = $('#acCur').value, pw = $('#acNew').value;
    if (!cur) return fail('Type your current password.');
    if (pw.length < PW_MIN) return fail(`The new password needs at least ${PW_MIN} characters.`);
    if (pw !== $('#acNew2').value) return fail('The two new passwords are not the same.');
    const r = await fetch('api/me/password', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({current: cur, password: pw})});
    if (!r.ok) return fail((await r.json().catch(() => ({}))).error || 'The password was not changed.');
    closeModal(); toast('Password changed. Other browsers are signed out.');
  };
  $('#acFirst').focus();
}
export async function signOut(){
  await fetch('api/logout', {method: 'POST', credentials: 'same-origin'});
  location.reload();
}
