/* Settings → Data sources: who wins when several sources know a field, for all of them (All fields) and for one (Fields
   from this source, on its own tab), and what else each brings. Drawn from sync-map.js (the lists the syncs themselves
   use) and from the current settings, so it changes with them and is never out of date. */
import { $, DEFAULT_POLICY, FIELD_LABEL, GONE_FILTERS, SYNC, dayText, objs, st, toastUndo, whereCtx } from './01-core.js';
import { WHERE_DAY_CHOICES, span } from './where.js';
import { closeModal, modal } from './19-modal.js';
import { LS_FILL, MODES, NEVER, ORDER_FIELDS, PEOPLE_SOURCES, SOURCES_OF, SOURCE_EXTRAS, SOURCE_LABEL, SYNC_FIELD_LABEL, fieldMode, fieldOrder, maySet } from './sync-map.js';
import { queueServerSave, render, view } from './07-render.js';
import { isAdmin, renderSetPane } from './04-settings.js';
import { resetFilters } from './02-views.js';
import { bindPolicy, policyGrid } from './03-object-modals.js';
import { SOURCE_TAB, sourceOn, sourceState } from './settings-status.js';
import { intuneCoverageHtml } from './settings-graph.js';
import { html, rawHtml } from './html.js';

const SHORT = { ls: 'Lansweeper', graph: 'Entra & Intune', ad: 'AD' };
/* What each source brings, in one line, on its card in All fields. */
const SOURCE_BLURB = {
  ls: 'Devices found on the network: hardware, software, network details, warranty and who uses them.',
  ad: 'People with their sign-in and department, and computer accounts: operating system, domain and location.',
  graph: 'Devices joined to Entra or managed by Intune: compliance, encryption, primary user and phone details.',
};
/* Quick setups for every field at once: [name, what it does]. */
const PRESETS = {
  ls: ['Lansweeper leads', 'Lansweeper first, keeping the fields up to date; Entra & Intune and AD only fill what it leaves empty'],
  graph: ['Intune leads', 'Entra & Intune first, keeping the fields up to date; then Lansweeper; AD only fills what is left empty'],
  fill: ['Sources only fill', 'Every source writes a field only while it is empty: a value that is there stays'],
};
function presetOf(p){
  const fo = {}, fm = {}, policy = { ...(st.policy || {}) };
  for (const k of ORDER_FIELDS) {
    const known = SOURCES_OF(k);
    const order = p === 'fill' ? fieldOrder(st, k) : (p === 'ls' ? ['ls', 'graph', 'ad'] : ['graph', 'ls', 'ad']).filter(x => known.includes(x));
    fo[k] = order;
    fm[k] = Object.fromEntries(order.map((x, i) => [x, p === 'fill' ? 'fill' : p === 'ls' ? (i === 0 ? 'update' : 'fill') : (x === 'ad' ? 'fill' : 'update')]));
    if (known.includes('ls') && !LS_FILL[k]) policy[k] = order.includes('ls');
  }
  return { fieldOrder: fo, fieldMode: fm, policy };
}
/* The fields by topic, so the list reads like the device page. A field a sync learns later lands in Other. */
/** @type {[string, string[]][]} */
const FIELD_GROUPS = [
  ['Network', ['ip', 'ip6', 'mac', 'mask', 'gateway', 'dns', 'dhcp']],
  ['Hardware', ['model', 'cpu', 'ram', 'disk', 'fw']],
  ['System', ['os', 'patch', 'av', 'domain', 'boot']],
  ['Place and description', ['loc', 'purpose']],
  ['Purchase and warranty', ['purchased', 'warranty', 'price', 'supplier', 'invoice']],
];
/** @returns {[string, string[]][]} */
const groupsOf = () => { const known = FIELD_GROUPS.flatMap(g => g[1]); const other = ORDER_FIELDS.filter(k => !known.includes(k)); return [...FIELD_GROUPS.map(([n, ks]) => /** @type {[string, string[]]} */ ([n, ks.filter(k => ORDER_FIELDS.includes(k))])), ...(other.length ? [/** @type {[string, string[]]} */ (['Other', other])] : [])].filter(g => g[1].length); };
/* AD and Entra & Intune fill nothing while filling is turned off in their tab. */
const globalOff = src => (src === 'graph' && st.fillGraph === false) || (src === 'ad' && st.fillAd === false);
const list = names => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
/* What the order of field k means, in one plain sentence: who sets it, who only fills a gap, who is only shown. */
/* The field-by-field table stays open while this page is open, once opened. */
let advOpen = false;
/* idle: also say which of them are not set up yet (the dialog says it in the sentence; the tables mark the chip). */
export function orderSentence(k, order, modes = st.fieldMode, idle = false){
  const used = order.filter(x => !globalOff(x)), shown = SOURCES_OF(k).filter(x => !used.includes(x));
  if (!used.length) return `No source writes it: it is kept as typed.${shown.length ? ` ${list(shown.map(x => SHORT[x]))} ${shown.length === 1 ? 'is' : 'are'} shown beside the field.` : ''}`;
  const mode = x => fieldMode({ fieldMode: modes, fieldOrder: st.fieldOrder, policy: st.policy }, k, x);
  const says = used.map((x, i) => mode(x) === 'fill' ? `${SHORT[x]} writes it only while it is empty`
    : i === 0 ? (x === 'ls' && !LS_FILL[k] ? 'Lansweeper keeps it up to date at every scan' : `${SHORT[x]} keeps it up to date`)
    : `${SHORT[x]} keeps it up to date where ${list(used.slice(0, i).map(y => SHORT[y]))} ${i === 1 ? 'has' : 'have'} no value`);
  /* A source in the order that is not set up writes nothing yet: said, so the sentence is not read as what happens now. */
  const off = idle && SOURCES_ON ? used.filter(x => !SOURCES_ON[x]) : [];
  return says.join('; ') + '.' + (off.length ? ` ${list(off.map(x => SHORT[x]))} ${off.length === 1 ? 'is' : 'are'} not set up: ${off.length === 1 ? 'it writes' : 'they write'} nothing yet.` : '');
}
/* Which sources are set up, as the Health check on Maintenance says (the server's settings), set when the tab is drawn. */
let SOURCES_ON = null;

