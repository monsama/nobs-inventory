/* To review: the devices a sync found (Lansweeper, AD, Entra or Intune) that wait for someone to say whether they belong
   in the inventory. Cards and Table show them (st.scope, 01-core.js); Accept makes one an ordinary device, Ignore keeps it
   out of every sync from then on, so it does not come back. Ignored devices can be brought back from their own list. */
import { REVIEW, REVIEW_SRC, REVIEW_STALE_DAYS, esc, hist, lastSeenOf, now, objs, st, toastUndo } from './01-core.js';
import { canEdit, me } from './04-settings.js';
import { render, queueServerSave } from './07-render.js';

/* A device no source has seen for REVIEW_STALE_DAYS (or never) is likely gone: grey, and left out of Accept all. */
export const reviewStale = o => { const s = lastSeenOf(o); return !s || s.days > REVIEW_STALE_DAYS; };
const who = () => (me() && (me().name || me().login)) || 'an admin';

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

/* Accept, ignore or bring back one device or many, from Cards, Table or the device page, with one Undo for all. */
export function reviewDo(kind, list){
  if (!list.length) return;
  const n = list.length, what = n === 1 ? list[0].name : `${n} devices`;
  if (kind === 'accept') withUndo(list, `${what} accepted into the inventory`, accept);
  else if (kind === 'ignore') withUndo(list, `${what} ignored: no sync brings ${n === 1 ? 'it' : 'them'} back`, ignore);
  else withUndo(list, `${what} back in To review`, restore);
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
    reviewDo(k, [o]);
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
