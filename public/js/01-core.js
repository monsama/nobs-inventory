/* ---------- icons ---------- */
/* One icon by its name, for the picker in Settings. */
export const iconSvg = name => `<svg class="i" viewBox="0 0 24 24">${ICON[name] || ICON.other}</svg>`;
export const ICON = {
  pc:'<path d="M3 4h18v12H3z"/><path d="M8 20h8M12 16v4"/>',
  server:'<rect x="3" y="3" width="18" height="7" rx="1"/><rect x="3" y="14" width="18" height="7" rx="1"/><path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6"/>',
  pbx:'<rect x="2" y="5" width="20" height="12" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01"/><path d="M8 21h8M12 17v4"/>',
  sip:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 5h8v5H8z"/><path d="M9 14h.01M12 14h.01M15 14h.01M9 17h.01M12 17h.01M15 17h.01"/>',
  tablet:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M11 18h2"/>',
  rack:'<rect x="3" y="2" width="18" height="20" rx="1"/><path d="M3 7h18M3 12h18M3 17h18M7 4.5h.01M7 9.5h.01"/>',
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
  bmc:'<rect x="3" y="11" width="18" height="9" rx="1.5"/><path d="M7 15.5h5M16 15.5h1"/><path d="M8.5 7.5a5 5 0 0 1 7 0M10.5 9.5a2 2 0 0 1 3 0"/>',
  laptop:'<rect x="4" y="5" width="16" height="11" rx="1"/><path d="M2 19h20"/>',
  mobile:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  scanner:'<rect x="2" y="9" width="20" height="8" rx="1"/><path d="M6 9V4h12v5M6 17v3h12v-3"/>',
  projector:'<rect x="2" y="7" width="16" height="10" rx="2"/><path d="M18 10l4-2v8l-4-2M6 10h.01"/>',
  storage:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  modem:'<rect x="3" y="12" width="18" height="7" rx="1"/><path d="M7 12V5M12 19v2M16 15h.01M19 15h.01"/>',
  plc:'<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M5 8h14M8.5 12h2M8.5 15.5h2M13.5 12h2M13.5 15.5h2M2 18h3M19 18h3"/>',
  other:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 12h8"/>'
};
export const svg = (t, cls='i') => {
  const T = TYPES[t] || {};
  if (T.icon === 'custom' && T.svgInner) return `<svg class="${cls} cu" viewBox="${T.svgView}">${T.svgInner}</svg>`;
  return `<svg class="${cls}" viewBox="0 0 24 24">${ICON[T.icon] || ICON.other}</svg>`;
};

