/* Drawing: the open tab, the status bar, back and forward, keyboard shortcuts. Saving, loading and signing in live in
   server-save.js, server-load.js and signin.js; their names are exported from here too, so importers need not change. */
import { lsLive, LS_USED, SYNC, daysSince } from './01-core.js';
import { updateSync, bindFullTextOnHover, fullTextTooltips, $, byId, esc, objs, st } from './01-core.js';
import { applyRole, isAdmin, ownOnly } from './04-settings.js';
import { renderContracts } from './09-costs.js';
import { renderContacts } from './11-contacts.js';
import { renderOverview } from './10-overview.js';
import { renderMine, renderStocktake } from './22-stocktake.js';
import { FIXED_TABS, tabAllowed, renderCards, renderFilterBar, renderMap, renderPorts, renderSide, renderTable, renderTabs, viewSwitch } from './02-views.js';
import { renderObj, renderRack, renderSoftware } from './03-object-modals.js';
import { closeModal, modal } from './19-modal.js';
import { newObjModal } from './05-new-object.js';
import { renderPlans } from './20-plans.js';
import { syncSearchBox } from './14-global-search.js';
import { SERVER, saveData } from './server-save.js';
export * from './server-save.js';
export * from './server-load.js';
export * from './signin.js';
/* ---------- render ---------- */
/* Draws the open tab, the sidebar and the status bar. A redraw after a change also checks what is unsaved and sends it
   (saveData); a redraw that only shows something else (a filter, a search, another tab) skips that check, which goes
   through every record. */
const NO_SIDE = ['mine', 'overview', 'contracts', 'contacts', 'stocktake', 'sw'];
export function render({ save = true } = {}){
  /* To review is no view of its own: it shows the waiting devices in Cards (or the Table) instead of the inventory. */
  /* A view this person does not get (My devices, or the others for someone who sees only their own devices). */
  if (!tabAllowed(st.tab)) st.tab = ownOnly() ? 'mine' : 'cards';
  if (st.tab === 'review'){ if (st.scope !== 'review'){ st.scope = 'review'; st.rvSrc = ''; st.bulk = new Set(); st.person = null; st.live = false; } st.tab = 'cards'; }
  /* The sidebar filters lists: the views that are no list of devices (Overview, Contracts, …) are shown without it. */
  document.body.classList.toggle('noside', NO_SIDE.includes(st.tab));
  if (NO_SIDE.includes(st.tab)) document.body.classList.remove('side-open');
  updateSync(); renderSide(); renderTabs();
  if (st.tab === 'cards') renderCards();
  else if (st.tab === 'table') renderTable();
  else if (st.tab === 'map') renderMap();
  else if (st.tab === 'plans') renderPlans();
  else if (st.tab === 'net') renderPorts();
  else if (st.tab === 'rack') renderRack();
  else if (st.tab === 'sw') renderSoftware();
  else if (st.tab === 'contracts') renderContracts();
  else if (st.tab === 'contacts') renderContacts();
  else if (st.tab === 'overview') renderOverview();
  else if (st.tab === 'stocktake') renderStocktake();
  else if (st.tab === 'mine') renderMine();
  else renderObj(byId(st.tab));
  viewSwitch(); syncSearchBox();
  renderFilterBar();
  fullTextTooltips();
  bindFullTextOnHover();
  $('#stObjs').textContent = `${objs.length} ${objs.length === 1 ? 'device' : 'devices'}`;
  renderStatus();
  applyRole();
  noteNav();
  if (save) saveData();
}
/* Back and forward (the browser's buttons, a mouse's side buttons, Alt+arrows) move between the views seen: the open tab
   and the sidebar filters. Each view drawn that differs from the last one is a step in the browser's history; a change of
   the search text only updates the current step, so typing does not make a step of every letter. The address stays. */
