/* Costs: contracts (maintenance, support, leases, subscriptions) with their notice dates and the devices they cover,
   and software licences with their seats against the installs the inventory knows. */
import { $, COSTS, byId, dayText, esc, objs, st, tico, toast } from './01-core.js';
import { contactCompanies } from './11-contacts.js';
import { CONTRACT_KINDS, PERIODS, NOTICE_SOON_DAYS, contractStatus, costInYear, licenceUse, runningNow, yearlyCost } from './costs.js';
import { closeModal, modal } from './03-object-modals.js';
import { queueServerSave, render } from './07-render-plans.js';

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
  return t === '' || !isFinite(+t) ? undefined : Math.max(0, Math.round(+t * 100) / 100);
};
const int = (v, max) => { const n = parseInt(v, 10); return isFinite(n) ? Math.min(max, Math.max(0, n)) : 0; };

/* ---------- contracts ---------- */
/* Where a contract stands, as a chip: what is due and when. */
export function contractChip(c){
  const s = contractStatus(c);
  if (s.state === 'open') return '<span class="chip kept">No end date</span>';
  if (s.state === 'ended') return `<span class="chip bad">Ended ${esc(dayText(s.end))}</span>`;
  if (c.renew > 0){
    if (s.state === 'soon') return `<span class="chip warn" title="Renews by itself on ${esc(dayText(s.end))} unless notice is given">Give notice by ${esc(dayText(s.noticeBy))}</span>`;
    if (s.state === 'late') return `<span class="chip kept" title="The notice date, ${esc(dayText(s.noticeBy))}, has passed">Renews ${esc(dayText(s.end))}</span>`;
    return `<span class="chip kept" title="${c.notice > 0 ? 'Notice by ' + esc(dayText(s.noticeBy)) : 'No notice period'}">Renews ${esc(dayText(s.end))}</span>`;
  }
  return s.state === 'soon' ? `<span class="chip warn">Ends ${esc(dayText(s.end))}</span>` : `<span class="chip kept">Runs to ${esc(dayText(s.end))}</span>`;
}
/* Contracts in the order they need someone: notice due soon, notice missed, running, open-ended, ended; then by date. */
const ORDER = { soon: 0, late: 1, ok: 2, open: 3, ended: 4 };
const sorted = list => [...list].map(c => ({ c, s: contractStatus(c) }))
  .sort((a, b) => ORDER[a.s.state] - ORDER[b.s.state] || (a.s.noticeBy || a.s.end || '9').localeCompare(b.s.noticeBy || b.s.end || '9') || a.c.name.localeCompare(b.c.name));
export const contractsDue = () => COSTS.contracts.filter(c => contractStatus(c).state === 'soon');
export const contractsOf = o => COSTS.contracts.filter(c => (c.devices || []).includes(o.id));

