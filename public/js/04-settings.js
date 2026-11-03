import { intakeRowHtml, bindIntakeRows } from './15-review.js';
import { renderSetSources, renderSourceFields } from './settings-sources.js';
import { renderSetMaint, renderSetLog } from './settings-maint.js';
import { renderSetUsers, renderSetCompany, renderSetAccess } from './settings-users.js';
import { renderSetApi } from './settings-api.js';
import { renderSetTypes } from './settings-types.js';
import { renderSetGraph } from './settings-graph.js';
import { renderSetLdap } from './settings-ldap.js';
import { renderLsToggle, renderSetFeed, renderTypeMap, renderTypeRules, renderSetModels } from './settings-feed.js';
import { renderSetLocs, renderSetVlans, renderSetSubnets, renderSetDomains, resetSubnetEdit } from './settings-network.js';
import { collapsedPanels, rememberPanel, bindPolicy, followOnTop } from './03-object-modals.js';
import { setSettingsOpener, closeModal, modal } from './19-modal.js';
import { $, LS_ON, TYPES, fullTextTooltips, byId, hist, now, objs, rackUnits, racksList, setPeople, st, toast } from './01-core.js';
import { loadVersion, queueServerSave, render } from './07-render.js';
import { html } from './html.js';
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
/* What everyone sets up first comes first; the sources (each optional) after them. */
export const SET_TABS = [['locations','Locations'],['users','People'],['access','Access'],['company','Company'],['types','Device types'],['vlans','Network'],['subnets','Subnets'],['domains','Domains'],['sources','Data sources'],['feed','Lansweeper'],['directory','Active Directory'],['entra','Entra & Intune'],['maintenance','Health'],['backups','Backups'],['mail','E-mail'],['log','Log'],['about','About']];
/* Six tabs: the sources (all their fields together, then Lansweeper, AD, Entra a page each) under Data sources, and backups,
   e-mail and the log under System, each group with a row of its own; About is a link at the foot. */
