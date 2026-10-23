import { daysSince } from './01-core.js';
import { bindPolicy, closeModal, modal, policyGrid } from './03-object-modals.js';
import { $, BUILTIN, ICON, LOCS, LS_ON, PW_MIN, SITES, TYPE_FIELDS, TYPES, VLANS, fullTextTooltips, rels, byId, esc, hist, iconSvg, now, objs, rackUnits, racksList, st, toast } from './01-core.js';
import { SERVER, clearConfirm, flushSave, loadVersion, queueServerSave, reloadFromServer, render } from './07-render-plans.js';
/* ---------- settings ---------- */
/* ---------- settings: tabs, as in NOBS SQL ---------- */
export const SET_TABS = [['feed','Feed'],['locations','Locations'],['vlans','VLANs'],['types','Object types'],['users','Users'],['maintenance','Maintenance'],['log','Log'],['about','About']];
export function openSettings(){
  modal(`<div class="mh">Settings</div>
    <div class="settabs" id="setTabs">${SET_TABS.map(([k,l]) => `<button class="tab" data-st="${k}">${l}</button>`).join('')}</div>
    <div class="mb" id="setPane"></div>
    <div class="mf">${canEdit() ? '<button id="setReset" style="margin-right:auto">Clear inventory</button>' : '<span style="margin-right:auto"></span>'}<button id="setClose" class="primary">Done</button></div>`, 'settings');
  $('#setTabs').addEventListener('click', e => { const t = e.target.closest('[data-st]'); if (!t) return; st.setTab = t.dataset.st; renderSetPane(); });
  $('#setClose').onclick = () => { closeModal(); render(); };
  const sr = $('#setReset');
  if (sr) sr.onclick = () => clearConfirm();
  renderSetPane();
}
/* The switch that turns Lansweeper on or off for this inventory. */
export function renderLsToggle(){
  const host = $('#setLsToggle'); if (!host) return;
  const ro = canEdit() ? '' : 'disabled';
  const on = LS_ON(), api = st.lsSource === 'api';
  host.innerHTML = `<div class="panelbox"><div class="hdr">Lansweeper</div>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)">
      <label for="useLs">Connect Lansweeper</label>
      <div><label class="pchk" style="width:auto"><input type="checkbox" id="useLs" ${on ? 'checked' : ''} ${ro}> ${on ? 'On. Lansweeper data is pulled in and shown.' : 'Off. Lansweeper is not used: its settings, data and panels are hidden.'}</label></div>
      <label for="lsSource">Data comes from</label>
      <div><select id="lsSource" ${ro} ${on ? '' : 'disabled'} aria-label="Where the Lansweeper data comes from">
        <option value="push" ${api ? '' : 'selected'}>Script push (recommended): the script on the Lansweeper server sends the data</option>
        <option value="api" ${api ? 'selected' : ''}>Lansweeper API: this server fetches the data</option></select>
        <p class="note" style="margin:6px 0 0">Only one of the two runs at a time, so they cannot overwrite each other. A manual CSV import is always available.</p></div>
    </div></div>`;
  const c = $('#useLs');
  if (c && canEdit()) c.onchange = () => { st.useLansweeper = c.checked; queueServerSave(); renderSetPane(); render(); };
  const src = $('#lsSource');
  if (src && canEdit()) src.onchange = () => { st.lsSource = src.value; queueServerSave(); renderSetPane(); };
}
/* Lansweeper type names -> object types, and skipping devices named only by an IP address. */
export function renderTypeMap(){
  if (!$('#setTypeMap')) return;
  if (!LS_ON()){ $('#setTypeMap').innerHTML = ''; return; }
  const edit = canEdit(), ro = edit ? '' : 'disabled';
  const entries = Object.entries(st.typeMap || {});
  const typeOptions = sel => Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(t.label)}</option>`).join('');
  const rows = entries.map(([name, type], i) => `<div class="lrow tmap"><input data-tmn="${i}" value="${esc(name)}" aria-label="Lansweeper type name" ${ro}>
    <select data-tmt="${i}" aria-label="Object type" ${ro}>${typeOptions(type)}</select><button data-tmd="${i}" ${ro}>Remove</button></div>`).join('');
  $('#setTypeMap').innerHTML = `<div class="panelbox"><div class="hdr">Lansweeper type names <span class="cnt">${entries.length}</span></div>
    <p class="note" style="padding:10px 12px 6px">Sets the object type a Lansweeper type name becomes when a device is first created. Names are matched without case. Names not listed here use the built-in rules.</p>
    <div class="lrows"><div class="lrow tmap head"><span>Lansweeper name</span><span>Object type</span><span></span></div>
      ${rows || '<p class="note lempty">No names yet.</p>'}</div>
    <div class="lpanel-add"><input id="tmName" placeholder="Lansweeper name, e.g. DECT base" aria-label="Lansweeper type name" ${ro}><select id="tmType" aria-label="Object type" ${ro}>${typeOptions('')}</select><button id="tmAdd" class="primary" ${ro}>Add</button></div>
    <div class="lpanel-add"><label class="pchk" style="width:auto"><input type="checkbox" id="skipIp" ${st.skipIpOnly ? 'checked' : ''} ${ro}> Skip devices named only by an IP address (no serial number)</label></div></div>`;
  const put = list => { st.typeMap = Object.fromEntries(list.filter(([n]) => n)); queueServerSave(); renderTypeMap(); };
  if (!edit) return;
  $('#setTypeMap').querySelectorAll('[data-tmn]').forEach(i => i.onchange = () => { const l = entries.slice(); l[+i.dataset.tmn][0] = i.value.trim(); put(l); });
  $('#setTypeMap').querySelectorAll('[data-tmt]').forEach(i => i.onchange = () => { const l = entries.slice(); l[+i.dataset.tmt][1] = i.value; put(l); });
  $('#setTypeMap').querySelectorAll('[data-tmd]').forEach(b => b.onclick = () => { const l = entries.slice(); l.splice(+b.dataset.tmd, 1); put(l); });
  $('#tmAdd').onclick = () => {
    const name = $('#tmName').value.trim();
    if (!name){ toast('Give the Lansweeper name first.'); return; }
    if (entries.some(([n]) => n.toLowerCase() === name.toLowerCase())){ toast(name + ' is already in the table.'); return; }
    put([...entries, [name, $('#tmType').value]]);
  };
  $('#skipIp').onchange = () => { st.skipIpOnly = $('#skipIp').checked; queueServerSave(); };
}
export function renderSetPane(){
  document.querySelectorAll('#setTabs [data-st]').forEach(b => b.classList.toggle('active', b.dataset.st === st.setTab));
  const pane = $('#setPane');
  const policyPane = `<div class="panelbox"><div class="hdr">Feed may overwrite</div>${policyGrid()}<p class="note" style="padding:10px 12px">Default for every object. Each object can override it on its own page. Name and serial number are match keys and are never overwritten.</p></div>`;
  const html = {
    feed: '<div id="setLsToggle"></div><div id="setFeed"></div><div id="setTypeMap"></div>' + (LS_ON() ? policyPane : ''),
    locations: '<div class="panelbox"><div class="hdr">Locations</div><div id="setLocs"></div></div>',
    vlans: '<div class="panelbox"><div class="hdr">VLANs</div><div id="setVlans"></div></div>',
    types: '<div class="panelbox"><div class="hdr">Object types</div><div id="setTypes"></div></div>',
    users: '<div id="setUsers"></div><div id="setLdap"></div>',
    maintenance: '<div id="setMaint"></div>',
    log: '<div id="setLog"></div>',
    about: '<div id="setAbout"></div>'
  }[st.setTab];
  pane.innerHTML = html;
  bindPolicy(pane);
  fullTextTooltips(pane);
  ({feed: () => { renderLsToggle(); renderSetFeed(); renderTypeMap(); }, locations: renderSetLocs, vlans: renderSetVlans, types: renderSetTypes, users: () => { renderSetUsers(); renderSetLdap(); }, maintenance: renderSetMaint, log: renderSetLog, about: renderSetAbout})[st.setTab]();
  applyRole();
}

/* About, as in NOBS SQL Editor: the version comes from the server, the licence text is the same. */
export async function renderSetAbout(){
  const version = await loadVersion();
  if (!$('#setAbout')) return;   /* Settings was closed while the version was loading */
  $('#setAbout').innerHTML = `<div class="panelbox" style="padding:12px 14px">
    <div class="muted" style="font-size:12px;line-height:1.6">
      <b style="font-size:14px">NOBS Inventory</b><br>
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
    <div style="display:grid;grid-template-columns:70px 1fr;gap:2px 12px;font-size:12px;line-height:1.7;overflow-wrap:anywhere">
      <span class="muted">Website</span><span>https://monsama.ch</span>
      <span class="muted">Source</span><span>https://github.com/monsama/nobs-inventory</span>
      <span class="muted">License</span><span>https://www.gnu.org/licenses/gpl-3.0.html</span>
    </div>
    <div style="margin-top:12px"><a class="btnlike" href="https://buymeacoffee.com/monsama" target="_blank" rel="noopener noreferrer" title="If NOBS Inventory saves you some time"><svg class="i" viewBox="0 0 24 24"><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3v3M12 3v3"/></svg>Buy me a coffee</a></div>
    <div class="hdr" style="margin:14px -14px 8px">Third party</div>
    <div class="muted" style="font-size:11px;line-height:1.6">
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
export const roleLabel = u => u.role === 'admin' ? 'Admin' : 'Viewer';
/* Viewers: controls in the page are disabled, navigation stays. */
export const RO_KEEP = /Cancel|Close|Back|^setTab|^setClose$/;
export const RO_NAV = 'button[data-open],button[data-devs],button[data-sw],button[data-person],button[data-loc],button[data-st],button[data-tab],button[data-close],button.item,button.tab,button.card,button.port,button.node,button.link,a';
export const RO_INPUT_OK = /^(search|mapFind|mapFocus|mapOnly|mapLabels|grp|portsDevice|rkSel|swVerX)$/;
export function applyRole(){
  const ro = !canEdit();
  document.body.classList.toggle('readonly', ro);
  $('#newBtn').disabled = ro;
  $('#whoBtn').textContent = me() ? me().name + ' · ' + roleLabel(me()) : (USERS.length ? 'Signed out · read only' : 'No users yet');
  $('#signOutBtn').hidden = !me();
  ['#view', '#toolbar', '#modalHost'].forEach(sel => $(sel).querySelectorAll('button, input, select, textarea').forEach(el => {
    if (!ro){ if (el.dataset.roLocked){ el.disabled = false; delete el.dataset.roLocked; } return; }
    if (el.closest('.box.free') || el.matches(RO_NAV) || RO_KEEP.test(el.id) || RO_INPUT_OK.test(el.id) || el.closest('.fr') || el.closest('.hits') || el.closest('#setTabs')) return;
    if (el.matches('button, input, select, textarea') && !el.disabled){ el.dataset.roLocked = '1'; el.disabled = true; }
  }));
}
export const userId = () => 'u' + Math.random().toString(36).slice(2, 9);
export function ensureUser(name){
  let u = USERS.find(x => x.name === name);
  if (!u){ u = {id:userId(), login:'', name, dept:'', groups:[], source:'manual', active:true}; USERS.push(u); }
  return u;
}
/* A device keeps the id of its user; .user reads the name from that record, so renaming a user moves the devices with it. */
export function bindUser(o){
  const d = Object.getOwnPropertyDescriptor(o, 'user');
  if (d && d.get) return;
  const name = o.user;
  delete o.user;
  if (!o.uid) o.uid = name ? ensureUser(name).id : null;
  Object.defineProperty(o, 'user', {
    get(){ if (this.hotdesk) return 'Hot desk'; const u = USERS.find(x => x.id === this.uid); return u ? u.name : ''; },
    set(v){ this.uid = v ? ensureUser(v).id : null; },
    enumerable: true, configurable: true
  });
}
/* Software on PCs and servers. */

