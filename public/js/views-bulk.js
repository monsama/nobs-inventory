/* Bulk actions: picking several devices in Cards and the Table, and what is done with them all at once (split out of 02-views.js, which re-exports it). */
import { handOutModal } from './27-handout.js';
import { setResponsible } from './11-contacts.js';
import { CONTACT_KINDS, contactLabel } from './contacts.js';
import { evEl, scopePool, REVIEW_STALE_DAYS, pickHand, markHand, CONTACTS, feedLinked, $, LOCS, STATUS, byId, filtered, hist, now, restoreSnapshot, snapshot, toastUndo, st, toast } from './01-core.js';
import { render, view } from './07-render.js';
import { isAdmin } from './04-settings.js';
import { confirmModal } from './19-modal.js';
import { takeBackModal } from './27-handout.js';
import { html, rawHtml } from './html.js';
import { dupOf, resolveModal, reviewDo, reviewStale } from './15-review.js';
import { openObj } from './02-views.js';
import { renderCards } from './views-cards.js';
import { renderTable } from './views-table.js';
import { bulkEditModal } from './views-bulk-edit.js';
/* In To review (st.scope): Accept or Ignore the picked devices (Back to review when ignored ones are shown), or, with
   none picked and allAlso, every one shown; Accept all leaves out the old ones, which are accepted one by one. */
export function scopeActs(list, allAlso){
  if (!st.scope || !isAdmin()) return '';
  const n = st.bulk.size, ign = st.scope === 'ignored';
  /* Ignored ones: Unignore puts them back in To review; Accept takes them straight into the inventory (not a record merged
     into a device: that one is unmerged first, by Unignore). */
  const mergedIn = ign && [...st.bulk].map(byId).some(o => o && o.review && o.review.merged);
  if (n) return ign ? `<button id="rvRestore" title="Take ${n === 1 ? 'it' : 'them'} off the ignored list: ${n === 1 ? 'it waits' : 'they wait'} in To review again${mergedIn ? '; a merged record leaves its device' : ''}">Unignore ${n}</button>${mergedIn ? '' : `<button id="rvAccept" class="primary" title="Unignore and take ${n === 1 ? 'it' : 'them'} into the inventory">Accept ${n}</button>`}`
    : `<button id="rvAccept" class="primary">Accept ${n}</button><button id="rvIgnore" class="danger-text">Ignore ${n}</button>`;
  if (!allAlso || !list.length) return '';
  const fresh = list.filter(o => !reviewStale(o)).length;
  return ign ? `<button id="rvRestoreAll" title="Take every ignored device shown off the list: they wait in To review again">Unignore all ${list.length}</button>`
    : `<button id="rvIgnoreAll" class="danger-text">Ignore all ${list.length}</button><button id="rvAcceptAll" class="primary" title="${fresh === list.length || !fresh ? '' : `Devices no source has seen for ${REVIEW_STALE_DAYS} days are left out unless you tick them in the next step`}">Accept ${fresh === list.length ? `all ${fresh}` : fresh ? `${fresh} recently seen` : `all ${list.length} old`}</button>`;
}
/* Resolve: the picked records that are most likely a device the inventory has (a dock's DNS-named record, or one of the
   same name or serial number): say what they are, all at once; see 15-review.js. */
const mergeable = () => [...(st.bulk || [])].map(byId).filter(o => o && dupOf(o));
export function mergeBtn(){
  if (!isAdmin()) return '';
  const m = mergeable().length;
  return m ? `<button id="rvResolve" title="Say what ${m === 1 ? 'it is' : 'they are'}: a dock's record, the same device, obsolete or no duplicate">Resolve ${m}…</button>` : '';
}
export function bindScopeActs(list){
  const on = (id, f) => { const b = $('#' + id); if (b) b.onclick = f; };
  on('rvResolve', () => resolveModal(mergeable()));
  const picked = kind => () => { const l = [...st.bulk].map(byId).filter(o => o && o.review); if (kind !== 'accept') st.bulk.clear(); reviewDo(kind, l); };
  on('rvAccept', picked('accept')); on('rvIgnore', picked('ignore')); on('rvRestore', picked('restore'));
  const fresh = list.filter(o => !reviewStale(o)), old = list.length - fresh.length;
  /* Accept all takes the recently seen ones; the old ones (likely gone) only when ticked here. With only old ones shown,
     it says so instead. */
  on('rvAcceptAll', () => {
    let withOld = !fresh.length;
    confirmModal('Accept devices', fresh.length
      ? `Add the ${fresh.length} recently seen ${fresh.length === 1 ? 'device' : 'devices'} shown to the inventory?${old ? `<label class="pchk cf-old"><input type="checkbox" id="cfOld"> Also add the ${old} that no source has seen for ${REVIEW_STALE_DAYS} days (likely gone)</label>` : ''}`
      : `None of the ${list.length} ${list.length === 1 ? 'device' : 'devices'} shown has been seen by any source for ${REVIEW_STALE_DAYS} days: ${list.length === 1 ? 'it is' : 'they are'} likely gone. Add ${list.length === 1 ? 'it' : 'them'} to the inventory anyway?`,
      'Accept', () => reviewDo('accept', withOld ? list : fresh), { primary: true });
    const cb = $('#cfOld'), ok = $('#cfOk');
    const label = () => { ok.textContent = `Accept ${withOld ? list.length : fresh.length}`; };
    label();
    if (cb) cb.onchange = () => { withOld = cb.checked; label(); };
  });
  on('rvIgnoreAll', () => confirmModal('Ignore devices', `Ignore the ${list.length} ${list.length === 1 ? 'device' : 'devices'} shown? No sync brings them back; you can bring them back from Ignored.`, 'Ignore', () => reviewDo('ignore', list)));
  on('rvRestoreAll', () => reviewDo('restore', list));
}
/* Cards picked (the same choice as the Table's ticks): open them all as tabs, edit their fields (admins), or go on in the
   Table, where the picked rows can be moved, given a status or a responsible together. */
