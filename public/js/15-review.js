/* To review: the devices a sync found (Lansweeper, AD, Entra or Intune) that wait for someone to say whether they belong
   in the inventory. Each card has Accept (it becomes an ordinary device) and Ignore (it leaves the view and is kept out
   of every sync from then on, so it does not come back). Ignored devices can be brought back from their own list. */
import { twinOf, REVIEW, REVIEW_SRC, REVIEW_STALE_DAYS, $, esc, hist, lastSeenOf, now, objs, st, toastUndo, relIndex, matchesQ } from './01-core.js';
import { cardHtml } from './02-views.js';
import { canEdit, me } from './04-settings.js';
import { render, queueServerSave } from './07-render.js';

/* A device no source has seen for REVIEW_STALE_DAYS (or never) is likely gone: grey, and left out of Accept all. */
export const reviewStale = o => { const s = lastSeenOf(o); return !s || s.days > REVIEW_STALE_DAYS; };
const who = () => (me() && (me().name || me().login)) || 'an admin';
const waiting = () => REVIEW.filter(o => !o.review.ignored);
const ignored = () => REVIEW.filter(o => o.review.ignored);

/* Accept: out of To review into the inventory, as an ordinary device. */
function accept(list){
  for (const o of list){
    const i = REVIEW.indexOf(o); if (i < 0) continue;
    REVIEW.splice(i, 1);
    const src = REVIEW_SRC[o.review.src] || o.review.src;
    delete o.review; delete o.excluded;
    objs.push(o);
    hist(o, now(), `Accepted into the inventory by ${who()} (found by ${src})`);
  }
}
/* Ignore: stays here as ignored and is excluded from the syncs, so none of them brings it back or changes it. */
function ignore(list){
  for (const o of list){ o.review = { ...o.review, ignored: now() }; o.excluded = true; hist(o, now(), `Ignored in To review by ${who()}`); }
}
/* Back from the ignored ones into To review. */
function restore(list){
  for (const o of list){ o.review = { src: o.review.src, at: o.review.at }; delete o.excluded; hist(o, now(), `Back in To review (${who()})`); }
}
/* Undo puts every device touched back as it was: its fields, and in which list it sits. */
function withUndo(list, msg, change){
  const was = list.map(o => [o, JSON.parse(JSON.stringify(o))]);
  change(list);
  render();
  toastUndo(msg, () => {
    for (const [o, before] of was){
      for (const k of Object.keys(o)) if (!(k in before)) delete o[k];
      Object.assign(o, before);
      const i = objs.indexOf(o); if (i >= 0) objs.splice(i, 1);
      if (!REVIEW.includes(o)) REVIEW.push(o);
    }
    render();
  });
}

