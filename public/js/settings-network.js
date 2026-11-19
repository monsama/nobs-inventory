/* Settings → Locations and Network: sites and rooms, subnets with their ranges, VLANs and domains. */
import { subnetSpan, ipInt, subnetProblem, overlapProblem } from './net.js';
import { queueServerSave, render } from './07-render.js';
import { USERS, isAdmin, who } from './04-settings.js';
import { html, rawHtml } from './html.js';
import { SOURCES_OF, fieldOrder, fieldMode } from './sync-map.js';
import { setOrderNow } from './settings-sources.js';
import { roomFor } from './room-name.js';
import { REVIEW, VLANS, TYPES, tico, $, st, SUBNETS, objs, hist, now, toast, toastUndo, rels, DOMAINS, LOCS, SITES, PLANS } from './01-core.js';
import { bindPlaces, placeSelect, placesHtml } from './settings-places.js';
/* Locations are 'Site / Room'. Renaming one moves the objects and racks that use it. */
export const cleanLoc = v => { const t = v.trim().split(/\s*\/\s*/).map(x => x.trim()); return t.length === 2 && t[0] && t[1] ? t.join(' / ') : ''; };
/* The uses a range can have. DHCP and reserved ranges are skipped when an address is picked for a device. */
const RANGE_USES = ['DHCP', 'Static', 'Reserved'];
const rangeRowHtml = (r = {}) => {
  const use = r.use || '', opts = [...new Set(['', ...RANGE_USES, use])];
  return html`<div class="sn-range"><input data-rf class="mono" placeholder="10.10.20.50" value="${r.from || ''}" aria-label="First address">
    <span class="muted">to</span><input data-rt class="mono" placeholder="10.10.20.99" value="${r.to || ''}" aria-label="Last address">
    <select data-ru aria-label="Use of the range">${opts.map(u => html`<option value="${u}" ${u === use ? 'selected' : ''}>${u || 'No use set'}</option>`)}</select>
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
const subnetEditorHtml = (n, key, hint = null) => html`<div class="sn-edit" data-sub="${key}">
    <div class="sn-grid">
      <label>Name<input data-sn maxlength="60" value="${n.name || ''}" placeholder="e.g. Head office"></label>
      <label>Subnet<input data-sc class="mono" placeholder="10.10.20.0/24" value="${n.cidr || ''}"></label>
      <label>VLAN<select data-sv><option value="">None</option>${VLANS.map(v => html`<option value="${v.vid}" ${v.vid === n.vid ? 'selected' : ''}>${v.vid} · ${v.name}</option>`)}</select></label>
      <label>Gateway<input data-sg class="mono" placeholder="10.10.20.1" value="${n.gateway || ''}"></label>
      <label class="span2">DNS servers<input data-sd class="mono" placeholder="10.10.1.5, 10.10.1.6" value="${(n.dns || []).join(', ')}"></label>
    </div>
    <div class="sn-sect"><div class="sn-sh">Ranges<button type="button" data-radd>Add range</button></div>
      <div class="sn-ranges">${(n.ranges || []).map(r => rangeRowHtml(r))}</div>
      <p class="note">A device's IP address lists the free addresses of Static ranges and of ones without a use; DHCP and Reserved ranges are left out.</p></div>
    <div class="sn-sect"><div class="sn-sh">Device types that take an address here<span class="sn-tq"><button type="button" class="link" data-tall>All</button><button type="button" class="link" data-tnone>None</button></span></div>
      <div class="sn-typegrid">${Object.entries(TYPES).map(([k, t]) => html`<label class="sn-type"><input type="checkbox" data-sty value="${k}" ${(n.types || []).includes(k) ? 'checked' : ''}>${rawHtml(tico(k, 'tico sm'))}<span>${t.label}</span></label>`)}</div></div>
    ${hint && html`<p class="note sn-hint">${hint}</p>`}
    <div class="subnet-foot"><span class="snmsg" aria-live="polite"></span><span class="grow"></span><button type="button" data-scancel>Cancel</button><button type="button" class="primary" data-ssave>${key === 'new' ? 'Add subnet' : 'Save'}</button></div></div>`;
/* A subnet in the list: its name, address and VLAN, with the gateway, ranges and device types underneath. */
const subnetItemHtml = (n, i, edit) => {
  const ranges = (n.ranges || []).map((r, k) => html`${k ? ', ' : ''}${r.use ? r.use + ' ' : ''}<span class="mono">${r.from}${r.to !== r.from ? '-' + r.to.split('.').pop() : ''}</span>`);
  const types = (n.types || []).filter(t => TYPES[t]).map(t => TYPES[t].label);
  const meta = [n.gateway ? html`Gateway <span class="mono">${n.gateway}</span>` : '', (n.dns || []).length ? html`DNS <span class="mono">${n.dns.join(', ')}</span>` : '',
    ranges.length ? html`Ranges ${ranges}` : 'No ranges', types.length ? `For ${types.slice(0, 4).join(', ')}${types.length > 4 ? ` and ${types.length - 4} more` : ''}` : 'No device types'].filter(Boolean);
  return html`<div class="sn-item"><div class="sn-head"><b>${n.name}</b><span class="mono">${n.cidr}</span>${n.vid != null && html`<span class="chip">VLAN ${n.vid}</span>`}<span class="grow"></span>
    ${edit && html`<button data-sedit="${i}">Edit</button><button data-sx="${i}">Delete</button>`}</div><div class="sn-meta">${meta.map((m, k) => html`${k ? ' · ' : ''}${m}`)}</div></div>`;
};
/* Which subnet is open in the editor: 'new', a position in the list, or none; and what a new one starts with. */
let snEdit = null, snDraft = null;
/* Settings opens with no subnet half edited. */
export const resetSubnetEdit = () => { snEdit = null; snDraft = null; };
/* The subnets of the network. Each row is checked when it is changed, and a row that is not right is kept as typed, with the reason. */
export function renderSetSubnets(){
  const root = $('#setSubnets'); if (!root) return;
  if (!root) return;
  const edit = isAdmin();
  if (!edit) snEdit = null;
  /* Subnets the devices' adapters are in that the list does not have yet. Use opens the editor filled in; nothing is added by itself. */
  const suggested = (st.lsNets || []).filter(n => !SUBNETS.some(x => x.cidr === n.cidr));
  root.innerHTML = html`<div class="hdr">Subnets <span class="cnt">${SUBNETS.length}</span></div>
    <p class="note" style="padding:10px 12px 0">Each subnet is on one VLAN. Its gateway, DNS servers and ranges are inside it, and the device types are the ones that take an address from it.</p>
    <div class="subnets">${SUBNETS.length ? SUBNETS.map((n, i) => snEdit === i ? subnetEditorHtml(n, i) : subnetItemHtml(n, i, edit && snEdit === null)) : html`<p class="note lempty">No subnets yet.</p>`}</div>
    ${snEdit === 'new' ? subnetEditorHtml(snDraft ? snDraft.n : {}, 'new', snDraft ? snDraft.hint : null) : edit && html`<div class="sn-addbar"><button id="snNew">Add subnet</button></div>`}
    ${suggested.length > 0 && html`<div class="sn-suggest"><div class="sn-sughead"><p class="note" style="padding:0">Seen by Lansweeper, not listed yet</p>${edit && snEdit === null && suggested.length > 1 && html`<button id="snUseAll">Use all ${suggested.length}</button>`}</div>${suggested.map((n, i) => html`<div class="snrow"><span class="mono">${n.cidr}</span><span class="grow">${n.devices} ${n.devices === 1 ? 'device' : 'devices'}${n.gateway ? ' · gateway ' + n.gateway : ''}${n.name ? ' · ' + n.name : ''}</span>${edit && snEdit === null && html`<button data-snuse="${i}">Use</button>`}</div>`)}</div>`}`;
  if (!edit) return;
  const open = (key, draft = null) => { snEdit = key; snDraft = draft; renderSetSubnets(); const f = root.querySelector('.sn-edit [data-sn]'); if (f) f.focus(); };
  root.querySelectorAll('[data-sedit]').forEach(b => b.onclick = () => open(+b.dataset.sedit));
  const nb = $('#snNew'); if (nb) nb.onclick = () => open('new');
  root.querySelectorAll('[data-sx]').forEach(b => b.onclick = () => {
    const gone = SUBNETS[+b.dataset.sx];
    const i = +b.dataset.sx, on = objs.filter(o => o.subnet === gone.cidr);
    for (const o of on){ delete o.subnet; hist(o, now(), `Subnet ${gone.name} (${gone.cidr}) deleted by ${who()}`); }
    SUBNETS.splice(i, 1); queueServerSave(); renderSetSubnets();
    toastUndo(`Subnet ${gone.name} deleted; devices on it keep their addresses`, () => {
      if (!SUBNETS.some(n => n.cidr === gone.cidr)){
        const at = Math.min(i, SUBNETS.length);
        SUBNETS.splice(at, 0, gone);
        /* A subnet being edited meanwhile stays the one in the editor: its place moves down with the one put back. */
        if (typeof snEdit === 'number' && snEdit >= at) snEdit++;
      }
      for (const d of on){ const o = objs.find(x => x.id === d.id); if (!o) continue; o.subnet = gone.cidr; hist(o, now(), `Subnet ${gone.name} (${gone.cidr}) back (delete undone) by ${who()}`); }
      queueServerSave(); renderSetSubnets();
    }, { anyEpoch: true });
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
    const hint = `Filled in from what Lansweeper saw in ${n.cidr}: ${n.devices} ${n.devices === 1 ? 'device' : 'devices'}${types.length ? ` of ${types.length} ${types.length === 1 ? 'type' : 'types'}` : ''}.`
      + (seen.length ? ` Each range runs from the lowest to the highest address seen of its kind (${seen.map(x => `${x.use}: ${x.count}`).join(', ')}): check them against your DHCP server before saving.` : '');
    open('new', {n: fromSuggestion(n), hint});
  });
  const ed = root.querySelector('.sn-edit');
  if (!ed) return;
  const key = ed.dataset.sub;
  const bindRanges = () => ed.querySelectorAll('[data-rx]').forEach(x => x.onclick = () => x.closest('.sn-range').remove());
  bindRanges();
  ed.querySelector('[data-radd]').onclick = () => { ed.querySelector('.sn-ranges').insertAdjacentHTML('beforeend', String(rangeRowHtml({use: 'Static'}))); bindRanges(); ed.querySelector('.sn-range:last-child [data-rf]').focus(); };
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
  if (!$('#setVlans')) return;
  const cnt = $('#vlCnt'); if (cnt) cnt.textContent = VLANS.length;
  const usedBy = vid => rels.filter(r => r.vlan === vid).length;
  const subnetsOn = vid => SUBNETS.filter(n => n.vid === vid).length;
  $('#setVlans').innerHTML = html`<div class="lrows"><div class="lrow head vl"><span>VLAN</span><span>Name</span><span>Description</span><span class="n">Used by</span><span></span></div>
    ${VLANS.length ? VLANS.map((v, i) => { const n = usedBy(v.vid); return html`<div class="lrow vl"><span class="mono">${v.vid}</span><input data-vn="${i}" maxlength="60" value="${v.name}" aria-label="Name of VLAN ${v.vid}"><input data-vdesc="${i}" maxlength="120" value="${v.desc || ''}" placeholder="Description" aria-label="Description of VLAN ${v.vid}"><span class="n">${n}</span>
      <button data-vd="${i}" ${n || subnetsOn(v.vid) ? html`disabled title="${subnetsOn(v.vid) ? 'A subnet is on this VLAN' : 'In use by ' + n + ' connections'}"` : ''}>Delete</button></div>`; }) : html`<p class="note lempty">No VLANs yet. Add the ones your network uses.</p>`}</div>
    <div class="lpanel-add"><input id="vlId" type="number" min="1" max="4094" placeholder="ID, e.g. 10" aria-label="VLAN ID" style="width:120px"><input id="vlName" placeholder="Name, e.g. Users" aria-label="VLAN name"><input id="vlDesc" maxlength="120" placeholder="Description (optional)" aria-label="VLAN description"><button id="vlAdd">Add VLAN</button></div>
    ${SUBNETS.some(n => n.vid != null) && html`<p class="note lnote">${SUBNETS.filter(n => n.vid != null).map(n => `VLAN ${n.vid} carries ${n.name}, ${n.cidr}`).join(' · ')}</p>`}
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
}
/* Domains are one list for the whole inventory; an object's domain is picked from it. */
export function renderSetDomains(){
  if (!$('#setDomains')) return;
  const usedBy = d => objs.filter(o => o.domain === d.name).length;
  const counts = new Map();
  for (const o of objs) if (o.domain && o.status !== 'retired' && !DOMAINS.some(d => d.name.toLowerCase() === o.domain.toLowerCase())) counts.set(o.domain, (counts.get(o.domain) || 0) + 1);
  const seen = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  $('#setDomains').innerHTML = html`<div class="hdr">Domains <span class="cnt">${DOMAINS.length}</span></div>
    <div class="lrows">${DOMAINS.length ? DOMAINS.map((d, i) => { const n = usedBy(d); return html`<div class="lrow dm"><input data-dname="${i}" class="mono" maxlength="60" value="${d.name}" aria-label="Domain ${d.name}"><input data-ddesc="${i}" maxlength="120" value="${d.desc || ''}" placeholder="Description" aria-label="Description of ${d.name}"><span class="n">${n}</span><button data-dd="${i}" ${n > 0 && html`disabled title="Used by ${n} ${n === 1 ? 'device' : 'devices'}"`}>Delete</button></div>`; }) : html`<p class="note lempty">No domains yet. Add the domains your devices join.</p>`}</div>
    <div class="lpanel-add"><input id="dmName" maxlength="60" placeholder="Domain, e.g. corp.example.ch" aria-label="New domain"><input id="dmDesc" maxlength="120" placeholder="Description (optional)" aria-label="Domain description"><button id="dmAdd">Add domain</button></div>
    ${seen.length > 0 && html`<div class="sn-suggest"><div class="sn-sughead"><p class="note" style="padding:0">Seen on devices, not listed yet</p>${isAdmin() && seen.length > 1 && html`<button id="dmUseAll">Add all ${seen.length}</button>`}</div>${seen.map(([d, n], i) => html`<div class="snrow"><span class="mono">${d}</span><span class="grow">${n} ${n === 1 ? 'device' : 'devices'}</span>${isAdmin() && html`<button data-dmuse="${i}">Add</button>`}</div>`)}</div>`}`;
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
export const warn = t => html`<span style="color:var(--danger)">${t}</span>`;
export const siteOf = l => String(l || '').split(' / ')[0];
/* The store room of each site: taking a device back proposes it (27-handout.js). */
/* Draws Settings → Locations: the sites and rooms, and the location texts from the sources still to be given a room. */
export function renderSetLocs(){
  if (!$('#setLocs')) return;   /* an Undo after Settings was closed: nothing here to draw */
  /* The sites and rooms (list and detail, settings-places.js), then what the sources call a device's location. */
  $('#setLocs').innerHTML = html`${placesHtml()}${adLocsHtml()}`;
  const root = $('#setLocs');
  bindPlaces(root);
  const enter = (id, fn) => { const el = $(id); if (el) el.onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); fn(); } }; };
  const ns = $('#nsAdd'); if (ns) ns.onclick = addSite; enter('#nsName', addSite);
  const nl = $('#nlAdd'); if (nl) nl.onclick = addRoom; enter('#nlRoom', addRoom);
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
export const locMapAll = locMap;
/* The room part of "Site / Room". */
export const roomPart = l => String(l || '').split(' / ').slice(1).join(' / ');
const locTarget = t => LOCS.find(l => lc(l) === lc(t)) || (Object.entries(locMap()).find(([k]) => lc(k) === lc(t)) || [])[1] || '';
/* The Location texts from the sources panel: each text with its sources and device count, and what it is used as.
   An admin can pick an existing room or a new one for it, or remove that again. */
