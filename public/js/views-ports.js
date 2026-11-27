/* A switch's ports: setup, front panel, groups and the port map (split out of 02-views.js, which re-exports it). */
import { VLANS, portRangeError, seenChip, lagLinkOf, hasPorts, vlanLabel, $, STATUS, TYPES, byId, isUplink, isAttached, reachesPort, objs, pfxOf, rels, st, tico, toast, used, hist, now, snapshot, restoreSnapshot, toastUndo } from './01-core.js';
import { queueServerSave, render, view } from './07-render.js';
import { linkObjModal, newObjModal } from './05-new-object.js';
import { isAdmin, who } from './04-settings.js';
import { openObj } from './02-views.js';
import { html, rawHtml } from './html.js';
import { viaOf } from './cabling.js';
import { bindPatchPanel, patchPanel } from './24-patch.js';
import { closeModal, modal } from './19-modal.js';
/* A switch port with a patch cord: "via PP-01 P04 → 2.OG-R12-04 → PC-0142 (Anna Muster)", or "… (free)". */
export const viaText = v => `via ${v.panel ? v.panel.name : '?'} ${v.port}${v.outlet ? ' → ' + v.outlet.name : ''}${v.device ? ` → ${v.device.name}${v.device.user ? ` (${v.device.user})` : ''}` : ' (free)'}`;
const viaHtml = v => html`<span class="via">via <a class="link" data-open="${v.panel.id}">${v.panel.name}</a> <span class="mono">${v.port}</span>${v.outlet ? html` → <b class="mono">${v.outlet.name}</b>` : ''}${v.device ? html` → <a class="link" data-open="${v.device.id}">${v.device.name}</a>${v.device.user ? html` <span class="muted">(${v.device.user})</span>` : ''}` : html` <span class="muted">(free)</span>`}</span>`;
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
/* Draws the Ports tab for one device with ports (picked, or the one used last in this browser): port setup, the front
   panel, the picked port, port groups and LAGs, and the port map. Changes are saved at once. */
