/* Saved views: the device list's filters, search, columns and sort under a name, in the sidebar's Views. Admins save,
   edit and delete them (setting savedViews, shared by all), and can have one sent by mail as an Excel file
   (server/view-mail.js); everyone can open them. */
import { VIEWS_MAX, VIEW_MAIL_EVERY, WEEKDAYS, applyViewFilters, hiddenFor, mailList, mailText, nextMail, removeView, renameView, sameView, serializeView, setViewMail, tableStateFor, upsertView, viewMailProblem } from './saved-views.js';
import { $$, $, deleteButton, editButton, esc, rid, st, toast } from './01-core.js';
import { flushSave, queueServerSave, render, view } from './07-render.js';
import { dateTimeText, stamp } from './dates.js';
import { html } from './html.js';
import { TBL, saveTBL } from './06-topbar.js';
import { isAdmin } from './04-settings.js';
import { closeModal, confirmModal, modal } from './19-modal.js';
import { resetFilters } from './02-views.js';
import { hiddenCols, setHiddenCols, tableCols } from './views-table.js';

const TABLE_KEY = 'view:table:0';
const views = () => Array.isArray(st.savedViews) ? st.savedViews : [];
/* The view the device list shows now. */
export const currentView = () => serializeView(st, { cols: tableCols().filter(c => c.fixed || !hiddenCols().includes(c.k)).map(c => c.k), tv: TBL[TABLE_KEY] || null });
const isShown = v => !st.scope && ['cards', 'table', 'map'].includes(st.tab) && sameView(currentView(), v);

/* The sidebar's Views: shown while there are any; the one the list shows now is marked, one sent by mail has an envelope
   (and says when it was last sent). */
const MAIL_ICON = '<svg class="i sv-mail-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v12H3zM3 7l9 6 9-6"/></svg>';
const mailNote = v => {
  if (!v.mail || v.mail.every === 'none') return '';
  const r = (st.viewMailRuns || {})[v.id];
  return `\nSent by mail ${mailText(v.mail)}${r ? `; last ${r.ok ? 'sent' : 'send failed'} ${dateTimeText(r.at)}` : ''}`;
};
export function renderSavedViews(){
  const list = views(), hdr = $('#viewHdr'), box = $('#viewList');
  if (!hdr || !box) return;
  hdr.hidden = box.hidden = !list.length;
  const admin = isAdmin();
  box.innerHTML = list.map(v => `<div class="svrow"><button class="item ${isShown(v) ? 'sel' : ''}" data-savedview="${esc(v.id)}" title="Show the list as saved in this view${esc(mailNote(v))}"><span class="lbl">${esc(v.name)}</span>${v.mail && v.mail.every !== 'none' ? MAIL_ICON : ''}</button>${admin ? editButton(`data-svren="${esc(v.id)}"`, v.name) + deleteButton(`data-svdel="${esc(v.id)}"`, v.name) : ''}</div>`).join('');
}
/* A view opened: every filter goes, then the view's filters, search, tab, columns, column filters and sort are put on. */
export function restoreView(v){
  resetFilters();
  st.scope = null; st.rvSrc = ''; st.rvKnown = false; st.rvOld = false; st.bulk = new Set();
  applyViewFilters(v, st);
  setHiddenCols(hiddenFor(v, tableCols().filter(c => !c.fixed).map(c => c.k)));
  const hidden = hiddenCols(), keys = tableCols().filter(c => c.fixed || !hidden.includes(c.k)).map(c => c.k);
  /* A layout kept aside for a data-quality list would come back over the view's: it is dropped. */
  delete TBL[TABLE_KEY + ':keep'];
  TBL[TABLE_KEY] = tableStateFor(v, TBL[TABLE_KEY], keys); saveTBL();
  document.body.classList.remove('side-open');
  view();
}
/* The name dialog of Save view and Rename. */
function nameModal(title, name, note, ok){
  modal(html`<div class="mh">${title}</div><div class="mb"><div class="form"><label for="svName">Name</label><input id="svName" maxlength="80" value="${name}" autocomplete="off"></div>${note ? html`<p class="note">${note}</p>` : ''}</div>
    <div class="mf"><button id="svCancel">Cancel</button><button id="svOk" class="primary">Save</button></div>`, 'sm');
  const go = () => { const n = $('#svName').value.trim(); if (!n){ toast('Give the view a name.'); $('#svName').focus(); return; } if (ok(n) !== false) closeModal(); };
  $('#svCancel').onclick = closeModal; $('#svOk').onclick = go;
  $('#svName').onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); go(); } };
  $('#svName').select();
}
/* Save view…: the list as it is shown now, under a name; a view of that name is replaced. */
export function saveViewModal(){
  const shown = views().find(isShown);
  nameModal('Save view', shown ? shown.name : '', 'Keeps the filters, the search, the columns shown, the column filters and the sort. Every user sees the view in the sidebar; a view of the same name is replaced.', name => {
    const list = upsertView(views(), currentView(), name, 'v' + rid());
    if (list.length > VIEWS_MAX){ toast(`At most ${VIEWS_MAX} views: delete one first.`); return false; }
    const replaced = list.length === views().length;
    st.savedViews = list; queueServerSave(); render();
    toast(`View “${name}” ${replaced ? 'replaced' : 'saved'}`);
  });
}
/* Edit: the name, and Send by mail: how often, the day and hour, the addresses, the last send, and Send now. Mail needs
   the mail server of Settings → System → E-mail; without one the part is shown off. */
