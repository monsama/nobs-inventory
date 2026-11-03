/* Settings → System: Health, Backups (taken, restored, deleted; clearing the inventory, the factory reset), E-mail, and
   the log with its filters. */
import { modal, closeModal, confirmModal } from './19-modal.js';
import { clearConfirm, documents, queueServerSave, flushSave, reloadFromServer, SERVER } from './07-render.js';
import { settingChangedSince, settingRestore, valueAt } from './restore.js';
import { pushDate } from './settings-feed.js';
import { isAdmin } from './04-settings.js';
import { $, esc, st, toast } from './01-core.js';
import { dateTimeText } from './dates.js';
import { CERT, certAttention, certPanel, loadCert, wireCertPanel } from './certificate.js';
import { forgetPhotos, prepare } from './23-photos.js';
import { html, rawHtml } from './html.js';
/* The log: what was synced, saved, restored and signed in, and what failed. */
export let LOG_FILTER = 'all';
export const LOG_KINDS = [['all', 'All'], ['errors', 'Errors'], ['settings', 'Settings'], ['sync', 'Sync and push'], ['backup', 'Backups'], ['access', 'Access']];
/* A text typed to narrow the log: matched against what happened, who and the changed values. */
let LOG_Q = '';
/* A log line's kind, by its words. Backups first ("restored" is not a sign-in), then sign-ins and accounts, then the
   syncs; anything else is in All only. */
export const logKind = e => /^setting changed/i.test(e.action) ? 'settings' : /backup|restor/i.test(e.action) ? 'backup' : /sign in|password|login|user|removed by/i.test(e.action) ? 'access' : /sync|push|import|feed|ldap/i.test(e.action) ? 'sync' : 'other';
/* The log as last read: filters and the search work on it at once; Refresh and opening the tab read it again. */
let LOG_DATA = null;
export async function renderSetLog(){
  const pane = $('#setLog');
  if (!pane) return;
  if (!isAdmin()){ pane.innerHTML = '<div class="panelbox"><div class="hdr">Log</div><p class="note" style="padding:12px">Only administrators can see the log.</p></div>'; return; }
  const r = await fetch('api/log?limit=500', {credentials: 'same-origin'});
  LOG_DATA = r.ok ? await r.json() : {entries: []};
  drawLog();
}
function drawLog(){
  const pane = $('#setLog');
  if (!pane || !LOG_DATA) return;
  const j = LOG_DATA, errors = j.entries.filter(e => e.level === 'error').length;
  pane.innerHTML = html`<div class="panelbox"><div class="hdr">Log <span class="cnt">${j.entries.length}</span>${errors ? html` <span class="chip warn">${errors} error${errors === 1 ? '' : 's'}</span>` : ''}</div>
    <div class="addrel" style="padding:10px 12px;border-top:0">
      ${LOG_KINDS.map(([k, l]) => html`<button class="tab ${LOG_FILTER === k ? 'active' : ''}" data-logf="${k}">${l}</button>`)}
      <span class="grow"></span><input id="logQ" type="search" placeholder="Search the log" aria-label="Search the log" value="${LOG_Q}" style="width:200px"><button id="logRefresh">Refresh</button></div>
    <div id="logBody">${logRows()}</div></div>`;
  pane.querySelectorAll('[data-logf]').forEach(b => b.onclick = () => { LOG_FILTER = b.dataset.logf; drawLog(); });
  $('#logRefresh').onclick = () => renderSetLog();
  /* Typing narrows the list at once; only the list is drawn again, so the field keeps its focus. */
  const lq = $('#logQ'); lq.oninput = () => { LOG_Q = lq.value; $('#logBody').innerHTML = logRows(); };
  $('#logBody').onclick = ev => {
    const b = ev.target.closest('[data-lgr]'); if (!b) return;
    const [i, j] = b.dataset.lgr.split(':').map(Number), e = LOG_DATA.entries[i];
    if (e && e.detail) restoreLogged(e, e.detail.changes[j]);
  };
}
/* Restore on a logged settings change: the old value set back on the server, which logs it; asked first, with the value
   now and the one to set back. The page's own unsaved changes are saved before. */
