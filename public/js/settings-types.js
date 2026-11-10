/* Settings → Device types: names, colours and icons (uploaded icons cleaned to shapes), the fields each type has,
   and the four lines of its cards. */
import { typeFieldsOf, canAddPorts, fieldKind } from './17-fields.js';
import { cardLines, CARD_FIELDS } from './02-views.js';
import { queueServerSave, render } from './07-render.js';
import { VIEWBOX_RE, ICON, iconSvg, $, st, TYPES, TYPE_FIELDS, objs, toast, FIELD_LAYOUT, LS_ON, FIELD_LABEL, hiddenOf, BUILTIN, tcol } from './01-core.js';
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
/* The fields a type has beyond the built-in ones. They are filled in by hand on every object of that type. */
export function renderSetTypeFields(){
  let box = $('#setTypeFields');
  if (!box) return;
  const type = st.fieldType && TYPES[st.fieldType] ? st.fieldType : Object.keys(TYPES)[0];
  st.fieldType = type;
  const list = TYPE_FIELDS[type] || [];
  const nOf = objs.filter(o => o.type === type).length;
  box.innerHTML = html`<div class="panelbox tf-box"><div class="hdr">Per type</div>
    <div class="tf-pick"><label for="tfType">Type</label><select id="tfType" data-view>${Object.entries(TYPES).map(([k, t]) => html`<option value="${k}" ${k === type ? 'selected' : ''}>${t.label}</option>`)}</select><span class="muted">${nOf} ${nOf === 1 ? 'object' : 'objects'}</span></div>
    <div id="tfBuiltin"></div>
    <div class="lpanel-add tf-add"><input id="tfLabel" maxlength="40" placeholder="Add a field of your own, e.g. Asset tag" aria-label="Name of a new field"><select id="tfKind" aria-label="Kind of value"><option value="text">Text</option><option value="number">Number</option></select><button id="tfAdd">Add field</button></div>
    <div id="tfCard"></div></div>`;
  $('#tfType').onchange = e => { st.fieldType = e.target.value; renderSetTypeFields(); };
  const add = () => {
    const label = $('#tfLabel').value.trim(), key = fieldKey(label);
    if (!label){ toast('Give the field a name.'); return; }
    if (!key){ toast('Use letters or digits in the name.'); return; }
    if (list.some(f => f.key === key)){ toast('That field already exists for this type.'); return; }
    TYPE_FIELDS[type] = [...list, {key, label, kind: $('#tfKind').value}];
    queueServerSave(); toast('Added ' + label); renderSetTypeFields(); render();
  };
  $('#tfAdd').onclick = add;
  $('#tfLabel').onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); add(); } };
  renderBuiltinFields($('#tfBuiltin'), type);
  renderCardLines($('#tfCard'), type);
}
/* The four lines a card shows for this type. Every card of the type shows the same four, so cards line up. */
export function renderCardLines(box, type){
  const lay = FIELD_LAYOUT[type] || {}, cur = cardLines(type), own = Array.isArray(lay.card) && lay.card.length;
  const choices = [...Object.entries(CARD_FIELDS).map(([k, [l]]) => [k, l]), ...(TYPE_FIELDS[type] || []).map(f => ['custom.' + f.key, f.label])];
  box.insertAdjacentHTML('beforeend', String(html`<div class="tf-sub"><div class="tf-sh">On the ${TYPES[type].label} card</div>
    <p class="note tf-note">The four lines every ${TYPES[type].label} card shows. A device without a value shows a dash, so all cards have the same height.</p>
    <div class="cardlines">${cur.map((k, i) => html`<label>Line ${i + 1}<select data-cl="${i}" aria-label="Card line ${i + 1}"><option value="">Nothing</option>${choices.map(([v, l]) => html`<option value="${v}" ${v === k ? 'selected' : ''}>${l}</option>`)}</select></label>`)}
      <button id="clReset" ${own ? '' : 'disabled'}>Back to the default</button></div></div>`));
  const save = card => { const next = {...lay}; if (card) next.card = card; else delete next.card; FIELD_LAYOUT[type] = next; queueServerSave(); render(); renderSetTypeFields(); };
  box.querySelectorAll('[data-cl]').forEach(sel => sel.onchange = () => { const next = [...cur]; next[+sel.dataset.cl] = sel.value; save(next); });
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
  const save = next => { FIELD_LAYOUT[type] = next; queueServerSave(); render(); renderSetTypeFields(); };
  const put = patch => save({order: ordered.map(f => f[0]), hidden: [...hiddenOf(type)], labels: {...(lay.labels || {})}, ...(lay.card ? {card: lay.card} : {}), ...patch});
  const valueOf = (o, k) => k.startsWith('custom.') ? (o.custom || {})[k.slice(7)] : o[k];
  const filled = k => ofType.filter(o => { const v = valueOf(o, k); return v != null && v !== '' && v !== 0 && !(Array.isArray(v) && !v.length); }).length;
  const tl = TYPES[type].label;
  box.innerHTML = html`<p class="note tf-note">The fields a ${tl} page shows, top to bottom. Click a name to rename it. Hidden fields keep their values.</p>
    <div class="tf-list"><div class="tf-row tf-head" aria-hidden="true"><span></span><span>Field</span><span></span><span class="fl-use">Filled in</span><span>On the page</span><span></span></div>${ordered.map((f, i) => {
      const k = f[0], mine = !!f[3], hidden = hiddenOf(type).includes(k), fixed = ALWAYS_SHOWN.includes(k), n = filled(k);
      const name = mine ? f[1] : ((lay.labels || {})[k] || f[1]);
      return html`<div class="tf-row${hidden ? ' off' : ''}">
        <span class="fl-move"><button class="icon ghost" data-fup="${i}" aria-label="Move ${name} up" ${i === 0 ? 'disabled' : ''}>↑</button><button class="icon ghost" data-fdown="${i}" aria-label="Move ${name} down" ${i === ordered.length - 1 ? 'disabled' : ''}>↓</button></span>
        <input class="tf-name" data-flab="${k}" maxlength="40" value="${name}" aria-label="Name of field ${f[1]}" title="${mine ? 'A field of your own' : 'Built in: ' + f[1]}">
        <span class="tf-tag">${mine ? html`<span class="chip">Own · ${f[2] || 'text'}</span>` : f[4] ? html`<span class="chip" title="This type does not have it; Lansweeper fills it in on some devices">From Lansweeper</span>` : NOTES[k] && html`<span class="muted tf-note-k">${NOTES[k]}</span>`}</span>
        <span class="fl-use ${n ? '' : 'muted'}" title="${n} of ${ofType.length} ${tl} devices have a value">${ofType.length ? `${n} of ${ofType.length}` : ''}</span>
        ${fixed ? html`<span class="muted tf-fixed">Always shown</span>` : html`<label class="pchk tf-shown"><input type="checkbox" data-fhide="${k}" ${hidden ? '' : 'checked'}> Shown</label>`}
        ${mine ? html`<button class="icon ghost tf-del" data-tfd="${own.findIndex(x => 'custom.' + x.key === k)}" aria-label="Remove field ${name}" title="Remove this field (its values are kept)">×</button>` : html`<span></span>`}
      </div>`;
    })}</div>`;
  box.querySelectorAll('[data-flab]').forEach(i => i.onchange = () => {
    const k = i.dataset.flab, name = i.value.trim(), f = ordered.find(x => x[0] === k);
    if (f[3]){
      if (!name){ i.value = f[1]; toast('A field needs a name.'); return; }
      own.find(x => 'custom.' + x.key === k).label = name; queueServerSave(); toast('Field renamed'); render(); renderSetTypeFields(); return;
    }
    const labels = {...(lay.labels || {})};
    if (!name || name === f[1]) delete labels[k]; else labels[k] = name;
    put({labels});
  });
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
  const move = (i, to) => { if (to < 0 || to >= ordered.length) return; const o = ordered.map(f => f[0]); [o[i], o[to]] = [o[to], o[i]]; put({order: o}); };
  box.querySelectorAll('[data-fup]').forEach(b => b.onclick = () => move(+b.dataset.fup, +b.dataset.fup - 1));
  box.querySelectorAll('[data-fdown]').forEach(b => b.onclick = () => move(+b.dataset.fdown, +b.dataset.fdown + 1));
}
/* A type's name as the server keeps it: plain text of up to 60 characters. */
const typeName = v => String(v || '').replace(/[<>]/g, '').trim().slice(0, 60);
/* Object types: rename, recolour, change the icon, add new ones. A type can be deleted only when it is not built in, no
   object has it, and no type rule or Lansweeper type name leads to it. */