/* ---------- reference data ---------- */
/* Object types are data: name, short name, colour and icon. Edited in Settings → Object types. */
export const TYPES = {
  pc:{label:'PC', short:'PC', color:'#1565c0', icon:'pc'},
  notebook:{label:'Notebook', short:'NB', color:'#2563eb', icon:'laptop'},
  server:{label:'Server', short:'Server', color:'#6a3fb5', icon:'server'},
  vm:{label:'Virtual machine', short:'VM', color:'#7c3aed', icon:'server'},
  accesspoint:{label:'Access point', short:'AP', color:'#0891b2', icon:'accesspoint'},
  sip:{label:'VoIP phone', short:'VoIP', color:'#15803d', icon:'sip'},
  pbx:{label:'Telephone system', short:'PBX', color:'#0f766e', icon:'pbx'},
  monitor:{label:'Monitor', short:'Monitor', color:'#64748b', icon:'monitor'},
  switch:{label:'Switch', short:'Switch', color:'#c2410c', icon:'switch'},
  printer:{label:'Printer', short:'Printer', color:'#a16207', icon:'printer'},
  patch:{label:'Patch panel', short:'Patch', color:'#0f766e', icon:'patch'},
  router:{label:'Router', short:'Router', color:'#1e3a8a', icon:'router'},
  firewall:{label:'Firewall', short:'Firewall', color:'#b91c1c', icon:'firewall'},
  modem:{label:'Modem', short:'Modem', color:'#78716c', icon:'modem'},
  storage:{label:'Storage', short:'Storage', color:'#0891b2', icon:'storage'},
  android:{label:'Android device', short:'Android', color:'#4d7c0f', icon:'mobile'},
  ios:{label:'iOS device', short:'iOS', color:'#a21caf', icon:'mobile'},
  mobile:{label:'Other mobile device', short:'Mobile', color:'#0d9488', icon:'mobile'},
  plc:{label:'PLC / Controller', short:'PLC', color:'#be185d', icon:'plc'},
  camera:{label:'Camera / Recorder', short:'Camera', color:'#9333ea', icon:'camera'},
  bmc:{label:'iLO / iDRAC', short:'iLO', color:'#4f46e5', icon:'bmc'},
  rack:{label:'Rack', short:'Rack', color:'#475569', icon:'rack'},
  other:{label:'Other', short:'Other', color:'#5a6b7d', icon:'other'}
};
/* Built-in types the rest of the app relies on: they can be renamed and recoloured, not deleted. */
/* A copy of the built-in types, used when a server has none saved yet. */
export const DEFAULT_TYPES = JSON.parse(JSON.stringify(TYPES));
/* Types that show a port grid in Ports: a switch, router, firewall or physical server. Patch panels have their own view. */
export const PORTED = ['switch', 'router', 'firewall', 'server'];
/* A device has a port view when it has a port count, whatever its type. Patch panels have their own view. */
export const hasPorts = o => !!o && o.type !== 'patch' && (PORTED.includes(o.type) || o.ports > 0);
export const BUILTIN = ['pc','notebook','camera','bmc','server','vm','accesspoint','sip','mobile','monitor','switch','printer','patch','other','rack','pbx','plc'];
/* Not in use: still in the inventory and on plans, but no longer used, e.g. taken out of its rack. Retired is kept for the record. */
export const STATUS = {active:{label:'In use',cls:'ok'}, stock:{label:'In stock',cls:''}, unused:{label:'Not in use',cls:'warn'}, repair:{label:'In repair',cls:'warn'}, retired:{label:'Retired',cls:'bad'}};
export const LOCS = [];
/* The VLANs of the whole inventory, from Settings. A connection picks one of them. */
export const VLANS = [];
/* The IP subnets of the network, each on a VLAN, with its gateway, DNS servers, ranges and the device types that take an address from it. */
export const SUBNETS = [];
/* The hand-entered fields of each type, from Settings: { type: [{key, label, kind}] }. */
export const TYPE_FIELDS = {};
/* The domains devices join, from Settings. An object's domain is picked from this list. */
export const DOMAINS = [];
/* The layout of the built-in fields per type: { type: { order: [keys], hidden: [keys], labels: { key: name } } }. */
export const FIELD_LAYOUT = {};
/* Fields a type starts with hidden, until its layout is changed in Settings: a phone's address changes with every Wi-Fi
   it joins, so of the network fields only its MAC address is shown. */