export function renderPorts(){
  /* Patch panels too: picked, the Ports tab shows the panel's ports, outlets and cords. */
  const devs = objs.filter(o => hasPorts(o) || o.type === 'patch');
  if (!devs.length){
    $('#toolbar').innerHTML = '';
    $('#view').innerHTML = html`<div class="empty">No devices with ports yet. Add a switch, router, firewall or physical server to see its ports.${isAdmin() ? html` <button class="primary" id="portsNew">New switch</button>` : ''}</div>`;
    const b = $('#portsNew'); if (b) b.onclick = () => newObjModal({type: 'switch'});
    return;
  }
  /* Without a device picked (or come from), the one used last in this browser, else the first switch: the ports people
     look at most, not whichever device comes first. */
  let last = null; try { last = localStorage.getItem('ni-ports-device'); } catch { /* not kept */ }
  const first = ['switch', 'patch', 'router', 'firewall'].map(t => devs.find(o => o.type === t)).find(Boolean);
  const sw = byId(st.portsDevice) || devs.find(o => o.id === last) || first || devs[0];
  try { localStorage.setItem('ni-ports-device', sw.id); } catch { /* not kept */ }
  $('#toolbar').innerHTML = html`<select id="portsDevice" aria-label="Device whose ports are shown">${devs.map(s => html`<option value="${s.id}">${s.name}${s.loc ? ' · ' + s.loc.split(' / ')[0] : ''}${s.status === 'retired' ? ' · retired' : ''}</option>`)}</select>
    <span class="muted hide-n">${[sw.model, sw.ip].filter(Boolean).join(' · ')}</span><div class="grow"></div><button id="portsOpen">Open device</button>`;
  $('#portsDevice').value = sw.id;
  /* A port picked on another device, or one no longer there after the count was lowered, is not this device's: no port
     is open, so nothing can be plugged in before the port exists. */
  if (st.portNo != null && portRangeError(sw, st.portNo)) st.portNo = null;
  $('#portsDevice').onchange = e => { st.portsDevice = e.target.value; st.portNo = null; view(); };
  $('#portsOpen').onclick = () => openObj(sw.id);
  if (sw.type === 'patch'){
    $('#view').innerHTML = String(patchPanel(sw));
    $('#view').querySelectorAll('[data-open]').forEach(a => a.addEventListener('click', () => openObj(/** @type {HTMLElement} */ (a).dataset.open)));
    bindPatchPanel(sw); return;
  }
  const onPort = p => rels.filter(r => r.to === sw.id && r.port === p);
  /* A relation's port belongs to its far end (the device it goes to), so every port here is one a relation comes in on. */
  const groupOf = p => (sw.portGroups || []).find(g => p >= g.from && p <= g.to);
  /* Each group has its own colour on the front panel, shown in the legend below it. A LAG group has dashed ports. */
  const groupColour = i => `hsl(${(210 + i * 97) % 360} 28% 50%)`;   /* muted: a group is a group, not a warning */
  /* A port in a linked LAG is in use by the device on the other end of the LAG. */
  const lagUse = p => { const g = groupOf(p); const r = g && g.lag ? lagLinkOf(sw, g) : null; return r ? {r, d: byId(r.to === sw.id ? r.from : r.to), g} : null; };
  /* Where Lansweeper's switch scan sees a device that the inventory has elsewhere (a connection set by hand): marked on
     the port and listed under the panel, each with a way to its device (Sources → Use Lansweeper's). */
  const lsDiff = new Map();
  for (const o of objs) {
    const pl = o.feed && o.feed.plug;
    if (!pl || pl.to !== sw.id || o.status === 'retired' || !/^\d{1,4}$/.test(String(pl.port))) continue;
    if (reachesPort(o, sw.id, pl.port)) continue;   /* there along its path (behind a phone, through a panel): the same */
    if (!lsDiff.has(+pl.port)) lsDiff.set(+pl.port, []);
    lsDiff.get(+pl.port).push(o);
  }
  /* A link between two pieces of network gear (switch, router, firewall) is an uplink, also when it was made as a plain
     connection (by hand, or by Lansweeper's switch scan). */
  const GEAR = ['switch', 'router', 'firewall'];
  const upish = r => !!r && (isUplink(r.kind) || (r.kind === 'connected' && GEAR.includes(sw.type) && GEAR.includes((byId(r.from === sw.id ? r.to : r.from) || {}).type)));
  /* The uplinks of this device itself (to the switch or router above it): listed in the port map too. */
  const ownUps = rels.filter(r => r.from === sw.id && r.fromLag == null && (isUplink(r.kind) || upish(r)) && byId(r.to));   /* a LAG has its own row */
  const portBtn = p => {
    const inc = onPort(p), lu = lagUse(p);
    const dev = inc[0] ? byId(inc[0].from) : lu ? lu.d : null;
    const isUp = upish(inc[0]) || (lu && upish(lu.r));
    const poe = dev && (dev.type === 'sip');
    /* No description of its own: the description of the device plugged in, if it has one. */
    const note = (sw.portNotes || {})[p] || (dev && dev.purpose) || '';
    const via = inc[0] && inc[0].kind === 'patched' ? viaOf(sw, p, rels, byId) : null;
    const tip = pfxOf(sw) + p + (note ? ' · ' + note : '') + (groupOf(p) ? ' · ' + groupOf(p).name + (groupOf(p).lag ? ' (LAG)' : '') : '') + (via ? ' · ' + viaText(via) : dev ? ' → ' + dev.name : ' · free');
    /* A device with a single port has nothing to choose: its port is shown, but not selectable. */
    const single = (sw.ports || 0) + (sw.sfp || 0) === 1;
    const gi = (sw.portGroups || []).findIndex(g => p >= g.from && p <= g.to);
    const grp = gi >= 0 ? html` grp${(sw.portGroups[gi].lag) ? ' lag' : ''}" style="--g:${groupColour(gi)}` : '';
    const ls = lsDiff.get(p), tipLs = ls ? `${tip} · Lansweeper sees ${ls.map(o => o.name).join(', ')} here` : tip;
    return html`<button class="port ${dev?(isUp?'upl':'used'):''} ${poe?'poe':''} ${st.portNo===p?'sel':''} ${single?'single':''}${ls ? ' lsdiff' : ''}${grp}" data-port="${p}" ${single?'disabled':''} title="${tipLs}" aria-label="${tipLs}">${p}</button>`;
  };
  const groups0 = sw.portGroups || [];
  /* A group being edited fills the form at the bottom; Save group writes it back in its place. */
  if (st.pgEdit && (st.pgEdit.sw !== sw.id || !groups0[st.pgEdit.i])) st.pgEdit = null;
  const pgEditing = st.pgEdit ? groups0[st.pgEdit.i] : null;
  const groups = []; for (let g = 0; g < (sw.ports || 0); g += 12){ const ps = []; for (let p = g+1; p <= Math.min(g+12, sw.ports || 0); p++) ps.push(p); groups.push(ps); }
  const sfps = []; for (let p = (sw.ports || 0)+1; p <= (sw.ports || 0)+(sw.sfp || 0); p++) sfps.push(p);
  const usedN = used(sw);

  /* Everything plugged into the switch, with what is plugged in behind each device (a PC behind a phone); the monitors and
     docks attached to a computer are no network and are left out. */
  const behind = (o, depth=0) => rels.filter(r => r.to === o.id && !isUplink(r.kind) && !isAttached(r.kind)).map(r => { const d = byId(r.from); return {d, r, depth, kids: depth < 3 ? behind(d, depth+1) : []}; });
  const flat = (arr, out=[]) => { arr.forEach(x => { out.push(x); flat(x.kids, out); }); return out; };
  const rows = [];
  for (let p = 1; p <= (sw.ports || 0) + (sw.sfp || 0); p++){
    /* A patch cord: the panel port, its outlet and the device on it (only that port's, not the whole panel's). */
    onPort(p).forEach(r => {
      const d = byId(r.from), via = r.kind === 'patched' ? viaOf(sw, p, rels, byId) : null;
      rows.push({p, d, r, via, sub: via ? (via.device ? flat(behind(via.device)) : []) : flat(behind(d))});
    });
  }
  /* A LAG link is a row of its own, named by the LAG, with the device on the other end. */
  rels.forEach(r => {
    if (r.lag != null && r.to === sw.id) rows.push({p: 'LAG ' + r.lag, d: byId(r.from), r, sub: flat(behind(byId(r.from)))});
    /* Its own LAG up to another device: that device is above it, so nothing of it is behind this one. */
    if (r.fromLag != null && r.from === sw.id) rows.push({p: 'LAG ' + r.fromLag, d: byId(r.to), r, sub: upish(r) ? [] : flat(behind(byId(r.to)))});
  });
  const portDetail = st.portNo != null ? rows.filter(x => x.p === st.portNo) : [];
  const selLag = st.portNo != null ? lagUse(st.portNo) : null;
  const selGroup = st.portNo != null ? groupOf(st.portNo) : null;

  /* What is on the picked port: the device and how it is plugged in, so it is known without opening it. */
  const portInfo = x => {
    const d = x.d, note = (sw.portNotes || {})[st.portNo];
    const rows = [['Type', TYPES[d.type] ? TYPES[d.type].label : d.type], ['Model', d.model], ['IP address', d.ip], ['MAC address', d.mac], ['User', d.user],
      ['Description', d.purpose], ['Location', d.loc], ['Link', upish(x.r) ? 'Uplink / trunk' : 'Device'], /* An admin changes the VLAN in the list under the details: said once there, not here as well. */
      ...(isAdmin() && VLANS.length && !upish(x.r) && !x.via && typeof x.p === 'number' ? [] : [['VLAN', x.r.vlan ? vlanLabel(x.r.vlan) : (upish(x.r) ? 'Trunk' : '')]]),
      ['Port description', note || ''], ['Status', d.status !== 'active' && STATUS[d.status] ? STATUS[d.status].label : '']].filter(([, v]) => v);
    return html`<dl class="kv portinfo">${rows.map(([k, v]) => html`<dt>${k}</dt><dd${/IP|MAC/.test(k) ? html` class="mono"` : ''}>${v}</dd>`)}${seenChip(d) ? html`<dt>Last seen</dt><dd>${rawHtml(seenChip(d))}</dd>` : ''}</dl>`;
  };
  const edge = html`<span class="edge">behind</span>`;
  const portsBody = () => html`<div class="panelbox"><div class="hdr">Front panel <span class="cnt">${usedN} of ${(sw.ports || 0) + (sw.sfp || 0)} ports in use</span></div>
      <div class="face"><div class="chassis"><span class="model">${sw.name}</span>
        <div class="pgroups">${groups.map(g => html`<div class="pgroup">${g.map(portBtn)}</div>`)}<div class="pgroup sfp">${sfps.map(portBtn)}</div></div></div></div>
      ${groups0.length ? html`<div class="pgrouplegend">${groups0.map((g, i) => html`<span class="pgl${g.lag ? ' lag' : ''}" style="--g:${groupColour(i)}"><i></i>${g.name} <span class="muted">${pfxOf(sw) + g.from}${g.to !== g.from ? '-' + pfxOf(sw) + g.to : ''}</span>${g.lag ? html`<b>LAG</b>` : ''}</span>`)}</div>` : ''}
      <div class="legend"><span><i></i>Free</span><span><i style="background:var(--used);border-color:var(--used)"></i>Device</span><span><i style="background:var(--upl);border-color:var(--upl)"></i>Uplink / trunk</span><span><i style="position:relative;background:var(--port)"><b style="position:absolute;top:1px;right:1px;width:5px;height:5px;border-radius:50%;background:var(--poe)"></b></i>PoE powered</span>${((sw.sfp || 0) || 0) ? html`<span>Ports ${(sw.ports || 0)+1}-${(sw.ports || 0)+(sw.sfp || 0)} are SFP+</span>` : ''}${lsDiff.size ? html`<span><i style="box-shadow:inset 0 0 0 2px var(--warn)"></i>Lansweeper sees otherwise</span>` : ''}</div>
    </div>
    ${lsDiff.size ? html`<div class="panelbox lsdiff-box"><div class="hdr">Lansweeper sees otherwise <span class="cnt">${[...lsDiff.values()].flat().length}</span></div><p class="note" style="padding:8px 12px 0">The switch scan sees these devices on a port of ${sw.name} where the inventory does not have them (set by hand elsewhere). Open one: Sources → Switch port takes Lansweeper's.</p><div class="relist">${[...lsDiff].sort((a, b) => a[0] - b[0]).map(([p, list]) => list.map(o => html`<div class="relrow"><span class="k">Port ${pfxOf(sw) + p}</span><span class="t">${rawHtml(tico(o.type, 'tico sm'))}<a class="link" data-open="${o.id}" data-open-tab="sources" title="Open ${o.name} on Sources, where Use Lansweeper's takes this port">${o.name}</a></span></div>`))}</div></div>` : ''}
    ${st.portNo != null ? html`<div class="panelbox"><div class="hdr">Port ${pfxOf(sw) + st.portNo}</div>${lsDiff.get(st.portNo) ? html`<p class="fieldnote warn" style="margin:8px 12px 0">Lansweeper sees ${lsDiff.get(st.portNo).map((o, i) => html`${i ? ', ' : ''}<a class="link" data-open="${o.id}" data-open-tab="sources">${o.name}</a>`)} here: the inventory has ${lsDiff.get(st.portNo).length === 1 ? 'it' : 'them'} elsewhere.</p>` : ''}<div class="addrel port-desc" data-edit><label class="muted" for="pnDesc">Description</label><input id="pnDesc" maxlength="120" value="${(sw.portNotes || {})[st.portNo] || ''}" placeholder="${portDetail[0] && portDetail[0].d.purpose ? `From the device: ${portDetail[0].d.purpose}` : 'What is on this port, e.g. Printer, 3rd floor'}" aria-label="Description of this port" style="flex:1"></div>${portDetail.length ? portDetail.map(x => html`<div class="path">${[{o:x.d}, ...(x.via && x.via.device ? [{o:x.via.device}] : [])].map((n, i) => html`${i ? (x.via && i === 1 ? html`<span class="edge">${x.via.port}${x.via.outlet ? ' · ' + x.via.outlet.name : ''}</span>` : edge) : ''}<button class="node" data-open="${n.o.id}">${rawHtml(tico(n.o.type,'tico sm'))}${n.o.name}</button>`)}</div>${x.sub.length ? html`<div class="path path-behind"><span class="muted">Behind it (${x.sub.length}):</span>${x.sub.map(sb => html`<button class="node" data-open="${sb.d.id}">${rawHtml(tico(sb.d.type,'tico sm'))}${sb.d.name}</button>`)}</div>` : ''}${x.via ? html`<p class="note via-note">${viaHtml(x.via)}</p>` : ''}${portInfo(x.via && x.via.device ? {...x, d: x.via.device} : x)}${isAdmin() && !x.via && typeof x.p === 'number' ? html`<div class="port-acts">${VLANS.length && !upish(x.r) ? html`<label class="port-vlan">VLAN <select data-portvlan="${x.r.id}"><option value="">None</option>${VLANS.map(v => html`<option value="${v.vid}" ${x.r.vlan === v.vid ? 'selected' : ''}>${vlanLabel(v.vid)}</option>`)}</select></label>` : ''}<button type="button" data-unplug="${x.r.id}" title="Take the link away, with Undo: ${x.d.name} stays in the inventory">Unplug ${x.d.name}</button>${sw.status !== 'retired' ? html`<button type="button" data-moveport="${x.r.id}" title="Plug ${x.d.name} into another port of ${sw.name}">Move to another port…</button><button type="button" data-replace="${x.r.id}" title="Another device on this port: ${x.d.name} is unplugged">Replace…</button>` : ''}</div>` : ''}`) : html`<div class="path">${selLag ? html`<span class="muted">Part of the LAG ${selLag.g.name}, linked to</span> <button class="node" data-open="${selLag.d.id}">${rawHtml(tico(selLag.d.type,'tico sm'))}${selLag.d.name}</button>` : selGroup && selGroup.lag ? html`<span class="muted">Part of the LAG ${selGroup.name}, not linked yet. Link the LAG from a device page: Relations, then choose the LAG.</span>` : html`<span class="muted">Port is free.</span>${isAdmin() && sw.status !== 'retired' ? html`<button id="assignBtn" class="primary">Plug in a device…</button><button id="assignNewBtn">New device…</button>` : sw.status === 'retired' ? html`<span class="muted">${sw.name} is retired: nothing is plugged into it any more.</span>` : ''}`}</div>`}</div>` : ''}
    <div class="panelbox"><div class="hdr">Port groups <span class="cnt">${groups0.length} ${groups0.length === 1 ? 'group' : 'groups'}</span></div>
      <div class="relist">${groups0.length ? groups0.map((g, i) => html`<div class="relrow"><span class="k">${g.name}</span><span class="t">${g.from === g.to ? 'Port ' : 'Ports '}${pfxOf(sw) + g.from}${g.from === g.to ? '' : '-' + pfxOf(sw) + g.to}${g.kind ? ` · ${g.kind}` : ''}${g.lag ? ' · link aggregate (LAG)' : ''}</span><button data-editgroup="${i}" aria-label="Edit group ${g.name}">Edit</button><button class="icon ghost" data-delgroup="${i}" title="Remove group" aria-label="Remove group ${g.name}">×</button></div>`) : html`<p class="note lempty">No port groups yet. A group names a range of ports, such as the uplinks.</p>`}</div>
      <div class="addrel" data-edit>${pgEditing ? html`<span class="muted">Edit ${pgEditing.name}:</span>` : ''}<input id="pgName" placeholder="Group name, e.g. Uplinks" aria-label="Group name" value="${pgEditing ? pgEditing.name : ''}"><input id="pgFrom" type="number" min="1" placeholder="From" style="width:80px" aria-label="First port" value="${pgEditing ? pgEditing.from : ''}"><input id="pgTo" type="number" min="1" placeholder="To" style="width:80px" aria-label="Last port" value="${pgEditing ? pgEditing.to : ''}"><input id="pgKind" placeholder="Kind, e.g. SFP+" style="width:120px" aria-label="Kind of port" value="${pgEditing ? pgEditing.kind || '' : ''}"><label class="pchk" title="The ports act as one logical link, bundled with LACP or similar"><input type="checkbox" id="pgLag" ${pgEditing && pgEditing.lag ? 'checked' : ''}> LAG</label>${pgEditing ? html`<button id="pgCancel">Cancel</button><button id="pgAdd" class="primary">Save group</button>` : html`<button id="pgAdd">Add group</button>`}</div></div>
    <div class="panelbox"><div class="hdr">Port map</div><div style="overflow-x:auto"><table class="grid mini"><thead><tr><th>Port</th><th>Device</th><th>Type</th><th>VLAN</th><th>Behind it</th></tr></thead><tbody>
      ${rows.map(x => html`<tr><td class="n">${typeof x.p === 'number' ? pfxOf(sw) + x.p : x.p}</td><td class="n">${x.via ? viaHtml(x.via) : html`<a class="link" data-open="${x.d.id}">${x.d.name}</a>`}</td><td>${upish(x.r) ? 'Uplink' : x.via ? (x.via.device ? TYPES[x.via.device.type].short : 'Patch') : TYPES[x.d.type].short}</td><td>${x.r.vlan ? vlanLabel(x.r.vlan) : (upish(x.r) ? 'Trunk' : '')}</td>
        <td>${x.sub.map((s, i) => html`${i ? ', ' : ''}<a class="link mono" data-open="${s.d.id}">${s.d.name}</a>`)}</td></tr>`)}
      ${!rows.length && !ownUps.length ? html`<tr><td colspan="5" class="muted">Nothing plugged in yet.</td></tr>` : ''}
      ${ownUps.map(r => { const t = byId(r.to); return html`<tr class="own-up"><td class="n muted">Its uplink</td><td class="n"><a class="link" data-open="${t.id}">${t.name}</a></td><td>Uplink</td><td>${r.vlan ? vlanLabel(r.vlan) : 'Trunk'}</td><td class="muted">${r.port != null ? `on port ${pfxOf(t) + r.port} of ${t.name}` : `to ${t.name}`}</td></tr>`; })}
    </tbody></table></div></div>`;
  /* The setup is done once, so it comes last; a device without ports yet has only it. */
  const setup = html`
    <div class="panelbox"><div class="hdr">Port setup</div>
      <div class="form" style="padding:10px 12px" data-edit>
        <label for="psPorts">Copper ports</label><input id="psPorts" type="number" min="0" max="1000" value="${sw.ports || 0}" style="width:180px">
        <label for="psSfp">SFP ports</label><input id="psSfp" type="number" min="0" max="1000" value="${sw.sfp || 0}" style="width:180px">
        <label for="psPfx">Port naming</label><input id="psPfx" class="mono" maxlength="20" value="${sw.pfx || ''}" placeholder="e.g. 1/ or Gi1/0/" style="width:180px">
      </div>
      <div class="addrel"><span class="note" id="psMsg" style="flex:1">A port is the naming followed by its number, for example ${(sw.pfx || '') + '12'}.</span></div>
    </div>`;
  $('#view').innerHTML = html`<div id="net">
    ${!sw.ports && !sw.sfp ? html`${setup}<p class="note ports-none">${sw.name} has no ports yet. Enter the number of copper or SFP ports above.</p>` : html`${portsBody()}${setup}`}</div>`;

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
    /* A plain group only names ports, so devices on them stay. A LAG is linked as a whole: a device on one of its ports
       must move first, also when an existing group becomes a LAG. */
    const lag = $('#pgLag').checked;
    if (lag && rels.some(r => r.to === sw.id && typeof r.port === 'number' && r.port >= from && r.port <= to)){ toast('A device is on one of these ports, and a LAG is linked as a whole. Move it first.'); return; }
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
  /* Unplug from the port panel: the link goes, with Undo; the device stays. */
  document.querySelectorAll('[data-unplug]').forEach(b => { /** @type {HTMLElement} */ (b).onclick = () => {
    const r = rels.find(x => x.id === /** @type {HTMLElement} */ (b).dataset.unplug); if (!r) return;
    const d = byId(r.from), was = snapshot([d, sw]), at = rels.indexOf(r);
    rels.splice(at, 1); hist(d, now(), `Unplugged from ${sw.name} port ${pfxOf(sw) + r.port} by ${who()}`);
    queueServerSave(); render();
    toastUndo(`${d.name}: unplugged from ${sw.name} port ${pfxOf(sw) + r.port}`, () => { if (!rels.includes(r)) rels.splice(Math.min(at, rels.length), 0, r); restoreSnapshot(was, 'Unplug undone by ' + who()); render(); });
  }; });
  /* The VLAN of a device on a port, changed in place, with Undo. */
  document.querySelectorAll('[data-portvlan]').forEach(el => { const sel = /** @type {HTMLSelectElement} */ (el); sel.onchange = () => {
    const r = rels.find(x => x.id === sel.dataset.portvlan); if (!r) return;
    const d = byId(r.from), was = r.vlan ?? null, to = sel.value === '' ? null : Number(sel.value), snap = snapshot([d]);
    r.vlan = to; hist(d, now(), `VLAN on ${sw.name} port ${pfxOf(sw) + r.port} set to ${to == null ? 'none' : vlanLabel(to)} by ${who()}`);
    queueServerSave(); render();
    toastUndo(`${d.name}: VLAN ${to == null ? 'removed' : vlanLabel(to)}`, () => { r.vlan = was; restoreSnapshot(snap, 'VLAN change undone by ' + who()); render(); });
  }; });
  /* Replace: the plug-in dialog for this port, which unplugs the device on it once another is picked. */
  document.querySelectorAll('[data-replace]').forEach(b => { /** @type {HTMLElement} */ (b).onclick = () => {
    const r = rels.find(x => x.id === /** @type {HTMLElement} */ (b).dataset.replace); if (r) linkObjModal({ to: sw.id, port: r.port, replace: r.id });
  }; });
  /* Move to another port of the same switch: the free ports (not in a LAG) to pick from, with Undo. */
  document.querySelectorAll('[data-moveport]').forEach(b => { /** @type {HTMLElement} */ (b).onclick = () => {
    const r = rels.find(x => x.id === /** @type {HTMLElement} */ (b).dataset.moveport); if (!r) return;
    const d = byId(r.from), total = (sw.ports || 0) + (sw.sfp || 0);
    const free = []; for (let p = 1; p <= total; p++) if (!onPort(p).length && !lagUse(p) && !(groupOf(p) && groupOf(p).lag)) free.push(p);
    if (!free.length){ toast(`${sw.name} has no free port.`); return; }
    modal(html`<div class="mh">Move ${d.name} to another port</div>
      <div class="mb"><div class="form" style="padding:0"><label for="mpPort">Port</label><select id="mpPort">${free.map(p => html`<option value="${p}">${pfxOf(sw) + p}${(sw.portNotes || {})[p] ? ' · ' + sw.portNotes[p] : ''}</option>`)}</select></div>
      <p class="note">Now on ${pfxOf(sw) + r.port}. Only the port changes; the VLAN stays.</p></div>
      <div class="mf"><button id="mpCancel">Cancel</button><button id="mpOk" class="primary">Move</button></div>`, 'sm');
    $('#mpCancel').onclick = closeModal; $('#mpPort').focus();
    $('#mpOk').onclick = () => {
      const to = +$('#mpPort').value, was = r.port, snap = snapshot([d, sw]);
      r.port = to; hist(d, now(), `Moved from ${sw.name} port ${pfxOf(sw) + was} to port ${pfxOf(sw) + to} by ${who()}`);
      closeModal(); st.portNo = to; queueServerSave(); render();
      toastUndo(`${d.name}: moved to ${sw.name} port ${pfxOf(sw) + to}`, () => { r.port = was; restoreSnapshot(snap, 'Port move undone by ' + who()); st.portNo = was; render(); });
    };
  }; });
  const ab = $('#assignBtn'); if (ab) ab.onclick = () => { if (!portRangeError(sw, st.portNo)) linkObjModal({to: sw.id, port: st.portNo}); };
  const an = $('#assignNewBtn'); if (an) an.onclick = () => { if (!portRangeError(sw, st.portNo)) newObjModal({sw: sw.id, port: st.portNo}); };
}
