/* Edit fields…: one dialog that sets or clears fields of the picked devices (Cards or the Table), with a preview of what
   changes, saved as edits by hand with a history line per device and field, and one Undo. What changes is bulk-edit.js. */
import { FIELD_LAYOUT, MODELS, TYPE_FIELDS, $, byId, feedOwns, fieldFixed, hist, now, restoreSnapshot, setByHand, snapshot, toastUndo } from './01-core.js';
import { who } from './04-settings.js';
import { render } from './07-render.js';
import { num } from './09-costs.js';
import { fieldCtl, typeFieldsOf } from './17-fields.js';
import { closeModal, modal } from './19-modal.js';
import { syncOwned } from './28-restore.js';
import { PREVIEW_ROWS, UNIQUE_WHY, bulkFields, changedDevices, fieldSummary, historyLine, ownedNote, planBulk, shownValue } from './bulk-edit.js';
import { parseDay } from './datefield.js';
import { html, rawHtml } from './html.js';
import { applyPatch, fieldPatch } from './restore.js';
import { SOURCE_LABEL } from './sync-map.js';

/* A type's fields as its device page has them: the built-in ones and the type's own (custom.<key>). */
const fieldsOf = type => [...typeFieldsOf(type), ...(TYPE_FIELDS[type] || []).map(f => ['custom.' + f.key, f.label, f.kind])];
/* The field's name on the device, as its type's layout names it (as the device page writes its history). */
const labelOn = (o, f) => ((FIELD_LAYOUT[o.type] || {}).labels || {})[f.k] || (fieldsOf(o.type).find(x => x[0] === f.k) || [])[1] || f.label;
/* The source that writes field k of o now, as the device page's source mark tells it; '' for none. */
const ownerOf = (o, k) => {
  if (k === 'notes' || k.startsWith('custom.') || !syncOwned(o, k)) return '';
  const fixed = fieldFixed(o, k);
  return fixed && fixed !== 'hand' ? fixed : feedOwns(o, k) ? 'ls' : 'graph';
};

