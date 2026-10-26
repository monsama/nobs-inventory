import { bindDeviceContracts, bindLicences, deviceContractsPanel, licenceMark, licencesFor, licencesPanel } from './09-costs.js';
import { O, COSTS, FEED_EXTRA, FEED_EXTRA_HINT, SUBNETS, WARRANTY_SOON_DAYS, warrantyState } from './01-core.js';
import { freeAddress, ipInt, rangeKeptOut, subnetSpan } from './net.js';
import { lsLive, SCAN_ONLY, scanOld, scanChip, dayText, isAttached, MODELS, modelNames, DOMAINS, FIELD_LAYOUT, KIND_HINTS, patchPort, TYPE_FIELDS, VLANS, releaseRetiredPort, fullTextTooltips, feedLinked, vlanLabel, hasPorts, $, FIELD_LABEL, HISTORY, KINDS, KIND_TARGETS, LOCS, LS_ON, STATUS, TYPES, byId, esc, feedOwns, hist, now, objs, pad2, pathUp, pfxOf, portLabel, rackUnits, racksList, rels, relsOf, rid, st, syncChip, syncOf, tcol, tico, toast, used } from './01-core.js';
import { queueServerSave, render } from './07-render-plans.js';
import { USERS, applyRole, canEdit, checkAddress, mountModal, rackCheck, rackFields, who } from './04-settings.js';
import { newObjModal } from './05-new-object.js';
import { openObj } from './02-views.js';
/* ---------- racks ---------- */
/* A new rack: what a rack has (its name, room, height in U and optionally its model and serial number), nothing more.
   It is shown in Racks right away. */
