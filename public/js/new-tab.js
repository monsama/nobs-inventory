/* Ctrl (⌘) + click, or a click with the middle button, on anything that leads somewhere opens it in a new browser tab, as
   with a link on any web page: a device (its name in a list, a row of the Table, a device named in a port, a contract,
   a contact card or on the Overview), a view in the tab bar, a page of Settings. The new tab is signed in already and
   opens there (?o= for a device, ?v= for a view, #settings/ for Settings). A real link keeps the browser's own way, and
   in the List Ctrl + click on a row away from its name still picks the row. Middle-click on a device's own tab at the
   top closes it, as before. */
import { byId, st } from './01-core.js';

const here = () => location.origin + location.pathname;
export const deviceUrl = o => `${here()}?o=${encodeURIComponent(o.code || o.id)}`;
export const viewUrl = tab => `${here()}?v=${encodeURIComponent(tab)}`;

/** Where the element clicked leads, or '' for nothing of its own. @param {Element} t @param {boolean} middle */
export function urlOf(t, middle){
  if (t.closest('a[href], input, select, textarea, label, .cardtick, [data-qedit], [data-close]')) return '';
  const set = t.closest('[data-st]');
  if (set) return `${here()}#settings/${encodeURIComponent(/** @type {HTMLElement} */ (set).dataset.st || '')}`;
  const tab = t.closest('.tab[data-tab]');
  if (tab){
    const id = /** @type {HTMLElement} */ (tab).dataset.tab || '';
    if (tab.classList.contains('objtab')) { if (middle) return ''; const o = byId(id); return o ? deviceUrl(o) : ''; }
    return st.tabIds.includes(id) ? viewUrl(id) : '';
  }
  const ov = t.closest('[data-ovopen]');
  if (ov){ const o = byId(/** @type {HTMLElement} */ (ov).dataset.ovopen); return o ? deviceUrl(o) : ''; }
  const el = t.closest('[data-open]');
  if (!el) return '';
  /* A row of the List: only its name leads to the device; the rest of the row is for picking. */
  if (el.classList.contains('card') && !t.closest('.card-open')) return '';
  const o = byId(/** @type {HTMLElement} */ (el).dataset.open);
  return o ? deviceUrl(o) : '';
}
const go = (e, middle) => {
  const t = /** @type {Element} */ (e.target);
  /* In a dialog only the pages of Settings lead somewhere of their own; anything else there stays in the dialog. */
  if (!t || !t.closest || (t.closest('#mdl, .modal') && !t.closest('[data-st]'))) return;
  const url = urlOf(t, middle); if (!url) return;
  e.preventDefault(); e.stopImmediatePropagation();
  window.open(url, '_blank', 'noopener');
};
/* On the window, before the page's own handlers on the document (which would open it here, or pick the row). */
window.addEventListener('click', e => { if ((e.ctrlKey || e.metaKey) && !e.altKey && e.button === 0) go(e, false); }, true);
window.addEventListener('auxclick', e => { if (e.button === 1) go(e, true); }, true);
/* The middle button scrolls the page where it is pressed; on something that opens in a new tab it opens it instead. */
window.addEventListener('mousedown', e => { if (e.button === 1 && e.target instanceof Element && urlOf(e.target, true)) e.preventDefault(); }, true);
