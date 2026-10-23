import { PORTED, $, LOCS, O, SITES, STATUS, TYPES, byId, esc, filtered, hist, isUplink, now, objs, pfxOf, portLabel, rels, relsOf, st, syncChip, tcol, tico, toast, used } from './01-core.js';
import { SERVER, render } from './07-render-plans.js';
import { TBL, saveTBL } from './06-topbar.js';
import { newObjModal } from './05-new-object.js';
import { USERS, bindUser, checkAddress, devicesOf, rackOf, showDevicesOf } from './04-settings.js';
import { closeModal, modal } from './03-object-modals.js';
/* ---------- sidebar ---------- */
export function renderSide(){
  const cnt = f => objs.filter(f).length;
  $('#typeList').innerHTML =
    `<button class="item ${!st.type?'sel':''}" data-type=""><span class="lbl">All objects</span><span class="cnt">${objs.length}</span></button>` +
    Object.entries(TYPES).map(([k,v]) => `<button class="item ${st.type===k?'sel':''}" data-type="${k}">${tico(k,'tico sm')}<span class="lbl">${v.label}</span><span class="cnt">${cnt(o=>o.type===k)}</span></button>`).join('');
  const sites = [...new Set([...SITES, ...LOCS.map(l => l.split(' / ')[0])])];
  $('#locList').innerHTML = sites.map(s => `<button class="item ${st.loc===s?'sel':''}" data-loc="${esc(s)}"><span class="lbl">${esc(s)}</span><span class="cnt">${cnt(o=>String(o.loc||'').split(' / ')[0]===s)}</span></button>` +
    LOCS.filter(l => l.startsWith(s + ' / ')).map(l => `<button class="item sub ${st.loc===l?'sel':''}" data-loc="${esc(l)}"><span class="lbl">${esc(l.split(' / ')[1])}</span><span class="cnt">${cnt(o=>o.loc===l)}</span></button>`).join('')).join('');
  $('#statList').innerHTML = Object.entries(STATUS).map(([k,v]) => `<button class="item ${st.status===k?'sel':''}" data-status="${k}"><span class="dot ${k==='active'?'':k==='repair'?'warn':k==='retired'?'bad':'off'}"></span><span class="lbl">${v.label}</span><span class="cnt">${cnt(o=>o.status===k)}</span></button>`).join('');
}
$('#side').addEventListener('click', e => {
  const b = e.target.closest('.item'); if (!b) return;
  if ('type' in b.dataset) st.type = b.dataset.type || null;
  if ('loc' in b.dataset) st.loc = st.loc === b.dataset.loc ? null : b.dataset.loc;
  if ('status' in b.dataset) st.status = st.status === b.dataset.status ? null : b.dataset.status;
  if (!['cards','table','map'].includes(st.tab)) st.tab = 'cards';
  document.body.classList.remove('side-open');
  render();
});
$('#clearF').onclick = () => { st.type = st.loc = st.status = null; st.q = ''; $('#search').value = ''; Object.values(TBL).forEach(s => { s.filters = {}; }); saveTBL(); render(); };
$('#sideBtn').onclick = () => document.body.classList.toggle('side-open');

/* ---------- tabs ---------- */
/* Tabs: the views and the open objects, in one row that can be reordered by dragging, as in NOBS SQL. */
export const FIXED_TABS = {cards:'Cards', table:'Table', map:'Relationships', plans:'Floor plans', net:'Ports', rack:'Racks', sw:'Software'};
export function renderTabs(){
  const ids = st.tabIds.filter(id => FIXED_TABS[id] || st.open.includes(id));
  $('#tabsbar').innerHTML = ids.map(id => {
    if (FIXED_TABS[id]) return `<button class="tab ${st.tab===id?'active':''}" draggable="true" data-tab="${id}">${FIXED_TABS[id]}</button>`;
    const o = byId(id);
    return `<span class="tab ${st.tab===id?'active':''}" draggable="true" data-tab="${id}" role="button" tabindex="0"><span class="tsw" style="background:${tcol(o.type)}"></span><span class="mono">${esc(o.name)}</span><span class="x" data-close="${id}" title="Close (middle-click also closes)">×</span></span>`;
  }).join('');
  $('#tabsbar').querySelectorAll('[data-tab]').forEach(el => {
    const id = el.dataset.tab;
    el.addEventListener('dragstart', e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('dragover'); });
    el.addEventListener('dragleave', () => el.classList.remove('dragover'));
    el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('dragover'); const src = e.dataTransfer.getData('text/plain'); if (src && src !== id) reorderTabs(src, id); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); st.tab = id; render(); } });
    el.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
    el.addEventListener('auxclick', e => { if (e.button === 1 && st.open.includes(id)) closeObjTab(id); });
    if (st.open.includes(id)) el.addEventListener('contextmenu', e => showTabMenu(e, id));
  });
}
/* Moved the way NOBS SQL does it: after the target when moving right, before it when moving left. */
export function reorderTabs(src, tgt){
  const arr = st.tabIds, a = arr.indexOf(src), b = arr.indexOf(tgt);
  if (a < 0 || b < 0) return;
  arr.splice(a, 1);
  const nb = arr.indexOf(tgt);
  arr.splice(a < b ? nb + 1 : nb, 0, src);
  render();
}
export function closeObjTab(id){
  st.open = st.open.filter(x => x !== id); st.tabIds = st.tabIds.filter(x => x !== id);
  if (st.tab === id) st.tab = 'cards';
  render();
}
/* Closes every open object tab except `keep` (or all of them when keep is null). The views stay open. */
export function closeObjTabs(keep){
  st.open = st.open.filter(x => x === keep);
  st.tabIds = st.tabIds.filter(x => FIXED_TABS[x] || x === keep);
  if (!FIXED_TABS[st.tab] && st.tab !== keep) st.tab = keep || 'cards';
  render();
}
export let tabMenu = null;
export function hideTabMenu(){ if (tabMenu){ tabMenu.remove(); tabMenu = null; } }
export function showTabMenu(e, id){
  e.preventDefault(); hideTabMenu();
  tabMenu = document.createElement('div');
  tabMenu.className = 'tabmenu';
  tabMenu.style.left = e.clientX + 'px'; tabMenu.style.top = e.clientY + 'px';
  const others = st.open.some(x => x !== id);
  tabMenu.innerHTML = `<button data-a="close">Close tab</button><button data-a="others" ${others ? '' : 'disabled'}>Close other tabs</button><button data-a="all">Close all tabs</button>`;
  document.body.appendChild(tabMenu);
  tabMenu.addEventListener('click', ev => {
    const a = ev.target.dataset.a; hideTabMenu();
    if (a === 'close') closeObjTab(id);
    if (a === 'others') closeObjTabs(id);
    if (a === 'all') closeObjTabs(null);
  });
}
document.addEventListener('click', hideTabMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTabMenu(); });
$('#tabsbar').addEventListener('click', e => {
  const c = e.target.closest('[data-close]');
  if (c){ closeObjTab(c.dataset.close); return; }
  const t = e.target.closest('[data-tab]');
  /* From a device's card, Ports shows that device when it has ports; otherwise the first one. */
  if (t){ if (t.dataset.tab === 'net' && byId(st.tab) && PORTED.includes(byId(st.tab).type)) st.netSw = st.tab; st.tab = t.dataset.tab; render(); }
});
export function openObj(id){ if (!st.open.includes(id)){ st.open.push(id); st.tabIds.push(id); } st.tab = id; render(); const v = $('#view'); if (v) v.scrollTop = 0; }

