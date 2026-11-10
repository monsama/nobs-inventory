/* Racks: a new rack, and the rack view with its units (split out of 03-object-modals.js, which re-exports it). */
import { closeModal, modal } from './19-modal.js';
import './srcpick.js';
import { LOCS, O } from './01-core.js';
import { $, byId, hist, now, objs, rackUnits, racksList, st, tcol, toast, toastUndo, used } from './01-core.js';
import { queueServerSave, render } from './07-render.js';
import { isAdmin, mountModal, rackCheck, who } from './04-settings.js';
import { openObj } from './02-views.js';
import { html } from './html.js';


/* ---------- racks ---------- */
/* A new rack: what a rack has (its name, room, height in U and optionally its model and serial number), nothing more.
   It is shown in Racks right away. */
export function rackNewModal(){
  const n = racksList().length + 1;
  modal(html`<div class="mh">New rack</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="rnName">Name</label><input id="rnName" class="mono" maxlength="80" placeholder="e.g. ZH-RACK-${String(n).padStart(2, '0')}">
      <label for="rnLoc">Room</label><select id="rnLoc">${LOCS.length ? LOCS.map(l => html`<option>${l}</option>`) : html`<option value="">No rooms yet</option>`}</select>
      <label for="rnUnits">Height</label><div class="ctlrow"><input id="rnUnits" type="number" min="1" max="60" value="42" style="flex:none;width:90px"><span class="unit">U</span></div>
      <label for="rnModel">Model</label><input id="rnModel" maxlength="120" placeholder="Optional, e.g. APC NetShelter SX 42U">
      <label for="rnSerial">Serial number</label><input id="rnSerial" class="mono" maxlength="80" placeholder="Optional">
    </div><p class="note" id="rnErr">Devices are mounted in it from Racks with Mount device…, or by dropping them on the rack on a floor plan.</p></div>
    <div class="mf"><button id="rnCancel">Cancel</button><button id="rnOk" class="primary">Add rack</button></div>`, 'sm');
  $('#rnCancel').onclick = closeModal;
  $('#rnOk').onclick = () => {
    const name = $('#rnName').value.trim(), units = +$('#rnUnits').value;
    if (!name){ $('#rnErr').textContent = 'Give the rack a name.'; $('#rnName').focus(); return; }
    if (objs.some(o => o.type === 'rack' && o.name.toLowerCase() === name.toLowerCase())){ $('#rnErr').textContent = `There is already a rack named ${name}.`; return; }
    if (!Number.isInteger(units) || units < 1 || units > 60){ $('#rnErr').textContent = 'The height is a number of U from 1 to 60.'; return; }
    const o = O('rack', name, {model: $('#rnModel').value.trim(), serial: $('#rnSerial').value.trim(), loc: $('#rnLoc').value, units});
    objs.push(o); hist(o, now(), 'Created manually by ' + who());
    st.rackId = o.id; st.tab = 'rack'; queueServerSave(); closeModal(); toast(name + ' added'); render();
  };
  $('#rnName').focus();
}
/* Draws the Racks tab for the rack picked (or the first): a drawing of its units with the devices mounted (a click opens
   one) and a box that lists them. New rack and Mount device are for admins. */