const shownValue = v => v === undefined || v === null || v === '' ? 'empty' : String(v);
function restoreLogged(e, c){
  const r = settingRestore(e.detail.setting, c); if (!r || !isAdmin()) return;
  const cur = (documents().get('setting|' + e.detail.setting) || {}).value, now = r.keys.length ? valueAt(cur, r.keys) : cur;
  const what = `${e.action.replace(/^setting changed: /, '')}${c.path ? ` · ${c.path}` : ''}`;
  const since = settingChangedSince(cur, r) ? ' It was changed again since.' : '';
  confirmModal(`Restore ${what}?`, html`Sets it back to its value before the change of ${pushDate(e.at)}.${since}<br>Now: <b>${shownValue(now)}</b><br>Restore: <b>${r.unset ? 'empty' : shownValue(r.value)}</b>`, 'Restore', async () => {
    await flushSave();
    const res = await fetch('api/log/restore', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({at: e.at, setting: e.detail.setting, path: c.path})});
    if (!res.ok){ const j = await res.json().catch(() => ({})); toast(j.error || 'The setting could not be restored.'); return; }
    await reloadFromServer({ flush: false });
    toast(`${what} restored`);
    renderSetLog();
  }, { primary: true });
}
function logRows(){
  const q = LOG_Q.trim().toLowerCase();
  const entries = LOG_DATA.entries.filter(e => LOG_FILTER === 'all' || (LOG_FILTER === 'errors' ? e.level === 'error' : logKind(e) === LOG_FILTER))
    .filter(e => !q || `${e.action} ${e.who} ${e.detail ? JSON.stringify(e.detail.changes || []) : ''}`.toLowerCase().includes(q));
  const idx = new Map(LOG_DATA.entries.map((e, i) => [e, i]));
  return entries.length ? html`<div style="overflow-x:auto"><table class="grid mini stack" style="min-width:560px"><thead><tr><th style="width:170px">Time</th><th style="width:90px">Level</th><th style="width:160px">Who</th><th>What happened</th></tr></thead><tbody>
      ${entries.map(e => html`<tr class="${e.level === 'error' ? 'logerr' : ''}"><td class="mono">${pushDate(e.at)}</td><td>${e.level === 'error' ? html`<span class="chip warn">Error</span>` : html`<span class="chip kept">Info</span>`}</td><td>${e.who}</td><td style="white-space:normal">${e.action}${detailHtml(e.detail, idx.get(e))}</td></tr>`)}
      </tbody></table></div>` : html`<p class="note" style="padding:12px">Nothing to show for this ${q ? 'search' : 'filter'}.</p>`;
}
/* What a settings change changed, under its log line: each value before and after, or the items added, changed and removed. */
/* A plain value the log kept whole has Restore (public/js/restore.js); secrets, lists and pictures do not. */
function detailHtml(d, i){
  const list = d && Array.isArray(d.changes) ? d.changes : [];
  if (!list.length) return '';
  const restore = (c, j) => settingRestore(d.setting, c) ? html` <button type="button" class="link lg-restore" data-lgr="${i}:${j}" title="Set back to the value before this change">Restore</button>` : '';
  const row = (c, j) => {
    const what = [c.changed && `changed ${c.changed.join(', ')}`, c.added && `added ${c.added.join(', ')}`, c.removed && `removed ${c.removed.join(', ')}`].filter(Boolean);
    /* before and after as text: a missing value shows nothing. */
    return html`<tr>${c.path ? html`<th scope="row" class="mono">${c.path}</th>` : ''}<td${c.path ? '' : html` colspan="2"`}>${what.length ? what.join('; ')
      : html`<span class="lg-was">${String(c.before ?? '')}</span> <span aria-hidden="true">→</span><span class="sr-only">changed to</span> <span class="lg-now">${String(c.after ?? '')}</span>${restore(c, j)}`}</td></tr>`;
  };
  return html`<details class="lg-detail"><summary>${list.length} change${list.length === 1 ? '' : 's'}</summary><table class="lg-diff"><tbody>${list.map(row)}</tbody></table></details>`;
}
/* A size as people read it: kB below a megabyte, so a small backup does not show as 0.0 MB. */
const sizeText = n => n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} kB` : `${(n / 1048576).toFixed(1)} MB`;
/* Backups of the inventory: taken before each Lansweeper sync, push and import, and by hand. */
export let BACKUPS = null;
/* What all backups take on disk together (each part stored once), as the server says. */
let BACKUP_STORAGE = null;
export async function loadBackups(){
  const r = await fetch('api/backups', {credentials: 'same-origin'});
  const x = await fetch('api/backup-export', {credentials: 'same-origin'}).catch(() => null);
  EXPORT = x && x.ok ? await x.json() : null;
  if (r.ok){ const j = await r.json(); BACKUPS = j.backups; BACKUP_STORAGE = j.storage ?? null; if ($('#setMaint')) renderSetMaint(); }
}
/* The copy outside the server (server/backup-export.js), as the server says: set up, on, password set, last copy. */
let EXPORT = null;
/* The weekly restore test (server/restore-test.js): the newest backup restored into memory and counted. */
function restoreTestHtml(edit){
  const x = EXPORT; if (!x) return '';
  const t = x.restoreTest;
  const text = !t ? 'Not tested yet: the first test runs on Sunday at 03:30.' : t.ok
    ? html`Last test ${pushDate(t.at)}: ${t.from === 'copy' ? html`the copy <span class="mono">${t.name}</span>` : `the backup of ${Date.parse(String(t.name).split(' ')[0]) ? pushDate(String(t.name).split(' ')[0]) : t.name}`} came back whole, ${t.objects} device${t.objects === 1 ? '' : 's'}${t.photos ? `, ${t.photos} photo${t.photos === 1 ? '' : 's'}` : ''}.`
    : html`<span class="warn">The last test ${pushDate(t.at)} failed: ${t.error || ''}</span>`;
  return html`<div class="bk-export"><div class="bk-head"><b>Restore test</b> ${!t ? html`<span class="chip kept">Not yet</span>` : t.ok ? html`<span class="chip ok">Works</span>` : html`<span class="chip bad">Failed</span>`}</div>
    <p class="note">Each Sunday the newest ${(x.where || []).includes('folder') && x.on ? 'copy outside the server' : 'backup'} is restored into memory, apart from the inventory, and what comes back is counted. So you know a restore works before you need one.</p>
    <div class="bk-exrow"><span class="note" style="flex:1" id="rtLast">${text}</span><button id="rtRun" ${edit ? '' : 'disabled'}>Test now</button></div></div>`;
}
function exportHtml(edit){
  const x = EXPORT; if (!x) return '';
  if (!x.dir) return html`<div class="bk-export"><div class="bk-head"><b>Copy outside the server</b> <span class="chip kept">Not set up</span></div><p class="note">Optional. To keep a nightly encrypted copy off this server, mount a share and set <span class="mono">NI_BACKUP_EXPORT_DIR</span>, or name cloud storage with <span class="mono">NI_BACKUP_EXPORT_AZURE_URL</span> (Azure Blob, a SAS URL) or <span class="mono">NI_BACKUP_EXPORT_S3_URL</span> (S3) on the server (see the README). It can then be turned on here.</p></div>`;
  const l = x.last;
  const lastText = !l ? 'No copy yet.' : l.ok ? html`Last copy ${pushDate(l.at)}: <span class="mono">${l.file}</span>, ${(l.bytes / 1048576).toFixed(1)} MB${l.cloud ? `, uploaded to ${l.cloud}` : ''}.` : html`<span class="warn">The last copy failed ${pushDate(l.at)}: ${l.error || ''}</span>`;
  return html`<div class="bk-export"><div class="bk-head"><b>Copy outside the server</b> ${x.on ? html`<span class="chip ok">On</span>` : html`<span class="chip kept">Off</span>`}</div>
    <p class="note">Each night at 02:30 the inventory is written as one encrypted file to ${(x.where || ['the folder the server names']).map(w => w === 'folder' ? 'the folder the server names' : w).join(' and ')}.${(x.where || []).some(w => w !== 'folder') ? ' In cloud storage, set a lifecycle rule there for how long copies are kept.' : ''} Restore it here with Restore from file…, or on any computer with <span class="mono">scripts/decrypt-backup.mjs</span>. Keep the password apart from the server: without it a copy cannot be read.</p>
    <div class="bk-exrow"><label class="pchk" style="width:auto"><input type="checkbox" id="bxOn" ${x.on ? 'checked' : ''} ${edit && x.passwordSet ? '' : 'disabled'}> Copy each night</label>
      <label for="bxKeep" class="note">Keep the last</label><input id="bxKeep" type="number" min="1" max="365" value="${x.keep}" style="width:70px" ${edit ? '' : 'disabled'}><span class="note">copies</span></div>
    <div class="bk-exrow"><label for="bxPw" class="note">Password</label><input id="bxPw" type="password" autocomplete="new-password" placeholder="${x.passwordSet ? 'Set ' + pushDate(x.passwordSet) + ': type to replace' : `At least ${x.passwordMin} characters`}" ${edit ? '' : 'disabled'} style="flex:1;min-width:160px"><button id="bxPwSave" ${edit ? '' : 'disabled'}>Save password</button></div>
    <div class="bk-exrow"><span class="note" style="flex:1" id="bxLast">${lastText}</span><button id="bxRun" ${edit && x.passwordSet ? '' : 'disabled'}>Copy now</button></div></div>`;
}
function wireExport(){
  const call = async (method, url, body) => {
    const r = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'That did not work.');
    EXPORT = j; renderSetMaint(); return j;
  };
  const on = $('#bxOn'); if (on) on.onchange = () => call('PUT', 'api/backup-export', { on: on.checked }).then(() => toast(on.checked ? 'A copy is made each night' : 'No more copies outside the server'), e => toast(e.message));
  const keep = $('#bxKeep'); if (keep) keep.onchange = () => call('PUT', 'api/backup-export', { keep: Number(keep.value) }).then(j => toast(`Keeping the last ${j.keep} copies`), e => toast(e.message));
  const ps = $('#bxPwSave'); if (ps) ps.onclick = () => { const pw = $('#bxPw').value; call('POST', 'api/backup-export/password', { password: pw }).then(() => toast('Password saved: keep it apart from the server'), e => toast(e.message)); };
  const rt = $('#rtRun'); if (rt) rt.onclick = async () => { rt.disabled = true; $('#rtLast').textContent = 'Testing…'; try { await call('POST', 'api/restore-test'); toast('The backup came back whole'); } catch (e) { toast(e.message); loadBackups(); } };
  const run = $('#bxRun'); if (run) run.onclick = async () => { run.disabled = true; $('#bxLast').textContent = 'Copying…'; try { await call('POST', 'api/backup-export/run'); toast('Copied outside the server'); loadBackups(); } catch (e) { toast(e.message); loadBackups(); } };
}
export function backupPanel(edit){
  const list = BACKUPS || [];
  const rows = list.map(b => html`<tr><td>${pushDate(b.at)}</td><td>${b.reason}</td><td class="n hide-n">${b.objects}</td><td class="n hide-n">${sizeText(b.bytes)}</td>
    <td class="act"><a class="link" href="api/backups/${b.id}/download">Download</a> <button data-brestore="${b.id}" data-bat="${pushDate(b.at)}" ${edit ? '' : 'disabled'}>Restore</button> <button class="mini" data-bdel="${b.id}" ${edit ? '' : 'disabled'} aria-label="Delete this backup">Delete</button></td></tr>`);
  return String(html`<div class="panelbox"><div class="hdr">Backups <span class="cnt">${list.length}</span></div>
    <p class="note" style="padding:10px 12px">${st.autoBackups !== false ? 'A backup is taken once a day before the first change, and before every Lansweeper sync, push and import, before an LDAP or Microsoft Graph sync (once a day for Graph), before devices are added from Graph and before the type rules are applied.' : 'Automatic backups are off: none is taken before a sync, push or import. Backups made by hand and before a restore still are.'} A backup holds the devices, relations, history, types, locations, networks, plans with their pictures, device photos, contracts, licences, the settings and the entry sheets (still sealed). Each part is stored once: what did not change since the last backup, a photo above all, takes no room again. Restoring puts all of that back as it was. Users are kept, and the current state is backed up before a restore, so it can be restored again. Not in a backup: passwords, the Lansweeper push token, the Graph certificates' private keys, the LDAP service password and the log; the connections stay as they are now.</p>
    <div class="lpanel-add"><label class="pchk" style="width:auto"><input type="checkbox" id="bkAuto" ${st.autoBackups !== false ? 'checked' : ''} ${edit ? '' : 'disabled'}> Automatic backups</label></div>
    <div class="lpanel-add"><span class="note" style="flex:1">${list.length} backup${list.length === 1 ? '' : 's'}${BACKUP_STORAGE != null ? `, ${(BACKUP_STORAGE / 1048576).toFixed(1)} MB on disk for all of them` : ''}. Keep the last <input id="bkKeep" type="number" min="1" max="100" value="${st.backupKeep || 10}" style="width:64px;min-width:0" aria-label="Backups to keep" ${edit ? '' : 'disabled'}> (applied at the next backup).</span></div>
    ${list.length ? html`<div style="overflow-x:auto"><table class="grid mini" style="min-width:0"><thead><tr><th>Taken</th><th>Reason</th><th class="n hide-n" title="In the inventory, without those waiting in To review">Objects</th><th class="n hide-n" title="The size of the backup downloaded as a file">File size</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : html`<p class="note" style="padding:0 12px 10px">No backups yet.</p>`}
    ${edit ? html`${exportHtml(edit)}${restoreTestHtml(edit)}` : ''}
    <div class="addrel" style="padding:10px 12px"><button id="bkNew" class="primary" ${edit ? '' : 'disabled'}>Back up now</button><span class="note" style="flex:1"></span><label class="btnlike ${edit ? '' : 'disabled'}" tabindex="${edit ? 0 : -1}" role="button">Restore from file…<input type="file" id="bkFile" accept="application/json,.json,.nobsbak" hidden ${edit ? '' : 'disabled'}></label></div></div>`);
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
  wireExport();
  if (file) file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    /* An encrypted copy (from outside the server) goes as it is, with its password; a downloaded backup as text. */
    const head = new Uint8Array(await f.slice(0, 8).arrayBuffer());
    if (String.fromCharCode(...head) === 'NOBSENC1'){
      const bytes = await f.arrayBuffer();
      restoreModal(f.name, pw => fetch('api/backups/restore-encrypted', {method: 'POST', headers: {'Content-Type': 'application/octet-stream', ...(pw ? {'X-Backup-Password': pw} : {})}, credentials: 'same-origin', body: bytes}), { encrypted: true });
    } else {
      const text = await f.text();
      restoreModal(f.name, () => fetch('api/backups/restore-file', {method: 'POST', headers: {'Content-Type': 'text/plain'}, credentials: 'same-origin', body: text}));
    }
    file.value = '';
  };
}
/* A restore replaces the inventory, so it asks for the word RESTORE. */
export function restoreModal(label, run, { encrypted = false } = {}){
  modal(html`<div class="mh">Restore a backup</div><div class="mb"><p class="note">The inventory is replaced with the backup from ${label}. The current state is backed up first, so the restore can be undone from the list.</p>
    <div class="form" style="padding:0">${encrypted ? html`<label for="rsPw">Password of the copy</label><input id="rsPw" type="password" autocomplete="off" placeholder="${EXPORT && EXPORT.passwordSet ? 'Empty: the one set on this server' : 'The password it was made with'}">` : ''}<label for="rsWord">Type RESTORE to confirm</label><input id="rsWord" autocomplete="off"></div></div>
    <div class="mf"><button id="rsCancel">Cancel</button><button id="rsOk" class="danger-text" disabled>Restore</button></div>`, 'sm');
  $('#rsCancel').onclick = closeModal;
  $('#rsWord').oninput = () => { $('#rsOk').disabled = $('#rsWord').value !== 'RESTORE'; };
  $('#rsOk').onclick = async () => {
    /* Changes not saved yet are saved first, so the backup taken before the restore has them. */
    await flushSave();
    const r = await run(encrypted ? $('#rsPw').value : undefined);
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'The backup could not be restored.'); return; }
    closeModal(); toast('Restored'); await reloadFromServer({ discard: true }); loadBackups();
  };
  $('#rsWord').focus();
}
/* Maintenance: the HTTPS certificate, the backups, clearing the inventory and the factory reset. Only an admin can change
   anything; the two that delete ask for a typed word first, and sit together at the end, apart from everyday buttons. */
