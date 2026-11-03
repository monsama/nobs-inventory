/* Starting the page and signing in: the version, the first load, sign-in, your account and sign-out. */
import { pollForChanges, startLive } from './live.js';
import { REVIEW, setAppVersion, SYNC } from './01-core.js';
import { setUsers } from './04-settings.js';
import { DOMAINS, FIELD_LAYOUT, TYPE_FIELDS, $, APP_VERSION, HISTORY, LOCS, VLANS, PW_MIN, esc, objs, rels, st, toast } from './01-core.js';
import { me, ownOnly, pushDate } from './04-settings.js';
import { openObjs } from './02-views.js';
import { closeModal, modal } from './19-modal.js';
import { render } from './07-render.js';
import { SERVER, pendingChanges, dropOffline } from './server-save.js';
import { reloadFromServer, checkForChanges, restoreOffline } from './server-load.js';
/* An address with ?o=INV-0001 (a link in an e-mail): the inventory number in it. */
const linkedCode = v => { const m = /[?&]o=([^&#\s]+)/.exec(String(v || '')); if (!m) return ''; try { return decodeURIComponent(m[1]); } catch { return ''; } };
/* The version comes from the server. It is shown in the footer and in Settings → About. */
export async function loadVersion(){
  if (!APP_VERSION){
    try { const r = await fetch('api/health', {credentials: 'same-origin'}); if (r.ok) setAppVersion((await r.json()).version || ''); } catch { /* no version is shown when it cannot be read */ }
  }
  const foot = $('#verFoot'); if (foot) foot.textContent = 'NOBS Inventory ' + APP_VERSION;
  return APP_VERSION;
}
export async function boot(){
  loadVersion();
  let info = null;
  try { const r = await fetch('api/me', {credentials: 'same-origin'}); if (r.ok) info = await r.json(); } catch { info = null; }
  if (!info){ showUnreachable(); return; }
  SERVER.on = true; SERVER.ldap = info.ldap; SERVER.lansweeper = info.lansweeper; SYNC.lansweeper = !!(info.lansweeper || info.lansweeperFeed); SERVER.graph = !!info.graph; SYNC.graph = SERVER.graph; SERVER.sso = !!info.sso;
  /* Back from Microsoft: what went wrong, if anything, said on the sign-in; the address is cleaned. */
  const ssoErr = new URLSearchParams(location.search).get('sso');
  if (ssoErr) history.replaceState(null, '', location.pathname + location.hash);
  if (!info.user){ clearInventory(); render(); loginModal(ssoErr ? (Object.hasOwn(SSO_ERRORS, ssoErr) ? SSO_ERRORS[ssoErr] : SSO_ERRORS.failed) : ''); return; }
  await loadFromServer(info.user);
}
/* The page works only with its server. Without one nothing is shown; the dialog offers to try again. */
function showUnreachable(){
  document.body.classList.add('signed-out');
  modal(`<div class="mh">NOBS Inventory</div><div class="mb"><p class="note" style="color:var(--danger)">The inventory server cannot be reached. Check that it is running, then try again.</p></div>
    <div class="mf"><button id="unTry" class="primary">Try again</button></div>`, 'sm free locked');
  $('#unTry').onclick = () => location.reload();
}
/* Before sign-in the page holds no inventory. */
function clearInventory(){
  objs.length = 0; REVIEW.length = 0; rels.length = 0; LOCS.length = 0; VLANS.length = 0; DOMAINS.length = 0; setUsers([]);
  for (const k of Object.keys(FIELD_LAYOUT)) delete FIELD_LAYOUT[k];
  for (const k of Object.keys(TYPE_FIELDS)) delete TYPE_FIELDS[k];
  Object.keys(HISTORY).forEach(k => delete HISTORY[k]);
  st.open = []; st.tab = 'cards';
}
async function loadFromServer(user){
  if (!(await reloadFromServer())) return;
  document.body.classList.remove('signed-out');
  st.meId = user.id;
  /* Someone who sees only their own devices starts on them. */
  if (ownOnly() && st.tab === 'cards') st.tab = 'mine';
  if (!SERVER.watching){ SERVER.watching = true; setInterval(pollForChanges, 15000); window.addEventListener('focus', checkForChanges); startLive(); }
  render();
  restoreOffline();
  openLinked();
}
/* An address with ?o=INV-0001 (the link in a reported problem's e-mail): that device opens. */
function openLinked(){
  const code = linkedCode(location.search); if (!code) return;
  history.replaceState(history.state, '', location.pathname + location.hash);
  const o = objs.find(x => x.code === code) || objs.find(x => String(x.id) === code);
  if (o) openObjs([o.id]); else toast(`${code} is not in the inventory.`);
}
/* What the sign-in says when Microsoft's sign-in did not let someone in (the reason itself is in the log). */
const SSO_ERRORS = {
  unknown: 'Your Microsoft account is not a user of the inventory. An admin can add you, or sync the people from AD or Entra.',
  norole: 'Your account has no access to the inventory yet. An admin can give you the viewer role in Settings → Users.',
  denied: 'The sign-in with Microsoft was cancelled or refused.',
  off: 'Sign-in with Microsoft is turned off.',
  failed: 'The sign-in with Microsoft did not work. Try again; if it keeps failing, an admin finds the reason in the log.',
};
/* Sign in with a login and password, or with Microsoft when that is turned on. The server checks the account, or the
   directory when LDAP is set up. */
export function loginModal(err = '', login = ''){
  document.body.classList.add('signed-out');
  modal(`<div class="mh">Sign in</div>
    <div class="mb"><div class="brandmark" style="margin:2px 0 16px"><img src="logo.svg" alt=""><div><b>NOBS</b> <span>Inventory</span></div></div><form id="loginForm" class="form" style="padding:0">
      <label for="lgUser">Login</label><input id="lgUser" value="${esc(login)}" autocomplete="username" required>
      <label for="lgPw">Password</label><input id="lgPw" type="password" autocomplete="current-password" required>
    </form><p class="note" id="lgErr" style="color:var(--danger)">${esc(err)}</p>
    ${SERVER.sso ? `<div class="lg-or"><span>or</span></div><a class="btnlike lg-ms" href="api/sso/start"><svg viewBox="0 0 21 21" aria-hidden="true"><path fill="#f25022" d="M1 1h9v9H1z"/><path fill="#7fba00" d="M11 1h9v9h-9z"/><path fill="#00a4ef" d="M1 11h9v9H1z"/><path fill="#ffb900" d="M11 11h9v9h-9z"/></svg>Sign in with Microsoft</a>` : ''}</div>
    <div class="mf"><button id="lgOk" class="primary">Sign in</button></div>`, 'sm free locked');
  /* Microsoft's sign-in leaves the page: changes not saved yet would be lost. Said first; a second click goes anyway. */
  const ms = document.querySelector('.lg-ms');
  if (ms) ms.addEventListener('click', e => {
    const p = SERVER.base ? pendingChanges() : { puts: [], dels: [] }, n = p.puts.length + p.dels.length;
    if (!n || ms.dataset.warned) return;
    e.preventDefault(); ms.dataset.warned = '1';
    $('#lgErr').textContent = `${n} change${n === 1 ? ' is' : 's are'} not saved yet and would be lost. Sign in with your password to keep ${n === 1 ? 'it' : 'them'}, or click Sign in with Microsoft again to go on.`;
  });
  const go = async () => {
    const login = $('#lgUser').value;
    const r = await fetch('api/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin',
      body: JSON.stringify({login, password: $('#lgPw').value})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ loginModal(j.error || 'Sign in failed.', login); return; }
    closeModal();
    /* Signed in again after the sign-in ended: what was not saved is sent now (the load saves it first). Someone else
       signing in on this page does not send the previous person's changes under their name. */
    if (SERVER.base && String(j.user.id) !== String(st.meId)) SERVER.base = null;
    await loadFromServer(j.user);
  };
  $('#lgOk').onclick = go;
  $('#loginForm').addEventListener('submit', e => { e.preventDefault(); go(); });
  (login ? $('#lgPw') : $('#lgUser')).focus();
}
/* The browsers this account is signed in on. A session ends on its own after two hours without use. */
const browserName = ua => {
  const b = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? b + ' on ' + os : b;
};
async function loadMySessions(){
  const box = $('#acSessions'); if (!box) return;
  const r = await fetch('api/me/sessions', {credentials: 'same-origin'});
  if (!r.ok){ box.innerHTML = '<p class="note">The sessions could not be loaded.</p>'; return; }
  const list = (await r.json()).sessions;
  const others = list.filter(x => !x.current).length;
  box.innerHTML = list.length ? `<div class="sess-list">${list.map(x => `<div class="sess">
      <div class="sess-main"><div class="sess-name">${esc(browserName(x.agent))}${x.current ? '<span class="sess-here">This browser</span>' : ''}</div><div class="sess-when">Last used ${esc(pushDate(x.last))}</div></div>
      ${x.current ? '' : `<button data-endsess="${esc(x.id)}" aria-label="End this session">End</button>`}</div>`).join('')}</div>
    <div class="sess-foot"><button id="acEndOthers" ${others ? '' : 'disabled'}>End all other sessions</button></div>` : '<p class="note">No browsers are signed in.</p>';
  box.querySelectorAll('[data-endsess]').forEach(b => b.onclick = async () => { await fetch('api/me/sessions/' + encodeURIComponent(b.dataset.endsess), {method: 'DELETE', credentials: 'same-origin'}); loadMySessions(); });
  if ($('#acEndOthers')) $('#acEndOthers').onclick = async () => { for (const x of list.filter(y => !y.current)) await fetch('api/me/sessions/' + encodeURIComponent(x.id), {method: 'DELETE', credentials: 'same-origin'}); toast('Other browsers are signed out'); loadMySessions(); };
}
/* Your own account: name and department, and the password. Directory users keep their name, department and password in
   the directory, so for them it only shows them (and the signed-in browsers). */
export function accountModal(){
  const u = me(), ldap = u.source === 'ldap';
  const parts = (u.name || '').split(' ');
  modal(`<div class="mh">Your account</div>
    <div class="mb"><div class="form" style="padding:0">
      <label>Login</label><div class="mono" style="padding:4px 0">${esc(u.login || '—')}${ldap ? ' · directory' : ''}</div>
      <label for="acFirst">First name</label><input id="acFirst" value="${esc(u.first ?? parts[0] ?? '')}" ${ldap ? 'disabled' : ''}>
      <label for="acLast">Last name</label><input id="acLast" value="${esc(u.last ?? parts.slice(1).join(' '))}" ${ldap ? 'disabled' : ''}>
      <label for="acDept">Department</label><input id="acDept" value="${esc(u.dept || '')}" ${ldap ? 'disabled' : ''}>
    </div>
    ${ldap ? '<p class="note">Your name, department and password come from the directory.</p>' : `<div class="hdr" style="margin:14px -14px 8px">Password</div>
    <div class="form" style="padding:0">
      <label for="acCur">Current</label><input id="acCur" type="password" autocomplete="current-password">
      <label for="acNew">New</label><input id="acNew" type="password" autocomplete="new-password" placeholder="At least ${PW_MIN} characters">
      <label for="acNew2">Repeat</label><input id="acNew2" type="password" autocomplete="new-password">
    </div>`}
    <div class="hdr" style="margin:14px -14px 8px">Signed-in browsers</div>
    <div id="acSessions"><p class="note">Loading…</p></div>
    <p class="note" id="acErr"></p></div>
    <div class="mf"><button id="acClose">Close</button><button id="acPw" ${ldap ? 'hidden' : ''}>Change password</button><button id="acSave" class="primary" ${ldap ? 'hidden' : ''}>Save</button></div>`, 'sm');
  loadMySessions();
  const fail = msg => { $('#acErr').textContent = msg; };
  $('#acClose').onclick = closeModal;
  $('#acSave').onclick = async () => {
    if (ldap){ closeModal(); return; }
    const first = $('#acFirst').value.trim(), last = $('#acLast').value.trim();
    if (!first && !last) return fail('Give a first or last name.');
    const r = await fetch('api/me', {method: 'PUT', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({first, last, dept: $('#acDept').value.trim()})});
    if (!r.ok) return fail((await r.json().catch(() => ({}))).error || 'The details could not be saved.');
    closeModal(); await reloadFromServer(); toast('Saved');
  };
  $('#acPw').onclick = async () => {
    const cur = $('#acCur').value, pw = $('#acNew').value;
    if (!cur) return fail('Type your current password.');
    if (pw.length < PW_MIN) return fail(`The new password needs at least ${PW_MIN} characters.`);
    if (pw !== $('#acNew2').value) return fail('The two new passwords are not the same.');
    const r = await fetch('api/me/password', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({current: cur, password: pw})});
    if (!r.ok) return fail((await r.json().catch(() => ({}))).error || 'The password was not changed.');
    closeModal(); toast('Password changed. Other browsers are signed out.');
  };
  $('#acFirst').focus();
}
export async function signOut(){
  dropOffline();
  await fetch('api/logout', {method: 'POST', credentials: 'same-origin'});
  location.reload();
}