/* What the devices' fields would become under other settings (next: fieldOrder and policy), from the values each source
   last reported (o.vals): the syncs run in turn, weakest source first, as maySet lets them. A field picked or set by hand
   on a device never changes; a source turned off in its tab fills nothing. Only what changes is returned. */
export function previewOrder(next, keys = ORDER_FIELDS){
  const s2 = { ...st, ...next };
  const off = src => (src === 'graph' && st.fillGraph === false) || (src === 'ad' && st.fillAd === false);
  const out = [];
  for (const o of objs) {
    if (o.status === 'retired' || o.excluded || o.detached || !o.vals) continue;
    for (const k of keys) {
      const vals = o.vals[k]; if (!vals || (o.pick && o.pick[k])) continue;
      const order = fieldOrder(s2, k).filter(src => !off(src) && !(src === 'ls' && !o.feed));
      const cur = { [k]: o[k], src: { ...(o.src || {}) }, feed: o.feed };
      for (const src of [...[...order].reverse(), ...order]) {
        const v = vals[src] && vals[src][0];
        if (v && cur[k] !== v && maySet(s2, cur, k, src)) { cur[k] = v; cur.src[k] = src; }
      }
      if (String(cur[k] ?? '') !== String(o[k] ?? '')) out.push({ o, k, from: o[k], to: cur[k], src: cur.src[k] });
    }
  }
  return out;
}
/* Before a change is saved: which devices it changes, and how, to apply or cancel. Nothing changes: it is applied at once. */
function confirmChange(title, next, keys, apply){
  const list = previewOrder(next, keys);
  if (!list.length) { apply(); return; }
  const many = keys.length > 1, shown = list.slice(0, 200);
  const devices = new Set(list.map(x => x.o.id)).size;
  modal(html`<div class="mh">${title}</div>
    <div class="mb"><p class="note">${devices} ${devices === 1 ? 'device gets' : 'devices get'} ${list.length === devices ? 'another value' : `${list.length} other values`} with this, at the next sync of each source. Values set or picked by hand on a device stay as they are.</p>
      <div class="ds-prev"><table class="grid mini"><thead><tr><th>Device</th>${many ? html`<th>Field</th>` : ''}<th>Now</th><th>Then</th><th>From</th></tr></thead><tbody>
      ${shown.map(x => html`<tr><td><b>${x.o.name}</b> <span class="code">${x.o.code || ''}</span></td>${many ? html`<td>${SYNC_FIELD_LABEL[x.k]}</td>` : ''}<td class="muted">${String(x.from ?? '') || '-'}</td><td><b>${x.to ?? ''}</b></td><td>${SHORT[x.src] || ''}</td></tr>`)}
      </tbody></table></div>${list.length > shown.length ? html`<p class="note">And ${list.length - shown.length} more.</p>` : ''}</div>
    <div class="mf"><button id="dpCancel">Cancel</button><button id="dpOk" class="primary">Apply</button></div>`, 'wide');
  $('#dpCancel').onclick = () => closeModal();
  $('#dpOk').onclick = () => { closeModal(); apply(); };
}
/* One field's settings, to put back on Undo without touching what changed in other fields meanwhile. */
const without = (o, k) => { if (!o || !(k in o)) return o || null; const r = { ...o }; delete r[k]; return Object.keys(r).length ? r : null; };
const fieldState = k => ({ order: st.fieldOrder && st.fieldOrder[k], mode: st.fieldMode && st.fieldMode[k], policy: (st.policy || {})[k], hasPolicy: k in (st.policy || {}) });
function restoreField(k, b){
  st.fieldOrder = b.order ? { ...(st.fieldOrder || {}), [k]: b.order } : without(st.fieldOrder, k);
  st.fieldMode = b.mode ? { ...(st.fieldMode || {}), [k]: b.mode } : without(st.fieldMode, k);
  const p = { ...(st.policy || {}) }; if (b.hasPolicy) p[k] = b.policy; else delete p[k]; st.policy = p;
}
/* Sets the sources of field k to list (in order), kept with Lansweeper's "Feed may overwrite" box, with Undo; shown first
   when it changes devices. */
