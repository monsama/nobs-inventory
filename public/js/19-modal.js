/* Dialogs: one at a time over the page (a native modal <dialog>), minimized to a chip in a tray; a dialog opened from
   Settings brings Settings back when it closes. */
import { $, fullTextTooltips, keepToastOnTop, toast } from './01-core.js';
import { applyRole } from './04-settings.js';
import { checkForChanges, render } from './07-render.js';
import { bindPolicy } from './03-object-modals.js';
import { html, rawHtml } from './html.js';

/* ---------- modals ---------- */
/* A dialog opened from Settings (a password, a restore, a reset…) takes Settings' place; when it is closed, by OK or
   Cancel, Settings comes back on the same tab. 04-settings.js gives the way to open it. */
let settingsOpener = null, backToSettings = false;
export const setSettingsOpener = fn => { settingsOpener = fn; };
/* A dialog whose result is to be seen in the inventory (Clear inventory) leaves Settings closed. */
export const leaveSettings = () => { backToSettings = false; };
/* body: html`` or a string of markup made by the app. */
/* A dialog whose form can be filled (New device) says so with askBeforeClosing: closed with something typed in it
   (Cancel, Esc, ×, a click beside it), it first says that and stays; closed again, it goes. The check is taken away
   when the dialog does its work or another opens. */
let leaveCheck = null;
export const askBeforeClosing = fn => { leaveCheck = fn; };
/* A check for askBeforeClosing: something in the dialog's fields differs from what they held when this was called. */
export function changedSince(root = $('#mdl')){
  const vals = () => [...root.querySelectorAll('input, select, textarea')].filter(el => el.id).map(el => el.id + '=' + (el.type === 'checkbox' ? el.checked : el.value)).join('\n');
  const was = vals();
  return () => root.isConnected && vals() !== was;
}
export function modal(body, cls=''){
  const markup = String(body);
  leaveCheck = null;
  /* Only one dialog is open at a time: a minimized one that another takes the place of is closed, and that is said. */
  const gone = $('#mdl.minimized'); if (gone) toast(`The minimized “${gone.getAttribute('aria-label') || 'dialog'}” was closed.`);
  if (/\bsettings\b/.test(cls)) backToSettings = false;
  else if ($('#mdl:not(.minimized) #setPane')) backToSettings = true;
  /* The control that opened the first dialog gets the focus back; one replaced while minimized does not keep it. */
  if (!$('#mdl') || gone) modalOpener = gone ? null : document.activeElement;
  /* The dialog is named by its heading, so a screen reader says what it is. */
  const title = ((markup.match(/<div class="mh"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || 'Dialog').replace(/<[^>]+>/g, '').trim();
  keepToastOnTop(true);
  $('#modalHost').innerHTML = html`<dialog class="modal" id="mdl" aria-label="${title}"><div class="box ${cls}">${rawHtml(markup)}</div></dialog>`;
  const d = $('#mdl'), locked = /locked/.test(cls);
  /* The browser's top layer keeps Tab inside and the page behind inert. Escape asks to close (cancel), which goes
     through closeModal like the × does; one that must be answered stays. An Escape that closed something inside the
     dialog first (an open list) does not get here. */
  d.addEventListener('cancel', e => { e.preventDefault(); if (!locked) closeModal(); });
  /* The browser may close it without asking (repeated Escape): it is closed properly then, or opened again if locked. */
  d.addEventListener('close', () => { if (d.isConnected && !d.classList.contains('minimized')) { if (locked) d.showModal(); else closeModal(); } });
  if (!locked) d.addEventListener('mousedown', e => { if (e.target === d) closeModal(); });
  /* Tab goes round inside the dialog: from its last control to its first (Shift + Tab the other way), never out to the
     page or the browser's bar. */
  d.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || d.classList.contains('minimized')) return;
    const f = /** @type {HTMLElement[]} */ ([...d.querySelectorAll('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')])
      .filter(el => !(/** @type {any} */ (el).disabled) && el.getClientRects().length && !el.closest('[hidden], [inert]') && !el.closest('details:not([open]) > :not(summary)'));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], at = document.activeElement;
    if (!e.shiftKey && (at === last || !d.contains(at))){ e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (at === first || !d.contains(at))){ e.preventDefault(); last.focus(); }
  });
  if (!locked) addWindowControls(d);
  d.showModal(); keepToastOnTop();
  renderTray();
  bindPolicy($('#mdl'));
  fullTextTooltips($('#mdl'));
  const first = [...$('#mdl').querySelectorAll('input, select, textarea, button')].find(el => !el.closest('.wctl')); if (first) first.focus();
  applyRole();
}
/* Asks before something is deleted, in the app's own small dialog: what goes, what it means, Cancel or the red button.
   text is HTML: html`` (or markup the caller escaped). */