export function pickBar(list){
  const n = (st.bulk || new Set()).size;
  /* The picked devices' actions on a row of their own, always in one order: count, the To review actions, Resolve, the rest. */
  return n ? `<div class="pickrow"><b class="pick-n">${n} selected</b>${scopeActs(list)}${mergeBtn()}<button id="cdOpen" title="Open each as a tab">Open in tabs</button>${isAdmin() && !st.scope ? '<button id="cdEdit" title="Set or clear fields of them all, with a preview">Edit fields…</button>' : ''}${st.scope ? '' : '<button id="cdTable" title="The Table shows the same selection, with actions for all of them">Edit in Table</button>'}<button id="cdClear">Clear selection</button></div>`
    : '<span class="muted hide-n">Click a card to open it · Ctrl+click or its corner selects several · Ctrl+A all</span>' + scopeActs(list, true);
}
/* The picked devices that are still among those shown (the inventory, or To review): a pick does not reach across. */
export const pickedInPool = () => { const ids = new Set(scopePool().map(o => o.id)); return new Set([...(st.bulk || [])].filter(id => ids.has(id))); };
export function bindPickBar(){
  const o = $('#cdOpen'); if (o) o.onclick = () => openObjs([...st.bulk]);
  const e = $('#cdEdit'); if (e) e.onclick = () => bulkEditModal([...st.bulk]);
  const t = $('#cdTable'); if (t) t.onclick = () => { st.tab = 'table'; view(); };
  const c = $('#cdClear'); if (c) c.onclick = () => { st.bulk.clear(); keepScroll(renderCards); };
}
/* Several objects at once, each in its own tab; the first is shown. A very long pick opens its first 30. */
export function openObjs(ids){
  const list = ids.filter(byId).slice(0, 30);
  if (!list.length) return;
  for (const id of list) if (!st.open.includes(id)){ st.open.push(id); st.tabIds.push(id); }
  if (ids.length > list.length) toast(`The first ${list.length} of ${ids.length} are open: the tab bar holds no more at once.`);
  openObj(list[0]);
}
/* A redraw that leaves the list where it was scrolled to. */
export const keepScroll = draw => { const v = $('#view'), y = v ? v.scrollTop : 0; draw(); const w = $('#view'); if (w) w.scrollTop = y; };
/* Picking cards (also of To review): Ctrl (⌘) + click or the tick in a card's corner picks one or takes it back;
   Shift + click picks every card from the last one picked to this one. While cards are picked, a plain click on a card
   picks it (or takes it back) too; with none picked, it opens the card. */
let lastPick = null;
document.addEventListener('click', e => {
  const card = evEl(e).closest && evEl(e).closest('#view .card[data-open]'); if (!card || evEl(e).closest('[data-rvc]')) return;
  const tick = evEl(e).closest('.cardtick');
  const picking = !!$('#view .card.picked');
  if (!tick && !picking && !e.ctrlKey && !e.metaKey && !e.shiftKey) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const id = card.dataset.open, set = (st.bulk ??= new Set());
  if (e.shiftKey && lastPick && lastPick !== id){
    const ids = [...$('#view').querySelectorAll('.card[data-open]')].map(c => c.dataset.open), a = ids.indexOf(lastPick), b = ids.indexOf(id);
    if (a >= 0 && b >= 0) ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => set.add(x)); else set.add(id);
  } else if (set.has(id)) set.delete(id); else set.add(id);
  lastPick = id;
  keepScroll(renderCards);
}, true);
/* Ctrl (⌘) + A in Cards or the Table picks every device shown (in the Table, the rows its column filters leave); Escape
   takes the pick back. Not while typing or in a dialog, where they keep their usual meaning. */
document.addEventListener('keydown', e => {
  if (!['cards', 'table'].includes(st.tab) || $('#mdl') || (evEl(e).closest && evEl(e).closest('input, textarea, select, [contenteditable]'))) return;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'a'){
    e.preventDefault();
    /* In the Table the same as its select-all box: every row its filters leave, also those past the first drawn. */
    if (st.tab === 'table'){ const all = $('#selAll'); if (all && !all.checked) all.click(); return; }
    st.bulk = new Set(filtered().map(o => o.id));
    keepScroll(renderCards);
  } else if (e.key === 'Escape' && st.bulk && st.bulk.size){
    st.bulk.clear(); keepScroll(st.tab === 'table' ? renderTable : renderCards);
  }
});
/* The Table's bar for the selected rows: in To review its actions; else one menu that opens, hands out, moves, or sets
   the status, the responsible or any field of them all. */
