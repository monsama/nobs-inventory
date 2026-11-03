/* Settings → Data sources: who wins when several sources know a field, for all of them (All fields) and for one (Fields
   from this source, on its own tab), and what else each brings. Drawn from sync-map.js (the lists the syncs themselves
   use) and from the current settings, so it changes with them and is never out of date. */
import { $, DEFAULT_POLICY, SYNC, objs, st, toastUndo } from './01-core.js';
import { closeModal, modal } from './19-modal.js';
import { LS_FILL, MODES, NEVER, ORDER_FIELDS, PEOPLE_SOURCES, SOURCES_OF, SOURCE_EXTRAS, SOURCE_LABEL, SYNC_FIELD_LABEL, fieldMode, fieldOrder, maySet } from './sync-map.js';
import { queueServerSave, render } from './07-render.js';
import { isAdmin, renderSetPane } from './04-settings.js';
import { resetFilters } from './02-views.js';
import { bindPolicy, policyGrid } from './03-object-modals.js';
import { SOURCE_TAB, sourceOn, sourceState } from './settings-status.js';
import { intuneCoverageHtml } from './settings-graph.js';
import { html, rawHtml } from './html.js';

const SHORT = { ls: 'Lansweeper', graph: 'Entra & Intune', ad: 'AD' };
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
const FIELD_GROUPS = [
  ['Network', ['ip', 'ip6', 'mac', 'mask', 'gateway', 'dns', 'dhcp']],
  ['Hardware', ['model', 'cpu', 'ram', 'disk', 'fw']],
  ['System', ['os', 'patch', 'av', 'domain', 'boot']],
  ['Place and description', ['loc', 'purpose']],
  ['Purchase and warranty', ['purchased', 'warranty', 'price', 'supplier', 'invoice']],
];
const groupsOf = () => { const known = FIELD_GROUPS.flatMap(g => g[1]); const other = ORDER_FIELDS.filter(k => !known.includes(k)); return [...FIELD_GROUPS.map(([n, ks]) => [n, ks.filter(k => ORDER_FIELDS.includes(k))]), ...(other.length ? [['Other', other]] : [])].filter(g => g[1].length); };
/* AD and Entra & Intune fill nothing while filling is turned off in their tab. */
const globalOff = src => (src === 'graph' && st.fillGraph === false) || (src === 'ad' && st.fillAd === false);
const list = names => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
/* What the order of field k means, in one plain sentence: who sets it, who only fills a gap, who is only shown. */
/* The field-by-field table stays open while this page is open, once opened. */
let advOpen = false;
export function orderSentence(k, order, modes = st.fieldMode){
  const used = order.filter(x => !globalOff(x)), shown = SOURCES_OF(k).filter(x => !used.includes(x));
  if (!used.length) return `No source writes it: it is kept as typed.${shown.length ? ` ${list(shown.map(x => SHORT[x]))} ${shown.length === 1 ? 'is' : 'are'} shown beside the field.` : ''}`;
  const mode = x => fieldMode({ fieldMode: modes, fieldOrder: st.fieldOrder, policy: st.policy }, k, x);
  const says = used.map((x, i) => mode(x) === 'fill' ? `${SHORT[x]} writes it only while it is empty`
    : i === 0 ? (x === 'ls' && !LS_FILL[k] ? 'Lansweeper keeps it up to date at every scan' : `${SHORT[x]} keeps it up to date`)
    : `${SHORT[x]} keeps it up to date where ${list(used.slice(0, i).map(y => SHORT[y]))} ${i === 1 ? 'has' : 'have'} no value`);
  /* A source in the order that is not set up writes nothing yet: said, so the sentence is not read as what happens now. */
  const idle = SOURCES_ON ? used.filter(x => !SOURCES_ON[x]) : [];
  return says.join('; ') + '.' + (idle.length ? ` ${list(idle.map(x => SHORT[x]))} ${idle.length === 1 ? 'is' : 'are'} not set up: ${idle.length === 1 ? 'it writes' : 'they write'} nothing yet.` : '');
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
      ${shown.map(x => html`<tr><td><b>${x.o.name}</b> <span class="code">${x.o.code || ''}</span></td>${many ? html`<td>${SYNC_FIELD_LABEL[x.k]}</td>` : ''}<td class="muted">${String(x.from ?? '') || '—'}</td><td><b>${x.to ?? ''}</b></td><td>${SHORT[x.src] || ''}</td></tr>`)}
      </tbody></table></div>${list.length > shown.length ? html`<p class="note">And ${list.length - shown.length} more.</p>` : ''}</div>
    <div class="mf"><button id="dpCancel">Cancel</button><button id="dpOk" class="primary">Apply</button></div>`, 'wide');
  $('#dpCancel').onclick = () => closeModal();
  $('#dpOk').onclick = () => { closeModal(); apply(); };
}
/* Sets the sources of field k to list (in order), kept with Lansweeper's "Feed may overwrite" box, with Undo; shown first
   when it changes devices. */
function setOrder(k, list, what, modes = null){
  const policy = SOURCES_OF(k).includes('ls') && !LS_FILL[k] ? { ...(st.policy || {}), [k]: list.includes('ls') } : st.policy;
  const fo = { ...(st.fieldOrder || {}), [k]: list };
  const fm = modes ? { ...(st.fieldMode || {}), [k]: Object.fromEntries(list.map(x => [x, modes[x] || 'update'])) } : st.fieldMode;
  confirmChange(`${SYNC_FIELD_LABEL[k]}: ${what}`, { fieldOrder: fo, fieldMode: fm, policy }, [k], () => {
    const before = { fieldOrder: st.fieldOrder, fieldMode: st.fieldMode, policy: st.policy };
    st.fieldOrder = fo; st.fieldMode = fm; st.policy = policy;
    queueServerSave(); redraw();
    toastUndo(`${SYNC_FIELD_LABEL[k]}: ${what}`, () => { Object.assign(st, before); queueServerSave(); redraw(); });
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
    <td class="ds-chain">${chain(k)}</td><td class="ds-how">${orderSentence(k, fieldOrder(st, k))}</td>${edit ? html`<td class="ds-act"><button type="button" class="mini" data-dsedit="${k}" aria-label="Change the sources of ${SYNC_FIELD_LABEL[k]}">Change…</button></td>` : ''}</tr>`;
  const groups = groupsOf().map(([n, ks]) => [n, ks.filter(k => !only || SOURCES_OF(k).includes(only))]).filter(g => g[1].length);
  return html`<table class="grid mini ds-matrix stack"><thead><tr><th>Field</th><th>Sources, in order</th><th>What happens</th>${edit ? html`<th><span class="sr-only">Change</span></th>` : ''}</tr></thead>
    ${groups.map(([name, keys]) => html`<tbody><tr class="ds-grp"><th colspan="${edit ? 4 : 3}" scope="rowgroup">${name}</th></tr>${keys.map(row)}</tbody>`)}</table>`;
}
/* One explanation, used everywhere the field rules are. */
const fieldNote = edit => html`<details class="how ds-how"><summary>How a field is filled</summary><div class="ds-explain"><p>A value typed or picked by hand on a device always stays. Otherwise the sources write it in the order shown; a source higher up replaces what one below it wrote.</p>
    <p><b>Updates</b>: the source keeps the field in step with what it reports. <b>Only if empty</b>: it writes the field only while it is empty and never replaces a value. A source that is <b>shown only</b> writes nothing; its value is beside the field on the device page, to pick there.${edit ? " Changes apply at each source's next sync, after a preview of what they change." : ''}</p></div></details>`;