export const DEFAULT_HIDDEN = Object.fromEntries(['android', 'ios', 'mobile'].map(t => [t, ['ip', 'subnet', 'dhcp', 'gateway', 'dns', 'ip6']]));
export const hiddenOf = type => { const lay = FIELD_LAYOUT[type] || {}; return Array.isArray(lay.hidden) ? lay.hidden : (DEFAULT_HIDDEN[type] || []); };
/* "8 · Users"; a VLAN named only after its number ("VLAN 8") is just "8", so it never reads "VLAN 8 · VLAN 8". */
export const vlanLabel = vid => { if (vid == null || vid === '') return ''; const v = VLANS.find(x => x.vid === vid); return !v ? String(vid) : new RegExp(`^(vlan\\s*)?${v.vid}$`, 'i').test(String(v.name).trim()) ? String(v.vid) : `${v.vid} · ${v.name}`; };
/* Sites are kept as their own list, so a site can exist before it has any rooms. A location is a room within a site. */
export const SITES = [];
/* Racks are objects of type rack. Their height is the units field. */
export const racksList = () => objs.filter(o => o.type === 'rack');
export const rackUnits = r => r.units || 42;
export let PLANS = [];
/* Other modules change the list through this, since an imported name cannot be assigned. */
export const setPlans = v => { PLANS = v; };
/* Whether Lansweeper is used at all (Settings → Feed). When it is not, none of its data or panels are shown. */
export const LS_ON = () => st.useLansweeper !== false;
/* Whether Lansweeper data still comes in. Microsoft Graph being set up is SYNC.graph, from the server. */
export const lsLive = () => LS_ON() && st.feedOn !== false;
/* Fields only a scan fills in, that nobody types: hidden while Lansweeper is off. The values are kept. */
export const SCAN_ONLY = ['boot'];
/* The shortest a new password may be. The server enforces the same rule, and also refuses common passwords. */
export const PW_MIN = 12;
export const FIELD_LABEL = {ip:'IP address', ip6:'IPv6 address', mac:'MAC address', gateway:'Gateway', dns:'DNS servers', dhcp:'Address from', os:'Operating system', model:'Model', cpu:'CPU', ram:'Memory', fw:'Firmware', domain:'Domain', boot:'Last power event', disk:'Disks', av:'Antivirus', patch:'Last Windows update', mask:'Subnet mask', purchased:'Purchased', warranty:'Warranty ends', user:'User', loc:'Location'};
/* What else the feed brings, not a field of its own: each has a box in "Feed may overwrite" too. */
export const FEED_EXTRA = {ipRoom:'Room from IP location', software:'Installed software', links:'Monitors attached to PCs', dept:'Departments of people'};
export const FEED_EXTRA_HINT = {ipRoom:'A device without a location gets the room its IP address is in, from Lansweeper\'s IP locations', software:'The software Lansweeper finds replaces what it found before; software added by hand stays', links:'Monitors are attached to the PC Lansweeper scanned them on', dept:'A person named by Lansweeper gets the department from the directory Lansweeper reads, when they have none'};
/* Warranty: a date as YYYY-MM-DD. Soon is within 90 days; the sidebar filters on both. */
export const WARRANTY_SOON_DAYS = 90;
export const warrantyState = (o, today = new Date()) => {
  if (!o.warranty || !/^\d{4}-\d{2}-\d{2}$/.test(o.warranty)) return null;
  const days = Math.floor((new Date(o.warranty + 'T23:59:59') - today) / 86400000);
  return days < 0 ? 'ended' : days <= WARRANTY_SOON_DAYS ? 'soon' : 'ok';
};
/* A device Lansweeper has not scanned for over three months may be gone, or Lansweeper cannot log on to it: it is sent
   all the same, and flagged so someone checks it by hand. */
export const SCAN_OLD_DAYS = 90;
export const scanOld = (o, today = new Date()) => !!(lsLive() && o.feed && !o.excluded && !o.detached && /^\d{4}-\d{2}-\d{2}$/.test(o.feed.scanned || '')
  && (today - new Date(o.feed.scanned + 'T00:00:00')) / 86400000 > SCAN_OLD_DAYS);
export const scanChip = o => scanOld(o) ? `<span class="chip warn" title="Lansweeper last scanned it on ${dayText(o.feed.scanned)}. Check by hand that it is still there and in use.">Check by hand</span>` : '';
export const dayText = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : (d || '');
/* A relation always reads from -> to: "MON-0412 attached to ZH-PC-0142". The port belongs to the "to" end. */
/* Four kinds: connected (a device on a switch, router or patch port), uplink (a switch to its upstream switch, router or firewall),
   attached (a monitor or accessory on a PC or docking station) and hosted (a virtual machine on its host, shown as "runs on"). */
