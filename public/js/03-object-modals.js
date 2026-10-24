import { DOMAINS, FIELD_LAYOUT, KIND_HINTS, patchPort, TYPE_FIELDS, VLANS, releaseRetiredPort, fullTextTooltips, feedLinked, vlanLabel, hasPorts, $, FIELD_LABEL, HISTORY, KINDS, KIND_TARGETS, LOCS, LS_ON, STATUS, TYPES, byId, esc, feedOwns, hist, now, objs, pad2, pathUp, pfxOf, portLabel, rackUnits, racksList, rels, relsOf, rid, st, syncChip, syncOf, tcol, tico, toast, used } from './01-core.js';
import { queueServerSave, render } from './07-render-plans.js';
import { USERS, applyRole, canEdit, checkAddress, mountModal, rackCheck, rackFields, who } from './04-settings.js';
import { newObjModal } from './05-new-object.js';
/* ---------- racks ---------- */
export function renderRack(){
  const racks = racksList();
  const R_ = racks.find(r => r.id === st.rackId) || racks[0];
  if (!R_){ $('#toolbar').innerHTML = ''; $('#view').innerHTML = '<div class="empty">No racks yet. Add an object and pick the type Rack.</div>'; return; }
  st.rackId = R_.id;   /* the rack on screen is the one Mount uses */
  const inRack = objs.filter(o => o.rack === R_.id);
  const slotted = inRack.filter(o => o.u != null && !o.ontop);
  $('#toolbar').innerHTML = `<label class="muted" for="rkSel">Rack</label><select id="rkSel">${racks.map(r => `<option value="${r.id}" ${r.id===R_.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select>
    <span class="muted hide-n">${esc(R_.loc)} · ${rackUnits(R_)}U · ${slotted.reduce((n,o) => n + (o.h||1), 0)} of ${rackUnits(R_)} U used</span><div class="grow"></div>
    <button id="rkMount">Mount device…</button>`;
  $('#rkSel').onchange = e => { st.rackId = e.target.value; render(); };
  $('#rkMount').onclick = mountModal;
  const cells = [];
  for (let n = rackUnits(R_); n >= 1; n--){
    const top = inRack.find(o => o.u + (o.h || 1) - 1 === n);
    if (top){
      const h = top.h || 1, sitting = objs.filter(x => x.ontop === top.id);
      const sub = top.type === 'patch' ? (top.ports || 24) + ' ports · ' + used(top) + ' used' : top.type === 'switch' ? top.ports + '+' + top.sfp + ' ports · ' + used(top) + ' used' : top.type === 'storage' ? top.cap + ' · ' + top.proto : top.model;
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
  base:[['name','Name','mono'],['purpose','Purpose'],['type','Type','type'],['model','Model'],['serial','Serial number','mono'],['loc','Location','loc'],['status','Status','status'],['user','User / owner','user']],
  net:[['ip','IP address','mono'],['ip6','IPv6 address','mono'],['mac','MAC address','mono']],
  pc:[['os','Operating system'],['domain','Domain','domain'],['fw','Firmware'],['boot','Last power event'],['disk','Disks'],['patch','Commissioned'],['av','Antivirus']], server:[['kind','Kind','kind'],['os','Operating system'],['domain','Domain','domain'],['cpu','CPU'],['ram','Memory'],['fw','Firmware'],['boot','Last power event'],['disk','Disks'],['patch','Commissioned'],['av','Antivirus'],['ports','Ports','mono'],['pfx','Port naming','mono']],
  sip:[['ext','Extension','mono'],['fw','Firmware','mono']], mobile:[['os','Operating system']], android:[['os','Operating system']], ios:[['os','Operating system']], rack:[['units','Height (U)','mono']],
  switch:[['os','Firmware'],['ports','Copper ports','mono'],['sfp','SFP ports','mono'],['pfx','Port naming','mono']],
  router:[['os','Firmware'],['ports','Ports','mono'],['pfx','Port naming','mono']], firewall:[['os','Firmware'],['ports','Ports','mono'],['pfx','Port naming','mono']],
  patch:[['ports','Ports','mono']], storage:[['cap','Capacity','mono'],['proto','Protocol','mono']],
  accesspoint:[['ssid','Wi-Fi networks']],
  monitor:[], printer:[], other:[]
};
/* Accessories of a PC (headset, dock, keyboard…): each has a name, a kind and an optional serial number. */
export function accessoriesHtml(o){
  const list = (o.accessories || []).map((a, i) => `<div class="entry"><div class="entry-head"><b>${esc(a.name)}</b>${a.kind ? ` <span class="chip">${esc(a.kind)}</span>` : ''}${a.serial ? ` <span class="mono muted">${esc(a.serial)}</span>` : ''}<button class="icon ghost" data-delacc="${i}" aria-label="Remove ${esc(a.name)}" title="Remove">×</button></div></div>`).join('');
  return `<div class="entries-box">${list || '<p class="note">No attachments yet.</p>'}
    <div class="addrel entry-add"><input id="accName" maxlength="120" placeholder="Name, e.g. Headset" aria-label="Name of the attachment"><input id="accKind" maxlength="60" placeholder="Kind, e.g. Dock" aria-label="Kind of the attachment" style="flex:1"><input id="accSerial" maxlength="60" class="mono" placeholder="Serial (optional)" aria-label="Serial number of the attachment" style="flex:1"><button id="accAdd">Add</button></div></div>`;
}
/* Notes and attachments: each entry has a title, a text and an optional link (a document on a share, a web page). */
export function entriesHtml(o){
  const list = (o.entries || []).map((e, i) => `<div class="entry"><div class="entry-head"><b>${esc(e.title)}</b>${e.link ? ` <a class="link" href="${esc(e.link)}" target="_blank" rel="noopener">Open attachment</a>` : ''}<button class="icon ghost" data-delentry="${i}" aria-label="Remove ${esc(e.title)}" title="Remove">×</button></div>${e.text ? `<div class="entry-text">${esc(e.text)}</div>` : ''}</div>`).join('');
  return `<div class="entries-box">${list || '<p class="note">No notes yet.</p>'}
    <div class="addrel entry-add"><input id="enTitle" maxlength="120" placeholder="Title, e.g. Warranty" aria-label="Title of the note"><input id="enText" maxlength="2000" placeholder="Text (optional)" aria-label="Text of the note" style="flex:2"><input id="enLink" maxlength="500" placeholder="Link (optional), https://…" aria-label="Attachment link" style="flex:1"><button id="enAdd">Add</button></div></div>`;
}
export function fieldCtl(o, [k, label, kind], idp = 'f_'){
  const id = idp + o.id + '_' + k;
  let ctl;
  if (kind === 'loc') ctl = `<select id="${id}" data-k="${k}">${LOCS.map(l => `<option ${l===o.loc?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
  else if (kind === 'kind') ctl = `<select id="${id}" data-k="${k}"><option value="physical" ${o.kind!=='vm'?'selected':''}>Physical</option><option value="vm" ${o.kind==='vm'?'selected':''}>Virtual machine</option></select>`;
  else if (kind === 'user') ctl = `<select id="${id}" data-k="user"><option value="">Unassigned</option><option value="__hotdesk" ${o.hotdesk?'selected':''}>Hot desk (shared)</option>${USERS.map(u => `<option value="${u.id}" ${!o.hotdesk && u.id===o.uid?'selected':''}>${esc(u.name)}</option>`).join('')}</select>`;
  else if (kind === 'type') ctl = `<select id="${id}" data-k="type">${Object.entries(TYPES).map(([t, v]) => `<option value="${t}" ${t === o.type ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`;
  else if (kind === 'domain'){
    /* A domain is picked from the list in Settings. One that is on the object but not in the list still shows, so nothing is lost. */
    const cur = o[k] || '';
    const opts = [...new Set([...DOMAINS.map(d => d.name), cur].filter(Boolean))];
    ctl = `<select id="${id}" data-k="${k}"><option value="">None</option>${opts.map(d => `<option ${d === cur ? 'selected' : ''} title="${esc((DOMAINS.find(x => x.name === d) || {}).desc || '')}">${esc(d)}</option>`).join('')}</select>`;
  }
  else if (kind === 'status') ctl = `<select id="${id}" data-k="${k}">${Object.entries(STATUS).map(([s,v]) => `<option value="${s}" ${s===o.status?'selected':''}>${v.label}</option>`).join('')}</select>`;
  else { const val = k.startsWith('custom.') ? (o.custom || {})[k.slice(7)] : o[k]; ctl = `<input id="${id}" data-k="${k}" ${kind==='number' ? 'type="number"' : ''} class="${kind==='mono'?'mono':''}" value="${esc(val ?? '')}">`; }
  return ctl;
}
export const fieldKind = k => { const f = Object.values(FIELDS).flat().find(x => x[0] === k); return f ? f[2] : undefined; };
/* One row of Properties. For an object linked to Lansweeper, a field the feed fills in is read-only while "From feed" is
   ticked; untick it to edit the value here. */
export function propRow(o, f){
  const k = f[0];
  const linked = LS_ON() && feedLinked(o) && !!FIELD_LABEL[k];
  const taken = linked && feedOwns(o, k);
  let ctl = fieldCtl(o, f);
  if (taken) ctl = ctl.replace(/^<(input|select)/, '<$1 disabled');
  const box = linked ? `<label class="pchk"><input type="checkbox" data-ovr="${k}" ${taken ? 'checked' : ''}> From feed</label>` : (LS_ON() && o.feed ? '<span class="pchk-slot" aria-hidden="true"></span>' : '');
  return `<label for="f_${o.id}_${k}">${esc(f[1])}</label><div class="ctlrow">${ctl}${box}</div>`;
}
/* Fields the feed sets for this object that the type does not show (e.g. CPU on a PC), so nothing is hidden. */
export function extraRows(o, fields){
  if (!o.feed || !LS_ON()) return '';
  return Object.keys(FIELD_LABEL).filter(k => o[k] !== undefined && !fields.some(f => f[0] === k))
    .map(k => propRow(o, [k, FIELD_LABEL[k], fieldKind(k)])).join('');
}
/* Source of the object: its sync status, when Lansweeper last saw it, and what is taken from it. Attach and Detach live here. */
export function feedPanel(o){
  if (!LS_ON()) return '';
  const s = syncOf(o);
  const head = `<div class="hdr">Lansweeper${o.feed ? ` <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${esc(o.feed.sys)}${o.feed.ref ? ' · ' + esc(o.feed.ref) : ''}</span>` : ''}</div>`;
  const dl = (extra = '') => `<dl class="lsbox"><dt>Status</dt><dd>${syncChip(o)}</dd>
    ${o.feed ? `<dt>Last seen</dt><dd style="font-family:inherit">${esc(o.feed.seen || 'not yet')}</dd>` : ''}
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
export const SW_TYPES = ['pc','server'];
export function softwarePanel(o){
  const list = o.software || [];
  return `<div class="panelbox"><div class="hdr">Software <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${list.length} installed</span></div>
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
/* Every package across the PCs and servers; pick one to list where it is installed. */
export function renderSoftware(){
  const map = {};
  objs.forEach(o => (o.software || []).forEach(p => {
    (map[p.name] ??= {name: p.name, versions: new Set(), devices: []});
    map[p.name].versions.add(p.version || '—'); if (!map[p.name].devices.includes(o)) map[p.name].devices.push(o);
  }));
  const rows = Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  /* The package picked in this view has its own selection, separate from the device of the Ports view. */
  const sel = rows.find(r => r.name === st.swSel);
  $('#toolbar').innerHTML = `<span class="muted">${rows.length} packages · ${objs.filter(o => (o.software || []).length).length} devices</span><div class="grow"></div><span class="muted hide-n">Add software on a PC or server</span>`;
  /* The devices of the picked package come first, so they are in sight without scrolling past the whole list. */
  const detail = sel ? `<div class="panelbox" style="margin:12px"><div class="hdr">${esc(sel.name)} is installed on ${sel.devices.length} ${sel.devices.length === 1 ? 'device' : 'devices'}</div><div class="gridwrap" style="height:auto"><table class="grid"><thead><tr><th>Device</th><th>Type</th><th>Location</th><th>Version</th></tr></thead><tbody>
    ${[...sel.devices].sort((x, y) => x.name.localeCompare(y.name)).map(d => `<tr><td><a class="link" data-open="${d.id}">${esc(d.name)}</a></td><td>${TYPES[d.type] ? esc(TYPES[d.type].short) : esc(d.type)}</td><td>${esc(d.loc || '')}</td><td class="mono">${esc(((d.software || []).find(x => x.name === sel.name) || {}).version || '')}</td></tr>`).join('')}
    </tbody></table></div></div>` : '';
  $('#view').innerHTML = rows.length ? `${detail}<div class="gridwrap" style="height:auto"><table class="grid"><thead><tr><th>Package</th><th>Versions</th><th>Devices</th></tr></thead><tbody>
    ${rows.map(r => `<tr data-sw="${esc(r.name)}" ${sel && sel.name === r.name ? 'style="background:var(--hover)"' : ''}><td><b>${esc(r.name)}</b></td><td class="mono">${esc([...r.versions].join(', '))}</td><td class="n">${r.devices.length}</td></tr>`).join('')}
    </tbody></table></div>`
    : '<div class="empty">No software recorded yet. Add it on a PC or server.</div>';
  $('#view').querySelectorAll('[data-sw]').forEach(tr => tr.onclick = () => { st.swSel = st.swSel === tr.dataset.sw ? null : tr.dataset.sw; render(); });
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
  return `<div class="panelbox"><div class="hdr">Ports <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${used(o)} of ${o.ports} in use${trunk ? ' · trunk to ' + esc(byId(trunk.to).name) + ' port ' + esc(portLabel(byId(trunk.to), trunk.port)) : ''}</span></div>
    <div class="pp">${ports.join('')}</div></div>`;
}
/* Deletes an object for good, with its relations and history. Retiring is the way to keep the record. */
/* Retiring keeps the record: the object stays with its relations, ports and rack place, and is no longer offered as a target. */
export function retireModal(o){
  modal(`<div class="mh">Retire ${esc(o.name)}?</div>
    <div class="mb"><p class="note">It stays in the inventory for the record, with its connections, port and rack place. It is no longer offered when connecting something. You can bring it back by changing its status.</p></div>
    <div class="mf"><button id="rtCancel">Cancel</button><button id="rtOk" class="danger-text">Retire</button></div>`, 'sm');
  $('#rtCancel').onclick = closeModal;
  $('#rtOk').onclick = () => { o.status = 'retired'; hist(o, now(), 'Retired by ' + who()); closeModal(); toast(o.name + ' is retired. It stays in the inventory for the record.'); render(); };
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
export function renderObj(o){
  const rs = relsOf(o);
  let fields = [...FIELDS.base, ...(o.type === 'monitor' ? [] : FIELDS.net), ...(FIELDS[o.type] || [])];
  /* Any device can have ports: the port count and naming are offered when its type does not already have them. */
  if (!fields.some(f => f[0] === 'ports')) fields.push(['ports', 'Ports', 'mono'], ['pfx', 'Port naming', 'mono']);
  /* The fields of the type, filled in by hand; their values are kept on the object under custom. */
  fields.push(...(TYPE_FIELDS[o.type] || []).map(f => ['custom.' + f.key, f.label, f.kind]));
  /* The layout of the type, from Settings: a built-in field can be renamed, hidden, and put in another place. Hidden fields keep their values. */
  const lay = FIELD_LAYOUT[o.type] || {};
  const at = f => { const i = (lay.order || []).indexOf(f[0]); return i < 0 ? 1e6 : i; };
  fields = fields.filter(f => f[0].startsWith('custom.') || !(lay.hidden || []).includes(f[0]))
    .map(f => (lay.labels && lay.labels[f[0]] ? [f[0], lay.labels[f[0]], f[2]] : f))
    .sort((a, b) => at(a) - at(b));
  const chain = pathUp(o);
  /* The way up to the network: one row per device, with the relation and its port on the line between two rows. */
  const netPath = `<ol class="netpath">${chain.map((n, i) => `<li class="ps${i === 0 ? ' me' : ''}">
      ${i ? `<div class="ps-hop">${esc(KINDS[n.via.kind].fwd)}${n.via.port != null ? ` <b>${esc(portLabel(n.o, n.via.port))}</b>` : ''}</div>` : ''}
      <div class="ps-row"><span class="ps-dot" aria-hidden="true"></span><button class="ps-name" data-open="${n.o.id}">${tico(n.o.type, 'tico sm')}<span>${esc(n.o.name)}</span></button><span class="ps-type">${esc(TYPES[n.o.type].short)}</span>${i === 0 ? '<span class="ps-me">this device</span>' : ''}</div></li>`).join('')}</ol>`;
  const targets = objs.filter(x => x.id !== o.id && x.status !== 'retired');
  $('#toolbar').innerHTML = `${tico(o.type)}<b class="mono">${esc(o.name)}</b><span class="code">${esc(o.code)}</span><span class="muted hide-n">${TYPES[o.type].label}</span>
    <span class="chip ${STATUS[o.status].cls}">${STATUS[o.status].label}</span><div class="grow"></div>
    <details class="menu"><summary>More</summary><div class="menubox"><button id="dupBtn">Duplicate</button><button id="delBtn">Retire…</button>${canEdit() ? (o.excluded ? '<button id="exclBtn">Include in sync</button>' : '<button id="exclBtn">Exclude from sync</button><button id="exclRelBtn">Exclude with its relations</button>') : ''}${canEdit() ? '<button id="purgeBtn" class="danger-text">Delete permanently…</button>' : ''}</div></details><button id="saveBtn" class="primary" disabled>Save</button>`;
  $('#view').innerHTML = `<div class="obj">
    <div class="col">
      <div class="panelbox"><div class="hdr">Properties</div><div class="form">${fields.map(f => propRow(o, f)).join('')}${extraRows(o, fields)}
        ${rackFields(o)}
        ${o.type === 'pc' ? `<label>Attachments</label><div class="ctlrow entries">${accessoriesHtml(o)}</div>` : ''}
        <label>Notes</label><div class="ctlrow entries">${entriesHtml(o)}${LS_ON() && o.feed ? '<span class="pchk-slot" aria-hidden="true"></span>' : ''}</div></div></div>
      ${feedPanel(o)}
    </div>
    <div class="col">
      ${o.type === 'patch' ? patchPanel(o) : ''}
      ${SW_TYPES.includes(o.type) ? softwarePanel(o) : ''}
      <div class="panelbox"><div class="hdr">Relations <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${rs.length}</span></div>
        <div class="relist">${rs.length ? rs.map(x => `<div class="relrow"><span class="k">${x.label}</span><span class="t">${tico(x.other.type,'tico sm')}<a class="link" data-open="${x.other.id}">${esc(x.other.name)}</a>${x.r.lag == null && (hasPorts(byId(x.r.to)) || byId(x.r.to).type === 'patch') ? `<input class="rport" data-rport="${x.r.id}" value="${esc(x.r.port ?? '')}" placeholder="Port" aria-label="Port on ${esc(x.other.name)}" style="width:80px">` : (x.port ? `<span class="p">${x.out ? '' : 'on '}${esc(x.port)}</span>` : '')}${x.r.vlan ? `<span class="chip">VLAN ${esc(vlanLabel(x.r.vlan))}</span>` : ''}</span><button class="icon ghost" data-delrel="${x.r.id}" title="Remove relation" aria-label="Remove relation">×</button></div>`).join('') : '<div class="relrow muted">No relations yet. Add one below.</div>'}</div>
        <div class="addrel"><select id="arKind" aria-label="Relation"></select>
          <select id="arTo" aria-label="Target" style="flex:1"></select>
          <input id="arPort" placeholder="Port" style="width:90px" aria-label="Port"><select id="arLag" aria-label="LAG on the target" hidden></select><select id="arFromLag" aria-label="LAG on this device" hidden></select><select id="arVlan" aria-label="VLAN" style="width:150px"><option value="">No VLAN</option>${VLANS.map(v => `<option value="${v.vid}">${v.vid} · ${esc(v.name)}</option>`).join('')}</select><button id="arAdd">Add</button></div><p class="note" id="arHint" role="status"></p>
      </div>
      <details class="panelbox fold" ${chain.length > 1 ? 'open' : ''}><summary class="hdr">Path to the network${chain.length > 1 ? ` <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${chain.length - 1} ${chain.length === 2 ? 'hop' : 'hops'}</span>` : ' <span class="muted">none</span>'}</summary>
        ${chain.length > 1 ? netPath : '<div class="chain"><span class="muted">This object does not hang off anything.</span></div>'}
      </details>
      <details class="panelbox fold" ${(HISTORY[o.id]||[]).length ? 'open' : ''}><summary class="hdr">History${(HISTORY[o.id]||[]).length ? '' : ' <span class="muted">none</span>'}</summary>${(HISTORY[o.id]||[]).length ? `<ul class="hist">${(HISTORY[o.id]||[]).map(h => `<li><time>${esc(h.t)}</time><span>${esc(h.msg)}</span></li>`).join('')}</ul>` : '<div class="chain"><span class="muted">No changes recorded yet.</span></div>'}</details>
    </div></div>`;

  bindSoftware(o);
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
    $('#arPort').placeholder = k === 'connected' ? 'Port no., or P04 on a patch panel' : k === 'uplink' ? 'Port no.' : 'Port (opt.)';
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
      if (k === 'user'){ if (v === '__hotdesk'){ o.hotdesk = true; o.uid = null; } else { delete o.hotdesk; o.uid = v || null; } return; }
      if (['ports','sfp'].includes(k)) v = +v || 0;
      if (k === 'units') v = +v || 42;
      if (k === 'type' && o.type !== v && TYPES[v]){ hist(o, now(), `Type changed from ${TYPES[o.type] ? TYPES[o.type].label : o.type} to ${TYPES[v].label} by ${who()}`); }
      if (k === 'ports' && hasPorts(o) && v < (o.ports || 0) && rels.some(r => r.to === o.id && typeof r.port === 'number' && r.port > v)){ toast(`Ports in use above ${v} block this change. Move or remove those connections first.`); v = o.ports; }
      if (feedLinked(o) && FIELD_LABEL[k] && String(o[k] ?? '') !== String(v ?? '')){ o.ovr[k] = false; kept.push(FIELD_LABEL[k]); }
      o[k] = v;
    });
    if (place){
      delete o.rack; delete o.u; delete o.h; delete o.ontop;
      Object.assign(o, place);
      if (place.ontop) delete o.u;
    }
    if (o.type === 'server' && o.kind === 'vm') delete o.rack, delete o.u, delete o.h, delete o.ontop;
    hist(o, now(), 'Saved by ' + who() + (kept.length ? ' · kept from feed: ' + kept.join(', ') : ''));
    toast('Saved ' + o.name + (kept.length ? '. Kept from feed: ' + kept.join(', ') : ''));
    queueServerSave();
    if (rerender) render(); else $('#saveBtn').disabled = true;
  };
  $('#saveBtn').onclick = () => saveObj();
  $('#dupBtn').onclick = () => newObjModal({copy: o});
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
export const closeModal = () => { $('#modalHost').innerHTML = ''; const back = modalOpener; modalOpener = null; if (back && document.contains(back)) back.focus(); };
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
export const policyGrid = () => `<div class="pgrid">${Object.keys(FIELD_LABEL).map(k => `<label class="pchk"><input type="checkbox" data-pol="${k}" ${st.policy[k]?'checked':''}> ${FIELD_LABEL[k]}</label>`).join('')}</div>`;
export function bindPolicy(root){
  root.querySelectorAll('[data-pol]').forEach(c => c.onchange = () => { st.policy[c.dataset.pol] = c.checked; render(); });
}

