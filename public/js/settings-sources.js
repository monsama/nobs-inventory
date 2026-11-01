/* Settings → Data sources: what each source brings into the inventory, who wins when several know a field, and how each
   is set up here right now. Drawn from sync-map.js (the lists the syncs themselves use) and from the current settings,
   so it changes with them and is never out of date. */
import { $, DEFAULT_POLICY, LS_ON, SYNC, esc, objs, st, toastUndo } from './01-core.js';
import { closeModal, modal } from './19-modal.js';
import { LS_FILL, MODES, NEVER, ORDER_FIELDS, PEOPLE_SOURCES, SOURCES_OF, SOURCE_EXTRAS, SOURCE_LABEL, SYNC_FIELD_LABEL, fieldMode, fieldOrder, maySet } from './sync-map.js';
import { SERVER, queueServerSave, render } from './07-render.js';
import { canEdit } from './04-settings.js';
import { resetFilters } from './02-views.js';
import { runOf, summary, when } from './16-sync.js';

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
export function orderSentence(k, order, modes = st.fieldMode){
  const used = order.filter(x => !globalOff(x)), shown = SOURCES_OF(k).filter(x => !used.includes(x));
  if (!used.length) return `No source writes it: it is kept as typed.${shown.length ? ` ${list(shown.map(x => SHORT[x]))} ${shown.length === 1 ? 'is' : 'are'} shown beside the field.` : ''}`;
  const mode = x => fieldMode({ fieldMode: modes, fieldOrder: st.fieldOrder, policy: st.policy }, k, x);
  const says = used.map((x, i) => mode(x) === 'fill' ? `${SHORT[x]} writes it only while it is empty`
    : i === 0 ? (x === 'ls' && !LS_FILL[k] ? 'Lansweeper keeps it up to date at every scan' : `${SHORT[x]} keeps it up to date`)
    : `${SHORT[x]} keeps it up to date where ${list(used.slice(0, i).map(y => SHORT[y]))} ${i === 1 ? 'has' : 'have'} no value`);
  return says.join('; ') + '.';
}

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
  modal(`<div class="mh">${esc(title)}</div>
    <div class="mb"><p class="note">${devices} ${devices === 1 ? 'device gets' : 'devices get'} ${list.length === devices ? 'another value' : `${list.length} other values`} with this, at the next sync of each source. Values set or picked by hand on a device stay as they are.</p>
      <div class="ds-prev"><table class="grid mini"><thead><tr><th>Device</th>${many ? '<th>Field</th>' : ''}<th>Now</th><th>Then</th><th>From</th></tr></thead><tbody>
      ${shown.map(x => `<tr><td><b>${esc(x.o.name)}</b> <span class="code">${esc(x.o.code || '')}</span></td>${many ? `<td>${esc(SYNC_FIELD_LABEL[x.k])}</td>` : ''}<td class="muted">${esc(x.from ?? '') || '—'}</td><td><b>${esc(x.to ?? '')}</b></td><td>${esc(SHORT[x.src] || '')}</td></tr>`).join('')}
      </tbody></table></div>${list.length > shown.length ? `<p class="note">And ${list.length - shown.length} more.</p>` : ''}</div>
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
    queueServerSave(); renderSetSources();
    toastUndo(`${SYNC_FIELD_LABEL[k]}: ${what}`, () => { Object.assign(st, before); queueServerSave(); renderSetSources(); });
  });
  /* Until applied, the lists show what is saved. */
  renderSetSources();
}

export function renderSetSources(){
  const root = $('#setSources'); if (!root) return;
  const on = { ls: LS_ON(), ad: !!(SERVER.ldap || (st.ldap && st.ldap.url)), graph: !!(SERVER.graph || SYNC.graph), defender: false };
  /* Defender is read by the Entra & Intune sync, when turned on there. */
  on.defender = on.graph && !!SYNC.defender;
  on.autopilot = on.graph;
  const intake = src => (st.intake || {})[src] === 'direct' ? 'go straight into the inventory' : 'wait in To review';

  /* What the last sync of a source changed on the fields, and the devices it changed (server/sync-changes.js). */
  const changesHtml = src => {
    const c = (st.syncChanges || {})[src]; if (!c || (!c.n && !(c.earlier || []).length)) return '';
    const part = (o, verb) => { const e = Object.entries(o || {}).sort((a, b) => b[1] - a[1]); return e.length ? `${verb} ${list(e.slice(0, 4).map(([f, n]) => `${f} on ${n}`))}${e.length > 4 ? ` and ${e.length - 4} more` : ''}` : ''; };
    const says = r => { const x = [part(r.changed, 'changed'), part(r.filled, 'filled in')].filter(Boolean).join('; '); return x.charAt(0).toUpperCase() + x.slice(1); };
    const show = (r, i) => `<button type="button" class="link" data-dschg="${src}" data-dsrun="${i}">${r.n === 1 ? 'Show the device' : `Show the ${r.n} devices`}</button>`;
    const earlier = c.earlier || [];
    return `<div class="ds-changes">${c.n ? `${esc(says(c))} ${show(c, -1)}` : 'The last run changed nothing.'}
      ${earlier.length ? `<details class="ds-earlier"><summary>Earlier runs (${earlier.length})</summary><ul>${earlier.map((r, i) => `<li><span class="muted">${esc(when(r.at))}</span> ${esc(says(r))} ${show(r, i)}</li>`).join('')}</ul></details>` : ''}</div>`;
  };
  /* One card per source: set up or not, its last run, where its new devices go and whether it fills fields. */
  const card = (src, runKey, lines) => {
    const r = runKey ? runOf(runKey) : null;
    const run = !runKey ? '' : !r ? 'Not run yet' : r.ok ? `Last run ${when(r.at)}${r.how === 'push' ? ' (push)' : ''}: ${summary(runKey, r.counts)}` : `Last run ${when(r.at)} failed: ${r.error || ''}`;
    return `<div class="ds-card${on[src] ? '' : ' off'}"><div class="ds-head"><b>${esc(SOURCE_LABEL[src])}</b><span class="chip ${on[src] ? 'ok' : ''}">${on[src] ? 'On' : 'Not set up'}</span></div>
      ${run ? `<div class="muted ds-run${r && !r.ok ? ' err' : ''}">${esc(run)}</div>` : ''}${changesHtml(src)}<ul>${lines.filter(Boolean).map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
  };
  const cards = [
    card('ls', 'lansweeper', [`New devices ${intake('lansweeper')}`, st.mergeTwins ? 'Docking-station records are merged into their device' : '', st.skipIpOnly ? 'Devices named only by an IP address wait in To review' : '']),
    card('ad', 'ldap', [`New devices ${intake('ad')}`, st.fillAd === false ? 'Fills no fields (only shown beside them)' : 'Fills empty fields']),
    card('graph', 'graph', [`New devices ${intake('graph')}`, st.fillGraph === false ? 'Fills no fields (only shown beside them)' : 'Fills empty fields']),
    card('defender', '', ['Read with the Entra & Intune sync, when turned on there']),
  ].join('');

  /* Every field a sync knows, by topic: the sources that set it in their order (the first one wins), what that means in
     a sentence, and Change… for an admin. The order is kept per field (st.fieldOrder); the syncs read it (sync-map.js). */
  const edit = canEdit();
  const chain = k => {
    const order = fieldOrder(st, k), used = order.filter(x => !globalOff(x));
    const off = order.filter(globalOff), shown = SOURCES_OF(k).filter(x => !order.includes(x));
    const chip = (x, n) => `<span class="ds-src${on[x] ? '' : ' ds-dim'}" title="${esc(SOURCE_LABEL[x] + (on[x] ? '' : ' (not set up)') + ': ' + MODES[fieldMode(st, k, x)])}">${n ? `<b>${n}</b>` : ''}${esc(SHORT[x])}${n && fieldMode(st, k, x) === 'fill' ? ' <small class="ds-mode">only if empty</small>' : ''}</span>`;
    return `${used.length ? used.map((x, i) => chip(x, i + 1)).join('<span class="ds-arrow" aria-hidden="true">›</span>') : '<span class="muted">Kept as typed</span>'}
      ${[...shown, ...off].length ? `<span class="ds-also">shown only: ${esc(list([...shown, ...off].map(x => SHORT[x] + (off.includes(x) ? ' (off)' : ''))))}</span>` : ''}`;
  };
  const custom = !!((st.fieldOrder && Object.keys(st.fieldOrder).length) || (st.fieldMode && Object.keys(st.fieldMode).length));
  /* Values set by hand per field: they stay, whatever the sources say; the count opens them, to give them back. */
  const hand = {};
  for (const o of objs) if (o.status !== 'retired') for (const k of ORDER_FIELDS) if ((o.pick && o.pick[k] === 'hand') || (o.src && o.src[k] === 'hand')) hand[k] = (hand[k] || 0) + 1;
  const isSet = k => !!((st.fieldOrder && st.fieldOrder[k]) || (st.fieldMode && st.fieldMode[k]));
  const row = k => `<tr${isSet(k) ? ' class="ds-set"' : ''}><th scope="row">${esc(SYNC_FIELD_LABEL[k])}${isSet(k) ? ' <span class="chip ds-custom" title="Set here, not the default">Custom</span>' : ''}${hand[k] ? `<button type="button" class="link ds-hand" data-dshand="${k}" title="Devices where this field was set by hand: no source changes it">${hand[k]} set by hand</button>` : ''}</th>
    <td class="ds-chain">${chain(k)}</td><td class="ds-how">${esc(orderSentence(k, fieldOrder(st, k)))}</td>${edit ? `<td class="ds-act"><button type="button" class="mini" data-dsedit="${k}" aria-label="Change the sources of ${esc(SYNC_FIELD_LABEL[k])}">Change…</button></td>` : ''}</tr>`;
  const matrix = `<table class="grid mini ds-matrix stack"><thead><tr><th>Field</th><th>Sources, in order</th><th>What happens</th>${edit ? '<th><span class="sr-only">Change</span></th>' : ''}</tr></thead>
    ${groupsOf().map(([name, keys]) => `<tbody><tr class="ds-grp"><th colspan="${edit ? 4 : 3}" scope="rowgroup">${esc(name)}</th></tr>${keys.map(row).join('')}</tbody>`).join('')}</table>`;
  /* One explanation, used everywhere on this page. */
  const fieldNote = `<div class="ds-explain"><p><b>How a field is filled:</b> a value typed or picked by hand on a device always stays. Otherwise the sources write it in the order shown; a source higher up replaces what one below it wrote.</p>
    <p><b>Updates</b>: the source keeps the field in step with what it reports. <b>Only if empty</b>: it writes the field only while it is empty and never replaces a value. A source that is <b>shown only</b> writes nothing; its value is beside the field on the device page, to pick there.${edit ? ' Changes apply at each source\'s next sync, after a preview of what they change.' : ''}</p></div>`;
  /* Three common setups, each one click (with the preview and Undo). */
  const presets = edit ? `<div class="ds-presets"><span class="muted">Quick setup:</span>${Object.entries(PRESETS).map(([k, [l, tip]]) => `<button type="button" data-dspreset="${k}" title="${esc(tip)}">${esc(l)}</button>`).join('')}</div>` : '';
  const reset = edit && custom ? `<div class="ds-foot"><span class="muted">${Object.keys(st.fieldOrder).length} field${Object.keys(st.fieldOrder).length === 1 ? '' : 's'} set here (Custom)</span><button type="button" id="dsReset">Back to the defaults</button></div>` : '';
  const extras = Object.entries(SOURCE_EXTRAS).map(([src, list]) => `<div class="ds-card${on[src] ? '' : ' off'}"><div class="ds-head"><b>${esc(SOURCE_LABEL[src])}</b></div>
    <dl class="ds-dl">${list.map(([what, how]) => `<dt>${esc(what)}</dt><dd>${esc(how)}</dd>`).join('')}</dl></div>`).join('');

  root.innerHTML = `<div class="panelbox"><div class="hdr">Sources</div><p class="note ds-intro">What each source brings into the inventory and how it is set up here now. This page is drawn from the same lists the syncs use, so it always shows what they do.</p><div class="ds-cards">${cards}</div></div>
    <div class="panelbox"><div class="hdr">Device fields</div>${fieldNote}${presets}<div class="ds-scroll">${matrix}</div>${reset}</div>
    <div class="panelbox"><div class="hdr">Beyond the fields</div><div class="ds-cards ds-wide">${extras}</div></div>
    <div class="panelbox"><div class="hdr">People</div><dl class="ds-dl ds-pad">${PEOPLE_SOURCES.map(([what, how]) => `<dt>${esc(what)}</dt><dd>${esc(how)}</dd>`).join('')}</dl></div>
    <div class="panelbox"><div class="hdr">Never</div><ul class="ds-never">${NEVER.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>`;

  /* The devices a sync changed, and the ones a field was set by hand on: listed in the Table. */
  root.querySelectorAll('[data-dschg]').forEach(b => b.onclick = () => {
    const all = (st.syncChanges || {})[b.dataset.dschg]; if (!all) return;
    const i = Number(b.dataset.dsrun ?? -1), c = i < 0 ? all : (all.earlier || [])[i]; if (!c) return;
    resetFilters(); st.ids = { label: i < 0 ? `Changed by ${SOURCE_LABEL[b.dataset.dschg]} at the last sync` : `Changed by ${SOURCE_LABEL[b.dataset.dschg]} on ${when(c.at)}`, ids: c.ids || [] }; st.scope = null; st.tab = 'table'; closeModal(); render();
  });
  root.querySelectorAll('[data-dshand]').forEach(b => b.onclick = () => { resetFilters(); st.handField = b.dataset.dshand; st.scope = null; st.tab = 'table'; closeModal(); render(); });
  if (!edit) return;
  root.querySelectorAll('[data-dsedit]').forEach(b => b.onclick = () => editOrder(b.dataset.dsedit, on));
  root.querySelectorAll('[data-dspreset]').forEach(b => b.onclick = () => {
    const [name] = PRESETS[b.dataset.dspreset], next = presetOf(b.dataset.dspreset);
    confirmChange(`Quick setup: ${name}`, next, ORDER_FIELDS, () => {
      const before = { fieldOrder: st.fieldOrder, fieldMode: st.fieldMode, policy: st.policy };
      Object.assign(st, next); queueServerSave(); renderSetSources();
      toastUndo(`Quick setup: ${name}`, () => { Object.assign(st, before); queueServerSave(); renderSetSources(); });
    });
  });
  const resetPolicy = () => ({ ...(st.policy || {}), ...Object.fromEntries(ORDER_FIELDS.filter(k => k in DEFAULT_POLICY).map(k => [k, DEFAULT_POLICY[k]])) });
  const rs = $('#dsReset'); if (rs) rs.onclick = () => confirmChange('Field sources back to the defaults', { fieldOrder: null, fieldMode: null, policy: resetPolicy() }, ORDER_FIELDS, () => {
    const before = { fieldOrder: st.fieldOrder, fieldMode: st.fieldMode, policy: st.policy };
    st.fieldOrder = null; st.fieldMode = null; st.policy = resetPolicy(); queueServerSave(); renderSetSources();
    toastUndo('Field sources back to the defaults', () => { Object.assign(st, before); queueServerSave(); renderSetSources(); });
  });
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
    $('#dsList').innerHTML = all.map((x, i) => `<li class="ds-li${use.has(x) ? '' : ' off'}"><span class="ds-pos">${use.has(x) ? order.indexOf(x) + 1 : ''}</span>
      <label class="ds-use"><input type="checkbox" data-dsuse="${x}" ${use.has(x) ? 'checked' : ''}> <b>${esc(SOURCE_LABEL[x])}</b></label>
      ${use.has(x) ? `<select data-dsmode="${x}" aria-label="How ${esc(SOURCE_LABEL[x])} writes it"><option value="update" ${modes[x] === 'update' ? 'selected' : ''}>Updates</option><option value="fill" ${modes[x] === 'fill' ? 'selected' : ''}>Only if empty</option></select>` : ''}
      <span class="muted ds-li-note">${!on[x] ? 'not set up' : globalOff(x) ? 'filling is off in its tab' : use.has(x) ? '' : 'shown only'}</span>
      <span class="ds-move"><button type="button" class="icon ghost" data-dsup="${x}" aria-label="Move ${esc(SOURCE_LABEL[x])} up" ${!use.has(x) || order.indexOf(x) === 0 ? 'disabled' : ''}>▲</button><button type="button" class="icon ghost" data-dsdown="${x}" aria-label="Move ${esc(SOURCE_LABEL[x])} down" ${!use.has(x) || order.indexOf(x) === order.length - 1 ? 'disabled' : ''}>▼</button></span></li>`).join('');
    $('#dsSays').textContent = orderSentence(k, order, { ...(st.fieldMode || {}), [k]: modes });
    document.querySelectorAll('[data-dsmode]').forEach(sel => sel.onchange = () => { modes[sel.dataset.dsmode] = sel.value; draw(); });

    document.querySelectorAll('[data-dsuse]').forEach(c => c.onchange = () => { const x = c.dataset.dsuse; if (c.checked){ use.add(x); order.push(x); } else { use.delete(x); order = order.filter(y => y !== x); } draw(); document.querySelector(`[data-dsuse="${x}"]`)?.focus(); });
    const move = (x, d) => { const i = order.indexOf(x), j = i + d; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; draw(); (document.querySelector(`[data-ds${d < 0 ? 'up' : 'down'}="${x}"]:not([disabled])`) || document.querySelector(`[data-ds${d < 0 ? 'down' : 'up'}="${x}"]:not([disabled])`) || document.querySelector(`[data-dsuse="${x}"]`))?.focus(); };
    document.querySelectorAll('[data-dsup]').forEach(b => b.onclick = () => move(b.dataset.dsup, -1));
    document.querySelectorAll('[data-dsdown]').forEach(b => b.onclick = () => move(b.dataset.dsdown, 1));
  };
  const set = (st.fieldOrder && st.fieldOrder[k]) || (st.fieldMode && st.fieldMode[k]);
  modal(`<div class="mh">${esc(SYNC_FIELD_LABEL[k])}: where it comes from</div>
    <div class="mb"><p class="note">Tick the sources that write this field and put them in order: one higher up replaces what one below it wrote. For each, Updates keeps the field in step; Only if empty never replaces a value. A source not ticked is only shown beside the field.</p>
      <ol class="ds-list" id="dsList"></ol><p class="ds-says" id="dsSays" aria-live="polite"></p></div>
    <div class="mf">${set ? '<button id="dsDefault">Back to the default</button>' : ''}<span class="grow"></span><button id="dsCancel">Cancel</button><button id="dsSave" class="primary">Save</button></div>`, 'sm');
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
      st.fieldOrder = fo; st.fieldMode = fm; st.policy = policy; queueServerSave(); renderSetSources();
      toastUndo(`${SYNC_FIELD_LABEL[k]}: back to the default`, () => { Object.assign(st, before); queueServerSave(); renderSetSources(); });
    });
  };
}