export const KINDS = {
  connected:{fwd:'connected to', rev:'connects'},
  uplink:{fwd:'uplink to', rev:'uplink from'},
  attached:{fwd:'attached to', rev:'has attached'},
  hosted:{fwd:'runs on', rev:'hosts'}
};
/* Fields get their placeholder as a tooltip, and a select shows its chosen text, so nothing is unreadable on hover. */
export function fullTextTooltips(root = document.body){
  root.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => { if (!el.title) el.title = el.placeholder; });
  root.querySelectorAll('select').forEach(el => { const o = el.selectedOptions[0]; if (o && !el.title) el.title = o.textContent.trim(); });
}
/* Cut-off text gets its full wording when the pointer reaches it. Only the element under the pointer is measured, so a
   large table is not laid out again on every redraw. */
let fullTextHoverBound = false;
export function bindFullTextOnHover(){
  if (fullTextHoverBound) return;
  fullTextHoverBound = true;
  document.addEventListener('pointerover', e => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || el.title || el.children.length || el.closest('svg')) return;
    const text = el.textContent.trim();
    if (text && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') el.title = text.replace(/\s+/g, ' ');
  });
}
/* What each kind means, shown as a tooltip in the relation dropdown. */
export const KIND_HINTS = {
  connected:'A device on a port of a switch, router, firewall or patch panel. Give its port number.',
  uplink:'A switch, router or firewall connected to the upstream device above it. Give the port on that upstream device.',
  attached:'A monitor or accessory attached to a PC, docking station or server.',
  hosted:'A virtual machine that runs on this physical server.'
};
export const KIND_TARGETS = {attached:['pc','notebook','android','ios','mobile','server','monitor'], connected:['switch','sip','patch','router','firewall','server','pbx'], uplink:['switch','firewall','router'], hosted:['server']};

/* ---------- ids ----------
   Every object has its own code (INV-0001). A feed reference (the Lansweeper asset ID) is only a link to the feed. */
/* Ids are random so two people creating things at once cannot pick the same one. Object codes are given by the server when the object is first saved. */
export const rid = () => Math.random().toString(36).slice(2, 10);
export const O = (type, name, f) => ({id:'o'+rid(), code:null, type, name, status:'active', feed:null, ovr:{}, ...f});

