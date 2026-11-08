/* Handing devices out and taking them back, in one step each. Hand out: a person (found by name, or added on the spot),
   the device is then in use with them; an admin can print the entry sheet right after. Take back: the device is in
   stock again, with nobody. Both with Undo, and in the device's history. */
import { $, LOCS, feedLinked, hist, markHand, now, objs, pickHand, restoreSnapshot, snapshot, st, toastUndo } from './01-core.js';
import { USERS, ensureUser, isAdmin, who } from './04-settings.js';
import { SERVER, queueServerSave, render } from './07-render.js';
import { closeModal, modal } from './19-modal.js';
import { sheetModal } from './08-sheets.js';
import { html } from './html.js';

const low = v => String(v || '').trim().toLowerCase();
/* A synced device keeps the person given here: the next sync does not put its own user back. */
const keepUser = o => { if (feedLinked(o) || (o.graph && o.graph.added)) pickHand(o, 'user'); };

/* A device moved to a room here: a synced one keeps this room too, as one moved by hand. true when it moved. */
function moveTo(o, loc){
  if (!loc || o.loc === loc) return false;
  if (feedLinked(o) || (o.graph && o.graph.added)) pickHand(o, 'loc');
  o.loc = loc; markHand(o, 'loc');
  return true;
}
function give(list, u, loc = ''){
  for (const o of list){
    const was = o.user;
    delete o.hotdesk; o.uid = u.id; o.status = 'active'; keepUser(o);
    const moved = moveTo(o, loc);
    hist(o, now(), `Handed out to ${u.name}${was && was !== u.name ? ` (was ${was})` : ''}${moved ? `, to ${loc}` : ''} by ${who()}`);
  }
}
/* The room a person's office (from AD or Entra) names, or is mapped to under Settings → Locations; '' when none. */
const lowText = v => String(v || '').trim().toLowerCase();
export function officeRoom(u){
  const office = lowText(u && u.profile && u.profile.office); if (!office) return '';
  const map = { ...(st.adLocMap || {}), ...(st.locMap || {}) };
  const mapped = Object.entries(map).find(([k]) => lowText(k) === office);
  return LOCS.find(l => lowText(l) === office) || (mapped && LOCS.includes(mapped[1]) ? mapped[1] : '');
}
/* Where the devices go: where they are (the default), or a room; the one marked "office" is the person's. */
const locField = (id = 'hoLoc', office = '') => html`<label for="${id}" class="ho-l">Where</label><select id="${id}"><option value="">Where it is now</option>${LOCS.map(l => html`<option value="${l}">${l}${l === office ? ' (their office)' : ''}</option>`)}</select>`;
const locPicked = (id = 'hoLoc') => ($('#' + id) && $('#' + id).value) || '';
/* A person picked: their office room is proposed, unless a room was chosen already. */
const proposeOffice = u => {
  const sel = $('#hoLoc'), room = officeRoom(u); if (!sel) return;
  for (const o of sel.options) o.textContent = o.value + (o.value && o.value === room ? ' (their office)' : '') || 'Where it is now';
  if (room && (!sel.value || sel.dataset.auto)){ sel.value = room; sel.dataset.auto = '1'; }
  else if (!room && sel.dataset.auto){ sel.value = ''; delete sel.dataset.auto; }
};
/* Take back into stock: asked where they go (where they are, or a room; the room last used for this is proposed,
   kept in this browser), then done with Undo. */
const STOCK_ROOM = 'ni-stock-room';
/* The Take back dialog for the devices in list (retired ones left out): where they go, the site's store room or the
   room used last proposed. Remembers the room in this browser and passes it to takeBack. */
