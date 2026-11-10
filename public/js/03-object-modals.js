import { SW_TYPES, bindSoftware, softwarePanel } from './views-software.js';
import { closeModal, modal } from './19-modal.js';
import { sourcesPanel } from './18-sources.js';
import { accessoriesHtml, canAddPorts, comboHtml, comboNote, notesHtml, extraFields, fieldMenu, ipClash, propRow, savedAt, typeFieldsOf } from './17-fields.js';
import './srcpick.js';
import { dateValue } from './datefield.js';
import { reviewBanner, bindReviewBanner, mergeTarget, resolveModal, reviewDo } from './15-review.js';
import { bindDeviceResp, deviceRespPanel } from './11-contacts.js';
import { bindDeviceLinks, deviceLinksPanel } from './12-links.js';
import { bindMaint, maintPanel } from './26-maintenance.js';
import { handOutModal, takeBackModal } from './27-handout.js';
import { bindPhotos, photoCount, photosPanel } from './23-photos.js';
import { num, bindDeviceContracts, contractsOf, deviceContractsPanel } from './09-costs.js';
import { dayText, rackUnits, $$, menuHtml, sourceMark, COSTS, PLANS, contactOf, restoreSnapshot, snapshot, toastUndo, FEED_EXTRA, FEED_EXTRA_HINT, SUBNETS, REVIEW } from './01-core.js';
import { ipInt, subnetSpan } from './net.js';
import { twinsOf, portRangeError, portValue, pickHand, twinOf, setByHand, joinBadges, GRAPH_TYPES, hiddenOf, lsLive, SCAN_ONLY, isAttached, MODELS, FIELD_LAYOUT, KIND_HINTS, patchPort, TYPE_FIELDS, VLANS, releaseRetiredPort, feedLinked, vlanLabel, hasPorts, $, FIELD_LABEL, HISTORY, KINDS, LS_ON, STATUS, TYPES, byId, hist, now, objs, pathUp, pfxOf, portLabel, rels, relsOf, rid, st, tico, toast } from './01-core.js';
import { SERVER, coloursModal, queueServerSave, render, renderStatus, view } from './07-render.js';
import { showOnPlan } from './20-plans.js';
import { RACKABLE, ensureUser, isAdmin, personById, checkAddress, rackCheck, rackFields, rackLocFollow, rackTopUsed, who } from './04-settings.js';
import { newObjModal } from './05-new-object.js';
import { joinCardsAvailable, openObj } from './02-views.js';
import { sheetModal } from './08-sheets.js';
import { editText, fieldNote } from './restore.js';
import { bindHistory, historyPanel, refreshHistory } from './28-restore.js';
import { timelinePanel, bindTimeline } from './29-timeline.js';
import { html, rawHtml } from './html.js';
import { anyOutlets, bindPatchPanel, patchPanel } from './24-patch.js';
import { cordTarget, findOutlet, outletLabel, outletOf, panelPortNo } from './cabling.js';
import { portSetupError } from './views-ports.js';
import { HOST_KINDS, PORT_KINDS, kindProblem, linkKind, relationProblem } from './relations.js';
/* The device page: its fields, the panels beside them (links, maintenance, photos, software, responsibles, contracts,
   relations, path to the network, history, timeline), and retiring or deleting a device. */
