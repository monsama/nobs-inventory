/* Settings → Locations, the sites and their rooms as one list with a detail beside it (as Device types): pick a site or
   a room on the left; on the right its name, its devices, whether it is the site's store room, the floor plan areas
   that show it, and the names the sources (AD, Lansweeper, a user's office) give it, as chips. A room that is no longer
   needed is merged into another: its devices, names and plan areas go along, so no device is left without a place.
   The data stays as it is: rooms are "Site / Room" (LOCS), the names their mapping (st.locMap), store rooms
   st.stockRooms. */
import { $, LOCS, SITES, PLANS, objs, st, hist, now, toast, toastUndo } from './01-core.js';
import { queueServerSave, render } from './07-render.js';
import { isAdmin, who } from './04-settings.js';
import { html } from './html.js';
import { siteOf, renameLoc, renameSite, renamePlaceRefs, renderSetLocs, locMapAll, newTexts, textCount, useAdLoc, roomPart } from './settings-network.js';

const lc = v => String(v || '').trim().toLowerCase();
/* What is open on the right: a site or a room, kept while the page is drawn again. */
let sel = /** @type {{site?: string, room?: string}} */ ({});
let find = '';
export const placeSelect = s => { sel = s; };
/* Drawn again with the focus back on the control used (or the one given), not at the top of the dialog. */
const again = (...picks) => { renderSetLocs(); for (const q of picks){ const el = /** @type {HTMLElement|null} */ (q && document.querySelector(q)); if (el){ el.focus(); return; } } };
const pickSel = sel_ => `[data-plsel="${CSS.escape(sel_)}"]`;

const roomsOf = site => LOCS.filter(l => siteOf(l) === site && l.includes(' / ')).sort((a, b) => a.localeCompare(b));
const devicesIn = room => objs.filter(o => o.loc === room);
const namesOf = room => Object.entries(locMapAll()).filter(([, r]) => r === room).map(([t]) => t);
/* The plan areas that show a room: one given the room, or one named like it on a plan of its site. */
/* Wall outlets or inventory checks that name the room: it is merged, not deleted, so they keep a room. */
const usedElsewhere = room => objs.some(o => Object.values(o.outlets || {}).some(x => x && x.loc === room)) || (st.stocktakes || []).some(t => t && t.scope === room);
const areasOf = room => PLANS.flatMap(p => (p.areas || []).filter(a => a.room === room || (!a.room && `${p.site} / ${a.name}` === room)).map(a => ({ id: p.id, plan: p.name || p.site, area: a.name })));

function current(){
  if (sel.room && LOCS.includes(sel.room)) return sel;
  if (sel.site && SITES.includes(sel.site)) return sel;
  sel = SITES.length ? { site: SITES[0] } : {};
  return sel;
}

function treeHtml(){
  const ed = isAdmin(), cur = current(), q = lc(find);
  const hit = l => !q || lc(l).includes(q) || namesOf(l).some(t => lc(t).includes(q));
  const sites = SITES.filter(x => !q || lc(x).includes(q) || roomsOf(x).some(hit));
  const item = (key, label, n, cls, title = '') => html`<li><button type="button" class="lc-it ${cls}${(cur.room ? 'room:' + cur.room : 'site:' + cur.site) === key ? ' on' : ''}" data-plsel="${key}" title="${title}" aria-current="${String((cur.room ? 'room:' + cur.room : 'site:' + cur.site) === key)}"><span class="lc-nm">${label}</span><span class="lc-n">${n}</span></button></li>`;
  return html`<div class="lc-side">
    <input type="search" id="plFind" value="${find}" placeholder="Find a site, room or source name" aria-label="Find a site or room">
    <ul class="lc-tree" aria-label="Sites and rooms">${sites.length ? sites.map(x => html`${item('site:' + x, x, objs.filter(o => siteOf(o.loc) === x).length, 'lc-site')}
      ${roomsOf(x).filter(hit).length ? html`<li><ul class="lc-rooms">${roomsOf(x).filter(hit).map(l => item('room:' + l, roomPart(l), devicesIn(l).length, 'lc-room', l))}</ul></li>` : ''}`) : html`<li class="muted lc-none">${SITES.length ? 'Nothing found.' : 'No sites yet. Add the first one below.'}</li>`}</ul>
    <div class="lc-add">
      <div class="lpanel-add"><input id="nsName" placeholder="New site, e.g. Branch office" aria-label="New site" ${ed ? '' : 'disabled'}><button id="nsAdd" ${ed ? '' : 'disabled'}>Add site</button></div>
      <p class="note lnote" id="nsMsg">A site is a town or a building.</p>
      <div class="lpanel-add"><select id="nlSite" aria-label="Site for the new room" ${ed && SITES.length ? '' : 'disabled'}>${SITES.map(x => html`<option ${(cur.site || siteOf(cur.room)) === x ? 'selected' : ''}>${x}</option>`)}</select><input id="nlRoom" placeholder="New room, e.g. Lager" aria-label="New room" ${ed && SITES.length ? '' : 'disabled'}><button id="nlAdd" ${ed && SITES.length ? '' : 'disabled'}>Add room</button></div>
      <p class="note lnote" id="nlMsg">${SITES.length ? 'Each room belongs to one site.' : 'Add a site first.'}</p>
    </div></div>`;
}

