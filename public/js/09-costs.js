/* Costs: contracts (maintenance, support, leases, subscriptions) with their notice dates and the devices they cover,
   and software licences with their seats against the installs the inventory knows. */
import { dateBad, dateFieldHtml, dateValue } from './datefield.js';
import { deleteButton, toastUndo, editButton, $, CONTACTS, COSTS, byId, contactOf, dayText, esc, objs, st, tico, toast, noMatchHtml, oncePerDraw, perDrawOf } from './01-core.js';
import { contactLabel } from './contacts.js';
import { contactCompanies, contactModal } from './11-contacts.js';
import { CONTRACT_KINDS, PERIODS, NOTICE_SOON_DAYS, contractStatus, costInYear, licenceUse, runningNow, yearlyCost } from './costs.js';
import { COMBO_SOURCES, comboHtml } from './17-fields.js';
import { closeModal, confirmModal, modal } from './19-modal.js';
/* The supplier field offers the companies of the contacts and the suppliers already on contracts. */
/* Suppliers for a contract and for a device: the companies in Contacts, the contracts' suppliers and the devices'. */
COMBO_SOURCES.supplier = () => [...new Set([...contactCompanies(), ...COSTS.contracts.map(c => c.supplier), ...objs.map(o => typeof o.supplier === 'string' ? o.supplier.trim() : '')].filter(Boolean))].sort((a, b) => a.localeCompare(b));
import { SW, ensurePackages, knownSoftware, queueServerSave, render } from './07-render.js';
import { isAdmin } from './04-settings.js';
import { html, rawHtml } from './html.js';
import { bindListViews, listViewsMenuHtml } from './views-saved.js';
import { bindViewSearch, markHtml, matchWords, qWords, viewSearchHtml } from './view-search.js';

const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
/* An amount in the inventory's currency: whole numbers without decimals, others with two. */
export const money = v => typeof v === 'number' && isFinite(v) ? `${esc(COSTS.currency || 'CHF')} ${v.toLocaleString(undefined, { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}` : '';
/* An amount as people type it: 1200, 1'200.50, 1 200,50, 1.200,50 or 1,200.50. With both marks the last one is the
   decimal point; a comma alone is a thousands mark before groups of three (1,200) and a decimal comma otherwise (12,5). */
