import { intakeRowHtml, bindIntakeRows } from './15-review.js';
import { renderSetSources } from './settings-sources.js';
import { renderSetMaint, renderSetLog } from './settings-maint.js';
import { renderSetUsers, renderSetCompany } from './settings-users.js';
import { renderSetTypes } from './settings-types.js';
import { renderSetGraph } from './settings-graph.js';
import { renderSetLdap } from './settings-ldap.js';
import { renderLsToggle, renderSetFeed, renderTypeMap, renderTypeRules, renderSetModels } from './settings-feed.js';
import { renderSetLocs, renderSetVlans, renderSetSubnets, resetSubnetEdit } from './settings-network.js';
import { collapsedPanels, rememberPanel, bindPolicy, policyGrid, followOnTop } from './03-object-modals.js';
import { setSettingsOpener, closeModal, modal } from './19-modal.js';
import { $, LS_ON, TYPES, fullTextTooltips, byId, esc, hist, now, objs, rackUnits, racksList, st, toast } from './01-core.js';
import { loadVersion, queueServerSave, render } from './07-render.js';
/* Settings is one module per tab (settings-*.js); what they offer is also offered here, where the rest of the page has
   always found it. */
export * from './settings-feed.js';
export * from './settings-graph.js';
export * from './settings-users.js';
export * from './settings-maint.js';
export * from './settings-ldap.js';
export * from './settings-network.js';
export * from './settings-types.js';
/* ---------- settings ---------- */
/* ---------- settings: tabs, as in NOBS SQL ---------- */
export const SET_TABS = [['feed','Lansweeper'],['directory','Active Directory'],['entra','Entra & Intune'],['sources','Data sources'],['locations','Locations'],['vlans','Network'],['types','Object types'],['users','Users'],['maintenance','Maintenance'],['log','Log'],['about','About']];
export function openSettings(){
  /* A dialog opened from here brings Settings back when it closes. */
  setSettingsOpener(openSettings);
  resetSubnetEdit();
  modal(`<div class="mh">Settings</div>
    <div class="settabs" id="setTabs">${SET_TABS.map(([k,l]) => `<button class="tab" data-st="${k}">${l}</button>`).join('')}</div>
    <div class="mb" id="setPane"></div>
    <div class="mf"><span style="margin-right:auto"></span><button id="setClose" class="primary">Done</button></div>`, 'settings');
  $('#setTabs').addEventListener('click', e => { const t = e.target.closest('[data-st]'); if (!t) return; st.setTab = t.dataset.st; renderSetPane(); $('#setPane').scrollTop = 0; });
  collapsibleSections($('#setPane'), 'set:');
  $('#setClose').onclick = closeModal;
  renderSetPane();
}
/* Every section of Settings opens and closes by its title, and stays as it was left (kept in this browser by its title).
   The sections draw themselves again often, so the state is put back on each new title as it appears. */
