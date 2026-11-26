/* The one way a location is picked (device page, quick edit, New device, patch panels): the rooms grouped under their
   site (shown by the room's name, so typing a room's first letters jumps to it), the value now kept even if it is no
   room here, and for an admin "New room…" last: a small form beside the list (site and name), no dialog, so it works
   inside dialogs and popups too. The new room is added, picked, and the list's own change runs as for any pick. */
import { LOCS, SITES, esc, toast } from './01-core.js';
import { isAdmin } from './04-settings.js';
import { queueServerSave } from './07-render.js';
import { html } from './html.js';

const NEW = '__newroom';
const siteOf = l => String(l || '').split(' / ')[0];
const roomOf = l => String(l || '').split(' / ').slice(1).join(' / ');

/** The <option>s (as text) of a location list. @param {string} sel the value now @param {{none?: string|null}} [o] */
export function locOptions(sel, { none = 'No location' } = {}){
  const opt = (v, label) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(label)}</option>`;
  const sites = [...SITES, ...new Set(LOCS.map(siteOf).filter(x => !SITES.includes(x)))];
  /* A room name more than one site has (Lager in Zürich and in Bern) says its site too, so the closed list tells them
     apart; with one site, the short name. The room's name comes first, for typing its first letters. */
  const twice = new Set(); { const seen = new Set(); for (const l of LOCS){ const r = roomOf(l).toLowerCase(); if (!r) continue; if (seen.has(r)) twice.add(r); seen.add(r); } }
  /* With more than one site, every room says its site: the closed list shows Büro (Bern), not a Büro of either site. */
  const many = sites.filter(x => LOCS.some(l => siteOf(l) === x)).length > 1;
  const name = l => !l.includes(' / ') ? `${l} (whole site)` : many || twice.has(roomOf(l).toLowerCase()) ? `${roomOf(l)} (${siteOf(l)})` : roomOf(l);
  let out = none === null ? '' : opt('', none);
  if (sel && !LOCS.includes(sel)) out += `<optgroup label="Now">${opt(sel, sel)}</optgroup>`;
  for (const site of sites){
    const rooms = LOCS.filter(l => siteOf(l) === site).sort((a, b) => roomOf(a).localeCompare(roomOf(b)));
    if (rooms.length) out += `<optgroup label="${esc(site)}">${rooms.map(l => opt(l, name(l))).join('')}</optgroup>`;
  }
  if (isAdmin() && SITES.length) out += `<optgroup label="Add"><option value="${NEW}">New room…</option></optgroup>`;
  return out;
}

/* "New room…" picked: the list keeps what it had, and a small form opens beside it. */
document.addEventListener('focusin', e => { const s = /** @type {HTMLSelectElement} */ (e.target); if (s && s.matches && s.matches('select.locpick')) s.dataset.was = s.value; });
document.addEventListener('change', e => {
  const s = /** @type {HTMLSelectElement} */ (e.target);
  if (!s || !s.matches || !s.matches('select.locpick')) return;
  if (s.value !== NEW){ s.dataset.was = s.value; return; }
  e.stopImmediatePropagation();
  s.value = s.dataset.was ?? '';
  openNewRoom(s);
}, true);

function openNewRoom(s){
  if (s.nextElementSibling && s.nextElementSibling.classList.contains('locnew')) return;
  const site = SITES.includes(siteOf(s.value)) ? siteOf(s.value) : SITES[0];
  const f = document.createElement('span');
  f.className = 'locnew';
  f.innerHTML = String(html`<select aria-label="Site of the new room">${SITES.map(x => html`<option ${x === site ? 'selected' : ''}>${x}</option>`)}</select><input aria-label="Name of the new room" placeholder="New room, e.g. Lager" maxlength="80"><button type="button" class="mini primary">Add</button><button type="button" class="mini icon ghost locnew-x" aria-label="Cancel the new room" title="Cancel (Esc)">×</button>`);
  s.hidden = true; s.after(f);
  const [site_, name, ok, cancel] = /** @type {[HTMLSelectElement, HTMLInputElement, HTMLButtonElement, HTMLButtonElement]} */ ([...f.children]);
  const close = () => { f.remove(); s.hidden = false; s.focus(); };
  const add = () => {
    const room = name.value.trim();
    if (!room || room.includes('/')){ name.setCustomValidity('Write the room name, without a slash.'); name.reportValidity(); return; }
    const full = `${site_.value} / ${room}`, have = LOCS.find(l => l.toLowerCase() === full.toLowerCase());
    if (!have){ LOCS.push(full); queueServerSave(); toast(`Room ${full} added`); }
    const none = s.querySelector('option[value=""]');
    s.innerHTML = locOptions(have || full, { none: none ? none.textContent : null });
    f.remove(); s.hidden = false; s.focus();
    s.dispatchEvent(new Event('change', { bubbles: true }));
  };
  name.oninput = () => name.setCustomValidity('');
  name.onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); e.stopPropagation(); add(); } };
  /* Escape anywhere in the form closes the form only, not the dialog or popup around it. */
  f.addEventListener('keydown', e => { if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); close(); } });
  ok.onclick = add; cancel.onclick = close;
  name.focus();
}
