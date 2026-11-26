/* Quick edit from the List: the ✎ at the end of a row opens a small box for what changes most (description, location,
   status, user)
   without opening the device. Each change is saved at once as an edit by hand, with a line in the device's history
   and Undo, the same as on the device's page. Retired opens the Retire dialog, which says what it gives up. */
import { $, STATUS, byId, esc, evEl, feedLinked, hist, markHand, now, objs, pickHand, restoreSnapshot, setByHand, snapshot, toastUndo } from './01-core.js';
import { isAdmin, rackLocFollow, who } from './04-settings.js';
import { queueServerSave, render } from './07-render.js';
import { retireModal } from './03-object-modals.js';
import { handOutModal, takeBackModal } from './27-handout.js';
import { html, rawHtml } from './html.js';
import { locOptions } from './loc-pick.js';

let box = null;
/* A row's second line after its description changed, without drawing the list again (as views-cards.js draws it:
   the description, else the serial number, else nothing and the name in the middle). */
function descInRow(o){
  const name = document.querySelector(`#view .lrow[data-open="${CSS.escape(o.id)}"] .c-name`); if (!name) return;
  name.querySelector('.c-desc')?.remove();
  const text = String(o.purpose || '').trim();
  name.classList.toggle('nodesc', !text && !o.serial);
  if (!text && !o.serial) return;
  const d = document.createElement('span');
  d.className = 'c-desc' + (text ? '' : ' alt');
  if (text){ d.textContent = text; d.title = text; }
  else { const m = document.createElement('span'); m.className = 'mono'; m.textContent = o.serial; d.append(m); d.title = `Serial number ${o.serial}`; }
  name.append(d);
}
const close = () => { if (box) try { box.hidePopover(); } catch { /* not open */ } };
function quickEdit(o, btn){
  if (!box){ box = document.createElement('div'); box.id = 'qedit'; box.className = 'menubox qedit'; box.setAttribute('popover', ''); document.body.append(box); }
  box.innerHTML = String(html`<div class="qe-h">${o.name}</div>
    <label class="qe-row"><span>Description</span><input id="qeDesc" maxlength="500" value="${o.purpose || ''}" placeholder="What it is for, e.g. Reception PC" autocomplete="off"></label>
    <label class="qe-row"><span>Location</span><select id="qeLoc" class="locpick">${rawHtml(locOptions(o.loc || ''))}</select></label>
    <label class="qe-row"><span>Status</span><select id="qeStatus">${Object.entries(STATUS).map(([k, v]) => html`<option value="${k}" ${k === o.status ? 'selected' : ''}>${v.label}${k === 'retired' && o.status !== 'retired' ? '…' : ''}</option>`)}</select></label>
    <div class="qe-row"><span>User</span><span class="qe-user">${o.user || 'Nobody'}</span><button type="button" id="qeUser">${o.user ? 'Give to someone else…' : 'Hand out…'}</button>${o.user ? html`<button type="button" id="qeBack">Take back…</button>` : ''}</div>`);
  /* Right under the pencil, its right edge on the pencil's; above it when there is no room below; always in the window. */
  box.showPopover();
  const r = btn.getBoundingClientRect(), h = box.offsetHeight, w = box.offsetWidth;
  const below = r.bottom + 4, above = r.top - 4 - h;
  box.style.top = Math.max(8, below + h <= window.innerHeight - 8 ? below : above >= 8 ? above : window.innerHeight - 8 - h) + 'px';
  box.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - 8 - w)) + 'px';
  /* Saved as on the device page: an edit by hand with a history line naming who did it, one Undo, and the focus back on
     the row's pencil once the list is drawn again. */
  const change = (msg, said, fn, also = []) => { const snap = snapshot([o, ...also]); fn(); o.handAt = new Date().toISOString(); hist(o, now(), `${msg} by ${who()}`); close(); render(); refocus();
    toastUndo(`${o.name}: ${said}`, () => { restoreSnapshot(snap, `${msg} undone by ${who()}`); render(); refocus(); }); };
  const refocus = () => { const b = document.querySelector(`#view [data-qedit="${CSS.escape(o.id)}"]`); if (b) /** @type {HTMLElement} */ (b).focus(); };
  /* A pick with the mouse saves at once. With the keyboard the arrows only look through the list (a closed list changes
     on every arrow key in some browsers): Enter or leaving the field saves, Esc puts it back. */
  const commitOn = (/** @type {HTMLSelectElement} */ sel, /** @type {(to: string) => void} */ fn) => {
    const was = sel.value; let keyed = false, done = false;
    const go = () => { if (done || sel.value === was) return; done = true; fn(sel.value); };
    sel.addEventListener('keydown', e => {
      if (e.key === 'Enter'){ e.preventDefault(); go(); return; }
      if (e.key === 'Escape'){ sel.value = was; keyed = false; return; }
      if (e.key !== 'Tab') keyed = true;
    });
    sel.addEventListener('change', () => { if (!keyed) go(); });
    sel.addEventListener('blur', () => { if (keyed) go(); });
  };
  commitOn(/** @type {HTMLSelectElement} */ ($('#qeLoc')), to => {
    /* A rack takes the devices in it along, as on the device page. */
    const inRack = o.type === 'rack' ? objs.filter(x => x.rack === o.id) : [];
    change(to ? 'Moved to ' + to : 'Location removed', to ? 'moved to ' + to : 'location removed', () => { if (feedLinked(o) || (o.graph && o.graph.added)) pickHand(o, 'loc'); o.loc = to; markHand(o, 'loc'); if (o.type === 'rack') rackLocFollow(o); }, inRack); });
  commitOn(/** @type {HTMLSelectElement} */ ($('#qeStatus')), to => {
    if (to === 'retired'){ close(); retireModal(o); return; }
    /* Into stock with somebody: the same take-back as on the device page (where it goes, the person no longer has it). */
    if (to === 'stock' && (o.uid || o.user || o.hotdesk)){ close(); takeBackModal([o]); return; }
    change('Status set to ' + STATUS[to].label, 'status set to ' + STATUS[to].label, () => { o.status = to; delete o.stockAuto; }); });
  /* The description: Enter or leaving the field saves it (also when the box closes), Esc puts it back. */
  const dsc = /** @type {HTMLInputElement} */ ($('#qeDesc')); let dWas = dsc.value;
  /* Each save moves dWas on, so a second edit of the description saves too, with its own Undo. */
  const saveDesc = () => {
    const to = dsc.value.trim(); if (to === dWas.trim()) return; dWas = to;
    /* Saved at once, but the box stays open and the list is not drawn again: Tab goes on to Location, and a click on
       another field or another row's pencil is not lost to a redraw. The row's second line is changed in place. */
    const snap = snapshot([o]), msg = to ? 'Description set to ' + to : 'Description removed';
    setByHand(o, 'purpose', to); o.purpose = to; o.handAt = new Date().toISOString(); hist(o, now(), `${msg} by ${who()}`);
    queueServerSave(); descInRow(o);
    toastUndo(`${o.name}: ${to ? 'description set' : 'description removed'}`, () => { restoreSnapshot(snap, `${msg} undone by ${who()}`); render(); });
  };
  dsc.addEventListener('keydown', e => {
    if (e.key === 'Enter'){ e.preventDefault(); saveDesc(); }
    else if (e.key === 'Escape'){ dsc.value = dWas; }
  });
  dsc.addEventListener('blur', saveDesc);
  $('#qeUser').onclick = () => { close(); handOutModal([o.id]); };
  const tb = $('#qeBack'); if (tb) tb.onclick = () => { close(); takeBackModal([o]); };
  /** @type {HTMLElement|null} */ (box.querySelector('#qeLoc'))?.focus();
}
document.addEventListener('click', e => {
  const b = evEl(e).closest && evEl(e).closest('#view [data-qedit]'); if (!b) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const o = byId(/** @type {HTMLElement} */ (b).dataset.qedit); if (o && isAdmin() && !o.review) quickEdit(o, /** @type {HTMLElement} */ (b));
}, true);
/* The button on a row (admins only; none on a device waiting in Pending devices). */
export const quickEditBtn = o => isAdmin() && !o.review ? `<button type="button" class="qedit-btn" data-qedit="${esc(o.id)}" title="Quick edit: description, location, status, user" aria-label="Quick edit ${esc(o.name)}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button>` : '';