export function collapsibleSections(root, prefix){
  const keyOf = h => prefix + (h.childNodes[0] ? h.childNodes[0].textContent : h.textContent).trim();
  const apply = () => root.querySelectorAll('.panelbox > .hdr:not(.sechdr)').forEach(h => {
    if (h.parentNode.parentElement.closest('.panelbox')) return;   /* a box inside a section opens with it */
    h.classList.add('sechdr'); h.setAttribute('role', 'button'); h.tabIndex = 0;
    const closed = !!collapsedPanels()[keyOf(h)];
    h.parentNode.classList.toggle('collapsed', closed); h.setAttribute('aria-expanded', String(!closed));
  });
  const toggle = h => { const c = h.parentNode.classList.toggle('collapsed'); h.setAttribute('aria-expanded', String(!c)); rememberPanel(keyOf(h), c); };
  root.addEventListener('click', e => { const h = e.target.closest('.panelbox > .hdr.sechdr'); if (h && !e.target.closest('button,input,select,a,label')) toggle(h); });
  root.addEventListener('keydown', e => { const h = e.target.closest('.panelbox > .hdr.sechdr'); if (h && e.target === h && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); toggle(h); } });
  new MutationObserver(apply).observe(root, {childList: true, subtree: true});
  apply();
}
export function renderSetPane(){
  document.querySelectorAll('#setTabs [data-st]').forEach(b => b.classList.toggle('active', b.dataset.st === st.setTab));
  const pane = $('#setPane');
  const policyPane = `<div class="panelbox"><div class="hdr">Feed may overwrite</div>${policyGrid()}<p class="note" style="padding:10px 12px">Default for every object. Each object can override it on its own page. Name and serial number are match keys and are never overwritten.</p>${intakeRowHtml('lansweeper')}<div class="lpanel-add"><label class="pchk" style="width:auto"><input type="checkbox" id="skipIp" ${st.skipIpOnly ? 'checked' : ''} ${canEdit() ? '' : 'disabled'}> Devices named only by an IP address (no serial number) always wait in To review</label></div><div class="lpanel-add"><label class="pchk" style="width:auto" title="A record with a DNS name and no serial number (nb-35.corp.example) when a device named by its first part (NB-35) is here: a docking station's or a USB network adapter's"><input type="checkbox" id="mergeTwins" ${st.mergeTwins ? 'checked' : ''} ${canEdit() ? '' : 'disabled'}> Merge docking-station records into their device (adds the address as an adapter instead of waiting in To review)</label></div></div>`;
  const html = {
    feed: '<div id="setLsToggle"></div><div id="setFeed"></div>' + (LS_ON() ? policyPane : '') + '<div id="setTypeMap"></div><div id="setTypeRules"></div>',
    directory: '<div id="setLdap"></div>',
    entra: '<div id="setGraph"></div>',
    sources: '<div id="setSources"></div>',
    locations: '<div id="setLocs"></div>',
    vlans: '<div class="panelbox"><div class="hdr">VLANs <span class="cnt" id="vlCnt"></span></div><div id="setVlans"></div></div><div class="panelbox" id="setSubnets"></div><div class="panelbox" id="setDomains"></div>',
    types: '<div class="panelbox"><div class="hdr">Object types</div><div id="setTypes"></div></div><div id="setTypeFields"></div><div class="panelbox" id="setModels"></div>',
    users: '<div id="setUsers"></div><div id="setCompany"></div>',
    maintenance: '<div id="setMaint"></div>',
    log: '<div id="setLog"></div>',
    about: '<div id="setAbout"></div>'
  }[st.setTab];
  pane.innerHTML = html;
  bindPolicy(pane);
  const skip = $('#skipIp'); if (skip) skip.onchange = () => { st.skipIpOnly = skip.checked; queueServerSave(); };
  const mt = $('#mergeTwins'); if (mt) mt.onchange = () => { st.mergeTwins = mt.checked; queueServerSave(); };
  bindIntakeRows(document);
  fullTextTooltips(pane);
  ({feed: () => { renderLsToggle(); renderSetFeed(); renderTypeMap(); renderTypeRules(); }, directory: renderSetLdap, entra: renderSetGraph, sources: renderSetSources, locations: renderSetLocs, vlans: () => { renderSetVlans(); renderSetSubnets(); }, types: () => { renderSetTypes(); renderSetModels(); }, users: () => { renderSetUsers(); renderSetCompany(); }, maintenance: renderSetMaint, log: renderSetLog, about: renderSetAbout})[st.setTab]();
  applyRole();
}

/* About, as in NOBS SQL Editor: the version comes from the server, the licence text is the same. */
export async function renderSetAbout(){
  const version = await loadVersion();
  if (!$('#setAbout')) return;   /* Settings was closed while the version was loading */
  $('#setAbout').innerHTML = `<div class="panelbox" style="padding:12px 14px">
    <div class="muted" style="font-size:12px;line-height:1.6">
      <div class="brandmark" style="margin-bottom:8px;color:var(--fg)"><img src="logo.svg" alt=""><div><b>NOBS</b> <span>Inventory</span></div></div>
      Version ${esc(version || 'unknown')}<br>
      An inventory of PCs, servers, phones, switches and other devices, with their relations.<br>
      <i>No BS, just inventory.</i><br>
      Copyright &copy; 2026 Viktor Ljuca
    </div>
    <div class="hdr" style="margin:14px -14px 8px">License</div>
    <div class="muted" style="font-size:12px;line-height:1.6">
      This program is free software: you may redistribute and/or modify it under the terms of the
      <b>GNU General Public License version 3</b>, or (at your option) any later version.<br>
      It is distributed in the hope that it will be useful, but <b>WITHOUT ANY WARRANTY</b> - without
      even the implied warranty of merchantability or fitness for a particular purpose. See the
      GNU General Public License for details.
    </div>
    <div class="hdr" style="margin:14px -14px 8px">Links</div>
    <div style="display:grid;grid-template-columns:70px 1fr;gap:2px 12px;font-size:13px;line-height:1.7;overflow-wrap:anywhere">
      ${[['Website', 'https://monsama.ch'], ['Source', 'https://github.com/monsama/nobs-inventory'], ['License', 'https://www.gnu.org/licenses/gpl-3.0.html']].map(([k, u]) => `<span class="muted">${k}</span><a class="link" href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`).join('')}
    </div>
    <div style="margin-top:12px"><a class="btnlike" href="https://buymeacoffee.com/monsama" target="_blank" rel="noopener noreferrer" title="If NOBS Inventory saves you some time"><svg class="i" viewBox="0 0 24 24"><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3v3M12 3v3"/></svg>Buy me a coffee</a></div>
    <div class="hdr" style="margin:14px -14px 8px">Third party</div>
    <div class="muted" style="font-size:13px;line-height:1.6">
      Built with Node.js, Express and ldapjs. Each keeps its own licence.
    </div>
  </div>`;
}