/* Rack placement. A device either takes U slots (rack, u, h) or sits on top of another device in the same rack (ontop). */
export const RACKABLE = ['server','switch','patch','storage','router','firewall','modem'];
export const TYPE_U = {server:2, switch:1, patch:1, storage:4, router:1, firewall:1, modem:1};
export const rackOf = id => racksList().find(r => r.id === id);
/* Returns an error for a placement that does not fit, or '' when it does. */
export function rackCheck(rackId, u, h, exceptId){
  const R_ = rackOf(rackId);
  if (!R_) return 'Pick a rack first.';
  if (!(u >= 1 && h >= 1 && u + h - 1 <= rackUnits(R_))) return `U${u}–${u + h - 1} is outside ${R_.name} (U1–U${rackUnits(R_)}).`;
  const hit = objs.find(x => x.id !== exceptId && x.rack === rackId && x.u != null && !x.ontop && x.u <= u + h - 1 && u <= x.u + (x.h || 1) - 1);
  return hit ? `U${hit.u}${(hit.h || 1) > 1 ? '–U' + (hit.u + hit.h - 1) : ''} is taken by ${hit.name}.` : '';
}
export function rackFields(o){
  if (!RACKABLE.includes(o.type)) return '';
  /* Same row layout as every other field: the control fills the column and a linked object keeps the feed slot free. */
  const slot = LS_ON() && o.feed ? '<span class="pchk-slot" aria-hidden="true"></span>' : '';
  return `<label for="rk_rack">Rack</label><div class="ctlrow"><select id="rk_rack" data-rk="rack"><option value="">Not in a rack</option>${racksList().map(r => `<option value="${r.id}" ${o.rack===r.id && o.u!=null && !o.ontop ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>${slot}</div>
    <div class="rk-mount" ${o.rack && o.u != null && !o.ontop ? '' : 'hidden'}><label>Mounted at</label><div class="ctlrow"><div class="rkrow"><span class="muted">U</span><input type="number" min="1" data-rk="u" value="${o.u ?? ''}" style="width:64px" aria-label="Start U"><span class="muted">height</span><input type="number" min="1" data-rk="h" value="${o.h ?? TYPE_U[o.type] ?? 1}" style="width:64px" aria-label="Height in U"><span class="muted">U</span></div>${slot}</div></div>
    <label for="rk_top">Or on top of</label><div class="ctlrow"><select id="rk_top" data-rk="ontop"><option value="">Nothing</option>${objs.filter(x => x.id !== o.id && x.rack && x.u != null && !x.ontop && RACKABLE.includes(x.type)).map(x => `<option value="${x.id}" ${o.ontop===x.id ? 'selected' : ''}>${esc(x.name)} · U${x.u}</option>`).join('')}</select>${slot}</div>`;
}
/* Mount device…: pick a rack device that has no rack yet, a start U and a height. */
export function mountModal(){
  const free = objs.filter(o => RACKABLE.includes(o.type) && !o.rack && !(o.type === 'server' && o.kind === 'vm'));
  if (!free.length){ toast('Every rackable device is already in a rack.'); return; }
  modal(`<div class="mh">Mount device in ${esc(rackOf(st.rackId).name)}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="mdDev">Device</label><select id="mdDev">${free.map(o => `<option value="${o.id}">${esc(o.name)} · ${TYPES[o.type].label}</option>`).join('')}</select>
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
    Object.assign(o, {rack: st.rackId, u, h}); delete o.ontop;
    hist(o, now(), `Mounted in ${rackOf(st.rackId).name} at U${u}, ${h} U high`);
    closeModal(); toast(o.name + ' mounted at U' + u); render();
  };
}

