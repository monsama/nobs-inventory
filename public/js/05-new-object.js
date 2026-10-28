import { lagOfPort, hasPorts, patchPort, releaseRetiredPort, PORTED, $, LOCS, O, TYPES, byId, esc, hist, now, objs, rackUnits, rels, rid, st, toast } from './01-core.js';
import { closeModal, comboHtml, modal } from './03-object-modals.js';
import { RACKABLE, TYPE_U, bindUser, rackCheck, rackOf, who } from './04-settings.js';
import { flushSave, render } from './07-render-plans.js';
import { openObj } from './02-views.js';
/* ---------- new object ---------- */
/* Objects that can be plugged in: everything except racks and virtual machines. */
/* A retired device is kept for the record, so it is not offered as something to connect to. */
export const linkCandidates = () => objs.filter(o => o.type !== 'rack' && o.status !== 'retired' && !(o.type === 'server' && o.kind === 'vm'));
/* The device an object is plugged into (its first connection), if any. */
export const plugOf = o => { const r = rels.find(x => x.from === o.id && ['connected','attached'].includes(x.kind)); return r ? byId(r.to) : null; };
/* Examples for the name and model of each type, so the form says what is expected. */
const EXAMPLES = {
  pc: ['ZH-PC-0151', 'HP EliteDesk 800 G9 Mini'], notebook: ['ZH-NB-0151', 'Lenovo ThinkPad T14 Gen 5'], server: ['ZH-SRV-01', 'HPE ProLiant DL380 Gen11'],
  vm: ['ZH-VM-APP01', 'Windows Server 2022'], switch: ['ZH-SW-2OG-01', 'Aruba 6300M 48G'], router: ['ZH-RT-01', 'Cisco ISR 1100'],
  firewall: ['ZH-FW-01', 'Fortinet FortiGate 100F'], accesspoint: ['ZH-AP-2OG-01', 'Aruba AP-515'], printer: ['ZH-PRN-2OG-01', 'HP LaserJet Pro M404'],
  monitor: ['MON-0412', 'Dell P2422H'], sip: ['Phone 2OG-12', 'Yealink T54W'], pbx: ['ZH-PBX-01', 'Alcatel-Lucent OXO Connect'],
  rack: ['ZH-RACK-01', 'APC NetShelter SX 42U'], patch: ['ZH-PP-2OG-01', 'Cat6A, 24 ports'], plc: ['Line 3 PLC', 'Siemens S7-1500'],
  camera: ['CAM-Entrance', 'Hikvision DS-2CD2643G1'], bmc: ['ZH-SRV-01-ILO', 'HPE iLO 6'], storage: ['ZH-NAS-01', 'Synology RS1221+'],
  modem: ['ZH-MODEM-01', 'Zyxel VMG8825'], android: ['Phone A. Muster', 'Samsung Galaxy S24'], ios: ['iPhone A. Muster', 'iPhone 15'], mobile: ['Scanner 3', 'Zebra TC52'],
};
/* How a new object of a type is connected: a monitor is attached to a computer, a virtual machine runs on a server, a rack
   or patch panel is not plugged into anything; everything else is plugged into a switch, patch panel, phone or computer. */
export const LINK_OF = type => type === 'monitor' ? {kind: 'attached', label: 'Attached to', port: false, ok: o => ['pc', 'notebook', 'server'].includes(o.type)}
  : type === 'vm' ? {kind: 'hosted', label: 'Runs on', port: false, ok: o => o.type === 'server' && o.kind !== 'vm'}
  : ['rack', 'patch'].includes(type) ? null
  : {kind: 'connected', label: 'Plug into', port: true, ok: o => hasPorts(o) || ['sip', 'pc', 'notebook', 'patch'].includes(o.type)};
/* The port field: typed, or picked from the free ports of the device chosen in the select named by of (see freePorts).
   A problem with the port is said under the field, not in a message elsewhere. */
const portField = (id, of) => `<label for="${id}">Port</label>${comboHtml(`<input id="${id}" class="mono" data-combo="port" data-port-of="${of}" placeholder="Type or pick a free port" aria-describedby="${id}Note">`, id)}
      <span class="pnote-gap" hidden></span><p class="fieldnote warn" id="${id}Note" role="alert" hidden></p>`;
