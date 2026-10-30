/* Settings → Locations and Network: sites and rooms, subnets with their ranges, VLANs and domains. */
import { subnetSpan, ipInt, subnetProblem, overlapProblem } from './net.js';
import { queueServerSave, render } from './07-render.js';
import { USERS, canEdit, who } from './04-settings.js';
import { REVIEW, esc, VLANS, TYPES, tico, $, st, SUBNETS, objs, hist, now, toast, toastUndo, rels, DOMAINS, LOCS, SITES, PLANS } from './01-core.js';
/* Locations are 'Site / Room'. Renaming one moves the objects and racks that use it. */
export const cleanLoc = v => { const t = v.trim().split(/\s*\/\s*/).map(x => x.trim()); return t.length === 2 && t[0] && t[1] ? t.join(' / ') : ''; };
/* The uses a range can have. DHCP and reserved ranges are skipped when an address is picked for a device. */
const RANGE_USES = ['DHCP', 'Static', 'Reserved'];
const rangeRowHtml = (r = {}) => {
  const use = r.use || '', opts = [...new Set(['', ...RANGE_USES, use])];
  return `<div class="sn-range"><input data-rf class="mono" placeholder="10.10.20.50" value="${esc(r.from || '')}" aria-label="First address">
    <span class="muted">to</span><input data-rt class="mono" placeholder="10.10.20.99" value="${esc(r.to || '')}" aria-label="Last address">
    <select data-ru aria-label="Use of the range">${opts.map(u => `<option value="${esc(u)}" ${u === use ? 'selected' : ''}>${u ? esc(u) : 'No use set'}</option>`).join('')}</select>
    <button type="button" class="sn-rx" data-rx aria-label="Remove this range" title="Remove this range">×</button></div>`;
};
/* A subnet as typed in the editor. A range left empty is dropped; a half-filled one is kept, so the check says what is wrong. */
const subnetFromEditor = ed => {
  const q = s => ed.querySelector(s);
  const ranges = [...ed.querySelectorAll('.sn-range')].map(r => ({from: r.querySelector('[data-rf]').value.trim(), to: r.querySelector('[data-rt]').value.trim(), use: r.querySelector('[data-ru]').value}))
    .filter(r => r.from || r.to).map(r => ({from: r.from, to: r.to, ...(r.use ? {use: r.use} : {})}));
  return {
    name: q('[data-sn]').value.trim(), vid: q('[data-sv]').value === '' ? null : +q('[data-sv]').value,
    cidr: q('[data-sc]').value.trim(), gateway: q('[data-sg]').value.trim(),
    dns: q('[data-sd]').value.split(',').map(x => x.trim()).filter(Boolean), ranges,
    types: [...ed.querySelectorAll('[data-sty]:checked')].map(c => c.value)
  };
};
/* The editor of one subnet, for a new one or one in the list. A note says what was filled in from Lansweeper. */
const subnetEditorHtml = (n, key, hint = '') => `<div class="sn-edit" data-sub="${key}">
    <div class="sn-grid">
      <label>Name<input data-sn maxlength="60" value="${esc(n.name || '')}" placeholder="e.g. Office Bern"></label>
      <label>Subnet<input data-sc class="mono" placeholder="10.10.20.0/24" value="${esc(n.cidr || '')}"></label>
      <label>VLAN<select data-sv><option value="">None</option>${VLANS.map(v => `<option value="${v.vid}" ${v.vid === n.vid ? 'selected' : ''}>${v.vid} · ${esc(v.name)}</option>`).join('')}</select></label>
      <label>Gateway<input data-sg class="mono" placeholder="10.10.20.1" value="${esc(n.gateway || '')}"></label>
      <label class="span2">DNS servers<input data-sd class="mono" placeholder="10.10.1.5, 10.10.1.6" value="${esc((n.dns || []).join(', '))}"></label>
    </div>
    <div class="sn-sect"><div class="sn-sh">Ranges<button type="button" data-radd>Add range</button></div>
      <div class="sn-ranges">${(n.ranges || []).map(rangeRowHtml).join('')}</div>
      <p class="note">A device's IP address lists the free addresses of Static ranges and of ones without a use; DHCP and Reserved ranges are left out.</p></div>
    <div class="sn-sect"><div class="sn-sh">Device types that take an address here<span class="sn-tq"><button type="button" class="link" data-tall>All</button><button type="button" class="link" data-tnone>None</button></span></div>
      <div class="sn-typegrid">${Object.entries(TYPES).map(([k, t]) => `<label class="sn-type"><input type="checkbox" data-sty value="${k}" ${(n.types || []).includes(k) ? 'checked' : ''}>${tico(k, 'tico sm')}<span>${esc(t.label)}</span></label>`).join('')}</div></div>
    ${hint ? `<p class="note sn-hint">${hint}</p>` : ''}
    <div class="subnet-foot"><span class="snmsg" aria-live="polite"></span><span class="grow"></span><button type="button" data-scancel>Cancel</button><button type="button" class="primary" data-ssave>${key === 'new' ? 'Add subnet' : 'Save'}</button></div></div>`;