/* Health: what the server says of itself (server/health.js), read when Maintenance opens and by Check again. */
export let HEALTH = null;
let HEALTH_AT = 0;
export async function loadHealth(){
  HEALTH_AT = Date.now();
  const r = await fetch('api/health/details', {credentials: 'same-origin'}).catch(() => null);
  HEALTH = r && r.ok ? await r.json() : { state: 'bad', checks: [{ area: 'Server', name: 'Health', state: 'bad', value: 'Could not be read', note: 'The server did not answer.' }] };
  if ($('#setMaint')) renderSetMaint();
}
const HEALTH_CHIP = { ok: ['ok', 'OK'], warn: ['warn', 'Check'], bad: ['bad', 'Act now'], off: ['', 'Off'] };
/* Where each Health row is dealt with: [Settings tab, element on it]. A row with none (the version, the disk) is text. */
const HEALTH_GO = { 'Last backup': ['backups', '#bkNew'], 'Automatic backups': ['backups', '#bkAuto'], 'Copy outside the server': ['backups', '.bk-export'],
  'Restore test': ['backups', '#rtRun'], 'Device photos': ['maintenance', '#psRun'], 'This page (HTTPS)': ['maintenance', '#certPanel'],
  Lansweeper: ['feed', null], 'Active Directory': ['directory', null], 'Entra & Intune': ['entra', null], 'Microsoft Graph sign-in': ['entra', null],
  'Errors in the last 24 hours': ['log', 'errors'], 'Signed in': ['users', null] };