/* ---------- cards ---------- */
export function cardHtml(o){
  const rs = relsOf(o);
  const lines = [];
  if (o.ip) lines.push(['IP', `<span class="mono">${esc(o.ip)}</span>`]);
  if (o.type === 'sip') lines.push(['Extension', `<span class="mono">${esc(o.ext)}</span>`]);
  else if (o.mac) lines.push(['MAC', `<span class="mono">${esc(o.mac)}</span>`]);
  if (o.type === 'server') lines.push(['Kind', o.kind === 'vm' ? 'Virtual machine' : 'Physical']);
  if (o.type === 'storage') lines.push(['Capacity', `${esc(o.cap)} · ${esc(o.proto)}`]);
  if (o.type === 'switch') lines.push(['Ports', `${o.ports} + ${o.sfp} SFP · ${used(o)} used`]);
  else if (o.type === 'patch') lines.push(['Ports', `${o.ports} · ${used(o)} used`]);
  else if (PORTED.includes(o.type) && o.ports) lines.push(['Ports', `${o.ports} · ${used(o)} used`]);
  else if (o.type === 'monitor') lines.push(['Serial', `<span class="mono">${esc(o.serial)}</span>`]);
  lines.push(['Location', esc(o.loc.replace(' / ', ' · '))]);
  if (o.user) lines.push(['User', esc(o.user)]);
  const s = STATUS[o.status];
  return `<button class="card" data-open="${o.id}">
    <div class="ch">${tico(o.type)}<div class="hd"><span class="nm">${esc(o.name)}</span><span class="model">${esc(o.model)}</span></div>
      ${o.status !== 'active' ? `<span class="chip ${s.cls}">${s.label}</span>` : ''}</div>
    <dl class="kv">${lines.map(([k,v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <div class="cf"><span class="code">${esc(o.code)}</span>${syncChip(o)}<span class="grow"></span>${rs.length} relations</div>
  </button>`;
}
export function renderCardsBody(){
  const list = filtered();
  $('#toolbar').innerHTML = `<span class="muted">${list.length} of ${objs.length} objects</span><span class="tbsep"></span>
    <label class="muted" for="grp">Group by</label><select id="grp"><option value="none">Nothing</option><option value="type">Type</option><option value="loc">Location</option><option value="user">User</option></select>
    ${st.cardsGroup !== 'none' ? '<button id="grpAll">Collapse all</button><button id="grpNone">Expand all</button>' : ''}
    <div class="grow"></div><span class="muted hide-n">Click a card to open it in its own tab</span>`;
  $('#grp').value = st.cardsGroup;
  $('#grp').onchange = e => { st.cardsGroup = e.target.value; render(); };
  if (!list.length){
    $('#view').innerHTML = objs.length
      ? (st.q.trim() ? `<div class="empty">Nothing matches “${esc(st.q.trim())}”. <button class="primary" id="newFromSearch">Create “${esc(st.q.trim())}” as a new object</button></div>` : `<div class="empty">Nothing matches these filters. <a class="link" id="clr2">Clear filters</a></div>`)
      : (SERVER.on && !st.meId ? `<div class="empty">Sign in to see the inventory.</div>` : `<div class="empty">The inventory is empty. Add an object with New object, or connect a feed in Settings.</div>`);
    const c2 = $('#clr2'); if (c2) c2.onclick = () => $('#clearF').click();
    const nfs = $('#newFromSearch'); if (nfs) nfs.onclick = () => newObjModal({name: st.q.trim()});
    return;
  }
  if (st.cardsGroup === 'none'){ $('#view').innerHTML = `<div id="cards">${list.map(cardHtml).join('')}</div>`; return; }
  const key = st.cardsGroup === 'type' ? o => TYPES[o.type].label : st.cardsGroup === 'user' ? o => o.user || 'No user' : o => o.loc;
  const groups = [...new Set(list.map(key))].sort((a, b) => a === 'No user' ? 1 : b === 'No user' ? -1 : a.localeCompare(b));
  st.groupsClosed ??= {};
  $('#view').innerHTML = groups.map(g => {
    const closed = !!st.groupsClosed[st.cardsGroup + ':' + g], items = list.filter(o => key(o) === g);
    return `<section class="grp${closed ? ' collapsed' : ''}"><div class="hdr sechdr grphdr" role="button" tabindex="0" aria-expanded="${!closed}" data-grp="${esc(g)}" style="position:sticky;top:0;z-index:2">${esc(g)} <span class="muted">${items.length}</span></div><div id="cards">${items.map(cardHtml).join('')}</div></section>`;
  }).join('');
  $('#view').querySelectorAll('.grphdr').forEach(h => {
    const toggle = () => { const k = st.cardsGroup + ':' + h.dataset.grp; st.groupsClosed[k] = !st.groupsClosed[k]; renderCards(); };
    h.addEventListener('click', toggle);
    h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });
  const setAll = closed => { $('#view').querySelectorAll('.grphdr').forEach(h => st.groupsClosed[st.cardsGroup + ':' + h.dataset.grp] = closed); renderCards(); };
  const ca = $('#grpAll'), ea = $('#grpNone');
  if (ca) ca.onclick = () => setAll(true);
  if (ea) ea.onclick = () => setAll(false);
}