/* A subnet in the list: its name, address and VLAN, with the gateway, ranges and device types underneath. */
const subnetItemHtml = (n, i, edit) => {
  const ranges = (n.ranges || []).map(r => `${r.use ? esc(r.use) + ' ' : ''}<span class="mono">${esc(r.from)}${r.to !== r.from ? '–' + esc(r.to.split('.').pop()) : ''}</span>`).join(', ');
  const types = (n.types || []).filter(t => TYPES[t]).map(t => TYPES[t].label);
  const meta = [n.gateway ? `Gateway <span class="mono">${esc(n.gateway)}</span>` : '', (n.dns || []).length ? `DNS <span class="mono">${esc(n.dns.join(', '))}</span>` : '',
    ranges ? `Ranges ${ranges}` : 'No ranges', types.length ? `For ${esc(types.slice(0, 4).join(', '))}${types.length > 4 ? ` and ${types.length - 4} more` : ''}` : 'No device types'].filter(Boolean);
  return `<div class="sn-item"><div class="sn-head"><b>${esc(n.name)}</b><span class="mono">${esc(n.cidr)}</span>${n.vid != null ? `<span class="chip">VLAN ${n.vid}</span>` : ''}<span class="grow"></span>
    ${edit ? `<button data-sedit="${i}">Edit</button><button data-sx="${i}">Delete</button>` : ''}</div><div class="sn-meta">${meta.join(' · ')}</div></div>`;
};
/* Which subnet is open in the editor: 'new', a position in the list, or none; and what a new one starts with. */
let snEdit = null, snDraft = null;
/* Settings opens with no subnet half edited. */
export const resetSubnetEdit = () => { snEdit = null; snDraft = null; };
/* The subnets of the network. Each row is checked when it is changed, and a row that is not right is kept as typed, with the reason. */
export function renderSetSubnets(){
  const root = $('#setSubnets');
  if (!root) return;
  const edit = canEdit();
  if (!edit) snEdit = null;
  /* Subnets the devices' adapters are in that the list does not have yet. Use opens the editor filled in; nothing is added by itself. */
  const suggested = (st.lsNets || []).filter(n => !SUBNETS.some(x => x.cidr === n.cidr));
  root.innerHTML = `<div class="hdr">Subnets <span class="cnt">${SUBNETS.length}</span></div>
    <p class="note" style="padding:10px 12px 0">Each subnet is on one VLAN. Its gateway, DNS servers and ranges are inside it, and the device types are the ones that take an address from it.</p>
    <div class="subnets">${SUBNETS.length ? SUBNETS.map((n, i) => snEdit === i ? subnetEditorHtml(n, i) : subnetItemHtml(n, i, edit && snEdit === null)).join('') : '<p class="note lempty">No subnets yet.</p>'}</div>
    ${snEdit === 'new' ? subnetEditorHtml(snDraft ? snDraft.n : {}, 'new', snDraft ? snDraft.hint : '') : edit ? `<div class="sn-addbar"><button id="snNew">Add subnet</button></div>` : ''}
    ${suggested.length ? `<div class="sn-suggest"><div class="sn-sughead"><p class="note" style="padding:0">Seen by Lansweeper, not listed yet</p>${edit && snEdit === null && suggested.length > 1 ? `<button id="snUseAll">Use all ${suggested.length}</button>` : ''}</div>${suggested.map((n, i) => `<div class="snrow"><span class="mono">${esc(n.cidr)}</span><span class="grow">${n.devices} ${n.devices === 1 ? 'device' : 'devices'}${n.gateway ? ' · gateway ' + esc(n.gateway) : ''}${n.name ? ' · ' + esc(n.name) : ''}</span>${edit && snEdit === null ? `<button data-snuse="${i}">Use</button>` : ''}</div>`).join('')}</div>` : ''}`;
  if (!edit) return;
  const open = (key, draft = null) => { snEdit = key; snDraft = draft; renderSetSubnets(); const f = root.querySelector('.sn-edit [data-sn]'); if (f) f.focus(); };
  root.querySelectorAll('[data-sedit]').forEach(b => b.onclick = () => open(+b.dataset.sedit));
  const nb = $('#snNew'); if (nb) nb.onclick = () => open('new');
  root.querySelectorAll('[data-sx]').forEach(b => b.onclick = () => {
    const gone = SUBNETS[+b.dataset.sx];
    if (!confirm(`Delete the subnet ${gone.name} (${gone.cidr})? Devices on it keep their addresses.`)) return;
    for (const o of objs) if (o.subnet === gone.cidr){ delete o.subnet; hist(o, now(), `Subnet ${gone.name} (${gone.cidr}) deleted by ${who()}`); }
    SUBNETS.splice(+b.dataset.sx, 1); queueServerSave(); toast('Subnet deleted'); renderSetSubnets();
  });
  /* A suggestion as a subnet: name, gateway, DNS, the types seen there and a range per kind of address seen. */
  const fromSuggestion = n => ({name: n.name || n.cidr, cidr: n.cidr, vid: null, gateway: n.gateway || '', dns: n.dns || [],
    types: (n.types || []).map(t => t.type).filter(t => TYPES[t]), ranges: (n.seen || []).map(x => ({from: x.from, to: x.to, use: x.use}))});
  /* Use all: every suggestion is added. A gateway, DNS server or range that does not fit is left out of that subnet, and one
     that overlaps a subnet already listed is skipped; the message says what was done. */
  const all = $('#snUseAll');
  if (all) all.onclick = () => {
    const added = [], trimmed = [], skipped = [];
    for (const n of suggested) {
      const v = fromSuggestion(n), cut = [], span = subnetSpan(v), inside = a => { const x = ipInt(a); return x !== null && span && x >= span.first && x <= span.last; };
      if (v.gateway && !inside(v.gateway)){ cut.push(`gateway ${v.gateway}`); v.gateway = ''; }
      if (v.dns.some(d => ipInt(d) === null)){ v.dns = v.dns.filter(d => ipInt(d) !== null); cut.push('DNS'); }
      const ok = v.ranges.filter(r => inside(r.from) && inside(r.to) && ipInt(r.from) <= ipInt(r.to));
      if (ok.length < v.ranges.length){ v.ranges = ok; cut.push('a range'); }
      if (subnetProblem(v) || overlapProblem([...SUBNETS, v])){ skipped.push(n.cidr); continue; }
      SUBNETS.push(v); added.push(n.cidr); if (cut.length) trimmed.push(`${n.cidr} without its ${cut.join(' and ')}`);
    }
    if (added.length) queueServerSave();
    toast(`Added ${added.length} ${added.length === 1 ? 'subnet' : 'subnets'}${trimmed.length ? `; ${trimmed.join(', ')}` : ''}${skipped.length ? `; skipped ${skipped.join(', ')}` : ''}. Check their ranges against your DHCP server.`);
    renderSetSubnets();
  };
  /* Use: the editor filled in with what Lansweeper saw: name, gateway, DNS, the device types there, and a range per kind
     of address (DHCP, static) from the lowest to the highest address seen. */
  root.querySelectorAll('[data-snuse]').forEach(b => b.onclick = () => {
    const n = suggested[+b.dataset.snuse];
    const types = (n.types || []).map(t => t.type).filter(t => TYPES[t]);
    const seen = n.seen || [];
    const hint = `Filled in from what Lansweeper saw in ${esc(n.cidr)}: ${n.devices} ${n.devices === 1 ? 'device' : 'devices'}${types.length ? ` of ${types.length} ${types.length === 1 ? 'type' : 'types'}` : ''}.`
      + (seen.length ? ` Each range runs from the lowest to the highest address seen of its kind (${seen.map(x => `${x.use}: ${x.count}`).join(', ')}): check them against your DHCP server before saving.` : '');
    open('new', {n: fromSuggestion(n), hint});
  });
  const ed = root.querySelector('.sn-edit');
  if (!ed) return;
  const key = ed.dataset.sub;
  const bindRanges = () => ed.querySelectorAll('[data-rx]').forEach(x => x.onclick = () => x.closest('.sn-range').remove());
  bindRanges();
  ed.querySelector('[data-radd]').onclick = () => { ed.querySelector('.sn-ranges').insertAdjacentHTML('beforeend', rangeRowHtml({use: 'Static'})); bindRanges(); ed.querySelector('.sn-range:last-child [data-rf]').focus(); };
  ed.querySelector('[data-tall]').onclick = () => ed.querySelectorAll('[data-sty]').forEach(c => { c.checked = true; });
  ed.querySelector('[data-tnone]').onclick = () => ed.querySelectorAll('[data-sty]').forEach(c => { c.checked = false; });
  ed.querySelector('[data-scancel]').onclick = () => { snEdit = null; snDraft = null; renderSetSubnets(); };
  ed.querySelector('[data-ssave]').onclick = () => {
    const v = subnetFromEditor(ed), problem = subnetProblem(v), msg = ed.querySelector('.snmsg');
    if (problem){ msg.innerHTML = warn(problem); return; }
    const others = key === 'new' ? SUBNETS : SUBNETS.filter((_, k) => k !== +key), clash = overlapProblem([...others, v]);
    if (clash){ msg.innerHTML = warn(clash); return; }
    if (key === 'new'){ SUBNETS.push(v); toast('Subnet added'); }
    else {
      /* A subnet written with a new address keeps its devices: they point at it by its address. */
      const was = SUBNETS[+key].cidr;
      if (was !== v.cidr) for (const o of objs) if (o.subnet === was){ o.subnet = v.cidr; hist(o, now(), `Subnet ${v.name} is now ${v.cidr} (was ${was}), changed by ${who()}`); }
      SUBNETS[+key] = v; toast('Subnet saved');
    }
    snEdit = null; snDraft = null; queueServerSave(); renderSetSubnets();
  };
}
/* VLANs are one list for the whole inventory. A connection picks one from it, so a VLAN is named once. */
export function renderSetVlans(){
  const cnt = $('#vlCnt'); if (cnt) cnt.textContent = VLANS.length;
  const usedBy = vid => rels.filter(r => r.vlan === vid).length;
  const subnetsOn = vid => SUBNETS.filter(n => n.vid === vid).length;
  $('#setVlans').innerHTML = `<div class="lrows"><div class="lrow head vl"><span>VLAN</span><span>Name</span><span>Description</span><span class="n">Used by</span><span></span></div>
    ${VLANS.length ? VLANS.map((v, i) => { const n = usedBy(v.vid); return `<div class="lrow vl"><span class="mono">${v.vid}</span><input data-vn="${i}" maxlength="60" value="${esc(v.name)}" aria-label="Name of VLAN ${v.vid}"><input data-vdesc="${i}" maxlength="120" value="${esc(v.desc || '')}" placeholder="Description" aria-label="Description of VLAN ${v.vid}"><span class="n">${n}</span>
      <button data-vd="${i}" ${n || subnetsOn(v.vid) ? `disabled title="${subnetsOn(v.vid) ? 'A subnet is on this VLAN' : 'In use by ' + n + ' connections'}"` : ''}>Delete</button></div>`; }).join('') : '<p class="note lempty">No VLANs yet. Add the ones your network uses.</p>'}</div>
    <div class="lpanel-add"><input id="vlId" type="number" min="1" max="4094" placeholder="ID, e.g. 10" aria-label="VLAN ID" style="width:120px"><input id="vlName" placeholder="Name, e.g. Users" aria-label="VLAN name"><input id="vlDesc" maxlength="120" placeholder="Description (optional)" aria-label="VLAN description"><button id="vlAdd">Add VLAN</button></div>
    ${SUBNETS.some(n => n.vid != null) ? `<p class="note lnote">${SUBNETS.filter(n => n.vid != null).map(n => `VLAN ${n.vid} carries ${esc(n.name)}, ${esc(n.cidr)}`).join(' · ')}</p>` : ''}
    <p class="note lnote" id="vlMsg">IDs run from 1 to 4094. Each VLAN ID is listed once.</p>`;
  const root = $('#setVlans');
  root.querySelectorAll('[data-vn]').forEach(i => i.onchange = () => {
    const name = i.value.trim(), v = VLANS[+i.dataset.vn];
    if (!name){ i.value = v.name; $('#vlMsg').innerHTML = warn('A VLAN needs a name.'); return; }
    v.name = name; queueServerSave(); render(); renderSetVlans();
  });
  root.querySelectorAll('[data-vd]').forEach(b => b.onclick = () => { VLANS.splice(+b.dataset.vd, 1); queueServerSave(); toast('VLAN deleted'); renderSetVlans(); render(); });
  root.querySelectorAll('[data-vdesc]').forEach(i => i.onchange = () => { VLANS[+i.dataset.vdesc].desc = i.value.trim(); queueServerSave(); renderSetVlans(); });
  const add = () => {
    const vid = +$('#vlId').value, name = $('#vlName').value.trim(), msg = $('#vlMsg');
    if (!Number.isInteger(vid) || vid < 1 || vid > 4094){ msg.innerHTML = warn('The ID is a number from 1 to 4094.'); $('#vlId').focus(); return; }
    if (!name){ msg.innerHTML = warn('Give the VLAN a name.'); $('#vlName').focus(); return; }
    if (VLANS.some(v => v.vid === vid)){ msg.innerHTML = warn('VLAN ' + vid + ' is already listed.'); return; }
    const desc = $('#vlDesc').value.trim();
    VLANS.push({vid, name, ...(desc ? {desc} : {})}); VLANS.sort((a, b) => a.vid - b.vid);
    queueServerSave(); toast('Added VLAN ' + vid); renderSetVlans(); render();
  };
  $('#vlAdd').onclick = add;
  $('#vlName').onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); add(); } };
  renderSetDomains();
}
/* Domains are one list for the whole inventory; an object's domain is picked from it. */
export function renderSetDomains(){
  const usedBy = d => objs.filter(o => o.domain === d.name).length;
  const counts = new Map();
  for (const o of objs) if (o.domain && o.status !== 'retired' && !DOMAINS.some(d => d.name.toLowerCase() === o.domain.toLowerCase())) counts.set(o.domain, (counts.get(o.domain) || 0) + 1);
  const seen = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  $('#setDomains').innerHTML = `<div class="hdr">Domains <span class="cnt">${DOMAINS.length}</span></div>
    <div class="lrows">${DOMAINS.length ? DOMAINS.map((d, i) => { const n = usedBy(d); return `<div class="lrow dm"><input data-dname="${i}" class="mono" maxlength="60" value="${esc(d.name)}" aria-label="Domain ${esc(d.name)}"><input data-ddesc="${i}" maxlength="120" value="${esc(d.desc || '')}" placeholder="Description" aria-label="Description of ${esc(d.name)}"><span class="n">${n}</span><button data-dd="${i}" ${n ? `disabled title="Used by ${n} objects"` : ''}>Delete</button></div>`; }).join('') : '<p class="note lempty">No domains yet. Add the domains your devices join.</p>'}</div>
    <div class="lpanel-add"><input id="dmName" maxlength="60" placeholder="Domain, e.g. corp.example.ch" aria-label="New domain"><input id="dmDesc" maxlength="120" placeholder="Description (optional)" aria-label="Domain description"><button id="dmAdd">Add domain</button></div>
    ${seen.length ? `<div class="sn-suggest"><div class="sn-sughead"><p class="note" style="padding:0">Seen on devices, not listed yet</p>${canEdit() && seen.length > 1 ? `<button id="dmUseAll">Add all ${seen.length}</button>` : ''}</div>${seen.map(([d, n], i) => `<div class="snrow"><span class="mono">${esc(d)}</span><span class="grow">${n} ${n === 1 ? 'device' : 'devices'}</span>${canEdit() ? `<button data-dmuse="${i}">Add</button>` : ''}</div>`).join('')}</div>` : ''}`;
  const root = $('#setDomains');
  /* Domains the devices are in (from Lansweeper, or typed on a device) that the list does not have yet. */
  const addSeen = list => { for (const [d] of list) if (!DOMAINS.some(x => x.name.toLowerCase() === d.toLowerCase())) DOMAINS.push({name: d}); DOMAINS.sort((a, b) => a.name.localeCompare(b.name)); queueServerSave(); renderSetDomains(); render(); };
  root.querySelectorAll('[data-dmuse]').forEach(b => b.onclick = () => { const x = seen[+b.dataset.dmuse]; addSeen([x]); toast('Added ' + x[0]); });
  const all = $('#dmUseAll'); if (all) all.onclick = () => { addSeen(seen); toast(`Added ${seen.length} domains`); };
  root.querySelectorAll('[data-dd]').forEach(b => b.onclick = () => { DOMAINS.splice(+b.dataset.dd, 1); queueServerSave(); toast('Domain deleted'); renderSetDomains(); render(); });
  root.querySelectorAll('[data-ddesc]').forEach(i => i.onchange = () => { DOMAINS[+i.dataset.ddesc].desc = i.value.trim(); queueServerSave(); renderSetDomains(); });
  /* A domain can be renamed; the objects in it move with it. */
  root.querySelectorAll('[data-dname]').forEach(i => i.onchange = () => {
    const d = DOMAINS[+i.dataset.dname], was = d.name, name = i.value.trim();
    if (!name || name === was) { i.value = was; return; }
    if (/\s/.test(name)){ i.value = was; toast('A domain name has no spaces.'); return; }
    if (DOMAINS.some(x => x !== d && x.name.toLowerCase() === name.toLowerCase())){ i.value = was; toast(name + ' is already listed.'); return; }
    d.name = name;
    for (const o of objs) if (o.domain === was){ o.domain = name; hist(o, now(), `Domain ${was} renamed to ${name} by ${who()}`); }
    queueServerSave(); toast(`${was} is now ${name}`); renderSetDomains(); render();
  });
  const add = () => {
    const name = $('#dmName').value.trim(), desc = $('#dmDesc').value.trim();
    if (!name){ toast('Write the domain name.'); return; }
    if (DOMAINS.some(d => d.name.toLowerCase() === name.toLowerCase())){ toast(name + ' is already listed.'); return; }
    DOMAINS.push({name, ...(desc ? {desc} : {})}); DOMAINS.sort((a, b) => a.name.localeCompare(b.name));
    queueServerSave(); toast('Added ' + name); renderSetDomains(); render();
  };
  $('#dmAdd').onclick = add;
  $('#dmName').onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); add(); } };
}
export const warn = t => '<span style="color:var(--danger)">' + esc(t) + '</span>';
export const siteOf = l => String(l || '').split(' / ')[0];
export function renderSetLocs(){
  if (!$('#setLocs')) return;   /* an Undo after Settings was closed: nothing here to draw */
  const siteRow = (x, i) => {
    /* The devices there, counted as in the sidebar; its rooms also keep it from being deleted. */
    const n = objs.filter(o => siteOf(o.loc) === x).length, rooms = LOCS.filter(l => siteOf(l) === x).length;
    const why = [n ? `${n} ${n === 1 ? 'device' : 'devices'}` : '', rooms ? `${rooms} ${rooms === 1 ? 'room' : 'rooms'}` : ''].filter(Boolean).join(' and ');
    return `<div class="lrow"><input data-si="${i}" value="${esc(x)}" aria-label="Site name"><span class="n">${n}</span>
      <button data-sd="${i}" ${why ? `disabled title="It still has ${why}"` : ''}>Delete</button></div>`;
  };
  const roomRow = (l, i) => {
    const n = objs.filter(o => o.loc === l).length;
    return `<div class="lrow room"><span class="site" title="${esc(siteOf(l))}">${esc(siteOf(l))}</span><input data-lo="${i}" value="${esc(l.split(' / ').slice(1).join(' / '))}" aria-label="Room in ${esc(siteOf(l))}">
      <span class="n">${n}</span><button data-ld="${i}" ${n ? `disabled title="It still has ${n} ${n === 1 ? 'device' : 'devices'}"` : ''}>Delete</button></div>`;
  };
  $('#setLocs').innerHTML = `<div class="locgrid">
    <section class="panelbox locpanel"><div class="hdr">Sites <span class="cnt">${SITES.length}</span></div>
      <div class="lrows"><div class="lrow head"><span>Site</span><span class="n">Devices</span><span></span></div>
        ${SITES.length ? SITES.map(siteRow).join('') : '<p class="note lempty">No sites yet. Add the first one below.</p>'}</div>
      <div class="lpanel-add"><input id="nsName" placeholder="New site, e.g. Basel" aria-label="New site"><button id="nsAdd">Add site</button></div>
      <p class="note lnote" id="nsMsg">A site is a town or a building.</p></section>
    <section class="panelbox locpanel"><div class="hdr">Rooms <span class="cnt">${LOCS.length}</span></div>
      <div class="lrows"><div class="lrow room head"><span>Site</span><span>Room</span><span class="n">Devices</span><span></span></div>
        ${LOCS.length ? LOCS.map(roomRow).join('') : '<p class="note lempty">No rooms yet.</p>'}</div>
      <div class="lpanel-add"><select id="nlSite" aria-label="Site for the new room">${SITES.map(x => `<option>${esc(x)}</option>`).join('')}</select><input id="nlRoom" placeholder="New room, e.g. Lager" aria-label="New room"><button id="nlAdd" ${SITES.length ? '' : 'disabled'}>Add room</button></div>
      <p class="note lnote" id="nlMsg">${SITES.length ? 'Each room belongs to one site.' : 'Add a site first.'}</p></section>
  </div>${adLocsHtml()}`;
  const root = $('#setLocs');
  root.querySelectorAll('[data-si]').forEach(i => i.onchange = () => renameSite(SITES[+i.dataset.si], i.value));
  root.querySelectorAll('[data-sd]').forEach(b => b.onclick = () => { SITES.splice(+b.dataset.sd, 1); toast('Site deleted'); renderSetLocs(); render(); });
  root.querySelectorAll('[data-lo]').forEach(i => i.onchange = () => { const old = LOCS[+i.dataset.lo]; renameLoc(old, siteOf(old) + ' / ' + i.value.trim()); });
  root.querySelectorAll('[data-ld]').forEach(b => b.onclick = () => { LOCS.splice(+b.dataset.ld, 1); toast('Room deleted'); renderSetLocs(); render(); });
  const enter = (id, fn) => $(id).onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); fn(); } };
  $('#nsAdd').onclick = addSite; enter('#nsName', addSite);
  $('#nlAdd').onclick = addRoom; enter('#nlRoom', addRoom);
  bindAdLocs(root);
}
/* Location texts from the sources: AD's location of a computer account, Lansweeper's building and location, and (with
   the option on) the office of a device's user. A text is never made a location on its own (free text would fill the
   list with near-duplicates): each is used as a room here, existing or new. The syncs then fill that room in on devices
   without a location, and devices here get it at once. */