/* The rows' buttons: the devices a field was set by hand on (listed in the Table), and Change… for an admin. */
function bindMatrix(root, on){
  root.querySelectorAll('[data-dshand]').forEach(b => b.onclick = () => { resetFilters(); st.handField = b.dataset.dshand; st.scope = null; st.tab = 'table'; closeModal(); render(); });
  if (isAdmin()) root.querySelectorAll('[data-dsedit]').forEach(b => b.onclick = () => editOrder(b.dataset.dsedit, on));
}
/* After a change: whichever list of field rules is on the page now is drawn again. */
function redraw(){ renderSetSources(); renderSourceFields(); }

/* Settings → Data sources → All fields: the field rules of every source in one place, with the quick setups, and what
   else each source brings. Each source's own state and settings are on its own tab. */
export function renderSetSources(){
  const root = $('#setSources'); if (!root) return;
  const on = sourcesOn(), edit = isAdmin();
  const custom = !!((st.fieldOrder && Object.keys(st.fieldOrder).length) || (st.fieldMode && Object.keys(st.fieldMode).length));
  /* The sources, each opening its own tab: the same dot as its page's header. */
  const srcs = ['ls', 'ad', 'graph'].map(src => { const s = sourceState(src); return html`<button type="button" class="ds-srcbtn" data-dstab="${SOURCE_TAB[src]}"><span class="dot ${s.cls}" aria-hidden="true"></span><b>${SOURCE_LABEL[src]}</b><span class="muted">${s.text}</span></button>`; });
  /* Three common setups, each one click (with the preview and Undo). */
  const presets = edit ? html`<div class="ds-presets"><span class="muted">Quick setup:</span>${Object.entries(PRESETS).map(([k, [l, tip]]) => html`<button type="button" data-dspreset="${k}" title="${tip}">${l}</button>`)}</div>` : '';
  const nSet = Object.keys(st.fieldOrder || {}).length;
  const reset = edit && custom ? html`<div class="ds-foot"><span class="muted">${nSet} field${nSet === 1 ? '' : 's'} set here (Custom)</span><button type="button" id="dsReset">Back to the defaults</button></div>` : '';
  const extras = Object.entries(SOURCE_EXTRAS).map(([src, list]) => html`<div class="ds-card${on[src] ? '' : ' off'}"><div class="ds-head"><b>${SOURCE_LABEL[src]}</b></div>
    <dl class="ds-dl">${list.map(([what, how]) => html`<dt>${what}</dt><dd>${how}</dd>`)}</dl></div>`);

  root.innerHTML = html`<div class="panelbox"><div class="hdr">Sources</div><p class="note ds-intro">Each source has a tab of its own: how it is doing, its connection and its fields. This page shows the fields of all of them together, drawn from the same lists the syncs use.</p><div class="ds-srcs">${srcs}</div></div>
    <div class="panelbox"><div class="hdr">Device fields</div>${fieldNote(edit)}${presets}<details class="ds-adv" id="dsAdv" ${custom || advOpen ? 'open' : ''}><summary>Advanced: field by field</summary><div class="ds-scroll">${matrixHtml(on)}</div>${reset}</details></div>
    <details class="panelbox fold ds-beyond"><summary class="hdr">Beyond the fields <span class="cnt">what else each source brings</span></summary><div class="ds-cards ds-wide">${extras}</div></details>
    <div class="panelbox"><div class="hdr">People</div><dl class="ds-dl ds-pad">${PEOPLE_SOURCES.map(([what, how]) => html`<dt>${what}</dt><dd>${how}</dd>`)}</dl></div>
    <div class="panelbox"><div class="hdr">Never</div><ul class="ds-never">${NEVER.map(n => html`<li>${n}</li>`)}</ul></div>`;

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
  const lsWrites = src === 'ls' ? html`<div class="ds-subhdr">What Lansweeper writes</div>${rawHtml(policyGrid())}<p class="note" style="padding:10px 12px">The fields Lansweeper writes on every device. Who else writes a field, and whether a source updates it or only fills it while empty, is set above and in All fields. A value set by hand on a device always stays. Name and serial number find the device and are never changed.</p>` : '';
  const extras = [src, ...(src === 'graph' ? ['autopilot'] : [])].flatMap(x => SOURCE_EXTRAS[x] || []);
  root.innerHTML = html`<div class="panelbox"><div class="hdr">Fields from this source</div>${fill}${fieldNote(edit)}<div class="ds-scroll">${matrixHtml(on, src)}</div>${lsWrites}
    ${extras.length ? html`<details class="how ds-beyond-src"><summary>What else it brings</summary><dl class="ds-dl ds-pad">${extras.map(([what, how]) => html`<dt>${what}</dt><dd>${how}</dd>`)}</dl></details>` : ''}</div>
    ${src === 'graph' ? rawHtml(intuneCoverageHtml()) : ''}`;
  bindMatrix(root, on);
  if (!edit) return;
  /* Filling turned off makes the source "off" in its rules: they are drawn again. */
  const ad = $('#lk_fillAd'); if (ad) ad.onchange = () => { st.fillAd = ad.checked; queueServerSave(); renderSourceFields(); $('#lk_fillAd')?.focus(); };
  const gf = $('#gFill'); if (gf) gf.onchange = () => { st.fillGraph = gf.checked; queueServerSave(); renderSourceFields(); $('#gFill')?.focus(); };
  bindPolicy(root);
  root.querySelectorAll('[data-pol]').forEach(c => c.addEventListener('change', () => { const k = c.dataset.pol; renderSourceFields(); $(`#srcFields [data-pol="${k}"]`)?.focus(); }));
}
/* Change… for one field: its sources as a list in their order, each used or shown only, moved up and down; what that
   means is said below as it changes. Save shows what it changes on the devices first (confirmChange). */