export function renderRack(){
  const racks = racksList();
  const R_ = racks.find(r => r.id === st.rackId) || racks[0];
  if (!R_){
    $('#toolbar').innerHTML = '';
    $('#view').innerHTML = html`<div class="empty">No racks yet. A rack is a device of the type Rack.${isAdmin() ? html` <button class="primary" id="rackNew">New rack</button>` : ''}</div>`;
    const b = $('#rackNew'); if (b) b.onclick = rackNewModal;
    return;
  }
  st.rackId = R_.id;   /* the rack on screen is the one Mount uses */
  /* A retired device is kept for the record and no longer takes up rack units. */
  const inRack = objs.filter(o => o.rack === R_.id && o.status !== 'retired');
  const slotted = inRack.filter(o => o.u != null && !o.ontop);
  $('#toolbar').innerHTML = html`<label class="muted" for="rkSel">Rack</label><select id="rkSel">${racks.map(r => html`<option value="${r.id}" ${r.id===R_.id?'selected':''}>${r.name}</option>`)}</select>
    ${isAdmin() ? html`<button id="rkNew">New rack</button>` : ''}<button id="rkOpen" title="The rack's own page: location, model, warranty, history">Open rack</button>
    <span class="muted hide-n">${R_.loc} · ${slotted.reduce((n,o) => n + (o.h||1), 0)} of ${rackUnits(R_)} U used</span><div class="grow"></div>
    ${isAdmin() ? html`<button id="rkMount">Mount device…</button>` : ''}`;
  $('#rkSel').onchange = e => { st.rackId = e.target.value; render(); };
  const rn = $('#rkNew'); if (rn) rn.onclick = rackNewModal;
  $('#rkOpen').onclick = () => openObj(R_.id);
  const mount = $('#rkMount'); if (mount) mount.onclick = mountModal;
  const cells = [];
  for (let n = rackUnits(R_); n >= 1; n--){
    const top = inRack.find(o => o.u + (o.h || 1) - 1 === n);
    if (top){
      const h = top.h || 1, sitting = inRack.filter(x => x.ontop === top.id);
      const sub = top.type === 'patch' ? (top.ports || 24) + ' ports · ' + used(top) + ' used' : top.type === 'switch' ? (top.ports || 0) + '+' + (top.sfp || 0) + ' ports · ' + used(top) + ' used' : top.type === 'storage' ? [top.cap, top.proto].filter(Boolean).join(' · ') : top.model;
      cells.push(html`<div class="unit${h === 1 ? ' one' : ''}${isAdmin() ? ' movable' : ''}" data-open="${top.id}" data-unit="${top.id}" style="grid-row:${rackUnits(R_) - n + 1} / span ${h};--c:${tcol(top.type)}" title="${top.name}${isAdmin() ? ' · drag to move it, or Arrow up / down' : ''}"${isAdmin() ? html` tabindex="0" role="button" aria-label="${top.name}, U${top.u}${h > 1 ? '-' + (top.u + h - 1) : ''}. Arrow up or down moves it, Enter opens it."` : ''}>
        <span class="nm">${top.name}</span><span class="sub">${[top.code, sub].filter(Boolean).join(' · ')}${sitting.length ? ' · on top: ' + sitting.map(x => x.name).join(', ') : ''}</span></div>`);
      n -= h - 1;
    }
  }
  for (let n = rackUnits(R_); n >= 1; n--){
    const row = rackUnits(R_) - n + 1;
    const occupied = inRack.some(o => n >= o.u && n <= o.u + (o.h || 1) - 1);
    cells.push(html`<div class="uno" style="grid-row:${row};grid-column:1">U${n}</div>`);
    if (!occupied) cells.push(html`<div class="slot" style="grid-row:${row};grid-column:2"></div>`);
  }
  const mounted = inRack.slice().sort((a,b) => (b.u||0) - (a.u||0));
  $('#view').innerHTML = html`<div class="rackbox">
    <div class="rack" style="grid-template-rows:repeat(${rackUnits(R_)},24px)">${cells}</div>
    <div class="rackside">
      <div class="panelbox"><div class="hdr">${R_.name}</div>
        <dl class="lsbox"><dt>Location</dt><dd style="font-family:inherit">${R_.loc}</dd><dt>Height</dt><dd>${rackUnits(R_)} U</dd><dt>Devices</dt><dd>${inRack.length}</dd></dl>
        <div class="addrel" style="flex-direction:column;align-items:stretch">${mounted.length ? mounted.map(o => html`<button class="item" data-open="${o.id}" style="height:auto;padding:4px 6px"><span class="sw" style="background:${tcol(o.type)}"></span><span class="lbl mono">${o.ontop ? 'on ' + byId(o.ontop).name : 'U' + o.u + (o.h>1 ? '-' + (o.u+o.h-1) : '')}  ${o.name}</span></button>`) : html`<span class="muted">No devices in this rack yet. Use Mount device… above.</span>`}</div>
      </div>
    </div></div>`;
  if (isAdmin()) bindRackMoves(R_);
}

/* Moving a mounted device to another height: dragged with the mouse (or a finger), or a unit at a time with the arrow
   keys. Where it would land is shown as it moves, red where it does not fit (rackCheck). A drag that did not move is a
   click, and opens the device. What sits on top of it goes with it. */
