/* Settings → Users: the people, where each comes from, their role, login, password and entry sheet; the company
   (name and logo for the entry sheets). */
import { modal, closeModal } from './19-modal.js';
import { resetFilters } from './02-views.js';
import { sheetModal } from './08-sheets.js';
import { SERVER, queueServerSave, render, flushSave, reloadFromServer } from './07-render.js';
import { duplicateGroups, keepOf, pairKey } from './people-match.js';
import { USERS, who, roleLabel, me, userId, openSettings, isAdmin } from './04-settings.js';
import { $$, menuHtml, objs, st, $, PW_MIN, toast, toastUndo, hist, now, COMPANY, COSTS, SITES } from './01-core.js';
import { html, rawHtml } from './html.js';
/* People whose name and department come from a directory: LDAP, or Entra for those Entra added. */
const fromDirectory = u => u.source === 'ldap' || u.source === 'entra';
/* Where a person comes from, and whether Entra knows them too: one chip, a coloured dot for each, the details in the tooltip.
   A disabled or deleted Entra account is said in words. */
export function sourceChips(u){
  const src = ['ldap', 'lansweeper', 'entra'].includes(u.source) ? u.source : 'manual';
  const from = {ldap: ['LDAP', 'From the directory (LDAP sync)'], lansweeper: ['Lansweeper', "Named as a device's user by Lansweeper"], entra: ['Entra', 'Added from Microsoft Entra: the primary user of a device'], manual: ['Manual', 'Added here']}[src];
  const e = u.entra, own = src === 'entra';
  const entraTip = !e ? '' : e.gone ? `Was in Microsoft Entra until ${e.gone}`
    : ['In Microsoft Entra' + (e.upn ? ' as ' + e.upn : ''), e.synced ? 'synced from the on-premises AD' : 'cloud only', e.enabled === false ? 'account disabled' : ''].filter(Boolean).join(', ');
  const entra = !e || (own && !e.gone && e.enabled !== false) ? ''
    : e.gone ? html`<span class="usrc-part muted">${own ? 'gone' : 'Entra gone'}</span>`
    : e.enabled === false ? html`<span class="usrc-part warn">${own ? 'disabled' : 'Entra disabled'}</span>`
    : html`<span class="usrc-part"><span class="sdot entra" aria-hidden="true"></span>Entra</span>`;
  const tip = [from[1], !own || e && (e.gone || e.enabled === false) ? entraTip : ''].filter(Boolean).join(' · ');
  return String(html`<span class="chip kept usrc" title="${tip}"><span class="usrc-part"><span class="sdot ${src}" aria-hidden="true"></span>${from[0]}</span>${entra}</span>`);
}
const ROLE_TIPS = { admin: 'Admin: can change everything', viewer: 'Viewer: can sign in and look, changes nothing', none: 'No access: cannot sign in; the inventory only names their devices' };
/* People a directory or Lansweeper brought in who are viewers: the ones Remove access for imported viewers takes it from. */
const foundViewers = () => USERS.filter(u => u.role === 'viewer' && ['ldap', 'entra', 'lansweeper'].includes(u.source) && u.id !== (me() || {}).id);
/* Maybe the same person (public/js/people-match.js). A login or UPN shared with a record a sync made is merged at each
   sync by itself; left here are the same name, or a login shared with a person made by hand. Each group says why, keeps the record
   the sources trust most (picked here, changeable), and merges on the server: devices, entry sheets and the sign-in go
   with it, the other names stay as aliases. Not the same hides the pair for good. Admins only. */
