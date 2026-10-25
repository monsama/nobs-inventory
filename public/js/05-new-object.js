import { hasPorts, patchPort, releaseRetiredPort, PORTED, $, LOCS, O, TYPES, byId, esc, hist, now, objs, rackUnits, rels, rid, toast } from './01-core.js';
import { closeModal, modal } from './03-object-modals.js';
import { RACKABLE, TYPE_U, bindUser, rackCheck, rackOf, who } from './04-settings.js';
import { flushSave, render } from './07-render-plans.js';
import { openObj } from './02-views.js';
/* ---------- new object ---------- */
/* Objects that can be plugged in: everything except racks and virtual machines. */
/* A retired device is kept for the record, so it is not offered as something to connect to. */
export const linkCandidates = () => objs.filter(o => o.type !== 'rack' && o.status !== 'retired' && !(o.type === 'server' && o.kind === 'vm'));
/* The device an object is plugged into (its first connection), if any. */
export const plugOf = o => { const r = rels.find(x => x.from === o.id && ['connected','attached'].includes(x.kind)); return r ? byId(r.to) : null; };
export function newObjModal(pre={}){
  const c = pre.copy;
  modal(`<div class="mh">${c ? 'Duplicate ' + esc(c.code) : 'New object'}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="nExist">Existing object</label><div class="ctlrow"><select id="nExist"><option value="">None: create a new object</option>${linkCandidates().map(o => { const p = plugOf(o); return `<option value="${o.id}">${esc(o.name)} · ${esc(TYPES[o.type] ? TYPES[o.type].label : o.type)}${p ? ' · on ' + esc(p.name) : ''}</option>`; }).join('')}</select></div>
      <label for="nType">Type</label><select id="nType">${Object.entries(TYPES).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
      <label for="nName">Name</label><input id="nName" class="mono" placeholder="e.g. ZH-PC-0151">
      <label for="nModel">Model</label><input id="nModel" placeholder="e.g. HP EliteDesk 800 G9 Mini">
      <label for="nSerial">Serial number</label><input id="nSerial" class="mono">
      <label for="nLoc">Location</label><select id="nLoc">${LOCS.map(l => `<option>${esc(l)}</option>`).join('')}</select>
      <label for="nUp">Plug into</label><select id="nUp"><option value="">Nothing yet</option>${objs.filter(o => o.status !== 'retired' && (hasPorts(o) || ['sip', 'pc', 'notebook', 'patch'].includes(o.type))).map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select>
      <label for="nPort">Port</label><input id="nPort" class="mono" placeholder="e.g. 12, or P04 on a patch panel">
    </div><p class="note">The object gets its own code (INV-…). If a feed later finds the same serial number, it links to this object instead of creating a duplicate.</p></div>
    <div class="mf"><button id="nCancel">Cancel</button><button id="nOk" class="primary">Create</button></div>`, 'sm');
  if (c){ $('#nType').value = c.type; $('#nName').value = c.name.replace(/\d+$/, m => String(+m + 1).padStart(m.length, '0')); $('#nModel').value = c.model; $('#nLoc').value = c.loc; }
  if (pre.sw){ $('#nUp').value = pre.sw; $('#nPort').value = pre.port; }
  if (pre.name) $('#nName').value = pre.name;
  if (pre.type && TYPES[pre.type]) $('#nType').value = pre.type;
  if (pre.loc && LOCS.includes(pre.loc)) $('#nLoc').value = pre.loc;
  $('#nName').focus();
  $('#nCancel').onclick = closeModal;
  /* Picking an existing object turns the dialog into a link: its details are not changed, only where it is plugged. */
  $('#nExist').onchange = e => {
    const link = !!e.target.value;
    /* The details of a linked object are not shown, so only the plug and port are left to fill in. */
    ['nType', 'nName', 'nModel', 'nSerial', 'nLoc'].forEach(id => { $('#' + id).hidden = link; document.querySelector(`label[for="${id}"]`).hidden = link; });
    $('#nOk').textContent = link ? 'Link' : 'Create';
  };
  $('#nOk').onclick = () => {
    const ex = $('#nExist').value;
    if (ex){
      const e = byId(ex), upId = $('#nUp').value, pp = $('#nPort').value.trim();
      if (!upId){ toast('Pick what it is plugged into first.'); return; }
      const t = byId(upId);
      if (e.id === t.id){ toast('An object cannot be plugged into itself.'); return; }
      if (rels.some(r => r.from === e.id && r.to === t.id)){ toast(`${e.name} is already plugged into ${t.name}.`); return; }
      const val = pp ? (t.type === 'patch' ? patchPort(pp) : (hasPorts(t) && /^\d+$/.test(pp) ? +pp : pp)) : null;
      if (val != null) releaseRetiredPort(t, val);
      if (val != null && rels.some(r => r.to === t.id && String(r.port) === String(val))){ toast(`${val} on ${t.name} is already taken.`); return; }
      rels.push({id:'r'+rid(), from:e.id, to:t.id, kind: e.type === 'monitor' ? 'attached' : 'connected', port: val, vlan:null});
      hist(e, now(), `Plugged into ${t.name}${val != null ? ' port ' + val : ''} by ${who()}`);
      closeModal(); toast(e.name + ' is plugged into ' + t.name); render(); return;
    }
    const name = $('#nName').value.trim();
    if (!name){ $('#nName').focus(); $('#nName').placeholder = 'A name is needed, e.g. ZH-PC-0151'; return; }
    const upId = $('#nUp').value;
    if (upId && $('#nPort').value.trim()){
      const t = byId(upId), pp = $('#nPort').value.trim();
      const val = t.type === 'patch' ? patchPort(pp) : (hasPorts(t) && /^\d+$/.test(pp) ? +pp : pp);
      releaseRetiredPort(t, val);
      if (rels.some(r => r.to === t.id && String(r.port) === String(val))){ toast(`${val} on ${t.name} is already taken.`); return; }
    }
    const o = O($('#nType').value, name, {model:$('#nModel').value || '—', serial:$('#nSerial').value, loc:$('#nLoc').value});
    if (o.type === 'switch') Object.assign(o, {ports:24, sfp:4, pfx:'1/'});
    else if (PORTED.includes(o.type)) o.ports = o.type === 'server' ? 4 : 8;
    if (o.type === 'patch') o.ports = 24;
    objs.push(o); bindUser(o); hist(o, now(), 'Created manually by ' + who());
    const up = $('#nUp').value;
    /* The port is saved as it was checked above: a patch panel's port as P04, so it shows on the panel and cannot be taken twice. */
    if (up){ const t = byId(up); let p = $('#nPort').value.trim(); if (p && t.type === 'patch') p = patchPort(p); else if (/^\d+$/.test(p) && hasPorts(t)) p = +p;
      rels.push({id:'r'+rid(), from:o.id, to:up, kind: o.type === 'monitor' ? 'attached' : 'connected', port: p || null, vlan:null}); }
    if (c){
      ['kind','os','cpu','ram','fw','ports','sfp','pfx','cap','proto'].forEach(k => { if (c[k] !== undefined && (o[k] === undefined || ['ports','sfp','pfx'].includes(k))) o[k] = c[k]; });
      if (c.software) o.software = c.software.map(x => ({...x}));
      /* A LAG belongs to one device, so a LAG link is not copied; a single port is not copied to a port that is taken. */
      rels.filter(r => r.from === c.id && r.lag == null && r.fromLag == null).forEach(r => rels.push({...r, id:'r'+rid(), from:o.id, port: (hasPorts(byId(r.to)) || byId(r.to).type === 'patch') ? null : r.port}));
      if (c.rack && rackOf(c.rack) && RACKABLE.includes(o.type)){
        const h = c.h || TYPE_U[o.type] || 1; let placed = false;
        for (let top = rackUnits(rackOf(c.rack)); top >= h && !placed; top--){
          if (!rackCheck(c.rack, top - h + 1, h, o.id)){ Object.assign(o, {rack: c.rack, u: top - h + 1, h}); placed = true; }
        }
        if (!placed) toast('No free U in ' + rackOf(c.rack).name + '. Copied without a rack position.');
      }
      hist(o, now(), 'Duplicated from ' + c.code);
    }
    closeModal(); toast('Created ' + name); flushSave(); openObj(o.id);
  };
}