const hlTarget = c => HEALTH_GO[c.name] || (c.area === 'Certificates' && /^Directory CA/.test(c.name) ? ['directory', null] : null);
function healthGo(c){
  const t = hlTarget(c); if (!t) return;
  const [tab, at] = t;
  if (tab === 'log') LOG_FILTER = at || 'all';
  if (tab !== st.setTab){ const b = document.querySelector(`#setTabs [data-st="${tab}"]`); if (b) b.click(); if (!['maintenance', 'backups', 'mail'].includes(tab)) return; }
  const el = at && document.querySelector('#setMaint ' + at); if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const f = el.matches('button, input, select, a') ? el : el.querySelector('button:not([disabled]), input:not([disabled])');
  if (f) f.focus({ preventScroll: true });
  el.classList.add('hl-flash'); setTimeout(() => el.classList.remove('hl-flash'), 1600);
}
function healthPanel(){
  if (!HEALTH) return '<div class="panelbox"><div class="hdr">Health</div><p class="note" style="padding:12px">Checking…</p></div>';
  /* The page's own certificate is checked by the page (Certificate below): its state is counted here too. */
  const att = certAttention();
  const checks = [...HEALTH.checks, ...(att ? [{ area: 'Certificates', name: 'This page (HTTPS)', state: att[1] === 'bad' ? 'bad' : 'warn', value: att[2], note: att[3] || '' }] : [])];
  const worst = checks.some(c => c.state === 'bad') ? 'bad' : checks.some(c => c.state === 'warn') ? 'warn' : 'ok';
  const areas = [...new Set(checks.map(c => c.area))];
  const head = { ok: 'Everything is in order', warn: 'Something needs a look', bad: 'Something needs action' }[worst];
  return html`<div class="panelbox hl-${worst}"><div class="hdr">Health <span class="chip ${HEALTH_CHIP[worst][0]}">${head}</span></div>
    <div class="hl-tools"><span class="muted">Checked ${HEALTH.at ? dateTimeText(HEALTH.at) : ''}</span><button id="hlAgain" class="mini">Check again</button></div>
    ${areas.map(a => html`<div class="side-sub hl-area">${a}</div><div class="hl-list">${checks.filter(c => c.area === a).map(c => html`<div class="hl-row"><span class="chip ${HEALTH_CHIP[c.state][0]}">${HEALTH_CHIP[c.state][1]}</span>${hlTarget(c) ? html`<button type="button" class="link hl-go" data-hlgo="${c.area}|${c.name}" title="Go to where this is set">${c.name}</button>` : html`<b>${c.name}</b>`}<span class="hl-val">${String(c.value ?? '')}${c.note ? html`<small>${c.note}</small>` : ''}</span></div>`)}</div>`)}</div>`;
}
/* The weekly e-mail to the admins (server/digest.js): set up on the server (NI_SMTP_*), turned on and addressed here. */
let DIGEST = null;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/* The mail server, set here unless the server names one (NI_SMTP_*): host, port, security, sign-in and sender. The
   password is sent once and kept sealed on the server; it is never shown again, only when it was set. */
