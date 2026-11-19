/* Retire the devices a Gone from filter lists, in one go: they are named, a reason is proposed (where they are gone
   from) and can be changed, each is taken out of its rack and its links are given up as in bulk, each gets a history
   line naming who, and one Undo brings all of it back. */
import { $, GONE_FILTERS, hist, now, objs, rels, restoreSnapshot, snapshot, st, toastUndo } from './01-core.js';
import { retireLinks } from './03-object-modals.js';
import { who } from './04-settings.js';
import { render } from './07-render.js';
import { closeModal, modal } from './19-modal.js';
import { html } from './html.js';

/** @param {any[]} list the devices listed (none retired) */
export function retireGoneModal(list){
  const n = list.length; if (!n) return;
  const said = GONE_FILTERS[st.gone] ? GONE_FILTERS[st.gone][0].replace(/^From/, 'Gone from') : 'Gone from its sources';
  modal(html`<div class="mh">Retire ${n} ${n === 1 ? 'device' : 'devices'}?</div>
    <div class="mb"><p class="note">They stay in the inventory for the record, with their history. Each is taken out of its rack and its connections are given up, so nothing looks in use that is not. One Undo brings it all back.</p>
      <ul class="gr-list">${list.slice(0, 8).map(o => html`<li><b class="mono">${o.name}</b> <span class="muted">${o.code || ''}</span></li>`)}${n > 8 ? html`<li class="muted">and ${n - 8} more</li>` : ''}</ul>
      <div class="form" style="padding:8px 0 0"><label for="grWhy">Reason</label><input id="grWhy" maxlength="200" value="${said}"></div></div>
    <div class="mf"><button id="grCancel">Cancel</button><button id="grOk" class="danger-text">Retire ${n}</button></div>`, 'sm');
  $('#grCancel').onclick = closeModal;
  $('#grOk').onclick = () => {
    const why = /** @type {HTMLInputElement} */ ($('#grWhy')).value.trim();
    const snap = snapshot([...list, ...objs.filter(x => list.some(o => x.ontop === o.id))]), relsWas = [...rels];
    for (const o of list){ retireLinks(o); o.status = 'retired'; hist(o, now(), 'Retired by ' + who() + (why ? ': ' + why : '')); }
    closeModal();
    toastUndo(`${n} ${n === 1 ? 'device' : 'devices'} retired`, () => { restoreSnapshot(snap, 'Retirement undone by ' + who()); for (const r of relsWas) if (!rels.includes(r)) rels.push(r); render(); });
    render();
  };
}