/* ---------- users: people who have devices. Manual users are kept; LDAP users are kept in step with the directory. ---------- */
export let USERS = [];
export const setUsers = v => { USERS = v; };
export const devicesOf = name => objs.filter(o => o.user === name).length;
export const me = () => USERS.find(u => u.id === st.meId);
/* The name the history records for the signed-in person. */
export const who = () => (me() && me().name) || 'someone';
export const canEdit = () => !USERS.length || (!!me() && me().role === 'admin');
export const roleLabel = u => u.role === 'admin' ? 'Admin' : u.role === 'none' ? 'No access' : 'Viewer';
/* Viewers: controls in the page are disabled, navigation stays. */
export const RO_KEEP = /Cancel|Close|Back|^setTab|^setClose$/;
export const RO_NAV = '.wctl button,.tray-chip button,button[data-adg],button.ov-tile,button.ov-row,button.ov-bar,button[data-open],button[data-devs],button.sw-tg,button[data-person],button[data-loc],button[data-st],button[data-tab],button[data-close],button.item,button.tab,button.card,button.port,button.node,button.link,a';
/* Looking, not changing: searches, view switches and zoom. Settings → Object types: tfType picks whose fields are shown. */
export const RO_INPUT_OK = /^(search|ctQ|mapFind|mapFocus|mapOnly|mapLabels|cardJoin|cnQ|cnKind|mapAttached|grp|portsDevice|rkSel|swQ|swCollapse|plSel|plQ|plZoomIn|plZoomOut|plZoomReset|tfType|rkOpen)$/;
export function applyRole(){
  const ro = !canEdit();
  document.body.classList.toggle('readonly', ro);
  $('#newBtn').disabled = ro; $('#linkBtn').disabled = ro;
  $('#whoBtn').textContent = me() ? me().name + ' · ' + roleLabel(me()) : (USERS.length ? 'Signed out · read only' : 'No users yet');
  $('#signOutBtn').hidden = !me();
  ['#view', '#toolbar', '#modalHost'].forEach(sel => $(sel).querySelectorAll('button, input, select, textarea').forEach(el => {
    if (!ro){ if (el.dataset.roLocked){ el.disabled = false; delete el.dataset.roLocked; } return; }
    if (el.closest('.box.free') || el.matches(RO_NAV) || RO_KEEP.test(el.id) || RO_INPUT_OK.test(el.id) || el.closest('.fr') || el.closest('.hits') || el.closest('#setTabs')) return;
    if (el.matches('button, input, select, textarea') && !el.disabled){ el.dataset.roLocked = '1'; el.disabled = true; }
  }));
}
export const userId = () => 'u' + Math.random().toString(36).slice(2, 9);
/* source: 'lansweeper' for a person first named as a device's user by the feed; they are kept like one added by hand. */
/* A person picked or typed by hand (or a CSV import) names them; Lansweeper names a device's user by login. The exact
   name is looked for first, so a typed "Anna" stays Anna; then the login. */
export function ensureUser(name, source = 'manual'){
  const low = String(name).toLowerCase();
  let u = USERS.find(x => x.name === name) || USERS.find(x => x.login && x.login.toLowerCase() === low);
  if (!u){ u = {id:userId(), login:'', name, dept:'', role:'viewer', groups:[], source, active:true}; USERS.push(u); }
  return u;
}
/* The person with an id, through a lookup of their place in USERS: every device's .user reads it, so going through all
   people each time added up. A place that holds someone else (the list changed) rebuilds the lookup. */