/* The sources of field k set at once, with Undo (no preview): for a pane that sets them in place (Locations).
   after: draws that pane again. Each source keeps how it writes (its mode). */
export function setOrderNow(k, list, what, after, how = null){
  const policy = SOURCES_OF(k).includes('ls') && !LS_FILL[k] ? { ...(st.policy || {}), [k]: list.includes('ls') } : st.policy;
  const modes = Object.fromEntries(list.map(x => [x, (how && how[x]) || fieldMode(st, k, x)]));
  const plain = !list.some(x => modes[x] === 'fill');
  const isDefault = plain && fieldOrder({ ...st, policy, fieldOrder: null }, k).join() === list.join();
  const before = fieldState(k);
  st.fieldOrder = isDefault ? without(st.fieldOrder, k) : { ...(st.fieldOrder || {}), [k]: list };
  st.fieldMode = isDefault ? without(st.fieldMode, k) : (st.fieldMode && st.fieldMode[k]) || !plain ? { ...(st.fieldMode || {}), [k]: modes } : st.fieldMode;
  st.policy = policy;
  queueServerSave(); after();
  toastUndo(`${SYNC_FIELD_LABEL[k]}: ${what}`, () => { restoreField(k, before); queueServerSave(); after(); });
}
function setOrder(k, list, what, modes = null){
  const policy = SOURCES_OF(k).includes('ls') && !LS_FILL[k] ? { ...(st.policy || {}), [k]: list.includes('ls') } : st.policy;
  /* The default order (with the box as it is then) and plain updates: the field goes back to the default, not Custom. */
  const plain = !(modes ? list.some(x => modes[x] === 'fill') : st.fieldMode && st.fieldMode[k]);
  const isDefault = plain && fieldOrder({ ...st, policy, fieldOrder: null }, k).join() === list.join();
  const fo = isDefault ? without(st.fieldOrder, k) : { ...(st.fieldOrder || {}), [k]: list };
  const fm = isDefault ? without(st.fieldMode, k) : modes ? { ...(st.fieldMode || {}), [k]: Object.fromEntries(list.map(x => [x, modes[x] || 'update'])) } : st.fieldMode;
  confirmChange(`${SYNC_FIELD_LABEL[k]}: ${what}`, { fieldOrder: fo, fieldMode: fm, policy }, [k], () => {
    const before = fieldState(k);
    st.fieldOrder = fo; st.fieldMode = fm; st.policy = policy;
    queueServerSave(); redraw();
    toastUndo(`${SYNC_FIELD_LABEL[k]}: ${what}`, () => { restoreField(k, before); queueServerSave(); redraw(); });
  });
  /* Until applied, the lists show what is saved. */
  redraw();
}

/* Which sources are set up now, by the field keys the field rules use. Defender and Autopilot are read by the Entra &
   Intune sync, when turned on there. */
function sourcesOn(){
  const on = { ls: sourceOn('ls'), ad: sourceOn('ad'), graph: sourceOn('graph') };
  on.defender = on.graph && !!SYNC.defender;
  on.autopilot = on.graph;
  SOURCES_ON = on;
  return on;
}
/* Every field a sync knows (or those of one source), by topic: the sources that set it in their order (the first one
   wins), what that means in a sentence, and Change… for an admin. The order is kept per field (st.fieldOrder); the
   syncs read it (sync-map.js). */
