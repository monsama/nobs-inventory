/* Settings → Device types: the types as a list, and the one picked beside it: its name, colour and icon (uploaded icons
   cleaned to shapes) with a preview of its row in the list, the list's Detail column for it, the fields its page has, and Delete. */
import { typeFieldsOf, canAddPorts, fieldKind } from './17-fields.js';
import { CARD_FIELDS, resetFilters } from './02-views.js';
import { cardHtml, listHead, detailOf, DETAIL_DEFAULTS } from './views-cards.js';
import { renderSetModels } from './settings-feed.js';
import { applyRole, isAdmin } from './04-settings.js';
import { closeModal } from './19-modal.js';
import { queueServerSave, render } from './07-render.js';
import { ofTypeSel, listTypes, VIEWBOX_RE, ICON, iconSvg, $, st, TYPES, TYPE_FIELDS, objs, toast, FIELD_LAYOUT, LS_ON, FIELD_LABEL, hiddenOf, BUILTIN, tcol, tico, relIndex, modelNames, REVIEW } from './01-core.js';
import { SVG_ELEMENTS, SVG_ATTRS } from './svg-rules.js';
import { html, rawHtml } from './html.js';
/* An uploaded icon keeps only its drawing: scripts, event handlers, styles and links to anything outside the file are dropped. */
export function sanitizeSvg(text){
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) return null;
  const OK_EL = SVG_ELEMENTS, OK_AT = SVG_ATTRS;
  root.querySelectorAll('*').forEach(n => { if (n !== root && !OK_EL.includes(n.localName)) n.remove(); });
  /* Comments (an icon set's licence line) are dropped too: the server keeps shapes only. */
  const notes = doc.createTreeWalker(root, NodeFilter.SHOW_COMMENT), drop = [];
  while (notes.nextNode()) drop.push(notes.currentNode);
  drop.forEach(n => n.remove());
  root.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => { if (!OK_AT.includes(a.name.toLowerCase())) n.removeAttribute(a.name); }));
  const ser = new XMLSerializer();
  /* The viewBox goes into an attribute: only numbers are kept, anything else gets the usual box. */
  const view = (root.getAttribute('viewBox') || '').trim();
  return {inner: [...root.childNodes].map(n => ser.serializeToString(n)).join(''), view: VIEWBOX_RE.test(view) ? view : '0 0 24 24'};
}
/* Readable names for the icons, for the dropdown. */
export const ICON_LABEL = { plc: 'PLC / Controller', tablet: 'Tablet', pc: 'Computer', laptop: 'Laptop', server: 'Server', sip: 'VoIP phone', mobile: 'Mobile device', rack: 'Rack',
  monitor: 'Monitor', switch: 'Switch', router: 'Router', firewall: 'Firewall', modem: 'Modem', patch: 'Patch panel',
  printer: 'Printer', scanner: 'Scanner', projector: 'Projector', camera: 'Camera', storage: 'Storage', nas: 'NAS',
  ups: 'UPS', accesspoint: 'Access point', pbx: 'PBX', bmc: 'Remote management', other: 'Other' };
export const iconLabel = n => (n === 'custom' ? 'Uploaded icon' : ICON_LABEL[n] || n);
/* A dropdown that shows the icon and its name, for the object type's icon: a popover the width of its button, below it
   (above when there is no room), closed by a click elsewhere or Escape. */
export function iconChoice(k, t){
  const names = [...Object.keys(ICON), ...(t.svgInner ? ['custom'] : [])];
  /* An uploaded icon's shapes were cleaned when it was uploaded (sanitizeSvg). */
  const preview = n => n === 'custom' ? html`<svg class="i cu" viewBox="${VIEWBOX_RE.test(t.svgView || '') ? t.svgView : '0 0 24 24'}">${rawHtml(t.svgInner)}</svg>` : rawHtml(iconSvg(n));
  return html`<div class="icondd"><button type="button" class="icondd-btn" aria-haspopup="listbox" popovertarget="icl-${k}" aria-label="${iconLabel(t.icon)}, icon for ${t.label}">${preview(t.icon)}<span>${iconLabel(t.icon)}</span><svg class="icondd-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <div class="icondd-list" id="icl-${k}" role="listbox" popover>${names.map(n => html`<button type="button" role="option" class="icondd-item" aria-selected="${String(n === t.icon)}" data-ic="${k}" data-icon="${n}">${preview(n)}<span>${iconLabel(n)}</span></button>`)}<label class="icondd-up">Upload SVG icon…<input type="file" hidden accept=".svg,image/svg+xml" data-up="${k}" aria-label="Upload SVG icon for ${t.label}"></label></div></div>`;
}
/* A key for a field, from its name: lowercase letters, digits and underscores, starting with a letter. */
export const fieldKey = label => {
  let k = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 28);
  if (k && !/^[a-z]/.test(k)) k = 'f_' + k;
  return k.replace(/_+$/, '');
};
/* The detail of the type picked in the list: what it looks like and its card (with a preview), its fields, and Delete.
   Drawn again on its own after each change, so the list keeps its place. */