const lastSend = (v, m) => {
  const r = (st.viewMailRuns || {})[v.id], next = nextMail(m);
  return [!r ? 'Not sent yet.' : r.ok ? `Last sent ${dateTimeText(r.at)} to ${r.to} address${r.to === 1 ? '' : 'es'}: ${r.n} device${r.n === 1 ? '' : 's'}.` : `The last send failed (${dateTimeText(r.at)}): ${r.error || 'unknown'}`,
    next ? `Next: ${stamp(next)}.` : ''].filter(Boolean).join(' ');
};
const DAYS_SHOWN = [1, 2, 3, 4, 5, 6, 0];
function editViewModal(v){
  const m0 = v.mail || { every: 'none', hour: 7, to: [] };
  modal(String(html`<div class="mh">Edit view</div><div class="mb"><div class="form"><label for="svName">Name</label><input id="svName" maxlength="80" value="${v.name}" autocomplete="off"></div>
    <fieldset class="sv-mail"><legend>Send by mail</legend>
      <p class="note" id="svMailNote">The devices the view lists, as an Excel file, to the addresses below. Sent by the server, at its time.</p>
      <div class="form">
        <label for="svEvery">Send</label><select id="svEvery" disabled>${Object.entries(VIEW_MAIL_EVERY).map(([k, l]) => html`<option value="${k}" ${k === m0.every ? 'selected' : ''}>${l}</option>`)}</select>
        <label for="svDay" class="sv-day">On</label><select id="svDay" class="sv-day" disabled></select>
        <label for="svHour" class="sv-hour">At</label><select id="svHour" class="sv-hour" disabled>${Array.from({ length: 24 }, (_, h) => html`<option value="${h}" ${h === m0.hour ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`)}</select>
        <label for="svTo">To</label><textarea id="svTo" rows="2" disabled placeholder="it@example.com, lead@example.com">${(m0.to || []).join(', ')}</textarea>
      </div>
      <p class="note" id="svLast">${lastSend(v, m0)}</p>
      <div><button type="button" id="svSend" disabled>Send now</button></div>
    </fieldset></div>
    <div class="mf"><button id="svCancel">Cancel</button><button id="svOk" class="primary">Save</button></div>`), 'sm');
  let smtp = false;
  const fillDays = (every, day) => {
    $('#svDay').innerHTML = String(every === 'monthly' ? html`${Array.from({ length: 28 }, (_, i) => html`<option value="${i + 1}" ${i + 1 === day ? 'selected' : ''}>${i + 1}.</option>`)}`
      : html`${DAYS_SHOWN.map(d => html`<option value="${d}" ${d === day ? 'selected' : ''}>${WEEKDAYS[d]}</option>`)}`);
  };
  const shape = () => {
    const every = $('#svEvery').value;
    $$('#mdl .sv-day').forEach(el => { el.hidden = every !== 'weekly' && every !== 'monthly'; });
    $$('#mdl .sv-hour').forEach(el => { el.hidden = every === 'none'; });
    ['#svEvery', '#svDay', '#svHour', '#svTo', '#svSend'].forEach(id => { $(id).disabled = !smtp; });
  };
  fillDays(m0.every, m0.day ?? 1);
  $('#svEvery').onchange = () => { const e = $('#svEvery').value; if (e === 'weekly' || e === 'monthly') fillDays(e, 1); shape(); };
  shape();
  /* Whether a mail server is set, and the last sends as the server has them. */
  fetch('api/view-mail', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(d => {
    if (!d || !$('#svMailNote')) return;
    smtp = !!d.smtp; st.viewMailRuns = d.runs || {};
    if (!smtp) $('#svMailNote').textContent = 'No mail server is set: set one in Settings → System → E-mail first.';
    $('#svLast').textContent = lastSend(v, v.mail || m0);
    shape();
  }).catch(() => { /* off: shown without mail */ });
  const read = () => {
    const every = $('#svEvery').value;
    return { every, hour: Number($('#svHour').value), to: mailList($('#svTo').value), ...(every === 'weekly' || every === 'monthly' ? { day: Number($('#svDay').value) } : {}) };
  };
  /* The name and schedule as typed, put on the views; false (and said) when something is wrong. */
  const apply = () => {
    const name = $('#svName').value.trim();
    if (!name){ toast('Give the view a name.'); $('#svName').focus(); return false; }
    if (views().some(x => x.id !== v.id && x.name.toLowerCase() === name.toLowerCase())){ toast(`A view is already called “${name}”.`); return false; }
    const mail = smtp ? read() : v.mail;
    const p = mail && viewMailProblem(mail, name); if (p){ toast(p); $('#svTo').focus(); return false; }
    st.savedViews = setViewMail(renameView(views(), v.id, name), v.id, mail); queueServerSave();
    return true;
  };
  $('#svCancel').onclick = closeModal;
  $('#svOk').onclick = () => { if (apply()){ closeModal(); render(); } };
  $('#svName').onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); $('#svOk').click(); } };
  $('#svSend').onclick = async () => {
    if (!read().to.length){ toast('Give the addresses to send it to.'); $('#svTo').focus(); return; }
    if (!apply()) return;
    const b = $('#svSend'); b.disabled = true; b.textContent = 'Sending…';
    try {
      await flushSave();
      const r = await fetch(`api/views/${encodeURIComponent(v.id)}/send`, { method: 'POST', credentials: 'same-origin' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'The mail could not be sent.');
      st.viewMailRuns = { ...(st.viewMailRuns || {}), [v.id]: d.last };
      toast(`Sent to ${d.last.to} address${d.last.to === 1 ? '' : 'es'}: ${d.last.n} device${d.last.n === 1 ? '' : 's'}`);
    } catch (err) {
      st.viewMailRuns = { ...(st.viewMailRuns || {}), [v.id]: { at: new Date().toISOString(), ok: false, error: err.message } };
      toast(err.message);
    }
    const now = views().find(x => x.id === v.id);
    if ($('#svLast')) $('#svLast').textContent = lastSend(v, now && now.mail);
    if ($('#svSend')){ b.disabled = false; b.textContent = 'Send now'; }
    renderSavedViews();
  };
  $('#svName').select();
}
export const saveViewBtn = () => isAdmin() && !st.scope ? '<button id="svSave" title="Keep these filters, search, columns and sort as a view in the sidebar">Save view…</button>' : '';
export const bindSaveView = () => { const b = $('#svSave'); if (b) b.onclick = saveViewModal; };

const side = $('#viewList');
if (side) side.addEventListener('click', e => {
  const ren = e.target.closest('[data-svren]'), del = e.target.closest('[data-svdel]'), open = e.target.closest('[data-savedview]');
  if (ren && isAdmin()){
    const v = views().find(x => x.id === ren.dataset.svren); if (v) editViewModal(v);
  } else if (del && isAdmin()){
    const v = views().find(x => x.id === del.dataset.svdel); if (!v) return;
    confirmModal('Delete view', html`Delete the view “${v.name}” for every user? The devices are not touched.`, 'Delete', () => {
      st.savedViews = removeView(views(), v.id); queueServerSave(); render(); toast(`View “${v.name}” deleted`);
    });
  } else if (open){
    const v = views().find(x => x.id === open.dataset.savedview); if (v) restoreView(v);
  }
});
