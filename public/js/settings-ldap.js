/* Settings → LDAP & Graph, the directory half: the LDAP connection, its security and CA, the service password,
   test and sync. */
import { scheduleRowHtml, bindScheduleRows } from './settings-feed.js';
import { canEdit } from './04-settings.js';
import { flushSave, reloadFromServer, queueServerSave } from './07-render-plans.js';
import { dateText } from './dates.js';
import { st, esc, $, toast } from './01-core.js';
/* ---------- LDAP / Active Directory. The settings are saved in the inventory and used at the next sign-in or sync. The
   service account's password is not in the inventory: it is saved here into the server's encrypted store (or set in
   the server's environment) and never sent back to the page. ---------- */
/* The same default as the server: the login at the domain the search base names. */
const bindDefault = base => { const dcs = [...String(base || '').matchAll(/(?:^|,)\s*DC\s*=\s*([^,]+)/gi)].map(m => m[1].trim()); return dcs.length ? `{login}@${dcs.join('.')}` : '{login}@example.ch'; };
/* The computers are looked for in the whole domain of the search base, unless a base is given. */
const computerDefault = base => { const dcs = String(base || '').split(',').map(x => x.trim()).filter(x => /^DC=/i.test(x)); return dcs.length ? dcs.join(',') : 'DC=example,DC=ch'; };
/* How the connection to the directory is secured. ldaps:// is TLS from the start (port 636); StartTLS starts on ldap://
   (port 389) and is encrypted before anything is sent; none sends the passwords readable. */
const SECURITY_OPTS = [['', 'TLS: ldaps://, port 636'], ['starttls', 'StartTLS: ldap://, port 389, then encrypted'], ['plain', 'None: unencrypted (not recommended)']];
const securityNote = L => {
  const t = L.security === 'plain' ? '<span style="color:var(--danger)">Passwords cross the network readable: those of everyone who signs in, and the service account\'s. Only on a network you trust, and prefer StartTLS.</span>'
    : L.security === 'starttls' ? 'Encrypted like ldaps://, on the usual port 389. The certificate is checked the same way.'
    : 'The domain controller needs a certificate. If your company’s CA issued it (AD Certificate Services), add that CA’s certificate below.';
  return `<p class="note" style="padding:4px 0 0;margin:0">${t}</p>`;
};
/* Moves the address to the scheme and port of the security chosen: ldaps:// and 636, or ldap:// and 389. */
export const ldapUrlFor = (url, security) => {
  const u = String(url || '').trim();
  if (!u) return u;
  return security ? u.replace(/^ldaps:\/\//i, 'ldap://').replace(/:636(\/|$)/, ':389$1') : u.replace(/^ldap:\/\//i, 'ldaps://').replace(/:389(\/|$)/, ':636$1');
};
/* The CA certificate the directory server's certificate is checked against, when a company CA issued it. */
function caHtml(edit){
  const ca = st.ldapCa;
  const day = dateText;
  const pick = `<label class="btnlike ${edit ? '' : 'disabled'}" style="flex:none" title="The root CA certificate, exported as .cer (DER or Base-64), .crt or .pem">${ca ? 'Replace…' : 'Add CA certificate…'}<input type="file" id="caFile" accept=".cer,.crt,.pem,.der" hidden ${edit ? '' : 'disabled'}></label>`;
  if (!ca) return `<span class="muted" style="flex:1">None: only certificates from public CAs are trusted</span>${pick}`;
  return `<span style="flex:1;min-width:0">${ca.certs.map(c => `<span class="chip ok" style="flex:none">${esc(c.name)}</span> <span class="muted">until ${esc(day(c.expires))}</span>`).join(' ')}</span>${pick}<button type="button" id="caRemove" class="danger-text" style="flex:none" ${edit ? '' : 'disabled'}>Remove</button>`;
}
function bindCa(){
  const f = $('#caFile');
  if (f) f.onchange = async () => {
    const file = f.files[0]; if (!file) return;
    /* Changes still waiting to be saved go first: the settings are read again from the server afterwards. */
    await flushSave();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
    const r = await fetch('api/ldap/ca', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({file: btoa(bin)})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'The certificate was not added.'); f.value = ''; return; }
    toast('CA certificate added: ' + j.certs.map(c => c.name).join(', ') + '. Test the connection.');
    await reloadFromServer(); renderSetLdap();
  };
  const rm = $('#caRemove');
  if (rm) rm.onclick = async () => {
    if (!confirm('Remove the CA certificate? A directory server whose certificate it issued can no longer be reached.')) return;
    await flushSave();
    const r = await fetch('api/ldap/ca', {method: 'DELETE', credentials: 'same-origin'});
    if (r.ok){ toast('CA certificate removed'); await reloadFromServer(); renderSetLdap(); }
  };
}
/* LDAP: the directory settings, saved in the inventory (the service password encrypted on the server), the CA, a
   test and a sync. */