function editOrder(k, on){
  const known = SOURCES_OF(k);
  let order = fieldOrder(st, k).slice(), use = new Set(order);
  const modes = Object.fromEntries(SOURCES_OF(k).map(x => [x, fieldMode(st, k, x)]));
  const rows = () => [...order, ...known.filter(x => !order.includes(x))];
  const draw = () => {
    const all = rows();
    $('#dsList').innerHTML = html`${all.map(x => html`<li class="ds-li${use.has(x) ? '' : ' off'}"><span class="ds-pos">${use.has(x) ? order.indexOf(x) + 1 : ''}</span>
      <label class="ds-use"><input type="checkbox" data-dsuse="${x}" ${use.has(x) ? 'checked' : ''}> <b>${SOURCE_LABEL[x]}</b></label>
      ${use.has(x) ? html`<select data-dsmode="${x}" aria-label="How ${SOURCE_LABEL[x]} writes it"><option value="update" ${modes[x] === 'update' ? 'selected' : ''}>Updates</option><option value="fill" ${modes[x] === 'fill' ? 'selected' : ''}>Only if empty</option></select>` : ''}
      <span class="muted ds-li-note">${!on[x] ? 'not set up' : globalOff(x) ? 'filling is off in its tab' : use.has(x) ? '' : 'shown only'}</span>
      <span class="ds-move"><button type="button" class="icon ghost" data-dsup="${x}" aria-label="Move ${SOURCE_LABEL[x]} up" ${!use.has(x) || order.indexOf(x) === 0 ? 'disabled' : ''}>▲</button><button type="button" class="icon ghost" data-dsdown="${x}" aria-label="Move ${SOURCE_LABEL[x]} down" ${!use.has(x) || order.indexOf(x) === order.length - 1 ? 'disabled' : ''}>▼</button></span></li>`)}`;
    $('#dsSays').textContent = orderSentence(k, order, { ...(st.fieldMode || {}), [k]: modes });
    document.querySelectorAll('[data-dsmode]').forEach(sel => sel.onchange = () => { modes[sel.dataset.dsmode] = sel.value; draw(); });

    document.querySelectorAll('[data-dsuse]').forEach(c => c.onchange = () => { const x = c.dataset.dsuse; if (c.checked){ use.add(x); order.push(x); } else { use.delete(x); order = order.filter(y => y !== x); } draw(); document.querySelector(`[data-dsuse="${x}"]`)?.focus(); });
    const move = (x, d) => { const i = order.indexOf(x), j = i + d; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; draw(); (document.querySelector(`[data-ds${d < 0 ? 'up' : 'down'}="${x}"]:not([disabled])`) || document.querySelector(`[data-ds${d < 0 ? 'down' : 'up'}="${x}"]:not([disabled])`) || document.querySelector(`[data-dsuse="${x}"]`))?.focus(); };
    document.querySelectorAll('[data-dsup]').forEach(b => b.onclick = () => move(b.dataset.dsup, -1));
    document.querySelectorAll('[data-dsdown]').forEach(b => b.onclick = () => move(b.dataset.dsdown, 1));
  };
  const set = (st.fieldOrder && st.fieldOrder[k]) || (st.fieldMode && st.fieldMode[k]);
  modal(html`<div class="mh">${SYNC_FIELD_LABEL[k]}: where it comes from</div>
    <div class="mb"><p class="note">Tick the sources that write this field and put them in order: one higher up replaces what one below it wrote. For each, Updates keeps the field in step; Only if empty never replaces a value. A source not ticked is only shown beside the field.</p>
      <ol class="ds-list" id="dsList"></ol><p class="ds-says" id="dsSays" aria-live="polite"></p></div>
    <div class="mf">${set ? html`<button id="dsDefault">Back to the default</button>` : ''}<span class="grow"></span><button id="dsCancel">Cancel</button><button id="dsSave" class="primary">Save</button></div>`, 'sm');
  draw();
  $('#dsCancel').onclick = () => closeModal();
  $('#dsSave').onclick = () => {
    closeModal();
    const modeChanged = order.some(x => modes[x] !== fieldMode(st, k, x));
    if (order.join() !== fieldOrder(st, k).join() || modeChanged) setOrder(k, order, `from ${order.length ? order.map(x => SHORT[x] + (modes[x] === 'fill' ? ' (only if empty)' : '')).join(' › ') : 'no source'}`, modes);
  };
  const dd = $('#dsDefault'); if (dd) dd.onclick = () => {
    closeModal();
    const rest = { ...st.fieldOrder }; delete rest[k];
    const fo = Object.keys(rest).length ? rest : null;
    const restM = { ...(st.fieldMode || {}) }; delete restM[k];
    const fm = Object.keys(restM).length ? restM : null;
    /* Lansweeper's "may overwrite" box for the field goes back to its default too: the default order follows it. */
    const policy = k in DEFAULT_POLICY ? { ...(st.policy || {}), [k]: DEFAULT_POLICY[k] } : st.policy;
    confirmChange(`${SYNC_FIELD_LABEL[k]}: back to the default`, { fieldOrder: fo, fieldMode: fm, policy }, [k], () => {
      const before = { fieldOrder: st.fieldOrder, fieldMode: st.fieldMode, policy: st.policy };
      st.fieldOrder = fo; st.fieldMode = fm; st.policy = policy; queueServerSave(); redraw();
      toastUndo(`${SYNC_FIELD_LABEL[k]}: back to the default`, () => { Object.assign(st, before); queueServerSave(); redraw(); });
    });
  };
}