const WHY = { login: 'Same login, e-mail or UPN (one of them made by hand)', name: 'Same name' };
let DUPES = [];
function dupesHtml(devicesOfUser){
  if (!isAdmin()) return '';
  DUPES = duplicateGroups(USERS, st.peopleNotSame || []).map(g => ({ ...g, people: g.ids.map(id => USERS.find(u => u.id === id)).filter(Boolean) })).filter(g => g.people.length > 1);
  if (!DUPES.length) return '';
  const who = u => [u.login, u.profile && u.profile.mail, u.entra && u.entra.upn].filter((v, i, a) => v && a.indexOf(v) === i).join(' · ');
  return html`<details class="udupes" ${st.userDupesOpen === false ? '' : 'open'}><summary><b>Maybe the same person</b> <span class="chip warn">${DUPES.length}</span> <span class="muted">a shared login is merged at each sync; these only look alike</span></summary>
    ${DUPES.map((g, gi) => { const keep = keepOf(g.people); return html`<div class="udupe" data-dupe="${gi}"><div class="udupe-why">${WHY[g.why]}</div>
      ${g.people.map(u => html`<label class="udupe-p"><input type="radio" name="dk${gi}" value="${u.id}" ${u.id === keep.id ? 'checked' : ''} ${u.source === 'ldap' || g.people.every(x => x.source !== 'ldap') ? '' : 'disabled'}> <span class="usrcs">${rawHtml(sourceChips(u))}</span> <b>${u.name}</b> <span class="muted">${who(u)}${u.dept ? ' · ' + u.dept : ''} · ${devicesOfUser(u.name)} device${devicesOfUser(u.name) === 1 ? '' : 's'}${u.active === false ? ' · deactivated' : ''}</span></label>`)}
      <div class="udupe-acts"><span class="note">Keep the ticked one; the others are merged into it.</span><span class="grow"></span><button type="button" data-dnot="${gi}">Not the same</button><button type="button" class="primary" data-dmerge="${gi}">Merge</button></div></div>`; })}</details>`;
}
function wireDupes(){
  const d = $('.udupes'); if (d) d.ontoggle = () => { st.userDupesOpen = d.open; };
  $$('[data-dnot]').forEach(b => b.onclick = () => {
    const g = DUPES[+b.dataset.dnot]; if (!g) return;
    const keys = new Set(st.peopleNotSame || []);
    for (let i = 0; i < g.people.length; i++) for (let j = i + 1; j < g.people.length; j++) keys.add(pairKey(g.people[i].id, g.people[j].id));
    st.peopleNotSame = [...keys]; queueServerSave(); renderSetUsers(); toast('Kept apart: not shown as duplicates again');
  });
  $$('[data-dmerge]').forEach(b => b.onclick = async () => {
    const gi = +b.dataset.dmerge, g = DUPES[gi]; if (!g) return;
    const keepId = ($(`input[name="dk${gi}"]:checked`) || {}).value, keep = g.people.find(u => u.id === keepId); if (!keep) return;
    const drop = g.people.filter(u => u.id !== keepId);
    const logins = drop.filter(u => u.login && u.login !== keep.login);
    if (!confirm(`Merge ${drop.map(u => u.name).join(', ')} into ${keep.name}?\n\nTheir devices and entry sheets go to ${keep.name}; their names and logins stay as other names, so the syncs find the person again.${logins.length && keep.login ? `\n${logins.map(u => u.login).join(', ')} can no longer sign in: ${keep.name} signs in as ${keep.login}.` : ''}\nA backup is taken first.`)) return;
    b.disabled = true;
    await flushSave();
    let moved = 0;
    try {
      for (const u of drop) {
        const r = await fetch('api/users/merge', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keep: keep.id, drop: u.id }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'The merge did not work.');
        moved += j.moved || 0;
      }
      toast(`Merged into ${keep.name}${moved ? `: ${moved} device${moved === 1 ? '' : 's'} moved` : ''}`);
    } catch (e) { toast(e.message); }
    await reloadFromServer({ discard: true }); renderSetUsers();
  });
}
/* What a viewer sees (server/scope.js): everything, the devices of some sites, or only their own devices. The server
   sends them nothing else. */
const seesText = u => u.own ? 'Sees: own devices' : Array.isArray(u.sites) && u.sites.length ? `Sees: ${u.sites.length === 1 ? u.sites[0] : u.sites.length + ' sites'}` : 'Sees: everything';
function seesModal(u){
  const sites = SITES.map(x => typeof x === 'string' ? x : x && x.name).filter(Boolean);
  const cur = u.own ? 'own' : Array.isArray(u.sites) && u.sites.length ? 'sites' : 'all';
  modal(html`<div class="mh">What ${u.name} sees</div><div class="mb">
    <label class="pchk" style="width:auto"><input type="radio" name="sees" value="all" ${cur === 'all' ? 'checked' : ''}> Everything</label>
    <label class="pchk" style="width:auto"><input type="radio" name="sees" value="sites" ${cur === 'sites' ? 'checked' : ''} ${sites.length ? '' : 'disabled'}> Only the devices of these sites${sites.length ? '' : ' (add sites in Settings → Locations first)'}</label>
    <div class="usees-sites">${sites.map(n => html`<label class="pchk" style="width:auto"><input type="checkbox" data-site="${n}" ${(u.sites || []).includes(n) ? 'checked' : ''}> ${n}</label>`)}</div>
    <label class="pchk" style="width:auto"><input type="radio" name="sees" value="own" ${cur === 'own' ? 'checked' : ''}> Only their own devices: they can confirm they have them and report a problem</label>
    <p class="note">The server sends them nothing else: no other devices, their history, photos, reports or labels.</p></div>
    <div class="mf"><button id="seCancel">Cancel</button><button id="seOk" class="primary">Save</button></div>`, 'sm');
  $('#seCancel').onclick = closeModal;
  /* Ticking a site means "only these sites": that choice is made with it, so Save does what the boxes show. */
  $$('[data-site]').forEach(b => b.onchange = () => { if (b.checked) { const r = $('input[name=sees][value=sites]'); if (r) r.checked = true; } });
  $('#seOk').onclick = () => {
    const how = ($('input[name=sees]:checked') || {}).value;
    const picked = [...$$('[data-site]:checked')].map(c => c.dataset.site);
    if (how === 'sites' && !picked.length){ toast('Tick at least one site.'); return; }
    delete u.own; delete u.sites;
    if (how === 'own') u.own = true; else if (how === 'sites') u.sites = picked;
    queueServerSave(); closeModal(); renderSetUsers(); toast(`${u.name}: ${seesText(u).replace('Sees: ', 'sees ')}`);
  };
}
/* Viewers from groups (public/js/group-roles.js): a group of AD (its name or DN) or of Entra (its object ID) gives a role
   and sites, at each directory sync and sign-in. */