const NAV_KEYS = ['tab', 'scope', 'rvSrc', 'rvKnown', 'rvOld', 'type', 'loc', 'status', 'warranty', 'scanOld', 'twins', 'intune', 'osFam', 'live', 'resp', 'person', 'adGroup', 'quality', 'ids', 'handField'];
const navOf = () => ({ nobs: 1, ...Object.fromEntries(NAV_KEYS.map(k => [k, st[k] ?? null])), q: st.q || '' });
let navRestoring = false;
function noteNav(){
  if (navRestoring || typeof history === 'undefined') return;
  const now_ = navOf(), was = history.state && history.state.nobs ? history.state : null;
  if (!was) { history.replaceState(now_, ''); return; }
  if (NAV_KEYS.some(k => (was[k] ?? null) !== now_[k])) history.pushState(now_, '');
  else if (was.q !== now_.q) history.replaceState(now_, '');
}
window.addEventListener('popstate', e => {
  const to = e.state; if (!to || !to.nobs) return;
  /* An open dialog closes first, as Escape would; the view behind it stays. A dialog that must be answered stays open. */
  if ($('#mdl') && !$('#mdl.minimized')){
    history.pushState(navOf(), '');
    if (!$('#mdl .locked')) closeModal();
    return;
  }
  for (const k of NAV_KEYS) st[k] = to[k] ?? (typeof st[k] === 'boolean' ? false : null);
  st.q = to.q || '';
  /* A device's page that was closed since opens again; one that is gone (deleted) gives way to the cards. */
  if (!(st.tab in FIXED_TABS)){
    if (byId(st.tab)){ if (!st.open.includes(st.tab)){ st.open.push(st.tab); st.tabIds.push(st.tab); } }
    else st.tab = 'cards';
  }
  navRestoring = true;
  try { view(); } finally { navRestoring = false; }
  const v = $('#view'); if (v) v.scrollTop = 0;
});
/* A redraw that changes nothing: another tab, filter or search. */
export const view = () => render({ save: false });
/* Lansweeper is late when nothing came for two days: the push normally runs every night. */
const SYNC_LATE_DAYS = 2;
/* The status bar: whether changes reached the server, and when Lansweeper last sent data. */
export function renderStatus(){
  const save = $('#stSave'), sync = $('#stSync'); if (!save || !sync) return;
  let S = {
    saved: ['', 'All changes saved', 'Every change is stored on the server.'],
    saving: ['', 'Saving…', 'Changes are being sent to the server.'],
    failed: ['bad', 'Not saved', 'The last change was refused. It is kept here and sent again with the next change.'],
    offline: ['bad', 'No connection', 'Your changes are kept on this device and sent when the server answers again, also after the page is closed and opened again.'],
  }[SERVER.save] || ['', '', ''];
  /* The device page open has edits not saved yet: said here too, not "All changes saved" beside "Not saved yet". */
  if (SERVER.save === 'saved' && document.querySelector('#objSaved.dirty')) S = ['warn', 'Device not saved yet', 'The device page has changes that are not saved: use Save on the page.'];
  /* A change not saved is a red chip, so it is not read past like the usual "All changes saved". */
  save.innerHTML = S[0] === 'bad' ? `<span class="chip bad">${S[1]}</span>` : S[0] === 'warn' ? `<span class="chip warn">${S[1]}</span>` : `<span class="dot ${S[0]}"></span>${S[1]}`; save.title = S[2];
  /* On a phone the status bar is short: a save that failed is shown there anyway. */
  save.classList.toggle('hide-n', !S[0]);
  /* Someone who only reads saves nothing: the line would only be noise to them. */
  save.hidden = !isAdmin();
  if (!lsLive()){ sync.innerHTML = '<span class="dot off"></span>Lansweeper off'; sync.title = 'The Lansweeper sync is turned off in Settings.'; return; }
  updateSync();
  const last = SYNC.run ? {at: SYNC.run, days: daysSince(SYNC.run)} : null;
  /* Never set up and nothing sent yet: nothing to say about Lansweeper. */
  if (!last && !LS_USED()){ sync.innerHTML = ''; sync.title = ''; return; }
  if (!last){ sync.innerHTML = '<span class="dot off"></span>Lansweeper: no sync yet'; sync.title = 'No data has come from Lansweeper yet.'; return; }
  const late = last.days >= SYNC_LATE_DAYS;
  sync.innerHTML = `<span class="dot ${late ? 'warn' : ''}"></span>Lansweeper ${esc(last.at)}`;
  sync.title = late ? `Lansweeper has not sent data for ${Math.floor(last.days)} days. Check the push on the Lansweeper server.` : 'The last time Lansweeper sent data.';
}
/* Keyboard: N new object, / search, C T M R switch views, ? the list. Not while typing or in a dialog. */
const SHORTCUTS = [['N','New device'],['Ctrl + K','Search everything: devices, people, contacts, contracts, rooms'],['/','The search (on a list it filters the list too)'],['↑ ↓ Enter','In the search: pick a hit and open it'],['C','Cards'],['T','Table'],['V','Next view of the tab: Cards ↔ Table, Contracts → Software → Contacts'],['M','Relationships'],['R','Racks'],['Enter','In a dialog: its main button (Create, Save …)'],['Esc','Close a dialog'],['Ctrl + A','Cards and Table: select every device shown (Esc clears)'],['Ctrl + click','Select a card; Shift + click a range'],['Ctrl + wheel','Zoom the floor plan or the relationship map'],['?','This list']];
/* What the colours of states mean: the same everywhere (badges, dots, chips, bars). */
const COLOURS = [['', 'Green', 'There and fine: in AD, joined to Entra, compliant, Defender active, in use, synced'],
  ['warn', 'Amber', 'Needs a look: only registered in Entra, grace period, inactive, medium risk, ending soon'],
  ['bad', 'Red', 'A problem: not compliant, high risk, ended, failed'],
  ['off', 'Grey ring', 'Not there or off: not joined, not managed, not onboarded, in stock, a source turned off'],
  ['gone', 'Grey', 'Done: retired']];
