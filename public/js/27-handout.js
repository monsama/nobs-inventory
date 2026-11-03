/* Handing devices out and taking them back, in one step each. Hand out: a person (found by name, or added on the spot),
   the device is then in use with them; an admin can print the entry sheet right after. Take back: the device is in
   stock again, with nobody. Both with Undo, and in the device's history. */
import { $, esc, feedLinked, hist, now, objs, pickHand, restoreSnapshot, snapshot, toastUndo } from './01-core.js';
import { USERS, ensureUser, isAdmin, who } from './04-settings.js';
import { SERVER, queueServerSave, render } from './07-render.js';
import { closeModal, modal } from './19-modal.js';
import { sheetModal } from './08-sheets.js';

const low = v => String(v || '').trim().toLowerCase();
/* A synced device keeps the person given here: the next sync does not put its own user back. */
const keepUser = o => { if (feedLinked(o) || (o.graph && o.graph.added)) pickHand(o, 'user'); };

function give(list, u){
  for (const o of list){
    const was = o.user;
    delete o.hotdesk; o.uid = u.id; o.status = 'active'; keepUser(o);
    hist(o, now(), `Handed out to ${u.name}${was && was !== u.name ? ` (was ${was})` : ''} by ${who()}`);
  }
}
export function takeBack(list){
  const live = list.filter(o => o.status !== 'retired');
  if (!live.length) return;
  const snap = snapshot(live), names = new Set(live.map(o => o.user).filter(Boolean));
  for (const o of live){
    const had = o.user;
    o.uid = null; delete o.hotdesk; o.status = 'stock'; keepUser(o);
    hist(o, now(), `Taken back into stock${had ? ` from ${had}` : ''} by ${who()}`);
  }
  queueServerSave(); render();
  toastUndo(`${live.length === 1 ? live[0].name : `${live.length} devices`} back in stock${names.size === 1 ? ` from ${[...names][0]}` : ''}`, () => { restoreSnapshot(snap, 'Taking back undone'); queueServerSave(); render(); });
}

/* The people to choose from: active ones first, by name; the search finds by name, login or department. */
const SHOWN = 8;
const people = q => USERS.filter(u => (u.active !== false || q) && (!q || [u.name, u.login, u.dept].some(x => low(x).includes(q))))
  .sort((a, b) => (a.active === false) - (b.active === false) || a.name.localeCompare(b.name));

/* Hand out the devices (ids) to a person picked here. */
export function handOutModal(ids){
  const list = ids.map(id => objs.find(o => o.id === id)).filter(o => o && o.status !== 'retired');
  if (!list.length) return;
  let picked = null;
  modal(`<div class="mh">Hand out ${list.length === 1 ? esc(list[0].name) : `${list.length} devices`}</div><div class="mb">
    <label for="hoQ" class="ho-l">To whom</label><input id="hoQ" autocomplete="off" placeholder="Name, login or department">
    <div id="hoList" class="ho-list" role="listbox" aria-label="People"></div>
    ${SERVER.on && isAdmin() ? '<label class="pchk ho-sheet"><input type="checkbox" id="hoSheet"> Then make the entry sheet</label>' : ''}
    <p class="note" id="hoSays">The device is in use with the person from now on.</p></div>
    <div class="mf"><button id="hoNo">Cancel</button><button id="hoOk" class="primary" disabled>Hand out</button></div>`, 'sm');
  const draw = () => {
    const q = low($('#hoQ').value), all = people(q), found = all.slice(0, SHOWN), exact = all.some(u => low(u.name) === q);
    /* Someone who has left is found too (so the name is not offered as a new person), but cannot be picked. */
    $('#hoList').innerHTML = found.map(u => u.active === false ? `<button type="button" class="ho-p" disabled title="Has left: reactivate in Settings → Users first"><b>${esc(u.name)}</b><span class="muted">has left${u.login ? ' · ' + esc(u.login) : ''}</span></button>` : `<button type="button" class="ho-p${picked && picked.id === u.id ? ' sel' : ''}" data-hop="${esc(u.id)}" role="option" aria-selected="${picked && picked.id === u.id}"><b>${esc(u.name)}</b><span class="muted">${esc([u.login, u.dept].filter(Boolean).join(' · '))}</span></button>`).join('')
      /* A new person is a change to Settings → Users, which only an admin makes: an editor picks someone who is there. */
      + (q && !exact && isAdmin() ? `<button type="button" class="ho-p ho-new${picked && picked.isNew ? ' sel' : ''}" data-honew="1" role="option"><b>New person: ${esc($('#hoQ').value.trim())}</b><span class="muted">added to Settings → Users, without a sign-in</span></button>` : '')
      + (all.length > SHOWN ? `<p class="note">${SHOWN} of ${all.length} shown: type to narrow.</p>` : '')
      + (!found.length && !q ? '<p class="note">Type a name.</p>' : '')
      + (q && !found.length && !isAdmin() ? '<p class="note">Nobody by that name. An admin adds new people under Settings → Users.</p>' : '');
    $('#hoList').querySelectorAll('[data-hop]').forEach(b => b.onclick = () => { picked = USERS.find(u => u.id === b.dataset.hop); $('#hoQ').value = picked.name; draw(); });
    const nb = $('#hoList').querySelector('[data-honew]'); if (nb) nb.onclick = () => { picked = { isNew: true, name: $('#hoQ').value.trim() }; draw(); };
    $('#hoOk').disabled = !picked;
    $('#hoOk').textContent = picked ? `Hand out to ${picked.name}` : 'Hand out';
  };
  $('#hoQ').oninput = () => { picked = null; draw(); };
  $('#hoQ').onkeydown = e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!picked){ const first = $('#hoList').querySelector('[data-hop], [data-honew]'); if (first) first.click(); return; }
    $('#hoOk').click();
  };
  $('#hoNo').onclick = closeModal;
  $('#hoOk').onclick = () => {
    if (!picked) return;
    const u = picked.isNew ? ensureUser(picked.name, 'manual') : picked, sheet = $('#hoSheet') && $('#hoSheet').checked;
    const snap = snapshot(list);
    give(list, u);
    closeModal(); queueServerSave(); render();
    toastUndo(`${list.length === 1 ? list[0].name : `${list.length} devices`} handed out to ${u.name}`, () => { restoreSnapshot(snap, 'Handing out undone'); queueServerSave(); render(); });
    if (sheet) sheetModal(u, null, list.length === 1 ? { only: list[0].id } : {});
  };
  draw(); $('#hoQ').focus();
}

