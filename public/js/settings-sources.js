/* Settings → Data sources: what each source brings into the inventory, who wins when several know a field, and how each
   is set up here right now. Drawn from sync-map.js (the lists the syncs themselves use) and from the current settings,
   so it changes with them and is never out of date. */
import { $, LS_ON, SYNC, esc, objs, st, toastUndo } from './01-core.js';
import { closeModal, modal } from './19-modal.js';
import { LS_FILL, NEVER, ORDER_FIELDS, PEOPLE_SOURCES, PRECEDENCE, SOURCES_OF, SOURCE_EXTRAS, SOURCE_LABEL, SYNC_FIELD_LABEL, fieldOrder, maySet } from './sync-map.js';
import { SERVER, queueServerSave } from './07-render.js';
import { canEdit } from './04-settings.js';
import { runOf, summary, when } from './16-sync.js';

/* What a source does with one field, as a cell: its place in the field's order and what that means (the first
   Lansweeper writes at every scan; the first directory fills the field and replaces the ones after it; the next ones
   fill it while it is empty), or only shows its value beside the field, or nothing. */
const CELL = {
  writes: ['ds-w', 'Writes', 'Sets the field at every scan'],
  first: ['ds-w', 'First', 'Fills the field, and replaces what a source after it filled'],
  fills: ['ds-f', 'Fills empty', 'Fills the field while it is empty, or where a source after it filled it'],
  shown: ['ds-s', 'Shown only', 'Its value is shown beside the field, to pick on the device; the field is not written'],
  off: ['ds-o', 'Off', 'This source is not set up, or filling is turned off in its Settings tab'],
  none: ['ds-n', '—', 'This source does not know this field'],
};
const SHORT = { ls: 'Lansweeper', graph: 'Intune', ad: 'AD' };
const cell = k => { const [cls, text, tip] = CELL[k]; return `<td class="${cls}" title="${esc(tip)}">${esc(text)}</td>`; };
/* What source src does with field k at place i of its order (-1: not in it). */
const roleOf = (src, k, i) => i < 0 ? 'shown' : i > 0 ? 'fills' : src === 'ls' && !LS_FILL[k] ? 'writes' : 'first';
/* Every order of a list: the few sources of one field (at most three, six orders). */
const orders = list => list.length <= 1 ? [list] : list.flatMap((x, i) => orders([...list.slice(0, i), ...list.slice(i + 1)]).map(r => [x, ...r]));

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
function setOrder(k, list, what){
  const policy = SOURCES_OF(k).includes('ls') && !LS_FILL[k] ? { ...(st.policy || {}), [k]: list.includes('ls') } : st.policy;
  const fo = { ...(st.fieldOrder || {}), [k]: list };
  confirmChange(`${SYNC_FIELD_LABEL[k]}: ${what}`, { fieldOrder: fo, policy }, [k], () => {
    const before = { fieldOrder: st.fieldOrder, policy: st.policy };
    st.fieldOrder = fo; st.policy = policy;
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

  /* One card per source: set up or not, its last run, where its new devices go and whether it fills fields. */
  const card = (src, runKey, lines) => {
    const r = runKey ? runOf(runKey) : null;
    const run = !runKey ? '' : !r ? 'Not run yet' : r.ok ? `Last run ${when(r.at)}${r.how === 'push' ? ' (push)' : ''}: ${summary(runKey, r.counts)}` : `Last run ${when(r.at)} failed: ${r.error || ''}`;
    return `<div class="ds-card${on[src] ? '' : ' off'}"><div class="ds-head"><b>${esc(SOURCE_LABEL[src])}</b><span class="chip ${on[src] ? 'ok' : ''}">${on[src] ? 'On' : 'Not set up'}</span></div>
      ${run ? `<div class="muted ds-run${r && !r.ok ? ' err' : ''}">${esc(run)}</div>` : ''}<ul>${lines.filter(Boolean).map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
  };
  const cards = [
    card('ls', 'lansweeper', [`New devices ${intake('lansweeper')}`, st.mergeTwins ? 'Docking-station records are merged into their device' : '', st.skipIpOnly ? 'Devices named only by an IP address wait in To review' : '']),
    card('ad', 'ldap', [`New devices ${intake('ad')}`, st.fillAd === false ? 'Fills no fields (only shown beside them)' : 'Fills empty fields']),
    card('graph', 'graph', [`New devices ${intake('graph')}`, st.fillGraph === false ? 'Fills no fields (only shown beside them)' : 'Fills empty fields']),
    card('defender', '', ['Read with the Entra & Intune sync, when turned on there']),
  ].join('');

  /* Every field a sync knows: what each source does with it, and the order of the ones that set it. An admin changes both
     here; the order is kept per field (st.fieldOrder) and the syncs read it (sync-map.js fieldOrder, maySet). */
  const edit = canEdit();
  /* AD and Intune fill nothing when filling is turned off in their tab: then their cells say Off. */
  const globalOff = src => (src === 'graph' && st.fillGraph === false) || (src === 'ad' && st.fillAd === false);
  const srcCell = (k, src) => {
    const known = SOURCES_OF(k);
    if (!known.includes(src)) return cell('none');
    if (globalOff(src)) return cell('off');
    const order = fieldOrder(st, k), i = order.indexOf(src), role = roleOf(src, k, i);
    const [cls, , tip] = CELL[role];
    const dim = on[src] ? '' : ' ds-dim';
    const label = (n, r) => `${n >= 0 ? `${n + 1}. ` : ''}${CELL[r][1]}`;
    if (!edit) return `<td class="${cls}${dim}" title="${esc(tip)}">${esc(label(i, role))}</td>`;
    /* In the order (at its place, or added last) or out of it. */
    const inAt = i >= 0 ? i : order.length;
    return `<td class="${cls}${dim}"><select class="ds-sel" data-dsk="${k}" data-dss="${src}" aria-label="${esc(`${SYNC_FIELD_LABEL[k]}: ${SOURCE_LABEL[src]}`)}" title="${esc(tip + (on[src] ? '' : ' (this source is not set up)'))}">
      <option value="on" ${i >= 0 ? 'selected' : ''}>${esc(label(inAt, roleOf(src, k, inAt)))}</option><option value="off" ${i < 0 ? 'selected' : ''}>${esc(CELL.shown[1])}</option></select></td>`;
  };
  /* The order of the sources that set the field: a choice of every order when two or three set it. */
  const orderCell = k => {
    const order = fieldOrder(st, k).filter(x => !globalOff(x));
    if (!order.length) return '<td class="ds-n" title="No source sets this field">—</td>';
    const text = list => list.map(x => SHORT[x]).join(' → ');
    if (!edit || order.length < 2) return `<td class="ds-ord">${esc(text(order))}</td>`;
    return `<td class="ds-ord"><select class="ds-sel" data-dso="${k}" aria-label="${esc(`${SYNC_FIELD_LABEL[k]}: order`)}">${orders(order).map(o => `<option value="${o.join(',')}" ${o.join() === order.join() ? 'selected' : ''}>${esc(text(o))}</option>`).join('')}</select></td>`;
  };
  const custom = !!(st.fieldOrder && Object.keys(st.fieldOrder).length);
  const matrix = `<table class="grid mini ds-matrix${edit ? ' ds-edit' : ''}"><thead><tr><th>Field</th><th>${esc(SOURCE_LABEL.ls)}</th><th>Intune</th><th>${esc(SOURCE_LABEL.ad)}</th><th>Order</th></tr></thead><tbody>
    ${ORDER_FIELDS.map(k => `<tr${st.fieldOrder && st.fieldOrder[k] ? ' class="ds-set"' : ''}><th scope="row">${esc(SYNC_FIELD_LABEL[k])}</th>${srcCell(k, 'ls')}${srcCell(k, 'graph')}${srcCell(k, 'ad')}${orderCell(k)}</tr>`).join('')}</tbody></table>`;
  const legend = `<div class="ds-legend">${['writes', 'first', 'fills', 'shown', 'off'].map(k => `<span class="${CELL[k][0]}"><b>${CELL[k][1]}</b> ${esc(CELL[k][2].toLowerCase())}</span>`).join('')}</div>`;
  const fieldNote = edit
    ? `<p class="note ds-intro">Pick for every field which sources set it and in which order. A source set to Shown only still shows its value beside the field, where it can be picked for one device. Changes apply from each source's next sync.</p>`
    : `<p class="note ds-intro">Which sources set each field, and in which order. An admin changes this here.</p>`;
  const reset = edit && custom ? `<div class="ds-foot"><span class="muted">${Object.keys(st.fieldOrder).length} field${Object.keys(st.fieldOrder).length === 1 ? '' : 's'} set here</span><button type="button" id="dsReset">Back to the defaults</button></div>` : '';
  const extras = Object.entries(SOURCE_EXTRAS).map(([src, list]) => `<div class="ds-card${on[src] ? '' : ' off'}"><div class="ds-head"><b>${esc(SOURCE_LABEL[src])}</b></div>
    <dl class="ds-dl">${list.map(([what, how]) => `<dt>${esc(what)}</dt><dd>${esc(how)}</dd>`).join('')}</dl></div>`).join('');

  root.innerHTML = `<div class="panelbox"><div class="hdr">Sources</div><p class="note ds-intro">What each source brings into the inventory and how it is set up here now. This page is drawn from the same lists the syncs use, so it always shows what they do.</p><div class="ds-cards">${cards}</div></div>
    <div class="panelbox"><div class="hdr">Who wins</div><ol class="ds-order">${PRECEDENCE.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
      <p class="note ds-intro">Every source's value stays visible beside the field on the device page, where another can be picked for that device.</p></div>
    <div class="panelbox"><div class="hdr">Device fields</div>${fieldNote}<div class="ds-scroll">${matrix}</div>${legend}${reset}</div>
    <div class="panelbox"><div class="hdr">Beyond the fields</div><div class="ds-cards ds-wide">${extras}</div></div>
    <div class="panelbox"><div class="hdr">People</div><dl class="ds-dl ds-pad">${PEOPLE_SOURCES.map(([what, how]) => `<dt>${esc(what)}</dt><dd>${esc(how)}</dd>`).join('')}</dl></div>
    <div class="panelbox"><div class="hdr">Never</div><ul class="ds-never">${NEVER.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>`;

  if (!edit) return;
  root.querySelectorAll('[data-dss]').forEach(sel => sel.onchange = () => {
    const k = sel.dataset.dsk, src = sel.dataset.dss, cur = fieldOrder(st, k).filter(x => x !== src);
    setOrder(k, sel.value === 'on' ? [...cur, src] : cur, `${SOURCE_LABEL[src]} ${sel.value === 'on' ? 'sets it' : 'only shown'}`);
  });
  root.querySelectorAll('[data-dso]').forEach(sel => sel.onchange = () => {
    const k = sel.dataset.dso, list = sel.value.split(',');
    /* A source turned off in its tab keeps its place after the others. */
    const rest = fieldOrder(st, k).filter(x => !list.includes(x));
    setOrder(k, [...list, ...rest], `order ${list.map(x => SHORT[x]).join(' → ')}`);
  });
  const rs = $('#dsReset'); if (rs) rs.onclick = () => confirmChange('Field sources back to the defaults', { fieldOrder: null }, ORDER_FIELDS, () => {
    const before = { fieldOrder: st.fieldOrder };
    st.fieldOrder = null; queueServerSave(); renderSetSources();
    toastUndo('Field sources back to the defaults', () => { Object.assign(st, before); queueServerSave(); renderSetSources(); });
  });
}
