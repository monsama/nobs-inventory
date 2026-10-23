/* ---------- icons ---------- */
/* One icon by its name, for the picker in Settings. */
const iconSvg = name => `<svg class="i" viewBox="0 0 24 24">${ICON[name] || ICON.other}</svg>`;
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
  vm:{label:'Virtual machine', short:'VM', color:'#7c3aed', icon:'server'},
  accesspoint:{label:'Access point', short:'AP', color:'#0891b2', icon:'accesspoint'},
  sip:{label:'VoIP phone', short:'VoIP', color:'#15803d', icon:'sip'},
  tablet:{label:'Tablet', short:'Tablet', color:'#db2777', icon:'tablet'},
  monitor:{label:'Monitor', short:'Monitor', color:'#64748b', icon:'monitor'},
  switch:{label:'Switch', short:'Switch', color:'#ea580c', icon:'switch'},
  printer:{label:'Printer', short:'Printer', color:'#a16207', icon:'printer'},
  patch:{label:'Patch panel', short:'Patch', color:'#0f766e', icon:'patch'},
  router:{label:'Router', short:'Router', color:'#1e3a8a', icon:'router'},
  firewall:{label:'Firewall', short:'Firewall', color:'#b91c1c', icon:'firewall'},
  modem:{label:'Modem', short:'Modem', color:'#78716c', icon:'modem'},
  storage:{label:'Storage', short:'Storage', color:'#0891b2', icon:'storage'},
  iphone:{label:'iPhone', short:'iPhone', color:'#65a30d', icon:'mobile'},
  android:{label:'Android phone', short:'Android', color:'#84cc16', icon:'mobile'},
  smartphone:{label:'Other smartphone', short:'Phone', color:'#65a30d', icon:'mobile'},
  other:{label:'Other', short:'Other', color:'#5a6b7d', icon:'other'}
};
/* Built-in types the rest of the app relies on: they can be renamed and recoloured, not deleted. */
/* A copy of the built-in types, used when a server has none saved yet. */
const DEFAULT_TYPES = JSON.parse(JSON.stringify(TYPES));
const BUILTIN = ['pc','server','vm','accesspoint','sip','tablet','monitor','switch','printer','patch','other'];
const STATUS = {active:{label:'In use',cls:'ok'}, stock:{label:'In stock',cls:''}, repair:{label:'In repair',cls:'warn'}, retired:{label:'Retired',cls:'bad'}};
const LOCS = [];
/* Sites are kept as their own list, so a site can exist before it has any rooms. A location is a room within a site. */
const SITES = [];
let RACKS = [];
let PLANS = [];
const FIELD_LABEL = {ip:'IP address', ip6:'IPv6 address', mac:'MAC address', os:'Operating system', model:'Model', cpu:'CPU', ram:'Memory', fw:'Firmware', boot:'Last power event', disk:'Disks', patch:'Last update', av:'Antivirus', user:'User', loc:'Location', status:'Status'};
const SYNC_TIME = '21.10.2026 06:00';
/* A relation always reads from -> to: "MON-0412 attached to ZH-PC-0142". The port belongs to the "to" end. */
const KINDS = {
  attached:{fwd:'attached to', rev:'has attached'},
  hosted:{fwd:'runs on', rev:'hosts'},
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
/* Ids are random so two people creating things at once cannot pick the same one. Object codes are given by the server when the object is first saved. */
const rid = () => Math.random().toString(36).slice(2, 10);
const F = (ref, seen) => ({sys:'Lansweeper', ref, seen});
const O = (type, name, f) => ({id:'o'+rid(), code:null, type, name, status:'active', feed:null, ovr:{}, ...f});

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
const st = {type:null, loc:null, status:null, q:'', tab:'cards', open:[], tabIds:['cards','table','map','plans','net','rack','sw'], swSel:null, cardsGroup:'none', searchAll:false, netSw:null, netPort:3,
  rackId:null, setTab:'feed', feedOn:true, feedSync:true, mapOnly:true, mapLabels:false, mapFind:'', mapPos:{},
  policy:{ip:true, mac:true, os:true, model:true, cpu:true, ram:true, fw:true, boot:false, disk:false, patch:false, av:false, user:false, loc:false, status:false},
  ldap:{url:'', bindDn:'', base:'', filter:'', group:'', nightly:true, disable:true, last:null}, lansweeper:{}};
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
  /* With "All devices" on, a search looks through every object; the type, place and status filters apply otherwise. */
  const scoped = !(st.searchAll && q);
  return objs.filter(o => (!scoped || ((!st.type || o.type === st.type) && (!st.loc || o.loc.startsWith(st.loc)) && (!st.status || o.status === st.status)))
    && (!q || [o.code,o.name,o.ip,o.ip6,o.mac,o.serial,o.user,o.model,o.ext].some(v => v && String(v).toLowerCase().includes(q))));
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
$('#clearF').onclick = () => { st.type = st.loc = st.status = null; st.q = ''; $('#search').value = ''; render(); };
$('#sideBtn').onclick = () => document.body.classList.toggle('side-open');

/* ---------- tabs ---------- */
/* Tabs: the views and the open objects, in one row that can be reordered by dragging, as in NOBS SQL. */
const FIXED_TABS = {cards:'Cards', table:'Table', map:'Relationships', plans:'Floor plans', net:'Switch ports', rack:'Racks', sw:'Software'};
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
    if (st.open.includes(id)) el.addEventListener('contextmenu', e => showTabMenu(e, id));
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
/* Closes every open object tab except `keep` (or all of them when keep is null). The views stay open. */
function closeObjTabs(keep){
  st.open = st.open.filter(x => x === keep);
  st.tabIds = st.tabIds.filter(x => FIXED_TABS[x] || x === keep);
  if (!FIXED_TABS[st.tab] && st.tab !== keep) st.tab = keep || 'cards';
  render();
}
let tabMenu = null;
function hideTabMenu(){ if (tabMenu){ tabMenu.remove(); tabMenu = null; } }
function showTabMenu(e, id){
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
  base:[['name','Name','mono'],['type','Type','type'],['model','Model'],['serial','Serial number','mono'],['loc','Location','loc'],['status','Status','status'],['user','User / owner','user']],
  net:[['ip','IP address','mono'],['ip6','IPv6 address','mono'],['mac','MAC address','mono']],
  pc:[['os','Operating system'],['fw','Firmware'],['boot','Last power event'],['disk','Disks'],['patch','Last update'],['av','Antivirus']], server:[['kind','Kind','kind'],['os','Operating system'],['cpu','CPU'],['ram','Memory'],['fw','Firmware'],['boot','Last power event'],['disk','Disks'],['patch','Last update'],['av','Antivirus']],
  sip:[['ext','Extension','mono'],['fw','Firmware','mono']], tablet:[['os','Operating system']],
  switch:[['os','Firmware'],['ports','Copper ports','mono'],['sfp','SFP ports','mono'],['pfx','Port naming','mono']],
  patch:[['ports','Ports','mono']], storage:[['cap','Capacity','mono'],['proto','Protocol','mono']],
  accesspoint:[['ssid','Wi-Fi networks']],
  monitor:[], printer:[], smartphone:[], other:[]
};
function fieldCtl(o, [k, label, kind], idp = 'f_'){
  const id = idp + o.id + '_' + k;
  let ctl;
  if (kind === 'loc') ctl = `<select id="${id}" data-k="${k}">${LOCS.map(l => `<option ${l===o.loc?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
  else if (kind === 'kind') ctl = `<select id="${id}" data-k="${k}"><option value="physical" ${o.kind!=='vm'?'selected':''}>Physical</option><option value="vm" ${o.kind==='vm'?'selected':''}>Virtual machine</option></select>`;
  else if (kind === 'user') ctl = `<select id="${id}" data-k="user"><option value="">Unassigned</option><option value="__hotdesk" ${o.hotdesk?'selected':''}>Hot desk (shared)</option>${USERS.map(u => `<option value="${u.id}" ${!o.hotdesk && u.id===o.uid?'selected':''}>${esc(u.name)}</option>`).join('')}</select>`;
  else if (kind === 'type') ctl = `<select id="${id}" data-k="type">${Object.entries(TYPES).map(([t, v]) => `<option value="${t}" ${t === o.type ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`;
  else if (kind === 'status') ctl = `<select id="${id}" data-k="${k}">${Object.entries(STATUS).map(([s,v]) => `<option value="${s}" ${s===o.status?'selected':''}>${v.label}</option>`).join('')}</select>`;
  else ctl = `<input id="${id}" data-k="${k}" class="${kind==='mono'?'mono':''}" value="${esc(o[k] ?? '')}">`;
  return ctl;
}
function fieldHtml(o, f){ return `<label for="f_${o.id}_${f[0]}">${f[1]}</label>${fieldCtl(o, f)}`; }
const fieldKind = k => { const f = Object.values(FIELDS).flat().find(x => x[0] === k); return f ? f[2] : undefined; };
/* One row of Properties. For an object linked to Lansweeper, a field the feed fills in is read-only while "From feed" is
   ticked; untick it to edit the value here. */
function propRow(o, f){
  const k = f[0];
  const linked = !!o.feed && !!FIELD_LABEL[k];
  const taken = linked && feedOwns(o, k);
  let ctl = fieldCtl(o, f);
  if (taken) ctl = ctl.replace(/^<(input|select)/, '<$1 disabled');
  const box = linked ? `<label class="pchk"><input type="checkbox" data-ovr="${k}" ${taken ? 'checked' : ''}> From feed</label>` : (o.feed ? '<span class="pchk-slot" aria-hidden="true"></span>' : '');
  return `<label for="f_${o.id}_${k}">${f[1]}</label><div class="ctlrow">${ctl}${box}</div>`;
}
/* Fields the feed sets for this object that the type does not show (e.g. CPU on a PC), so nothing is hidden. */
function extraRows(o, fields){
  if (!o.feed) return '';
  return Object.keys(FIELD_LABEL).filter(k => o[k] !== undefined && !fields.some(f => f[0] === k))
    .map(k => propRow(o, [k, FIELD_LABEL[k], fieldKind(k)])).join('');
}
/* Source of the object: where it came from and when Lansweeper last saw it. */
function feedPanel(o){
  if (!o.feed) return `<div class="panelbox"><div class="hdr">Source</div>
    <dl class="lsbox"><dt>Source</dt><dd style="font-family:inherit">Entered by hand</dd>${o.excluded ? '<dt>Sync</dt><dd style="font-family:inherit">Excluded: the Lansweeper sync does not change this object</dd>' : ''}</dl>
    <p class="note" style="padding:10px 12px">A Lansweeper export matches this object by serial number and fills in the fields the policy allows.</p></div>`;
  return `<div class="panelbox"><div class="hdr">Lansweeper <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${esc(o.feed.sys)} · ${esc(o.feed.ref)}</span></div>
    <dl class="lsbox"><dt>Matched by</dt><dd style="font-family:inherit">Serial number</dd><dt>Last seen</dt><dd style="font-family:inherit">${esc(o.feed.seen)}</dd>${o.excluded ? '<dt>Sync</dt><dd style="font-family:inherit">Excluded: the sync does not change this object</dd>' : ''}</dl>
    <div class="addrel"><span class="note" style="flex:1">Ticked fields come from Lansweeper and are read-only. Untick one to edit it. Name and serial number are never overwritten.</span><button id="detachFeed">Detach</button></div></div>`;
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
/* Deletes an object for good, with its relations and history. Retiring is the way to keep the record. */
function purgeModal(o){
  modal(`<div class="mh">Delete ${esc(o.name)}?</div>
    <div class="mb"><p class="note">This removes the object, its relations and its history for good. Retire keeps the record instead. Devices that were plugged into it or mounted on top of it stay, without that link.</p></div>
    <div class="mf"><button id="pgCancel">Cancel</button><button id="pgOk" class="danger-text">Delete permanently</button></div>`, 'sm');
  $('#pgCancel').onclick = closeModal;
  $('#pgOk').onclick = () => { deleteObject(o.id); closeModal(); toast(`${o.name} deleted`); };
}
function deleteObject(id){
  const i = objs.findIndex(x => x.id === id); if (i < 0) return;
  objs.splice(i, 1);
  for (let k = rels.length - 1; k >= 0; k--) if (rels[k].from === id || rels[k].to === id) rels.splice(k, 1);
  objs.forEach(x => { if (x.ontop === id) delete x.ontop; });
  delete history[id];
  st.open = st.open.filter(x => x !== id); st.tabIds = st.tabIds.filter(x => x !== id);
  if (st.tab === id) st.tab = 'table';
  render();
}
function renderObj(o){
  const rs = relsOf(o);
  const fields = [...FIELDS.base, ...(o.type === 'monitor' ? [] : FIELDS.net), ...(FIELDS[o.type] || [])];
  const chain = pathUp(o);
  const targets = objs.filter(x => x.id !== o.id);
  const rk = o.rack ? RACKS.find(r => r.id === o.rack) : null;
  $('#toolbar').innerHTML = `${tico(o.type)}<b class="mono">${esc(o.name)}</b><span class="code">${esc(o.code)}</span><span class="muted hide-n">${TYPES[o.type].label}</span>
    <span class="chip ${STATUS[o.status].cls}">${STATUS[o.status].label}</span><div class="grow"></div>
    <details class="menu"><summary>More</summary><div class="menubox"><button id="dupBtn">Duplicate</button><button id="delBtn">Retire…</button>${canEdit() ? (o.excluded ? '<button id="exclBtn">Include in sync</button>' : '<button id="exclBtn">Exclude from sync</button><button id="exclRelBtn">Exclude with its relations</button>') : ''}${canEdit() ? '<button id="purgeBtn" class="danger-text">Delete permanently…</button>' : ''}</div></details><button id="saveBtn" class="primary" disabled>Save</button>`;
  $('#view').innerHTML = `<div class="obj">
    <div class="col">
      <div class="panelbox"><div class="hdr">Properties</div><div class="form">${fields.map(f => propRow(o, f)).join('')}${extraRows(o, fields)}
        ${rackFields(o)}
        ${o.type === 'pc' ? `<label for="f_${o.id}_attach">Attachments</label><textarea id="f_${o.id}_attach" data-k="attach" rows="2" placeholder="Headset, mouse, keyboard, dock…">${esc(o.attach||'')}</textarea>` : ''}
        <label for="f_${o.id}_notes">Notes</label><textarea id="f_${o.id}_notes" data-k="notes" rows="3" placeholder="Anything that is not in a field: warranty, purchase order, quirks…">${esc(o.notes||'')}</textarea></div></div>
      ${feedPanel(o)}
    </div>
    <div class="col">
      ${o.type === 'patch' ? patchPanel(o) : ''}
      ${SW_TYPES.includes(o.type) ? softwarePanel(o) : ''}
      <div class="panelbox"><div class="hdr">Relations <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${rs.length}</span></div>
        <div class="relist">${rs.length ? rs.map(x => `<div class="relrow"><span class="k">${x.label}</span><span class="t">${tico(x.other.type,'tico sm')}<a class="link" data-open="${x.other.id}">${esc(x.other.name)}</a>${['switch','patch'].includes(byId(x.r.to).type) ? `<input class="rport" data-rport="${x.r.id}" value="${esc(x.r.port ?? '')}" placeholder="Port" aria-label="Port on ${esc(x.other.name)}" style="width:80px">` : (x.port ? `<span class="p">${x.out ? '' : 'on '}${esc(x.port)}</span>` : '')}${x.r.vlan ? `<span class="chip">VLAN ${esc(x.r.vlan)}</span>` : ''}</span><button class="icon ghost" data-delrel="${x.r.id}" title="Remove relation" aria-label="Remove relation">×</button></div>`).join('') : '<div class="relrow muted">No relations yet. Add one below.</div>'}</div>
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
    $('#arTo').innerHTML = '<option value="">— choose —</option>' + targets.filter(t => KIND_TARGETS[k].includes(t.type) && (k !== 'hosted' || t.kind !== 'vm')).map(t => `<option value="${t.id}">${esc(t.name)} (${TYPES[t.type].short})</option>`).join('');
    $('#arPort').placeholder = k === 'connected' || k === 'uplink' ? 'Port no.' : k === 'patched' ? 'Panel port, e.g. P04' : 'Port (opt.)';
  };
  $('#arKind').innerHTML = Object.entries(KINDS).map(([k,v]) => `<option value="${k}">${v.fwd}</option>`).join('');
  $('#arKind').value = o.type === 'monitor' ? 'attached' : 'connected'; fitTargets();
  $('#arKind').onchange = fitTargets;
  $('#arAdd').onclick = () => {
    const to = $('#arTo').value ? byId($('#arTo').value) : null;
    if (!to){ toast('Choose what to connect to first.'); return; }
    let port = $('#arPort').value.trim(); if (/^\d+$/.test(port) && to.type === 'switch') port = +port;
    if (to.type === 'switch' && typeof port === 'number' && to.ports && port > to.ports){ toast(`${port} is above the ${to.ports} ports of ${to.name}. Raise its port count first.`); return; }
    if (to.type === 'switch' && typeof port === 'number' && rels.some(r => r.to === to.id && r.port === port)){ toast(to.pfx + port + ' on ' + to.name + ' is already taken. Pick a free port.'); return; }
    if (to.type === 'patch' && rels.some(r => r.to === to.id && r.port === port.toUpperCase())){ toast(port.toUpperCase() + ' on ' + to.name + ' is already taken.'); return; }
    const k = $('#arKind').value;
    const finalPort = port === '' ? null : (to.type === 'patch' ? port.toUpperCase() : port);
    if (rels.some(r => r.from === o.id && r.to === to.id && r.kind === k && String(r.port) === String(finalPort))){ toast('That relation already exists.'); return; }
    if (finalPort != null && rels.some(r => r.to === to.id && String(r.port) === String(finalPort) && (to.type === 'switch' || to.type === 'patch'))){ toast(`${finalPort} on ${to.name} is already taken.`); return; }
    rels.push({id:'r'+rid(), from:o.id, to:to.id, kind:k, port:finalPort, vlan:null});
    hist(o, now(), `Relation "${KINDS[k].fwd} ${to.name}" added by ${who()}`);
    toast('Relation added'); render();
  };
  $('#view').querySelectorAll('[data-delrel]').forEach(b => b.onclick = () => { const i = rels.findIndex(r => r.id === b.dataset.delrel); rels.splice(i, 1); toast('Relation removed'); render(); });
  $('#view').querySelectorAll('[data-rport]').forEach(i => i.onchange = () => {
    const r = rels.find(x => x.id === i.dataset.rport); if (!r) return;
    const to = byId(r.to); let p = i.value.trim();
    if (!p){ toast('A connection to a switch needs a port.'); render(); return; }
    if (to.type === 'switch' && /^\d+$/.test(p)) p = +p;
    if (to.type === 'patch') p = p.toUpperCase();
    if (to.type === 'switch' && typeof p === 'number' && to.ports && p > to.ports){ toast(`${p} is above the ${to.ports} ports of ${to.name}. Raise its port count first.`); render(); return; }
    if (rels.some(x => x !== r && x.to === to.id && String(x.port) === String(p))){ toast(`${p} on ${to.name} is already taken.`); render(); return; }
    r.port = p;
    hist(byId(r.from), now(), `Port on ${to.name} set to ${p} by ${who()}`);
    toast('Port set'); render();
  });
  $('#view').querySelectorAll('[data-ovr]').forEach(c => c.onchange = () => {
    const k = c.dataset.ovr;
    o.ovr[k] = c.checked;
    hist(o, now(), `${FIELD_LABEL[k]}: ${c.checked ? 'taken from feed' : 'kept as set here'} (object override)`);
    toast(`${FIELD_LABEL[k]} ${c.checked ? 'follows the feed' : 'is kept as set here'}`); render();
  });
  $('#saveBtn').onclick = () => {
    /* Addresses are checked before anything is saved; a bad one stays in its field so it can be corrected. */
    const addrs = [...$('#view').querySelectorAll('[data-k="ip"],[data-k="ip6"],[data-k="mac"]')];
    const checked = addrs.map(el => ({ el, c: checkAddress(el.dataset.k, el.value) }));
    const wrong = checked.find(x => !x.c.ok);
    if (wrong){ toast(wrong.c.msg); wrong.el.focus(); return; }
    checked.forEach(x => { x.el.value = x.c.value; });
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
      if (k === 'user'){ if (v === '__hotdesk'){ o.hotdesk = true; o.uid = null; } else { delete o.hotdesk; o.uid = v || null; } return; }
      if (['ports','sfp'].includes(k)) v = +v || 0;
      if (k === 'type' && o.type !== v && TYPES[v]){ hist(o, now(), `Type changed from ${TYPES[o.type] ? TYPES[o.type].label : o.type} to ${TYPES[v].label} by ${who()}`); }
      if (k === 'ports' && o.type === 'switch' && v < (o.ports || 0) && rels.some(r => r.to === o.id && typeof r.port === 'number' && r.port > v)){ toast(`Ports in use above ${v} block this change. Move or remove those connections first.`); v = o.ports; }
      if (o.feed && FIELD_LABEL[k] && o[k] !== v){ o.ovr[k] = false; kept.push(FIELD_LABEL[k]); }
      o[k] = v;
    });
    if (place){
      delete o.rack; delete o.u; delete o.h; delete o.ontop;
      Object.assign(o, place);
      if (place.ontop) delete o.u;
    }
    if (o.type === 'server' && o.kind === 'vm') delete o.rack, delete o.u, delete o.h, delete o.ontop;
    hist(o, now(), 'Saved by ' + who() + (kept.length ? ' · kept from feed: ' + kept.join(', ') : ''));
    toast('Saved ' + o.name + (kept.length ? '. Kept from feed: ' + kept.join(', ') : '')); render();
  };
  $('#dupBtn').onclick = () => newObjModal({copy: o});
  $('#delBtn').onclick = () => { o.status = 'retired'; hist(o, now(), 'Retired by ' + who()); toast(o.name + ' marked as retired. It stays in the inventory for the record.'); render(); };
  const pg = $('#purgeBtn'); if (pg) pg.onclick = () => purgeModal(o);
  /* Excluded objects are not changed by a Lansweeper sync. The relations option also excludes the objects o is related to. */
  const eb = $('#exclBtn');
  if (eb) eb.onclick = () => {
    o.excluded = !o.excluded;
    hist(o, now(), (o.excluded ? 'Excluded from Lansweeper sync' : 'Back in Lansweeper sync') + ' by ' + who());
    toast(o.name + (o.excluded ? ' is excluded from the sync' : ' is back in the sync')); render();
  };
  const er = $('#exclRelBtn');
  if (er) er.onclick = () => {
    o.excluded = true; hist(o, now(), 'Excluded from Lansweeper sync with its relations by ' + who());
    let n = 0;
    rels.forEach(r => {
      const other = r.from === o.id ? byId(r.to) : r.to === o.id ? byId(r.from) : null;
      if (other && !other.excluded){ other.excluded = true; hist(other, now(), 'Excluded from Lansweeper sync with ' + o.name + ' by ' + who()); n++; }
    });
    toast(o.name + ' and ' + n + ' related object' + (n === 1 ? '' : 's') + ' are excluded from the sync'); render();
  };

  const df = $('#detachFeed'); if (df) df.onclick = () => { o.feed = null; hist(o, now(), 'Detached from feed by ' + who()); toast(o.name + ' is now a manual object'); render(); };
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
const SET_TABS = [['feed','Feed'],['locations','Locations'],['types','Object types'],['users','Users'],['ldap','LDAP sync'],['policy','Feed fields'],['maintenance','Maintenance'],['log','Log'],['about','About']];
function openSettings(){
  modal(`<div class="mh">Settings</div>
    <div class="settabs" id="setTabs">${SET_TABS.map(([k,l]) => `<button class="tab" data-st="${k}">${l}</button>`).join('')}</div>
    <div class="mb" id="setPane"></div>
    <div class="mf">${canEdit() ? '<button id="setReset" style="margin-right:auto">Clear inventory</button>' : '<span style="margin-right:auto"></span>'}<button id="setClose" class="primary">Done</button></div>`, 'settings');
  $('#setTabs').addEventListener('click', e => { const t = e.target.closest('[data-st]'); if (!t) return; st.setTab = t.dataset.st; renderSetPane(); });
  $('#setClose').onclick = () => { closeModal(); render(); };
  const sr = $('#setReset');
  if (sr) sr.onclick = () => clearConfirm();
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
    policy: `<div class="panelbox"><div class="hdr">Feed may overwrite</div>${policyGrid()}<p class="note" style="padding:10px 12px">Default for every object. Each object can override it on its own page. Name and serial number are match keys and are never overwritten.</p></div>`,
    maintenance: '<div id="setMaint"></div>',
    log: '<div id="setLog"></div>',
    about: '<div id="setAbout"></div>'
  }[st.setTab];
  pane.innerHTML = html;
  bindPolicy(pane);
  ({feed: renderSetFeed, locations: renderSetLocs, types: renderSetTypes, users: renderSetUsers, ldap: renderSetLdap, policy: () => {}, maintenance: renderSetMaint, log: renderSetLog, about: renderSetAbout})[st.setTab]();
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
const devicesOf = name => objs.filter(o => o.user === name).length;
const me = () => USERS.find(u => u.id === st.meId);
/* The name the history records for the signed-in person. */
const who = () => (me() && me().name) || 'someone';
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
    get(){ if (this.hotdesk) return 'Hot desk'; const u = USERS.find(x => x.id === this.uid); return u ? u.name : ''; },
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
      <td>${SERVER.on && u.login && u.source !== 'ldap' ? `<button data-pw="${i}" title="Set this user's password">Password</button>` : ''}</td>
      <td><button class="icon ghost" data-del="${i}" ${u.source === 'ldap' ? 'disabled title="Managed by LDAP"' : devicesOf(u.name) ? 'disabled title="Has devices. Move them first."' : 'title="Remove"'} aria-label="Remove user">×</button></td></tr>`).join('');
  $('#setUsers').innerHTML = `<div class="panelbox"><div class="hdr">Users <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${USERS.filter(u => u.active).length} active</span></div>
    <div style="overflow-x:auto"><table class="grid mini" style="min-width:920px;table-layout:fixed"><colgroup><col style="width:17%"><col style="width:10%"><col style="width:12%"><col style="width:14%"><col style="width:9%"><col style="width:8%"><col style="width:10%"><col style="width:8%"><col style="width:12%"><col style="width:5%"></colgroup><thead><tr><th>Name</th><th>Login</th><th>Department</th><th>Groups</th><th>Source</th><th>Devices</th><th>Role</th><th>Active</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="addrel"><input id="nuFirst" placeholder="First name" style="min-width:130px" aria-label="First name"><input id="nuLast" placeholder="Last name" style="min-width:130px" aria-label="Last name"><input id="nuDept" placeholder="Department" style="min-width:120px" aria-label="Department"></div>
    <div class="addrel"><input id="nuLogin" placeholder="Login (optional, lets them sign in)" style="min-width:200px" aria-label="Login" autocomplete="off"><input id="nuPw" type="password" placeholder="Password (min. 8)" style="min-width:160px" aria-label="Password" autocomplete="new-password"><select id="nuRole" aria-label="Role"><option value="viewer">Viewer</option><option value="admin">Admin</option></select><button id="nuAdd" class="primary">Add user</button></div></div>
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
  $('#nuAdd').onclick = async () => {
    const first = $('#nuFirst').value.trim(), last = $('#nuLast').value.trim();
    const name = [first, last].filter(Boolean).join(' ');
    const login = $('#nuLogin').value.trim(), pw = $('#nuPw').value;
    if (!name){ toast('Give the user a first or last name.'); return; }
    if (USERS.some(u => u.name.toLowerCase() === name.toLowerCase())){ toast(name + ' is already a user.'); return; }
    if (login && USERS.some(u => (u.login || '').toLowerCase() === login.toLowerCase())){ toast('That login is already used.'); return; }
    if (login && pw.length < 8){ toast('The password needs at least 8 characters.'); return; }
    const u = {id:userId(), login, first, last, name, dept:$('#nuDept').value.trim(), role:$('#nuRole').value, groups:[], source:'manual', active:true};
    USERS.push(u); queueServerSave();
    if (login){
      await flushSave();
      const r = await fetch('api/users/' + encodeURIComponent(u.id) + '/password', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({password: pw})});
      if (!r.ok){ toast('Added ' + name + ', but the password was not set. Use Password in the list.'); renderSetUsers(); return; }
    }
    toast('Added ' + name); renderSetUsers();
  };
}
/* Shows one user's devices in Cards, by searching for the name. */
function showDevicesOf(name){
  closeModal();
  st.q = name; $('#search').value = name; st.tab = 'cards'; st.cardsGroup = 'none';
  render();
}