export const tableBulkBar = (list, n) => String(html`${n && st.scope ? html`<div class="pickrow"><b class="pick-n">${n} selected</b>${rawHtml(scopeActs(list))}${rawHtml(mergeBtn())}<button id="bkOpen" title="Open each as a tab">Open in tabs</button><button id="bkClear">Clear selection</button></div>` : ''}
${n && !st.scope ? html`<div class="pickrow"><b class="pick-n">${n} selected</b>${rawHtml(mergeBtn())}<select id="bkAct" aria-label="Do with the selected"><option value="">Actions…</option><option value="open">Open in tabs</option>${isAdmin() ? html`<option value="handout">Hand out to a person…</option><option value="edit">Edit fields…</option>` : ''}
${isAdmin() ? html`<optgroup label="Move to location">${LOCS.map(l => html`<option value="loc:${l}">${l}</option>`)}</optgroup>
<optgroup label="Set status">${Object.entries(STATUS).map(([k, v]) => html`<option value="status:${k}">${v.label}</option>`)}<option value="status:__back">Take back into stock (no user)</option></optgroup>
${CONTACTS.list.length && isAdmin() ? Object.entries(CONTACT_KINDS).map(([k, l]) => html`<optgroup label="${l} responsible">${CONTACTS.list.filter(c => c.kind === k).sort((a, b) => a.name.localeCompare(b.name)).map(c => html`<option value="resp:${k}:${c.id}">${contactLabel(c)}</option>`)}<option value="resp:${k}:">- no ${l.toLowerCase()} responsible</option></optgroup>`) : ''}` : ''}</select><button id="bkClear">Clear selection</button></div>` : ''}`);
export function bindTableBulk(n){
  /* A move by hand, as on the device's page: the location is kept from then on, so the next sync does not move it back. */
  const bulkLoc = to => {
    const snap = snapshot([...st.bulk].map(byId));
    let moved = 0;
    st.bulk.forEach(id => {
      const o = byId(id); if (!o || o.loc === to) return;
      moved++;
      if (feedLinked(o) || (o.graph && o.graph.added)) pickHand(o, 'loc');
      o.loc = to; markHand(o, 'loc'); o.handAt = new Date().toISOString();
      hist(o, now(), 'Moved to ' + to + ' (bulk)');
    });
    toastUndo(moved === n ? `${n} moved to ${to}` : `${moved} moved to ${to}; ${n - moved} already there`, () => { restoreSnapshot(snap, 'Bulk move undone'); render(); }); renderTable(); render();
  };
  const bulkStatus = v => {
    /* Take back: the same dialog as on a device or a person (where they go, with the store room proposed). */
    if (v === '__back'){ takeBackModal([...st.bulk].map(byId).filter(Boolean)); return; }
    const to = v;
    const snap = snapshot([...st.bulk].map(byId));
    st.bulk.forEach(id => { const o = byId(id); o.status = to; hist(o, now(), 'Status set to ' + STATUS[to].label + ' (bulk)'); });
    toastUndo(n + ' set to ' + STATUS[to].label, () => { restoreSnapshot(snap, 'Bulk status undone'); render(); }); renderTable(); render(); };
  /* Internal or external responsible for every selected device; each device that changes gets a history line. */
  const bulkResp = v => {
    const [kind, id] = v.split(':'); if (!kind) return;
    let changed = 0;
    const snap = snapshot([...st.bulk].map(byId));
    st.bulk.forEach(x => { const o = byId(x); if (o && setResponsible(o, kind, id)) changed++; });
    toastUndo(`${CONTACT_KINDS[kind]} responsible ${id ? 'set' : 'removed'} on ${changed} ${changed === 1 ? 'device' : 'devices'}`, () => { restoreSnapshot(snap, 'Responsible change undone'); render(); }); renderTable(); render();
  };
  const bc = $('#bkClear'); if (bc) bc.onclick = () => { st.bulk.clear(); renderTable(); };
  /* All the listed devices (those past the first rows drawn too), then the control that fixes them has the focus. */
  const bo = $('#bkOpen'); if (bo) bo.onclick = () => openObjs([...st.bulk]);
  /* One menu for what is done with the selected: open them, move them, set their status, responsible or fields. */
  const ba = $('#bkAct'); if (ba) ba.onchange = () => {
    const v = ba.value, at = v.indexOf(':'), what = at < 0 ? v : v.slice(0, at), arg = v.slice(at + 1); ba.value = '';
    if (what === 'open') openObjs([...st.bulk]); else if (what === 'handout') handOutModal([...st.bulk]); else if (what === 'edit') bulkEditModal([...st.bulk]); else if (what === 'loc') bulkLoc(arg); else if (what === 'status') bulkStatus(arg); else if (what === 'resp') bulkResp(arg);
  };
}