/* What all contracts cost this year and the next two, with this year by kind. */
function costSummary(all){
  const y0 = new Date().getFullYear(), years = [y0, y0 + 1, y0 + 2];
  const per = years.map(y => all.reduce((t, c) => t + costInYear(c, y), 0));
  if (!per.some(v => v > 0)) return '';
  const kinds = Object.entries(CONTRACT_KINDS).map(([k, l]) => [l, all.filter(c => c.kind === k).reduce((t, c) => t + costInYear(c, y0), 0)]).filter(([, v]) => v > 0);
  return `<div class="ct-sum" aria-label="Contract costs per year">
    ${years.map((y, i) => `<div class="ov-tile"><span class="muted">${y}${i === 0 ? ' (this year)' : ''}</span><b>${money(Math.round(per[i] * 100) / 100) || money(0)}</b></div>`).join('')}
    ${kinds.length ? `<div class="ct-kinds"><span class="muted">${y0} by kind</span>${kinds.map(([l, v]) => `<span>${esc(l)} <b>${money(Math.round(v * 100) / 100)}</b></span>`).join('')}</div>` : ''}
  </div>
  <p class="note ct-sum-note">Each year counts the months a contract runs in it. Contracts that renew by themselves are counted as running on; one-off costs count in the year they start.</p>`;
}
export function renderContracts(){
  const q = (st.ctQ || '').trim().toLowerCase();
  const all = COSTS.contracts;
  const hit = c => !q || [c.name, c.supplier, c.ref, CONTRACT_KINDS[c.kind], c.note].some(v => String(v || '').toLowerCase().includes(q))
    || (c.devices || []).some(id => (byId(id) || {}).name?.toLowerCase().includes(q));
  const rows = sorted(all.filter(hit));
  const live = all.filter(c => runningNow(c));
  const year = live.reduce((t, c) => t + yearlyCost(c), 0);
  const due = contractsDue().length;
  $('#toolbar').innerHTML = `<input id="ctQ" type="search" placeholder="Find a contract, supplier or device…" aria-label="Find a contract" value="${esc(st.ctQ || '')}" style="width:260px">
    <span class="muted">${q ? `${rows.length} of ${all.length}` : `${all.length} ${all.length === 1 ? 'contract' : 'contracts'}`}${due ? ` · <b class="wty soon">${due} due within ${NOTICE_SOON_DAYS} days</b>` : ''}</span><div class="grow"></div>
    ${year ? `<span class="muted hide-n">Running contracts: <b>${money(year)}</b> per year</span>` : ''}<label class="muted hide-n" for="ctCur">Currency</label><input id="ctCur" maxlength="5" aria-label="Currency" value="${esc(COSTS.currency || 'CHF')}" style="width:64px" title="The currency of every price and cost"><button id="ctNew" class="primary">New contract</button>`;
  $('#ctNew').onclick = () => contractModal(null);
  $('#ctCur').onchange = e => { const v = e.target.value.trim().toUpperCase(); if (!/^[A-Z€$£¥]{1,5}$/.test(v)){ toast('The currency is a short code such as CHF or EUR.'); e.target.value = COSTS.currency; return; } COSTS.currency = v; queueServerSave(); render(); };
  const box = $('#ctQ'); box.oninput = () => { st.ctQ = box.value; renderContracts(); const b = $('#ctQ'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); };
  if (!all.length){
    $('#view').innerHTML = `<div class="empty">No contracts yet. Add maintenance, support, leases and subscriptions to see what they cost and when notice is due.</div>`;
    return;
  }
  $('#view').innerHTML = `${costSummary(all)}<div class="gridwrap ct-wrap" style="height:auto"><table class="grid contracts" data-tb="own"><thead><tr>
      <th>Contract</th><th>Kind</th><th>Supplier</th><th class="num">Devices</th><th class="num">Cost</th><th>Status</th><th aria-label="Edit"></th></tr></thead><tbody>
    ${rows.map(({ c }) => `<tr><td title="${esc(c.name)}"><button class="link" data-contract="${esc(c.id)}"><b>${esc(c.name)}</b></button>${c.ref ? ` <span class="mono muted">${esc(c.ref)}</span>` : ''}</td>
      <td>${esc(CONTRACT_KINDS[c.kind])}</td><td>${esc(c.supplier || '')}</td><td class="num">${(c.devices || []).filter(byId).length || ''}</td>
      <td class="num">${c.cost > 0 ? `${money(c.cost)} <span class="muted">${esc(PERIODS[c.per || 'year'])}</span>` : ''}</td><td>${contractChip(c)}</td>
      <td class="num"><button data-contract="${esc(c.id)}" aria-label="Edit ${esc(c.name)}">Edit</button></td></tr>`).join('')
      || `<tr><td colspan="7" class="muted" style="padding:14px">Nothing matches “${esc(st.ctQ)}”.</td></tr>`}
    </tbody>${year ? `<tfoot><tr><td colspan="4">Running contracts per year</td><td class="num"><b>${money(year)}</b></td><td colspan="2"></td></tr></tfoot>` : ''}</table></div>`;
  $('#view').querySelectorAll('[data-contract]').forEach(b => b.onclick = () => contractModal(COSTS.contracts.find(c => c.id === b.dataset.contract)));
}

