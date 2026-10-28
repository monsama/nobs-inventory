/* The search at the top: always through everything, whatever the filters on the left, the tab or the list filters say.
   It finds devices, people, contacts, contracts and rooms and lists them under the field, grouped; a hit opens where it
   lives, and the view the person is in stays as it is. The lists narrow themselves with the filter field in their own
   toolbar (st.q), not with this one. Ctrl+K (Cmd+K) puts the cursor here from anywhere. */
import { $, COSTS, CONTACTS, LOCS, STATUS, TYPES, esc, matchesQ, objs, st, tico } from './01-core.js';
import { USERS } from './04-settings.js';
import { openObj } from './02-views.js';
import { render } from './07-render-plans.js';
import { showDevicesOf } from './settings-users.js';

const MAX = { dev: 8, other: 4 };
const box = $('#search'), list = $('#gsList');
let items = [], active = -1;

/* Small line icons in the style of the type icons. */
const ico = d => `<span class="tico sm gs-ico" aria-hidden="true"><svg class="i" viewBox="0 0 24 24"><path d="${d}"/></svg></span>`;
const ICON = { person: ico('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'), contact: ico('M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z'),
  contract: ico('M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6'), room: ico('M3 11l9-7 9 7v10H3zM9 21v-6h6v6') };
const has = (q, ...vals) => vals.some(v => v && String(v).toLowerCase().includes(q));
const row = (i, icon, main, sub) => `<li role="option" id="gs${i}" data-i="${i}" aria-selected="false">${icon}<span class="gs-main">${esc(main)}</span>${sub ? `<span class="gs-sub">${esc(sub)}</span>` : ''}</li>`;

/* Every kind of thing the search knows, each with what to show and where it opens. */
function results(q){
  const out = [];
  /* Devices first, those in use before retired ones; the code, name, addresses, serial, user and IDs are searched. */
  const devs = objs.filter(o => o.type !== 'rack' || has(q, o.name, o.code)).filter(o => matchesQ(o, q))
    .sort((a, b) => (a.status === 'retired') - (b.status === 'retired') || a.name.localeCompare(b.name));
  if (devs.length) out.push(['Devices', devs.length, devs.slice(0, MAX.dev).map(o => ({
    icon: tico(o.type, 'tico sm'), main: o.name,
    sub: [TYPES[o.type] ? TYPES[o.type].label : o.type, o.ip, (o.loc || '').replace(' / ', ' · '), o.status !== 'active' ? STATUS[o.status].label : ''].filter(Boolean).join(' · '),
    go: () => openObj(o.id) }))]);
  const people = USERS.filter(u => has(q, u.name, u.login, u.dept));
  const owned = new Map(); for (const o of objs) if (o.user && o.status !== 'retired') owned.set(o.user, (owned.get(o.user) || 0) + 1);
  if (people.length) out.push(['People', people.length, people.slice(0, MAX.other).map(u => ({
    icon: ICON.person, main: u.name,
    sub: [u.dept, `${owned.get(u.name) || 0} device${owned.get(u.name) === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
    go: () => showDevicesOf(u.name) }))]);
  const contacts = (CONTACTS.list || []).filter(c => has(q, c.name, c.company, c.email, c.phone, c.mobile, c.area));
  if (contacts.length) out.push(['Contacts', contacts.length, contacts.slice(0, MAX.other).map(c => ({
    icon: ICON.contact, main: c.name, sub: [c.company, c.area || c.role].filter(Boolean).join(' · '),
    go: () => { st.cnQ = c.name; st.cnKind = ''; st.tab = 'contacts'; render(); } }))]);
  const contracts = (COSTS.contracts || []).filter(c => has(q, c.name, c.supplier, c.ref));
  if (contracts.length) out.push(['Contracts', contracts.length, contracts.slice(0, MAX.other).map(c => ({
    icon: ICON.contract, main: c.name, sub: [c.supplier, c.ref].filter(Boolean).join(' · '),
    go: () => { st.ctQ = c.name; st.ctDue = false; st.tab = 'contracts'; render(); } }))]);
  const rooms = LOCS.filter(l => has(q, l));
  const inRoom = new Map(); for (const o of objs) if (o.loc && o.status !== 'retired') inRoom.set(o.loc, (inRoom.get(o.loc) || 0) + 1);
  if (rooms.length) out.push(['Rooms', rooms.length, rooms.slice(0, MAX.other).map(l => ({
    icon: ICON.room, main: l.replace(' / ', ' · '), sub: `${inRoom.get(l) || 0} devices`,
    go: () => { st.loc = l; st.q = ''; if (!['cards', 'table', 'map', 'plans'].includes(st.tab)) st.tab = 'cards'; render(); } }))]);
  return out;
}

function show(){
  const q = box.value.trim().toLowerCase();
  items = []; active = -1;
  if (!q){ close(); return; }
  const groups = results(q);
  let html = '';
  for (const [label, n, rows] of groups){
    html += `<li class="gs-head" role="presentation">${esc(label)}${n > rows.length ? ` <span class="muted">· ${rows.length} of ${n}</span>` : ''}</li>`;
    for (const r of rows){ html += row(items.length, r.icon, r.main, r.sub); items.push(r); }
  }
  list.innerHTML = html || `<li class="gs-none" role="presentation">Nothing found for “${esc(box.value.trim())}”.</li>`;
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
  r.go();
}

box.setAttribute('role', 'combobox'); box.setAttribute('aria-controls', 'gsList'); box.setAttribute('aria-expanded', 'false'); box.setAttribute('aria-autocomplete', 'list');
box.addEventListener('input', show);
box.addEventListener('focus', () => { if (box.value.trim()) show(); });
box.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' && items.length){ e.preventDefault(); mark((active + 1) % items.length); }
  else if (e.key === 'ArrowUp' && items.length){ e.preventDefault(); mark((active - 1 + items.length) % items.length); }
  else if (e.key === 'Enter'){ e.preventDefault(); pick(active < 0 ? 0 : active); }
  else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); if (!list.hidden) close(); else { box.value = ''; box.blur(); } }
});
/* A click on a hit opens it; mousedown keeps the field from losing the focus first, which would close the list. */
list.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (!li) return; e.preventDefault(); pick(+li.dataset.i); });
/* Leaving the field closes the list a moment later (a click on a hit comes first); coming back cancels that, so a
   search typed right after opening a hit is not closed by the one before. */
let closing = 0;
box.addEventListener('blur', () => { clearTimeout(closing); closing = setTimeout(() => { if (document.activeElement !== box) close(); }, 120); });
box.addEventListener('focus', () => clearTimeout(closing));
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k'){ e.preventDefault(); box.focus(); box.select(); }
});
