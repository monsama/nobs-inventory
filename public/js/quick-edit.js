/* Quick edit from the List: the ✎ at the end of a row opens a small box for what changes most (location, status, user)
   without opening the device. Each change is saved at once as an edit by hand, with a line in the device's history
   and Undo, the same as on the device's page. Retired opens the Retire dialog, which says what it gives up. */
import { $, LOCS, STATUS, byId, esc, evEl, feedLinked, hist, markHand, now, objs, pickHand, restoreSnapshot, snapshot, toastUndo } from './01-core.js';
import { isAdmin, rackLocFollow, who } from './04-settings.js';
import { render } from './07-render.js';
import { retireModal } from './03-object-modals.js';
import { handOutModal, takeBackModal } from './27-handout.js';
import { html } from './html.js';

let box = null;
const close = () => { if (box) try { box.hidePopover(); } catch { /* not open */ } };
function quickEdit(o, btn){
  if (!box){ box = document.createElement('div'); box.id = 'qedit'; box.className = 'menubox qedit'; box.setAttribute('popover', ''); document.body.append(box); }
  box.innerHTML = String(html`<div class="qe-h">${o.name}</div>
    <label class="qe-row"><span>Location</span><select id="qeLoc"><option value="">No location</option>${[...new Set([...LOCS, ...(o.loc ? [o.loc] : [])])].map(l => html`<option value="${l}" ${l === o.loc ? 'selected' : ''}>${l}</option>`)}</select></label>
    <label class="qe-row"><span>Status</span><select id="qeStatus">${Object.entries(STATUS).map(([k, v]) => html`<option value="${k}" ${k === o.status ? 'selected' : ''}>${v.label}${k === 'retired' && o.status !== 'retired' ? '…' : ''}</option>`)}</select></label>
    <div class="qe-row"><span>User</span><span class="qe-user">${o.user || 'Nobody'}</span><button type="button" id="qeUser">${o.user ? 'Give to someone else…' : 'Hand out…'}</button>${o.user ? html`<button type="button" id="qeBack">Take back…</button>` : ''}</div>`);
  const r = btn.getBoundingClientRect();
  box.style.top = Math.min(r.bottom + 4, window.innerHeight - 220) + 'px'; box.style.left = Math.max(8, Math.min(r.right - 320, window.innerWidth - 328)) + 'px';
  try { box.showPopover({ source: btn }); } catch { box.showPopover(); }
  /* Saved as on the device page: an edit by hand with a history line naming who did it, one Undo, and the focus back on
     the row's pencil once the list is drawn again. */
  const change = (msg, said, fn, also = []) => { const snap = snapshot([o, ...also]); fn(); o.handAt = new Date().toISOString(); hist(o, now(), `${msg} by ${who()}`); close(); render(); refocus();
    toastUndo(`${o.name}: ${said}`, () => { restoreSnapshot(snap, `${msg} undone by ${who()}`); render(); refocus(); }); };
  const refocus = () => { const b = document.querySelector(`#view [data-qedit="${CSS.escape(o.id)}"]`); if (b) /** @type {HTMLElement} */ (b).focus(); };
  $('#qeLoc').onchange = e => { const to = /** @type {HTMLSelectElement} */ (e.target).value;
    /* A rack takes the devices in it along, as on the device page. */
    const inRack = o.type === 'rack' ? objs.filter(x => x.rack === o.id) : [];
    change(to ? 'Moved to ' + to : 'Location removed', to ? 'moved to ' + to : 'location removed', () => { if (feedLinked(o) || (o.graph && o.graph.added)) pickHand(o, 'loc'); o.loc = to; markHand(o, 'loc'); if (o.type === 'rack') rackLocFollow(o); }, inRack); };
  $('#qeStatus').onchange = e => { const to = /** @type {HTMLSelectElement} */ (e.target).value;
    if (to === 'retired'){ close(); retireModal(o); return; }
    /* Into stock with somebody: the same take-back as on the device page (where it goes, the person no longer has it). */
    if (to === 'stock' && (o.uid || o.user || o.hotdesk)){ close(); takeBackModal([o]); return; }
    change('Status set to ' + STATUS[to].label, 'status set to ' + STATUS[to].label, () => { o.status = to; }); };
  $('#qeUser').onclick = () => { close(); handOutModal([o.id]); };
  const tb = $('#qeBack'); if (tb) tb.onclick = () => { close(); takeBackModal([o]); };
  /** @type {HTMLElement|null} */ (box.querySelector('select'))?.focus();
}
document.addEventListener('click', e => {
  const b = evEl(e).closest && evEl(e).closest('#view [data-qedit]'); if (!b) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const o = byId(/** @type {HTMLElement} */ (b).dataset.qedit); if (o && isAdmin() && !o.review) quickEdit(o, /** @type {HTMLElement} */ (b));
}, true);
/* The button on a row (admins only; none on a device waiting in Pending devices). */
export const quickEditBtn = o => isAdmin() && !o.review ? `<button type="button" class="qedit-btn" data-qedit="${esc(o.id)}" title="Quick edit: location, status, user" aria-label="Quick edit ${esc(o.name)}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button>` : '';