const groupRules = () => Array.isArray(st.groupRoles) ? st.groupRoles : [];
function groupRolesHtml(){
  if (!isAdmin()) return '';
  const rules = groupRules(), by = g => USERS.filter(u => u.roleBy === g).length;
  return html`<div class="panelbox" id="groupRoles"><div class="hdr">Viewers from groups <span class="cnt">${rules.length || 'none'}</span></div>
    <p class="note">A person in one of these groups may sign in and look (as a viewer), limited to the sites of the first group that matches; checked at each directory sync and sign-in. AD groups by name or distinguished name; Entra groups by their object ID, which Microsoft sign-in sends when the app registration includes the groups claim. Admins come from the directory's admin group. Out of every group again: No access.</p>
    ${rules.length ? html`<table class="grid mini stack"><thead><tr><th>Group</th><th>Sites</th><th>Viewers now</th><th><span class="sr-only">Change or remove</span></th></tr></thead><tbody>${rules.map((r, i) => html`<tr>
      <td class="mono">${r.group}</td><td>${(r.sites || []).length ? r.sites.join(', ') : html`<span class="muted">All</span>`}</td><td class="n">${by(r.group)}</td>
      <td data-label=""><div class="gr-acts"><button type="button" class="mini" data-gredit="${i}">Change…</button><button type="button" class="mini" data-grdel="${i}" aria-label="Remove the group ${r.group}">Remove</button></div></td></tr>`)}</tbody></table>` : ''}
    <div class="addrel"><span class="grow"></span><button type="button" id="grAdd">Add a group…</button></div></div>`;
}
function groupRuleModal(i){
  const rules = groupRules(), r = i === null ? { group: '', sites: [] } : rules[i];
  const sites = SITES.map(x => typeof x === 'string' ? x : x && x.name).filter(Boolean);
  modal(html`<div class="mh">${i === null ? 'Add a group' : 'Change the group'}</div><div class="mb"><div class="form">
      <label for="grGroup">Group</label><input id="grGroup" class="mono" maxlength="300" value="${r.group}" placeholder="IT-Bern, CN=IT-Bern,OU=… or an Entra group ID" list="grKnown">
      <datalist id="grKnown">${[...new Set(USERS.flatMap(u => u.groups || []))].sort().map(g => html`<option value="${g}">`)}</datalist>
      <span class="lbl">Sites</span><div class="usees-sites">${sites.length ? sites.map(n => html`<label class="pchk" style="width:auto"><input type="checkbox" data-grsite="${n}" ${(r.sites || []).includes(n) ? 'checked' : ''}> ${n}</label>`) : html`<span class="muted">No sites yet: the rule gives all sites.</span>`}</div>
    </div><p class="note" id="grSitesNote">No site ticked: all sites. It takes effect at the next directory sync or sign-in of each person.</p></div>
    <div class="mf"><button id="grCancel">Cancel</button><button id="grOk" class="primary">Save</button></div>`, 'sm');
  $('#grCancel').onclick = closeModal;
  $('#grOk').onclick = () => {
    const group = $('#grGroup').value.trim();
    if (!group){ toast('Name the group.'); $('#grGroup').focus(); return; }
    if (rules.some((x, j) => j !== i && x.group.toLowerCase() === group.toLowerCase())){ toast('This group is listed already.'); return; }
    const next = { group, sites: [...$$('[data-grsite]:checked')].map(c => c.dataset.grsite) };
    if (!next.sites.length) delete next.sites;
    st.groupRoles = i === null ? [...rules, next] : rules.map((x, j) => j === i ? next : x);
    queueServerSave(); closeModal(); renderSetAccess(); toast(`${group}: viewers${next.sites ? ` of ${next.sites.join(', ')}` : ''}, from the next sync or sign-in`);
  };
}
/* Settings → Users → Access: who may look by their groups. The API tokens follow it (settings-api.js). */
export function renderSetAccess(){
  const el = $('#setAccess'); if (!el) return;
  el.innerHTML = groupRolesHtml();
  wireGroupRoles();
}
function wireGroupRoles(){
  const add = $('#grAdd'); if (add) add.onclick = () => groupRuleModal(null);
  $$('[data-gredit]').forEach(b => b.onclick = () => groupRuleModal(+b.dataset.gredit));
  $$('[data-grdel]').forEach(b => b.onclick = () => {
    const before = groupRules(), r = before[+b.dataset.grdel];
    st.groupRoles = before.filter((x, j) => j !== +b.dataset.grdel);
    queueServerSave(); renderSetAccess();
    toastUndo(`${r.group} removed`, () => { st.groupRoles = before; queueServerSave(); renderSetAccess(); });
  });
}
export function renderSetUsers(){
  /* Devices per person, counted in one pass: asking each person's count separately went through every device each time. */
  const devCount = new Map();
  for (const o of objs){ const n = o.user; if (n) devCount.set(n, (devCount.get(n) || 0) + 1); }
  const devicesOfUser = name => devCount.get(name) || 0;
  /* Where each person is known: in the directory (LDAP), in Entra, in both, or in neither. The filter shows one group. */
  const inLdap = u => u.source === 'ldap', inEntra = u => !!(u.entra && !u.entra.gone);
  /** @type {Record<string, [string, (u: any) => boolean]>} */
  const DIRS = {both: ['LDAP and Entra', u => inLdap(u) && inEntra(u)], ldap: ['LDAP only', u => inLdap(u) && !inEntra(u)], entra: ['Entra only', u => !inLdap(u) && inEntra(u)], none: ['Neither', u => !inLdap(u) && !inEntra(u)]};
  const dirOn = USERS.some(inLdap) || USERS.some(u => u.entra);
  if (!dirOn || !DIRS[st.userDir]) st.userDir = '';
  /* Title, office, manager, phones and e-mail from the directory or Entra: the title and office under the name, all of it on hover. */
  const PROFILE = [['title', 'Title'], ['office', 'Office'], ['manager', 'Manager'], ['phone', 'Phone'], ['mobile', 'Mobile'], ['mail', 'E-mail']];
  const profileTip = u => u.profile ? PROFILE.filter(([k]) => u.profile[k]).map(([k, l]) => `\n${l}: ${u.profile[k]}`).join('') : '';
  const profileLine = u => u.profile && (u.profile.title || u.profile.office) ? html`<div class="usub">${[u.profile.title, u.profile.office].filter(Boolean).join(' · ')}</div>` : '';
  /* Search and filters: by name, login, department, e-mail or UPN (and the other names a merge kept); by source,
     status, role, and whether they have devices. */
  const q = String(st.userQ || '').trim().toLowerCase();
  const srcOf = u => ['ldap', 'lansweeper', 'entra'].includes(u.source) ? u.source : 'manual';
  /* Accounts (people who may sign in) and the people only known as device users (No access) are listed apart; a search
     or a role filter looks through everybody. */
  const noAccess = u => (u.role || 'viewer') === 'none';
  /** @type {Record<string, [string, (u: any) => boolean]>} */
  const KINDS = {acc: ['Accounts', u => !noAccess(u)], ppl: ['People without access', noAccess], all: ['Everybody', () => true]};
  if (!KINDS[st.userKind]) st.userKind = USERS.some(noAccess) ? 'acc' : 'all';
  const kindOk = u => !!(String(st.userQ || '').trim() || st.userRole) || KINDS[st.userKind][1](u);
  const shown = u => kindOk(u) && (!st.userDir || DIRS[st.userDir][1](u)) && (!st.userSrc || srcOf(u) === st.userSrc)
    && (!st.userStatus || (st.userStatus === 'active') === (u.active !== false)) && (!st.userRole || (u.role || 'viewer') === st.userRole)
    && (!st.userDevs || devicesOfUser(u.name) > 0)
    && (!q || [u.name, u.login, u.dept, u.profile && u.profile.mail, u.entra && u.entra.upn, ...(u.aliases || [])].some(v => v && String(v).toLowerCase().includes(q)));
  const nShown = USERS.filter(shown).length, filtering = !!(q || st.userDir || st.userSrc || st.userStatus || st.userRole || st.userDevs);
  const sel = (id, label, cur, opts) => html`<select id="${id}" aria-label="${label}">${opts.map(([v, l]) => html`<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`)}</select>`;
  const kindTabs = USERS.some(noAccess) ? html`<div class="settabs setsub ukinds" role="group" aria-label="Show">${Object.entries(KINDS).map(([k, [l, f]]) => html`<button type="button" class="tab${st.userKind === k ? ' active' : ''}" data-ukind="${k}" aria-pressed="${String(st.userKind === k)}">${l} <span class="cnt">${USERS.filter(f).length}</span></button>`)}</div>` : '';
  const filterBar = html`<div class="addrel ufilters"><input id="uQ" type="search" placeholder="Search name, login, e-mail…" value="${st.userQ || ''}" aria-label="Search the users" autocomplete="off">
    ${sel('uSrc', 'Source', st.userSrc || '', [['', 'All sources'], ['ldap', 'LDAP'], ['entra', 'Entra'], ['lansweeper', 'Lansweeper'], ['manual', 'Manual']])}
    ${sel('uStatus', 'Status', st.userStatus || '', [['', 'Active and not'], ['active', 'Active'], ['inactive', 'Deactivated']])}
    ${sel('uRole', 'Role', st.userRole || '', [['', 'All roles'], ['admin', 'Admin'], ['viewer', 'Viewer'], ['none', 'No access']])}
    <label class="pchk" style="width:auto"><input type="checkbox" id="uDevs" ${st.userDevs ? 'checked' : ''}> With devices</label>
    <span class="muted">${filtering ? `${nShown} of ${USERS.length}` : ''}</span>${filtering ? html`<button type="button" class="link" id="uClear">Clear</button>` : ''}</div>`;
  const rows = USERS.map((u, i) => [u, i]).filter(([u]) => shown(u)).map(([u, i]) => html`<tr>
      ${fromDirectory(u) ? html`<td title="From ${u.source === 'ldap' ? 'LDAP' : 'Entra'}: changed there${profileTip(u)}">${u.name}${profileLine(u)}</td>` : html`<td><input data-uname="${i}" maxlength="80" value="${u.name}" aria-label="Name of ${u.name}"></td>`}<td class="mono">${u.login || '-'}</td>
      ${fromDirectory(u) ? html`<td>${u.dept || ''}</td>` : html`<td><input data-udept="${i}" maxlength="80" value="${u.dept || ''}" placeholder="Department" aria-label="Department of ${u.name}"></td>`}<td>${(u.groups || []).join(', ')}</td>
      <td><span class="usrcs">${rawHtml(sourceChips(u))}</span></td>
      <td class="n"><a class="link" data-devs="${i}">${devicesOfUser(u.name)}</a></td>
      <td><div class="urole"><select data-role="${i}" aria-label="Role of ${u.name}" title="${ROLE_TIPS[u.role] || ROLE_TIPS.viewer}"><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option><option value="viewer" ${u.role === 'viewer' || !u.role ? 'selected' : ''}>Viewer</option><option value="none" ${u.role === 'none' ? 'selected' : ''}>No access</option></select>${u.roleBy ? html`<span class="chip kept ugrp" title="Given by the group ${u.roleBy} (Roles from groups below); the next sync gives it again while they are in it">group</span>` : ''}${u.role === 'viewer' || u.role === 'editor' || !u.role ? html`<button type="button" class="link usees" data-sees="${i}" title="${u.role === 'editor' ? 'What this editor sees and changes' : 'What this viewer sees'}">${seesText(u)}</button>` : ''}</div></td>
      <td><input type="checkbox" data-act="${i}" ${u.active ? 'checked' : ''} aria-label="Active"></td>
      <td class="umenu-c">${rawHtml(menuHtml('⋯', html`
        ${SERVER.on && u.source !== 'ldap' ? (u.login ? html`<button data-pw="${i}" title="Set this user's password">Set password…</button>` : html`<button data-login="${i}" title="Give this user a login name">Give a login name…</button>`) : ''}
        ${SERVER.on ? html`<button data-sheet="${i}" title="Print the devices handed out and a new initial Windows password">Entry sheet…</button>${devicesOfUser(u.name) ? html`<a class="link uhand" href="api/reports/handback?id=${encodeURIComponent(u.id)}&format=pdf" download title="The devices ${u.name} has, as a PDF to tick off when they are handed back">Hand-back list (PDF)</a>` : ''}` : ''}
        <button class="danger-text" data-del="${i}" ${u.source === 'ldap' ? html`disabled title="Managed by LDAP"` : devicesOfUser(u.name) ? html`disabled title="Has devices. Move them first."` : html`title="Remove"`}>Remove</button>`, { cls: 'umenu', btn: String(html`aria-label="More for ${u.name}" title="Password, entry sheet, remove"`) }))}</td></tr>`);
  $('#setUsers').innerHTML = html`<div class="panelbox"><div class="hdr">Users <span class="cnt">${USERS.filter(u => u.active).length} active of ${USERS.length}</span></div>
    <details class="how u-how"><summary>What the roles and columns mean</summary><p class="note">Admin can change everything, Viewer can look (everything, some sites or only their own devices), No access lets nobody in (people found by LDAP, Entra or Lansweeper start with No access; give them Viewer to let them in). Each device names its user. The Devices count lists them, and clicking it shows those devices. Users from LDAP can't be removed here, only deactivated. Source says where each person comes from and whether Microsoft Entra knows them too (Settings → Entra &amp; Intune → People).</p></details>
    ${dirOn || foundViewers().length ? html`<div class="addrel">${dirOn ? html`<label class="muted" for="userDir">Show</label><select id="userDir"><option value="">Everybody (${USERS.length})</option>${Object.entries(DIRS).map(([k, [l, f]]) => html`<option value="${k}" ${st.userDir === k ? 'selected' : ''}>${l} (${USERS.filter(f).length})</option>`)}</select>` : ''}<span class="grow"></span>${foundViewers().length ? html`<button id="noneAll" title="Imported people with the role Viewer get No access. Admins, people added here and you keep yours.">Remove access for ${foundViewers().length} imported ${foundViewers().length === 1 ? 'viewer' : 'viewers'}…</button>` : ''}</div>` : ''}
    ${dupesHtml(devicesOfUser)}${kindTabs}${filterBar}
    ${rows.length ? '' : html`<p class="note" style="padding:10px 12px">Nobody matches. <button type="button" class="link" data-uclear="1">Clear the search and filters</button></p>`}
    <div style="overflow-x:auto"><table class="grid mini stack" style="min-width:1020px;table-layout:fixed"><colgroup><col style="width:17%"><col style="width:10%"><col style="width:14%"><col style="width:11%"><col style="width:14%"><col style="width:7%"><col style="width:12%"><col style="width:7%"><col style="width:8%"></colgroup><thead><tr><th>Name</th><th>Login</th><th>Department</th><th>Groups</th><th>Source</th><th>Devices</th><th>Role</th><th>Active</th><th><span class="sr-only">More</span></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="addrel"><input id="nuFirst" placeholder="First name" style="min-width:130px" aria-label="First name"><input id="nuLast" placeholder="Last name" style="min-width:130px" aria-label="Last name"><input id="nuDept" placeholder="Department" style="min-width:120px" aria-label="Department"></div>
    <div class="addrel"><input id="nuLogin" placeholder="Login (optional, lets them sign in)" style="min-width:200px" aria-label="Login" autocomplete="off"><input id="nuPw" type="password" placeholder="Password (min. ${PW_MIN})" style="min-width:160px" aria-label="Password" autocomplete="new-password"><select id="nuRole" aria-label="Role"><option value="viewer">Viewer</option><option value="admin">Admin</option><option value="none">No access</option></select><button id="nuAdd">Add user</button></div></div>`;
  const root = $('#setUsers');
  const ud = $('#userDir'); if (ud) ud.onchange = () => { st.userDir = ud.value; renderSetUsers(); };
  /* The search redraws as one types; the field keeps the focus and the caret. */
  const uq = $('#uQ'); if (uq) uq.oninput = () => { st.userQ = uq.value; const at = uq.selectionStart; renderSetUsers(); const n = $('#uQ'); if (n){ n.focus(); n.setSelectionRange(at, at); } };
  [['uSrc', 'userSrc'], ['uStatus', 'userStatus'], ['uRole', 'userRole']].forEach(([id, k]) => { const e = $('#' + id); if (e) e.onchange = () => { st[k] = e.value; renderSetUsers(); }; });
  root.querySelectorAll('[data-ukind]').forEach(b => b.onclick = () => { st.userKind = b.dataset.ukind; renderSetUsers(); });
  const uv = $('#uDevs'); if (uv) uv.onchange = () => { st.userDevs = uv.checked; renderSetUsers(); };
  root.querySelectorAll('#uClear, [data-uclear]').forEach(b => b.onclick = () => { st.userQ = st.userDir = st.userSrc = st.userStatus = st.userRole = ''; st.userDevs = false; renderSetUsers(); });
  wireDupes();
  root.querySelectorAll('[data-devs]').forEach(a => a.onclick = () => showDevicesOf(USERS[+a.dataset.devs].id));
  /* Admins that are active: the inventory needs at least one of them, so the page refuses what the server would refuse. */
  const activeAdmins = () => USERS.filter(x => x.role === 'admin' && x.active !== false).length;
  root.querySelectorAll('[data-act]').forEach(c => c.onchange = () => {
    const u = USERS[+c.dataset.act];
    if (!c.checked && u.role === 'admin' && activeAdmins() <= 1){ toast('At least one active admin is needed.'); c.checked = true; return; }
    u.active = c.checked;
    /* When they left: the Overview lists their devices to take back, the oldest first. */
    delete u.leftBy; if (c.checked) delete u.leftAt; else u.leftAt = new Date().toISOString();
    queueServerSave(); renderSetUsers();
  });
  /* A user entered here or named by Lansweeper can be renamed; their devices move to the new name with them. Users from
     LDAP are named in the directory. */
  root.querySelectorAll('[data-uname]').forEach(i => i.onchange = () => {
    const u = USERS[+i.dataset.uname], was = u.name, name = i.value.trim().replace(/\s+/g, ' ');
    if (!name){ i.value = was; toast('A user needs a name.'); return; }
    if (name === was) return;
    if (USERS.some(x => x !== u && x.name.toLowerCase() === name.toLowerCase())){ i.value = was; toast(name + ' is already a user.'); return; }
    u.name = name; delete u.first; delete u.last;
    /* The devices keep the person's id, so they show the new name by themselves; each gets a history line. */
    for (const o of objs) if (o.uid === u.id) hist(o, now(), `User ${was} renamed to ${name} by ${who()}`);
    queueServerSave(); toast(`${was} is now ${name}`); renderSetUsers(); render();
  });
  root.querySelectorAll('[data-udept]').forEach(i => i.onchange = () => {
    const u = USERS[+i.dataset.udept], dept = i.value.trim();
    if (dept) u.dept = dept; else delete u.dept;
    delete u.deptFrom;   /* typed here: no longer Entra's */
    queueServerSave(); toast('Department saved'); renderSetUsers();
  });
  root.querySelectorAll('[data-pw]').forEach(b => b.onclick = () => passwordModal(USERS[+b.dataset.pw]));
  root.querySelectorAll('[data-login]').forEach(b => b.onclick = () => userLoginModal(USERS[+b.dataset.login]));
  root.querySelectorAll('[data-sheet]').forEach(b => b.onclick = () => sheetModal(USERS[+b.dataset.sheet]));
  const na = $('#noneAll');
  if (na) na.onclick = () => {
    const list = foundViewers(), n = list.length, people = n === 1 ? '1 imported viewer' : `${n} imported viewers`;
    /* Asked in the app's own dialog, which says who is affected and who is not, and can be undone right after. */
    modal(html`<div class="mh">Remove access for ${people}?</div>
      <div class="mb"><p class="note">People imported from LDAP, Microsoft Entra or Lansweeper who have the role <b>Viewer</b> get <b>No access</b>: they can no longer sign in. Their devices and details stay.</p>
      <p class="note">Admins, people added here and your own account keep their access. You can give anyone Viewer again at any time.</p></div>
      <div class="mf"><button id="naCancel">Cancel</button><button id="naOk" class="danger-text">Remove access</button></div>`, 'sm');
    $('#naCancel').onclick = closeModal;
    $('#naOk').onclick = () => {
      const was = list.map(u => [u, u.role]);
      list.forEach(u => { u.role = 'none'; });
      closeModal(); queueServerSave(); renderSetUsers();
      toastUndo(`${people} set to No access`, () => { was.forEach(([u, r]) => { u.role = r; }); queueServerSave(); renderSetUsers(); });
    };
  };
  root.querySelectorAll('[data-sees]').forEach(b => b.onclick = () => seesModal(USERS[+b.dataset.sees]));
  root.querySelectorAll('[data-role]').forEach(sel => sel.onchange = () => {
    const u = USERS[+sel.dataset.role];
    if (u.role === 'admin' && sel.value !== 'admin' && u.active !== false && activeAdmins() <= 1){ toast('At least one active admin is needed.'); renderSetUsers(); return; }
    u.role = sel.value; queueServerSave(); toast(`${u.name} is now ${roleLabel(u)}`); renderSetUsers();
  });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const u = USERS[+b.dataset.del];
    if (me() && String(u.id) === String(me().id)){ toast("You can't remove yourself."); return; }
    if (u.role === 'admin' && u.active !== false && activeAdmins() <= 1){ toast('At least one active admin is needed.'); return; }
    USERS.splice(+b.dataset.del, 1); queueServerSave(); toast(u.name + ' removed'); renderSetUsers();
  });
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
/* The company the inventory belongs to: its name and logo, printed on entry sheets instead of NOBS Inventory. A logo is
   scaled to fit 600 × 200 and kept as a PNG, so an SVG, WebP or GIF works as well. */
