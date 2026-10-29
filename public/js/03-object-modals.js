import { closeModal, modal } from './19-modal.js';
import { sourcesPanel } from './18-sources.js';
import { accessoriesHtml, canAddPorts, comboNote, entriesHtml, extraFields, fieldMenu, ipClash, propRow, savedAt, typeFieldsOf } from './17-fields.js';
import './srcpick.js';
import { dateValue } from './datefield.js';
import { reviewBanner, bindReviewBanner, mergeTarget, resolveModal, reviewDo } from './15-review.js';
import { bindDeviceResp, deviceRespPanel } from './11-contacts.js';
import { bindDeviceLinks, deviceLinksPanel } from './12-links.js';
import { num, bindDeviceContracts, bindLicences, contractsOf, deviceContractsPanel, licenceMark, licencesFor, licencesPanel } from './09-costs.js';
import { sourceMark, O, COSTS, PLANS, contactOf, restoreSnapshot, snapshot, toastUndo, FEED_EXTRA, FEED_EXTRA_HINT, SUBNETS } from './01-core.js';
import { ipInt, subnetSpan } from './net.js';
import { twinsOf, portRangeError, pickHand, twinOf, keepByHand, joinBadges, GRAPH_TYPES, hiddenOf, lsLive, SCAN_ONLY, isAttached, MODELS, FIELD_LAYOUT, KIND_HINTS, patchPort, TYPE_FIELDS, VLANS, releaseRetiredPort, feedLinked, vlanLabel, hasPorts, $, FIELD_LABEL, HISTORY, KINDS, KIND_TARGETS, LOCS, LS_ON, STATUS, TYPES, byId, esc, hist, now, objs, pad2, pathUp, pfxOf, portLabel, rackUnits, racksList, rels, relsOf, rid, st, tcol, tico, toast, used } from './01-core.js';
import { SERVER, queueServerSave, render } from './07-render.js';
import { showOnPlan } from './20-plans.js';
import { canEdit, ensureUser, personById, checkAddress, mountModal, rackCheck, rackFields, who } from './04-settings.js';
import { newObjModal } from './05-new-object.js';
import { joinCardsAvailable, openObj } from './02-views.js';
import { sheetModal } from './08-sheets.js';
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
    const o = O('rack', name, {model: $('#rnModel').value.trim(), serial: $('#rnSerial').value.trim(), loc: $('#rnLoc').value, units});
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
  $('#toolbar').innerHTML = `<label class="muted" for="rkSel">Rack</label><select id="rkSel">${racks.map(r => `<option value="${esc(r.id)}" ${r.id===R_.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select>
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
      cells.push(`<div class="unit${h === 1 ? ' one' : ''}" data-open="${esc(top.id)}" style="grid-row:${rackUnits(R_) - n + 1} / span ${h};--c:${tcol(top.type)}" title="${esc(top.name)}">
        <span class="nm">${esc(top.name)}</span><span class="sub">${[esc(top.code), esc(sub)].filter(Boolean).join(' · ')}${sitting.length ? ' · on top: ' + sitting.map(x => esc(x.name)).join(', ') : ''}</span></div>`);
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
        <div class="addrel" style="flex-direction:column;align-items:stretch">${inRack.slice().sort((a,b) => (b.u||0) - (a.u||0)).map(o => `<button class="item" data-open="${esc(o.id)}" style="height:auto;padding:4px 6px"><span class="sw" style="background:${tcol(o.type)}"></span><span class="lbl mono">${o.ontop ? 'on ' + esc(byId(o.ontop).name) : 'U' + o.u + (o.h>1 ? '–' + (o.u+o.h-1) : '')}  ${esc(o.name)}</span></button>`).join('') || '<span class="muted">No devices in this rack yet. Use Mount device… above.</span>'}</div>
      </div>
    </div></div>`;
}

/* ---------- object page ---------- */
export const SW_TYPES = ['pc','notebook','server'];
export function softwarePanel(o){
  const list = o.software || [];
  return `<div class="panelbox"><div class="hdr">Software <span class="cnt">${list.length ? list.length + ' installed' : 'none'}</span></div>
    ${list.length ? `<div style="overflow-x:auto"><table class="grid mini" style="min-width:0"><thead><tr><th>Name</th><th>Version</th><th></th></tr></thead><tbody>
    ${list.map((p, i) => `<tr><td>${esc(p.name)}</td><td class="mono">${esc(p.version || '')}</td><td><button class="icon ghost" data-swdel="${i}" aria-label="Remove ${esc(p.name)}">×</button></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="note lempty">No software recorded yet: Lansweeper sends it, or add it below.</p>'}
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
      <td><span class="sw-dev">${tico(d.type, 'tico sm')}<a class="link mono" data-open="${esc(d.id)}">${esc(d.name)}</a></span></td>
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
/* A person added while giving them a device: their name (and department), as in Settings → Users, without a sign-in. */
function newPersonModal(o){
  modal(`<div class="mh">New person for ${esc(o.name)}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="npFirst">First name</label><input id="npFirst" maxlength="60" autocomplete="off">
      <label for="npLast">Last name</label><input id="npLast" maxlength="60" autocomplete="off">
      <label for="npDept">Department</label><input id="npDept" maxlength="80" autocomplete="off" placeholder="Optional">
    </div><p class="note">Added to Settings → Users as a person without a sign-in; give them a login there if they need one.</p></div>
    <div class="mf"><button id="npCancel">Cancel</button><button id="npOk" class="primary">Add and give the device</button></div>`, 'sm');
  $('#npCancel').onclick = closeModal;
  $('#npOk').onclick = () => {
    const name = [$('#npFirst').value.trim(), $('#npLast').value.trim()].filter(Boolean).join(' ');
    if (!name){ $('#npFirst').focus(); return; }
    const u = ensureUser(name, 'manual'), dept = $('#npDept').value.trim();
    if (dept && !u.dept) u.dept = dept;
    const was = o.user;
    delete o.hotdesk; o.uid = u.id;
    if (feedLinked(o) || (o.graph && o.graph.added)) pickHand(o, 'user');
    hist(o, now(), `Given to ${name}${was ? ' (was ' + was + ')' : ''} by ${who()}`);
    closeModal(); queueServerSave(); toast(`${o.name} is now with ${name}`); render();
  };
  $('#npFirst').focus();
}
/* What a device still holds when it is retired, each a tick box (ticked) in the dialog: the person who has it, the port
   it is plugged into, what is attached to it, its place on the floor plan, its contracts and its responsibles. A rack
   place is always given up. Only what applies is listed. */
function retireTies(o){
  const plugs = rels.filter(r => r.from === o.id && r.kind === 'connected' && byId(r.to));
  const attached = rels.filter(r => r.to === o.id && r.kind === 'attached' && byId(r.from));
  const plan = o.planPos && PLANS.find(p => p.id === o.planPos.plan);
  const cts = contractsOf(o);
  const resp = [o.respIn, o.respEx].filter(Boolean).map(contactOf).filter(Boolean);
  return [
    (o.uid || o.hotdesk) && ['user', `Take it from ${esc(o.user)}`, () => { o.uid = null; o.hotdesk = false; pickHand(o, 'user'); }],
    plugs.length && ['plug', `Unplug it from ${plugs.map(r => `${esc(byId(r.to).name)}${r.port != null ? ' port ' + esc(portLabel(byId(r.to), r.port)) : ''}`).join(', ')}, so the port is free`, () => plugs.forEach(r => rels.splice(rels.indexOf(r), 1))],
    attached.length && ['attached', `Detach ${attached.map(r => esc(byId(r.from).name)).join(', ')} (${attached.length === 1 ? 'it stays' : 'they stay'} in the inventory)`, () => attached.forEach(r => rels.splice(rels.indexOf(r), 1))],
    plan && ['plan', `Take it off the floor plan ${esc(plan.name)}`, () => { delete o.planPos; }],
    cts.length && ['contracts', `Remove it from ${cts.map(c => esc(c.name)).join(', ')}`, () => cts.forEach(c => { c.devices = (c.devices || []).filter(id => id !== o.id); })],
    resp.length && ['resp', `Remove ${resp.map(c => esc(c.name)).join(' and ')} as responsible`, () => { delete o.respIn; delete o.respEx; }],
  ].filter(Boolean);
}
export function retireModal(o){
  const ties = retireTies(o);
  modal(`<div class="mh">Retire ${esc(o.name)}?</div>
    <div class="mb"><p class="note">It stays in the inventory for the record, with its history, and is no longer offered when connecting something. You can bring it back by changing its status.${o.rack ? ' It is taken out of its rack.' : ''}</p>
      ${ties.length ? `<div class="rt-ties"><div class="rt-h">Also, so nothing looks in use that is not:</div>${ties.map(([k, l]) => `<label class="pchk"><input type="checkbox" data-rt="${k}" checked> ${l}</label>`).join('')}</div>` : ''}
      <div class="form" style="padding:8px 0 0"><label for="rtWhy">Reason</label><input id="rtWhy" maxlength="200" placeholder="Optional, e.g. broken screen, replaced by ZH-NB-0210"></div></div>
    <div class="mf"><button id="rtCancel">Cancel</button><button id="rtOk" class="danger-text">Retire</button></div>`, 'sm');
  $('#rtCancel').onclick = closeModal;
  $('#rtOk').onclick = () => {
    /* All of it can be undone at once: the device, the relations taken away and the contracts it was on. */
    /* The devices on top of it are taken out of the rack with it, so they are put back too. */
    const was = snapshot([o, ...objs.filter(x => x.ontop === o.id)]), relsWas = [...rels], ctsWas = COSTS.contracts.map(c => [c, [...(c.devices || [])]]);
    if (o.rack){ hist(o, now(), 'Taken out of the rack ' + (byId(o.rack) ? byId(o.rack).name : '') + ' for retirement by ' + who()); unplace(o); }
    const done = ties.filter(([k]) => $(`[data-rt="${k}"]`).checked);
    done.forEach(([, , run]) => run());
    const why = $('#rtWhy').value.trim();
    o.status = 'retired';
    hist(o, now(), 'Retired by ' + who() + (why ? ': ' + why : '') + (done.length ? ' · ' + done.map(([, l]) => l.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/, so the port is free| \(.*\)$/g, '')).join('; ') : ''));
    closeModal();
    toastUndo(o.name + ' is retired' + (done.length ? ` (${done.length} link${done.length === 1 ? '' : 's'} cleared)` : ''), () => {
      restoreSnapshot(was, 'Retirement undone by ' + who());
      /* Only the relations and contract entries the retirement took away come back: anything added since stays. */
      for (const r of relsWas) if (!rels.includes(r)) rels.push(r);
      ctsWas.forEach(([c, d]) => { c.devices = [...new Set([...(c.devices || []), ...d])]; });
      render();
    });
    render();
  };
}
/* A record that is most likely a second one of another device (argonb35.corp.example beside ARGONB35, see twinOf): said at
   the top of its page, with the device to open and, to clean it up, Merge: its address goes to that device as a dock's
   adapter, and it is kept as ignored so no sync brings it back. A device still waiting in To review is said so. */
function twinBanner(o){
  const tw = twinOf(o);
  /* The device itself says so too: its probable second records, to open or resolve from here. */
  const tws = twinsOf(o);
  if (!tw && tws.length) return `<div class="rv-banner warn"><span>${tws.length === 1 ? `<b>${esc(tws[0].name)}</b> is most likely a second record of this device` : `${tws.length} records are most likely second records of this device: ${tws.map(x => `<b>${esc(x.name)}</b>`).join(', ')}`}${tws.some(x => x.review) ? ' (waiting in To review)' : ''}: it has a DNS name and no serial number, as a docking station or USB network adapter leaves in Lansweeper.</span>${tws.length === 1 ? `<button type="button" id="twOpen">Open ${esc(tws[0].name)}</button>` : ''}${canEdit() ? `<button type="button" id="twResolve" class="primary">Resolve…</button>` : ''}</div>`;
  if (!tw){
    const was = o.notTwin && twinOf(o, { marked: true });
    return was ? `<div class="rv-banner"><span>Marked as not a duplicate of <b>${esc(was.name)}</b>.</span>${canEdit() ? '<button type="button" id="twAgain">Check again</button>' : ''}</div>` : '';
  }
  const can = canEdit() && !o.review && mergeTarget(o) === tw;
  return `<div class="rv-banner warn"><span>Probably a second record of <b>${esc(tw.name)}</b>${tw.review ? ' (waiting in To review)' : ''}: it has a DNS name and no serial number, as a docking station or USB network adapter leaves in Lansweeper.</span><button type="button" id="twOpen">Open ${esc(tw.name)}</button>${canEdit() ? '<button type="button" id="twResolve">Resolve…</button>' : ''}${can ? `<button type="button" id="twMerge" class="primary" title="Adds it to the attachments of ${esc(tw.name)} as its docking station (by its MAC address); this record is kept as ignored, so no sync brings it back">Merge into ${esc(tw.name)}</button>` : ''}</div>`;
}
export function purgeModal(o){
  /* A device Lansweeper sends comes back with its next push, as a new device: to keep it out, it is excluded instead. */
  const fromLs = !!o.feed && !o.excluded && o.feed.sys === 'Lansweeper';
  modal(`<div class="mh">Delete ${esc(o.name)}?</div>
    <div class="mb"><p class="note">This removes the object, its relations and its history for good. Retire keeps the record instead. Devices that were plugged into it or mounted on top of it stay, without that link.</p>
    ${fromLs ? '<p class="fieldnote warn">Lansweeper still has this device: its next push adds it again, as a new device with a new code. To keep it out, retire it and exclude it from the sync instead.</p>' : ''}</div>
    <div class="mf"><button id="pgCancel">Cancel</button>${fromLs ? '<button id="pgExcl" class="primary">Retire and exclude</button>' : ''}<button id="pgOk" class="danger-text">Delete permanently</button></div>`, 'sm');
  $('#pgCancel').onclick = closeModal;
  const ex = $('#pgExcl');
  if (ex) ex.onclick = () => {
    if (o.rack) unplace(o);
    o.status = 'retired'; o.excluded = true;
    hist(o, now(), 'Retired and excluded from Lansweeper sync by ' + who());
    closeModal(); toast(`${o.name} is retired and excluded: Lansweeper will not add it again`); render();
  };
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
  /* Fields Lansweeper fills in that the type does not have join the list, so they can be renamed, moved and hidden too. */
  fields.push(...extraFields(o, fields));
  fields = fields
    .map(f => (lay.labels && lay.labels[f[0]] ? [f[0], lay.labels[f[0]], f[2]] : f))
    .sort((a, b) => at(a) - at(b));
  fields = fields.filter(f => lsLive() || !SCAN_ONLY.includes(f[0]));
  /* A field hidden on this device, or on every device of the type (from the ⋯ menu or Settings). Its value is kept,
     and "Show hidden fields" brings the hidden ones back for a moment, each with its own way to show it again. */
  const hiddenBy = f => (o.hide || []).includes(f[0]) ? 'device' : hiddenOf(o.type).includes(f[0]) ? 'type' : '';
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
  $('#toolbar').innerHTML = `${tico(o.type)}<b class="mono" id="objTitle" tabindex="-1">${esc(o.name)}</b><span class="code">${esc(o.code)}</span><span class="muted hide-n">${esc(TYPES[o.type].label)}</span>
    <span class="chip ${STATUS[o.status].cls}">${STATUS[o.status].label}</span>${o.planPos && PLANS.some(p => p.id === o.planPos.plan) ? `<button type="button" class="link hide-n" id="onPlanBtn" title="Open its floor plan, with the device marked">On floor plan ${esc(PLANS.find(p => p.id === o.planPos.plan).name)}</button>` : ''}<div class="grow"></div>
    <details class="menu"><summary>More</summary><div class="menubox"><button id="dupBtn">Duplicate</button>${canAddPorts(o.type) && !extraPorts && canEdit() ? '<button id="addPortsBtn">Add network ports…</button>' : ''}${o.uid && SERVER.on && canEdit() ? `<button id="sheetBtn">Entry sheet for ${esc(o.user)}…</button>` : ''}<button id="delBtn">Retire…</button>${canEdit() ? (o.excluded ? '<button id="exclBtn">Include in sync</button>' : '<button id="exclBtn">Exclude from sync</button><button id="exclRelBtn">Exclude with its relations</button>') : ''}${canEdit() ? '<button id="purgeBtn" class="danger-text">Delete permanently…</button>' : ''}</div></details><span class="obj-saved" id="objSaved" role="status">${o.handAt ? 'Saved ' + esc(savedAt(o.handAt)) : ''}</span><button id="saveBtn" class="primary" hidden>Save</button>`;
  $('#view').innerHTML = `${reviewBanner(o)}${twinBanner(o)}<div class="obj">
    <div class="col">
      <div class="panelbox"><div class="hdr">Properties</div><div class="form props${edit ? "" : " ro"}">${fields.map(row).join('')}
        ${rackFields(o)}
        ${GRAPH_TYPES.includes(o.type) && joinCardsAvailable() ? `<label>Directory</label><div class="ctlrow">${joinBadges(o).replace(/class="jbar\b/, 'class="jbar jbar-page')}<span class="fsrc-slot" aria-hidden="true"></span>${menuSlot}</div>` : ''}
        ${o.type === 'pc' || o.type === 'notebook' || (o.accessories || []).length ? `<label>Attachments</label><div class="ctlrow entries">${accessoriesHtml(o)}<span class="fsrc-slot" aria-hidden="true"></span>${menuSlot}</div>` : ''}
        <label>Notes</label><div class="ctlrow entries">${entriesHtml(o)}<span class="fsrc-slot" aria-hidden="true"></span>${menuSlot}</div>
        ${nHidden ? `<span></span><div><button type="button" class="link fm-reveal" id="fmReveal" aria-expanded="${reveal}">${reveal ? 'Hide the hidden fields' : `Show ${nHidden} hidden field${nHidden === 1 ? '' : 's'}`}</button></div>` : ''}</div></div>
      ${sourcesPanel(o)}
    </div>
    <div class="col">
      ${o.type === 'patch' ? patchPanel(o) : ''}
      ${deviceLinksPanel(o)}
      ${SW_TYPES.includes(o.type) ? softwarePanel(o) : ''}
      ${deviceRespPanel(o)}
      ${deviceContractsPanel(o)}
      <div class="panelbox"><div class="hdr">Relations <span class="cnt">${rs.length || 'none'}</span></div>
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
  bindDeviceResp(o);
  bindDeviceLinks(o);
  const objView = $('#view').querySelector('.obj');
  /* A field saves when it is left; while one is being typed in, Save shows (Enter or leaving the field do the same). */
  const dirty = () => { $('#saveBtn').hidden = false; $('#objSaved').textContent = 'Not saved yet'; $('#objSaved').classList.add('dirty'); };
  objView.addEventListener('input', dirty);
  /* A field saves when it is left: the whole object is saved, without a redraw, except for a type change, which changes the fields. */
  objView.addEventListener('change', e => {
    /* "New person…": who gets the device, added to the people here and given it in one step. */
    if (e.target.dataset.k === 'user' && e.target.value === '__new'){ e.target.value = o.hotdesk ? '__hotdesk' : (o.uid || ''); newPersonModal(o); return; }
    dirty(); if (e.target.matches('[data-k],[data-rk]')) saveObj(e.target.dataset.k === 'type');
  });
  /* A source tab shows its part of the Sources panel; the choice stays for the next device page. */
  objView.querySelectorAll('[data-srctab]').forEach(b => b.onclick = () => {
    const k = st.srcTab = b.dataset.srctab, box = b.closest('.srcpanel');
    box.querySelectorAll('[data-srctab]').forEach(x => { const on = x.dataset.srctab === k; x.classList.toggle('sel', on); x.setAttribute('aria-selected', String(on)); });
    box.querySelectorAll('[role=tabpanel]').forEach(x => { x.hidden = x.id !== 'srcbody-' + k; });
    box.querySelectorAll('[data-srcmeta]').forEach(x => { x.hidden = x.dataset.srcmeta !== k; });
  });
  /* A panel stays open or closed as the person left it. The choice is kept in this browser, by the panel's title. */
  $('#view').querySelectorAll('.obj .panelbox > .hdr').forEach(h => {
    h.classList.add('sechdr'); h.setAttribute('role', 'button'); h.tabIndex = 0;
    const key = h.dataset.key || (h.childNodes[0] ? h.childNodes[0].textContent : h.textContent).trim();
    const closed = !!collapsedPanels()[key];
    h.parentNode.classList.toggle('collapsed', closed); h.setAttribute('aria-expanded', String(!closed));
    const toggle = () => { const c = h.parentNode.classList.toggle('collapsed'); h.setAttribute('aria-expanded', String(!c)); rememberPanel(key, c); };
    h.addEventListener('click', e => { if (!e.target.closest('button,input,select,a,label')) toggle(); });
    h.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === h){ e.preventDefault(); toggle(); } });
  });
  /* A device with ports but no port count yet cannot have its port checked: say so, but let the connection be made. */
  const portHint = () => {
    const to = $('#arTo').value ? byId($('#arTo').value) : null;
    $('#arHint').textContent = to && hasPorts(to) && !(to.ports > 0) ? `${to.name} has no port count yet. Set its ports in its details, so the port can be checked.` : '';
  };
  /* The relation kind decides which objects are offered as targets: a monitor attaches to a PC, a device connects to a switch or a patch panel. */
  const fitTargets = () => {
    const k = $('#arKind').value;
    $('#arTo').innerHTML = '<option value="">Choose a device…</option>' + targets.filter(t => KIND_TARGETS[k].includes(t.type) && (k !== 'hosted' || t.kind !== 'vm')).map(t => `<option value="${esc(t.id)}">${esc(t.name)} (${esc(TYPES[t.type].short)})</option>`).join('');
    /* The field is narrow: the placeholder is short, and the patch panel hint is in its tooltip. */
    $('#arPort').placeholder = k === 'connected' || k === 'uplink' ? 'Port' : 'Port (opt.)';
    $('#arPort').title = k === 'connected' ? 'Port number, or P04 for a port on a patch panel' : '';
  };
  $('#arKind').innerHTML = Object.entries(KINDS).map(([k,v]) => `<option value="${k}" title="${esc(KIND_HINTS[k])}">${v.fwd[0].toUpperCase() + v.fwd.slice(1)}</option>`).join('');
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
    if (portRangeError(to, port)){ toast(portRangeError(to, port)); return; }
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
  /* The address says at once when it is taken or is its subnet's gateway. */
  const ipIn = $('#f_' + o.id + '_ip'); if (ipIn) comboNote(ipIn);
  /* Software and links: ticked, Lansweeper keeps the list; unticked, it is kept as set here (o.pick, as for a field). */
  $('#view').querySelectorAll('[data-lslist]').forEach(c => c.onchange = () => {
    const k = c.dataset.lslist, name = { software: 'Software', links: 'Links' }[k] || k;
    const rest = {...(o.pick || {})}; delete rest[k];
    o.pick = c.checked ? ((st.policy || {})[k] === false ? {...rest, [k]: 'ls'} : rest) : {...rest, [k]: 'hand'};
    if (!Object.keys(o.pick).length) delete o.pick;
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
  /* Saves the device's fields. Returns false when it stopped (a wrong address, a blocked change): then nothing is
     redrawn, so what was typed stays in the fields to be corrected. */
  const saveObj = (rerender = true) => {
    /* Addresses are checked before anything is saved; a bad one stays in its field so it can be corrected. */
    const addrs = [...$('#view').querySelectorAll('[data-k="ip"],[data-k="ip6"],[data-k="mac"]')];
    const checked = addrs.map(el => ({ el, c: checkAddress(el.dataset.k, el.value) }));
    const wrong = checked.find(x => !x.c.ok);
    if (wrong){ toast(wrong.c.msg); wrong.el.focus(); return false; }
    /* A rack with devices in it stays a rack; and the ports cannot shrink below the connections that use them. */
    const typeEl = $('#view').querySelector('[data-k="type"]');
    if (typeEl && o.type === 'rack' && typeEl.value !== 'rack' && objs.some(x => x.rack === o.id)){ toast('Move the devices out of this rack first.'); typeEl.value = o.type; return false; }
    const pEl = $('#view').querySelector('[data-k="ports"]'), sEl = $('#view').querySelector('[data-k="sfp"]');
    if (pEl && sEl){
      const total = (+pEl.value || 0) + (+sEl.value || 0);
      if (rels.some(r => r.to === o.id && typeof r.port === 'number' && r.port > total)){ toast(`Ports in use above ${total} block this change. Move or remove those connections first.`); pEl.value = o.ports || 0; sEl.value = o.sfp || 0; return false; }
    }
    checked.forEach(x => { x.el.value = x.c.value; });
    const rkEl = k => { const e = $('#view').querySelector(`[data-rk="${k}"]`); return e ? e.value : null; };
    let place = null;
    if (rkEl('rack') !== null){
      const top = rkEl('ontop'), rackId = rkEl('rack'), u = +rkEl('u'), h = +rkEl('h') || 1;
      if (top){ place = {ontop: top, rack: byId(top).rack}; }
      else if (rackId){
        const err = rackCheck(rackId, u, h, o.id);
        if (err){ toast(err); return false; }
        place = {rack: rackId, u, h};
      } else place = {};
    }
    const kept = [];
    $('#view').querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k; let v = dateValue(el);
      if (k.startsWith('custom.')){ o.custom = {...(o.custom || {}), [k.slice(7)]: v === '' ? null : (el.type === 'number' ? +v : v)}; return; }
      if (k === 'user'){
        const was = o.hotdesk ? '__hotdesk' : (o.uid || '');
        if (v === '__hotdesk'){ o.hotdesk = true; o.uid = null; } else { delete o.hotdesk; o.uid = v || null; }
        /* A user picked by hand on a linked device is kept: the next sync does not put the Lansweeper user back. */
        if ((feedLinked(o) || (o.graph && o.graph.added)) && was !== (v || '')){ pickHand(o, 'user'); kept.push(FIELD_LABEL.user || 'User'); }
        return;
      }
      if (['ports','sfp'].includes(k)) v = +v || 0;
      /* A price: a number of 0 or more, written with a point or a comma; empty takes it away. */
      /* Read as a contract's amount is (num): 1290, 1'290.50 and 1,290 mean the same everywhere. */
      if (k === 'price'){ const t = num(v); if (t === undefined){ if (v.trim() !== '') toast('The price is a number up to 1 000 000 000, e.g. 1290 or 99.50.'); delete o.price; return; } v = t; }
      if (k === 'ports') st.addPorts = null;   /* from now on the saved count decides whether the port fields show */
      if (k === 'units') v = +v || 42;
      if (k === 'type' && o.type !== v && TYPES[v]){
        hist(o, now(), `Type changed from ${TYPES[o.type] ? TYPES[o.type].label : o.type} to ${TYPES[v].label} by ${who()}`);
        pickHand(o, 'type');   /* set by hand: the type rules leave it alone */
        /* A device that becomes a switch gets the port counts a new switch has, where it has none yet. */
        if (v === 'switch'){ o.ports ??= 24; o.sfp ??= 4; }
      }
      if (k === 'ports' && hasPorts(o) && v < (o.ports || 0) && rels.some(r => r.to === o.id && typeof r.port === 'number' && r.port > v)){ toast(`Ports in use above ${v} block this change. Move or remove those connections first.`); v = o.ports; }
      /* A value changed by hand on a device a sync fills in is kept from then on: Lansweeper's, or Graph's for one added from Graph. */
      if ((feedLinked(o) || (o.graph && o.graph.added)) && FIELD_LABEL[k] && String(o[k] ?? '') !== String(v ?? '')){ pickHand(o, k); kept.push(FIELD_LABEL[k]); }
      /* A value changed here is noted as set by hand, over any sync's (and kept from them); cleared, it stays empty: no
         sync fills it again. */
      if (String(o[k] ?? '') !== String(v ?? '') && (FIELD_LABEL[k] || ['name', 'purpose', 'serial', 'price', 'supplier', 'invoice'].includes(k))){
        if (String(v ?? '') === ''){
          if (o.src && o.src[k]){ delete o.src[k]; if (!Object.keys(o.src).length) delete o.src; pickHand(o, k); }
        } else o.src = {...(o.src || {}), [k]: 'hand'};
        keepByHand(o, k);
      }
      o[k] = v;
      /* The mark beside the field follows at once: the page is not drawn again for one field. */
      const fld = document.getElementById(`f_${o.id}_${k}`), mk = fld && fld.closest('.ctlrow') && fld.closest('.ctlrow').querySelector(':scope > .fsrc, :scope > .fsrc-slot');
      if (mk) mk.outerHTML = sourceMark(o, k);
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
    if (o.model && o.model !== '—' && !MODELS.includes(o.model)) MODELS.push(o.model);
    o.handAt = new Date().toISOString();
    hist(o, now(), 'Saved by ' + who() + (kept.length ? ' · kept from feed: ' + kept.join(', ') : ''));
    /* An address used by another device, or outside the subnet the device is on, is flagged; the object is still saved. */
    const warns = [];
    /* Another device's other adapters count too: a notebook's Wi-Fi address is in use as much as its cable one. */
    /* A DHCP address on another device is only noted on the page; a real clash is said here too. */
    const clash = o.ip && o.status !== 'retired' ? ipClash(o, o.ip) : null;
    if (clash && clash.level === 'warn') warns.push(clash.text);
    const sn = o.subnet ? SUBNETS.find(n => n.cidr === o.subnet) : null, span = sn ? subnetSpan(sn) : null, ipn = ipInt(o.ip);
    if (span && o.ip && ipn !== null && (ipn < span.first || ipn > span.last)) warns.push(`${o.ip} is outside ${sn.cidr}`);
    /* Said plainly: what was typed over a synced value stays, and the sync leaves it alone from now on. */
    const keptMsg = kept.length ? `. ${kept.join(', ')}: your value stays; ${feedLinked(o) ? 'Lansweeper' : 'Microsoft Graph'} no longer changes ${kept.length === 1 ? 'it' : 'them'}` : '';
    toast('Saved ' + o.name + keptMsg + (warns.length ? '. Check: ' + warns.join('; ') : ''));
    queueServerSave();
    if (rerender) render(); else { $('#saveBtn').hidden = true; $('#objSaved').textContent = 'Saved ' + savedAt(o.handAt); $('#objSaved').classList.remove('dirty'); }
    return true;
  };
  $('#saveBtn').onclick = () => saveObj();
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
      const lay = FIELD_LAYOUT[o.type] || {}, h = hiddenOf(o.type).filter(x => x !== k); if (act === 'hidetype') h.push(k);
      FIELD_LAYOUT[o.type] = {...lay, hidden: h};
      toast(act === 'hidetype' ? `${name} is hidden on every ${t}. The values are kept; Show hidden fields brings it back.` : `${name} is shown again on every ${t}`); render(); return;
    }
    if (act === 'clear'){
      const el = objView.querySelector(`[data-k="${CSS.escape(k)}"]`); if (!el) return;
      const fromFeed = (feedLinked(o) && LS_ON()) || (o.graph && o.graph.added) || o.ad ? !!FIELD_LABEL[k] : false;
      modal(`<div class="mh">Clear ${esc(name)}?</div>
        <div class="mb"><p class="note">The value of ${esc(name)} on ${esc(o.name)} is removed. The history keeps a note.${fromFeed ? ' No source fills it in again; pick Back to automatic at its source mark to let them.' : ''}</p></div>
        <div class="mf"><button id="fmCancel">Cancel</button><button id="fmOk" class="danger-text">Clear</button></div>`, 'sm');
      $('#fmCancel').onclick = closeModal;
      $('#fmOk').onclick = () => {
        closeModal();
        el.value = '';
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
    const set = list => { avHid.value = list.join('; '); if (saveObj(false)) render(); };
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
  /* Handing a device over: the entry sheet of the person who has it (their devices and a first password), from here. */
  const opb = $('#onPlanBtn'); if (opb) opb.onclick = () => showOnPlan(o);
  const sb = $('#sheetBtn'); if (sb) sb.onclick = () => { const u = personById(o.uid); if (u) sheetModal(u); };
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
  bindReviewBanner(o);
  const tw = twinOf(o);
  const ag = $('#twAgain');
  if (ag) ag.onclick = () => { delete o.notTwin; hist(o, now(), `Checked again as a possible duplicate by ${who()}`); render(); };
  const tws = !tw ? twinsOf(o) : [];
  if (tws.length){
    const to = $('#twOpen'); if (to) to.onclick = () => openObj(tws[0].id);
    const tr = $('#twResolve'); if (tr) tr.onclick = () => resolveModal(tws);
  }
  if (tw){
    $('#twOpen').onclick = () => openObj(tw.id);
    const tr = $('#twResolve'); if (tr) tr.onclick = () => resolveModal([o]);
    const tm = $('#twMerge');
    if (tm) tm.onclick = () => reviewDo('merge', [o]);
  }
}

/* The field policy as checkboxes. Same state in Settings and in the feed wizard. */
/* Two groups: the fields of a device, and what else the feed brings (each with what it does as a tooltip). */
export const policyGrid = () => `<div class="pgrid">${Object.keys(FIELD_LABEL).map(k => `<label class="pchk"><input type="checkbox" data-pol="${k}" ${st.policy[k]?'checked':''}> ${FIELD_LABEL[k]}</label>`).join('')}</div>
  <div class="pgrid pgrid-extra">${Object.keys(FEED_EXTRA).map(k => `<label class="pchk" title="${esc(FEED_EXTRA_HINT[k])}"><input type="checkbox" data-pol="${k}" ${st.policy[k] !== false ?'checked':''}> ${FEED_EXTRA[k]}</label>`).join('')}</div>`;
export function bindPolicy(root){
  root.querySelectorAll('[data-pol]').forEach(c => c.onchange = () => {
    const k = c.dataset.pol;
    st.policy[k] = c.checked;
    /* A field with its sources set in Settings → Data sources: Lansweeper goes first there, or out. */
    const set = st.fieldOrder && st.fieldOrder[k];
    if (Array.isArray(set)) st.fieldOrder = { ...st.fieldOrder, [k]: c.checked ? ['ls', ...set.filter(x => x !== 'ls')] : set.filter(x => x !== 'ls') };
    render();
  });
}

