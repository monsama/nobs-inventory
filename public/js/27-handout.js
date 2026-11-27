/* Handing devices out and taking them back, in one step each. Hand out: a person (found by name, or added on the spot),
   the device is then in use with them; an admin can print the entry sheet right after. Take back: the device is in
   stock again, with nobody. Both with Undo, and in the device's history. */
import { fold, $, LOCS, byId, feedLinked, hist, markHand, now, objs, pfxOf, pickHand, rels, restoreSnapshot, snapshot, st, toast, toastUndo } from './01-core.js';
import { PORT_KINDS } from './relations.js';
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
/* One device into stock, as Take back does it (a synced device keeps nobody and the room from the next sync); room ''
   leaves it where it is. true when it moved. */
export function intoStock(o, room = ''){
  o.uid = null; delete o.hotdesk; o.status = 'stock'; delete o.stockAuto; keepUser(o);
  return moveTo(o, room);
}
function give(list, u, loc = ''){
  /* Done with: no longer picked, so no later bulk action reaches them out of sight. */
  if (st.bulk) for (const o of list) st.bulk.delete(o.id);
  for (const o of list){
    const was = o.user;
    delete o.hotdesk; o.uid = u.id; o.status = 'active'; delete o.stockAuto; keepUser(o);
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
/* "Where it is now", with the room: the device's, or the one all of them are in. */
const hereText = list => { const rooms = [...new Set(list.map(o => o.loc || ''))]; return rooms.length === 1 ? `Leave it where it is (${rooms[0] || 'no location'})` : 'Leave each where it is'; };
/* Where the devices go: where they are (the default), or a room; the one marked "office" is the person's. */
const locField = (id = 'hoLoc', office = '', now = 'Where it is now') => html`<label for="${id}" class="ho-l">Where</label><select id="${id}"><option value="" data-now="${now}">${now}</option>${LOCS.map(l => html`<option value="${l}">${l}${l === office ? ' (their office)' : ''}</option>`)}</select>`;
const locPicked = (id = 'hoLoc') => { const v = ($('#' + id) && $('#' + id).value) || ''; return v === PICK ? '' : v; };
/* The first choice of Where for devices in a store room: nothing yet, so a room or Leave it there is picked on purpose. */
const PICK = '__pick';
/* A person picked: their office room is proposed, unless a room was chosen already. */
const proposeOffice = u => {
  const sel = $('#hoLoc'), room = officeRoom(u); if (!sel) return;
  for (const o of sel.options) if (o.value !== PICK) o.textContent = o.value ? o.value + (o.value === room ? ' (their office)' : '') : (o.dataset.now || 'Where it is now');
  /* In a store room, Leave it there ('') is a choice: only Pick where it goes is none. A room picked by hand is kept. */
  const start = sel.querySelector(`option[value="${PICK}"]`) ? PICK : '', none = sel.value === start;
  sel.onchange = () => { delete sel.dataset.auto; };
  /* Only a room still in the list (the store room the device is in is said by Leave it there instead). */
  const listed = room && [...sel.options].some(o => o.value === room);
  if (listed && (none || sel.dataset.auto)){ sel.value = room; sel.dataset.auto = '1'; }
  else if (!listed && sel.dataset.auto){ sel.value = start; delete sel.dataset.auto; }
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
  /* The store rooms of the devices' own sites first. */
  const own = new Set(live.map(storeOfSite).filter(Boolean));
  const stores = [...new Set(Object.values(st.stockRooms || {}))].filter(l => LOCS.includes(l)).sort((a, b) => +own.has(b) - +own.has(a) || a.localeCompare(b));
  /* The switch ports they are plugged into: offered to free, ticked (a device in stock is on no port). */
  const plugs = rels.filter(r => live.some(o => o.id === r.from) && PORT_KINDS.includes(r.kind) && byId(r.to));
  /* Devices of several sites, each with a store room: each goes to its own, proposed. */
  const eachStore = sites.size > 1 && live.every(o => storeOfSite(o));
  const others = LOCS.filter(l => !stores.includes(l));
  const opt = l => html`<option value="${l}">${l}</option>`;
  modal(html`<div class="mh">Take back ${live.length === 1 ? live[0].name : `${live.length} devices`}</div><div class="mb">
    <label for="tbLoc" class="ho-l">Where</label><select id="tbLoc"><option value="">${stay}</option>${eachStore ? html`<option value="${EACH_STORE}">Each to its site's store room</option>` : ''}${stores.length
      ? html`<optgroup label="Store rooms">${stores.map(opt)}</optgroup><optgroup label="Other rooms">${others.map(opt)}</optgroup>` : LOCS.map(opt)}</select>
    ${site && !store && isAdmin() ? html`<label class="pchk tb-store" id="tbStoreRow" hidden><input type="checkbox" id="tbStore" checked> Make it the store room of ${site}: proposed here from now on</label>
      <p class="note muted" id="tbNoStore">${site} has no store room yet: pick the room where devices in stock are kept.</p>` : ''}
    ${plugs.length ? html`<label class="pchk"><input type="checkbox" id="tbUnplug" checked> Unplug ${plugs.length === 1 ? `it from ${byId(plugs[0].to).name}${plugs[0].port != null ? ' port ' + pfxOf(byId(plugs[0].to)) + plugs[0].port : ''}` : `them from their ${plugs.length} ports`}, so the port is free</label>` : ''}
    <p class="note">${live.length === 1 ? 'It is' : 'They are'} in stock from now on, with nobody.</p></div>
    <div class="mf"><button id="tbNo">Cancel</button><button id="tbOk" class="primary">Take back</button></div>`, 'sm');
  if (eachStore) $('#tbLoc').value = EACH_STORE;
  else if (last && LOCS.includes(last)) $('#tbLoc').value = last;
  /* A site without a store room: a room of that site picked here can become its store room (Settings → Locations). */
  const fitStore = () => { const row = $('#tbStoreRow'); if (!row) return; const l = $('#tbLoc').value, ok = !!l && l.startsWith(site + ' / '); row.hidden = !ok; $('#tbNoStore').hidden = ok; };
  $('#tbLoc').addEventListener('change', fitStore); fitStore();
  $('#tbNo').onclick = closeModal;
  $('#tbOk').onclick = () => {
    const loc = locPicked('tbLoc');
    const row = $('#tbStoreRow');
    if (row && !row.hidden && $('#tbStore').checked && loc){ st.stockRooms = { ...(st.stockRooms || {}), [site]: loc }; queueServerSave(); }
    try { if (loc && loc !== EACH_STORE) localStorage.setItem(STOCK_ROOM, loc); } catch { /* not kept: proposed again next time */ }
    const un = $('#tbUnplug') && $('#tbUnplug').checked ? plugs : [];
    closeModal(); takeBack(live, loc, un);
  };
  $('#tbOk').focus();
}
/* Takes the devices back into stock: no person, status stock, moved to loc when one is given, with a history line
   each. Saves, draws the page again and offers Undo. */
/* loc: one room for all, or EACH_STORE: each to the store room of its own site (Settings → Locations), else where it is. */
export const EACH_STORE = '__eachstore';
const storeOfSite = o => { const sr = st.stockRooms || {}, r = sr[String(o.loc || '').split(' / ')[0]]; return r && LOCS.includes(r) ? r : ''; };
export function takeBack(list, loc = '', unplug = []){
  const live = list.filter(o => o.status !== 'retired');
  if (!live.length) return;
  const snap = snapshot(live), names = new Set(live.map(o => o.user).filter(Boolean)), relsWas = [...rels];
  for (const r of unplug){ const i = rels.indexOf(r); if (i < 0) continue; rels.splice(i, 1); const d = byId(r.from), sw = byId(r.to); if (d && sw) hist(d, now(), `Unplugged from ${sw.name}${r.port != null ? ' port ' + pfxOf(sw) + r.port : ''}: taken back, by ${who()}`); }
  if (st.bulk) for (const o of live) st.bulk.delete(o.id);
  for (const o of live){
    const had = o.user, to = loc === EACH_STORE ? storeOfSite(o) : loc;
    o.uid = null; delete o.hotdesk; o.status = 'stock'; delete o.stockAuto; keepUser(o);
    const moved = moveTo(o, to);
    hist(o, now(), `Taken back into stock${had ? ` from ${had}` : ''}${moved ? `, to ${to}` : ''} by ${who()}`);
  }
  queueServerSave(); render();
  toastUndo(`${live.length === 1 ? live[0].name : `${live.length} devices`} back in stock${names.size === 1 ? ` from ${[...names][0]}` : ''}`, () => { restoreSnapshot(snap, 'Taking back undone'); for (const r of relsWas) if (!rels.includes(r)) rels.push(r); queueServerSave(); render(); });
}

/* The people to choose from: active ones first, by name; the search finds by name, login or department. */
const SHOWN = 8;
/* The sign-in account the app makes at first start (u-admin, "Administrator") is nobody to hand devices to: left out,
   unless it holds devices already. */
const signInOnly = u => u.id === 'u-admin' && !objs.some(o => o.uid === u.id);
const people = q => USERS.filter(u => !signInOnly(u) && (u.active !== false || q) && (!q || [u.name, u.login, u.dept].some(x => low(x).includes(q) || fold(x).includes(fold(q)))))   /* "schar" finds Schär */
  .sort((a, b) => +(a.active === false) - +(b.active === false) || a.name.localeCompare(b.name));

/* Hand out the devices (ids) to a person picked here. */
export function handOutModal(ids){
  const list = ids.map(id => objs.find(o => o.id === id)).filter(o => o && o.status !== 'retired');
  if (!list.length) return;
  let picked = null;
  modal(html`<div class="mh">Hand out ${list.length === 1 ? list[0].name : `${list.length} devices`}</div><div class="mb">
    <label for="hoQ" class="ho-l">To whom</label><input id="hoQ" autocomplete="off" placeholder="Name, login or department">
    <div id="hoList" class="ho-list" role="listbox" aria-label="People"></div>
    ${locField('hoLoc', '', hereText(list))}
    ${SERVER.on && isAdmin() ? html`<label class="pchk ho-sheet"><input type="checkbox" id="hoSheet"> Then make the entry sheet</label>` : ''}
    <p class="note" id="hoSays">${list.length === 1 ? 'The device is' : 'The devices are'} in use with the person from now on.</p></div>
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
  if (inStore){
    const sel = /** @type {HTMLSelectElement} */ ($('#hoLoc')), o0 = sel.options[0], rooms = new Set(list.map(o => o.loc));
    o0.textContent = o0.dataset.now = rooms.size > 1 ? `Leave them in their store rooms (${rooms.size})` : `Leave ${list.length > 1 ? 'them' : 'it'} in the store room (${inStore})`;
    const pick = document.createElement('option'); pick.value = PICK; pick.disabled = true; pick.textContent = `Pick where ${list.length === 1 ? 'it goes' : 'they go'}`;
    sel.prepend(pick); sel.value = PICK;
    /* Leave it in the store room says it: the same room again in the list would only repeat it. */
    if (rooms.size === 1) for (const op of [...sel.options]) if (op.value === inStore) op.remove();
  }
  const ok0 = $('#hoOk').onclick;
  $('#hoOk').onclick = e => {
    if (inStore && picked && $('#hoLoc').value === PICK){
      $('#hoLoc').classList.add('bad'); $('#hoLoc').focus();
      $('#hoLoc').addEventListener('change', () => $('#hoLoc').classList.remove('bad'), { once: true });
      $('#hoSays').innerHTML = String(html`<span class="ho-warn">${list.length === 1 ? 'It is' : 'They are'} in ${new Set(list.map(o => o.loc)).size > 1 ? 'their store rooms' : `the store room ${inStore}`}: pick where ${list.length === 1 ? 'it goes' : 'they go'}, or Leave ${list.length === 1 ? 'it' : 'them'} in the store room.</span>`);
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
    /* From the stock: where it goes is asked, as on the device (left as it is, it would be in use in the store room). */
    const stores = new Set(Object.values(st.stockRooms || {}));
    if (!locPicked() && list.some(o => o.loc && stores.has(o.loc))){
      $('#hoLoc').classList.add('bad'); $('#hoLoc').focus();
      $('#hoLoc').addEventListener('change', () => $('#hoLoc').classList.remove('bad'), { once: true });
      toast(`${list.length === 1 ? 'It is' : 'They are'} in a store room: pick where ${list.length === 1 ? 'it goes' : 'they go'} under Where.`); return;
    }
    const sheet = $('#hoSheet') && $('#hoSheet').checked, snap = snapshot(list);
    give(list, u, locPicked());
    closeModal(); queueServerSave(); render();
    toastUndo(`${list.length === 1 ? list[0].name : `${list.length} devices`} handed out to ${u.name}`, () => { restoreSnapshot(snap, 'Handing out undone'); queueServerSave(); render(); });
    if (sheet) sheetModal(u);
  };
  draw(); $('#hsQ').focus();
}