export function renderSetCompany(){
  const el = $('#setCompany'); if (!el) return;
  const edit = isAdmin();
  el.innerHTML = html`<div class="panelbox"><div class="hdr">Company</div>
    <p class="note">The name and logo on entry sheets, printed and as PDF (without them the sheets show NOBS Inventory), and the currency of every price and cost.</p>
    <div class="form" style="padding:10px 12px;grid-template-columns:170px minmax(0,1fr)">
      <label for="coName">Company name</label><input id="coName" maxlength="80" value="${COMPANY.name}" placeholder="e.g. Example AG" ${edit ? '' : 'disabled'}>
      <label>Logo</label><div class="ctlrow" style="align-items:center"><span class="company-logo">${COMPANY.logo ? html`<img src="${COMPANY.logo}" alt="Company logo">` : html`<span class="muted">No logo</span>`}</span>
        <span class="unit" style="display:flex;gap:6px;align-items:center"><button id="coPick" ${edit ? '' : 'disabled'}>${COMPANY.logo ? 'Replace logo…' : 'Choose logo…'}</button>${COMPANY.logo ? html`<button id="coDel" class="icon ghost" title="Remove the logo" aria-label="Remove the logo" ${edit ? '' : 'disabled'}>×</button>` : ''}</span>
        <input id="coFile" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" hidden></div>
      <label for="ctCur">Currency</label><div class="ctlrow"><input id="ctCur" maxlength="5" value="${COSTS.currency || 'CHF'}" style="flex:none;width:90px" placeholder="CHF" ${edit ? '' : 'disabled'}><span class="muted">a short code such as CHF or EUR</span></div>
    </div><p class="note" id="coMsg" role="status" style="padding:0 12px 10px"></p></div>`;
  $('#coName').onchange = e => { COMPANY.name = e.target.value.trim(); queueServerSave(); toast('Company name saved'); };
  $('#ctCur').onchange = e => { const v = e.target.value.trim().toUpperCase(); if (!/^[A-Z€$£¥]{1,5}$/.test(v)){ toast('The currency is a short code such as CHF or EUR.'); e.target.value = COSTS.currency; return; } COSTS.currency = v; queueServerSave(); render(); toast('Currency saved'); };
  $('#coPick').onclick = () => $('#coFile').click();
  const del = $('#coDel'); if (del) del.onclick = () => { COMPANY.logo = ''; queueServerSave(); renderSetCompany(); toast('Logo removed'); };
  $('#coFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const msg = $('#coMsg');
    if (f.size > 5 * 1024 * 1024){ msg.textContent = 'The file is larger than 5 MB.'; return; }
    try {
      const url = URL.createObjectURL(f);
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('This file is not an image the browser can read.')); i.src = url; });
      URL.revokeObjectURL(url);
      const w = img.naturalWidth || 600, h = img.naturalHeight || 200, k = Math.min(1, 600 / w, 200 / h);
      const c = Object.assign(document.createElement('canvas'), {width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k))});
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const png = c.toDataURL('image/png');
      if (png.length > 560000){ msg.textContent = 'The logo is too detailed to keep. Try a simpler or smaller picture.'; return; }
      COMPANY.logo = png; queueServerSave(); renderSetCompany(); toast('Logo saved');
    } catch (err) { msg.textContent = err.message; }
  };
}
/* A manual user without a login: the login and the first password are set together, so the user can sign in at once. */
export function userLoginModal(u){
  modal(html`<div class="mh">Login name for ${u.name}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="lgNew">Login name</label><input id="lgNew" class="mono" autocomplete="off">
      <label for="lgNewPw">Password</label><input id="lgNewPw" type="password" autocomplete="new-password" placeholder="At least ${PW_MIN} characters">
    </div><p class="note" id="lgNewErr">The login and password let ${u.name} sign in.</p></div>
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
/* Shows one person's devices: the Table filtered by that person (by id, not by a search for the name), with the person's
   own bar on top: hand-back list, entry sheet, take all back. A name no person has is searched for instead. */
export function showDevicesOf(nameOrId){
  closeModal();
  const u = USERS.find(x => x.id === nameOrId) || USERS.find(x => x.name === nameOrId);
  /* Every other filter goes (the Table's column filters too), so the person's devices are all there. */
  resetFilters();
  st.scope = null; st.rvSrc = ''; st.rvKnown = st.rvOld = false; st.bulk = new Set();
  if (u){ st.person = u.id; st.q = ''; st.live = true; st.tab = 'table'; }
  else { st.person = null; st.q = String(nameOrId || ''); st.tab = 'cards'; st.cardsGroup = 'none'; }
  render();
}
export function passwordModal(u){
  modal(html`<div class="mh">Password for ${u.name}</div>
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