export function renderSetTypeFields(){ renderTypeDetail(); }
const MODELS_KEY = '__models';
/* As the list counts them: devices only registered in Entra are not in their type (ofTypeSel). */
const devicesOf = k => objs.filter(o => ofTypeSel(o, k));
/* A change saved on leaving a field redraws the type, while the focus has already moved on (Tab to the next field):
   fn runs, and the focus is put back on the field it went to, found again by its data attribute. */
function keepFocus(fn){ setTimeout(() => keepFocusNow(fn)); }
/* Run a moment later than the change itself: the change of a field comes before the focus has gone to the next one. */
function keepFocusNow(fn){
  const a = /** @type {HTMLElement | null} */ (document.activeElement), box = $('#tpDetail');
  const at = a && box && box.contains(a) ? ['data-tl', 'data-ts', 'data-tc', 'data-flab', 'data-fhide', 'data-cl', 'id'].find(x => a.hasAttribute(x)) : null;
  const sel = at ? `[${at}="${CSS.escape(a.getAttribute(at) || '')}"]` : '';
  fn();
  if (sel) /** @type {HTMLElement | null} */ (document.querySelector('#tpDetail ' + sel))?.focus();
}
/* Records waiting in Pending devices hold their type too: a type they have cannot be deleted. */
const reviewOf = k => REVIEW.filter(o => o.type === k);
function renderTypeDetail(){
  const box = $('#tpDetail');
  if (!box) return;
  /* Drawn on its own (a type clicked, the arrow keys, Find a type): a viewer's controls are locked here as well. */
  if (st.typeSel === MODELS_KEY){ box.innerHTML = '<div class="panelbox" id="setModels"></div>'; renderSetModels(); applyRole(); return; }
  const type = st.typeSel, t = TYPES[type], list = TYPE_FIELDS[type] || [];
  const n = devicesOf(type).length, waiting = reviewOf(type).length, edit = isAdmin();
  const rule = (Array.isArray(st.typeRules) ? st.typeRules : []).findIndex(r => r && r.to === type);
  const named = Object.keys(st.typeMap || {}).find(x => st.typeMap[x] === type);
  const lock = BUILTIN.includes(type) ? 'A built-in type stays.' : n ? `${n} ${n === 1 ? 'device has' : 'devices have'} this type: give them another first.` : waiting ? `${waiting} ${waiting === 1 ? 'record' : 'records'} in Pending devices ${waiting === 1 ? 'has' : 'have'} this type: decide on them first.` : rule >= 0 ? `Type rule ${rule + 1} leads to it (Data sources → Lansweeper).` : named ? `The Lansweeper type name “${named}” leads to it (Data sources → Lansweeper).` : '';
  box.innerHTML = html`<div class="tp-head"><span class="tp-tile" style="--tc:${tcol(type)}">${rawHtml(tico(type, 'tico'))}</span><div class="tp-title"><h3>${t.label}</h3><span class="muted">${n ? `${n} ${n === 1 ? 'device' : 'devices'}` : 'No devices yet'} · ${BUILTIN.includes(type) ? 'built in' : 'your own'}</span></div>${n ? html`<button type="button" id="tpShow" data-view>Show the ${n === 1 ? 'device' : `${n} devices`}</button>` : ''}</div>
    <div class="panelbox"><div class="hdr">Look and list</div>
      <div class="tp-look"><div class="tp-form">
        <label>Name<input data-tl="${type}" value="${t.label}" maxlength="60"></label>
        <label>Short name<input data-ts="${type}" value="${t.short}" maxlength="60" title="Where room is short: the relations map, the plan"></label>
        <label class="tp-col">Colour<input type="color" value="${tcol(type)}" data-tc="${type}"></label>
        <div class="tp-ic"><span class="tp-lbl">Icon</span>${iconChoice(type, t)}</div>
      </div><div class="tp-prev"><span class="tp-lbl">Preview${n ? '' : ' (an example device)'}</span><div class="tp-card" inert aria-hidden="true">${rawHtml(previewCard(type))}</div></div></div>
      <div id="tfCard"></div></div>
    <div class="panelbox"><div class="hdr">Fields <span class="cnt">on a ${t.label} page, top to bottom</span></div>
      <div id="tfBuiltin"></div>
      ${edit ? html`<div class="lpanel-add tf-add"><input id="tfLabel" maxlength="40" placeholder="Add a field of your own, e.g. Asset tag" aria-label="Name of a new field"><select id="tfKind" aria-label="Kind of value"><option value="text">Text</option><option value="number">Number</option></select><button id="tfAdd">Add field</button></div>` : ''}</div>
    ${edit ? html`<div class="tp-foot"><button type="button" data-td="${type}" class="danger-text" ${lock ? 'disabled' : ''}>Delete ${t.label}</button>${lock ? html`<span class="muted">${lock}</span>` : ''}</div>` : ''}`;
  const show = $('#tpShow'); if (show) show.onclick = () => { closeModal(); resetFilters(); st.type = type; render(); };
  const add = () => {
    const label = $('#tfLabel').value.trim(), key = fieldKey(label);
    if (!label){ toast('Give the field a name.'); return; }
    if (!key){ toast('Use letters or digits in the name.'); return; }
    if (list.some(f => f.key === key)){ toast('That field already exists for this type.'); return; }
    TYPE_FIELDS[type] = [...list, {key, label, kind: $('#tfKind').value}];
    queueServerSave(); toast('Added ' + label); renderTypeDetail(); render();
  };
  if ($('#tfAdd')){ $('#tfAdd').onclick = add; $('#tfLabel').onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); add(); } }; }
  renderBuiltinFields($('#tfBuiltin'), type);
  renderCardLines($('#tfCard'), type);
  bindTypeLook(box, type);
  applyRole();
}
/* A row of the type as the List draws it, under the list's headings: one of its devices, or an example when it has none. */
function previewCard(type){
  const t = TYPES[type], real = devicesOf(type).find(o => o.status !== 'retired');
  const o = real || { id: 'tp-preview', code: 'INV-0001', type, name: (t.short || t.label).toUpperCase().replace(/\s+/g, '-') + '-01', status: 'active' };
  try { return `<div id="tpList" class="lst lst-compact">${listHead(false, false)}${cardHtml(o, relIndex(), false)}</div>`; } catch { return ''; }
}
/* The Detail column of the list for this type: the one column that depends on the type (the OS, the model...). */
export function renderCardLines(box, type){
  const lay = FIELD_LAYOUT[type] || {}, cur = detailOf(type), own = typeof lay.detail === 'string' && !!lay.detail;
  const choices = [...Object.entries(CARD_FIELDS).map(([k, [l]]) => [k, l]), ...(TYPE_FIELDS[type] || []).map(f => ['custom.' + f.key, f.label])];
  box.insertAdjacentHTML('beforeend', String(html`<div class="tf-sub"><div class="tf-sh">The Detail column of the list for ${TYPES[type].label}</div>
    <div class="cardlines"><label>Detail<select data-cl="0" aria-label="Detail column">${choices.map(([v, l]) => html`<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`)}</select></label>
      <button id="clReset" ${own ? '' : 'disabled'} title="${'Back to ' + (CARD_FIELDS[DETAIL_DEFAULTS[type] || 'model'] || ['the default'])[0]}">Back to the default</button></div>
    <p class="note">The other columns are the same for every type: Name, User, Location, IP and Last seen.</p></div>`));
  const save = detail => { const next = {...lay}; delete next.card; if (detail) next.detail = detail; else delete next.detail; FIELD_LAYOUT[type] = next; queueServerSave(); render(); renderTypeDetail(); };
  const sel = box.querySelector('[data-cl]'); if (sel) sel.onchange = () => save(sel.value === (DETAIL_DEFAULTS[type] || 'model') ? null : sel.value);
  $('#clReset').onclick = () => save(null);
}
/* Every field of a type in one list, in the order its object page shows them: the built-in ones and the type's own.
   Click a name to rename it, untick Shown to hide it (its values are kept), move it with the arrows. Name, type, status
   and location are always shown; a field of the type's own can be removed. */