function siteHtml(site){
  const ed = isAdmin(), rooms = roomsOf(site), n = objs.filter(o => siteOf(o.loc) === site).length, whole = objs.filter(o => o.loc === site).length;
  const store = (st.stockRooms || {})[site] || '';
  const why = [n ? `${n} ${n === 1 ? 'device' : 'devices'}` : '', rooms.length ? `${rooms.length} ${rooms.length === 1 ? 'room' : 'rooms'}` : ''].filter(Boolean).join(' and ');
  return html`<div class="lc-detail" data-plsite="${site}">
    <div class="lc-head"><label class="sr-only" for="plSiteName">Site name</label><input id="plSiteName" class="lc-title" value="${site}" ${ed ? '' : 'disabled'}>
      <span class="muted">${rooms.length} ${rooms.length === 1 ? 'room' : 'rooms'} · ${n} ${n === 1 ? 'device' : 'devices'}</span></div>
    <div class="lc-rows">
      <div class="lc-row"><span>Store room</span><select data-stock="${site}" aria-label="Store room of ${site}" ${ed && rooms.length ? '' : 'disabled'}><option value="">None</option>${rooms.map(l => html`<option value="${l}" ${store === l ? 'selected' : ''}>${roomPart(l)}</option>`)}</select><small class="muted">Taking a device back into stock proposes it.</small></div>
      ${whole ? html`<div class="lc-row"><span>Whole site</span><span>${whole} ${whole === 1 ? 'device has' : 'devices have'} this site but no room.</span><button type="button" class="mini" data-plshow="${site}">Show them</button></div>` : ''}
    </div>
    ${ed ? html`<div class="lc-foot"><button type="button" class="danger-text" id="plSiteDel" ${why ? html`disabled title="It still has ${why}"` : ''}>Delete site</button>${why ? html`<small class="muted">A site can be deleted once it has no rooms and no devices.</small>` : ''}</div>` : ''}
  </div>`;
}