export const num = v => {
  let t = String(v ?? '').trim().replace(/['’\s]/g, '');
  if (/[.,].*[.,]/.test(t) && t.includes('.') && t.includes(',')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (/^[1-9]\d{0,2}(,\d{3})+$/.test(t)) t = t.replace(/,/g, '');
  else if (/^[1-9]\d{0,2}(\.\d{3}){2,}$/.test(t)) t = t.replace(/\./g, '');
  else t = t.replace(',', '.');
  /* Up to a billion, as the server takes it: a larger amount is refused here, not by every save after it. */
  return t === '' || !isFinite(+t) || +t > 1e9 ? undefined : Math.max(0, Math.round(+t * 100) / 100);
};
const int = (v, max) => { const n = parseInt(v, 10); return isFinite(n) ? Math.min(max, Math.max(0, n)) : 0; };

/* ---------- contracts ---------- */
/* Where a contract stands, as a chip: what is due and when. */
export function contractChip(c){
  const s = contractStatus(c);
  if (s.state === 'open') return html`<span class="chip kept">No end date</span>`;
  if (s.state === 'ended') return html`<span class="chip bad">Ended ${dayText(s.end)}</span>`;
  if (c.renew > 0){
    if (s.state === 'soon') return html`<span class="chip warn" title="Renews by itself on ${dayText(s.end)} unless notice is given">Give notice by ${dayText(s.noticeBy)}</span>`;
    /* Too late to give notice for this term: it renews for another term, which is worth a look, not a calm grey. */
    if (s.state === 'late') return html`<span class="chip warn" title="The notice date, ${dayText(s.noticeBy)}, has passed: it renews on ${dayText(s.end)} for ${c.renew} more month${c.renew === 1 ? '' : 's'}">Notice passed · renews ${dayText(s.end)}</span>`;
    return html`<span class="chip kept" title="${c.notice > 0 ? 'Notice by ' + dayText(s.noticeBy) : 'No notice period'}">Renews ${dayText(s.end)}</span>`;
  }
  return s.state === 'soon' ? html`<span class="chip warn">Ends ${dayText(s.end)}</span>` : html`<span class="chip kept">Runs to ${dayText(s.end)}</span>`;
}
/* Contracts in the order they need someone: notice due soon, notice missed, running, open-ended, ended; then by date. */
const ORDER = { soon: 0, late: 1, ok: 2, open: 3, ended: 4 };
const sorted = list => [...list].map(c => ({ c, s: contractStatus(c) }))
  .sort((a, b) => ORDER[a.s.state] - ORDER[b.s.state] || (a.s.noticeBy || a.s.end || '9').localeCompare(b.s.noticeBy || b.s.end || '9') || a.c.name.localeCompare(b.c.name));
export const contractsDue = () => COSTS.contracts.filter(c => contractStatus(c).state === 'soon');
/* Contracts whose notice date for this term has passed: they renew whatever is done now. */
export const contractsLate = () => COSTS.contracts.filter(c => contractStatus(c).state === 'late');
/* The date notice must be given by, in the table: '' when it does not renew or needs none. */
const noticeCell = c => { const s = contractStatus(c); if (!(c.renew > 0) || !s.noticeBy || s.state === 'open') return ''; return html`<span class="${s.state === 'late' || s.state === 'soon' ? 'wty soon' : ''}">${dayText(s.noticeBy)}</span>`; };
export const contractsOf = o => COSTS.contracts.filter(c => (c.devices || []).includes(o.id));

/* What all contracts cost this year and the next two, with this year by kind. */
function costSummary(all){
  const y0 = new Date().getFullYear(), years = [y0, y0 + 1, y0 + 2];
  const per = years.map(y => all.reduce((t, c) => t + costInYear(c, y), 0));
  if (!per.some(v => v > 0)) return '';
  const kinds = Object.entries(CONTRACT_KINDS).map(([k, l]) => [l, all.filter(c => c.kind === k).reduce((t, c) => t + costInYear(c, y0), 0)]).filter(([, v]) => v > 0);
  /* The Overview's tiles: a label, the figure, a line under it; this year by kind is the fourth. */
  const when = ['this year', 'next year', 'the year after'];
  return html`<div class="ov-kpis ct-sum" aria-label="Contract costs per year">
    ${years.map((y, i) => html`<div class="ov-tile"><span class="ov-tl">${y}</span><span class="ov-tv">${rawHtml(money(Math.round(per[i] * 100) / 100) || money(0))}</span><span class="ov-ts">${when[i]}</span></div>`)}
    ${kinds.length ? html`<div class="ov-tile"><span class="ov-tl">${y0} by kind</span>${kinds.map(([l, v]) => html`<span class="ct-kind"><span>${l}</span><b>${rawHtml(money(Math.round(v * 100) / 100))}</b></span>`)}</div>` : ''}
  </div>
  <details class="how ct-sum-note"><summary>How the years are counted</summary><p class="note">Each year counts the months a contract runs in it. Contracts that renew by themselves are counted as running on; one-off costs count in the year they start.</p></details>`;
}
/* The Contracts tab: the costs per year, then the contracts the search and Only due leave, with the yearly total of the
   running ones. New and Delete are for admins. */
export function renderContracts(){
  const q = (st.q || '').trim(), words = qWords(q);
  const all = COSTS.contracts;
  /* Every word in the contract: its name, number, kind, supplier, note, contacts, or the devices it covers (name,
     inventory number, serial number, user). */
  const hit = c => matchWords([c.name, c.supplier, c.ref, CONTRACT_KINDS[c.kind], c.note, ...(c.contacts || []).map(id => (contactOf(id) || {}).name),
    ...(c.devices || []).map(byId).filter(Boolean).flatMap(o => [o.name, o.code, o.serial, o.user])], words);
  /* "Only due": the contracts that need someone now, notice due soon or already passed. */
  const needs = c => ['soon', 'late'].includes(contractStatus(c).state);
  const rows = sorted(all.filter(c => hit(c) && (!st.ctDue || needs(c))));
  const live = all.filter(c => runningNow(c));
  const year = live.reduce((t, c) => t + yearlyCost(c), 0);
  const due = contractsDue().length, late = contractsLate().length;
  $('#toolbar').innerHTML = html`<span class="muted">${q ? `${rows.length} of ${all.length}` : `${all.length} ${all.length === 1 ? 'contract' : 'contracts'}`}</span>${all.length ? viewSearchHtml('Contract, supplier, number or device', 'Search the contracts') : ''}${all.length ? rawHtml(listViewsMenuHtml('contracts')) : ''}${due || late ? html`<button type="button" class="chip-btn ${st.ctDue ? 'on' : ''}" id="ctDueBtn" aria-pressed="${String(!!st.ctDue)}" title="${st.ctDue ? 'Show all contracts again' : 'Show only the contracts that need someone now'}">${[due ? `${due} due or ending within ${NOTICE_SOON_DAYS} days` : '', late ? `${late} notice passed` : ''].filter(Boolean).join(' · ')}${st.ctDue ? ' ×' : ''}</button>` : ''}<div class="grow"></div>
    ${isAdmin() ? html`<button id="ctNew" class="primary">New contract</button>` : ''}`;
  const ctNew = $('#ctNew'); if (ctNew) ctNew.onclick = () => contractModal(null);
  if (!all.length){
    $('#view').innerHTML = html`<div class="empty">No contracts yet.${isAdmin() ? html` <button type="button" class="primary" id="ctNewEmpty">New contract</button>` : ''}</div>`;
    const ne = $('#ctNewEmpty'); if (ne) ne.onclick = () => contractModal(null);
    return;
  }
  /* Admins tick contracts to delete several at once (one Undo); the ticks hold only for contracts still listed. */
  const admin = isAdmin(), sel = st.ctSel = new Set([...(st.ctSel || [])].filter(id => rows.some(r => r.c.id === id)));
  const selBar = admin && sel.size ? html`<div class="selbar" role="region" aria-label="Selected contracts"><b>${sel.size} selected</b><button type="button" data-ctbulk="edit">Change…</button><button type="button" data-ctbulk="del" class="danger-text">Delete ${sel.size}…</button><button type="button" data-ctbulk="clear">Clear</button></div>` : '';
  $('#view').innerHTML = html`${costSummary(all)}${selBar}<div class="gridwrap ct-wrap" style="height:auto"><table class="grid contracts" data-tb="own"><thead><tr>
      ${admin ? html`<th class="selcol"><input type="checkbox" data-ctall aria-label="Select every contract listed" ${rows.length && rows.every(r => sel.has(r.c.id)) ? 'checked' : ''}></th>` : ''}<th>Contract</th><th>Kind</th><th>Supplier</th><th class="num">Devices</th><th class="num">Cost</th><th>Notice by</th><th>Status</th><th aria-label="Edit"></th></tr></thead><tbody>
    ${rows.length ? rows.map(({ c }) => html`<tr${sel.has(c.id) ? html` class="picked"` : ''}>${admin ? html`<td class="selcol"><input type="checkbox" data-ctsel="${c.id}" aria-label="${`Select ${c.name}`}" ${sel.has(c.id) ? 'checked' : ''}></td>` : ''}<td title="${c.name}"><button class="link" data-contract="${c.id}"><b>${markHtml(c.name, words)}</b></button>${c.ref ? html` <span class="mono muted">${markHtml(c.ref, words)}</span>` : ''}</td>
      <td>${CONTRACT_KINDS[c.kind]}</td><td>${markHtml(c.supplier || '', words)}${contactsLine(c)}</td><td class="num">${(c.devices || []).filter(byId).length || ''}</td>
      <td class="num">${c.cost > 0 ? html`${rawHtml(money(c.cost))} <span class="muted">${PERIODS[c.per || 'year']}</span>` : ''}</td><td>${noticeCell(c)}</td><td>${contractChip(c)}</td>
      <td class="num"><span class="rowacts">${rawHtml(editButton(String(html`data-contract="${c.id}"`), c.name, isAdmin()))}${isAdmin() ? rawHtml(deleteButton(String(html`data-ctdel="${c.id}"`), c.name)) : ''}</span></td></tr>`)
      : html`<tr><td colspan="${admin ? 9 : 8}" class="muted" style="padding:14px">${st.ctDue && !st.q ? 'No contract needs anyone now.' : rawHtml(noMatchHtml())}</td></tr>`}
    </tbody>${year ? html`<tfoot><tr><td colspan="${admin ? 5 : 4}">Running contracts per year</td><td class="num"><b>${rawHtml(money(year))}</b></td><td colspan="3"></td></tr></tfoot>` : ''}</table></div>`;
  $('#view').querySelectorAll('[data-contract]').forEach(b => b.onclick = () => contractModal(COSTS.contracts.find(c => c.id === b.dataset.contract)));
  $('#view').querySelectorAll('[data-ctcontact]').forEach(b => b.onclick = () => { const k = contactOf(b.dataset.ctcontact); if (k) contactModal(k); });
  $('#view').querySelectorAll('[data-ctdel]').forEach(b => b.onclick = () => { const c = COSTS.contracts.find(x => x.id === b.dataset.ctdel); if (c) deleteContract(c); });
  const db = $('#ctDueBtn'); if (db) db.onclick = () => { st.ctDue = !st.ctDue; renderContracts(); };
  bindViewSearch(renderContracts); bindListViews();
  const v = $('#view');
  v.querySelectorAll('[data-ctsel]').forEach(b => b.onchange = () => { const id = /** @type {HTMLElement} */ (b).dataset.ctsel; if (sel.has(id)) sel.delete(id); else sel.add(id); renderContracts(); /** @type {HTMLElement|null} */ (v.querySelector(`[data-ctsel="${CSS.escape(id)}"]`))?.focus(); });
  const ca = v.querySelector('[data-ctall]'); if (ca) ca.onchange = () => { if (rows.every(r => sel.has(r.c.id))) sel.clear(); else rows.forEach(r => sel.add(r.c.id)); renderContracts(); /** @type {HTMLElement|null} */ ($('#view [data-ctall]'))?.focus(); };
  v.querySelectorAll('[data-ctbulk]').forEach(b => b.onclick = () => {
    if (/** @type {HTMLElement} */ (b).dataset.ctbulk === 'clear'){ sel.clear(); renderContracts(); return; }
    const list = COSTS.contracts.filter(c => sel.has(c.id));
    if (/** @type {HTMLElement} */ (b).dataset.ctbulk === 'edit'){ bulkChangeModal('contract', list, () => sel.clear()); return; }
    confirmModal(`Delete ${list.length} ${list.length === 1 ? 'contract' : 'contracts'}`, html`Delete ${list.map(c => c.name).slice(0, 6).join(', ')}${list.length > 6 ? ` and ${list.length - 6} more` : ''}? The devices they cover are not touched. One Undo brings them back.`, 'Delete', () => {
      const was = [...COSTS.contracts];
      COSTS.contracts = COSTS.contracts.filter(c => !sel.has(c.id)); sel.clear(); queueServerSave(); render();
      toastUndo(`${list.length} ${list.length === 1 ? 'contract' : 'contracts'} deleted`, () => {
        /* Back in their places; anything changed or added since stays as it is now. */
        const now = COSTS.contracts;
        COSTS.contracts = [...was.map(c => now.find(x => x.id === c.id) || (list.includes(c) ? c : null)).filter(Boolean), ...now.filter(x => !was.some(c => c.id === x.id))];
        queueServerSave(); render(); }, { anyEpoch: true });
    });
  });
}

/* The contacts of a contract that are still in Contacts, as a short line under its supplier. */
const contactsOfContract = c => (c.contacts || []).map(contactOf).filter(Boolean);
const contactsLine = c => { const list = contactsOfContract(c); return list.length ? html`<div class="ct-who">${list.map((k, i) => html`${i ? ', ' : ''}<button type="button" class="link" data-ctcontact="${k.id}" title="${[k.role, k.email, k.phone].filter(Boolean).join(' · ')}">${k.name}</button>`)}</div>` : ''; };

/* Making or changing a contract. The devices it covers are picked from a list that can be searched; its contacts
   (account manager, support line) from Contacts. */
export function contractModal(c, preset = []){
  const isNew = !c;
  const cur = c || { id: newId('c'), name: '', kind: 'maintenance', per: 'year', renew: 0, notice: 3, devices: [...preset] };
  const picked = new Set(cur.devices || []);
  const opt = (map, v) => Object.entries(map).map(([k, l]) => html`<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`);
  modal(html`<div class="mh">${isNew ? 'New contract' : cur.name}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="ctName">Name</label><input id="ctName" maxlength="120" value="${cur.name}" placeholder="e.g. Switch maintenance">
      <label for="ctKind">Kind</label><select id="ctKind">${opt(CONTRACT_KINDS, cur.kind)}</select>
      <label for="ctSupplier">Supplier</label>${rawHtml(comboHtml(String(html`<input id="ctSupplier" data-combo="supplier" maxlength="120" value="${cur.supplier || ''}" placeholder="Type or pick a company">`), 'ctSupplier'))}
      <label for="ctCost">Cost (${COSTS.currency || 'CHF'})</label><div class="ctlrow"><input id="ctCost" inputmode="decimal" value="${cur.cost ?? ''}" placeholder="0.00" style="flex:none;width:140px"><select id="ctPer" aria-label="Cost period" style="flex:none;width:140px">${opt(PERIODS, cur.per || 'year')}</select></div>
      <label for="ctEnd">Ends</label>${rawHtml(dateFieldHtml('id="ctEnd"', cur.end || ''))}
      <label for="ctRenew">Renews by itself</label><div class="ctlrow"><select id="ctRenew"><option value="0">No, it ends</option>${[1, 3, 6, 12, 24, 36].map(m => html`<option value="${m}" ${cur.renew === m ? 'selected' : ''}>Every ${m === 1 ? 'month' : m === 12 ? 'year' : m === 24 ? '2 years' : m === 36 ? '3 years' : m + ' months'}</option>`)}</select></div>
      <label for="ctNotice" class="ct-notice">Notice period</label><div class="ctlrow ct-notice"><input id="ctNotice" type="number" min="0" max="36" value="${cur.notice ?? 0}" style="flex:none;width:90px"><span class="unit">months before the end</span></div>
      <label for="ctDevQ">Devices</label><div><input id="ctDevQ" type="search" placeholder="Find a device to add…" aria-label="Find a device" style="width:100%"><div class="ct-devs" id="ctDevs"></div></div>
    </div><details class="nmore" id="ctMore" ${cur.ref || cur.start || (cur.contacts || []).length || cur.note ? 'open' : ''}><summary>More details <span class="muted">contract number, start, renewal, contacts, note</span></summary><div class="form" style="padding:0">
      <label for="ctRef">Contract no.</label><input id="ctRef" class="mono" maxlength="60" value="${cur.ref || ''}">
      <label for="ctStart">Starts</label>${rawHtml(dateFieldHtml('id="ctStart"', cur.start || ''))}
      <label for="ctAddContact">Contacts</label><div><div class="ct-people" id="ctPeople"></div><select id="ctAddContact" aria-label="Add a contact from Contacts"></select></div>
      <label for="ctNote">Note</label><textarea id="ctNote" rows="2" maxlength="1000">${cur.note || ''}</textarea>
    </div></details><p class="note" id="ctErr" role="status"></p></div>
    <div class="mf">${isNew ? '' : html`<button id="ctDel" class="danger-text">Delete</button>`}<div class="grow"></div><button id="ctCancel">Cancel</button><button id="ctOk" class="primary">Save</button></div>`, 'wide');
  /* A notice period only means something for a contract that renews by itself: shown then only. */
  const noticeShown = () => document.querySelectorAll('#mdl .ct-notice').forEach(el => { /** @type {HTMLElement} */ (el).hidden = !(+$('#ctRenew').value > 0); });
  noticeShown(); $('#ctRenew').addEventListener('change', noticeShown);
  /* The devices covered come first, then those that match the search (not retired), at most 60. */
  const devs = () => {
    const q = $('#ctDevQ').value.trim().toLowerCase();
    const mine = objs.filter(o => picked.has(o.id));
    const more = q ? objs.filter(o => !picked.has(o.id) && o.status !== 'retired' && [o.name, o.code, o.serial, o.model, o.user].some(v => String(v || '').toLowerCase().includes(q))).slice(0, 60) : [];
    /* The matches can all be taken at once; the count of devices covered stays in view. */
    const bar = q && more.length ? html`<div class="ct-devbar"><span class="muted">${more.length === 60 ? 'First 60' : more.length} found · ${picked.size} covered</span><button type="button" id="ctAddAll">Add ${more.length === 1 ? 'it' : `all ${more.length}`}</button></div>` : '';
    const shown = [...mine, ...more];
    $('#ctDevs').innerHTML = bar || shown.length ? html`${bar}${shown.map(o => html`<label class="pchk">${rawHtml(tico(o.type, 'tico sm'))}<input type="checkbox" data-ctdev="${o.id}" ${picked.has(o.id) ? 'checked' : ''}> <b>${o.name}</b> <span class="muted">${[o.code, o.model].filter(Boolean).join(' · ')}</span></label>`)}`
      : html`<p class="note">${q ? 'No device matches.' : 'No devices yet. Find them by name, code, serial number, model or user.'}</p>`;
    $('#ctDevs').querySelectorAll('[data-ctdev]').forEach(x => x.onchange = () => { if (x.checked) picked.add(x.dataset.ctdev); else picked.delete(x.dataset.ctdev); });
    const all = $('#ctAddAll'); if (all) all.onclick = () => { more.forEach(o => picked.add(o.id)); $('#ctDevQ').value = ''; devs(); $('#ctDevQ').focus(); };
  };
  devs();
  $('#ctDevQ').oninput = devs;
  /* Contacts: the ones linked, each with its role, mail and phone and a way to take it off; Add lists the others,
     external first. A contact's company fills an empty supplier. */
  let people = (cur.contacts || []).filter(id => contactOf(id));
  const peopleList = () => {
    $('#ctPeople').innerHTML = html`${people.map(contactOf).filter(Boolean).map(k => html`<div class="ct-person"><span><b>${k.name}</b>${k.company ? html` <span class="muted">${k.company}</span>` : ''}<small>${[k.role, k.email, k.phone].filter(Boolean).join(' · ')}</small></span><button type="button" class="icon ghost" data-ctunlink="${k.id}" aria-label="Take ${k.name} off this contract" title="Take off">×</button></div>`)}`;
    const rest = CONTACTS.list.filter(k => !people.includes(k.id)).sort((a, b) => +(a.kind === 'internal') - +(b.kind === 'internal') || a.name.localeCompare(b.name));
    $('#ctAddContact').innerHTML = html`<option value="">${CONTACTS.list.length ? (rest.length ? 'Add a contact…' : 'Every contact is on it') : 'No contacts yet (add them in Contacts)'}</option>${['external', 'internal'].map(kind => { const g = rest.filter(k => (k.kind || 'external') === kind); return g.length ? html`<optgroup label="${kind === 'external' ? 'External' : 'Internal'}">${g.map(k => html`<option value="${k.id}">${contactLabel(k)}</option>`)}</optgroup>` : ''; })}`;
    $('#ctAddContact').disabled = !rest.length || people.length >= 20;
    $('#ctPeople').querySelectorAll('[data-ctunlink]').forEach(b => b.onclick = () => { people = people.filter(id => id !== b.dataset.ctunlink); peopleList(); });
  };
  peopleList();
  $('#ctAddContact').onchange = e => {
    const k = contactOf(e.target.value); if (!k) return;
    people = [...people, k.id];
    if (k.company && !$('#ctSupplier').value.trim()) $('#ctSupplier').value = k.company;
    peopleList(); $('#ctAddContact').focus();
  };
  /* Enter in the device search takes what it found (not Save): the one match, or all of them. */
  $('#ctDevQ').addEventListener('keydown', e => { if (e.key !== 'Enter') return; e.preventDefault(); const all = $('#ctAddAll'); if (all) all.click(); });
  $('#ctCancel').onclick = closeModal;
  /* Contracts are an admin's: anyone else sees one, read only. */
  if (!isAdmin()) { $('#mdl').querySelectorAll('input, select, textarea, button').forEach(el => { if (el.id !== 'ctCancel' && !el.closest('.mh')) el.disabled = true; }); const ok = $('#ctOk'); if (ok) ok.hidden = true; const del = $('#ctDel'); if (del) del.hidden = true; $('#ctCancel').textContent = 'Close'; }
  if (!isNew) $('#ctDel').onclick = () => { closeModal(); deleteContract(cur); };
  $('#ctOk').onclick = () => {
    const err = m => { $('#ctErr').textContent = m; $('#ctErr').classList.add('err'); };
    const name = $('#ctName').value.trim();
    if (!name) return err('Give the contract a name.');
    const badDay = ['#ctStart', '#ctEnd'].find(id => dateBad($(id)));
    if (badDay === '#ctStart') $('#ctMore').open = true;
    if (badDay){ toast('Write the day as dd.mm.yyyy.', 'err'); $(badDay).focus(); return; }
    const start = dateValue($('#ctStart')), end = dateValue($('#ctEnd'));
    if (start && end && end < start){ $('#ctEnd').focus(); return err('It ends before it starts.'); }
    const renew = int($('#ctRenew').value, 60);
    /* The term's end is what the notice date counts from: the field is marked and takes the focus. */
    if (renew && !end){ $('#ctEnd').classList.add('bad'); $('#ctEnd').focus(); return err('Give the end of the current term (Ends): a contract that renews by itself needs it, or set Renews by itself to No.'); }
    const next = { id: cur.id, name, kind: $('#ctKind').value, supplier: $('#ctSupplier').value.trim() || undefined, ref: $('#ctRef').value.trim() || undefined,
      start: start || undefined, end: end || undefined, renew, notice: int($('#ctNotice').value, 36), cost: num($('#ctCost').value), per: $('#ctPer').value,
      note: $('#ctNote').value.trim() || undefined, ...(people.length ? { contacts: people } : {}), devices: objs.filter(o => picked.has(o.id)).map(o => o.id) };
    if ($('#ctCost').value.trim() && next.cost === undefined) return err('The cost is a number up to 1 000 000 000, e.g. 1200 or 99.50.');
    COSTS.contracts = isNew ? [...COSTS.contracts, next] : COSTS.contracts.map(x => x.id === cur.id ? next : x);
    queueServerSave(); closeModal(); toast(isNew ? 'Contract added' : 'Contract saved'); render();
  };
}

/* On a device page: the contracts that cover it. */
export function deviceContractsPanel(o){
  if (!COSTS.contracts.length) return '';
  const list = contractsOf(o);
  return String(html`<div class="panelbox"><div class="hdr">Contracts <span class="cnt">${list.length || 'none'}</span></div>
    <div class="relist">${list.length ? list.map(c => html`<div class="relrow"><span class="k">${CONTRACT_KINDS[c.kind]}</span><span class="t"><button class="link" data-contract="${c.id}">${c.name}</button>${c.supplier ? html` <span class="muted">${c.supplier}</span>` : ''}</span>${contractChip(c)}</div>`)
      : html`<div class="chain"><span class="muted">No contract covers this device.</span></div>`}</div>
    ${isAdmin() ? html`<div class="addrel"><select id="ctPick" aria-label="Contract" style="flex:1"><option value="">New contract…</option>${COSTS.contracts.filter(c => !list.includes(c)).map(c => html`<option value="${c.id}">${c.name}</option>`)}</select><button id="ctAddDev">Add</button></div>` : ''}</div>`);
}
/* Wires the Contracts panel of a device page: a contract opens its dialog, and Add puts the device on the contract picked
   (saved at once) or opens a new contract for it. */
export function bindDeviceContracts(o){
  $('#view').querySelectorAll('[data-contract]').forEach(b => b.onclick = () => contractModal(COSTS.contracts.find(c => c.id === b.dataset.contract)));
  $('#view').querySelectorAll('[data-ctdel]').forEach(b => b.onclick = () => { const c = COSTS.contracts.find(x => x.id === b.dataset.ctdel); if (c) deleteContract(c); });
  const add = $('#ctAddDev'); if (!add) return;
  add.onclick = () => {
    const id = $('#ctPick').value;
    if (!id){ contractModal(null, [o.id]); return; }
    COSTS.contracts = COSTS.contracts.map(c => c.id === id ? { ...c, devices: [...(c.devices || []), o.id] } : c);
    queueServerSave(); toast(o.name + ' added to the contract'); render();
  };
}

/* ---------- licences ---------- */
/* The seats a licence has against the devices that have the software. Over-use is marked. */
export function licenceChip(l){
  const u = useOfLicence(l);
  return u.over ? html`<span class="chip bad" title="${u.used} devices have it, the licence has ${l.seats} seats">${u.used - l.seats} over</span>`
    : html`<span class="chip ${u.free <= Math.max(1, Math.ceil(l.seats * 0.1)) ? 'warn' : 'ok'}">${u.free} free</span>`;
}
/* On a package row: which licence counts it, as a quiet marker; red-edged when that licence is over-used. The numbers
   are in the Licences box above and in the marker's tooltip, not repeated on every package of the licence. */
/* How many devices a licence counts: over every device's software once it is known here (the Software tab's index,
   with the page's own copy where it holds one), else as the server counted it (api/licence-use). */
/* Every device with its software as known here, once per draw (the Software tab asks for each licence and package). */
const withKnown = oncePerDraw(() => { const known = knownSoftware(); return known && objs.map(o => ({ status: o.status, software: known.get(o.id) || [], o })); });
const useOfLicence = perDrawOf(useOfLicenceNow);
function useOfLicenceNow(l){
  const list = withKnown();
  if (list){ const u = licenceUse(l, list); return { ...u, devices: u.devices.map(d => d.o) }; }
  const used = (SW.licUse && SW.licUse[l.id]) || 0;
  return { used, free: l.seats - used, over: used > l.seats, devices: [] };
}
export function licenceMark(l){
  const u = useOfLicence(l);
  return String(html`<span class="lic-mark${u.over ? ' over' : ''}" title="Counted by the licence ${l.name}: ${u.used} of ${l.seats} ${l.seats === 1 ? 'seat' : 'seats'} used${u.over ? `, ${u.used - l.seats} over` : ''}">Licence</span>`);
}
/* Until every device's software is read (the Software tab), the use the server counted (api/licence-use). */
export const licencesOver = () => COSTS.licences.filter(l => useOfLicence(l).over);
/* The licences that count a package, for its row in the Software view. */
export const licencesFor = pkg => COSTS.licences.filter(l => pkg.toLowerCase().includes(String(l.name).trim().toLowerCase()));

/* Deleting a contract or a licence: asked first, then gone at once with Undo, from its row or its dialog. The devices stay. */
function deleteContract(c){
  {
    const i = COSTS.contracts.indexOf(c);
    COSTS.contracts = COSTS.contracts.filter(x => x !== c); queueServerSave(); render();
    toastUndo(`Contract ${c.name} deleted`, () => { if (!COSTS.contracts.some(x => x.id === c.id)) COSTS.contracts.splice(Math.min(i, COSTS.contracts.length), 0, c); queueServerSave(); render(); }, { anyEpoch: true });
  }
}
function deleteLicence(l){
  {
    const i = COSTS.licences.indexOf(l);
    COSTS.licences = COSTS.licences.filter(x => x !== l); queueServerSave(); render();
    toastUndo(`Licence ${l.name} deleted`, () => { if (!COSTS.licences.some(x => x.id === l.id)) COSTS.licences.splice(Math.min(i, COSTS.licences.length), 0, l); queueServerSave(); render(); }, { anyEpoch: true });
  }
}
/* The Licences box over the Software tab, as HTML: each licence with its seats used, a bar, its cost and end. New
   licence is for admins. */
/* A licence's use: counted here when every device's software is read, else as the server counted it (api/licence-use). */
const useOf = useOfLicence;
export function licencesPanel(){
  /* Admins tick licences to change their end or cost period, or delete them, several at once (one Undo). */
  const admin = isAdmin(), lsel = st.licSel = new Set([...(st.licSel || [])].filter(id => COSTS.licences.some(l => l.id === id)));
  const rows = COSTS.licences.map(l => {
    const u = useOf(l), pct = l.seats ? Math.min(100, Math.round(u.used / l.seats * 100)) : 100;
    return html`<tr${lsel.has(l.id) ? html` class="picked"` : ''}>${admin ? html`<td class="selcol"><input type="checkbox" data-licsel="${l.id}" aria-label="${`Select ${l.name}`}" ${lsel.has(l.id) ? 'checked' : ''}></td>` : ''}<td><button class="link" data-lic="${l.id}"><b>${l.name}</b></button></td>
      <td class="num">${u.used} used / ${l.seats} ${l.seats === 1 ? 'seat' : 'seats'}</td><td><span class="lic-bar${u.over ? ' over' : ''}" aria-hidden="true"><span style="width:${pct}%"></span></span>${licenceChip(l)}</td>
      <td class="num">${l.cost > 0 ? html`${rawHtml(money(l.cost))} <span class="muted">${PERIODS[l.per || 'year']}</span>` : ''}</td><td>${l.end ? dayText(l.end) : ''}</td><td class="num"><span class="rowacts">${rawHtml(editButton(String(html`data-lic="${l.id}"`), l.name, isAdmin()))}${isAdmin() ? rawHtml(deleteButton(String(html`data-licdel="${l.id}"`), l.name)) : ''}</span></td></tr>`;
  });
  const over = licencesOver().length;
  return String(html`<div class="panelbox lic"><div class="hdr">Licences <span class="cnt">${COSTS.licences.length} ${COSTS.licences.length === 1 ? 'licence' : 'licences'}${over ? `, ${over} over-used` : ''}</span></div>
    <p class="note">A licence counts the devices, not retired, with software whose name holds the licence's name. “Office Suite” counts every package named so, whatever its version.</p>
    ${admin && lsel.size ? html`<div class="selbar lic-selbar" role="region" aria-label="Selected licences"><b>${lsel.size} selected</b><button type="button" data-licbulk="edit">Change…</button><button type="button" data-licbulk="del" class="danger-text">Delete ${lsel.size}…</button><button type="button" data-licbulk="clear">Clear</button></div>` : ''}
    ${rows.length ? html`<div style="overflow-x:auto"><table class="grid mini lic-table" style="min-width:640px;table-layout:fixed"><colgroup>${admin ? html`<col style="width:34px">` : ''}<col style="width:30%"><col style="width:16%"><col style="width:22%"><col style="width:15%"><col style="width:12%"><col style="width:44px"></colgroup><thead><tr>${admin ? html`<th class="selcol"><input type="checkbox" data-licall aria-label="Select every licence" ${COSTS.licences.length && COSTS.licences.every(l => lsel.has(l.id)) ? 'checked' : ''}></th>` : ''}<th>Software</th><th class="num">Devices</th><th>Use</th><th class="num">Cost</th><th>Ends</th><th aria-label="Edit"></th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
    ${isAdmin() ? html`<div class="addrel"><span class="grow"></span><button id="licNew" class="primary">New licence</button></div>` : ''}</div>`);
}
export function bindLicences(){
  const nb = $('#licNew'); if (nb) nb.onclick = () => licenceModal(null);
  $('#view').querySelectorAll('[data-lic]').forEach(b => b.onclick = () => licenceModal(COSTS.licences.find(l => l.id === b.dataset.lic)));
  $('#view').querySelectorAll('[data-licdel]').forEach(b => b.onclick = () => { const l = COSTS.licences.find(x => x.id === b.dataset.licdel); if (l) deleteLicence(l); });
  $('#view').querySelectorAll('[data-licnew]').forEach(b => b.onclick = e => { e.stopPropagation(); licenceModal(null, b.dataset.licnew); });
  const lsel = st.licSel || new Set(), again = (/** @type {string} */ focus) => { render(); /** @type {HTMLElement|null} */ ($(focus))?.focus(); };
  $('#view').querySelectorAll('[data-licsel]').forEach(b => b.onchange = () => { const id = /** @type {HTMLElement} */ (b).dataset.licsel; if (lsel.has(id)) lsel.delete(id); else lsel.add(id); again(`#view [data-licsel="${CSS.escape(id)}"]`); });
  const la = $('#view').querySelector('[data-licall]'); if (la) la.onchange = () => { if (COSTS.licences.every(l => lsel.has(l.id))) lsel.clear(); else COSTS.licences.forEach(l => lsel.add(l.id)); again('#view [data-licall]'); };
  $('#view').querySelectorAll('[data-licbulk]').forEach(b => b.onclick = () => {
    const what = /** @type {HTMLElement} */ (b).dataset.licbulk, list = COSTS.licences.filter(l => lsel.has(l.id));
    if (what === 'clear'){ lsel.clear(); render(); return; }
    if (what === 'edit'){ bulkChangeModal('licence', list, () => lsel.clear()); return; }
    confirmModal(`Delete ${list.length} ${list.length === 1 ? 'licence' : 'licences'}`, html`Delete ${list.map(l => l.name).slice(0, 6).join(', ')}${list.length > 6 ? ` and ${list.length - 6} more` : ''}? The software on the devices is not touched. One Undo brings them back.`, 'Delete', () => {
      const was = [...COSTS.licences], ids = new Set(list.map(l => l.id));
      COSTS.licences = COSTS.licences.filter(l => !ids.has(l.id)); lsel.clear(); queueServerSave(); render();
      toastUndo(`${list.length} ${list.length === 1 ? 'licence' : 'licences'} deleted`, () => {
        const cur = COSTS.licences;
        COSTS.licences = [...was.map(l => cur.find(x => x.id === l.id) || (ids.has(l.id) ? l : null)).filter(Boolean), ...cur.filter(x => !was.some(l => l.id === x.id))];
        queueServerSave(); render(); }, { anyEpoch: true });
    });
  });
}
/* Several contracts or licences changed at once: what is filled in is set on each, what is left empty stays as it is.
   Contracts: supplier and end; licences: end and cost period. One Undo puts back what each had. */
function bulkChangeModal(kind, list, done){
  const isCt = kind === 'contract', n = list.length, word = isCt ? (n === 1 ? 'contract' : 'contracts') : (n === 1 ? 'licence' : 'licences');
  const periods = Object.entries(PERIODS).map(([k, t]) => html`<option value="${k}">${t}</option>`);
  modal(html`<div class="mh">Change ${n} ${word}</div>
    <div class="mb"><p class="note">Fill in only what should change; an empty field leaves each as it is.</p><div class="form" style="padding:0">
      ${isCt ? html`<label for="bkSup">Supplier</label><input id="bkSup" maxlength="120" autocomplete="off" placeholder="Keep as it is">` : ''}
      <label for="bkEnd">Ends</label>${rawHtml(dateFieldHtml('id="bkEnd"', ''))}
      ${isCt ? '' : html`<label for="bkPer">Cost per</label><select id="bkPer"><option value="">Keep as it is</option>${periods}</select>`}
    </div><p class="note err" id="bkErr" hidden></p></div>
    <div class="mf"><button id="bkNo">Cancel</button><button id="bkOk" class="primary">Change ${n}</button></div>`, 'sm');
  $('#bkNo').onclick = closeModal;
  const err = t => { const e = $('#bkErr'); e.textContent = t; e.hidden = false; };
  $('#bkOk').onclick = () => {
    if (dateBad($('#bkEnd'))){ $('#bkEnd').focus(); return err('Write the day as dd.mm.yyyy.'); }
    const sup = isCt ? /** @type {HTMLInputElement} */ ($('#bkSup')).value.trim() : '', end = dateValue($('#bkEnd')), per = isCt ? '' : /** @type {HTMLSelectElement} */ ($('#bkPer')).value;
    if (!sup && !end && !per) return err('Nothing filled in to change.');
    const early = isCt && end ? list.find(c => c.start && end < c.start) : null;
    if (early) return err(`${early.name} starts on ${dayText(early.start)}, after that end.`);
    const was = list.map(x => [x.id, x.supplier, x.end, x.per]);
    for (const x of list){ if (sup) x.supplier = sup; if (end) x.end = end; if (per) x.per = per; }
    closeModal(); done(); queueServerSave(); render();
    const store = () => isCt ? COSTS.contracts : COSTS.licences;
    toastUndo(`${n} ${word} changed`, () => {
      for (const [id, supplier, e, p] of was){ const x = store().find(y => y.id === id); if (!x) continue;
        for (const [k, v] of [['supplier', supplier], ['end', e], ['per', p]]) if (v === undefined) Reflect.deleteProperty(x, k); else x[k] = v; }
      queueServerSave(); render(); }, { anyEpoch: true });
  };
}
/* The New licence or edit licence dialog. name fills in a new licence's software. Save checks the name, cost and end
   date, then saves. */
export function licenceModal(l, name = ''){
  const isNew = !l;
  const cur = l || { id: newId('l'), name, seats: 0, per: 'year' };
  const opt = Object.entries(PERIODS).map(([k, t]) => html`<option value="${k}" ${k === (cur.per || 'year') ? 'selected' : ''}>${t}</option>`);
  modal(html`<div class="mh">${isNew ? 'New licence' : cur.name}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="licName">Software</label><input id="licName" maxlength="120" value="${cur.name}" placeholder="The name, or the part of it every version has">
      <label for="licSeats">Seats</label><input id="licSeats" type="number" min="0" value="${cur.seats}" style="width:140px">
      <label for="licCost">Cost (${COSTS.currency || 'CHF'})</label><div class="ctlrow"><input id="licCost" inputmode="decimal" value="${cur.cost ?? ''}" placeholder="0.00" style="flex:none;width:140px"><select id="licPer" aria-label="Cost period" style="flex:none;width:140px">${opt}</select></div>
      <label for="licEnd">Ends</label>${rawHtml(dateFieldHtml('id="licEnd"', cur.end || ''))}
      <label for="licNote">Note</label><textarea id="licNote" rows="2" maxlength="1000">${cur.note || ''}</textarea>
    </div><p class="note" id="licErr" role="status"></p></div>
    <div class="mf">${isNew ? '' : html`<button id="licDel" class="danger-text">Delete</button>`}<div class="grow"></div><button id="licCancel">Cancel</button><button id="licOk" class="primary">Save</button></div>`, 'sm');
  /* Counted over every device's software: the server's index, the page's copy where it holds one. */
  const hint = () => { const n = $('#licName').value.trim(), known = knownSoftware(); $('#licErr').classList.remove('err');
    if (!n) { $('#licErr').textContent = ''; return; }
    if (!known) { $('#licErr').textContent = 'Counting the devices…'; return; }
    const k = useOfLicence({ name: n, seats: 0 }).used;
    $('#licErr').textContent = `${k} ${k === 1 ? 'device has' : 'devices have'} software named so.`; };
  hint(); $('#licName').oninput = hint;
  Promise.resolve(ensurePackages()).then(() => { if ($('#licName')) hint(); });
  $('#licCancel').onclick = closeModal;
  if (!isNew) $('#licDel').onclick = () => { closeModal(); deleteLicence(cur); };
  $('#licOk').onclick = () => {
    const nm = $('#licName').value.trim();
    if (!nm){ $('#licErr').textContent = 'Give the name of the software.'; $('#licErr').classList.add('err'); return; }
    const cost = num($('#licCost').value);
    if ($('#licCost').value.trim() && cost === undefined){ $('#licErr').textContent = 'The cost is a number up to 1 000 000 000, e.g. 1200 or 99.50.'; $('#licErr').classList.add('err'); return; }
    if (dateBad($('#licEnd'))){ toast('Write the day as dd.mm.yyyy.', 'err'); $('#licEnd').focus(); return; }
    const next = { id: cur.id, name: nm, seats: int($('#licSeats').value, 1000000), cost, per: $('#licPer').value, end: dateValue($('#licEnd')) || undefined, note: $('#licNote').value.trim() || undefined };
    COSTS.licences = isNew ? [...COSTS.licences, next] : COSTS.licences.map(x => x.id === cur.id ? next : x);
    queueServerSave(); closeModal(); toast(isNew ? 'Licence added' : 'Licence saved'); render();
  };
}
