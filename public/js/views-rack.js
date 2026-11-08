/* Racks: a new rack, and the rack view with its units (split out of 03-object-modals.js, which re-exports it). */
import { closeModal, modal } from './19-modal.js';
import './srcpick.js';
import { LOCS, O } from './01-core.js';
import { $, byId, hist, now, objs, rackUnits, racksList, st, tcol, toast, used } from './01-core.js';
import { queueServerSave, render } from './07-render.js';
import { isAdmin, mountModal, who } from './04-settings.js';
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
      cells.push(html`<div class="unit${h === 1 ? ' one' : ''}" data-open="${top.id}" style="grid-row:${rackUnits(R_) - n + 1} / span ${h};--c:${tcol(top.type)}" title="${top.name}">
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
}