export function rackNewModal(){
  const n = racksList().length + 1;
  modal(`<div class="mh">New rack</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="rnName">Name</label><input id="rnName" class="mono" maxlength="80" placeholder="e.g. ZH-RACK-${String(n).padStart(2, '0')}">
      <label for="rnLoc">Room</label><select id="rnLoc">${LOCS.length ? LOCS.map(l => `<option>${esc(l)}</option>`).join('') : '<option value="">No rooms yet</option>'}</select>
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
    const o = O('rack', name, {model: $('#rnModel').value.trim() || '—', serial: $('#rnSerial').value.trim(), loc: $('#rnLoc').value, units});
    objs.push(o); hist(o, now(), 'Created manually by ' + who());
    st.rackId = o.id; st.tab = 'rack'; queueServerSave(); closeModal(); toast(name + ' added'); render();
  };
  $('#rnName').focus();
}
export function renderRack(){
  const racks = racksList();
  const R_ = racks.find(r => r.id === st.rackId) || racks[0];
  if (!R_){
    $('#toolbar').innerHTML = '';
    $('#view').innerHTML = `<div class="empty">No racks yet. A rack is an object of the type Rack.${canEdit() ? ' <button class="primary" id="rackNew">New rack</button>' : ''}</div>`;
    const b = $('#rackNew'); if (b) b.onclick = rackNewModal;
    return;
  }
  st.rackId = R_.id;   /* the rack on screen is the one Mount uses */
  const inRack = objs.filter(o => o.rack === R_.id);
  const slotted = inRack.filter(o => o.u != null && !o.ontop);
  $('#toolbar').innerHTML = `<label class="muted" for="rkSel">Rack</label><select id="rkSel">${racks.map(r => `<option value="${r.id}" ${r.id===R_.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select>
    ${canEdit() ? '<button id="rkNew">New rack</button>' : ''}<button id="rkOpen" title="The rack's own page: location, model, warranty, history">Open rack</button>
    <span class="muted hide-n">${esc(R_.loc)} · ${slotted.reduce((n,o) => n + (o.h||1), 0)} of ${rackUnits(R_)} U used</span><div class="grow"></div>
    <button id="rkMount">Mount device…</button>`;
  $('#rkSel').onchange = e => { st.rackId = e.target.value; render(); };
  const rn = $('#rkNew'); if (rn) rn.onclick = rackNewModal;
  $('#rkOpen').onclick = () => openObj(R_.id);
  $('#rkMount').onclick = mountModal;
  const cells = [];
  for (let n = rackUnits(R_); n >= 1; n--){
    const top = inRack.find(o => o.u + (o.h || 1) - 1 === n);
    if (top){
      const h = top.h || 1, sitting = objs.filter(x => x.ontop === top.id);
      const sub = top.type === 'patch' ? (top.ports || 24) + ' ports · ' + used(top) + ' used' : top.type === 'switch' ? (top.ports || 0) + '+' + (top.sfp || 0) + ' ports · ' + used(top) + ' used' : top.type === 'storage' ? [top.cap, top.proto].filter(Boolean).join(' · ') : top.model;
      cells.push(`<div class="unit${h === 1 ? ' one' : ''}" data-open="${top.id}" style="grid-row:${rackUnits(R_) - n + 1} / span ${h};--c:${tcol(top.type)}" title="${esc(top.name)}">
        <span class="nm">${esc(top.name)}</span><span class="sub">${esc(top.code)} · ${esc(sub)}${sitting.length ? ' · on top: ' + sitting.map(x => esc(x.name)).join(', ') : ''}</span></div>`);
      n -= h - 1;
    }
  }
  for (let n = rackUnits(R_); n >= 1; n--){
    const row = rackUnits(R_) - n + 1;
    const occupied = inRack.some(o => n >= o.u && n <= o.u + (o.h || 1) - 1);
    cells.push(`<div class="uno" style="grid-row:${row};grid-column:1">U${n}</div>`);
    if (!occupied) cells.push(`<div class="slot" style="grid-row:${row};grid-column:2"></div>`);
  }
  $('#view').innerHTML = `<div class="rackbox">
    <div class="rack" style="grid-template-rows:repeat(${rackUnits(R_)},24px)">${cells.join('')}</div>
    <div class="rackside">
      <div class="panelbox"><div class="hdr">${esc(R_.name)}</div>
        <dl class="lsbox"><dt>Location</dt><dd style="font-family:inherit">${esc(R_.loc)}</dd><dt>Height</dt><dd>${rackUnits(R_)} U</dd><dt>Devices</dt><dd>${inRack.length}</dd></dl>
        <div class="addrel" style="flex-direction:column;align-items:stretch">${inRack.slice().sort((a,b) => (b.u||0) - (a.u||0)).map(o => `<button class="item" data-open="${o.id}" style="height:auto;padding:4px 6px"><span class="sw" style="background:${tcol(o.type)}"></span><span class="lbl mono">${o.ontop ? 'on ' + esc(byId(o.ontop).name) : 'U' + o.u + (o.h>1 ? '–' + (o.u+o.h-1) : '')}  ${esc(o.name)}</span></button>`).join('') || '<span class="muted">No devices in this rack yet. Use Mount device… above.</span>'}</div>
      </div>
    </div></div>`;
}

/* ---------- object page ---------- */
export const FIELDS = {
  base:[['name','Name','mono'],['purpose','Purpose'],['type','Type','type'],['model','Model'],['serial','Serial number','mono'],['loc','Location','loc'],['status','Status','status'],['user','User / owner','user'],['purchased','Purchased','date'],['warranty','Warranty ends','date'],['price','Price','money'],['supplier','Supplier'],['invoice','Invoice no.','mono']],
  net:[['ip','IP address','mono'],['subnet','Subnet','subnet'],['dhcp','Address from','dhcp'],['gateway','Gateway','mono'],['dns','DNS servers','mono'],['ip6','IPv6 address','mono'],['mac','MAC address','mono']],
  pc:[['os','Operating system'],['domain','Domain','domain'],['fw','Firmware'],['boot','Last power event'],['disk','Disks'],['av','Antivirus']], notebook:[['os','Operating system'],['domain','Domain','domain'],['fw','Firmware'],['boot','Last power event'],['disk','Disks'],['av','Antivirus']], server:[['kind','Kind','kind'],['os','Operating system'],['domain','Domain','domain'],['cpu','CPU'],['ram','Memory'],['fw','Firmware'],['boot','Last power event'],['disk','Disks'],['av','Antivirus'],['ports','Ports','mono'],['pfx','Port naming','mono']],
  sip:[['ext','Extension','mono'],['fw','Firmware','mono']], mobile:[['os','Operating system']], android:[['os','Operating system']], ios:[['os','Operating system']], rack:[['units','Height (U)','mono']],
  switch:[['os','Firmware'],['ports','Copper ports','mono'],['sfp','SFP ports','mono'],['pfx','Port naming','mono']],
  router:[['os','Firmware'],['ports','Ports','mono'],['pfx','Port naming','mono']], firewall:[['os','Firmware'],['ports','Ports','mono'],['pfx','Port naming','mono']],
  patch:[['ports','Ports','mono']], storage:[['cap','Capacity','mono'],['proto','Protocol','mono']],
  accesspoint:[['ssid','Wi-Fi networks']], bmc:[['fw','Firmware']],
  monitor:[], printer:[], other:[]
};
/* Types without a network address of their own: a monitor hangs off a PC, a rack and a patch panel are passive. */
export const NO_NET_TYPES = ['monitor', 'rack', 'patch'];
/* The built-in fields of a type: everyone's, the network ones unless the type has no address, and the type's own. */
export const typeFieldsOf = type => [...FIELDS.base.filter(f => !(f[0] === 'user' && NO_USER_TYPES.includes(type))), ...(NO_NET_TYPES.includes(type) ? [] : FIELDS.net), ...(FIELDS[type] || [])];
/* Types nobody uses as a person's device: a rack and a patch panel have no user. */
export const NO_USER_TYPES = ['rack', 'patch'];
/* Network ports can be added to a device of a type that has an address but no ports of its own (a PC, a printer). */
export const canAddPorts = type => !NO_NET_TYPES.includes(type) && !(FIELDS[type] || []).some(f => f[0] === 'ports');
/* Accessories of a PC (headset, dock, keyboard…): each has a name, a kind and an optional serial number. */
export function accessoriesHtml(o){
  const list = (o.accessories || []).map((a, i) => `<div class="entry"><div class="entry-head"><b>${esc(a.name)}</b>${a.kind ? ` <span class="chip">${esc(a.kind)}</span>` : ''}${a.serial ? ` <span class="mono muted">${esc(a.serial)}</span>` : ''}<button class="icon ghost" data-delacc="${i}" aria-label="Remove ${esc(a.name)}" title="Remove">×</button></div></div>`).join('');
  return `<div class="entries-box">${list || '<p class="note">No attachments yet.</p>'}
    <div class="addrel entry-add"><input id="accName" maxlength="120" placeholder="Name, e.g. Headset" aria-label="Name of the attachment"><input id="accKind" maxlength="60" placeholder="Kind, e.g. Dock" aria-label="Kind of the attachment"><input id="accSerial" maxlength="60" class="mono" placeholder="Serial (optional)" aria-label="Serial number of the attachment"><button id="accAdd">Add</button></div></div>`;
}
/* Notes and attachments: each entry has a title, a text and an optional link (a document on a share, a web page). */
export function entriesHtml(o){
  const list = (o.entries || []).map((e, i) => `<div class="entry"><div class="entry-head"><b>${esc(e.title)}</b>${e.link ? ` <a class="link" href="${esc(e.link)}" target="_blank" rel="noopener">Open attachment</a>` : ''}<button class="icon ghost" data-delentry="${i}" aria-label="Remove ${esc(e.title)}" title="Remove">×</button></div>${e.text ? `<div class="entry-text">${esc(e.text)}</div>` : ''}</div>`).join('');
  return `<div class="entries-box">${list || '<p class="note">No notes yet.</p>'}
    <div class="addrel entry-add"><input id="enTitle" maxlength="120" placeholder="Title, e.g. Warranty" aria-label="Title of the note"><input id="enText" maxlength="2000" placeholder="Text (optional)" aria-label="Text of the note"><input id="enLink" maxlength="500" placeholder="Link, https://…" aria-label="Attachment link"><button id="enAdd">Add</button></div></div>`;
}
export function fieldCtl(o, [k, label, kind], idp = 'f_'){
  const id = idp + o.id + '_' + k;
  let ctl;
  /* No location is a choice of its own, and a location no longer in the list is kept: saving any other field must not move the device. */
  if (kind === 'loc') ctl = `<select id="${id}" data-k="${k}"><option value="" ${o.loc ? '' : 'selected'}>No location</option>${(o.loc && !LOCS.includes(o.loc) ? [o.loc, ...LOCS] : LOCS).map(l => `<option ${l===o.loc?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
  else if (kind === 'kind') ctl = `<select id="${id}" data-k="${k}"><option value="physical" ${o.kind!=='vm'?'selected':''}>Physical</option><option value="vm" ${o.kind==='vm'?'selected':''}>Virtual machine</option></select>`;
  else if (kind === 'user') ctl = `<select id="${id}" data-k="user"><option value="">Unassigned</option><option value="__hotdesk" ${o.hotdesk?'selected':''}>Hot desk (shared)</option>${USERS.map(u => `<option value="${u.id}" ${!o.hotdesk && u.id===o.uid?'selected':''}>${esc(u.name)}</option>`).join('')}</select>`;
  else if (kind === 'type') ctl = `<select id="${id}" data-k="type">${Object.entries(TYPES).map(([t, v]) => `<option value="${t}" ${t === o.type ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`;
  else if (kind === 'subnet'){
    /* A subnet is picked from those whose device types include this device. The address is then taken from its ranges. */
    const cur = o[k] || '';
    const opts = SUBNETS.filter(n => (n.types || []).includes(o.type) || n.cidr === cur);
    /* Without a subnet picked, the one the address is in applies by itself, shown as the first choice. */
    const auto = cur ? null : subnetFor(o);
    const sn = SUBNETS.find(n => n.cidr === cur) || auto;
    /* The VLAN of the subnet is shown beside it, with its gateway and DNS servers as a tooltip. */
    const vlanChip = sn && sn.vid != null ? `<span class="chip" title="Gateway ${esc(sn.gateway || '—')} · DNS ${esc((sn.dns || []).join(', ') || '—')}">VLAN ${sn.vid}</span>` : '';
    ctl = `<select id="${id}" data-k="${k}"><option value="">${auto ? `Auto: ${esc(auto.name)} · ${esc(auto.cidr)} (from the address)` : 'None'}</option>${opts.map(n => `<option value="${esc(n.cidr)}" ${n.cidr === cur ? 'selected' : ''}>${esc(n.name)} · ${esc(n.cidr)}</option>`).join('')}</select>${vlanChip}<button type="button" data-pick="${o.id}" ${sn ? '' : 'disabled'}>Pick from range</button>`;
  }
  else if (kind === 'domain'){
    /* A domain is picked from the list in Settings. One that is on the object but not in the list still shows, so nothing is lost. */
    const cur = o[k] || '';
    const opts = [...new Set([...DOMAINS.map(d => d.name), cur].filter(Boolean))];
    ctl = `<select id="${id}" data-k="${k}"><option value="">None</option>${opts.map(d => `<option ${d === cur ? 'selected' : ''} title="${esc((DOMAINS.find(x => x.name === d) || {}).desc || '')}">${esc(d)}</option>`).join('')}</select>`;
  }
  else if (kind === 'dhcp') ctl = `<select id="${id}" data-k="${k}"><option value="" ${o.dhcp ? '' : 'selected'}>Not known</option><option value="dhcp" ${o.dhcp === 'dhcp' ? 'selected' : ''}>DHCP</option><option value="static" ${o.dhcp === 'static' ? 'selected' : ''}>Static</option></select>`;
  else if (kind === 'money') ctl = `<input id="${id}" data-k="${k}" inputmode="decimal" value="${typeof o[k] === 'number' ? o[k] : ''}" placeholder="0.00">`;
  else if (kind === 'date') ctl = `<input id="${id}" data-k="${k}" type="date" value="${esc(/^\d{4}-\d{2}-\d{2}$/.test(o[k] || '') ? o[k] : '')}">`;
  else if (kind === 'status') ctl = `<select id="${id}" data-k="${k}">${Object.entries(STATUS).map(([s,v]) => `<option value="${s}" ${s===o.status?'selected':''}>${v.label}</option>`).join('')}</select>`;
  else if (k === 'av') ctl = avCtl(o, id, true);
  else {
    const val = k.startsWith('custom.') ? (o.custom || {})[k.slice(7)] : o[k];
    /* A device without its own gateway or DNS servers uses those of its subnet: shown in grey, not stored on the device. */
    const from = (k === 'gateway' || k === 'dns') && !val ? subnetFor(o) : null;
    const inherited = from ? (k === 'gateway' ? from.gateway : (from.dns || []).join(', ')) : '';
    ctl = `<input id="${id}" data-k="${k}" ${kind==='number' ? 'type="number"' : ''} class="${kind==='mono'?'mono':''}${inherited ? ' inherit' : ''}" value="${esc(val ?? '')}"${inherited ? ` placeholder="${esc(inherited)} · from ${esc(from.name)}" title="From the subnet ${esc(from.name)}. Type a value to set one for this device."` : ''}>`;
    /* A model can be typed or picked from the models already on the devices, in the app's own list (a browser's suggestion
       list cannot be styled like the other dropdowns). A new one typed here is offered to the others once saved. */
    if (k === 'model') ctl = comboHtml(ctl.replace('<input ', `<input placeholder="Type or pick a model" aria-describedby="${id}_note" `), id);
  }
  return ctl;
}
/* Antivirus: one entry per product, as chips. A product can be added from the list of those seen on the devices and
   common ones, or typed; each chip can be removed. Kept on the device as one text, entries separated by "; ". */
export const avEntries = o => String(o.av || '').split(';').map(x => x.trim()).filter(Boolean);
export function avCtl(o, id, edit){
  const items = avEntries(o);
  /* The scan state Lansweeper adds ("scanning on, up to date") is only shown while the sync keeps it current. */
  const live = lsLive() && feedLinked(o);
  const label = x => live ? x : x.split(',')[0].trim();
  return `<div class="avpick">${items.map((x, i) => `<span class="avitem"${live || label(x) === x ? '' : ` title="${esc(x)}"`}>${esc(label(x))}${edit ? `<button type="button" class="avx" data-avx="${i}" aria-label="Remove ${esc(x)}" title="Remove">×</button>` : ''}</span>`).join('')}
    ${edit ? `<input type="hidden" id="${id}" data-k="av" value="${esc(o.av || '')}">${comboHtml(`<input id="${id}_add" data-combo="av" placeholder="${items.length ? 'Add another product' : 'Pick or type a product'}" aria-label="Add an antivirus product">`, id + '_add')}`
      : (items.length ? '' : '<span class="muted">None</span>')}</div>`;
}
const AV_COMMON = ['Microsoft Defender Antivirus', 'Microsoft Defender for Endpoint', 'Cortex XDR', 'CrowdStrike Falcon', 'SentinelOne', 'Sophos Intercept X',
  'ESET Endpoint Security', 'Trend Micro Apex One', 'Bitdefender GravityZone', 'Kaspersky Endpoint Security', 'Symantec Endpoint Protection', 'Trellix Endpoint Security', 'WithSecure Elements'];
/* Product names seen on the devices (without the scan state Lansweeper adds) and the common ones, sorted. */
const avNames = () => [...new Set([...objs.flatMap(x => avEntries(x).map(e => e.split(',')[0].trim())), ...AV_COMMON].filter(Boolean))].sort((a, b) => a.localeCompare(b));
/* A text field with a list to pick from: the field, an arrow that opens the list, and the list. */
export const comboHtml = (input, id) => `<div class="combo">${input.replace('<input ', `<input role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}_list" autocomplete="off" `)}<button type="button" class="combo-arrow" tabindex="-1" aria-label="Show the list"><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button><ul class="combo-list" id="${id}_list" role="listbox" hidden></ul></div>`;
/* One set of handlers for every combo on the page. Typing filters the list; arrows move, Enter picks, Escape closes.
   Picking fills the field; it is saved like a typed value, when the field is left. */
const COMBO_SOURCES = { model: () => modelNames(), av: () => avNames() };
const comboOf = el => el && el.closest && el.closest('.combo');
function comboOpen(c, all){
  const input = c.querySelector('input'), list = c.querySelector('.combo-list');
  if (input.disabled) return;
  const q = all ? '' : input.value.trim().toLowerCase();
  const items = (COMBO_SOURCES[input.dataset.combo || input.dataset.k] || (() => []))().filter(m => !q || m.toLowerCase().includes(q)).slice(0, 100);
  if (!items.length){ comboClose(c); return; }
  list.innerHTML = items.map((m, i) => `<li role="option" id="${list.id}_${i}" data-v="${esc(m)}" aria-selected="${m === input.value ? 'true' : 'false'}">${esc(m)}</li>`).join('');
  list.hidden = false; input.setAttribute('aria-expanded', 'true');
}
function comboClose(c){
  const input = c.querySelector('input'), list = c.querySelector('.combo-list');
  list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
}
function comboPick(c, li){ const input = c.querySelector('input'); input.value = li.dataset.v; comboClose(c); comboNote(input); input.focus(); input.dispatchEvent(new Event('combopick', {bubbles: true})); }
/* Under a model typed in: a model not in the list yet is new and is added when saved; one very like a model in the list
   is likely a typo, and the one in the list can be taken with one click. */
const squash = t => t.toLowerCase().replace(/[\s\-_.,/]+/g, '');
function editDistance(a, b){
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++){
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
export function closeModel(v, names){
  const q = squash(v); if (q.length < 4) return null;
  const same = names.find(m => squash(m) === q); if (same) return same;
  let best = null, bd = 3;
  for (const m of names){ const d = editDistance(q, squash(m)); if (d < bd){ bd = d; best = m; } }
  return bd <= (q.length >= 8 ? 2 : 1) ? best : null;
}
function comboNote(input){
  const note = document.getElementById(input.id + '_note'); if (!note) return;
  const v = input.value.trim(), names = (COMBO_SOURCES[input.dataset.k] || (() => []))();
  const show = on => { note.hidden = !on; if (note.previousElementSibling) note.previousElementSibling.hidden = !on; };   /* the note and its empty first column */
  if (!v || names.includes(v)){ show(false); note.innerHTML = ''; return; }
  const near = closeModel(v, names);
  note.className = 'fieldnote ' + (near ? 'warn' : 'muted');
  note.innerHTML = near ? `Did you mean ${esc(near)}? <button type="button" class="link combo-use" data-v="${esc(near)}">Use it</button>` : 'New model – added to the list when saved.';
  show(true);
}
document.addEventListener('input', e => { const c = comboOf(e.target); if (c && e.target.matches('input')){ comboOpen(c, false); comboNote(e.target); } });
/* "Use it": the model from the list replaces the one typed, and is saved like a pick. */
document.addEventListener('click', e => {
  const b = e.target.closest('.combo-use'); if (!b) return;
  const note = b.closest('.fieldnote'), input = document.getElementById(note.id.replace(/_note$/, ''));
  if (!input || input.disabled) return;
  input.value = b.dataset.v; comboNote(input); input.dispatchEvent(new Event('change', {bubbles: true})); input.focus();
});
document.addEventListener('mousedown', e => {
  const c = comboOf(e.target);
  document.querySelectorAll('.combo .combo-list:not([hidden])').forEach(l => { if (l.closest('.combo') !== c) comboClose(l.closest('.combo')); });
  if (!c) return;
  const li = e.target.closest('.combo-list li');
  if (li){ e.preventDefault(); comboPick(c, li); return; }
  if (e.target.closest('.combo-arrow')){ e.preventDefault(); const list = c.querySelector('.combo-list'); if (list.hidden){ comboOpen(c, true); c.querySelector('input').focus(); } else comboClose(c); }
});
document.addEventListener('keydown', e => {
  const c = comboOf(e.target); if (!c || !e.target.matches('input')) return;
  const list = c.querySelector('.combo-list'), items = [...list.querySelectorAll('li')];
  const at = items.findIndex(li => li.classList.contains('active'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
    e.preventDefault();
    if (list.hidden){ comboOpen(c, true); return; }
    const next = items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    items.forEach(li => li.classList.toggle('active', li === next));
    if (next){ next.scrollIntoView({block: 'nearest'}); e.target.setAttribute('aria-activedescendant', next.id); }
  } else if (e.key === 'Enter' && !list.hidden && at >= 0){ e.preventDefault(); comboPick(c, items[at]); }
  else if (e.key === 'Escape' && !list.hidden){ e.preventDefault(); e.stopPropagation(); comboClose(c); }
});
document.addEventListener('focusout', e => { const c = comboOf(e.target); if (c && !c.contains(e.relatedTarget)) setTimeout(() => { if (!c.contains(document.activeElement)) comboClose(c); }, 0); });
export const fieldKind = k => { const f = Object.values(FIELDS).flat().find(x => x[0] === k); return f ? f[2] : undefined; };
/* One row of Properties. For an object linked to Lansweeper, a field the feed fills in is read-only while "From feed" is
   ticked; untick it to edit the value here. */
document.addEventListener('click', e => document.querySelectorAll('details.fmenu[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }));
document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; const d = document.querySelector('details.fmenu[open]'); if (d){ d.open = false; d.querySelector('summary').focus(); } });
/* Fields every object keeps on its page: they cannot be hidden or cleared. */
export const FIXED_FIELDS = ['name', 'type', 'status', 'loc'];
/* Counts and sizes: emptying them is setting a number, so they are not offered to clear. */
const NO_CLEAR = ['ports', 'sfp', 'units'];
/* The ⋯ menu of a field on the object page: hide it on this device or on every device of the type, empty it, or,
   for a field of the type's own, delete it. A hidden field shown again through "Show hidden fields" offers to show it. */
export function fieldMenu(o, f, hiddenBy = ''){
  const k = f[0], t = TYPES[o.type] ? TYPES[o.type].label : o.type;
  if (FIXED_FIELDS.includes(k)) return '<span class="fm-slot" aria-hidden="true"></span>';
  const own = k.startsWith('custom.'), val = own ? (o.custom || {})[k.slice(7)] : o[k];
  const empty = val == null || val === '' || (k === 'user' && !o.uid && !o.hotdesk);
  const b = (act, text, extra = '') => `<button type="button" data-fm="${act}" data-fk="${esc(k)}" ${extra}>${text}</button>`;
  const items = hiddenBy === 'device' ? [b('show', 'Show on this device')]
    : hiddenBy === 'type' ? [b('showtype', `Show on every ${esc(t)}`)]
    : [b('hide', 'Hide on this device'), b('hidetype', `Hide on every ${esc(t)}`),
       NO_CLEAR.includes(k) ? '' : b('clear', 'Clear value…', empty ? 'disabled title="The field is empty"' : ''),
       own ? b('delete', `Delete field from ${esc(t)}…`) : ''];
  return `<details class="menu fmenu"><summary aria-label="Options for ${esc(f[1])}" title="Field options">⋯</summary><div class="menubox">${items.join('')}</div></details>`;
}
export function propRow(o, f, menu = ''){
  const k = f[0];
  const linked = LS_ON() && feedLinked(o) && !!FIELD_LABEL[k];
  const taken = linked && feedOwns(o, k);
  /* A field from Lansweeper can be typed over: the value typed is kept, and its From feed box is unticked. */
  const ctl = fieldCtl(o, f);
  /* Disks from Lansweeper show as bars under the field. */
  const bars = k === 'disk' ? diskBars(o.disk, lsLive() && feedLinked(o)) : '';
  const box = linked ? `<label class="pchk pchk-only" title="Ticked: Lansweeper fills this in. Type a value to keep your own; tick again to follow Lansweeper."><input type="checkbox" data-ovr="${k}" aria-label="From feed" ${taken ? 'checked' : ''}></label>` : (LS_ON() ? '<span class="pchk-slot" aria-hidden="true"></span>' : '');
  /* An amount: the currency is in the label, so the field is as wide as the others. */
  const label = f[2] === 'money' ? `${f[1]} (${COSTS.currency || 'CHF'})` : f[1];
  const comboNoteSlot = k === 'model' ? `<span hidden></span><p class="fieldnote" id="f_${o.id}_${k}_note" aria-live="polite" hidden></p>` : '';
  const barsBelow = bars ? `<span></span>${bars}` : '';
  const nics = k === 'mac' ? nicsHtml(o) : '';
  return `<label for="f_${o.id}_${k}">${esc(label)}</label><div class="ctlrow">${ctl}${box}${menu}</div>${comboNoteSlot}${barsBelow}${fieldNote(o, k)}${nics}`;
}
/* The device's other network adapters from Lansweeper (Wi-Fi next to the cable, a second network), under the MAC address. */
export function nicsHtml(o){
  const list = Array.isArray(o.nics) ? o.nics : [];
  if (!list.length) return '';
  return `<label>Other adapters</label><ul class="nics" aria-label="Other network adapters">${list.map(n => `<li>
    <span class="nic-name">${esc(n.name || 'Network adapter')}</span>
    <span class="nic-addr mono">${esc(n.ip)}${n.mask ? '<span class="muted"> / ' + esc(n.mask) + '</span>' : ''}</span>
    <span class="nic-meta muted">${[n.mac ? `<span class="mono">${esc(n.mac)}</span>` : '', n.dhcp === 'dhcp' ? 'DHCP' : n.dhcp === 'static' ? 'Static' : '', n.gateway ? 'gateway ' + esc(n.gateway) : ''].filter(Boolean).join(' · ')}</span></li>`).join('')}</ul>`;
}
/* Disks as Lansweeper sends them ("C: 117/237 GB; D: 812/931 GB", free/size) as one bar per drive: how full it is, and
   the space left. Returns '' when the text is not in that form. */
export function diskBars(text, live = true){
  const num = v => +String(v).replace(/[^\d]/g, '');
  const parts = String(text || '').split(';').map(x => /^\s*([A-Za-z]):?\s*([\d'’.,\s]+)\/([\d'’.,\s]+)\s*GB\s*$/.exec(x)).filter(Boolean);
  if (!parts.length) return '';
  /* Without a running sync the free space is out of date: only each drive's size is shown. */
  if (!live) return `<div class="disks sizes">${parts.map(([, l, , c]) => `<span class="disk-size"><b>${l.toUpperCase()}:</b> ${num(c).toLocaleString()} GB</span>`).join('')}</div>`;
  return `<div class="disks">${parts.map(([, l, f, c]) => {
    const free = num(f), size = num(c), used = size ? Math.min(100, Math.max(0, Math.round((size - free) / size * 100))) : 0;
    const cls = used >= 90 ? ' bad' : used >= 80 ? ' warn' : '';
    return `<div class="disk${cls}" title="${l.toUpperCase()}: ${used}% used, ${free} GB free of ${size} GB"><b>${l.toUpperCase()}:</b><span class="disk-bar" aria-hidden="true"><span style="width:${used}%"></span></span><span class="disk-t">${free.toLocaleString()} GB free of ${size.toLocaleString()} GB</span></div>`;
  }).join('')}</div>`;
}
/* A remark under a field: a gateway other than its subnet's, a warranty that has ended or ends soon. */
export function fieldNote(o, k){
  let t = '', cls = 'warn';
  if (k === 'gateway' && o.gateway){
    const sn = subnetFor(o);
    if (sn && sn.gateway && sn.gateway !== o.gateway) t = `Not the gateway of ${sn.name || sn.cidr}, which is ${sn.gateway}.`;
  }
  if (k === 'warranty'){ const w = warrantyState(o); if (w === 'ended') { t = 'The warranty has ended.'; cls = 'bad'; } else if (w === 'soon') t = `The warranty ends within ${WARRANTY_SOON_DAYS} days.`; }
  return t ? `<span></span><p class="fieldnote ${cls}">${esc(t)}</p>` : '';
}
/* The subnet a device is in: the one picked on it, or else the one its address falls in. */
export function subnetFor(o){
  const picked = SUBNETS.find(n => n.cidr === o.subnet);
  if (picked) return picked;
  const ip = ipInt(o.ip);
  return ip === null ? null : SUBNETS.find(n => { const sp = subnetSpan(n); return sp && ip >= sp.first && ip <= sp.last; }) || null;
}
/* Fields the feed sets for this object that the type does not show (e.g. CPU on a PC), so nothing is hidden. */
export function extraFields(o, fields){
  if (!o.feed || !LS_ON()) return [];
  return Object.keys(FIELD_LABEL).filter(k => o[k] !== undefined && !fields.some(f => f[0] === k)).map(k => [k, FIELD_LABEL[k], fieldKind(k)]);
}
/* Source of the object: its sync status, when Lansweeper last saw it, and what is taken from it. Attach and Detach live here. */
export function feedPanel(o){
  if (!LS_ON()) return '';
  const s = syncOf(o);
  const head = `<div class="hdr">Lansweeper${o.feed ? ` <span class="cnt">${esc(o.feed.sys)}${o.feed.ref ? ' · ' + esc(o.feed.ref) : ''}</span>` : ''}</div>`;
  const dl = (extra = '') => `<dl class="lsbox"><dt>Status</dt><dd>${syncChip(o)}</dd>
    ${o.feed ? `<dt>Last seen</dt><dd style="font-family:inherit">${esc(o.feed.seen || 'not yet')}</dd>` : ''}
    ${o.feed && o.feed.scanned ? `<dt>Last scanned</dt><dd style="font-family:inherit">${esc(dayText(o.feed.scanned))}${scanOld(o) ? ` ${scanChip(o)}<p class="fieldnote warn">Lansweeper has not scanned it for over three months: it may be gone, or Lansweeper cannot log on to it. Check it by hand, then retire it or fix the scan in Lansweeper.</p>` : ''}</dd>` : ''}
    <dt>Matched by</dt><dd style="font-family:inherit">Serial number, or a name that only one object has</dd>${extra}</dl>`;
  if (!o.feed){
    const note = o.detached ? 'Detached: the sync leaves this object alone and its fields are yours. Attach it to let the sync fill it in again.'
      : 'Entered by hand. The next sync links it when its serial number or unique name matches a Lansweeper record.';
    return `<div class="panelbox">${head}${dl()}<div class="addrel"><span class="note" style="flex:1">${note}</span>${o.detached ? '<button id="attachFeed" class="primary">Attach</button>' : ''}</div></div>`;
  }
  const note = o.excluded ? 'Excluded from the sync, so Lansweeper does not change this object. Include it again from the More menu.'
    : 'Ticked fields come from Lansweeper and are read-only. Untick one to edit it. Name and serial number are never overwritten.';
  /* Software and Links sit in the same list as the rest, so their boxes line up with the values above. */
  const takenBox = (k, text) => `<label class="pchk lsbox-check"><input type="checkbox" data-ovr="${k}" ${o.ovr && o.ovr[k] === false ? '' : 'checked'}> ${text}</label>`;
  return `<div class="panelbox">${head}${dl(o.excluded || o.detached ? '' : `<dt>Software</dt><dd class="plain">${takenBox('software', 'From Lansweeper')}</dd><dt>Links</dt><dd class="plain">${takenBox('links', 'From Lansweeper (monitors)')}</dd>`)}
    <div class="addrel"><span class="note" style="flex:1">${note}</span>${s.k === 'excluded' ? '' : '<button id="detachFeed">Detach</button>'}</div></div>`;
}
export const SW_TYPES = ['pc','notebook','server'];
export function softwarePanel(o){
  const list = o.software || [];
  return `<div class="panelbox"><div class="hdr">Software <span class="cnt">${list.length} installed</span></div>
    <div style="overflow-x:auto"><table class="grid mini" style="min-width:0"><thead><tr><th>Name</th><th>Version</th><th></th></tr></thead><tbody>
    ${list.map((p, i) => `<tr><td>${esc(p.name)}</td><td class="mono">${esc(p.version || '')}</td><td><button class="icon ghost" data-swdel="${i}" aria-label="Remove ${esc(p.name)}">×</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted">Nothing recorded.</td></tr>'}
    </tbody></table></div>
    <div class="addrel"><input id="swName" placeholder="Name, e.g. Google Chrome" style="flex:1;min-width:140px" aria-label="Software name"><input id="swVer" placeholder="Version" style="width:110px" aria-label="Version"><button id="swAdd">Add</button></div></div>`;
}
export function bindSoftware(o){
  $('#view').querySelectorAll('[data-swdel]').forEach(b => b.onclick = () => {
    const p = o.software.splice(+b.dataset.swdel, 1)[0]; hist(o, now(), 'Software removed: ' + p.name); render();
  });
  const add = $('#swAdd'); if (!add) return;
  add.onclick = () => {
    const name = $('#swName').value.trim();
    if (!name){ toast('Give the software a name.'); return; }
    o.software = [...(o.software || []), {name, version: $('#swVer').value.trim()}];
    hist(o, now(), 'Software added: ' + name); render();
  };
}
/* Every package across the PCs and servers. A package opens in place to list the devices it is installed on,
   with the version on each; a version other than the most common one is marked, as it is usually the one to update. */
const swPackages = () => {
  const map = {};
  objs.forEach(o => (o.software || []).forEach(p => {
    const r = (map[p.name] ??= {name: p.name, counts: {}, devices: []});
    const v = p.version || '—';
    r.counts[v] = (r.counts[v] || 0) + 1;
    if (!r.devices.includes(o)) r.devices.push(o);
  }));
  return Object.values(map).map(r => ({...r, versions: Object.entries(r.counts).sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0], undefined, {numeric: true}))}));
};
const versionOf = (d, name) => ((d.software || []).find(x => x.name === name) || {}).version || '—';
const swChevron = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function swDetailHtml(r){
  const common = r.versions[0][0], mixed = r.versions.length > 1;
  const devs = [...r.devices].sort((x, y) => versionOf(y, r.name).localeCompare(versionOf(x, r.name), undefined, {numeric: true}) || x.name.localeCompare(y.name));
  return `<tr class="sw-detail" data-swd="${esc(r.name)}"><td colspan="4"><div class="sw-devs">
    <table class="sw-sub"><thead><tr><th>Device</th><th class="sw-opt">Type</th><th>Location</th><th class="sw-opt">User</th><th>Version</th></tr></thead><tbody>
    ${devs.map(d => { const v = versionOf(d, r.name), odd = mixed && v !== common; return `<tr>
      <td><span class="sw-dev">${tico(d.type, 'tico sm')}<a class="link mono" data-open="${d.id}">${esc(d.name)}</a></span></td>
      <td class="sw-opt">${TYPES[d.type] ? esc(TYPES[d.type].short) : esc(d.type)}</td><td>${esc((d.loc || '').replace(' / ', ' · '))}</td><td class="sw-opt">${esc(d.user || '')}</td>
      <td><span class="vchip${odd ? ' odd' : ''}" ${odd ? `title="Most devices have ${esc(common)}"` : ''}>${esc(v)}</span></td></tr>`; }).join('')}
    </tbody></table></div></td></tr>`;
}
export function renderSoftware(){
  const all = swPackages();
  st.swOpen = (st.swOpen || []).filter(n => all.some(r => r.name === n));
  st.swSort ??= 'name';
  const devCount = objs.filter(o => (o.software || []).length).length;
  $('#toolbar').innerHTML = `<input id="swQ" type="search" placeholder="Find software, version or device…" aria-label="Find software" value="${esc(st.swQ || '')}" style="width:260px">
    <span class="muted" id="swCount"></span><div class="grow"></div>
    <button id="swCollapse" ${st.swOpen.length ? '' : 'hidden'}>Collapse all</button><span class="muted hide-n">Add software on a PC or server</span>`;
  if (!all.length){ $('#view').innerHTML = `<div class="sw-page">${licencesPanel()}<div class="empty">No software recorded yet. Add it on a PC or server.</div></div>`; bindLicences(); return; }
  /* data-tb: the generic column tools (filter row, drag, resize) stay off; this table has its own search and sort. */
  $('#view').innerHTML = `<div class="sw-page">${licencesPanel()}<div class="gridwrap" style="height:auto"><table class="grid sw" data-tb="own"><thead><tr>
    <th class="sw-tgcol" aria-label="Open"></th><th data-swsort="name" class="sw-name" ${st.swSort === 'name' ? 'data-sort="asc"' : ''}>Package</th><th class="sw-ver">Versions</th><th data-swsort="devices" class="n sw-cnt" ${st.swSort === 'devices' ? 'data-sort="desc"' : ''}>Devices</th></tr></thead><tbody id="swBody"></tbody></table></div></div>`;
  bindLicences();
  const max = Math.max(...all.map(r => r.devices.length));
  const body = () => {
    const q = (st.swQ || '').trim().toLowerCase();
    /* A search for a device opens the packages it has, so the match is in sight. */
    const hits = r => !q ? 'none' : r.name.toLowerCase().includes(q) || r.versions.some(([v]) => v.toLowerCase().includes(q)) ? 'package' : r.devices.some(d => d.name.toLowerCase().includes(q)) ? 'device' : '';
    const rows = all.filter(r => hits(r)).sort(st.swSort === 'devices' ? (a, b) => b.devices.length - a.devices.length || a.name.localeCompare(b.name) : (a, b) => a.name.localeCompare(b.name));
    const n = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;
    $('#swCount').textContent = q ? `${rows.length} of ${n(all.length, 'package')}` : `${n(all.length, 'package')} · ${n(devCount, 'device')}`;
    $('#swBody').innerHTML = rows.length ? rows.map(r => {
      const open = st.swOpen.includes(r.name) || hits(r) === 'device';
      const shown = r.versions.slice(0, 4);
      return `<tr class="sw-row${open ? ' open' : ''}" data-sw="${esc(r.name)}">
        <td class="sw-tgcol"><button class="sw-tg icon ghost" aria-expanded="${open}" aria-label="${open ? 'Hide' : 'Show'} the devices with ${esc(r.name)}">${swChevron}</button></td>
        <td><b>${esc(r.name)}</b>${licencesFor(r.name).map(l => ' ' + licenceMark(l)).join('')}</td>
        <td class="sw-ver"><span class="vchips">${shown.map(([v, n]) => `<span class="vchip">${esc(v)}${r.versions.length > 1 ? `<i>${n}</i>` : ''}</span>`).join('')}${r.versions.length > 4 ? `<span class="muted">+${r.versions.length - 4} more</span>` : ''}</span></td>
        <td class="n"><span class="sw-bar"><span style="width:${Math.max(4, Math.round(r.devices.length / max * 100))}%"></span></span>${r.devices.length}</td></tr>${open ? swDetailHtml(r) : ''}`;
    }).join('') : `<tr><td colspan="4" class="muted" style="padding:14px">Nothing matches “${esc(st.swQ)}”.</td></tr>`;
    $('#swCollapse').hidden = !st.swOpen.length;
  };
  body();
  /* Opening and closing changes only that package's rows, so the list keeps its scroll position. */
  const toggle = tr => {
    const name = tr.dataset.sw, open = !tr.classList.contains('open');
    st.swOpen = open ? [...st.swOpen, name] : st.swOpen.filter(n => n !== name);
    tr.classList.toggle('open', open);
    const btn = tr.querySelector('.sw-tg'); btn.setAttribute('aria-expanded', open); btn.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} the devices with ${name}`);
    const next = tr.nextElementSibling;
    if (next && next.classList.contains('sw-detail')) next.remove();
    if (open) tr.insertAdjacentHTML('afterend', swDetailHtml(all.find(r => r.name === name)));
    $('#swCollapse').hidden = !st.swOpen.length;
  };
  $('#swBody').addEventListener('click', e => {
    if (e.target.closest('[data-open]')) return;   /* a device link opens the device */
    const tr = e.target.closest('tr.sw-row'); if (tr) toggle(tr);
  });
  $('#swQ').addEventListener('input', e => { st.swQ = e.target.value; body(); });
  $('#swCollapse').onclick = () => { st.swOpen = []; body(); };
  $('#view').querySelectorAll('[data-swsort]').forEach(th => th.onclick = () => { st.swSort = th.dataset.swsort; renderSoftware(); });
}
/* A patch panel's ports, with the device on each one and the trunk into the switch. */
export function patchPanel(o){
  const ports = [];
  for (let n = 1; n <= o.ports; n++){
    const label = 'P' + pad2(n);
    const r = rels.find(r => r.to === o.id && r.port === label);
    ports.push(`<div class="${r ? 'used' : ''}" title="${label}">${label}${r ? `<b>${esc(byId(r.from).name)}</b>` : ''}</div>`);
  }
  const trunk = rels.find(r => r.from === o.id && r.kind === 'connected');
  return `<div class="panelbox"><div class="hdr">Ports <span class="cnt">${used(o)} of ${o.ports} in use${trunk ? ' · trunk to ' + esc(byId(trunk.to).name) + ' port ' + esc(portLabel(byId(trunk.to), trunk.port)) : ''}</span></div>
    <div class="pp">${ports.join('')}</div></div>`;
}
/* Deletes an object for good, with its relations and history. Retiring is the way to keep the record. */
/* Retiring keeps the record: the object stays with its relations, ports and rack place, and is no longer offered as a target. */
export function retireModal(o){
  modal(`<div class="mh">Retire ${esc(o.name)}?</div>
    <div class="mb"><p class="note">It stays in the inventory for the record, with its connections, port and rack place. It is no longer offered when connecting something. You can bring it back by changing its status.</p></div>
    <div class="mf"><button id="rtCancel">Cancel</button><button id="rtOk" class="danger-text">Retire</button></div>`, 'sm');
  $('#rtCancel').onclick = closeModal;
  $('#rtOk').onclick = () => { if (o.rack){ hist(o, now(), 'Taken out of the rack ' + (byId(o.rack) ? byId(o.rack).name : '') + ' for retirement by ' + who()); unplace(o); } o.status = 'retired'; hist(o, now(), 'Retired by ' + who()); closeModal(); toast(o.name + ' is retired. It stays in the inventory for the record.'); render(); };
}
export function purgeModal(o){
  modal(`<div class="mh">Delete ${esc(o.name)}?</div>
    <div class="mb"><p class="note">This removes the object, its relations and its history for good. Retire keeps the record instead. Devices that were plugged into it or mounted on top of it stay, without that link.</p></div>
    <div class="mf"><button id="pgCancel">Cancel</button><button id="pgOk" class="danger-text">Delete permanently</button></div>`, 'sm');
  $('#pgCancel').onclick = closeModal;
  $('#pgOk').onclick = () => { deleteObject(o.id); closeModal(); toast(`${o.name} deleted`); };
}
export function deleteObject(id){
  const i = objs.findIndex(x => x.id === id); if (i < 0) return;
  objs.splice(i, 1);
  for (let k = rels.length - 1; k >= 0; k--) if (rels[k].from === id || rels[k].to === id) rels.splice(k, 1);
  objs.forEach(x => { if (x.ontop === id) delete x.ontop; });
  /* A deleted rack leaves its devices unmounted; they stay in the inventory. */
  objs.forEach(x => { if (x.rack === id) { delete x.rack; delete x.u; delete x.h; delete x.ontop; } });
  delete HISTORY[id];
  st.open = st.open.filter(x => x !== id); st.tabIds = st.tabIds.filter(x => x !== id);
  if (st.tab === id) st.tab = 'table';
  render();
}
export const COLLAPSED_KEY = 'ni-collapsed-panels';
export const collapsedPanels = () => { try { return JSON.parse(localStorage.getItem(COLLAPSED_KEY)) || {}; } catch { return {}; } };
export const rememberPanel = (key, closed) => { try { const m = collapsedPanels(); if (closed) m[key] = true; else delete m[key]; localStorage.setItem(COLLAPSED_KEY, JSON.stringify(m)); } catch { /* not kept: the panel opens as before */ } };
/* Devices on top of o follow it: they move to its new rack, or leave the rack with it. */
export function followOnTop(o, prevRack){
  if (o.rack === prevRack && o.rack) return;
  for (const x of objs.filter(x => x.ontop === o.id)){
    if (o.rack) x.rack = o.rack;
    else { delete x.ontop; delete x.rack; delete x.u; delete x.h; hist(x, now(), `Taken out of the rack with ${o.name} by ${who()}`); }
  }
}
/* A device taken out of its rack for retirement: its units are free, and devices on top of it are taken out too. */
export function unplace(o){
  const prevRack = o.rack;
  delete o.rack; delete o.u; delete o.h; delete o.ontop;
  followOnTop(o, prevRack);
}
export function renderObj(o){
  const rs = relsOf(o);
  /* Network links first, then the attached devices, each under its own heading when both are there. */
  const net = rs.filter(x => !isAttached(x.r.kind)), att = rs.filter(x => isAttached(x.r.kind)), byGroup = [...net, ...att];
  const groupHead = i => (net.length && att.length && i === 0 ? '<div class="relgroup">Network</div>' : '') + (net.length && att.length && i === net.length ? '<div class="relgroup">Attached</div>' : '');
  let fields = typeFieldsOf(o.type);
  /* A type that usually has no ports (a PC, a printer) shows the port fields only for a device that has ports, or after
     More -> Add network ports. Setting the ports back to 0 hides them again. */
  const typePorts = fields.some(f => f[0] === 'ports'), extraPorts = !typePorts && (o.ports > 0 || st.addPorts === o.id);
  if (extraPorts) fields.push(['ports', 'Ports', 'mono'], ['pfx', 'Port naming', 'mono']);
  /* The fields of the type, filled in by hand; their values are kept on the object under custom. */
  fields.push(...(TYPE_FIELDS[o.type] || []).map(f => ['custom.' + f.key, f.label, f.kind]));
  /* The layout of the type, from Settings: a built-in field can be renamed, hidden, and put in another place. Hidden fields keep their values. */
  const lay = FIELD_LAYOUT[o.type] || {};
  const at = f => { const i = (lay.order || []).indexOf(f[0]); return i < 0 ? 1e6 : i; };
  fields = fields
    .map(f => (lay.labels && lay.labels[f[0]] ? [f[0], lay.labels[f[0]], f[2]] : f))
    .sort((a, b) => at(a) - at(b));
  fields.push(...extraFields(o, fields));
  fields = fields.filter(f => lsLive() || !SCAN_ONLY.includes(f[0]));
  /* A field hidden on this device, or on every device of the type (from the ⋯ menu or Settings). Its value is kept,
     and "Show hidden fields" brings the hidden ones back for a moment, each with its own way to show it again. */
  const hiddenBy = f => (o.hide || []).includes(f[0]) ? 'device' : (lay.hidden || []).includes(f[0]) ? 'type' : '';
  const nHidden = fields.filter(hiddenBy).length;
  if (!nHidden && st.showHidden === o.id) st.showHidden = null;
  const reveal = nHidden > 0 && st.showHidden === o.id;
  if (!reveal) fields = fields.filter(f => !hiddenBy(f));
  const edit = canEdit(), menuSlot = edit ? '<span class="fm-slot" aria-hidden="true"></span>' : '';
  const row = f => {
    const h = hiddenBy(f), html = propRow(o, f, edit ? fieldMenu(o, f, h) : '');
    return h ? html.replace('<label for=', `<label class="fm-hid" title="Hidden on ${h === 'device' ? 'this device' : 'every ' + esc(TYPES[o.type].label)}" for=`) : html;
  };
  const chain = pathUp(o);
  /* The way up to the network: one row per device, with the relation and its port on the line between two rows. */
  const netPath = `<ol class="netpath">${chain.map((n, i) => `<li class="ps${i === 0 ? ' me' : ''}">
      ${i ? `<div class="ps-hop">${esc(KINDS[n.via.kind].fwd)}${n.via.port != null ? ` <b>${esc(portLabel(n.o, n.via.port))}</b>` : ''}</div>` : ''}
      <div class="ps-row"><span class="ps-dot" aria-hidden="true"></span><button class="ps-name" data-open="${n.o.id}">${tico(n.o.type, 'tico sm')}<span>${esc(n.o.name)}</span></button><span class="ps-type">${esc(TYPES[n.o.type].short)}</span>${i === 0 ? '<span class="ps-me">this device</span>' : ''}</div></li>`).join('')}</ol>`;
  const targets = objs.filter(x => x.id !== o.id && x.status !== 'retired');
  $('#toolbar').innerHTML = `${tico(o.type)}<b class="mono">${esc(o.name)}</b><span class="code">${esc(o.code)}</span><span class="muted hide-n">${TYPES[o.type].label}</span>
    <span class="chip ${STATUS[o.status].cls}">${STATUS[o.status].label}</span><div class="grow"></div>
    <details class="menu"><summary>More</summary><div class="menubox"><button id="dupBtn">Duplicate</button>${canAddPorts(o.type) && !extraPorts && canEdit() ? '<button id="addPortsBtn">Add network ports…</button>' : ''}<button id="delBtn">Retire…</button>${canEdit() ? (o.excluded ? '<button id="exclBtn">Include in sync</button>' : '<button id="exclBtn">Exclude from sync</button><button id="exclRelBtn">Exclude with its relations</button>') : ''}${canEdit() ? '<button id="purgeBtn" class="danger-text">Delete permanently…</button>' : ''}</div></details><button id="saveBtn" class="primary" disabled>Save</button>`;
  $('#view').innerHTML = `<div class="obj">
    <div class="col">
      <div class="panelbox"><div class="hdr">Properties</div><div class="form">${fields.map(row).join('')}
        ${rackFields(o)}
        ${(o.adGroups || []).length ? `<label>AD groups</label><div class="ctlrow"><div class="adgroups">${o.adGroups.map(g => `<button type="button" class="chip adg" data-adg="${esc(g)}" title="Show the devices in ${esc(g)}">${esc(g)}</button>`).join('')}</div>${LS_ON() ? '<span class="pchk-slot" aria-hidden="true"></span>' : ''}${menuSlot}</div>` : ''}
        ${o.type === 'pc' || o.type === 'notebook' ? `<label>Attachments</label><div class="ctlrow entries">${accessoriesHtml(o)}${LS_ON() ? '<span class="pchk-slot" aria-hidden="true"></span>' : ''}${menuSlot}</div>` : ''}
        <label>Notes</label><div class="ctlrow entries">${entriesHtml(o)}${LS_ON() ? '<span class="pchk-slot" aria-hidden="true"></span>' : ''}${menuSlot}</div>
        ${nHidden ? `<span></span><div><button type="button" class="link fm-reveal" id="fmReveal" aria-expanded="${reveal}">${reveal ? 'Hide the hidden fields' : `Show ${nHidden} hidden field${nHidden === 1 ? '' : 's'}`}</button></div>` : ''}</div></div>
      ${feedPanel(o)}
    </div>
    <div class="col">
      ${o.type === 'patch' ? patchPanel(o) : ''}
      ${SW_TYPES.includes(o.type) ? softwarePanel(o) : ''}
      ${deviceContractsPanel(o)}
      <div class="panelbox"><div class="hdr">Relations <span class="cnt">${rs.length}</span></div>
        <div class="relist">${rs.length ? byGroup.map((x, i) => `${groupHead(i)}<div class="relrow"><span class="k">${x.label}</span><span class="t">${tico(x.other.type,'tico sm')}<a class="link" data-open="${x.other.id}">${esc(x.other.name)}</a>${x.r.lag == null && (hasPorts(byId(x.r.to)) || byId(x.r.to).type === 'patch') ? `<input class="rport" data-rport="${x.r.id}" value="${esc(x.r.port ?? '')}" placeholder="Port" aria-label="Port on ${esc(x.other.name)}" style="width:80px">` : (x.port ? `<span class="p">${x.out ? '' : 'on '}${esc(x.port)}</span>` : '')}${x.r.vlan ? `<span class="chip">VLAN ${esc(vlanLabel(x.r.vlan))}</span>` : ''}</span><button class="icon ghost" data-delrel="${x.r.id}" title="Remove relation" aria-label="Remove relation">×</button></div>`).join('') : '<p class="note lempty">No relations yet. Add one below.</p>'}</div>
        <div class="addrel"><select id="arKind" aria-label="Relation"></select>
          <select id="arTo" aria-label="Target" style="flex:1"></select>
          <input id="arPort" placeholder="Port" style="width:90px" aria-label="Port"><select id="arLag" aria-label="LAG on the target" hidden></select><select id="arFromLag" aria-label="LAG on this device" hidden></select><select id="arVlan" aria-label="VLAN" style="width:150px"><option value="">No VLAN</option>${VLANS.map(v => `<option value="${v.vid}">${v.vid} · ${esc(v.name)}</option>`).join('')}</select><button id="arAdd">Add</button></div><p class="note" id="arHint" role="status"></p>
      </div>
      <details class="panelbox fold" ${chain.length > 1 ? 'open' : ''}><summary class="hdr">Path to the network${chain.length > 1 ? ` <span class="cnt">${chain.length - 1} ${chain.length === 2 ? 'hop' : 'hops'}</span>` : ' <span class="cnt">none</span>'}</summary>
        ${chain.length > 1 ? netPath : '<div class="chain"><span class="muted">This object does not hang off anything.</span></div>'}
      </details>
      <details class="panelbox fold" ${(HISTORY[o.id]||[]).length ? 'open' : ''}><summary class="hdr">History${(HISTORY[o.id]||[]).length ? '' : ' <span class="cnt">none</span>'}</summary>${(HISTORY[o.id]||[]).length ? `<ul class="hist">${(HISTORY[o.id]||[]).map(h => `<li><time>${esc(h.t)}</time><span>${esc(h.msg)}</span></li>`).join('')}</ul>` : '<div class="chain"><span class="muted">No changes recorded yet.</span></div>'}</details>
    </div></div>`;

  bindSoftware(o);
  bindDeviceContracts(o);
  const objView = $('#view').querySelector('.obj');
  const dirty = () => { $('#saveBtn').disabled = false; };
  objView.addEventListener('input', dirty);
  /* A field saves when it is left: the whole object is saved, without a redraw, except for a type change, which changes the fields. */
  objView.addEventListener('change', e => { dirty(); if (e.target.matches('[data-k],[data-rk]')) saveObj(e.target.dataset.k === 'type'); });
  /* A panel stays open or closed as the person left it. The choice is kept in this browser, by the panel's title. */
  $('#view').querySelectorAll('.obj .panelbox > .hdr').forEach(h => {
    h.classList.add('sechdr'); h.setAttribute('role', 'button'); h.tabIndex = 0;
    const key = (h.childNodes[0] ? h.childNodes[0].textContent : h.textContent).trim();
    const closed = !!collapsedPanels()[key];
    h.parentNode.classList.toggle('collapsed', closed); h.setAttribute('aria-expanded', String(!closed));
    const toggle = () => { const c = h.parentNode.classList.toggle('collapsed'); h.setAttribute('aria-expanded', String(!c)); rememberPanel(key, c); };
    h.addEventListener('click', e => { if (!e.target.closest('button,input,select,a,label')) toggle(); });
    h.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === h){ e.preventDefault(); toggle(); } });
  });
  /* The relation kind decides which objects are offered as targets: a monitor attaches to a PC, a device connects to a switch or a patch panel. */
  /* A device with ports but no port count yet cannot have its port checked: say so, but let the connection be made. */
  const portHint = () => {
    const to = $('#arTo').value ? byId($('#arTo').value) : null;
    $('#arHint').textContent = to && hasPorts(to) && !(to.ports > 0) ? `${to.name} has no port count yet. Set its ports in its details, so the port can be checked.` : '';
  };
  const fitTargets = () => {
    const k = $('#arKind').value;
    $('#arTo').innerHTML = '<option value="">— choose —</option>' + targets.filter(t => KIND_TARGETS[k].includes(t.type) && (k !== 'hosted' || t.kind !== 'vm')).map(t => `<option value="${t.id}">${esc(t.name)} (${TYPES[t.type].short})</option>`).join('');
    /* The field is narrow: the placeholder is short, and the patch panel hint is in its tooltip. */
    $('#arPort').placeholder = k === 'connected' || k === 'uplink' ? 'Port' : 'Port (opt.)';
    $('#arPort').title = k === 'connected' ? 'Port number, or P04 for a port on a patch panel' : '';
  };
  $('#arKind').innerHTML = Object.entries(KINDS).map(([k,v]) => `<option value="${k}" title="${esc(KIND_HINTS[k])}">${v.fwd}</option>`).join('');
  /* The dropdown shows what the chosen kind means, so the hint follows the choice. */
  const kindHint = () => { $('#arKind').title = KIND_HINTS[$('#arKind').value] || ''; };
  $('#arKind').value = o.type === 'monitor' ? 'attached' : 'connected'; fitTargets(); kindHint();
  $('#arKind').onchange = () => { fitTargets(); kindHint(); portHint(); lagRow(); };
  $('#arTo').onchange = () => { portHint(); lagRow(); };
  /* A LAG is chosen on both devices when the target has LAGs; the single port is then not used. */
  const lagRow = () => {
    const to = $('#arTo').value ? byId($('#arTo').value) : null;
    const lags = to ? (to.portGroups || []).filter(g => g.lag) : [];
    const own = (o.portGroups || []).filter(g => g.lag);
    const size = g => `${g.to - g.from + 1} ports`;
    /* The choice is kept while the list is rebuilt, for example when the target changes. */
    const picked = $('#arLag').hidden ? '' : $('#arLag').value;
    $('#arLag').innerHTML = '<option value="">Single port</option>' + lags.map(g => `<option value="${esc(g.name)}">${esc(g.name)} · ${size(g)}</option>`).join('');
    if (lags.some(g => g.name === picked)) $('#arLag').value = picked;
    $('#arFromLag').innerHTML = own.map(g => `<option value="${esc(g.name)}">${esc(g.name)} · ${size(g)}</option>`).join('');
    $('#arLag').hidden = !lags.length;
    const usingLag = lags.length > 0 && !!$('#arLag').value;
    $('#arFromLag').hidden = !usingLag; $('#arPort').hidden = usingLag;
    if (usingLag && !own.length) $('#arHint').textContent = 'This device has no LAG yet. Define one in its Ports view first.';
  };
  $('#arLag').onchange = () => { lagRow(); portHint(); };
  lagRow();
  $('#arAdd').onclick = () => {
    const to = $('#arTo').value ? byId($('#arTo').value) : null;
    if (!to){ toast('Choose what to connect to first.'); return; }
    const lagTo = $('#arLag').hidden ? '' : $('#arLag').value;
    if (lagTo){
      const lagFrom = $('#arFromLag').value, k = $('#arKind').value;
      const tl = (to.portGroups || []).find(g => g.lag && g.name === lagTo), fl = (o.portGroups || []).find(g => g.lag && g.name === lagFrom);
      if (!fl){ toast('Choose the LAG on this device first.'); return; }
      if (tl.to - tl.from !== fl.to - fl.from){ toast(`The LAGs have different numbers of ports: ${fl.to - fl.from + 1} and ${tl.to - tl.from + 1}.`); return; }
      if (rels.some(r => (r.to === to.id && r.lag === lagTo) || (r.from === o.id && r.fromLag === lagFrom) || (r.from === to.id && r.fromLag === lagTo) || (r.to === o.id && r.lag === lagFrom))){ toast('One of these LAGs is already linked. A LAG links one other LAG.'); return; }
      rels.push({id:'r'+rid(), from:o.id, to:to.id, kind:k, port:null, lag:lagTo, fromLag:lagFrom, vlan: $('#arVlan').value ? +$('#arVlan').value : null});
      hist(o, now(), `Relation "${KINDS[k].fwd} ${to.name}" (LAG ${lagTo}) added by ${who()}`);
      toast('LAG link added'); render(); return;
    }
    let port = $('#arPort').value.trim(); if (/^\d+$/.test(port) && hasPorts(to)) port = +port;
    const inLag = (to.portGroups || []).find(g => g.lag && typeof port === 'number' && port >= g.from && port <= g.to);
    if (inLag){ toast(`Port ${port} is part of the LAG ${inLag.name}. Choose the LAG instead.`); return; }
    if (hasPorts(to) && typeof port === 'number' && to.ports && port > to.ports){ toast(`${port} is above the ${to.ports} ports of ${to.name}. Raise its port count first.`); return; }
    if (hasPorts(to) && typeof port === 'number') releaseRetiredPort(to, port);
    if (hasPorts(to) && typeof port === 'number' && rels.some(r => r.to === to.id && r.port === port)){ toast(pfxOf(to) + port + ' on ' + to.name + ' is already taken. Pick a free port.'); return; }
    if (to.type === 'patch' && rels.some(r => r.to === to.id && r.port === patchPort(port))){ toast(patchPort(port) + ' on ' + to.name + ' is already taken.'); return; }
    const k = $('#arKind').value;
    const finalPort = port === '' ? null : (to.type === 'patch' ? patchPort(port) : port);
    if (rels.some(r => r.from === o.id && r.to === to.id && r.kind === k && String(r.port) === String(finalPort))){ toast('That relation already exists.'); return; }
    if (finalPort != null && rels.some(r => r.to === to.id && String(r.port) === String(finalPort) && (hasPorts(to) || to.type === 'patch'))){ toast(`${finalPort} on ${to.name} is already taken.`); return; }
    rels.push({id:'r'+rid(), from:o.id, to:to.id, kind:k, port:finalPort, vlan: $('#arVlan').value ? +$('#arVlan').value : null});
    hist(o, now(), `Relation "${KINDS[k].fwd} ${to.name}" added by ${who()}`);
    toast('Relation added'); render();
  };
  $('#view').querySelectorAll('[data-delrel]').forEach(b => b.onclick = () => { const i = rels.findIndex(r => r.id === b.dataset.delrel); rels.splice(i, 1); toast('Relation removed'); render(); });
  $('#view').querySelectorAll('[data-rport]').forEach(i => i.onchange = () => {
    const r = rels.find(x => x.id === i.dataset.rport); if (!r) return;
    const to = byId(r.to); let p = i.value.trim();
    if (!p){ toast('A connection to this device needs a port.'); render(); return; }
    if (hasPorts(to) && /^\d+$/.test(p)) p = +p;
    if (to.type === 'patch') p = patchPort(p);
    if (hasPorts(to) && typeof p === 'number' && to.ports && p > to.ports){ toast(`${p} is above the ${to.ports} ports of ${to.name}. Raise its port count first.`); render(); return; }
    releaseRetiredPort(to, p);
    if (rels.some(x => x !== r && x.to === to.id && String(x.port) === String(p))){ toast(`${p} on ${to.name} is already taken.`); render(); return; }
    r.port = p;
    hist(byId(r.from), now(), `Port on ${to.name} set to ${p} by ${who()}`);
    toast('Port set'); render();
  });
  /* Choosing a subnet enables the pick button, so the address can be picked before the object is saved. */
  const subSel = $('#f_' + o.id + '_subnet');
  if (subSel) subSel.onchange = () => { $('[data-pick="' + o.id + '"]').disabled = !subSel.value && !subnetFor({...o, subnet: ''}); };
  /* Pick from range: the first address of the chosen subnet's ranges that no other device uses, not its gateway or DNS. */
  $('#view').querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
    const sub = SUBNETS.find(n => n.cidr === $('#f_' + o.id + '_subnet').value) || subnetFor({...o, subnet: ''});
    if (!sub){ toast('Choose a subnet first.'); return; }
    const used = new Set(objs.filter(x => x !== o && x.ip).map(x => ipInt(x.ip)));
    [sub.gateway, ...(sub.dns || [])].forEach(a => used.add(ipInt(a)));
    const addr = freeAddress(sub, used);
    if (!addr){ toast((sub.ranges || []).length && sub.ranges.every(rangeKeptOut) ? `The ranges of ${sub.name} are all DHCP or reserved. Add a static range to pick from.` : 'No free address in the ranges of ' + sub.name + '.'); return; }
    const ip = $('#f_' + o.id + '_ip'); ip.value = addr; ip.dispatchEvent(new Event('input', {bubbles: true}));
    toast('Picked ' + addr + ' from ' + sub.name);
  });
  $('#view').querySelectorAll('[data-ovr]').forEach(c => c.onchange = () => {
    const k = c.dataset.ovr, name = FIELD_LABEL[k] || { software: 'Software', links: 'Links' }[k] || k;
    o.ovr[k] = c.checked;
    hist(o, now(), `${name}: ${c.checked ? 'taken from feed' : 'kept as set here'} (object override)`);
    toast(`${name} ${c.checked ? 'follows the feed' : 'is kept as set here'}`); render();
  });
  /* The U position only matters for a device in a rack, and not for one sitting on another device. */
  const mountRow = () => { const mr = $('.rk-mount'); if (mr) mr.hidden = !$('#rk_rack').value || !!$('#rk_top').value; };
  if ($('#rk_rack')){ $('#rk_rack').onchange = mountRow; $('#rk_top').onchange = mountRow; }
  /* Entries are added and removed on their own: each change is saved at once. */
  const enAdd = $('#enAdd');
  if (enAdd) enAdd.onclick = () => {
    const title = $('#enTitle').value.trim(), text = $('#enText').value.trim(), link = $('#enLink').value.trim();
    if (!title){ toast('Give the note a title.'); return; }
    if ((o.entries || []).length >= 200){ toast('An object holds up to 200 notes.'); return; }
    if (link && !/^https?:\/\//i.test(link)){ toast('An attachment link starts with http:// or https://.'); return; }
    o.entries = [...(o.entries || []), {title, ...(text ? {text} : {}), ...(link ? {link} : {})}];
    hist(o, now(), `Note added: ${title} by ${who()}`); queueServerSave(); render();
  };
  $('#view').querySelectorAll('[data-delentry]').forEach(b => b.onclick = () => {
    const e = o.entries[+b.dataset.delentry];
    o.entries = o.entries.filter((_, i) => i !== +b.dataset.delentry);
    hist(o, now(), `Note removed: ${e.title} by ${who()}`); queueServerSave(); render();
  });
  const accAdd = $('#accAdd');
  if (accAdd) accAdd.onclick = () => {
    const name = $('#accName').value.trim(), kind = $('#accKind').value.trim(), serial = $('#accSerial').value.trim();
    if (!name){ toast('Give the attachment a name.'); return; }
    if ((o.accessories || []).length >= 100){ toast('An object holds up to 100 attachments.'); return; }
    o.accessories = [...(o.accessories || []), {name, ...(kind ? {kind} : {}), ...(serial ? {serial} : {})}];
    hist(o, now(), `Attachment added: ${name} by ${who()}`); queueServerSave(); render();
  };
  $('#view').querySelectorAll('[data-delacc]').forEach(b => b.onclick = () => {
    const a = o.accessories[+b.dataset.delacc];
    o.accessories = o.accessories.filter((_, i) => i !== +b.dataset.delacc);
    hist(o, now(), `Attachment removed: ${a.name} by ${who()}`); queueServerSave(); render();
  });
  const saveObj = (rerender = true) => {
    /* Addresses are checked before anything is saved; a bad one stays in its field so it can be corrected. */
    const addrs = [...$('#view').querySelectorAll('[data-k="ip"],[data-k="ip6"],[data-k="mac"]')];
    const checked = addrs.map(el => ({ el, c: checkAddress(el.dataset.k, el.value) }));
    const wrong = checked.find(x => !x.c.ok);
    if (wrong){ toast(wrong.c.msg); wrong.el.focus(); return; }
    /* A rack with devices in it stays a rack; and the ports cannot shrink below the connections that use them. */
    const typeEl = $('#view').querySelector('[data-k="type"]');
    if (typeEl && o.type === 'rack' && typeEl.value !== 'rack' && objs.some(x => x.rack === o.id)){ toast('Move the devices out of this rack first.'); typeEl.value = o.type; return; }
    const pEl = $('#view').querySelector('[data-k="ports"]'), sEl = $('#view').querySelector('[data-k="sfp"]');
    if (pEl && sEl){
      const total = (+pEl.value || 0) + (+sEl.value || 0);
      if (rels.some(r => r.to === o.id && typeof r.port === 'number' && r.port > total)){ toast(`Ports in use above ${total} block this change. Move or remove those connections first.`); pEl.value = o.ports || 0; sEl.value = o.sfp || 0; return; }
    }
    checked.forEach(x => { x.el.value = x.c.value; });
    const rkEl = k => { const e = $('#view').querySelector(`[data-rk="${k}"]`); return e ? e.value : null; };
    let place = null;
    if (rkEl('rack') !== null){
      const top = rkEl('ontop'), rackId = rkEl('rack'), u = +rkEl('u'), h = +rkEl('h') || 1;
      if (top){ place = {ontop: top, rack: byId(top).rack}; }
      else if (rackId){
        const err = rackCheck(rackId, u, h, o.id);
        if (err){ toast(err); return; }
        place = {rack: rackId, u, h};
      } else place = {};
    }
    const kept = [];
    $('#view').querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k; let v = el.value;
      if (k.startsWith('custom.')){ o.custom = {...(o.custom || {}), [k.slice(7)]: v === '' ? null : (el.type === 'number' ? +v : v)}; return; }
      if (k === 'user'){
        const was = o.hotdesk ? '__hotdesk' : (o.uid || '');
        if (v === '__hotdesk'){ o.hotdesk = true; o.uid = null; } else { delete o.hotdesk; o.uid = v || null; }
        /* A user picked by hand on a linked device is kept: the next sync does not put the Lansweeper user back. */
        if (feedLinked(o) && was !== (v || '')){ o.ovr.user = false; kept.push(FIELD_LABEL.user || 'User'); }
        return;
      }
      if (['ports','sfp'].includes(k)) v = +v || 0;
      /* A price: a number of 0 or more, written with a point or a comma; empty takes it away. */
      if (k === 'price'){ const t = v.trim().replace(/['’\s]/g, '').replace(',', '.'); if (t === '' || !isFinite(+t) || +t < 0){ if (t !== '') toast('The price is a number, e.g. 1290 or 99.50.'); delete o.price; return; } v = Math.round(+t * 100) / 100; }
      if (k === 'ports') st.addPorts = null;   /* from now on the saved count decides whether the port fields show */
      if (k === 'units') v = +v || 42;
      if (k === 'type' && o.type !== v && TYPES[v]){
        hist(o, now(), `Type changed from ${TYPES[o.type] ? TYPES[o.type].label : o.type} to ${TYPES[v].label} by ${who()}`);
        o.ovr = {...(o.ovr || {}), type: false};   /* set by hand: the type rules leave it alone */
        /* A device that becomes a switch gets the port counts a new switch has, where it has none yet. */
        if (v === 'switch'){ o.ports ??= 24; o.sfp ??= 4; }
      }
      if (k === 'ports' && hasPorts(o) && v < (o.ports || 0) && rels.some(r => r.to === o.id && typeof r.port === 'number' && r.port > v)){ toast(`Ports in use above ${v} block this change. Move or remove those connections first.`); v = o.ports; }
      if (feedLinked(o) && FIELD_LABEL[k] && String(o[k] ?? '') !== String(v ?? '')){ o.ovr[k] = false; kept.push(FIELD_LABEL[k]); }
      o[k] = v;
    });
    if (place){
      const prevRack = o.rack;
      delete o.rack; delete o.u; delete o.h; delete o.ontop;
      Object.assign(o, place);
      followOnTop(o, prevRack);
      if (place.ontop) delete o.u;
    }
    if (o.type === 'server' && o.kind === 'vm') delete o.rack, delete o.u, delete o.h, delete o.ontop;
    /* A device that is not in use is not kept in a rack: its units are freed, and devices on top of it come out too. */
    if (o.status === 'unused' && o.rack){ hist(o, now(), 'Taken out of the rack ' + (byId(o.rack) ? byId(o.rack).name : '') + ' as not in use by ' + who()); unplace(o); }
    /* A model typed here is kept in the list, so the other devices can choose it. */
    if (o.model && !MODELS.includes(o.model)) MODELS.push(o.model);
    o.handAt = new Date().toISOString();
    hist(o, now(), 'Saved by ' + who() + (kept.length ? ' · kept from feed: ' + kept.join(', ') : ''));
    /* An address used by another device, or outside the subnet the device is on, is flagged; the object is still saved. */
    const warns = [];
    /* Another device's other adapters count too: a notebook's Wi-Fi address is in use as much as its cable one. */
    const sameIp = o.ip && o.status !== 'retired' ? objs.find(x => x !== o && x.status !== 'retired' && (x.ip === o.ip || (x.nics || []).some(n => n.ip === o.ip))) : null;
    if (sameIp) warns.push(`${o.ip} is also used by ${sameIp.name}`);
    const sn = o.subnet ? SUBNETS.find(n => n.cidr === o.subnet) : null, span = sn ? subnetSpan(sn) : null, ipn = ipInt(o.ip);
    if (span && o.ip && ipn !== null && (ipn < span.first || ipn > span.last)) warns.push(`${o.ip} is outside ${sn.cidr}`);
    toast('Saved ' + o.name + (kept.length ? '. Kept from feed: ' + kept.join(', ') : '') + (warns.length ? '. Check: ' + warns.join('; ') : ''));
    queueServerSave();
    if (rerender) render(); else $('#saveBtn').disabled = true;
  };
  $('#saveBtn').onclick = () => saveObj();
  /* Typing over a value from Lansweeper keeps it: the field's From feed box is unticked, and the save keeps it as set here. */
  objView.addEventListener('input', e => {
    if (e.target.matches('[data-ovr]')) return;
    const box = e.target.closest('.ctlrow') && e.target.closest('.ctlrow').querySelector('[data-ovr]');
    if (box) box.checked = false;
  });
  /* An AD group on the device: the devices in that group, in the table. */
  objView.querySelectorAll('[data-adg]').forEach(b => b.onclick = () => { st.adGroup = b.dataset.adg; st.tab = 'table'; render(); });
  /* The ⋯ menu of each field. One is open at a time; a click elsewhere or Escape closes it. */
  objView.querySelectorAll('details.fmenu').forEach(d => d.addEventListener('toggle', () => { if (d.open) objView.querySelectorAll('details.fmenu[open]').forEach(x => { if (x !== d) x.open = false; }); }));
  const fmReveal = $('#fmReveal');
  if (fmReveal) fmReveal.onclick = () => { st.showHidden = st.showHidden === o.id ? null : o.id; render(); };
  objView.querySelectorAll('[data-fm]').forEach(b => b.onclick = () => {
    const k = b.dataset.fk, act = b.dataset.fm, t = TYPES[o.type].label;
    const f = fields.find(x => x[0] === k), name = f ? f[1] : k;
    b.closest('details').open = false;
    if (act === 'hide' || act === 'hidetype') st.showHidden = null;
    if (act === 'hide' || act === 'show'){
      const h = (o.hide || []).filter(x => x !== k); if (act === 'hide') h.push(k);
      if (h.length) o.hide = h; else delete o.hide;
      hist(o, now(), `${name} ${act === 'hide' ? 'hidden' : 'shown again'} on this device by ${who()}`);
      toast(act === 'hide' ? `${name} is hidden on ${o.name}. Its value is kept.` : `${name} is shown again on ${o.name}`); render(); return;
    }
    if (act === 'hidetype' || act === 'showtype'){
      const lay = FIELD_LAYOUT[o.type] || {}, h = (lay.hidden || []).filter(x => x !== k); if (act === 'hidetype') h.push(k);
      FIELD_LAYOUT[o.type] = {...lay, hidden: h};
      toast(act === 'hidetype' ? `${name} is hidden on every ${t}. The values are kept; Show hidden fields brings it back.` : `${name} is shown again on every ${t}`); render(); return;
    }
    if (act === 'clear'){
      const el = objView.querySelector(`[data-k="${CSS.escape(k)}"]`); if (!el) return;
      const fromFeed = feedLinked(o) && LS_ON() && !!FIELD_LABEL[k];
      modal(`<div class="mh">Clear ${esc(name)}?</div>
        <div class="mb"><p class="note">The value of ${esc(name)} on ${esc(o.name)} is removed. The history keeps a note.${fromFeed ? ' Lansweeper no longer fills it in on this device; tick its From feed box to let it again.' : ''}</p></div>
        <div class="mf"><button id="fmCancel">Cancel</button><button id="fmOk" class="danger-text">Clear</button></div>`, 'sm');
      $('#fmCancel').onclick = closeModal;
      $('#fmOk').onclick = () => {
        closeModal();
        el.value = '';
        if (fromFeed){ const box = el.closest('.ctlrow') && el.closest('.ctlrow').querySelector('[data-ovr]'); if (box) box.checked = false; }
        saveObj(true);
      };
      return;
    }
    if (act === 'delete'){
      const key = k.slice(7), n = objs.filter(x => x.type === o.type && x.custom && x.custom[key] != null && x.custom[key] !== '').length;
      modal(`<div class="mh">Delete the field ${esc(name)}?</div>
        <div class="mb"><p class="note">${esc(name)} is removed from every ${esc(t)}.${n ? ` ${n} ${n === 1 ? 'device has' : 'devices have'} a value; the values are kept, and adding a field of the same name brings them back.` : ''}</p></div>
        <div class="mf"><button id="fmCancel">Cancel</button><button id="fmOk" class="danger-text">Delete field</button></div>`, 'sm');
      $('#fmCancel').onclick = closeModal;
      $('#fmOk').onclick = () => {
        const list = (TYPE_FIELDS[o.type] || []).filter(x => x.key !== key);
        if (list.length) TYPE_FIELDS[o.type] = list; else delete TYPE_FIELDS[o.type];
        /* Nothing stays hidden under its name, so a field added again later is shown. */
        const lay = FIELD_LAYOUT[o.type]; if (lay && lay.hidden) lay.hidden = lay.hidden.filter(x => x !== k);
        objs.forEach(x => { if (x.type === o.type && x.hide){ x.hide = x.hide.filter(h => h !== k); if (!x.hide.length) delete x.hide; } });
        closeModal(); toast(`${name} deleted from ${t}`); render();
      };
    }
  });
  /* Antivirus: a picked or typed product is added, × removes one; each change is saved at once. */
  const avAdd = $('#view').querySelector('[data-combo="av"]'), avHid = $('#view').querySelector('input[type=hidden][data-k="av"]');
  if (avAdd && avHid){
    const cur = () => avHid.value.split(';').map(x => x.trim()).filter(Boolean);
    const set = list => { avHid.value = list.join('; '); saveObj(false); render(); };
    const add = () => {
      const v = avAdd.value.trim().replace(/;/g, ',');
      if (!v) return;
      if (cur().some(x => x.split(',')[0].trim().toLowerCase() === v.toLowerCase())){ toast(v + ' is already listed.'); avAdd.value = ''; return; }
      set([...cur(), v]);
    };
    avAdd.addEventListener('combopick', add);
    avAdd.addEventListener('keydown', e => { if (e.key === 'Enter' && avAdd.closest('.combo').querySelector('.combo-list').hidden){ e.preventDefault(); add(); } });
    $('#view').querySelectorAll('[data-avx]').forEach(b => b.onclick = () => set(cur().filter((_, i) => i !== +b.dataset.avx)));
  }
  $('#dupBtn').onclick = () => newObjModal({copy: o});
  const ap = $('#addPortsBtn');
  if (ap) ap.onclick = () => { st.addPorts = o.id; render(); const f = $('#view').querySelector('[data-k="ports"]'); if (f){ f.focus(); f.select(); } };
  $('#delBtn').onclick = () => retireModal(o);
  const pg = $('#purgeBtn'); if (pg) pg.onclick = () => purgeModal(o);
  /* Excluded objects are not changed by a Lansweeper sync. The relations option also excludes the objects o is related to. */
  const eb = $('#exclBtn');
  if (eb) eb.onclick = () => {
    o.excluded = !o.excluded;
    hist(o, now(), (o.excluded ? 'Excluded from Lansweeper sync' : 'Back in Lansweeper sync') + ' by ' + who());
    toast(o.name + (o.excluded ? ' is excluded from the sync' : ' is back in the sync')); render();
  };
  const er = $('#exclRelBtn');
  if (er) er.onclick = () => {
    o.excluded = true; hist(o, now(), 'Excluded from Lansweeper sync with its relations by ' + who());
    let n = 0;
    rels.forEach(r => {
      const other = r.from === o.id ? byId(r.to) : r.to === o.id ? byId(r.from) : null;
      if (other && !other.excluded){ other.excluded = true; hist(other, now(), 'Excluded from Lansweeper sync with ' + o.name + ' by ' + who()); n++; }
    });
    toast(o.name + ' and ' + n + ' related object' + (n === 1 ? '' : 's') + ' are excluded from the sync'); render();
  };

  const df = $('#detachFeed'); if (df) df.onclick = () => { o.feed = null; o.detached = true; hist(o, now(), 'Detached from Lansweeper by ' + who()); toast(o.name + ' is detached. Its fields are yours now'); render(); };
  const af = $('#attachFeed'); if (af) af.onclick = () => { delete o.detached; o.feed = {sys: 'Lansweeper', ref: null, seen: null}; hist(o, now(), 'Attached to Lansweeper by ' + who()); toast(o.name + ' is attached. The next sync fills it in'); render(); };
}

/* ---------- modals ---------- */
export function modal(html, cls=''){
  if (!$('#mdl')) modalOpener = document.activeElement;
  /* The dialog is named by its heading, so a screen reader says what it is. */
  const title = ((html.match(/<div class="mh"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || 'Dialog').replace(/<[^>]+>/g, '').trim();
  $('#modalHost').innerHTML = `<div class="modal" id="mdl"><div class="box ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">${html}</div></div>`;
  if (!/locked/.test(cls)) $('#mdl').addEventListener('mousedown', e => { if (e.target.id === 'mdl') closeModal(); });
  bindPolicy($('#mdl'));
  fullTextTooltips($('#mdl'));
  const first = $('#mdl').querySelector('input, select, textarea, button'); if (first) first.focus();
  applyRole();
}
/* Closing a dialog gives the focus back to the control that opened it, so a keyboard user is not sent to the top of the page. */
export let modalOpener = null;
/* Leaving Settings, however it is closed, draws the view behind it again, so changes made there show at once. */
export const closeModal = () => {
  const wasSettings = !!$('#modalHost #setPane');
  $('#modalHost').innerHTML = ''; const back = modalOpener; modalOpener = null; if (back && document.contains(back)) back.focus();
  if (wasSettings) render();
};
document.addEventListener('keydown', e => {
  if (!$('#mdl')) return;
  if (e.key === 'Escape' && $('#mdl .locked')) return;
  if (e.key === 'Escape' && !$('#mdl .locked')) closeModal();
  if (e.key !== 'Tab') return;
  const f = [...$('#mdl .box').querySelectorAll('button:not([disabled]), input:not([disabled]), select, textarea')];
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
});

/* The field policy as checkboxes. Same state in Settings and in the feed wizard. */
/* Two groups: the fields of a device, and what else the feed brings (each with what it does as a tooltip). */
export const policyGrid = () => `<div class="pgrid">${Object.keys(FIELD_LABEL).map(k => `<label class="pchk"><input type="checkbox" data-pol="${k}" ${st.policy[k]?'checked':''}> ${FIELD_LABEL[k]}</label>`).join('')}</div>
  <div class="pgrid pgrid-extra">${Object.keys(FEED_EXTRA).map(k => `<label class="pchk" title="${esc(FEED_EXTRA_HINT[k])}"><input type="checkbox" data-pol="${k}" ${st.policy[k] !== false ?'checked':''}> ${FEED_EXTRA[k]}</label>`).join('')}</div>`;
export function bindPolicy(root){
  root.querySelectorAll('[data-pol]').forEach(c => c.onchange = () => { st.policy[c.dataset.pol] = c.checked; render(); });
}