/* The sources whose texts are listed: those that fill the location now (and the user's office while it is used). */
const usedSrc = () => new Set([...fieldOrder(st, 'loc'), ...(st.locFromOffice ? ['office'] : [])]);
export const shownTexts = () => { const use = usedSrc(); return locTexts().map(e => ({ ...e, src: new Set([...e.src].filter(x => use.has(x))) })).filter(e => e.src.size); };
/* Renamed in a source (AD, Lansweeper): devices in room R now report text T, where they reported M, a text mapped to R
   that no device reports any more. Offered: keep them in R (T is mapped to R in M's place) and, where R is named after
   M, rename R after T as well. Each is one Undo. With "Rooms from AD's location" on, the AD sync keeps the room by
   itself (ldap-sync.js autoRoom); renaming it is still offered here. */
/* The texts no room knows yet (not a room's name, not mapped to one): the ones to give a room, listed below. */
export const newTexts = () => shownTexts().filter(e => !LOCS.some(l => lc(l) === lc(e.text)) && !locTarget(e.text));
/* How many devices say text t now (in any source). */
export const textCount = t => (locTexts().find(e => lc(e.text) === lc(t)) || { n: 0 }).n;
export function renamedTexts(){
  const said = new Set(locTexts().map(e => lc(e.text)));
  const orphan = Object.entries(locMap()).filter(([m, r]) => !said.has(lc(m)) && LOCS.includes(r));
  if (!orphan.length) return [];
  const out = [];
  for (const e of shownTexts()){
    if (LOCS.some(l => lc(l) === lc(e.text))) continue;
    const to = locTarget(e.text);
    const devs = [...objs, ...REVIEW].filter(o => textsOf(o).some(([, t]) => lc(t) === lc(e.text)));
    const rooms = new Set(devs.map(o => o.loc).filter(Boolean));
    if (rooms.size !== 1) continue;
    const room = [...rooms][0], old = orphan.find(([, r]) => r === room);
    if (!old || (to && to !== room)) continue;
    const [site, part] = room.split(' / ');
    const newName = part !== undefined && lc(part) === lc(old[0]) ? roomName(site, e.text) : '';
    if (to && !newName) continue;   /* already kept, and the room is not named after the old text: nothing to ask */
    out.push({ text: e.text, from: old[0], room, n: devs.length, map: !to, newName: newName && !LOCS.includes(newName) ? newName : '', src: [...e.src].map(x => SRC_TAG[x]).join(', ') });
  }
  return out;
}
function renamedHtml(){
  if (!isAdmin()) return '';
  const list = renamedTexts(); if (!list.length) return '';
  return html`<div class="loc-renamed" role="group" aria-label="Location texts renamed in a source">${list.map((r, i) => html`<div class="lr-item">
    <span class="lr-say"><b>Renamed in ${r.src}?</b> ${r.n} ${r.n === 1 ? 'device' : 'devices'} in <b>${r.room}</b> now ${r.n === 1 ? 'says' : 'say'} “${r.text}” instead of “${r.from}”.</span>
    <span class="lr-acts">${r.map ? html`<button type="button" class="mini" data-lrkeep="${i}">Keep in ${r.room}</button>` : ''}${r.newName ? html`<button type="button" class="mini${r.map ? '' : ' primary'}" data-lrren="${i}">${r.map ? 'Keep and rename' : 'Rename'} to ${r.newName}</button>` : ''}</span></div>`)}</div>`;
}
/* The new text takes the old one's place in the mapping (the old one is dropped, so it is not listed as used). */
function keepRenamed(r){
  const drop = m => m && Object.fromEntries(Object.entries(m).filter(([k]) => lc(k) !== lc(r.from)));
  st.locMap = { ...(drop(st.locMap) || {}), [r.text]: r.room };
  if (st.adLocMap) st.adLocMap = drop(st.adLocMap);
}
function bindRenamed(root){
  const list = renamedTexts();
  const act = (i, rename) => { const r = list[i]; if (!r) return;
    const was = { locMap: st.locMap ? { ...st.locMap } : st.locMap, adLocMap: st.adLocMap ? { ...st.adLocMap } : st.adLocMap };
    keepRenamed(r);
    const renamed = rename && r.newName && renameLoc(r.room, r.newName, true);
    queueServerSave(); renderSetLocs(); render();
    toastUndo(renamed ? `Renamed to ${r.newName}; “${r.text}” goes there` : `“${r.text}” goes to ${r.room}`, () => {
      if (renamed) renameLoc(r.newName, r.room, true);
      st.locMap = was.locMap; st.adLocMap = was.adLocMap; queueServerSave(); renderSetLocs(); render(); });
  };
  root.querySelectorAll('[data-lrkeep]').forEach(b => b.onclick = () => act(+b.dataset.lrkeep, false));
  root.querySelectorAll('[data-lrren]').forEach(b => b.onclick = () => act(+b.dataset.lrren, true));
}
function adLocsHtml(){
  const list = newTexts();
  /* Which sources fill a device's location, in order: set here at once. Each source has its place (1 first; a source
     higher up replaces what one lower down wrote), arrows to move it and a switch; the user's office (from AD or Entra)
     is the fallback for devices without one. A source switched off fills nothing, and its texts are not listed below. */
  const order = fieldOrder(st, 'loc'), all = SOURCES_OF('loc'), off = all.filter(x => !order.includes(x)), ed = isAdmin();
  const NAME = { ad: 'Active Directory', ls: 'Lansweeper' };
  const srcItem = (x, i) => { const on = order.includes(x), mode = fieldMode(st, 'loc', x);
    return html`<li class="ls-item${on ? ' on' : ''}"><span class="ls-num" aria-hidden="true">${on ? i + 1 : ''}</span>
      <span class="ls-name"><b>${NAME[x]}</b><small>${on ? (mode === 'fill' ? 'only if empty' : 'keeps it up to date') : 'off'}</small></span>
      ${ed && on && order.length > 1 ? html`<span class="ls-move"><button type="button" class="icon ghost" data-locmv="${x}|-1" ${i === 0 ? 'disabled' : ''} aria-label="${`Move ${NAME[x]} up`}" title="Higher: replaces what the others wrote">▲</button><button type="button" class="icon ghost" data-locmv="${x}|1" ${i === order.length - 1 ? 'disabled' : ''} aria-label="${`Move ${NAME[x]} down`}">▼</button></span>` : html`<span class="ls-move"></span>`}
      <label class="switch" title="${on ? `Switch ${NAME[x]} off: it fills no location` : `Switch ${NAME[x]} on`}"><input type="checkbox" data-locon="${x}" ${on ? 'checked' : ''} ${ed ? '' : 'disabled'} aria-label="${`${NAME[x]} fills the location`}"><span aria-hidden="true"></span></label></li>`; };
  const officeItem = html`<li class="ls-item ls-fallback${st.locFromOffice ? ' on' : ''}"><span class="ls-num" aria-hidden="true">${st.locFromOffice ? '↳' : ''}</span>
      <span class="ls-name"><b>User's office</b><small>${st.locFromOffice ? 'from AD or Entra, for devices still without one' : 'off'}</small></span><span class="ls-move"></span>
      <label class="switch" title="A user's office comes from AD or Entra; on a laptop or for remote work it may not be where the device is"><input type="checkbox" id="locOffice" ${st.locFromOffice ? 'checked' : ''} ${ed ? '' : 'disabled'} aria-label="The office of the device's user fills the location"><span aria-hidden="true"></span></label></li>`;
  const orderLine = html`<div class="locsrc"><div class="locsrc-h"><b>Location comes from</b><span class="muted">first in the list wins</span></div>
    <ol class="locsrc-list">${[...order, ...off].map((x, i) => srcItem(x, i))}${officeItem}</ol></div>`;
  /* Nothing to list: either nothing was sent, or only by sources switched off. The row of sources stays, to switch one on. */
  if (!list.length) return html`<section class="panelbox" id="adLocs"><div class="hdr">Location texts from the sources</div>${orderLine}${renamedHtml()}<p class="note lnote">${shownTexts().length ? 'Every location text the sources send has its room: they are listed on the rooms above, as their names in the sources.' : locTexts().length ? 'The sources in use have sent no location text; switch one on above to see its texts.' : 'No source has sent a location text yet. Active Directory\'s location of a computer account and Lansweeper\'s building and location are listed here, to give each a room.'}</p></section>`;
  /* AD's location is often kept by hand: its texts can become rooms of a site by themselves. Off by default. */
  const auto = html`<label class="adloc-auto">Rooms from AD's location<select id="adLocAuto" ${isAdmin() ? '' : 'disabled'} aria-label="Rooms from AD's location"><option value="">Off: I pick them here</option>${SITES.map(x => html`<option value="${x}" ${st.adLocAuto === x ? 'selected' : ''}>Made at each AD sync, in ${x}</option>`)}</select></label>`;
  const free = list.map((e, i) => [e, i]).filter(([e]) => !LOCS.some(l => lc(l) === lc(e.text)) && !locTarget(e.text));
  const picked = list.map((e, i) => i).filter(i => adPicked.has(lc(list[i].text)));
  const bulk = !isAdmin() || !free.length ? '' : html`<div class="adloc-bulk"><label class="pchk"><input type="checkbox" id="adPickAll" ${picked.length && picked.length === free.length ? 'checked' : ''}> All ${free.length} not used yet</label><span class="grow"></span>${picked.length ? html`<span class="muted">${picked.length} ticked, new rooms in</span><select id="adBulkSite" aria-label="Site for the new rooms">${SITES.map(x => html`<option ${x === bulkSite() ? 'selected' : ''}>${x}</option>`)}</select><button type="button" class="primary" id="adBulkGo" ${SITES.length ? '' : 'disabled'}>Create ${picked.length} ${picked.length === 1 ? 'room' : 'rooms'}</button>` : html`<span class="muted">Tick texts to make them rooms in one go, or pick a room for one with Use as…</span>`}</div>`;
  const row = (e, i) => {
    const direct = LOCS.find(l => lc(l) === lc(e.text)), to = locTarget(e.text);
    const tick = isAdmin() ? (!direct && !to ? html`<input type="checkbox" data-adpick="${i}" ${adPicked.has(lc(e.text)) ? 'checked' : ''} aria-label="Tick ${e.text}">` : html`<span></span>`) : '';
    const will = !direct && !to && adPicked.has(lc(e.text)) && SITES.length ? roomName(bulkSite(), e.text) : '';
    const ctl = direct ? html`<span class="muted">Is a room here</span>`
      : will ? html`<span class="adloc-to adloc-will" title="Made when you click Create rooms above">→ <b>${will}</b> <span class="muted">${LOCS.includes(will) ? 'existing room' : 'new room'}</span></span>`
      : to ? html`<span class="adloc-to">→ <b>${to}</b></span>${isAdmin() && html`<button type="button" class="link" data-adunmap="${i}">Remove</button>`}`
      : isAdmin() ? html`<select data-admap="${i}" aria-label="Use ${e.text} as"><option value="">Use as…</option>${LOCS.length > 0 && html`<optgroup label="An existing room">${LOCS.map(l => html`<option value="loc:${l}">${l}</option>`)}</optgroup>`}${SITES.length > 0 && html`<optgroup label="A new room, in the site">${SITES.map(x => html`<option value="site:${x}">${x} / ${e.text.includes(' / ') ? e.text.split(' / ').slice(1).join(' - ') : e.text}</option>`)}</optgroup>`}</select>` : html`<span class="muted">Not used</span>`;
    const tags = [...e.src].map(x => html`<span class="chip adloc-src">${SRC_TAG[x]}</span>`);
    return html`<div class="lrow adloc${isAdmin() ? ' pick' : ''}">${tick}<span class="adloc-text" title="${e.text}">${e.text}</span><span class="adloc-tags">${tags}</span><span class="n" title="Devices with this location text">${e.n}</span><span class="adloc-ctl">${ctl}</span></div>`;
  };
  return html`<section class="panelbox" id="adLocs"><div class="hdr">Location texts from the sources <span class="cnt">${list.length} new</span></div>
    <p class="note lnote">What the sources call a device's location, not yet a room here. Give each one a room, existing or new, and the syncs fill it in on devices without a location; it is then listed on its room. A text alone never becomes a location.</p>
    ${orderLine}
    ${renamedHtml()}
    <div class="lnote adloc-opts">${auto}</div>
    ${bulk}
    <div class="lrows"><div class="lrow adloc head${isAdmin() ? ' pick' : ''}">${isAdmin() ? html`<span></span>` : ''}<span>Location text</span><span>Source</span><span class="n">Devices</span><span></span></div>${list.map((e, i) => row(e, i))}</div></section>`;
}
/* Devices without a location whose sources name text get its room now (as the next sync would), with one Undo. */
export function useAdLoc(text, room, msg){ useAdLocs([[text, room]], msg); }
function useAdLocs(pairs, msg){
  const mapBefore = { ...(st.locMap || {}) }, adBefore = st.adLocMap, locsBefore = [...LOCS];
  const devs = [];
  for (const [text, room] of pairs){
    const these = objs.filter(o => !o.loc).map(o => [o, textsOf(o).find(([src, t]) => lc(t) === lc(text) && (src !== 'office' || st.locFromOffice))]).filter(([o, m]) => m && (!o.pick || !o.pick.loc || o.pick.loc === (m[0] === 'ls' ? 'ls' : 'ad')));
    if (!LOCS.includes(room)) LOCS.push(room);
    if (!LOCS.some(l => lc(l) === lc(text))) st.locMap = { ...(st.locMap || {}), [text]: room };
    for (const [o, [src]] of these){ o.loc = room; (o.src ??= {}).loc = src === 'ls' ? 'ls' : 'ad'; hist(o, now(), `Location set to ${room} from ${SRC_TAG[src]} (${text}) by ${who()}`); devs.push([o]); }
  }
  adPicked.clear();
  queueServerSave(); renderSetLocs(); render();
  toastUndo(`${msg}${devs.length ? `; ${devs.length} ${devs.length === 1 ? 'device' : 'devices'} placed there` : ''}`, () => {
    st.locMap = mapBefore; st.adLocMap = adBefore; LOCS.splice(0, LOCS.length, ...locsBefore);
    for (const [o] of devs){ o.loc = ''; if (o.src){ delete o.src.loc; if (!Object.keys(o.src).length) delete o.src; } hist(o, now(), 'Location from the sources undone'); }
    queueServerSave(); renderSetLocs(); render();
  });
}
/* Wires the location texts panel: the user's office option, using a text as a room (useAdLoc), and removing that
   use with Undo; devices keep the location they got. */