export function renderReview(){
  st.rvSrc = st.rvSrc || '';
  const showIgnored = st.rvSrc === 'ignored';
  const q = (st.rvQ || '').trim().toLowerCase();
  const pool = showIgnored ? ignored() : waiting();
  const list = pool.filter(o => (showIgnored || !st.rvSrc || o.review.src === st.rvSrc) && matchesQ(o, q))
    .sort((a, b) => reviewStale(a) - reviewStale(b) || String(a.name).localeCompare(String(b.name)));
  const fresh = list.filter(o => !reviewStale(o)), edit = canEdit();
  /* Cards picked with Ctrl+click or their corner (02-views.js): only those still shown here count. */
  st.rvSel = new Set([...(st.rvSel || [])].filter(id => list.some(o => o.id === id)));
  const picked = list.filter(o => st.rvSel.has(o.id));
  const count = src => waiting().filter(o => o.review.src === src).length;
  const chips = [['', `All (${waiting().length})`], ...Object.entries(REVIEW_SRC).filter(([k]) => count(k)).map(([k, l]) => [k, `${l} (${count(k)})`]),
    ...(ignored().length ? [['ignored', `Ignored (${ignored().length})`]] : [])];
  $('#toolbar').innerHTML = `<input id="rvQ" class="listq" type="search" placeholder="Filter this list…" aria-label="Filter the devices to review" value="${esc(st.rvQ || '')}">
    <span class="rv-chips" role="group" aria-label="Found by">${chips.map(([k, l]) => `<button type="button" class="chipbtn ${st.rvSrc === k ? 'sel' : ''}" data-rvsrc="${k}">${esc(l)}</button>`).join('')}</span>
    <div class="grow"></div>
    ${picked.length && edit ? `<b class="pick-n">${picked.length} selected</b><button id="rvSelClear">Clear</button>${showIgnored
      ? `<button id="rvSelRestore">Back to review (${picked.length})</button>`
      : `<button id="rvSelIgnore" class="danger-text">Ignore ${picked.length}</button><button id="rvSelAccept" class="primary">Accept ${picked.length}</button>`}`
      : showIgnored
      ? (edit && list.length ? `<button id="rvRestoreAll">Back to review (${list.length})</button>` : '')
      : (edit && list.length ? `<button id="rvIgnoreAll" class="danger-text">Ignore all ${list.length}</button><button id="rvAcceptAll" class="primary" ${fresh.length ? '' : 'disabled'} title="Devices no source has seen for ${REVIEW_STALE_DAYS} days are left out; accept them one by one">Accept ${fresh.length === list.length ? 'all ' : ''}${fresh.length}${fresh.length === list.length ? '' : ' recently seen'}</button>` : '')}`;
  const idx = relIndex();
  const item = o => {
    const stale = reviewStale(o);
    return `<div class="rv-item${stale ? ' stale' : ''}" data-rv="${esc(o.id)}">${cardHtml(o, idx)}
      <div class="rv-acts"><span class="chip rv-src" title="Found by ${esc(REVIEW_SRC[o.review.src] || '')}">${esc(REVIEW_SRC[o.review.src] || '')}</span>${stale ? `<span class="chip warn rv-old" title="No source has seen it for ${REVIEW_STALE_DAYS} days or more: likely gone">Old</span>` : ''}${twinOf(o) ? `<span class="chip warn rv-twin" title="Named by a DNS name, with no serial number: most likely a second record of ${esc(twinOf(o).name)}, e.g. from a docking station">Probably ${esc(twinOf(o).name)}</span>` : ''}<span class="grow"></span>
        ${!edit ? '' : showIgnored ? `<button type="button" data-rvrestore="${esc(o.id)}">Back to review</button>`
          : `<button type="button" class="rv-no" data-rvignore="${esc(o.id)}" title="Leave it out: no sync brings it back">✕ Ignore</button><button type="button" class="rv-yes" data-rvaccept="${esc(o.id)}" title="Take it into the inventory">✓ Accept</button>`}</div></div>`;
  };
  $('#view').innerHTML = list.length
    ? `<p class="note rv-note">${showIgnored ? 'Ignored devices are kept out of every sync. Bring one back to review it again.' : `Devices a sync found that are not in the inventory yet. Accept the ones that belong; ignore the rest, and no sync brings them back. Until then they are in no list, count or cost.`} Ctrl+click a card, or its corner, to select several; Shift+click selects a range.</p><div id="cards" class="rv-grid">${list.map(item).join('')}</div>`
    : `<div class="empty">${showIgnored ? 'No ignored devices.' : q ? `Nothing to review matches “${esc(q)}”.` : 'Nothing to review. New devices from Lansweeper, Active Directory, Entra and Intune show up here.'}</div>`;

  const byIdIn = id => REVIEW.find(o => o.id === id);
  $('#rvQ').oninput = e => { st.rvQ = e.target.value; renderReview(); const b = $('#rvQ'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); };
  $('#toolbar').querySelectorAll('[data-rvsrc]').forEach(b => b.onclick = () => { st.rvSrc = b.dataset.rvsrc; renderReview(); });
  $('#view').querySelectorAll('[data-rvaccept]').forEach(b => b.onclick = () => { const o = byIdIn(b.dataset.rvaccept); withUndo([o], `${o.name} accepted into the inventory`, accept); });
  $('#view').querySelectorAll('[data-rvignore]').forEach(b => b.onclick = () => { const o = byIdIn(b.dataset.rvignore); withUndo([o], `${o.name} ignored: no sync brings it back`, ignore); });
  $('#view').querySelectorAll('[data-rvrestore]').forEach(b => b.onclick = () => { const o = byIdIn(b.dataset.rvrestore); withUndo([o], `${o.name} is back in To review`, restore); });
  const all = $('#rvAcceptAll');
  if (all) all.onclick = () => { if (confirm(`Accept ${fresh.length} devices into the inventory?`)) withUndo(fresh, `${fresh.length} devices accepted`, accept); };
  const none = $('#rvIgnoreAll');
  if (none) none.onclick = () => { if (confirm(`Ignore all ${list.length} devices shown? No sync brings them back; you can bring them back from Ignored.`)) withUndo(list, `${list.length} devices ignored`, ignore); };
  /* The picked ones: the same as one by one, with one Undo for all of them. */
  const done = () => { st.rvSel.clear(); };
  const sa = $('#rvSelAccept'); if (sa) sa.onclick = () => { done(); withUndo(picked, `${picked.length} ${picked.length === 1 ? 'device' : 'devices'} accepted`, accept); };
  const si = $('#rvSelIgnore'); if (si) si.onclick = () => { done(); withUndo(picked, `${picked.length} ${picked.length === 1 ? 'device' : 'devices'} ignored: no sync brings them back`, ignore); };
  const sr = $('#rvSelRestore'); if (sr) sr.onclick = () => { done(); withUndo(picked, `${picked.length} back in To review`, restore); };
  const sc = $('#rvSelClear'); if (sc) sc.onclick = () => { done(); renderReview(); };
  const back = $('#rvRestoreAll');
  if (back) back.onclick = () => withUndo(list, `${list.length} devices back in To review`, restore);
}
/* The device page of a device waiting for review says so, with the same two buttons. */
export function reviewBanner(o){
  if (!o || !o.review) return '';
  const edit = canEdit(), src = REVIEW_SRC[o.review.src] || o.review.src;
  return o.review.ignored
    ? `<div class="rv-banner"><span>Ignored: found by ${esc(src)}, kept out of the inventory and every sync.</span>${edit ? `<button type="button" data-rvpage="restore">Back to review</button>` : ''}</div>`
    : `<div class="rv-banner"><span>Waiting in To review: found by ${esc(src)}, not in any list, count or cost yet.</span>${edit ? `<button type="button" class="rv-no" data-rvpage="ignore">✕ Ignore</button><button type="button" class="rv-yes" data-rvpage="accept">✓ Accept</button>` : ''}</div>`;
}
export function bindReviewBanner(o){
  document.querySelectorAll('[data-rvpage]').forEach(b => b.onclick = () => {
    const k = b.dataset.rvpage;
    if (k === 'accept') withUndo([o], `${o.name} accepted into the inventory`, accept);
    else if (k === 'ignore') withUndo([o], `${o.name} ignored: no sync brings it back`, ignore);
    else withUndo([o], `${o.name} is back in To review`, restore);
  });
}
/* Settings: where a source's new devices go. To review is the default for every source; a source trusted fully can add
   them straight in (a device not seen for long still waits). */
export function intakeRowHtml(src){
  const v = (st.intake || {})[src] === 'direct' ? 'direct' : 'review';
  return `<div class="lpanel-add intake-row"><label for="intake_${src}">New devices from ${esc(REVIEW_SRC[src])}</label><select id="intake_${src}" data-intake="${src}" ${canEdit() ? '' : 'disabled'}>
    <option value="review" ${v === 'review' ? 'selected' : ''}>Wait in To review</option><option value="direct" ${v === 'direct' ? 'selected' : ''}>Go straight into the inventory</option></select></div>`;
}
export function bindIntakeRows(root){
  root.querySelectorAll('[data-intake]').forEach(sel => sel.onchange = () => {
    const next = { ...(st.intake || {}) };
    if (sel.value === 'direct') next[sel.dataset.intake] = 'direct'; else delete next[sel.dataset.intake];
    st.intake = next; queueServerSave();
  });
}