export function renderSetLdap(){
  if (!st.ldap) st.ldap = {};
  const L = st.ldap, edit = canEdit();
  const ro = edit ? '' : 'disabled';
  const field = (k, label, hint) => `<label for="lk_${k}">${label}</label><input id="lk_${k}" data-lk="${k}" class="mono" value="${esc(L[k] || '')}" placeholder="${esc(hint)}" ${ro}>`;
  const ready = !!L.url && edit;
  $('#setLdap').innerHTML = `<div class="panelbox"><div class="hdr">LDAP / Active Directory</div>
    <div class="note" style="padding:10px 12px">Changes are saved in the inventory and used at the next sign-in or sync. The service account’s password is kept apart, encrypted on the server: it can be replaced or removed here, never shown, and it is not in backups.</div>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)">
      ${field('url', 'Server', 'ldaps://dc01.example.ch:636')}
      <label for="lk_security">Connection security</label><div><select id="lk_security" ${ro}>
        ${SECURITY_OPTS.map(([v, t]) => `<option value="${v}" ${(L.security || '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
        ${securityNote(L)}</div>
      ${L.security === 'plain' ? '' : `<label>CA certificate</label><div class="ctlrow" id="ldapCa">${caHtml(edit)}</div>`}
      ${L.security === 'plain' ? '' : `<label for="lk_legacyTls">Old certificates</label><div>
        <label class="pchk" style="width:auto"><input type="checkbox" id="lk_legacyTls" ${L.legacyTls === 'on' ? 'checked' : ''} ${ro}> Accept old certificates (RSA keys from 1024 bits)</label>
        <p class="note" style="padding:4px 0 0;margin:0">${L.legacyTls === 'on'
          ? '<span class="chip warn">On</span> <span style="color:var(--danger)">Not recommended: a 1024-bit key is no longer considered safe. Only for compatibility, until the domain controller’s certificate is renewed with a 2048-bit key; then switch this off.</span>'
          : 'Not recommended. Only for a domain controller whose certificate still has a 1024-bit key (“key too weak”), until it is renewed. The certificate is still checked against the CA and the name.'}</p></div>`}
      ${field('searchBase', 'Search base', 'OU=Users,DC=example,DC=ch')}
      ${field('serviceDn', 'Service account', 'CN=inventory-sync,OU=Service,DC=example,DC=ch')}
      <label for="lk_pw">Service password</label><div class="ctlrow" id="ldapPw"><span class="muted">…</span></div>
      ${field('group', 'Sign-in group', 'CN=Inventory-Users,OU=Groups,DC=example,DC=ch')}
      ${L.url && !String(L.group || '').trim() ? '<span></span><p class="fieldnote warn">Without a sign-in group, every account in the directory can sign in (as a viewer), and the sync adds them all as users.</p>' : ''}
      ${field('adminGroup', 'Admin group', 'CN=IT-Inventory,OU=Groups,DC=example,DC=ch')}
    </div>
    <details class="ldap-adv" ${L.bindTemplate || L.loginAttr || L.userFilter || L.computerBase || L.computerGroups === 'off' ? 'open' : ''}><summary>Advanced: only when the defaults do not suit your directory</summary>
      <div class="form" style="grid-template-columns:170px minmax(0,1fr)">
        ${field('bindTemplate', 'Sign-in name', bindDefault(L.searchBase) + '   (or EXAMPLE\\{login})')}
        ${field('loginAttr', 'Login attribute', 'sAMAccountName')}
        ${field('userFilter', 'User filter', '(&(objectClass=person)(!(objectClass=computer)))')}
        ${field('computerBase', 'Computers search base', computerDefault(L.searchBase))}
        <label for="lk_computerGroups">Computer groups</label><label class="pchk" style="width:auto"><input type="checkbox" id="lk_computerGroups" ${L.computerGroups === 'off' ? '' : 'checked'} ${ro}> Read the groups of each computer account (shown on the device)</label>
      </div>
      <p class="note" style="padding:0 12px 10px">Empty fields use the Active Directory defaults shown in them. The sign-in name defaults to the login at the domain of the search base.</p>
    </details>
    <div class="lpanel-add"><label class="pchk" style="width:auto"><input type="checkbox" id="lk_fillAd" ${st.fillAd !== false ? 'checked' : ''} ${ro}> Fill in an empty operating system and domain from the computer account</label></div>
    <p class="note" style="padding:0 12px 4px">Only fields nobody has filled: a value set by hand, from Lansweeper or from Intune goes first. The device shows where a value came from. Only these fields of a computer account are read, never its LAPS password or BitLocker keys.</p>
    <div style="padding:8px 12px 12px">${scheduleRowHtml('ldap', edit)}</div>
    <div class="addrel" style="padding:10px 12px"><button id="ldapTest" ${ready ? '' : 'disabled'}>Test connection</button><button id="ldapSync" class="primary" ${ready ? '' : 'disabled'}>Sync now</button><span class="note" id="ldapMsg"></span></div></div>`;
  bindScheduleRows($('#setLdap'));
  if (edit) loadLdapPassword(); else $('#ldapPw').innerHTML = '<span class="muted">Only an admin can see this</span>';
  $('#setLdap').querySelectorAll('[data-lk]').forEach(i => i.onchange = () => {
    st.ldap[i.dataset.lk] = i.value.trim();
    /* An address typed with ldaps:// is TLS; one with ldap:// is secured with StartTLS unless something else was chosen. */
    if (i.dataset.lk === 'url'){ if (/^ldaps:\/\//i.test(st.ldap.url)) delete st.ldap.security; else if (/^ldap:\/\//i.test(st.ldap.url) && !st.ldap.security) st.ldap.security = 'starttls'; }
    queueServerSave(); renderSetLdap();
  });
  $('#lk_security').onchange = e => {
    const v = e.target.value;
    if (v === 'plain' && !confirm('Send passwords unencrypted? Anyone on the network path can read them. StartTLS encrypts on the same port.')){ e.target.value = st.ldap.security || ''; return; }
    if (v) st.ldap.security = v; else delete st.ldap.security;
    st.ldap.url = ldapUrlFor(st.ldap.url, v);
    queueServerSave(); renderSetLdap();
  };
  const legacy = $('#lk_legacyTls');
  if (legacy) legacy.onchange = e => {
    if (e.target.checked && !confirm('Accept old certificates with 1024-bit keys? This weakens the protection of every directory sign-in. Use it only until the domain controller’s certificate is renewed with a 2048-bit key.')){ e.target.checked = false; return; }
    if (e.target.checked) st.ldap.legacyTls = 'on'; else delete st.ldap.legacyTls;
    queueServerSave(); renderSetLdap();
  };
  if (edit) bindCa();
  $('#lk_fillAd').onchange = e => { st.fillAd = e.target.checked; queueServerSave(); };
  $('#lk_computerGroups').onchange = e => { if (e.target.checked) delete st.ldap.computerGroups; else st.ldap.computerGroups = 'off'; queueServerSave(); renderSetLdap(); };
  const bad = t => `<span style="color:var(--danger)">${esc(t)}</span>`;
  $('#ldapTest').onclick = async () => {
    const msg = $('#ldapMsg'); msg.textContent = 'Testing…';
    await flushSave();
    const r = await fetch('api/ldap/test', {method: 'POST', credentials: 'same-origin'});
    const j = await r.json().catch(() => ({}));
    /* Connected, but nobody in the sign-in group: most often the group's name or DN is not the one in the directory. */
    msg.innerHTML = !r.ok ? bad(j.error || 'The directory cannot be reached.')
      : j.people ? `<span style="color:var(--ok)">Connected. ${j.people} ${j.people === 1 ? 'user' : 'users'} can sign in, ${j.admins} of them ${j.admins === 1 ? 'admin' : 'admins'}.</span>`
      : bad('Connected, but no user is in the sign-in group. Check the group\'s name or DN, and the search base.');
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
    msg.textContent = `${c.people} users in scope: ${c.created} new, ${c.updated} updated, ${c.deactivated} deactivated.`
      + (c.computerError ? ` Computer groups could not be read: ${c.computerError}` : c.computers != null ? ` Computer groups changed on ${c.computers} ${c.computers === 1 ? 'device' : 'devices'}.` : '');
    await reloadFromServer();
  };
}
/* The service account's password: saved encrypted on the server, never sent back. Set on the server instead, it says so. */
async function loadLdapPassword(replace = false){
  const box = $('#ldapPw'); if (!box) return;
  const r = await fetch('api/ldap/password', {credentials: 'same-origin'}).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => ({})) : {};
  if (!$('#ldapPw')) return;
  const day = dateText;
  if (j.source === 'server'){ box.innerHTML = '<span class="muted">Set on the server (NI_LDAP_SERVICE_PASSWORD), which takes precedence</span>'; return; }
  if (j.source === 'app' && !replace){
    box.innerHTML = `<span class="chip ok" style="flex:none">Saved</span><span class="muted" style="flex:none">${esc(day(j.setAt))}</span><span style="flex:1"></span><button type="button" id="lpReplace" style="flex:none">Replace</button><button type="button" id="lpRemove" class="danger-text" style="flex:none">Remove</button>`;
    $('#lpReplace').onclick = () => loadLdapPassword(true);
    $('#lpRemove').onclick = async () => {
      if (!confirm('Remove the saved password? The directory cannot be read until a new one is saved.')) return;
      await fetch('api/ldap/password', {method: 'DELETE', credentials: 'same-origin'});
      toast('Password removed'); loadLdapPassword();
    };
    return;
  }
  box.innerHTML = `<input id="lk_pw" type="password" autocomplete="new-password" placeholder="The service account’s password" aria-label="Service account password"><button type="button" id="lpSave" style="flex:none">Save password</button>${replace ? '<button type="button" id="lpCancel" style="flex:none">Cancel</button>' : ''}`;
  const save = async () => {
    const pw = $('#lk_pw').value;
    if (!pw){ $('#lk_pw').focus(); return; }
    const x = await fetch('api/ldap/password', {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password: pw})});
    const e = await x.json().catch(() => ({}));
    if (!x.ok){ toast(e.error || 'Not saved.'); return; }
    toast('Password saved. Test connection checks it.'); loadLdapPassword();
  };
  $('#lpSave').onclick = save;
  $('#lk_pw').onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); save(); } };
  if ($('#lpCancel')) $('#lpCancel').onclick = () => loadLdapPassword();
}
