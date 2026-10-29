/* To review: the devices a sync found (Lansweeper, AD, Entra or Intune) that wait for someone to say whether they belong
   in the inventory. Cards and Table show them (st.scope, 01-core.js); Accept makes one an ordinary device, Ignore keeps it
   out of every sync from then on, so it does not come back. Ignored devices can be brought back from their own list. */
import { REVIEW, REVIEW_SRC, esc, hist, now, objs, rels, st, toastUndo, twinOf } from './01-core.js';
import { confirmModal } from './19-modal.js';
import { canEdit, me } from './04-settings.js';
import { render, queueServerSave } from './07-render.js';

export { reviewStale } from './01-core.js';
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
/* The inventory device a record most likely is too: one with its serial number, else one of its name, else (a record
   named by a DNS name, a docking station's) the one named by the first part. Only devices in the inventory count. */
const lc = v => String(v || '').toLowerCase();
const byIdOf = id => objs.find(x => x.id === id);
export function mergeTarget(o){
  if (!o) return null;
  const live = objs.filter(x => x !== o && x.status !== 'retired');
  const tw = twinOf(o);
  return (o.serial && live.find(x => x.serial && lc(x.serial) === lc(o.serial))) || live.find(x => lc(x.name) === lc(o.name))
    || (tw && live.includes(tw) ? tw : null);
}
/* Merge: the record is folded into that device and kept as ignored, so no sync brings it back. Its address becomes an
   adapter of the device (a dock's, for a DNS-named record); a record of the same name or serial number also fills the
   fields the device has empty. Its relations (monitors attached to it) go to the device. */
function merge(pairs){
  for (const [o, t] of pairs){
    const dock = !!twinOf(o) && lc(o.name) !== lc(t.name);
    if (o.ip && o.ip !== t.ip){
      const nic = { name: dock ? 'Dock / USB adapter' : 'Second record', ip: o.ip, ...(o.mac ? { mac: o.mac } : {}), merged: o.name };
      t.nics = [...(t.nics || []).filter(n => n.ip !== o.ip && n.merged !== o.name), nic];
    }
    if (!dock) for (const k of ['serial', 'model', 'os', 'domain', 'mac', 'user']) if (o[k] && !t[k]){ t[k] = o[k]; if (o.src && o.src[k]) (t.src ??= {})[k] = o.src[k]; }
    for (const r of rels){ if (r.from === o.id) r.from = t.id; if (r.to === o.id) r.to = t.id; }
    for (let i = rels.length - 1; i >= 0; i--){
      const r = rels[i];
      if (r.from === r.to || rels.some((x, j) => j < i && x.from === r.from && x.to === r.to && x.kind === r.kind)) rels.splice(i, 1);
    }
    const i = objs.indexOf(o); if (i >= 0) objs.splice(i, 1);
    if (!REVIEW.includes(o)) REVIEW.push(o);
    const src = (o.review && o.review.src) || (o.feed ? 'lansweeper' : o.inAd ? 'ad' : o.graph ? 'graph' : 'lansweeper');
    o.review = { src, at: (o.review && o.review.at) || now(), ignored: now(), merged: t.id }; o.excluded = true;
    hist(o, now(), `Merged into ${t.name} by ${who()}: kept as ignored, so no sync brings it back`);
    hist(t, now(), `${o.name} merged into this device by ${who()}${o.ip && o.ip !== t.ip ? ` (its address ${o.ip} kept as an adapter)` : ''}`);
  }
}
/* Undo puts every device touched back as it was: its fields, and in which list it sits; and the relations a merge moved. */
function withUndo(list, msg, change){
  const was = list.map(o => [o, JSON.parse(JSON.stringify(o)), objs.includes(o)]);
  const relsWas = rels.map(r => [r, { ...r }]);
  change(list);
  render();
  toastUndo(msg, () => {
    for (const [o, before, inObjs] of was){
      for (const k of Object.keys(o)) if (!(k in before)) delete o[k];
      Object.assign(o, before);
      for (const a of [objs, REVIEW]){ const i = a.indexOf(o); if (i >= 0) a.splice(i, 1); }
      (inObjs ? objs : REVIEW).push(o);
    }
    rels.splice(0, rels.length, ...relsWas.map(([r, w]) => Object.assign(r, w)));
    render();
  });
}