function roomHtml(room){
  const ed = isAdmin(), site = siteOf(room), devs = devicesIn(room), names = namesOf(room), areas = areasOf(room);
  const isStore = (st.stockRooms || {})[site] === room, free = newTexts();
  const others = LOCS.filter(l => l !== room && l.includes(' / ')).sort((a, b) => a.localeCompare(b));
  return html`<div class="lc-detail" data-plroom="${room}">
    <div class="lc-head"><label class="sr-only" for="plRoomName">Room name</label><input id="plRoomName" class="lc-title" value="${roomPart(room)}" ${ed ? '' : 'disabled'}>
      <label class="sr-only" for="plRoomSite">Site</label><select id="plRoomSite" ${ed && SITES.length > 1 ? '' : 'disabled'}>${SITES.map(x => html`<option ${x === site ? 'selected' : ''}>${x}</option>`)}</select></div>
    <div class="lc-rows">
      <div class="lc-row"><span>Devices</span><span>${devs.length ? `${devs.length} ${devs.length === 1 ? 'device' : 'devices'}` : 'None yet'}</span>${devs.length ? html`<button type="button" class="mini" data-plshow="${room}">Show them</button>` : ''}</div>
      <div class="lc-row"><span>Store room</span><label class="switch" title="${isStore ? `The store room of ${site}` : `Make it the store room of ${site}`}"><input type="checkbox" id="plStore" ${isStore ? 'checked' : ''} ${ed ? '' : 'disabled'} aria-label="${`The store room of ${site}`}"><span aria-hidden="true"></span></label><small class="muted">${isStore ? `Devices taken back into stock in ${site} go here.` : 'Where devices taken back into stock go.'}</small></div>
      <div class="lc-row"><span>Floor plan</span><span>${areas.length ? areas.map((a, i) => html`${i ? ', ' : ''}<button type="button" class="link" data-plopen="${a.id}" title="Open the plan">${a.plan} › ${a.area}</button>`) : html`<span class="muted">${PLANS.some(p => p.site === site) ? 'Not on a plan yet' : `${site} has no floor plan`}</span>`}</span>${ed && PLANS.some(p => p.site === site) ? html`<button type="button" class="mini" id="plDraw" title="Opens the plan of ${site}; the area you draw is this room">Draw on plan…</button>` : ''}</div>
      <div class="lc-row lc-names"><span>Names in the sources</span><span class="lc-chips">
        ${names.length ? names.map(t => html`<span class="chip lc-chip" title="${`${textCount(t)} ${textCount(t) === 1 ? 'device says' : 'devices say'} so now`}">${t}${ed ? html`<button type="button" class="lc-x" data-plunname="${t}" aria-label="${`Remove the name ${t}`}" title="Remove: devices keep their location">×</button>` : ''}</span>`) : html`<span class="muted">None: a source text of exactly “${roomPart(room)}” or “${room}” is taken as this room</span>`}
        ${ed && free.length ? html`<select id="plAddName" aria-label="${`Add a name from the sources to ${room}`}"><option value="">+ Add a name from the sources…</option>${free.map(e => html`<option value="${e.text}">${e.text} (${e.n})</option>`)}</select>` : ''}</span></div>
    </div>
    ${ed ? html`<div class="lc-foot">${!devs.length && !areas.length && !usedElsewhere(room) ? html`<button type="button" class="danger-text" id="plRoomDel">Delete room</button>` : ''}
      ${others.length ? html`<label class="lc-merge">Merge into<select id="plMerge" aria-label="${`Merge ${room} into`}"><option value="">a room…</option>${others.map(l => html`<option value="${l}">${l}</option>`)}</select></label><small class="muted">Its devices, names and plan areas go along; one Undo.</small>` : ''}</div>` : ''}
  </div>`;
}

export function placesHtml(){
  const cur = current();
  return html`<section class="panelbox locpanel lc-panel"><div class="hdr">Sites and rooms <span class="cnt">${SITES.length} ${SITES.length === 1 ? 'site' : 'sites'} · ${LOCS.filter(l => l.includes(' / ')).length} rooms</span></div>
    <div class="lc-split">${treeHtml()}${cur.room ? roomHtml(cur.room) : cur.site ? siteHtml(cur.site) : html`<div class="lc-detail"><p class="muted">Add a site to start: a town or a building. Then its rooms.</p></div>`}</div></section>`;
}

/* What a merge or a delete changes beside the devices: the names in the sources, store rooms, saved views' filter,
   outlets and inventory checks. Taken before and after it, the Undo puts back only what it changed, so changes made
   since (another name, another view) stay. */
function refsNow(){
  return { locMap: { ...(st.locMap || {}) }, adLocMap: st.adLocMap ? { ...st.adLocMap } : null, stockRooms: { ...(st.stockRooms || {}) },
    views: new Map((st.savedViews || []).filter(v => v && v.id).map(v => [v.id, v.filters && v.filters.loc])),
    outlets: objs.flatMap(o => Object.entries(o.outlets || {}).map(([port, x]) => [o, port, x && x.loc])),
    checks: (st.stocktakes || []).map(t => [t, t && t.scope]) };
}
function undoRefs(b, a){
  const back = (k, bm, am) => { if (!bm && !am) return; const cur = { ...(st[k] || {}) };
    for (const key of new Set([...Object.keys(bm || {}), ...Object.keys(am || {})])) if ((bm || {})[key] !== (am || {})[key]){ if (bm && key in bm) cur[key] = bm[key]; else delete cur[key]; }
    st[k] = cur; };
  back('locMap', b.locMap, a.locMap); back('adLocMap', b.adLocMap, a.adLocMap); back('stockRooms', b.stockRooms, a.stockRooms);
  if (Array.isArray(st.savedViews)) st.savedViews = st.savedViews.map(v => v && v.id && b.views.has(v.id) && b.views.get(v.id) !== a.views.get(v.id) ? { ...v, filters: { ...v.filters, loc: b.views.get(v.id) } } : v);
  for (const [o, port, was] of b.outlets){ const x = o.outlets && o.outlets[port]; if (x && a.outlets.some(([o2, p2, now]) => o2 === o && p2 === port && now !== was)) x.loc = was; }
  for (const [t, was] of b.checks){ const now = a.checks.find(([t2]) => t2 === t); if (now && now[1] !== was) t.scope = was; }
}
/* A room merged into another: its devices (each with a history line), its names in the sources, its plan areas, the
   store room and saved views follow; the room goes. One Undo puts all of it back. */