export function bulkEditModal(ids){
  /* Devices of the inventory only: a record waiting in To review is accepted first. */
  const list = ids.map(byId).filter(o => o && !o.review);
  if (!list.length) return;
  const fields = bulkFields(list, fieldsOf);
  const n = list.length, devs = c => `${c} ${c === 1 ? 'device' : 'devices'}`;
  let rows = 0;
  /* The value's control, as on the device page (a date field, a number, the model's list); notes a text box. */
  const valueCtl = (i, f) => f.kind === 'notes'
    ? html`<textarea id="be_v${i}" class="notes-box" rows="3" maxlength="20000" aria-label="New notes"></textarea>`
    : html`${rawHtml(fieldCtl({ id: 'v' + i, custom: {} }, [f.k, f.label, f.kind], 'be_').replace('<input ', `<input aria-label="New ${f.label.replace(/["<>&]/g, '')}" `))}<span hidden></span><p class="fieldnote" id="${`be_v${i}_${f.k}_note`}" hidden></p>`;
  const rowHtml = (i, k) => {
    const f = fields.find(x => x.k === k);
    return html`<div class="be-row" data-row="${i}">
      <select class="be-f" aria-label="Field">${fields.map(x => html`<option value="${x.k}" ${rawHtml(x.k === k ? 'selected' : '')}>${x.label}</option>`)}</select>
      <select class="be-op" aria-label="Set or clear"><option value="set">Set to</option><option value="clear">Clear</option></select>
      <div class="be-v">${valueCtl(i, f)}</div>
      <label class="pchk be-only"><input type="checkbox" class="be-empty"> Only where empty</label>
      <button type="button" class="icon ghost be-x" aria-label="Remove this field" title="Remove">×</button></div>`;
  };
  const free = () => fields.find(f => ![...document.querySelectorAll('#beRows .be-f')].some(s => s.value === f.k));
  modal(String(html`<div class="mh">Edit fields of ${devs(n)}</div><div class="mb be">
    <p class="note">Each field picked is set or cleared on every selected device that has it, as an edit by hand on its page: a line in its history, and one Undo for all. ${UNIQUE_WHY}</p>
    <div id="beRows"></div>
    <button type="button" id="beAdd">+ Add another field</button>
    <div id="bePrev" class="be-prev" aria-live="polite"></div></div>
    <div class="mf"><button id="beNo">Cancel</button><button id="beOk" class="primary" disabled>Apply</button></div>`));
  const rowsEl = $('#beRows');
  const addRow = k => {
    if (!k) return;
    rowsEl.insertAdjacentHTML('beforeend', String(rowHtml(rows++, k)));
    $('#beAdd').hidden = !free();
  };
  addRow((fields[0] || {}).k);
  /* What the rows ask for, as typed. */
  const read = () => [...rowsEl.querySelectorAll('.be-row')].map(r => {
    const v = r.querySelector('.be-v input:not(.df-native), .be-v textarea');
    return { k: r.querySelector('.be-f').value, op: r.querySelector('.be-op').value, raw: v ? v.value : '', onlyEmpty: r.querySelector('.be-empty').checked };
  });
  let plan = null;
  const preview = () => {
    plan = planBulk(list, read(), fields, { parseDay, num, ownerOf });
    const ch = changedDevices(plan);
    $('#beOk').disabled = !!plan.errors.length || !ch.length;
    $('#beOk').textContent = ch.length && !plan.errors.length ? `Apply to ${devs(ch.length)}` : 'Apply';
    $('#bePrev').innerHTML = String(plan.errors.length ? html`<p class="note warn">${plan.errors.join(' ')}</p>`
      : html`<div class="hdr">Preview</div>${plan.fields.map(x => html`<div class="be-field"><b>${fieldSummary(x, n)}</b>
        ${ownedNote(x, SOURCE_LABEL) && html`<p class="note">${ownedNote(x, SOURCE_LABEL)}</p>`}
        ${x.changes.length > 0 && html`<ul class="be-list">${x.changes.slice(0, PREVIEW_ROWS).map(c => html`<li><b>${c.o.name}</b> <span class="muted">${shownValue(x.f, c.from) || 'empty'}</span> → ${shownValue(x.f, c.to) || 'empty'}</li>`)}${x.changes.length > PREVIEW_ROWS && html`<li class="muted">and ${x.changes.length - PREVIEW_ROWS} more</li>`}</ul>`}</div>`)}`);
  };
  /* A row's field picked: its value control follows; Clear has no value and no "only where empty". */
  rowsEl.addEventListener('change', e => {
    const r = e.target.closest('.be-row'); if (!r) return;
    if (e.target.matches('.be-f')){ const i = +r.dataset.row; r.querySelector('.be-v').innerHTML = String(valueCtl(i, fields.find(x => x.k === e.target.value))); }
    const clear = r.querySelector('.be-op').value === 'clear';
    r.querySelector('.be-v').classList.toggle('be-off', clear);   /* its place is kept, so the rows stay aligned */
    const only = r.querySelector('.be-empty'); only.disabled = clear; if (clear) only.checked = false;
    preview();
  });
  rowsEl.addEventListener('input', preview);
  rowsEl.addEventListener('combopick', preview);
  rowsEl.addEventListener('click', e => {
    if (!e.target.closest('.be-x')) return;
    e.target.closest('.be-row').remove();
    $('#beAdd').hidden = !free();
    if (!rowsEl.children.length) addRow((fields[0] || {}).k);
    preview();
  });
  $('#beAdd').onclick = () => { const f = free(); addRow(f && f.k); preview(); const s = rowsEl.querySelector('.be-row:last-child .be-v input, .be-row:last-child .be-v textarea'); if (s) s.focus(); };
  $('#beNo').onclick = closeModal;
  $('#beOk').onclick = () => {
    preview(); if (!plan || plan.errors.length) return;
    const ch = changedDevices(plan); if (!ch.length) return;
    const snap = snapshot(ch), at = new Date().toISOString();
    /* As the device page saves a field: kept from the syncs where one writes it, one history line each with both values. */
    for (const x of plan.fields) for (const { o, from, to } of x.changes){
      /* A source wrote it (the dialog said so): it is the page's from now on, noted as on the device page. */
      const owned = !!ownerOf(o, x.f.k), kept = (!x.f.k.startsWith('custom.') && setByHand(o, x.f.k, to)) || owned;
      applyPatch(o, fieldPatch(o, x.f.k, to));
      if (x.f.k === 'model' && to && !MODELS.includes(to)) MODELS.push(to);
      o.handAt = at;
      const { msg, note } = historyLine(labelOn(o, x.f), x.f, from, to);
      hist(o, now(), `${msg} by ${who()} (bulk)${kept ? ' · kept from the syncs' : ''}`, note);
    }
    const names = plan.fields.filter(x => x.changes.length).map(x => x.f.label);
    closeModal(); render();
    toastUndo(`${devs(ch.length)} changed: ${names.join(', ')}`, () => { restoreSnapshot(snap, 'Bulk edit undone by ' + who()); render(); });
  };
  preview();
}
