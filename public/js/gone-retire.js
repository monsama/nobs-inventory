/* Retire the devices a Gone from filter (or the Overview's Where are they?) lists, in one go: each is named with a tick,
   ticked if it is gone from every source, else (not seen for a while, not scanned) left for someone to confirm; a
   reason is proposed (where they are gone from) and can be changed, each is taken out of its rack and its links are given up as in bulk, each gets a history
   line naming who, and one Undo brings all of it back. */
import { COSTS, $, $$, GONE_FILTERS, whereCtx, whereSignOf, hist, now, objs, rels, restoreSnapshot, snapshot, st, toast, toastUndo } from './01-core.js';
import { retireAll } from './03-object-modals.js';
import { who } from './04-settings.js';
import { render } from './07-render.js';
import { closeModal, modal } from './19-modal.js';
import { html } from './html.js';
import { whereLabel } from './where.js';

/** @param {any[]} list the devices listed (none retired) @param {{picked?: boolean, after?: () => void}} [opts] picked: the
   devices someone selected (all ticked, no reason proposed); after: once they are retired (the selection is cleared). */
export function retireGoneModal(list, opts = {}){
  if (!list.length) return;
  const said = opts.picked ? '' : GONE_FILTERS[st.gone] ? GONE_FILTERS[st.gone][0].replace(/^From/, 'Gone from') : st.gone ? 'Gone from its sources' : 'Not found any more';
  /* A Gone from list or a selection: all ticked. Where are they?: those gone from every source ticked, the rest to confirm one by one. */
  const sign = new Map(list.map(o => [o.id, whereSignOf(o)]));
  const on = o => !!opts.picked || !!st.gone || sign.get(o.id) === 'gone';
  const n = list.length;
  modal(html`<div class="mh">Retire ${n === 1 ? 'this device' : `${n} devices`}?</div>
    <div class="mb"><p class="note">They stay in the inventory for the record, with their history. Each is taken out of its rack and its connections are given up, so nothing looks in use that is not. One Undo brings it all back.</p>
      <div class="gr-tools"><button type="button" class="link" data-grall="1">Tick all</button><button type="button" class="link" data-grall="0">Tick none</button></div>
      <ul class="gr-list gr-pick">${list.map(o => html`<li><label><input type="checkbox" data-grid="${o.id}" ${on(o) ? 'checked' : ''}><b class="mono">${o.name}</b> <span class="muted">${o.code || ''}${sign.get(o.id) ? ` · ${whereLabel(sign.get(o.id), whereCtx())}` : ''}</span></label></li>`)}</ul>
      ${(() => { const leased = list.map(o => [o, COSTS.contracts.filter(c => c.kind === 'lease' && (c.devices || []).includes(o.id))]).filter(([, cs]) => cs.length);
        return leased.length ? html`<p class="fieldnote warn">On a lease, to be returned to the lessor (they stay on the lease): ${leased.map(([o, cs], i) => html`${i ? ', ' : ''}<b>${o.name}</b> (${cs.map(c => c.name).join(', ')})`)}</p>` : ''; })()}
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
    const ctsBack = retireAll(list);
    for (const o of list){ o.status = 'retired'; hist(o, now(), 'Retired by ' + who() + (why ? ': ' + why : '')); }
    closeModal(); if (opts.after) opts.after();
    toastUndo(`${n} ${n === 1 ? 'device' : 'devices'} retired`, () => { restoreSnapshot(snap, 'Retirement undone by ' + who()); for (const r of relsWas) if (!rels.includes(r)) rels.push(r); ctsBack(); render(); });
    render();
  };
}
/* Deleting the selected devices for good: their relations and history go too, no Undo; Retire keeps them for the record.
   The ones Lansweeper still sends would come back with its next push as new devices: those are offered Retire and
   exclude instead (kept, retired, and left out of the sync). */
/** @param {any[]} list @param {() => void} [after] once done (the selection is cleared) */
export async function deleteManyModal(list, after){
  if (!list.length) return;
  const { deleteObject } = await import('./03-object-modals.js');
  const n = list.length, ls = list.filter(o => !!o.feed && !o.excluded && o.feed.sys === 'Lansweeper');
  const names = list.slice(0, 8).map(o => o.name).join(', ') + (n > 8 ? ` and ${n - 8} more` : '');
  modal(html`<div class="mh">Delete ${n === 1 ? list[0].name : `${n} devices`}?</div>
    <div class="mb"><p class="note">${names}. This removes ${n === 1 ? 'the device' : 'them'}, ${n === 1 ? 'its' : 'their'} relations and history for good, with no Undo. Retire keeps the record instead.</p>
    ${ls.length ? html`<p class="fieldnote warn">${ls.length === n ? (n === 1 ? 'Lansweeper still has it' : 'Lansweeper still has them') : `Lansweeper still has ${ls.length} of them`}: its next push adds ${ls.length === 1 ? 'it' : 'them'} again, as new devices. Retire and exclude keeps ${ls.length === 1 ? 'it' : 'them'} out.</p>` : ''}</div>
    <div class="mf"><button id="dmOk" class="danger-text">Delete ${n} permanently</button><span class="grow"></span><button id="dmCancel">Cancel</button>${ls.length ? html`<button id="dmExcl" class="primary">Retire and exclude ${ls.length}</button>` : ''}</div>`, 'sm');
  /* The focus on Cancel: Enter never deletes by accident. */
  $('#dmCancel').onclick = closeModal; $('#dmCancel').focus();
  $('#dmOk').onclick = () => { closeModal(); for (const o of list) deleteObject(o.id, { quiet: true }); if (after) after(); render(); toast(`${n} ${n === 1 ? 'device' : 'devices'} deleted`); };
  const ex = $('#dmExcl'); if (ex) ex.onclick = () => {
    const snap = snapshot([...ls, ...objs.filter(x => ls.some(o => x.ontop === o.id))]), relsWas = [...rels];
    const ctsBack = retireAll(ls.filter(o => o.status !== 'retired'));
    for (const o of ls){ o.status = 'retired'; o.excluded = true; hist(o, now(), 'Retired and excluded from Lansweeper sync by ' + who()); }
    closeModal(); if (after) after();
    toastUndo(`${ls.length} retired and excluded: Lansweeper will not add ${ls.length === 1 ? 'it' : 'them'} again`, () => { restoreSnapshot(snap, 'Retire and exclude undone by ' + who()); for (const r of relsWas) if (!rels.includes(r)) rels.push(r); ctsBack(); render(); });
    render();
  };
}