export function mergeLoc(old, into){
  if (!old || !into || old === into || !LOCS.includes(into)) return;
  const before = refsNow(), at = LOCS.indexOf(old), filt = st.loc;
  const moved = devicesIn(old), areas = [];
  for (const o of moved){ o.loc = into; hist(o, now(), `Room ${old} merged into ${into} by ${who()}`); }
  for (const p of PLANS) for (const a of p.areas || []) if (a.room === old || (!a.room && `${p.site} / ${a.name}` === old)){ areas.push([a, a.room]); a.room = into; }
  renamePlaceRefs(l => l === old ? into : l);
  LOCS.splice(LOCS.indexOf(old), 1);
  if (st.loc === old) st.loc = into;
  const after = refsNow();
  sel = { room: into };
  queueServerSave(); renderSetLocs(); render();
  toastUndo(`${old} merged into ${into}${moved.length ? ` · ${moved.length} ${moved.length === 1 ? 'device' : 'devices'}` : ''}`, () => {
    if (!LOCS.includes(old)) LOCS.splice(Math.min(at, LOCS.length), 0, old);
    undoRefs(before, after); if (st.loc === into && filt === old) st.loc = old;
    for (const o of moved) if (o.loc === into){ o.loc = old; hist(o, now(), `Merge into ${into} undone by ${who()}`); }
    for (const [a, r] of areas){ if (r) a.room = r; else delete a.room; }
    sel = { room: old };
    queueServerSave(); renderSetLocs(); render();
  });
}