/* The texts ticked to make rooms of at once, by their lower-case text (kept while the panel is drawn again). */
const adPicked = new Set();
/* The site the ticked texts become rooms in: the one picked last, else the first. */
let adSite = '';
const bulkSite = () => SITES.includes(adSite) ? adSite : SITES[0] || '';
const roomName = (site, t) => cleanLoc(roomFor(site, t));
function bindAdLocs(root){
  bindRenamed(root);
  const list = newTexts();
  /* The row of sources: a switch takes one out (or puts it back, last); the arrows change its place. */
  const order = fieldOrder(st, 'loc'), NAME = { ad: 'AD', ls: 'Lansweeper' };
  const say = list2 => list2.length ? `from ${list2.map(x => NAME[x]).join(' › ')}` : 'from no source';
  root.querySelectorAll('[data-locon]').forEach(cb => cb.onchange = () => {
    const x = cb.dataset.locon, next = cb.checked ? [...order.filter(y => y !== x), x] : order.filter(y => y !== x);
    setOrderNow('loc', next, say(next), renderSetLocs);
  });
  root.querySelectorAll('[data-locmv]').forEach(b => b.onclick = () => {
    const [x, d] = b.dataset.locmv.split('|'), i = order.indexOf(x), j = i + Number(d);
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order]; [next[i], next[j]] = [next[j], next[i]];
    setOrderNow('loc', next, say(next), () => { renderSetLocs(); /** @type {HTMLElement|null} */ (document.querySelector(`[data-locmv="${CSS.escape(b.dataset.locmv)}"]`) || document.querySelector(`[data-locon="${x}"]`))?.focus(); });
  });
  root.querySelectorAll('[data-adpick]').forEach(cb => cb.onchange = () => { const k = lc(list[+cb.dataset.adpick].text); if (cb.checked) adPicked.add(k); else adPicked.delete(k); renderSetLocs(); });
  const all = $('#adPickAll'); if (all) all.onchange = () => { adPicked.clear(); if (all.checked) for (const e of list) if (!LOCS.some(l => lc(l) === lc(e.text)) && !locTarget(e.text)) adPicked.add(lc(e.text)); renderSetLocs(); };
  const go = $('#adBulkGo'); if (go) go.onclick = () => {
    const site = bulkSite(), pairs = list.filter(e => adPicked.has(lc(e.text))).map(e => [e.text, roomName(site, e.text)]).filter(([, r]) => r);
    if (pairs.length) useAdLocs(pairs, `${pairs.length} ${pairs.length === 1 ? 'room' : 'rooms'} added in ${site}`);
  };
  const bs = $('#adBulkSite'); if (bs) bs.onchange = () => { adSite = bs.value; renderSetLocs(); };
  const auto = $('#adLocAuto'); if (auto) auto.onchange = () => { st.adLocAuto = auto.value; queueServerSave(); toast(auto.value ? `AD's location texts become rooms in ${auto.value} at each AD sync` : 'Rooms from AD\'s location: off'); };
  const oc = $('#locOffice'); if (oc) oc.onchange = () => { const was = !!st.locFromOffice; st.locFromOffice = oc.checked; queueServerSave(); renderSetLocs();
    toastUndo(oc.checked ? 'Devices without a location take their user\'s office at the next sync' : 'The office of a user is no longer used', () => { st.locFromOffice = was; queueServerSave(); renderSetLocs(); }); };
  root.querySelectorAll('[data-admap]').forEach(sel => sel.onchange = () => {
    const t = list[+sel.dataset.admap].text, v = sel.value; if (!v) return;
    if (v.startsWith('loc:')) useAdLoc(t, v.slice(4), `${t} is used as ${v.slice(4)}`);
    else {
      const room = roomName(v.slice(5), t);
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
  SITES.push(name); placeSelect({ site: name }); toast('Added site ' + name); renderSetLocs(); render();
}
export function addRoom(){
  if (!isAdmin()) return;
  const site = $('#nlSite') ? $('#nlSite').value : '', room = $('#nlRoom').value.trim(), msg = $('#nlMsg');
  if (!site){ msg.innerHTML = warn('Add a site first.'); return; }
  if (!room || room.includes(' / ')){ msg.innerHTML = warn('Write the room name, without a slash.'); $('#nlRoom').focus(); return; }
  const name = site + ' / ' + room;
  const same = LOCS.find(l => l.toLowerCase() === name.toLowerCase());
  if (same){ msg.innerHTML = warn(same + ' already exists.'); return; }
  LOCS.push(name); placeSelect({ room: name }); toast('Added ' + name); renderSetLocs(); render();
}
/* The settings that name a place, renamed with it: the store room of each site (its key, a site, and its room), the place
   a saved view filters on, and the rooms that location texts from the sources are mapped to. move gives the new name of
   a place, or the same one. */
export function renamePlaceRefs(move){
  if (st.stockRooms) st.stockRooms = Object.fromEntries(Object.entries(st.stockRooms).map(([k, v]) => [move(k), move(v)]));
  if (Array.isArray(st.savedViews)) st.savedViews = st.savedViews.map(v => v && v.filters && v.filters.loc && move(v.filters.loc) !== v.filters.loc ? { ...v, filters: { ...v.filters, loc: move(v.filters.loc) } } : v);
  for (const k of ['locMap', 'adLocMap']) if (st[k]) st[k] = Object.fromEntries(Object.entries(st[k]).map(([t, room]) => [t, move(room)]));
  /* The wall outlets on patch panels and the inventory checks of a room go along too. */
  for (const o of objs) if (o.outlets) for (const x of Object.values(o.outlets)) if (x && x.loc && move(x.loc) !== x.loc) x.loc = move(x.loc);
  for (const t of st.stocktakes || []) if (t && t.scope && move(t.scope) !== t.scope) t.scope = move(t.scope);
}
/* Renaming a site renames its rooms, the locations of the objects in them, and the racks. */
export function renameSite(old, value){
  const name = value.trim();
  if (!name || name.includes(' / ')){ toast('Write the site name, without a slash.'); renderSetLocs(); return; }
  if (name === old) return;
  if (SITES.includes(name)){ toast(name + ' already exists.'); renderSetLocs(); return; }
  SITES[SITES.indexOf(old)] = name;
  /* Rooms from AD's location follow the site to its new name. */
  if (st.adLocAuto === old) st.adLocAuto = name;
  const move = l => (l === old || String(l || '').startsWith(old + ' / ')) ? name + String(l).slice(old.length) : l;
  LOCS.forEach((l, i) => { LOCS[i] = move(l); });
  objs.forEach(o => { if (o.loc) o.loc = move(o.loc); });
  /* Plans and their areas follow the rename, so the devices stay on them. */
  PLANS.forEach(p => { if (p.site === old) p.site = name; (p.areas || []).forEach(a => { if (a.room) a.room = move(a.room); }); });
  if (st.loc) st.loc = move(st.loc);
  renamePlaceRefs(move);
  const n = objs.filter(o => String(o.loc || '').startsWith(name)).length;
  toastUndo(`Site renamed to ${name}${n ? ` · ${n} device${n === 1 ? '' : 's'}` : ''}`, () => { renameSite(name, old); queueServerSave(); });
  renderSetLocs(); render();
}
/* Renames room old to value (Site / Room), and with it the devices' locations, the plan areas and the filter. Draws
   Settings again and offers Undo, which renames it back. */
export function renameLoc(old, value, quiet = false){
  const name = cleanLoc(value);
  if (!name){ toast('Use the form Site / Room, e.g. Branch office / Store room'); renderSetLocs(); return false; }
  const same = LOCS.find(l => l !== old && l.toLowerCase() === name.toLowerCase());
  if (same){ toast(same + ' already exists.'); renderSetLocs(); return false; }
  if (name === old) return false;
  LOCS[LOCS.indexOf(old)] = name;
  objs.forEach(o => { if (o.loc === old) o.loc = name; });
  /* An area that only names its room (a room called like the area) gets the new name as its room, so its devices stay on it. */
  PLANS.forEach(p => (p.areas || []).forEach(a => { if (a.room === old || (!a.room && `${p.site} / ${a.name}` === old)) a.room = name; }));
  if (st.loc === old) st.loc = name;
  renamePlaceRefs(l => l === old ? name : l);
  if (quiet) return true;
  /* Undo renames it back: the devices, plan areas and filter follow again. */
  const n = objs.filter(o => o.loc === name).length;
  toastUndo(`Renamed to ${name}${n ? ` · ${n} device${n === 1 ? '' : 's'}` : ''}`, () => { renameLoc(name, old); queueServerSave(); }); renderSetLocs(); render();
  return true;
}
/* Address checks, the same rules as server/validate.js: an empty value is allowed. */
export { IPV4_RE, MAC_RE, validIPv6, checkAddress } from './addr.js';
