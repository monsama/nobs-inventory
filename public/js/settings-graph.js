/* Settings → Entra & Intune, through Microsoft Graph: its status header, the app registration, certificates, people
   from Entra, the devices Graph has that the inventory does not, and Defender for Endpoint as a section of its own. */
import { intakeRowHtml, bindIntakeRows } from './15-review.js';
import { ENTRA, scheduleRowHtml, bindScheduleRows } from './settings-feed.js';
import { SERVER, reloadFromServer } from './07-render.js';
const FIELD_NAMES = { category: 'Category', enrollType: 'How enrolled', enrollProfile: 'Enrollment profile', certExpires: 'Intune certificate end',
  patch: 'Android security patch', carrier: 'Carrier', imei: 'IMEI', phone: 'Phone number', ownership: 'Ownership', free: 'Free storage', jailbroken: 'Jailbroken', supervised: 'Supervised' };
import { isAdmin, applyRole } from './04-settings.js';
import { st, byId, $, dayText, toast, SYNC, objs } from './01-core.js';
import { html, rawHtml } from './html.js';
import { statusHeaderHtml } from './settings-status.js';
/* What a sync found, in one message: records are what Graph lists, devices what they come to once duplicates are one. */
export function graphSummary(c){
  const n = (k, one, many) => c[k] ? ` ${c[k]} ${c[k] === 1 ? one : many}` : '';
  const devices = c.devices ?? c.records;
  return [`${c.records ?? devices} records in Entra and Intune for ${devices} devices: ${c.matched} matched${c.filled ? `, ${c.filled} empty fields filled in` : ''}.`,
    c.duplicates ? `${c.duplicates} duplicate record${c.duplicates === 1 ? '' : 's'}: the current one is used (filter Duplicates in Entra).` : '',
    c.review ? `${c.review} new ${c.review === 1 ? 'device waits' : 'devices wait'} in To review.` : '',
    c.added ? `${c.added} new ${c.added === 1 ? 'device' : 'devices'} added.` : '',
    c.ambiguous ? `${c.ambiguous} fit${c.ambiguous === 1 ? 's' : ''} more than one device here and ${c.ambiguous === 1 ? 'was' : 'were'} put on none: see below.` : '',
    c.gone ? `${n('gone', 'device is', 'devices are').trim()} no longer in Entra or Intune.` : '',
    c.people ? `People: ${c.people.inEntra} in Entra${c.people.added ? `, ${c.people.added} added` : ''}${c.people.bound ? `, ${c.people.bound} devices given their user` : ''}${c.people.gone ? `, ${c.people.gone} no longer in Entra` : ''}.` : '',
    c.peopleError || '', c.defenderError || '',
    c.autopilot || c.autopilotNew ? `Autopilot: ${c.autopilot || 0} devices with a record${c.autopilotNew ? `, ${c.autopilotNew} registered but not set up yet, new in the inventory` : ''}.` : '',
    c.autopilotError || '', typeof c.secureBoot === 'number' ? `Secure Boot read for ${c.secureBoot} Windows ${c.secureBoot === 1 ? 'device' : 'devices'}.` : '', c.secureBootError || ''].filter(Boolean).join(' ');
}
/* Graph records that fit more than one device here, by serial number or name: put on none of them, listed to be fixed. */
function ambiguousHtml(){
  const list = st.graphAmbiguous || [];
  if (!list.length) return '';
  const dev = id => { const o = byId(id); return o ? html`<button class="link" data-open="${id}" title="Open ${o.name}">${o.code} ${o.name}</button>` : ''; };
  return html`<div class="gu-box"><div class="gs-head" style="padding:10px 12px 0"><b>Fits more than one device here</b><span class="cnt">${list.length}</span></div>
    <p class="note" style="padding:4px 12px 8px">Graph has these devices, but their serial number or name is used by more than one device in the inventory, so Graph put them on none. Give the devices distinct names or serial numbers, or retire the extra one, then sync again.</p>
    <div style="overflow:auto;max-height:240px;border-top:1px solid var(--bd2)"><table class="grid mini" id="gaList" style="min-width:0"><thead><tr><th>In Graph</th><th>Same</th><th>Devices here</th></tr></thead><tbody>
      ${list.map(a => html`<tr><td>${a.name}${a.serial && html` <span class="mono muted">${a.serial}</span>`}</td><td>${a.by === 'serial' ? 'serial number' : 'name'}</td><td>${a.devices.map(dev).filter(Boolean).map((d, i) => i ? html`, ${d}` : d)}</td></tr>`)}
    </tbody></table></div></div>`;
}
/* What the last sync brought from Intune: each field and for how many managed devices (some exist only for some
   platforms). Shown under Fields from this source. */