export function bindPlaces(root){
  const cur = current();
  root.querySelectorAll('[data-plsel]').forEach(b => b.onclick = () => {
    const v = b.dataset.plsel, at = v.indexOf(':');
    sel = v.slice(0, at) === 'room' ? { room: v.slice(at + 1) } : { site: v.slice(at + 1) };
    renderSetLocs(); /** @type {HTMLElement|null} */ (document.querySelector(`[data-plsel="${CSS.escape(v)}"]`))?.focus();
  });
  const f = $('#plFind'); if (f) f.oninput = () => { find = f.value; const at = f.selectionStart; renderSetLocs(); const g = /** @type {HTMLInputElement|null} */ ($('#plFind')); if (g){ g.focus(); g.setSelectionRange(at, at); } };
  root.querySelectorAll('[data-plopen]').forEach(b => b.onclick = async () => { const { closeModal } = await import('./19-modal.js'), pl = await import('./20-plans.js'); closeModal(); pl.openPlan(b.dataset.plopen); });
  root.querySelectorAll('[data-plshow]').forEach(b => b.onclick = async () => {
    const { resetFilters } = await import('./02-views.js'), { closeModal } = await import('./19-modal.js');
    closeModal(); resetFilters(); st.scope = null; st.loc = b.dataset.plshow; st.tab = st.tab in { cards: 1, table: 1 } ? st.tab : 'cards'; render();
  });
  root.querySelectorAll('[data-stock]').forEach(s => s.onchange = () => {
    const next = { ...(st.stockRooms || {}) };
    if (s.value) next[s.dataset.stock] = s.value; else delete next[s.dataset.stock];
    st.stockRooms = next; queueServerSave(); toast(s.value ? `Store room of ${s.dataset.stock}: ${s.value}` : `${s.dataset.stock} has no store room`);
  });
  if (cur.site && !cur.room){
    const nm = $('#plSiteName'); if (nm) nm.onchange = () => { const v = nm.value.trim(); renameSite(cur.site, v); if (SITES.includes(v)) sel = { site: v }; again('#plSiteName'); };
    const del = $('#plSiteDel'); if (del) del.onclick = () => {
      const i = SITES.indexOf(cur.site); if (i < 0) return;
      if (st.adLocAuto === cur.site) st.adLocAuto = '';
      SITES.splice(i, 1); sel = {}; queueServerSave(); toast('Site deleted'); render(); again('#plFind');
    };
  }
  if (cur.room){
    const room = cur.room, site = siteOf(room);
    const go = (name, focus) => { if (renameLoc(room, name)) sel = { room: name }; again(focus); };
    const nm = $('#plRoomName'); if (nm) nm.onchange = () => go(site + ' / ' + nm.value.trim(), '#plRoomName');
    const ss = $('#plRoomSite'); if (ss) ss.onchange = () => go(ss.value + ' / ' + roomPart(room), '#plRoomSite');
    const store = $('#plStore'); if (store) store.onchange = () => {
      const was = st.stockRooms, next = { ...(st.stockRooms || {}) };
      if (store.checked) next[site] = room; else delete next[site];
      st.stockRooms = next; queueServerSave(); again('#plStore');
      toastUndo(store.checked ? `${room} is the store room of ${site}` : `${site} has no store room`, () => { st.stockRooms = was; queueServerSave(); renderSetLocs(); });
    };
    root.querySelectorAll('[data-plunname]').forEach(b => b.onclick = () => {
      const t = b.dataset.plunname, before = st.locMap, adBefore = st.adLocMap;
      /* After it, the focus on the next name's ×, else the one before, else Add a name. */
      const all = [...root.querySelectorAll('[data-plunname]')].map(x => /** @type {HTMLElement} */ (x).dataset.plunname), k = all.indexOf(t);
      const near = [all[k + 1], all[k - 1]].filter(Boolean).map(x => `[data-plunname="${CSS.escape(x)}"]`);
      const drop = m => m && Object.fromEntries(Object.entries(m).filter(([k]) => lc(k) !== lc(t)));
      st.locMap = drop(st.locMap) || {}; if (st.adLocMap) st.adLocMap = drop(st.adLocMap);
      queueServerSave(); again(...near, '#plAddName', '#plRoomName');
      toastUndo(`“${t}” is no longer ${roomPart(room)}; devices keep their location`, () => { st.locMap = before; st.adLocMap = adBefore; queueServerSave(); renderSetLocs(); });
    });
    const add = $('#plAddName'); if (add) add.onchange = () => { if (!add.value) return; const t = add.value; useAdLoc(t, room, `“${t}” is ${room}`); again('#plAddName', `[data-plunname="${CSS.escape(t)}"]`); };
    const del = $('#plRoomDel'); if (del) del.onclick = () => {
      const i = LOCS.indexOf(room); if (i < 0) return;
      const before = refsNow(), filt = st.loc;
      renamePlaceRefs(l => l === room ? '' : l);
      st.locMap = Object.fromEntries(Object.entries(st.locMap || {}).filter(([, r]) => r)); if (st.adLocMap) st.adLocMap = Object.fromEntries(Object.entries(st.adLocMap).filter(([, r]) => r));
      if (st.stockRooms) st.stockRooms = Object.fromEntries(Object.entries(st.stockRooms).filter(([, r]) => r));
      const after = refsNow();
      LOCS.splice(i, 1); if (st.loc === room) st.loc = null; sel = { site }; queueServerSave(); render(); again(pickSel('site:' + site));
      toastUndo(`${room} deleted`, () => { if (!LOCS.includes(room)) LOCS.splice(Math.min(i, LOCS.length), 0, room); undoRefs(before, after); if (!st.loc && filt === room) st.loc = room; sel = { room }; queueServerSave(); renderSetLocs(); render(); });
    };
    const mg = $('#plMerge'); if (mg) mg.onchange = () => { if (!mg.value) return; const into = mg.value; mergeLoc(room, into); /** @type {HTMLElement|null} */ (document.querySelector(pickSel('room:' + into)))?.focus(); };
    const dr = $('#plDraw'); if (dr) dr.onclick = async () => { const { closeModal } = await import('./19-modal.js'), pl = await import('./20-plans.js'); closeModal(); pl.drawRoomOnPlan(room); };
  }
}