export function renderCards(){ renderCardsBody(); addSearchHits(); }
/* When the search matches a person or a place, those come first as buttons. */
export function addSearchHits(){
  const q = st.q.trim().toLowerCase(); if (!q) return;
  const people = USERS.filter(u => [u.name, u.login, u.dept].some(v => v && v.toLowerCase().includes(q)));
  const locs = LOCS.filter(l => l.toLowerCase().includes(q));
  if (!people.length && !locs.length) return;
  $('#view').insertAdjacentHTML('afterbegin', `<div class="hits">${people.map(u => `<button class="chip info" data-person="${esc(u.name)}">${esc(u.name)} · ${devicesOf(u.name)} devices</button>`).join('')}${locs.map(l => `<button class="chip ls" data-loc="${esc(l)}">${esc(l)}</button>`).join('')}</div>`);
  $('#view').querySelectorAll('[data-person]').forEach(b => b.onclick = () => showDevicesOf(b.dataset.person));
  $('#view').querySelectorAll('[data-loc]').forEach(b => b.onclick = () => { st.loc = b.dataset.loc; st.q = ''; $('#search').value = ''; render(); });
}

/* ---------- table ---------- */
/* The columns of the objects table. Name always shows; the others can be hidden from the Columns menu. */
export const TABLE_COLS = [
  {k:'code', label:'Code', cell: o => `<td class="code">${esc(o.code)}</td>`},
  {k:'name', label:'Name', fixed: true, cell: o => `<td class="n"><b>${esc(o.name)}</b></td>`},
  {k:'type', label:'Type', cell: o => `<td><span class="tdot"><span class="tsw" style="background:${tcol(o.type)}"></span>${TYPES[o.type].short}</span></td>`},
  {k:'model', label:'Model', cell: o => `<td>${esc(o.model)}</td>`},
  {k:'ip', label:'IP', cell: o => `<td class="n">${esc(o.ip || '')}</td>`},
  {k:'mac', label:'MAC', cell: o => `<td class="n">${esc(o.mac || '')}</td>`},
  {k:'serial', label:'Serial', cell: o => `<td class="n">${esc(o.serial)}</td>`},
  {k:'loc', label:'Location', cell: o => `<td>${esc(o.loc)}</td>`},
  {k:'rack', label:'Rack', cell: o => `<td class="n">${esc(o.rack && o.u != null && rackOf(o.rack) ? rackOf(o.rack).name + ' · U' + o.u : '')}</td>`},
  {k:'user', label:'User', cell: o => `<td>${esc(o.user || '')}</td>`},
  {k:'conn', label:'Connected to', cell: o => { const up = rels.find(r => r.from === o.id && ['connected','uplink','patched'].includes(r.kind)); const t = up && byId(up.to);
    return `<td class="n">${t ? esc(t.name) + (up.port != null ? ' · ' + esc(portLabel(t, up.port)) : '') : ''}</td>`; }},
  {k:'status', label:'Status', cell: o => `<td>${STATUS[o.status].label}</td>`},
  {k:'ls', label:'Lansweeper', cell: o => `<td>${syncChip(o) || '—'}</td>`}
];
/* Rack is hidden until it is wanted: most devices do not go in a rack. */
export const DEFAULT_HIDDEN_COLS = ['rack'];
export function hiddenCols(){
  if (!st.hiddenCols){
    try { st.hiddenCols = JSON.parse(localStorage.getItem('ni-hidden-cols')) || DEFAULT_HIDDEN_COLS; } catch { st.hiddenCols = DEFAULT_HIDDEN_COLS; }
  }
  return st.hiddenCols;
}
export function setHiddenCols(list){
  st.hiddenCols = list;
  try { localStorage.setItem('ni-hidden-cols', JSON.stringify(list)); } catch { /* Browser storage can be blocked (a private window): then the choice is simply not kept. */ }
}
export function columnsMenu(){
  const hidden = hiddenCols();
  return `<details class="menu" id="colMenu"><summary>Columns</summary><div class="menubox">${TABLE_COLS.map(c => `<label style="display:flex;gap:6px;align-items:center;white-space:nowrap"><input type="checkbox" data-col="${c.k}" ${c.fixed ? 'disabled' : ''} ${c.fixed || !hidden.includes(c.k) ? 'checked' : ''}> ${c.label}</label>`).join('')}</div></details>`;
}

export function renderTable(){
  const list = filtered();
  const colOpen = !!($('#colMenu') && $('#colMenu').open);
  st.bulk ??= new Set();
  st.bulk = new Set([...st.bulk].filter(id => objs.some(o => o.id === id)));
  const n = st.bulk.size;
  $('#toolbar').innerHTML = `<span class="muted">${list.length} rows</span><span class="tbsep"></span>
    ${n ? `<b>${n} selected</b><select id="bkLoc" aria-label="Move selected to location"><option value="">Move to location…</option>${LOCS.map(l => `<option>${esc(l)}</option>`).join('')}</select><select id="bkStatus" aria-label="Set status of selected"><option value="">Set status…</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select><button id="bkClear">Clear selection</button><span class="tbsep"></span>` : ''}
    ${columnsMenu()}<button id="csvBtn"><svg class="i" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg>Export CSV</button><button id="csvImp">Import CSV…</button>`;
  if (colOpen) $('#colMenu').open = true;
  $('#toolbar').querySelectorAll('[data-col]').forEach(c => c.onchange = () => {
    const k = c.dataset.col, hidden = hiddenCols();
    setHiddenCols(c.checked ? hidden.filter(x => x !== k) : [...hidden, k]);
    renderTable();
  });
  $('#csvBtn').onclick = () => exportCsv(list);
  $('#csvImp').onclick = importCsvModal;
  const bk = $('#bkLoc'); if (bk) bk.onchange = () => { if (!bk.value) return; st.bulk.forEach(id => { const o = byId(id); o.loc = bk.value; hist(o, now(), 'Moved to ' + bk.value + ' (bulk)'); }); toast(n + ' moved to ' + bk.value); renderTable(); render(); };
  const bs = $('#bkStatus'); if (bs) bs.onchange = () => { if (!bs.value) return; st.bulk.forEach(id => { const o = byId(id); o.status = bs.value; hist(o, now(), 'Status set to ' + STATUS[bs.value].label + ' (bulk)'); }); toast(n + ' set to ' + STATUS[bs.value].label); renderTable(); render(); };
  const bc = $('#bkClear'); if (bc) bc.onclick = () => { st.bulk.clear(); renderTable(); };
  const shown = TABLE_COLS.filter(c => c.fixed || !hiddenCols().includes(c.k));
  $('#view').innerHTML = `<div class="gridwrap"><table class="grid"><thead><tr>
    <th style="width:30px"><input type="checkbox" id="selAll" aria-label="Select all shown rows" style="height:auto"></th>
    ${shown.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>
    ${list.map(o => `<tr data-open="${o.id}"><td><input type="checkbox" data-sel="${o.id}" ${st.bulk.has(o.id) ? 'checked' : ''} aria-label="Select ${esc(o.name)}" style="height:auto"></td>${shown.map(c => c.cell(o)).join('')}</tr>`).join('')}
    </tbody></table></div>`;
  const selBox = el => el.addEventListener('click', e => e.stopPropagation());
  $('#view').querySelectorAll('[data-sel]').forEach(c => { selBox(c); c.onchange = () => { c.checked ? st.bulk.add(c.dataset.sel) : st.bulk.delete(c.dataset.sel); renderTable(); }; });
  const all = $('#selAll'); selBox(all);
  /* Only the rows shown: a row hidden by a column filter is not selected. */
  const rowIds = () => [...$('#view').querySelectorAll('tbody tr')].filter(r => r.style.display !== 'none' && r.querySelector('[data-sel]')).map(r => r.querySelector('[data-sel]').dataset.sel);
  all.checked = rowIds().length > 0 && rowIds().every(id => st.bulk.has(id));
  /* Ticking it selects every row shown; ticking it again, when they are all selected, clears them. */
  all.onchange = () => { const ids = rowIds(), on = ids.every(id => st.bulk.has(id)); ids.forEach(id => on ? st.bulk.delete(id) : st.bulk.add(id)); renderTable(); };
}

