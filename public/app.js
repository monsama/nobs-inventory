/* ---------- icons ---------- */
const ICON = {
  pc:'<path d="M3 4h18v12H3z"/><path d="M8 20h8M12 16v4"/>',
  server:'<rect x="3" y="3" width="18" height="7" rx="1"/><rect x="3" y="14" width="18" height="7" rx="1"/><path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6"/>',
  sip:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 5h8v5H8z"/><path d="M9 14h.01M12 14h.01M15 14h.01M9 17h.01M12 17h.01M15 17h.01"/>',
  tablet:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M11 18h2"/>',
  monitor:'<rect x="2" y="3" width="20" height="13" rx="1"/><path d="M9 21h6M12 16v5"/>',
  switch:'<rect x="2" y="7" width="20" height="10" rx="1"/><path d="M6 11h1M9 11h1M12 11h1M15 11h1M6 14h1M9 14h1M12 14h1M15 14h1M19 12h.01"/>',
  printer:'<path d="M6 9V2h12v7"/><rect x="2" y="9" width="20" height="8" rx="1"/><path d="M6 14h12v8H6z"/>',
  patch:'<rect x="2" y="8" width="20" height="8" rx="1"/><path d="M5 11h.01M8 11h.01M11 11h.01M14 11h.01M17 11h.01M5 14h.01M8 14h.01M11 14h.01M14 14h.01M17 14h.01"/>',
  router:'<rect x="2" y="13" width="20" height="6" rx="1"/><path d="M6 13V7M12 13V4M18 13V9"/><path d="M5 16h.01M8 16h.01"/>',
  firewall:'<path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5z"/><path d="M9 12h6"/>',
  nas:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M7 6h.01M7 12h.01M7 18h.01"/>',
  ups:'<rect x="3" y="5" width="16" height="14" rx="2"/><path d="M19 9h2v6h-2M11 8l-2 5h4l-2 4"/>',
  accesspoint:'<path d="M5 12a7 7 0 0 1 14 0"/><path d="M8.5 12a3.5 3.5 0 0 1 7 0"/><circle cx="12" cy="14" r="1.2"/><path d="M12 15.5V21"/>',
  camera:'<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3"/>',
  laptop:'<rect x="4" y="5" width="16" height="11" rx="1"/><path d="M2 19h20"/>',
  mobile:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  scanner:'<rect x="2" y="9" width="20" height="8" rx="1"/><path d="M6 9V4h12v5M6 17v3h12v-3"/>',
  projector:'<rect x="2" y="7" width="16" height="10" rx="2"/><path d="M18 10l4-2v8l-4-2M6 10h.01"/>',
  storage:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  modem:'<rect x="3" y="12" width="18" height="7" rx="1"/><path d="M7 12V5M12 19v2M16 15h.01M19 15h.01"/>',
  other:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 12h8"/>'
};
const svg = (t, cls='i') => {
  const T = TYPES[t] || {};
  if (T.icon === 'custom' && T.svgInner) return `<svg class="${cls} cu" viewBox="${T.svgView}">${T.svgInner}</svg>`;
  return `<svg class="${cls}" viewBox="0 0 24 24">${ICON[T.icon] || ICON.other}</svg>`;
};

/* ---------- reference data ---------- */
/* Object types are data: name, short name, colour and icon. Edited in Settings → Object types. */
const TYPES = {
  pc:{label:'PC / Notebook', short:'PC', color:'#1565c0', icon:'pc'},
  server:{label:'Server', short:'Server', color:'#6a3fb5', icon:'server'},
  sip:{label:'SIP phone', short:'SIP phone', color:'#15803d', icon:'sip'},
  tablet:{label:'Tablet', short:'Tablet', color:'#db2777', icon:'tablet'},
  monitor:{label:'Monitor', short:'Monitor', color:'#64748b', icon:'monitor'},
  switch:{label:'Switch', short:'Switch', color:'#ea580c', icon:'switch'},
  printer:{label:'Printer', short:'Printer', color:'#a16207', icon:'printer'},
  patch:{label:'Patch panel', short:'Patch', color:'#0f766e', icon:'patch'},
  router:{label:'Router', short:'Router', color:'#1e3a8a', icon:'router'},
  firewall:{label:'Firewall', short:'Firewall', color:'#b91c1c', icon:'firewall'},
  modem:{label:'Modem', short:'Modem', color:'#78716c', icon:'modem'},
  storage:{label:'Storage', short:'Storage', color:'#0891b2', icon:'storage'},
  smartphone:{label:'Smartphone', short:'Phone', color:'#65a30d', icon:'mobile'},
  other:{label:'Other', short:'Other', color:'#5a6b7d', icon:'other'}
};
/* Built-in types the rest of the app relies on: they can be renamed and recoloured, not deleted. */
/* A copy of the built-in types, used when a server has none saved yet. */
const DEFAULT_TYPES = JSON.parse(JSON.stringify(TYPES));
const BUILTIN = ['pc','server','sip','tablet','monitor','switch','printer','patch','other'];
const STATUS = {active:{label:'In use',cls:'ok'}, stock:{label:'In stock',cls:''}, repair:{label:'In repair',cls:'warn'}, retired:{label:'Retired',cls:'bad'}};
const LOCS = [];
let RACKS = [];
const FIELD_LABEL = {ip:'IP address', mac:'MAC address', os:'Operating system', model:'Model', cpu:'CPU', ram:'Memory', fw:'Firmware', user:'User', loc:'Location', status:'Status'};
const SYNC_TIME = '21.10.2026 06:00';
/* A relation always reads from -> to: "MON-0412 attached to ZH-PC-0142". The port belongs to the "to" end. */
const KINDS = {
  attached:{fwd:'attached to', rev:'has attached'},
  connected:{fwd:'connected to', rev:'connects'},
  patched:{fwd:'patched to', rev:'patched from'},
  uplink:{fwd:'uplink to', rev:'downlink from'},
  downlink:{fwd:'downlink to', rev:'uplink from'},
  docked:{fwd:'docked at', rev:'docks'},
  hosted:{fwd:'hosted on', rev:'hosts'}
};
const KIND_TARGETS = {attached:['pc','tablet','server'], connected:['switch','sip','patch'], patched:['patch'], uplink:['switch','firewall','router'], downlink:['switch'], docked:['monitor','pc'], hosted:['server']};

/* ---------- ids ----------
   Every object has its own code (INV-0001). A feed reference (the Lansweeper asset ID) is only a link to the feed. */
let seq = 100, codeN = 0;
const nextCode = () => 'INV-' + String(++codeN).padStart(4, '0');
const F = (ref, seen) => ({sys:'Lansweeper', ref, seen});
const O = (type, name, f) => ({id:'o'+(++seq), code:nextCode(), type, name, status:'active', feed:null, ovr:{}, ...f});

const objs = [];
const byName = n => objs.find(o => o.name === n);
const byId = id => objs.find(o => o.id === id);

let rseq = 0;
const rels = [];
const history = {};
const hist = (o, t, msg) => (history[o.id] ??= []).unshift({t, msg});

/* ---------- state ----------
   policy: which fields the feed may overwrite by default. Name and serial number are match keys, never overwritten.
   Each object can override these on its own page (o.ovr). */
const st = {type:null, loc:null, status:null, q:'', tab:'cards', open:[], tabIds:['cards','table','map','net','rack','sw'], swSel:null, cardsGroup:'none', netSw:null, netPort:3,
  rackId:null, setTab:'feed', feedOn:true, feedSync:true, mapOnly:true, mapLabels:false, mapFind:'', mapPos:{},
  policy:{ip:true, mac:true, os:true, model:true, cpu:true, ram:true, fw:true, user:false, loc:false, status:false},
  ldap:{url:'', bindDn:'', base:'', filter:'', group:'', nightly:true, disable:true, last:null}};
let APP_VERSION = '';
try { const t = localStorage.getItem('ni-theme'); if (t) document.documentElement.dataset.theme = t; } catch(e) {}