export function confirmModal(title, text, okLabel, onOk, { primary = false } = {}){
  modal(html`<div class="mh">${title}</div><div class="mb"><p class="note">${rawHtml(text)}</p></div>
    <div class="mf"><button id="cfCancel">Cancel</button><button id="cfOk" class="${primary ? 'primary' : 'danger-text'}">${okLabel}</button></div>`, 'sm');
  $('#cfCancel').onclick = closeModal;
  $('#cfOk').onclick = () => { closeModal(); onOk(); };
}
/* Minimize, maximize and close in a dialog's top right corner, as in NOBS SQL Editor. A minimized dialog keeps what was
   typed in it and waits as a chip at the bottom right; opening another dialog takes its place. A sign-in dialog has none. */
/* p: the icon's shapes, written here. */
const WSVG = p => html`<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${rawHtml(p)}</svg>`;
/* Adds the minimize, maximize and close buttons to dialog m's title bar (or the top of its box when it has none),
   and makes it movable. */
function addWindowControls(m){
  const head = m.querySelector('.mh'), box = m.querySelector('.box');
  const strip = /** @type {import('./01-core.js').El} */ (document.createElement('span')); strip.className = 'wctl';
  strip.innerHTML = String(html`<button type="button" class="wc-min" title="Minimize" aria-label="Minimize">${WSVG('<path d="M5 12h14"/>')}</button><button type="button" class="wc-max" title="Maximize" aria-label="Maximize">${WSVG('<rect x="4.5" y="4.5" width="15" height="15" rx="1"/>')}</button><button type="button" class="wc-close" title="Close (Esc)" aria-label="Close">${WSVG('<path d="M6 6l12 12M18 6L6 18"/>')}</button>`);
  if (head) head.appendChild(strip); else box.insertBefore(strip, box.firstChild);
  strip.querySelector('.wc-min').onclick = minimizeModal;
  strip.querySelector('.wc-max').onclick = () => {
    const on = box.classList.toggle('maxed'), b = strip.querySelector('.wc-max');
    b.title = on ? 'Restore' : 'Maximize'; b.setAttribute('aria-label', b.title);
    b.innerHTML = String(on ? WSVG('<rect x="8" y="4" width="12" height="12" rx="1"/><path d="M4 8v12h12"/>') : WSVG('<rect x="4.5" y="4.5" width="15" height="15" rx="1"/>'));
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
/* Lets dialog m be dragged by its title bar, puts it back where it was last left and saves where it is dropped.
   A double-click on the bar maximizes it. Does nothing for Settings or a dialog without a title bar. */
function makeMovable(m){
  const head = m.querySelector('.mh'), box = m.querySelector('.box');
  if (!head || box.classList.contains('settings') || box.querySelector('#setPane')) return;
  const key = m.getAttribute('aria-label') || 'Dialog';
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
/* A minimized dialog is closed (not modal), so the page works while it waits; restoring makes it modal again. */
export function minimizeModal(){
  const m = $('#mdl'); if (!m) return;
  m.classList.add('minimized'); m.close(); keepToastOnTop();
  const back = modalOpener; if (back && document.contains(back)) back.focus();
  renderTray();
}
export function restoreModal(){
  const m = $('#mdl'); if (!m) return;
  m.classList.remove('minimized'); m.showModal(); keepToastOnTop(); renderTray();
  const first = m.querySelector('.mb input, .mb select, .mb textarea, .mb button, button'); if (first) first.focus();
}
/* The chip of a minimized dialog: its title restores it, the × closes it. */
function renderTray(){
  let tray = $('#mdlTray');
  const m = $('#mdl.minimized');
  if (!m){ if (tray) tray.remove(); return; }
  if (!tray){ tray = document.createElement('div'); tray.id = 'mdlTray'; document.body.appendChild(tray); }
  const title = m.getAttribute('aria-label') || 'Dialog';
  tray.innerHTML = html`<span class="tray-chip"><button type="button" class="tray-open" title="${title}: restore">${title}</button><button type="button" class="tray-x" title="Close" aria-label="Close ${title}">×</button></span>`;
  tray.querySelector('.tray-open').onclick = restoreModal;
  tray.querySelector('.tray-x').onclick = closeModal;
}
/* Closing a dialog gives the focus back to the control that opened it, so a keyboard user is not sent to the top of the page. */
export let modalOpener = null;
/* Leaving Settings, however it is closed, draws the view behind it again, so changes made there show at once. */
export const closeModal = () => {
  if (leaveCheck && leaveCheck() && $('#mdl') && !$('#mdl .leave-warn')){
    if ($('#mdl.minimized')) restoreModal();
    const foot = $('#mdl .mf'), note = document.createElement('p');
    note.className = 'fieldnote warn leave-warn'; note.setAttribute('role', 'alert');
    note.textContent = 'What you typed is not saved. Close again to discard it.';
    if (foot) foot.before(note); else $('#mdl .box').appendChild(note);
    return;
  }
  leaveCheck = null;
  const wasSettings = !!$('#modalHost #setPane');
  keepToastOnTop(true);
  $('#modalHost').innerHTML = ''; const back = modalOpener; modalOpener = null; if (back && document.contains(back)) back.focus();
  renderTray();
  /* While Settings was open the page did not look for changes on the server (a push, someone else): it does now. */
  if (wasSettings){ render(); checkForChanges(); }
  else if (backToSettings && settingsOpener){ backToSettings = false; render(); settingsOpener(); }
};