/* CSV: a plain comma or semicolon file, first row is the header. */
export function parseCsv(text){
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (q){ if (c === '"'){ if (text[i + 1] === '"'){ cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === ';'){ row.push(cell); cell = ''; }
    else if (c === '\n'){ row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
/* A cell that starts with = + - @ or a tab or return would run as a formula in a spreadsheet, so it gets a leading apostrophe. */
export const csvCell = v => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",;\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
export function exportCsv(list){
  const head = ['code','name','type','model','serial','ip','mac','location','user','status'];
  const lines = [head.join(',')].concat(list.map(o => [o.code, o.name, TYPES[o.type].label, o.model, o.serial, o.ip, o.mac, o.loc, o.user, STATUS[o.status].label].map(csvCell).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], {type: 'text/csv'});
  const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: 'inventory.csv'});
  document.body.appendChild(a); a.click(); a.remove();
  toast('Exported ' + list.length + ' rows');
}
export function importCsvModal(){
  modal(`<div class="mh">Import objects from CSV</div>
    <div class="mb">
      <p class="note">The first row is the header. Columns: <span class="mono">name, type, model, serial, ip, mac, location, user</span>. Type is an object type name. Location must match a location exactly. Comma or semicolon separated. Rows with a problem are shown and skipped.</p>
      <div class="form" style="padding:0"><label for="csvFile">File</label><input id="csvFile" type="file" accept=".csv,text/csv"></div>
      <label class="note" for="csvText">Or paste the rows</label>
      <textarea id="csvText" rows="5" class="mono" placeholder="name,type,model,serial,ip,mac,location,user"></textarea>
      <div id="csvPrev"></div>
    </div>
    <div class="mf"><button id="csvCancel">Cancel</button><button id="csvGo" class="primary" disabled>Import</button></div>`, 'wide');
  let parsed = [];
  const parse = () => {
    const rows = parseCsv($('#csvText').value);
    const head = (rows[0] || []).map(h => h.trim().toLowerCase());
    const col = k => head.indexOf(k);
    if (!rows.length || col('name') < 0 || col('type') < 0){
      $('#csvPrev').innerHTML = rows.length ? '<p class="note">The first row needs at least the columns name and type.</p>' : '';
      parsed = []; $('#csvGo').disabled = true; return;
    }
    parsed = rows.slice(1).map((r, i) => {
      const g = k => col(k) >= 0 ? (r[col(k)] || '').trim() : '';
      const name = g('name'), tv = g('type').toLowerCase(), loc = g('location');
      const tKey = Object.keys(TYPES).find(k => k === tv || TYPES[k].label.toLowerCase() === tv);
      const errs = [];
      if (!name) errs.push('no name');
      if (!tKey) errs.push('unknown type');
      if (loc && !LOCS.includes(loc)) errs.push('unknown location');
      const ip = checkAddress('ip', g('ip')), mac = checkAddress('mac', g('mac'));
      if (!ip.ok) errs.push('IP address is not valid');
      if (!mac.ok) errs.push('MAC address is not valid');
      return {line: i + 2, name, type: tKey, loc: loc || LOCS[0], model: g('model'), serial: g('serial'), ip: ip.value, mac: g('mac'), user: g('user'), errs};
    });
    const ok = parsed.filter(p => !p.errs.length).length;
    $('#csvPrev').innerHTML = `<div class="summary"><span class="chip ok">${ok} ready</span><span class="chip warn">${parsed.length - ok} with problems</span></div>
      <div style="overflow-x:auto"><table class="grid mini" style="min-width:0"><thead><tr><th>Line</th><th>Name</th><th>Type</th><th>Location</th><th>Result</th></tr></thead><tbody>
      ${parsed.map(p => `<tr><td class="n">${p.line}</td><td>${esc(p.name)}</td><td>${p.type ? TYPES[p.type].label : '—'}</td><td>${esc(p.loc)}</td><td>${p.errs.length ? '<span class="chip warn">' + esc(p.errs.join(', ')) + '</span>' : '<span class="chip ok">ok</span>'}</td></tr>`).join('')}
      </tbody></table></div>`;
    $('#csvGo').disabled = ok === 0;
  };
  $('#csvFile').onchange = async e => { const f = e.target.files[0]; if (f){ $('#csvText').value = await f.text(); parse(); } };
  $('#csvText').oninput = parse;
  $('#csvCancel').onclick = closeModal;
  $('#csvGo').onclick = () => {
    const ready = parsed.filter(p => !p.errs.length);
    ready.forEach(p => {
      const o = O(p.type, p.name, {loc: p.loc, model: p.model, serial: p.serial, ip: p.ip, mac: p.mac, user: p.user});
      if (p.type === 'switch') Object.assign(o, {ports: 24, sfp: 4, pfx: '1/'});
      objs.push(o); bindUser(o); hist(o, now(), 'Imported from CSV');
    });
    closeModal(); toast('Imported ' + ready.length + ' objects'); render();
  };
}

/* ---------- relationship map ----------
   Like the ER diagram in NOBS SQL: boxes with a header, right-angled lines between them, the line's kind and port
   written on it. Hover a box to light up its lines. Drag a box to move it, drag the background to pan, Ctrl + wheel to zoom. */
export const MAP = {zoom:1, px:24, py:24, drag:null, L:null, found:null};
export const MAP_W = 200, MAP_STEP = 340;
export const mapLines = o => [o.model, o.ip || o.user || (o.ext ? 'Ext ' + o.ext : ''), o.type === 'patch' ? (o.ports || 24) + ' ports · ' + used(o) + ' used' : o.type === 'storage' ? o.cap + ' · ' + o.proto : o.kind === 'vm' ? 'Virtual machine' : ''].filter(Boolean);
/* Every box has the same height, so the rows line up across a column. */
export const mapH = () => 91;

export function mapLayout(nodes){
  const ids = new Set(nodes.map(o => o.id));
  const E = rels.filter(r => ids.has(r.from) && ids.has(r.to));
  const connected = new Set(E.flatMap(r => [r.from, r.to]));
  const list = st.mapOnly ? nodes.filter(o => connected.has(o.id)) : nodes;
  const inList = new Set(list.map(o => o.id));
  /* A cable stored from both ends is drawn once: the downlink is the uplink seen from the other switch. */
  const mirrored = r => r.kind === 'downlink' && E.some(u => u.kind === 'uplink' && u.from === r.to && u.to === r.from);
  const edges = E.filter(r => inList.has(r.from) && inList.has(r.to) && !mirrored(r));
  /* Columns by distance from the switches, so the core sits left and everything hangs off it to the right. */
  const adj = {}; edges.forEach(r => { (adj[r.from] ??= []).push(r.to); (adj[r.to] ??= []).push(r.from); });
  const depth = {}, q = list.filter(o => ['firewall','router','switch'].includes(o.type) && !edges.some(r => r.kind === 'uplink' && r.from === o.id)).map(o => o.id);
  q.forEach(id => depth[id] = 0);
  for (let i = 0; i < q.length; i++) (adj[q[i]] || []).forEach(n => { if (!(n in depth)){ depth[n] = depth[q[i]] + 1; q.push(n); } });
  /* Groups without a switch, router or firewall (a PC with its monitors) start from their best-connected object, so the
     monitors sit one column to the right of their PC instead of beside it. */
  list.filter(o => (adj[o.id] || []).length && !(o.id in depth)).sort((a, b) => adj[b.id].length - adj[a.id].length).forEach(o => {
    if (o.id in depth) return;
    depth[o.id] = 0;
    const qq = [o.id];
    for (let i = 0; i < qq.length; i++) (adj[qq[i]] || []).forEach(n => { if (!(n in depth)){ depth[n] = depth[qq[i]] + 1; qq.push(n); } });
  });
  const maxD = Math.max(0, ...Object.values(depth));
  list.forEach(o => { if (!(o.id in depth)) depth[o.id] = maxD + 1; });
  const cols = {};
  list.forEach(o => (cols[depth[o.id]] ??= []).push(o));
  /* Each column is ordered by the height of the boxes it is linked to in the column before, so lines run mostly straight. */
  const pos = {}, ypos = {};
  Object.keys(cols).map(Number).sort((a,b) => a - b).forEach(d => {
    const bary = o => {
      const ns = (adj[o.id] || []).filter(n => depth[n] === d - 1 && n in ypos);
      return ns.length ? ns.reduce((sum, n) => sum + ypos[n], 0) / ns.length : Infinity;
    };
    let y = 24;
    cols[d].map(o => [o, bary(o)]).sort(([a, ba], [b, bb]) => {
      if (ba !== bb) return ba === Infinity ? 1 : bb === Infinity ? -1 : ba - bb;
      return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
    }).forEach(([o]) => {
      ypos[o.id] = y;
      pos[o.id] = st.mapPos[o.id] ?? {x: 24 + d * MAP_STEP, y};
      y += mapH(o) + 24;
    });
  });
  return {list, edges, pos};
}

/* Right-angled routes, one per relation. Each end gets its own connection point on the box side it leaves from:
   the points on a side are spread evenly and follow the order of the boxes at the other end, so lines do not fan out
   from one spot. Lines that share a gap between two columns (or two stacked rows) get separate lanes in that gap,
   so their runs stay apart. The label sits at the end that has the port. */
export function mapRoutes(L){
  const items = L.edges.map(r => {
    const pa = L.pos[r.from], pb = L.pos[r.to];
    if (pa.x + MAP_W < pb.x) return {r, pa, pb, sa: 'R', sb: 'L', across: true};
    if (pb.x + MAP_W < pa.x) return {r, pa, pb, sa: 'L', sb: 'R', across: true};
    return pa.y < pb.y ? {r, pa, pb, sa: 'B', sb: 'T', across: false} : {r, pa, pb, sa: 'T', sb: 'B', across: false};
  });
  const h = mapH(), sides = {};
  items.forEach((it, i) => {
    (sides[it.r.from + '|' + it.sa] ??= []).push({i, end: 'a', side: it.sa, id: it.r.from, o: it.pb});
    (sides[it.r.to + '|' + it.sb] ??= []).push({i, end: 'b', side: it.sb, id: it.r.to, o: it.pa});
  });
  const pt = {};
  Object.values(sides).forEach(group => {
    group.sort((p, q) => p.o.y - q.o.y || p.o.x - q.o.x);
    const p0 = L.pos[group[0].id];
    group.forEach((g, k) => {
      const f = (k + 0.5) / group.length;
      const across = 16 + (MAP_W - 32) * f, down = 28 + (h - 38) * f;
      pt[g.i + g.end] = g.side === 'R' ? {x: p0.x + MAP_W, y: p0.y + down}
        : g.side === 'L' ? {x: p0.x, y: p0.y + down}
        : g.side === 'T' ? {x: p0.x + across, y: p0.y}
        : {x: p0.x + across, y: p0.y + h};
    });
  });
  /* Lanes: the channel between two columns (or two rows), shared by every line that crosses it. */
  const gaps = {};
  items.forEach((it, i) => {
    const A = pt[i + 'a'], B = pt[i + 'b'];
    const key = it.across ? 'x' + Math.min(it.pa.x, it.pb.x) + '_' + Math.max(it.pa.x, it.pb.x) : 'y' + it.pa.x + '_' + Math.min(it.pa.y, it.pb.y) + '_' + Math.max(it.pa.y, it.pb.y);
    const g = gaps[key] ??= it.across
      ? {from: Math.min(it.pa.x, it.pb.x) + MAP_W, to: Math.max(it.pa.x, it.pb.x), list: []}
      : {from: Math.min(it.pa.y, it.pb.y) + h, to: Math.max(it.pa.y, it.pb.y), list: []};
    g.list.push({i, mid: it.across ? (A.y + B.y) / 2 : (A.x + B.x) / 2});
  });
  const lane = {};
  Object.values(gaps).forEach(g => {
    g.list.sort((p, q) => p.mid - q.mid);
    g.list.forEach((e, k) => lane[e.i] = g.from + (g.to - g.from) * (k + 1) / (g.list.length + 1));
  });
  return items.map((it, i) => {
    const A = pt[i + 'a'], B = pt[i + 'b'];
    const d = it.across ? `M${A.x} ${A.y}H${lane[i]}V${B.y}H${B.x}` : `M${A.x} ${A.y}V${lane[i]}H${B.x}V${B.y}`;
    const lx = it.sb === 'L' ? B.x - 6 : B.x + 6, ly = it.sb === 'B' ? B.y + 12 : B.y - 5;
    return {d, A, B, lx, ly, anchor: it.sb === 'L' ? 'end' : 'start'};
  });
}
export const MAP_SHORT = {attached:'attached', connected:'connected', patched:'patched', uplink:'uplink', downlink:'downlink', docked:'docked', hosted:'hosted'};

/* The drawing as SVG markup. The same markup is used on screen and in the export.
   Line labels are hidden until a line is hovered, or until Labels is switched on. */
export function mapInner(L){
  const routes = mapRoutes(L);
  const edges = L.edges.map((r, i) => {
    const a = byId(r.from), b = byId(r.to), p = routes[i];
    const label = MAP_SHORT[r.kind] + (r.port != null ? ' · ' + portLabel(b, r.port) : '');
    return `<g class="mline" data-from="${a.id}" data-to="${b.id}">
      <path class="mhit" d="${p.d}" fill="none" stroke="transparent" stroke-width="10"/>
      <path d="${p.d}" fill="none" stroke="var(--line)" stroke-width="1.4"/>
      <circle cx="${p.A.x}" cy="${p.A.y}" r="3" fill="var(--line)"/><circle cx="${p.B.x}" cy="${p.B.y}" r="3" fill="var(--line)"/>
      <text class="mlab" x="${p.lx}" y="${p.ly}" text-anchor="${p.anchor}" font-size="10" font-family="var(--mono)" fill="var(--muted)" stroke="var(--bg)" stroke-width="3" paint-order="stroke">${esc(label)}</text></g>`;
  }).join('');
  const nodes = L.list.map(o => {
    const p = L.pos[o.id], h = mapH(o), lines = mapLines(o), c = tcol(o.type);
    return `<g class="mnode${MAP.found === o.id ? ' found' : ''}" data-id="${o.id}" transform="translate(${p.x} ${p.y})">
      <rect width="${MAP_W}" height="${h}" rx="5" fill="var(--bg)" stroke="var(--bd)"/>
      <rect width="${MAP_W}" height="20" rx="5" fill="${c}"/><rect y="12" width="${MAP_W}" height="8" fill="${c}"/>
      <text x="8" y="14" font-size="10" font-family="var(--mono)" fill="#fff">${esc(o.code)}</text>
      <text x="8" y="36" font-size="13" font-weight="600" font-family="var(--mono)" fill="var(--fg)">${esc(o.name)}</text>
      ${lines.map((t, i) => `<text x="8" y="${52 + i * 15}" font-size="11" fill="var(--muted)">${esc(t)}</text>`).join('')}
      ${o.status !== 'active' ? `<text x="${MAP_W - 8}" y="14" text-anchor="end" font-size="10" fill="#fff">${esc(STATUS[o.status].label)}</text>` : ''}
    </g>`;
  }).join('');
  return `<g class="medges">${edges}</g><g class="mnodes">${nodes}</g>`;
}
/* Key for the map: which colour is which type, and what a line label says. */
export function mapLegend(L){
  const types = [...new Set(L.list.map(o => o.type))];
  return `<details class="maplegend" aria-label="Map key"><summary>Legend</summary><div class="lgbody">
    <b>Boxes</b><div class="lgtypes">${types.map(t => `<span>${tico(t, 'tico sm')}${esc(TYPES[t].label)}</span>`).join('')}</div>
    <b>Lines</b><div class="lgtext">Label: how the two are linked, and the port at the far end. Hover a box to light up its links, or a line to read its label. The chain runs left to right from the top.</div></div></details>`;
}
export function mapApply(){ const g = $('#mapG'); if (g) g.setAttribute('transform', `translate(${MAP.px} ${MAP.py}) scale(${MAP.zoom})`); }
export function mapBox(L){
  const xs = L.list.map(o => L.pos[o.id].x), ys = L.list.map(o => L.pos[o.id].y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const x1 = Math.max(...L.list.map(o => L.pos[o.id].x + MAP_W)), y1 = Math.max(...L.list.map(o => L.pos[o.id].y + mapH(o)));
  return {x0, y0, x1, y1};
}
export function mapFit(){
  const L = MAP.L; if (!L || !L.list.length || !$('#mapSvg')) return;
  const svg = $('#mapSvg'), W = svg.clientWidth, H = svg.clientHeight, b = mapBox(L);
  const z = Math.min((W - 60) / (b.x1 - b.x0), (H - 60) / (b.y1 - b.y0), 1.2);
  MAP.zoom = z; MAP.px = (W - (b.x0 + b.x1) * z) / 2; MAP.py = (H - (b.y0 + b.y1) * z) / 2; mapApply();
}
export function mapHighlight(id){
  const svg = $('#mapSvg'); if (!svg) return;
  if (!id){ svg.classList.remove('focus'); svg.querySelectorAll('.hi').forEach(e => e.classList.remove('hi')); return; }
  const nb = new Set([id]);
  svg.querySelectorAll('.mline').forEach(l => { const hit = l.dataset.from === id || l.dataset.to === id; l.classList.toggle('hi', hit); if (hit){ nb.add(l.dataset.from); nb.add(l.dataset.to); } });
  svg.querySelectorAll('.mnode').forEach(n => n.classList.toggle('hi', nb.has(n.dataset.id)));
  svg.classList.add('focus');
}
export function mapExportSvg(){
  const L = MAP.L, b = mapBox(L), pad = 20, w = b.x1 - b.x0 + 2 * pad, h = b.y1 - b.y0 + 2 * pad;
  const shifted = {...L, pos: Object.fromEntries(Object.entries(L.pos).map(([k,p]) => [k, {x: p.x - b.x0 + pad, y: p.y - b.y0 + pad}]))};
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="system-ui, sans-serif">${mapInner(shifted)}</svg>`;
  const cs = getComputedStyle(document.documentElement);
  return s.replace(/var\((--[\w-]+)\)/g, (m, n) => cs.getPropertyValue(n).trim() || '#888');
}

export function renderMap(){
  /* Showing one object's relations: that object and the objects linked to it directly, and nothing else. */
  const focus = st.mapFocus && byId(st.mapFocus) ? byId(st.mapFocus) : null;
  if (st.mapFocus && !focus) st.mapFocus = null;
  const around = focus ? new Set([focus.id, ...rels.filter(r => r.from === focus.id || r.to === focus.id).flatMap(r => [r.from, r.to])]) : null;
  const nodes = around ? objs.filter(o => around.has(o.id)) : filtered();
  const withRelations = objs.filter(o => rels.some(r => r.from === o.id || r.to === o.id)).sort((a, b) => a.name.localeCompare(b.name));
  $('#toolbar').innerHTML = `<span class="muted" id="mapCount"></span><span class="tbsep"></span>
    <label class="muted" for="mapFocus">Relations of</label>
    <select id="mapFocus" aria-label="Show only the relations of this object"><option value="">All objects</option>${withRelations.map(o => `<option value="${o.id}" ${focus && focus.id === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
    <label class="pchk"><input type="checkbox" id="mapOnly" ${st.mapOnly?'checked':''}> Only objects with relations</label>
    <label class="pchk"><input type="checkbox" id="mapLabels" ${st.mapLabels?'checked':''}> Labels</label>
    <input id="mapFind" type="search" placeholder="Find object…" style="width:200px" value="${esc(st.mapFind)}" aria-label="Find object">
    <button id="mapFitBtn">Fit</button><button id="mapReset">Reset layout</button><div class="grow"></div>
    <button id="mapExport">Export SVG</button>`;
  MAP.L = mapLayout(nodes);
  if (!MAP.L.list.length){
    $('#mapCount').textContent = '0 objects';
    $('#view').innerHTML = '<div class="empty">Nothing to draw. Objects with relations appear here. Untick "Only objects with relations", or link two objects on an object page.</div>';
    return;
  }
  $('#mapCount').textContent = MAP.L.list.length + ' objects · ' + MAP.L.edges.length + ' relations';
  $('#view').innerHTML = `<div class="mapwrap"><svg id="mapSvg" role="img" aria-label="Relationship map"><g id="mapG">${mapInner(MAP.L)}</g></svg>
    <div class="maphint">Drag a box to move it · drag the background to pan · Ctrl + wheel to zoom · click a box to open it</div>${mapLegend(MAP.L)}</div>`;
  const svg = $('#mapSvg');
  svg.addEventListener('pointerdown', e => {
    const n = e.target.closest('.mnode');
    MAP.drag = n ? {id: n.dataset.id, sx: e.clientX, sy: e.clientY, ox: MAP.L.pos[n.dataset.id].x, oy: MAP.L.pos[n.dataset.id].y, moved: false}
                 : {pan: true, sx: e.clientX, sy: e.clientY, ox: MAP.px, oy: MAP.py, moved: false};
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', e => {
    const d = MAP.drag;
    if (!d){ const n = e.target.closest('.mnode'); mapHighlight(n ? n.dataset.id : null); return; }
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (!d.moved) return;
    if (d.pan){ MAP.px = d.ox + dx; MAP.py = d.oy + dy; mapApply(); return; }
    st.mapPos[d.id] = {x: d.ox + dx / MAP.zoom, y: d.oy + dy / MAP.zoom};
    MAP.L = mapLayout(filtered()); $('#mapG').innerHTML = mapInner(MAP.L);
    mapHighlight(d.id);
  });
  svg.addEventListener('pointerup', () => { const d = MAP.drag; MAP.drag = null; if (d && !d.pan && !d.moved) openObj(d.id); });
  svg.addEventListener('pointerleave', () => { if (!MAP.drag) mapHighlight(null); });
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    if (!e.ctrlKey){ MAP.px -= e.deltaX; MAP.py -= e.deltaY; mapApply(); return; }
    const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const z0 = MAP.zoom, z1 = Math.min(2.5, Math.max(0.3, z0 * (e.deltaY < 0 ? 1.1 : 0.91)));
    MAP.px = mx - (mx - MAP.px) * (z1 / z0); MAP.py = my - (my - MAP.py) * (z1 / z0); MAP.zoom = z1; mapApply();
  }, {passive: false});
  $('#mapOnly').onchange = e => { st.mapOnly = e.target.checked; render(); };
  $('#mapFocus').onchange = e => { st.mapFocus = e.target.value || null; MAP.found = null; render(); };
  $('#mapLabels').onchange = e => { st.mapLabels = e.target.checked; svg.classList.toggle('labels', st.mapLabels); };
  svg.classList.toggle('labels', st.mapLabels);
  $('#mapFind').addEventListener('input', e => {
    st.mapFind = e.target.value;
    const t = st.mapFind.trim().toLowerCase();
    const hit = t && MAP.L.list.find(o => (o.code + ' ' + o.name).toLowerCase().includes(t));
    MAP.found = hit ? hit.id : null;
    svg.querySelectorAll('.mnode').forEach(n => n.classList.toggle('found', n.dataset.id === MAP.found));
    if (hit){ const p = MAP.L.pos[hit.id], W = svg.clientWidth, H = svg.clientHeight;
      MAP.px = W / 2 - (p.x + MAP_W / 2) * MAP.zoom; MAP.py = H / 2 - (p.y + mapH(hit) / 2) * MAP.zoom; mapApply(); }
  });
  $('#mapFitBtn').onclick = mapFit;
  $('#mapReset').onclick = () => { st.mapPos = {}; render(); mapFit(); };
  $('#mapExport').onclick = () => {
    const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + mapExportSvg()], {type: 'image/svg+xml'});
    const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: 'relationships.svg'});
    document.body.appendChild(a); a.click(); a.remove(); toast('Exported relationships.svg');
  };
  mapApply();
  requestAnimationFrame(mapFit);
  setTimeout(mapFit, 60);
}
window.addEventListener('resize', () => { if (st.tab === 'map' && MAP.L) mapFit(); });