const portNote = (id, msg) => { const n = $('#' + id + 'Note'); if (!n) return; n.textContent = msg || ''; n.hidden = !msg; n.previousElementSibling.hidden = !msg; if (msg) $('#' + id).focus(); };
export function newObjModal(pre={}){
  const c = pre.copy;
  /* Opened on a device's page: that device's place, and it is offered to plug into when it can take the new one. */
  const ctx = byId(st.tab);
  modal(`<div class="mh">${c ? 'Duplicate ' + esc(c.code) : 'New object'}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="nType">Type</label><select id="nType">${Object.entries(TYPES).map(([k,v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select>
      <label for="nName">Name</label><input id="nName" class="mono" placeholder="e.g. ZH-PC-0151">
      <label for="nModel">Model</label><input id="nModel" placeholder="e.g. HP EliteDesk 800 G9 Mini">
      <label for="nSerial">Serial number</label><input id="nSerial" class="mono">
      <label for="nLoc">Location</label><select id="nLoc"><option value="">No location</option>${LOCS.map(l => `<option>${esc(l)}</option>`).join('')}</select>
      ${LOCS.length ? '' : '<span></span><p class="fieldnote">No locations yet: add your sites and rooms under Settings → Locations.</p>'}
      <label for="nUnits" hidden>Height (U)</label><input id="nUnits" type="number" min="1" max="60" value="42" hidden>
      <label for="nUp">Plug into</label><select id="nUp"></select>
      ${portField('nPort', 'nUp')}
    </div><p class="note">The object gets its own code (INV-…). If a feed later finds the same serial number, it links to this object instead of creating a duplicate.</p></div>
    <div class="mf"><button id="nCancel">Cancel</button><button id="nOk" class="primary">Create</button></div>`, 'sm');
  if (c){ $('#nType').value = c.type; $('#nName').value = c.name.replace(/\d+$/, m => String(+m + 1).padStart(m.length, '0')); $('#nModel').value = c.model; $('#nLoc').value = c.loc; }
  if (pre.name) $('#nName').value = pre.name;
  if (pre.type && TYPES[pre.type]) $('#nType').value = pre.type;
  const loc = pre.loc || (!c && ctx && ctx.loc) || '';
  if (loc && LOCS.includes(loc)) $('#nLoc').value = loc;
  /* The form follows the type: its examples, how it is connected, and a rack's height. */
  const show = (id, on) => { const el = $('#' + id); el.hidden = !on; if (el.closest('.combo')) el.closest('.combo').hidden = !on; document.querySelector(`label[for="${id}"]`).hidden = !on; if (!on && id === 'nPort') portNote('nPort', ''); };
  const fitType = () => {
    const type = $('#nType').value, ex = EXAMPLES[type] || ['', ''], link = LINK_OF(type), keep = $('#nUp').value;
    $('#nName').placeholder = ex[0] ? 'e.g. ' + ex[0] : 'A name';
    $('#nModel').placeholder = ex[1] ? 'e.g. ' + ex[1] : 'Model';
    show('nUnits', type === 'rack');
    show('nUp', !!link); show('nPort', !!(link && link.port));
    if (link){
      document.querySelector('label[for="nUp"]').textContent = link.label;
      $('#nUp').innerHTML = `<option value="">Nothing yet</option>${objs.filter(o => o.status !== 'retired' && link.ok(o)).map(o => `<option value="${esc(o.id)}">${esc(o.name)}${TYPES[o.type] ? ' · ' + esc(TYPES[o.type].short) : ''}</option>`).join('')}`;
      if ([...$('#nUp').options].some(x => x.value === keep)) $('#nUp').value = keep;
    } else $('#nUp').value = '';
  };
  fitType();
  if (pre.sw){ $('#nUp').value = pre.sw; $('#nPort').value = pre.port; }
  else if (!c && ctx && [...$('#nUp').options].some(x => x.value === ctx.id)) $('#nUp').value = ctx.id;
  $('#nUp').addEventListener('change', () => portNote('nPort', ''));
  $('#nPort').addEventListener('input', () => portNote('nPort', ''));
  $('#nType').onchange = fitType;
  $('#nName').focus();
  $('#nCancel').onclick = closeModal;
  $('#nOk').onclick = () => {
    const name = $('#nName').value.trim();
    if (!name){ $('#nName').focus(); $('#nName').placeholder = 'A name is needed, e.g. ZH-PC-0151'; return; }
    const upId = $('#nUp').value;
    if (upId && !$('#nPort').hidden && $('#nPort').value.trim()){
      const t = byId(upId), pp = $('#nPort').value.trim();
      const val = t.type === 'patch' ? patchPort(pp) : (hasPorts(t) && /^\d+$/.test(pp) ? +pp : pp);
      /* As in Link…: a numbered port must be one the device has, or it would be counted but never shown. */
      if (typeof val === 'number' && t.ports > 0 && (val < 1 || val > (t.ports || 0) + (t.sfp || 0))){ portNote('nPort', `${t.name} has ports 1 to ${(t.ports || 0) + (t.sfp || 0)}.`); return; }
      releaseRetiredPort(t, val);
      if (rels.some(r => r.to === t.id && String(r.port) === String(val))){ portNote('nPort', `Port ${val} on ${t.name} is already taken. Pick a free one from the list.`); return; }
      if (lagOfPort(t, val)){ portNote('nPort', `Port ${val} on ${t.name} is part of the LAG ${lagOfPort(t, val).name}. Link the LAG instead, from the device's Relations.`); return; }
    }
    const o = O($('#nType').value, name, {model:$('#nModel').value.trim(), serial:$('#nSerial').value, loc:$('#nLoc').value});
    if (o.type === 'switch') Object.assign(o, {ports:24, sfp:4, pfx:'1/'});
    else if (PORTED.includes(o.type)) o.ports = o.type === 'server' ? 4 : 8;
    if (o.type === 'patch') o.ports = 24;
    if (o.type === 'rack'){ const u = +$('#nUnits').value; if (Number.isInteger(u) && u >= 1 && u <= 60) o.units = u; }
    objs.push(o); bindUser(o); hist(o, now(), 'Created manually by ' + who());
    const up = $('#nUp').value;
    /* The port is saved as it was checked above: a patch panel's port as P04, so it shows on the panel and cannot be taken twice. */
    if (up){ const t = byId(up); let p = $('#nPort').value.trim(); if (p && t.type === 'patch') p = patchPort(p); else if (/^\d+$/.test(p) && hasPorts(t)) p = +p;
      const link = LINK_OF(o.type) || {kind: 'connected', port: true};
      rels.push({id:'r'+rid(), from:o.id, to:up, kind: link.kind, port: link.port ? p || null : null, vlan:null}); }
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






/* How an existing object is linked: a server that is a virtual machine runs on a server too. */
const linkOf = o => LINK_OF(o.type === 'server' && o.kind === 'vm' ? 'vm' : o.type);
/* Link object: connect an object that already exists. How it is linked follows its type: a monitor is attached to a
   computer, a virtual machine runs on a server, anything else is plugged into a port. Its details are not changed. */
export function linkObjModal(pre = {}){
  /* From a free port (pre.to, pre.port): only what plugs into a port, and devices not plugged in anywhere yet first. */
  const into = pre.to ? byId(pre.to) : null;
  const list = linkCandidates().concat(objs.filter(o => o.status !== 'retired' && o.type === 'server' && o.kind === 'vm')).filter(o => linkOf(o))
    .filter(o => !into || (o.id !== into.id && linkOf(o).port && linkOf(o).ok(into)));
  if (!list.length){ toast(into ? 'No device here can be plugged in yet: use New device… instead.' : 'There is nothing to link yet. Create an object first.'); return; }
  const where = o => { const p = plugOf(o) || (rels.find(r => r.from === o.id && r.kind === 'hosted') ? byId(rels.find(r => r.from === o.id && r.kind === 'hosted').to) : null); return p ? ' · now on ' + esc(p.name) : ''; };
  modal(`<div class="mh">Link object</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="lkObj">Object</label><select id="lkObj">${list.sort((a, b) => (into ? (plugOf(a) ? 1 : 0) - (plugOf(b) ? 1 : 0) : 0) || a.name.localeCompare(b.name)).map(o => `<option value="${esc(o.id)}">${esc(o.name)} · ${esc(TYPES[o.type] ? TYPES[o.type].label : o.type)}${where(o)}</option>`).join('')}</select>
      <label for="lkTo">Plug into</label><select id="lkTo"></select>
      ${portField('lkPort', 'lkTo')}
    </div><p class="note" id="lkNote">Only the link is added; the object's details stay as they are.</p></div>
    <div class="mf"><button id="lkCancel">Cancel</button><button id="lkOk" class="primary">Link</button></div>`, 'sm');
  /* Opened on a device's page: that device is the one to link, or, when it cannot be linked itself (a switch), the one to
     link to. */
  const ctx = byId(st.tab), obj = pre.obj || (ctx && list.some(o => o.id === ctx.id) ? ctx.id : null);
  if (obj && list.some(o => o.id === obj)) $('#lkObj').value = obj;
  const fit = () => {
    const o = byId($('#lkObj').value), link = linkOf(o), keep = $('#lkTo').value;
    document.querySelector('label[for="lkTo"]').textContent = link.label;
    $('#lkTo').innerHTML = objs.filter(t => t.id !== o.id && t.status !== 'retired' && link.ok(t)).map(t => `<option value="${esc(t.id)}">${esc(t.name)}${TYPES[t.type] ? ' · ' + esc(TYPES[t.type].short) : ''}</option>`).join('') || '<option value="">Nothing to link to</option>';
    if ([...$('#lkTo').options].some(x => x.value === keep)) $('#lkTo').value = keep;
    $('#lkPort').hidden = $('#lkPort').closest('.combo').hidden = document.querySelector('label[for="lkPort"]').hidden = !link.port;
    portNote('lkPort', '');
  };
  fit();
  if (ctx && !obj && [...$('#lkTo').options].some(x => x.value === ctx.id)) $('#lkTo').value = ctx.id;
  if (into){ $('#lkTo').value = into.id; if (pre.port != null) $('#lkPort').value = String(pre.port); }
  $('#lkTo').addEventListener('change', () => portNote('lkPort', ''));
  $('#lkPort').addEventListener('input', () => portNote('lkPort', ''));
  $('#lkObj').onchange = fit;
  $('#lkObj').focus();
  $('#lkCancel').onclick = closeModal;
  $('#lkOk').onclick = () => {
    const e = byId($('#lkObj').value), link = linkOf(e), t = byId($('#lkTo').value), pp = link.port ? $('#lkPort').value.trim() : '';
    if (!t){ toast('There is nothing it can be linked to yet.'); return; }
    if (rels.some(r => r.from === e.id && r.to === t.id)){ toast(`${e.name} is already linked to ${t.name}.`); return; }
    const val = pp ? (t.type === 'patch' ? patchPort(pp) : (hasPorts(t) && /^\d+$/.test(pp) ? +pp : pp)) : null;
    if (typeof val === 'number' && t.ports > 0 && (val < 1 || val > (t.ports || 0) + (t.sfp || 0))){ portNote('lkPort', `${t.name} has ports 1 to ${(t.ports || 0) + (t.sfp || 0)}.`); return; }
    if (val != null) releaseRetiredPort(t, val);
    if (val != null && rels.some(r => r.to === t.id && String(r.port) === String(val))){ portNote('lkPort', `Port ${val} on ${t.name} is already taken. Pick a free one from the list.`); return; }
    if (val != null && lagOfPort(t, val)){ portNote('lkPort', `Port ${val} on ${t.name} is part of the LAG ${lagOfPort(t, val).name}. Link the LAG instead, from the device's Relations.`); return; }
    rels.push({id: 'r' + rid(), from: e.id, to: t.id, kind: link.kind, port: val, vlan: null});
    const verb = {attached: 'Attached to', hosted: 'Runs on', connected: 'Plugged into'}[link.kind];
    hist(e, now(), `${verb} ${t.name}${val != null ? ' port ' + val : ''} by ${who()}`);
    closeModal(); toast(`${e.name}: ${verb.toLowerCase()} ${t.name}`); render();
  };
}