function matrixHtml(on, only = null){
  const edit = isAdmin();
  const chain = k => {
    const order = fieldOrder(st, k), used = order.filter(x => !globalOff(x));
    const off = order.filter(globalOff), shown = SOURCES_OF(k).filter(x => !order.includes(x));
    const chip = (x, n) => html`<span class="ds-src${on[x] ? '' : ' ds-dim'}" title="${SOURCE_LABEL[x] + (on[x] ? '' : ' (not set up)') + ': ' + MODES[fieldMode(st, k, x)]}">${n ? html`<b>${n}</b>` : ''}${SHORT[x]}${n && fieldMode(st, k, x) === 'fill' ? html` <small class="ds-mode">only if empty</small>` : ''}</span>`;
    return html`${used.length ? used.map((x, i) => html`${i ? html`<span class="ds-arrow" aria-hidden="true">›</span>` : ''}${chip(x, i + 1)}`) : html`<span class="muted">Kept as typed</span>`}
      ${[...shown, ...off].length ? html`<span class="ds-also">shown only: ${list([...shown, ...off].map(x => SHORT[x] + (off.includes(x) ? ' (off)' : '')))}</span>` : ''}`;
  };
  /* Values set by hand per field: they stay, whatever the sources say; the count opens them, to give them back. */
  const hand = {};
  for (const o of objs) if (o.status !== 'retired') for (const k of ORDER_FIELDS) if ((o.pick && o.pick[k] === 'hand') || (o.src && o.src[k] === 'hand')) hand[k] = (hand[k] || 0) + 1;
  const isSet = k => !!((st.fieldOrder && st.fieldOrder[k]) || (st.fieldMode && st.fieldMode[k]));
  const row = k => html`<tr${isSet(k) ? html` class="ds-set"` : ''}><th scope="row">${SYNC_FIELD_LABEL[k]}${isSet(k) ? html` <span class="chip ds-custom" title="Set here, not the default">Custom</span>` : ''}${hand[k] ? html`<button type="button" class="link ds-hand" data-dshand="${k}" title="Devices where this field was set by hand: no source changes it">${hand[k]} set by hand</button>` : ''}</th>
    ${only ? html`<td class="ds-write"><input type="checkbox" data-dswrite="${k}" ${fieldOrder(st, k).includes(only) ? 'checked' : ''} ${edit ? '' : 'disabled'} aria-label="${SOURCE_LABEL[only]} writes ${SYNC_FIELD_LABEL[k]}"></td>` : ''}<td class="ds-chain"><span class="ds-chainin">${chain(k)}</span></td><td class="ds-how">${orderSentence(k, fieldOrder(st, k))}</td>${edit ? html`<td class="ds-act"><button type="button" class="mini${dsOpen === k ? ' on' : ''}" data-dsedit="${k}" aria-expanded="${String(dsOpen === k)}" aria-controls="dsEd_${k}" aria-label="${`${dsOpen === k ? 'Close' : 'Change'} the sources of ${SYNC_FIELD_LABEL[k]}`}">${dsOpen === k ? 'Close' : 'Change'}</button></td>` : ''}</tr>
    ${edit && dsOpen === k ? html`<tr class="ds-edrow" id="dsEd_${k}"><td colspan="${4 + (only ? 1 : 0)}" data-label="">${editorHtml(k, on)}</td></tr>` : ''}`;
  /* Sources not set up are marked once, above the table, not in every row's sentence. */
  const idle = ['ls', 'graph', 'ad'].filter(x => !on[x] && ORDER_FIELDS.some(k => (!only || SOURCES_OF(k).includes(only)) && fieldOrder(st, k).includes(x)));
  const legend = idle.length ? html`<p class="note ds-legend"><span class="ds-src ds-dim">${SHORT[idle[0]]}</span> Dashed, like this: not set up yet (${list(idle.map(x => SHORT[x]))}). It writes nothing until it is; then the rules below apply.</p>` : '';
  const groups = groupsOf().map(([n, ks]) => /** @type {[string, string[]]} */ ([n, ks.filter(k => !only || SOURCES_OF(k).includes(only))])).filter(g => g[1].length);
  return html`${legend}<table class="grid mini ds-matrix stack"><thead><tr><th>Field</th>${only ? html`<th class="ds-write" title="Whether ${SOURCE_LABEL[only]} writes the field; a source not ticked is only shown beside it">Writes it</th>` : ''}<th>Sources, in order</th><th>What happens</th>${edit ? html`<th><span class="sr-only">Change</span></th>` : ''}</tr></thead>
    ${groups.map(([name, keys]) => html`<tbody><tr class="ds-grp"><th colspan="${(edit ? 4 : 3) + (only ? 1 : 0)}" scope="rowgroup">${name}</th></tr>${keys.map(row)}</tbody>`)}</table>`;
}
/* One explanation, used everywhere the field rules are. */
const fieldNote = edit => html`<details class="how ds-how"><summary>How a field is filled</summary><div class="ds-explain"><p>A value typed or picked by hand on a device always stays. Otherwise the sources write it in the order shown; a source higher up replaces what one below it wrote.</p>
    <p><b>Updates</b>: the source keeps the field in step with what it reports. <b>Only if empty</b>: it writes the field only while it is empty and never replaces a value. A source that is <b>shown only</b> writes nothing; its value is beside the field on the device page, to pick there.${edit ? " Change opens a field's sources under its row: a change applies at once, with Undo, and takes effect at each source's next sync; the line under the sources says how many devices it changes." : ''}</p></div></details>`;
/* The rows' buttons: the devices a field was set by hand on (listed in the Table), and Change… for an admin. */
function bindMatrix(root, on){
  root.querySelectorAll('[data-dshand]').forEach(b => b.onclick = () => { resetFilters(); st.handField = b.dataset.dshand; st.scope = null; st.tab = 'table'; closeModal(); render(); });
  if (!isAdmin()) return;
  root.querySelectorAll('[data-dsedit]').forEach(b => b.onclick = () => { const k = b.dataset.dsedit; dsOpen = dsOpen === k ? null : k; redraw();
    /** @type {HTMLElement|null} */ (document.querySelector(dsOpen ? `#dsEd_${CSS.escape(k)} [data-dson], #dsEd_${CSS.escape(k)} button` : `[data-dsedit="${CSS.escape(k)}"]`))?.focus(); });
  root.querySelectorAll('.ds-edrow').forEach(ed => bindEditor(/** @type {HTMLElement} */ (ed)));
}
/* The field whose sources are open for change, under its row (one at a time). */
let dsOpen = /** @type {string|null} */ (null);
/* A field's sources, changed in place (no dialog): each source with its place (1 first; one higher up replaces what one
   below it wrote), how it writes (Updates or Only if empty), arrows and a switch. Applied at once, with Undo; the line
   under them says what the field does now and how many devices get another value at the next sync. */