/* The feed owns a field when the object is linked, it has not overridden the field, and the default allows it. */
const feedOwns = (o, k, linked = !!o.feed) => !!(st.feedOn && linked && (k in o.ovr ? o.ovr[k] : st.policy[k]));

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tcol = t => TYPES[t]?.color || '#888';
const tico = (t, cls='tico') => `<span class="${cls}" role="img" aria-label="${esc(TYPES[t]?.label || t)}" style="background:${tcol(t)}">${svg(t)}</span>`;
const fmtVal = (k, v) => k === 'status' ? (STATUS[v]?.label ?? v) : (v ?? '');
const pad2 = n => String(n).padStart(2, '0');
const portLabel = (target, p) => {
  if (p == null) return '';
  if (typeof p === 'number' && target.type === 'switch') return target.pfx + p;
  return String(p);
};
const relsOf = o => rels.filter(r => r.from === o.id || r.to === o.id).map(r => {
  const out = r.from === o.id;
  const other = byId(out ? r.to : r.from);
  return {r, out, other, label: out ? KINDS[r.kind].fwd : KINDS[r.kind].rev, port: portLabel(byId(r.to), r.port)};
});
const now = () => { const d = new Date(); return `${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2800); }
const used = o => rels.filter(r => r.to === o.id && r.port != null).length;
const isUplink = k => k === 'uplink' || k === 'downlink';

function filtered(){
  const q = st.q.trim().toLowerCase();
  return objs.filter(o => (!st.type || o.type === st.type) && (!st.loc || o.loc.startsWith(st.loc)) && (!st.status || o.status === st.status)
    && (!q || [o.code,o.name,o.ip,o.mac,o.serial,o.user,o.model,o.ext].some(v => v && String(v).toLowerCase().includes(q))));
}

/* The way up from a device to the core: follow outgoing relations. */
function pathUp(o){
  const chain = [{o}]; const seen = new Set([o.id]); let cur = o;
  for (let i = 0; i < 8; i++){
    const r = rels.find(r => r.from === cur.id && r.kind !== 'downlink' && !seen.has(r.to));
    if (!r) break;
    const nx = byId(r.to); chain.push({o:nx, via:r}); seen.add(nx.id); cur = nx;
  }
  return chain;
}

/* ---------- sidebar ---------- */
function renderSide(){
  const cnt = f => objs.filter(f).length;
  $('#typeList').innerHTML =
    `<button class="item ${!st.type?'sel':''}" data-type=""><span class="lbl">All objects</span><span class="cnt">${objs.length}</span></button>` +
    Object.entries(TYPES).map(([k,v]) => `<button class="item ${st.type===k?'sel':''}" data-type="${k}">${tico(k,'tico sm')}<span class="lbl">${v.label}</span><span class="cnt">${cnt(o=>o.type===k)}</span></button>`).join('');
  const sites = [...new Set(LOCS.map(l => l.split(' / ')[0]))];
  $('#locList').innerHTML = sites.map(s => `<button class="item ${st.loc===s?'sel':''}" data-loc="${esc(s)}"><span class="lbl">${esc(s)}</span><span class="cnt">${cnt(o=>o.loc.startsWith(s))}</span></button>` +
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
$('#clearF').onclick = () => { st.type = st.loc = st.status = null; st.q = ''; $('#search').value = ''; render(); };
$('#sideBtn').onclick = () => document.body.classList.toggle('side-open');

/* ---------- tabs ---------- */
/* Tabs: the views and the open objects, in one row that can be reordered by dragging, as in NOBS SQL. */
const FIXED_TABS = {cards:'Cards', table:'Table', map:'Relationships', net:'Switch ports', rack:'Racks', sw:'Software'};
function renderTabs(){
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
  });
}
/* Moved the way NOBS SQL does it: after the target when moving right, before it when moving left. */
function reorderTabs(src, tgt){
  const arr = st.tabIds, a = arr.indexOf(src), b = arr.indexOf(tgt);
  if (a < 0 || b < 0) return;
  arr.splice(a, 1);
  const nb = arr.indexOf(tgt);
  arr.splice(a < b ? nb + 1 : nb, 0, src);
  render();
}
function closeObjTab(id){
  st.open = st.open.filter(x => x !== id); st.tabIds = st.tabIds.filter(x => x !== id);
  if (st.tab === id) st.tab = 'cards';
  render();
}
$('#tabsbar').addEventListener('click', e => {
  const c = e.target.closest('[data-close]');
  if (c){ closeObjTab(c.dataset.close); return; }
  const t = e.target.closest('[data-tab]'); if (t){ st.tab = t.dataset.tab; render(); }
});
function openObj(id){ if (!st.open.includes(id)){ st.open.push(id); st.tabIds.push(id); } st.tab = id; render(); const v = $('#view'); if (v) v.scrollTop = 0; }

/* ---------- cards ---------- */
function cardHtml(o){
  const rs = relsOf(o);
  const lines = [];
  if (o.ip) lines.push(['IP', `<span class="mono">${esc(o.ip)}</span>`]);
  if (o.type === 'sip') lines.push(['Extension', `<span class="mono">${esc(o.ext)}</span>`]);
  else if (o.mac) lines.push(['MAC', `<span class="mono">${esc(o.mac)}</span>`]);
  if (o.type === 'server') lines.push(['Kind', o.kind === 'vm' ? 'Virtual machine' : 'Physical']);
  if (o.type === 'storage') lines.push(['Capacity', `${esc(o.cap)} · ${esc(o.proto)}`]);
  if (o.type === 'switch') lines.push(['Ports', `${o.ports} + ${o.sfp} SFP · ${used(o)} used`]);
  else if (o.type === 'patch') lines.push(['Ports', `${o.ports} · ${used(o)} used`]);
  else if (o.type === 'monitor') lines.push(['Serial', `<span class="mono">${esc(o.serial)}</span>`]);
  lines.push(['Location', esc(o.loc.replace(' / ', ' · '))]);
  if (o.user) lines.push(['User', esc(o.user)]);
  const s = STATUS[o.status];
  const shown = rs.slice(0, 3);
  return `<button class="card" data-open="${o.id}">
    <div class="ch">${tico(o.type)}<div class="hd"><span class="nm">${esc(o.name)}</span><span class="model">${esc(o.model)}</span></div>
      ${o.status !== 'active' ? `<span class="chip ${s.cls}">${s.label}</span>` : ''}</div>
    <dl class="kv">${lines.map(([k,v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <div class="rels">${shown.length ? shown.map(x => `<div class="r"><span class="k">${x.out?'→':'←'} ${x.label}</span><span class="t">${esc(x.other.name)}</span>${x.port && x.out ? `<span class="p">${esc(x.port)}</span>` : ''}</div>`).join('') : '<span class="none">No relations yet</span>'}
      ${rs.length > 3 ? `<div class="r"><span class="k">+ ${rs.length-3} more</span></div>` : ''}</div>
    <div class="cf"><span class="code">${esc(o.code)}</span>${o.feed ? '<span class="dot" title="Kept in sync from feed"></span>' : ''}<span class="grow"></span>${rs.length} relations</div>
  </button>`;
}
function renderCardsBody(){
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

function renderCards(){ renderCardsBody(); addSearchHits(); }
/* When the search matches a person or a place, those come first as buttons. */
function addSearchHits(){
  const q = st.q.trim().toLowerCase(); if (!q) return;
  const people = USERS.filter(u => [u.name, u.login, u.dept].some(v => v && v.toLowerCase().includes(q)));
  const locs = LOCS.filter(l => l.toLowerCase().includes(q));
  if (!people.length && !locs.length) return;
  $('#view').insertAdjacentHTML('afterbegin', `<div class="hits">${people.map(u => `<button class="chip info" data-person="${esc(u.name)}">${esc(u.name)} · ${devicesOf(u.name)} devices</button>`).join('')}${locs.map(l => `<button class="chip ls" data-loc="${esc(l)}">${esc(l)}</button>`).join('')}</div>`);
  $('#view').querySelectorAll('[data-person]').forEach(b => b.onclick = () => showDevicesOf(b.dataset.person));
  $('#view').querySelectorAll('[data-loc]').forEach(b => b.onclick = () => { st.loc = b.dataset.loc; st.q = ''; $('#search').value = ''; render(); });
}

/* ---------- table ---------- */
function renderTable(){
  const list = filtered();
  st.bulk ??= new Set();
  st.bulk = new Set([...st.bulk].filter(id => objs.some(o => o.id === id)));
  const n = st.bulk.size;
  $('#toolbar').innerHTML = `<span class="muted">${list.length} rows</span><span class="tbsep"></span>
    ${n ? `<b>${n} selected</b><select id="bkLoc" aria-label="Move selected to location"><option value="">Move to location…</option>${LOCS.map(l => `<option>${esc(l)}</option>`).join('')}</select><select id="bkStatus" aria-label="Set status of selected"><option value="">Set status…</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select><button id="bkClear">Clear selection</button><span class="tbsep"></span>` : ''}
    <button id="csvBtn"><svg class="i" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg>Export CSV</button><button id="csvImp">Import CSV…</button>`;
  $('#csvBtn').onclick = () => exportCsv(list);
  $('#csvImp').onclick = importCsvModal;
  const bk = $('#bkLoc'); if (bk) bk.onchange = () => { if (!bk.value) return; st.bulk.forEach(id => { const o = byId(id); o.loc = bk.value; hist(o, now(), 'Moved to ' + bk.value + ' (bulk)'); }); toast(n + ' moved to ' + bk.value); renderTable(); render(); };
  const bs = $('#bkStatus'); if (bs) bs.onchange = () => { if (!bs.value) return; st.bulk.forEach(id => { const o = byId(id); o.status = bs.value; hist(o, now(), 'Status set to ' + STATUS[bs.value].label + ' (bulk)'); }); toast(n + ' set to ' + STATUS[bs.value].label); renderTable(); render(); };
  const bc = $('#bkClear'); if (bc) bc.onclick = () => { st.bulk.clear(); renderTable(); };
  $('#view').innerHTML = `<div class="gridwrap"><table class="grid"><thead><tr>
    <th style="width:30px"><input type="checkbox" id="selAll" aria-label="Select all shown rows" style="height:auto"></th>
    <th>Code</th><th>Name</th><th>Type</th><th>Model</th><th>IP</th><th>MAC</th><th>Serial</th><th>Location</th><th>Rack</th><th>User</th><th>Connected to</th><th>Status</th><th>Fed</th></tr></thead><tbody>
    ${list.map(o => { const up = rels.find(r => r.from === o.id && (r.kind === 'connected' || r.kind === 'uplink' || r.kind === 'patched')); const t = up && byId(up.to);
      const rk = o.rack && o.u != null ? rackOf(o.rack).name + ' · U' + o.u : '';
      return `<tr data-open="${o.id}"><td><input type="checkbox" data-sel="${o.id}" ${st.bulk.has(o.id) ? 'checked' : ''} aria-label="Select ${esc(o.name)}" style="height:auto"></td>
      <td class="code">${esc(o.code)}</td><td class="n"><b>${esc(o.name)}</b></td><td><span class="tdot"><span class="tsw" style="background:${tcol(o.type)}"></span>${TYPES[o.type].short}</span></td>
      <td>${esc(o.model)}</td><td class="n">${esc(o.ip||'')}</td><td class="n">${esc(o.mac||'')}</td><td class="n">${esc(o.serial)}</td><td>${esc(o.loc)}</td><td class="n">${esc(rk)}</td><td>${esc(o.user||'')}</td>
      <td class="n">${t ? esc(t.name) + (up.port!=null ? ' · ' + esc(portLabel(t, up.port)) : '') : ''}</td><td>${STATUS[o.status].label}</td><td>${o.feed ? '<span class="dot" title="Kept in sync from feed"></span>' : '—'}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  const selBox = el => el.addEventListener('click', e => e.stopPropagation());
  $('#view').querySelectorAll('[data-sel]').forEach(c => { selBox(c); c.onchange = () => { c.checked ? st.bulk.add(c.dataset.sel) : st.bulk.delete(c.dataset.sel); renderTable(); }; });
  const all = $('#selAll'); selBox(all);
  all.onchange = () => { $('#view').querySelectorAll('[data-sel]').forEach(c => all.checked ? st.bulk.add(c.dataset.sel) : st.bulk.delete(c.dataset.sel)); renderTable(); };
}

/* CSV: a plain comma or semicolon file, first row is the header. */
function parseCsv(text){
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
const csvCell = v => { const t = String(v ?? ''); return /[",;\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
function exportCsv(list){
  const head = ['code','name','type','model','serial','ip','mac','location','user','status'];
  const lines = [head.join(',')].concat(list.map(o => [o.code, o.name, TYPES[o.type].label, o.model, o.serial, o.ip, o.mac, o.loc, o.user, STATUS[o.status].label].map(csvCell).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], {type: 'text/csv'});
  const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: 'inventory.csv'});
  document.body.appendChild(a); a.click(); a.remove();
  toast('Exported ' + list.length + ' rows');
}
function importCsvModal(){
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
    const seen = new Set(objs.map(o => o.name.toLowerCase()));
    parsed = rows.slice(1).map((r, i) => {
      const g = k => col(k) >= 0 ? (r[col(k)] || '').trim() : '';
      const name = g('name'), tv = g('type').toLowerCase(), loc = g('location');
      const tKey = Object.keys(TYPES).find(k => k === tv || TYPES[k].label.toLowerCase() === tv);
      const errs = [];
      if (!name) errs.push('no name');
      else if (seen.has(name.toLowerCase())) errs.push('name already exists');
      if (!tKey) errs.push('unknown type');
      if (loc && !LOCS.includes(loc)) errs.push('unknown location');
      if (name) seen.add(name.toLowerCase());
      return {line: i + 2, name, type: tKey, loc: loc || LOCS[0], model: g('model'), serial: g('serial'), ip: g('ip'), mac: g('mac'), user: g('user'), errs};
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
const MAP = {zoom:1, px:24, py:24, drag:null, L:null, found:null};
const MAP_W = 200, MAP_STEP = 340;
const mapLines = o => [o.model, o.ip || o.user || (o.ext ? 'Ext ' + o.ext : ''), o.type === 'patch' ? o.ports + ' ports · ' + used(o) + ' used' : o.type === 'storage' ? o.cap + ' · ' + o.proto : o.kind === 'vm' ? 'Virtual machine' : ''].filter(Boolean);
/* Every box has the same height, so the rows line up across a column. */
const mapH = () => 91;

function mapLayout(nodes){
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

/* Right-angled route from a to b: sideways when the boxes are apart, down or up when they are stacked.
   lane moves the vertical part so lines that share a gap do not sit on top of each other. */
function mapRoute(pa, ha, pb, hb, lane){
  if (pa.x + MAP_W < pb.x){ const x1 = pa.x + MAP_W, y1 = pa.y + 20, x2 = pb.x, y2 = pb.y + 20, mx = (x1 + x2) / 2 + lane; return {d:`M${x1} ${y1}H${mx}V${y2}H${x2}`, x1, y1, x2, y2, lx: x1 + 6, ly: y1 - 5}; }
  if (pb.x + MAP_W < pa.x){ const x1 = pa.x, y1 = pa.y + 20, x2 = pb.x + MAP_W, y2 = pb.y + 20, mx = (x1 + x2) / 2 - lane; return {d:`M${x1} ${y1}H${mx}V${y2}H${x2}`, x1, y1, x2, y2, lx: x1 - 6, ly: y1 - 5}; }
  const x1 = pa.x + MAP_W / 2, x2 = pb.x + MAP_W / 2;
  if (pa.y < pb.y){ const y1 = pa.y + ha, y2 = pb.y, my = (y1 + y2) / 2 + lane; return {d:`M${x1} ${y1}V${my}H${x2}V${y2}`, x1, y1, x2, y2, lx: x1 + 6, ly: my - 5}; }
  const y1 = pa.y, y2 = pb.y + hb, my = (y1 + y2) / 2 + lane; return {d:`M${x1} ${y1}V${my}H${x2}V${y2}`, x1, y1, x2, y2, lx: x1 + 6, ly: my - 5};
}
const MAP_SHORT = {attached:'attached', connected:'connected', patched:'patched', uplink:'uplink', downlink:'downlink', docked:'docked', hosted:'hosted'};

/* The drawing as SVG markup. The same markup is used on screen and in the export.
   Line labels are hidden until a box is hovered, or until Labels is switched on. */
function mapInner(L){
  const lanes = {};
  const edges = L.edges.map(r => {
    const a = byId(r.from), b = byId(r.to), pa = L.pos[a.id], pb = L.pos[b.id];
    lanes[pa.x] = (lanes[pa.x] || 0) + 1;
    const lane = ((lanes[pa.x] % 5) - 2) * 9;
    const p = mapRoute(pa, mapH(a), pb, mapH(b), lane);
    const label = MAP_SHORT[r.kind] + (r.port != null ? ' · ' + portLabel(b, r.port) : '');
    return `<g class="mline" data-from="${a.id}" data-to="${b.id}">
      <path d="${p.d}" fill="none" stroke="var(--line)" stroke-width="1.4"/>
      <circle cx="${p.x1}" cy="${p.y1}" r="3" fill="var(--line)"/><circle cx="${p.x2}" cy="${p.y2}" r="3" fill="var(--line)"/>
      <text class="mlab" x="${p.lx}" y="${p.ly}" font-size="10" font-family="var(--mono)" fill="var(--muted)" stroke="var(--bg)" stroke-width="3" paint-order="stroke">${esc(label)}</text></g>`;
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
function mapLegend(L){
  const types = [...new Set(L.list.map(o => o.type))];
  return `<div class="maplegend" aria-label="Map key">
    <b>Boxes</b><div class="lgtypes">${types.map(t => `<span>${tico(t, 'tico sm')}${esc(TYPES[t].label)}</span>`).join('')}</div>
    <b>Lines</b><div class="lgtext">Label: how the two are linked, and the port at the far end. Hover a box to light up its links. The chain runs left to right from the top.</div></div>`;
}
function mapApply(){ const g = $('#mapG'); if (g) g.setAttribute('transform', `translate(${MAP.px} ${MAP.py}) scale(${MAP.zoom})`); }
function mapBox(L){
  const xs = L.list.map(o => L.pos[o.id].x), ys = L.list.map(o => L.pos[o.id].y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const x1 = Math.max(...L.list.map(o => L.pos[o.id].x + MAP_W)), y1 = Math.max(...L.list.map(o => L.pos[o.id].y + mapH(o)));
  return {x0, y0, x1, y1};
}
function mapFit(){
  const L = MAP.L; if (!L || !L.list.length || !$('#mapSvg')) return;
  const svg = $('#mapSvg'), W = svg.clientWidth, H = svg.clientHeight, b = mapBox(L);
  const z = Math.min((W - 60) / (b.x1 - b.x0), (H - 60) / (b.y1 - b.y0), 1.2);
  MAP.zoom = z; MAP.px = (W - (b.x0 + b.x1) * z) / 2; MAP.py = (H - (b.y0 + b.y1) * z) / 2; mapApply();
}
function mapHighlight(id){
  const svg = $('#mapSvg'); if (!svg) return;
  if (!id){ svg.classList.remove('focus'); svg.querySelectorAll('.hi').forEach(e => e.classList.remove('hi')); return; }
  const nb = new Set([id]);
  svg.querySelectorAll('.mline').forEach(l => { const hit = l.dataset.from === id || l.dataset.to === id; l.classList.toggle('hi', hit); if (hit){ nb.add(l.dataset.from); nb.add(l.dataset.to); } });
  svg.querySelectorAll('.mnode').forEach(n => n.classList.toggle('hi', nb.has(n.dataset.id)));
  svg.classList.add('focus');
}
function mapExportSvg(){
  const L = MAP.L, b = mapBox(L), pad = 20, w = b.x1 - b.x0 + 2 * pad, h = b.y1 - b.y0 + 2 * pad;
  const shifted = {...L, pos: Object.fromEntries(Object.entries(L.pos).map(([k,p]) => [k, {x: p.x - b.x0 + pad, y: p.y - b.y0 + pad}]))};
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="system-ui, sans-serif">${mapInner(shifted)}</svg>`;
  const cs = getComputedStyle(document.documentElement);
  return s.replace(/var\((--[\w-]+)\)/g, (m, n) => cs.getPropertyValue(n).trim() || '#888');
}

function renderMap(){
  const nodes = filtered();
  $('#toolbar').innerHTML = `<span class="muted" id="mapCount"></span><span class="tbsep"></span>
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
function renderNet(){
  const sws = objs.filter(o => o.type === 'switch');
  if (!sws.length){ $('#toolbar').innerHTML = ''; $('#view').innerHTML = '<div class="empty">No switches yet. Add a switch object to see its ports.</div>'; return; }
  const sw = byId(st.netSw) || sws[0];
  $('#toolbar').innerHTML = `<label class="muted" for="swSel">Switch</label><select id="swSel">${sws.map(s => `<option value="${s.id}">${esc(s.name)} · ${esc(s.loc.split(' / ')[0])}</option>`).join('')}</select>
    <span class="muted hide-n">${esc(sw.model)} · ${esc(sw.ip)}</span><div class="grow"></div><button id="swOpen">Open switch</button>`;
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
    const tip = sw.pfx + p + (dev ? ' → ' + dev.name : ' · free');
    return `<button class="port ${dev?(isUp?'upl':'used'):''} ${poe?'poe':''} ${st.netPort===p?'sel':''}" data-port="${p}" title="${esc(tip)}" aria-label="${esc(tip)}">${p}</button>`;
  };
  const groups = []; for (let g = 0; g < sw.ports; g += 12){ const ps = []; for (let p = g+1; p <= g+12; p++) ps.push(p); groups.push(ps); }
  const sfps = []; for (let p = sw.ports+1; p <= sw.ports+sw.sfp; p++) sfps.push(p);
  const usedN = rels.filter(r => r.to === sw.id && typeof r.port === 'number').length + rels.filter(r => r.from === sw.id && typeof r.port === 'number').length;

  /* Everything plugged into the switch, with what hangs behind each device (a PC behind a phone, monitors behind a PC). */
  const behind = (o, depth=0) => rels.filter(r => r.to === o.id && !isUplink(r.kind)).map(r => { const d = byId(r.from); return {d, r, depth, kids: depth < 3 ? behind(d, depth+1) : []}; });
  const flat = (arr, out=[]) => { arr.forEach(x => { out.push(x); flat(x.kids, out); }); return out; };
  const rows = [];
  for (let p = 1; p <= sw.ports + sw.sfp; p++){
    onPort(p).forEach(r => { const d = byId(r.from); rows.push({p, d, r, sub: flat(behind(d))}); });
  }
  const portDetail = st.netPort != null ? rows.filter(x => x.p === st.netPort) : [];

  $('#view').innerHTML = `<div id="net">
    <div class="panelbox"><div class="hdr">Front panel <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${usedN} of ${sw.ports + sw.sfp} ports in use</span></div>
      <div class="face"><div class="chassis"><span class="model">${esc(sw.name)}</span>
        <div class="pgroups">${groups.map(g => `<div class="pgroup">${g.map(portBtn).join('')}</div>`).join('')}<div class="pgroup sfp">${sfps.map(portBtn).join('')}</div></div></div></div>
      <div class="legend"><span><i></i>Free</span><span><i style="background:var(--used);border-color:var(--used)"></i>Device</span><span><i style="background:var(--upl);border-color:var(--upl)"></i>Uplink / trunk</span><span><i style="position:relative;background:var(--port)"><b style="position:absolute;top:1px;right:1px;width:5px;height:5px;border-radius:50%;background:var(--poe)"></b></i>PoE powered</span><span>Ports ${sw.ports+1}–${sw.ports+sw.sfp} are SFP+</span></div>
    </div>
    ${st.netPort != null ? `<div class="panelbox"><div class="hdr">Port ${esc(sw.pfx + st.netPort)}</div>${portDetail.length ? portDetail.map(x => `<div class="path">${[{o:x.d}, ...x.sub.map(s => ({o:s.d}))].map(n => `<button class="node" data-open="${n.o.id}">${tico(n.o.type,'tico sm')}${esc(n.o.name)}</button>`).join('<span class="edge">behind</span>')}</div>`).join('') : `<div class="path"><span class="muted">Port is free.</span><button id="assignBtn">Plug a device in…</button></div>`}</div>` : ''}
    <div class="panelbox"><div class="hdr">Port map</div><div style="overflow-x:auto"><table class="grid mini"><thead><tr><th>Port</th><th>Device</th><th>Type</th><th>VLAN</th><th>Behind it</th></tr></thead><tbody>
      ${rows.map(x => `<tr><td class="n">${esc(sw.pfx + x.p)}</td><td class="n"><a class="link" data-open="${x.d.id}">${esc(x.d.name)}</a></td><td>${isUplink(x.r.kind) ? (x.r.kind === 'downlink' ? 'Downlink' : 'Uplink') : TYPES[x.d.type].short}</td><td>${esc(x.r.vlan || (isUplink(x.r.kind) ? 'Trunk' : ''))}</td>
        <td>${x.sub.map(s => `<a class="link mono" data-open="${s.d.id}">${esc(s.d.name)}</a>`).join(', ')}</td></tr>`).join('')}
    </tbody></table></div></div></div>`;
  $('#view').querySelectorAll('.port').forEach(b => b.onclick = () => { st.netPort = +b.dataset.port; render(); });
  const ab = $('#assignBtn'); if (ab) ab.onclick = () => newObjModal({sw: sw.id, port: st.netPort});
}

/* ---------- racks ---------- */
function renderRack(){
  const R_ = RACKS.find(r => r.id === st.rackId) || RACKS[0];
  if (!R_){ $('#toolbar').innerHTML = ''; $('#view').innerHTML = '<div class="empty">No racks yet.</div>'; return; }
  st.rackId = R_.id;   /* the rack on screen is the one Mount uses */
  const inRack = objs.filter(o => o.rack === R_.id);
  const slotted = inRack.filter(o => o.u != null && !o.ontop);
  $('#toolbar').innerHTML = `<label class="muted" for="rkSel">Rack</label><select id="rkSel">${RACKS.map(r => `<option value="${r.id}" ${r.id===R_.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select>
    <span class="muted hide-n">${esc(R_.loc)} · ${R_.units}U · ${slotted.reduce((n,o) => n + (o.h||1), 0)} of ${R_.units} U used</span><div class="grow"></div>
    <button id="rkMount">Mount device…</button>`;
  $('#rkSel').onchange = e => { st.rackId = e.target.value; render(); };
  $('#rkMount').onclick = mountModal;
  const rows = [];
  let u = R_.units;
  const cells = [];
  for (let n = R_.units; n >= 1; n--){
    const top = inRack.find(o => o.u + (o.h || 1) - 1 === n);
    if (top){
      const h = top.h || 1, sitting = objs.filter(x => x.ontop === top.id);
      const sub = top.type === 'patch' ? top.ports + ' ports · ' + used(top) + ' used' : top.type === 'switch' ? top.ports + '+' + top.sfp + ' ports · ' + used(top) + ' used' : top.type === 'storage' ? top.cap + ' · ' + top.proto : top.model;
      cells.push(`<div class="unit${h === 1 ? ' one' : ''}" data-open="${top.id}" style="grid-row:${R_.units - n + 1} / span ${h};--c:${tcol(top.type)}" title="${esc(top.name)}">
        <span class="nm">${esc(top.name)}</span><span class="sub">${esc(top.code)} · ${esc(sub)}${sitting.length ? ' · on top: ' + sitting.map(x => esc(x.name)).join(', ') : ''}</span></div>`);
      n -= h - 1;
    }
  }
  for (let n = R_.units; n >= 1; n--){
    const row = R_.units - n + 1;
    const occupied = inRack.some(o => n >= o.u && n <= o.u + (o.h || 1) - 1);
    cells.push(`<div class="uno" style="grid-row:${row};grid-column:1">U${n}</div>`);
    if (!occupied) cells.push(`<div class="slot" style="grid-row:${row};grid-column:2"></div>`);
  }
  $('#view').innerHTML = `<div class="rackbox">
    <div class="rack" style="grid-template-rows:repeat(${R_.units},24px)">${cells.join('')}</div>
    <div class="rackside">
      <div class="panelbox"><div class="hdr">${esc(R_.name)}</div>
        <dl class="lsbox"><dt>Location</dt><dd style="font-family:inherit">${esc(R_.loc)}</dd><dt>Height</dt><dd>${R_.units} U</dd><dt>Devices</dt><dd>${inRack.length}</dd></dl>
        <div class="addrel" style="flex-direction:column;align-items:stretch">${inRack.slice().sort((a,b) => (b.u||0) - (a.u||0)).map(o => `<button class="item" data-open="${o.id}" style="height:auto;padding:4px 6px"><span class="sw" style="background:${tcol(o.type)}"></span><span class="lbl mono">${o.ontop ? 'on ' + esc(byId(o.ontop).name) : 'U' + o.u + (o.h>1 ? '–' + (o.u+o.h-1) : '')}  ${esc(o.name)}</span></button>`).join('') || '<span class="muted">No devices in this rack yet. Use Mount device… above.</span>'}</div>
      </div>
    </div></div>`;
}

/* ---------- object page ---------- */
const FIELDS = {
  base:[['name','Name','mono'],['model','Model'],['serial','Serial number','mono'],['loc','Location','loc'],['status','Status','status'],['user','User / owner','user']],
  net:[['ip','IP address','mono'],['mac','MAC address','mono']],
  pc:[['os','Operating system']], server:[['kind','Kind','kind'],['os','Operating system'],['cpu','CPU'],['ram','Memory']],
  sip:[['ext','Extension','mono'],['fw','Firmware','mono']], tablet:[['os','Operating system']],
  switch:[['os','Firmware'],['ports','Copper ports','mono'],['sfp','SFP ports','mono'],['pfx','Port naming','mono']],
  patch:[['ports','Ports','mono']], storage:[['cap','Capacity','mono'],['proto','Protocol','mono']],
  monitor:[], printer:[], smartphone:[], other:[]
};
function fieldHtml(o, [k, label, kind]){
  const id = 'f_' + o.id + '_' + k;
  let ctl;
  if (kind === 'loc') ctl = `<select id="${id}" data-k="${k}">${LOCS.map(l => `<option ${l===o.loc?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
  else if (kind === 'kind') ctl = `<select id="${id}" data-k="${k}"><option value="physical" ${o.kind!=='vm'?'selected':''}>Physical</option><option value="vm" ${o.kind==='vm'?'selected':''}>Virtual machine</option></select>`;
  else if (kind === 'user') ctl = `<select id="${id}" data-k="user"><option value="">Nobody</option>${USERS.map(u => `<option value="${u.id}" ${u.id===o.uid?'selected':''}>${esc(u.name)}</option>`).join('')}</select>`;
  else if (kind === 'status') ctl = `<select id="${id}" data-k="${k}">${Object.entries(STATUS).map(([s,v]) => `<option value="${s}" ${s===o.status?'selected':''}>${v.label}</option>`).join('')}</select>`;
  else ctl = `<input id="${id}" data-k="${k}" class="${kind==='mono'?'mono':''}" value="${esc(o[k] ?? '')}">`;
  return `<label for="${id}">${label}</label>${ctl}`;
}
/* Feed panel: link state, and per field whether the feed may overwrite it for this object. */
function feedPanel(o){
  if (!st.feedOn && o.feed) return `<div class="panelbox"><div class="hdr">Feed</div><dl class="lsbox"><dt>Feed</dt><dd style="font-family:inherit">Disconnected. Values are kept as entered.</dd></dl><div class="addrel"><button id="linkFeed">Connect a feed…</button></div></div>`;
  if (!o.feed) return `<div class="panelbox"><div class="hdr">Feed</div>
    <dl class="lsbox"><dt>Source</dt><dd style="font-family:inherit">Entered by hand</dd></dl>
    <div class="addrel"><button id="linkFeed">Link to a feed record…</button></div></div>`;
  const keys = Object.keys(FIELD_LABEL).filter(k => o[k] !== undefined);
  return `<div class="panelbox"><div class="hdr">Feed <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${esc(o.feed.sys)} · ${esc(o.feed.ref)}</span></div>
    <dl class="lsbox"><dt>Matched by</dt><dd style="font-family:inherit">Serial number</dd><dt>Last seen</dt><dd style="font-family:inherit">${esc(o.feed.seen)}</dd><dt>Sync</dt><dd style="font-family:inherit">${st.feedSync ? 'Nightly at 06:00' : 'Manual only'}</dd></dl>
    <table class="grid mini" style="min-width:0"><thead><tr><th>Field</th><th>Value</th><th style="width:150px">Take from feed</th></tr></thead><tbody>
      ${keys.map(k => `<tr><td>${FIELD_LABEL[k]}</td><td class="mono" style="white-space:normal">${esc(fmtVal(k, o[k]))}</td><td><label class="pchk"><input type="checkbox" data-ovr="${k}" ${feedOwns(o,k)?'checked':''}> ${k in o.ovr ? 'override' : '<span class="muted">default</span>'}</label></td></tr>`).join('')}
    </tbody></table>
    <div class="addrel"><span class="note" style="flex:1">Unchecked fields keep the value you set here. Name and serial number are never overwritten.</span><button id="detachFeed">Detach</button></div></div>`;
}
const SW_TYPES = ['pc','server'];
function softwarePanel(o){
  const list = o.software || [];
  return `<div class="panelbox"><div class="hdr">Software <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${list.length} installed</span></div>
    <div style="overflow-x:auto"><table class="grid mini" style="min-width:0"><thead><tr><th>Name</th><th>Version</th><th></th></tr></thead><tbody>
    ${list.map((p, i) => `<tr><td>${esc(p.name)}</td><td class="mono">${esc(p.version || '')}</td><td><button class="icon ghost" data-swdel="${i}" aria-label="Remove ${esc(p.name)}">×</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted">Nothing recorded.</td></tr>'}
    </tbody></table></div>
    <div class="addrel"><input id="swName" placeholder="Name, e.g. Google Chrome" style="flex:1;min-width:140px" aria-label="Software name"><input id="swVer" placeholder="Version" style="width:110px" aria-label="Version"><button id="swAdd">Add</button></div></div>`;
}
function bindSoftware(o){
  $('#view').querySelectorAll('[data-swdel]').forEach(b => b.onclick = () => {
    const p = o.software.splice(+b.dataset.swdel, 1)[0]; hist(o, now(), 'Software removed: ' + p.name); render();
  });
  const add = $('#swAdd'); if (!add) return;
  add.onclick = () => {
    const name = $('#swName').value.trim();
    if (!name){ toast('Give the software a name.'); return; }
    o.software = [...(o.software || []), {name, version: $('#swVer').value.trim()}];
    hist(o, now(), 'Software added: ' + name); render();
  };
}
/* Every package across the PCs and servers; pick one to list where it is installed. */
function renderSoftware(){
  const map = {};
  objs.forEach(o => (o.software || []).forEach(p => {
    (map[p.name] ??= {name: p.name, versions: new Set(), devices: []});
    map[p.name].versions.add(p.version || '—'); map[p.name].devices.push(o);
  }));
  const rows = Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  const sel = rows.find(r => r.name === st.swSel);
  $('#toolbar').innerHTML = `<span class="muted">${rows.length} packages · ${objs.filter(o => (o.software || []).length).length} devices</span><div class="grow"></div><span class="muted hide-n">Add software on a PC or server</span>`;
  $('#view').innerHTML = rows.length ? `<div class="gridwrap" style="height:auto"><table class="grid"><thead><tr><th>Package</th><th>Versions</th><th>Devices</th></tr></thead><tbody>
    ${rows.map(r => `<tr data-sw="${esc(r.name)}" ${sel && sel.name === r.name ? 'style="background:var(--hover)"' : ''}><td><b>${esc(r.name)}</b></td><td class="mono">${esc([...r.versions].join(', '))}</td><td class="n">${r.devices.length}</td></tr>`).join('')}
    </tbody></table></div>
    ${sel ? `<div class="panelbox" style="margin:12px"><div class="hdr">${esc(sel.name)} is installed on</div><div class="path">${sel.devices.map(d => `<button class="node" data-open="${d.id}">${tico(d.type, 'tico sm')}${esc(d.name)}</button>`).join('')}</div></div>` : ''}`
    : '<div class="empty">No software recorded yet. Add it on a PC or server.</div>';
  $('#view').querySelectorAll('[data-sw]').forEach(tr => tr.onclick = () => { st.swSel = st.swSel === tr.dataset.sw ? null : tr.dataset.sw; render(); });
}
/* A patch panel's ports, with the device on each one and the trunk into the switch. */
function patchPanel(o){
  const ports = [];
  for (let n = 1; n <= o.ports; n++){
    const label = 'P' + pad2(n);
    const r = rels.find(r => r.to === o.id && r.port === label);
    ports.push(`<div class="${r ? 'used' : ''}" title="${label}">${label}${r ? `<b>${esc(byId(r.from).name)}</b>` : ''}</div>`);
  }
  const trunk = rels.find(r => r.from === o.id && r.kind === 'connected');
  return `<div class="panelbox"><div class="hdr">Ports <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${used(o)} of ${o.ports} in use${trunk ? ' · trunk to ' + esc(byId(trunk.to).name) + ' port ' + esc(portLabel(byId(trunk.to), trunk.port)) : ''}</span></div>
    <div class="pp">${ports.join('')}</div></div>`;
}
function renderObj(o){
  const rs = relsOf(o);
  const fields = [...FIELDS.base, ...(o.type === 'monitor' ? [] : FIELDS.net), ...(FIELDS[o.type] || [])];
  const chain = pathUp(o);
  const targets = objs.filter(x => x.id !== o.id);
  const rk = o.rack ? RACKS.find(r => r.id === o.rack) : null;
  $('#toolbar').innerHTML = `${tico(o.type)}<b class="mono">${esc(o.name)}</b><span class="code">${esc(o.code)}</span><span class="muted hide-n">${TYPES[o.type].label}</span>
    <span class="chip ${STATUS[o.status].cls}">${STATUS[o.status].label}</span><div class="grow"></div>
    <details class="menu"><summary>More</summary><div class="menubox"><button id="dupBtn">Duplicate</button><button id="delBtn">Retire…</button></div></details><button id="saveBtn" class="primary" disabled>Save</button>`;
  $('#view').innerHTML = `<div class="obj">
    <div class="col">
      <div class="panelbox"><div class="hdr">Properties</div><div class="form">${fields.map(f => fieldHtml(o, f)).join('')}
        ${rackFields(o)}
        <label for="f_${o.id}_notes">Notes</label><textarea id="f_${o.id}_notes" data-k="notes" rows="3" placeholder="Anything that is not in a field: warranty, purchase order, quirks…">${esc(o.notes||'')}</textarea></div></div>
      ${feedPanel(o)}
    </div>
    <div class="col">
      ${o.type === 'patch' ? patchPanel(o) : ''}
      ${SW_TYPES.includes(o.type) ? softwarePanel(o) : ''}
      <div class="panelbox"><div class="hdr">Relations <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${rs.length}</span></div>
        <div class="relist">${rs.length ? rs.map(x => `<div class="relrow"><span class="k">${x.label}</span><span class="t">${tico(x.other.type,'tico sm')}<a class="link" data-open="${x.other.id}">${esc(x.other.name)}</a>${x.port ? `<span class="p">${x.out ? '' : 'on '}${esc(x.port)}</span>` : ''}${x.r.vlan ? `<span class="chip">VLAN ${esc(x.r.vlan)}</span>` : ''}</span><button class="icon ghost" data-delrel="${x.r.id}" title="Remove relation" aria-label="Remove relation">×</button></div>`).join('') : '<div class="relrow muted">No relations yet. Add one below.</div>'}</div>
        <div class="addrel"><select id="arKind" aria-label="Relation"></select>
          <select id="arTo" aria-label="Target" style="flex:1"></select>
          <input id="arPort" placeholder="Port" style="width:90px" aria-label="Port"><button id="arAdd">Add</button></div>
      </div>
      <div class="panelbox"><div class="hdr">Path to the network</div>
        <div class="chain">${chain.length > 1 ? chain.map((n, i) => (i ? `<div class="hop"><span class="arrow">↑</span>${esc(KINDS[n.via.kind].fwd)}${n.via.port!=null ? ` <b class="mono">${esc(portLabel(n.o, n.via.port))}</b>` : ''}</div>` : '') + `<button class="node ${i===0?'me':''}" data-open="${n.o.id}">${tico(n.o.type,'tico sm')}${esc(n.o.name)}</button>`).join('') : '<span class="muted">This object does not hang off anything.</span>'}</div>
      </div>
      <div class="panelbox"><div class="hdr">History</div><ul class="hist">${(history[o.id]||[]).map(h => `<li><time>${esc(h.t)}</time><span>${esc(h.msg)}</span></li>`).join('')}</ul></div>
    </div></div>`;

  bindSoftware(o);
  const objView = $('#view').querySelector('.obj');
  const dirty = () => { $('#saveBtn').disabled = false; };
  objView.addEventListener('input', dirty); objView.addEventListener('change', dirty);
  $('#view').querySelectorAll('.obj .panelbox > .hdr').forEach(h => {
    h.classList.add('sechdr'); h.setAttribute('role', 'button'); h.tabIndex = 0; h.setAttribute('aria-expanded', 'true');
    const toggle = () => { const c = h.parentNode.classList.toggle('collapsed'); h.setAttribute('aria-expanded', String(!c)); };
    h.addEventListener('click', e => { if (!e.target.closest('button,input,select,a,label')) toggle(); });
    h.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === h){ e.preventDefault(); toggle(); } });
  });
  /* The relation kind decides which objects are offered as targets: a monitor attaches to a PC, a device is patched to a panel. */
  const fitTargets = () => {
    const k = $('#arKind').value;
    $('#arTo').innerHTML = targets.filter(t => KIND_TARGETS[k].includes(t.type) && (k !== 'hosted' || t.kind !== 'vm')).map(t => `<option value="${t.id}">${esc(t.name)} (${TYPES[t.type].short})</option>`).join('');
    $('#arPort').placeholder = k === 'connected' || k === 'uplink' ? 'Port no.' : k === 'patched' ? 'Panel port, e.g. P04' : 'Port (opt.)';
  };
  $('#arKind').innerHTML = Object.entries(KINDS).map(([k,v]) => `<option value="${k}">${v.fwd}</option>`).join('');
  $('#arKind').value = o.type === 'monitor' ? 'attached' : 'connected'; fitTargets();
  $('#arKind').onchange = fitTargets;
  $('#arAdd').onclick = () => {
    const to = byId($('#arTo').value); if (!to) return;
    let port = $('#arPort').value.trim(); if (/^\d+$/.test(port) && to.type === 'switch') port = +port;
    if (to.type === 'switch' && typeof port === 'number' && rels.some(r => r.to === to.id && r.port === port)){ toast(to.pfx + port + ' on ' + to.name + ' is already taken. Pick a free port.'); return; }
    if (to.type === 'patch' && rels.some(r => r.to === to.id && r.port === port.toUpperCase())){ toast(port.toUpperCase() + ' on ' + to.name + ' is already taken.'); return; }
    const k = $('#arKind').value;
    const finalPort = port === '' ? null : (to.type === 'patch' ? port.toUpperCase() : port);
    if (rels.some(r => r.from === o.id && r.to === to.id && r.kind === k && String(r.port) === String(finalPort))){ toast('That relation already exists.'); return; }
    if (finalPort != null && rels.some(r => r.to === to.id && String(r.port) === String(finalPort) && (to.type === 'switch' || to.type === 'patch'))){ toast(`${finalPort} on ${to.name} is already taken.`); return; }
    rels.push({id:'r'+(++rseq), from:o.id, to:to.id, kind:k, port:finalPort, vlan:null});
    hist(o, now(), `Relation "${KINDS[k].fwd} ${to.name}" added by v.ljuca`);
    toast('Relation added'); render();
  };
  $('#view').querySelectorAll('[data-delrel]').forEach(b => b.onclick = () => { const i = rels.findIndex(r => r.id === b.dataset.delrel); rels.splice(i, 1); toast('Relation removed'); render(); });
  $('#view').querySelectorAll('[data-ovr]').forEach(c => c.onchange = () => {
    const k = c.dataset.ovr;
    o.ovr[k] = c.checked;
    hist(o, now(), `${FIELD_LABEL[k]}: ${c.checked ? 'taken from feed' : 'kept as set here'} (object override)`);
    toast(`${FIELD_LABEL[k]} ${c.checked ? 'follows the feed' : 'is kept as set here'}`); render();
  });
  $('#saveBtn').onclick = () => {
    const rkEl = k => { const e = $('#view').querySelector(`[data-rk="${k}"]`); return e ? e.value : null; };
    let place = null;
    if (rkEl('rack') !== null){
      const top = rkEl('ontop'), rackId = rkEl('rack'), u = +rkEl('u'), h = +rkEl('h') || 1;
      if (top){ place = {ontop: top, rack: byId(top).rack}; }
      else if (rackId){
        const err = rackCheck(rackId, u, h, o.id);
        if (err){ toast(err); return; }
        place = {rack: rackId, u, h};
      } else place = {};
    }
    const kept = [];
    $('#view').querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k; let v = el.value;
      if (k === 'user'){ o.uid = v || null; return; }
      if (['ports','sfp'].includes(k)) v = +v || 0;
      if (o.feed && FIELD_LABEL[k] && o[k] !== v){ o.ovr[k] = false; kept.push(FIELD_LABEL[k]); }
      o[k] = v;
    });
    if (place){
      delete o.rack; delete o.u; delete o.h; delete o.ontop;
      Object.assign(o, place);
      if (place.ontop) delete o.u;
    }
    if (o.type === 'server' && o.kind === 'vm') delete o.rack, delete o.u, delete o.h, delete o.ontop;
    hist(o, now(), 'Saved by v.ljuca' + (kept.length ? ' · kept from feed: ' + kept.join(', ') : ''));
    toast('Saved ' + o.name + (kept.length ? '. Kept from feed: ' + kept.join(', ') : '')); render();
  };
  $('#dupBtn').onclick = () => newObjModal({copy: o});
  $('#delBtn').onclick = () => { o.status = 'retired'; hist(o, now(), 'Retired by v.ljuca'); toast(o.name + ' marked as retired. It stays in the inventory for the record.'); render(); };
  const lf = $('#linkFeed'); if (lf) lf.onclick = () => feedModal(1, o);
  const df = $('#detachFeed'); if (df) df.onclick = () => { o.feed = null; hist(o, now(), 'Detached from feed by v.ljuca'); toast(o.name + ' is now a manual object'); render(); };
}

/* ---------- modals ---------- */
function modal(html, cls=''){
  $('#modalHost').innerHTML = `<div class="modal" id="mdl"><div class="box ${cls}" role="dialog" aria-modal="true">${html}</div></div>`;
  if (!/locked/.test(cls)) $('#mdl').addEventListener('mousedown', e => { if (e.target.id === 'mdl') closeModal(); });
  bindPolicy($('#mdl'));
  const first = $('#mdl').querySelector('input, select, textarea, button'); if (first) first.focus();
  applyRole();
}
const closeModal = () => $('#modalHost').innerHTML = '';
document.addEventListener('keydown', e => {
  if (!$('#mdl')) return;
  if (e.key === 'Escape' && $('#mdl .locked')) return;
  if (e.key === 'Escape' && !$('#mdl .locked')) closeModal();
  if (e.key !== 'Tab') return;
  const f = [...$('#mdl .box').querySelectorAll('button:not([disabled]), input:not([disabled]), select, textarea')];
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
});

/* The field policy as checkboxes. Same state in Settings and in the feed wizard. */
const policyGrid = () => `<div class="pgrid">${Object.keys(FIELD_LABEL).map(k => `<label class="pchk"><input type="checkbox" data-pol="${k}" ${st.policy[k]?'checked':''}> ${FIELD_LABEL[k]}</label>`).join('')}</div>`;
function bindPolicy(root){
  root.querySelectorAll('[data-pol]').forEach(c => c.onchange = () => { st.policy[c.dataset.pol] = c.checked; render(); });
}

/* ---------- settings ---------- */
/* ---------- settings: tabs, as in NOBS SQL ---------- */
const SET_TABS = [['feed','Feed'],['locations','Locations'],['types','Object types'],['users','Users'],['ldap','LDAP sync'],['policy','Feed fields'],['about','About']];
function openSettings(){
  modal(`<div class="mh">Settings</div>
    <div class="settabs" id="setTabs">${SET_TABS.map(([k,l]) => `<button class="tab" data-st="${k}">${l}</button>`).join('')}</div>
    <div class="mb" id="setPane"></div>
    <div class="mf"><button id="setReset" style="margin-right:auto">${SERVER.on ? 'Clear inventory' : 'Reset demo data'}</button><button id="setClose" class="primary">Done</button></div>`, 'settings');
  $('#setTabs').addEventListener('click', e => { const t = e.target.closest('[data-st]'); if (!t) return; st.setTab = t.dataset.st; renderSetPane(); });
  $('#setClose').onclick = () => { closeModal(); render(); };
  let armed = false;
  $('#setReset').onclick = e => { if (!armed){ armed = true; e.target.textContent = 'Click again to clear'; return; } resetDemo(); };
  renderSetPane();
}
function renderSetPane(){
  document.querySelectorAll('#setTabs [data-st]').forEach(b => b.classList.toggle('active', b.dataset.st === st.setTab));
  const pane = $('#setPane');
  const html = {
    feed: '<div class="panelbox" id="setFeed"></div>',
    locations: '<div class="panelbox"><div class="hdr">Locations</div><div id="setLocs"></div></div>',
    types: '<div class="panelbox"><div class="hdr">Object types</div><div id="setTypes"></div></div>',
    users: '<div id="setUsers"></div>',
    ldap: '<div id="setLdap"></div>',
    policy: `<div class="panelbox"><div class="hdr">Feed may overwrite</div>${policyGrid()}<p class="note" style="padding:0 12px 10px">Default for every object. Each object can override it on its own page. Name and serial number are match keys and are never overwritten.</p></div>`,
    about: '<div id="setAbout"></div>'
  }[st.setTab];
  pane.innerHTML = html;
  bindPolicy(pane);
  ({feed: renderSetFeed, locations: renderSetLocs, types: renderSetTypes, users: renderSetUsers, ldap: renderSetLdap, policy: () => {}, about: renderSetAbout})[st.setTab]();
  applyRole();
}

/* About, as in NOBS SQL Editor: the version comes from the server, the licence text is the same. */
async function renderSetAbout(){
  const version = await loadVersion();
  if (!$('#setAbout')) return;   /* Settings was closed while the version was loading */
  $('#setAbout').innerHTML = `<div class="panelbox" style="padding:12px 14px">
    <div class="muted" style="font-size:12px;line-height:1.6">
      <b style="font-size:14px">NOBS Inventory</b><br>
      Version ${esc(version || 'unknown')}<br>
      An inventory of PCs, servers, phones, switches and other devices, with their relations.<br>
      <i>No BS, just inventory.</i><br>
      Copyright &copy; 2026 Viktor Ljuca
    </div>
    <div class="hdr" style="margin:14px -14px 8px">License</div>
    <div class="muted" style="font-size:12px;line-height:1.6">
      This program is free software: you may redistribute and/or modify it under the terms of the
      <b>GNU General Public License version 3</b>, or (at your option) any later version.<br>
      It is distributed in the hope that it will be useful, but <b>WITHOUT ANY WARRANTY</b> - without
      even the implied warranty of merchantability or fitness for a particular purpose. See the
      GNU General Public License for details.
    </div>
    <div class="hdr" style="margin:14px -14px 8px">Links</div>
    <div style="display:grid;grid-template-columns:70px 1fr;gap:2px 12px;font-size:12px;line-height:1.7;overflow-wrap:anywhere">
      <span class="muted">Website</span><span>https://monsama.ch</span>
      <span class="muted">Source</span><span>https://github.com/monsama/nobs-inventory</span>
      <span class="muted">License</span><span>https://www.gnu.org/licenses/gpl-3.0.html</span>
    </div>
    <div class="hdr" style="margin:14px -14px 8px">Third party</div>
    <div class="muted" style="font-size:11px;line-height:1.6">
      Built with Node.js, Express and ldapjs. Each keeps its own licence.
    </div>
  </div>`;
}

/* ---------- users: people who have devices. Manual users are kept; LDAP users are kept in step with the directory. ---------- */
let USERS = [];
let LDAP_SAMPLE = [];
const devicesOf = name => objs.filter(o => o.user === name).length;
/* Demo roles. Admins can change everything; viewers can look but not change. No password is checked here:
   the server login will do that and enforce the roles itself. */
const me = () => USERS.find(u => u.id === st.meId);
const canEdit = () => !USERS.length || (!!me() && me().role === 'admin');
const roleLabel = u => u.role === 'admin' ? 'Admin' : 'Viewer';
/* Viewers: controls in the page are disabled, navigation stays. */
const RO_KEEP = /Cancel|Close|Back|^setTab|^setClose$/;
const RO_NAV = 'button[data-open],button[data-devs],button[data-sw],button[data-person],button[data-loc],button[data-st],button[data-tab],button[data-close],button.item,button.tab,button.card,button.port,button.node,button.link,a';
const RO_INPUT_OK = /^(search|mapFind|mapOnly|mapLabels|grp|swSel|rkSel|swVerX)$/;
function applyRole(){
  const ro = !canEdit();
  document.body.classList.toggle('readonly', ro);
  $('#newBtn').disabled = ro;
  $('#whoBtn').textContent = me() ? me().name + ' · ' + roleLabel(me()) : (USERS.length ? 'Signed out · read only' : 'No users yet');
  ['#view', '#toolbar', '#modalHost'].forEach(sel => $(sel).querySelectorAll('button, input, select, textarea').forEach(el => {
    if (!ro){ if (el.dataset.roLocked){ el.disabled = false; delete el.dataset.roLocked; } return; }
    if (el.closest('.box.free') || el.matches(RO_NAV) || RO_KEEP.test(el.id) || RO_INPUT_OK.test(el.id) || el.closest('.fr') || el.closest('.hits') || el.closest('#setTabs')) return;
    if (el.matches('button, input, select, textarea') && !el.disabled){ el.dataset.roLocked = '1'; el.disabled = true; }
  }));
}
function signInModal(){
  modal(`<div class="mh">Sign in</div>
    <div class="mb">
      <p class="note"><b>Demo.</b> Nothing is checked here: anyone who can open this file can pick any user. The server login will check passwords or LDAP and enforce the roles itself.</p>
      <div class="srcs">${USERS.filter(u => u.active).map(u => `<label class="src"><input type="radio" name="who" value="${u.id}" ${u.id === st.meId ? 'checked' : ''}><span><b>${esc(u.name)}</b><small>${roleLabel(u) === 'Admin' ? 'Admin · can change everything' : 'Viewer · can look, not change'}</small></span></label>`).join('') || '<span class="muted">No active users yet. Add them under Settings → Users.</span>'}</div>
    </div>
    <div class="mf"><button id="siOut">Sign out</button><button id="siOk" class="primary">Sign in</button></div>`, 'sm free');
  $('#siOk').onclick = () => { const v = document.querySelector('input[name=who]:checked'); st.meId = v ? v.value : null; closeModal(); render(); };
  $('#siOut').onclick = () => { st.meId = null; closeModal(); render(); };
}
const userId = () => 'u' + Math.random().toString(36).slice(2, 9);
function ensureUser(name){
  let u = USERS.find(x => x.name === name);
  if (!u){ u = {id:userId(), login:'', name, dept:'', groups:[], source:'manual', active:true}; USERS.push(u); }
  return u;
}
/* A device keeps the id of its user; .user reads the name from that record, so renaming a user moves the devices with it. */
function bindUser(o){
  const d = Object.getOwnPropertyDescriptor(o, 'user');
  if (d && d.get) return;
  const name = o.user;
  delete o.user;
  if (!o.uid) o.uid = name ? ensureUser(name).id : null;
  Object.defineProperty(o, 'user', {
    get(){ const u = USERS.find(x => x.id === this.uid); return u ? u.name : ''; },
    set(v){ this.uid = v ? ensureUser(v).id : null; },
    enumerable: true, configurable: true
  });
}
/* Software on PCs and servers. */

/* Rack placement. A device either takes U slots (rack, u, h) or sits on top of another device in the same rack (ontop). */
const RACKABLE = ['server','switch','patch','storage','router','firewall','modem'];
const TYPE_U = {server:2, switch:1, patch:1, storage:4, router:1, firewall:1, modem:1};
const rackOf = id => RACKS.find(r => r.id === id);
/* Returns an error for a placement that does not fit, or '' when it does. */
function rackCheck(rackId, u, h, exceptId){
  const R_ = rackOf(rackId);
  if (!R_) return 'Pick a rack first.';
  if (!(u >= 1 && h >= 1 && u + h - 1 <= R_.units)) return `U${u}–${u + h - 1} is outside ${R_.name} (U1–U${R_.units}).`;
  const hit = objs.find(x => x.id !== exceptId && x.rack === rackId && x.u != null && !x.ontop && x.u <= u + h - 1 && u <= x.u + (x.h || 1) - 1);
  return hit ? `U${hit.u}${(hit.h || 1) > 1 ? '–U' + (hit.u + hit.h - 1) : ''} is taken by ${hit.name}.` : '';
}
function rackFields(o){
  if (!RACKABLE.includes(o.type)) return '';
  return `<label for="rk_rack">Rack</label><select id="rk_rack" data-rk="rack"><option value="">Not in a rack</option>${RACKS.map(r => `<option value="${r.id}" ${o.rack===r.id && o.u!=null && !o.ontop ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
    <label>Mounted at</label><div class="rkrow"><span class="muted">U</span><input type="number" min="1" data-rk="u" value="${o.u ?? ''}" style="width:64px" aria-label="Start U"><span class="muted">height</span><input type="number" min="1" data-rk="h" value="${o.h ?? TYPE_U[o.type] ?? 1}" style="width:64px" aria-label="Height in U"><span class="muted">U</span></div>
    <label for="rk_top">Or on top of</label><select id="rk_top" data-rk="ontop"><option value="">Nothing</option>${objs.filter(x => x.id !== o.id && x.rack && x.u != null && !x.ontop && RACKABLE.includes(x.type)).map(x => `<option value="${x.id}" ${o.ontop===x.id ? 'selected' : ''}>${esc(x.name)} · U${x.u}</option>`).join('')}</select>`;
}
/* Mount device…: pick a rack device that has no rack yet, a start U and a height. */
function mountModal(){
  const free = objs.filter(o => RACKABLE.includes(o.type) && !o.rack && !(o.type === 'server' && o.kind === 'vm'));
  if (!free.length){ toast('Every rackable device is already in a rack.'); return; }
  modal(`<div class="mh">Mount device in ${esc(rackOf(st.rackId).name)}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="mdDev">Device</label><select id="mdDev">${free.map(o => `<option value="${o.id}">${esc(o.name)} · ${TYPES[o.type].label}</option>`).join('')}</select>
      <label for="mdU">Start U</label><input id="mdU" type="number" min="1" value="${rackOf(st.rackId).units}">
      <label for="mdH">Height</label><input id="mdH" type="number" min="1" value="${TYPE_U[free[0].type] ?? 1}">
    </div><p class="note" id="mdErr"></p></div>
    <div class="mf"><button id="mdCancel">Cancel</button><button id="mdOk" class="primary">Mount</button></div>`, 'sm');
  const pick = () => { const o = byId($('#mdDev').value); $('#mdH').value = TYPE_U[o.type] ?? 1; };
  $('#mdDev').onchange = pick;
  $('#mdCancel').onclick = closeModal;
  $('#mdOk').onclick = () => {
    const o = byId($('#mdDev').value), u = +$('#mdU').value, h = +$('#mdH').value;
    const err = rackCheck(st.rackId, u, h, o.id);
    if (err){ $('#mdErr').textContent = err; return; }
    Object.assign(o, {rack: st.rackId, u, h}); delete o.ontop;
    hist(o, now(), `Mounted in ${rackOf(st.rackId).name} at U${u}, ${h} U high`);
    closeModal(); toast(o.name + ' mounted at U' + u); render();
  };
}

function renderSetUsers(){
  const rows = USERS.map((u, i) => `<tr>
      <td>${esc(u.name)}</td><td class="mono">${esc(u.login || '—')}</td><td>${esc(u.dept || '')}</td><td>${esc((u.groups || []).join(', '))}</td>
      <td>${u.source === 'ldap' ? '<span class="chip info">LDAP</span>' : '<span class="chip kept">Manual</span>'}</td>
      <td class="n"><a class="link" data-devs="${i}">${devicesOf(u.name)}</a></td>
      <td><select data-role="${i}" aria-label="Role of ${esc(u.name)}"><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option><option value="viewer" ${u.role !== 'admin' ? 'selected' : ''}>Viewer</option></select></td>
      <td><input type="checkbox" data-act="${i}" ${u.active ? 'checked' : ''} aria-label="Active"></td>
      <td>${SERVER.on && u.login ? `<button data-pw="${i}" title="Set this user's password">Password</button>` : ''}</td>
      <td><button class="icon ghost" data-del="${i}" ${u.source === 'ldap' ? 'disabled title="Managed by LDAP"' : devicesOf(u.name) ? 'disabled title="Has devices. Move them first."' : 'title="Remove"'} aria-label="Remove user">×</button></td></tr>`).join('');
  $('#setUsers').innerHTML = `<div class="panelbox"><div class="hdr">Users <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${USERS.filter(u => u.active).length} active</span></div>
    <div style="overflow-x:auto"><table class="grid mini"><thead><tr><th>Name</th><th>Login</th><th>Department</th><th>Groups</th><th>Source</th><th>Devices</th><th>Role</th><th>Active</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="addrel"><input id="nuName" placeholder="Name, e.g. A. Frei" style="min-width:150px" aria-label="Name"><input id="nuDept" placeholder="Department" style="min-width:130px" aria-label="Department"><button id="nuAdd" class="primary">Add user</button></div></div>
    <p class="note">Each device names its user. The Devices count lists them, and clicking it shows those devices. Users from LDAP can't be removed here, only deactivated.</p>`;
  const root = $('#setUsers');
  root.querySelectorAll('[data-devs]').forEach(a => a.onclick = () => showDevicesOf(USERS[+a.dataset.devs].name));
  root.querySelectorAll('[data-act]').forEach(c => c.onchange = () => { USERS[+c.dataset.act].active = c.checked; renderSetUsers(); });
  root.querySelectorAll('[data-pw]').forEach(b => b.onclick = () => passwordModal(USERS[+b.dataset.pw]));
  root.querySelectorAll('[data-role]').forEach(sel => sel.onchange = () => {
    const u = USERS[+sel.dataset.role], admins = USERS.filter(x => x.role === 'admin').length;
    if (u.role === 'admin' && sel.value !== 'admin' && admins <= 1){ toast('At least one admin is needed.'); renderSetUsers(); return; }
    u.role = sel.value; toast(u.name + ' is now ' + roleLabel(u).toLowerCase()); renderSetUsers();
  });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const u = USERS[+b.dataset.del]; USERS.splice(+b.dataset.del, 1); toast(u.name + ' removed'); renderSetUsers(); });
  $('#nuAdd').onclick = () => {
    const name = $('#nuName').value.trim();
    if (!name){ toast('Give the user a name first.'); return; }
    if (USERS.some(u => u.name.toLowerCase() === name.toLowerCase())){ toast(name + ' is already a user.'); return; }
    USERS.push({id:userId(), login:'', name, dept:$('#nuDept').value.trim(), groups:[], source:'manual', active:true});
    toast('Added ' + name); renderSetUsers();
  };
}
/* Shows one user's devices in Cards, by searching for the name. */
function showDevicesOf(name){
  closeModal();
  st.q = name; $('#search').value = name; st.tab = 'cards'; st.cardsGroup = 'none';
  render();
}

/* LDAP sync: read the directory, show what would change, apply on confirmation. Users are deactivated, never deleted. */
function ldapPlan(){
  const plan = [];
  LDAP_SAMPLE.forEach(e => {
    const u = USERS.find(x => x.login === e.login);
    if (!u) plan.push({act:'new', e});
    else if (u.name !== e.name || u.dept !== e.dept) plan.push({act:'changed', u, e});
  });
  if (st.ldap.disable) USERS.filter(u => u.source === 'ldap' && u.active && !LDAP_SAMPLE.some(e => e.login === u.login))
    .forEach(u => plan.push({act:'off', u}));
  return plan;
}
function applyLdap(plan){
  plan.forEach(p => {
    if (p.act === 'new') USERS.push({id:userId(), login:p.e.login, name:p.e.name, dept:p.e.dept, groups:p.e.groups, source:'ldap', active:true});
    if (p.act === 'changed'){
      Object.assign(p.u, {name:p.e.name, dept:p.e.dept, groups:p.e.groups});
    }
    if (p.act === 'off') p.u.active = false;
  });
  st.ldap.last = SYNC_TIME;
  toast(`LDAP sync applied: ${plan.length} change${plan.length === 1 ? '' : 's'}`);
  renderSetPane(); render();
}
function renderSetLdap(){
  const L = st.ldap || {url: '', bindDn: '', base: '', filter: '', group: '', nightly: true, disable: true, last: null};
  $('#setLdap').innerHTML = `<div class="panelbox"><div class="hdr">LDAP / Active Directory <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${L.last ? 'Last sync ' + esc(L.last) : 'Never synced'}</span></div>
    <div class="form" style="grid-template-columns:150px minmax(0,1fr)">
      <label for="lk_url">Server</label><input id="lk_url" class="mono" data-lk="url" value="${esc(L.url)}">
      <label for="lk_bind">Bind account</label><input id="lk_bind" class="mono" data-lk="bindDn" value="${esc(L.bindDn)}">
      <label for="lk_pw">Password</label><input id="lk_pw" type="password" value="mockup" aria-label="Bind password">
      <label for="lk_base">Search base</label><input id="lk_base" class="mono" data-lk="base" value="${esc(L.base)}">
      <label for="lk_filter">User filter</label><input id="lk_filter" class="mono" data-lk="filter" value="${esc(L.filter)}">
      <label for="lk_group">Only group</label><input id="lk_group" class="mono" data-lk="group" value="${esc(L.group)}">
    </div>
    <div class="optrow" style="padding:0 12px 10px"><label><input type="checkbox" data-lk="nightly" ${L.nightly ? 'checked' : ''}> Sync nightly at 06:00</label><label><input type="checkbox" data-lk="disable" ${L.disable ? 'checked' : ''}> Deactivate users no longer in LDAP</label></div>
    <div class="addrel"><button id="ldapTest">Test connection</button><button id="ldapSync" class="primary">Sync now…</button><span class="note" id="ldapMsg"></span></div>
  </div>
  <div id="ldapPlan"></div>
  <p class="note">Attributes read: login sAMAccountName, name displayName, department, groups memberOf. Users are never deleted by a sync.</p>`;
  const root = $('#setLdap');
  if (SERVER.on){
    $('#ldapPlan').innerHTML = '<p class="note">The sync reads the directory on the server. Users who left are deactivated, not deleted.</p>';
    $('#ldapSync').textContent = 'Sync now';
    $('#ldapSync').onclick = async () => {
      $('#ldapSync').disabled = true;
      const r = await fetch('api/ldap/sync', {method: 'POST', credentials: 'same-origin'});
      const j = await r.json().catch(() => ({}));
      $('#ldapSync').disabled = false;
      if (!r.ok){ $('#ldapMsg').textContent = j.error || 'The sync failed.'; return; }
      const c = j.counts;
      $('#ldapMsg').textContent = `${c.people} users in scope: ${c.created} new, ${c.updated} updated, ${c.deactivated} deactivated`;
      const r2 = await fetch('api/state', {credentials: 'same-origin'}); if (r2.ok){ applyState(await r2.json()); SERVER.last = JSON.stringify(snapshot()); }
    };
    $('#ldapTest').onclick = () => { $('#ldapMsg').textContent = 'Connection is tested when the sync runs.'; };
    return;
  }
  root.querySelectorAll('[data-lk]').forEach(i => i.onchange = () => { st.ldap[i.dataset.lk] = i.type === 'checkbox' ? i.checked : i.value; });
  $('#ldapTest').onclick = () => { $('#ldapMsg').textContent = 'Connected · ' + LDAP_SAMPLE.length + ' users in scope'; };
  $('#ldapSync').onclick = () => {
    const plan = ldapPlan();
    $('#ldapPlan').innerHTML = plan.length ? `<div class="panelbox"><div class="hdr">Changes from LDAP</div>
      <div style="overflow-x:auto"><table class="grid mini" style="min-width:0"><thead><tr><th>Action</th><th>User</th><th>What changes</th></tr></thead><tbody>
      ${plan.map(p => p.act === 'new'
        ? `<tr><td><span class="chip ok">New</span></td><td>${esc(p.e.name)}</td><td>${esc(p.e.dept)} · ${esc(p.e.login)}</td></tr>`
        : p.act === 'changed'
        ? `<tr><td><span class="chip info">Update</span></td><td>${esc(p.u.name)}</td><td>${p.u.name !== p.e.name ? `<span class="diff"><del>${esc(p.u.name)}</del> <ins>${esc(p.e.name)}</ins></span> ` : ''}${p.u.dept !== p.e.dept ? `<span class="diff"><del>${esc(p.u.dept)}</del> <ins>${esc(p.e.dept)}</ins></span>` : ''}</td></tr>`
        : `<tr><td><span class="chip kept">Deactivate</span></td><td>${esc(p.u.name)}</td><td class="muted">No longer in LDAP. Devices keep the name.</td></tr>`).join('')}
      </tbody></table></div>
      <div class="addrel"><button id="ldapApply" class="primary">Apply ${plan.length} change${plan.length === 1 ? '' : 's'}</button><button id="ldapCancel">Cancel</button></div></div>`
      : '<p class="note">Nothing to change. The users match LDAP.</p>';
    if (plan.length){
      $('#ldapApply').onclick = () => applyLdap(plan);
      $('#ldapCancel').onclick = () => { $('#ldapPlan').innerHTML = ''; };
    }
  };
}
/* An uploaded icon keeps only its drawing: scripts, event handlers, styles and links to anything outside the file are dropped. */
function sanitizeSvg(text){
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) return null;
  const OK_EL = ['svg','g','path','circle','ellipse','rect','line','polyline','polygon','title','defs','desc'];
  const OK_AT = ['d','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','width','height','points','fill','fill-rule','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray','opacity','transform','id'];
  root.querySelectorAll('*').forEach(n => { if (n !== root && !OK_EL.includes(n.localName)) n.remove(); });
  root.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => { if (!OK_AT.includes(a.name.toLowerCase())) n.removeAttribute(a.name); }));
  const ser = new XMLSerializer();
  return {inner: [...root.childNodes].map(n => ser.serializeToString(n)).join(''), view: root.getAttribute('viewBox') || '0 0 24 24'};
}
function passwordModal(u){
  modal(`<div class="mh">Password for ${esc(u.name)}</div>
    <div class="mb"><div class="form" style="padding:0"><label for="pwNew">New password</label><input id="pwNew" type="password" autocomplete="new-password" aria-describedby="pwHint"></div>
    <p class="note" id="pwHint">At least 8 characters. The server stores only a salted hash.</p></div>
    <div class="mf"><button id="pwCancel">Cancel</button><button id="pwOk" class="primary">Set password</button></div>`, 'sm');
  $('#pwCancel').onclick = closeModal;
  $('#pwOk').onclick = async () => {
    const r = await fetch('api/users/' + encodeURIComponent(u.id) + '/password', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({password: $('#pwNew').value})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'Not set.'); return; }
    closeModal(); toast('Password set for ' + u.name);
  };
  $('#pwNew').focus();
}
/* Locations are 'Site / Room'. Renaming one moves the objects and racks that use it. */
function renderSetLocs(){
  const rows = LOCS.map((l, i) => {
    const n = objs.filter(o => o.loc === l).length + RACKS.filter(r => r.loc === l).length;
    return `<tr><td><input data-lo="${i}" value="${esc(l)}" style="width:100%" aria-label="Location name"></td><td class="n">${n}</td>
      <td><button data-ld="${i}" ${n ? `disabled title="In use by ${n} objects or racks"` : ''}>Delete</button></td></tr>`;
  }).join('');
  $('#setLocs').innerHTML = `<div style="overflow-x:auto"><table class="grid mini" style="min-width:0"><thead><tr><th>Location (Site / Room)</th><th>Used by</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="addrel"><input id="nlName" placeholder="New location, e.g. Basel / Lager" style="flex:1;min-width:180px" aria-label="New location"><button id="nlAdd" class="primary">Add location</button></div>`;
  const root = $('#setLocs');
  root.querySelectorAll('[data-lo]').forEach(i => i.onchange = () => renameLoc(LOCS[+i.dataset.lo], i.value));
  root.querySelectorAll('[data-ld]').forEach(b => b.onclick = () => { LOCS.splice(+b.dataset.ld, 1); toast('Location deleted'); renderSetLocs(); render(); });
  $('#nlAdd').onclick = () => {
    const name = cleanLoc($('#nlName').value);
    if (!name){ toast('Use the form Site / Room, e.g. Basel / Lager'); return; }
    if (LOCS.includes(name)){ toast(name + ' already exists.'); return; }
    LOCS.push(name); toast('Added ' + name); renderSetLocs(); render();
  };
}
const cleanLoc = v => { const t = v.trim().split(/\s*\/\s*/).map(x => x.trim()); return t.length === 2 && t[0] && t[1] ? t.join(' / ') : ''; };
function renameLoc(old, value){
  const name = cleanLoc(value);
  if (!name){ toast('Use the form Site / Room, e.g. Basel / Lager'); renderSetLocs(); return; }
  if (name !== old && LOCS.includes(name)){ toast(name + ' already exists.'); renderSetLocs(); return; }
  if (name === old) return;
  LOCS[LOCS.indexOf(old)] = name;
  objs.forEach(o => { if (o.loc === old) o.loc = name; });
  RACKS.forEach(r => { if (r.loc === old) r.loc = name; });
  if (st.loc === old) st.loc = name;
  toast('Renamed to ' + name); renderSetLocs(); render();
}
/* Object types: rename, recolour, change the icon, add new ones. A type can be deleted only when it is not built in and no object has it. */
function renderSetTypes(){
  const rows = Object.entries(TYPES).map(([k,t]) => {
    const n = objs.filter(o => o.type === k).length;
    const lock = BUILTIN.includes(k) ? 'Built in' : n ? `In use by ${n} objects` : '';
    return `<tr>
      <td style="width:1%"><input type="color" value="${t.color}" data-tc="${k}" aria-label="Colour for ${esc(t.label)}" style="width:40px;height:28px;padding:2px"></td>
      <td><input data-tl="${k}" value="${esc(t.label)}" style="width:100%" aria-label="Name"></td>
      <td><input data-ts="${k}" value="${esc(t.short)}" style="width:90px" aria-label="Short name"></td>
      <td><select data-ti="${k}" aria-label="Icon">${[...Object.keys(ICON), ...(t.svgInner ? ['custom'] : [])].map(i => `<option ${i===t.icon?'selected':''}>${i}</option>`).join('')}</select>
        <input type="file" accept=".svg,image/svg+xml" data-up="${k}" aria-label="Upload SVG icon for ${esc(t.label)}" style="width:150px;font-size:11px"></td>
      <td class="n">${n}</td>
      <td><button data-td="${k}" ${BUILTIN.includes(k) || n ? `disabled title="${lock}"` : ''}>Delete</button></td></tr>`;
  }).join('');
  $('#setTypes').innerHTML = `<div style="overflow-x:auto"><table class="grid mini" style="min-width:0"><thead><tr><th style="width:1%">Colour</th><th>Name</th><th>Short</th><th>Icon</th><th>Objects</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="addrel"><input id="ntName" placeholder="New type, e.g. Access point" style="flex:1;min-width:160px" aria-label="New type name"><button id="ntAdd" class="primary">Add type</button></div>`;
  const root = $('#setTypes');
  root.querySelectorAll('[data-tc]').forEach(i => i.oninput = () => { TYPES[i.dataset.tc].color = i.value; render(); });
  root.querySelectorAll('[data-tl]').forEach(i => i.onchange = () => { TYPES[i.dataset.tl].label = i.value.trim() || TYPES[i.dataset.tl].label; renderSetTypes(); render(); });
  root.querySelectorAll('[data-ts]').forEach(i => i.onchange = () => { TYPES[i.dataset.ts].short = i.value.trim() || TYPES[i.dataset.ts].short; render(); });
  root.querySelectorAll('[data-ti]').forEach(i => i.onchange = () => { TYPES[i.dataset.ti].icon = i.value; renderSetTypes(); render(); });
  root.querySelectorAll('[data-up]').forEach(f => f.onchange = async () => {
    const file = f.files[0]; if (!file) return;
    const clean = sanitizeSvg(await file.text());
    if (!clean){ toast('That file is not an SVG icon.'); f.value = ''; return; }
    Object.assign(TYPES[f.dataset.up], {svgInner: clean.inner, svgView: clean.view, icon: 'custom'});
    toast('Icon uploaded for ' + TYPES[f.dataset.up].label); renderSetTypes(); render();
  });
  root.querySelectorAll('[data-td]').forEach(b => b.onclick = () => { const k = b.dataset.td; toast(TYPES[k].label + ' deleted'); delete TYPES[k]; renderSetTypes(); render(); });
  $('#ntAdd').onclick = () => {
    const name = $('#ntName').value.trim();
    if (!name){ toast('Give the new type a name first.'); return; }
    if (Object.values(TYPES).some(t => t.label.toLowerCase() === name.toLowerCase())){ toast(name + ' already exists.'); return; }
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'type';
    let k = base, i = 2; while (TYPES[k]) k = base + '-' + i++;
    TYPES[k] = {label:name, short:name, color:'#5a6b7d', icon:'other'};
    toast('Added ' + name + '. Pick it when you create an object.'); renderSetTypes(); render();
  };
}
/* Feed on the server: upload the report, and the server applies the policy and the merge rules. */
function renderSetFeedServer(){
  $('#setFeed').innerHTML = `<div class="hdr">Feed</div>
    <div class="note" style="padding:10px 12px">Upload a Lansweeper report (CSV). Matches are found by serial number, then name. Only the fields the policy allows are changed, and what you set by hand stays.</div>
    <div class="form" style="grid-template-columns:110px minmax(0,1fr)"><label for="feedUp">Export</label><input id="feedUp" type="file" accept=".csv,text/csv"></div>
    <div class="note" style="padding:0 12px 10px">Nightly import from a file: set NI_FEED_CSV on the server.</div>
    ${SERVER.lansweeper ? '<div class="addrel"><button id="feedApi" class="primary">Sync from the Lansweeper API now</button></div>' : ''}`;
  const fa = $('#feedApi'); if (fa) fa.onclick = async () => {
    fa.disabled = true;
    const r = await fetch('api/feed/sync', {method: 'POST', credentials: 'same-origin'});
    const j = await r.json().catch(() => ({}));
    fa.disabled = false;
    if (!r.ok){ toast(j.error || 'The sync failed.'); return; }
    const c = j.counts;
    toast(`Lansweeper: ${c.assets} assets, ${c.created} new, ${c.updated} updated, ${c.linked} linked`);
    const r2 = await fetch('api/state', {credentials: 'same-origin'}); if (r2.ok){ applyState(await r2.json()); SERVER.last = JSON.stringify(snapshot()); render(); }
  };
  $('#feedUp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const r = await fetch('api/feed/import', {method: 'POST', headers: {'Content-Type': 'text/csv'}, credentials: 'same-origin', body: await f.text()});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'The export could not be imported.'); return; }
    const c = j.counts;
    toast(`Import: ${c.created} new, ${c.updated} updated, ${c.linked} linked, ${c.unchanged} unchanged`);
    const r2 = await fetch('api/state', {credentials: 'same-origin'}); if (r2.ok){ applyState(await r2.json()); SERVER.last = JSON.stringify(snapshot()); render(); }
  };
}
/* The feed is optional: without one, every object is entered and kept by hand. */
function renderSetFeed(){
  if (SERVER.on) return renderSetFeedServer();
  const n = objs.filter(o => o.feed).length;
  $('#setFeed').innerHTML = st.feedOn ? `<div class="hdr">Feed</div>
    <dl class="lsbox"><dt>Connection</dt><dd style="font-family:inherit">Connected · site HQ Zürich</dd><dt>Last sync</dt><dd style="font-family:inherit">${SYNC_TIME}</dd><dt>Covers</dt><dd style="font-family:inherit">${n} objects</dd></dl>
    <div class="optrow" style="padding:0 12px 10px"><label><input type="checkbox" id="setSync" ${st.feedSync?'checked':''}> Keep in sync nightly at 06:00</label></div>
    <div class="addrel"><button id="setSyncNow">Sync now</button><button id="setSetup">Change connection…</button><div class="grow"></div><button id="setOff">Disconnect</button></div>`
  : `<div class="hdr">Feed</div><p class="note" style="padding:10px 12px">No feed connected. Objects are entered and edited by hand, and every value stays as you set it. A feed can be connected at any time and will only fill the fields you allow.</p>
    <div class="addrel"><button id="setSetup" class="primary">Connect a feed…</button></div>`;
  const sy = $('#setSync'); if (sy) sy.onchange = e => { st.feedSync = e.target.checked; toast(st.feedSync ? 'Nightly sync on' : 'Nightly sync off'); };
  const sn = $('#setSyncNow'); if (sn) sn.onclick = () => toast('Mockup: runs the same sync as the nightly run');
  $('#setSetup').onclick = () => feedModal(1);
  const off = $('#setOff'); if (off) off.onclick = () => { st.feedOn = false; toast('Feed disconnected. Values stay as they are.'); renderSetFeed(); render(); };
}

/* ---------- new object ---------- */
function newObjModal(pre={}){
  const c = pre.copy;
  modal(`<div class="mh">${c ? 'Duplicate ' + esc(c.code) : 'New object'}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="nType">Type</label><select id="nType">${Object.entries(TYPES).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
      <label for="nName">Name</label><input id="nName" class="mono" placeholder="e.g. ZH-PC-0151">
      <label for="nModel">Model</label><input id="nModel" placeholder="e.g. HP EliteDesk 800 G9 Mini">
      <label for="nSerial">Serial number</label><input id="nSerial" class="mono">
      <label for="nLoc">Location</label><select id="nLoc">${LOCS.map(l => `<option>${esc(l)}</option>`).join('')}</select>
      <label for="nUp">Plug into</label><select id="nUp"><option value="">Nothing yet</option>${objs.filter(o => ['switch','sip','pc','patch'].includes(o.type)).map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select>
      <label for="nPort">Port</label><input id="nPort" class="mono" placeholder="e.g. 12, or P04 on a patch panel">
    </div><p class="note">The object gets its own code (INV-…). If a feed later finds the same serial number, it links to this object instead of creating a duplicate.</p></div>
    <div class="mf"><button id="nCancel">Cancel</button><button id="nOk" class="primary">Create</button></div>`, 'sm');
  if (c){ $('#nType').value = c.type; $('#nName').value = c.name.replace(/\d+$/, m => String(+m + 1).padStart(m.length, '0')); $('#nModel').value = c.model; $('#nLoc').value = c.loc; }
  if (pre.sw){ $('#nUp').value = pre.sw; $('#nPort').value = pre.port; }
  if (pre.name) $('#nName').value = pre.name;
  $('#nName').focus();
  $('#nCancel').onclick = closeModal;
  $('#nOk').onclick = () => {
    const name = $('#nName').value.trim();
    if (!name){ $('#nName').focus(); $('#nName').placeholder = 'A name is needed, e.g. ZH-PC-0151'; return; }
    if (byName(name)){ toast(name + ' already exists. Pick another name.'); return; }
    const upId = $('#nUp').value;
    if (upId && $('#nPort').value.trim()){
      const t = byId(upId), pp = $('#nPort').value.trim();
      const val = t.type === 'patch' ? pp.toUpperCase() : (t.type === 'switch' && /^\d+$/.test(pp) ? +pp : pp);
      if (rels.some(r => r.to === t.id && String(r.port) === String(val))){ toast(`${val} on ${t.name} is already taken.`); return; }
    }
    const o = O($('#nType').value, name, {model:$('#nModel').value || '—', serial:$('#nSerial').value, loc:$('#nLoc').value});
    if (o.type === 'switch') Object.assign(o, {ports:24, sfp:4, pfx:'1/'});
    if (o.type === 'patch') o.ports = 24;
    objs.push(o); bindUser(o); hist(o, now(), 'Created manually by v.ljuca');
    const up = $('#nUp').value;
    if (up){ const t = byId(up); let p = $('#nPort').value.trim(); if (/^\d+$/.test(p) && t.type === 'switch') p = +p;
      rels.push({id:'r'+(++rseq), from:o.id, to:up, kind: o.type === 'monitor' ? 'attached' : 'connected', port: p || null, vlan:null}); }
    if (c){
      ['kind','os','cpu','ram','fw','ports','sfp','pfx','cap','proto'].forEach(k => { if (c[k] !== undefined && o[k] === undefined) o[k] = c[k]; });
      if (c.software) o.software = c.software.map(x => ({...x}));
      rels.filter(r => r.from === c.id).forEach(r => rels.push({...r, id:'r'+(++rseq), from:o.id, port: ['switch','patch'].includes(byId(r.to).type) ? null : r.port}));
      if (c.rack && RACKABLE.includes(o.type)){
        const h = c.h || TYPE_U[o.type] || 1; let placed = false;
        for (let top = rackOf(c.rack).units; top >= h && !placed; top--){
          if (!rackCheck(c.rack, top - h + 1, h, o.id)){ Object.assign(o, {rack: c.rack, u: top - h + 1, h}); placed = true; }
        }
        if (!placed) toast('No free U in ' + rackOf(c.rack).name + '. Copied without a rack position.');
      }
      hist(o, now(), 'Duplicated from ' + c.code);
    }
    closeModal(); toast('Created ' + o.code + ' ' + name); openObj(o.id);
  };
}

/* ---------- feed wizard (initial sync, then kept in sync) ----------
   The feed is a feeder: it proposes values, and st.policy / o.ovr decide which ones land. */
let FEED_MAP = [];
/* Feed records. Existing objects are matched by serial number; a new one is created with its own code. */
let FEED_EXISTING = [];
let FEED_NEW = [];

/* The plan is computed from the current policy, so the preview always matches what the run will do. */
function buildPlan(){
  const plan = FEED_NEW.map(n => ({act:'new', name:n.name, type:n.type, ref:n.ref, seen:n.seen, rec:n.rec, rel:n.rel, detail:n.detail, changes:[]}));
  FEED_EXISTING.forEach(e => {
    const o = byName(e.name);
    const link = !!e.ref && !o.feed;
    const changes = Object.entries(e.rec).filter(([k,v]) => o[k] !== v)
      .map(([k,v]) => ({k, label:FIELD_LABEL[k], from:o[k], to:v, owned:feedOwns(o, k, link || !!o.feed)}));
    const act = link ? 'link' : changes.some(c => c.owned) ? 'update' : changes.length ? 'kept' : null;
    if (act) plan.push({act, o, name:o.name, type:o.type, ref:e.ref, seen:SYNC_TIME, changes});
  });
  return plan;
}
const ACT = {new:['New','ok'], update:['Update','info'], link:['Link','info'], kept:['Kept local','kept']};

function feedModal(startStep = 1, forObj = null){
  let step = startStep;
  let plan = [];
  const counts = () => ['new','update','link','kept'].map(a => [a, plan.filter(p => p.act === a).length]);
  const draw = () => {
    const stepsHtml = ['Connect','Match & fields','Preview','Initial sync'].map((s,i) => `<span class="${step===i+1?'on':step>i+1?'done':''}"><b>${step>i+1?'✓':i+1}</b>${s}</span>`).join('');
    let body = '';
    if (step === 1) body = `
      <div class="srcs">
        <label class="src"><input type="radio" name="src" value="cloud" checked><span><b>Lansweeper Sites API</b><small>Cloud or hybrid site. Reads assets over the GraphQL API with an access token.</small></span></label>
        <label class="src"><input type="radio" name="src" value="sql"><span><b>On-prem database</b><small>Lansweeper Classic. Reads the <span class="mono">lansweeperdb</span> SQL Server database with a read-only login.</small></span></label>
        <label class="src"><input type="radio" name="src" value="csv"><span><b>Report export</b><small>A CSV or XLSX export. No connection needed. Good for a one-off sync.</small></span></label>
      </div>
      <div class="form" style="padding:0" id="srcForm"></div>
      <div class="optrow"><label><input type="checkbox" id="optSched" ${st.feedSync?'checked':''}> Keep in sync nightly at 06:00</label></div>
      <p class="note">The feed only proposes values. Which fields it may overwrite is set in the next step and on each object.</p>`;
    if (step === 2) body = `
      <p class="note">Feed asset types map to object types here. Types set to <b>Ignore</b> are not imported.</p>
      <div style="overflow-x:auto"><table class="grid mini"><thead><tr><th>Asset type in feed</th><th style="width:90px">Assets</th><th>Becomes</th></tr></thead><tbody>
        ${FEED_MAP.map(([ls,t,n]) => `<tr><td>${ls}</td><td class="n">${n}</td><td><select aria-label="Type for ${esc(ls)}" style="height:24px"><option value="">Ignore</option>${Object.entries(TYPES).map(([k,v]) => `<option value="${k}" ${k===t?'selected':''}>${v.label}</option>`).join('')}</select></td></tr>`).join('')}
      </tbody></table></div>
      <div class="form" style="padding:0">
        <label for="mKey">Match on</label><select id="mKey"><option>Serial number, then MAC address, then name</option><option>Feed asset ID only</option><option>Name only</option></select>
        <label for="mLoc">Location from</label><select id="mLoc"><option>Feed location field</option><option>IP range → location table</option><option>Do not set</option></select>
      </div>
      <p class="note"><b>Fields the feed may overwrite</b> (default for all objects)</p>
      ${policyGrid()}`;
    if (step === 3){
      plan = buildPlan();
      body = `
      <div class="summary">${counts().map(([a,n]) => `<span class="chip ${ACT[a][1]}">${n} ${ACT[a][0].toLowerCase()}</span>`).join('')}</div>
      <div style="overflow-x:auto"><table class="grid mini"><thead><tr><th>Action</th><th>Object</th><th>Type</th><th>What changes</th></tr></thead><tbody>
        ${plan.map(p => `<tr><td><span class="chip ${ACT[p.act][1]}">${ACT[p.act][0]}</span></td><td class="n">${p.o ? esc(p.o.code) + ' ' : ''}${esc(p.name)}</td><td><span class="tdot"><span class="tsw" style="background:${tcol(p.type)}"></span>${TYPES[p.type].short}</span></td>
          <td style="white-space:normal">${p.act === 'new' ? esc(p.detail) : p.act === 'link' ? 'Linked by serial number' : ''}
            ${p.changes.map(c => c.owned
              ? `<div class="diff">${esc(c.label)}: <del>${esc(fmtVal(c.k,c.from))}</del> <ins>${esc(fmtVal(c.k,c.to))}</ins></div>`
              : `<div class="muted">${esc(c.label)}: kept as set here</div>`).join('')}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="note">Nothing is written until the sync runs. Fields kept here are never touched by the feed. Change which fields the feed may overwrite in step 2, or per object.</p>`;
    }
    if (step === 4) body = `<div class="bar2"><i id="prog"></i></div><div class="console" id="log" role="log" aria-live="polite"></div>`;
    $('#mdl .box').innerHTML = `<div class="mh"><svg class="i" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg>${forObj ? 'Link ' + esc(forObj.code) + ' to a feed record' : 'Feed sync'}</div>
      <div class="steps">${stepsHtml}</div><div class="mb">${body}</div>
      <div class="mf">${step===1?'<button id="testBtn" style="margin-right:auto">Test connection</button>':''}<span id="testRes" class="muted" style="margin-right:auto"></span>
        ${step<4?'<button id="iCancel">Cancel</button>':''}${step>1&&step<4?'<button id="iBack">Back</button>':''}
        <button id="iNext" class="primary">${step===3?'Start sync':step===4?'Close':'Next'}</button></div>`;
    bindPolicy($('#mdl'));
    applyRole();
    if (step === 1){
      const srcForm = () => {
        const v = document.querySelector('input[name=src]:checked').value;
        $('#srcForm').innerHTML = v === 'cloud'
          ? `<label for="lsSite">Site</label><input id="lsSite" value="HQ Zürich (site id 6f2c…a91e)"><label for="lsTok">Access token</label><input id="lsTok" type="password" value="token-mockup"><label for="lsUrl">API endpoint</label><input id="lsUrl" class="mono" value="https://api.lansweeper.com/api/v2/graphql">`
          : v === 'sql'
          ? `<label for="lsHost">SQL Server</label><input id="lsHost" class="mono" value="LS-SRV01\\SQLEXPRESS"><label for="lsDb">Database</label><input id="lsDb" class="mono" value="lansweeperdb"><label for="lsUser">Login</label><input id="lsUser" class="mono" value="nobs_inventory_ro"><label for="lsPw">Password</label><input id="lsPw" type="password" value="mockup">`
          : `<label for="lsFile">File</label><input id="lsFile" type="file" accept=".csv,.xlsx" style="padding:2px"><label>Columns</label><span class="note">AssetName, AssetType, Serial, Mac, IPAddress, Model, Location, LastSeen</span>`;
      };
      document.querySelectorAll('input[name=src]').forEach(r => r.onchange = srcForm); srcForm();
      $('#optSched').onchange = e => st.feedSync = e.target.checked;
      $('#testBtn').onclick = () => { $('#testRes').textContent = 'Connecting…'; setTimeout(() => $('#testRes').innerHTML = '<span class="dot"></span> Connected · 1 179 assets on site', 600); };
    }
    if (step === 4) runSync(plan, () => $('#iNext').disabled = false);
    const c = $('#iCancel'); if (c) c.onclick = closeModal;
    const b = $('#iBack'); if (b) b.onclick = () => { step--; draw(); };
    $('#iNext').onclick = () => { if (step === 4){ closeModal(); render(); return; } step++; draw(); };
    if (step === 4) $('#iNext').disabled = true;
  };
  modal('');
  draw();
}

function runSync(plan, done){
  const log = $('#log'), prog = $('#prog');
  const lines = [['m', `[${SYNC_TIME.slice(11)}] `, 'Connecting to feed · site HQ Zürich'], ['', '', `Matched on serial / MAC / name … ${objs.length - plan.filter(p => p.act !== 'new').length} unchanged`]];
  plan.forEach(p => {
    const sym = {new:'+', update:'~', link:'=', kept:'·'}[p.act];
    const cls = {new:'g', update:'b', link:'b', kept:'m'}[p.act];
    const owned = p.changes.filter(c => c.owned).map(c => c.label);
    const kept = p.changes.filter(c => !c.owned).map(c => c.label);
    const text = p.act === 'new' ? `created ${p.type}` : p.act === 'link' ? 'linked by serial' : owned.length ? 'updated ' + owned.join(', ') : 'no field changes';
    lines.push([cls, sym + ' ' + p.name.padEnd(14), text + (kept.length ? ' · kept: ' + kept.join(', ') : '')]);
  });
  lines.push(['g', 'Done.', `${plan.filter(p=>p.act==='new').length} created, ${plan.filter(p=>p.act==='update'||p.act==='link').length} updated, ${plan.filter(p=>p.act==='kept').length} kept local.`]);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0;
  const tick = () => {
    if (i >= lines.length){ applyPlan(plan); done(); return; }
    const [cls, head, text] = lines[i];
    const s = document.createElement('span'); if (cls) s.className = cls;
    s.textContent = (head || '') + (text || '') + '\n';
    log.appendChild(s); log.scrollTop = log.scrollHeight;
    i++; prog.style.width = Math.round(i / lines.length * 100) + '%';
    setTimeout(tick, reduce ? 0 : 160);
  };
  tick();
}

function applyPlan(plan){
  st.feedOn = true;
  plan.forEach(p => {
    if (p.act === 'new'){
      const o = O(p.type, p.name, {...p.rec, feed:F(p.ref, p.seen)});
      objs.push(o); bindUser(o); hist(o, SYNC_TIME, 'Created by feed sync');
    }
  });
  FEED_NEW.forEach(n => {
    if (!n.rel) return;
    const from = byName(n.name), to = byName(n.rel.to);
    rels.push({id:'r'+(++rseq), from:from.id, to:to.id, kind:n.rel.kind, port:n.rel.port, vlan:n.rel.vlan ?? null});
  });
  plan.filter(p => p.act !== 'new').forEach(p => {
    if (p.act === 'link'){ p.o.feed = F(p.ref, SYNC_TIME); hist(p.o, SYNC_TIME, 'Linked to feed record by serial number'); }
    const owned = p.changes.filter(c => c.owned);
    owned.forEach(c => p.o[c.k] = c.to);
    if (owned.length) hist(p.o, SYNC_TIME, 'Feed sync: ' + owned.map(c => c.label).join(', '));
  });
  render();
}

/* ---------- top bar ---------- */
$('#newBtn').onclick = () => newObjModal();
$('#whoBtn').onclick = () => (SERVER.on ? (me() ? signOut() : loginModal()) : signInModal());
$('#setBtn').onclick = openSettings;
$('#themeBtn').onclick = () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('ni-theme', root.dataset.theme); } catch(e) {}
};
$('#search').addEventListener('input', e => { st.q = e.target.value; if (!['cards','table','map'].includes(st.tab)) st.tab = 'cards'; render(); });
document.addEventListener('click', e => { const t = e.target.closest('[data-open]'); if (t && !e.target.closest('[data-close]')) openObj(t.dataset.open); });

/* ---------- tables: columns can be resized and moved ----------
   The order and widths of each table are kept by its place (tab and position), in the browser. */
let TBL = {};
try { TBL = JSON.parse(localStorage.getItem('ni-cols') || '{}'); } catch(e) { TBL = {}; }
const saveTBL = () => { try { localStorage.setItem('ni-cols', JSON.stringify(TBL)); } catch(e) {} };
function tableKey(t){
  const scope = t.closest('#mdl') || $('#view');
  return (t.closest('#mdl') ? 'modal' : 'view') + ':' + st.tab + ':' + [...scope.querySelectorAll('table.grid')].indexOf(t);
}
function applyTable(t){
  const s = TBL[tableKey(t)]; const head = t.tHead && t.tHead.rows[0];
  if (!s || !head) return;
  [...t.rows].forEach(r => { const cells = r._orig; if (cells && cells.length === s.order.length) s.order.forEach(i => r.appendChild(cells[i])); });
  t.style.tableLayout = Object.keys(s.widths).length ? 'fixed' : '';
  [...head.cells].forEach(th => { const w = s.widths[th.dataset.ci]; th.style.width = w ? w + 'px' : ''; });
  applyView(t);
}
/* Sorting and filtering on the rows, after the columns are in their order. Numbers and dates sort by value. */
const dateKey = v => { const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})(?: (\d{2}):(\d{2}))?/); return m ? Number(m[3] + m[2] + m[1] + (m[4] || '00') + (m[5] || '00')) : null; };
const numKey = v => /^-?\d+([.,]\d+)?$/.test(v) ? parseFloat(v.replace(',', '.')) : null;
function cmpCells(x, y){
  const dx = dateKey(x), dy = dateKey(y); if (dx !== null && dy !== null) return dx - dy;
  const nx = numKey(x), ny = numKey(y); if (nx !== null && ny !== null) return nx - ny;
  return x.localeCompare(y, 'de', {numeric: true});
}
function applyView(t){
  const s = TBL[tableKey(t)], head = t.tHead && t.tHead.rows[0];
  if (!s || !head) return;
  const heads = [...head.cells];
  const ciAt = heads.map(th => +th.dataset.ci);                 // visual position -> original column
  heads.forEach(th => th.dataset.sort = s.sort && +th.dataset.ci === s.sort.ci ? (s.sort.dir > 0 ? 'asc' : 'desc') : '');
  const rows = [...t.tBodies].flatMap(tb => [...tb.rows]);
  const at = (row, ci) => { const c = row.cells[ciAt.indexOf(ci)]; return c ? c.textContent.trim() : ''; };
  const filters = Object.entries(s.filters).filter(([, q]) => q);
  rows.forEach(r => { r.style.display = filters.every(([ci, q]) => at(r, +ci).toLowerCase().includes(q.toLowerCase())) ? '' : 'none'; });
  if (s.sort){
    rows.sort((a, b) => s.sort.dir * cmpCells(at(a, s.sort.ci), at(b, s.sort.ci)));
    const tb = t.tBodies[0]; if (tb) rows.forEach(r => tb.appendChild(r));
  }
}
function resizeStart(e, t, th){
  e.preventDefault(); e.stopPropagation();
  const s = TBL[tableKey(t)], x0 = e.clientX, w0 = th.getBoundingClientRect().width;
  const move = ev => { th.style.width = Math.max(40, w0 + ev.clientX - x0) + 'px'; t.style.tableLayout = 'fixed'; };
  const up = () => {
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
    s.widths[th.dataset.ci] = Math.round(th.getBoundingClientRect().width); saveTBL(); applyTable(t);
  };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
}
function setupTable(t){
  const head = t.tHead && t.tHead.rows[0];
  if (!head || t.dataset.tb) return;
  t.dataset.tb = '1';
  const key = tableKey(t);
  const n = head.cells.length;
  const s = TBL[key] || (TBL[key] = {order: null, widths: {}, filters: {}, sort: null});
  s.filters ??= {}; s.sort ??= null;
  if (!s.order || s.order.length !== n) s.order = [...Array(n).keys()];
  [...head.cells].forEach((th, i) => th.dataset.ci = i);
  /* A filter box under each header, on the big tables only. */
  if (!t.classList.contains('mini')){
    const fr = document.createElement('tr'); fr.className = 'fr';
    [...head.cells].forEach((th, i) => {
      const c = document.createElement('th');
      const inp = document.createElement('input');
      inp.placeholder = 'filter'; inp.value = s.filters[i] || ''; inp.draggable = false; inp.setAttribute('aria-label', 'Filter ' + th.textContent.trim());
      inp.addEventListener('input', () => { const cur = TBL[tableKey(t)]; cur.filters[i] = inp.value; saveTBL(); applyView(t); });
      c.appendChild(inp); fr.appendChild(c);
    });
    head.parentNode.appendChild(fr);
  }
  [...t.rows].forEach(r => r._orig = [...r.cells]);
  [...head.cells].forEach(th => {
    th.draggable = true;
    const rz = document.createElement('span'); rz.className = 'rz'; th.appendChild(rz);
    rz.addEventListener('pointerdown', e => resizeStart(e, t, th));
    th.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', th.dataset.ci); e.dataTransfer.effectAllowed = 'move'; });
    th.addEventListener('click', e => {
      if (e.target.classList.contains('rz')) return;
      const cur = TBL[tableKey(t)], ci = +th.dataset.ci;
      cur.sort = cur.sort && cur.sort.ci === ci ? {ci, dir: -cur.sort.dir} : {ci, dir: 1};
      saveTBL(); applyView(t);
    });
    th.addEventListener('dragover', e => { e.preventDefault(); th.classList.add('over'); });
    th.addEventListener('dragleave', () => th.classList.remove('over'));
    th.addEventListener('drop', e => {
      e.preventDefault(); th.classList.remove('over');
      const from = +e.dataTransfer.getData('text/plain'), to = +th.dataset.ci;
      const s2 = TBL[tableKey(t)];
      if (from === to || !s2) return;
      const fromPos = s2.order.indexOf(from), toPos = s2.order.indexOf(to);
      s2.order.splice(fromPos, 1);
      const newTo = s2.order.indexOf(to);
      s2.order.splice(fromPos < toPos ? newTo + 1 : newTo, 0, from);
      saveTBL(); applyTable(t);
    });
  });
  applyTable(t);
}
/* Any table drawn later, in the page or in a dialog, gets the same behaviour. */
new MutationObserver(() => document.querySelectorAll('table.grid').forEach(setupTable)).observe(document.body, {childList: true, subtree: true});

/* ---------- render ---------- */
function render(){
  renderSide(); renderTabs();
  if (st.tab === 'cards') renderCards();
  else if (st.tab === 'table') renderTable();
  else if (st.tab === 'map') renderMap();
  else if (st.tab === 'net') renderNet();
  else if (st.tab === 'rack') renderRack();
  else if (st.tab === 'sw') renderSoftware();
  else renderObj(byId(st.tab));
  $('#stObjs').textContent = objs.length + ' objects';
  $('#stRels').textContent = rels.length + ' relations';
  applyRole();
  saveData();
}
/* Everything is kept in this browser (not on a server yet), so a reload keeps the work. */
/* The inventory as one object. The server stores it; without a server it stays in this browser. */
const snapshot = () => ({objs: objs.map(o => ({...o})), rels, history, users: USERS, locs: LOCS, racks: RACKS, types: TYPES,
  policy: st.policy, feedOn: st.feedOn, feedSync: st.feedSync, ldap: st.ldap, mapPos: st.mapPos, seq, codeN, rseq});
const SERVER = {on: false, ldap: false, lansweeper: false, last: null, timer: null};
function saveData(){
  if (SERVER.on){ queueServerSave(); return; }
  try { localStorage.setItem('ni-data', JSON.stringify({...snapshot(), meId: st.meId})); } catch(e) {}
}
function queueServerSave(){
  if (!SERVER.last) return;   /* nothing has been loaded yet */
  clearTimeout(SERVER.timer);
  SERVER.timer = setTimeout(async () => {
    if (!canEdit()) return;
    const body = JSON.stringify(snapshot());
    if (body === SERVER.last) return;
    try {
      const r = await fetch('api/state', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body, credentials: 'same-origin'});
      if (r.status === 401){ loginModal('Your sign-in has ended. Sign in again.'); return; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok){ toast('Not saved: ' + (j.error || r.status)); return; }
      SERVER.last = body;
    } catch(e) { toast('Not saved: the server cannot be reached.'); }
  }, 400);
}
function applyState(d){
  objs.splice(0, objs.length, ...d.objs);
  rels.splice(0, rels.length, ...d.rels);
  Object.keys(history).forEach(k => delete history[k]); Object.assign(history, d.history);
  USERS = d.users; LOCS.splice(0, LOCS.length, ...d.locs); RACKS.splice(0, RACKS.length, ...(d.racks || []));
  if (d.types){   /* a new server has no types saved yet: it gets the built-in ones */
    const t = Object.keys(d.types).length ? d.types : DEFAULT_TYPES;
    Object.keys(TYPES).forEach(k => delete TYPES[k]); Object.assign(TYPES, JSON.parse(JSON.stringify(t)));
  }
  /* A new server has no saved policy yet: start from the defaults so the Settings panes can be drawn. */
  Object.assign(st, {policy: d.policy || {ip:true, mac:true, os:true, model:true, cpu:true, ram:true, fw:true, user:false, loc:false, status:false}, feedOn: d.feedOn ?? true, feedSync: d.feedSync ?? true, ldap: d.ldap ?? {url: '', bindDn: '', base: '', filter: '', group: '', nightly: true, disable: true, last: null}, mapPos: d.mapPos || {}});
  seq = d.seq; codeN = d.codeN; rseq = d.rseq;
  objs.forEach(bindUser);
}
function loadData(){
  let d = null; try { d = JSON.parse(localStorage.getItem('ni-data') || 'null'); } catch(e) {}
  if (!d) return;
  applyState(d);
  st.meId = d.meId ?? null;
}
/* Reset: in this browser it forgets the saved copy. On the server it clears the devices, relations and history
   for everyone, and keeps users, locations, types and the saved settings. The admin's button needs a second click. */
async function resetDemo(){
  if (SERVER.on){
    if (!canEdit()){ toast('Only an admin can clear the inventory.'); return; }
    objs.length = 0; rels.length = 0; Object.keys(history).forEach(k => delete history[k]);
    try {
      const r = await fetch('api/state', {method: 'PUT', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify(snapshot())});
      if (!r.ok){ toast('Not cleared: ' + ((await r.json().catch(() => ({}))).error || r.status)); return; }
      SERVER.last = JSON.stringify(snapshot());
    } catch(e) { toast('Not cleared: the server cannot be reached.'); return; }
    closeModal(); toast('Inventory cleared on the server'); render(); return;
  }
  try { localStorage.removeItem('ni-data'); localStorage.removeItem('ni-cols'); localStorage.removeItem('ni-started'); } catch(e) {}
  location.reload();
}
/* Keyboard: N new object, / search, C T M R switch views, ? the list. Not while typing or in a dialog. */
const SHORTCUTS = [['N','New object'],['/','Search'],['C','Cards'],['T','Table'],['M','Relationships'],['R','Racks'],['Esc','Close a dialog'],['?','This list']];
function shortcutsModal(){
  modal(`<div class="mh">Keyboard shortcuts</div><div class="mb"><table class="grid mini" style="min-width:0"><tbody>
    ${SHORTCUTS.map(([k, t]) => `<tr><td class="mono"><b>${k}</b></td><td>${t}</td></tr>`).join('')}</tbody></table></div>
    <div class="mf"><button id="scClose" class="primary">Done</button></div>`, 'sm');
  $('#scClose').onclick = closeModal;
}
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest('input, textarea, select') || $('#mdl')) return;
  const key = e.key.toLowerCase();
  if (e.key === '?'){ e.preventDefault(); shortcutsModal(); return; }
  if (e.key === '/'){ e.preventDefault(); $('#search').focus(); return; }
  if (key === 'n' && canEdit()){ e.preventDefault(); newObjModal(); return; }
  const tab = {c: 'cards', t: 'table', m: 'map', r: 'rack'}[key];
  if (tab){ st.tab = tab; render(); }
});

/* First run: choose demo or an empty inventory. Once chosen, it is not asked again. */
function welcome(){
  modal(`<div class="mh">Welcome to NOBS Inventory</div>
    <div class="mb"><p class="note">Start with a demo inventory to see how the app works, or with an empty one to enter your own.</p></div>
    <div class="mf"><button id="wEmpty">Start empty</button>${SERVER.on ? '' : '<button id="wDemo" class="primary">Load demo</button>'}</div>`, 'sm');
  const done = () => { try { localStorage.setItem('ni-started', '1'); } catch(e) {} closeModal(); render(); saveData(); };
  if (SERVER.on) $('#wEmpty').classList.add('primary');
  if ($('#wDemo')) $('#wDemo').onclick = () => startDemo().then(done);
  $('#wEmpty').onclick = () => { objs.length = 0; rels.length = 0; Object.keys(history).forEach(k => delete history[k]); USERS = USERS.filter(u => u.id === st.meId); done(); };
}
/* The sample inventory is in demo.js. It is loaded only when a browser asks for the demo, never on a server. */
function loadDemo(){
  return new Promise((ok, fail) => {
    if (window.NI_DEMO) return ok();
    const s = document.createElement('script');
    s.src = 'demo.js';
    s.onload = ok;
    s.onerror = () => fail(new Error('demo.js could not be loaded'));
    document.head.append(s);
  });
}
async function startDemo(){
  try { await loadDemo(); } catch(e) { toast('The demo could not be loaded.'); return; }
  const d = window.NI_DEMO(SYNC_TIME);
  const me0 = USERS.find(u => u.id === st.meId);
  if (me0 && !d.users.some(u => u.id === me0.id)) d.users.push(me0);   /* keep the signed-in user in the list */
  applyState(d);
  FEED_MAP = d.feedMap; FEED_EXISTING = d.feedExisting; FEED_NEW = d.feedNew; LDAP_SAMPLE = d.ldapSample;
  if (!st.meId) st.meId = (USERS.find(u => u.role === 'admin') || USERS[0]).id;
}
/* The version comes from the server. It is shown in the footer and in Settings → About. */
async function loadVersion(){
  if (!APP_VERSION){
    try { const r = await fetch('api/health', {credentials: 'same-origin'}); if (r.ok) APP_VERSION = (await r.json()).version || ''; } catch(e) {}
  }
  const foot = $('#verFoot'); if (foot) foot.textContent = 'NOBS Inventory ' + APP_VERSION;
  return APP_VERSION;
}
async function boot(){
  loadVersion();
  let info = null;
  try { const r = await fetch('api/me', {credentials: 'same-origin'}); if (r.ok) info = await r.json(); } catch(e) { info = null; }
  if (!info){
    loadData();
    if (!st.meId && USERS.length) st.meId = (USERS.find(u => u.role === 'admin') || USERS[0]).id;
    if (!localStorage.getItem('ni-started') && !localStorage.getItem('ni-data')) welcome();
    render();
    return;
  }
  SERVER.on = true; SERVER.ldap = info.ldap; SERVER.lansweeper = info.lansweeper;
  if (!info.user){ clearInventory(); render(); loginModal(); return; }
  await loadFromServer(info.user);
}
/* Before sign-in the page holds no inventory. */
function clearInventory(){
  objs.length = 0; rels.length = 0; LOCS.length = 0; RACKS.length = 0; USERS = [];
  Object.keys(history).forEach(k => delete history[k]);
  st.open = []; st.tab = 'cards';
}
async function loadFromServer(user){
  const r = await fetch('api/state', {credentials: 'same-origin'});
  if (r.status === 401){ loginModal(); return; }
  if (!r.ok){ toast('The inventory could not be loaded.'); return; }
  const d = await r.json();
  applyState(d);
  document.body.classList.remove('signed-out');
  st.meId = user.id;
  SERVER.last = JSON.stringify(snapshot());
  if (!objs.length && !localStorage.getItem('ni-started')) welcome();
  render();
}
/* Sign in with a login and password. The server checks the account, or the directory when LDAP is set up. */
function loginModal(err = '', login = ''){
  document.body.classList.add('signed-out');
  modal(`<div class="mh">Sign in to NOBS Inventory</div>
    <div class="mb"><form id="loginForm" class="form" style="padding:0">
      <label for="lgUser">Login</label><input id="lgUser" value="${esc(login)}" autocomplete="username" required>
      <label for="lgPw">Password</label><input id="lgPw" type="password" autocomplete="current-password" required>
    </form><p class="note" id="lgErr" style="color:var(--danger)">${esc(err)}</p></div>
    <div class="mf"><button id="lgOk" class="primary">Sign in</button></div>`, 'sm free locked');
  const go = async () => {
    const login = $('#lgUser').value;
    const r = await fetch('api/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin',
      body: JSON.stringify({login, password: $('#lgPw').value})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ loginModal(j.error || 'Sign in failed.', login); return; }
    closeModal(); await loadFromServer(j.user);
  };
  $('#lgOk').onclick = go;
  $('#loginForm').addEventListener('submit', e => { e.preventDefault(); go(); });
  (login ? $('#lgPw') : $('#lgUser')).focus();
}
async function signOut(){
  await fetch('api/logout', {method: 'POST', credentials: 'same-origin'});
  location.reload();
}
boot();