/* ---------- switch ports ---------- */
export function renderNet(){
  const sws = objs.filter(o => PORTED.includes(o.type));
  if (!sws.length){ $('#toolbar').innerHTML = ''; $('#view').innerHTML = '<div class="empty">No devices with ports yet. Add a switch, router, firewall or physical server to see its ports.</div>'; return; }
  const sw = byId(st.netSw) || sws[0];
  $('#toolbar').innerHTML = `<label class="muted" for="swSel">Device</label><select id="swSel">${sws.map(s => `<option value="${s.id}">${esc(s.name)} · ${esc(s.loc.split(' / ')[0])}</option>`).join('')}</select>
    <span class="muted hide-n">${esc(sw.model)} · ${esc(sw.ip)}</span><div class="grow"></div><button id="swOpen">Open device</button>`;
  $('#swSel').value = sw.id;
  $('#swSel').onchange = e => { st.netSw = e.target.value; st.netPort = null; render(); };
  $('#swOpen').onclick = () => openObj(sw.id);
  const onPort = p => rels.filter(r => r.to === sw.id && r.port === p);
  const outPort = () => null; // a relation's port belongs to its far end, so every port here is an incoming one
  const portBtn = p => {
    const inc = onPort(p), up = outPort(p);
    const dev = inc[0] ? byId(inc[0].from) : up ? byId(up.to) : null;
    const isUp = !!up || (inc[0] && isUplink(inc[0].kind));
    const poe = dev && (dev.type === 'sip');
    const tip = pfxOf(sw) + p + (dev ? ' → ' + dev.name : ' · free');
    return `<button class="port ${dev?(isUp?'upl':'used'):''} ${poe?'poe':''} ${st.netPort===p?'sel':''}" data-port="${p}" title="${esc(tip)}" aria-label="${esc(tip)}">${p}</button>`;
  };
  const groups = []; for (let g = 0; g < (sw.ports || 0); g += 12){ const ps = []; for (let p = g+1; p <= Math.min(g+12, sw.ports || 0); p++) ps.push(p); groups.push(ps); }
  const sfps = []; for (let p = (sw.ports || 0)+1; p <= (sw.ports || 0)+(sw.sfp || 0); p++) sfps.push(p);
  const usedN = rels.filter(r => r.to === sw.id && typeof r.port === 'number').length + rels.filter(r => r.from === sw.id && typeof r.port === 'number').length;

  /* Everything plugged into the switch, with what hangs behind each device (a PC behind a phone, monitors behind a PC). */
  const behind = (o, depth=0) => rels.filter(r => r.to === o.id && !isUplink(r.kind)).map(r => { const d = byId(r.from); return {d, r, depth, kids: depth < 3 ? behind(d, depth+1) : []}; });
  const flat = (arr, out=[]) => { arr.forEach(x => { out.push(x); flat(x.kids, out); }); return out; };
  const rows = [];
  for (let p = 1; p <= (sw.ports || 0) + (sw.sfp || 0); p++){
    onPort(p).forEach(r => { const d = byId(r.from); rows.push({p, d, r, sub: flat(behind(d))}); });
  }
  const portDetail = st.netPort != null ? rows.filter(x => x.p === st.netPort) : [];

  $('#view').innerHTML = `<div id="net">
    ${!sw.ports && !sw.sfp ? `<p class="note">No ports yet. Set the port count in the details of ${esc(sw.name)}.</p>` : ''}
    <div class="panelbox"><div class="hdr">Front panel <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${usedN} of ${(sw.ports || 0) + (sw.sfp || 0)} ports in use</span></div>
      <div class="face"><div class="chassis"><span class="model">${esc(sw.name)}</span>
        <div class="pgroups">${groups.map(g => `<div class="pgroup">${g.map(portBtn).join('')}</div>`).join('')}<div class="pgroup sfp">${sfps.map(portBtn).join('')}</div></div></div></div>
      <div class="legend"><span><i></i>Free</span><span><i style="background:var(--used);border-color:var(--used)"></i>Device</span><span><i style="background:var(--upl);border-color:var(--upl)"></i>Uplink / trunk</span><span><i style="position:relative;background:var(--port)"><b style="position:absolute;top:1px;right:1px;width:5px;height:5px;border-radius:50%;background:var(--poe)"></b></i>PoE powered</span>${((sw.sfp || 0) || 0) ? `<span>Ports ${(sw.ports || 0)+1}–${(sw.ports || 0)+(sw.sfp || 0)} are SFP+</span>` : ''}</div>
    </div>
    ${st.netPort != null ? `<div class="panelbox"><div class="hdr">Port ${esc(pfxOf(sw) + st.netPort)}</div>${portDetail.length ? portDetail.map(x => `<div class="path">${[{o:x.d}, ...x.sub.map(s => ({o:s.d}))].map(n => `<button class="node" data-open="${n.o.id}">${tico(n.o.type,'tico sm')}${esc(n.o.name)}</button>`).join('<span class="edge">behind</span>')}</div>`).join('') : `<div class="path"><span class="muted">Port is free.</span><button id="assignBtn">Plug a device in…</button></div>`}</div>` : ''}
    <div class="panelbox"><div class="hdr">Port map</div><div style="overflow-x:auto"><table class="grid mini"><thead><tr><th>Port</th><th>Device</th><th>Type</th><th>VLAN</th><th>Behind it</th></tr></thead><tbody>
      ${rows.map(x => `<tr><td class="n">${esc(pfxOf(sw) + x.p)}</td><td class="n"><a class="link" data-open="${x.d.id}">${esc(x.d.name)}</a></td><td>${isUplink(x.r.kind) ? (x.r.kind === 'downlink' ? 'Downlink' : 'Uplink') : TYPES[x.d.type].short}</td><td>${esc(x.r.vlan || (isUplink(x.r.kind) ? 'Trunk' : ''))}</td>
        <td>${x.sub.map(s => `<a class="link mono" data-open="${s.d.id}">${esc(s.d.name)}</a>`).join(', ')}</td></tr>`).join('')}
    </tbody></table></div></div></div>`;
  $('#view').querySelectorAll('.port').forEach(b => b.onclick = () => { st.netPort = +b.dataset.port; render(); });
  const ab = $('#assignBtn'); if (ab) ab.onclick = () => newObjModal({sw: sw.id, port: st.netPort});
}