function mailHtml(m){
  if (m.source === 'server') return `<details class="dg-mail"><summary>Mail server: ${esc(m.host)}:${m.port} <span class="muted">(set on the server)</span></summary><p class="note">It is set on the server (<span class="mono">NI_SMTP_HOST</span> and the others, see the README): change it there.${m.from ? ` Sent from ${esc(m.from)}.` : ''}</p>
    <div class="bk-exrow"><input id="smTo" type="email" placeholder="Send a test to …" aria-label="Address for a test e-mail" style="flex:1"><button id="smTest">Send a test</button></div></details>`;
  const sec = m.security || 'starttls';
  return `<details class="dg-mail" ${m.source ? '' : 'open'}><summary>Mail server${m.source ? `: ${esc(m.host)}:${m.port}` : ': not set up'}</summary>
    <div class="form" style="padding:8px 0 0">
      <label for="smHost">Server</label><input id="smHost" value="${esc(m.host || '')}" placeholder="smtp.example.com" autocomplete="off">
      <label for="smSec">Security</label><select id="smSec">
        <option value="starttls" ${sec === 'starttls' ? 'selected' : ''}>STARTTLS (port 587)</option>
        <option value="tls" ${sec === 'tls' ? 'selected' : ''}>TLS from the start (port 465)</option>
        <option value="none" ${sec === 'none' ? 'selected' : ''}>None, a relay in the network (port 25)</option></select>
      <label for="smPort">Port</label><input id="smPort" type="number" min="1" max="65535" value="${esc(String(m.port || 587))}">
      <label for="smUser">Sign in as</label><input id="smUser" value="${esc(m.user || '')}" placeholder="Empty: no sign-in" autocomplete="off">
      <label for="smPw">Password</label><input id="smPw" type="password" autocomplete="new-password" placeholder="${m.passwordSet ? `Set on ${esc(pushDate(m.passwordSet))}: empty keeps it` : 'The password of that account'}">
      <label for="smFrom">Sender</label><input id="smFrom" value="${esc(m.from || '')}" placeholder="inventory@example.com (empty: the sign-in name)">
    </div>
    <p class="note">The password is kept sealed on the server and never shown again. Changing the server or port asks for it again.</p>
    <div class="bk-exrow"><input id="smTo" type="email" placeholder="Send a test to …" aria-label="Address for a test e-mail" style="flex:1"><button id="smTest" ${m.source ? '' : 'disabled'}>Send a test</button>${m.source ? '<button id="smDel" class="danger-text">Remove</button>' : ''}<button id="smSave" class="primary">Save mail server</button></div></details>`;
}
function wireMail(){
  const call = async (method, url, b) => { const r = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'That did not work.'); return j; };
  const sec = $('#smSec'), port = $('#smPort');
  if (sec) sec.onchange = () => { port.value = { starttls: 587, tls: 465, none: 25 }[sec.value]; };
  const sv = $('#smSave');
  if (sv) sv.onclick = () => call('PUT', 'api/smtp', { host: $('#smHost').value, port: Number(port.value), security: sec.value, user: $('#smUser').value, password: $('#smPw').value, from: $('#smFrom').value })
    .then(j => { DIGEST = j; renderSetMaint(); toast('Mail server saved: send a test to check it'); }, e => toast(e.message));
  const del = $('#smDel');
  if (del) del.onclick = () => { if (!confirm('Remove the mail server? The weekly e-mail stops until one is set again.')) return; call('DELETE', 'api/smtp').then(j => { DIGEST = j; renderSetMaint(); toast('Mail server removed'); }, e => toast(e.message)); };
  const t = $('#smTest');
  if (t) t.onclick = () => { t.disabled = true; call('POST', 'api/smtp/test', { to: $('#smTo').value }).then(() => toast('Test e-mail sent: check the inbox'), e => toast(e.message)).finally(() => { t.disabled = false; }); };
}
function digestPanel(){
  const d = DIGEST; if (!d) return '';
  const l = d.last;
  return `<div class="panelbox"><div class="hdr">Weekly e-mail ${!d.smtp ? '<span class="chip kept">Not set up</span>' : d.on ? '<span class="chip ok">On</span>' : '<span class="chip kept">Off</span>'}</div>
    <p class="note" style="padding:10px 12px">Once a week, a short list of what needs doing: warranties ending, contract notices due, people who left with devices, devices waiting in To review, maintenance due, the last backup, and what Health marks bad.${d.smtp ? '' : ' Set the mail server below first.'}</p>
    ${d.smtp ? `<div class="form" style="padding:0 12px 10px">
      <label for="dgTo">Send to</label><input id="dgTo" placeholder="it@example.com, lead@example.com" value="${esc((d.to || []).join(', '))}">
      <label for="dgDay">When</label><div class="bk-exrow"><select id="dgDay">${DAYS.map((n, i) => `<option value="${i}" ${i === d.day ? 'selected' : ''}>${n}</option>`).join('')}</select><select id="dgHour" aria-label="Hour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === d.hour ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select>
        <label class="pchk" style="width:auto"><input type="checkbox" id="dgOn" ${d.on ? 'checked' : ''}> Send each week</label></div>
      <span></span><label class="pchk" style="width:auto"><input type="checkbox" id="dgRep" ${d.reports ? 'checked' : ''}> Also send each problem a device's user reports, at once</label>
      </div>
      <div class="addrel" style="padding:10px 12px"><span class="note" style="flex:1">${!l ? 'Not sent yet.' : l.ok ? `Last sent ${esc(pushDate(l.at))} to ${l.to} address${l.to === 1 ? '' : 'es'}.` : `<span class="warn">Last try ${esc(pushDate(l.at))} failed: ${esc(l.error || '')}</span>`}</span>
        <button id="dgPreview">Preview</button><button id="dgSend">Send now</button><button id="dgSave" class="primary">Save</button></div>` : ''}${mailHtml(d.mail || {})}</div>`;
}
function wireDigest(){
  wireMail();
  const sv = $('#dgSave'); if (!sv) return;
  const body = () => ({ to: $('#dgTo').value, day: Number($('#dgDay').value), hour: Number($('#dgHour').value), on: $('#dgOn').checked, reports: $('#dgRep').checked, link: location.origin + location.pathname.replace(/[^/]*$/, '') });
  const call = async (method, url, b) => { const r = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'That did not work.'); return j; };
  sv.onclick = () => call('PUT', 'api/digest', body()).then(j => { DIGEST = j; renderSetMaint(); toast(j.on ? 'The weekly e-mail is on' : 'Saved'); }, e => toast(e.message));
  $('#dgSend').onclick = async () => { try { await call('PUT', 'api/digest', body()); DIGEST = await call('POST', 'api/digest/send'); toast('Sent'); } catch (e) { toast(e.message); DIGEST = null; } renderSetMaint(); };
  $('#dgPreview').onclick = async () => {
    try { const j = await call('GET', 'api/digest/preview');
      modal(html`<div class="mh">${j.subject}</div><div class="mb"><pre class="dg-pre">${j.text}</pre></div><div class="mf"><button id="dgClose" class="primary">Close</button></div>`, 'wide');
      $('#dgClose').onclick = () => { closeModal(); }; } catch (e) { toast(e.message); }
  };
}
/* Make photos smaller: every stored device photo written again the way new ones are (23-photos.js, prepare) and kept
   only when that makes it at least 15 % smaller. Runs in this page, one photo after the other; the floor plans are not
   touched. */