function editorHtml(k, on){
  const order = fieldOrder(st, k), all = [...order, ...SOURCES_OF(k).filter(x => !order.includes(x))];
  const item = (x, i) => { const use = order.includes(x), m = fieldMode(st, k, x);
    const note = !on[x] ? 'not set up yet' : globalOff(x) ? 'filling is off in its tab' : use ? '' : 'off: only shown beside the field';
    return html`<li class="ls-item ls-mode${use ? ' on' : ''}"><span class="ls-num" aria-hidden="true">${use ? i + 1 : ''}</span>
      <span class="ls-name"><b>${SOURCE_LABEL[x]}</b>${note ? html`<small>${note}</small>` : ''}</span>
      <span>${use ? html`<select data-dsmode="${x}" aria-label="${`How ${SOURCE_LABEL[x]} writes ${SYNC_FIELD_LABEL[k]}`}"><option value="update" ${m === 'update' ? 'selected' : ''}>Updates</option><option value="fill" ${m === 'fill' ? 'selected' : ''}>Only if empty</option></select>` : ''}</span>
      <span class="ls-move">${use && order.length > 1 ? html`<button type="button" class="icon ghost" data-dsmv="${x}|-1" ${i === 0 ? 'disabled' : ''} aria-label="${`Move ${SOURCE_LABEL[x]} up`}" title="Higher: replaces what the others wrote">▲</button><button type="button" class="icon ghost" data-dsmv="${x}|1" ${i === order.length - 1 ? 'disabled' : ''} aria-label="${`Move ${SOURCE_LABEL[x]} down`}">▼</button>` : ''}</span>
      <label class="switch" title="${use ? `Switch ${SOURCE_LABEL[x]} off: it writes nothing here, its value is only shown` : `Switch ${SOURCE_LABEL[x]} on`}"><input type="checkbox" data-dson="${x}" ${use ? 'checked' : ''} aria-label="${`${SOURCE_LABEL[x]} writes ${SYNC_FIELD_LABEL[k]}`}"><span aria-hidden="true"></span></label></li>`; };
  const n = new Set(previewOrder({}, [k]).map(x => x.o.id)).size;
  const set = (st.fieldOrder && st.fieldOrder[k]) || (st.fieldMode && st.fieldMode[k]);
  return html`<div class="locsrc ds-ed" data-dsfield="${k}"><ol class="locsrc-list">${all.map(item)}</ol>
    <div class="ds-ed-foot"><span class="ds-ed-says" aria-live="polite">${orderSentence(k, order)}${n ? html` <b>${n} ${n === 1 ? 'device gets' : 'devices get'} another value at the next sync.</b>` : ''}</span>
    ${set ? html`<button type="button" class="mini" data-dsdef="${k}">Back to the default</button>` : ''}</div></div>`;
}
function bindEditor(ed){
  const box = /** @type {HTMLElement|null} */ (ed.querySelector('[data-dsfield]')); if (!box) return;
  const k = box.dataset.dsfield, order = fieldOrder(st, k);
  const modes = () => Object.fromEntries(SOURCES_OF(k).map(x => [x, fieldMode(st, k, x)]));
  const say = (list, m) => list.length ? `from ${list.map(x => SHORT[x] + (m[x] === 'fill' ? ' (only if empty)' : '')).join(' › ')}` : 'from no source';
  /* Drawn again with the focus where it was (the same control, or the source's switch). */
  const apply = (list, m, focus) => setOrderNow(k, list, say(list, m), () => { redraw(); /** @type {HTMLElement|null} */ (document.querySelector(`#dsEd_${CSS.escape(k)} ${focus}`) || document.querySelector(`#dsEd_${CSS.escape(k)} [data-dson]`))?.focus(); }, m);
  ed.querySelectorAll('[data-dson]').forEach(c => c.onchange = () => { const x = c.dataset.dson;
    apply(c.checked ? [...order.filter(y => y !== x), x] : order.filter(y => y !== x), modes(), `[data-dson="${x}"]`); });
  ed.querySelectorAll('[data-dsmode]').forEach(s => s.onchange = () => { const m = { ...modes(), [s.dataset.dsmode]: s.value }; apply(order, m, `[data-dsmode="${s.dataset.dsmode}"]`); });
  ed.querySelectorAll('[data-dsmv]').forEach(b => b.onclick = () => { const [x, d] = b.dataset.dsmv.split('|'), i = order.indexOf(x), j = i + Number(d);
    if (i < 0 || j < 0 || j >= order.length) return; const next = [...order]; [next[i], next[j]] = [next[j], next[i]];
    apply(next, modes(), `[data-dsmv="${b.dataset.dsmv}"]:not([disabled])`); });
  const def = ed.querySelector('[data-dsdef]'); if (def) def.onclick = () => {
    const before = fieldState(k);
    st.fieldOrder = without(st.fieldOrder, k); st.fieldMode = without(st.fieldMode, k);
    /* Lansweeper's "may overwrite" box for the field goes back to its default too: the default order follows it. */
    if (k in DEFAULT_POLICY) st.policy = { ...(st.policy || {}), [k]: DEFAULT_POLICY[k] };
    queueServerSave(); redraw(); /** @type {HTMLElement|null} */ (document.querySelector(`#dsEd_${CSS.escape(k)} [data-dson]`))?.focus();
    toastUndo(`${SYNC_FIELD_LABEL[k]}: back to the default`, () => { restoreField(k, before); queueServerSave(); redraw(); });
  };
}
/* After a change: whichever list of field rules is on the page now is drawn again. */
function redraw(){ renderSetSources(); renderSourceFields(); }

