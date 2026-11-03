/* The device page's Timeline: the device's life, newest first, one line per event with an icon for its kind in the
   app's colours (timeline.js builds the list). Short at first; Show all lists every event. Everyone sees it. */
import { HISTORY, $, esc, st } from './01-core.js';
import { contractsOf } from './09-costs.js';
import { timelineOf } from './timeline.js';

const SHORT = 6;
/* The devices whose whole timeline is shown, while the page is open. */
const ALL = new Set();
const ICON = {
  buy: '<path d="M3 4h2l2 11h11l2-8H6"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  warranty: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  added: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  seen: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  back: '<path d="M4 13v6h16v-6"/><path d="M12 3v11M8 10l4 4 4-4"/>',
  move: '<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  status: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  maint: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  contract: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7"/>',
  replace: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  retired: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/>',
};
const TONE = { ok: 'fine', warn: 'needs a look', bad: 'a problem', gone: 'retired' };
export function timelinePanel(o){
  const list = timelineOf(o, { history: HISTORY[o.id] || [], contracts: contractsOf(o), life: st.lifecycle || {} });
  const all = ALL.has(o.id), shown = all ? list : list.slice(0, SHORT);
  const row = e => `<li class="tl-ev${e.tone ? ' tl-' + e.tone : ''}${e.future ? ' tl-future' : ''}" data-tl="${e.kind}"><span class="tl-ico"${e.tone ? ` title="${TONE[e.tone]}"` : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[e.kind] || ICON.status}</svg></span><time>${esc(e.when)}</time><span class="tl-text">${esc(e.text)}${e.future ? ' <span class="muted">· to come</span>' : ''}</span></li>`;
  return `<details class="panelbox fold" id="tlPanel" ${list.length ? 'open' : ''}><summary class="hdr">Timeline${list.length ? ` <span class="cnt">${list.length}</span>` : ' <span class="cnt">none</span>'}</summary>
    ${list.length ? `<ol class="tl" aria-label="The device's life, newest first">${shown.map(row).join('')}</ol>${list.length > SHORT ? `<div class="tl-foot"><button type="button" class="link" id="tlMore" data-view aria-expanded="${all}">${all ? 'Show fewer' : `Show all (${list.length})`}</button></div>` : ''}`
      : '<div class="chain"><span class="muted">No dates recorded yet.</span></div>'}</details>`;
}
export function bindTimeline(o){
  const b = $('#tlMore'); if (!b) return;
  b.onclick = () => { if (ALL.has(o.id)) ALL.delete(o.id); else ALL.add(o.id); $('#tlPanel').outerHTML = timelinePanel(o); bindTimeline(o); const m = $('#tlMore'); if (m) m.focus(); };
}