/* Accept, ignore or bring back one device or many, from Cards, Table or the device page, with one Undo for all. */
export function reviewDo(kind, list, { asked = false } = {}){
  if (!list.length) return;
  const n = list.length, what = n === 1 ? list[0].name : `${n} devices`;
  if (kind === 'merge'){
    const pairs = list.map(o => [o, mergeTarget(o)]).filter(([, t]) => t);
    if (!pairs.length) return;
    const m = pairs.length === 1 ? `${pairs[0][0].name} merged into ${pairs[0][1].name}` : `${pairs.length} records merged into their devices`;
    withUndo([...new Set(pairs.flat())], m, () => merge(pairs));
    return;
  }
  /* Accepting a device the inventory already has (by name, serial number or as a dock's record) makes a second one: asked
     first, with Merge as the other way. */
  const known = kind === 'accept' && !asked ? list.filter(o => mergeTarget(o)) : [];
  if (known.length){
    const names = known.slice(0, 5).map(o => `<b>${esc(o.name)}</b> → ${esc(mergeTarget(o).name)}`).join('<br>') + (known.length > 5 ? `<br>and ${known.length - 5} more` : '');
    confirmModal('Already in the inventory?', `${known.length === 1 ? 'This record looks like' : `${known.length} of these look like`} a device the inventory has:<br>${names}<br>Accepting adds ${known.length === 1 ? 'it' : 'them'} as ${known.length === 1 ? 'a second device' : 'second devices'}. Merge folds ${known.length === 1 ? 'it' : 'them'} into that device instead.`,
      'Accept anyway', () => reviewDo(kind, list, { asked: true }));
    const ok = document.getElementById('cfOk');
    if (ok){ const mg = document.createElement('button'); mg.id = 'cfMerge'; mg.className = 'primary'; mg.textContent = 'Merge'; ok.before(mg);
      mg.onclick = () => { document.getElementById('cfCancel').click(); reviewDo('merge', known); const rest = list.filter(o => !known.includes(o)); if (rest.length) reviewDo('accept', rest, { asked: true }); }; }
    return;
  }
  if (kind === 'accept') withUndo(list, `${what} accepted into the inventory`, accept);
  else if (kind === 'ignore') withUndo(list, `${what} ignored: no sync brings ${n === 1 ? 'it' : 'them'} back`, ignore);
  else withUndo(list, `${what} back in To review`, restore);
}
/* The device page of a device waiting for review says so, with the same two buttons. */
export function reviewBanner(o){
  if (!o || !o.review) return '';
  const edit = canEdit(), src = REVIEW_SRC[o.review.src] || o.review.src;
  return o.review.ignored
    ? `<div class="rv-banner"><span>${o.review.merged && byIdOf(o.review.merged) ? `Merged into <b>${esc(byIdOf(o.review.merged).name)}</b> and` : `Ignored: found by ${esc(src)},`} kept out of the inventory and every sync.</span>${edit ? `<button type="button" data-rvpage="restore">Back to review</button>` : ''}</div>`
    : `<div class="rv-banner"><span>Waiting in To review: found by ${esc(src)}, not in any list, count or cost yet.</span>${edit ? `<button type="button" class="rv-no" data-rvpage="ignore">✕ Ignore</button>${mergeTarget(o) ? `<button type="button" data-rvpage="merge" title="Fold it into the device the inventory has; it is kept as ignored">Merge into ${esc(mergeTarget(o).name)}</button>` : ''}<button type="button" class="rv-yes" data-rvpage="accept">✓ Accept</button>` : ''}</div>`;
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
