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
/* The controls of a dialog the Tab key goes to, in order. */
const focusables = d => /** @type {HTMLElement[]} */ ([...d.querySelectorAll('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')])
  .filter(el => !(/** @type {any} */ (el).disabled) && el.tabIndex >= 0 && el.getClientRects().length && !el.closest('[hidden], [inert]') && !el.closest('details:not([open]) > :not(summary)'));
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
  /* A dialog opened from Settings takes its place (one dialog at a time) and Settings comes back when it closes. Until
     then a still picture of Settings stays behind it, dimmed and not usable, so the page does not jump to what lies
     under Settings and back. */
  const fromSettings = !/\bsettings\b/.test(cls) && $('#mdl:not(.minimized) #setPane');
  if (/\bsettings\b/.test(cls)){ backToSettings = false; dropGhost(); }
  else if (fromSettings){ backToSettings = true; keepGhost(/** @type {HTMLElement} */ ($('#mdl .box'))); }
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
  /* Escape in a Settings field that was typed in puts back what it held, and keeps Settings open: its fields are saved
     as they are left, so closing would save the typing. A second Escape closes. (Dialogs with a Save button, such as New
     device, keep their typing and ask before it is dropped.) */
  /* What each field held when it got the focus: a field saved and left keeps its new value as the one to go back to. */
  const atFocus = new WeakMap();
  d.addEventListener('focusin', e => { const f = e.target; if (f instanceof HTMLInputElement || f instanceof HTMLTextAreaElement) atFocus.set(f, f.value); });
  d.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const f = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (e.target);
    const typed = f instanceof HTMLTextAreaElement || (f instanceof HTMLInputElement && /^(text|search|email|url|tel|number|password|)$/.test(f.type));
    const was = atFocus.has(f) ? atFocus.get(f) : f.defaultValue;
    if (!typed || !f.closest('#setPane') || f.readOnly || f.disabled || f.value === was) return;
    e.preventDefault(); e.stopPropagation();
    f.value = was;
    f.dispatchEvent(new Event('input', { bubbles: true }));
  });   /* after the field's own handlers: an Escape that closes an open list (a combo field) is not this */
  /* The browser may close it without asking (repeated Escape): it is closed properly then, or opened again if locked. */
  d.addEventListener('close', () => { if (d.isConnected && !d.classList.contains('minimized')) { if (locked) d.showModal(); else closeModal(); } });
  if (!locked) d.addEventListener('mousedown', e => { if (e.target === d) closeModal(); });
  /* A field saved as it is left (Settings) may draw its part of the dialog again during the Tab that leaves it: the
     Tab is then lost (the focus falls to the page, or comes back to the new copy of the field). It is done again on
     the new controls, so typing goes on in the next field. */
  const keyOf = el => el.id ? '#' + CSS.escape(el.id) : el.getAttribute('aria-label') ? `[aria-label="${CSS.escape(el.getAttribute('aria-label'))}"]` : '';
  d.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || e.defaultPrevented) return;
    const from = /** @type {HTMLElement} */ (document.activeElement), sel = from && d.contains(from) ? keyOf(from) : '';
    if (!sel) return;
    const back = e.shiftKey, t0 = Date.now();
    const redo = () => {
      const a = document.activeElement;
      if (Date.now() - t0 > 600 || (a && a !== document.body && a !== from && !(a.matches(sel) && a !== from) && a.isConnected)) return;
      if (a === from && from.isConnected) return;   /* nothing was drawn again */
      const now = /** @type {HTMLElement|null} */ (d.querySelector(sel)); if (!now) return;
      const list = focusables(d), i = list.indexOf(now);
      const to = list[(i + (back ? -1 : 1) + list.length) % list.length];
      if (to) to.focus();
    };
    for (const ms of [0, 80, 300]) setTimeout(redo, ms);
  });
  /* Tab goes round inside the dialog: from its last control to its first (Shift + Tab the other way), never out to the
     page or the browser's bar. */
  d.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || d.classList.contains('minimized')) return;
    const f = focusables(d);
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
/* A dialog moves by its title bar and is sized by its bottom right corner, as in NOBS SQL Editor: the bar always stays
   on the screen, and the dialog opens again where it was last left, at the size it was given (kept in this browser, by
   its title). A double-click on the bar maximizes it, to the whole window, or gives it back its size. On a phone every
   dialog fills the screen and does not move. */
