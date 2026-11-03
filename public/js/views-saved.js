/* Saved views: the device list's filters, search, columns and sort under a name, in the sidebar's Views. Admins save,
   rename and delete them (setting savedViews, shared by all); everyone can open them. */
import { VIEWS_MAX, applyViewFilters, hiddenFor, removeView, renameView, sameView, serializeView, tableStateFor, upsertView } from './saved-views.js';
import { $, deleteButton, editButton, rid, st, toast } from './01-core.js';
import { queueServerSave, render, view } from './07-render.js';
import { TBL, saveTBL } from './06-topbar.js';
import { isAdmin } from './04-settings.js';
import { closeModal, confirmModal, modal } from './19-modal.js';
import { resetFilters } from './02-views.js';
import { hiddenCols, setHiddenCols, tableCols } from './views-table.js';
import { html, rawHtml } from './html.js';

const TABLE_KEY = 'view:table:0';
const views = () => Array.isArray(st.savedViews) ? st.savedViews : [];
/* The view the device list shows now. */
export const currentView = () => serializeView(st, { cols: tableCols().filter(c => c.fixed || !hiddenCols().includes(c.k)).map(c => c.k), tv: TBL[TABLE_KEY] || null });
const isShown = v => !st.scope && ['cards', 'table', 'map'].includes(st.tab) && sameView(currentView(), v);

/* The sidebar's Views: shown while there are any; the one the list shows now is marked. */
export function renderSavedViews(){
  const list = views(), hdr = $('#viewHdr'), box = $('#viewList');
  if (!hdr || !box) return;
  hdr.hidden = box.hidden = !list.length;
  const admin = isAdmin();
  box.innerHTML = html`${list.map(v => html`<div class="svrow"><button class="item ${isShown(v) ? 'sel' : ''}" data-savedview="${v.id}" title="Show the list as saved in this view"><span class="lbl">${v.name}</span></button>${admin ? rawHtml(editButton(String(html`data-svren="${v.id}"`), v.name).replace('aria-label="Edit', 'aria-label="Rename').replace('title="Edit"', 'title="Rename"') + deleteButton(String(html`data-svdel="${v.id}"`), v.name)) : ''}</div>`)}`;
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
export const saveViewBtn = () => isAdmin() && !st.scope ? '<button id="svSave" title="Keep these filters, search, columns and sort as a view in the sidebar">Save view…</button>' : '';
export const bindSaveView = () => { const b = $('#svSave'); if (b) b.onclick = saveViewModal; };

const side = $('#viewList');
if (side) side.addEventListener('click', e => {
  const ren = e.target.closest('[data-svren]'), del = e.target.closest('[data-svdel]'), open = e.target.closest('[data-savedview]');
  if (ren && isAdmin()){
    const v = views().find(x => x.id === ren.dataset.svren); if (!v) return;
    nameModal('Rename view', v.name, '', name => {
      if (views().some(x => x.id !== v.id && x.name.toLowerCase() === name.toLowerCase())){ toast(`A view is already called “${name}”.`); return false; }
      st.savedViews = renameView(views(), v.id, name); queueServerSave(); render();
    });
  } else if (del && isAdmin()){
    const v = views().find(x => x.id === del.dataset.svdel); if (!v) return;
    confirmModal('Delete view', html`Delete the view “${v.name}” for every user? The devices are not touched.`, 'Delete', () => {
      st.savedViews = removeView(views(), v.id); queueServerSave(); render(); toast(`View “${v.name}” deleted`);
    });
  } else if (open){
    const v = views().find(x => x.id === open.dataset.savedview); if (v) restoreView(v);
  }
});
