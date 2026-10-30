/* The Stocktake view: walk a site or a room and confirm the devices that are there, by ticking them or by scanning (or
   typing) a serial number, code or name. A device found in another place can be moved here; something not in the
   inventory is noted. Finish says what is missing and keeps the result, with a PDF and an Excel list. A confirmed
   device shows on its page when and by whom it was last seen on site; one can also be confirmed there on its own. */
import { $, LOCS, SITES, TYPES, esc, hist, now, objs, st, toast, toastUndo } from './01-core.js';
import { USERS, canEdit, who } from './04-settings.js';
import { closeModal, modal } from './19-modal.js';
import { queueServerSave, render } from './07-render.js';
import { STOCKTAKE_DAYS, confirmedIn, daysSinceVerified, inScope, stocktakeDevices, stocktakeResult } from './stocktake.js';
import { dateText } from './dates.js';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const activeStocktake = () => (st.stocktakes || []).find(t => !t.finished) || null;
let FILTER = 'open', LAST = '';
const placeName = scope => scope || 'Everywhere';
const userName = o => { const u = o.uid && USERS.find(x => x.id === o.uid); return (u && u.name) || o.user || ''; };

/* Confirms a device on site (in stocktake t, if any), keeping the confirmation before it for Undo; from: where it was
   recorded before it was moved here. */
function confirm(o, t, from){
  const prev = o.verified ? { at: o.verified.at, ...(o.verified.by ? { by: o.verified.by } : {}), ...(o.verified.st ? { st: o.verified.st } : {}) } : undefined;
  o.verified = { at: today(), by: who(), ...(t ? { st: t.id } : {}), ...(from !== undefined ? { from } : {}), ...(prev ? { prev } : {}) };
  hist(o, now(), `Confirmed on site by ${who()}${t ? ` (${t.name})` : ''}`);
}
function unconfirm(o){
  if (!o.verified) return;
  if (o.verified.from !== undefined) { o.loc = o.verified.from; hist(o, now(), `Moved back to ${o.verified.from || 'no location'}: the confirmation on site was taken back`); }
  o.verified = o.verified.prev ? { ...o.verified.prev } : undefined;
  if (!o.verified) delete o.verified;
}

export function renderStocktake(){
  const t = activeStocktake(), edit = canEdit();
  /* Drawn again (a save, a change from someone else): the scan field keeps the focus, so scanning goes on. */
  const scanning = document.activeElement && document.activeElement.id === 'stkScan';
  $('#toolbar').innerHTML = `<b>Stocktake</b><span class="muted">${t ? esc(`${t.name} · ${placeName(t.scope)}`) : 'Confirm on site that the devices are where the inventory says'}</span><div class="grow"></div>`;
  $('#view').innerHTML = `<div class="stk">${t ? activeHtml(t, edit) : startHtml(edit)}${historyHtml()}</div>`;
  if (t) wireActive(t, edit); else wireStart(edit);
  if (scanning && $('#stkScan')) $('#stkScan').focus();
  document.querySelectorAll('[data-stkdel]').forEach(b => b.onclick = () => {
    const was = st.stocktakes;
    st.stocktakes = st.stocktakes.filter(x => x.id !== b.dataset.stkdel); queueServerSave(); renderStocktake();
    toastUndo('Stocktake removed from the list', () => { st.stocktakes = was; queueServerSave(); renderStocktake(); });
  });
}