/* Settings → Data sources → All fields: the field rules of every source in one place, with the quick setups, and what
   else each source brings. Each source's own state and settings are on its own tab. */
/* Gone devices, per source: how each one finds that a device has gone (since when for Lansweeper, the last full push
   and its size, a push or an AD read set aside as short), how many are gone now, and a button to list them. */
function goneHtml(on){
  const P = st.lsPresence, live = objs.filter(o => o.status !== 'retired');
  const n = k => live.filter(GONE_FILTERS[k][1]).length;
  const rows = [
    ['ls', 'Lansweeper', on.ls, !P ? 'Starts with the next push: each day notes the devices it brought.' : `Followed since ${dayText(P.since)}.${P.full ? ` Last full push ${dayText(P.full.day)}, ${P.full.n} devices.` : ' The first full push day is known once the next day starts.'}${P.short ? ` The push of ${dayText(P.short.day)} brought only ${P.short.n} of about ${P.short.of} devices and was set aside.` : ''} A device not in the full pushes of two days is gone.`],
    ['ad', 'Active Directory', on.ad, `A device whose computer account is no longer found is gone, from the sync that sees it.${st.adShort ? ` The read of ${dayText(st.adShort.day)} found only ${st.adShort.n} of ${st.adShort.of} accounts and was set aside.` : ''}`],
    ['graph', 'Entra & Intune', on.graph, 'A device the sync no longer finds in Entra or Intune is gone.'],
  ].filter(r => r[2]);
  if (!rows.length) return '';
  /* How many devices each of the last push days brought: a steady row means the thresholds hold; a dip is a short day. */
  const days = P && Array.isArray(P.days) ? P.days.slice(0, 14).reverse() : [];
  const top = Math.max(1, ...days.map(d => d.n));
  const sizes = on.ls && days.length > 1 ? html`<div class="ds-gonerow ds-pushsizes"><b>Push sizes</b><span class="ds-bars" role="img" aria-label="${`Devices per push day: ${days.map(d => `${dayText(d.day)} ${d.n}`).join(', ')}`}">${days.map(d => html`<span class="ds-bar${P.full && d.n < P.full.n / 2 ? ' short' : ''}" title="${`${dayText(d.day)}: ${d.n} devices`}"><i style="height:${Math.max(4, Math.round(d.n / top * 100))}%"></i></span>`)}</span><span class="note">${days[days.length - 1].n} on ${dayText(days[days.length - 1].day)}, ${Math.min(...days.map(d => d.n))} to ${top} in ${days.length} days</span></div>` : '';
  /* The limits of the Overview's Where are they? (and the weekly e-mail): how long without a sign of a device counts. */
  const ctx = whereCtx(), opt = (/** @type {number} */ cur) => WHERE_DAY_CHOICES.map(d => html`<option value="${d}" ${d === cur ? 'selected' : ''}>${span(d)}</option>`);
  const ro = isAdmin() ? '' : 'disabled';
  const limits = html`<div class="ds-gonerow ds-where"><b>Where are they?</b><span class="note">On the Overview and in the weekly e-mail: a device counts as not seen, or not scanned, after this long.</span>
    <span class="ds-wsel"><label for="wdUnseen">Not seen for</label><select id="wdUnseen" ${ro}>${opt(ctx.unseenDays)}</select>${on.ls ? html`<label for="wdScan">Not scanned for</label><select id="wdScan" ${ro}>${opt(ctx.scanDays)}</select>` : ''}</span></div>`;
  return html`<div class="panelbox"><div class="hdr">Gone devices <span class="cnt">${n('any')} gone from a source · ${n('all')} from all</span></div><div class="ds-gone">${sizes}${rows.map(([k, label, , how]) => html`<div class="ds-gonerow"><b>${label}</b><span class="note">${how}</span><button type="button" data-dsgone="${k}" ${n(k) ? '' : 'disabled'}>${n(k) ? `Show ${n(k)}` : 'None gone'}</button></div>`)}${limits}</div></div>`;
}
export function renderSetSources(){
  const root = $('#setSources'); if (!root) return;
  const on = sourcesOn(), edit = isAdmin();
  const custom = !!((st.fieldOrder && Object.keys(st.fieldOrder).length) || (st.fieldMode && Object.keys(st.fieldMode).length));
  /* The sources, each opening its own tab: the same dot as its page's header. */
  const srcs = ['ls', 'ad', 'graph'].map(src => { const s = sourceState(src), ready = on[src]; return html`<div class="ds-srccard${ready ? '' : ' idle'}"><div class="ds-srctop"><span class="dot ${s.cls}" aria-hidden="true"></span><b>${SOURCE_LABEL[src]}</b><span class="muted">${s.text}</span></div>
    <p class="ds-srcwhat">${SOURCE_BLURB[src]}</p><button type="button" class="ds-srcbtn${ready ? '' : ' primary'}" data-dstab="${SOURCE_TAB[src]}" aria-label="${(ready ? 'Open ' : 'Set up ') + SOURCE_LABEL[src]}">${ready ? 'Open' : 'Set up'}</button></div>`; });
  /* Three common setups, each one click (with the preview and Undo); the one the fields follow now is marked. */
  const same = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});
  const presetNow = custom ? ['ls', 'graph', 'fill'].find(p => { const n = presetOf(p); return same(n.fieldOrder, st.fieldOrder) && same(n.fieldMode, st.fieldMode); }) : '';
  const presets = edit ? html`<div class="ds-presets"><span class="muted">Quick setup:</span>${Object.entries(PRESETS).map(([k, [l, tip]]) => html`<button type="button" data-dspreset="${k}" title="${tip}" aria-pressed="${String(presetNow === k)}" class="${presetNow === k ? 'on' : ''}">${l}</button>`)}</div>` : '';
  const nSet = Object.keys(st.fieldOrder || {}).length;
  const reset = edit && custom ? html`<div class="ds-foot"><span class="muted">${nSet} field${nSet === 1 ? '' : 's'} set here (Custom)</span><button type="button" id="dsReset">Back to the defaults</button></div>` : '';
  const extras = Object.entries(SOURCE_EXTRAS).map(([src, list]) => html`<div class="ds-card${on[src] ? '' : ' off'}"><div class="ds-head"><b>${SOURCE_LABEL[src]}</b></div>
    <dl class="ds-dl">${list.map(([what, how]) => html`<dt>${what}</dt><dd>${how}</dd>`)}</dl></div>`);

  root.innerHTML = html`<div class="panelbox"><div class="hdr">Sources</div><p class="note ds-intro">Where the inventory's data comes from. Each is optional and only read, never written to: set up the ones you have.</p><div class="ds-srcs">${srcs}</div></div>
${goneHtml(on)}
    <div class="panelbox"><div class="hdr">Device fields</div>${fieldNote(edit)}${presets}<details class="ds-adv" id="dsAdv" ${custom || advOpen ? 'open' : ''}><summary>Advanced: field by field</summary><div class="ds-scroll">${matrixHtml(on)}</div>${reset}</details></div>
    <details class="panelbox fold ds-beyond"><summary class="hdr">Beyond the fields <span class="cnt">what else each source brings</span></summary><div class="ds-cards ds-wide">${extras}</div></details>
    <div class="panelbox"><div class="hdr">People</div><dl class="ds-dl ds-pad">${PEOPLE_SOURCES.map(([what, how]) => html`<dt>${what}</dt><dd>${how}</dd>`)}</dl></div>
    <div class="panelbox"><div class="hdr">Never</div><ul class="ds-never">${NEVER.map(n => html`<li>${n}</li>`)}</ul></div>`;

  for (const [id, k] of [['#wdUnseen', 'unseen'], ['#wdScan', 'scan']]){
    const sel = /** @type {HTMLSelectElement|null} */ (root.querySelector(id)); if (!sel || !isAdmin()) continue;
    sel.onchange = () => {
      const was = { ...(st.whereDays || {}) }, d = Number(sel.value);
      st.whereDays = { ...was, [k]: d }; if (d === 90) delete st.whereDays[k];
      queueServerSave(); render();
      toastUndo(`${k === 'unseen' ? 'Not seen' : 'Not scanned'} now counts after ${span(d)}`, () => { st.whereDays = was; queueServerSave(); render(); renderSetSources(); });
    };
  }
  root.querySelectorAll('[data-dsgone]').forEach(b => b.onclick = () => { closeModal(); resetFilters(); st.scope = null; st.gone = /** @type {HTMLElement} */ (b).dataset.dsgone; st.tab = 'cards'; view(); });
  root.querySelectorAll('[data-dstab]').forEach(b => b.onclick = () => { st.setTab = b.dataset.dstab; renderSetPane(); $('#setPane').scrollTop = 0; });
  bindMatrix(root, on);
  if (!edit) return;
  const adv = $('#dsAdv'); if (adv) adv.ontoggle = () => { advOpen = adv.open; };
  root.querySelectorAll('[data-dspreset]').forEach(b => b.onclick = () => {
    const [name] = PRESETS[b.dataset.dspreset], next = presetOf(b.dataset.dspreset);
    confirmChange(`Quick setup: ${name}`, next, ORDER_FIELDS, () => {
      const before = { fieldOrder: st.fieldOrder, fieldMode: st.fieldMode, policy: st.policy };
      Object.assign(st, next); queueServerSave(); redraw();
      toastUndo(`Quick setup: ${name}`, () => { Object.assign(st, before); queueServerSave(); redraw(); });
    });
  });
  const resetPolicy = () => ({ ...(st.policy || {}), ...Object.fromEntries(ORDER_FIELDS.filter(k => k in DEFAULT_POLICY).map(k => [k, DEFAULT_POLICY[k]])) });
  const rs = $('#dsReset'); if (rs) rs.onclick = () => confirmChange('Field sources back to the defaults', { fieldOrder: null, fieldMode: null, policy: resetPolicy() }, ORDER_FIELDS, () => {
    const before = { fieldOrder: st.fieldOrder, fieldMode: st.fieldMode, policy: st.policy };
    st.fieldOrder = null; st.fieldMode = null; st.policy = resetPolicy(); queueServerSave(); redraw();
    toastUndo('Field sources back to the defaults', () => { Object.assign(st, before); queueServerSave(); redraw(); });
  });
}

