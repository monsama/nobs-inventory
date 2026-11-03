/* Recurring maintenance on a device's page: its tasks with when each is due, Done… (when, who, a note) and, for someone
   who may change the device, adding, changing and removing tasks. The rules and dates are in maintenance.js; the
   Overview lists what is due, the weekly e-mail too. */
import { $, esc, hist, now, toast } from './01-core.js';
import { MAINT_MAX, MAINT_UNITS, addInterval, daysTo, doneTask, dueState, everyText, todayDay } from './maintenance.js';
import { isAdmin, who } from './04-settings.js';
import { queueServerSave, render } from './07-render.js';
import { closeModal, modal } from './19-modal.js';
import { dateText } from './dates.js';
import { dateBad, dateFieldHtml, dateValue } from './datefield.js';
import { html, rawHtml } from './html.js';

const newId = () => 'm' + Math.random().toString(36).slice(2, 9);
/* The due date as a chip: overdue, due soon or later. */
export function dueChip(m, today = todayDay()){
  const n = daysTo(m.due, today), s = dueState(m, today);
  const when = n < 0 ? `overdue since ${dateText(m.due)}` : n === 0 ? 'due today' : `due ${dateText(m.due)}`;
  return String(html`<span class="chip ${s === 'late' ? 'bad' : s === 'soon' ? 'warn' : 'ok'}">${when}</span>`);
}

export function maintPanel(o){
  const list = o.maint || [], edit = isAdmin(), today = todayDay();
  const editIcon = rawHtml('<svg class="i" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg>');
  const row = m => {
    const last = (m.log || [])[0];
    return html`<div class="relrow mt-row"><span class="t"><b>${m.what}</b><span class="muted"> · ${everyText(m)}</span>
        ${last && html`<small class="muted mt-last">Last done ${dateText(last.at)}${last.by && html` by ${last.by}`}${last.note && html`: ${last.note}`}</small>`}</span>
      ${rawHtml(dueChip(m, today))}
      ${edit && html`<button type="button" data-mtdone="${m.id}">Done…</button><button class="icon ghost" data-mtedit="${m.id}" title="Change the task" aria-label="Change ${m.what}">${editIcon}</button>`}</div>`;
  };
  const sorted = [...list].sort((a, b) => a.due.localeCompare(b.due));
  return String(html`<div class="panelbox" id="mtPanel"><div class="hdr">Maintenance <span class="cnt">${list.length || 'none'}</span></div>
    <div class="relist">${sorted.length ? sorted.map(row) : html`<p class="note lempty">No recurring maintenance: a battery to test, firmware to update, a filter to change.</p>`}</div>
    ${edit && list.length < MAINT_MAX && html`<div class="addrel"><button type="button" id="mtAdd">Add maintenance…</button></div>`}</div>`);
}

/* Done: on which day (today unless said), and a note; the next due date moves on from that day. */
export function maintDoneModal(o, id, after = render){
  const m = (o.maint || []).find(x => x.id === id); if (!m) return;
  modal(`<div class="mh">Maintenance done</div><div class="mb"><p class="note"><b>${esc(o.name)}</b>: ${esc(m.what)} (${esc(everyText(m))})</p>
    <div class="form2"><label for="mtDay">Done on</label>${dateFieldHtml('id="mtDay"', todayDay())}
      <label for="mtNote">Note</label><textarea id="mtNote" rows="3" maxlength="500" placeholder="Optional: what was done or found"></textarea></div>
    <p class="note" id="mtNext"></p></div>
    <div class="mf"><button id="mtNo">Cancel</button><button id="mtOk" class="primary">Mark as done</button></div>`, 'sm');
  const next = () => { const d = dateValue($('#mtDay')); $('#mtNext').textContent = d ? `Next due: ${dateText(addInterval(d, m.every, m.unit))}.` : ''; };
  next(); $('#mtDay').addEventListener('change', next);
  $('#mtNo').onclick = closeModal;
  $('#mtOk').onclick = () => {
    const el = $('#mtDay'), day = dateValue(el);
    if (dateBad(el) || !day){ toast('Write the day it was done as dd.mm.yyyy'); el.focus(); return; }
    if (day > todayDay()){ toast('The day it was done cannot be in the future.'); el.focus(); return; }
    const note = $('#mtNote').value.trim(), by = who();
    o.maint = o.maint.map(x => x.id === id ? doneTask(x, day, by, note) : x);
    const done = o.maint.find(x => x.id === id);
    hist(o, now(), `Maintenance done: ${m.what} on ${dateText(day)} by ${by}${note ? ` (${note})` : ''}; next due ${dateText(done.due)}`);
    queueServerSave(); closeModal(); after();
    toast(`${m.what}: done. Next due ${dateText(done.due)}`);
  };
  $('#mtNote').focus();
}

