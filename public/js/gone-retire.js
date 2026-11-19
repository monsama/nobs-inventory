/* Retire the devices a Gone from filter (or the Overview's Where are they?) lists, in one go: each is named with a tick,
   ticked if it is gone from every source, else (not seen for a while, not scanned) left for someone to confirm; a
   reason is proposed (where they are gone from) and can be changed, each is taken out of its rack and its links are given up as in bulk, each gets a history
   line naming who, and one Undo brings all of it back. */
import { $, $$, GONE_FILTERS, whereCtx, whereSignOf, hist, now, objs, rels, restoreSnapshot, snapshot, st, toastUndo } from './01-core.js';
import { retireLinks } from './03-object-modals.js';
import { who } from './04-settings.js';
import { render } from './07-render.js';
import { closeModal, modal } from './19-modal.js';
import { html } from './html.js';
import { whereLabel } from './where.js';

/** @param {any[]} list the devices listed (none retired) */
export function retireGoneModal(list){
  if (!list.length) return;
  const said = GONE_FILTERS[st.gone] ? GONE_FILTERS[st.gone][0].replace(/^From/, 'Gone from') : st.gone ? 'Gone from its sources' : 'Not found any more';
  /* A Gone from list: all ticked. Where are they?: those gone from every source ticked, the rest to confirm one by one. */
  const sign = new Map(list.map(o => [o.id, whereSignOf(o)]));
  const on = o => !!st.gone || sign.get(o.id) === 'gone';
  const n = list.length;
  modal(html`<div class="mh">Retire ${n === 1 ? 'this device' : 'devices'}?</div>
    <div class="mb"><p class="note">They stay in the inventory for the record, with their history. Each is taken out of its rack and its connections are given up, so nothing looks in use that is not. One Undo brings it all back.</p>
      <div class="gr-tools"><button type="button" class="link" data-grall="1">Tick all</button><button type="button" class="link" data-grall="0">Tick none</button></div>
      <ul class="gr-list gr-pick">${list.map(o => html`<li><label><input type="checkbox" data-grid="${o.id}" ${on(o) ? 'checked' : ''}><b class="mono">${o.name}</b> <span class="muted">${o.code || ''}${sign.get(o.id) ? ` · ${whereLabel(sign.get(o.id), whereCtx())}` : ''}</span></label></li>`)}</ul>
      <div class="form" style="padding:8px 0 0"><label for="grWhy">Reason</label><input id="grWhy" maxlength="200" value="${said}"></div></div>
    <div class="mf"><button id="grCancel">Cancel</button><button id="grOk" class="danger-text">Retire</button></div>`, 'sm');
  const picked = () => list.filter(o => /** @type {HTMLInputElement|null} */ ($(`[data-grid="${CSS.escape(o.id)}"]`))?.checked);
  const count = () => { const k = picked().length, b = /** @type {HTMLButtonElement} */ ($('#grOk')); b.textContent = k ? `Retire ${k}` : 'Retire'; b.disabled = !k; };
  $$('[data-grid]').forEach(b => b.addEventListener('change', count));
  $$('[data-grall]').forEach(b => b.onclick = () => { $$('[data-grid]').forEach(x => { /** @type {HTMLInputElement} */ (x).checked = /** @type {HTMLElement} */ (b).dataset.grall === '1'; }); count(); });
  count();
  $('#grCancel').onclick = closeModal;
  $('#grOk').onclick = () => {
    const sel = picked(), n = sel.length; if (!n) return;
    list = sel;
    const why = /** @type {HTMLInputElement} */ ($('#grWhy')).value.trim();
    const snap = snapshot([...list, ...objs.filter(x => list.some(o => x.ontop === o.id))]), relsWas = [...rels];
    for (const o of list){ retireLinks(o); o.status = 'retired'; hist(o, now(), 'Retired by ' + who() + (why ? ': ' + why : '')); }
    closeModal();
    toastUndo(`${n} ${n === 1 ? 'device' : 'devices'} retired`, () => { restoreSnapshot(snap, 'Retirement undone by ' + who()); for (const r of relsWas) if (!rels.includes(r)) rels.push(r); render(); });
    render();
  };
}
