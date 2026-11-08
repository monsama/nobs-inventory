/* The device page's History, with Restore on a field edited by hand (restore.js): an admin sets that one field back to
   its value before the change, saved as any edit and noted in the history, with Undo. A field changed again since is
   asked about first. Relations, merges, retiring, the user and the fields a sync writes have no Restore. */
import { confirmModal } from './19-modal.js';
import { FIELD_LABEL, HISTORY, STATUS, $, feedOwns, fieldFixed, hist, now, setByHand, toastUndo } from './01-core.js';
import { isAdmin, who } from './04-settings.js';
import { queueServerSave, render } from './07-render.js';
import { bindTimeline, timelinePanel } from './29-timeline.js';
import { applyPatch, fieldNote, fieldPatch, fieldRestore, fieldValue } from './restore.js';
import { html } from './html.js';

/* A sync writes the field now: a source picked for it, or the automatic order with no value kept by hand. Setting it back
   here would last only until the next sync, so it has no Restore; the source mark is where a field is fixed. */
export const syncOwned = (o, k) => {
  const fixed = fieldFixed(o, k);
  if (fixed) return fixed !== 'hand';
  return feedOwns(o, k) || !!(o.graph && o.graph.added && ['name', 'model', 'os', 'serial'].includes(k));
};
const shown = (k, v) => v === undefined || v === null || v === '' ? 'empty' : k === 'status' && STATUS[v] ? STATUS[v].label : String(v);
/* The field's name as the line wrote it ("Location changed from …"), else its usual name. */
const labelOf = h => (/^(.+?) (?:changed from|set to|cleared|restored from|back to) /.exec(h.msg || '') || [])[1] || FIELD_LABEL[h.f] || h.f;
const canRestore = (o, h) => isAdmin() && fieldRestore(h, o, k => syncOwned(o, k));
const HIST_KEY = 'ni-hist-open';
const histOpen = () => { try { return localStorage.getItem(HIST_KEY) === '1'; } catch { return false; } };
export function historyPanel(o){
  const list = HISTORY[o.id] || [];
  const btn = (h, i) => canRestore(o, h) ? html`<button type="button" class="link hist-restore" data-hrestore="${i}" title="Set ${labelOf(h)} back to ${shown(h.f, h.from)}">Restore</button>` : '';
  /* The Timeline above tells the device's life; this is every change, with Restore: folded until opened (remembered). */
  return String(html`<details class="panelbox fold" id="histPanel" ${list.length && histOpen() ? 'open' : ''}><summary class="hdr">All changes <span class="cnt">${list.length || 'none'}</span></summary>${list.length ? html`<ul class="hist">${list.map((h, i) => html`<li><time>${h.t}</time><span>${h.msg}</span>${btn(h, i)}</li>`)}</ul>` : html`<div class="chain"><span class="muted">No changes recorded yet.</span></div>`}</details>`);
}
/* Sets field k of o to v as an edit by hand would, with its line in the history. */
function setField(o, k, v, msg){
  const before = fieldValue(o, k);
  if (!k.startsWith('custom.')) setByHand(o, k, v);
  applyPatch(o, fieldPatch(o, k, v));
  o.handAt = new Date().toISOString();
  hist(o, now(), msg + ' by ' + who(), fieldNote(k, before, v));
  queueServerSave(); render();
}
export function restoreField(o, h){
  const r = canRestore(o, h); if (!r) return;
  const label = labelOf(h), from = r.current;
  const go = () => {
    setField(o, r.k, r.value, `${label} restored from ${h.t}: ${shown(r.k, from)} → ${shown(r.k, r.value)}`);
    toastUndo(`${label} restored to ${shown(r.k, r.value)}`, () => setField(o, r.k, from, `${label} back to ${shown(r.k, from)} (restore undone)`));
  };
  if (!r.changedSince) return go();
  confirmModal(`Restore ${label}?`, html`${label} was changed again after ${h.t}.<br>Now: <b>${shown(r.k, r.current)}</b><br>Restore: <b>${shown(r.k, r.value)}</b>`, 'Restore', go, { primary: true });
}
export function bindHistory(o){
  const p = /** @type {HTMLDetailsElement} */ (document.getElementById('histPanel'));
  if (p) p.ontoggle = () => { try { localStorage.setItem(HIST_KEY, p.open ? '1' : '0'); } catch { /* not kept */ } };
  $('#view').querySelectorAll('[data-hrestore]').forEach(b => b.onclick = () => restoreField(o, (HISTORY[o.id] || [])[+b.dataset.hrestore]));
}
/* A save that does not draw the page again: the timeline and the history take its new lines; a panel folded stays folded. */
export function refreshHistory(o){
  for (const [id, html] of [['tlPanel', timelinePanel(o)], ['histPanel', historyPanel(o)]]){
    const el = /** @type {HTMLDetailsElement} */ (document.getElementById(id)); if (!el) continue;
    const open = el.open; el.outerHTML = html;
    const now_ = /** @type {HTMLDetailsElement} */ (document.getElementById(id)); if (now_ && now_.hasAttribute('open') && !open && el.querySelector('li')) now_.open = false;
  }
  bindTimeline(o); bindHistory(o);
}