/* Making or changing a contract. The devices it covers are picked from a list that can be searched. */
export function contractModal(c, preset = []){
  const isNew = !c;
  const cur = c || { id: newId('c'), name: '', kind: 'maintenance', per: 'year', renew: 12, notice: 3, devices: [...preset] };
  const picked = new Set(cur.devices || []);
  const opt = (map, v) => Object.entries(map).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  modal(`<div class="mh">${isNew ? 'New contract' : esc(cur.name)}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="ctName">Name</label><input id="ctName" maxlength="120" value="${esc(cur.name)}" placeholder="e.g. Switch maintenance HPE">
      <label for="ctKind">Kind</label><select id="ctKind">${opt(CONTRACT_KINDS, cur.kind)}</select>
      <label for="ctSupplier">Supplier</label><input id="ctSupplier" maxlength="120" value="${esc(cur.supplier || '')}" list="ctSuppliers"><datalist id="ctSuppliers">${contactCompanies().map(k => `<option value="${esc(k)}">`).join('')}</datalist>
      <label for="ctRef">Contract no.</label><input id="ctRef" class="mono" maxlength="60" value="${esc(cur.ref || '')}">
      <label for="ctStart">Starts</label><input id="ctStart" type="date" value="${esc(cur.start || '')}">
      <label for="ctEnd">Ends</label><input id="ctEnd" type="date" value="${esc(cur.end || '')}">
      <label for="ctRenew">Renews by itself</label><div class="ctlrow"><select id="ctRenew"><option value="0">No, it ends</option>${[1, 3, 6, 12, 24, 36].map(m => `<option value="${m}" ${cur.renew === m ? 'selected' : ''}>Every ${m === 1 ? 'month' : m === 12 ? 'year' : m === 24 ? '2 years' : m === 36 ? '3 years' : m + ' months'}</option>`).join('')}</select></div>
      <label for="ctNotice">Notice period</label><div class="ctlrow"><input id="ctNotice" type="number" min="0" max="36" value="${cur.notice ?? 0}" style="flex:none;width:90px"><span class="unit">months before the end</span></div>
      <label for="ctCost">Cost (${esc(COSTS.currency || 'CHF')})</label><div class="ctlrow"><input id="ctCost" inputmode="decimal" value="${cur.cost ?? ''}" placeholder="0.00" style="flex:none;width:140px"><select id="ctPer" aria-label="Cost period" style="flex:none;width:140px">${opt(PERIODS, cur.per || 'year')}</select></div>
      <label for="ctNote">Note</label><textarea id="ctNote" rows="2" maxlength="1000">${esc(cur.note || '')}</textarea>
      <label for="ctDevQ">Devices</label><div><input id="ctDevQ" type="search" placeholder="Find a device to add…" aria-label="Find a device" style="width:100%"><div class="ct-devs" id="ctDevs"></div></div>
    </div><p class="note" id="ctErr" role="status"></p></div>
    <div class="mf">${isNew ? '' : '<button id="ctDel" class="danger-text">Delete</button>'}<div class="grow"></div><button id="ctCancel">Cancel</button><button id="ctOk" class="primary">Save</button></div>`, 'wide');
  /* The devices covered come first, then those that match the search, at most 60. */
  const devs = () => {
    const q = $('#ctDevQ').value.trim().toLowerCase();
    const mine = objs.filter(o => picked.has(o.id));
    const more = q ? objs.filter(o => !picked.has(o.id) && [o.name, o.code, o.serial, o.model, o.user].some(v => String(v || '').toLowerCase().includes(q))).slice(0, 60) : [];
    $('#ctDevs').innerHTML = [...mine, ...more].map(o => `<label class="pchk">${tico(o.type, 'tico sm')}<input type="checkbox" data-ctdev="${esc(o.id)}" ${picked.has(o.id) ? 'checked' : ''}> <b>${esc(o.name)}</b> <span class="muted">${esc([o.code, o.model].filter(Boolean).join(' · '))}</span></label>`).join('')
      || `<p class="note">${q ? 'No device matches.' : 'No devices yet. Find them by name, code, serial number, model or user.'}</p>`;
    $('#ctDevs').querySelectorAll('[data-ctdev]').forEach(x => x.onchange = () => { if (x.checked) picked.add(x.dataset.ctdev); else picked.delete(x.dataset.ctdev); });
  };
  devs();
  $('#ctDevQ').oninput = devs;
  $('#ctCancel').onclick = closeModal;
  if (!isNew) $('#ctDel').onclick = () => {
    if (!confirm(`Delete the contract ${cur.name}? The devices stay.`)) return;
    COSTS.contracts = COSTS.contracts.filter(x => x.id !== cur.id); queueServerSave(); closeModal(); toast('Contract deleted'); render();
  };
  $('#ctOk').onclick = () => {
    const err = m => { $('#ctErr').textContent = m; $('#ctErr').classList.add('err'); };
    const name = $('#ctName').value.trim();
    if (!name) return err('Give the contract a name.');
    const start = $('#ctStart').value, end = $('#ctEnd').value;
    if (start && end && end < start) return err('It ends before it starts.');
    const renew = int($('#ctRenew').value, 60);
    if (renew && !end) return err('A contract that renews by itself needs the end of its current term.');
    const next = { id: cur.id, name, kind: $('#ctKind').value, supplier: $('#ctSupplier').value.trim() || undefined, ref: $('#ctRef').value.trim() || undefined,
      start: start || undefined, end: end || undefined, renew, notice: int($('#ctNotice').value, 36), cost: num($('#ctCost').value), per: $('#ctPer').value,
      note: $('#ctNote').value.trim() || undefined, devices: objs.filter(o => picked.has(o.id)).map(o => o.id) };
    if ($('#ctCost').value.trim() && next.cost === undefined) return err('The cost is a number, e.g. 1200 or 99.50.');
    COSTS.contracts = isNew ? [...COSTS.contracts, next] : COSTS.contracts.map(x => x.id === cur.id ? next : x);
    queueServerSave(); closeModal(); toast(isNew ? 'Contract added' : 'Contract saved'); render();
  };
}