export const objs = [];
/* The models named in the inventory: those typed on a device, and those listed in Settings. Every device offers them to choose from. */
export const MODELS = [];
/* Contracts and licences (Settings keys contracts, licences) and the currency of every amount. Replaced as a whole when changed. */
export const COSTS = {contracts: [], licences: [], currency: 'CHF'};
/* The company the inventory belongs to (setting company): its name and logo (a PNG data URL) on entry sheets. */
export const COMPANY = {name: '', logo: ''};
export const modelNames = () => [...new Set([...MODELS, ...objs.map(o => o.model)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
/* Sync markers. The last Lansweeper sync is the newest time a device carries from the feed. A device it created is New, and one
   saved by hand after that sync is Edited by hand. updateSync() is run before each render, so the markers match the data. */
export const SYNC = {run: '', time: 0, graph: false};
export const stampTime = s => { const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/.exec(s || ''); return m ? new Date(+m[3], m[2] - 1, +m[1], +m[4], +m[5]).getTime() : 0; };
export const updateSync = () => {
  SYNC.run = ''; SYNC.time = 0;
  for (const o of objs){ const s = o.feed && o.feed.seen, t = stampTime(s); if (t > SYNC.time){ SYNC.time = t; SYNC.run = s; } }
};
export const markHtml = o => {
  const isNew = !!(o.feed && SYNC.run && o.feed.created === SYNC.run);
  const byHand = !!o.handAt && Date.parse(o.handAt) > SYNC.time;
  return (isNew ? '<span class="mk mk-new">New</span>' : '') + (byHand ? '<span class="mk-hand" role="img" aria-label="Edited by hand" title="Edited by hand after the last sync"><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="2"/></svg></span>' : '');
};
/* An object by its id, from an index of where each id sits in objs. A hit is checked against objs itself, so a list that
   was refilled, sorted or spliced is never answered from a stale index: a miss rebuilds it once. */
let ID_AT = new Map();
const idAt = id => { const i = ID_AT.get(id); return i !== undefined && objs[i] && objs[i].id === id ? objs[i] : undefined; };
export const byId = id => {
  const hit = idAt(id);
  if (hit) return hit;
  ID_AT = new Map(objs.map((o, i) => [o.id, i]));
  return idAt(id);
};
/* The browser tests look objects up by name; the page itself finds them by id. */
export const byName = n => objs.find(o => o.name === n);

export const rels = [];
export const HISTORY = {};
/* The newest entries come first; the server keeps the same number (HISTORY_KEEP). */
export const hist = (o, t, msg) => { const h = (HISTORY[o.id] ??= []); h.unshift({t, msg}); if (h.length > 500) h.length = 500; };

/* ---------- state ----------
   policy: which fields the feed may overwrite by default. Name and serial number are match keys, never overwritten.
   Each object can override these on its own page (o.ovr). */
export const st = {type:null, loc:null, status:null, scanOld:false, q:'', tab:'cards', open:[], tabIds:['overview','cards','table','map','plans','net','rack','sw','contracts'], portsDevice:null, cardsGroup:'none', portsDevice:null, portNo:3,
  rackId:null, setTab:'feed', feedOn:true, feedSync:true, mapOnly:true, mapAttached:false, mapLabels:false, mapFind:'', mapFocus:null, mapPos:{},
  policy:{ip:true, mac:true, os:true, model:true, cpu:true, ram:true, fw:true, boot:true, disk:false, av:false, domain:true, user:false, loc:false, status:false},
  ldap:{url:'', bindDn:'', base:'', filter:'', group:'', nightly:true, disable:true, last:null}, lansweeper:{}};
export let APP_VERSION = '';
export const setAppVersion = v => { APP_VERSION = v; };
try { const t = localStorage.getItem('ni-theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* Browser storage can be blocked (a private window): then the choice is simply not kept. */ }

/* Where an object stands with Lansweeper. The card, the table and the Source panel all read this, so they always agree. */
export function syncOf(o){
  if (!LS_ON()) return null;
  if (o.excluded) return {k: 'excluded', label: 'Not synced · excluded', cls: 'kept'};
  if (o.detached) return {k: 'detached', label: 'Not synced · detached', cls: 'warn'};
  if (!o.feed) return {k: 'manual', label: 'Not in Lansweeper', cls: 'kept'};
  if (!o.feed.seen) return {k: 'waiting', label: 'Attached · waiting for sync', cls: 'info'};
  if (daysSince(o.feed.seen) >= 30) return {k: 'stale', label: 'Stale · last seen ' + o.feed.seen, cls: 'warn'};
  return {k: 'synced', label: 'Synced · ' + o.feed.seen, cls: 'ok'};
}
/* Microsoft Graph. The types a managed company device has: these are expected in Entra and Intune. */
export const GRAPH_TYPES = ['pc', 'notebook', 'ios', 'android', 'mobile'];
/* Intune's last contact with a device, else Entra's last sign-in; a device not heard of for 30 days may be gone. */
export const GRAPH_STALE_DAYS = 30;
export const graphLast = o => (o.graph && (o.graph.lastCheckIn || o.graph.lastSync || o.graph.lastSignIn)) || '';
export const graphStale = (o, today = new Date()) => { const t = Date.parse(graphLast(o)); return !isNaN(t) && (today - t) / 864e5 > GRAPH_STALE_DAYS; };
/* How Intune names a compliance state, and how it reads here. */
export const COMPLIANCE = { compliant: ['ok', 'Compliant'], noncompliant: ['bad', 'Not compliant'], inGracePeriod: ['warn', 'In grace period'], conflict: ['warn', 'Conflict'],
  error: ['bad', 'Error'], configManager: ['', 'Config Manager'], unknown: ['', 'Unknown'] };
export const complianceChip = c => { const x = COMPLIANCE[c]; return c ? `<span class="chip ${x ? x[0] : ''}">${esc(x ? x[1] : c)}</span>` : ''; };
/* How a device is joined: from Graph (Entra joined, hybrid joined, Entra registered), else from the LDAP sync's
   computer accounts (joined to the on-premises AD only). Older syncs called hybrid "Domain joined". */
export const JOIN_INFO = {
  'Entra joined': 'Joined to Microsoft Entra only (cloud)',
  'Hybrid joined': 'Joined to the on-premises Active Directory and registered in Microsoft Entra',
  'Entra registered': 'Registered in Microsoft Entra, not joined: often a personal (BYOD) device',
  'AD joined': 'Joined to the on-premises Active Directory only: not in Microsoft Entra',
};
/* How a device is joined. A device Graph no longer has is not joined there any more, whatever it was. */
export const joinOf = o => {
  const j = o.graph && !o.graph.gone && o.graph.join;
  if (j) return j === 'Domain joined' ? 'Hybrid joined' : j === 'Registered' ? 'Entra registered' : j;
  return o.inAd ? 'AD joined' : '';
};
/* The filters of the sidebar's Microsoft Graph group. Not in Entra or Intune counts only the types expected there. */
/* A device of the inventory that a Graph record fits together with another one, so Graph put it on neither. */
export const graphAmbiguousOf = o => (st.graphAmbiguous || []).find(a => a.devices.includes(o.id)) || null;
const inGraph = o => !!o.graph && !o.graph.gone && o.status !== 'retired';
/* Each filter: its label, its colour, the test, and whether it is listed only when a device has it. */
export const GRAPH_FILTERS = {
  noncompliant: ['Not compliant', 'bad', o => inGraph(o) && ['noncompliant', 'error'].includes(o.graph.compliance)],
  unencrypted: ['Not encrypted', 'warn', o => inGraph(o) && o.graph.encrypted === 'no'],
  stale: [`No contact for ${GRAPH_STALE_DAYS} days`, 'warn', o => inGraph(o) && graphStale(o)],
  missing: ['Not in Entra or Intune', 'off', o => (!o.graph || !!o.graph.gone) && GRAPH_TYPES.includes(o.type) && o.status !== 'retired'],
  duplicates: ['Duplicates in Entra', 'warn', o => inGraph(o) && (o.graph.others || []).length > 0, true],
  ambiguous: ['Name or serial used twice', 'warn', o => o.status !== 'retired' && !!graphAmbiguousOf(o), true],
  /* By how the device is joined. */
  entra: ['Entra joined', 'join', o => o.status !== 'retired' && joinOf(o) === 'Entra joined'],
  hybrid: ['Hybrid joined', 'join', o => o.status !== 'retired' && joinOf(o) === 'Hybrid joined'],
  adonly: ['AD joined only', 'join', o => o.status !== 'retired' && joinOf(o) === 'AD joined'],
  registered: ['Entra registered', 'join', o => o.status !== 'retired' && joinOf(o) === 'Entra registered'],
  notjoined: ['Not joined', 'join', o => o.status !== 'retired' && GRAPH_TYPES.includes(o.type) && !joinOf(o)],
  /* Opened from the Overview; in the sidebar only while they filter. */
  managed: ['Managed by Intune', 'ok', o => inGraph(o) && !!o.graph.managed, true, true],
  unmanaged: ['In Entra, not managed by Intune', 'off', o => inGraph(o) && !o.graph.managed, true, true],
  compliant: ['Compliant', 'ok', o => inGraph(o) && o.graph.compliance === 'compliant', true, true],
  grace: ['In grace period', 'warn', o => inGraph(o) && o.graph.compliance === 'inGracePeriod', true, true],
};
/* The operating system of a device as a family: Windows 11, Windows 10, Windows Server 2022, macOS, iOS, Android, Linux.
   Graph writes Windows by its build (10.0.22631): from build 22000 on it is Windows 11. */
export const osFamily = o => {
  const v = String(o.os || '').trim(), l = v.toLowerCase();
  if (!v) return '';
  const server = l.match(/windows\s*server\s*(\d{4})?(\s*r2)?/);
  if (server) return 'Windows Server' + (server[1] ? ' ' + server[1] + (server[2] ? ' R2' : '') : '');
  const build = l.match(/windows\s*10\.0\.(\d+)/);
  if (build) return +build[1] >= 22000 ? 'Windows 11' : 'Windows 10';
  const win = l.match(/win(?:dows)?\s*(11|10|8\.1|8|7)\b/);
  if (win) return 'Windows ' + win[1];
  if (/mac\s*os|macos|os x/.test(l)) return 'macOS';
  if (/ipados|ios/.test(l)) return 'iOS / iPadOS';
  if (/android/.test(l)) return 'Android';
  if (/linux|ubuntu|debian|red hat|rhel|centos|suse|fedora/.test(l)) return 'Linux';
  if (/windows/.test(l)) return 'Windows (other)';
  return 'Other';
};
/* Systems the maker no longer updates. */
export const OS_ENDED = ['Windows 10', 'Windows 8.1', 'Windows 8', 'Windows 7', 'Windows Server 2008', 'Windows Server 2012', 'Windows Server 2012 R2'];
/* The Microsoft Graph status of a device on its card: its join type and compliance. Red when it is not compliant. */
export const graphChip = o => {
  if (!SYNC.graph || !o.graph || o.graph.gone || (!o.graph.join && !o.graph.compliance)) return '';
  const c = COMPLIANCE[o.graph.compliance];
  const text = [joinOf(o), c ? c[1] : o.graph.compliance].filter(Boolean).join(' · ');
  return `<span class="chip ${c && c[0] === 'bad' ? 'bad' : c && c[0] === 'warn' ? 'warn' : 'ok'}" title="Microsoft Entra and Intune">${esc(text)}</span>`;
};
export const syncChip = o => { const s = syncOf(o); return s ? `<span class="chip ${s.cls}" data-sync="${s.k}">${esc(s.label)}</span>` : ''; };

/* The feed owns a field when the object is linked, it has not overridden the field, and the default allows it. */
/* An object excluded from the sync, or detached, is not linked to Lansweeper: its fields are its own. */
export const feedLinked = o => !!o.feed && !o.excluded && !o.detached;
export const feedOwns = (o, k, linked = feedLinked(o)) => !!(LS_ON() && st.feedOn && linked && (k in o.ovr ? o.ovr[k] : st.policy[k]));

/* ---------- helpers ---------- */
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const tcol = t => TYPES[t]?.color || '#888';
export const tico = (t, cls='tico') => `<span class="${cls}" role="img" aria-label="${esc(TYPES[t]?.label || t)}" style="background:${tcol(t)}">${svg(t)}</span>`;
export const pad2 = n => String(n).padStart(2, '0');
/* A switch without a port prefix (some come from Lansweeper) shows its ports as plain numbers, not NaN. */
export const pfxOf = o => o.pfx ?? '';
export const portLabel = (target, p) => {
  if (p == null) return '';
  if (typeof p === 'number' && hasPorts(target)) return pfxOf(target) + p;
  return String(p);
};
/* The relations of every object, built once for a view that draws many objects; relsOf and used take it instead of
   going through all relations for each object. Built fresh for each draw, so it always matches rels. */
export function relIndex(){
  const m = new Map(), add = (id, r) => { const l = m.get(id); if (l) l.push(r); else m.set(id, [r]); };
  for (const r of rels){ add(r.from, r); if (r.to !== r.from) add(r.to, r); }
  return m;
}
export const relsOf = (o, idx) => (idx ? idx.get(o.id) || [] : rels.filter(r => r.from === o.id || r.to === o.id)).map(r => {
  const out = r.from === o.id;
  const other = byId(out ? r.to : r.from);
  return {r, out, other, label: out ? KINDS[r.kind].fwd : KINDS[r.kind].rev, port: r.lag != null ? (out ? 'LAG ' + r.lag : 'LAG ' + r.fromLag) : portLabel(byId(r.to), r.port)};
});
export const now = () => { const d = new Date(); return `${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
export function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2800); }
/* A port held only by retired devices is free for a new connection: their connection to it is removed, with a note in their history. */
export const releaseRetiredPort = (to, port) => {
  const holders = rels.filter(r => r.to === to.id && String(r.port) === String(port));
  if (!holders.length || holders.some(r => byId(r.from) && byId(r.from).status !== 'retired')) return false;
  for (const r of holders) {
    const d = byId(r.from); rels.splice(rels.indexOf(r), 1);
    hist(d, now(), `Connection to ${to.name} port ${port} removed: the port was taken over`);
  }
  return true;
};
/* A patch panel port is written P01, P02 ... whatever the person typed. */
export const patchPort = v => { const t = String(v ?? '').trim(); const m = /^p?(\d+)$/i.exec(t); return m ? 'P' + m[1].padStart(2, '0') : t.toUpperCase(); };
/* The LAG a numbered port of a device belongs to, or undefined: such a port is linked through its LAG, never alone. */
export const lagOfPort = (o, port) => typeof port === 'number' ? (o.portGroups || []).find(g => g.lag && port >= g.from && port <= g.to) : undefined;
/* The link that uses a LAG of this device, on either end, or undefined. */
export const lagLinkOf = (o, g, list = rels) => list.find(r => (r.to === o.id && r.lag === g.name) || (r.from === o.id && r.fromLag === g.name));
/* Ports in use: those with a device on them, and every member of a LAG that is linked. */
export const used = (o, idx) => {
  const list = idx ? idx.get(o.id) || [] : rels;
  const lags = (o.portGroups || []).filter(g => g.lag && lagLinkOf(o, g, list)).reduce((n, g) => n + g.to - g.from + 1, 0);
  return list.filter(r => r.to === o.id && r.port != null).length + lags;
};
export const isUplink = k => k === 'uplink';
/* A monitor or other peripheral on a PC: not a path to the network, so it is listed and drawn apart. */
export const isAttached = k => k === 'attached';

export function filtered(){
  const q = st.q.trim().toLowerCase();
  /* A search looks within the type, place and status picked on the left; with All objects it looks through every object. */
  return objs.filter(o => (((!st.type || o.type === st.type) && (!st.loc || (st.loc.includes(' / ') ? o.loc === st.loc : String(o.loc || '').split(' / ')[0] === st.loc)) && (!st.status || o.status === st.status) && (!st.warranty || warrantyState(o) === st.warranty) && (!st.scanOld || scanOld(o)) && (!st.intune || !GRAPH_FILTERS[st.intune] || (!SYNC.graph && GRAPH_FILTERS[st.intune][1] !== 'join') || GRAPH_FILTERS[st.intune][2](o)) && (!st.osFam || osFamily(o) === st.osFam) && (!st.adGroup || (o.adGroups || []).some(g => g.toLowerCase() === st.adGroup.toLowerCase()))))
    && (!q || [o.code,o.name,o.ip,o.ip6,o.mac,o.serial,o.user,o.model,o.ext,...(o.nics || []).flatMap(n => [n.ip, n.mac]),...(o.adGroups || [])].some(v => v && String(v).toLowerCase().includes(q))));
}

/* The way up from a device to the core: follow outgoing relations. */
export function pathUp(o){
  const chain = [{o}]; const seen = new Set([o.id]); let cur = o;
  for (let i = 0; i < 8; i++){
    const r = rels.find(r => r.from === cur.id && !seen.has(r.to));
    if (!r) break;
    const nx = byId(r.to); chain.push({o:nx, via:r}); seen.add(nx.id); cur = nx;
  }
  return chain;
}

export function daysSince(stamp){
  const m = /^(\d\d)\.(\d\d)\.(\d{4}) (\d\d):(\d\d)$/.exec(stamp || '');
  return m ? (Date.now() - new Date(+m[3], m[2] - 1, +m[1], +m[4], +m[5])) / 864e5 : 0;
}
