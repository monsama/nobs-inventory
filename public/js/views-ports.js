/* A switch's ports: setup, front panel, groups and the port map (split out of 02-views.js, which re-exports it). */
import { portRangeError, seenChip, lagLinkOf, hasPorts, vlanLabel, $, STATUS, TYPES, byId, esc, isUplink, objs, pfxOf, rels, st, tico, toast, used } from './01-core.js';
import { queueServerSave, render, view } from './07-render.js';
import { linkObjModal, newObjModal } from './05-new-object.js';
import { isAdmin } from './04-settings.js';
import { openObj } from './02-views.js';
/* ---------- switch ports ---------- */
/* Why a port setup cannot be saved, or null. Ports in use and port groups must stay inside the new count. */
export function portSetupError(sw, ports, sfp){
  if (!Number.isInteger(ports) || ports < 0 || ports > 1000) return 'Copper ports: a whole number from 0 to 1000.';
  if (!Number.isInteger(sfp) || sfp < 0 || sfp > 1000) return 'SFP ports: a whole number from 0 to 1000.';
  const total = ports + sfp;
  if (rels.some(r => r.to === sw.id && typeof r.port === 'number' && r.port > total)) return `Ports in use above ${total} block this change. Move or remove those connections first.`;
  const g = (sw.portGroups || []).find(x => x.to > total);
  if (g) return `The port group ${g.name} reaches port ${g.to}. Change or remove it first.`;
  return null;
}
export function renderPorts(){
  const devs = objs.filter(o => hasPorts(o));
  if (!devs.length){
    $('#toolbar').innerHTML = '';
    $('#view').innerHTML = `<div class="empty">No devices with ports yet. Add a switch, router, firewall or physical server to see its ports.${isAdmin() ? ' <button class="primary" id="portsNew">New switch</button>' : ''}</div>`;
    const b = $('#portsNew'); if (b) b.onclick = () => newObjModal({type: 'switch'});
    return;
  }
  /* Without a device picked (or come from), the one used last in this browser, else the first switch: the ports people
     look at most, not whichever device comes first. */
  let last = null; try { last = localStorage.getItem('ni-ports-device'); } catch { /* not kept */ }
  const first = ['switch', 'patch', 'router', 'firewall'].map(t => devs.find(o => o.type === t)).find(Boolean);
  const sw = byId(st.portsDevice) || devs.find(o => o.id === last) || first || devs[0];
  try { localStorage.setItem('ni-ports-device', sw.id); } catch { /* not kept */ }
  $('#toolbar').innerHTML = `<label class="muted" for="portsDevice">Device</label><select id="portsDevice">${devs.map(s => `<option value="${esc(s.id)}">${esc(s.name)}${s.loc ? ' · ' + esc(s.loc.split(' / ')[0]) : ''}</option>`).join('')}</select>
    <span class="muted hide-n">${esc(sw.model)} · ${esc(sw.ip)}</span><div class="grow"></div><button id="portsOpen">Open device</button>`;
  $('#portsDevice').value = sw.id;
  /* A port picked on another device, or one no longer there after the count was lowered, is not this device's: no port
     is open, so nothing can be plugged in before the port exists. */
  if (st.portNo != null && portRangeError(sw, st.portNo)) st.portNo = null;
  $('#portsDevice').onchange = e => { st.portsDevice = e.target.value; st.portNo = null; view(); };
  $('#portsOpen').onclick = () => openObj(sw.id);
  const onPort = p => rels.filter(r => r.to === sw.id && r.port === p);
  /* A relation's port belongs to its far end (the device it goes to), so every port here is one a relation comes in on. */
  const groupOf = p => (sw.portGroups || []).find(g => p >= g.from && p <= g.to);
  /* Each group has its own colour on the front panel, shown in the legend below it. A LAG group has dashed ports. */
  const groupColour = i => `hsl(${(210 + i * 97) % 360} 28% 50%)`;   /* muted: a group is a group, not a warning */
  /* A port in a linked LAG is in use by the device on the other end of the LAG. */
  const lagUse = p => { const g = groupOf(p); const r = g && g.lag ? lagLinkOf(sw, g) : null; return r ? {r, d: byId(r.to === sw.id ? r.from : r.to), g} : null; };
  const portBtn = p => {
    const inc = onPort(p), lu = lagUse(p);
    const dev = inc[0] ? byId(inc[0].from) : lu ? lu.d : null;
    const isUp = (inc[0] && isUplink(inc[0].kind)) || (lu && isUplink(lu.r.kind));
    const poe = dev && (dev.type === 'sip');
    /* No description of its own: the description of the device plugged in, if it has one. */
    const note = (sw.portNotes || {})[p] || (dev && dev.purpose) || '';
    const tip = pfxOf(sw) + p + (note ? ' · ' + note : '') + (groupOf(p) ? ' · ' + groupOf(p).name + (groupOf(p).lag ? ' (LAG)' : '') : '') + (dev ? ' → ' + dev.name : ' · free');
    /* A device with a single port has nothing to choose: its port is shown, but not selectable. */
    const single = (sw.ports || 0) + (sw.sfp || 0) === 1;
    const gi = (sw.portGroups || []).findIndex(g => p >= g.from && p <= g.to);
    const grp = gi >= 0 ? ` grp${(sw.portGroups[gi].lag) ? ' lag' : ''}" style="--g:${groupColour(gi)}` : '';
    return `<button class="port ${dev?(isUp?'upl':'used'):''} ${poe?'poe':''} ${st.portNo===p?'sel':''} ${single?'single':''}${grp}" data-port="${p}" ${single?'disabled':''} title="${esc(tip)}" aria-label="${esc(tip)}">${p}</button>`;
  };
  const groups0 = sw.portGroups || [];
  /* A group being edited fills the form at the bottom; Save group writes it back in its place. */
  if (st.pgEdit && (st.pgEdit.sw !== sw.id || !groups0[st.pgEdit.i])) st.pgEdit = null;
  const pgEditing = st.pgEdit ? groups0[st.pgEdit.i] : null;
  const groups = []; for (let g = 0; g < (sw.ports || 0); g += 12){ const ps = []; for (let p = g+1; p <= Math.min(g+12, sw.ports || 0); p++) ps.push(p); groups.push(ps); }
  const sfps = []; for (let p = (sw.ports || 0)+1; p <= (sw.ports || 0)+(sw.sfp || 0); p++) sfps.push(p);
  const usedN = used(sw);

  /* Everything plugged into the switch, with what hangs behind each device (a PC behind a phone, monitors behind a PC). */
  const behind = (o, depth=0) => rels.filter(r => r.to === o.id && !isUplink(r.kind)).map(r => { const d = byId(r.from); return {d, r, depth, kids: depth < 3 ? behind(d, depth+1) : []}; });
  const flat = (arr, out=[]) => { arr.forEach(x => { out.push(x); flat(x.kids, out); }); return out; };
  const rows = [];
  for (let p = 1; p <= (sw.ports || 0) + (sw.sfp || 0); p++){
    onPort(p).forEach(r => { const d = byId(r.from); rows.push({p, d, r, sub: flat(behind(d))}); });
  }
  /* A LAG link is a row of its own, named by the LAG, with the device on the other end. */
  rels.forEach(r => {
    if (r.lag != null && r.to === sw.id) rows.push({p: 'LAG ' + r.lag, d: byId(r.from), r, sub: flat(behind(byId(r.from)))});
    if (r.fromLag != null && r.from === sw.id) rows.push({p: 'LAG ' + r.fromLag, d: byId(r.to), r, sub: flat(behind(byId(r.to)))});
  });
  const portDetail = st.portNo != null ? rows.filter(x => x.p === st.portNo) : [];
  const selLag = st.portNo != null ? lagUse(st.portNo) : null;
  const selGroup = st.portNo != null ? groupOf(st.portNo) : null;

  /* What is on the picked port: the device and how it is plugged in, so it is known without opening it. */
  const portInfo = x => {
    const d = x.d, note = (sw.portNotes || {})[st.portNo];
    const rows = [['Type', TYPES[d.type] ? TYPES[d.type].label : d.type], ['Model', d.model], ['IP address', d.ip], ['MAC address', d.mac], ['User', d.user],
      ['Description', d.purpose], ['Location', d.loc], ['Link', isUplink(x.r.kind) ? 'Uplink / trunk' : 'Device'], ['VLAN', x.r.vlan ? vlanLabel(x.r.vlan) : (isUplink(x.r.kind) ? 'Trunk' : '')],
      ['Port description', note || ''], ['Status', d.status !== 'active' && STATUS[d.status] ? STATUS[d.status].label : '']].filter(([, v]) => v);
    return `<dl class="kv portinfo">${rows.map(([k, v]) => `<dt>${k}</dt><dd${/IP|MAC/.test(k) ? ' class="mono"' : ''}>${esc(v)}</dd>`).join('')}${seenChip(d) ? `<dt>Last seen</dt><dd>${seenChip(d)}</dd>` : ''}</dl>`;
  };
  const portsBody = () => `<div class="panelbox"><div class="hdr">Front panel <span class="cnt">${usedN} of ${(sw.ports || 0) + (sw.sfp || 0)} ports in use</span></div>
      <div class="face"><div class="chassis"><span class="model">${esc(sw.name)}</span>
        <div class="pgroups">${groups.map(g => `<div class="pgroup">${g.map(portBtn).join('')}</div>`).join('')}<div class="pgroup sfp">${sfps.map(portBtn).join('')}</div></div></div></div>
      ${groups0.length ? `<div class="pgrouplegend">${groups0.map((g, i) => `<span class="pgl${g.lag ? ' lag' : ''}" style="--g:${groupColour(i)}"><i></i>${esc(g.name)} <span class="muted">${esc(pfxOf(sw) + g.from)}${g.to !== g.from ? '–' + esc(pfxOf(sw) + g.to) : ''}</span>${g.lag ? '<b>LAG</b>' : ''}</span>`).join('')}</div>` : ''}
      <div class="legend"><span><i></i>Free</span><span><i style="background:var(--used);border-color:var(--used)"></i>Device</span><span><i style="background:var(--upl);border-color:var(--upl)"></i>Uplink / trunk</span><span><i style="position:relative;background:var(--port)"><b style="position:absolute;top:1px;right:1px;width:5px;height:5px;border-radius:50%;background:var(--poe)"></b></i>PoE powered</span>${((sw.sfp || 0) || 0) ? `<span>Ports ${(sw.ports || 0)+1}–${(sw.ports || 0)+(sw.sfp || 0)} are SFP+</span>` : ''}</div>
    </div>
    ${st.portNo != null ? `<div class="panelbox"><div class="hdr">Description of port ${esc(pfxOf(sw) + st.portNo)}</div><div class="addrel" data-edit><input id="pnDesc" maxlength="120" value="${esc((sw.portNotes || {})[st.portNo] || '')}" placeholder="${esc(portDetail[0] && portDetail[0].d.purpose ? `From the device: ${portDetail[0].d.purpose}` : 'What is on this port, e.g. Printer, 3rd floor')}" aria-label="Description of this port" style="flex:1"></div></div>` : ''}
    ${st.portNo != null ? `<div class="panelbox"><div class="hdr">Port ${esc(pfxOf(sw) + st.portNo)}</div>${portDetail.length ? portDetail.map(x => `<div class="path">${[{o:x.d}, ...x.sub.map(s => ({o:s.d}))].map(n => `<button class="node" data-open="${n.o.id}">${tico(n.o.type,'tico sm')}${esc(n.o.name)}</button>`).join('<span class="edge">behind</span>')}</div>${portInfo(x)}`).join('') : `<div class="path">${selLag ? `<span class="muted">Part of the LAG ${esc(selLag.g.name)}, linked to</span> <button class="node" data-open="${selLag.d.id}">${tico(selLag.d.type,'tico sm')}${esc(selLag.d.name)}</button>` : selGroup && selGroup.lag ? `<span class="muted">Part of the LAG ${esc(selGroup.name)}, not linked yet. Link the LAG from a device page: Relations, then choose the LAG.</span>` : `<span class="muted">Port is free.</span><button id="assignBtn" class="primary">Plug in a device…</button><button id="assignNewBtn">New device…</button>`}</div>`}</div>` : ''}
    <div class="panelbox"><div class="hdr">Port groups <span class="cnt">${groups0.length} ${groups0.length === 1 ? 'group' : 'groups'}</span></div>
      <div class="relist">${groups0.length ? groups0.map((g, i) => `<div class="relrow"><span class="k">${esc(g.name)}</span><span class="t">${g.from === g.to ? 'Port ' : 'Ports '}${esc(pfxOf(sw) + g.from)}${g.from === g.to ? '' : '–' + esc(pfxOf(sw) + g.to)}${g.kind ? ` · ${esc(g.kind)}` : ''}${g.lag ? ' · link aggregate (LAG)' : ''}</span><button data-editgroup="${i}" aria-label="Edit group ${esc(g.name)}">Edit</button><button class="icon ghost" data-delgroup="${i}" title="Remove group" aria-label="Remove group ${esc(g.name)}">×</button></div>`).join('') : '<p class="note lempty">No port groups yet. A group names a range of ports, such as the uplinks.</p>'}</div>
      <div class="addrel" data-edit>${pgEditing ? `<span class="muted">Edit ${esc(pgEditing.name)}:</span>` : ''}<input id="pgName" placeholder="Group name, e.g. Uplinks" aria-label="Group name" value="${esc(pgEditing ? pgEditing.name : '')}"><input id="pgFrom" type="number" min="1" placeholder="From" style="width:80px" aria-label="First port" value="${pgEditing ? pgEditing.from : ''}"><input id="pgTo" type="number" min="1" placeholder="To" style="width:80px" aria-label="Last port" value="${pgEditing ? pgEditing.to : ''}"><input id="pgKind" placeholder="Kind, e.g. SFP+" style="width:120px" aria-label="Kind of port" value="${esc(pgEditing ? pgEditing.kind || '' : '')}"><label class="pchk" title="The ports act as one logical link, bundled with LACP or similar"><input type="checkbox" id="pgLag" ${pgEditing && pgEditing.lag ? 'checked' : ''}> LAG</label>${pgEditing ? '<button id="pgCancel">Cancel</button><button id="pgAdd" class="primary">Save group</button>' : '<button id="pgAdd">Add group</button>'}</div></div>
    <div class="panelbox"><div class="hdr">Port map</div><div style="overflow-x:auto"><table class="grid mini"><thead><tr><th>Port</th><th>Device</th><th>Type</th><th>VLAN</th><th>Behind it</th></tr></thead><tbody>
      ${rows.map(x => `<tr><td class="n">${esc(typeof x.p === 'number' ? pfxOf(sw) + x.p : x.p)}</td><td class="n"><a class="link" data-open="${x.d.id}">${esc(x.d.name)}</a></td><td>${isUplink(x.r.kind) ? 'Uplink' : esc(TYPES[x.d.type].short)}</td><td>${esc(x.r.vlan ? vlanLabel(x.r.vlan) : (isUplink(x.r.kind) ? 'Trunk' : ''))}</td>
        <td>${x.sub.map(s => `<a class="link mono" data-open="${s.d.id}">${esc(s.d.name)}</a>`).join(', ')}</td></tr>`).join('')}
    </tbody></table></div></div></div>`;
  $('#view').innerHTML = `<div id="net">
    <div class="panelbox"><div class="hdr">Port setup</div>
      <div class="form" style="padding:10px 12px" data-edit>
        <label for="psPorts">Copper ports</label><input id="psPorts" type="number" min="0" max="1000" value="${sw.ports || 0}" style="width:180px">
        <label for="psSfp">SFP ports</label><input id="psSfp" type="number" min="0" max="1000" value="${sw.sfp || 0}" style="width:180px">
        <label for="psPfx">Port naming</label><input id="psPfx" class="mono" maxlength="20" value="${esc(sw.pfx || '')}" placeholder="e.g. 1/ or Gi1/0/" style="width:180px">
      </div>
      <div class="addrel"><span class="note" id="psMsg" style="flex:1">A port is the naming followed by its number, for example ${esc((sw.pfx || '') + '12')}.</span></div>
    </div>
    ${!sw.ports && !sw.sfp ? `<p class="note ports-none">${esc(sw.name)} has no ports yet. Enter the number of copper or SFP ports above.</p></div>` : portsBody()}`;

  $('#view').querySelectorAll('.port').forEach(b => b.onclick = () => { st.portNo = +b.dataset.port; view(); });
  const total = (sw.ports || 0) + (sw.sfp || 0);
  $('#view').querySelectorAll('[data-delgroup]').forEach(b => b.onclick = () => {
    const g = groups0[+b.dataset.delgroup];
    if (rels.some(r => (r.to === sw.id && r.lag === g.name) || (r.from === sw.id && r.fromLag === g.name))){ toast(`${g.name} is linked. Remove its link first.`); return; }
    sw.portGroups.splice(+b.dataset.delgroup, 1); queueServerSave(); toast('Port group removed'); render();
  });
  $('#view').querySelectorAll('[data-editgroup]').forEach(b => b.onclick = () => { st.pgEdit = {sw: sw.id, i: +b.dataset.editgroup}; render(); $('#pgName').focus(); });
  const pgCancel = $('#pgCancel'); if (pgCancel) pgCancel.onclick = () => { st.pgEdit = null; render(); };
  const pgAdd = $('#pgAdd'); if (pgAdd) pgAdd.onclick = () => {
    const name = $('#pgName').value.trim(), from = +$('#pgFrom').value, to = +($('#pgTo').value || $('#pgFrom').value), kind = $('#pgKind').value.trim();
    const editing = pgEditing, others = groups0.filter(g => g !== editing);
    if (!name){ toast('Give the group a name.'); return; }
    if (!Number.isInteger(from) || from < 1 || !Number.isInteger(to) || to < from || to > total){ toast(`The ports are numbered 1 to ${total}. Give a range within them.`); return; }
    if (others.some(g => from <= g.to && to >= g.from)){ toast('Those ports are already in a group. Pick ports outside it.'); return; }
    if (others.some(g => g.name.toLowerCase() === name.toLowerCase())){ toast(`There is already a group named ${name}. Give it another name.`); return; }
    /* A device on a port the group did not have yet must move first; one already in the group stays. */
    const wasIn = p => editing && p >= editing.from && p <= editing.to;
    if (rels.some(r => r.to === sw.id && typeof r.port === 'number' && r.port >= from && r.port <= to && !wasIn(r.port))){ toast('A device is on one of these ports. Move it first.'); return; }
    const lag = $('#pgLag').checked;
    const next = {name, from, to, ...(kind ? {kind} : {}), ...(lag ? {lag: true} : {})};
    if (!editing){ sw.portGroups = [...groups0, next]; queueServerSave(); toast('Port group added'); render(); return; }
    /* A linked LAG stays a LAG of the same size, so it still matches the LAG on the other end; a new name moves with its link. */
    const link = editing.lag ? lagLinkOf(sw, editing) : null;
    if (link && (!lag || to - from !== editing.to - editing.from)){ toast(`${editing.name} is linked to a LAG of ${editing.to - editing.from + 1} ports. Keep it a LAG of that size, or remove the link first.`); return; }
    if (link && name !== editing.name) for (const r of rels){ if (r.to === sw.id && r.lag === editing.name) r.lag = name; if (r.from === sw.id && r.fromLag === editing.name) r.fromLag = name; }
    sw.portGroups = groups0.map(g => g === editing ? next : g);
    st.pgEdit = null; queueServerSave(); toast('Port group saved'); render();
  };
  /* The port setup saves when a field is left, like every other field; a count that would drop a used port is refused
     and said beside the fields. */
  const savePorts = () => {
    const ports = $('#psPorts').value === '' ? NaN : +$('#psPorts').value, sfp = $('#psSfp').value === '' ? NaN : +$('#psSfp').value, pfx = $('#psPfx').value.trim();
    if (ports === sw.ports && sfp === (sw.sfp || 0) && pfx === (sw.pfx || '')) return;
    const err = portSetupError(sw, ports, sfp);
    if (err){ $('#psMsg').textContent = err; $('#psMsg').classList.add('err'); return; }
    Object.assign(sw, {ports, sfp, pfx}); queueServerSave(); toast('Ports saved'); render();
  };
  ['#psPorts', '#psSfp', '#psPfx'].forEach(id => { const el = $(id); if (el) el.onchange = savePorts; });
  const pn = $('#pnDesc'); if (pn) pn.onchange = () => {
    const v = pn.value.trim(); sw.portNotes = {...(sw.portNotes || {})};
    if (v) sw.portNotes[st.portNo] = v; else delete sw.portNotes[st.portNo];
    queueServerSave(); toast('Description saved'); render();
  };
  /* A free port: plug in a device the inventory has, or create one already plugged in. */
  const ab = $('#assignBtn'); if (ab) ab.onclick = () => { if (!portRangeError(sw, st.portNo)) linkObjModal({to: sw.id, port: st.portNo}); };
  const an = $('#assignNewBtn'); if (an) an.onclick = () => { if (!portRangeError(sw, st.portNo)) newObjModal({sw: sw.id, port: st.portNo}); };
}
