/* To review: the devices a sync found (Lansweeper, AD, Entra or Intune) that wait for someone to say whether they belong
   in the inventory. Cards and Table show them (st.scope, 01-core.js); Accept makes one an ordinary device, Ignore keeps it
   out of every sync from then on, so it does not come back. Ignored devices can be brought back from their own list. */
import { REVIEW, REVIEW_SRC, dayText, esc, hist, now, objs, rels, st, toastUndo, twinOf } from './01-core.js';
import { closeModal, confirmModal, modal } from './19-modal.js';
import { unplace } from './03-object-modals.js';
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
function merge(pairs, how = ''){
  for (const [o, t] of pairs){
    const dock = how ? how === 'dock' : !!twinOf(o) && lc(o.name) !== lc(t.name);
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
  /* The user is read from uid (bindUser): writing its name back would look the person up again, or make one. */
  const was = list.map(o => { const b = JSON.parse(JSON.stringify(o)); delete b.user; return [o, b, objs.includes(o)]; });
  const relsWas = rels.map(r => [r, { ...r }]);
  change(list);
  render();
  toastUndo(msg, () => {
    for (const [o, before, inObjs] of was){
      for (const k of Object.keys(o)) if (k !== 'user' && !(k in before)) delete o[k];
      Object.assign(o, before);
      for (const a of [objs, REVIEW]){ const i = a.indexOf(o); if (i >= 0) a.splice(i, 1); }
      (inObjs ? objs : REVIEW).push(o);
      hist(o, now(), `Undone: ${msg}`);
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
  if (kind === 'dock' || kind === 'same' || kind === 'obsolete' || kind === 'notdup'){ resolve(kind, list); return; }
  /* Accepting a device the inventory already has (by name, serial number or as a dock's record) makes a second one: asked
     first, with Merge as the other way. */
  const known = kind === 'accept' && !asked ? list.filter(o => mergeTarget(o)) : [];
  if (known.length){
    const names = known.slice(0, 5).map(o => `<b>${esc(o.name)}</b> → ${esc(mergeTarget(o).name)}`).join('<br>') + (known.length > 5 ? `<br>and ${known.length - 5} more` : '');
    confirmModal('Already in the inventory?', `${known.length === 1 ? 'This record looks like' : `${known.length} of these look like`} a device the inventory has:<br>${names}<br>Accepting adds ${known.length === 1 ? 'it' : 'them'} as ${known.length === 1 ? 'a second device' : 'second devices'}. Merge folds ${known.length === 1 ? 'it' : 'them'} into that device instead.`,
      'Accept anyway', () => reviewDo(kind, list, { asked: true }));
    const ok = document.getElementById('cfOk');
    if (ok){ const mg = document.createElement('button'); mg.id = 'cfMerge'; mg.className = 'primary'; mg.textContent = 'Merge'; ok.before(mg);
      mg.onclick = () => {
        document.getElementById('cfCancel').click();
        /* Merged and accepted in one step, so one Undo takes back both. */
        const pairs = known.map(o => [o, mergeTarget(o)]).filter(([, t]) => t), rest = list.filter(o => !known.includes(o));
        withUndo([...new Set([...pairs.flat(), ...rest])], `${pairs.length} merged${rest.length ? `, ${rest.length} accepted` : ''}`, () => { merge(pairs); accept(rest); });
      }; }
    return;
  }
  if (kind === 'accept') withUndo(list, `${what} accepted into the inventory`, accept);
  else if (kind === 'ignore') withUndo(list, `${what} ignored: no sync brings ${n === 1 ? 'it' : 'them'} back`, ignore);
  else withUndo(list, `${what} back in To review`, restore);
}
/* Resolving a probable duplicate: the record and the device it most likely is, side by side, and what it is.
   - dock: a docking station's or USB adapter's record: its address goes to the device as an adapter (Merge)
   - same: the same device, renamed or set up again: it fills the device's empty fields (Merge)
   - obsolete: gone: retired and excluded from the syncs (ignored, when it still waits in To review)
   - notdup: a device of its own: never flagged as a duplicate again (notTwin; Check again on its page undoes it) */
const RESOLVE = [
  ['dock', 'Docking station or USB adapter', 'Its address is kept on the device as an adapter; the record is kept as ignored, so no sync brings it back.'],
  ['same', 'The same device, renamed or set up again', 'It fills the fields the device has empty and is kept as ignored.'],
  ['obsolete', 'Obsolete, gone', 'Retired and excluded from the syncs, with this in its history.'],
  ['notdup', 'Not a duplicate', 'A device of its own: it is not flagged again.'],
];
/* The device a record stands for: by serial number or name in the inventory, else the device of its DNS name's first
   part, also while that one still waits in To review. */
export const dupOf = o => mergeTarget(o) || twinOf(o);
function resolve(kind, list){
  const pairs = list.map(o => [o, dupOf(o)]).filter(([, t]) => t);
  if (!pairs.length) return;
  const n = pairs.length, what = n === 1 ? pairs[0][0].name : `${n} records`;
  if (kind === 'dock' || kind === 'same'){ withUndo([...new Set(pairs.flat())], `${what} merged into ${n === 1 ? pairs[0][1].name : 'their devices'}`, () => merge(pairs, kind)); return; }
  if (kind === 'notdup'){
    withUndo(pairs.map(([o]) => o), `${what} marked as no duplicate`, () => { for (const [o, t] of pairs){ o.notTwin = true; hist(o, now(), `Marked as not a duplicate of ${t.name} by ${who()}`); } });
    return;
  }
  /* Devices stacked on one that leaves its rack come out with it (unplace): they are put back by Undo too. */
  const onTop = objs.filter(x => pairs.some(([o]) => x.ontop === o.id));
  withUndo([...pairs.map(([o]) => o), ...onTop], `${what} ${n === 1 ? 'is' : 'are'} obsolete: ${objs.includes(pairs[0][0]) ? 'retired and excluded' : 'ignored'}`, () => {
    for (const [o, t] of pairs){
      if (o.review){ o.review = { ...o.review, ignored: now() }; o.excluded = true; }
      else { if (o.rack) unplace(o); o.status = 'retired'; o.excluded = true; }
      hist(o, now(), `Obsolete, a second record of ${t.name}: ${o.review ? 'ignored' : 'retired and excluded from the syncs'} by ${who()}`);
    }
  });
}
/* Where each source last saw a device, for the comparison. */
const seenBy = o => {
  const g = o.graph && !o.graph.gone ? o.graph : null;
  return [['Lansweeper', o.feed && (o.feed.scanned || o.feed.seen)], ['AD', o.ad && o.ad.logon], ['Entra', g && (g.lastSignIn || g.lastSync)], ['Defender', o.defender && o.defender.lastSeen]]
    .filter(([, v]) => v).map(([k, v]) => `${k} ${dayText(String(v).slice(0, 10))}`).join(' · ');
};
export function resolveModal(list){
  list = list.filter(o => dupOf(o));
  if (!list.length || !canEdit()) return;
  const one = list.length === 1, o = list[0], t = dupOf(o);
  const dns = list.every(x => twinOf(x) && lc(x.name) !== lc(dupOf(x).name));
  const rows = [['Name', x => x.name], ['Serial number', x => x.serial], ['Model', x => x.model], ['IP address', x => x.ip], ['MAC address', x => x.mac], ['User', x => x.user],
    ['Operating system', x => x.os], ['Code', x => x.code], ['Seen by', seenBy], ['Where', x => x.review ? (x.review.ignored ? 'Ignored' : 'Waiting in To review') : x.status === 'retired' ? 'Retired' : 'Inventory']];
  const table = one ? `<table class="dup-cmp"><thead><tr><th></th><th>This record</th><th>Most likely the device</th></tr></thead><tbody>${rows.map(([l, f]) => {
    const a = String(f(o) || ''), b = String(f(t) || '');
    return `<tr${a && b && a.toLowerCase() !== b.toLowerCase() ? ' class="dup-diff"' : ''}><th>${l}</th><td>${esc(a) || '—'}</td><td>${esc(b) || '—'}</td></tr>`;
  }).join('')}</tbody></table>`
    : `<ul class="dup-list">${list.slice(0, 12).map(x => `<li><b>${esc(x.name)}</b> → ${esc(dupOf(x).name)}</li>`).join('')}${list.length > 12 ? `<li>and ${list.length - 12} more</li>` : ''}</ul>`;
  const def = dns ? 'dock' : 'same';
  modal(`<div class="mh">${one ? `Resolve ${esc(o.name)}` : `Resolve ${list.length} duplicates`}</div><div class="mb">
    <p class="note">${one ? `Most likely a second record of <b>${esc(t.name)}</b>. What is it?` : 'Each is most likely a second record of the device after the arrow. What are they?'}</p>${table}
    <div class="dup-ways" role="radiogroup" aria-label="What it is">${RESOLVE.map(([k, l, d]) => `<label class="dup-way"><input type="radio" name="dupWay" value="${k}" ${k === def ? 'checked' : ''}><span><b>${l}</b><span class="muted">${d}</span></span></label>`).join('')}</div></div>
    <div class="mf"><button id="dupCancel">Cancel</button><button id="dupOk" class="primary">Resolve</button></div>`);
  document.getElementById('dupCancel').onclick = closeModal;
  document.getElementById('dupOk').onclick = () => { const k = document.querySelector('[name=dupWay]:checked').value; closeModal(); reviewDo(k, list); };
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