export function renderSetUsers(){
  const rows = USERS.map((u, i) => `<tr>
      <td>${esc(u.name)}</td><td class="mono">${esc(u.login || '—')}</td><td>${esc(u.dept || '')}</td><td>${esc((u.groups || []).join(', '))}</td>
      <td>${u.source === 'ldap' ? '<span class="chip info">LDAP</span>' : '<span class="chip kept">Manual</span>'}</td>
      <td class="n"><a class="link" data-devs="${i}">${devicesOf(u.name)}</a></td>
      <td><select data-role="${i}" aria-label="Role of ${esc(u.name)}"><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option><option value="viewer" ${u.role !== 'admin' ? 'selected' : ''}>Viewer</option></select></td>
      <td><input type="checkbox" data-act="${i}" ${u.active ? 'checked' : ''} aria-label="Active"></td>
      <td>${SERVER.on && u.source !== 'ldap' ? (u.login ? `<button data-pw="${i}" title="Set this user's password">Password</button>` : `<button data-login="${i}" title="Give this user a login name">Login name</button>`) : ''}</td>
      <td><button class="icon ghost" data-del="${i}" ${u.source === 'ldap' ? 'disabled title="Managed by LDAP"' : devicesOf(u.name) ? 'disabled title="Has devices. Move them first."' : 'title="Remove"'} aria-label="Remove user">×</button></td></tr>`).join('');
  $('#setUsers').innerHTML = `<div class="panelbox"><div class="hdr">Users <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${USERS.filter(u => u.active).length} active</span></div>
    <div style="overflow-x:auto"><table class="grid mini" style="min-width:920px;table-layout:fixed"><colgroup><col style="width:17%"><col style="width:10%"><col style="width:12%"><col style="width:14%"><col style="width:9%"><col style="width:8%"><col style="width:10%"><col style="width:8%"><col style="width:12%"><col style="width:5%"></colgroup><thead><tr><th>Name</th><th>Login</th><th>Department</th><th>Groups</th><th>Source</th><th>Devices</th><th>Role</th><th>Active</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="addrel"><input id="nuFirst" placeholder="First name" style="min-width:130px" aria-label="First name"><input id="nuLast" placeholder="Last name" style="min-width:130px" aria-label="Last name"><input id="nuDept" placeholder="Department" style="min-width:120px" aria-label="Department"></div>
    <div class="addrel"><input id="nuLogin" placeholder="Login (optional, lets them sign in)" style="min-width:200px" aria-label="Login" autocomplete="off"><input id="nuPw" type="password" placeholder="Password (min. 8)" style="min-width:160px" aria-label="Password" autocomplete="new-password"><select id="nuRole" aria-label="Role"><option value="viewer">Viewer</option><option value="admin">Admin</option></select><button id="nuAdd" class="primary">Add user</button></div></div>
    <p class="note">Each device names its user. The Devices count lists them, and clicking it shows those devices. Users from LDAP can't be removed here, only deactivated.</p>`;
  const root = $('#setUsers');
  root.querySelectorAll('[data-devs]').forEach(a => a.onclick = () => showDevicesOf(USERS[+a.dataset.devs].name));
  root.querySelectorAll('[data-act]').forEach(c => c.onchange = () => { USERS[+c.dataset.act].active = c.checked; renderSetUsers(); });
  root.querySelectorAll('[data-pw]').forEach(b => b.onclick = () => passwordModal(USERS[+b.dataset.pw]));
  root.querySelectorAll('[data-login]').forEach(b => b.onclick = () => userLoginModal(USERS[+b.dataset.login]));
  root.querySelectorAll('[data-role]').forEach(sel => sel.onchange = () => {
    const u = USERS[+sel.dataset.role], admins = USERS.filter(x => x.role === 'admin').length;
    if (u.role === 'admin' && sel.value !== 'admin' && admins <= 1){ toast('At least one admin is needed.'); renderSetUsers(); return; }
    u.role = sel.value; toast(u.name + ' is now ' + roleLabel(u).toLowerCase()); renderSetUsers();
  });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const u = USERS[+b.dataset.del]; USERS.splice(+b.dataset.del, 1); toast(u.name + ' removed'); renderSetUsers(); });
  $('#nuAdd').onclick = async () => {
    const first = $('#nuFirst').value.trim(), last = $('#nuLast').value.trim();
    const name = [first, last].filter(Boolean).join(' ');
    const login = $('#nuLogin').value.trim(), pw = $('#nuPw').value;
    if (!name){ toast('Give the user a first or last name.'); return; }
    if (USERS.some(u => u.name.toLowerCase() === name.toLowerCase())){ toast(name + ' is already a user.'); return; }
    if (login && USERS.some(u => (u.login || '').toLowerCase() === login.toLowerCase())){ toast('That login is already used.'); return; }
    if (login && pw.length < PW_MIN){ toast(`The password needs at least ${PW_MIN} characters.`); return; }
    const u = {id:userId(), login, first, last, name, dept:$('#nuDept').value.trim(), role:$('#nuRole').value, groups:[], source:'manual', active:true};
    USERS.push(u); queueServerSave();
    if (login){
      await flushSave();
      const r = await fetch('api/users/' + encodeURIComponent(u.id) + '/password', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({password: pw})});
      if (!r.ok){ toast('Added ' + name + ', but the password was not set. Use Password in the list.'); st.setTab = 'users'; openSettings(); return; }
    }
    toast('Added ' + name); st.setTab = 'users'; openSettings();
  };
}
/* A manual user without a login: the login and the first password are set together, so the user can sign in at once. */
export function userLoginModal(u){
  modal(`<div class="mh">Login name for ${esc(u.name)}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="lgNew">Login name</label><input id="lgNew" class="mono" autocomplete="off">
      <label for="lgNewPw">Password</label><input id="lgNewPw" type="password" autocomplete="new-password" placeholder="At least ${PW_MIN} characters">
    </div><p class="note" id="lgNewErr">The login and password let ${esc(u.name)} sign in.</p></div>
    <div class="mf"><button id="lgNewCancel">Cancel</button><button id="lgNewOk" class="primary">Save</button></div>`, 'sm');
  $('#lgNew').focus();
  $('#lgNewCancel').onclick = closeModal;
  $('#lgNewOk').onclick = async () => {
    const login = $('#lgNew').value.trim(), pw = $('#lgNewPw').value;
    const fail = msg => { $('#lgNewErr').textContent = msg; };
    if (!login) return fail('Write a login.');
    if (USERS.some(x => x !== u && (x.login || '').toLowerCase() === login.toLowerCase())) return fail('That login is already used.');
    if (pw.length < PW_MIN) return fail(`The password needs at least ${PW_MIN} characters.`);
    u.login = login; queueServerSave(); await flushSave();
    const r = await fetch('api/users/' + encodeURIComponent(u.id) + '/password', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({password: pw})});
    closeModal();
    toast(r.ok ? u.name + ' can sign in as ' + login : 'The login is saved, but the password was not set. Use Password in the list.');
    st.setTab = 'users'; openSettings();
  };
}
/* Shows one user's devices in Cards, by searching for the name. */
export function showDevicesOf(name){
  closeModal();
  st.q = name; $('#search').value = name; st.tab = 'cards'; st.cardsGroup = 'none';
  render();
}