let personAt = new Map();
export function personById(id){
  if (!id) return null;
  let u = USERS[personAt.get(id)];
  if (!u || u.id !== id){ personAt = new Map(USERS.map((x, i) => [x.id, i])); u = USERS[personAt.get(id)]; }
  return u && u.id === id ? u : null;
}
/* A device keeps the id of its user; .user reads the name from that record, so renaming a user moves the devices with it. */
export function bindUser(o){
  const d = Object.getOwnPropertyDescriptor(o, 'user');
  if (d && d.get) return;
  const name = o.user;
  delete o.user;
  if (!o.uid) o.uid = name ? ensureUser(name, o.feed && o.feed.sys === 'Lansweeper' ? 'lansweeper' : 'manual').id : null;
  Object.defineProperty(o, 'user', {
    get(){ if (this.hotdesk) return 'Hot desk'; const u = personById(this.uid); return u ? u.name : ''; },
    set(v){ this.uid = v ? ensureUser(v).id : null; },
    enumerable: true, configurable: true
  });
}
/* Rack placement. A device either takes U slots (rack, u, h) or sits on top of another device in the same rack (ontop). */
export const RACKABLE = ['server','switch','patch','storage','router','firewall','modem'];
export const TYPE_U = {server:2, switch:1, patch:1, storage:4, router:1, firewall:1, modem:1};
export const rackOf = id => racksList().find(r => r.id === id);
/* Returns an error for a placement that does not fit, or '' when it does. */
export function rackCheck(rackId, u, h, exceptId){
  const R_ = rackOf(rackId);
  if (!R_) return 'Pick a rack first.';
  if (!(u >= 1 && h >= 1 && u + h - 1 <= rackUnits(R_))) return `U${u}–${u + h - 1} is outside ${R_.name} (U1–U${rackUnits(R_)}).`;
  /* A retired device is kept for the record and no longer takes up rack units. */
  const hit = objs.find(x => x.id !== exceptId && x.status !== 'retired' && x.rack === rackId && x.u != null && !x.ontop && x.u <= u + h - 1 && u <= x.u + (x.h || 1) - 1);
  return hit ? `U${hit.u}${(hit.h || 1) > 1 ? '–U' + (hit.u + hit.h - 1) : ''} is taken by ${hit.name}.` : '';
}
export function rackFields(o){
  if (!RACKABLE.includes(o.type)) return '';
  /* Same row layout as every other field: the control fills the column and the source mark and menu columns stay free. */
  const slot = '<span class="fsrc-slot" aria-hidden="true"></span>' + (canEdit() ? '<span class="fm-slot" aria-hidden="true"></span>' : '');
  return `<label for="rk_rack">Rack</label><div class="ctlrow"><select id="rk_rack" data-rk="rack"><option value="">Not in a rack</option>${racksList().map(r => `<option value="${esc(r.id)}" ${o.rack===r.id && o.u!=null && !o.ontop ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>${slot}</div>
    <div class="rk-mount" ${o.rack && o.u != null && !o.ontop ? '' : 'hidden'}><label>Mounted at</label><div class="ctlrow"><div class="rkrow"><span class="muted">U</span><input type="number" min="1" data-rk="u" value="${o.u ?? ''}" style="width:64px" aria-label="Start U"><span class="muted">height</span><input type="number" min="1" data-rk="h" value="${o.h ?? TYPE_U[o.type] ?? 1}" style="width:64px" aria-label="Height in U"><span class="muted">U</span></div>${slot}</div></div>
    <label for="rk_top">Or on top of</label><div class="ctlrow"><select id="rk_top" data-rk="ontop"><option value="">Nothing</option>${objs.filter(x => x.id !== o.id && x.rack && x.u != null && !x.ontop && RACKABLE.includes(x.type)).map(x => `<option value="${esc(x.id)}" ${o.ontop===x.id ? 'selected' : ''}>${esc(x.name)} · U${x.u}</option>`).join('')}</select>${slot}</div>`;
}
/* Mount device…: pick a rack device that has no rack yet, a start U and a height. */
export function mountModal(){
  const free = objs.filter(o => RACKABLE.includes(o.type) && !o.rack && !(o.type === 'server' && o.kind === 'vm'));
  if (!free.length){ toast('Every rackable device is already in a rack.'); return; }
  modal(`<div class="mh">Mount device in ${esc(rackOf(st.rackId).name)}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="mdDev">Device</label><select id="mdDev">${free.map(o => `<option value="${esc(o.id)}">${esc(o.name)} · ${esc(TYPES[o.type].label)}</option>`).join('')}</select>
      <label for="mdU">Start U</label><input id="mdU" type="number" min="1" value="${rackUnits(rackOf(st.rackId))}">
      <label for="mdH">Height</label><input id="mdH" type="number" min="1" value="${TYPE_U[free[0].type] ?? 1}">
    </div><p class="note" id="mdErr"></p></div>
    <div class="mf"><button id="mdCancel">Cancel</button><button id="mdOk" class="primary">Mount</button></div>`, 'sm');
  const pick = () => { const o = byId($('#mdDev').value); $('#mdH').value = TYPE_U[o.type] ?? 1; };
  $('#mdDev').onchange = pick;
  $('#mdCancel').onclick = closeModal;
  $('#mdOk').onclick = () => {
    const o = byId($('#mdDev').value), u = +$('#mdU').value, h = +$('#mdH').value;
    const err = rackCheck(st.rackId, u, h, o.id);
    if (err){ $('#mdErr').textContent = err; return; }
    const prevRack = o.rack;
    Object.assign(o, {rack: st.rackId, u, h}); delete o.ontop;
    followOnTop(o, prevRack);
    hist(o, now(), `Mounted in ${rackOf(st.rackId).name} at U${u}, ${h} U high`);
    closeModal(); toast(o.name + ' mounted at U' + u); render();
  };
}
