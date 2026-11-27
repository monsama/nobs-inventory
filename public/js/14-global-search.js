/* The search at the top: always through everything, whatever the filters on the left or the tab say.
   It finds devices (racks too), actions (New device, Back up now, the views), people, contacts, contracts, rooms, saved
   views and settings, and lists them under the field, grouped; a hit opens where it
   lives. On a list (Cards, Table, Relationships) it filters that list too as one types. Ctrl+K (Cmd+K) puts the cursor here from anywhere. */
import { fold, typeText, $, COSTS, CONTACTS, LOCS, REVIEW, REVIEW_SRC, STATUS, matchesQ, objs, st, tico } from './01-core.js';
import { USERS, isAdmin } from './04-settings.js';
import { settingHits, openSetting } from './settings-find.js';
import { newObjModal } from './05-new-object.js';
import { importCsvModal } from './views-csv.js';
import { clearConfirm } from './server-save.js';
import { handOutToModal, signInOnly } from './27-handout.js';
import { openObj, tabAllowed } from './02-views.js';
import { render } from './07-render.js';
import { showDevicesOf } from './settings-users.js';
import { restoreView } from './views-saved.js';
import { html, rawHtml } from './html.js';

const MAX = { dev: 8, other: 4 };
const box = $('#search'), list = $('#gsList');
/* On a phone there is no Ctrl+K: the hint would only cut the placeholder short. */
if (window.matchMedia && matchMedia('(max-width:760px)').matches) box.placeholder = 'Search…';
let items = [], active = -1;

/* Small line icons in the style of the type icons. */
const ico = d => html`<span class="tico sm gs-ico" aria-hidden="true"><svg class="i" viewBox="0 0 24 24"><path d="${d}"/></svg></span>`;
const ICON = { person: ico('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'), contact: ico('M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z'),
  contract: ico('M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6'), view: ico('M4 5h16M7 12h10M10 19h4'), room: ico('M3 11l9-7 9 7v10H3zM9 21v-6h6v6'),
  action: ico('M13 3 4 14h7l-1 7 9-11h-7z'),
  setting: ico('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.4-1.4M5.6 18.4 7 17M17 17l1.4 1.4M5.6 5.6 7 7') };
/* Accents left out or written out (fold): "zurich buro" finds Zürich / Büro, "muller" Müller. */
const has = (q, ...vals) => { const f = fold(q); return vals.some(v => v && (String(v).toLowerCase().includes(q) || fold(v).includes(f))); };
/* Every word typed, in any order, found in the values together: "keller anna" finds Anna Keller. */
const hasWords = (q, ...vals) => { const raw = vals.filter(Boolean).join(' ').toLowerCase(), text = fold(raw); return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => raw.includes(w) || text.includes(fold(w))); };
const row = (i, icon, main, sub) => html`<li role="option" id="gs${i}" data-i="${i}" aria-selected="false">${icon}<span class="gs-main">${main}</span>${sub ? html`<span class="gs-sub">${sub}</span>` : ''}</li>`;