function moveTo(R_, o, u){
  if (u === o.u) return;
  const err = rackCheck(R_.id, u, o.h || 1, o.id);
  if (err){ toast(err); return; }
  const was = o.u, h = o.h || 1, span = x => 'U' + x + (h > 1 ? '-' + (x + h - 1) : '');
  o.u = u; hist(o, now(), `Moved in ${R_.name} from ${span(was)} to ${span(u)} by ${who()}`);
  render();
  toastUndo(`${o.name} moved to ${span(u)}`, () => {
    if (o.rack !== R_.id || o.u !== u || rackCheck(R_.id, was, h, o.id)) { toast('It was changed since, so it stays where it is.'); return; }
    o.u = was; hist(o, now(), `Moved back in ${R_.name} to ${span(was)} by ${who()}`); render();
  });
  const el = $(`#view [data-unit="${CSS.escape(o.id)}"]`); if (el) /** @type {HTMLElement} */ (el).focus();
}
function bindRackMoves(R_){
  const rack = /** @type {HTMLElement|null} */ ($('#view .rack')); if (!rack) return;
  const units = rackUnits(R_), ROW = 24;
  /* The U under a point of the rack, 1 at the bottom. */
  const uAt = y => units - Math.floor((y - rack.getBoundingClientRect().top - rack.clientTop) / ROW);
  rack.querySelectorAll('[data-unit]').forEach(n => {
    const el = /** @type {HTMLElement} */ (n), o = byId(el.dataset.unit); if (!o) return;
    const h = o.h || 1, top0 = o.u + h - 1;
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openObj(o.id); return; }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault(); moveTo(R_, o, o.u + (e.key === 'ArrowUp' ? 1 : -1));
    });
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      /* Which of its units was grabbed: the device keeps that unit under the pointer. */
      const grab = top0 - uAt(e.clientY), y0 = e.clientY;
      let dragging = false, u = o.u, lastY = y0, raf = 0;
      /* Near the top or bottom of the scrolled view, it scrolls, so a tall rack can be crossed in one drag. */
      const sc = /** @type {HTMLElement|null} */ (rack.closest('#view'));
      const edge = () => {
        if (!dragging || !sc) return;
        const r = sc.getBoundingClientRect(), d = lastY < r.top + 40 ? -12 : lastY > r.bottom - 40 ? 12 : 0;
        if (d) { sc.scrollTop += d; u = Math.min(units - h + 1, Math.max(1, uAt(lastY) + grab - h + 1)); place(); }
        raf = requestAnimationFrame(edge);
      };
      const place = () => {
        el.style.gridRow = `${units - (u + h - 1) + 1} / span ${h}`;
        el.classList.toggle('bad', !!rackCheck(R_.id, u, h, o.id));
      };
      const move = ev => {
        if (!dragging && Math.abs(ev.clientY - y0) < 5) return;
        lastY = ev.clientY;
        if (!dragging) { dragging = true; el.classList.add('dragging'); rack.classList.add('drag-on'); try { el.setPointerCapture(ev.pointerId); } catch { /* gone */ } raf = requestAnimationFrame(edge); }
        u = Math.min(units - h + 1, Math.max(1, uAt(ev.clientY) + grab - h + 1));
        place();
      };
      const end = ev => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', end); removeEventListener('pointercancel', end); removeEventListener('keydown', esc, true);
        if (!dragging) return;
        dragging = false; cancelAnimationFrame(raf);
        /* The click that follows a drag does not open the device. */
        const swallow = c => { c.stopPropagation(); c.preventDefault(); };
        addEventListener('click', swallow, true); setTimeout(() => removeEventListener('click', swallow, true), 0);
        el.classList.remove('dragging', 'bad'); rack.classList.remove('drag-on');
        if (ev.type === 'pointercancel' || ev.type === 'keydown' || u === o.u) { render(); return; }
        if (rackCheck(R_.id, u, h, o.id)) { const err = rackCheck(R_.id, u, h, o.id); render(); toast(err); return; }
        moveTo(R_, o, u);
      };
      const esc = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); u = o.u; end(ev); } };
      addEventListener('pointermove', move); addEventListener('pointerup', end); addEventListener('pointercancel', end); addEventListener('keydown', esc, true);
    });
  });
}
