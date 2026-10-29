/* The source picker: a click on a field's source mark shows what each source says of the field (Lansweeper, Entra and
   Intune, Active Directory, and a value set by hand), each with the time it is from, the newest marked, and lets an admin
   fix the field to one: a picked source is the only one that writes it from then on (o.pick), a value kept as typed
   ('hand') is left alone by every sync. Automatic goes back to the usual order: Lansweeper, Intune, AD. */
import { FIELD_LABEL, SRC_ICON, byId, dayText, esc, feedOwns, fieldFixed, hist, now, setSrcPicker, sourceOf } from './01-core.js';
import { stamp } from './dates.js';
import { canEdit, who } from './04-settings.js';
import { render } from './07-render-plans.js';

const NAMES = { ls: 'Lansweeper', graph: 'Entra & Intune', ad: 'Active Directory', hand: 'By hand', unknown: 'Source not noted' };
const WHEN = { ls: 'last scan', graph: 'last check-in', ad: 'last logon', hand: 'edited', unknown: '' };
const ORDER = ['ls', 'graph', 'ad', 'hand', 'unknown'];
/* The time a source last said something of the device, for a value in use that it has not noted on its own. */
const timeOf = (o, src) => src === 'ls' ? (o.feed && o.feed.scanned) || '' : src === 'graph' ? (o.graph && (o.graph.lastCheckIn || o.graph.lastSync)) || '' : src === 'ad' ? (o.ad && o.ad.logon) || '' : src === 'hand' ? o.handAt || '' : '';
const LABELS = { ...FIELD_LABEL, purpose: 'Purpose', serial: 'Serial number', loc: 'Location' };
/* A source's time, written the app's way: 2026-10-27T08:00:00Z → 27.10.2026 08:00, 2026-10-27 → 27.10.2026. */
const shown = t => /T\d{2}:\d{2}/.test(t || '') && Date.parse(t) ? stamp(new Date(t)) : /^\d{4}-\d{2}-\d{2}$/.test(t || '') ? dayText(t) : String(t || '');
const ms = t => { if (!t) return 0; if (/^\d{2}\.\d{2}\.\d{4}/.test(t)) { const [d, m, y, h = '0', mi = '0'] = t.split(/[. :]/); return Date.UTC(+y, m - 1, +d, +h, +mi); } return Date.parse(/T/.test(t) ? t : t + 'T00:00:00Z') || 0; };
const icon = src => `<svg viewBox="0 0 24 24" aria-hidden="true">${SRC_ICON[src]}</svg>`;

/* The choices for field k of o: each source with a value, and the value in the field when no source noted it (a value
   set by hand, or one a source wrote before the sources' values were kept beside the field). */
function choicesOf(o, k){
  const src = sourceOf(o, k), has = o[k] != null && o[k] !== '';
  const list = Object.entries((o.vals || {})[k] || {}).filter(([s]) => !(s === 'hand' && src === 'hand' && has)).map(([s, [value, at]]) => ({ src: s, value, at }));
  if (has && src && !list.some(c => c.src === src && c.value === String(o[k]))) {
    /* A source's own older note of the field gives way to the value it wrote. */
    const i = list.findIndex(c => c.src === src); if (i >= 0) list.splice(i, 1);
    list.push({ src, value: String(o[k]), at: timeOf(o, src) });
  }
  return list.sort((a, b) => ORDER.indexOf(a.src) - ORDER.indexOf(b.src));
}
const AUTO_TEXT = 'Lansweeper, then Entra & Intune, then Active Directory';
const LOCK = '<svg class="sp-lock" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5.5" width="8" height="5.5" rx="1.2"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/></svg>';

