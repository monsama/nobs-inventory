/* Settings → LDAP & Graph, the Microsoft Graph half: the app registration, certificates, people from Entra, test
   and sync, and the devices Graph has that the inventory does not. */
import { intakeRowHtml, bindIntakeRows } from './15-review.js';
import { ENTRA, scheduleRowHtml, bindScheduleRows } from './settings-feed.js';
import { SERVER, reloadFromServer, queueServerSave } from './07-render-plans.js';
import { canEdit, applyRole } from './04-settings.js';
import { st, esc, byId, $, dayText, toast, SYNC } from './01-core.js';
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
    c.peopleError || ''].filter(Boolean).join(' ');
}
/* Graph records that fit more than one device here, by serial number or name: put on none of them, listed to be fixed. */
function ambiguousHtml(){
  const list = st.graphAmbiguous || [];
  if (!list.length) return '';
  const dev = id => { const o = byId(id); return o ? `<button class="link" data-open="${esc(id)}" title="Open ${esc(o.name)}">${esc(o.code)} ${esc(o.name)}</button>` : ''; };
  return `<div class="gu-box"><div class="gs-head" style="padding:10px 12px 0"><b>Fits more than one device here</b><span class="cnt">${list.length}</span></div>
    <p class="note" style="padding:4px 12px 8px">Graph has these devices, but their serial number or name is used by more than one device in the inventory, so Graph put them on none. Give the devices distinct names or serial numbers, or retire the extra one, then sync again.</p>
    <div style="overflow:auto;max-height:240px;border-top:1px solid var(--bd2)"><table class="grid mini" id="gaList" style="min-width:0"><thead><tr><th>In Graph</th><th>Same</th><th>Devices here</th></tr></thead><tbody>
      ${list.map(a => `<tr><td>${esc(a.name)}${a.serial ? ` <span class="mono muted">${esc(a.serial)}</span>` : ''}</td><td>${a.by === 'serial' ? 'serial number' : 'name'}</td><td>${a.devices.map(dev).filter(Boolean).join(', ')}</td></tr>`).join('')}
    </tbody></table></div></div>`;
}
export async function renderSetGraph(){
  const root = $('#setGraph');
  if (!root) return;
  const edit = canEdit();
  const r = edit ? await fetch('api/graph/status', {credentials: 'same-origin'}).catch(() => null) : null;
  const j = r && r.ok ? await r.json().catch(() => null) : null;
  if (!$('#setGraph')) return;
  const g = j || {configured: SERVER.graph, source: null, tenant: '', clientId: '', certs: []};
  const fromServer = g.source === 'server';
  const ids = !!(g.tenant && g.clientId);
  const chosen = g.certs.find(c => c.chosen && c.onServer);
  /* A step that is done says so at the right of its title, in the same chip as other states. */
  const done = ok => ok ? '<span class="chip ok gs-done">Done</span>' : '';
  const day = t => esc(dayText(String(t || '').slice(0, 10)));
  const left = t => Math.floor((new Date(t) - Date.now()) / 86400000);
  const certRows = g.certs.map(c => `<tr><td class="mono">${esc(c.thumbprint)}</td><td>${day(c.created)}</td>
      <td>${day(c.expires)}${left(c.expires) < 60 ? ` <span class="chip ${left(c.expires) < 0 ? 'bad' : 'warn'}">${left(c.expires) < 0 ? 'expired' : 'in ' + left(c.expires) + ' days'}</span>` : ''}</td>
      <td>${c.inUse ? '<span class="chip ok">In use</span>' : c.onServer ? `<button data-gcuse="${esc(c.thumbprint)}" ${fromServer ? 'disabled title="The server settings decide the certificate"' : ''}>Use this one</button>` : '<span class="muted" title="Made before the server kept keys: make a new one">No key here</span>'}</td>
      <td class="act">${c.onServer ? `<a class="link" href="api/graph/cert/${esc(c.thumbprint)}/cer" download>Download .cer</a>` : ''}${fromServer && c.inUse ? '' : ` <button class="icon ghost" data-gcdel="${esc(c.thumbprint)}" ${c.inUse || c.chosen ? 'data-gcinuse="1"' : ''} aria-label="Delete this certificate" title="Delete">×</button>`}</td></tr>`).join('');
  root.innerHTML = `<div class="panelbox"><div class="hdr">Microsoft Graph ${g.configured ? '<span class="chip ok">Connected</span>' : '<span class="cnt">not set up</span>'}</div>
    <p class="note">Reads what Microsoft Entra and Intune know of each device: join type, management, compliance, encryption, primary user and last contact, shown on the device. Devices are matched by serial number, else by name. Fields a device does not have yet are filled in; ones it has stay, except on devices added from here, which Graph keeps up to date until Lansweeper takes them over. It only reads: it changes nothing in Entra or Intune.</p>
    ${fromServer ? '<p class="note" style="padding:8px 12px">The connection is set by the server settings (NI_GRAPH_TENANT, NI_GRAPH_CLIENT_ID, NI_GRAPH_CERT, NI_GRAPH_KEY). Remove them on the server to use the steps below instead.</p>' : ''}
    <ol class="graph-steps">
      <li><div class="gs-head"><b>Register the app in Entra</b>${done(ids)}</div>
        <ol class="gs-sub">
          <li>Open the <a class="link" style="text-decoration:underline" href="${ENTRA}" target="_blank" rel="noopener">Entra admin center</a> → <b>Applications</b> → <b>App registrations</b> → <b>New registration</b>.</li>
          <li><b>Name:</b> <span class="mono">NOBS Inventory</span></li>
          <li><b>Supported account types:</b> <i>Accounts in this organizational directory only (single tenant)</i></li>
          <li><b>Redirect URI:</b> leave it empty. The inventory signs in as itself with a certificate, not as a person, so nothing is sent back to a web address.</li>
          <li>Click <b>Register</b>. The app's <b>Overview</b> page opens: copy its two IDs into the fields below and save.</li>
        </ol>
        <div class="form" style="padding:8px 0 0">
          <label for="gTenant">Directory (tenant) ID</label><input id="gTenant" class="mono" value="${esc(g.tenant)}" placeholder="1b2c3d4e-5f60-…" autocomplete="off" ${fromServer ? 'disabled' : ''}>
          <label for="gClient">Application (client) ID</label><input id="gClient" class="mono" value="${esc(g.clientId)}" placeholder="9a8b7c6d-…" autocomplete="off" ${fromServer ? 'disabled' : ''}>
        </div>
        <div class="addrel" style="padding:8px 0 0;border:0;background:none"><button id="gSave" ${fromServer ? 'disabled' : ''}>Save IDs</button><span class="note" id="gSaveMsg" role="status"></span></div></li>
      <li><div class="gs-head"><b>Give the app a certificate</b>${done(!!chosen || fromServer)}</div>
        <ol class="gs-sub">
          <li>Click <b>Create a certificate</b> below. The server keeps its private key, encrypted; the key never leaves the server.</li>
          <li>Click <b>Download the .cer</b>.</li>
          <li>In the app in Entra: <b>Certificates &amp; secrets</b> → tab <b>Certificates</b> (not Client secrets) → <b>Upload certificate</b> → choose the .cer → <b>Add</b>.</li>
          <li>Entra lists it with a thumbprint: the same as in the list at the bottom of this box.</li>
        </ol>
        <div class="addrel" style="padding:8px 0 0;border:0;background:none"><button id="graphCert" ${edit && !fromServer ? '' : 'disabled'}>Create a certificate</button>${chosen ? `<a class="link" href="api/graph/cert/${esc(chosen.thumbprint)}/cer" download>Download the .cer</a>` : ''}</div></li>
      <li><div class="gs-head"><b>Allow it to read devices</b></div>
        <ol class="gs-sub">
          <li>In the app in Entra: <b>API permissions</b> → <b>Add a permission</b> → <b>Microsoft Graph</b> → <b>Application permissions</b> (not Delegated).</li>
          <li>Search and tick <span class="mono">Device.Read.All</span> and <span class="mono">DeviceManagementManagedDevices.Read.All</span> → <b>Add permissions</b>. For people from Entra (step 4) also <span class="mono">User.Read.All</span>.</li>
          <li>Click <b>Grant admin consent for</b> your organisation → <b>Yes</b>. Both lines then show a green tick.</li>
          <li><span class="mono">User.Read</span> (Delegated), which Entra adds by itself, can stay: it only applies when a person signs in to the app, which never happens. Removing it is tidier, not needed.</li>
        </ol>
        <details class="gs-why"><summary>Why Application and not Delegated?</summary>
          <p class="note">Delegated permissions act for a person who signs in, and only reach what that person may see. The inventory reads the devices by itself, every night, with nobody signed in, so it needs Application permissions, which an admin grants once for the whole organisation. Both are read-only: the inventory cannot change anything in Entra or Intune.</p></details></li>
      <li><div class="gs-head"><b>People from Entra</b> <span class="muted">(optional)</span></div>
        <p class="note">Beside the devices, the sync can read Entra's people (members, no guests) and show in Settings → Users who is in the directory (LDAP), in Entra, or in both. It fills in an empty department of anyone, and an empty name of a person from Lansweeper, and otherwise changes nobody from LDAP or added here; LDAP takes over a person Entra added when the same login comes. Needs <span class="mono">User.Read.All</span>; without it the devices still sync.</p>
        <div class="form" style="padding:8px 0 0"><label for="gPeople">People</label><select id="gPeople" ${edit ? '' : 'disabled'}>
          <option value="off" ${g.people === 'off' ? 'selected' : ''}>Don't read people</option>
          <option value="match" ${(g.people || 'match') === 'match' ? 'selected' : ''}>Mark the people who are in Entra</option>
          <option value="add" ${g.people === 'add' ? 'selected' : ''}>Mark them, and add the primary users of the devices</option></select></div></li>
      <li><div class="gs-head"><b>Defender for Endpoint</b> <span class="muted">(optional)</span></div>
        <p class="note">Beside Entra and Intune, the sync can read each device's state in Microsoft Defender for Endpoint: active or not, its risk and exposure, the antivirus and when Defender last saw it. It is a fourth mark on the cards. In the app in Entra: <b>API permissions</b> → <b>Add a permission</b> → <b>APIs my organization uses</b> → <span class="mono">WindowsDefenderATP</span> → <b>Application permissions</b> → <span class="mono">Machine.Read.All</span>, then <b>Grant admin consent</b>. Read only, like the others.</p>
        <div class="form" style="padding:8px 0 0"><label for="gDefender">Defender</label><select id="gDefender" ${edit ? '' : 'disabled'}>
          <option value="off" ${(g.defender || 'off') === 'off' ? 'selected' : ''}>Don't read Defender</option>
          <option value="on" ${g.defender === 'on' ? 'selected' : ''}>Read Defender for Endpoint</option></select></div></li>
      <li><div class="gs-head"><b>Device fields</b></div>
        <p class="note">Intune can fill in a device's empty operating system, model, MAC address, memory and disks. A value set by hand or from Lansweeper goes first; one from Active Directory gives way. The device shows where a value came from.</p>
        <label class="pchk" style="width:auto;padding-top:6px"><input type="checkbox" id="gFill" ${st.fillGraph !== false ? 'checked' : ''} ${edit ? '' : 'disabled'}> Fill in empty fields from Intune</label></li>
      <li><div class="gs-head"><b>Test and sync</b>${done(g.configured)}</div>
        <p class="note">Test connection signs in and reads one device from each list; it names a permission that is still missing. Sync now reads them all; it also runs by itself, as set below.</p>
        <div class="addrel" style="padding:8px 0 0;border:0;background:none"><button id="graphTest" ${g.configured && edit ? '' : 'disabled'}>Test connection</button><button id="graphSync" class="primary" ${g.configured && edit ? '' : 'disabled'}>Sync now</button><span class="note" id="graphMsg" role="status"></span></div>
        ${scheduleRowHtml('graph', edit)}</li>
    </ol>
    ${certRows ? `<div style="overflow-x:auto;border-top:1px solid var(--bd2)"><table class="grid mini" style="min-width:0"><thead><tr><th>Certificate thumbprint (as Entra shows it)</th><th>Created</th><th>Expires</th><th>Sign-in</th><th></th></tr></thead><tbody>${certRows}</tbody></table></div>
    <p class="note" style="padding:8px 12px">Before one expires: create a new one, upload it to Entra, choose Use this one, test, then remove the old one here and in Entra.</p>` : ''}
    <div style="padding:0 0 8px">${intakeRowHtml('graph')}<p class="note" style="padding:0 12px">Devices Graph has and the inventory does not become devices; disabled records never do, and ones not heard from for 90 days always wait in To review.</p></div>${ambiguousHtml()}</div>`;
  const msg = $('#graphMsg');
  const say = (text, bad) => { msg.innerHTML = bad ? `<span style="color:var(--danger)">${esc(text)}</span>` : esc(text); };
  const post = async (url, body) => { const x = await fetch(url, {method: 'POST', credentials: 'same-origin', headers: body ? {'Content-Type': 'application/json'} : {}, body: body ? JSON.stringify(body) : undefined}); return {ok: x.ok, j: await x.json().catch(() => ({}))}; };
  $('#gSave').onclick = async () => {
    const x = await post('api/graph/settings', {tenant: $('#gTenant').value, clientId: $('#gClient').value});
    if (!x.ok){ $('#gSaveMsg').innerHTML = `<span style="color:var(--danger)">${esc(x.j.error || 'Not saved.')}</span>`; return; }
    toast('Microsoft Graph IDs saved'); await refreshGraph();
  };
  const gf = $('#gFill'); if (gf) gf.onchange = () => { st.fillGraph = gf.checked; queueServerSave(); };
  $('#gDefender').onchange = async () => {
    const x = await post('api/graph/settings', {defender: $('#gDefender').value});
    toast(x.ok ? ($('#gDefender').value === 'on' ? 'Saved: Defender is read at the next sync. Test connection checks its permission.' : 'Saved: Defender is not read any more') : (x.j.error || 'Not saved.'));
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
  $('#graphTest').onclick = async () => {
    say('Testing…');
    const x = await post('api/graph/test');
    if (!x.ok) return say(x.j.error || 'The test failed.', true);
    if (x.j.missing.length) return say('Signed in, but these permissions are missing or not consented: ' + x.j.missing.join(', ') + '.', true);
    say(x.j.users ? 'Signed in and read the devices and the people. Ready to sync.' : 'Signed in and read both device lists. Ready to sync.');
  };
  $('#graphSync').onclick = async () => {
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
