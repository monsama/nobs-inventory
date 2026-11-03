/* The Stocktake view: walk a site or a room and confirm the devices that are there, by ticking them or by scanning (or
   typing) a serial number, code or name. A device found in another place can be moved here; something not in the
   inventory is noted. Finish says what is missing and keeps the result, with a PDF and an Excel list. A confirmed
   device shows on its page when and by whom it was last seen on site; one can also be confirmed there on its own. */
import { $, LOCS, SITES, TYPES, hist, now, objs, st, tico, toast, toastUndo } from './01-core.js';
import { USERS, isAdmin, who } from './04-settings.js';
import { resetFilters } from './02-views.js';
import { closeModal, modal } from './19-modal.js';
import { queueServerSave, reloadFromServer, render } from './07-render.js';
import { STOCKTAKE_DAYS, confirmedIn, daysSinceVerified, inScope, stocktakeDevices, stocktakeResult } from './stocktake.js';
import { dateText } from './dates.js';
import { html, rawHtml } from './html.js';

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
  const t = activeStocktake(), edit = isAdmin();
  /* Drawn again (a save, a change from someone else): the scan field keeps the focus, so scanning goes on. */
  const scanning = document.activeElement && document.activeElement.id === 'stkScan';
  $('#toolbar').innerHTML = html`<b>Stocktake</b><span class="muted">${t ? `${t.name} · ${placeName(t.scope)}` : 'Confirm on site that the devices are where the inventory says'}</span><div class="grow"></div>`;
  $('#view').innerHTML = html`<div class="stk">${t ? activeHtml(t, edit) : startHtml(edit)}${historyHtml()}</div>`;
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
  return html`<div class="panelbox"><div class="hdr">New stocktake</div>
    <p class="note stk-pad">${live.length ? `${recent} of ${live.length} devices were confirmed on site in the last 12 months.` : 'No devices yet.'} A stocktake lists the devices of one place; confirm each one you find, by ticking it or by scanning its serial number, code or name. What is not found is listed as missing when you finish.</p>
    ${edit ? html`<div class="form stk-pad"><label for="stkPlace">Place</label><select id="stkPlace"><option value="">Everywhere</option>${places.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select>
      <label for="stkName">Name</label><input id="stkName" maxlength="120" placeholder="Stocktake ${dateText(today())}"></div>
      <div class="addrel stk-pad"><button id="stkStart" class="primary">Start the stocktake</button><span class="muted" id="stkCount"></span></div>` : html`<p class="note stk-pad">An admin starts a stocktake.</p>`}</div>`;
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
  /* Devices of another place found here and left where they are count too (as when it is finished), listed by their room. */
  const inPlace = stocktakeDevices(objs, t.scope), list = [...inPlace, ...objs.filter(o => confirmedIn(o, t.id) && !inPlace.includes(o))];
  const done = list.filter(o => confirmedIn(o, t.id)).length, moved = objs.filter(o => confirmedIn(o, t.id) && o.verified.from !== undefined).length;
  const pct = list.length ? Math.round(done / list.length * 100) : 100;
  const shown = list.filter(o => FILTER === 'all' || (FILTER === 'open') !== confirmedIn(o, t.id));
  const rooms = [...new Set(shown.map(o => o.loc || ''))].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
  const row = o => { const ok = confirmedIn(o, t.id), d = daysSinceVerified(o);
    return html`<label class="stk-row${ok ? ' ok' : ''}"><input type="checkbox" data-stk="${o.id}" ${ok ? 'checked' : ''} ${edit ? '' : 'disabled'}>
      <span class="stk-name"><b>${o.name}</b> <span class="code">${o.code || ''}</span><small>${[TYPES[o.type] ? TYPES[o.type].label : o.type, o.serial, userName(o)].filter(Boolean).join(' · ')}</small></span>
      <span class="stk-when muted">${ok ? `Confirmed${o.verified.from !== undefined ? ', moved here' : ''}` : d === null ? 'Never confirmed' : `Last ${dateText(o.verified.at)}`}</span></label>`; };
  return html`<div class="panelbox"><div class="hdr">${t.name} <span class="cnt">${placeName(t.scope)} · started ${dateText(t.started.slice(0, 10))} by ${t.by || ''}</span></div>
    <div class="stk-prog stk-pad"><div class="ov-qbar" role="img" aria-label="${done} of ${list.length} confirmed"><span style="width:${pct}%"></span></div><b>${done} of ${list.length}</b>${moved ? html`<span class="muted">${moved} moved here</span>` : ''}${(t.unknown || []).length ? html`<span class="muted">${t.unknown.length} not in the inventory</span>` : ''}</div>
    ${edit ? html`<div class="stk-scanrow stk-pad"><input id="stkScan" type="search" autocomplete="off" enterkeyhint="done" placeholder="Scan or type serial number, code or name" aria-label="Scan or type a serial number, code or name">
      <button id="stkFinish" class="primary">Finish…</button></div><p class="stk-last stk-pad" id="stkLast" role="status" aria-live="polite">${rawHtml(LAST)}</p>` : ''}
    <div class="stk-tabs stk-pad">${[['open', 'Still open', list.length - done], ['done', 'Confirmed', done], ['all', 'All', list.length]].map(([k, l, n]) => html`<button class="tab ${FILTER === k ? 'active' : ''}" data-stkf="${k}">${l} <span class="tab-cnt">${n}</span></button>`)}</div>
    <div class="stk-list">${rooms.length ? rooms.map(r => html`<div class="side-sub stk-room">${r || 'No location'}</div>${shown.filter(o => (o.loc || '') === r).sort((a, b) => a.name.localeCompare(b.name)).map(row)}`)
      : html`<p class="note stk-pad">${FILTER === 'open' ? 'Every device here is confirmed.' : 'Nothing here yet.'}</p>`}</div>
    ${edit ? html`<div class="addrel stk-pad"><span class="grow"></span><button id="stkCancel" class="danger-text">Cancel the stocktake…</button></div>` : ''}</div>`;
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
    modal(html`<div class="mh">Cancel the stocktake?</div><div class="mb"><p class="note">${t.name} is removed, and so are the confirmations made in it. Devices moved in it stay where they are now.</p></div>
      <div class="mf"><button id="stcNo">Keep it</button><button id="stcYes" class="danger-text">Cancel the stocktake</button></div>`, 'sm');
    $('#stcNo').onclick = closeModal;
    $('#stcYes').onclick = () => {
      for (const o of objs) if (confirmedIn(o, t.id)) { o.verified = o.verified.prev ? { ...o.verified.prev } : undefined; if (!o.verified) delete o.verified; }
      st.stocktakes = st.stocktakes.filter(x => x.id !== t.id); LAST = ''; closeModal(); queueServerSave(); render(); toast('Stocktake cancelled');
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
  /* LAST is kept as markup: what is said here goes through html``. */
  const say = (msg, cls = '') => { LAST = String(html`<span class="${cls}">${msg}</span>`); if (st.tab === 'stocktake') renderStocktake(); if ($('#stkScan')) $('#stkScan').focus(); };
  const uniq = [...new Set(hits)];
  if (uniq.length > 1) return say(`${v} names ${uniq.length} devices: scan the serial number or the code instead.`, 'warn');
  if (!uniq.length) {
    t.unknown = [...(t.unknown || []), { text: v.slice(0, 200), at: new Date().toISOString() }].slice(-1000);
    queueServerSave();
    return say(html`<b>${v}</b> is not in the inventory: noted for the result.`, 'warn');
  }
  const o = uniq[0];
  if (confirmedIn(o, t.id)) return say(`${o.name} is already confirmed.`);
  if (inScope(o, t.scope)) { confirm(o, t); queueServerSave(); return say(html`✓ <b>${o.name}</b> confirmed${o.loc ? ` in ${o.loc}` : ''}.`, 'ok'); }
  /* Recorded elsewhere: move it here (to which room, when the stocktake is a whole site), or confirm it where it is. */
  const rooms = LOCS.filter(l => inScope({ loc: l }, t.scope));
  modal(html`<div class="mh">${o.name} is recorded elsewhere</div>
    <div class="mb"><p class="note">The inventory has it ${o.loc ? html`in <b>${o.loc}</b>` : 'without a location'}, not in ${placeName(t.scope)}. Was it found here?</p>
      ${rooms.length ? html`<div class="form" style="padding:0"><label for="stmTo">Move to</label><select id="stmTo">${rooms.map(l => html`<option ${l === t.scope ? 'selected' : ''}>${l}</option>`)}</select></div>` : ''}</div>
    <div class="mf"><button id="stmKeep">Confirm, leave where it is</button><span class="grow"></span>${rooms.length ? html`<button id="stmMove" class="primary">Move here and confirm</button>` : ''}</div>`, 'sm');
  $('#stmKeep').onclick = () => { closeModal(); confirm(o, t); queueServerSave(); say(html`✓ <b>${o.name}</b> confirmed, left in ${o.loc || 'no location'}.`, 'ok'); };
  const mv = $('#stmMove'); if (mv) mv.onclick = () => {
    const to = $('#stmTo').value, from = o.loc || '';
    closeModal(); o.loc = to; hist(o, now(), `Location changed from ${from || 'none'} to ${to}: found there in ${t.name}`); confirm(o, t, from); queueServerSave();
    say(html`✓ <b>${o.name}</b> moved to ${to} and confirmed.`, 'ok');
  };
}

/* Finish: what is missing, moved and unknown, kept with the stocktake; the lists as PDF or Excel afterwards. */
function finishModal(t){
  const r = stocktakeResult(t, objs);
  modal(html`<div class="mh">Finish ${t.name}</div>
    <div class="mb"><div class="stk-sum"><div><b>${r.confirmed}</b><span>confirmed</span></div><div class="${r.missing.length ? 'bad' : ''}"><b>${r.missing.length}</b><span>missing</span></div><div><b>${r.moved.length}</b><span>moved here</span></div><div><b>${r.unknown.length}</b><span>not in the inventory</span></div></div>
      ${r.missing.length ? html`<p class="note">Not found: ${r.missing.slice(0, 12).map(m => m.name).join(', ')}${r.missing.length > 12 ? ` and ${r.missing.length - 12} more` : ''}. They stay as they are; the result lists them, to look for or to retire.</p>` : html`<p class="note">Every device was found.</p>`}</div>
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
  return html`<div class="panelbox"><div class="hdr">Done <span class="cnt">${done.length}</span></div><div style="overflow-x:auto"><table class="grid mini stack" style="min-width:640px"><thead><tr><th>Stocktake</th><th>Place</th><th>Finished</th><th class="n">Confirmed</th><th class="n">Missing</th><th class="n">Moved</th><th></th></tr></thead><tbody>
    ${done.map(t => html`<tr><td><b>${t.name}</b></td><td>${placeName(t.scope)}</td><td>${dateText(t.finished.slice(0, 10))} · ${t.finishedBy || ''}</td><td class="n">${t.result.confirmed} of ${t.result.total}</td><td class="n">${t.result.missing.length}</td><td class="n">${t.result.moved.length}</td>
      <td class="act"><div class="sheet-acts">${t.result.missing.length ? html`<button type="button" class="link" data-stkmiss="${t.id}" title="The devices not found, in the Table, to look for or set their status">Show missing</button> ` : ''}<a class="link" href="api/reports/stocktake?id=${encodeURIComponent(t.id)}&format=pdf" download>PDF</a> <a class="link" href="api/reports/stocktake?id=${encodeURIComponent(t.id)}&format=xlsx" download>Excel</a>${isAdmin() ? html` <button class="icon ghost" data-stkdel="${t.id}" aria-label="Remove ${t.name} from the list">×</button>` : ''}</div></td></tr>`)}</tbody></table></div></div>`;
}

/* My devices: the start of someone who sees only the devices given to them. One row per device, with what they do
   there: confirm they still have it, report a problem, and what became of a report. The device opens from its name. */
export function renderMine(){
  const mine = objs.filter(o => o.uid === st.meId && o.status !== 'retired').sort((a, b) => a.name.localeCompare(b.name));
  $('#toolbar').innerHTML = html`<b>My devices</b><span class="muted">${mine.length} device${mine.length === 1 ? '' : 's'} given to you</span>`;
  const row = o => {
    const d = daysSinceVerified(o), open = o.reported && !o.reported.done;
    const state = d === null ? html`<span class="chip warn">Not confirmed yet</span>` : d > STOCKTAKE_DAYS ? html`<span class="chip warn">Confirmed ${dateText(o.verified.at)}</span>` : html`<span class="chip ok">Confirmed ${dateText(o.verified.at)}</span>`;
    const t = TYPES[o.type] || { label: o.type };
    return html`<li class="mine-row"><div class="mine-dev">${rawHtml(tico(o.type))}<div><button type="button" class="link mine-name" data-open="${o.id}">${o.name}</button>
        <div class="muted mine-sub">${[t.label, o.model, o.code].filter(Boolean).join(' · ')}</div></div></div>
      <div class="mine-state">${state}${open ? html`<span class="chip warn">Reported – IT is on it</span>` : ''}</div>
      <div class="mine-acts">${d !== 0 ? html`<button type="button" data-mine="${o.id}">I have it</button>` : ''}<button type="button" data-myreport="${o.id}">${open ? 'Report another problem…' : 'Report a problem…'}</button></div>
      ${open ? html`<p class="fieldnote stk-note mine-note">Your report of ${dateText(String(o.reported.at).slice(0, 10))}: ${o.reported.text}</p>` : rawHtml(doneNote(o).replace('class="fieldnote', 'class="mine-note fieldnote'))}</li>`;
  };
  $('#view').innerHTML = html`<div class="mine"><div class="panelbox"><div class="hdr">My devices <span class="cnt">${mine.length}</span></div>
    ${mine.length ? html`<p class="note" style="padding:10px 12px 0">The devices IT has given you. Tell IT you still have each one, or report a problem: IT sees it on the device.</p><ul class="mine-list">${mine.map(row)}</ul>`
      : html`<p class="note" style="padding:12px">No device is given to you in the inventory. If you have one, tell IT.</p>`}</div></div>`;
}
/* To the person who reported a problem: IT has dealt with it, when, and what was done if IT said; for 30 days. */
export const REPORT_DONE_SHOWN_DAYS = 30;
export function doneNote(o){
  const d = o.reported && o.reported.done;
  if (!d || !(Date.now() - Date.parse(d.at) < REPORT_DONE_SHOWN_DAYS * 864e5)) return '';
  return String(html`<p class="fieldnote ok stk-note"><b>Done:</b> IT dealt with your report of ${dateText(String(o.reported.at).slice(0, 10))} on ${dateText(String(d.at).slice(0, 10))}${d.note ? `: ${d.note}` : '.'}</p>`);
}
/* On a device's page, under its location: when it was last confirmed on site, and Confirm now. */
export function verifiedNote(o){
  const d = daysSinceVerified(o), v = o.verified;
  const t = v && v.st && (st.stocktakes || []).find(x => x.id === v.st);
  const text = d === null ? 'Not confirmed on site yet.' : `Confirmed on site ${dateText(v.at)}${v.by ? ` by ${v.by}` : ''}${t ? ` (${t.name})` : ''}.`;
  /* The device's own user (not an admin) confirms they have it and can report a problem; an admin sees the report and
     marks it done. */
  const mine = !isAdmin() && o.uid && o.uid === st.meId;
  const rep = o.reported && !o.reported.done ? html`<p class="fieldnote warn stk-note"><b>Problem reported</b> by ${o.reported.by} on ${dateText(o.reported.at.slice(0, 10))}: ${o.reported.text}${isAdmin() ? html` <button type="button" class="link" data-repdone="${o.id}">Done</button>` : ''}</p>` : '';
  /* "Not confirmed on site yet" only once it says something: after a stocktake has been done (it was missed), or to the
     device's own user, who can say they have it. Before any stocktake every device would carry it. */
  if (d === null && !mine && !(st.stocktakes || []).some(x => x.finished)){
    const confirm = isAdmin() ? html`<p class="fieldnote stk-note quiet"><button type="button" class="link" data-verify="${o.id}">Confirm on site</button></p>` : '';
    return rep || confirm ? String(html`<span></span><div class="vnote">${confirm}${rep}</div>`) : '';
  }
  return String(html`<span></span><div class="vnote"><p class="fieldnote ${d === null || d > STOCKTAKE_DAYS ? 'warn' : 'ok'} stk-note">${text}${isAdmin() && d !== 0 ? html` <button type="button" class="link" data-verify="${o.id}">Confirm now</button>` : ''}${mine && d !== 0 ? html` <button type="button" class="link" data-mine="${o.id}">I have it</button>` : ''}${mine ? html` <button type="button" class="link" data-myreport="${o.id}">${o.reported && !o.reported.done ? 'Report another problem…' : 'Report a problem…'}</button>` : ''}</p>${rep}${mine && o.reported && !o.reported.done ? html`<p class="fieldnote stk-note">Your report of ${dateText(String(o.reported.at).slice(0, 10))} is with IT.</p>` : ''}${mine ? rawHtml(doneNote(o)) : ''}</div>`);
}
/* My devices: the calls the server allows the device's own user (server/app.js), then the inventory read again. */
document.addEventListener('click', async e => {
  const t = e.target.closest && e.target.closest('[data-mine], [data-myreport], [data-repdone]'); if (!t) return;
  if (t.dataset.repdone){
    const o = objs.find(x => x.id === t.dataset.repdone); if (!o || !o.reported || o.reported.done) return;
    /* Kept, marked done, so the list of reported problems can show what was handled; Undo opens it again. */
    /* What was done, if wanted: the person who reported it reads it on their device. */
    modal(html`<div class="mh">Problem done</div><div class="mb"><p class="note"><b>${o.name}</b>: ${o.reported.text}</p>
      <label for="repNote">What was done <span class="muted">(optional, ${o.reported.by} sees it on the device)</span></label><textarea id="repNote" rows="3" maxlength="500" style="width:100%"></textarea></div>
      <div class="mf"><button id="repNo">Cancel</button><button id="repOk" class="primary">Mark as done</button></div>`, 'sm');
    $('#repNo').onclick = closeModal;
    $('#repOk').onclick = () => {
      const note = $('#repNote').value.trim().slice(0, 500), before = { ...o.reported };
      o.reported = { ...o.reported, done: { at: new Date().toISOString(), by: String(who()).slice(0, 120), ...(note ? { note } : {}) } };
      hist(o, now(), `Reported problem done: ${o.reported.text}${note ? ` (${note})` : ''}`); queueServerSave(); closeModal(); render();
      toastUndo('Marked as done', () => { o.reported = before; queueServerSave(); render(); });
    };
    $('#repNote').focus(); return;
  }
  const id = t.dataset.mine || t.dataset.myreport;
  const post = async (path, body) => { const r = await fetch(`api/my/devices/${encodeURIComponent(id)}/${path}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'That did not work.'); };
  if (t.dataset.mine){ try { await post('confirm'); toast('Thank you: confirmed'); await reloadFromServer(); } catch (err) { toast(err.message); } return; }
  modal(`<div class="mh">Report a problem</div><div class="mb"><p class="note">IT sees it on the device. Say what does not work, or that it is lost or broken.</p><textarea id="myRep" rows="4" maxlength="500" style="width:100%"></textarea></div>
    <div class="mf"><button id="myRepNo">Cancel</button><button id="myRepOk" class="primary">Send</button></div>`, 'sm');
  $('#myRepNo').onclick = closeModal;
  $('#myRepOk').onclick = async () => { try { await post('report', { text: $('#myRep').value }); closeModal(); toast('Sent to IT'); await reloadFromServer(); } catch (err) { toast(err.message); } };
  $('#myRep').focus();
});
/* Missing in a finished stocktake: those devices in the Table (the ones still in the inventory), as one filter. */
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-stkmiss]'); if (!b) return;
  const t = (st.stocktakes || []).find(x => x.id === b.dataset.stkmiss); if (!t || !t.result) return;
  resetFilters();
  st.ids = { label: `Missing in ${t.name}`, ids: t.result.missing.map(m => m.id) };
  st.scope = null; st.tab = 'table'; render();
});
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-verify]'); if (!b) return;
  const o = objs.find(x => x.id === b.dataset.verify); if (!o) return;
  const was = o.verified;
  confirm(o, activeStocktake() && inScope(o, activeStocktake().scope) ? activeStocktake() : null);
  queueServerSave(); render();
  toastUndo(`${o.name} confirmed on site`, () => { o.verified = was; if (!was) delete o.verified; queueServerSave(); render(); });
});