/* "Fields from this source" on a source's own tab (#srcFields, data-src ls, ad or graph): its switch for filling fields,
   the rules of the fields it knows, with the same controls as All fields, and what else it brings. */
export function renderSourceFields(){
  const root = $('#srcFields'); if (!root) return;
  const src = root.dataset.src, on = sourcesOn(), edit = isAdmin(), ro = edit ? '' : 'disabled';
  const fill = src === 'ad' ? html`<div class="lpanel-add"><label class="pchk" style="width:auto"><input type="checkbox" id="lk_fillAd" ${st.fillAd !== false ? 'checked' : ''} ${ro}> Fill in an empty operating system and domain from the computer account</label></div>
      <p class="note ds-intro">Only in the order below: a value set by hand, from Lansweeper or from Intune goes first. The device shows where a value came from.</p>`
    : src === 'graph' ? html`<div class="lpanel-add"><label class="pchk" style="width:auto"><input type="checkbox" id="gFill" ${st.fillGraph !== false ? 'checked' : ''} ${ro}> Fill in empty fields from Intune</label></div>
      <p class="note ds-intro">Intune can fill in a device's empty operating system, model, MAC address, memory and disks. A value set by hand or from Lansweeper goes first; one from Active Directory gives way. The device shows where a value came from.</p>` : '';
  /* Lansweeper also writes fields that have no order (its user, software, links…): ticked per field. */
  /* The fields in the table are ticked there (Writes it); here only what has no row: its user, and what else it brings. */
  const lsWrites = src === 'ls' ? html`<div class="ds-subhdr">Also from Lansweeper</div>${rawHtml(policyGrid(Object.keys(FIELD_LABEL).filter(k => !ORDER_FIELDS.includes(k) || !SOURCES_OF(k).includes('ls'))))}<p class="note" style="padding:10px 12px">A value set by hand on a device always stays. Name and serial number find the device and are never changed.</p>` : '';
  const extras = [src, ...(src === 'graph' ? ['autopilot'] : [])].flatMap(x => SOURCE_EXTRAS[x] || []);
  root.innerHTML = html`<div class="panelbox"><div class="hdr">Fields from this source</div>${fill}${fieldNote(edit)}<div class="ds-scroll">${matrixHtml(on, src)}</div>${lsWrites}
    ${extras.length ? html`<details class="how ds-beyond-src"><summary>What else it brings</summary><dl class="ds-dl ds-pad">${extras.map(([what, how]) => html`<dt>${what}</dt><dd>${how}</dd>`)}</dl></details>` : ''}</div>
    ${src === 'graph' ? intuneCoverageHtml() : ''}`;
  bindMatrix(root, on);
  if (!edit) return;
  root.querySelectorAll('[data-dswrite]').forEach(c => c.onchange = () => toggleSource(c.dataset.dswrite, src, c.checked));
  /* Filling turned off makes the source "off" in its rules: they are drawn again. */
  const ad = $('#lk_fillAd'); if (ad) ad.onchange = () => { st.fillAd = ad.checked; queueServerSave(); renderSourceFields(); $('#lk_fillAd')?.focus(); };
  const gf = $('#gFill'); if (gf) gf.onchange = () => { st.fillGraph = gf.checked; queueServerSave(); renderSourceFields(); $('#gFill')?.focus(); };
  bindPolicy(root);
  root.querySelectorAll('[data-pol]').forEach(c => c.addEventListener('change', () => { const k = c.dataset.pol; renderSourceFields(); $(`#srcFields [data-pol="${k}"]`)?.focus(); }));
}
/* "Writes it" on a source's tab: the source into the field's order (first, as Lansweeper's box did) or out of it, shown
   first when it changes devices, with Undo. Lansweeper on a field without an order set only turns its box. */
