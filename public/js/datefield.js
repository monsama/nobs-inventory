/* Dates and times typed the way the rest of the app writes them (31.12.2026, 06:00), whatever language the browser
   has: a date field's own picker writes 12/31/2026 or 06:00 AM in an English browser. A date field is a text field
   with a calendar button; the button opens the browser's own calendar, whose choice is written back in this format.
   The value is kept as ISO (2026-12-31) for saving: read it with dateValue(el). */
import { esc, toast } from './01-core.js';

const pad = n => String(n).padStart(2, '0');
/* 31.12.2026, 31.12.26, 31/12/2026, 2026-12-31 or 31122026 → 2026-12-31; '' for empty, null for something else. */
export function parseDay(text){
  const t = String(text || '').trim();
  if (!t) return '';
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t), y, mo, d;
  if (m) [, y, mo, d] = m.map(Number);
  else if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(t))) { [, d, mo, y] = m.map(Number); if (y < 100) y += 2000; }
  else if ((m = /^(\d{2})(\d{2})(\d{4})$/.exec(t))) [, d, mo, y] = m.map(Number);
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : null;
}
export const dayShown = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '';
/* 6, 6:5, 06:00, 0600 or 18.30 → 06:00, 06:05, 06:00, 18:30; null for something else. */
export function parseTime(text){
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?$/.exec(String(text || '').trim().replace(/^(\d{1,2}):(\d)$/, '$1:0$2'));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2] || 0);
  return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : null;
}

const CAL = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>';
/* The field: attrs are put on the text field (id, data-k and the like). */
export function dateFieldHtml(attrs, iso, { disabled = false } = {}){
  return `<span class="datefield"><input type="text" inputmode="numeric" autocomplete="off" placeholder="dd.mm.yyyy" data-date="${esc(iso || '')}" value="${esc(dayShown(iso))}" ${attrs} ${disabled ? 'disabled' : ''}>`
    + `<button type="button" class="icon ghost df-cal" aria-label="Choose a date" title="Choose a date" ${disabled ? 'disabled' : ''}>${CAL}</button>`
    + `<input type="date" class="df-native" tabindex="-1" aria-hidden="true" lang="de-CH" value="${esc(iso || '')}"></span>`;
}
export function timeFieldHtml(attrs, value, { hidden = false, disabled = false } = {}){
  return `<input type="text" inputmode="numeric" autocomplete="off" placeholder="hh:mm" maxlength="5" class="timefield" data-time value="${esc(value || '')}" ${attrs} ${hidden ? 'hidden' : ''} ${disabled ? 'disabled' : ''}>`;
}
/* The ISO day of a date field (or of any input: a plain one is read as typed). */
/* Whether a date field holds text that is not a day: a save must stop and say so, not keep the old day unseen. */
export const dateBad = el => !!el && 'date' in el.dataset && parseDay(el.value) === null;
export const dateValue = el => !el ? '' : 'date' in el.dataset ? (parseDay(el.value) ?? el.dataset.date) : el.value;

/* Typed text is checked when the field is left: a day it can read is written as 31.12.2026, anything else is marked
   and kept out (the field's value stays the last good day). Runs before the page's own change handlers. */
function settle(el){
  const iso = parseDay(el.value);
  el.classList.toggle('bad', iso === null);
  el.setCustomValidity(iso === null ? 'Write the day as dd.mm.yyyy' : '');
  if (iso === null){ toast(`${el.value.trim()} is not a day: write it as dd.mm.yyyy`, 'err'); return false; }
  el.dataset.date = iso; el.value = dayShown(iso);
  const nat = el.parentElement && el.parentElement.querySelector('.df-native'); if (nat) nat.value = iso;
  return true;
}
if (typeof document !== 'undefined'){
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.matches && el.matches('input[data-date]')){ if (!settle(el)) e.stopImmediatePropagation(); }
    else if (el.matches && el.matches('input[data-time]')){
      const t = parseTime(el.value); el.classList.toggle('bad', t === null);
      if (t === null){ e.stopImmediatePropagation(); toast(`${el.value.trim()} is not a time: write it as hh:mm (24 hours)`, 'err'); } else el.value = t;
    } else if (el.matches && el.matches('.df-native')){
      /* A day picked in the calendar: into the text field, which then saves as if typed. */
      e.stopImmediatePropagation();
      const txt = el.parentElement.querySelector('input[data-date]');
      txt.value = dayShown(el.value) || ''; txt.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, true);
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.df-cal'); if (!b) return;
    const nat = b.parentElement.querySelector('.df-native');
    try { nat.showPicker(); } catch { nat.focus(); }
  });
}