/* ---------- object page ---------- */
export { patchPanel };
/* Deletes an object for good, with its relations and history. Retiring is the way to keep the record. */
/* Retiring keeps the record: the object stays with its relations, ports and rack place, and is no longer offered as a target. */
/* A person added while giving them a device: their name (and department), as in Settings → Users, without a sign-in. */
function newPersonModal(o){
  modal(html`<div class="mh">New person for ${o.name}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="npFirst">First name</label><input id="npFirst" maxlength="60" autocomplete="off">
      <label for="npLast">Last name</label><input id="npLast" maxlength="60" autocomplete="off">
      <label for="npDept">Department</label>${rawHtml(comboHtml('<input id="npDept" data-combo="dept" maxlength="80" placeholder="Optional: type or pick a department">', 'npDept'))}
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
/** @returns {[string, import('./html.js').Html, () => void][]} */
function retireTies(o){
  const { plugs, host, attached, vms } = linksOf(o);
  const plan = o.planPos && PLANS.find(p => p.id === o.planPos.plan);
  const cts = contractsOf(o);
  const resp = [o.respIn, o.respEx].filter(Boolean).map(contactOf).filter(Boolean);
  return [
    (o.uid || o.hotdesk) && ['user', html`Take it from ${o.user}`, () => { o.uid = null; o.hotdesk = false; pickHand(o, 'user'); }],
    plugs.length && ['plug', html`Unplug it from ${plugs.map(r => `${byId(r.to).name}${r.port != null ? ' port ' + portLabel(byId(r.to), r.port) : ''}`).join(', ')}, so the port is free`, () => plugs.forEach(r => rels.splice(rels.indexOf(r), 1))],
    host.length && ['host', html`Take it off ${host.map(r => byId(r.to).name).join(', ')}`, () => host.forEach(r => rels.splice(rels.indexOf(r), 1))],
    attached.length && ['attached', html`Detach ${attached.map(r => byId(r.from).name).join(', ')} (${attached.length === 1 ? 'it stays' : 'they stay'} in the inventory)`, () => attached.forEach(r => rels.splice(rels.indexOf(r), 1))],
    vms.length && ['vms', html`${vms.map(r => byId(r.from).name).join(', ')} no longer ${vms.length === 1 ? 'runs' : 'run'} on it (${vms.length === 1 ? 'it stays' : 'they stay'} in the inventory)`, () => vms.forEach(r => rels.splice(rels.indexOf(r), 1))],
    plan && ['plan', html`Take it off the floor plan ${plan.name}`, () => { delete o.planPos; }],
    cts.length && isAdmin() && ['contracts', html`Remove it from ${cts.map(c => c.name).join(', ')}`, () => cts.forEach(c => { c.devices = (c.devices || []).filter(id => id !== o.id); })],
    resp.length && ['resp', html`Remove ${resp.map(c => c.name).join(' and ')} as responsible`, () => { delete o.respIn; delete o.respEx; }],
  ].filter(Boolean).map(t => /** @type {[string, import('./html.js').Html, () => void]} */ (t));
}
/* The links a retired device gives up: the ports it is plugged into (and its uplinks), the device it is attached to or
   runs on, the devices attached to it and the VMs on it. */
function linksOf(o){
  const at = (r, end) => byId(r[end]);
  return {
    plugs: rels.filter(r => r.from === o.id && PORT_KINDS.includes(r.kind) && at(r, 'to')),
    host: rels.filter(r => r.from === o.id && HOST_KINDS.includes(r.kind) && at(r, 'to')),
    attached: rels.filter(r => r.to === o.id && r.kind === 'attached' && at(r, 'from')),
    vms: rels.filter(r => r.to === o.id && r.kind === 'hosted' && at(r, 'from')),
  };
}
/* Retiring without the dialog (bulk, Retire and exclude): out of its rack, and every link above given up. Returns the
   relations taken away, for an Undo. */
export function retireLinks(o){
  if (o.rack){ hist(o, now(), 'Taken out of the rack ' + (byId(o.rack) ? byId(o.rack).name : '') + ' for retirement by ' + who()); unplace(o); }
  const l = linksOf(o), gone = [...l.plugs, ...l.host, ...l.attached, ...l.vms];
  for (const r of gone){ rels.splice(rels.indexOf(r), 1); }
  return gone;
}
/* The Retire dialog: what the device still holds (retireTies) to clear, ticked, and an optional reason. Retiring takes it
   out of its rack, sets it retired and notes it in the history, with one Undo for all of it. */
export function retireModal(o){
  const ties = retireTies(o);
  modal(html`<div class="mh">Retire ${o.name}?</div>
    <div class="mb"><p class="note">It stays in the inventory for the record, with its history, and is no longer offered when connecting something. You can bring it back by changing its status.${o.rack ? ' It is taken out of its rack.' : ''}</p>
      ${ties.length ? html`<div class="rt-ties"><div class="rt-h">Also, so nothing looks in use that is not:</div>${ties.map(([k, l]) => html`<label class="pchk"><input type="checkbox" data-rt="${k}" checked> ${l}</label>`)}</div>` : ''}
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
    hist(o, now(), 'Retired by ' + who() + (why ? ': ' + why : '') + (done.length ? ' · ' + done.map(([, l]) => new DOMParser().parseFromString(String(l), 'text/html').body.textContent.replace(/, so the port is free| \(.*\)$/g, '')).join('; ') : ''));
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
  if (!tw && tws.length) return html`<div class="rv-banner warn"><span>${tws.length === 1 ? html`<b>${tws[0].name}</b> is most likely a second record of this device` : html`${tws.length} records are most likely second records of this device: ${tws.map((x, i) => html`${i ? ', ' : ''}<b>${x.name}</b>`)}`}${tws.some(x => x.review) ? ' (waiting in To review)' : ''}: it has a DNS name and no serial number, as a docking station or USB network adapter leaves in Lansweeper.</span>${tws.length === 1 ? html`<button type="button" id="twOpen">Open ${tws[0].name}</button>` : ''}${isAdmin() ? html`<button type="button" id="twResolve" class="primary">Resolve…</button>` : ''}</div>`;
  if (!tw){
    const was = o.notTwin && twinOf(o, { marked: true });
    return was ? html`<div class="rv-banner"><span>Marked as not a duplicate of <b>${was.name}</b>.</span>${isAdmin() ? html`<button type="button" id="twAgain">Check again</button>` : ''}</div>` : '';
  }
  const can = isAdmin() && !o.review && mergeTarget(o) === tw;
  return html`<div class="rv-banner warn"><span>Probably a second record of <b>${tw.name}</b>${tw.review ? ' (waiting in To review)' : ''}: it has a DNS name and no serial number, as a docking station or USB network adapter leaves in Lansweeper.</span><button type="button" id="twOpen">Open ${tw.name}</button>${isAdmin() ? html`<button type="button" id="twResolve">Resolve…</button>` : ''}${can ? html`<button type="button" id="twMerge" class="primary" title="Adds it to the attachments of ${tw.name} as its docking station (by its MAC address); this record is kept as ignored, so no sync brings it back">Merge into ${tw.name}</button>` : ''}</div>`;
}
/* The Delete dialog. A device the feed still sends is offered Retire and exclude as well, since deleting it only brings
   it back as a new device with the next push. */
export function purgeModal(o){
  /* A device Lansweeper sends comes back with its next push, as a new device: to keep it out, it is excluded instead. */
  const fromLs = !!o.feed && !o.excluded && o.feed.sys === 'Lansweeper';
  modal(html`<div class="mh">Delete ${o.name}?</div>
    <div class="mb"><p class="note">This removes the device, its relations and its history for good. Retire keeps the record instead. Devices that were plugged into it or mounted on top of it stay, without that link.</p>
    ${fromLs ? html`<p class="fieldnote warn">Lansweeper still has this device: its next push adds it again, as a new device with a new code. To keep it out, retire it and exclude it from the sync instead.</p>` : ''}</div>
    <div class="mf"><button id="pgCancel">Cancel</button>${fromLs ? html`<button id="pgExcl" class="primary">Retire and exclude</button>` : ''}<button id="pgOk" class="danger-text">Delete permanently</button></div>`, 'sm');
  $('#pgCancel').onclick = closeModal;
  const ex = $('#pgExcl');
  if (ex) ex.onclick = () => {
    retireLinks(o);
    o.status = 'retired'; o.excluded = true;
    hist(o, now(), 'Retired and excluded from Lansweeper sync by ' + who());
    closeModal(); toast(`${o.name} is retired and excluded: Lansweeper will not add it again`); render();
  };
  $('#pgOk').onclick = () => { deleteObject(o.id); closeModal(); toast(`${o.name} deleted`); };
}
/* Removes a device (or a record in To review) for good: its relations, its history, rack and on-top links to it, and its
   tab. Records merged into it stay ignored. No Undo. */
export function deleteObject(id){
  /* A record waiting in To review (or ignored there) is deleted from that list. */
  const list = objs.some(x => x.id === id) ? objs : REVIEW;
  const i = list.findIndex(x => x.id === id); if (i < 0) return;
  list.splice(i, 1);
  /* Records merged into a deleted device stay ignored, merged into nothing. */
  REVIEW.forEach(x => { if (x.review && x.review.merged === id) { delete x.review.merged; delete x.review.filled; delete x.review.moved; } });
  for (let k = rels.length - 1; k >= 0; k--) if (rels[k].from === id || rels[k].to === id) rels.splice(k, 1);
  /* What sat on top of it leaves the rack too: it had no U of its own. */
  objs.forEach(x => { if (x.ontop === id) { delete x.ontop; delete x.rack; delete x.u; delete x.h; hist(x, now(), 'Taken out of the rack: the device it sat on was deleted'); } });
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
/* Hand out or take back, the one thing done most with a device that people use: shown on those (and on any device
   someone has), for someone who may change it. */
const PERSONAL = ['pc', 'notebook', 'mobile', 'android', 'ios', 'monitor', 'sip', 'camera'];
const handBtn = o => !isAdmin() || o.review || o.status === 'retired' || !(PERSONAL.includes(o.type) || o.uid || o.hotdesk) ? ''
  : o.uid || o.hotdesk ? html`<button id="takeBackBtn" title="Back into stock, with nobody (with Undo)">Take back</button>` : html`<button id="handOutBtn" title="Give it to a person: in use with them from now on">Hand out…</button>`;
/* The fields a device page always shows, filled or not; the others show when they hold something, or all of them on request. */
const KEY_FIELDS = ['name', 'type', 'status', 'model', 'serial', 'loc', 'user', 'ip', 'os', 'purpose'];
const ALL_KEY = 'ni-all-fields';
const allFields = () => { try { return localStorage.getItem(ALL_KEY) === '1'; } catch { return false; } };
const setAllFields = on => { try { if (on) localStorage.setItem(ALL_KEY, '1'); else localStorage.removeItem(ALL_KEY); } catch { /* not kept */ } };
/* Per open device, the extra panels that held something when its page was last drawn. */
const shownFull = new Map();
/* The panels a device may have beside its fields (links, maintenance, photos, software, responsible, contracts): an empty
   one is not drawn as a box of its own but offered on one Add line, and opens when its button is clicked. */
function extras(o){
  const edit = isAdmin();
  const parts = [
    ['links', 'Link', deviceLinksPanel(o), !(o.urls || []).length],
    ['maint', 'Maintenance', o.review ? '' : maintPanel(o), !(o.maint || []).length],
    ['photos', 'Photo', photosPanel(o), photoCount(o.id) === 0],
    ['software', 'Software', SW_TYPES.includes(o.type) ? softwarePanel(o) : '', !(o.software || []).length],
    ['resp', 'Responsible', deviceRespPanel(o), !o.respIn && !o.respEx],
    ['contracts', 'Contract', deviceContractsPanel(o), !contractsOf(o).length],
  ].filter(([, , html]) => html);
  /* A panel that held something and became empty while the page was open (the last photo removed, the last link
     deleted…) stays where it is, now with its ×, instead of jumping back to the Add line. Photos still loading count
     as neither full nor empty. */
  const was = shownFull.get(o.id), full = new Set(parts.filter(([k, , , empty]) => !empty && !(k === 'photos' && photoCount(o.id) === null)).map(([k]) => k));
  if (was) for (const [k, , , empty] of parts) if (empty && was.has(k)) (st.showPanels = st.showPanels || new Set()).add(o.id + ':' + k);
  shownFull.set(o.id, full);
  const folded = parts.filter(([k, , , empty]) => empty && !st.showPanels?.has(o.id + ':' + k));
  const hide = (k, html) => html.replace(/^(\s*)<(div|details) class="panelbox/, `$1<$2 data-xpanel="${k}" hidden class="panelbox`);
  /* An empty panel that was opened from Add gets a × in its title that puts it back on the Add line. */
  const label = Object.fromEntries(parts.map(([k, l]) => [k, l]));
  const hideBtn = k => `<button type="button" class="icon ghost xhide" data-xhide="${k}" title="Hide this empty panel (it goes back to Add)" aria-label="Hide the empty ${label[k]} panel">×</button>`;
  const closable = (k, html) => html.replace(/(<(div|summary) class="hdr"[^>]*>)([\s\S]*?)(<\/\2>)/, (m, open, tag, inner, close) => open + inner + hideBtn(k) + close);
  /* Someone who only reads gets the empty ones named in one line instead. */
  const NONE = { links: 'links', maint: 'maintenance', photos: 'photos', software: 'software', resp: 'responsible', contracts: 'contracts' };
  const names = folded.map(([k]) => NONE[k]), list = names.length > 1 ? names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1] : names[0];
  const none = !edit && folded.length ? html`<p class="note xnone" id="xNone">No ${list} recorded.</p>` : '';
  /* The panels are markup from their modules (strings), folded by a string edit. */
  return html`${none}${edit && folded.length ? html`<div class="xadd" id="xAdd"><span class="muted">Add</span>${folded.map(([k, l]) => html`<button type="button" data-xadd="${k}">+ ${l}</button>`)}</div>` : ''}${parts.map(([k, , panel, empty]) => rawHtml(folded.some(f => f[0] === k) ? hide(k, String(panel)) : edit && empty ? closable(k, String(panel)) : String(panel)))}`;
}
/* Draws a device's page into the toolbar and the view: the Properties form (read only for someone who is not an admin),
   the panels beside it, the relations, the path to the network, timeline and history. Then wires every control on it. */
export function renderObj(o){
  /* A panel's patch cords are in its Ports table, not listed again here. */
  const rs = relsOf(o).filter(x => !(o.type === 'patch' && x.r.kind === 'patched'));
  /* Network links first, then the attached devices, each under its own heading when both are there. */
  const net = rs.filter(x => !isAttached(x.r.kind)), att = rs.filter(x => isAttached(x.r.kind)), byGroup = [...net, ...att];
  const groupHead = i => html`${net.length && att.length && i === 0 ? html`<div class="relgroup">Network</div>` : ''}${net.length && att.length && i === net.length ? html`<div class="relgroup">Attached</div>` : ''}`;
  /* Which fields show, and in what order. */
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
  /* Short by default: the fields that say what and where a device is, and the others only where they hold something;
     "Show all fields" lists the empty ones too (remembered in this browser). */
  const valOf = f => (f[0].startsWith('custom.') ? (o.custom || {})[f[0].slice(7)] : o[f[0]]);
  const emptyF = f => !KEY_FIELDS.includes(f[0]) && !(st.addPorts === o.id && ['ports', 'pfx'].includes(f[0])) && (() => { const v = valOf(f); return v === undefined || v === null || v === '' || v === 0 || (Array.isArray(v) && !v.length); })();
  const nEmpty = fields.filter(emptyF).length, allF = allFields();
  if (!allF) fields = fields.filter(f => !emptyF(f));
  const edit = isAdmin(), menuSlot = edit ? html`<span class="fm-slot" aria-hidden="true"></span>` : '';
  /* propRow gives a string of markup, marked as hidden by a string edit. */
  const row = f => {
    const h = hiddenBy(f), prop = propRow(o, f, edit ? fieldMenu(o, f, h) : '');
    return rawHtml(h ? prop.replace('<label for=', () => String(html`<label class="fm-hid" title="Hidden on ${h === 'device' ? 'this device' : 'every ' + TYPES[o.type].label}" for=`)) : prop);
  };
  const chain = pathUp(o);
  /* The way up to the network: one row per device, with the relation and its port on the line between two rows. */
  /* A panel port with a wall outlet: the outlet is a hop of its own, with its room, before the panel. */
  const outletHop = n => html`<li class="ps ps-outlet"><div class="ps-hop">${KINDS[n.via.kind].fwd}</div>
      <div class="ps-row"><span class="ps-dot" aria-hidden="true"></span><span class="ps-name ps-out">Outlet <b>${n.outlet.name}</b></span>${n.outlet.loc ? html`<span class="ps-type">${n.outlet.loc.split(' / ').pop()}</span>` : ''}</div></li>`;
  const netPath = html`<ol class="netpath">${chain.map((n, i) => html`${n.outlet ? outletHop(n) : ''}<li class="ps${i === 0 ? ' me' : ''}">
      ${i ? html`<div class="ps-hop">${n.outlet ? 'on' : KINDS[n.via.kind].fwd}${n.via.kind === 'patched' ? html` <b>${n.via.fromPort}</b> →` : ''}${n.via.port != null ? html` <b>${portLabel(n.o, n.via.port)}</b>` : ''}</div>` : ''}
      <div class="ps-row"><span class="ps-dot" aria-hidden="true"></span><button class="ps-name" data-open="${n.o.id}">${rawHtml(tico(n.o.type, 'tico sm'))}<span>${n.o.name}</span></button><span class="ps-type">${TYPES[n.o.type].short}</span>${i === 0 ? html`<span class="ps-me">this device</span>` : ''}</div></li>`)}</ol>`;
  const targets = objs.filter(x => x.id !== o.id && x.status !== 'retired');
  /* The toolbar (name, status, the More menu) and the page itself. Name, code, type and status share one text line
     (.obj-id), so their letters sit on one baseline whatever the fonts, and that line is centred in the bar. */
  const more = html`<button id="relMapBtn">Relations map</button>${edit ? html`<button id="dupBtn">Duplicate</button>` : ''}${canAddPorts(o.type) && !extraPorts && isAdmin() ? html`<button id="addPortsBtn">Add network ports…</button>` : ''}${o.uid && SERVER.on && isAdmin() ? html`<button id="sheetBtn">Entry sheet for ${o.user}…</button>` : ''}${isAdmin() && (o.excluded || o.feed || o.graph || o.inAd || o.ad || LS_ON() || SERVER.graph || SERVER.ldap) ? html`<hr class="msep">${o.excluded ? html`<button id="exclBtn">Include in sync</button>` : html`<button id="exclBtn">Exclude from sync</button><button id="exclRelBtn" title="Also the devices attached to it and the virtual machines on it">Exclude with what belongs to it</button>`}` : ''}${edit ? html`<hr class="msep"><button id="delBtn">Retire…</button><button id="purgeBtn" class="danger-text">Delete permanently…</button>` : ''}`;
  $('#toolbar').innerHTML = html`${rawHtml(tico(o.type))}<span class="obj-id"><b class="mono" id="objTitle" tabindex="-1">${o.name}</b><span class="code">${o.code}</span><span class="muted hide-n">${TYPES[o.type].label}</span>
    ${o.review ? html`<span class="chip">${o.review.merged ? 'Merged' : o.review.ignored ? 'Ignored' : 'Waiting'}</span>` : html`<span class="chip ${STATUS[o.status].cls}">${STATUS[o.status].label}</span>`}</span>${o.planPos && PLANS.some(p => p.id === o.planPos.plan) ? html`<button type="button" class="link hide-n" id="onPlanBtn" title="Open its floor plan, with the device marked">On floor plan ${PLANS.find(p => p.id === o.planPos.plan).name}</button>` : ''}<div class="grow"></div><span class="obj-save"><span class="obj-saved" id="objSaved" role="status">${o.handAt ? 'Saved ' + savedAt(o.handAt) : ''}</span><button id="saveBtn" class="primary" hidden>Save</button></span>${handBtn(o)}
    ${rawHtml(menuHtml('More', more))}`;
  $('#view').innerHTML = html`${rawHtml(reviewBanner(o))}${twinBanner(o)}<div class="obj">
    <div class="col">
      <div class="panelbox"><div class="hdr">Properties</div><div class="form props${edit ? "" : " ro"}" data-edit>${fields.map(row)}
        ${rawHtml(rackFields(o))}
        ${GRAPH_TYPES.includes(o.type) && joinCardsAvailable() ? html`<label>Directory <button type="button" class="link colhelp" data-view data-colhelp title="What the colours mean" aria-label="What the colours mean">?</button></label><div class="ctlrow">${rawHtml(joinBadges(o).replace(/class="jbar\b/, 'class="jbar jbar-page'))}<span class="fsrc-slot" aria-hidden="true"></span>${menuSlot}</div>` : ''}
        ${o.type === 'pc' || o.type === 'notebook' || (o.accessories || []).length ? html`<label>Attachments</label><div class="ctlrow entries">${rawHtml(accessoriesHtml(o))}<span class="fsrc-slot" aria-hidden="true"></span>${menuSlot}</div>` : ''}
        ${edit || o.notes ? html`<label for="objNotes">Notes</label><div class="ctlrow entries">${rawHtml(notesHtml(o, edit))}<span class="fsrc-slot" aria-hidden="true"></span>${menuSlot}</div>` : ''}
        ${nEmpty ? html`<span></span><div><button type="button" class="link fm-reveal" id="fmAll" data-view aria-expanded="${String(allF)}">${allF ? 'Show only the filled fields' : `Show all fields (${nEmpty} empty)`}</button></div>` : ''}
        ${nHidden ? html`<span></span><div><button type="button" class="link fm-reveal" id="fmReveal" data-view aria-expanded="${String(reveal)}">${reveal ? 'Hide the hidden fields' : `Show ${nHidden} hidden field${nHidden === 1 ? '' : 's'}`}</button></div>` : ''}</div></div>
      ${rawHtml(sourcesPanel(o))}
    </div>
    <div class="col">
      ${o.type === 'patch' ? patchPanel(o) : ''}
      ${extras(o)}
      <div class="panelbox"><div class="hdr">Relations <span class="cnt">${rs.length || 'none'}</span></div>
        <div class="relist" data-edit>${rs.length ? byGroup.map((x, i) => html`${groupHead(i)}<div class="relrow"><span class="k">${x.label}</span><span class="t">${rawHtml(tico(x.other.type,'tico sm'))}<a class="link" data-open="${x.other.id}">${x.other.name}</a>${x.r.kind === 'connected' && outletOf(byId(x.r.to), x.r.port) ? html`<span class="chip" title="${outletLabel({...outletOf(byId(x.r.to), x.r.port), panel: byId(x.r.to), port: x.r.port})}">Outlet ${outletOf(byId(x.r.to), x.r.port).name}</span>` : ''}${x.r.lag == null && PORT_KINDS.includes(x.r.kind) && (hasPorts(byId(x.r.to)) || byId(x.r.to).type === 'patch') ? html`${rawHtml(comboHtml(String(html`<input id="rp_${x.r.id}" class="rport mono" data-rport="${x.r.id}" data-combo="port" data-port-to="${x.r.to}" value="${x.r.port ?? ''}" placeholder="Port" aria-label="Port on ${x.other.name}: type one, or pick a free port">`), 'rp_' + x.r.id).replace('<div class="combo">', '<div class="combo rportbox">'))}<span class="rvlan">${x.r.vlan ? html`<span class="chip" title="VLAN ${vlanLabel(x.r.vlan)}">VLAN ${vlanLabel(x.r.vlan)}</span>` : ''}</span>` : html`${x.port ? html`<span class="p">${x.out ? '' : 'on '}${x.port}</span>` : ''}${x.r.vlan ? html`<span class="chip">VLAN ${vlanLabel(x.r.vlan)}</span>` : ''}`}</span><button class="icon ghost" data-delrel="${x.r.id}" title="Remove relation" aria-label="Remove relation">×</button></div>`) : html`<p class="note lempty">${isAdmin() ? 'No relations yet. Add one below.' : 'No relations.'}</p>`}</div>
        <div class="addrel"><select id="arKind" aria-label="Relation"></select>
          <select id="arTo" aria-label="Target" style="flex:1 1 120px"></select>
          ${rawHtml(comboHtml('<input id="arPort" class="mono" data-combo="port" data-port-of="arTo" placeholder="Port" aria-label="Port: type one, or pick a free port">', 'arPort').replace('<div class="combo">', '<div class="combo arport">'))}<select id="arLag" aria-label="LAG on the target" hidden></select><select id="arFromLag" aria-label="LAG on this device" hidden></select><select id="arVlan" aria-label="VLAN" style="width:150px"><option value="">No VLAN</option>${VLANS.map(v => html`<option value="${v.vid}">${v.vid} · ${v.name}</option>`)}</select><button id="arAdd">Add</button></div>${edit && anyOutlets() ? html`<div class="addrel" id="arOutletRow"><label class="muted" for="arOutlet">Or a wall outlet</label>${rawHtml(comboHtml('<input id="arOutlet" data-combo="outlet" placeholder="Outlet name, room or panel" style="flex:1">', 'arOutlet'))}</div>` : ''}<p class="note" id="arHint" role="status"></p>
      </div>
      <details class="panelbox fold" ${chain.length > 1 ? 'open' : ''}><summary class="hdr">Path to the network${chain.length > 1 ? html` <span class="cnt">${chain.length - 1} ${chain.length === 2 ? 'hop' : 'hops'}</span>` : html` <span class="cnt">none</span>`}</summary>
        ${chain.length > 1 ? netPath : html`<div class="chain"><span class="muted">This device does not hang off anything.</span></div>`}
      </details>
      ${rawHtml(timelinePanel(o))}
      ${rawHtml(historyPanel(o))}
    </div></div>`;

  /* From here on: the controls of the page are wired. */
  /* Hide: an empty panel goes back to the Add line. */
  $('#view').querySelectorAll('[data-xhide]').forEach(b => b.onclick = e => {
    e.preventDefault(); e.stopPropagation();
    if (st.showPanels) st.showPanels.delete(o.id + ':' + b.dataset.xhide);
    view();
  });
  /* Add: shows the panel (kept open while this device is open) and moves the focus into it. */
  $('#view').querySelectorAll('[data-xadd]').forEach(b => b.onclick = () => {
    const k = b.dataset.xadd, el = $('#view').querySelector(`[data-xpanel="${k}"]`); if (!el) return;
    (st.showPanels = st.showPanels || new Set()).add(o.id + ':' + k);
    /* Drawn again, so the opened panel has its × (hide) and the Add line loses its button. */
    view();
    const shown = $('#view').querySelector(`[data-xpanel="${k}"]`) || $('#view').querySelector(`[data-xhide="${k}"]`)?.closest('.panelbox');
    if (!shown) return;
    const f = shown.querySelector('input:not([type=file]):not([hidden]), select, textarea, button:not([disabled]):not(.xhide)'); if (f) f.focus();
    shown.scrollIntoView({ block: 'nearest' });
  });
  bindSoftware(o);
  bindDeviceContracts(o);
  bindDeviceResp(o);
  bindDeviceLinks(o);
  if (!o.review) bindMaint(o);
  bindPhotos(o);
  bindPatchPanel(o);
  bindTimeline(o);
  bindHistory(o);
  const objView = $('#view').querySelector('.obj');
  /* A field saves when it is left; while one is being typed in, Save shows (Enter or leaving the field do the same). */
  /* The notes box saves itself when it is left (below), so it does not show Save. */
  const dirty = e => { if (e && e.target && (e.target.id === 'objNotes' || e.target.closest('#phPanel'))) return; $('#saveBtn').hidden = false; $('#objSaved').textContent = 'Not saved yet'; $('#objSaved').classList.add('dirty'); renderStatus(); };
  objView.addEventListener('input', dirty);
  /* A field saves when it is left: the whole object is saved, without a redraw, except for a type change, which changes the fields. */
  objView.addEventListener('change', e => {
    /* "New person…": who gets the device, added to the people here and given it in one step. */
    if (e.target.dataset.k === 'user' && e.target.value === '__new'){ e.target.value = o.hotdesk ? '__hotdesk' : (o.uid || ''); newPersonModal(o); return; }
    dirty(e); if (e.target.matches('[data-k],[data-rk]')) saveObj(e.target.dataset.k === 'type' || (o.type === 'patch' && e.target.dataset.k === 'ports'));   /* a panel's port table follows its count */
  });
  /* A source tab shows its part of the Sources panel; the choice stays for the next device page. */
  objView.querySelectorAll('[data-srctab]').forEach(b => b.onclick = () => {
    const k = st.srcTab = b.dataset.srctab, box = b.closest('.srcpanel');
    box.querySelectorAll('[data-srctab]').forEach(x => { const on = x.dataset.srctab === k; x.classList.toggle('sel', on); x.setAttribute('aria-selected', String(on)); });
    box.querySelectorAll('[role=tabpanel]').forEach(x => { x.hidden = x.id !== 'srcbody-' + k; });
    box.querySelectorAll('[data-srcmeta]').forEach(x => { x.hidden = x.dataset.srcmeta !== k; });
  });
  /* Arrow keys move between the source tabs, as in any tab list. */
  objView.querySelectorAll('[data-srctab]').forEach(b => b.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = /** @type {HTMLElement[]} */ ([...b.closest('[role=tablist]').querySelectorAll('[data-srctab]')]), i = tabs.indexOf(b);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    e.preventDefault(); tabs[n].click(); tabs[n].focus();
  }));
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
  /* The Add relation row: kind, target, port or LAG, VLAN. */
  const portHint = () => {
    const to = $('#arTo').value ? byId($('#arTo').value) : null;
    $('#arHint').textContent = to && hasPorts(to) && !(to.ports > 0) ? `${to.name} has no port count yet. Set its ports in its details, so the port can be checked.` : '';
  };
  /* The relation kind decides which objects are offered as targets: a monitor attaches to a PC, a device connects to a switch or a patch panel. */
  const fitTargets = () => {
    const k = $('#arKind').value;
    $('#arTo').innerHTML = html`<option value="">Choose a device…</option>${targets.filter(t => !kindProblem(k, o, t)).map(t => html`<option value="${t.id}">${t.name} (${TYPES[t.type].short})</option>`)}`;
    /* The field is narrow: the placeholder is short, and the patch panel hint is in its tooltip. */
    $('#arPort').placeholder = k === 'connected' || k === 'uplink' ? 'Port' : 'Port (opt.)';
    $('#arPort').title = k === 'connected' ? 'Port number, or P04 for a port on a patch panel. The arrow lists the free ports.' : '';
  };
  /* Only the kinds that fit this device (relations.js): a printer is not offered "runs on", a VM not "connected to". */
  const kinds = Object.entries(KINDS).filter(([k]) => k !== 'patched' && targets.some(t => !kindProblem(k, o, t)));
  $('#arKind').innerHTML = html`${kinds.map(([k,v]) => html`<option value="${k}" title="${KIND_HINTS[k]}">${v.fwd[0].toUpperCase() + v.fwd.slice(1)}</option>`)}`;
  /* The dropdown shows what the chosen kind means, so the hint follows the choice. */
  const kindHint = () => { $('#arKind').title = KIND_HINTS[$('#arKind').value] || ''; };
  const kind0 = linkKind(o, null);
  if (kinds.length) $('#arKind').value = kinds.some(([k]) => k === kind0) ? kind0 : kinds[0][0];
  fitTargets(); kindHint();
  $('#arKind').onchange = () => { fitTargets(); kindHint(); portHint(); lagRow(); const row = $('#arOutletRow'); if (row) row.hidden = $('#arKind').value !== 'connected'; };
  /* An outlet picked by name plugs into the panel port behind it. */
  const outIn = $('#arOutlet');
  if (outIn){
    $('#arOutletRow').hidden = $('#arKind').value !== 'connected';
    const pick = () => {
      const x = findOutlet(objs, outIn.value); if (!x) return;
      $('#arTo').value = x.panel.id; $('#arPort').value = x.port; portHint(); lagRow();
      $('#arHint').textContent = outletLabel(x) + (x.loc ? ' · ' + x.loc : '');
    };
    outIn.addEventListener('combopick', pick); outIn.addEventListener('change', pick);
  }
  $('#arTo').onchange = () => { portHint(); lagRow(); };
  /* A LAG is chosen on both devices when the target has LAGs; the single port is then not used. */
  const lagRow = () => {
    const to = $('#arTo').value ? byId($('#arTo').value) : null;
    const lags = to ? (to.portGroups || []).filter(g => g.lag) : [];
    const own = (o.portGroups || []).filter(g => g.lag);
    const size = g => `${g.to - g.from + 1} ports`;
    /* The choice is kept while the list is rebuilt, for example when the target changes. */
    const picked = $('#arLag').hidden ? '' : $('#arLag').value;
    $('#arLag').innerHTML = html`<option value="">Single port</option>${lags.map(g => html`<option value="${g.name}">${g.name} · ${size(g)}</option>`)}`;
    if (lags.some(g => g.name === picked)) $('#arLag').value = picked;
    $('#arFromLag').innerHTML = html`${own.map(g => html`<option value="${g.name}">${g.name} · ${size(g)}</option>`)}`;
    $('#arLag').hidden = !lags.length;
    const usingLag = lags.length > 0 && !!$('#arLag').value;
    $('#arFromLag').hidden = !usingLag; /** @type {HTMLElement} */ ($('#arPort').closest('.combo')).hidden = usingLag;
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
    let port = portValue(to, $('#arPort').value);
    const inLag = (to.portGroups || []).find(g => g.lag && typeof port === 'number' && port >= g.from && port <= g.to);
    if (inLag){ toast(`Port ${port} is part of the LAG ${inLag.name}. Choose the LAG instead.`); return; }
    if (portRangeError(to, port)){ toast(portRangeError(to, port)); return; }
    const k = $('#arKind').value;
    /* The same rule as everywhere: the types fit, and a monitor or VM has one host that is not attached itself. */
    { const why = relationProblem(k, o, to, rels); if (why){ toast(why); return; } }
    const finalPort = port === '' || !PORT_KINDS.includes(k) ? null : (to.type === 'patch' ? patchPort(port) : port);
    /* A retired device's hold on the port is let go only once the relation is sure to be added on it. */
    if (hasPorts(to) && typeof port === 'number' && PORT_KINDS.includes(k)) releaseRetiredPort(to, port);
    if (hasPorts(to) && typeof finalPort === 'number' && rels.some(r => r.to === to.id && r.port === port)){ toast(pfxOf(to) + port + ' on ' + to.name + ' is already taken. Pick a free port.'); return; }
    if (to.type === 'patch' && finalPort != null && rels.some(r => r.to === to.id && r.port === patchPort(port))){ toast(patchPort(port) + ' on ' + to.name + ' is already taken.'); return; }
    if (rels.some(r => r.from === o.id && r.to === to.id && r.kind === k && String(r.port) === String(finalPort))){ toast('That relation already exists.'); return; }
    if (finalPort != null && rels.some(r => r.to === to.id && String(r.port) === String(finalPort) && (hasPorts(to) || to.type === 'patch'))){ toast(`${finalPort} on ${to.name} is already taken.`); return; }
    rels.push({id:'r'+rid(), from:o.id, to:to.id, kind:k, port:finalPort, vlan: $('#arVlan').value ? +$('#arVlan').value : null});
    hist(o, now(), `Relation "${KINDS[k].fwd} ${to.name}" added by ${who()}`);
    toast('Relation added'); render();
  };
  $('#view').querySelectorAll('[data-delrel]').forEach(b => b.onclick = () => { const i = rels.findIndex(r => r.id === b.dataset.delrel); rels.splice(i, 1); toast('Relation removed'); render(); });
  /* A value picked from a list (a port, a model, a supplier) is saved at once, as a typed one is when the box is left. */
  $('#view').querySelectorAll('[data-rport],.combo>input[data-k],.combo>input[data-rk]').forEach(i => i.addEventListener('combopick', () => i.dispatchEvent(new Event('change', {bubbles: true}))));
  $('#view').querySelectorAll('[data-rport]').forEach(i => i.onchange = () => {
    const r = rels.find(x => x.id === i.dataset.rport); if (!r) return;
    const to = byId(r.to);
    if (!i.value.trim()){ toast('A connection to this device needs a port.'); render(); return; }
    const p = portValue(to, i.value);
    /* The same checks as adding the relation: a port the device has, not inside a LAG, and free. */
    if (portRangeError(to, p)){ toast(portRangeError(to, p)); render(); return; }
    const inLag = (to.portGroups || []).find(g => g.lag && typeof p === 'number' && p >= g.from && p <= g.to);
    if (inLag){ toast(`Port ${p} is part of the LAG ${inLag.name}. Link the LAG instead.`); render(); return; }
    if (rels.some(x => x !== r && x.to === to.id && String(x.port) === String(p) && !(byId(x.from) && byId(x.from).status === 'retired'))){ toast(`${p} on ${to.name} is already taken.`); render(); return; }
    releaseRetiredPort(to, p);
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
  /* The notes are saved when the box is left, with a line in the history. */
  const nb = $('#objNotes');
  if (nb && !nb.readOnly) nb.onchange = () => {
    const v = nb.value.replace(/\s+$/, '').slice(0, 20000);
    if (v === (o.notes || '')) return;
    if (v) o.notes = v; else delete o.notes;
    hist(o, now(), `Notes ${v ? 'changed' : 'cleared'} by ${who()}`); queueServerSave(); toast('Notes saved');
  };
  const accAdd = $('#accAdd');
  if (accAdd) accAdd.onclick = () => {
    const name = $('#accName').value.trim(), kind = $('#accKind').value.trim(), serial = $('#accSerial').value.trim();
    if (!name){ toast('Give the attachment a name.'); return; }
    if ((o.accessories || []).length >= 100){ toast('A device holds up to 100 attachments.'); return; }
    o.accessories = [...(o.accessories || []), {name, ...(kind ? {kind} : {}), ...(serial ? {serial} : {})}];
    hist(o, now(), `Attachment added: ${name} by ${who()}`); queueServerSave(); render();
  };
  /* A docking station merged in goes with its merged record: it no longer belongs to this device and leaves Merged
     records, but stays ignored, so no sync brings it back (Unmerge instead puts it back in To review). Undo takes both back. */
  $('#view').querySelectorAll('[data-delacc]').forEach(b => b.onclick = () => {
    const a = o.accessories[+b.dataset.delacc];
    const rec = a.seenAs && REVIEW.find(x => x.review && x.review.merged === o.id && String(x.name).toLowerCase() === String(a.seenAs).toLowerCase());
    const before = { accs: o.accessories, review: rec && rec.review };
    o.accessories = o.accessories.filter((_, i) => i !== +b.dataset.delacc);
    if (!o.accessories.length) delete o.accessories;
    hist(o, now(), `Attachment removed: ${a.name}${rec ? ` (merged record ${rec.name})` : ''} by ${who()}`);
    if (rec){
      const rest = { ...rec.review }; delete rest.merged; rec.review = rest;
      hist(rec, now(), `No longer merged into ${o.name}: its attachment was removed by ${who()}; still ignored`);
    }
    queueServerSave(); render();
    toastUndo(`${a.name} removed${rec ? `; ${rec.name} is no longer a merged record` : ''}`, () => {
      if (before.accs) o.accessories = before.accs; if (rec) rec.review = before.review;
      queueServerSave(); render();
    });
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
    /* As in the Ports tab: connections and port groups (LAGs) above the new count block it. */
    if (pEl && sEl && hasPorts(o)){
      const err = portSetupError(o, +pEl.value || 0, +sEl.value || 0);
      if (err){ toast(err); pEl.value = o.ports || 0; sEl.value = o.sfp || 0; return false; }
    }
    /* A new type must fit the cabling: outlets and cords start on a patch panel, cords end on a switch, router or firewall
       port, and ports numbered on one kind of device mean nothing on the other (P05 on a panel, 5 on a switch). */
    if (typeEl && typeEl.value !== o.type){
      const nt = {...o, type: typeEl.value};
      const panelNow = o.type === 'patch', panelNext = nt.type === 'patch';
      const why = panelNow && !panelNext && (Object.keys(o.outlets || {}).length || rels.some(r => r.from === o.id && r.kind === 'patched')) ? 'its wall outlets and patch cords'
        : rels.some(r => r.to === o.id && r.kind === 'patched') && !cordTarget(nt) ? 'the patch cords that end on it'
        : panelNow !== panelNext && rels.some(r => r.to === o.id && r.port != null && r.kind !== 'patched') ? 'the devices plugged into its ports'
        : '';
      if (why){ toast(`${o.name} cannot become a ${(TYPES[nt.type] || {}).label || nt.type} with ${why}. Remove them first.`); typeEl.value = o.type; return false; }
      /* Its attachments, VMs and connections must still make sense: a server with VMs stays a server, a monitor on a PC
         does not become a PC on a PC. */
      const misfit = rels.find(r => r.kind !== 'patched' && (r.from === o.id ? kindProblem(r.kind, nt, byId(r.to) || {}) : r.to === o.id && byId(r.from) ? kindProblem(r.kind, byId(r.from), nt) : ''));
      if (misfit){ const other = byId(misfit.from === o.id ? misfit.to : misfit.from); toast(`${o.name} cannot become a ${(TYPES[nt.type] || {}).label || nt.type}: it ${misfit.from === o.id ? KINDS[misfit.kind].fwd : KINDS[misfit.kind].rev} ${other ? other.name : 'another device'}. Remove that relation first.`); typeEl.value = o.type; return false; }
    }
    /* Retired picked in the Status field: the Retire dialog decides, as from More → Retire (the user, ports, plan and
       contracts it frees, and Undo). The field shows the status as it is until then. */
    const stEl = /** @type {HTMLSelectElement|null} */ ($('#view').querySelector('[data-k="status"]'));
    if (stEl && stEl.value === 'retired' && o.status !== 'retired'){ stEl.value = o.status; retireModal(o); return false; }
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
    /* A device that becomes a rack, or a type that does not go in a rack, leaves the rack it is in. */
    if (typeEl && typeEl.value !== o.type && o.rack && (typeEl.value === 'rack' || !RACKABLE.includes(typeEl.value))) place = {};
    /* A rack cannot be lower than the devices in it, and is 1 to 60 U high, as a new rack. */
    const unitsEl = /** @type {HTMLInputElement|null} */ ($('#view').querySelector('[data-k="units"]'));
    if (unitsEl && o.type === 'rack'){
      const n = Number(unitsEl.value), top = rackTopUsed(o.id);
      if (!Number.isInteger(n) || n < 1 || n > 60){ toast('A rack is 1 to 60 U high, in whole units.'); unitsEl.value = String(rackUnits(o)); return false; }
      if (n < top){ toast(`U${top} is in use: move the devices above U${n} first.`); unitsEl.value = String(rackUnits(o)); return false; }
    }
    const kept = [], edits = [];
    /* The device as it was, for the Undo in the toast. */
    const before = snapshot([o]);
    const statusWas = o.status, uidWas = o.uid || null, hotWas = !!o.hotdesk, userWas = o.user;
    $('#view').querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k; let v = dateValue(el);
      if (k.startsWith('custom.')){
        const was = (o.custom || {})[k.slice(7)], nv = v === '' ? null : (el.type === 'number' ? +v : v);
        if (String(was ?? '') !== String(nv ?? '')) edits.push([k, was, nv]);
        o.custom = {...(o.custom || {}), [k.slice(7)]: nv}; return;
      }
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
      if (k === 'price'){ const t = num(v); if (t === undefined){ if (v.trim() !== '') toast('The price is a number up to 1 000 000 000, e.g. 1290 or 99.50.'); else if (o.price !== undefined) edits.push([k, o.price, undefined]); delete o.price; return; } v = t; }
      if (k === 'ports') st.addPorts = null;   /* from now on the saved count decides whether the port fields show */
      if (k === 'units') v = +v;
      if (k === 'type' && o.type !== v && TYPES[v]){
        hist(o, now(), `Type changed from ${TYPES[o.type] ? TYPES[o.type].label : o.type} to ${TYPES[v].label} by ${who()}`);
        pickHand(o, 'type');   /* set by hand: the type rules leave it alone */
        /* A device that becomes a switch gets the port counts a new switch has, where it has none yet. */
        if (v === 'switch'){ o.ports ??= 24; o.sfp ??= 4; }
      }
      if (k === 'ports' && o.type === 'patch' && v < (o.ports || 0)){
        const top = Math.max(0, ...Object.keys(o.outlets || {}).map(panelPortNo), ...rels.filter(r => (r.kind === 'patched' && r.from === o.id) || r.to === o.id).map(r => panelPortNo(r.kind === 'patched' ? r.fromPort : r.port)));
        if (v < top){ toast(`Port P${String(top).padStart(2, '0')} is in use. Move or remove what is on the ports above ${v} first.`); v = o.ports; }
      }
      if (k === 'ports' && hasPorts(o) && v < (o.ports || 0) && rels.some(r => r.to === o.id && typeof r.port === 'number' && r.port > v)){ toast(`Ports in use above ${v} block this change. Move or remove those connections first.`); v = o.ports; }
      /* A value changed by hand on a device a sync fills in is kept from then on: Lansweeper's, or Graph's for one added
         from Graph; it is noted as set by hand, and cleared, it stays empty: no sync fills it again. */
      if (setByHand(o, k, v)) kept.push(FIELD_LABEL[k]);
      /* Each changed field gets its own line in the history, with both values, so it can be set back from there. */
      if (k !== 'type' && (['ports','sfp'].includes(k) ? (+o[k] || 0) !== v : String(o[k] ?? '') !== String(v ?? ''))) edits.push([k, o[k], v]);
      o[k] = v;
      /* The mark beside the field follows at once: the page is not drawn again for one field. */
      const fld = document.getElementById(`f_${o.id}_${k}`), mk = fld && fld.closest('.ctlrow') && fld.closest('.ctlrow').querySelector(':scope > .fsrc, :scope > .fsrc-slot');
      /* Updated in place, not swapped: the field is saved while Tab is moving the focus to this very mark, and a new
         element there would leave the keyboard nowhere (the page). */
      if (mk){ const t = document.createElement('template'); t.innerHTML = sourceMark(o, k); const nk = t.content.firstElementChild;
        if (nk && nk.tagName === mk.tagName){ for (const a of [...mk.attributes]) if (!nk.hasAttribute(a.name)) mk.removeAttribute(a.name); for (const a of [...nk.attributes]) mk.setAttribute(a.name, a.value); mk.innerHTML = nk.innerHTML; }
        else if (nk) mk.replaceWith(nk); }
    });
    if (place){
      const prevRack = o.rack;
      delete o.rack; delete o.u; delete o.h; delete o.ontop;
      Object.assign(o, place);
      followOnTop(o, prevRack);
      if (place.ontop) delete o.u;
      if (prevRack && !o.rack) hist(o, now(), `Taken out of the rack by ${who()}`);
      if (o.rack && o.rack !== prevRack) rackLocFollow(byId(o.rack));
    }
    /* A rack moved to another place takes its devices with it. */
    if (o.type === 'rack' && edits.some(e => e[0] === 'loc')) rackLocFollow(o);
    /* Status and user go together: a device taken into stock has nobody (the person goes, with Undo); one given to
       somebody while in stock is in use from now on. */
    if ((o.uid || null) !== uidWas || !!o.hotdesk !== hotWas) edits.push(['user', hotWas ? 'Hot desk' : userWas, o.hotdesk ? 'Hot desk' : o.user]);
    let followUp = null;
    if (o.status === 'stock' && statusWas !== 'stock' && (uidWas || hotWas) && (o.uid || null) === uidWas && !!o.hotdesk === hotWas){
      o.uid = null; delete o.hotdesk;
      hist(o, now(), `${userWas || 'Hot desk'} no longer has it: taken into stock by ${who()}`);
      followUp = `In stock: ${userWas || 'Hot desk'} no longer has it`;
      rerender = true;
    } else if (statusWas === 'stock' && o.status === 'stock' && (o.uid || o.hotdesk) && !(uidWas || hotWas)){
      o.status = 'active';
      hist(o, now(), `In use from now on: given to ${o.user} by ${who()}`);
      followUp = `In use now, by ${o.user}`;
      rerender = true;
    }
    /* A new status shows in the header, the sidebar counts and the actions (Take back, Hand out) at once. */
    if (o.status !== statusWas) rerender = true;
    if (o.type === 'server' && o.kind === 'vm') delete o.rack, delete o.u, delete o.h, delete o.ontop;
    /* A model typed here is kept in the list, so the other devices can choose it. */
    if (o.model && o.model !== '\u2014' && !MODELS.includes(o.model)) MODELS.push(o.model);
    o.handAt = new Date().toISOString();
    /* As the fields show them: a status by its name, a day as dd.mm.yyyy. */
    const shownValue = (k, v) => k === 'status' && STATUS[v] ? STATUS[v].label : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? dayText(v) : v;
    const labelOf = k => (fields.find(f => f[0] === k) || [])[1] || FIELD_LABEL[k] || k;
    for (const [k, a, b] of edits) hist(o, now(), editText(labelOf(k), shownValue(k, a), shownValue(k, b)) + ' by ' + who() + (kept.includes(FIELD_LABEL[k]) ? ' · kept from the syncs' : ''), fieldNote(k, a, b));
    if (!edits.length) hist(o, now(), 'Saved by ' + who() + (kept.length ? ' · kept from feed: ' + kept.join(', ') : ''));
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
    /* What changed, with Undo: one field by its values, several by their count. */
    const what = edits.length === 1 ? ` · ${labelOf(edits[0][0])}: ${shownValue(edits[0][0], edits[0][1]) || 'empty'} → ${shownValue(edits[0][0], edits[0][2]) || 'empty'}` : edits.length > 1 ? ` · ${edits.length} fields changed` : '';
    /* What else changed with it (the user taken off, or the status) is said in the same message: its Undo puts all of it back. */
    const msg = 'Saved ' + o.name + what + (followUp ? '. ' + followUp : '') + keptMsg + (warns.length ? '. Check: ' + warns.join('; ') : '');
    if (edits.length || followUp) toastUndo(msg, () => { restoreSnapshot(before, `Change undone by ${who()}`); queueServerSave(); render(); });
    else toast(msg);
    queueServerSave();
    /* A new person: the page is drawn again, so More offers the entry sheet for them. */
    if ((o.uid || null) !== uidWas) rerender = true;
    if (rerender) render(); else {
      refreshHistory(o);
      $('#saveBtn').hidden = true; $('#objSaved').textContent = 'Saved ' + savedAt(o.handAt); $('#objSaved').classList.remove('dirty'); renderStatus();
      /* A new model is in the list now: its "added when saved" note goes. */
      $$('#view input[data-combo]:not([data-combo=ip])').forEach(comboNote);
    }
    return true;
  };
  $('#saveBtn').onclick = () => saveObj();
  /* An AD group on the device: the devices in that group, in the table. */
  objView.querySelectorAll('[data-adg]').forEach(b => b.onclick = () => { st.adGroup = b.dataset.adg; st.tab = 'table'; render(); });
  const fmReveal = $('#fmReveal');
  if (fmReveal) fmReveal.onclick = () => { st.showHidden = st.showHidden === o.id ? null : o.id; render(); };
  const fmAll = $('#fmAll'); if (fmAll) fmAll.onclick = () => { setAllFields(!allFields()); render(); const b = $('#fmAll'); if (b) b.focus(); };
  /* The ⋯ menu of a field: hide or show it here or on the type, clear it, or delete a field of the type. */
  objView.querySelectorAll('[data-fm]').forEach(b => b.onclick = () => {
    const k = b.dataset.fk, act = b.dataset.fm, t = TYPES[o.type].label;
    const f = fields.find(x => x[0] === k), name = f ? f[1] : k;
    b.closest('.menubox').hidePopover();
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
      modal(html`<div class="mh">Clear ${name}?</div>
        <div class="mb"><p class="note">The value of ${name} on ${o.name} is removed. The history keeps a note.${fromFeed ? ' No source fills it in again; pick Back to automatic at its source mark to let them.' : ''}</p></div>
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
      modal(html`<div class="mh">Delete the field ${name}?</div>
        <div class="mb"><p class="note">${name} is removed from every ${t}.${n ? ` ${n} ${n === 1 ? 'device has' : 'devices have'} a value; the values are kept, and adding a field of the same name brings them back.` : ''}</p></div>
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
  const ch = $('#view').querySelector('[data-colhelp]'); if (ch) ch.onclick = coloursModal;
  /* The More menu's actions and the banners' buttons. */
  const dup = $('#dupBtn'); if (dup) dup.onclick = () => newObjModal({copy: o});
  $('#relMapBtn').onclick = () => { st.mapFocus = o.id; st.tab = 'map'; render(); };
  const ho = $('#handOutBtn'); if (ho) ho.onclick = () => handOutModal([o.id]);
  const tb = $('#takeBackBtn'); if (tb) tb.onclick = () => takeBackModal([o]);
  /* Handing a device over: the entry sheet of the person who has it (their devices and a first password), from here. */
  const opb = $('#onPlanBtn'); if (opb) opb.onclick = () => showOnPlan(o);
  const sb = $('#sheetBtn'); if (sb) sb.onclick = () => { const u = personById(o.uid); if (u) sheetModal(u, null, { only: o.id }); };
  const ap = $('#addPortsBtn');
  if (ap) ap.onclick = () => { st.addPorts = o.id; render(); const f = $('#view').querySelector('[data-k="ports"]'); if (f){ f.focus(); f.select(); } };
  /* A gateway that is not its subnet's: Use clears it, so the device takes the subnet's gateway. Kept by hand from then on. */
  const gw = /** @type {HTMLInputElement|null} */ ($('#view').querySelector('input[data-k="gateway"]')), gwFix = $('#view').querySelector('.gwfix');
  if (gwFix) { if (!gw || gw.disabled || gw.readOnly) gwFix.remove(); else /** @type {HTMLElement} */ (gwFix).onclick = () => { gw.value = ''; saveObj(true); }; }
  const del = $('#delBtn'); if (del) del.onclick = () => retireModal(o);
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
    /* What belongs to it: the devices attached to it and the VMs on it. Not the switch it is plugged into or the server
       it runs on: excluding one PC must not take the network or the host out of the sync. */
    rels.forEach(r => {
      const other = r.to === o.id && HOST_KINDS.includes(r.kind) ? byId(r.from) : null;
      if (other && !other.excluded){ other.excluded = true; hist(other, now(), 'Excluded from Lansweeper sync with ' + o.name + ' by ' + who()); n++; }
    });
    toast(o.name + (n ? ' and ' + n + ' device' + (n === 1 ? '' : 's') + ' attached to it or running on it' : '') + (n ? ' are' : ' is') + ' excluded from the sync'); render();
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
export const policyGrid = () => String(html`<div class="pgrid">${Object.keys(FIELD_LABEL).map(k => html`<label class="pchk"><input type="checkbox" data-pol="${k}" ${st.policy[k]?'checked':''}> ${FIELD_LABEL[k]}</label>`)}</div>
  <div class="pgrid pgrid-extra">${Object.keys(FEED_EXTRA).map(k => html`<label class="pchk" title="${FEED_EXTRA_HINT[k]}"><input type="checkbox" data-pol="${k}" ${st.policy[k] !== false ?'checked':''}> ${FEED_EXTRA[k]}</label>`)}</div>`);
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

export * from './views-rack.js';
export * from './views-software.js';
