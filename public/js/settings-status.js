/* The status header every source page in Settings starts with: on or off, a dot for how it is doing, its last sync and
   what it brought, Sync now and Test connection, and the history of what its syncs changed on the devices. */
import { $, LS_ON, SYNC, st } from './01-core.js';
import { closeModal, leaveSettings, modal } from './19-modal.js';
import { SERVER, render } from './07-render.js';
import { isAdmin } from './04-settings.js';
import { resetFilters } from './02-views.js';
import { scheduleOf } from './schedule.js';
import { SOURCE_LABEL } from './sync-map.js';
import { runOf, summary, when } from './16-sync.js';
import { html } from './html.js';

/* A source by its field key (ls, ad, graph), its sync key (syncRuns, the schedule) and its Settings tab. */
export const RUN_KEY = { ls: 'lansweeper', ad: 'ldap', graph: 'graph' };
export const SOURCE_TAB = { ls: 'feed', ad: 'directory', graph: 'entra' };
/* Set up, as Health says it: Lansweeper switched on and given an API, a push or a file; the directory and Graph set on the server. */
export const sourceOn = src => src === 'ls' ? LS_ON() && !!SYNC.lansweeper : src === 'ad' ? !!(SERVER.ldap || (st.ldap && st.ldap.url)) : src === 'graph' ? !!(SERVER.graph || SYNC.graph) : false;

/* How a source is doing, as a dot in the app's colours and a word: off (grey ring), failed (red), not run yet, late or
   with warnings (amber), synced (green). Late as on Health: not run for twice its interval and an hour; a push is not
   planned here, so it is never late. */
export function sourceState(src){
  if (src === 'ls' && !LS_ON()) return { cls: 'off', text: 'Off' };
  if (!sourceOn(src)) return { cls: 'off', text: 'Not set up' };
  const r = runOf(RUN_KEY[src]);
  if (!r) return { cls: 'warn', text: 'Not run yet' };
  if (!r.ok) return { cls: 'bad', text: 'Last sync failed' };
  const every = (scheduleOf(st)[RUN_KEY[src]] || {}).every;
  if (every && r.how !== 'push' && Date.now() - Date.parse(r.at) > 2 * every * 36e5 + 36e5) return { cls: 'warn', text: 'Late: not synced as planned' };
  if (r.counts && r.counts.ambiguous) return { cls: 'warn', text: 'Synced with warnings' };
  return { cls: '', text: 'Synced' };
}
/* The last run in one line: when, how (a push), and what it brought or why it failed. */
function lastRunHtml(src){
  const r = runOf(RUN_KEY[src]);
  if (!r) return html`<span class="muted">${sourceOn(src) ? 'No sync yet' : 'Set up below, then sync'}</span>`;
  const head = `Last sync ${when(r.at)}${r.how === 'push' ? ' (push)' : ''}`;
  const warn = r.ok && r.counts && r.counts.ambiguous ? ` · ${r.counts.ambiguous} fit more than one device and were skipped` : '';
  return r.ok ? html`${head}: ${summary(RUN_KEY[src], r.counts)}${warn}` : html`<span class="src-err">${head} failed: ${r.error || ''}</span>`;
}
/* The header. on: the switch ({ id, checked, label }) where the source has one (Lansweeper), else a chip while it is set
   up (AD and Entra have no switch: they are on while their connection is set); test and
   sync: the buttons ({ id, ready }), drawn for an admin; msg: the id of the line their answers go to; note: said where
   Sync now is not (Lansweeper by push). */
export function statusHeaderHtml(src, { on = null, test = null, sync = null, msg = '', note = '' } = {}){
  const s = sourceState(src), edit = isAdmin();
  const sw = on ? html`<label class="pchk src-switch"><input type="checkbox" role="switch" id="${on.id}" ${on.checked ? 'checked' : ''} ${edit ? '' : 'disabled'}> ${on.label}</label>`
    : sourceOn(src) ? html`<span class="chip ok" title="Set up below: turned off by removing its connection">Set up</span>` : '';
  const c = (st.syncChanges || {})[src], runs = c ? (c.n ? 1 : 0) + (c.earlier || []).length : 0;
  const btn = (b, label, cls = '') => b && edit ? html`<button type="button" id="${b.id}"${cls ? html` class="${cls}"` : ''} ${b.ready ? '' : 'disabled'}>${label}</button>` : '';
  return String(html`<div class="src-status" data-srcstatus="${src}">
    <div class="src-st-top"><span class="dot ${s.cls}" aria-hidden="true"></span><b>${SOURCE_LABEL[src]}</b><span class="src-st-state">${s.text}</span><span class="grow"></span>${sw}</div>
    <div class="src-st-run">${lastRunHtml(src)}</div>
    <div class="src-st-act">${btn(test, 'Test connection')}${btn(sync, 'Sync now', 'primary')}${note ? html`<span class="muted">${note}</span>` : ''}${msg ? html`<span class="note" id="${msg}" role="status"></span>` : ''}<span class="grow"></span>
      <button type="button" class="link" data-srchist="${src}" ${runs ? '' : html`disabled title="No sync has changed a field yet"`}>History of changes${runs ? ` (${runs})` : ''}</button></div></div>`);
}

/* What the syncs of a source changed on the fields, run by run, newest first; each opens its devices in the Table
   (server/sync-changes.js). */
function changesOf(src){
  const c = (st.syncChanges || {})[src]; if (!c) return [];
  return [...(c.n ? [c] : []), ...(c.earlier || [])];
}
const list = names => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
const says = r => {
  const part = (o, verb) => { const e = Object.entries(o || {}).sort((a, b) => b[1] - a[1]); return e.length ? `${verb} ${list(e.slice(0, 4).map(([f, n]) => `${f} on ${n}`))}${e.length > 4 ? ` and ${e.length - 4} more` : ''}` : ''; };
  const x = [part(r.changed, 'changed'), part(r.filled, 'filled in')].filter(Boolean).join('; ');
  return x.charAt(0).toUpperCase() + x.slice(1);
};
function historyModal(src){
  const runs = changesOf(src), c = (st.syncChanges || {})[src];
  modal(html`<div class="mh">${SOURCE_LABEL[src]}: history of changes</div>
    <div class="mb"><p class="note">What each sync changed or filled in on the devices' fields, newest first. ${c && !c.n ? 'The last sync changed nothing.' : ''}</p>
      ${runs.length ? html`<ul class="src-hist">${runs.map((r, i) => html`<li><span class="muted">${when(r.at)}</span> ${says(r)} <button type="button" class="link" data-histrun="${i}">${r.n === 1 ? 'Show the device' : `Show the ${r.n} devices`}</button></li>`)}</ul>` : html`<p class="note">No sync has changed a field yet.</p>`}</div>
    <div class="mf"><span class="grow"></span><button id="histClose" class="primary">Close</button></div>`, 'sm');
  $('#histClose').onclick = closeModal;
  document.querySelectorAll('[data-histrun]').forEach(b => b.onclick = () => {
    const i = +b.dataset.histrun, r = runs[i];
    resetFilters(); st.ids = { label: i === 0 && c.n ? `Changed by ${SOURCE_LABEL[src]} at the last sync` : `Changed by ${SOURCE_LABEL[src]} on ${when(r.at)}`, ids: r.ids || [] };
    st.scope = null; st.tab = 'table'; leaveSettings(); closeModal(); render();
  });
}
/* Bound once: the headers are drawn again with their pages. */
document.addEventListener('click', e => { const b = e.target.closest('[data-srchist]'); if (b && !b.disabled) historyModal(b.dataset.srchist); });