/* Hand out devices from the stock to a person (their view): pick one or more. */
export function handOutToModal(u){
  const stock = () => objs.filter(o => o.status === 'stock' && !o.review);
  modal(`<div class="mh">Hand out to ${esc(u.name)}</div><div class="mb">
    <label for="hsQ" class="ho-l">Devices in stock</label><input id="hsQ" autocomplete="off" placeholder="Name, code, model or serial number">
    <div id="hsList" class="ho-list ho-devs"></div>
    ${SERVER.on && isAdmin() ? '<label class="pchk ho-sheet"><input type="checkbox" id="hoSheet"> Then make the entry sheet</label>' : ''}</div>
    <div class="mf"><button id="hoNo">Cancel</button><button id="hoOk" class="primary" disabled>Hand out</button></div>`, 'sm');
  const chosen = new Set();
  const draw = () => {
    const q = low($('#hsQ').value), all = stock(), list = all.filter(o => !q || [o.name, o.code, o.model, o.serial].some(x => low(x).includes(q))).slice(0, 50);
    $('#hsList').innerHTML = list.length ? list.map(o => `<label class="pchk ho-dev"><input type="checkbox" data-hsd="${esc(o.id)}" ${chosen.has(o.id) ? 'checked' : ''}> <b>${esc(o.name)}</b> <span class="muted">${esc([o.code, o.model, o.loc].filter(Boolean).join(' · '))}</span></label>`).join('')
      : `<p class="note">${all.length ? 'No device in stock fits.' : 'No device is in stock.'}</p>`;
    $('#hsList').querySelectorAll('[data-hsd]').forEach(c => c.onchange = () => { if (c.checked) chosen.add(c.dataset.hsd); else chosen.delete(c.dataset.hsd); upd(); });
    upd();
  };
  const upd = () => { $('#hoOk').disabled = !chosen.size; $('#hoOk').textContent = chosen.size ? `Hand out ${chosen.size === 1 ? '1 device' : `${chosen.size} devices`}` : 'Hand out'; };
  $('#hsQ').oninput = draw;
  $('#hoNo').onclick = closeModal;
  $('#hoOk').onclick = () => {
    const list = [...chosen].map(id => objs.find(o => o.id === id)).filter(Boolean); if (!list.length) return;
    const sheet = $('#hoSheet') && $('#hoSheet').checked, snap = snapshot(list);
    give(list, u);
    closeModal(); queueServerSave(); render();
    toastUndo(`${list.length === 1 ? list[0].name : `${list.length} devices`} handed out to ${u.name}`, () => { restoreSnapshot(snap, 'Handing out undone'); queueServerSave(); render(); });
    if (sheet) sheetModal(u);
  };
  draw(); $('#hsQ').focus();
}