const PLACES_KEY = 'ni-dlg-pos';
const places = () => { try { return JSON.parse(localStorage.getItem(PLACES_KEY)) || {}; } catch { return {}; } };
const keepPlace = (key, v) => { try { const all = places(); if (v) all[key] = v; else delete all[key]; localStorage.setItem(PLACES_KEY, JSON.stringify(all)); } catch { /* not kept: the dialog opens in the middle */ } };
/* The smallest a dialog can be made, Settings (a menu beside its page) a little wider. */
const MIN_W = 360, MIN_H = 200, MIN_W_SETTINGS = 640;
/* Lets dialog m be dragged by its title bar and sized by its corner, puts it back where and as large as it was last
   left and keeps that when let go. A double-click on the bar maximizes it. Does nothing for a dialog without a title bar. */
function makeMovable(m){
  const head = m.querySelector('.mh'), box = m.querySelector('.box');
  if (!head) return;
  const key = m.getAttribute('aria-label') || 'Dialog';
  const settings = box.classList.contains('settings') || !!box.querySelector('#setPane');
  const fixed = () => box.classList.contains('maxed') || matchMedia('(max-width:760px)').matches;
  let x = 0, y = 0, w = 0, h = 0;
  const place = (nx, ny) => { x = nx; y = ny; box.style.transform = x || y ? `translate(${x}px, ${y}px)` : ''; };
  const size = (nw, nh) => { w = nw; h = nh; box.style.width = w ? w + 'px' : ''; box.style.height = h ? h + 'px' : ''; box.classList.toggle('sized', !!(w || h)); };
  /* The bar stays reachable: at least 120px of it across, and its top inside the window. */
  const clamp = () => {
    const r = box.getBoundingClientRect();
    const dx = r.right < 120 ? 120 - r.right : r.left > window.innerWidth - 120 ? window.innerWidth - 120 - r.left : 0;
    const dy = r.top < 0 ? -r.top : r.top > window.innerHeight - 40 ? window.innerHeight - 40 - r.top : 0;
    if (dx || dy) place(x + dx, y + dy);
  };
  const keep = () => keepPlace(key, x || y || w || h ? [x, y, w, h] : null);
  const kept = places()[key];
  /* Checked once it is shown: before that it has no place to measure. */
  if (kept && !fixed()) { size(kept[2] || 0, kept[3] || 0); place(kept[0] || 0, kept[1] || 0); requestAnimationFrame(clamp); }
  const skip = e => e.target.closest('button, input, select, textarea, a, .wctl');
  head.classList.add('movable');
  head.addEventListener('pointerdown', e => {
    if (e.button !== 0 || fixed() || skip(e)) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, x0 = x, y0 = y;
    head.setPointerCapture(e.pointerId); box.classList.add('moving');
    const move = ev => { place(x0 + ev.clientX - sx, y0 + ev.clientY - sy); clamp(); };
    const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); head.removeEventListener('pointercancel', up); box.classList.remove('moving'); keep(); };
    head.addEventListener('pointermove', move); head.addEventListener('pointerup', up); head.addEventListener('pointercancel', up);
  });
  head.addEventListener('dblclick', e => { if (!skip(e)) { const b = head.querySelector('.wc-max'); if (b) b.click(); } });
  /* The corner: the dialog is centred, so its top left stays put by moving it half of what it grows. A double-click
     on the corner gives it back its own size. */
  const grip = document.createElement('span');
  grip.className = 'dlg-grip'; grip.title = 'Drag to size the dialog, double-click for its own size'; grip.setAttribute('aria-hidden', 'true');
  box.appendChild(grip);
  grip.addEventListener('pointerdown', e => {
    if (e.button !== 0 || fixed()) return;
    e.preventDefault(); e.stopPropagation();
    const r = box.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, x0 = x, y0 = y;
    const minW = Math.min(settings ? MIN_W_SETTINGS : MIN_W, r.width), minH = Math.min(MIN_H, r.height);
    /* Not past the window's right and bottom edge, less the dialog's 16px margin. */
    const maxW = window.innerWidth - 16 - r.left, maxH = window.innerHeight - 16 - r.top;
    grip.setPointerCapture(e.pointerId); box.classList.add('moving');
    const move = ev => {
      const nw = Math.round(Math.max(minW, Math.min(maxW, r.width + ev.clientX - sx))), nh = Math.round(Math.max(minH, Math.min(maxH, r.height + ev.clientY - sy)));
      size(nw, nh); place(Math.round(x0 + (nw - r.width) / 2), Math.round(y0 + (nh - r.height) / 2));
    };
    const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); box.classList.remove('moving'); keep(); };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  });
  grip.addEventListener('dblclick', e => { e.stopPropagation(); if (fixed()) return; size(0, 0); place(0, 0); keep(); });
}
/* A minimized dialog is closed (not modal), so the page works while it waits; restoring makes it modal again. */
export function minimizeModal(){
  const m = $('#mdl'); if (!m) return;
  m.classList.add('minimized'); m.close(); keepToastOnTop();
  const g = document.getElementById('mdlGhost'); if (g) g.hidden = true;
  const back = modalOpener; if (back && document.contains(back)) back.focus();
  renderTray();
}
export function restoreModal(){
  const m = $('#mdl'); if (!m) return;
  m.classList.remove('minimized'); m.showModal(); keepToastOnTop(); renderTray();
  const g = document.getElementById('mdlGhost'); if (g) g.hidden = false;
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
/* The still picture of Settings behind a dialog opened from it: a copy that runs nothing, takes no input and is not read
   out, under the dialog's dimmed backdrop. Gone when Settings comes back or the dialog closes otherwise. The copy lives in
   its own shadow root: it keeps its ids (Settings is styled by them, #setPane, #setTabs), yet no lookup in the page
   (document.querySelector, getElementById) can find them, so a late redraw can only reach the open Settings. */
let ghostSheet = null, ghostSheetOf = -1;
function ghostStyles(){
  const sheets = [...document.styleSheets];
  if (ghostSheet && ghostSheetOf === sheets.length) return ghostSheet;
  const text = sheets.map(sh => { try { return [...sh.cssRules].map(r => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
  ghostSheet = new CSSStyleSheet(); ghostSheet.replaceSync(`${text}\n.modal .box{box-shadow:none}`); ghostSheetOf = sheets.length;
  return ghostSheet;
}
function keepGhost(box){
  dropGhost(); if (!box) return;
  const g = document.createElement('div');
  g.id = 'mdlGhost'; g.className = 'modal modal-ghost'; g.setAttribute('aria-hidden', 'true'); g.inert = true;
  const root = g.attachShadow({ mode: 'open' });
  root.adoptedStyleSheets = [ghostStyles()];
  /* .modal around the copy, laid out as if absent, so the rules for a dialog's parts (.modal .box, .modal .mh) apply. */
  const wrap = document.createElement('div'); wrap.className = 'modal'; wrap.style.display = 'contents';
  wrap.append(box.cloneNode(true)); root.append(wrap); document.body.append(g);
}
function dropGhost(){ const g = document.getElementById('mdlGhost'); if (g) g.remove(); }
export const closeModal = () => {
  /* Settings closing: the address no longer names one of its pages (a dialog opened from Settings brings it back). */
  if ($('#mdl #setPane') && /^#settings\//.test(location.hash)) try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* not kept */ }
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
  $('#modalHost').innerHTML = ''; if (!backToSettings || !settingsOpener) dropGhost(); const back = modalOpener; modalOpener = null; if (back && document.contains(back)) back.focus();
  renderTray();
  /* While Settings was open the page did not look for changes on the server (a push, someone else): it does now. */
  if (wasSettings){ render(); checkForChanges(); }
  else if (backToSettings && settingsOpener){ backToSettings = false; render(); settingsOpener(); }
};
