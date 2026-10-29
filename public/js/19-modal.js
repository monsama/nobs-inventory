/* Dialogs: one at a time over the page, minimized to a chip in a tray, Escape and Tab kept inside; a dialog opened
   from Settings brings Settings back when it closes. */
import { $, esc, fullTextTooltips, toast } from './01-core.js';
import { applyRole } from './04-settings.js';
import { checkForChanges, render } from './07-render.js';
import { bindPolicy } from './03-object-modals.js';

/* ---------- modals ---------- */
/* A dialog opened from Settings (a password, a restore, a reset…) takes Settings' place; when it is closed, by OK or
   Cancel, Settings comes back on the same tab. 04-settings.js gives the way to open it. */
let settingsOpener = null, backToSettings = false;
export const setSettingsOpener = fn => { settingsOpener = fn; };
/* A dialog whose result is to be seen in the inventory (Clear inventory) leaves Settings closed. */
export const leaveSettings = () => { backToSettings = false; };
export function modal(html, cls=''){
  /* Only one dialog is open at a time: a minimized one that another takes the place of is closed, and that is said. */
  const gone = $('#mdl.minimized .box'); if (gone) toast(`The minimized “${gone.getAttribute('aria-label') || 'dialog'}” was closed.`);
  if (/\bsettings\b/.test(cls)) backToSettings = false;
  else if ($('#mdl:not(.minimized) #setPane')) backToSettings = true;
  /* The control that opened the first dialog gets the focus back; one replaced while minimized does not keep it. */
  if (!$('#mdl') || gone) modalOpener = gone ? null : document.activeElement;
  /* The dialog is named by its heading, so a screen reader says what it is. */
  const title = ((html.match(/<div class="mh"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || 'Dialog').replace(/<[^>]+>/g, '').trim();
  $('#modalHost').innerHTML = `<div class="modal" id="mdl"><div class="box ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">${html}</div></div>`;
  if (!/locked/.test(cls)) $('#mdl').addEventListener('mousedown', e => { if (e.target.id === 'mdl') closeModal(); });
  if (!/locked/.test(cls)) addWindowControls($('#mdl'));
  renderTray();
  bindPolicy($('#mdl'));
  fullTextTooltips($('#mdl'));
  const first = [...$('#mdl').querySelectorAll('input, select, textarea, button')].find(el => !el.closest('.wctl')); if (first) first.focus();
  applyRole();
}
/* Asks before something is deleted, in the app's own small dialog: what goes, what it means, Cancel or the red button.
   text is HTML: the caller escapes the names in it. */
export function confirmModal(title, text, okLabel, onOk, { primary = false } = {}){
  modal(`<div class="mh">${esc(title)}</div><div class="mb"><p class="note">${text}</p></div>
    <div class="mf"><button id="cfCancel">Cancel</button><button id="cfOk" class="${primary ? 'primary' : 'danger-text'}">${esc(okLabel)}</button></div>`, 'sm');
  $('#cfCancel').onclick = closeModal;
  $('#cfOk').onclick = () => { closeModal(); onOk(); };
}
/* Minimize, maximize and close in a dialog's top right corner, as in NOBS SQL Editor. A minimized dialog keeps what was
   typed in it and waits as a chip at the bottom right; opening another dialog takes its place. A sign-in dialog has none. */
const WSVG = p => `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
function addWindowControls(m){
  const head = m.querySelector('.mh'), box = m.querySelector('.box');
  const strip = document.createElement('span'); strip.className = 'wctl';
  strip.innerHTML = `<button type="button" class="wc-min" title="Minimize" aria-label="Minimize">${WSVG('<path d="M5 12h14"/>')}</button>`
    + `<button type="button" class="wc-max" title="Maximize" aria-label="Maximize">${WSVG('<rect x="4.5" y="4.5" width="15" height="15" rx="1"/>')}</button>`
    + `<button type="button" class="wc-close" title="Close (Esc)" aria-label="Close">${WSVG('<path d="M6 6l12 12M18 6L6 18"/>')}</button>`;
  if (head) head.appendChild(strip); else box.insertBefore(strip, box.firstChild);
  strip.querySelector('.wc-min').onclick = minimizeModal;
  strip.querySelector('.wc-max').onclick = () => {
    const on = box.classList.toggle('maxed'), b = strip.querySelector('.wc-max');
    b.title = on ? 'Restore' : 'Maximize'; b.setAttribute('aria-label', b.title);
    b.innerHTML = on ? WSVG('<rect x="8" y="4" width="12" height="12" rx="1"/><path d="M4 8v12h12"/>') : WSVG('<rect x="4.5" y="4.5" width="15" height="15" rx="1"/>');
  };
  strip.querySelector('.wc-close').onclick = closeModal;
  makeMovable(m);
}
/* A dialog moves by its title bar, as in NOBS SQL Editor: the bar always stays on the screen, and the dialog opens again
   where it was last left (kept in this browser, by its title). A double-click on the bar maximizes it or gives it back
   its size. Settings, which fills the window, and a phone, where every dialog does, do not move. */
const PLACES_KEY = 'ni-dlg-pos';
const places = () => { try { return JSON.parse(localStorage.getItem(PLACES_KEY)) || {}; } catch { return {}; } };
const keepPlace = (key, xy) => { try { const all = places(); if (xy) all[key] = xy; else delete all[key]; localStorage.setItem(PLACES_KEY, JSON.stringify(all)); } catch { /* not kept: the dialog opens in the middle */ } };
function makeMovable(m){
  const head = m.querySelector('.mh'), box = m.querySelector('.box');
  if (!head || box.classList.contains('settings') || box.querySelector('#setPane')) return;
  const key = box.getAttribute('aria-label') || 'Dialog';
  const fixed = () => box.classList.contains('maxed') || matchMedia('(max-width:760px)').matches;
  let x = 0, y = 0;
  const place = (nx, ny) => { x = nx; y = ny; box.style.transform = x || y ? `translate(${x}px, ${y}px)` : ''; };
  /* The bar stays reachable: at least 120px of it across, and its top inside the window. */
  const clamp = () => {
    const r = box.getBoundingClientRect();
    const dx = r.right < 120 ? 120 - r.right : r.left > window.innerWidth - 120 ? window.innerWidth - 120 - r.left : 0;
    const dy = r.top < 0 ? -r.top : r.top > window.innerHeight - 40 ? window.innerHeight - 40 - r.top : 0;
    if (dx || dy) place(x + dx, y + dy);
  };
  const kept = places()[key];
  if (kept && !fixed()) { place(kept[0], kept[1]); clamp(); }
  head.classList.add('movable');
  head.addEventListener('pointerdown', e => {
    if (e.button !== 0 || fixed() || e.target.closest('button, input, select, textarea, a, .wctl')) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, x0 = x, y0 = y;
    head.setPointerCapture(e.pointerId); box.classList.add('moving');
    const move = ev => { place(x0 + ev.clientX - sx, y0 + ev.clientY - sy); clamp(); };
    const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); head.removeEventListener('pointercancel', up); box.classList.remove('moving'); keepPlace(key, x || y ? [x, y] : null); };
    head.addEventListener('pointermove', move); head.addEventListener('pointerup', up); head.addEventListener('pointercancel', up);
  });
  head.addEventListener('dblclick', e => { if (!e.target.closest('button, input, select, textarea, a, .wctl')) { const b = head.querySelector('.wc-max'); if (b) b.click(); } });
}
export function minimizeModal(){
  const m = $('#mdl'); if (!m) return;
  m.classList.add('minimized');
  const back = modalOpener; if (back && document.contains(back)) back.focus();
  renderTray();
}
export function restoreModal(){
  const m = $('#mdl'); if (!m) return;
  m.classList.remove('minimized'); renderTray();
  const first = m.querySelector('.mb input, .mb select, .mb textarea, .mb button, button'); if (first) first.focus();
}
/* The chip of a minimized dialog: its title restores it, the × closes it. */
function renderTray(){
  let tray = $('#mdlTray');
  const m = $('#mdl.minimized');
  if (!m){ if (tray) tray.remove(); return; }
  if (!tray){ tray = document.createElement('div'); tray.id = 'mdlTray'; document.body.appendChild(tray); }
  const title = m.querySelector('.box').getAttribute('aria-label') || 'Dialog';
  tray.innerHTML = `<span class="tray-chip"><button type="button" class="tray-open" title="${esc(title)}: restore">${esc(title)}</button><button type="button" class="tray-x" title="Close" aria-label="Close ${esc(title)}">×</button></span>`;
  tray.querySelector('.tray-open').onclick = restoreModal;
  tray.querySelector('.tray-x').onclick = closeModal;
}
/* Closing a dialog gives the focus back to the control that opened it, so a keyboard user is not sent to the top of the page. */
export let modalOpener = null;
/* Leaving Settings, however it is closed, draws the view behind it again, so changes made there show at once. */
export const closeModal = () => {
  const wasSettings = !!$('#modalHost #setPane');
  $('#modalHost').innerHTML = ''; const back = modalOpener; modalOpener = null; if (back && document.contains(back)) back.focus();
  renderTray();
  /* While Settings was open the page did not look for changes on the server (a push, someone else): it does now. */
  if (wasSettings){ render(); checkForChanges(); }
  else if (backToSettings && settingsOpener){ backToSettings = false; render(); settingsOpener(); }
};
document.addEventListener('keydown', e => {
  if (!$('#mdl') || $('#mdl.minimized')) return;
  /* Escape that closed something inside the dialog (an open list) does not also close the dialog. */
  if (e.key === 'Escape' && (e.defaultPrevented || $('#mdl .locked'))) return;
  if (e.key === 'Escape' && !$('#mdl .locked')) closeModal();
  if (e.key !== 'Tab') return;
  const f = [...$('#mdl .box').querySelectorAll('button:not([disabled]), input:not([disabled]), select, textarea')];
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
});
