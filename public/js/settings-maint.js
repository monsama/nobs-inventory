/* Settings → Maintenance and Log: backups (taken, restored, deleted), the factory reset, and the log with its filters. */
import { modal, closeModal } from './03-object-modals.js';
import { clearConfirm, queueServerSave, flushSave, reloadFromServer, SERVER } from './07-render-plans.js';
import { pushDate } from './settings-feed.js';
import { canEdit } from './04-settings.js';
import { $, esc, st, toast } from './01-core.js';
import { CERT, certPanel, loadCert, wireCertPanel } from './certificate.js';
/* The log: what was synced, saved, restored and signed in, and what failed. */
export let LOG_FILTER = 'all';
export const LOG_KINDS = [['all', 'All'], ['errors', 'Errors'], ['sync', 'Sync and push'], ['backup', 'Backups'], ['access', 'Access']];
/* A log line's kind, by its words. Backups first ("restored" is not a sign-in), then sign-ins and accounts, then the
   syncs; anything else is in All only. */
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
    <td class="act"><a class="link" href="api/backups/${b.id}/download">Download</a> <button data-brestore="${esc(b.id)}" data-bat="${esc(pushDate(b.at))}" ${edit ? '' : 'disabled'}>Restore</button> <button class="icon ghost" data-bdel="${esc(b.id)}" ${edit ? '' : 'disabled'} aria-label="Delete this backup">×</button></td></tr>`).join('');
  return `<div class="panelbox"><div class="hdr">Backups <span class="cnt">${list.length}</span></div>
    <p class="note" style="padding:10px 12px">${st.autoBackups !== false ? 'A backup is taken before every Lansweeper sync, push and import, before an LDAP or Microsoft Graph sync (once a day for Graph), before devices are added from Graph and before the type rules are applied.' : 'Automatic backups are off: none is taken before a sync, push or import. Backups made by hand and before a restore still are.'} A backup holds the devices, relations, history, types, locations, networks, plans with their pictures, contracts, licences, the settings and the entry sheets (still sealed). Restoring puts all of that back as it was. Users are kept, and the current state is backed up before a restore, so it can be restored again. Not in a backup: passwords, the Lansweeper push token, the Graph certificates' private keys, the LDAP service password and the log; the connections stay as they are now.</p>
    <div class="lpanel-add"><label class="pchk" style="width:auto"><input type="checkbox" id="bkAuto" ${st.autoBackups !== false ? 'checked' : ''} ${edit ? '' : 'disabled'}> Automatic backups</label></div>
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
    const at = b.closest('tr')?.querySelector('[data-bat]')?.dataset.bat || '';
    if (!confirm(`Delete the backup${at ? ' of ' + at : ''}? It cannot be brought back.`)) return;
    const r = await fetch('api/backups/' + b.dataset.bdel, {method: 'DELETE', credentials: 'same-origin'});
    if (r.ok){ msg('Backup deleted'); loadBackups(); }
    else msg((await r.json().catch(() => ({}))).error || 'The backup was not deleted.');
  });
  document.querySelectorAll('[data-brestore]').forEach(b => b.onclick = () => restoreModal(b.dataset.bat, () => fetch('api/backups/' + b.dataset.brestore + '/restore', {method: 'POST', credentials: 'same-origin'})));
  const file = $('#bkFile');
  if ($('#bkAuto')) $('#bkAuto').onchange = () => { st.autoBackups = $('#bkAuto').checked; queueServerSave(); toast(st.autoBackups ? 'Automatic backups are on' : 'Automatic backups are off'); renderSetMaint(); };
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
    /* Changes not saved yet are saved first, so the backup taken before the restore has them. */
    await flushSave();
    const r = await run();
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'The backup could not be restored.'); return; }
    closeModal(); toast('Restored'); await reloadFromServer({ discard: true }); loadBackups();
  };
  $('#rsWord').focus();
}
/* Maintenance: the HTTPS certificate, the backups, clearing the inventory and the factory reset. Only an admin can change
   anything; the two that delete ask for a typed word first, and sit together at the end, apart from everyday buttons. */
export function renderSetMaint(){
  const edit = canEdit();
  if (edit && BACKUPS === null) loadBackups();
  if (CERT === null) loadCert().then(() => { if ($('#setMaint')) renderSetMaint(); });
  $('#setMaint').innerHTML = `${certPanel()}${edit ? backupPanel(edit) : ''}${edit ? `<div class="panelbox" style="border-color:var(--danger-bg)"><div class="hdr">Clear inventory</div>
    <div class="note" style="padding:12px">Deletes every device with its relations and history, for everyone. Users, locations, sites, racks and settings stay, and so do the objects excluded from sync unless you choose otherwise. A backup is taken first.</div>
    <div class="addrel" style="padding:10px 12px"><button id="setReset" class="danger-text">Clear inventory…</button></div></div>` : ''}<div class="panelbox" style="border-color:var(--danger-bg)"><div class="hdr">Factory reset</div>
    <div class="note" style="padding:12px">Returns the app to the state of a new installation. Everything is removed: devices, relations and history, users and their sign-in, locations, sites, racks, object types and settings, the LDAP and Microsoft Graph connections with Graph's certificates and keys, the Lansweeper push token, and the entry sheets. Only your own account stays, with its password, so you can sign in again.</div>
    <div class="note" style="padding:10px 12px">Backups stay unless you choose to delete them too, and the audit log keeps a record of the reset. What is set on the server itself (NI_LDAP_…, NI_GRAPH_… and the service passwords) is outside the app: remove it there.</div>
    <div class="addrel" style="padding:10px 12px"><button id="frReset" class="danger-text" ${edit ? '' : 'disabled'}>Factory reset…</button></div></div>`;
  wireCertPanel(() => { if ($('#setMaint')) renderSetMaint(); });
  if (edit) wireBackups(edit);
  if (edit) $('#frReset').onclick = factoryResetModal;
  if (edit) $('#setReset').onclick = () => clearConfirm();
}
export function factoryResetModal(){
  modal(`<div class="mh">Factory reset?</div>
    <div class="mb"><p class="note">Everything is removed, except your own account, including the LDAP and Microsoft Graph connections with Graph's certificates and keys, and the entry sheets. This cannot be undone: only a backup brings the data back.</p>
      <label class="pchk" style="display:flex;gap:6px;align-items:center;margin:8px 0"><input type="checkbox" id="frBackups"> Also delete all backups (then nothing can be brought back)</label>
      <label class="note" for="frWord" style="display:block;margin-top:6px">Type FACTORY RESET to confirm</label><input id="frWord" autocomplete="off" aria-label="Type FACTORY RESET" style="width:100%"></div>
    <div class="mf"><button id="frCancel">Cancel</button><button id="frOk" class="danger-text" disabled>Factory reset</button></div>`, 'sm');
  $('#frWord').oninput = () => { $('#frOk').disabled = $('#frWord').value.trim() !== 'FACTORY RESET'; };
  $('#frWord').focus();
  $('#frCancel').onclick = closeModal;
  $('#frOk').onclick = async () => {
    clearTimeout(SERVER.timer);
    const r = await fetch('api/factory-reset', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({confirm: 'FACTORY RESET', backups: $('#frBackups').checked})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'The reset did not run.'); return; }
    location.reload();
  };
}