const ALWAYS_SHOWN = ['name', 'type', 'status', 'loc'];
/* Draws the field list described above into box for type, with how many devices have a value in each, and wires
   renaming, showing or hiding, moving and removing. Each change is saved in the type's field layout at once. */
export function renderBuiltinFields(box, type){
  const lay = FIELD_LAYOUT[type] || {}, own = TYPE_FIELDS[type] || [];
  const base = typeFieldsOf(type);
  if (canAddPorts(type)) base.push(['ports', 'Ports', 'mono'], ['pfx', 'Port naming', 'mono']);
  const seen = new Set(), builtins = base.filter(f => !seen.has(f[0]) && seen.add(f[0]));
  const ofType = objs.filter(o => o.type === type);
  /* Fields Lansweeper fills in on devices of this type that the type does not have (firmware on a printer): listed too,
     so they can be renamed, moved and hidden here like the rest. */
  const extras = LS_ON() ? Object.keys(FIELD_LABEL).filter(k => !seen.has(k) && ofType.some(o => o.feed && o[k] !== undefined && o[k] !== '')).map(k => [k, FIELD_LABEL[k], fieldKind(k), false, true]) : [];
  /* In the order the page shows them before any is moved: the type's fields, its own ones, then Lansweeper's extras.
     Each is [key, label, kind, own (a field added to this type), extra (Lansweeper's, the type does not have it)]. */
  const all = [...builtins, ...own.map(f => ['custom.' + f.key, f.label, f.kind, true]), ...extras];
  /* Rows whose Shown tick is not the whole story. */
  const NOTES = { boot: 'Only while Lansweeper is on' };
  if (canAddPorts(type)) Object.assign(NOTES, { ports: 'Only on devices with ports', pfx: 'Only on devices with ports' });
  const at = f => { const i = (lay.order || []).indexOf(f[0]); return i < 0 ? 1e6 + all.indexOf(f) : i; };
  const ordered = [...all].sort((a, b) => at(a) - at(b));
  const save = next => { FIELD_LAYOUT[type] = next; queueServerSave(); render(); renderTypeDetail(); };
  const put = patch => save({order: ordered.map(f => f[0]), hidden: [...hiddenOf(type)], labels: {...(lay.labels || {})}, ...(lay.detail ? {detail: lay.detail} : {}), ...patch});
  const valueOf = (o, k) => k.startsWith('custom.') ? (o.custom || {})[k.slice(7)] : o[k];
  const filled = k => ofType.filter(o => { const v = valueOf(o, k); return v != null && v !== '' && v !== 0 && !(Array.isArray(v) && !v.length); }).length;
  const tl = TYPES[type].label;
  box.innerHTML = html`<p class="note tf-note">Drag to reorder, click a name to rename. Hidden fields keep their values.</p>
    <div class="tf-list"><div class="tf-row tf-head" aria-hidden="true"><span></span><span>Field</span><span></span><span class="fl-use">Filled in</span><span>On the page</span><span></span></div>${ordered.map((f, i) => {
      const k = f[0], mine = !!f[3], hidden = hiddenOf(type).includes(k), fixed = ALWAYS_SHOWN.includes(k), n = filled(k);
      const name = mine ? f[1] : ((lay.labels || {})[k] || f[1]);
      return html`<div class="tf-row${hidden ? ' off' : ''}" ${isAdmin() ? html`draggable="true" data-drag="${i}"` : ''}>
        <span class="fl-move">${isAdmin() ? html`<span class="tf-grip" aria-hidden="true" title="Drag to move">⠿</span>` : ''}<button class="icon ghost" data-fup="${i}" aria-label="Move ${name} up" ${i === 0 ? 'disabled' : ''}>↑</button><button class="icon ghost" data-fdown="${i}" aria-label="Move ${name} down" ${i === ordered.length - 1 ? 'disabled' : ''}>↓</button></span>
        <input class="tf-name" data-flab="${k}" maxlength="40" value="${name}" aria-label="Name of field ${f[1]}" title="${mine ? 'A field of your own' : 'Built in: ' + f[1]}">
        <span class="tf-tag">${mine ? html`<span class="chip">Own · ${f[2] || 'text'}</span>` : f[4] ? html`<span class="chip" title="This type does not have it; Lansweeper fills it in on some devices">From Lansweeper</span>` : NOTES[k] && html`<span class="muted tf-note-k">${NOTES[k]}</span>`}</span>
        <span class="fl-use ${n ? '' : 'muted'}" title="${n} of ${ofType.length} ${tl} devices have a value">${ofType.length ? `${n} of ${ofType.length}` : ''}</span>
        ${fixed ? html`<span class="muted tf-fixed">Always shown</span>` : html`<label class="pchk tf-shown"><input type="checkbox" data-fhide="${k}" ${hidden ? '' : 'checked'}> Shown</label>`}
        ${mine ? html`<button class="icon ghost tf-del" data-tfd="${own.findIndex(x => 'custom.' + x.key === k)}" aria-label="Remove field ${name}" title="Remove this field (its values are kept)">×</button>` : html`<span></span>`}
      </div>`;
    })}</div>`;
  box.querySelectorAll('[data-flab]').forEach(i => i.onchange = () => keepFocus(() => {
    const k = i.dataset.flab, name = i.value.trim(), f = ordered.find(x => x[0] === k);
    if (f[3]){
      if (!name){ i.value = f[1]; toast('A field needs a name.'); return; }
      own.find(x => 'custom.' + x.key === k).label = name; queueServerSave(); toast('Field renamed'); render(); renderTypeDetail(); return;
    }
    const labels = {...(lay.labels || {})};
    if (!name || name === f[1]) delete labels[k]; else labels[k] = name;
    put({labels});
  }));
  box.querySelectorAll('[data-fhide]').forEach(c => c.onchange = () => {
    const k = c.dataset.fhide, hidden = hiddenOf(type).filter(x => x !== k);
    if (!c.checked) hidden.push(k);
    put({hidden});
  });
  box.querySelectorAll('[data-tfd]').forEach(b => b.onclick = () => {
    const f = own[+b.dataset.tfd]; if (!f) return;
    own.splice(+b.dataset.tfd, 1); if (!own.length) delete TYPE_FIELDS[type];
    const k = 'custom.' + f.key;
    put({hidden: hiddenOf(type).filter(x => x !== k), order: ordered.map(x => x[0]).filter(x => x !== k)});
    toast('Field removed');
  });
  const move = (i, to) => { if (to < 0 || to >= ordered.length || to === i) return; const o = ordered.map(f => f[0]); const [k] = o.splice(i, 1); o.splice(to, 0, k); put({order: o}); };
  /* Dragged by the row: dropped on another row, it takes that row's place. The arrows do the same by keyboard. */
  let from = -1;
  box.querySelectorAll('[data-drag]').forEach(r => {
    r.addEventListener('dragstart', e => { if (e.target.closest('input,button,label')) { e.preventDefault(); return; } from = +r.dataset.drag; r.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(from)); });
    r.addEventListener('dragend', () => { from = -1; r.classList.remove('dragging'); box.querySelectorAll('.drop-at').forEach(x => x.classList.remove('drop-at')); });
    r.addEventListener('dragover', e => { if (from < 0) return; e.preventDefault(); box.querySelectorAll('.drop-at').forEach(x => x.classList.remove('drop-at')); r.classList.add('drop-at'); });
    r.addEventListener('drop', e => { e.preventDefault(); const to = +r.dataset.drag; const i = from; from = -1; move(i, to); });
  });
  box.querySelectorAll('[data-fup]').forEach(b => b.onclick = () => move(+b.dataset.fup, +b.dataset.fup - 1));
  box.querySelectorAll('[data-fdown]').forEach(b => b.onclick = () => move(+b.dataset.fdown, +b.dataset.fdown + 1));
}
/* Settings → Device types: the types as a list on the left (with Models at its foot), the one picked on the right. */
export function renderSetTypes(){
  const root = $('#setTypes');
  if (!root) return;
  const keys = listTypes().map(([k]) => k);
  if (st.typeSel !== MODELS_KEY && !TYPES[st.typeSel]) st.typeSel = st.fieldType && TYPES[st.fieldType] ? st.fieldType : keys[0];
  if (st.typeSel !== MODELS_KEY) st.fieldType = st.typeSel;
  const q = String(st.typeFind || '').trim().toLowerCase();
  const shown = keys.filter(k => !q || TYPES[k].label.toLowerCase().includes(q) || String(TYPES[k].short || '').toLowerCase().includes(q));
  const item = (k, label, icon, n) => html`<button type="button" class="tp-item${k === st.typeSel ? ' on' : ''}" role="tab" aria-selected="${String(k === st.typeSel)}" data-tsel="${k}" data-view>${icon}<span class="tp-nm">${label}</span><span class="tp-n">${n || ''}</span></button>`;
  root.innerHTML = html`<div class="tp-split">
    <div class="tp-side">
      <input id="tpFind" type="search" placeholder="Find a type" value="${st.typeFind || ''}" aria-label="Find a type" autocomplete="off" data-view>
      <div class="tp-list" role="tablist" aria-orientation="vertical" aria-label="Device types">${shown.map(k => item(k, TYPES[k].label, rawHtml(tico(k, 'tico sm')), devicesOf(k).length))}${shown.length ? '' : html`<p class="muted tp-none">No type is called that.</p>`}</div>
      ${isAdmin() ? html`<div class="tp-new"><input id="ntName" placeholder="New type, e.g. Access point" maxlength="60" aria-label="New type name"><button id="ntAdd" title="Add the type">Add</button></div>` : ''}
      <div class="tp-list tp-more" role="tablist" aria-label="Models">${item(MODELS_KEY, 'Models', rawHtml('<span class="tp-mi" aria-hidden="true">▤</span>'), modelNames().length)}</div>
    </div>
    <div class="tp-detail" id="tpDetail" role="tabpanel"></div></div>`;
  const find = $('#tpFind');
  find.oninput = () => { st.typeFind = find.value; const at = find.selectionStart; renderSetTypes(); const f = $('#tpFind'); f.focus(); f.setSelectionRange(at, at); };
  find.onkeydown = e => { if (e.key === 'Enter'){ const first = root.querySelector('.tp-list [data-tsel]'); if (first) first.click(); } };
  root.querySelectorAll('[data-tsel]').forEach(b => b.onclick = () => { st.typeSel = b.dataset.tsel; renderSetTypes(); const on = root.querySelector('.tp-item.on'); if (on) on.focus(); });
  /* Up and down move through the list, as in a list box. */
  root.querySelector('.tp-side').addEventListener('keydown', e => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key) || !e.target.closest('.tp-item')) return;
    const all = [...root.querySelectorAll('.tp-item')], i = all.indexOf(e.target), next = all[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (next){ e.preventDefault(); next.click(); }
  });
  const add = () => {
    const name = typeName($('#ntName').value);
    if (!name){ toast('Give the new type a name first.'); return; }
    if (Object.values(TYPES).some(t => t.label.toLowerCase() === name.toLowerCase())){ toast(name + ' already exists.'); return; }
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'type';
    let k = base, i = 2; while (TYPES[k]) k = base + '-' + i++;
    TYPES[k] = {label:name, short:name, color:'#5a6b7d', icon:'other'};
    st.typeSel = k; st.typeFind = '';
    toast('Added ' + name + '. Pick it when you create a device.'); renderSetTypes(); render(); queueServerSave();
  };
  if ($('#ntAdd')){ $('#ntAdd').onclick = add; $('#ntName').onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); add(); } }; }
  renderTypeDetail();
}
/* Name, short name, colour, icon and Delete of the type on the right. Each change is saved and drawn at once. */
function bindTypeLook(box, k){
  const redraw = () => keepFocus(() => { renderSetTypes(); render(); queueServerSave(); });
  box.querySelectorAll('[data-tc]').forEach(i => { i.oninput = () => { TYPES[k].color = i.value; render(); const tile = box.querySelector('.tp-tile'); if (tile) tile.style.setProperty('--tc', i.value); }; i.onchange = () => { redraw(); }; });
  box.querySelectorAll('[data-tl]').forEach(i => i.onchange = () => { TYPES[k].label = typeName(i.value) || TYPES[k].label; redraw(); });
  box.querySelectorAll('[data-ts]').forEach(i => i.onchange = () => { TYPES[k].short = typeName(i.value) || TYPES[k].short; redraw(); });
  box.querySelectorAll('.icondd-item').forEach(b => b.onclick = () => { TYPES[k].icon = b.dataset.icon; redraw(); });
  box.querySelectorAll('[data-up]').forEach(f => f.onchange = async () => {
    const file = f.files[0]; if (!file) return;
    const clean = sanitizeSvg(await file.text());
    if (!clean){ toast('That file is not an SVG icon.'); f.value = ''; return; }
    Object.assign(TYPES[k], {svgInner: clean.inner, svgView: clean.view, icon: 'custom'});
    toast('Icon uploaded for ' + TYPES[k].label); redraw();
  });
  box.querySelectorAll('[data-td]').forEach(b => b.onclick = () => {
    const label = TYPES[k].label;
    delete TYPES[k]; st.typeSel = null;
    toast(label + ' deleted'); redraw();
  });
}
/* A type's name as the server keeps it: plain text of up to 60 characters. */
const typeName = v => String(v || '').replace(/[<>]/g, '').trim().slice(0, 60);