/* LDAP: the directory settings live on the server (NI_LDAP_* variables). Here the status and a sync. */
/* Maintenance: the factory reset. Only an admin can use it, and it asks for the typed word first. */
/* The log: what was synced, saved, restored and signed in, and what failed. */
let LOG_FILTER = 'all';
const LOG_KINDS = [['all', 'All'], ['errors', 'Errors'], ['sync', 'Sync and push'], ['backup', 'Backups'], ['access', 'Access']];
const logKind = e => /backup|restor/i.test(e.action) ? 'backup' : /sign in|password|login|user|removed by/i.test(e.action) ? 'access' : /sync|push|import|feed|ldap/i.test(e.action) ? 'sync' : 'other';
async function renderSetLog(){
  const pane = $('#setLog');
  if (!canEdit()){ pane.innerHTML = '<div class="panelbox"><div class="hdr">Log</div><p class="note" style="padding:12px">Only administrators can see the log.</p></div>'; return; }
  const r = await fetch('api/log?limit=500', {credentials: 'same-origin'});
  if (!$('#setLog')) return;
  const j = r.ok ? await r.json() : {entries: []};
  const entries = j.entries.filter(e => LOG_FILTER === 'all' || (LOG_FILTER === 'errors' ? e.level === 'error' : logKind(e) === LOG_FILTER));
  const errors = j.entries.filter(e => e.level === 'error').length;
  $('#setLog').innerHTML = `<div class="panelbox"><div class="hdr">Log <span class="cnt">${j.entries.length}</span>${errors ? ` <span class="chip warn">${errors} error${errors === 1 ? '' : 's'}</span>` : ''}</div>
    <div class="addrel" style="padding:10px 12px;border-top:0">
      ${LOG_KINDS.map(([k, l]) => `<button class="tab ${LOG_FILTER === k ? 'active' : ''}" data-logf="${k}">${l}</button>`).join('')}
      <span class="grow"></span><button id="logRefresh">Refresh</button></div>
    ${entries.length ? `<div style="overflow-x:auto"><table class="grid mini" style="min-width:560px"><thead><tr><th style="width:170px">Time</th><th style="width:90px">Level</th><th style="width:160px">Who</th><th>What happened</th></tr></thead><tbody>
      ${entries.map(e => `<tr class="${e.level === 'error' ? 'logerr' : ''}"><td class="mono">${esc(pushDate(e.at))}</td><td>${e.level === 'error' ? '<span class="chip warn">Error</span>' : '<span class="chip kept">Info</span>'}</td><td>${esc(e.who)}</td><td style="white-space:normal">${esc(e.action)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="note" style="padding:12px">Nothing to show for this filter.</p>'}</div>`;
  pane.querySelectorAll('[data-logf]').forEach(b => b.onclick = () => { LOG_FILTER = b.dataset.logf; renderSetLog(); });
  $('#logRefresh').onclick = () => renderSetLog();
}
/* Backups of the inventory: taken before each Lansweeper sync, push and import, and by hand. */
let BACKUPS = null;
async function loadBackups(){
  const r = await fetch('api/backups', {credentials: 'same-origin'});
  if (r.ok){ BACKUPS = (await r.json()).backups; if ($('#setMaint')) renderSetMaint(); }
}
function backupPanel(edit){
  const list = BACKUPS || [];
  const rows = list.map(b => `<tr><td>${esc(pushDate(b.at))}</td><td>${esc(b.reason)}</td><td class="n">${b.objects}</td><td class="n">${(b.bytes / 1048576).toFixed(1)} MB</td>
    <td class="act"><a class="link" href="api/backups/${b.id}/download">Download</a> <button data-brestore="${b.id}" data-bat="${esc(pushDate(b.at))}" ${edit ? '' : 'disabled'}>Restore</button> <button class="icon ghost" data-bdel="${b.id}" ${edit ? '' : 'disabled'} aria-label="Delete this backup">×</button></td></tr>`).join('');
  return `<div class="panelbox"><div class="hdr">Backups <span class="cnt">${list.length}</span></div>
    <p class="note" style="padding:10px 12px">A backup is taken before every Lansweeper sync, push and import, and the last 10 are kept. Restoring puts the devices, relations, history, locations, plans and settings back. Users are kept, and the current state is backed up before the restore, so it can be restored again.</p>
    ${list.length ? `<div style="overflow-x:auto"><table class="grid mini" style="min-width:0"><thead><tr><th>Taken</th><th>Reason</th><th class="n">Devices</th><th class="n">Size</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="note" style="padding:0 12px 10px">No backups yet.</p>'}
    <div class="addrel" style="padding:10px 12px"><button id="bkNew" class="primary" ${edit ? '' : 'disabled'}>Back up now</button><span class="note" style="flex:1"></span><label class="btnlike ${edit ? '' : 'disabled'}">Restore from file…<input type="file" id="bkFile" accept="application/json,.json" hidden ${edit ? '' : 'disabled'}></label></div></div>`;
}
function wireBackups(edit){
  const msg = t => toast(t);
  if ($('#bkNew')) $('#bkNew').onclick = async () => {
    const r = await fetch('api/backups', {method: 'POST', credentials: 'same-origin'});
    if (!r.ok){ msg('The backup could not be taken.'); return; }
    msg('Backup taken'); loadBackups();
  };
  document.querySelectorAll('[data-bdel]').forEach(b => b.onclick = async () => {
    const r = await fetch('api/backups/' + b.dataset.bdel, {method: 'DELETE', credentials: 'same-origin'});
    if (r.ok){ msg('Backup deleted'); loadBackups(); }
  });
  document.querySelectorAll('[data-brestore]').forEach(b => b.onclick = () => restoreModal(b.dataset.bat, () => fetch('api/backups/' + b.dataset.brestore + '/restore', {method: 'POST', credentials: 'same-origin'})));
  const file = $('#bkFile');
  if (file) file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    const text = await f.text();
    restoreModal(f.name, () => fetch('api/backups/restore-file', {method: 'POST', headers: {'Content-Type': 'text/plain'}, credentials: 'same-origin', body: text}));
    file.value = '';
  };
}
/* A restore replaces the inventory, so it asks for the word RESTORE. */
function restoreModal(label, run){
  modal(`<div class="mh">Restore a backup</div><div class="mb"><p class="note">The inventory is replaced with the backup from ${esc(label)}. The current state is backed up first, so the restore can be undone from the list.</p>
    <div class="form" style="padding:0"><label for="rsWord">Type RESTORE to confirm</label><input id="rsWord" autocomplete="off"></div></div>
    <div class="mf"><button id="rsCancel">Cancel</button><button id="rsOk" class="danger-text" disabled>Restore</button></div>`, 'sm');
  $('#rsCancel').onclick = closeModal;
  $('#rsWord').oninput = () => { $('#rsOk').disabled = $('#rsWord').value !== 'RESTORE'; };
  $('#rsOk').onclick = async () => {
    const r = await run();
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'The backup could not be restored.'); return; }
    closeModal(); toast('Restored'); await reloadFromServer(); loadBackups();
  };
  $('#rsWord').focus();
}
function renderSetMaint(){
  const edit = canEdit();
  if (edit && BACKUPS === null) loadBackups();
  $('#setMaint').innerHTML = `${edit ? backupPanel(edit) : ''}<div class="panelbox" style="border-color:var(--danger-bg)"><div class="hdr">Factory reset</div>
    <div class="note" style="padding:12px">Returns the app to the state of a new installation. Everything is removed: devices, relations and history, users and their sign-in, locations, sites, racks, object types and settings. Only your own account stays, with its password, so you can sign in again.</div>
    <div class="note" style="padding:10px 12px">Backups are not affected, and the audit log keeps a record of the reset. The Lansweeper token and the directory password stay on the server.</div>
    <div class="addrel" style="padding:10px 12px"><button id="frReset" class="danger-text" ${edit ? '' : 'disabled'}>Factory reset…</button></div></div>`;
  if (edit) wireBackups(edit);
  if (edit) $('#frReset').onclick = factoryResetModal;
}
function factoryResetModal(){
  modal(`<div class="mh">Factory reset?</div>
    <div class="mb"><p class="note">Everything is removed, except your own account. This cannot be undone: only a backup brings the data back.</p>
      <label class="note" for="frWord" style="display:block;margin-top:6px">Type FACTORY RESET to confirm</label><input id="frWord" autocomplete="off" aria-label="Type FACTORY RESET" style="width:100%"></div>
    <div class="mf"><button id="frCancel">Cancel</button><button id="frOk" class="danger-text" disabled>Factory reset</button></div>`, 'sm');
  $('#frWord').oninput = () => { $('#frOk').disabled = $('#frWord').value.trim() !== 'FACTORY RESET'; };
  $('#frWord').focus();
  $('#frCancel').onclick = closeModal;
  $('#frOk').onclick = async () => {
    clearTimeout(SERVER.timer);
    const r = await fetch('api/factory-reset', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({confirm: 'FACTORY RESET'})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'The reset did not run.'); return; }
    location.reload();
  };
}
/* LDAP / Active Directory. The settings are saved in the inventory and used at the next sign-in or sync. The service
   account's password is not stored there: the server reads it from its environment. */
function renderSetLdap(){
  if (!st.ldap) st.ldap = {};
  const L = st.ldap, edit = canEdit();
  const ro = edit ? '' : 'disabled';
  const field = (k, label, hint) => `<label for="lk_${k}">${label}</label><input id="lk_${k}" data-lk="${k}" class="mono" value="${esc(L[k] || '')}" placeholder="${esc(hint)}" ${ro}>`;
  const ready = !!L.url && edit;
  $('#setLdap').innerHTML = `<div class="panelbox"><div class="hdr">LDAP / Active Directory</div>
    <div class="note" style="padding:10px 12px">Changes are saved in the inventory and used at the next sign-in or sync. The service account's password is not stored here: the server reads it from its environment (NI_LDAP_SERVICE_PASSWORD).</div>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)">
      ${field('url', 'Server', 'ldaps://dc01.example.ch:636')}
      ${field('bindTemplate', 'Sign-in name', 'EXAMPLE\\{login}  or  {login}@example.ch')}
      ${field('searchBase', 'Search base', 'OU=Users,DC=example,DC=ch')}
      ${field('loginAttr', 'Login attribute', 'sAMAccountName')}
      ${field('userFilter', 'User filter', '(objectClass=person)')}
      ${field('group', 'Sign-in group', 'CN=Inventory-Users,OU=Groups,DC=example,DC=ch')}
      ${field('adminGroup', 'Admin group', 'CN=IT-Inventory,OU=Groups,DC=example,DC=ch')}
      ${field('serviceDn', 'Service account', 'CN=inventory-sync,OU=Service,DC=example,DC=ch')}
    </div>
    <div class="addrel" style="padding:10px 12px"><button id="ldapTest" ${ready ? '' : 'disabled'}>Test connection</button><button id="ldapSync" class="primary" ${ready ? '' : 'disabled'}>Sync now</button><span class="note" id="ldapMsg"></span></div></div>`;
  $('#setLdap').querySelectorAll('[data-lk]').forEach(i => i.onchange = () => { st.ldap[i.dataset.lk] = i.value.trim(); queueServerSave(); renderSetLdap(); });
  const bad = t => `<span style="color:var(--danger)">${esc(t)}</span>`;
  $('#ldapTest').onclick = async () => {
    const msg = $('#ldapMsg'); msg.textContent = 'Testing…';
    await flushSave();
    const r = await fetch('api/ldap/test', {method: 'POST', credentials: 'same-origin'});
    const j = await r.json().catch(() => ({}));
    msg.innerHTML = r.ok ? `<span style="color:var(--ok)">Connected. ${j.people} users are in scope.</span>` : bad(j.error || 'The directory cannot be reached.');
  };
  $('#ldapSync').onclick = async () => {
    const msg = $('#ldapMsg'), btn = $('#ldapSync');
    btn.disabled = true; msg.textContent = 'Syncing…';
    await flushSave();
    const r = await fetch('api/ldap/sync', {method: 'POST', credentials: 'same-origin'});
    const j = await r.json().catch(() => ({}));
    btn.disabled = false;
    if (!r.ok){ msg.innerHTML = bad(j.error || 'The sync failed.'); return; }
    const c = j.counts;
    msg.textContent = `${c.people} users in scope: ${c.created} new, ${c.updated} updated, ${c.deactivated} deactivated.`;
    await reloadFromServer();
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
const cleanLoc = v => { const t = v.trim().split(/\s*\/\s*/).map(x => x.trim()); return t.length === 2 && t[0] && t[1] ? t.join(' / ') : ''; };
const warn = t => '<span style="color:var(--danger)">' + esc(t) + '</span>';
const siteOf = l => String(l || '').split(' / ')[0];
function renderSetLocs(){
  const siteRow = (x, i) => {
    const n = objs.filter(o => siteOf(o.loc) === x).length + RACKS.filter(r => siteOf(r.loc) === x).length + LOCS.filter(l => siteOf(l) === x).length;
    return `<div class="lrow"><input data-si="${i}" value="${esc(x)}" aria-label="Site name"><span class="n">${n}</span>
      <button data-sd="${i}" ${n ? `disabled title="In use by ${n} rooms, objects or racks"` : ''}>Delete</button></div>`;
  };
  const roomRow = (l, i) => {
    const n = objs.filter(o => o.loc === l).length + RACKS.filter(r => r.loc === l).length;
    return `<div class="lrow room"><span class="site" title="${esc(siteOf(l))}">${esc(siteOf(l))}</span><input data-lo="${i}" value="${esc(l.split(' / ').slice(1).join(' / '))}" aria-label="Room in ${esc(siteOf(l))}">
      <span class="n">${n}</span><button data-ld="${i}" ${n ? `disabled title="In use by ${n} objects or racks"` : ''}>Delete</button></div>`;
  };
  $('#setLocs').innerHTML = `<div class="locgrid">
    <section class="panelbox locpanel"><div class="hdr">Sites <span class="cnt">${SITES.length}</span></div>
      <div class="lrows"><div class="lrow head"><span>Site</span><span class="n">Used by</span><span></span></div>
        ${SITES.length ? SITES.map(siteRow).join('') : '<p class="note lempty">No sites yet. Add the first one below.</p>'}</div>
      <div class="lpanel-add"><input id="nsName" placeholder="New site, e.g. Basel" aria-label="New site"><button id="nsAdd" class="primary">Add site</button></div>
      <p class="note lnote" id="nsMsg">A site is a town or a building.</p></section>
    <section class="panelbox locpanel"><div class="hdr">Rooms <span class="cnt">${LOCS.length}</span></div>
      <div class="lrows"><div class="lrow room head"><span>Site</span><span>Room</span><span class="n">Used by</span><span></span></div>
        ${LOCS.length ? LOCS.map(roomRow).join('') : '<p class="note lempty">No rooms yet.</p>'}</div>
      <div class="lpanel-add"><select id="nlSite" aria-label="Site for the new room">${SITES.map(x => `<option>${esc(x)}</option>`).join('')}</select><input id="nlRoom" placeholder="New room, e.g. Lager" aria-label="New room"><button id="nlAdd" class="primary" ${SITES.length ? '' : 'disabled'}>Add room</button></div>
      <p class="note lnote" id="nlMsg">${SITES.length ? 'Each room belongs to one site.' : 'Add a site first.'}</p></section>
  </div>`;
  const root = $('#setLocs');
  root.querySelectorAll('[data-si]').forEach(i => i.onchange = () => renameSite(SITES[+i.dataset.si], i.value));
  root.querySelectorAll('[data-sd]').forEach(b => b.onclick = () => { SITES.splice(+b.dataset.sd, 1); toast('Site deleted'); renderSetLocs(); render(); });
  root.querySelectorAll('[data-lo]').forEach(i => i.onchange = () => { const old = LOCS[+i.dataset.lo]; renameLoc(old, siteOf(old) + ' / ' + i.value.trim()); });
  root.querySelectorAll('[data-ld]').forEach(b => b.onclick = () => { LOCS.splice(+b.dataset.ld, 1); toast('Room deleted'); renderSetLocs(); render(); });
  const enter = (id, fn) => $(id).onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); fn(); } };
  $('#nsAdd').onclick = addSite; enter('#nsName', addSite);
  $('#nlAdd').onclick = addRoom; enter('#nlRoom', addRoom);
}
function addSite(){
  const name = $('#nsName').value.trim(), msg = $('#nsMsg');
  if (!name || name.includes(' / ')){ msg.innerHTML = warn('Write the site name, without a slash.'); $('#nsName').focus(); return; }
  if (SITES.includes(name)){ msg.innerHTML = warn(name + ' already exists.'); return; }
  SITES.push(name); toast('Added site ' + name); renderSetLocs(); render();
}
function addRoom(){
  const site = $('#nlSite') ? $('#nlSite').value : '', room = $('#nlRoom').value.trim(), msg = $('#nlMsg');
  if (!site){ msg.innerHTML = warn('Add a site first.'); return; }
  if (!room || room.includes(' / ')){ msg.innerHTML = warn('Write the room name, without a slash.'); $('#nlRoom').focus(); return; }
  const name = site + ' / ' + room;
  if (LOCS.includes(name)){ msg.innerHTML = warn(name + ' already exists.'); return; }
  LOCS.push(name); toast('Added ' + name); renderSetLocs(); render();
}
/* Renaming a site renames its rooms, the locations of the objects in them, and the racks. */
function renameSite(old, value){
  const name = value.trim();
  if (!name || name.includes(' / ')){ toast('Write the site name, without a slash.'); renderSetLocs(); return; }
  if (name === old) return;
  if (SITES.includes(name)){ toast(name + ' already exists.'); renderSetLocs(); return; }
  SITES[SITES.indexOf(old)] = name;
  const move = l => (l === old || String(l || '').startsWith(old + ' / ')) ? name + String(l).slice(old.length) : l;
  LOCS.forEach((l, i) => { LOCS[i] = move(l); });
  objs.forEach(o => { if (o.loc) o.loc = move(o.loc); });
  RACKS.forEach(r => { if (r.loc) r.loc = move(r.loc); });
  if (st.loc) st.loc = move(st.loc);
  renderSetLocs(); render();
}
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
/* Address checks, the same rules as server/validate.js: an empty value is allowed. */
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const MAC_RE = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
function validIPv6(v){
  if (v.length > 45 || !/^[0-9a-f:.]+$/i.test(v)) return false;
  if (v.includes('.')){ const i = v.lastIndexOf(':'); if (i < 0 || !IPV4_RE.test(v.slice(i + 1))) return false; v = v.slice(0, i + 1) + '0:0'; }
  const parts = v.split('::'); if (parts.length > 2) return false;
  const groups = x => (x === '' ? [] : x.split(':'));
  const all = [...groups(parts[0]), ...(parts.length === 2 ? groups(parts[1]) : [])];
  if (!all.every(g => /^[0-9a-f]{1,4}$/i.test(g))) return false;
  return parts.length === 2 ? all.length <= 7 : all.length === 8;
}
function checkAddress(k, raw){
  const v = String(raw ?? '').trim();
  if (!v) return {ok: true, value: ''};
  if (k === 'ip') return IPV4_RE.test(v) ? {ok: true, value: v} : {ok: false, msg: `"${v}" is not an IPv4 address, such as 10.10.0.12.`};
  if (k === 'ip6') return validIPv6(v) ? {ok: true, value: v.toLowerCase()} : {ok: false, msg: `"${v}" is not an IPv6 address, such as 2001:db8::12.`};
  if (k === 'mac') return MAC_RE.test(v) ? {ok: true, value: v.toLowerCase().replace(/-/g, ':')} : {ok: false, msg: `"${v}" is not a MAC address, such as 70:b3:17:4a:00:01.`};
  return {ok: true, value: v};
}
/* Readable names for the icons, for the dropdown. */
const ICON_LABEL = { pc: 'Computer', laptop: 'Laptop', server: 'Server', sip: 'VoIP phone', mobile: 'Smartphone', tablet: 'Tablet',
  monitor: 'Monitor', switch: 'Switch', router: 'Router', firewall: 'Firewall', modem: 'Modem', patch: 'Patch panel',
  printer: 'Printer', scanner: 'Scanner', projector: 'Projector', camera: 'Camera', storage: 'Storage', nas: 'NAS',
  ups: 'UPS', accesspoint: 'Access point', other: 'Other' };
const iconLabel = n => (n === 'custom' ? 'Uploaded icon' : ICON_LABEL[n] || n);
/* A dropdown that shows the icon and its name, for the object type's icon. */
function iconChoice(k, t){
  const names = [...Object.keys(ICON), ...(t.svgInner ? ['custom'] : [])];
  const preview = n => n === 'custom' ? `<svg class="i cu" viewBox="${t.svgView}">${t.svgInner}</svg>` : iconSvg(n);
  return `<div class="icondd"><button type="button" class="icondd-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="Icon for ${esc(t.label)}">${preview(t.icon)}<span>${esc(iconLabel(t.icon))}</span><span class="icondd-caret">▾</span></button>
    <div class="icondd-list" role="listbox" hidden>${names.map(n => `<button type="button" role="option" class="icondd-item" aria-selected="${n === t.icon}" data-ic="${k}" data-icon="${n}">${preview(n)}<span>${esc(iconLabel(n))}</span></button>`).join('')}<label class="icondd-up">Upload SVG icon...<input type="file" hidden accept=".svg,image/svg+xml" data-up="${k}" aria-label="Upload SVG icon for ${esc(t.label)}"></label></div></div>`;
}
function closeIconLists(){ document.querySelectorAll('.icondd-list').forEach(l => { l.hidden = true; const b = l.previousElementSibling; if (b) b.setAttribute('aria-expanded', 'false'); }); }
document.addEventListener('click', e => { if (!e.target.closest('.icondd')) closeIconLists(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeIconLists(); });
/* The list is fixed to the viewport, so it closes when the page scrolls away from its button. */
document.addEventListener('scroll', e => { if (!e.target.closest?.('.icondd-list')) closeIconLists(); }, true);
function renderSetTypes(){
  const rows = Object.entries(TYPES).map(([k,t]) => {
    const n = objs.filter(o => o.type === k).length;
    const lock = BUILTIN.includes(k) ? 'Built in' : n ? `In use by ${n} objects` : '';
    return `<tr>
      <td style="width:1%"><input type="color" value="${t.color}" data-tc="${k}" aria-label="Colour for ${esc(t.label)}" style="width:40px;height:28px;padding:2px"></td>
      <td><input data-tl="${k}" value="${esc(t.label)}" style="width:100%" aria-label="Name"></td>
      <td><input data-ts="${k}" value="${esc(t.short)}" aria-label="Short name"></td>
      <td>${iconChoice(k, t)}</td>
      <td class="n">${n}</td>
      <td><button data-td="${k}" ${BUILTIN.includes(k) || n ? `disabled title="${lock}"` : ''}>Delete</button></td></tr>`;
  }).join('');
  $('#setTypes').innerHTML = `<div style="overflow-x:auto"><table class="grid mini types" style="min-width:0"><colgroup><col style="width:70px"><col><col style="width:120px"><col style="width:200px"><col style="width:80px"><col style="width:100px"></colgroup><thead><tr><th>Colour</th><th>Name</th><th>Short</th><th>Icon</th><th class="n">Objects</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="addrel"><input id="ntName" placeholder="New type, e.g. Access point" style="flex:1;min-width:160px" aria-label="New type name"><button id="ntAdd" class="primary">Add type</button></div>`;
  const root = $('#setTypes');
  root.querySelectorAll('[data-tc]').forEach(i => i.oninput = () => { TYPES[i.dataset.tc].color = i.value; render(); });
  root.querySelectorAll('[data-tl]').forEach(i => i.onchange = () => { TYPES[i.dataset.tl].label = i.value.trim() || TYPES[i.dataset.tl].label; renderSetTypes(); render(); });
  root.querySelectorAll('[data-ts]').forEach(i => i.onchange = () => { TYPES[i.dataset.ts].short = i.value.trim() || TYPES[i.dataset.ts].short; render(); });
  root.querySelectorAll('.icondd-btn').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const list = b.nextElementSibling, open = list.hidden;
    closeIconLists();
    if (open) { const r = b.getBoundingClientRect(); Object.assign(list.style, { left: r.left + 'px', top: r.bottom + 4 + 'px', width: r.width + 'px' }); }
    list.hidden = !open; b.setAttribute('aria-expanded', String(open));
  });
  root.querySelectorAll('.icondd-item').forEach(b => b.onclick = () => { TYPES[b.dataset.ic].icon = b.dataset.icon; renderSetTypes(); render(); });
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
/* Feed. The Lansweeper API settings are saved in the inventory; the token is on the server. A Lansweeper export
   can also be uploaded here. */
/* The push token made in this panel. undefined until it is loaded; the new token is shown once, here. */
let pushInfo, pushLast = null, pushNew = '', pushNote = '';
async function loadPushInfo(){
  const r = await fetch('api/feed/push-token', {credentials: 'same-origin'});
  if (r.ok){ const j = await r.json(); pushInfo = j.info; pushLast = j.last; if ($('#setFeed')) renderSetFeed(); }
}
/* Days since a stamp written by the server ("dd.mm.yyyy hh:mm"). */
function daysSince(stamp){
  const m = /^(\d\d)\.(\d\d)\.(\d{4}) (\d\d):(\d\d)$/.exec(stamp || '');
  return m ? (Date.now() - new Date(+m[3], m[2] - 1, +m[1], +m[4], +m[5])) / 864e5 : 0;
}
/* A date for people: "22 Oct 2026, 18:03". */
const pushDate = v => (v ? new Date(v).toLocaleString(undefined, {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : '');
/* Under the push token: the last push, and the linked devices that have not been seen for 30 days. */
function pushStatus(){
  const c = pushLast ? pushLast.counts : null;
  const last = c ? `${pushDate(pushLast.at)}: ${c.created || 0} new, ${c.updated || 0} updated, ${c.links || 0} links, ${c.software || 0} with software${c.ambiguous ? ', ' + c.ambiguous + ' skipped (shared names)' : ''}` : 'No push yet';
  const old = objs.filter(o => o.feed && o.feed.seen && daysSince(o.feed.seen) >= 30);
  const stale = old.length ? `${old.length} linked device${old.length === 1 ? '' : 's'} not seen for 30 days or more: ${old.slice(0, 20).map(o => esc(o.name)).join(', ')}${old.length > 20 ? ' …' : ''}.` : 'All linked devices were seen in the last 30 days.';
  return `<div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label>Last push</label><span>${last}</span></div>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label>Not seen</label><span>${stale}</span></div>`;
}
function renderSetFeed(){
  if (!st.lansweeper) st.lansweeper = {};
  const L = st.lansweeper, edit = canEdit(), ro = edit ? '' : 'disabled';
  const field = (k, label, hint) => `<label for="ls_${k}">${label}</label><input id="ls_${k}" data-ls="${k}" class="mono" value="${esc(L[k] || '')}" placeholder="${esc(hint)}" ${ro}>`;
  const ready = SERVER.lansweeper && edit;
  if (edit && pushInfo === undefined) loadPushInfo();
  const pushPanel = edit ? `<div class="panelbox"><div class="hdr">Lansweeper push</div>
    <p class="note" style="padding:10px 12px 6px">A PowerShell script on the Lansweeper server sends its assets here. No API address is needed.</p>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label>Token</label><span>${pushInfo ? `Active since ${esc(pushDate(pushInfo.created))}` : 'None yet. Create one to connect the script.'}</span></div>
    ${pushStatus()}
    ${pushNew ? `<div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label for="pushTok">New token</label><input id="pushTok" class="mono" readonly value="${esc(pushNew)}"></div>
    <p class="note" style="padding:0 12px 10px">Copy it now. It is shown only once. The script asks for it with <code>-SetCredential</code>.</p>` : ''}
    <div class="addrel" style="padding:10px 12px">
      <button id="pushNew" class="primary" ${pushInfo === undefined ? 'disabled' : ''}>${pushInfo ? 'Replace token' : 'Create token'}</button>
      ${pushNew ? '<button id="pushCopy">Copy token</button>' : ''}
      ${pushInfo ? '<button id="pushRevoke" class="danger-text">Revoke</button>' : ''}
      <button id="pushScript" ${pushInfo ? '' : 'disabled title="Create a token first"'}>Download script</button>
      <span class="note" id="pushMsg">${esc(pushNote)}</span></div></div>` : '';
  $('#setFeed').innerHTML = pushPanel + `<div class="panelbox"><div class="hdr">Lansweeper API <span class="chip warn" title="Not yet verified against a live Lansweeper">Experimental</span></div>
    <div class="note" style="padding:10px 12px">${SERVER.lansweeper ? 'The API token is set on the server.' : 'No API token is set on the server yet. An administrator sets NI_LS_TOKEN (or NI_LS_TOKEN_FILE) on the server; the token is never stored in the inventory.'}</div>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)">
      ${field('endpoint', 'API address', 'https://api.lansweeper.com/api/v2/graphql')}
      ${field('site', 'Site ID', 'empty: the first site of the token')}
      ${field('authScheme', 'Authorization', 'Token')}
    </div>
    <div class="addrel" style="padding:10px 12px"><button id="lsSync" class="primary" ${ready ? '' : 'disabled'}>Sync now</button><span class="note" id="lsMsg"></span></div></div>
  <div class="panelbox"><div class="hdr">Export file <span class="chip warn" title="Import is not yet verified against a live Lansweeper export">Experimental</span></div>
    <div class="note" style="padding:10px 12px">Or upload a Lansweeper report (CSV). Matches are found by serial number, then name. Only the fields the policy allows are changed; what you set by hand stays.</div>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label for="feedUp">Report</label><input id="feedUp" type="file" accept=".csv,text/csv" ${ro}></div>
    <div class="note" style="padding:10px 12px">The server can also import this report every night from a file your administrator sets up.</div></div>`;
  $('#setFeed').querySelectorAll('[data-ls]').forEach(i => i.onchange = () => { st.lansweeper[i.dataset.ls] = i.value.trim(); queueServerSave(); renderSetFeed(); });
  const pushMsg = t => { const m = $('#pushMsg'); if (m) m.textContent = t; };
  if ($('#pushNew')) $('#pushNew').onclick = async () => {
    const r = await fetch('api/feed/push-token', {method: 'POST', credentials: 'same-origin'});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ pushMsg(j.error || 'The token could not be made.'); return; }
    pushNew = j.token; pushInfo = j.info; pushNote = ''; renderSetFeed();
  };
  /* After a copy the token is hidden again; it can only be read once, then a new token is made. */
  if ($('#pushCopy')) $('#pushCopy').onclick = async () => {
    const box = $('#pushTok'); box.select();
    let copied = false;
    try { await navigator.clipboard.writeText(pushNew); copied = true; } catch (e) { copied = document.execCommand('copy'); }
    if (!copied){ pushMsg('Could not copy. Select the token and copy it by hand.'); return; }
    pushNew = ''; pushNote = 'Copied. The token is hidden now. Make a new one if you need it again.'; renderSetFeed();
  };
  if ($('#pushRevoke')) $('#pushRevoke').onclick = async () => {
    if (!confirm('Revoke the token? The Lansweeper script stops working until you make a new one.')) return;
    const r = await fetch('api/feed/push-token', {method: 'DELETE', credentials: 'same-origin'});
    if (!r.ok){ pushMsg('The token could not be revoked.'); return; }
    pushInfo = null; pushNew = ''; pushNote = ''; renderSetFeed();
  };
  if ($('#pushScript')) $('#pushScript').onclick = () => { window.location.href = 'api/feed/push-script'; };
  const bad = t => `<span style="color:var(--danger)">${esc(t)}</span>`;
  $('#lsSync').onclick = async () => {
    const msg = $('#lsMsg'), btn = $('#lsSync');
    btn.disabled = true; msg.textContent = 'Syncing…';
    await flushSave();
    const r = await fetch('api/feed/sync', {method: 'POST', credentials: 'same-origin'});
    const j = await r.json().catch(() => ({}));
    btn.disabled = false;
    if (!r.ok){ msg.innerHTML = bad(j.error || 'The sync failed.'); return; }
    const c = j.counts;
    msg.textContent = `${c.assets} assets: ${c.created} new, ${c.updated} updated, ${c.linked} linked${c.excluded ? ', ' + c.excluded + ' excluded' : ''}${c.ambiguous ? ', ' + c.ambiguous + ' skipped (shared names)' : ''}.`;
    await reloadFromServer();
  };
  $('#feedUp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const r = await fetch('api/feed/import', {method: 'POST', headers: {'Content-Type': 'text/csv'}, credentials: 'same-origin', body: await f.text()});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'The export could not be imported.'); return; }
    const c = j.counts;
    toast(`Import: ${c.created} new, ${c.updated} updated, ${c.linked} linked, ${c.unchanged} unchanged${c.ambiguous ? ', ' + c.ambiguous + ' skipped (shared names)' : ''}`);
    await reloadFromServer();
  };
}
/* The feed is optional: without one, every object is entered and kept by hand. */

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
    const upId = $('#nUp').value;
    if (upId && $('#nPort').value.trim()){
      const t = byId(upId), pp = $('#nPort').value.trim();
      const val = t.type === 'patch' ? pp.toUpperCase() : (t.type === 'switch' && /^\d+$/.test(pp) ? +pp : pp);
      if (rels.some(r => r.to === t.id && String(r.port) === String(val))){ toast(`${val} on ${t.name} is already taken.`); return; }
    }
    const o = O($('#nType').value, name, {model:$('#nModel').value || '—', serial:$('#nSerial').value, loc:$('#nLoc').value});
    if (o.type === 'switch') Object.assign(o, {ports:24, sfp:4, pfx:'1/'});
    if (o.type === 'patch') o.ports = 24;
    objs.push(o); bindUser(o); hist(o, now(), 'Created manually by ' + who());
    const up = $('#nUp').value;
    if (up){ const t = byId(up); let p = $('#nPort').value.trim(); if (/^\d+$/.test(p) && t.type === 'switch') p = +p;
      rels.push({id:'r'+rid(), from:o.id, to:up, kind: o.type === 'monitor' ? 'attached' : 'connected', port: p || null, vlan:null}); }
    if (c){
      ['kind','os','cpu','ram','fw','ports','sfp','pfx','cap','proto'].forEach(k => { if (c[k] !== undefined && o[k] === undefined) o[k] = c[k]; });
      if (c.software) o.software = c.software.map(x => ({...x}));
      rels.filter(r => r.from === c.id).forEach(r => rels.push({...r, id:'r'+rid(), from:o.id, port: ['switch','patch'].includes(byId(r.to).type) ? null : r.port}));
      if (c.rack && RACKABLE.includes(o.type)){
        const h = c.h || TYPE_U[o.type] || 1; let placed = false;
        for (let top = rackOf(c.rack).units; top >= h && !placed; top--){
          if (!rackCheck(c.rack, top - h + 1, h, o.id)){ Object.assign(o, {rack: c.rack, u: top - h + 1, h}); placed = true; }
        }
        if (!placed) toast('No free U in ' + rackOf(c.rack).name + '. Copied without a rack position.');
      }
      hist(o, now(), 'Duplicated from ' + c.code);
    }
    closeModal(); toast('Created ' + name); flushSave(); openObj(o.id);
  };
}






/* ---------- top bar ---------- */
$('#newBtn').onclick = () => newObjModal();
$('#whoBtn').onclick = () => (me() ? signOut() : loginModal());
$('#setBtn').onclick = openSettings;
$('#themeBtn').onclick = () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('ni-theme', root.dataset.theme); } catch(e) {}
};
$('#searchAll').addEventListener('change', e => { st.searchAll = e.target.checked; render(); });
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
/* ---------- floor plans ---------- */
/* An image per site or room, areas drawn on it, and devices placed by position (in percent of the image). */
let planSel = null, planMode = 'view', planPlace = null, planDraw = null, planDrag = null, planZoom = 1;
const planById = id => PLANS.find(p => p.id === id);
const planDevices = plan => objs.filter(o => o.planPos && o.planPos.plan === plan.id);
const pctOf = (client, start, size) => Math.max(0, Math.min(100, (client - start) / size * 100));
const round1 = v => Math.round(v * 10) / 10;
/* The image comes from the server (saved apart from the inventory); older plans may still carry it inline. */
const planImgSrc = p => p.image || (p.imageAt ? `api/plans/${encodeURIComponent(p.id)}/image?v=${p.imageAt}` : '');
const areaAt = (plan, x, y) => (plan.areas || []).find(a => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h);
/* An area is a location: "Site / Area". It is added to the locations the first time it is used. */
function areaLoc(plan, area){
  if (!SITES.includes(plan.site)) SITES.push(plan.site);
  const v = `${plan.site} / ${area.name}`;
  if (!LOCS.includes(v)) LOCS.push(v);
  return v;
}
/* A device placed inside an area takes that area as its location. Returns the area's name, or null. */
function locateOnPlan(plan, o, x, y){
  const a = areaAt(plan, x, y);
  if (!a || !plan.site) return null;
  o.loc = areaLoc(plan, a);
  return a.name;
}
function renderPlans(){
  const plan = planById(planSel) || PLANS[0] || null;
  planSel = plan ? plan.id : null;
  const bar = `<div class="pl-bar">
      ${PLANS.length ? `<select id="plSel" aria-label="Floor plan">${PLANS.map(p => `<option value="${p.id}" ${plan && p.id === plan.id ? 'selected' : ''}>${esc(p.name)}${p.site ? ' · ' + esc(p.site) : ''}</option>`).join('')}</select>` : '<span class="muted">No floor plans yet</span>'}
      <button id="plNew" class="primary">New plan</button>
      ${plan ? `<span class="pl-sep"></span>
        <button id="plArea" class="${planMode === 'area' ? 'on' : ''}" title="Drag on the plan to mark an area">Draw area</button>
        <button id="plReplace">Replace image</button>
        <button id="plDel" class="danger-text">Delete plan</button>
        <span class="pl-zoom"><button id="plZoomOut" aria-label="Zoom out" title="Zoom out">−</button><button id="plZoomReset" title="Actual size" class="pl-zv">${Math.round(planZoom * 100)}%</button><button id="plZoomIn" aria-label="Zoom in" title="Zoom in">+</button></span>` : ''}
      <span class="grow"></span>
      ${plan ? `<span class="muted">${(plan.areas || []).length} areas · ${planDevices(plan).length} devices</span>` : ''}
    </div>`;
  const body = plan ? `<div class="pl-body">
      <aside class="pl-side"><div class="pl-shead">Devices not on this plan</div>
        <div class="pl-q"><input id="plQ" type="search" placeholder="Search devices" aria-label="Search devices"></div>
        <div class="pl-list" id="plList"></div>
        <p class="note pl-tip">${planPlace ? `Click the plan to place ${esc(planPlace.name)}. Press Esc to cancel.` : 'Choose a device, then click the plan to place it. Drag a placed device to move it.'}</p></aside>
      <div class="pl-stage" id="plStage">${planCanvas(plan)}</div></div>`
    : `<div class="pl-empty"><p>Add a floor plan: upload an image of a floor or room, mark areas on it, and place the devices.</p><button class="primary" id="plNew2">New plan</button></div>`;
  $('#view').innerHTML = `<div class="plans">${bar}${body}</div>`;
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('#plNew', () => planModal(null)); on('#plNew2', () => planModal(null));
  const sel = $('#plSel'); if (sel) sel.onchange = () => { planSel = sel.value; planPlace = null; planMode = 'view'; planZoom = 1; renderPlans(); };
  on('#plArea', () => { planMode = planMode === 'area' ? 'view' : 'area'; planPlace = null; renderPlans(); });
  on('#plReplace', () => planModal(plan));
  const zoom = v => { planZoom = Math.max(0.5, Math.min(3, Math.round(v * 100) / 100)); renderPlans(); };
  on('#plZoomOut', () => zoom(planZoom - 0.25)); on('#plZoomIn', () => zoom(planZoom + 0.25)); on('#plZoomReset', () => zoom(1));
  on('#plDel', () => deletePlanModal(plan));
  if (!plan) return;
  renderPlanList(plan);
  $('#plQ').oninput = () => renderPlanList(plan);
  $('#plList').onclick = e => { const b = e.target.closest('[data-plitem]'); if (!b) return; const o = byId(b.dataset.plitem); planPlace = planPlace && planPlace.id === o.id ? null : o; planMode = 'view'; renderPlans(); };
  const c = $('#plCanvas');
  c.onpointerdown = e => {
    if (e.target.closest('.pl-pin,.pl-x') || e.button !== 0) return;
    const r = c.getBoundingClientRect();
    const x = pctOf(e.clientX, r.left, r.width), y = pctOf(e.clientY, r.top, r.height);
    if (planMode === 'area'){ planDraw = {x0: x, y0: y, x1: x, y1: y}; return; }
    if (planPlace && canEdit()) placeDevice(plan, planPlace, round1(x), round1(y));
  };
  c.querySelectorAll('[data-pin]').forEach(p => p.onpointerdown = e => { e.stopPropagation(); planDrag = {id: p.dataset.pin, moved: false, x: 0, y: 0}; });
  c.querySelectorAll('[data-area]').forEach(b => b.onclick = e => { e.stopPropagation(); plan.areas = plan.areas.filter(a => a.id !== b.dataset.area); queueServerSave(); renderPlans(); });
}
function planCanvas(plan){
  const cursor = planMode === 'area' ? 'crosshair' : planPlace ? 'copy' : 'default';
  return `<div class="pl-canvas" id="plCanvas" style="cursor:${cursor};width:${planZoom * 100}%">
    <img src="${planImgSrc(plan)}" alt="Floor plan ${esc(plan.name)}" draggable="false">
    ${(plan.areas || []).map(a => `<div class="pl-area" style="left:${a.x}%;top:${a.y}%;width:${a.w}%;height:${a.h}%"><span>${esc(a.name)}</span>${planMode === 'area' ? '' : `<button class="pl-x" data-area="${a.id}" aria-label="Remove area ${esc(a.name)}" title="Remove area">×</button>`}</div>`).join('')}
    ${planDevices(plan).map(o => `<button class="pl-pin" data-pin="${o.id}" style="left:${o.planPos.x}%;top:${o.planPos.y}%;background:${tcol(o.type)}" title="${esc(o.name)}"><i></i>${esc(o.name)}</button>`).join('')}
  </div>`;
}
function renderPlanList(plan){
  const q = (($('#plQ') && $('#plQ').value) || '').trim().toLowerCase();
  const placed = planDevices(plan).map(o => o.id);
  const rows = objs.filter(o => !placed.includes(o.id) && (!q || [o.name, o.code, o.serial, o.model].some(v => v && String(v).toLowerCase().includes(q)))).slice(0, 300);
  $('#plList').innerHTML = rows.length ? rows.map(o => `<button class="pl-item ${planPlace && planPlace.id === o.id ? 'on' : ''}" data-plitem="${o.id}">${tico(o.type, 'tico sm')}<span class="pl-n">${esc(o.name)}</span><span class="muted">${esc(TYPES[o.type].short)}</span></button>`).join('') : '<p class="note pl-none">No devices to place.</p>';
}
function placeDevice(plan, o, x, y){
  o.planPos = {plan: plan.id, x, y};
  const area = locateOnPlan(plan, o, x, y);
  hist(o, now(), `Placed on ${plan.name}${area ? ' in ' + area : ''} by ${who()}`);
  planPlace = null; queueServerSave(); renderPlans();
}
function drawPreview(){
  const c = $('#plCanvas'); if (!c || !planDraw) return;
  let p = $('#plPreview');
  if (!p){ p = document.createElement('div'); p.id = 'plPreview'; p.className = 'pl-preview'; c.appendChild(p); }
  const d = planDraw;
  Object.assign(p.style, {left: Math.min(d.x0, d.x1) + '%', top: Math.min(d.y0, d.y1) + '%', width: Math.abs(d.x1 - d.x0) + '%', height: Math.abs(d.y1 - d.y0) + '%'});
}
document.addEventListener('pointermove', e => {
  const c = $('#plCanvas'); if (!c) return;
  if (planDraw){ const r = c.getBoundingClientRect(); planDraw.x1 = pctOf(e.clientX, r.left, r.width); planDraw.y1 = pctOf(e.clientY, r.top, r.height); drawPreview(); }
  if (planDrag){
    const r = c.getBoundingClientRect();
    planDrag.x = pctOf(e.clientX, r.left, r.width); planDrag.y = pctOf(e.clientY, r.top, r.height); planDrag.moved = true;
    const pin = c.querySelector(`[data-pin="${planDrag.id}"]`);
    if (pin){ pin.style.left = planDrag.x + '%'; pin.style.top = planDrag.y + '%'; }
  }
});
document.addEventListener('pointerup', () => {
  if (planDraw){
    const d = planDraw; planDraw = null;
    const rect = {x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0)};
    if (rect.w > 2 && rect.h > 2 && planById(planSel)) areaModal(planById(planSel), rect); else renderPlans();
  }
  if (planDrag){
    const d = planDrag; planDrag = null;
    if (d.moved){
      const o = byId(d.id);
      const pl = o && o.planPos ? planById(o.planPos.plan) : null;
      if (o && o.planPos){ o.planPos = {...o.planPos, x: round1(d.x), y: round1(d.y)}; const area = pl ? locateOnPlan(pl, o, d.x, d.y) : null; hist(o, now(), `Moved on the plan${area ? ' into ' + area : ''} by ${who()}`); queueServerSave(); }
      renderPlans();
    } else openObj(d.id);
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && st.tab === 'plans' && (planPlace || planMode === 'area')){ planPlace = null; planMode = 'view'; renderPlans(); }
});
function areaModal(plan, rect){
  modal(`<div class="mh">New area</div><div class="mb"><div class="form" style="padding:0"><label for="arName">Name</label><input id="arName" placeholder="e.g. Open office, Server room" maxlength="60"></div>
    <p class="note">An area is a named place on this plan. Devices placed inside it are in that place.</p></div>
    <div class="mf"><button id="arCancel">Cancel</button><button id="arOk" class="primary">Add area</button></div>`, 'sm');
  $('#arCancel').onclick = () => { closeModal(); renderPlans(); };
  $('#arOk').onclick = () => {
    const name = $('#arName').value.trim();
    if (!name){ toast('Give the area a name.'); return; }
    const area = {id: 'ar' + rid(), name, x: round1(rect.x), y: round1(rect.y), w: round1(rect.w), h: round1(rect.h)};
    plan.areas = [...(plan.areas || []), area];
    if (plan.site) areaLoc(plan, area);
    planMode = 'view'; queueServerSave(); closeModal(); toast('Area added'); renderPlans();
  };
  $('#arName').focus();
}
function loadPlanImage(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
    img.src = url;
  });
}
/* Reduced to 1800 px wide and saved as JPEG, so a plan stays small in the inventory. */
function shrinkPlanImage(img){
  const k = Math.min(1, 1800 / img.naturalWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
function planModal(existing){
  modal(`<div class="mh">${existing ? 'Replace image' : 'New floor plan'}</div><div class="mb">
    <div class="form" style="padding:0">${existing ? '' : `<label for="plName">Name</label><input id="plName" placeholder="e.g. Ground floor" maxlength="60"><label for="plSite">Site</label><select id="plSite">${SITES.map(s => `<option>${esc(s)}</option>`).join('')}</select>`}
    <label for="plFile">Image</label><input id="plFile" type="file" accept="image/png,image/jpeg,image/gif,image/webp"></div>
    <p class="note">PNG, JPG, GIF or WebP.</p></div>
    <div class="mf"><button id="plCancel">Cancel</button><button id="plOk" class="primary">Save</button></div>`, 'sm');
  $('#plCancel').onclick = closeModal;
  $('#plOk').onclick = async () => {
    const name = existing ? existing.name : $('#plName').value.trim();
    const file = $('#plFile').files[0];
    if (!name){ toast('Give the plan a name.'); return; }
    if (!file){ toast('Choose an image.'); return; }
    let img;
    try { img = await loadPlanImage(file); } catch (e) { toast('That file is not an image.'); return; }
    const data = shrinkPlanImage(img);
    if (data.length > 1500000){ toast('The image is still too large. Use a smaller one.'); return; }
    const p = existing || {id: 'pl' + rid(), name, site: $('#plSite').value, areas: []};
    const r = await fetch('api/plans/' + encodeURIComponent(p.id) + '/image', {method: 'PUT', headers: {'Content-Type': 'text/plain'}, credentials: 'same-origin', body: data});
    if (!r.ok){ const j = await r.json().catch(() => ({})); toast(j.error || 'The image could not be saved.'); return; }
    delete p.image; p.imageAt = Date.now();
    if (!existing){ PLANS.push(p); planSel = p.id; }
    planMode = 'view'; queueServerSave(); closeModal(); toast('Plan saved'); renderPlans();
  };
  if (!existing) $('#plName').focus();
}
function deletePlanModal(plan){
  modal(`<div class="mh">Delete ${esc(plan.name)}?</div><div class="mb"><p class="note">The plan and its areas are removed. Devices placed on it stay in the inventory, but are no longer shown on a plan.</p></div>
    <div class="mf"><button id="dpCancel">Cancel</button><button id="dpOk" class="danger-text">Delete plan</button></div>`, 'sm');
  $('#dpCancel').onclick = closeModal;
  $('#dpOk').onclick = () => {
    objs.forEach(o => { if (o.planPos && o.planPos.plan === plan.id) delete o.planPos; });
    PLANS = PLANS.filter(p => p !== plan); planSel = null; planMode = 'view'; planPlace = null;
    fetch('api/plans/' + encodeURIComponent(plan.id) + '/image', {method: 'DELETE', credentials: 'same-origin'}).catch(() => {});
    queueServerSave(); closeModal(); toast('Plan deleted'); renderPlans();
  };
}
function render(){
  renderSide(); renderTabs();
  if (st.tab === 'cards') renderCards();
  else if (st.tab === 'table') renderTable();
  else if (st.tab === 'map') renderMap();
  else if (st.tab === 'plans') renderPlans();
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
/* The inventory as one object. The server stores it. */
const snapshot = () => ({objs: objs.map(o => ({...o})), rels, history, users: USERS, locs: LOCS, racks: RACKS, types: TYPES,
  policy: st.policy, feedOn: st.feedOn, feedSync: st.feedSync, ldap: st.ldap, mapPos: st.mapPos, seq, codeN, rseq});
const SERVER = {on: false, ldap: false, lansweeper: false, timer: null, revs: {}, base: null, busy: false, again: false, watching: false};
function saveData(){ queueServerSave(); }
/* Saving. The page remembers, for every record, what it last saw (SERVER.base) and the revision the server gave it
   (SERVER.revs). A save sends only the records that differ from what it saw, each with that revision. A record that
   changed on the server since is not saved; the page then shows the newer version. */
const PREFERENCES = ['mapPos'];
function documents(){
  const m = new Map();
  objs.forEach(o => m.set('object|' + o.id, {kind:'object', id:o.id, value:o}));
  rels.forEach(r => m.set('rel|' + r.id, {kind:'rel', id:String(r.id), value:r}));
  USERS.forEach(u => m.set('user|' + u.id, {kind:'user', id:u.id, value:u}));
  Object.entries(TYPES).forEach(([k, t]) => m.set('type|' + k, {kind:'type', id:k, value:t}));
  Object.entries(history).forEach(([k, h]) => { if (h.length) m.set('history|' + k, {kind:'history', id:k, value:h}); });
  const settings = {locs: LOCS, sites: SITES, lansweeper: st.lansweeper, racks: RACKS, policy: st.policy, feedOn: st.feedOn, feedSync: st.feedSync, ldap: st.ldap, mapPos: st.mapPos, plans: PLANS};
  Object.entries(settings).forEach(([k, v]) => m.set('setting|' + k, {kind:'setting', id:k, value:v}));
  return m;
}
function setBaseline(){
  SERVER.base = new Map();
  for (const [k, d] of documents()) SERVER.base.set(k, JSON.stringify(d.value));
}
function pendingChanges(){
  const now = documents(), puts = [], dels = [];
  for (const [k, d] of now){
    const json = JSON.stringify(d.value);
    if (SERVER.base.get(k) === json) continue;
    const pref = d.kind === 'setting' && PREFERENCES.includes(d.id);
    puts.push({key:k, kind:d.kind, id:d.id, value:d.value, json, base: pref ? null : (SERVER.revs[k] ?? 0)});
  }
  for (const k of SERVER.base.keys()){
    if (now.has(k)) continue;
    const i = k.indexOf('|');
    dels.push({key:k, kind:k.slice(0, i), id:k.slice(i + 1), base: SERVER.revs[k] ?? 0});
  }
  return {puts, dels};
}
/* Saves now, without waiting for the pause after an edit: a new object gets its code straight away. */
function flushSave(){ clearTimeout(SERVER.timer); return sendChanges(); }
function queueServerSave(){
  if (!SERVER.base) return;   /* nothing has been loaded yet */
  clearTimeout(SERVER.timer);
  SERVER.timer = setTimeout(sendChanges, 400);
}
async function sendChanges(){
  if (SERVER.busy){ SERVER.again = true; return; }
  if (!canEdit()) return;
  const {puts, dels} = pendingChanges();
  if (!puts.length && !dels.length) return;
  SERVER.busy = true;
  try {
    const body = {puts: puts.map(({kind, id, value, base}) => ({kind, id, value, base})), dels: dels.map(({kind, id, base}) => ({kind, id, base}))};
    const r = await fetch('api/changes', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify(body)});
    if (r.status === 401){ loginModal('Your sign-in has ended. Sign in again.'); return; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast('Not saved: ' + (j.error || r.status)); return; }
    for (const [id, code] of Object.entries(j.codes || {})){ const o = byId(id); if (o) o.code = code; }
    if (Object.keys(j.codes || {}).length) render();
    const sent = new Map([...puts, ...dels].map(c => [c.key, c]));
    for (const [key, rev] of Object.entries(j.revs || {})){
      const c = sent.get(key); if (!c) continue;
      SERVER.revs[key] = rev;
      if (c.json === undefined){ SERVER.base.delete(key); continue; }
      const v = JSON.parse(c.json); if (j.codes && j.codes[c.id]) v.code = j.codes[c.id];
      SERVER.base.set(key, JSON.stringify(v));
    }
    if (j.conflicts && j.conflicts.length){
      const names = j.conflicts.map(k => { const c = sent.get(k); return c && c.value && c.value.name ? c.value.name : k.split('|')[0]; });
      const refused = j.conflicts.map(k => sent.get(k)).filter(c => c && c.kind === 'object' && c.json)
        .map(c => ({ id: c.id, name: c.value.name, mine: JSON.parse(c.json), base: JSON.parse(SERVER.base.get(c.key) || 'null') }));
      toast('Not saved, changed by someone else: ' + names.join(', ') + '. The newer version is shown.');
      await reloadFromServer();
      const items = refused.map(r => {
        const now = byId(r.id);
        return { id: r.id, name: r.name, gone: !now, fields: now ? changedFields(r.mine, r.base).map(k => ({ k, mine: r.mine[k], theirs: now[k] })) : [] };
      }).filter(i => i.gone || i.fields.length);
      if (items.length) refusedModal(items);
    }
  } catch(e) {
    toast('Not saved: the server cannot be reached.');
  } finally {
    SERVER.busy = false;
    if (SERVER.again){ SERVER.again = false; queueServerSave(); }
  }
}
/* The fields a person changed on an object, to offer them again after a refused save. */
const NOT_EDITED = ['id', 'code', 'ovr', 'feed'];
function changedFields(mine, base){ return Object.keys(mine).filter(k => !NOT_EDITED.includes(k) && JSON.stringify(mine[k]) !== JSON.stringify((base || {})[k])); }
const shown = v => (v && typeof v === 'object') ? JSON.stringify(v) : String(v ?? '');
/* Shows what a person changed and the newer version, so a refused edit is not lost. */
function refusedModal(items){
  modal(`<div class="mh">Not saved: changed by someone else</div>
    <div class="mb"><p class="note">Someone else saved these records first, so your changes were not saved. The inventory shows their version. You can apply your changes again.</p>
      ${items.map(it => `<div class="panelbox"><div class="hdr">${esc(it.name)}${it.gone ? ' <span class="muted">· deleted by someone else</span>' : ''}</div>
        ${it.fields.length ? `<table class="grid mini" style="min-width:0"><thead><tr><th>Field</th><th>Yours</th><th>Theirs</th></tr></thead><tbody>${it.fields.map(f => `<tr><td>${esc(FIELD_LABEL[f.k] || f.k)}</td><td>${esc(shown(f.mine))}</td><td>${esc(shown(f.theirs))}</td></tr>`).join('')}</tbody></table>` : ''}
      </div>`).join('')}</div>
    <div class="mf"><button id="rfKeep">Keep theirs</button><button id="rfApply" class="primary">Apply mine again</button></div>`, 'wide');
  $('#rfKeep').onclick = closeModal;
  $('#rfApply').onclick = () => {
    let n = 0;
    for (const it of items){ const o = byId(it.id); if (!o || it.gone) continue; for (const f of it.fields){ o[f.k] = f.mine; n++; } }
    closeModal(); saveData(); render(); toast(n ? 'Your changes are applied again' : 'Nothing to apply');
  };
}
/* Loads the inventory and its revisions from the server, and makes it the base for the next save. */
async function reloadFromServer(){
  const r = await fetch('api/state', {credentials: 'same-origin'});
  if (r.status === 401){ loginModal(); return false; }
  if (!r.ok){ toast('The inventory could not be loaded.'); return false; }
  const d = await r.json();
  applyState(d);
  dropMissingTabs();
  SERVER.revs = d.revs || {};
  setBaseline();
  render();
  return true;
}
/* An object open in a tab may have been deleted by someone else: its tab is closed. */
function dropMissingTabs(){
  const gone = id => !FIXED_TABS[id] && !byId(id);
  st.open = st.open.filter(id => !gone(id));
  st.tabIds = st.tabIds.filter(id => !gone(id));
  if (gone(st.tab)) st.tab = 'table';
}
/* Other people's saves show up here: every 15 seconds and when the window gets focus. Nothing is replaced while there
   are unsaved changes, a dialog is open, or someone is typing. */
async function checkForChanges(){
  if (!SERVER.base || SERVER.busy || document.querySelector('#mdl')) return;
  if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  const {puts, dels} = pendingChanges();
  if (puts.length || dels.length) return;
  const r = await fetch('api/state', {credentials: 'same-origin'});
  if (!r.ok) return;
  const d = await r.json();
  const revs = d.revs || {};
  const changed = Object.keys(revs).some(k => (SERVER.revs[k] ?? 0) !== revs[k]) || Object.keys(SERVER.revs).some(k => !(k in revs));
  if (changed) await reloadFromServer();
}
function applyState(d){
  objs.splice(0, objs.length, ...d.objs);
  rels.splice(0, rels.length, ...d.rels);
  Object.keys(history).forEach(k => delete history[k]); Object.assign(history, d.history);
  USERS = d.users; LOCS.splice(0, LOCS.length, ...d.locs); RACKS.splice(0, RACKS.length, ...(d.racks || []));
  SITES.splice(0, SITES.length, ...(d.sites || []));
  PLANS.splice(0, PLANS.length, ...(d.plans || []));
  LOCS.forEach(l => { const x = l.split(' / ')[0]; if (!SITES.includes(x)) SITES.push(x); });   /* locations saved before sites existed */
  if (d.types){   /* the built-in types are always there; the saved ones add to them or change them */
    Object.keys(TYPES).forEach(k => delete TYPES[k]); Object.assign(TYPES, JSON.parse(JSON.stringify({ ...DEFAULT_TYPES, ...d.types })));
  }
  /* A new server has no saved policy yet: start from the defaults so the Settings panes can be drawn. */
  Object.assign(st, {policy: d.policy || {ip:true, mac:true, os:true, model:true, cpu:true, ram:true, fw:true, boot:false, disk:false, patch:false, av:false, user:false, loc:false, status:false}, feedOn: d.feedOn ?? true, feedSync: d.feedSync ?? true, ldap: d.ldap ?? {url: '', bindDn: '', base: '', filter: '', group: '', nightly: true, disable: true, last: null}, mapPos: d.mapPos || {}, lansweeper: d.lansweeper || {}});
  seq = d.seq; codeN = d.codeN; rseq = d.rseq;
  objs.forEach(bindUser);
}
/* Reset: in this browser it forgets the saved copy. On the server it clears the devices, relations and history
   for everyone, and keeps users, locations, types and the saved settings. The admin's button needs a second click. */
/* Clears the devices, relations and history on the server for everyone. Users, locations, types and settings stay. */
/* Clearing deletes every device, so it asks first, and only goes ahead when the word CLEAR is typed. */
function clearConfirm(){
  modal(`<div class="mh">Clear the whole inventory?</div>
    <div class="mb"><p class="note">This deletes every device on the server, with its relations and history, for everyone. Users, locations, sites, racks and settings stay, and so do the objects excluded from sync unless you tick the box below. It cannot be undone: only a backup brings the devices back.</p>
      <label class="pchk" style="display:flex;gap:6px;align-items:center;margin:8px 0"><input type="checkbox" id="clrAll"> Also delete the objects excluded from sync (protected)</label>
      <label class="note" for="clrWord" style="display:block;margin-top:6px">Type CLEAR to confirm</label><input id="clrWord" autocomplete="off" aria-label="Type CLEAR" style="width:100%"></div>
    <div class="mf"><button id="clrCancel">Cancel</button><button id="clrOk" class="danger-text" disabled>Clear inventory</button></div>`, 'sm');
  $('#clrWord').oninput = () => { $('#clrOk').disabled = $('#clrWord').value.trim() !== 'CLEAR'; };
  $('#clrWord').focus();
  $('#clrCancel').onclick = closeModal;
  $('#clrOk').onclick = () => clearAll();
}
/* Clears the devices, relations and history on the server, all of them, including any another person added since
   this page loaded. Users, locations, types and settings stay. */
async function clearAll(){
  if (!canEdit()){ toast('Only an admin can clear the inventory.'); return; }
  const r = await fetch('api/state', {credentials: 'same-origin'});
  if (!r.ok){ toast('The inventory could not be loaded.'); return; }
  const d = await r.json();
  /* Objects excluded from sync are kept, unless the box to delete protected objects is ticked. Relations and history of
     the removed objects go with them; relations between kept objects stay. */
  const deleteAll = !!($('#clrAll') && $('#clrAll').checked);
  const removed = new Set(d.objs.filter(o => deleteAll || !o.excluded).map(o => o.id));
  const kept = d.objs.length - removed.size;
  const dels = [
    ...d.objs.filter(o => removed.has(o.id)).map(o => ({kind:'object', id:o.id})),
    ...d.rels.filter(x => removed.has(x.from) || removed.has(x.to)).map(x => ({kind:'rel', id:String(x.id)})),
    ...Object.keys(d.history).filter(id => removed.has(id)).map(id => ({kind:'history', id})),
  ].map(c => ({...c, base: d.revs[c.kind + '|' + c.id] ?? 0}));
  const res = await fetch('api/changes', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({puts: [], dels})});
  const j = await res.json().catch(() => ({}));
  if (!res.ok){ toast('Not cleared: ' + (j.error || res.status)); return; }
  closeModal();
  await reloadFromServer();
  toast(j.conflicts && j.conflicts.length ? 'Cleared, except ' + j.conflicts.length + ' record(s) that someone changed meanwhile' : (kept ? 'Cleared. ' + kept + ' excluded object' + (kept === 1 ? ' kept' : 's kept') : 'Inventory cleared'));
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
  if (!info){ showUnreachable(); return; }
  SERVER.on = true; SERVER.ldap = info.ldap; SERVER.lansweeper = info.lansweeper;
  if (!info.user){ clearInventory(); render(); loginModal(); return; }
  await loadFromServer(info.user);
}
/* The page works only with its server. Without one nothing is shown; the dialog offers to try again. */
function showUnreachable(){
  document.body.classList.add('signed-out');
  modal(`<div class="mh">NOBS Inventory</div><div class="mb"><p class="note" style="color:var(--danger)">The inventory server cannot be reached. Check that it is running, then try again.</p></div>
    <div class="mf"><button id="unTry" class="primary">Try again</button></div>`, 'sm free locked');
  $('#unTry').onclick = () => location.reload();
}
/* Before sign-in the page holds no inventory. */
function clearInventory(){
  objs.length = 0; rels.length = 0; LOCS.length = 0; RACKS.length = 0; USERS = [];
  Object.keys(history).forEach(k => delete history[k]);
  st.open = []; st.tab = 'cards';
}
async function loadFromServer(user){
  if (!(await reloadFromServer())) return;
  document.body.classList.remove('signed-out');
  st.meId = user.id;
  if (!SERVER.watching){ SERVER.watching = true; setInterval(checkForChanges, 15000); window.addEventListener('focus', checkForChanges); }
  render();
}/* Sign in with a login and password. The server checks the account, or the directory when LDAP is set up. */
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