function toggleSource(k, src, use){
  const order = fieldOrder(st, k).filter(x => x !== src), what = `${SOURCE_LABEL[src]} ${use ? 'writes it' : 'only shown'}`;
  if (src === 'ls' && !(k in LS_FILL) && !(st.fieldOrder && st.fieldOrder[k])) {
    const policy = { ...(st.policy || {}), [k]: use };
    confirmChange(`${SYNC_FIELD_LABEL[k]}: ${what}`, { policy }, [k], () => {
      const before = fieldState(k); st.policy = policy; queueServerSave(); redraw();
      toastUndo(`${SYNC_FIELD_LABEL[k]}: ${what}`, () => { restoreField(k, before); queueServerSave(); redraw(); });
    });
    redraw(); return;
  }
  /* Back in: Lansweeper first; another source at its usual place when the order is the usual one, else last. */
  const known = SOURCES_OF(k), usual = order.every((x, i) => i === 0 || known.indexOf(order[i - 1]) < known.indexOf(x));
  const next = !use ? order : src === 'ls' ? ['ls', ...order] : usual ? known.filter(x => x === src || order.includes(x)) : [...order, src];
  setOrder(k, next, what);
}
/* Change… for one field: its sources as a list in their order, each used or shown only, moved up and down; what that
   means is said below as it changes. Save shows what it changes on the devices first (confirmChange). */