/* The actions: [name, other words, for admins only, what it does]. The views of the tab bar are actions too. */
const TAB_OF = new Map();
const goTab = t => { const go = () => { st.tab = t; render(); }; TAB_OF.set(go, t); return go; };
const ACTIONS = [
  ['New device…', 'add create device object', true, () => newObjModal()],
  ['Import devices from a CSV file…', 'csv import upload excel spreadsheet', true, () => importCsvModal()],
  ['Back up now', 'backup save copy snapshot', true, () => { openSetting('backups'); requestAnimationFrame(() => { const b = $('#bkNew'); if (b) b.click(); }); }],
  ['Clear inventory…', 'delete all devices start again empty', true, () => clearConfirm()],
  ['Start an inventory check', 'stocktake count audit verify', true, goTab('stocktake')],
  ['Go to the Overview', 'dashboard home summary', false, goTab('overview')],
  ['Go to IP addresses', 'ip list addresses static dhcp free', false, goTab('ips')],
  ['Go to Printers', 'printers print server shared usb toner', false, goTab('prn')],
  ['Go to Floor plans', 'plan map building floor', false, goTab('plans')],
  ['Go to Ports', 'switch ports patch network', false, goTab('net')],
  ['Go to Racks', 'rack cabinet units', false, goTab('rack')],
  ['Switch light / dark', 'dark mode light mode theme colours night', false, () => { const t = document.getElementById('themeBtn'); if (t) t.click(); }],
  ['Go to Software', 'software installed licences programs', false, goTab('sw')],
  ['Go to Contracts', 'contracts warranty support costs', false, goTab('contracts')],
  ['Go to Contacts', 'contacts partners supplier', false, goTab('contacts')],
  ['Go to Pending devices', 'review new devices inbox waiting', true, goTab('review')],
];
function actions(q){
  const admin = isAdmin();
  /* A view this person may not open (a viewer limited to their own devices) is not offered. */
  const list = ACTIONS.filter(([l, w, a, go]) => (admin || !a) && (!TAB_OF.has(go) || tabAllowed(TAB_OF.get(go))) && has(q, l, w)).map(([l, , , go]) => ({ label: l, sub: '', go }));
  /* Handing out to a person found by name. */
  if (admin && q.length > 1) for (const u of USERS.filter(x => x.active !== false && !signInOnly(x) && hasWords(q, x.name)).slice(0, 2)) list.push({ label: `Hand out a device to ${u.name}…`, sub: u.dept || '', go: () => handOutToModal(u) });
  return list;
}
/* Every kind of thing the search knows, each with what to show and where it opens. */
function results(q){
  const out = [];
  /* Devices first, those in use before retired ones; the code, name, addresses, serial, user and IDs are searched. */
  const devs = objs.filter(o => o.type !== 'rack' || has(q, o.name, o.code, o.serial, o.model, o.asset)).filter(o => matchesQ(o, q))   /* "huber carla" finds Carla Huber's devices too (matchesQ), as the list does */
    .sort((a, b) => +(a.status === 'retired') - +(b.status === 'retired') || a.name.localeCompare(b.name));
  if (devs.length) out.push(['Devices', devs.length, devs.slice(0, MAX.dev).map(o => ({
    icon: rawHtml(tico(o.type, 'tico sm')), main: o.name,
    sub: [typeText(o), o.ip, (o.loc || '').replace(' / ', ' · '), o.status !== 'active' ? STATUS[o.status].label : ''].filter(Boolean).join(' · '),
    go: () => openObj(o.id) }))]);
  /* Devices a sync found that wait in Pending devices: found here too, marked as such. */
  const waiting = REVIEW.filter(o => !o.review.ignored && matchesQ(o, q));
  if (waiting.length) out.push(['Pending devices', waiting.length, waiting.slice(0, MAX.other).map(o => ({
    icon: rawHtml(tico(o.type, 'tico sm')), main: o.name, sub: ['Pending', REVIEW_SRC[o.review.src], o.ip].filter(Boolean).join(' · '),
    go: () => openObj(o.id) }))]);
  const people = USERS.filter(u => hasWords(q, u.name, u.login, u.dept));
  const owned = new Map(); for (const o of objs) if (o.user && o.status !== 'retired') owned.set(o.user, (owned.get(o.user) || 0) + 1);
  if (people.length) out.push(['People', people.length, people.slice(0, MAX.other).map(u => ({
    icon: ICON.person, main: u.name,
    sub: [u.dept, `${owned.get(u.name) || 0} device${owned.get(u.name) === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
    go: () => showDevicesOf(u.id) }))]);
  /* Things to do and views to go to, by their name or a word for them: New device, Back up now, IP addresses …; after
     the people, so a name typed opens the person first. */
  const acts = actions(q);
  if (acts.length) out.push(['Actions', acts.length, acts.slice(0, MAX.other).map(a => ({ icon: ICON.action, main: a.label, sub: a.sub, go: a.go }))]);
  const contacts = (CONTACTS.list || []).filter(c => has(q, c.name, c.company, c.email, c.phone, c.mobile, c.area));
  if (contacts.length) out.push(['Contacts', contacts.length, contacts.slice(0, MAX.other).map(c => ({
    icon: ICON.contact, main: c.name, sub: [c.company, c.area || c.role].filter(Boolean).join(' · '),
    go: () => { st.q = c.name; st.cnKind = ''; st.tab = 'contacts'; render(); } }))]);
  const contracts = (COSTS.contracts || []).filter(c => has(q, c.name, c.supplier, c.ref));
  if (contracts.length) out.push(['Contracts', contracts.length, contracts.slice(0, MAX.other).map(c => ({
    icon: ICON.contract, main: c.name, sub: [c.supplier, c.ref].filter(Boolean).join(' · '),
    go: () => { st.q = c.name; st.ctDue = false; st.tab = 'contracts'; render(); } }))]);
  /* Licences by name, shown in Software, where their use is counted. */
  const lics = (COSTS.licences || []).filter(l => has(q, l.name));
  if (lics.length) out.push(['Licences', lics.length, lics.slice(0, MAX.other).map(l => ({
    icon: ICON.contract, main: l.name, sub: `Licence · ${l.seats || 0} seat${l.seats === 1 ? '' : 's'}`,
    go: () => { st.tab = 'sw'; render(); } }))]);
  const rooms = LOCS.filter(l => has(q, l) || hasWords(q, l));
  /* In use or in stock, and the retired ones apart: together the number the filters on the left show for the room. */
  const inRoom = new Map(), retiredIn = new Map();
  for (const o of objs) if (o.loc) (o.status === 'retired' ? retiredIn : inRoom).set(o.loc, ((o.status === 'retired' ? retiredIn : inRoom).get(o.loc) || 0) + 1);
  if (rooms.length) out.push(['Rooms', rooms.length, rooms.slice(0, MAX.other).map(l => ({
    icon: ICON.room, main: l.replace(' / ', ' · '), sub: `${inRoom.get(l) || 0} ${inRoom.get(l) === 1 ? 'device' : 'devices'}${retiredIn.get(l) ? ` · ${retiredIn.get(l)} retired` : ''}`,
    go: () => { st.loc = l; st.q = ''; st.person = null; if (!['cards', 'table', 'map', 'plans'].includes(st.tab)) st.tab = 'cards'; render(); } }))]);
  /* Saved views, by name: a hit shows the list as saved. */
  const savedViews = (Array.isArray(st.savedViews) ? st.savedViews : []).filter(v => has(q, v.name));
  if (savedViews.length) out.push(['Views', savedViews.length, savedViews.slice(0, MAX.other).map(v => ({
    icon: ICON.view, main: v.name, sub: 'Saved view',
    go: () => restoreView(v) }))]);
  /* Settings, for an admin: a page or a section in one, found by its name or a word for what it holds. */
  /* Once: a hit an action already gives (by its name, or the view it opens) is left out. */
  const sets = isAdmin() ? settingHits(q).filter(h => !acts.some(a => a.label === h.label || (h.tab && TAB_OF.get(a.go) === h.tab))) : [];
  if (sets.length) out.push(['Settings', sets.length, sets.slice(0, MAX.other).map(h => ({ icon: ICON.setting, main: h.label, sub: h.path, go: h.go }))]);
  /* A name typed ("anna"): the person first, so Enter opens them, not one of their devices. */
  const words = fold(q).split(/\s+/).filter(Boolean);
  const named = people.some(u => words.every(w => fold(u.name).split(/[\s,.-]+/).some(p => p.startsWith(w))));
  const pi = out.findIndex(g => g[0] === 'People');
  if (named && pi > 0) out.unshift(...out.splice(pi, 1));
  return out;
}

/* Draws the hits of the global search for the text typed, under a heading per kind, and marks the first one. */
function show(){
  const q = box.value.trim().toLowerCase();
  items = []; active = -1;
  if (!q){ close(); return; }
  const groups = results(q);
  const hits = [];
  for (const [label, n, rows] of groups){
    hits.push(html`<li class="gs-head" role="presentation">${label}${n > rows.length ? html` <span class="muted">· ${rows.length} of ${n}</span>` : ''}</li>`);
    for (const r of rows){ hits.push(row(items.length, r.icon, r.main, r.sub)); items.push(r); }
  }
  /* On a list the same text filters it too: said once at the top, so a shorter list is no surprise. */
  const note = onList() ? html`<li class="gs-note" role="presentation">Also filters this list · Esc closes these hits and keeps the filter</li>` : '';
  list.innerHTML = html`${note}${hits.length ? hits : html`<li class="gs-none" role="presentation">Nothing found for “${box.value.trim()}”.</li>`}`;
  list.hidden = false;
  box.setAttribute('aria-expanded', 'true');
  if (items.length) mark(0);
}
function close(){ list.hidden = true; list.innerHTML = ''; box.setAttribute('aria-expanded', 'false'); box.removeAttribute('aria-activedescendant'); items = []; active = -1; }
function mark(i){
  list.querySelectorAll('li[data-i]').forEach(li => { const on = +li.dataset.i === i; li.classList.toggle('active', on); li.setAttribute('aria-selected', on ? 'true' : 'false'); });
  active = i;
  const li = list.querySelector(`li[data-i="${i}"]`);
  if (li){ box.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); }
}
function pick(i){
  const r = items[i]; if (!r) return;
  close(); box.value = ''; box.blur();
  if (st.q) st.q = '';
  r.go();
}

box.setAttribute('role', 'combobox'); box.setAttribute('aria-controls', 'gsList'); box.setAttribute('aria-expanded', 'false'); box.setAttribute('aria-autocomplete', 'list');
/* On a list (Cards, Table, Relationships, Floor plans, Software, Contracts, Contacts) the same field also narrows the list
   as one types (st.q): one search field in the whole app, not one per view. Escape closes the hits and keeps the filter;
   a second Escape clears both. */
const LIST = ['cards', 'table', 'map', 'plans', 'ips', 'sw', 'contracts', 'contacts'];
const onList = () => LIST.includes(st.tab);
/* The hits show at once; the list is drawn again once typing pauses (a big Table takes a moment to draw). */
let redraw = 0;
box.addEventListener('input', () => {
  if (onList()){ st.q = box.value; clearTimeout(redraw); redraw = window.setTimeout(flush, 150); }
  show();
});
/* Escape or leaving the field draws the list at once (the filter chip and the browser history then say it). */
export function flushSearch(){ flush(); }
function flush(){ if (!redraw) return; clearTimeout(redraw); redraw = 0; if (onList()) render({ save: false }); }
/* Leaving the field: a moment later, so a click on a tab is not lost to the list being drawn under it (a tab flushes
   first by itself). */
box.addEventListener('blur', () => setTimeout(flush, 200));
/* The field shows the list's filter while on a list, and is empty elsewhere (unless one is typing in it). */
export function syncSearchBox(){
  if (document.activeElement === box) return;
  box.value = onList() ? st.q : '';
}
box.addEventListener('focus', () => { if (box.value.trim()) show(); });
box.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' && items.length){ e.preventDefault(); mark((active + 1) % items.length); }
  else if (e.key === 'ArrowUp' && items.length){ e.preventDefault(); mark((active - 1 + items.length) % items.length); }
  else if (e.key === 'Enter'){ e.preventDefault(); pick(active < 0 ? 0 : active); }
  else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); flush(); if (!list.hidden) close(); else { box.value = ''; box.blur(); if (onList() && st.q){ st.q = ''; render({ save: false }); } } }
});
/* A click on a hit opens it; mousedown keeps the field from losing the focus first, which would close the list. */
list.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (!li) return; e.preventDefault(); pick(+li.dataset.i); });
/* Leaving the field closes the list a moment later (a click on a hit comes first); coming back cancels that, so a
   search typed right after opening a hit is not closed by the one before. */
let closing = 0;
box.addEventListener('blur', () => { clearTimeout(closing); closing = window.setTimeout(() => { if (document.activeElement !== box) close(); }, 120); });
box.addEventListener('focus', () => clearTimeout(closing));
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k'){ e.preventDefault(); box.focus(); box.select(); }
});