function pickerOf(mark, close){
  const o = byId(mark.dataset.oid), k = mark.dataset.fk;
  if (!o || !k) return null;
  const list = choicesOf(o, k), fixed = fieldFixed(o, k);
  if (!list.length && !fixed) return null;
  const inUse = sourceOf(o, k), edit = canEdit(), label = LABELS[k] || k;
  const newest = list.length > 1 ? list.reduce((a, b) => ms(b.at) > ms(a.at) ? b : a) : null;
  const mode = fixed ? `${LOCK}${fixed === 'hand' ? 'Kept as typed' : `Fixed to ${esc(NAMES[fixed])}`}` : 'Automatic';
  /* What fixing means: a value kept as typed is left alone by every sync; a picked source is the only one that writes it. */
  const fixedText = fixed === 'hand' ? 'The syncs leave it as it is.' : fixed ? `Only ${esc(NAMES[fixed])} writes it from now on; the other sources are still shown here.` : '';
  const box = document.createElement('div');
  box.innerHTML = `<div class="sp-head"><b>${esc(label)}</b><span class="sp-mode${fixed ? ' fixed' : ''}">${mode}</span></div>
    ${list.length ? `<div class="sp-list" role="radiogroup" aria-label="Value of ${esc(label)}">${list.map(c => {
      const cur = c.src === inUse && String(o[k] ?? '') === c.value;
      return `<button type="button" class="sp-row${cur ? ' cur' : ''}" role="radio" aria-checked="${cur}" data-pick="${c.src}" ${edit ? '' : 'disabled'}>
        <span class="sp-ico" title="${esc(NAMES[c.src])}">${icon(c.src)}</span>
        <span class="sp-main"><span class="sp-src">${esc(NAMES[c.src])}${newest === c ? ' <span class="chip ok sp-new">newest</span>' : ''}${cur ? ' <span class="chip sp-use">in use</span>' : ''}</span><span class="sp-val">${esc(c.value)}</span>
        <span class="sp-at">${c.at && WHEN[c.src] ? `${WHEN[c.src]} ${esc(shown(c.at))}` : ''}</span></span>
        <span class="sp-tick" aria-hidden="true">${cur ? '✓' : ''}</span></button>`;
    }).join('')}</div>` : '<p class="sp-none muted">No source has a value for it.</p>'}
    <div class="sp-foot">${!edit ? `<span class="muted">${fixed ? fixedText : `Filled automatically: ${AUTO_TEXT}.`}</span>`
      : fixed ? `<span class="muted">${fixedText}</span><button type="button" class="link" data-pick="">Back to automatic</button>`
      : `<span class="muted">Automatic: ${AUTO_TEXT}. Pick a value to fix the field to it.</span>`}</div>`;
  box.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
    const src = b.dataset.pick === 'unknown' ? 'hand' : b.dataset.pick, c = list.find(x => x.src === b.dataset.pick);
    /* The value in the field stays on offer when another one takes its place, so it can be picked back: a value set by hand
       as By hand, a source's value under that source when the source has not noted it beside the field (a value written
       before the sources' values were kept), one of no known source as By hand. */
    const was = o[k], keepCurrent = () => {
      if (was == null || was === '') return;
      const from = sourceOf(o, k), as = from === 'unknown' ? 'hand' : from, noted = ((o.vals || {})[k] || {})[as];
      if (!as || (as !== 'hand' && noted)) return;
      o.vals = { ...(o.vals || {}), [k]: { ...((o.vals || {})[k] || {}), [as]: [String(was).slice(0, 1000), String(timeOf(o, as) || '').slice(0, 40)] } };
    };
    if (!src){
      /* Automatic: no source picked and no value kept as typed; the usual order decides at once, as the next syncs would. */
      if (o.pick){ const rest = { ...o.pick }; delete rest[k]; if (Object.keys(rest).length) o.pick = rest; else delete o.pick; }
      const auto = ['ls', 'graph', 'ad'].filter(s => s !== 'ls' || feedOwns(o, k)).map(s => list.find(x => x.src === s)).find(Boolean);
      if (auto){ if (auto.value !== String(was ?? '')) keepCurrent(); o[k] = auto.value; o.src = { ...(o.src || {}), [k]: auto.src }; }
      hist(o, now(), `${label}: back to the automatic order of the sources${auto && was !== auto.value ? ` (${was || 'empty'} → ${auto.value})` : ''}, by ${who()}`);
    } else {
      if (c.value !== String(was ?? '')) keepCurrent();
      o[k] = c.value;
      o.src = { ...(o.src || {}), [k]: src };
      o.pick = { ...(o.pick || {}), [k]: src };
      hist(o, now(), `${label}: fixed to ${src === 'hand' ? 'the value set by hand' : `${NAMES[src]}'s value`}${was !== c.value ? ` (${was || 'empty'} → ${c.value})` : ''}, by ${who()}`);
    }
    close(); render();
  });
  return box;
}
setSrcPicker(pickerOf);