const SET_GROUPS = { users: [['users', 'People'], ['access', 'Access'], ['company', 'Company']], vlans: [['vlans', 'VLANs'], ['subnets', 'Subnets'], ['domains', 'Domains']], sources: [['sources', 'All fields'], ['feed', 'Lansweeper'], ['directory', 'Active Directory'], ['entra', 'Entra & Intune']], maintenance: [['maintenance', 'Health'], ['backups', 'Backups'], ['mail', 'E-mail'], ['log', 'Log']] };
const TOP_TABS = [['locations','Locations'],['users','Users'],['types','Device types'],['vlans','Network'],['sources','Data sources'],['maintenance','System']];
export const setGroupOf = k => Object.keys(SET_GROUPS).find(g => SET_GROUPS[g].some(([x]) => x === k)) || null;
export function openSettings(){
  /* A dialog opened from here brings Settings back when it closes. */
  setSettingsOpener(openSettings);
  resetSubnetEdit();
  modal(html`<div class="mh">Settings</div>
    <div id="setTabs"><div class="settabs">${TOP_TABS.map(([k,l]) => SET_GROUPS[k] ? html`<button class="tab" data-sg="${k}">${l}</button>` : html`<button class="tab" data-st="${k}">${l}</button>`)}</div>
      ${Object.entries(SET_GROUPS).map(([g, list]) => html`<div class="settabs setsub" data-sub="${g}" hidden>${list.map(([k, l]) => html`<button class="tab" data-st="${k}">${l}</button>`)}</div>`)}</div>
    <div class="mb" id="setPane"></div>
    <div class="mf"><button type="button" class="link" id="setAboutBtn" data-st="about">About NOBS Inventory</button><span style="margin-right:auto"></span><button id="setClose" class="primary">Done</button></div>`, 'settings');
  const go = e => { const g = e.target.closest('[data-sg]'), t = e.target.closest('[data-st]'); if (!g && !t) return; st.setTab = g ? g.dataset.sg : t.dataset.st; renderSetPane(); $('#setPane').scrollTop = 0; };
  $('#setTabs').addEventListener('click', go); $('#setAboutBtn').addEventListener('click', go);
  collapsibleSections($('#setPane'), 'set:');
  $('#setClose').onclick = closeModal;
  renderSetPane();
  /* Opened on a tab: that tab has the focus and is in view (on a phone the row of tabs scrolls). */
  const at = $('#setTabs .tab.active');
  if (at){ at.scrollIntoView({ inline: 'nearest', block: 'nearest' }); requestAnimationFrame(() => { if (document.contains(at)) at.focus({ preventScroll: true }); }); }
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
/* The Lansweeper type names and type rules: under Advanced, kept open while Settings is, once opened. */
let typeAdvOpen = false;
export function renderSetPane(){
  const grp = setGroupOf(st.setTab);
  document.querySelectorAll('#setTabs [data-st]').forEach(b => b.classList.toggle('active', b.dataset.st === st.setTab));
  document.querySelectorAll('#setTabs [data-sg]').forEach(b => b.classList.toggle('active', b.dataset.sg === grp));
  document.querySelectorAll('#setTabs [data-sub]').forEach(r => { r.hidden = r.dataset.sub !== grp; });
  const pane = $('#setPane');
  /* Each source's page: its status header and connection, then the fields it brings (#srcFields, settings-sources.js). */
  const fields = src => `<div id="srcFields" data-src="${src}"></div>`;
  const lsIntake = `<div class="panelbox"><div class="hdr">New devices <span class="cnt">Lansweeper</span></div>${intakeRowHtml('lansweeper')}<div class="lpanel-add"><label class="pchk" style="width:auto"><input type="checkbox" id="skipIp" ${st.skipIpOnly ? 'checked' : ''} ${isAdmin() ? '' : 'disabled'}> Devices named only by an IP address (no serial number) always wait in To review</label></div><div class="lpanel-add"><label class="pchk" style="width:auto" title="A record with a DNS name and no serial number (nb-35.corp.example) when a device named by its first part (NB-35) is here: a docking station's or a USB network adapter's"><input type="checkbox" id="mergeTwins" ${st.mergeTwins ? 'checked' : ''} ${isAdmin() ? '' : 'disabled'}> Merge docking-station records into their device (adds the address as an adapter instead of waiting in To review)</label></div></div>`;
  const body = {
    feed: '<div id="setLsToggle"></div><div id="setFeed"></div>' + (LS_ON() ? lsIntake + '<details class="ls-adv" id="lsTypeAdv" ' + (typeAdvOpen ? 'open' : '') + '><summary>Advanced: Lansweeper type names and type rules</summary><div id="setTypeMap"></div><div id="setTypeRules"></div></details>' + fields('ls') : ''),
    directory: '<div id="setLdap"></div>' + fields('ad'),
    entra: '<div id="setGraph"></div>' + fields('graph') + '<div id="setDefender"></div>',
    sources: '<div id="setSources"></div>',
    locations: '<div id="setLocs"></div>',
    vlans: '<div class="panelbox"><div class="hdr">VLANs <span class="cnt" id="vlCnt"></span></div><div id="setVlans"></div></div>', subnets: '<div class="panelbox" id="setSubnets"></div>', domains: '<div class="panelbox" id="setDomains"></div>',
    types: '<div class="panelbox"><div class="hdr">Device types</div><div id="setTypes"></div></div><div id="setTypeFields"></div><div class="panelbox" id="setModels"></div>',
    users: '<div id="setUsers"></div>', access: '<div id="setAccess"></div><div id="setApi"></div>', company: '<div id="setCompany"></div>',
    maintenance: '<div id="setMaint"></div>', backups: '<div id="setMaint"></div>', mail: '<div id="setMaint"></div>',
    log: '<div id="setLog"></div>',
    about: '<div id="setAbout"></div>'
  }[st.setTab];
  /* Someone who is not an admin sees the settings to know them, not to change them: said once, at the top. */
  pane.innerHTML = (isAdmin() || st.setTab === 'about' ? '' : html`<p class="ro-banner" role="note"><b>Read only.</b> Only an admin changes Settings.${isAdmin() && st.setTab === 'locations' ? ' You can add rooms in your sites below.' : ''}</p>`) + body;
  const ta = $('#lsTypeAdv'); if (ta) ta.ontoggle = () => { typeAdvOpen = ta.open; };
  bindPolicy(pane);
  const skip = $('#skipIp'); if (skip) skip.onchange = () => { st.skipIpOnly = skip.checked; queueServerSave(); };
  const mt = $('#mergeTwins'); if (mt) mt.onchange = () => { st.mergeTwins = mt.checked; queueServerSave(); };
  bindIntakeRows(document);
  fullTextTooltips(pane);
  ({feed: () => { renderLsToggle(); renderSetFeed(); renderTypeMap(); renderTypeRules(); renderSourceFields(); }, directory: () => { renderSetLdap(); renderSourceFields(); }, entra: () => { renderSetGraph(); renderSourceFields(); }, sources: renderSetSources, locations: renderSetLocs, vlans: renderSetVlans, subnets: renderSetSubnets, domains: renderSetDomains, types: () => { renderSetTypes(); renderSetModels(); }, users: renderSetUsers, access: () => { renderSetAccess(); renderSetApi(); }, company: renderSetCompany, maintenance: renderSetMaint, backups: renderSetMaint, mail: renderSetMaint, log: renderSetLog, about: renderSetAbout})[st.setTab]();
  applyRole();
}

/* About, as in NOBS SQL Editor: the version comes from the server, the licence text is the same. */
export async function renderSetAbout(){
  const version = await loadVersion();
  if (!$('#setAbout')) return;   /* Settings was closed while the version was loading */
  $('#setAbout').innerHTML = html`<div class="panelbox" style="padding:12px 14px">
    <div class="muted" style="font-size:12px;line-height:1.6">
      <div class="brandmark" style="margin-bottom:8px;color:var(--fg)"><img src="logo.svg" alt=""><div><b>NOBS</b> <span>Inventory</span></div></div>
      Version ${version || 'unknown'}<br>
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
      ${[['Website', 'https://monsama.ch'], ['Source', 'https://github.com/monsama/nobs-inventory'], ['License', 'https://www.gnu.org/licenses/gpl-3.0.html']].map(([k, u]) => html`<span class="muted">${k}</span><a class="link" href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`)}
    </div>
    <div style="margin-top:12px"><a class="btnlike" href="https://buymeacoffee.com/monsama" target="_blank" rel="noopener noreferrer" title="If NOBS Inventory saves you some time"><svg class="i" viewBox="0 0 24 24"><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3v3M12 3v3"/></svg>Buy me a coffee</a></div>
    <div class="hdr" style="margin:14px -14px 8px">Third party</div>
    <div class="muted" style="font-size:13px;line-height:1.6">
      Built with Node.js, Express, ldapts and PDFKit. Each keeps its own licence.
    </div>
  </div>`;
}

/* ---------- users: people who have devices. Manual users are kept; LDAP users are kept in step with the directory. ---------- */
export let USERS = [];
export const setUsers = v => { USERS = v; setPeople(v); };
export const devicesOf = name => objs.filter(o => o.user === name).length;
export const me = () => USERS.find(u => u.id === st.meId);
/* The name the history records for the signed-in person. */
export const who = () => (me() && me().name) || 'someone';
/* An admin changes everything; anyone else (a viewer) only reads. */
export const isAdmin = () => !USERS.length || (!!me() && me().role === 'admin');
/* A viewer who sees only the devices given to them: they start on My devices, and get only the views that help with that. */
export const ownOnly = () => { const u = me(); return !!u && u.role === 'viewer' && !!u.own; };
/* The sites a viewer limited to some sees, or null: the sidebar lists only those. */
export const seenSites = () => { const u = me(); return u && u.role !== 'admin' && Array.isArray(u.sites) && u.sites.length ? u.sites : null; };
export const roleLabel = u => u.role === 'admin' ? 'Admin' : u.role === 'none' ? 'No access' : 'Viewer';
/* Someone who only reads: each view draws no adding, removing or other changing for them (isAdmin), so lists, views,
   search, zoom and opening things work as for an admin. What is shown as a form (a device's fields, Settings, the port
   setup: marked data-edit) is shown locked. */
export function applyRole(){
  const ro = !isAdmin();
  document.body.classList.toggle('readonly', ro);
  /* Someone who cannot add or link sees no buttons for it, rather than disabled ones. */
  $('#newBtn').disabled = ro; $('#newBtn').hidden = ro;
  $('#whoBtn').textContent = me() ? me().name + ' · ' + roleLabel(me()) : (USERS.length ? 'Signed out · read only' : 'No users yet');
  $('#signOutBtn').hidden = !me();
  /* A control that only picks what is shown (data-view: whose fields Settings → Device types lists) stays open. */
  document.querySelectorAll(':is(#setPane, [data-edit]) :is(button, input, select, textarea):not([data-view])').forEach(el => {
    if (!ro){ if (el.dataset.roLocked){ el.disabled = false; delete el.dataset.roLocked; } return; }
    if (!el.disabled){ el.dataset.roLocked = '1'; el.disabled = true; }
  });
}
export const userId = () => 'u' + Math.random().toString(36).slice(2, 9);
/* source: 'lansweeper' for a person first named as a device's user by the feed; they are kept like one added by hand. */
/* A person picked or typed by hand (or a CSV import) names them; Lansweeper names a device's user by login. The exact
   name is looked for first, so a typed "Anna" stays Anna; then the login. */
export function ensureUser(name, source = 'manual'){
  const low = String(name).toLowerCase();
  let u = USERS.find(x => x.name === name) || USERS.find(x => x.login && x.login.toLowerCase() === low) || USERS.find(x => (x.aliases || []).some(a => a.toLowerCase() === low));
  if (!u){
    /* Lansweeper names a device's user by login (kaufmannm): that is the person's login, so the directory and Entra find
       them by it, as the server's feed does. A full name ("Anna Muster") or a login someone has already stays a name. */
    const isLogin = source === 'lansweeper' && /^[\p{L}\p{N}_.@'-]{1,64}$/u.test(name) && !USERS.some(x => (x.login || '').toLowerCase() === low);
    /* Someone only named as a device's user by Lansweeper gets no access, as when the server's feed adds them: the
       directory sync would otherwise let them sign in with their AD password. An admin gives a role where it is wanted. */
    u = {id:userId(), login: isLogin ? name : '', name, dept:'', role: source === 'lansweeper' ? 'none' : 'viewer', groups:[], source, active:true}; USERS.push(u);
  }
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
  /* A device names its user by id; one whose id no longer finds a person (saved by a page that had made the person but
     not saved it yet) is found again by the name it also keeps. */
  if (!o.uid || (name && !personById(o.uid))) o.uid = name ? ensureUser(name, o.feed && o.feed.sys === 'Lansweeper' ? 'lansweeper' : 'manual').id : null;
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
  if (!(u >= 1 && h >= 1 && u + h - 1 <= rackUnits(R_))) return `U${u}-${u + h - 1} is outside ${R_.name} (U1-U${rackUnits(R_)}).`;
  /* A retired device is kept for the record and no longer takes up rack units. */
  const hit = objs.find(x => x.id !== exceptId && x.status !== 'retired' && x.rack === rackId && x.u != null && !x.ontop && x.u <= u + h - 1 && u <= x.u + (x.h || 1) - 1);
  return hit ? `U${hit.u}${(hit.h || 1) > 1 ? '-U' + (hit.u + hit.h - 1) : ''} is taken by ${hit.name}.` : '';
}
export function rackFields(o){
  if (!RACKABLE.includes(o.type)) return '';
  /* Same row layout as every other field: the control fills the column and the source mark and menu columns stay free. */
  const slot = html`<span class="fsrc-slot" aria-hidden="true"></span>${isAdmin() ? html`<span class="fm-slot" aria-hidden="true"></span>` : ''}`;
  return String(html`<label for="rk_rack">Rack</label><div class="ctlrow"><select id="rk_rack" data-rk="rack"><option value="">Not in a rack</option>${racksList().map(r => html`<option value="${r.id}" ${o.rack===r.id && o.u!=null && !o.ontop ? 'selected' : ''}>${r.name}</option>`)}</select>${slot}</div>
    <div class="rk-mount" ${o.rack && o.u != null && !o.ontop ? '' : 'hidden'}><label>Mounted at</label><div class="ctlrow"><div class="rkrow"><span class="muted">U</span><input type="number" min="1" data-rk="u" value="${o.u ?? ''}" style="width:64px" aria-label="Start U"><span class="muted">height</span><input type="number" min="1" data-rk="h" value="${o.h ?? TYPE_U[o.type] ?? 1}" style="width:64px" aria-label="Height in U"><span class="muted">U</span></div>${slot}</div></div>
    <label for="rk_top">Or on top of</label><div class="ctlrow"><select id="rk_top" data-rk="ontop"><option value="">Nothing</option>${objs.filter(x => x.id !== o.id && x.rack && x.u != null && !x.ontop && RACKABLE.includes(x.type)).map(x => html`<option value="${x.id}" ${o.ontop===x.id ? 'selected' : ''}>${x.name} · U${x.u}</option>`)}</select>${slot}</div>`);
}
/* Mount device…: pick a rack device that has no rack yet, a start U and a height. */
export function mountModal(){
  const free = objs.filter(o => RACKABLE.includes(o.type) && !o.rack && !(o.type === 'server' && o.kind === 'vm'));
  if (!free.length){ toast('Every rackable device is already in a rack.'); return; }
  modal(html`<div class="mh">Mount device in ${rackOf(st.rackId).name}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="mdDev">Device</label><select id="mdDev">${free.map(o => html`<option value="${o.id}">${o.name} · ${TYPES[o.type].label}</option>`)}</select>
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
