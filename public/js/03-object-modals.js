import { PORTED, $, FIELD_LABEL, HISTORY, KINDS, KIND_TARGETS, LOCS, LS_ON, STATUS, TYPES, byId, esc, feedOwns, hist, now, objs, pad2, pathUp, pfxOf, portLabel, rackUnits, racksList, rels, relsOf, rid, st, syncChip, syncOf, tcol, tico, toast, used } from './01-core.js';
import { render } from './07-render-plans.js';
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
  base:[['name','Name','mono'],['type','Type','type'],['model','Model'],['serial','Serial number','mono'],['loc','Location','loc'],['status','Status','status'],['user','User / owner','user']],
  net:[['ip','IP address','mono'],['ip6','IPv6 address','mono'],['mac','MAC address','mono']],
  pc:[['os','Operating system'],['domain','Domain'],['fw','Firmware'],['boot','Last power event'],['disk','Disks'],['patch','Last update'],['av','Antivirus']], server:[['kind','Kind','kind'],['os','Operating system'],['domain','Domain'],['cpu','CPU'],['ram','Memory'],['fw','Firmware'],['boot','Last power event'],['disk','Disks'],['patch','Last update'],['av','Antivirus'],['ports','Ports','mono'],['pfx','Port naming','mono']],
  sip:[['ext','Extension','mono'],['fw','Firmware','mono']], mobile:[['os','Operating system']], android:[['os','Operating system']], ios:[['os','Operating system']], rack:[['units','Height (U)','mono']],
  switch:[['os','Firmware'],['ports','Copper ports','mono'],['sfp','SFP ports','mono'],['pfx','Port naming','mono']],
  router:[['os','Firmware'],['ports','Ports','mono'],['pfx','Port naming','mono']], firewall:[['os','Firmware'],['ports','Ports','mono'],['pfx','Port naming','mono']],
  patch:[['ports','Ports','mono']], storage:[['cap','Capacity','mono'],['proto','Protocol','mono']],
  accesspoint:[['ssid','Wi-Fi networks']],
  monitor:[], printer:[], other:[]
};
export function fieldCtl(o, [k, label, kind], idp = 'f_'){
  const id = idp + o.id + '_' + k;
  let ctl;
  if (kind === 'loc') ctl = `<select id="${id}" data-k="${k}">${LOCS.map(l => `<option ${l===o.loc?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
  else if (kind === 'kind') ctl = `<select id="${id}" data-k="${k}"><option value="physical" ${o.kind!=='vm'?'selected':''}>Physical</option><option value="vm" ${o.kind==='vm'?'selected':''}>Virtual machine</option></select>`;
  else if (kind === 'user') ctl = `<select id="${id}" data-k="user"><option value="">Unassigned</option><option value="__hotdesk" ${o.hotdesk?'selected':''}>Hot desk (shared)</option>${USERS.map(u => `<option value="${u.id}" ${!o.hotdesk && u.id===o.uid?'selected':''}>${esc(u.name)}</option>`).join('')}</select>`;
  else if (kind === 'type') ctl = `<select id="${id}" data-k="type">${Object.entries(TYPES).map(([t, v]) => `<option value="${t}" ${t === o.type ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`;
  else if (kind === 'status') ctl = `<select id="${id}" data-k="${k}">${Object.entries(STATUS).map(([s,v]) => `<option value="${s}" ${s===o.status?'selected':''}>${v.label}</option>`).join('')}</select>`;
  else ctl = `<input id="${id}" data-k="${k}" class="${kind==='mono'?'mono':''}" value="${esc(o[k] ?? '')}">`;
  return ctl;
}
export const fieldKind = k => { const f = Object.values(FIELDS).flat().find(x => x[0] === k); return f ? f[2] : undefined; };
/* One row of Properties. For an object linked to Lansweeper, a field the feed fills in is read-only while "From feed" is
   ticked; untick it to edit the value here. */
export function propRow(o, f){
  const k = f[0];
  const linked = LS_ON() && !!o.feed && !!FIELD_LABEL[k];
  const taken = linked && feedOwns(o, k);
  let ctl = fieldCtl(o, f);
  if (taken) ctl = ctl.replace(/^<(input|select)/, '<$1 disabled');
  const box = linked ? `<label class="pchk"><input type="checkbox" data-ovr="${k}" ${taken ? 'checked' : ''}> From feed</label>` : (LS_ON() && o.feed ? '<span class="pchk-slot" aria-hidden="true"></span>' : '');
  return `<label for="f_${o.id}_${k}">${f[1]}</label><div class="ctlrow">${ctl}${box}</div>`;
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
  return `<div class="panelbox">${head}${dl(`<dt>Software</dt><dd class="plain">${takenBox('software', 'From Lansweeper')}</dd><dt>Links</dt><dd class="plain">${takenBox('links', 'From Lansweeper (switch ports, monitors, hosts)')}</dd>`)}
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
    map[p.name].versions.add(p.version || '—'); map[p.name].devices.push(o);
  }));
  const rows = Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  const sel = rows.find(r => r.name === st.swSel);
  $('#toolbar').innerHTML = `<span class="muted">${rows.length} packages · ${objs.filter(o => (o.software || []).length).length} devices</span><div class="grow"></div><span class="muted hide-n">Add software on a PC or server</span>`;
  $('#view').innerHTML = rows.length ? `<div class="gridwrap" style="height:auto"><table class="grid"><thead><tr><th>Package</th><th>Versions</th><th>Devices</th></tr></thead><tbody>
    ${rows.map(r => `<tr data-sw="${esc(r.name)}" ${sel && sel.name === r.name ? 'style="background:var(--hover)"' : ''}><td><b>${esc(r.name)}</b></td><td class="mono">${esc([...r.versions].join(', '))}</td><td class="n">${r.devices.length}</td></tr>`).join('')}
    </tbody></table></div>
    ${sel ? `<div class="panelbox" style="margin:12px"><div class="hdr">${esc(sel.name)} is installed on</div><div class="gridwrap" style="height:auto"><table class="grid"><thead><tr><th>Device</th><th>Type</th><th>Location</th><th>Version</th></tr></thead><tbody>${sel.devices.map(d => `<tr><td><a class="link" data-open="${d.id}">${esc(d.name)}</a></td><td>${TYPES[d.type] ? esc(TYPES[d.type].short) : esc(d.type)}</td><td>${esc(d.loc || '')}</td><td class="mono">${esc(((d.software || []).find(x => x.name === sel.name) || {}).version || '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`
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
  const fields = [...FIELDS.base, ...(o.type === 'monitor' ? [] : FIELDS.net), ...(FIELDS[o.type] || [])];
  const chain = pathUp(o);
  const targets = objs.filter(x => x.id !== o.id);
  $('#toolbar').innerHTML = `${tico(o.type)}<b class="mono">${esc(o.name)}</b><span class="code">${esc(o.code)}</span><span class="muted hide-n">${TYPES[o.type].label}</span>
    <span class="chip ${STATUS[o.status].cls}">${STATUS[o.status].label}</span><div class="grow"></div>
    <details class="menu"><summary>More</summary><div class="menubox"><button id="dupBtn">Duplicate</button><button id="delBtn">Retire…</button>${canEdit() ? (o.excluded ? '<button id="exclBtn">Include in sync</button>' : '<button id="exclBtn">Exclude from sync</button><button id="exclRelBtn">Exclude with its relations</button>') : ''}${canEdit() ? '<button id="purgeBtn" class="danger-text">Delete permanently…</button>' : ''}</div></details><button id="saveBtn" class="primary" disabled>Save</button>`;
  $('#view').innerHTML = `<div class="obj">
    <div class="col">
      <div class="panelbox"><div class="hdr">Properties</div><div class="form">${fields.map(f => propRow(o, f)).join('')}${extraRows(o, fields)}
        ${rackFields(o)}
        ${o.type === 'pc' ? `<label for="f_${o.id}_attach">Attachments</label><div class="ctlrow"><textarea id="f_${o.id}_attach" data-k="attach" rows="2" placeholder="Headset, mouse, keyboard, dock…">${esc(o.attach||'')}</textarea>${LS_ON() && o.feed ? '<span class="pchk-slot" aria-hidden="true"></span>' : ''}</div>` : ''}
        <label for="f_${o.id}_notes">Notes</label><div class="ctlrow"><textarea id="f_${o.id}_notes" data-k="notes" rows="3" placeholder="Anything that is not in a field: warranty, purchase order, quirks…">${esc(o.notes||'')}</textarea>${LS_ON() && o.feed ? '<span class="pchk-slot" aria-hidden="true"></span>' : ''}</div></div></div>
      ${feedPanel(o)}
    </div>
    <div class="col">
      ${o.type === 'patch' ? patchPanel(o) : ''}
      ${SW_TYPES.includes(o.type) ? softwarePanel(o) : ''}
      <div class="panelbox"><div class="hdr">Relations <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${rs.length}</span></div>
        <div class="relist">${rs.length ? rs.map(x => `<div class="relrow"><span class="k">${x.label}</span><span class="t">${tico(x.other.type,'tico sm')}<a class="link" data-open="${x.other.id}">${esc(x.other.name)}</a>${[...PORTED, 'patch'].includes(byId(x.r.to).type) ? `<input class="rport" data-rport="${x.r.id}" value="${esc(x.r.port ?? '')}" placeholder="Port" aria-label="Port on ${esc(x.other.name)}" style="width:80px">` : (x.port ? `<span class="p">${x.out ? '' : 'on '}${esc(x.port)}</span>` : '')}${x.r.vlan ? `<span class="chip">VLAN ${esc(x.r.vlan)}</span>` : ''}</span><button class="icon ghost" data-delrel="${x.r.id}" title="Remove relation" aria-label="Remove relation">×</button></div>`).join('') : '<div class="relrow muted">No relations yet. Add one below.</div>'}</div>
        <div class="addrel"><select id="arKind" aria-label="Relation"></select>
          <select id="arTo" aria-label="Target" style="flex:1"></select>
          <input id="arPort" placeholder="Port" style="width:90px" aria-label="Port"><button id="arAdd">Add</button></div>
      </div>
      <div class="panelbox"><div class="hdr">Path to the network</div>
        <div class="chain">${chain.length > 1 ? chain.map((n, i) => (i ? `<div class="hop"><span class="arrow">↑</span>${esc(KINDS[n.via.kind].fwd)}${n.via.port!=null ? ` <b class="mono">${esc(portLabel(n.o, n.via.port))}</b>` : ''}</div>` : '') + `<button class="node ${i===0?'me':''}" data-open="${n.o.id}">${tico(n.o.type,'tico sm')}${esc(n.o.name)}</button>`).join('') : '<span class="muted">This object does not hang off anything.</span>'}</div>
      </div>
      <div class="panelbox"><div class="hdr">History</div><ul class="hist">${(HISTORY[o.id]||[]).map(h => `<li><time>${esc(h.t)}</time><span>${esc(h.msg)}</span></li>`).join('')}</ul></div>
    </div></div>`;

  bindSoftware(o);
  const objView = $('#view').querySelector('.obj');
  const dirty = () => { $('#saveBtn').disabled = false; };
  objView.addEventListener('input', dirty); objView.addEventListener('change', dirty);
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
  /* The relation kind decides which objects are offered as targets: a monitor attaches to a PC, a device is patched to a panel. */
  const fitTargets = () => {
    const k = $('#arKind').value;
    $('#arTo').innerHTML = '<option value="">— choose —</option>' + targets.filter(t => KIND_TARGETS[k].includes(t.type) && (k !== 'hosted' || t.kind !== 'vm')).map(t => `<option value="${t.id}">${esc(t.name)} (${TYPES[t.type].short})</option>`).join('');
    $('#arPort').placeholder = k === 'connected' || k === 'uplink' ? 'Port no.' : k === 'patched' ? 'Panel port, e.g. P04' : 'Port (opt.)';
  };
  $('#arKind').innerHTML = Object.entries(KINDS).map(([k,v]) => `<option value="${k}">${v.fwd}</option>`).join('');
  $('#arKind').value = o.type === 'monitor' ? 'attached' : 'connected'; fitTargets();
  $('#arKind').onchange = fitTargets;
  $('#arAdd').onclick = () => {
    const to = $('#arTo').value ? byId($('#arTo').value) : null;
    if (!to){ toast('Choose what to connect to first.'); return; }
    let port = $('#arPort').value.trim(); if (/^\d+$/.test(port) && PORTED.includes(to.type)) port = +port;
    if (PORTED.includes(to.type) && typeof port === 'number' && to.ports && port > to.ports){ toast(`${port} is above the ${to.ports} ports of ${to.name}. Raise its port count first.`); return; }
    if (PORTED.includes(to.type) && typeof port === 'number' && rels.some(r => r.to === to.id && r.port === port)){ toast(pfxOf(to) + port + ' on ' + to.name + ' is already taken. Pick a free port.'); return; }
    if (to.type === 'patch' && rels.some(r => r.to === to.id && r.port === port.toUpperCase())){ toast(port.toUpperCase() + ' on ' + to.name + ' is already taken.'); return; }
    const k = $('#arKind').value;
    const finalPort = port === '' ? null : (to.type === 'patch' ? port.toUpperCase() : port);
    if (rels.some(r => r.from === o.id && r.to === to.id && r.kind === k && String(r.port) === String(finalPort))){ toast('That relation already exists.'); return; }
    if (finalPort != null && rels.some(r => r.to === to.id && String(r.port) === String(finalPort) && (PORTED.includes(to.type) || to.type === 'patch'))){ toast(`${finalPort} on ${to.name} is already taken.`); return; }
    rels.push({id:'r'+rid(), from:o.id, to:to.id, kind:k, port:finalPort, vlan:null});
    hist(o, now(), `Relation "${KINDS[k].fwd} ${to.name}" added by ${who()}`);
    toast('Relation added'); render();
  };
  $('#view').querySelectorAll('[data-delrel]').forEach(b => b.onclick = () => { const i = rels.findIndex(r => r.id === b.dataset.delrel); rels.splice(i, 1); toast('Relation removed'); render(); });
  $('#view').querySelectorAll('[data-rport]').forEach(i => i.onchange = () => {
    const r = rels.find(x => x.id === i.dataset.rport); if (!r) return;
    const to = byId(r.to); let p = i.value.trim();
    if (!p){ toast('A connection to this device needs a port.'); render(); return; }
    if (PORTED.includes(to.type) && /^\d+$/.test(p)) p = +p;
    if (to.type === 'patch') p = p.toUpperCase();
    if (PORTED.includes(to.type) && typeof p === 'number' && to.ports && p > to.ports){ toast(`${p} is above the ${to.ports} ports of ${to.name}. Raise its port count first.`); render(); return; }
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
  $('#saveBtn').onclick = () => {
    /* Addresses are checked before anything is saved; a bad one stays in its field so it can be corrected. */
    const addrs = [...$('#view').querySelectorAll('[data-k="ip"],[data-k="ip6"],[data-k="mac"]')];
    const checked = addrs.map(el => ({ el, c: checkAddress(el.dataset.k, el.value) }));
    const wrong = checked.find(x => !x.c.ok);
    if (wrong){ toast(wrong.c.msg); wrong.el.focus(); return; }
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
      if (k === 'user'){ if (v === '__hotdesk'){ o.hotdesk = true; o.uid = null; } else { delete o.hotdesk; o.uid = v || null; } return; }
      if (['ports','sfp'].includes(k)) v = +v || 0;
      if (k === 'units') v = +v || 42;
      if (k === 'type' && o.type !== v && TYPES[v]){ hist(o, now(), `Type changed from ${TYPES[o.type] ? TYPES[o.type].label : o.type} to ${TYPES[v].label} by ${who()}`); }
      if (k === 'ports' && PORTED.includes(o.type) && v < (o.ports || 0) && rels.some(r => r.to === o.id && typeof r.port === 'number' && r.port > v)){ toast(`Ports in use above ${v} block this change. Move or remove those connections first.`); v = o.ports; }
      if (o.feed && FIELD_LABEL[k] && o[k] !== v){ o.ovr[k] = false; kept.push(FIELD_LABEL[k]); }
      o[k] = v;
    });
    if (place){
      delete o.rack; delete o.u; delete o.h; delete o.ontop;
      Object.assign(o, place);
      if (place.ontop) delete o.u;
    }
    if (o.type === 'server' && o.kind === 'vm') delete o.rack, delete o.u, delete o.h, delete o.ontop;
    hist(o, now(), 'Saved by ' + who() + (kept.length ? ' · kept from feed: ' + kept.join(', ') : ''));
    toast('Saved ' + o.name + (kept.length ? '. Kept from feed: ' + kept.join(', ') : '')); render();
  };
  $('#dupBtn').onclick = () => newObjModal({copy: o});
  $('#delBtn').onclick = () => { o.status = 'retired'; hist(o, now(), 'Retired by ' + who()); toast(o.name + ' marked as retired. It stays in the inventory for the record.'); render(); };
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

