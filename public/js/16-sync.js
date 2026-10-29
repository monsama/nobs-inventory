/* The Sync button at the right of the tab bar, beside To review: runs a sync by hand (all at once, or one of them) and
   says when each last ran and how it went. Admins only; a source not set up is not offered. Lansweeper is run from
   here only through its API: a push comes from the script on the Lansweeper server, so for it only the last push shows. */
import { $, esc, st, toast } from './01-core.js';
import { canEdit } from './04-settings.js';
import { SERVER, reloadFromServer, render, flushSave } from './07-render.js';

const SOURCES = {
  lansweeper: { label: 'Lansweeper', url: 'api/feed/sync', settings: 'feed' },
  ldap: { label: 'Active Directory', url: 'api/ldap/sync', settings: 'directory' },
  graph: { label: 'Entra & Intune', url: 'api/graph/sync', settings: 'entra' },
};
let running = '';   /* the source being synced now, or 'all' */

/* Which sources are set up here, and whether each can be run from the page. */
function sources(){
  const out = [];
  if (st.useLansweeper !== false) out.push(['lansweeper', st.lsSource === 'api' && !!SERVER.lansweeper]);
  if (SERVER.ldap || (st.ldap && st.ldap.url)) out.push(['ldap', true]);
  if (SERVER.graph) out.push(['graph', true]);
  return out;
}
const runOf = src => (st.syncRuns || {})[src] || null;
/* "today 06:00", "yesterday 14:12", "12.10.2026 06:00" */
function when(iso){
  const d = new Date(iso); if (isNaN(d)) return '';
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()), t = new Date(), today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const diff = Math.round((today - day) / 864e5);
  return diff === 0 ? `today ${hm}` : diff === 1 ? `yesterday ${hm}` : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${hm}`;
}
/* What a run brought, in a few words: "4 updated · 3 new in To review". */
function summary(src, c){
  if (!c) return '';
  const parts = [];
  const updated = src === 'ldap' ? (c.updated || 0) + (c.created || 0) : src === 'graph' ? c.filled || 0 : (c.updated || 0);
  if (src === 'lansweeper' && c.created) parts.push(`${c.created - (c.review || 0)} added`);
  if (updated) parts.push(`${updated} updated`);
  if (c.added) parts.push(`${c.added} added`);
  if (c.review) parts.push(`${c.review} new in To review`);
  return parts.filter(p => !/^0 /.test(p)).join(' · ') || 'nothing new';
}
export function syncButtonHtml(){
  const list = sources();
  if (!canEdit() || !list.length) return '';
  const failed = list.some(([src]) => runOf(src) && !runOf(src).ok);
  return `<button type="button" id="syncBtn" class="tab sync-btn${running ? ' spinning' : ''}${failed ? ' failed' : ''}" aria-haspopup="dialog" title="${failed ? 'A sync failed: open for details' : 'Sync now, and when each sync last ran'}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9"/><path d="M18.5 3v4.2h-4.2M5.5 21v-4.2h4.2"/></svg>Sync</button>`;
}
function menuHtml(){
  const list = sources();
  const line = ([src, canRun]) => {
    const r = runOf(src), s = SOURCES[src];
    const status = !r ? '<span class="muted">not run yet</span>'
      : r.ok ? `<span class="muted">${esc(when(r.at))}${r.how === 'push' ? ' · push' : ''} · ${esc(summary(src, r.counts))}</span>`
      : `<span class="sync-err">${esc(when(r.at))} · failed: ${esc(r.error || '')}</span> <button type="button" class="link" data-syncset="${s.settings}">Settings</button>`;
    const btn = canRun ? `<button type="button" data-sync="${src}" ${running ? 'disabled' : ''}>${running === src ? 'Syncing…' : 'Sync'}</button>`
      : '<span class="muted" title="Lansweeper sends its data with the push script on its own server">by push</span>';
    return `<div class="sync-row"><div class="sync-what"><b>${s.label}</b>${status}</div>${btn}</div>`;
  };
  const runnable = list.filter(([, c]) => c).length;
  return `${runnable > 1 ? `<button type="button" class="primary sync-all" data-sync="all" ${running ? 'disabled' : ''}>${running === 'all' ? 'Syncing…' : 'Sync all'}</button>` : ''}${list.map(line).join('')}`;
}
function closeMenu(){ const m = $('#syncMenu'); if (m) m.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', onKey, true); }
const outside = e => { if (!e.target.closest('#syncMenu') && !e.target.closest('#syncBtn')) closeMenu(); };
const onKey = e => { if (e.key === 'Escape'){ closeMenu(); const b = $('#syncBtn'); if (b) b.focus(); } };
/* The menu lies over the page under the button: the tab bar scrolls sideways, so a menu inside it would be cut off. */
function openMenu(){
  closeMenu();
  const b = $('#syncBtn'); if (!b) return;
  const m = document.createElement('div');
  m.id = 'syncMenu'; m.className = 'sync-menu'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Sync');
  m.innerHTML = menuHtml();
  document.body.append(m);
  const r = b.getBoundingClientRect();
  m.style.top = `${r.bottom + 4}px`;
  m.style.left = `${Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth))}px`;
  m.querySelectorAll('[data-sync]').forEach(x => x.onclick = () => run(x.dataset.sync));
  m.querySelectorAll('[data-syncset]').forEach(x => x.onclick = async () => { closeMenu(); st.setTab = x.dataset.syncset; (await import('./04-settings.js')).openSettings(); });
  document.addEventListener('mousedown', outside, true);
  document.addEventListener('keydown', onKey, true);
  /* From the keyboard the menu is used at once: the focus moves into it. */
  const first = m.querySelector('button:not([disabled])'); if (first) first.focus();
}
async function syncOne(src){
  const r = await fetch(SOURCES[src].url, { method: 'POST', credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, text: `${SOURCES[src].label}: ${summary(src, j.counts)}` } : { ok: false, text: `${SOURCES[src].label}: ${j.error || 'failed'}` };
}
async function run(which){
  if (running) return;
  running = which;
  const open = !!$('#syncMenu');
  render({ save: false }); if (open) openMenu();
  await flushSave();
  /* All of them in the order the server runs them by itself: Lansweeper first, so Graph finds the devices it adds. */
  const order = which === 'all' ? sources().filter(([, c]) => c).map(([s]) => s) : [which];
  const results = [];
  /* A dropped connection or a server restart ends the run with a message: the button never stays busy. */
  try {
    for (const src of order) results.push(await syncOne(src).catch(e => ({ ok: false, text: `${SOURCES[src].label}: ${e.message || 'no answer from the server'}` })));
  } finally { running = ''; }
  await reloadFromServer().catch(() => {});
  render({ save: false });
  if ($('#syncMenu') || open) openMenu();
  const bad = results.filter(x => !x.ok);
  toast(results.map(x => x.text).join(' · '), bad.length ? 'err' : '');
}
/* Bound once: the button is drawn again with the tab bar. */
document.addEventListener('click', e => {
  const b = e.target.closest('#syncBtn');
  if (!b) return;
  if ($('#syncMenu')) closeMenu(); else openMenu();
});