/* No stocktake running: how current the confirmations are, and a new one by place. */
function startHtml(edit){
  const live = objs.filter(o => o.status !== 'retired');
  const recent = live.filter(o => { const d = daysSinceVerified(o); return d !== null && d <= STOCKTAKE_DAYS; }).length;
  const places = [...SITES.map(s => [s, `${s} (site)`]), ...LOCS.map(l => [l, l])];
  return `<div class="panelbox"><div class="hdr">New stocktake</div>
    <p class="note stk-pad">${live.length ? `${recent} of ${live.length} devices were confirmed on site in the last 12 months.` : 'No devices yet.'} A stocktake lists the devices of one place; confirm each one you find, by ticking it or by scanning its serial number, code or name. What is not found is listed as missing when you finish.</p>
    ${edit ? `<div class="form stk-pad"><label for="stkPlace">Place</label><select id="stkPlace"><option value="">Everywhere</option>${places.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>
      <label for="stkName">Name</label><input id="stkName" maxlength="120" placeholder="Stocktake ${esc(dateText(today()))}"></div>
      <div class="addrel stk-pad"><button id="stkStart" class="primary">Start the stocktake</button><span class="muted" id="stkCount"></span></div>` : '<p class="note stk-pad">An admin starts a stocktake.</p>'}</div>`;
}
function wireStart(edit){
  if (!edit) return;
  const count = () => { $('#stkCount').textContent = `${stocktakeDevices(objs, $('#stkPlace').value).length} devices`; };
  $('#stkPlace').onchange = count; count();
  $('#stkStart').onclick = () => {
    const scope = $('#stkPlace').value, name = $('#stkName').value.trim() || `Stocktake ${placeName(scope)} ${dateText(today())}`;
    st.stocktakes = [{ id: 'st' + Date.now().toString(36), name: name.slice(0, 120), scope, started: new Date().toISOString(), by: who() }, ...(st.stocktakes || [])].slice(0, 50);
    queueServerSave(); FILTER = 'open'; renderStocktake();
    /* Ready to scan at once. */
    const sc = $('#stkScan'); if (sc) sc.focus();
  };
}

/* A stocktake running: progress, the scan field and the devices by room, open ones first. */
function activeHtml(t, edit){
  const list = stocktakeDevices(objs, t.scope);
  const done = list.filter(o => confirmedIn(o, t.id)).length, moved = objs.filter(o => confirmedIn(o, t.id) && o.verified.from !== undefined).length;
  const pct = list.length ? Math.round(done / list.length * 100) : 100;
  const shown = list.filter(o => FILTER === 'all' || (FILTER === 'open') !== confirmedIn(o, t.id));
  const rooms = [...new Set(shown.map(o => o.loc || ''))].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
  const row = o => { const ok = confirmedIn(o, t.id), d = daysSinceVerified(o);
    return `<label class="stk-row${ok ? ' ok' : ''}"><input type="checkbox" data-stk="${esc(o.id)}" ${ok ? 'checked' : ''} ${edit ? '' : 'disabled'}>
      <span class="stk-name"><b>${esc(o.name)}</b> <span class="code">${esc(o.code || '')}</span><small>${esc([TYPES[o.type] ? TYPES[o.type].label : o.type, o.serial, userName(o)].filter(Boolean).join(' · '))}</small></span>
      <span class="stk-when muted">${ok ? `Confirmed${o.verified.from !== undefined ? ', moved here' : ''}` : d === null ? 'Never confirmed' : `Last ${dateText(o.verified.at)}`}</span></label>`; };
  return `<div class="panelbox"><div class="hdr">${esc(t.name)} <span class="cnt">${esc(placeName(t.scope))} · started ${esc(dateText(t.started.slice(0, 10)))} by ${esc(t.by || '')}</span></div>
    <div class="stk-prog stk-pad"><div class="ov-qbar" role="img" aria-label="${done} of ${list.length} confirmed"><span style="width:${pct}%"></span></div><b>${done} of ${list.length}</b>${moved ? `<span class="muted">${moved} moved here</span>` : ''}${(t.unknown || []).length ? `<span class="muted">${t.unknown.length} not in the inventory</span>` : ''}</div>
    ${edit ? `<div class="stk-scanrow stk-pad"><input id="stkScan" type="search" autocomplete="off" enterkeyhint="done" placeholder="Scan or type serial number, code or name" aria-label="Scan or type a serial number, code or name">
      <button id="stkFinish" class="primary">Finish…</button></div><p class="stk-last stk-pad" id="stkLast" role="status" aria-live="polite">${LAST}</p>` : ''}
    <div class="stk-tabs stk-pad">${[['open', 'Still open', list.length - done], ['done', 'Confirmed', done], ['all', 'All', list.length]].map(([k, l, n]) => `<button class="tab ${FILTER === k ? 'active' : ''}" data-stkf="${k}">${l} <span class="tab-cnt">${n}</span></button>`).join('')}</div>
    <div class="stk-list">${rooms.length ? rooms.map(r => `<div class="side-sub stk-room">${esc(r || 'No location')}</div>${shown.filter(o => (o.loc || '') === r).sort((a, b) => a.name.localeCompare(b.name)).map(row).join('')}`).join('')
      : `<p class="note stk-pad">${FILTER === 'open' ? 'Every device here is confirmed.' : 'Nothing here yet.'}</p>`}</div>
    ${edit ? `<div class="addrel stk-pad"><span class="grow"></span><button id="stkCancel" class="danger-text">Cancel the stocktake…</button></div>` : ''}</div>`;
}
function wireActive(t, edit){
  document.querySelectorAll('[data-stkf]').forEach(b => b.onclick = () => { FILTER = b.dataset.stkf; renderStocktake(); });
  if (!edit) return;
  document.querySelectorAll('[data-stk]').forEach(c => c.onchange = () => {
    const o = objs.find(x => x.id === c.dataset.stk); if (!o) return;
    if (c.checked) confirm(o, t); else unconfirm(o);
    queueServerSave(); renderStocktake();
  });
  const scan = $('#stkScan');
  scan.onkeydown = e => { if (e.key !== 'Enter') return; e.preventDefault(); const v = scan.value.trim(); scan.value = ''; if (v) found(t, v); };
  $('#stkFinish').onclick = () => finishModal(t);
  $('#stkCancel').onclick = () => {
    modal(`<div class="mh">Cancel the stocktake?</div><div class="mb"><p class="note">${esc(t.name)} is removed, and so are the confirmations made in it. Devices moved in it stay where they are now.</p></div>
      <div class="mf"><button id="stcNo">Keep it</button><button id="stcYes" class="danger-text">Cancel the stocktake</button></div>`, 'sm');
    $('#stcNo').onclick = closeModal;
    $('#stcYes').onclick = () => {
      for (const o of objs) if (confirmedIn(o, t.id)) { o.verified = o.verified.prev ? { ...o.verified.prev } : undefined; if (!o.verified) delete o.verified; }
      st.stocktakes = st.stocktakes.filter(x => x.id !== t.id); closeModal(); queueServerSave(); render(); toast('Stocktake cancelled');
    };
  };
}

/* A scan: the device it names, confirmed; one recorded elsewhere, moved here when that is what was found; something
   not in the inventory, noted for the result. */
function found(t, v){
  const q = v.toLowerCase(), norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const live = objs.filter(o => o.status !== 'retired');
  const hits = live.filter(o => [o.code, o.serial, o.name].some(x => x && String(x).toLowerCase() === q))
    .concat(live.filter(o => o.mac && norm(o.mac) === norm(v) && norm(v).length === 12));
  const say = (html, cls = '') => { LAST = `<span class="${cls}">${html}</span>`; renderStocktake(); $('#stkScan').focus(); };
  const uniq = [...new Set(hits)];
  if (uniq.length > 1) return say(`${esc(v)} names ${uniq.length} devices: scan the serial number or the code instead.`, 'warn');
  if (!uniq.length) {
    t.unknown = [...(t.unknown || []), { text: v.slice(0, 200), at: new Date().toISOString() }].slice(-1000);
    queueServerSave();
    return say(`<b>${esc(v)}</b> is not in the inventory: noted for the result.`, 'warn');
  }
  const o = uniq[0];
  if (confirmedIn(o, t.id)) return say(`${esc(o.name)} is already confirmed.`);
  if (inScope(o, t.scope)) { confirm(o, t); queueServerSave(); return say(`✓ <b>${esc(o.name)}</b> confirmed${o.loc ? ` in ${esc(o.loc)}` : ''}.`, 'ok'); }
  /* Recorded elsewhere: move it here (to which room, when the stocktake is a whole site), or confirm it where it is. */
  const rooms = LOCS.filter(l => inScope({ loc: l }, t.scope));
  modal(`<div class="mh">${esc(o.name)} is recorded elsewhere</div>
    <div class="mb"><p class="note">The inventory has it ${o.loc ? `in <b>${esc(o.loc)}</b>` : 'without a location'}, not in ${esc(placeName(t.scope))}. Was it found here?</p>
      ${rooms.length ? `<div class="form" style="padding:0"><label for="stmTo">Move to</label><select id="stmTo">${rooms.map(l => `<option ${l === t.scope ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>` : ''}</div>
    <div class="mf"><button id="stmKeep">Confirm, leave where it is</button><span class="grow"></span>${rooms.length ? '<button id="stmMove" class="primary">Move here and confirm</button>' : ''}</div>`, 'sm');
  $('#stmKeep').onclick = () => { closeModal(); confirm(o, t); queueServerSave(); say(`✓ <b>${esc(o.name)}</b> confirmed, left in ${esc(o.loc || 'no location')}.`, 'ok'); };
  const mv = $('#stmMove'); if (mv) mv.onclick = () => {
    const to = $('#stmTo').value, from = o.loc || '';
    closeModal(); o.loc = to; hist(o, now(), `Location changed from ${from || 'none'} to ${to}: found there in ${t.name}`); confirm(o, t, from); queueServerSave();
    say(`✓ <b>${esc(o.name)}</b> moved to ${esc(to)} and confirmed.`, 'ok');
  };
}

/* Finish: what is missing, moved and unknown, kept with the stocktake; the lists as PDF or Excel afterwards. */
function finishModal(t){
  const r = stocktakeResult(t, objs);
  modal(`<div class="mh">Finish ${esc(t.name)}</div>
    <div class="mb"><div class="stk-sum"><div><b>${r.confirmed}</b><span>confirmed</span></div><div class="${r.missing.length ? 'bad' : ''}"><b>${r.missing.length}</b><span>missing</span></div><div><b>${r.moved.length}</b><span>moved here</span></div><div><b>${r.unknown.length}</b><span>not in the inventory</span></div></div>
      ${r.missing.length ? `<p class="note">Not found: ${esc(r.missing.slice(0, 12).map(m => m.name).join(', '))}${r.missing.length > 12 ? ` and ${r.missing.length - 12} more` : ''}. They stay as they are; the result lists them, to look for or to retire.</p>` : '<p class="note">Every device was found.</p>'}</div>
    <div class="mf"><button id="stfBack">Go on scanning</button><button id="stfOk" class="primary">Finish the stocktake</button></div>`, 'sm');
  $('#stfBack').onclick = () => { closeModal(); setTimeout(() => $('#stkScan') && $('#stkScan').focus(), 0); };
  $('#stfOk').onclick = () => {
    t.finished = new Date().toISOString(); t.finishedBy = who(); t.result = stocktakeResult(t, objs);
    st.stocktakes = [...st.stocktakes];
    closeModal(); LAST = ''; queueServerSave(); renderStocktake();
    toast(`${t.name} finished: ${r.confirmed} confirmed, ${r.missing.length} missing`);
  };
}

/* The stocktakes done, newest first, with their lists. */
function historyHtml(){
  const done = (st.stocktakes || []).filter(t => t.finished);
  if (!done.length) return '';
  return `<div class="panelbox"><div class="hdr">Done <span class="cnt">${done.length}</span></div><div style="overflow-x:auto"><table class="grid mini" style="min-width:640px"><thead><tr><th>Stocktake</th><th>Place</th><th>Finished</th><th class="n">Confirmed</th><th class="n">Missing</th><th class="n">Moved</th><th></th></tr></thead><tbody>
    ${done.map(t => `<tr><td><b>${esc(t.name)}</b></td><td>${esc(placeName(t.scope))}</td><td>${esc(dateText(t.finished.slice(0, 10)))} · ${esc(t.finishedBy || '')}</td><td class="n">${t.result.confirmed} of ${t.result.total}</td><td class="n">${t.result.missing.length}</td><td class="n">${t.result.moved.length}</td>
      <td class="act"><a class="link" href="api/reports/stocktake?id=${encodeURIComponent(t.id)}&format=pdf" download>PDF</a> <a class="link" href="api/reports/stocktake?id=${encodeURIComponent(t.id)}&format=xlsx" download>Excel</a>${canEdit() ? ` <button class="icon ghost" data-stkdel="${esc(t.id)}" aria-label="Remove ${esc(t.name)} from the list">×</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
}

/* On a device's page, under its location: when it was last confirmed on site, and Confirm now. */
export function verifiedNote(o){
  const d = daysSinceVerified(o), v = o.verified;
  const t = v && v.st && (st.stocktakes || []).find(x => x.id === v.st);
  const text = d === null ? 'Not confirmed on site yet.' : `Confirmed on site ${dateText(v.at)}${v.by ? ` by ${v.by}` : ''}${t ? ` (${t.name})` : ''}.`;
  return `<span></span><p class="fieldnote ${d === null || d > STOCKTAKE_DAYS ? 'warn' : 'ok'} stk-note">${esc(text)}${canEdit() && d !== 0 ? ` <button type="button" class="link" data-verify="${esc(o.id)}">Confirm now</button>` : ''}</p>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-verify]'); if (!b) return;
  const o = objs.find(x => x.id === b.dataset.verify); if (!o) return;
  const was = o.verified;
  confirm(o, activeStocktake() && inScope(o, activeStocktake().scope) ? activeStocktake() : null);
  queueServerSave(); render();
  toastUndo(`${o.name} confirmed on site`, () => { o.verified = was; if (!was) delete o.verified; queueServerSave(); render(); });
});