export function takeBackModal(list){
  const live = list.filter(o => o.status !== 'retired');
  if (!live.length) return;
  let last = ''; try { last = localStorage.getItem(STOCK_ROOM) || ''; } catch { /* no storage: nothing proposed */ }
  /* All of one site with a store room set (Settings → Locations): that room; else the one used last in this browser. */
  const sites = new Set(live.map(o => String(o.loc || '').split(' / ')[0]).filter(Boolean)), site = sites.size === 1 ? [...sites][0] : '';
  const store = site && st.stockRooms && st.stockRooms[site];
  if (store && LOCS.includes(store)) last = store;
  /* First choice: leave them where they are, naming that room. Then the store rooms (Settings → Locations), then the rest. */
  const here = [...new Set(live.map(o => o.loc || ''))];
  const stay = here.length === 1 ? (here[0] ? `Leave it where it is (${here[0]})` : 'Leave it where it is (no room)') : 'Leave each where it is';
  const stores = [...new Set(Object.values(st.stockRooms || {}))].filter(l => LOCS.includes(l)).sort();
  const others = LOCS.filter(l => !stores.includes(l));
  const opt = l => html`<option value="${l}">${l}</option>`;
  modal(html`<div class="mh">Take back ${live.length === 1 ? live[0].name : `${live.length} devices`}</div><div class="mb">
    <label for="tbLoc" class="ho-l">Where</label><select id="tbLoc"><option value="">${stay}</option>${stores.length
      ? html`<optgroup label="Store rooms">${stores.map(opt)}</optgroup><optgroup label="Other rooms">${others.map(opt)}</optgroup>` : LOCS.map(opt)}</select>
    ${site && !store && isAdmin() ? html`<label class="pchk tb-store" id="tbStoreRow" hidden><input type="checkbox" id="tbStore" checked> Make it the store room of ${site}: proposed here from now on</label>
      <p class="note muted" id="tbNoStore">${site} has no store room yet: pick the room where devices in stock are kept.</p>` : ''}
    <p class="note">${live.length === 1 ? 'It is' : 'They are'} in stock from now on, with nobody.</p></div>
    <div class="mf"><button id="tbNo">Cancel</button><button id="tbOk" class="primary">Take back</button></div>`, 'sm');
  if (last && LOCS.includes(last)) $('#tbLoc').value = last;
  /* A site without a store room: a room of that site picked here can become its store room (Settings → Locations). */
  const fitStore = () => { const row = $('#tbStoreRow'); if (!row) return; const l = $('#tbLoc').value, ok = !!l && l.startsWith(site + ' / '); row.hidden = !ok; $('#tbNoStore').hidden = ok; };
  $('#tbLoc').addEventListener('change', fitStore); fitStore();
  $('#tbNo').onclick = closeModal;
  $('#tbOk').onclick = () => {
    const loc = locPicked('tbLoc');
    const row = $('#tbStoreRow');
    if (row && !row.hidden && $('#tbStore').checked && loc){ st.stockRooms = { ...(st.stockRooms || {}), [site]: loc }; queueServerSave(); }
    try { if (loc) localStorage.setItem(STOCK_ROOM, loc); } catch { /* not kept: proposed again next time */ }
    closeModal(); takeBack(live, loc);
  };
  $('#tbOk').focus();
}
/* Takes the devices back into stock: no person, status stock, moved to loc when one is given, with a history line
   each. Saves, draws the page again and offers Undo. */
export function takeBack(list, loc = ''){
  const live = list.filter(o => o.status !== 'retired');
  if (!live.length) return;
  const snap = snapshot(live), names = new Set(live.map(o => o.user).filter(Boolean));
  for (const o of live){
    const had = o.user;
    o.uid = null; delete o.hotdesk; o.status = 'stock'; keepUser(o);
    const moved = moveTo(o, loc);
    hist(o, now(), `Taken back into stock${had ? ` from ${had}` : ''}${moved ? `, to ${loc}` : ''} by ${who()}`);
  }
  queueServerSave(); render();
  toastUndo(`${live.length === 1 ? live[0].name : `${live.length} devices`} back in stock${names.size === 1 ? ` from ${[...names][0]}` : ''}`, () => { restoreSnapshot(snap, 'Taking back undone'); queueServerSave(); render(); });
}

/* The people to choose from: active ones first, by name; the search finds by name, login or department. */
const SHOWN = 8;
const people = q => USERS.filter(u => (u.active !== false || q) && (!q || [u.name, u.login, u.dept].some(x => low(x).includes(q))))
  .sort((a, b) => +(a.active === false) - +(b.active === false) || a.name.localeCompare(b.name));