export function intuneCoverageHtml(){
  const fr = st.graphFields;
  if (!fr || !fr.managed) return '';
  return html`<div class="panelbox"><div class="hdr">Fields from Intune <span class="cnt">last sync ${String(fr.at || '').slice(0, 10).split('-').reverse().join('.')}</span></div>
    ${fr.fallback && html`<p class="note warn" style="padding:10px 12px 0">Graph refused the extra fields at the last sync, so only the basic ones came: category, enrollment, certificate end, patch level and carrier are missing. Check the API version and permissions of the app.</p>`}
    <p class="note" style="padding:10px 12px">Of ${fr.managed} devices Intune manages, how many came with each field. A field only some platforms have (patch level: Android; supervised: Apple) is expected to be partial.</p>
    <dl class="lsbox">${Object.entries(FIELD_NAMES).map(([k, l]) => html`<dt>${l}</dt><dd>${fr.fields && fr.fields[k] ? html`${fr.fields[k]} <span class="muted">of ${fr.managed}</span>` : html`<span class="muted">none</span>`}</dd>`)}</dl></div>`;
}
export async function renderSetGraph(){
  const root = $('#setGraph');
  if (!root) return;
  const edit = isAdmin();
  const r = edit ? await fetch('api/graph/status', {credentials: 'same-origin'}).catch(() => null) : null;
  const j = r && r.ok ? await r.json().catch(() => null) : null;
  if (!$('#setGraph')) return;
  const g = j || {configured: SERVER.graph, source: null, tenant: '', clientId: '', certs: []};
  const fromServer = g.source === 'server';
  const ids = !!(g.tenant && g.clientId);
  const chosen = g.certs.find(c => c.chosen && c.onServer);
  /* A step that is done says so at the right of its title, in the same chip as other states. */
  const done = ok => ok && html`<span class="chip ok gs-done">Done</span>`;
  const day = t => dayText(String(t || '').slice(0, 10));
  const left = t => Math.floor((+new Date(t) - Date.now()) / 86400000);
  const certRows = g.certs.map(c => html`<tr><td class="mono">${c.thumbprint}</td><td>${day(c.created)}</td>
      <td>${day(c.expires)}${left(c.expires) < 60 && html` <span class="chip ${left(c.expires) < 0 ? 'bad' : 'warn'}">${left(c.expires) < 0 ? 'expired' : 'in ' + left(c.expires) + ' days'}</span>`}</td>
      <td>${c.inUse ? html`<span class="chip ok">In use</span>` : c.onServer ? html`<button data-gcuse="${c.thumbprint}" ${fromServer && html`disabled title="The server settings decide the certificate"`}>Use this one</button>` : html`<span class="muted" title="Made before the server kept keys: make a new one">No key here</span>`}</td>
      <td class="act">${c.onServer && html`<a class="link" href="api/graph/cert/${c.thumbprint}/cer" download>Download .cer</a>`}${!(fromServer && c.inUse) && html` <button class="icon ghost" data-gcdel="${c.thumbprint}" ${(c.inUse || c.chosen) && html`data-gcinuse="1"`} aria-label="Delete this certificate" title="Delete">×</button>`}</td></tr>`);
  const ready = g.configured && edit;
  root.innerHTML = html`${rawHtml(statusHeaderHtml('graph', { test: { id: 'graphTest', ready }, sync: { id: 'graphSync', ready }, msg: 'graphMsg' }))}<div class="panelbox"><div class="hdr">Connection <span class="cnt">Microsoft Graph</span></div>
    <p class="note">Reads what Microsoft Entra and Intune know of each device: join type, management, compliance, encryption, primary user and last contact, shown on the device. Devices are matched by serial number, else by name. Fields a device does not have yet are filled in; ones it has stay, except on devices added from here, which Graph keeps up to date until Lansweeper takes them over. It only reads: it changes nothing in Entra or Intune.</p>
    ${fromServer && html`<p class="note" style="padding:8px 12px">The connection is set by the server settings (NI_GRAPH_TENANT, NI_GRAPH_CLIENT_ID, NI_GRAPH_CERT, NI_GRAPH_KEY). Remove them on the server to use the steps below instead.</p>`}
    <ol class="graph-steps">
      <li><div class="gs-head"><b>Register the app in Entra</b>${done(ids || fromServer)}</div>
        <details class="how" ${ids || fromServer ? '' : 'open'}><summary>Step by step in Entra</summary><ol class="gs-sub">
          <li>Open the <a class="link" style="text-decoration:underline" href="${ENTRA}" target="_blank" rel="noopener">Entra admin center</a> → <b>Applications</b> → <b>App registrations</b> → <b>New registration</b>.</li>
          <li><b>Name:</b> <span class="mono">NOBS Inventory</span></li>
          <li><b>Supported account types:</b> <i>Accounts in this organizational directory only (single tenant)</i></li>
          <li><b>Redirect URI:</b> leave it empty. The inventory signs in as itself with a certificate, not as a person, so nothing is sent back to a web address.</li>
          <li>Click <b>Register</b>. The app's <b>Overview</b> page opens: copy its two IDs into the fields below and save.</li>
        </ol></details>
        <div class="form" style="padding:8px 0 0">
          <label for="gTenant">Directory (tenant) ID</label><input id="gTenant" class="mono" value="${g.tenant}" placeholder="${fromServer ? 'Set on the server' : '1b2c3d4e-5f60-…'}" autocomplete="off" ${fromServer ? 'disabled' : ''}>
          <label for="gClient">Application (client) ID</label><input id="gClient" class="mono" value="${g.clientId}" placeholder="${fromServer ? 'Set on the server' : '9a8b7c6d-…'}" autocomplete="off" ${fromServer ? 'disabled' : ''}>
        </div>
        <div class="addrel" style="padding:8px 0 0;border:0;background:none"><button id="gSave" ${fromServer ? 'disabled' : ''}>Save IDs</button><span class="note" id="gSaveMsg" role="status"></span></div></li>
      <li><div class="gs-head"><b>Give the app a certificate</b>${done(!!chosen || fromServer)}</div>
        <details class="how" ${!!chosen || fromServer ? '' : 'open'}><summary>Step by step in Entra</summary><ol class="gs-sub">
          <li>Click <b>Create a certificate</b> below. The server keeps its private key, encrypted; the key never leaves the server.</li>
          <li>Click <b>Download the .cer</b>.</li>
          <li>In the app in Entra: <b>Certificates &amp; secrets</b> → tab <b>Certificates</b> (not Client secrets) → <b>Upload certificate</b> → choose the .cer → <b>Add</b>.</li>
          <li>Entra lists it with a thumbprint: the same as in the list at the bottom of this box.</li>
        </ol></details>
        <div class="addrel" style="padding:8px 0 0;border:0;background:none"><button id="graphCert" ${edit && !fromServer ? '' : 'disabled'}>Create a certificate</button>${chosen && html`<a class="link" href="api/graph/cert/${chosen.thumbprint}/cer" download>Download the .cer</a>`}</div></li>
      <li><div class="gs-head"><b>Allow it to read devices</b></div>
        <details class="how" ${g.configured ? '' : 'open'}><summary>Step by step in Entra</summary><ol class="gs-sub">
          <li>In the app in Entra: <b>API permissions</b> → <b>Add a permission</b> → <b>Microsoft Graph</b> → <b>Application permissions</b> (not Delegated).</li>
          <li>Search and tick <span class="mono">Device.Read.All</span> and <span class="mono">DeviceManagementManagedDevices.Read.All</span> → <b>Add permissions</b>. For people from Entra (step 4) also <span class="mono">User.Read.All</span>.</li>
          <li>Click <b>Grant admin consent for</b> your organisation → <b>Yes</b>. Both lines then show a green tick.</li>
          <li><span class="mono">User.Read</span> (Delegated), which Entra adds by itself, can stay: it only applies when a person signs in to the app, which never happens. Removing it is tidier, not needed.</li>
        </ol></details>
        <details class="gs-why"><summary>Why Application and not Delegated?</summary>
          <p class="note">Delegated permissions act for a person who signs in, and only reach what that person may see. The inventory reads the devices by itself, every night, with nobody signed in, so it needs Application permissions, which an admin grants once for the whole organisation. Both are read-only: the inventory cannot change anything in Entra or Intune.</p></details></li>
      <li><div class="gs-head"><b>People from Entra</b> <span class="muted">(optional)</span></div>
        <p class="note">Beside the devices, the sync can read Entra's people (members, no guests) and show in Settings → Users who is in the directory (LDAP), in Entra, or in both. It fills in an empty department of anyone, and an empty name of a person from Lansweeper, and otherwise changes nobody from LDAP or added here; LDAP takes over a person Entra added when the same login comes. Needs <span class="mono">User.Read.All</span>; without it the devices still sync.</p>
        <div class="form" style="padding:8px 0 0"><label for="gPeople">People</label><select id="gPeople" ${edit ? '' : 'disabled'}>
          <option value="off" ${g.people === 'off' ? 'selected' : ''}>Don't read people</option>
          <option value="match" ${(g.people || 'match') === 'match' ? 'selected' : ''}>Mark the people who are in Entra</option>
          <option value="add" ${g.people === 'add' ? 'selected' : ''}>Mark them, and add the primary users of the devices</option></select></div></li>
      <li><div class="gs-head"><b>Windows Autopilot</b> <span class="muted">(optional)</span></div>
        <p class="note">The sync can read the devices registered in Windows Autopilot: each device gets its group tag and order number, and a device registered but not set up yet comes in by its serial number (in To review), before Intune knows it. Needs <span class="mono">DeviceManagementServiceConfig.Read.All</span> (Microsoft Graph, Application permissions), then <b>Grant admin consent</b>. Read only, like the others.</p>
        <div class="form" style="padding:8px 0 0"><label for="gAutopilot">Autopilot</label><select id="gAutopilot" ${edit ? '' : 'disabled'}>
          <option value="off" ${(g.autopilot || 'off') === 'off' ? 'selected' : ''}>Don't read Autopilot</option>
          <option value="on" ${g.autopilot === 'on' ? 'selected' : ''}>Read Windows Autopilot</option></select></div></li>
      <li><div class="gs-head"><b>Secure Boot</b> <span class="muted">(optional)</span></div>
        <p class="note">The sync can read whether Secure Boot is on, from Intune's health attestation of each Windows device it manages. Graph gives that only device by device, so the sync asks in batches of 20, which makes it a little longer. No other permission is needed. Shown on the device, with the filter Secure Boot off.</p>
        <div class="form" style="padding:8px 0 0"><label for="gSecureBoot">Secure Boot</label><select id="gSecureBoot" ${edit ? '' : 'disabled'}>
          <option value="off" ${(g.secureBoot || 'off') === 'off' ? 'selected' : ''}>Don't read Secure Boot</option>
          <option value="on" ${g.secureBoot === 'on' ? 'selected' : ''}>Read Secure Boot</option></select></div></li>
      <li><div class="gs-head"><b>Sign-in with Microsoft</b> <span class="muted">(optional)</span></div>
        <p class="note">People sign in with their Microsoft account (with your Entra rules: multi-factor, conditional access) instead of a password here. They must be users of the inventory with a role, found by their Entra account, user principal name or e-mail; nobody new gets in this way. Passwords keep working. In the app registration, add this as a <b>Web</b> redirect URI (Authentication → Add a platform → Web):</p>
        <div class="gs-uri"><span class="mono" id="gSsoUri">${location.origin + location.pathname.replace(/[^/]*$/, '') + 'api/sso/callback'}</span><button type="button" class="mini" id="gSsoCopy">Copy</button></div>
        <div class="form" style="padding:8px 0 0"><label for="gSso">Sign-in</label><select id="gSso" ${edit && g.configured ? '' : 'disabled'}>
          <option value="off" ${(g.sso || 'off') === 'off' ? 'selected' : ''}>Passwords only</option>
          <option value="on" ${g.sso === 'on' ? 'selected' : ''}>Also with Microsoft</option></select></div></li>
      <li><div class="gs-head"><b>Test and sync</b>${done(g.configured)}</div>
        <p class="note">Test connection at the top signs in and reads one device from each list; it names a permission that is still missing. Sync now reads them all; it also runs by itself, as set here.</p>
        ${scheduleRowHtml('graph', edit)}</li>
    </ol>
    ${certRows.length > 0 && html`<div style="overflow-x:auto;border-top:1px solid var(--bd2)"><table class="grid mini" style="min-width:0"><thead><tr><th>Certificate thumbprint (as Entra shows it)</th><th>Created</th><th>Expires</th><th>Sign-in</th><th></th></tr></thead><tbody>${certRows}</tbody></table></div>
    <p class="note" style="padding:8px 12px">Before one expires: create a new one, upload it to Entra, choose Use this one, test, then remove the old one here and in Entra.</p>`}
    <div style="padding:0 0 8px">${rawHtml(intakeRowHtml('graph'))}<p class="note" style="padding:0 12px">Devices in Entra or Intune that the inventory does not have yet are added as new devices; disabled records never do, and ones not heard from for 90 days always wait in To review.</p></div>${ambiguousHtml()}</div>`;
  /* Defender for Endpoint: read by the same sync, so it has no header of its own; a section below the fields. */
  const dh = $('#setDefender'), seen = objs.filter(o => o.defender).length;
  if (dh) dh.innerHTML = html`<div class="panelbox"><div class="hdr">Defender for Endpoint <span class="cnt">${!j ? '' : g.defender === 'on' ? `read with the Entra & Intune sync · ${seen} ${seen === 1 ? 'device' : 'devices'}` : 'not read'}</span></div>
    <p class="note" style="padding:10px 12px 0">Beside Entra and Intune, the sync can read each device's state in Microsoft Defender for Endpoint: active or not, its risk and exposure, the antivirus and when Defender last saw it. It is a fourth mark on the cards. In the app in Entra: <b>API permissions</b> → <b>Add a permission</b> → <b>APIs my organization uses</b> → <span class="mono">WindowsDefenderATP</span> → <b>Application permissions</b> → <span class="mono">Machine.Read.All</span>, then <b>Grant admin consent</b>. Read only, like the others. Test connection checks its permission.</p>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label for="gDefender">Defender</label><select id="gDefender" ${edit ? '' : 'disabled'}>
      <option value="off" ${(g.defender || 'off') === 'off' ? 'selected' : ''}>Don't read Defender</option>
      <option value="on" ${g.defender === 'on' ? 'selected' : ''}>Read Defender for Endpoint</option></select></div></div>`;
  const msg = $('#graphMsg');
  const say = (text, bad) => { if (msg) msg.innerHTML = bad ? html`<span style="color:var(--danger)">${text}</span>` : html`${text}`; };
  const post = async (url, body) => { const x = await fetch(url, {method: 'POST', credentials: 'same-origin', headers: body ? {'Content-Type': 'application/json'} : {}, body: body ? JSON.stringify(body) : undefined}); return {ok: x.ok, j: await x.json().catch(() => ({}))}; };
  $('#gSave').onclick = async () => {
    const x = await post('api/graph/settings', {tenant: $('#gTenant').value, clientId: $('#gClient').value});
    if (!x.ok){ $('#gSaveMsg').innerHTML = html`<span style="color:var(--danger)">${x.j.error || 'Not saved.'}</span>`; return; }
    toast('Microsoft Graph IDs saved'); await refreshGraph();
  };
  if ($('#gDefender')) $('#gDefender').onchange = async () => {
    const x = await post('api/graph/settings', {defender: $('#gDefender').value});
    toast(x.ok ? ($('#gDefender').value === 'on' ? 'Saved: Defender is read at the next sync. Test connection checks its permission.' : 'Saved: Defender is not read any more') : (x.j.error || 'Not saved.'));
  };
  $('#gSso').onchange = async () => {
    const x = await post('api/graph/settings', {sso: $('#gSso').value});
    SERVER.sso = x.ok ? $('#gSso').value === 'on' : SERVER.sso;
    toast(x.ok ? ($('#gSso').value === 'on' ? 'Saved: the sign-in offers Microsoft. Try it in a private window before you rely on it.' : 'Saved: sign-in with passwords only') : (x.j.error || 'Not saved.'));
  };
  $('#gSsoCopy').onclick = () => { navigator.clipboard?.writeText($('#gSsoUri').textContent).then(() => toast('Redirect URI copied'), () => toast('Select the address and copy it')); };
  $('#gSecureBoot').onchange = async () => {
    const x = await post('api/graph/settings', {secureBoot: $('#gSecureBoot').value});
    toast(x.ok ? ($('#gSecureBoot').value === 'on' ? 'Saved: Secure Boot is read at the next sync' : 'Saved: Secure Boot is not read any more') : (x.j.error || 'Not saved.'));
  };
  $('#gAutopilot').onchange = async () => {
    const x = await post('api/graph/settings', {autopilot: $('#gAutopilot').value});
    toast(x.ok ? ($('#gAutopilot').value === 'on' ? 'Saved: Autopilot is read at the next sync. Test connection checks its permission.' : 'Saved: Autopilot is not read any more') : (x.j.error || 'Not saved.'));
  };
  $('#gPeople').onchange = async () => {
    const x = await post('api/graph/settings', {people: $('#gPeople').value});
    toast(x.ok ? 'Saved: people are read at the next sync' : (x.j.error || 'Not saved.'));
  };
  $('#graphCert').onclick = async () => {
    const x = await post('api/graph/cert');
    if (!x.ok){ toast(x.j.error || 'The certificate could not be made.'); return; }
    toast('Certificate created. Download the .cer and upload it to the app in Entra.'); await refreshGraph();
  };
  if ($('#graphTest')) $('#graphTest').onclick = async () => {
    say('Testing…');
    const x = await post('api/graph/test');
    if (!x.ok) return say(x.j.error || 'The test failed.', true);
    if (x.j.missing.length) return say('Signed in, but these permissions are missing or not consented: ' + x.j.missing.join(', ') + '.', true);
    say(x.j.users ? 'Signed in and read the devices and the people. Ready to sync.' : 'Signed in and read both device lists. Ready to sync.');
  };
  if ($('#graphSync')) $('#graphSync').onclick = async () => {
    const btn = $('#graphSync'); btn.disabled = true; say('Syncing…');
    const x = await post('api/graph/sync');
    btn.disabled = false;
    if (!x.ok) return say(x.j.error || 'The sync failed.', true);
    const c = x.j.counts;
    await reloadFromServer(); await renderSetGraph();
    /* The pane was drawn again: the message goes to its new line. */
    const m2 = $('#graphMsg'); if (m2) m2.textContent = graphSummary(c);
  };
  root.querySelectorAll('[data-gcuse]').forEach(b => b.onclick = async () => {
    const x = await post(`api/graph/cert/${encodeURIComponent(b.dataset.gcuse)}/use`);
    if (!x.ok){ toast(x.j.error || 'Not changed.'); return; }
    toast('The server signs in with this certificate now'); await refreshGraph();
  });
  bindIntakeRows(root);
  /* Deleting a certificate removes its key from the server. The one in use can go too: Graph then stops until another
     certificate is created and uploaded. */
  root.querySelectorAll('[data-gcdel]').forEach(b => b.onclick = async () => {
    const t = b.dataset.gcdel, inUse = !!b.dataset.gcinuse;
    if (!confirm(`Delete certificate ${t}? Its private key is deleted from the server; this cannot be undone. Delete it in Entra as well (the app → Certificates & secrets → Certificates).`
      + (inUse ? '\n\nThis is the certificate the inventory signs in with: Microsoft Graph stops working until you create a new one and upload it to Entra.' : ''))) return;
    const d = await fetch('api/graph/cert/' + encodeURIComponent(t) + (inUse ? '?inUse=1' : ''), {method: 'DELETE', credentials: 'same-origin'});
    if (!d.ok){ const e = await d.json().catch(() => ({})); toast(e.error || 'Not deleted.'); return; }
    toast('Certificate deleted' + (inUse ? '. Microsoft Graph is off until a new one is uploaded.' : ''));
    await refreshGraph();
  });
  bindScheduleRows(root);
  applyRole();
}
/* After a change: the server's view of Graph (is it connected now?) and the pane. */
async function refreshGraph(){
  const r = await fetch('api/me', {credentials: 'same-origin'}).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => null) : null;
  if (j) SYNC.graph = SERVER.graph = !!j.graph;
  await renderSetGraph();
}
