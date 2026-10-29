/* Settings → Users: the people, where each comes from, their role, login, password and entry sheet; the company
   (name and logo for the entry sheets). */
import { modal, closeModal } from './19-modal.js';
import { sheetModal } from './08-sheets.js';
import { SERVER, queueServerSave, render, flushSave } from './07-render.js';
import { USERS, who, roleLabel, me, userId, openSettings, canEdit } from './04-settings.js';
import { esc, objs, st, $, PW_MIN, toast, toastUndo, hist, now, COMPANY } from './01-core.js';
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
    : e.gone ? `<span class="usrc-part muted">${own ? 'gone' : 'Entra gone'}</span>`
    : e.enabled === false ? `<span class="usrc-part warn">${own ? 'disabled' : 'Entra disabled'}</span>`
    : '<span class="usrc-part"><span class="sdot entra" aria-hidden="true"></span>Entra</span>';
  const tip = [from[1], !own || e && (e.gone || e.enabled === false) ? entraTip : ''].filter(Boolean).join(' · ');
  return `<span class="chip kept usrc" title="${esc(tip)}"><span class="usrc-part"><span class="sdot ${src}" aria-hidden="true"></span>${from[0]}</span>${entra}</span>`;
}
const ROLE_TIPS = { admin: 'Admin: can change everything', viewer: 'Viewer: can sign in and look, changes nothing', none: 'No access: cannot sign in; the inventory only names their devices' };
/* People a directory or Lansweeper brought in who are viewers: the ones Remove access for imported viewers takes it from. */
const foundViewers = () => USERS.filter(u => u.role === 'viewer' && ['ldap', 'entra', 'lansweeper'].includes(u.source) && u.id !== (me() || {}).id);
export function renderSetUsers(){
  /* Devices per person, counted in one pass: asking each person's count separately went through every device each time. */
  const devCount = new Map();
  for (const o of objs){ const n = o.user; if (n) devCount.set(n, (devCount.get(n) || 0) + 1); }
  const devicesOfUser = name => devCount.get(name) || 0;
  /* Where each person is known: in the directory (LDAP), in Entra, in both, or in neither. The filter shows one group. */
  const inLdap = u => u.source === 'ldap', inEntra = u => !!(u.entra && !u.entra.gone);
  const DIRS = {both: ['LDAP and Entra', u => inLdap(u) && inEntra(u)], ldap: ['LDAP only', u => inLdap(u) && !inEntra(u)], entra: ['Entra only', u => !inLdap(u) && inEntra(u)], none: ['Neither', u => !inLdap(u) && !inEntra(u)]};
  const dirOn = USERS.some(inLdap) || USERS.some(u => u.entra);
  if (!dirOn || !DIRS[st.userDir]) st.userDir = '';
  /* Title, office, manager, phones and e-mail from the directory or Entra: the title and office under the name, all of it on hover. */
  const PROFILE = [['title', 'Title'], ['office', 'Office'], ['manager', 'Manager'], ['phone', 'Phone'], ['mobile', 'Mobile'], ['mail', 'E-mail']];
  const profileTip = u => u.profile ? PROFILE.filter(([k]) => u.profile[k]).map(([k, l]) => `\n${l}: ${u.profile[k]}`).join('') : '';
  const profileLine = u => u.profile && (u.profile.title || u.profile.office) ? `<div class="usub">${esc([u.profile.title, u.profile.office].filter(Boolean).join(' · '))}</div>` : '';
  const rows = USERS.map((u, i) => [u, i]).filter(([u]) => !st.userDir || DIRS[st.userDir][1](u)).map(([u, i]) => `<tr>
      ${fromDirectory(u) ? `<td title="From ${u.source === 'ldap' ? 'LDAP' : 'Entra'}: changed there${esc(profileTip(u))}">${esc(u.name)}${profileLine(u)}</td>` : `<td><input data-uname="${i}" maxlength="80" value="${esc(u.name)}" aria-label="Name of ${esc(u.name)}"></td>`}<td class="mono">${esc(u.login || '—')}</td>
      ${fromDirectory(u) ? `<td>${esc(u.dept || '')}</td>` : `<td><input data-udept="${i}" maxlength="80" value="${esc(u.dept || '')}" placeholder="Department" aria-label="Department of ${esc(u.name)}"></td>`}<td>${esc((u.groups || []).join(', '))}</td>
      <td><span class="usrcs">${sourceChips(u)}</span></td>
      <td class="n"><a class="link" data-devs="${i}">${devicesOfUser(u.name)}</a></td>
      <td><select data-role="${i}" aria-label="Role of ${esc(u.name)}" title="${ROLE_TIPS[u.role] || ROLE_TIPS.viewer}"><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option><option value="viewer" ${u.role === 'viewer' || !u.role ? 'selected' : ''}>Viewer</option><option value="none" ${u.role === 'none' ? 'selected' : ''}>No access</option></select></td>
      <td><input type="checkbox" data-act="${i}" ${u.active ? 'checked' : ''} aria-label="Active"></td>
      <td>${SERVER.on && u.source !== 'ldap' ? (u.login ? `<button data-pw="${i}" title="Set this user's password">Password</button>` : `<button data-login="${i}" title="Give this user a login name">Login name</button>`) : ''}</td>
      <td>${SERVER.on ? `<button data-sheet="${i}" title="Print the devices handed out and a new initial Windows password">Entry sheet</button>` : ''}</td>
      <td><button class="icon ghost" data-del="${i}" ${u.source === 'ldap' ? 'disabled title="Managed by LDAP"' : devicesOfUser(u.name) ? 'disabled title="Has devices. Move them first."' : 'title="Remove"'} aria-label="Remove user">×</button></td></tr>`).join('');
  $('#setUsers').innerHTML = `<div class="panelbox"><div class="hdr">Users <span class="cnt">${USERS.filter(u => u.active).length} active of ${USERS.length}</span></div>
    <p class="note">Role: Admin can change everything, Viewer can look, No access lets nobody in (people found by LDAP, Entra or Lansweeper start with No access; give them Viewer to let them in). Each device names its user. The Devices count lists them, and clicking it shows those devices. Users from LDAP can't be removed here, only deactivated. Source says where each person comes from and whether Microsoft Entra knows them too (Settings → Entra &amp; Intune → People).</p>
    ${dirOn || foundViewers().length ? `<div class="addrel">${dirOn ? `<label class="muted" for="userDir">Show</label><select id="userDir"><option value="">Everybody (${USERS.length})</option>${Object.entries(DIRS).map(([k, [l, f]]) => `<option value="${k}" ${st.userDir === k ? 'selected' : ''}>${l} (${USERS.filter(f).length})</option>`).join('')}</select>` : ''}<span class="grow"></span>${foundViewers().length ? `<button id="noneAll" title="Imported people with the role Viewer get No access. Admins, people added here and you keep yours.">Remove access for ${foundViewers().length} imported ${foundViewers().length === 1 ? 'viewer' : 'viewers'}…</button>` : ''}</div>` : ''}
    <div style="overflow-x:auto"><table class="grid mini" style="min-width:1020px;table-layout:fixed"><colgroup><col style="width:14%"><col style="width:9%"><col style="width:12%"><col style="width:9%"><col style="width:12%"><col style="width:6%"><col style="width:9%"><col style="width:6%"><col style="width:10%"><col style="width:9%"><col style="width:4%"></colgroup><thead><tr><th>Name</th><th>Login</th><th>Department</th><th>Groups</th><th>Source</th><th>Devices</th><th>Role</th><th>Active</th><th></th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="addrel"><input id="nuFirst" placeholder="First name" style="min-width:130px" aria-label="First name"><input id="nuLast" placeholder="Last name" style="min-width:130px" aria-label="Last name"><input id="nuDept" placeholder="Department" style="min-width:120px" aria-label="Department"></div>
    <div class="addrel"><input id="nuLogin" placeholder="Login (optional, lets them sign in)" style="min-width:200px" aria-label="Login" autocomplete="off"><input id="nuPw" type="password" placeholder="Password (min. ${PW_MIN})" style="min-width:160px" aria-label="Password" autocomplete="new-password"><select id="nuRole" aria-label="Role"><option value="viewer">Viewer</option><option value="admin">Admin</option><option value="none">No access</option></select><button id="nuAdd">Add user</button></div></div>`;
  const root = $('#setUsers');
  const ud = $('#userDir'); if (ud) ud.onchange = () => { st.userDir = ud.value; renderSetUsers(); };
  root.querySelectorAll('[data-devs]').forEach(a => a.onclick = () => showDevicesOf(USERS[+a.dataset.devs].name));
  /* Admins that are active: the inventory needs at least one of them, so the page refuses what the server would refuse. */
  const activeAdmins = () => USERS.filter(x => x.role === 'admin' && x.active !== false).length;
  root.querySelectorAll('[data-act]').forEach(c => c.onchange = () => {
    const u = USERS[+c.dataset.act];
    if (!c.checked && u.role === 'admin' && activeAdmins() <= 1){ toast('At least one active admin is needed.'); c.checked = true; return; }
    u.active = c.checked; queueServerSave(); renderSetUsers();
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
    modal(`<div class="mh">Remove access for ${people}?</div>
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
  root.querySelectorAll('[data-role]').forEach(sel => sel.onchange = () => {
    const u = USERS[+sel.dataset.role];
    if (u.role === 'admin' && sel.value !== 'admin' && u.active !== false && activeAdmins() <= 1){ toast('At least one active admin is needed.'); renderSetUsers(); return; }
    u.role = sel.value; queueServerSave(); toast(u.name + ' is now ' + roleLabel(u).toLowerCase()); renderSetUsers();
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
  const edit = canEdit();
  el.innerHTML = `<div class="panelbox"><div class="hdr">Company</div>
    <p class="note">The name and logo on entry sheets, printed and as PDF. Without them the sheets show NOBS Inventory.</p>
    <div class="form" style="padding:10px 12px;grid-template-columns:170px minmax(0,1fr)">
      <label for="coName">Company name</label><input id="coName" maxlength="80" value="${esc(COMPANY.name)}" placeholder="e.g. Example AG" ${edit ? '' : 'disabled'}>
      <label>Logo</label><div class="ctlrow" style="align-items:center"><span class="company-logo">${COMPANY.logo ? `<img src="${esc(COMPANY.logo)}" alt="Company logo">` : '<span class="muted">No logo</span>'}</span>
        <span class="unit" style="display:flex;gap:6px;align-items:center"><button id="coPick" ${edit ? '' : 'disabled'}>${COMPANY.logo ? 'Replace logo…' : 'Choose logo…'}</button>${COMPANY.logo ? `<button id="coDel" class="icon ghost" title="Remove the logo" aria-label="Remove the logo" ${edit ? '' : 'disabled'}>×</button>` : ''}</span>
        <input id="coFile" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" hidden></div>
    </div><p class="note" id="coMsg" role="status" style="padding:0 12px 10px"></p></div>`;
  $('#coName').onchange = e => { COMPANY.name = e.target.value.trim(); queueServerSave(); toast('Company name saved'); };
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
  st.q = name; st.tab = 'cards'; st.cardsGroup = 'none';   /* the cards' own filter holds the name */
  render();
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