/* LDAP: the directory settings live on the server (NI_LDAP_* variables). Here the status and a sync. */
/* Maintenance: the factory reset. Only an admin can use it, and it asks for the typed word first. */
/* The log: what was synced, saved, restored and signed in, and what failed. */
export let LOG_FILTER = 'all';
export const LOG_KINDS = [['all', 'All'], ['errors', 'Errors'], ['sync', 'Sync and push'], ['backup', 'Backups'], ['access', 'Access']];
export const logKind = e => /backup|restor/i.test(e.action) ? 'backup' : /sign in|password|login|user|removed by/i.test(e.action) ? 'access' : /sync|push|import|feed|ldap/i.test(e.action) ? 'sync' : 'other';
export async function renderSetLog(){
  const pane = $('#setLog');
  if (!pane) return;
  if (!canEdit()){ pane.innerHTML = '<div class="panelbox"><div class="hdr">Log</div><p class="note" style="padding:12px">Only administrators can see the log.</p></div>'; return; }
  const r = await fetch('api/log?limit=500', {credentials: 'same-origin'});
  if (!$('#setLog')) return;
  const j = r.ok ? await r.json() : {entries: []};
  const entries = j.entries.filter(e => LOG_FILTER === 'all' || (LOG_FILTER === 'errors' ? e.level === 'error' : logKind(e) === LOG_FILTER));
  const errors = j.entries.filter(e => e.level === 'error').length;
  if (!$('#setLog')) return;
  $('#setLog').innerHTML = `<div class="panelbox"><div class="hdr">Log <span class="cnt">${j.entries.length}</span>${errors ? ` <span class="chip warn">${errors} error${errors === 1 ? '' : 's'}</span>` : ''}</div>
    <div class="addrel" style="padding:10px 12px;border-top:0">
      ${LOG_KINDS.map(([k, l]) => `<button class="tab ${LOG_FILTER === k ? 'active' : ''}" data-logf="${k}">${l}</button>`).join('')}
      <span class="grow"></span><button id="logRefresh">Refresh</button></div>
    ${entries.length ? `<div style="overflow-x:auto"><table class="grid mini" style="min-width:560px"><thead><tr><th style="width:170px">Time</th><th style="width:90px">Level</th><th style="width:160px">Who</th><th>What happened</th></tr></thead><tbody>
      ${entries.map(e => `<tr class="${e.level === 'error' ? 'logerr' : ''}"><td class="mono">${esc(pushDate(e.at))}</td><td>${e.level === 'error' ? '<span class="chip warn">Error</span>' : '<span class="chip kept">Info</span>'}</td><td>${esc(e.who)}</td><td style="white-space:normal">${esc(e.action)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="note" style="padding:12px">Nothing to show for this filter.</p>'}</div>`;
  pane.querySelectorAll('[data-logf]').forEach(b => b.onclick = () => { LOG_FILTER = b.dataset.logf; renderSetLog(); });
  $('#logRefresh').onclick = () => renderSetLog();
}
/* Backups of the inventory: taken before each Lansweeper sync, push and import, and by hand. */
export let BACKUPS = null;
export async function loadBackups(){
  const r = await fetch('api/backups', {credentials: 'same-origin'});
  if (r.ok){ BACKUPS = (await r.json()).backups; if ($('#setMaint')) renderSetMaint(); }
}
export function backupPanel(edit){
  const list = BACKUPS || [];
  const rows = list.map(b => `<tr><td>${esc(pushDate(b.at))}</td><td>${esc(b.reason)}</td><td class="n hide-n">${b.objects}</td><td class="n hide-n">${(b.bytes / 1048576).toFixed(1)} MB</td>
    <td class="act"><a class="link" href="api/backups/${b.id}/download">Download</a> <button data-brestore="${b.id}" data-bat="${esc(pushDate(b.at))}" ${edit ? '' : 'disabled'}>Restore</button> <button class="icon ghost" data-bdel="${b.id}" ${edit ? '' : 'disabled'} aria-label="Delete this backup">×</button></td></tr>`).join('');
  return `<div class="panelbox"><div class="hdr">Backups <span class="cnt">${list.length}</span></div>
    <p class="note" style="padding:10px 12px">A backup is taken before every Lansweeper sync, push and import. Restoring puts the devices, relations, history, locations, plans and settings back. Users are kept, and the current state is backed up before a restore, so it can be restored again.</p>
    <div class="lpanel-add"><span class="note" style="flex:1">${list.length} backup${list.length === 1 ? '' : 's'}, ${(list.reduce((a, b) => a + (b.bytes || 0), 0) / 1048576).toFixed(1)} MB in total. Keep the last <input id="bkKeep" type="number" min="1" max="100" value="${st.backupKeep || 10}" style="width:64px;min-width:0" aria-label="Backups to keep" ${edit ? '' : 'disabled'}> (applied at the next backup).</span></div>
    ${list.length ? `<div style="overflow-x:auto"><table class="grid mini" style="min-width:0"><thead><tr><th>Taken</th><th>Reason</th><th class="n hide-n">Devices</th><th class="n hide-n">Size</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="note" style="padding:0 12px 10px">No backups yet.</p>'}
    <div class="addrel" style="padding:10px 12px"><button id="bkNew" class="primary" ${edit ? '' : 'disabled'}>Back up now</button><span class="note" style="flex:1"></span><label class="btnlike ${edit ? '' : 'disabled'}">Restore from file…<input type="file" id="bkFile" accept="application/json,.json" hidden ${edit ? '' : 'disabled'}></label></div></div>`;
}
export function wireBackups(edit){
  const msg = t => toast(t);
  if ($('#bkNew')) $('#bkNew').onclick = async () => {
    const r = await fetch('api/backups', {method: 'POST', credentials: 'same-origin'});
    if (!r.ok){ msg('The backup could not be taken.'); return; }
    msg('Backup taken'); loadBackups();
  };
  document.querySelectorAll('[data-bdel]').forEach(b => b.onclick = async () => {
    const r = await fetch('api/backups/' + b.dataset.bdel, {method: 'DELETE', credentials: 'same-origin'});
    if (r.ok){ msg('Backup deleted'); loadBackups(); }
  });
  document.querySelectorAll('[data-brestore]').forEach(b => b.onclick = () => restoreModal(b.dataset.bat, () => fetch('api/backups/' + b.dataset.brestore + '/restore', {method: 'POST', credentials: 'same-origin'})));
  const file = $('#bkFile');
  if ($('#bkKeep')) $('#bkKeep').onchange = () => { const v = Math.max(1, Math.min(100, Math.floor(+$('#bkKeep').value) || 10)); st.backupKeep = v; queueServerSave(); toast('Keeping the last ' + v + ' backups'); renderSetMaint(); };
  if (file) file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    const text = await f.text();
    restoreModal(f.name, () => fetch('api/backups/restore-file', {method: 'POST', headers: {'Content-Type': 'text/plain'}, credentials: 'same-origin', body: text}));
    file.value = '';
  };
}
/* A restore replaces the inventory, so it asks for the word RESTORE. */
export function restoreModal(label, run){
  modal(`<div class="mh">Restore a backup</div><div class="mb"><p class="note">The inventory is replaced with the backup from ${esc(label)}. The current state is backed up first, so the restore can be undone from the list.</p>
    <div class="form" style="padding:0"><label for="rsWord">Type RESTORE to confirm</label><input id="rsWord" autocomplete="off"></div></div>
    <div class="mf"><button id="rsCancel">Cancel</button><button id="rsOk" class="danger-text" disabled>Restore</button></div>`, 'sm');
  $('#rsCancel').onclick = closeModal;
  $('#rsWord').oninput = () => { $('#rsOk').disabled = $('#rsWord').value !== 'RESTORE'; };
  $('#rsOk').onclick = async () => {
    const r = await run();
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'The backup could not be restored.'); return; }
    closeModal(); toast('Restored'); await reloadFromServer(); loadBackups();
  };
  $('#rsWord').focus();
}
export function renderSetMaint(){
  const edit = canEdit();
  if (edit && BACKUPS === null) loadBackups();
  $('#setMaint').innerHTML = `${edit ? backupPanel(edit) : ''}<div class="panelbox" style="border-color:var(--danger-bg)"><div class="hdr">Factory reset</div>
    <div class="note" style="padding:12px">Returns the app to the state of a new installation. Everything is removed: devices, relations and history, users and their sign-in, locations, sites, racks, object types and settings. Only your own account stays, with its password, so you can sign in again.</div>
    <div class="note" style="padding:10px 12px">Backups are not affected, and the audit log keeps a record of the reset. The Lansweeper token and the directory password stay on the server.</div>
    <div class="addrel" style="padding:10px 12px"><button id="frReset" class="danger-text" ${edit ? '' : 'disabled'}>Factory reset…</button></div></div>`;
  if (edit) wireBackups(edit);
  if (edit) $('#frReset').onclick = factoryResetModal;
}
export function factoryResetModal(){
  modal(`<div class="mh">Factory reset?</div>
    <div class="mb"><p class="note">Everything is removed, except your own account. This cannot be undone: only a backup brings the data back.</p>
      <label class="note" for="frWord" style="display:block;margin-top:6px">Type FACTORY RESET to confirm</label><input id="frWord" autocomplete="off" aria-label="Type FACTORY RESET" style="width:100%"></div>
    <div class="mf"><button id="frCancel">Cancel</button><button id="frOk" class="danger-text" disabled>Factory reset</button></div>`, 'sm');
  $('#frWord').oninput = () => { $('#frOk').disabled = $('#frWord').value.trim() !== 'FACTORY RESET'; };
  $('#frWord').focus();
  $('#frCancel').onclick = closeModal;
  $('#frOk').onclick = async () => {
    clearTimeout(SERVER.timer);
    const r = await fetch('api/factory-reset', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({confirm: 'FACTORY RESET'})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'The reset did not run.'); return; }
    location.reload();
  };
}
/* LDAP / Active Directory. The settings are saved in the inventory and used at the next sign-in or sync. The service
   account's password is not stored there: the server reads it from its environment. */
export function renderSetLdap(){
  if (!st.ldap) st.ldap = {};
  const L = st.ldap, edit = canEdit();
  const ro = edit ? '' : 'disabled';
  const field = (k, label, hint) => `<label for="lk_${k}">${label}</label><input id="lk_${k}" data-lk="${k}" class="mono" value="${esc(L[k] || '')}" placeholder="${esc(hint)}" ${ro}>`;
  const ready = !!L.url && edit;
  $('#setLdap').innerHTML = `<div class="panelbox"><div class="hdr">LDAP / Active Directory</div>
    <div class="note" style="padding:10px 12px">Changes are saved in the inventory and used at the next sign-in or sync. The service account's password is not stored here: the server reads it from its environment (NI_LDAP_SERVICE_PASSWORD).</div>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)">
      ${field('url', 'Server', 'ldaps://dc01.example.ch:636')}
      ${field('bindTemplate', 'Sign-in name', 'EXAMPLE\\{login}  or  {login}@example.ch')}
      ${field('searchBase', 'Search base', 'OU=Users,DC=example,DC=ch')}
      ${field('loginAttr', 'Login attribute', 'sAMAccountName')}
      ${field('userFilter', 'User filter', '(objectClass=person)')}
      ${field('group', 'Sign-in group', 'CN=Inventory-Users,OU=Groups,DC=example,DC=ch')}
      ${field('adminGroup', 'Admin group', 'CN=IT-Inventory,OU=Groups,DC=example,DC=ch')}
      ${field('serviceDn', 'Service account', 'CN=inventory-sync,OU=Service,DC=example,DC=ch')}
    </div>
    <div class="addrel" style="padding:10px 12px"><button id="ldapTest" ${ready ? '' : 'disabled'}>Test connection</button><button id="ldapSync" class="primary" ${ready ? '' : 'disabled'}>Sync now</button><span class="note" id="ldapMsg"></span></div></div>`;
  $('#setLdap').querySelectorAll('[data-lk]').forEach(i => i.onchange = () => { st.ldap[i.dataset.lk] = i.value.trim(); queueServerSave(); renderSetLdap(); });
  const bad = t => `<span style="color:var(--danger)">${esc(t)}</span>`;
  $('#ldapTest').onclick = async () => {
    const msg = $('#ldapMsg'); msg.textContent = 'Testing…';
    await flushSave();
    const r = await fetch('api/ldap/test', {method: 'POST', credentials: 'same-origin'});
    const j = await r.json().catch(() => ({}));
    msg.innerHTML = r.ok ? `<span style="color:var(--ok)">Connected. ${j.people} users are in scope.</span>` : bad(j.error || 'The directory cannot be reached.');
  };
  $('#ldapSync').onclick = async () => {
    const msg = $('#ldapMsg'), btn = $('#ldapSync');
    btn.disabled = true; msg.textContent = 'Syncing…';
    await flushSave();
    const r = await fetch('api/ldap/sync', {method: 'POST', credentials: 'same-origin'});
    const j = await r.json().catch(() => ({}));
    btn.disabled = false;
    if (!r.ok){ msg.innerHTML = bad(j.error || 'The sync failed.'); return; }
    const c = j.counts;
    msg.textContent = `${c.people} users in scope: ${c.created} new, ${c.updated} updated, ${c.deactivated} deactivated.`;
    await reloadFromServer();
  };
}
/* An uploaded icon keeps only its drawing: scripts, event handlers, styles and links to anything outside the file are dropped. */
export function sanitizeSvg(text){
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) return null;
  const OK_EL = ['svg','g','path','circle','ellipse','rect','line','polyline','polygon','title','defs','desc'];
  const OK_AT = ['d','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','width','height','points','fill','fill-rule','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray','opacity','transform','id'];
  root.querySelectorAll('*').forEach(n => { if (n !== root && !OK_EL.includes(n.localName)) n.remove(); });
  root.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => { if (!OK_AT.includes(a.name.toLowerCase())) n.removeAttribute(a.name); }));
  const ser = new XMLSerializer();
  return {inner: [...root.childNodes].map(n => ser.serializeToString(n)).join(''), view: root.getAttribute('viewBox') || '0 0 24 24'};
}
export function passwordModal(u){
  modal(`<div class="mh">Password for ${esc(u.name)}</div>
    <div class="mb"><div class="form" style="padding:0"><label for="pwNew">New password</label><input id="pwNew" type="password" autocomplete="new-password" aria-describedby="pwHint"></div>
    <p class="note" id="pwHint">At least ${PW_MIN} characters, not a common password. The server stores only a salted hash.</p></div>
    <div class="mf"><button id="pwCancel">Cancel</button><button id="pwOk" class="primary">Set password</button></div>`, 'sm');
  $('#pwCancel').onclick = closeModal;
  $('#pwOk').onclick = async () => {
    const r = await fetch('api/users/' + encodeURIComponent(u.id) + '/password', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({password: $('#pwNew').value})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'Not set.'); return; }
    closeModal(); toast('Password set for ' + u.name);
  };
  $('#pwNew').focus();
}
/* Locations are 'Site / Room'. Renaming one moves the objects and racks that use it. */
export const cleanLoc = v => { const t = v.trim().split(/\s*\/\s*/).map(x => x.trim()); return t.length === 2 && t[0] && t[1] ? t.join(' / ') : ''; };
/* VLANs are one list for the whole inventory. A connection picks one from it, so a VLAN is named once. */
export function renderSetVlans(){
  const usedBy = vid => rels.filter(r => r.vlan === vid).length;
  $('#setVlans').innerHTML = `<div class="lrows"><div class="lrow head"><span>VLAN</span><span>Name</span><span class="n">Used by</span><span></span></div>
    ${VLANS.length ? VLANS.map((v, i) => { const n = usedBy(v.vid); return `<div class="lrow"><span class="mono">${v.vid}</span><input data-vn="${i}" value="${esc(v.name)}" aria-label="Name of VLAN ${v.vid}"><span class="n">${n}</span>
      <button data-vd="${i}" ${n ? `disabled title="In use by ${n} connections"` : ''}>Delete</button></div>`; }).join('') : '<p class="note lempty">No VLANs yet. Add the ones your network uses.</p>'}</div>
    <div class="lpanel-add"><input id="vlId" type="number" min="1" max="4094" placeholder="ID, e.g. 10" aria-label="VLAN ID" style="width:120px"><input id="vlName" placeholder="Name, e.g. Users" aria-label="VLAN name"><button id="vlAdd" class="primary">Add VLAN</button></div>
    <p class="note lnote" id="vlMsg">IDs run from 1 to 4094. Each VLAN ID is listed once.</p>`;
  const root = $('#setVlans');
  root.querySelectorAll('[data-vn]').forEach(i => i.onchange = () => {
    const name = i.value.trim(), v = VLANS[+i.dataset.vn];
    if (!name){ i.value = v.name; $('#vlMsg').innerHTML = warn('A VLAN needs a name.'); return; }
    v.name = name; queueServerSave(); render(); renderSetVlans();
  });
  root.querySelectorAll('[data-vd]').forEach(b => b.onclick = () => { VLANS.splice(+b.dataset.vd, 1); queueServerSave(); toast('VLAN deleted'); renderSetVlans(); render(); });
  const add = () => {
    const vid = +$('#vlId').value, name = $('#vlName').value.trim(), msg = $('#vlMsg');
    if (!Number.isInteger(vid) || vid < 1 || vid > 4094){ msg.innerHTML = warn('The ID is a number from 1 to 4094.'); $('#vlId').focus(); return; }
    if (!name){ msg.innerHTML = warn('Give the VLAN a name.'); $('#vlName').focus(); return; }
    if (VLANS.some(v => v.vid === vid)){ msg.innerHTML = warn('VLAN ' + vid + ' is already listed.'); return; }
    VLANS.push({vid, name}); VLANS.sort((a, b) => a.vid - b.vid);
    queueServerSave(); toast('Added VLAN ' + vid); renderSetVlans(); render();
  };
  $('#vlAdd').onclick = add;
  $('#vlName').onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); add(); } };
}
export const warn = t => '<span style="color:var(--danger)">' + esc(t) + '</span>';
export const siteOf = l => String(l || '').split(' / ')[0];
export function renderSetLocs(){
  const siteRow = (x, i) => {
    const n = objs.filter(o => siteOf(o.loc) === x).length + LOCS.filter(l => siteOf(l) === x).length;
    return `<div class="lrow"><input data-si="${i}" value="${esc(x)}" aria-label="Site name"><span class="n">${n}</span>
      <button data-sd="${i}" ${n ? `disabled title="In use by ${n} rooms, objects or racks"` : ''}>Delete</button></div>`;
  };
  const roomRow = (l, i) => {
    const n = objs.filter(o => o.loc === l).length;
    return `<div class="lrow room"><span class="site" title="${esc(siteOf(l))}">${esc(siteOf(l))}</span><input data-lo="${i}" value="${esc(l.split(' / ').slice(1).join(' / '))}" aria-label="Room in ${esc(siteOf(l))}">
      <span class="n">${n}</span><button data-ld="${i}" ${n ? `disabled title="In use by ${n} objects or racks"` : ''}>Delete</button></div>`;
  };
  $('#setLocs').innerHTML = `<div class="locgrid">
    <section class="panelbox locpanel"><div class="hdr">Sites <span class="cnt">${SITES.length}</span></div>
      <div class="lrows"><div class="lrow head"><span>Site</span><span class="n">Used by</span><span></span></div>
        ${SITES.length ? SITES.map(siteRow).join('') : '<p class="note lempty">No sites yet. Add the first one below.</p>'}</div>
      <div class="lpanel-add"><input id="nsName" placeholder="New site, e.g. Basel" aria-label="New site"><button id="nsAdd" class="primary">Add site</button></div>
      <p class="note lnote" id="nsMsg">A site is a town or a building.</p></section>
    <section class="panelbox locpanel"><div class="hdr">Rooms <span class="cnt">${LOCS.length}</span></div>
      <div class="lrows"><div class="lrow room head"><span>Site</span><span>Room</span><span class="n">Used by</span><span></span></div>
        ${LOCS.length ? LOCS.map(roomRow).join('') : '<p class="note lempty">No rooms yet.</p>'}</div>
      <div class="lpanel-add"><select id="nlSite" aria-label="Site for the new room">${SITES.map(x => `<option>${esc(x)}</option>`).join('')}</select><input id="nlRoom" placeholder="New room, e.g. Lager" aria-label="New room"><button id="nlAdd" class="primary" ${SITES.length ? '' : 'disabled'}>Add room</button></div>
      <p class="note lnote" id="nlMsg">${SITES.length ? 'Each room belongs to one site.' : 'Add a site first.'}</p></section>
  </div>`;
  const root = $('#setLocs');
  root.querySelectorAll('[data-si]').forEach(i => i.onchange = () => renameSite(SITES[+i.dataset.si], i.value));
  root.querySelectorAll('[data-sd]').forEach(b => b.onclick = () => { SITES.splice(+b.dataset.sd, 1); toast('Site deleted'); renderSetLocs(); render(); });
  root.querySelectorAll('[data-lo]').forEach(i => i.onchange = () => { const old = LOCS[+i.dataset.lo]; renameLoc(old, siteOf(old) + ' / ' + i.value.trim()); });
  root.querySelectorAll('[data-ld]').forEach(b => b.onclick = () => { LOCS.splice(+b.dataset.ld, 1); toast('Room deleted'); renderSetLocs(); render(); });
  const enter = (id, fn) => $(id).onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); fn(); } };
  $('#nsAdd').onclick = addSite; enter('#nsName', addSite);
  $('#nlAdd').onclick = addRoom; enter('#nlRoom', addRoom);
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
  if (st.loc) st.loc = move(st.loc);
  renderSetLocs(); render();
}
export function renameLoc(old, value){
  const name = cleanLoc(value);
  if (!name){ toast('Use the form Site / Room, e.g. Basel / Lager'); renderSetLocs(); return; }
  if (name !== old && LOCS.includes(name)){ toast(name + ' already exists.'); renderSetLocs(); return; }
  if (name === old) return;
  LOCS[LOCS.indexOf(old)] = name;
  objs.forEach(o => { if (o.loc === old) o.loc = name; });
  if (st.loc === old) st.loc = name;
  toast('Renamed to ' + name); renderSetLocs(); render();
}
/* Object types: rename, recolour, change the icon, add new ones. A type can be deleted only when it is not built in and no object has it. */
/* Address checks, the same rules as server/validate.js: an empty value is allowed. */
export const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
export const MAC_RE = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
export function validIPv6(v){
  if (v.length > 45 || !/^[0-9a-f:.]+$/i.test(v)) return false;
  if (v.includes('.')){ const i = v.lastIndexOf(':'); if (i < 0 || !IPV4_RE.test(v.slice(i + 1))) return false; v = v.slice(0, i + 1) + '0:0'; }
  const parts = v.split('::'); if (parts.length > 2) return false;
  const groups = x => (x === '' ? [] : x.split(':'));
  const all = [...groups(parts[0]), ...(parts.length === 2 ? groups(parts[1]) : [])];
  if (!all.every(g => /^[0-9a-f]{1,4}$/i.test(g))) return false;
  return parts.length === 2 ? all.length <= 7 : all.length === 8;
}
export function checkAddress(k, raw){
  const v = String(raw ?? '').trim();
  if (!v) return {ok: true, value: ''};
  if (k === 'ip') return IPV4_RE.test(v) ? {ok: true, value: v} : {ok: false, msg: `"${v}" is not an IPv4 address, such as 10.10.0.12.`};
  if (k === 'ip6') return validIPv6(v) ? {ok: true, value: v.toLowerCase()} : {ok: false, msg: `"${v}" is not an IPv6 address, such as 2001:db8::12.`};
  if (k === 'mac') return MAC_RE.test(v) ? {ok: true, value: v.toLowerCase().replace(/-/g, ':')} : {ok: false, msg: `"${v}" is not a MAC address, such as 70:b3:17:4a:00:01.`};
  return {ok: true, value: v};
}
/* Readable names for the icons, for the dropdown. */
export const ICON_LABEL = { pc: 'Computer', laptop: 'Laptop', server: 'Server', sip: 'VoIP phone', mobile: 'Mobile device', rack: 'Rack',
  monitor: 'Monitor', switch: 'Switch', router: 'Router', firewall: 'Firewall', modem: 'Modem', patch: 'Patch panel',
  printer: 'Printer', scanner: 'Scanner', projector: 'Projector', camera: 'Camera', storage: 'Storage', nas: 'NAS',
  ups: 'UPS', accesspoint: 'Access point', other: 'Other' };
export const iconLabel = n => (n === 'custom' ? 'Uploaded icon' : ICON_LABEL[n] || n);
/* A dropdown that shows the icon and its name, for the object type's icon. */
export function iconChoice(k, t){
  const names = [...Object.keys(ICON), ...(t.svgInner ? ['custom'] : [])];
  const preview = n => n === 'custom' ? `<svg class="i cu" viewBox="${t.svgView}">${t.svgInner}</svg>` : iconSvg(n);
  return `<div class="icondd"><button type="button" class="icondd-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="Icon for ${esc(t.label)}">${preview(t.icon)}<span>${esc(iconLabel(t.icon))}</span><span class="icondd-caret">▾</span></button>
    <div class="icondd-list" role="listbox" hidden>${names.map(n => `<button type="button" role="option" class="icondd-item" aria-selected="${n === t.icon}" data-ic="${k}" data-icon="${n}">${preview(n)}<span>${esc(iconLabel(n))}</span></button>`).join('')}<label class="icondd-up">Upload SVG icon...<input type="file" hidden accept=".svg,image/svg+xml" data-up="${k}" aria-label="Upload SVG icon for ${esc(t.label)}"></label></div></div>`;
}
export function closeIconLists(){ document.querySelectorAll('.icondd-list').forEach(l => { l.hidden = true; const b = l.previousElementSibling; if (b) b.setAttribute('aria-expanded', 'false'); }); }
document.addEventListener('click', e => { if (!e.target.closest('.icondd')) closeIconLists(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeIconLists(); });
/* The list is fixed to the viewport, so it closes when the page scrolls away from its button. */
document.addEventListener('scroll', e => { if (!e.target.closest?.('.icondd-list')) closeIconLists(); }, true);
/* A key for a field, from its name: lowercase letters, digits and underscores, starting with a letter. */
export const fieldKey = label => {
  let k = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 28);
  if (k && !/^[a-z]/.test(k)) k = 'f_' + k;
  return k.replace(/_+$/, '');
};
/* The fields a type has beyond the built-in ones. They are filled in by hand on every object of that type. */
export function renderSetTypeFields(){
  let box = $('#setTypeFields');
  if (!box){ box = document.createElement('div'); box.id = 'setTypeFields'; $('#setTypes').appendChild(box); }
  const type = st.fieldType && TYPES[st.fieldType] ? st.fieldType : Object.keys(TYPES)[0];
  st.fieldType = type;
  const list = TYPE_FIELDS[type] || [];
  box.innerHTML = `<div class="hdr" style="margin-top:14px">Fields per type</div>
    <p class="note">Each type can have its own fields, filled in by hand on every object of that type. Removing a field hides its values on the objects, and they come back if it is added again.</p>
    <div class="addrel"><label for="tfType" class="muted">Type</label><select id="tfType">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>
    <div class="lrows">${list.length ? list.map((f, i) => `<div class="lrow"><span>${esc(f.label)}</span><span class="mono muted">${f.kind}</span><span></span><button data-tfd="${i}" aria-label="Remove field ${esc(f.label)}">Remove</button></div>`).join('') : '<p class="note lempty">No fields for this type yet.</p>'}</div>
    <div class="lpanel-add"><input id="tfLabel" placeholder="Field name, e.g. Asset tag" aria-label="Field name"><select id="tfKind" aria-label="Kind of value"><option value="text">Text</option><option value="number">Number</option></select><button id="tfAdd" class="primary">Add field</button></div>`;
  $('#tfType').onchange = e => { st.fieldType = e.target.value; renderSetTypeFields(); };
  box.querySelectorAll('[data-tfd]').forEach(b => b.onclick = () => {
    list.splice(+b.dataset.tfd, 1); if (!list.length) delete TYPE_FIELDS[type];
    queueServerSave(); toast('Field removed'); renderSetTypeFields(); render();
  });
  const add = () => {
    const label = $('#tfLabel').value.trim(), key = fieldKey(label);
    if (!label){ toast('Give the field a name.'); return; }
    if (!key){ toast('Use letters or digits in the name.'); return; }
    if (list.some(f => f.key === key)){ toast('That field already exists for this type.'); return; }
    TYPE_FIELDS[type] = [...list, {key, label, kind: $('#tfKind').value}];
    queueServerSave(); toast('Added ' + label); renderSetTypeFields(); render();
  };
  $('#tfAdd').onclick = add;
  $('#tfLabel').onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); add(); } };
}
export function renderSetTypes(){
  const rows = Object.entries(TYPES).map(([k,t]) => {
    const n = objs.filter(o => o.type === k).length;
    const lock = BUILTIN.includes(k) ? 'Built in' : n ? `In use by ${n} objects` : '';
    return `<tr>
      <td style="width:1%"><input type="color" value="${t.color}" data-tc="${k}" aria-label="Colour for ${esc(t.label)}" style="width:40px;height:28px;padding:2px"></td>
      <td><input data-tl="${k}" value="${esc(t.label)}" style="width:100%" aria-label="Name"></td>
      <td><input data-ts="${k}" value="${esc(t.short)}" aria-label="Short name"></td>
      <td>${iconChoice(k, t)}</td>
      <td class="n">${n}</td>
      <td><button data-td="${k}" ${BUILTIN.includes(k) || n ? `disabled title="${lock}"` : ''}>Delete</button></td></tr>`;
  }).join('');
  $('#setTypes').innerHTML = `<div style="overflow-x:auto"><table class="grid mini types" style="min-width:0"><colgroup><col style="width:70px"><col><col style="width:120px"><col style="width:200px"><col style="width:80px"><col style="width:100px"></colgroup><thead><tr><th>Colour</th><th>Name</th><th>Short</th><th>Icon</th><th class="n">Objects</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="addrel"><input id="ntName" placeholder="New type, e.g. Access point" style="flex:1;min-width:160px" aria-label="New type name"><button id="ntAdd" class="primary">Add type</button></div>`;
  const root = $('#setTypes');
  renderSetTypeFields();
  root.querySelectorAll('[data-tc]').forEach(i => i.oninput = () => { TYPES[i.dataset.tc].color = i.value; render(); });
  root.querySelectorAll('[data-tl]').forEach(i => i.onchange = () => { TYPES[i.dataset.tl].label = i.value.trim() || TYPES[i.dataset.tl].label; renderSetTypes(); render(); });
  root.querySelectorAll('[data-ts]').forEach(i => i.onchange = () => { TYPES[i.dataset.ts].short = i.value.trim() || TYPES[i.dataset.ts].short; render(); });
  root.querySelectorAll('.icondd-btn').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const list = b.nextElementSibling, open = list.hidden;
    closeIconLists();
    if (open) { const r = b.getBoundingClientRect(); Object.assign(list.style, { left: r.left + 'px', top: r.bottom + 4 + 'px', width: r.width + 'px' }); }
    list.hidden = !open; b.setAttribute('aria-expanded', String(open));
  });
  root.querySelectorAll('.icondd-item').forEach(b => b.onclick = () => { TYPES[b.dataset.ic].icon = b.dataset.icon; renderSetTypes(); render(); });
  root.querySelectorAll('[data-up]').forEach(f => f.onchange = async () => {
    const file = f.files[0]; if (!file) return;
    const clean = sanitizeSvg(await file.text());
    if (!clean){ toast('That file is not an SVG icon.'); f.value = ''; return; }
    Object.assign(TYPES[f.dataset.up], {svgInner: clean.inner, svgView: clean.view, icon: 'custom'});
    toast('Icon uploaded for ' + TYPES[f.dataset.up].label); renderSetTypes(); render();
  });
  root.querySelectorAll('[data-td]').forEach(b => b.onclick = () => { const k = b.dataset.td; toast(TYPES[k].label + ' deleted'); delete TYPES[k]; renderSetTypes(); render(); });
  $('#ntAdd').onclick = () => {
    const name = $('#ntName').value.trim();
    if (!name){ toast('Give the new type a name first.'); return; }
    if (Object.values(TYPES).some(t => t.label.toLowerCase() === name.toLowerCase())){ toast(name + ' already exists.'); return; }
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'type';
    let k = base, i = 2; while (TYPES[k]) k = base + '-' + i++;
    TYPES[k] = {label:name, short:name, color:'#5a6b7d', icon:'other'};
    toast('Added ' + name + '. Pick it when you create an object.'); renderSetTypes(); render();
  };
}
/* Feed on the server: upload the report, and the server applies the policy and the merge rules. */
/* Feed. The Lansweeper API settings are saved in the inventory; the token is on the server. A Lansweeper export
   can also be uploaded here. */
/* The push token made in this panel. undefined until it is loaded; the new token is shown once, here. */
export let pushInfo;
export let pushLast = null;
export let pushNew = '';
export let pushNote = '';
export async function loadPushInfo(){
  const r = await fetch('api/feed/push-token', {credentials: 'same-origin'});
  if (r.ok){ const j = await r.json(); pushInfo = j.info; pushLast = j.last; if ($('#setFeed')) renderSetFeed(); }
}
/* Days since a stamp written by the server ("dd.mm.yyyy hh:mm"). */
/* A date for people: "22 Oct 2026, 18:03". */
export const pushDate = v => (v ? new Date(v).toLocaleString(undefined, {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : '');
/* Under the push token: the last push, and the linked devices that have not been seen for 30 days. */
export function pushStatus(){
  const c = pushLast ? pushLast.counts : null;
  const last = c ? `${pushDate(pushLast.at)}: ${c.created || 0} new, ${c.updated || 0} updated, ${c.links || 0} links, ${c.software || 0} with software${c.ambiguous ? ', ' + c.ambiguous + ' skipped (shared names)' : ''}` : 'No push yet';
  const old = objs.filter(o => o.feed && o.feed.seen && daysSince(o.feed.seen) >= 30);
  const stale = old.length ? `${old.length} linked device${old.length === 1 ? '' : 's'} not seen for 30 days or more: ${old.slice(0, 20).map(o => esc(o.name)).join(', ')}${old.length > 20 ? ' …' : ''}.` : 'All linked devices were seen in the last 30 days.';
  return `<div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label>Last push</label><span>${last}</span></div>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label>Not seen</label><span>${stale}</span></div>`;
}
export function renderSetFeed(){
  if (!LS_ON()){ $('#setFeed').innerHTML = ''; return; }
  if (!st.lansweeper) st.lansweeper = {};
  const L = st.lansweeper, edit = canEdit(), ro = edit ? '' : 'disabled';
  const field = (k, label, hint) => `<label for="ls_${k}">${label}</label><input id="ls_${k}" data-ls="${k}" class="mono" value="${esc(L[k] || '')}" placeholder="${esc(hint)}" ${ro}>`;
  const ready = SERVER.lansweeper && edit;
  if (edit && pushInfo === undefined) loadPushInfo();
  const pushPanel = edit ? `<div class="panelbox" id="lsPushPanel"><div class="hdr">Lansweeper push</div>
    <p class="note" style="padding:10px 12px 6px">A PowerShell script on the Lansweeper server sends its assets here. No API address is needed.</p>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label>Token</label><span>${pushInfo ? `Active since ${esc(pushDate(pushInfo.created))}` : 'None yet. Create one to connect the script.'}</span></div>
    ${pushStatus()}
    ${pushNew ? `<div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label for="pushTok">New token</label><input id="pushTok" class="mono" readonly value="${esc(pushNew)}"></div>
    <p class="note" style="padding:0 12px 10px">Copy it now. It is shown only once. The script asks for it with <code>-SetCredential</code>.</p>` : ''}
    <div class="addrel" style="padding:10px 12px">
      <button id="pushNew" class="primary" ${pushInfo === undefined ? 'disabled' : ''}>${pushInfo ? 'Replace token' : 'Create token'}</button>
      ${pushNew ? '<button id="pushCopy">Copy token</button>' : ''}
      ${pushInfo ? '<button id="pushRevoke" class="danger-text">Revoke</button>' : ''}
      <button id="pushScript" ${pushInfo ? '' : 'disabled title="Create a token first"'}>Download script</button>
      <span class="note" id="pushMsg">${esc(pushNote)}</span></div></div>` : '';
  $('#setFeed').innerHTML = pushPanel + `<div class="panelbox" id="lsApiPanel"><div class="hdr">Lansweeper API <span class="chip warn" title="Not yet verified against a live Lansweeper">Experimental</span></div>
    <div class="note" style="padding:10px 12px">${SERVER.lansweeper ? 'The API token is set on the server.' : 'No API token is set on the server yet. An administrator sets NI_LS_TOKEN (or NI_LS_TOKEN_FILE) on the server; the token is never stored in the inventory.'}</div>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)">
      ${field('endpoint', 'API address', 'https://api.lansweeper.com/api/v2/graphql')}
      ${field('site', 'Site ID', 'empty: the first site of the token')}
      ${field('authScheme', 'Authorization', 'Token')}
    </div>
    <div class="addrel" style="padding:10px 12px"><button id="lsSync" class="primary" ${ready ? '' : 'disabled'}>Sync now</button><span class="note" id="lsMsg"></span></div></div>
  <div class="panelbox"><div class="hdr">Export file <span class="chip warn" title="Import is not yet verified against a live Lansweeper export">Experimental</span></div>
    <div class="note" style="padding:10px 12px">Or upload a Lansweeper report (CSV). Matches are found by serial number, then name. Only the fields the policy allows are changed; what you set by hand stays.</div>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label for="feedUp">Report</label><input id="feedUp" type="file" accept=".csv,text/csv" ${ro}></div>
    <div class="note" style="padding:10px 12px">The server can also import this report every night from a file your administrator sets up.</div></div>`;
  /* One source at a time: show the script push or the API panel, never both. */
  if ($('#lsPushPanel')) $('#lsPushPanel').hidden = st.lsSource === 'api';
  if ($('#lsApiPanel')) $('#lsApiPanel').hidden = st.lsSource !== 'api';
  $('#setFeed').querySelectorAll('[data-ls]').forEach(i => i.onchange = () => { st.lansweeper[i.dataset.ls] = i.value.trim(); queueServerSave(); renderSetFeed(); });
  const pushMsg = t => { const m = $('#pushMsg'); if (m) m.textContent = t; };
  if ($('#pushNew')) $('#pushNew').onclick = async () => {
    const r = await fetch('api/feed/push-token', {method: 'POST', credentials: 'same-origin'});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ pushMsg(j.error || 'The token could not be made.'); return; }
    pushNew = j.token; pushInfo = j.info; pushNote = ''; renderSetFeed();
  };
  /* After a copy the token is hidden again; it can only be read once, then a new token is made. */
  if ($('#pushCopy')) $('#pushCopy').onclick = async () => {
    const box = $('#pushTok'); box.select();
    let copied = false;
    try { await navigator.clipboard.writeText(pushNew); copied = true; } catch { copied = document.execCommand('copy'); }
    if (!copied){ pushMsg('Could not copy. Select the token and copy it by hand.'); return; }
    pushNew = ''; pushNote = 'Copied. The token is hidden now. Make a new one if you need it again.'; renderSetFeed();
  };
  if ($('#pushRevoke')) $('#pushRevoke').onclick = async () => {
    if (!confirm('Revoke the token? The Lansweeper script stops working until you make a new one.')) return;
    const r = await fetch('api/feed/push-token', {method: 'DELETE', credentials: 'same-origin'});
    if (!r.ok){ pushMsg('The token could not be revoked.'); return; }
    pushInfo = null; pushNew = ''; pushNote = ''; renderSetFeed();
  };
  if ($('#pushScript')) $('#pushScript').onclick = () => { window.location.href = 'api/feed/push-script'; };
  const bad = t => `<span style="color:var(--danger)">${esc(t)}</span>`;
  $('#lsSync').onclick = async () => {
    const msg = $('#lsMsg'), btn = $('#lsSync');
    btn.disabled = true; msg.textContent = 'Syncing…';
    await flushSave();
    const r = await fetch('api/feed/sync', {method: 'POST', credentials: 'same-origin'});
    const j = await r.json().catch(() => ({}));
    btn.disabled = false;
    if (!r.ok){ msg.innerHTML = bad(j.error || 'The sync failed.'); return; }
    const c = j.counts;
    msg.textContent = `${c.assets} assets: ${c.created} new, ${c.updated} updated, ${c.linked} linked${c.excluded ? ', ' + c.excluded + ' excluded' : ''}${c.ambiguous ? ', ' + c.ambiguous + ' skipped (shared names)' : ''}.`;
    await reloadFromServer();
  };
  $('#feedUp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const r = await fetch('api/feed/import', {method: 'POST', headers: {'Content-Type': 'text/csv'}, credentials: 'same-origin', body: await f.text()});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'The export could not be imported.'); return; }
    const c = j.counts;
    toast(`Import: ${c.created} new, ${c.updated} updated, ${c.linked} linked, ${c.unchanged} unchanged${c.ambiguous ? ', ' + c.ambiguous + ' skipped (shared names)' : ''}`);
    await reloadFromServer();
  };
}
/* The feed is optional: without one, every object is entered and kept by hand. */