/* On a device page: the contracts that cover it. */
export function deviceContractsPanel(o){
  if (!COSTS.contracts.length) return '';
  const list = contractsOf(o);
  return `<div class="panelbox"><div class="hdr">Contracts <span class="cnt">${list.length || 'none'}</span></div>
    <div class="relist">${list.map(c => `<div class="relrow"><span class="k">${esc(CONTRACT_KINDS[c.kind])}</span><span class="t"><button class="link" data-contract="${esc(c.id)}">${esc(c.name)}</button>${c.supplier ? ` <span class="muted">${esc(c.supplier)}</span>` : ''}</span>${contractChip(c)}</div>`).join('')
      || '<div class="chain"><span class="muted">No contract covers this device.</span></div>'}</div>
    <div class="addrel"><select id="ctPick" aria-label="Contract" style="flex:1"><option value="">New contract…</option>${COSTS.contracts.filter(c => !list.includes(c)).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select><button id="ctAddDev">Add</button></div></div>`;
}
export function bindDeviceContracts(o){
  $('#view').querySelectorAll('[data-contract]').forEach(b => b.onclick = () => contractModal(COSTS.contracts.find(c => c.id === b.dataset.contract)));
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
  const u = licenceUse(l, objs);
  return u.over ? `<span class="chip bad" title="${u.used} devices have it, the licence has ${l.seats} seats">${u.used - l.seats} over</span>`
    : `<span class="chip ${u.free <= Math.max(1, Math.ceil(l.seats * 0.1)) ? 'warn' : 'ok'}">${u.free} free</span>`;
}
/* On a package row: which licence counts it, as a quiet marker; red-edged when that licence is over-used. The numbers
   are in the Licences box above and in the marker's tooltip, not repeated on every package of the licence. */
export function licenceMark(l){
  const u = licenceUse(l, objs);
  return `<span class="lic-mark${u.over ? ' over' : ''}" title="Counted by the licence ${esc(l.name)}: ${u.used} of ${l.seats} ${l.seats === 1 ? 'seat' : 'seats'} used${u.over ? `, ${u.used - l.seats} over` : ''}">Licence</span>`;
}
export const licencesOver = () => COSTS.licences.filter(l => licenceUse(l, objs).over);
/* The licences that count a package, for its row in the Software view. */
export const licencesFor = pkg => COSTS.licences.filter(l => pkg.toLowerCase().includes(String(l.name).trim().toLowerCase()));

