/* The source picker: a click on a field's source mark shows what each source says of the field (Lansweeper, Entra and
   Intune, Active Directory, and a value set by hand), each with the time it is from, the newest marked, and lets an admin
   pick the one the field uses. A picked source is the only one that writes the field from then on (o.pick); Automatic
   goes back to the usual order: by hand, Lansweeper, Intune, AD. */
import { FIELD_LABEL, SRC_ICON, byId, dayText, esc, hist, now, setSrcPicker } from './01-core.js';
import { stamp } from './dates.js';
import { canEdit, who } from './04-settings.js';
import { render } from './07-render-plans.js';

const NAMES = { ls: 'Lansweeper', graph: 'Entra & Intune', ad: 'Active Directory', hand: 'By hand' };
const WHEN = { ls: 'last scan', graph: 'last check-in', ad: 'last logon', hand: 'edited' };
const LABELS = { ...FIELD_LABEL, purpose: 'Purpose', serial: 'Serial number', loc: 'Location' };
/* A source's time, written the app's way: 2026-10-27T08:00:00Z → 27.10.2026 08:00, 2026-10-27 → 27.10.2026. */
const shown = t => /T\d{2}:\d{2}/.test(t || '') && Date.parse(t) ? stamp(new Date(t)) : /^\d{4}-\d{2}-\d{2}$/.test(t || '') ? dayText(t) : String(t || '');
const ms = t => { if (!t) return 0; if (/^\d{2}\.\d{2}\.\d{4}/.test(t)) { const [d, m, y, h = '0', mi = '0'] = t.split(/[. :]/); return Date.UTC(+y, m - 1, +d, +h, +mi); } return Date.parse(/T/.test(t) ? t : t + 'T00:00:00Z') || 0; };
const icon = src => `<svg viewBox="0 0 24 24" aria-hidden="true">${SRC_ICON[src]}</svg>`;

/* The choices for field k of o: each source with a value, and the value set by hand when there is one. */
function choicesOf(o, k){
  const src = (o.src || {})[k], handNow = (src === 'hand' || (o.pick || {})[k] === 'hand') && o[k] != null && o[k] !== '';
  /* The value set by hand: the one in the field while it is the page's, else the one kept when a source was picked over it. */
  const list = Object.entries((o.vals || {})[k] || {}).filter(([s]) => !(s === 'hand' && handNow)).map(([s, [value, at]]) => ({ src: s, value, at }));
  if (handNow) list.push({ src: 'hand', value: String(o[k]), at: o.handAt || '' });
  return list.sort((a, b) => ['ls', 'graph', 'ad', 'hand'].indexOf(a.src) - ['ls', 'graph', 'ad', 'hand'].indexOf(b.src));
}

function pickerOf(mark, close){
  const o = byId(mark.dataset.oid), k = mark.dataset.fk;
  if (!o || !k) return null;
  const list = choicesOf(o, k);
  if (!list.length) return null;
  const inUse = (o.src || {})[k], picked = (o.pick || {})[k] || '', edit = canEdit();
  const newest = list.length > 1 ? list.reduce((a, b) => ms(b.at) > ms(a.at) ? b : a) : null;
  const box = document.createElement('div');
  box.innerHTML = `<div class="sp-head"><b>${esc(LABELS[k] || k)}</b><span>${picked ? `Follows ${esc(NAMES[picked])}` : 'Automatic'}</span></div>
    <div class="sp-list" role="radiogroup" aria-label="Value of ${esc(LABELS[k] || k)}">${list.map(c => {
      const cur = c.src === inUse && String(o[k]) === c.value;
      return `<button type="button" class="sp-row${cur ? ' cur' : ''}" role="radio" aria-checked="${cur}" data-pick="${c.src}" ${edit ? '' : 'disabled'}>
        <span class="sp-ico" title="${esc(NAMES[c.src])}">${icon(c.src)}</span>
        <span class="sp-main"><span class="sp-src">${esc(NAMES[c.src])}${newest === c ? ' <span class="chip ok sp-new">newest</span>' : ''}</span><span class="sp-val">${esc(c.value)}</span>
        <span class="sp-at">${c.at ? `${WHEN[c.src]} ${esc(shown(c.at))}` : ''}</span></span>
        <span class="sp-tick" aria-hidden="true">${cur ? '✓' : ''}</span></button>`;
    }).join('')}</div>
    ${edit ? `<div class="sp-foot">${picked ? '<button type="button" class="link" data-pick="">Back to automatic</button>' : '<span class="muted">Pick one to keep it: the next syncs follow that source.</span>'}</div>` : ''}`;
  box.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
    const src = b.dataset.pick, c = list.find(x => x.src === src);
    if (!src){
      const rest = { ...(o.pick || {}) }; delete rest[k]; if (Object.keys(rest).length) o.pick = rest; else delete o.pick;
      if (o.ovr && o.ovr[k] === false && inUse !== 'hand') delete o.ovr[k];
      /* The usual order decides at once, as the next syncs would: Lansweeper, then Intune, then AD. A value set by hand
         stays (it comes first in that order). */
      const auto = inUse === 'hand' ? null : ['ls', 'graph', 'ad'].map(s => list.find(x => x.src === s)).find(Boolean);
      if (auto){ o[k] = auto.value; o.src = { ...(o.src || {}), [k]: auto.src }; }
      hist(o, now(), `${LABELS[k] || k}: back to the automatic order of the sources, by ${who()}`);
    } else {
      const was = o[k];
      /* A value set by hand stays on offer when a source is picked over it, so it can be picked back. */
      if (src !== 'hand' && (o.src || {})[k] === 'hand' && was != null && was !== '') o.vals = { ...(o.vals || {}), [k]: { ...((o.vals || {})[k] || {}), hand: [String(was), o.handAt || ''] } };
      o[k] = c.value;
      o.src = { ...(o.src || {}), [k]: src };
      o.pick = { ...(o.pick || {}), [k]: src };
      /* By hand: no sync fills it again. A source: that source's next sync writes it, so a hand lock goes. */
      if (src === 'hand') o.ovr = { ...(o.ovr || {}), [k]: false }; else if (o.ovr && o.ovr[k] === false) { o.ovr = { ...o.ovr }; delete o.ovr[k]; }
      hist(o, now(), `${LABELS[k] || k}: ${NAMES[src]}'s value picked${was !== c.value ? ` (${was || 'empty'} → ${c.value})` : ''}, by ${who()}`);
    }
    close(); render();
  });
  return box;
}
setSrcPicker(pickerOf);