const lc = v => String(v || '').trim().toLowerCase();
const SRC_TAG = { ad: 'AD', ls: 'Lansweeper', office: 'User office' };
/* What a device says its location is, by source. */
const textsOf = o => {
  const u = o.uid && USERS.find(x => x.id === o.uid), office = u && u.profile && u.profile.office;
  return [['ad', o.ad && o.ad.location], ['ls', o.feed && o.feed.location], ['office', office]].filter(([, t]) => t && String(t).trim());
};
const locTexts = () => {
  const m = new Map();
  for (const o of [...objs, ...REVIEW]) for (const [src, t] of textsOf(o)){
    const k = lc(t), e = m.get(k) || { text: String(t).trim(), n: 0, src: new Set() };
    e.n++; e.src.add(src); m.set(k, e);
  }
  return [...m.values()].sort((a, b) => a.text.localeCompare(b.text));
};
const locMap = () => ({ ...(st.adLocMap || {}), ...(st.locMap || {}) });
const locTarget = t => LOCS.find(l => lc(l) === lc(t)) || (Object.entries(locMap()).find(([k]) => lc(k) === lc(t)) || [])[1] || '';
function adLocsHtml(){
  const list = locTexts();
  const office = `<label class="pchk adloc-office" title="A user's office comes from AD or Entra; on a laptop or for remote work it may not be where the device is"><input type="checkbox" id="locOffice" ${st.locFromOffice ? 'checked' : ''} ${canEdit() ? '' : 'disabled'}> Use the office of the device's user, for devices without a location</label>`;
  if (!list.length) return `<section class="panelbox" id="adLocs"><div class="hdr">Location texts from the sources</div><p class="note lnote">No source has sent a location text yet. Active Directory's location, Lansweeper's building and location, and the office of a device's user show here, to use as rooms.</p><div class="lnote">${office}</div></section>`;
  const row = (e, i) => {
    const direct = LOCS.find(l => lc(l) === lc(e.text)), to = locTarget(e.text);
    const ctl = direct ? '<span class="muted">Is a room here</span>'
      : to ? `<span class="adloc-to">→ <b>${esc(to)}</b></span>${canEdit() ? `<button type="button" class="link" data-adunmap="${i}">Remove</button>` : ''}`
      : canEdit() ? `<select data-admap="${i}" aria-label="Use ${esc(e.text)} as"><option value="">Use as…</option>${LOCS.length ? `<optgroup label="An existing room">${LOCS.map(l => `<option value="loc:${esc(l)}">${esc(l)}</option>`).join('')}</optgroup>` : ''}${SITES.length ? `<optgroup label="A new room, in the site">${SITES.map(x => `<option value="site:${esc(x)}">${esc(x)} / ${esc(e.text.includes(' / ') ? e.text.split(' / ').slice(1).join(' - ') : e.text)}</option>`).join('')}</optgroup>` : ''}</select>` : '<span class="muted">Not used</span>';
    const tags = [...e.src].map(x => `<span class="chip adloc-src">${SRC_TAG[x]}</span>`).join('');
    return `<div class="lrow adloc"><span class="adloc-text" title="${esc(e.text)}">${esc(e.text)}</span><span class="adloc-tags">${tags}</span><span class="n" title="Devices with this location text">${e.n}</span><span class="adloc-ctl">${ctl}</span></div>`;
  };
  return `<section class="panelbox" id="adLocs"><div class="hdr">Location texts from the sources <span class="cnt">${list.length}</span></div>
    <p class="note lnote">What the sources call a device's location. Use a text as a room here, existing or new, and the syncs fill it in on devices without a location. A text alone never becomes a location.</p>
    <div class="lnote">${office}</div>
    <div class="lrows"><div class="lrow adloc head"><span>Location text</span><span>Source</span><span class="n">Devices</span><span></span></div>${list.map(row).join('')}</div></section>`;
}
/* Devices without a location whose sources name text get its room now (as the next sync would), with one Undo. */
function useAdLoc(text, room, msg){
  const mapBefore = { ...(st.locMap || {}) }, adBefore = st.adLocMap, locsBefore = [...LOCS];
  const devs = objs.filter(o => !o.loc).map(o => [o, textsOf(o).find(([src, t]) => lc(t) === lc(text) && (src !== 'office' || st.locFromOffice))]).filter(([o, m]) => m && (!o.pick || !o.pick.loc || o.pick.loc === (m[0] === 'ls' ? 'ls' : 'ad')));
  if (!LOCS.includes(room)) LOCS.push(room);
  if (!LOCS.some(l => lc(l) === lc(text))) st.locMap = { ...(st.locMap || {}), [text]: room };
  for (const [o, [src]] of devs){ o.loc = room; (o.src ??= {}).loc = src === 'ls' ? 'ls' : 'ad'; hist(o, now(), `Location set to ${room} from ${SRC_TAG[src]} (${text}) by ${who()}`); }
  queueServerSave(); renderSetLocs(); render();
  toastUndo(`${msg}${devs.length ? `; ${devs.length} ${devs.length === 1 ? 'device' : 'devices'} placed there` : ''}`, () => {
    st.locMap = mapBefore; st.adLocMap = adBefore; LOCS.splice(0, LOCS.length, ...locsBefore);
    for (const [o] of devs){ o.loc = ''; if (o.src){ delete o.src.loc; if (!Object.keys(o.src).length) delete o.src; } hist(o, now(), 'Location from the sources undone'); }
    queueServerSave(); renderSetLocs(); render();
  });
}
function bindAdLocs(root){
  const list = locTexts();
  const oc = $('#locOffice'); if (oc) oc.onchange = () => { st.locFromOffice = oc.checked; queueServerSave(); toast(oc.checked ? 'Devices without a location take their user\'s office at the next sync' : 'The office of a user is no longer used'); };
  root.querySelectorAll('[data-admap]').forEach(sel => sel.onchange = () => {
    const t = list[+sel.dataset.admap].text, v = sel.value; if (!v) return;
    if (v.startsWith('loc:')) useAdLoc(t, v.slice(4), `${t} is used as ${v.slice(4)}`);
    else {
      const room = cleanLoc(v.slice(5) + ' / ' + (t.includes(' / ') ? t.split(' / ').slice(1).join(' - ') : t).replace(/\//g, '-'));
      if (!room){ toast('That makes no room name.'); return; }
      useAdLoc(t, room, `Room ${room} added for ${t}`);
    }
  });
  root.querySelectorAll('[data-adunmap]').forEach(b => b.onclick = () => {
    const t = list[+b.dataset.adunmap].text, before = { ...(st.locMap || {}) }, adBefore = st.adLocMap;
    st.locMap = Object.fromEntries(Object.entries(before).filter(([k]) => lc(k) !== lc(t)));
    if (st.adLocMap) st.adLocMap = Object.fromEntries(Object.entries(st.adLocMap).filter(([k]) => lc(k) !== lc(t)));
    queueServerSave(); renderSetLocs();
    toastUndo(`${t} is no longer used; devices keep their location`, () => { st.locMap = before; st.adLocMap = adBefore; queueServerSave(); renderSetLocs(); });
  });
}
export function addSite(){
  const name = $('#nsName').value.trim(), msg = $('#nsMsg');
  if (!name || name.includes(' / ')){ msg.innerHTML = warn('Write the site name, without a slash.'); $('#nsName').focus(); return; }
  if (SITES.includes(name)){ msg.innerHTML = warn(name + ' already exists.'); return; }
  SITES.push(name); toast('Added site ' + name); renderSetLocs(); render();
}
export function addRoom(){
  const site = $('#nlSite') ? $('#nlSite').value : '', room = $('#nlRoom').value.trim(), msg = $('#nlMsg');
  if (!site){ msg.innerHTML = warn('Add a site first.'); return; }
  if (!room || room.includes(' / ')){ msg.innerHTML = warn('Write the room name, without a slash.'); $('#nlRoom').focus(); return; }
  const name = site + ' / ' + room;
  if (LOCS.includes(name)){ msg.innerHTML = warn(name + ' already exists.'); return; }
  LOCS.push(name); toast('Added ' + name); renderSetLocs(); render();
}
/* Renaming a site renames its rooms, the locations of the objects in them, and the racks. */
export function renameSite(old, value){
  const name = value.trim();
  if (!name || name.includes(' / ')){ toast('Write the site name, without a slash.'); renderSetLocs(); return; }
  if (name === old) return;
  if (SITES.includes(name)){ toast(name + ' already exists.'); renderSetLocs(); return; }
  SITES[SITES.indexOf(old)] = name;
  const move = l => (l === old || String(l || '').startsWith(old + ' / ')) ? name + String(l).slice(old.length) : l;
  LOCS.forEach((l, i) => { LOCS[i] = move(l); });
  objs.forEach(o => { if (o.loc) o.loc = move(o.loc); });
  /* Plans and their areas follow the rename, so the devices stay on them. */
  PLANS.forEach(p => { if (p.site === old) p.site = name; (p.areas || []).forEach(a => { if (a.room) a.room = move(a.room); }); });
  if (st.loc) st.loc = move(st.loc);
  const n = objs.filter(o => String(o.loc || '').startsWith(name)).length;
  toastUndo(`Site renamed to ${name}${n ? ` · ${n} device${n === 1 ? '' : 's'}` : ''}`, () => { renameSite(name, old); queueServerSave(); });
  renderSetLocs(); render();
}
export function renameLoc(old, value){
  const name = cleanLoc(value);
  if (!name){ toast('Use the form Site / Room, e.g. Basel / Lager'); renderSetLocs(); return; }
  if (name !== old && LOCS.includes(name)){ toast(name + ' already exists.'); renderSetLocs(); return; }
  if (name === old) return;
  LOCS[LOCS.indexOf(old)] = name;
  objs.forEach(o => { if (o.loc === old) o.loc = name; });
  PLANS.forEach(p => (p.areas || []).forEach(a => { if (a.room === old) a.room = name; }));
  if (st.loc === old) st.loc = name;
  /* Undo renames it back: the devices, plan areas and filter follow again. */
  const n = objs.filter(o => o.loc === name).length;
  toastUndo(`Renamed to ${name}${n ? ` · ${n} device${n === 1 ? '' : 's'}` : ''}`, () => { renameLoc(name, old); queueServerSave(); }); renderSetLocs(); render();
}
/* Address checks, the same rules as server/validate.js: an empty value is allowed. */
export { IPV4_RE, MAC_RE, validIPv6, checkAddress } from './addr.js';