export function licencesPanel(){
  const rows = COSTS.licences.map(l => {
    const u = licenceUse(l, objs), pct = l.seats ? Math.min(100, Math.round(u.used / l.seats * 100)) : 100;
    return `<tr><td><button class="link" data-lic="${esc(l.id)}"><b>${esc(l.name)}</b></button></td>
      <td class="num">${u.used} used / ${l.seats} ${l.seats === 1 ? 'seat' : 'seats'}</td><td><span class="lic-bar${u.over ? ' over' : ''}" aria-hidden="true"><span style="width:${pct}%"></span></span>${licenceChip(l)}</td>
      <td class="num">${l.cost > 0 ? `${money(l.cost)} <span class="muted">${esc(PERIODS[l.per || 'year'])}</span>` : ''}</td><td>${l.end ? esc(dayText(l.end)) : ''}</td></tr>`;
  }).join('');
  const over = licencesOver().length;
  return `<div class="panelbox lic"><div class="hdr">Licences <span class="cnt">${COSTS.licences.length}${over ? ` · ${over} over-used` : ''}</span></div>
    <p class="note">A licence counts the devices, not retired, with software whose name holds the licence's name. “Microsoft 365 Apps” counts every package named so, whatever its version.</p>
    ${rows ? `<div style="overflow-x:auto"><table class="grid mini lic-table" style="min-width:640px;table-layout:fixed"><colgroup><col style="width:30%"><col style="width:16%"><col style="width:24%"><col style="width:16%"><col style="width:14%"></colgroup><thead><tr><th>Software</th><th class="num">Devices</th><th>Use</th><th class="num">Cost</th><th>Ends</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
    <div class="addrel"><button id="licNew">Add a licence</button></div></div>`;
}
export function bindLicences(){
  const nb = $('#licNew'); if (nb) nb.onclick = () => licenceModal(null);
  $('#view').querySelectorAll('[data-lic]').forEach(b => b.onclick = () => licenceModal(COSTS.licences.find(l => l.id === b.dataset.lic)));
  $('#view').querySelectorAll('[data-licnew]').forEach(b => b.onclick = e => { e.stopPropagation(); licenceModal(null, b.dataset.licnew); });
}
export function licenceModal(l, name = ''){
  const isNew = !l;
  const cur = l || { id: newId('l'), name, seats: 0, per: 'year' };
  const opt = Object.entries(PERIODS).map(([k, t]) => `<option value="${k}" ${k === (cur.per || 'year') ? 'selected' : ''}>${esc(t)}</option>`).join('');
  modal(`<div class="mh">${isNew ? 'New licence' : esc(cur.name)}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="licName">Software</label><input id="licName" maxlength="120" value="${esc(cur.name)}" placeholder="The name, or the part of it every version has">
      <label for="licSeats">Seats</label><input id="licSeats" type="number" min="0" value="${cur.seats}" style="width:140px">
      <label for="licCost">Cost (${esc(COSTS.currency || 'CHF')})</label><div class="ctlrow"><input id="licCost" inputmode="decimal" value="${cur.cost ?? ''}" placeholder="0.00" style="flex:none;width:140px"><select id="licPer" aria-label="Cost period" style="flex:none;width:140px">${opt}</select></div>
      <label for="licEnd">Ends</label><input id="licEnd" type="date" value="${esc(cur.end || '')}">
      <label for="licNote">Note</label><textarea id="licNote" rows="2" maxlength="1000">${esc(cur.note || '')}</textarea>
    </div><p class="note" id="licErr" role="status"></p></div>
    <div class="mf">${isNew ? '' : '<button id="licDel" class="danger-text">Delete</button>'}<div class="grow"></div><button id="licCancel">Cancel</button><button id="licOk" class="primary">Save</button></div>`, 'sm');
  const hint = () => { const n = $('#licName').value.trim(); $('#licErr').classList.remove('err'); $('#licErr').textContent = n ? `${licenceUse({ name: n, seats: 0 }, objs).used} devices have software named so.` : ''; };
  hint(); $('#licName').oninput = hint;
  $('#licCancel').onclick = closeModal;
  if (!isNew) $('#licDel').onclick = () => { COSTS.licences = COSTS.licences.filter(x => x.id !== cur.id); queueServerSave(); closeModal(); toast('Licence deleted'); render(); };
  $('#licOk').onclick = () => {
    const nm = $('#licName').value.trim();
    if (!nm){ $('#licErr').textContent = 'Give the name of the software.'; $('#licErr').classList.add('err'); return; }
    const cost = num($('#licCost').value);
    if ($('#licCost').value.trim() && cost === undefined){ $('#licErr').textContent = 'The cost is a number, e.g. 1200 or 99.50.'; $('#licErr').classList.add('err'); return; }
    const next = { id: cur.id, name: nm, seats: int($('#licSeats').value, 1000000), cost, per: $('#licPer').value, end: $('#licEnd').value || undefined, note: $('#licNote').value.trim() || undefined };
    COSTS.licences = isNew ? [...COSTS.licences, next] : COSTS.licences.map(x => x.id === cur.id ? next : x);
    queueServerSave(); closeModal(); toast(isNew ? 'Licence added' : 'Licence saved'); render();
  };
}