let PHOTOS = null, SHRINK = null;
const mbOf = n => `${(n / 1048576).toFixed(1)} MB`;
function photosShrinkPanel(){
  const list = PHOTOS; if (!Array.isArray(list) || !list.length) return '';
  const total = list.reduce((t, p) => t + p.bytes + (p.tbytes || 0), 0);
  const s = SHRINK;
  const status = !s ? `${list.length} photo${list.length === 1 ? '' : 's'} of devices and racks, ${mbOf(total)} together.`
    : s.running ? `Photo ${s.done} of ${s.n}: ${s.changed} made smaller, ${mbOf(s.saved)} saved so far…`
    : `Done: ${s.changed} of ${s.n} photos made smaller, ${mbOf(s.saved)} saved.${s.failed ? ` ${s.failed} could not be read here and stayed as they were.` : ''}`;
  return `<div class="panelbox"><div class="hdr">Photos</div>
    <p class="note" style="padding:10px 12px">New photos are made as small as they can be without a visible loss: WebP or JPEG, whichever is smaller, screenshots without any loss, and a file that is already small is kept as it is. Photos added before can be made smaller the same way: each is replaced only when it gets at least 15 % smaller, under a new address. Floor plans are not changed.</p>
    <div class="addrel" style="padding:0 12px 10px"><span class="note" style="flex:1" id="psStatus" role="status" aria-live="polite">${status}</span><button id="psRun" ${s && s.running ? 'disabled' : ''}>${s && s.running ? 'Working…' : 'Make photos smaller'}</button></div></div>`;
}
function wirePhotosShrink(){
  const b = $('#psRun'); if (!b) return;
  b.onclick = async () => {
    const list = [...(PHOTOS || [])];
    SHRINK = { running: true, n: list.length, done: 0, changed: 0, saved: 0, failed: 0 }; renderSetMaint();
    const show = () => { const el = $('#psStatus'); if (el) el.textContent = `Photo ${SHRINK.done} of ${SHRINK.n}: ${SHRINK.changed} made smaller, ${mbOf(SHRINK.saved)} saved so far…`; };
    for (const p of list) {
      SHRINK.done++; show();
      try {
        const r = await fetch(`api/images/${encodeURIComponent(p.id)}`, { credentials: 'same-origin' });
        if (!r.ok) throw new Error('not read');
        const blob = await r.blob();
        const next = await prepare(new File([blob], p.name || 'Photo', { type: p.mime }));
        const before = p.bytes + (p.tbytes || 0), after = next.bytes + next.tbytes;
        if (after > before * 0.85) continue;
        const u = await fetch(`api/images/${encodeURIComponent(p.id)}/replace`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
        if (u.ok) { SHRINK.changed++; SHRINK.saved += before - after; } else if (u.status !== 409) SHRINK.failed++;
      } catch { SHRINK.failed++; }
    }
    SHRINK.running = false; PHOTOS = null; forgetPhotos();
    toast(SHRINK.changed ? `${SHRINK.changed} photo${SHRINK.changed === 1 ? '' : 's'} made smaller, ${mbOf(SHRINK.saved)} saved` : 'The photos were already as small as they get');
    if ($('#setMaint')) renderSetMaint();
  };
}
export function renderSetMaint(){
  const edit = isAdmin();
  if (edit && BACKUPS === null) loadBackups();
  /* Read again when Maintenance is opened a minute or more after the last read. */
  if (edit && (HEALTH === null || (HEALTH && Date.now() - HEALTH_AT > 60000))) { HEALTH = undefined; loadHealth(); }
  if (CERT === null) loadCert().then(() => { if ($('#setMaint')) renderSetMaint(); });
  if (edit && DIGEST === null){ DIGEST = undefined; fetch('api/digest', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(j => { DIGEST = j; if ($('#setMaint')) renderSetMaint(); }, () => { DIGEST = null; }); }
  if (edit && PHOTOS === null){ PHOTOS = undefined; fetch('api/images', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : { images: [] }).then(j => { PHOTOS = j.images; if ($('#setMaint')) renderSetMaint(); }, () => { PHOTOS = []; }); }
  /* Three tabs: Health (the checks, the certificate, the photos), Backups (with clearing the inventory and the factory
     reset, beside restoring), and E-mail (the mail server and the weekly e-mail). The API tokens are under Users. */
  const part = ['backups', 'mail'].includes(st.setTab) ? st.setTab : 'system';
  if (part === 'backups'){
    $('#setMaint').innerHTML = edit ? backupPanel(edit) + `${edit ? `<div class="panelbox" style="border-color:var(--danger-bg)"><div class="hdr">Clear inventory</div>
    <div class="note" style="padding:12px">Deletes every device with its relations and history, for everyone, and takes them out of the contracts. Users, locations, sites, floor plans, contracts and settings stay, and so do the racks and the objects excluded from sync unless you choose otherwise. A backup is taken first.</div>
    <div class="addrel" style="padding:10px 12px"><button id="setReset" class="danger-text">Clear inventory…</button></div></div>` : ''}<div class="panelbox" style="border-color:var(--danger-bg)"><div class="hdr">Factory reset</div>
    <div class="note" style="padding:12px">Returns the app to the state of a new installation. Everything is removed: devices, relations and history, users and their sign-in, locations, sites, racks, object types and settings, the LDAP and Microsoft Graph connections with Graph's certificates and keys, the Lansweeper push token, and the entry sheets. Only your own account stays, with its password, so you can sign in again.</div>
    <div class="note" style="padding:10px 12px">Backups stay unless you choose to delete them too, and the audit log keeps a record of the reset. What is set on the server itself (NI_LDAP_…, NI_GRAPH_… and the service passwords) is outside the app: remove it there.</div>
    <div class="addrel" style="padding:10px 12px"><button id="frReset" class="danger-text" ${edit ? '' : 'disabled'}>Factory reset…</button></div></div>` : '<p class="note" style="padding:12px">Only an admin sees the backups.</p>';
    if (edit){ wireBackups(edit); $('#frReset').onclick = factoryResetModal; $('#setReset').onclick = () => clearConfirm(); }
    return;
  }
  if (part === 'mail'){ $('#setMaint').innerHTML = edit ? digestPanel() : '<p class="note" style="padding:12px">Only an admin sets up the e-mail.</p>'; if (edit) wireDigest(); return; }
  $('#setMaint').innerHTML = html`${edit ? rawHtml(healthPanel()) : ''}${rawHtml(certPanel())}${edit ? rawHtml(photosShrinkPanel()) : ''}`;
  wireCertPanel(() => { if ($('#setMaint')) renderSetMaint(); });
  wirePhotosShrink();
  $('#setMaint').querySelectorAll('[data-hlgo]').forEach(b => b.onclick = () => { const [area, name] = b.dataset.hlgo.split('|'); const c = HEALTH && HEALTH.checks.find(x => x.area === area && x.name === name); healthGo(c || { area, name }); });
  const ha = $('#hlAgain'); if (ha) ha.onclick = () => { HEALTH = undefined; renderSetMaint(); loadHealth(); };
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