export function renderSetTypes(){
  const rows = Object.entries(TYPES).map(([k,t]) => {
    const n = objs.filter(o => o.type === k).length;
    const lock = BUILTIN.includes(k) ? 'Built in' : n ? `In use by ${n} ${n === 1 ? 'device' : 'devices'}` : '';
    return html`<tr>
      <td style="width:1%"><input type="color" value="${tcol(k)}" data-tc="${k}" aria-label="Colour for ${t.label}" style="width:40px;height:28px;padding:2px"></td>
      <td><input data-tl="${k}" value="${t.label}" style="width:100%" aria-label="Name"></td>
      <td><input data-ts="${k}" value="${t.short}" aria-label="Short name"></td>
      <td>${iconChoice(k, t)}</td>
      <td class="n">${n}</td>
      <td><button data-td="${k}" ${BUILTIN.includes(k) || n ? html`disabled title="${lock}"` : ''}>Delete</button></td></tr>`;
  });
  $('#setTypes').innerHTML = html`<div style="overflow-x:auto"><table class="grid mini types stack" style="min-width:0"><colgroup><col style="width:70px"><col><col style="width:120px"><col style="width:200px"><col style="width:80px"><col style="width:116px"></colgroup><thead><tr><th>Colour</th><th>Name</th><th>Short</th><th>Icon</th><th class="n">Devices</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="addrel"><input id="ntName" placeholder="New type, e.g. Access point" style="flex:1;min-width:160px" aria-label="New type name"><button id="ntAdd">Add type</button></div>`;
  const root = $('#setTypes');
  renderSetTypeFields();
  root.querySelectorAll('[data-tc]').forEach(i => i.oninput = () => { TYPES[i.dataset.tc].color = i.value; render(); });
  root.querySelectorAll('[data-tl]').forEach(i => i.onchange = () => { TYPES[i.dataset.tl].label = typeName(i.value) || TYPES[i.dataset.tl].label; renderSetTypes(); render(); });
  root.querySelectorAll('[data-ts]').forEach(i => i.onchange = () => { TYPES[i.dataset.ts].short = typeName(i.value) || TYPES[i.dataset.ts].short; render(); });
  root.querySelectorAll('.icondd-item').forEach(b => b.onclick = () => { TYPES[b.dataset.ic].icon = b.dataset.icon; renderSetTypes(); render(); });
  root.querySelectorAll('[data-up]').forEach(f => f.onchange = async () => {
    const file = f.files[0]; if (!file) return;
    const clean = sanitizeSvg(await file.text());
    if (!clean){ toast('That file is not an SVG icon.'); f.value = ''; return; }
    Object.assign(TYPES[f.dataset.up], {svgInner: clean.inner, svgView: clean.view, icon: 'custom'});
    toast('Icon uploaded for ' + TYPES[f.dataset.up].label); renderSetTypes(); render();
  });
  /* A type a type rule or a Lansweeper type name still leads to stays: the server would refuse every later save. */
  root.querySelectorAll('[data-td]').forEach(b => b.onclick = () => {
    const k = b.dataset.td;
    const rule = (Array.isArray(st.typeRules) ? st.typeRules : []).findIndex(r => r && r.to === k);
    const named = Object.keys(st.typeMap || {}).find(n => st.typeMap[n] === k);
    if (rule >= 0){ toast(`${TYPES[k].label} is used by type rule ${rule + 1} (Settings → Feed). Change that rule first.`); return; }
    if (named){ toast(`${TYPES[k].label} is the type for the Lansweeper type name “${named}” (Settings → Feed). Change that first.`); return; }
    toast(TYPES[k].label + ' deleted'); delete TYPES[k]; renderSetTypes(); render();
  });
  $('#ntAdd').onclick = () => {
    const name = typeName($('#ntName').value);
    if (!name){ toast('Give the new type a name first.'); return; }
    if (Object.values(TYPES).some(t => t.label.toLowerCase() === name.toLowerCase())){ toast(name + ' already exists.'); return; }
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'type';
    let k = base, i = 2; while (TYPES[k]) k = base + '-' + i++;
    TYPES[k] = {label:name, short:name, color:'#5a6b7d', icon:'other'};
    toast('Added ' + name + '. Pick it when you create a device.'); renderSetTypes(); render();
  };
}