const coloursTable = () => `<table class="grid mini colours" style="min-width:0"><tbody>${COLOURS.map(([c, l, t]) => `<tr><td><span class="dot ${c}"></span> <b>${l}</b></td><td>${t}</td></tr>`).join('')}</tbody></table>
  <p class="note">Blue marks links, the selection and actions, never a state.</p>`;
export function coloursModal(){
  modal(`<div class="mh">What the colours mean</div><div class="mb">${coloursTable()}</div>
    <div class="mf"><button id="clClose" class="primary">Done</button></div>`, 'sm');
  $('#clClose').onclick = closeModal;
}
function shortcutsModal(){
  modal(`<div class="mh">Keyboard shortcuts</div><div class="mb"><table class="grid mini" style="min-width:0"><tbody>
    ${SHORTCUTS.map(([k, t]) => `<tr><td class="mono"><b>${k}</b></td><td>${t}</td></tr>`).join('')}</tbody></table>
    <div class="hdr" style="margin-top:14px">Colours</div>${coloursTable()}</div>
    <div class="mf"><button id="scClose" class="primary">Done</button></div>`, 'sm');
  $('#scClose').onclick = closeModal;
}
{ const kb = $('#keysBtn'); if (kb) kb.onclick = shortcutsModal; }
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest('input, textarea, select') || $('#mdl')) return;
  const key = e.key.toLowerCase();
  if (e.key === '?'){ e.preventDefault(); shortcutsModal(); return; }
  /* / goes to the search, which also filters the list open. */
  if (e.key === '/'){ e.preventDefault(); $('#search').focus(); return; }
  if (key === 'n' && isAdmin()){ e.preventDefault(); newObjModal(); return; }
  /* V: the next view of a tab that has a switch (Devices: Cards ↔ Table; Contracts: Contracts → Software → Contacts). */
  if (key === 'v'){ const b = [...document.querySelectorAll('[data-vsw]')], i = b.findIndex(x => x.dataset.vsw === st.tab); if (b.length > 1 && i >= 0){ e.preventDefault(); b[(i + 1) % b.length].click(); } return; }
  const tab = {c: 'cards', t: 'table', m: 'map', r: 'rack'}[key];
  if (tab){ if (tab === 'map' && st.open.includes(st.tab)) st.mapFocus = st.tab; st.tab = tab; render(); }
});