/* Add or change a task: what, every how many days, weeks, months or years, and the next due date. */
function maintEditModal(o, id){
  const m = id ? (o.maint || []).find(x => x.id === id) : null;
  modal(`<div class="mh">${m ? 'Change maintenance' : 'Add maintenance'}</div><div class="mb">
    <div class="form2"><label for="mtWhat">What</label><input id="mtWhat" maxlength="120" value="${esc(m ? m.what : '')}" placeholder="e.g. Test the UPS battery">
      <label for="mtEvery">Every</label><div class="bk-exrow"><input id="mtEvery" type="number" min="1" max="999" value="${m ? m.every : 1}" style="width:80px">
        <select id="mtUnit" aria-label="Unit">${Object.entries(MAINT_UNITS).map(([k, [, many]]) => `<option value="${k}" ${(m ? m.unit : 'y') === k ? 'selected' : ''}>${many}</option>`).join('')}</select></div>
      <label for="mtDue">Next due</label>${dateFieldHtml('id="mtDue"', m ? m.due : todayDay())}</div>
    ${m && (m.log || []).length ? `<details class="mt-log"><summary>Done ${m.log.length} time${m.log.length === 1 ? '' : 's'}</summary><ul>${m.log.map(e => `<li>${esc(dateText(e.at))}${e.by ? ` · ${esc(e.by)}` : ''}${e.note ? ` · ${esc(e.note)}` : ''}</li>`).join('')}</ul></details>` : ''}</div>
    <div class="mf">${m ? '<button id="mtDel" class="danger-text" style="margin-right:auto">Remove</button>' : ''}<button id="mtNo">Cancel</button><button id="mtSave" class="primary">${m ? 'Save' : 'Add'}</button></div>`, 'sm');
  $('#mtNo').onclick = closeModal;
  $('#mtSave').onclick = () => {
    const what = $('#mtWhat').value.trim(), every = Number($('#mtEvery').value), unit = $('#mtUnit').value, el = $('#mtDue'), due = dateValue(el);
    if (!what){ toast('Say what is done.'); $('#mtWhat').focus(); return; }
    if (!Number.isInteger(every) || every < 1 || every > 999){ toast('The interval is a whole number from 1 to 999.'); $('#mtEvery').focus(); return; }
    if (dateBad(el) || !due){ toast('Write the next due date as dd.mm.yyyy'); el.focus(); return; }
    const t = { ...(m || { id: newId() }), what, every, unit, due };
    o.maint = m ? o.maint.map(x => x.id === m.id ? t : x) : [...(o.maint || []), t];
    hist(o, now(), m ? `Maintenance changed: ${what}, ${everyText(t)}, next due ${dateText(due)} by ${who()}` : `Maintenance added: ${what}, ${everyText(t)}, first due ${dateText(due)} by ${who()}`);
    queueServerSave(); closeModal(); render();
  };
  const del = $('#mtDel');
  if (del) del.onclick = () => {
    o.maint = o.maint.filter(x => x.id !== m.id); if (!o.maint.length) delete o.maint;
    hist(o, now(), `Maintenance removed: ${m.what} by ${who()}`);
    queueServerSave(); closeModal(); render(); toast(`${m.what}: removed`);
  };
  $('#mtWhat').focus();
}

export function bindMaint(o){
  const v = $('#view');
  const add = $('#mtAdd'); if (add) add.onclick = () => maintEditModal(o, null);
  v.querySelectorAll('[data-mtdone]').forEach(b => b.onclick = () => maintDoneModal(o, b.dataset.mtdone));
  v.querySelectorAll('[data-mtedit]').forEach(b => b.onclick = () => maintEditModal(o, b.dataset.mtedit));
}