/* Hand out the devices (ids) to a person picked here. */
export function handOutModal(ids){
  const list = ids.map(id => objs.find(o => o.id === id)).filter(o => o && o.status !== 'retired');
  if (!list.length) return;
  let picked = null;
  modal(html`<div class="mh">Hand out ${list.length === 1 ? list[0].name : `${list.length} devices`}</div><div class="mb">
    <label for="hoQ" class="ho-l">To whom</label><input id="hoQ" autocomplete="off" placeholder="Name, login or department">
    <div id="hoList" class="ho-list" role="listbox" aria-label="People"></div>
    ${locField()}
    ${SERVER.on && isAdmin() ? html`<label class="pchk ho-sheet"><input type="checkbox" id="hoSheet"> Then make the entry sheet</label>` : ''}
    <p class="note" id="hoSays">The device is in use with the person from now on.</p></div>
    <div class="mf"><button id="hoNo">Cancel</button><button id="hoOk" class="primary" disabled>Hand out</button></div>`, 'sm');
  const draw = () => {
    const q = low($('#hoQ').value), all = people(q), found = all.slice(0, SHOWN), exact = all.some(u => low(u.name) === q);
    /* Someone who has left is found too (so the name is not offered as a new person), but cannot be picked. */
    $('#hoList').innerHTML = html`${found.map(u => u.active === false ? html`<button type="button" class="ho-p" disabled title="Has left: reactivate in Settings → Users first"><b>${u.name}</b><span class="muted">has left${u.login ? ' · ' + u.login : ''}</span></button>` : html`<button type="button" class="ho-p${picked && picked.id === u.id ? ' sel' : ''}" data-hop="${u.id}" role="option" aria-selected="${String(picked && picked.id === u.id)}"><b>${u.name}</b><span class="muted">${[u.login, u.dept].filter(Boolean).join(' · ')}</span></button>`)}${
      q && !exact ? html`<button type="button" class="ho-p ho-new${picked && picked.isNew ? ' sel' : ''}" data-honew="1" role="option"><b>New person: ${$('#hoQ').value.trim()}</b><span class="muted">added to Settings → Users, without a sign-in</span></button>` : ''}${
      all.length > SHOWN ? html`<p class="note">${SHOWN} of ${all.length} shown: type to narrow.</p>` : ''}${
      !found.length && !q ? html`<p class="note">Type a name.</p>` : ''}`;
    $('#hoList').querySelectorAll('[data-hop]').forEach(b => b.onclick = () => { picked = USERS.find(u => u.id === b.dataset.hop); $('#hoQ').value = picked.name; proposeOffice(picked); draw(); });
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
    give(list, u, locPicked());
    closeModal(); queueServerSave(); render();
    toastUndo(`${list.length === 1 ? list[0].name : `${list.length} devices`} handed out to ${u.name}`, () => { restoreSnapshot(snap, 'Handing out undone'); queueServerSave(); render(); });
    if (sheet) sheetModal(u, null, list.length === 1 ? { only: list[0].id } : {});
  };
  /* In a store room: "where it is now" would list it there while someone uses it, so where it goes is asked for. */
  const stores = new Set(Object.values(st.stockRooms || {}));
  const inStore = list.every(o => o.loc && stores.has(o.loc)) ? list[0].loc : '';
  if (inStore){ const o0 = $('#hoLoc').options[0]; o0.textContent = `Leave it in the store room (${inStore})`; }
  let storeOk = false;
  const ok0 = $('#hoOk').onclick;
  $('#hoOk').onclick = e => {
    if (inStore && picked && !locPicked() && !storeOk){
      storeOk = true; $('#hoLoc').focus();
      $('#hoSays').innerHTML = String(html`<span class="ho-warn">${list.length === 1 ? 'It is' : 'They are'} in the store room ${inStore}: pick where ${list.length === 1 ? 'it goes' : 'they go'}, or Hand out again to leave ${list.length === 1 ? 'it' : 'them'} listed there.</span>`);
      return;
    }
    ok0.call($('#hoOk'), e);
  };
  draw(); $('#hoQ').focus();
}

/* Hand out devices from the stock to a person (their view): pick one or more. */
export function handOutToModal(u){
  const stock = () => objs.filter(o => o.status === 'stock' && !o.review);
  modal(html`<div class="mh">Hand out to ${u.name}</div><div class="mb">
    <label for="hsQ" class="ho-l">Devices in stock</label><input id="hsQ" autocomplete="off" placeholder="Name, code, model or serial number">
    <div id="hsList" class="ho-list ho-devs"></div>
    ${locField('hoLoc', officeRoom(u))}
    ${SERVER.on && isAdmin() ? html`<label class="pchk ho-sheet"><input type="checkbox" id="hoSheet"> Then make the entry sheet</label>` : ''}</div>
    <div class="mf"><button id="hoNo">Cancel</button><button id="hoOk" class="primary" disabled>Hand out</button></div>`, 'sm');
  if (officeRoom(u)) $('#hoLoc').value = officeRoom(u);
  const chosen = new Set();
  const draw = () => {
    const q = low($('#hsQ').value), all = stock(), list = all.filter(o => !q || [o.name, o.code, o.model, o.serial].some(x => low(x).includes(q))).slice(0, 50);
    $('#hsList').innerHTML = list.length ? html`${list.map(o => html`<label class="pchk ho-dev"><input type="checkbox" data-hsd="${o.id}" ${chosen.has(o.id) ? 'checked' : ''}> <b>${o.name}</b> <span class="muted">${[o.code, o.model, o.loc].filter(Boolean).join(' · ')}</span></label>`)}`
      : html`<p class="note">${all.length ? 'No device in stock fits.' : 'No device is in stock.'}</p>`;
    $('#hsList').querySelectorAll('[data-hsd]').forEach(c => c.onchange = () => { if (c.checked) chosen.add(c.dataset.hsd); else chosen.delete(c.dataset.hsd); upd(); });
    upd();
  };
  const upd = () => { $('#hoOk').disabled = !chosen.size; $('#hoOk').textContent = chosen.size ? `Hand out ${chosen.size === 1 ? '1 device' : `${chosen.size} devices`}` : 'Hand out'; };
  $('#hsQ').oninput = draw;
  $('#hoNo').onclick = closeModal;
  $('#hoOk').onclick = () => {
    const list = [...chosen].map(id => objs.find(o => o.id === id)).filter(Boolean); if (!list.length) return;
    const sheet = $('#hoSheet') && $('#hoSheet').checked, snap = snapshot(list);
    give(list, u, locPicked());
    closeModal(); queueServerSave(); render();
    toastUndo(`${list.length === 1 ? list[0].name : `${list.length} devices`} handed out to ${u.name}`, () => { restoreSnapshot(snap, 'Handing out undone'); queueServerSave(); render(); });
    if (sheet) sheetModal(u);
  };
  draw(); $('#hsQ').focus();
}
