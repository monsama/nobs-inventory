import { pad2, stamp, stampTime } from './dates.js';
import { isIntune, otherManager } from './intune.js';
import { ORDER_FIELDS, maySet } from './sync-map.js';
import { STOCKTAKE_DAYS, daysSinceVerified } from './stocktake.js';
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
  /* An uploaded icon drawn in white (made for a coloured tile) takes the text colour instead, so it shows on the light
     tile of the calm look too. */
  if (T.icon === 'custom' && T.svgInner) return `<svg class="${cls} cu" viewBox="${VIEWBOX_RE.test(T.svgView || '') ? T.svgView : '0 0 24 24'}">${T.svgInner.replace(/\b(fill|stroke)=(["'])\s*(#fff|#ffffff|white)\s*\2/gi, '$1="currentColor"')}</svg>`;
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
/* A copy of the built-in types, used when a server has none saved yet. */
export const DEFAULT_TYPES = JSON.parse(JSON.stringify(TYPES));
/* Types that show a port grid in Ports: a switch, router, firewall or physical server. Patch panels have their own view. */
export const PORTED = ['switch', 'router', 'firewall', 'server'];
/* A device has a port view when it has a port count, whatever its type. Patch panels have their own view. */
export const hasPorts = o => !!o && o.type !== 'patch' && (PORTED.includes(o.type) || o.ports > 0);
/* Why a numbered port cannot be used on a device with ports: it has none set up yet, or the number is not one of them.
   '' when it can. Nothing is plugged into a port before the port exists. */
export const portRangeError = (t, p) => {
  if (!hasPorts(t) || typeof p !== 'number') return '';
  const n = (t.ports || 0) + (t.sfp || 0);
  if (!n) return `${t.name} has no ports yet. Set its port count first (Ports, or its details).`;
  return Number.isInteger(p) && p >= 1 && p <= n ? '' : `${t.name} has ports 1 to ${n}.`;
};
/* Built-in types the rest of the app relies on: they can be renamed and recoloured, not deleted. */
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
const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const daysAgo = (day, today) => (today - new Date(day + 'T00:00:00')) / 86400000;
/* A device Lansweeper tries to scan but has never scanned (it only knows it from Active Directory, or cannot log on):
   none of its details come from a scan. A week's grace for one it found only just now. */
export const NEVER_SCANNED_GRACE_DAYS = 7;
/* The day the grace counts from: when Lansweeper found it, or, from a Lansweeper that does not say, when it came here. */
const foundDay = f => isDay(f.firstSeen) ? f.firstSeen : (() => { const t = stampTime(f.linked || f.created); return t ? new Date(t).toISOString().slice(0, 10) : ''; })();
export const neverScanned = (o, today = new Date()) => !!(lsLive() && o.feed && !o.excluded && !o.detached && !o.feed.scanned && isDay(o.feed.tried)
  && !(foundDay(o.feed) && daysAgo(foundDay(o.feed), today) <= NEVER_SCANNED_GRACE_DAYS));
export const scanOld = (o, today = new Date()) => neverScanned(o, today) || !!(lsLive() && o.feed && !o.excluded && !o.detached && isDay(o.feed.scanned)
  && daysAgo(o.feed.scanned, today) > SCAN_OLD_DAYS);
export const scanChip = o => !scanOld(o) ? '' : neverScanned(o)
  ? `<span class="chip warn lsst" title="Lansweeper has tried to scan it (last on ${dayText(o.feed.tried)}) but has never scanned it. Check by hand that it is there, and why Lansweeper cannot scan it.">Never scanned</span>`
  : `<span class="chip warn lsst" title="Lansweeper last scanned it on ${dayText(o.feed.scanned)}. Check by hand that it is still there and in use.">Check by hand</span>`;
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
/* The devices a relation of each kind can go to, in the Relations panel. Keep in step with LINK_OF in 05-new-object.js:
   a phone can be plugged into a PC or notebook (its pass-through port) as well as into a switch. */
export const KIND_TARGETS = {attached:['pc','notebook','android','ios','mobile','server','monitor'], connected:['switch','sip','patch','router','firewall','server','pbx','pc','notebook'], uplink:['switch','firewall','router'], hosted:['server']};

/* ---------- ids ----------
   Every object has its own code (INV-0001). A feed reference (the Lansweeper asset ID) is only a link to the feed. */
/* Ids are random so two people creating things at once cannot pick the same one. Object codes are given by the server when the object is first saved. */
export const rid = () => Math.random().toString(36).slice(2, 10);
export const O = (type, name, f) => ({id:'o'+rid(), code:null, type, name, status:'active', feed:null, ...f});

export const objs = [];
/* The models named in the inventory: those typed on a device, and those listed in Settings. Every device offers them to choose from. */
export const MODELS = [];
/* Contracts and licences (Settings keys contracts, licences) and the currency of every amount. Replaced as a whole when changed. */
export const COSTS = {contracts: [], licences: [], currency: 'CHF'};
/* The contacts: internal IT people and those at IT partners (public/js/contacts.js). A device names them by id. */
export const CONTACTS = {list: []};
export const contactOf = id => id ? CONTACTS.list.find(c => c.id === id) || null : null;
/* The company the inventory belongs to (setting company): its name and logo (a PNG data URL) on entry sheets. */
export const COMPANY = {name: '', logo: ''};
export const modelNames = () => [...new Set([...MODELS, ...objs.map(o => o.model)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
/* Sync markers. The last Lansweeper sync is the newest time a device carries from the feed. A device it created is New, and one
   saved by hand after that sync is Edited by hand. updateSync() is run before each render, so the markers match the data. */
export const SYNC = {run: '', time: 0, graph: false, defender: false};
export { stampTime };
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
  return idAt(id) || REVIEW.find(o => o.id === id);
};
/* Devices a sync found that wait in To review (o.review): kept apart from objs, so no list, count, plan or cost sees them
   until they are accepted. Ignored ones stay here too (review.ignored), so no sync brings them back. */
export const REVIEW = [];
export const REVIEW_SRC = { lansweeper: 'Lansweeper', ad: 'Active Directory', graph: 'Entra & Intune' };
/* A device waiting for review that no source has seen for this many days (or never) is likely gone: shown grey. */
export const REVIEW_STALE_DAYS = 90;
/* The browser tests look objects up by name; the page itself finds them by id. */
export const byName = n => objs.find(o => o.name === n);

export const rels = [];
export const HISTORY = {};
/* The newest entries come first; the server keeps the same number (HISTORY_KEEP). */
export const hist = (o, t, msg) => { const h = (HISTORY[o.id] ??= []); h.unshift({t, msg}); if (h.length > 500) h.length = 500; };

/* What Lansweeper may overwrite out of the box (Settings → Lansweeper, and the field order's default). */
export const DEFAULT_POLICY = {ip:true, mac:true, os:true, model:true, cpu:true, ram:true, fw:true, boot:true, disk:false, av:false, domain:true, user:false, loc:false, status:false};
/* ---------- state ----------
   What the page shows and remembers while it is open: the sidebar filters (type, loc, status, scanOld, q and the
   others set from the sidebar or the Overview), the open tab and object tabs, the view settings of the Cards, Ports,
   Rack and Map tabs, the Settings tab, and the settings loaded from the server (feedOn, policy, ldap, lansweeper...).
   policy: which fields the feed may overwrite by default. Name and serial number are match keys, never overwritten.
   Each object can override these on its own page: the source picked for a field (o.pick). */
export const st = {scope:null, rvSrc:'', rvKnown:false, rvOld:false, type:null, loc:null, status:null, scanOld:false, twins:false, q:'', tab:'cards', open:[], tabIds:['overview','review','cards','table','map','plans','net','rack','sw','contracts','contacts'], portsDevice:null, cardsGroup:'none', portNo:3,
  rackId:null, setTab:'feed', feedOn:true, feedSync:true, mapOnly:true, mapAttached:false, mapLabels:false, mapFind:'', mapFocus:null, mapPos:{},
  policy:{ ...DEFAULT_POLICY },
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
  /* Records disabled in Entra are not duplicates to clean up: Entra keeps them switched off before they are deleted. */
  duplicates: ['Duplicates in Entra', 'warn', o => inGraph(o) && (o.graph.others || []).some(x => !x.disabled), true],
  ambiguous: ['Name or serial used twice', 'warn', o => o.status !== 'retired' && !!graphAmbiguousOf(o), true],
  /* By how the device is joined. */
  entra: ['Entra joined', 'join', o => o.status !== 'retired' && joinOf(o) === 'Entra joined'],
  hybrid: ['Hybrid joined', 'join', o => o.status !== 'retired' && joinOf(o) === 'Hybrid joined'],
  adonly: ['AD joined only', 'join', o => o.status !== 'retired' && joinOf(o) === 'AD joined'],
  registered: ['Entra registered', 'join', o => o.status !== 'retired' && joinOf(o) === 'Entra registered'],
  notjoined: ['Not joined', 'join', o => o.status !== 'retired' && GRAPH_TYPES.includes(o.type) && !joinOf(o)],
  /* Opened from the Overview; in the sidebar only while they filter. */
  managed: ['Managed by Intune', 'ok', o => inGraph(o) && isIntune(o.graph.managed), true, true],
  unmanaged: ['In Entra, not managed by Intune', 'off', o => inGraph(o) && !isIntune(o.graph.managed), true, true],
  compliant: ['Compliant', 'ok', o => inGraph(o) && o.graph.compliance === 'compliant', true, true],
  grace: ['In grace period', 'warn', o => inGraph(o) && o.graph.compliance === 'inGracePeriod', true, true],
};
/* The operating system of a device as a family: Windows 11, Windows 10, Windows Server 2022, macOS, iOS, Android, Linux.
   Graph writes Windows by its build (10.0.22631): from build 22000 on it is Windows 11. Lansweeper shortens names
   ("Win 2019", "Win 2012 R2"): a Windows with a year is a server. */
export const osFamily = o => {
  const v = String(o.os || '').trim(), l = v.toLowerCase();
  /* No system reported, or one not known: the name or model may still say (FortiGate_40F, acmeesxi21, jdoe-iphone). */
  if (!v || !knownOs(l)) return osByName(o) || (v ? 'Other' : '');
  const server = l.match(/windows\s*server\s*(\d{4})?(\s*r2)?/) || l.match(/\b(?:win(?:dows)?|server)\s*(200[3-9]|20[1-3]\d)(\s*r2)?\b/);
  if (server) return 'Windows Server' + (server[1] ? ' ' + server[1] + (server[2] ? ' R2' : '') : '');
  const build = l.match(/windows\s*10\.0\.(\d+)/);
  if (build) return +build[1] >= 22000 ? 'Windows 11' : 'Windows 10';
  /* AD names some Windows 11 machines Windows 10 and gives the build: Windows 10 Enterprise (10.0.22631). */
  const adBuild = /windows\s*10\b/.test(l) && l.match(/\b10\.0\.(\d{5})\b/);
  if (adBuild) return +adBuild[1] >= 22000 ? 'Windows 11' : 'Windows 10';
  const win = l.match(/win(?:dows)?\s*(11|10|8\.1|8|7)\b/);
  if (win) return 'Windows ' + win[1];
  return osText(l) || 'Other';
};
/* The families a system's own text names, after Windows (above). Cisco's IOS is not Apple's iOS. */
const osText = l => {
  if (/cisco|\bios[\s-]?x[er]\b/.test(l)) return 'Cisco IOS';
  if (/mac\s*os|macos|\bos x\b/.test(l)) return 'macOS';
  if (/ipados|\bios\b|iphone os/.test(l)) return 'iOS / iPadOS';
  if (/android/.test(l)) return 'Android';
  if (/fortios|fortigate/.test(l)) return 'FortiOS';
  if (/esxi|vmware/.test(l)) return 'VMware ESXi';
  if (/hyper-v server/.test(l)) return 'Hyper-V Server';
  if (/proxmox/.test(l)) return 'Proxmox VE';
  if (/xenserver|xcp-ng|citrix hypervisor/.test(l)) return 'Citrix Hypervisor';
  if (/linux|ubuntu|debian|red hat|rhel|centos|suse|fedora/.test(l)) return 'Linux';
  if (/windows/.test(l)) return 'Windows (other)';
  return '';
};
const knownOs = l => /win|server/.test(l) || !!osText(l);
/* From the device's name and model, when its system says nothing: the few names that tell the system for sure. */
const osByName = o => {
  const t = `${o.name || ''} ${o.model || ''}`.toLowerCase();
  if (/forti(gate|wifi|os)|\bfgt[-_\d]/.test(t)) return 'FortiOS';
  if (/esxi|vmware esx/.test(t)) return 'VMware ESXi';
  if (/iphone|ipad|ipod/.test(t)) return 'iOS / iPadOS';
  return '';
};
/* Systems the maker no longer updates. */
export const OS_ENDED = ['Windows 10', 'Windows 8.1', 'Windows 8', 'Windows 7', 'Windows Server 2003', 'Windows Server 2008', 'Windows Server 2008 R2', 'Windows Server 2012', 'Windows Server 2012 R2'];
/* The Microsoft Graph status of a device on its card: its join type and compliance. Red when it is not compliant. */
export const graphChip = o => {
  if (!SYNC.graph || !o.graph || o.graph.gone || (!o.graph.join && !o.graph.compliance)) return '';
  const c = COMPLIANCE[o.graph.compliance];
  const text = [joinOf(o), c ? c[1] : o.graph.compliance].filter(Boolean).join(' · ');
  return `<span class="chip ${c && c[0] === 'bad' ? 'bad' : c && c[0] === 'warn' ? 'warn' : 'ok'}" title="Microsoft Entra and Intune">${esc(text)}</span>`;
};
/* AD, Entra and Intune on the card of a computer or phone: three marks that read at a glance, each lit when the device
   is there, with the details in its tooltip. Shown when Cards → "AD · Entra · Intune" is ticked; then they stand in for
   the Graph chip. AD: a computer account (the LDAP sync's) or hybrid joined. Entra: joined, hybrid or registered.
   Intune: managed, coloured by compliance. */
export const JOIN_STATE = { 'Entra joined': ['en', 'joined'], 'Hybrid joined': ['hy', 'hybrid'], 'Entra registered': ['reg', 'registered'] };
export const COMPLIANCE_SHORT = { compliant: 'compliant', noncompliant: 'not compliant', inGracePeriod: 'grace', conflict: 'conflict', error: 'error' };
export const joinBadges = o => {
  if (!GRAPH_TYPES.includes(o.type)) return '';
  /* What Graph said counts only while Graph is set up, as for the Graph chip: an old record is not shown as current. */
  const g = SYNC.graph && o.graph && !o.graph.gone ? o.graph : null, j = g ? joinOf(o) : o.inAd ? 'AD joined' : '';
  const ad = !!o.inAd || j === 'Hybrid joined', en = JOIN_STATE[j], it = !!(g && isIntune(g.managed));
  const c = it ? COMPLIANCE[g.compliance] : null, cls = !c ? 'ok' : c[0] === 'bad' ? 'bad' : c[0] === 'warn' ? 'warn' : c[0] === 'ok' ? 'ok' : 'nc';
  const seg = (on, kind, label, state, tip) => `<span class="jb ${on ? 'on ' + kind : 'no'}" title="${esc(tip)}"><i aria-hidden="true"></i><b>${label}</b><small>${esc(state)}</small></span>`;
  const tips = [
    ad ? (o.inAd ? 'Active Directory: has a computer account' + (j === 'Hybrid joined' ? ', hybrid joined' : '') : 'Active Directory: hybrid joined') : 'Active Directory: no computer account found',
    en ? `Microsoft Entra ID (Azure AD): ${j}. ${JOIN_INFO[j]}` : 'Microsoft Entra ID (Azure AD): not joined or registered',
    it ? `Microsoft Intune: managed${c ? ', ' + c[1].toLowerCase() : ''}` : g ? `Microsoft Intune: not managed${otherManager(g.managed) ? ' (' + otherManager(g.managed) + ')' : ''}` : 'Microsoft Intune: not managed',
  ];
  /* Without Microsoft Graph set up this app cannot know Entra or Intune: those two say so instead of "not joined". */
  const unk = (label, what) => `<span class="jb unk" title="${esc(what)}: not known, Microsoft Graph is not set up"><i aria-hidden="true"></i><b>${label}</b><small>not checked</small></span>`;
  if (!SYNC.graph) { tips[1] = 'Microsoft Entra ID (Azure AD): not known, Microsoft Graph is not set up'; tips[2] = 'Microsoft Intune: not known, Microsoft Graph is not set up'; }
  /* Defender for Endpoint, once it has been read (Settings): active and low risk is green, inactive or medium risk amber,
     high risk red. */
  const df = SYNC.defender ? defenderState(o) : null;
  if (df) tips.push(df.tip);
  return `<div class="jbar${df ? ' jbar4' : ''}" role="img" aria-label="${esc(tips.join('. '))}">
    ${seg(ad, 'ad', 'AD', ad ? (j === 'Hybrid joined' ? 'hybrid' : 'joined') : 'not joined', tips[0])}${SYNC.graph ? `${seg(!!en, en ? en[0] : '', 'Entra', en ? en[1] : 'not joined', tips[1])}${seg(it, cls, 'Intune', it ? (COMPLIANCE_SHORT[g.compliance] || 'managed') : 'not managed', tips[2])}` : unk('Entra', 'Microsoft Entra ID (Azure AD)') + unk('Intune', 'Microsoft Intune')}${df ? seg(df.on, df.cls, 'Defender', df.state, df.tip) : ''}
  </div>`;
};
/* What Defender for Endpoint says of a device, for its mark and its page. */
export function defenderState(o){
  const d = o.defender;
  if (!d) return { on: false, cls: '', state: 'not onboarded', tip: 'Microsoft Defender for Endpoint: not onboarded' };
  const health = { Active: 'active', Inactive: 'inactive', ImpairedCommunication: 'impaired', NoSensorData: 'no sensor data', NoSensorDataImpairedCommunication: 'no sensor data' }[d.health] || String(d.health || 'unknown').toLowerCase();
  const risk = String(d.risk || '').toLowerCase(), high = risk === 'high', medium = risk === 'medium';
  const cls = high ? 'bad' : d.health !== 'Active' || medium ? 'warn' : 'ok';
  const last = d.lastSeen ? ', last seen ' + d.lastSeen.slice(0, 10) : '';
  return { on: true, cls, state: high || medium ? `${risk} risk` : health,
    tip: `Microsoft Defender for Endpoint: ${health}${risk && risk !== 'none' ? ', risk ' + risk : ''}${d.exposure ? ', exposure ' + d.exposure.toLowerCase() : ''}${last}` };
}
/* When a device was last seen, by whichever source saw it last: Lansweeper's scan, its AD logon, Intune's check-in,
   its Entra sign-in or Defender. at: the day with its time where the source gives one (Intune, Entra, Defender), for
   the hover; AD and Lansweeper give the day only. */
/* A device waiting in To review that no source has seen for REVIEW_STALE_DAYS (or never) is likely gone: grey, Old,
   and left out of Accept all unless asked. */
export const reviewStale = o => { const s = lastSeenOf(o); return !s || s.days > REVIEW_STALE_DAYS; };
export function lastSeenOf(o){
  const g = o.graph && !o.graph.gone ? o.graph : null;
  const all = [['Lansweeper', o.feed && !o.excluded && !o.detached && o.feed.scanned], ['AD', o.ad && o.ad.logon], ['Intune', g && (g.lastCheckIn || g.lastSync)],
    ['Entra', g && g.lastSignIn], ['Defender', o.defender && o.defender.lastSeen], ['Autopilot', o.autopilot && o.autopilot.lastContact]]
    .map(([src, v]) => [src, String(v || '').slice(0, 10), String(v || '')]).filter(([, d]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d > '2000');
  if (!all.length) return null;
  const when = ([, d, raw]) => /T\d{2}:\d{2}/.test(raw) && Date.parse(raw) ? Date.parse(raw) : Date.parse(d + 'T00:00:00Z');
  const best = all.sort((a, b) => when(b) - when(a))[0], [src, day, raw] = best;
  const t = new Date(), today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  const timed = /T\d{2}:\d{2}/.test(raw) && Date.parse(raw);
  return { src, day, at: timed ? stamp(new Date(timed)) : dayText(day), days: Math.max(0, Math.round((today - Date.parse(day + 'T00:00:00Z')) / 864e5)) };
}
/* Data quality: what a device of the inventory lacks, or where its sources disagree. The Overview counts each, and a
   click lists them (st.quality). [name, what it means, test]. A responsible is asked for once there are internal contacts. */
const PERSONAL = ['pc', 'notebook', 'mobile', 'android', 'ios'];
/* The people by id, for the checks below (the user list lives in Settings, which sets it here). */
let PEOPLE_LIST = [], PEOPLE = new Map();
export const setPeople = list => { PEOPLE_LIST = list || []; PEOPLE = new Map(); };
/* Made again when people were added or removed since. */
const personOf = id => { if (PEOPLE.size !== PEOPLE_LIST.length) PEOPLE = new Map(PEOPLE_LIST.map(u => [u.id, u])); return PEOPLE.get(id); };
export const QUALITY = {
  noloc: ['No location', 'Where it is is not recorded', o => !o.loc],
  noresp: ['No responsible', 'No internal responsible, though there are internal contacts', o => !o.respIn && CONTACTS.list.some(c => c.kind === 'internal')],
  noserial: ['No serial number', 'A physical device without its serial number', o => !o.serial && o.kind !== 'vm' && !['vm', 'rack', 'patch'].includes(o.type)],
  nouser: ['No user', 'A computer or phone in use that nobody is assigned to', o => PERSONAL.includes(o.type) && o.status === 'active' && !o.uid && !o.user && !o.hotdesk],
  unseen: ['Not seen for 90 days', 'No source has seen it for over 90 days: is it still there?', o => { const s = lastSeenOf(o); return !!s && s.days > 90; }],
  unconfirmed: ['Not confirmed on site for 12 months', 'Not found in a stocktake, or confirmed on its page, for over a year', o => { if (!(st.stocktakes || []).some(t => t.finished)) return false; const d = daysSinceVerified(o); return d === null || d > STOCKTAKE_DAYS; }],
  leaver: ['With someone who left', 'Assigned to a person who is deactivated: take it back (Settings → Users → Hand-back list) or give it to someone else', o => o.status !== 'retired' && !!o.uid && !!personOf(o.uid) && personOf(o.uid).active === false],
  addisabled: ['Disabled in AD, marked in use', 'Its computer account is disabled in Active Directory, but here it is in use', o => o.status === 'active' && !!(o.ad && o.ad.disabled)],
  ownerdiff: ['Intune names someone else', 'The primary user in Intune is not the person it is assigned to here', o => {
    const p = o.uid && personOf(o.uid), g = o.graph;
    if (!p || !g || g.gone || !g.owner || o.status === 'retired') return false;
    const low = v => String(v || '').trim().toLowerCase(), owner = low(g.owner);
    return ![p.entra && p.entra.upn, p.profile && p.profile.mail, p.login].some(v => low(v) === owner) && !(g.ownerName && low(g.ownerName) === low(p.name))
      && !(p.source === 'ldap' && owner.split('@')[0] === low(p.login));
  }],
  conflict: ['Sources disagree', 'Lansweeper, Intune or AD give a field different values: compare and pick one', o => !!o.vals && Object.keys(o.vals).some(k => sourcesDisagree(o, k))],
};
/* "Seen today · Intune", "Seen 3 days ago · AD", "Seen 12.08.2026 · Lansweeper": amber after 30 days. */
export const seenChip = o => {
  const s = lastSeenOf(o); if (!s) return '';
  const when = s.days === 0 ? 'today' : s.days === 1 ? 'yesterday' : s.days < 31 ? s.days + ' days ago' : dayText(s.day);
  return `<span class="chip ${s.days > GRAPH_STALE_DAYS ? 'warn' : 'ok'} lsst seen" title="Last seen ${esc(s.at)} by ${esc(s.src)}">Seen ${esc(when)} · ${esc(s.src)}</span>`;
};
export const syncChip = o => { const s = syncOf(o); return s ? `<span class="chip ${s.cls} lsst" data-sync="${s.k}" title="${esc(s.label)}">${esc(s.label)}</span>` : ''; };

/* The feed owns a field when the object is linked, it has not overridden the field, and the default allows it. */
/* An object excluded from the sync, or detached, is not linked to Lansweeper: its fields are its own. */
export const feedLinked = o => !!o.feed && !o.excluded && !o.detached;
/* Where a field's value came from: 'hand', 'ls' (Lansweeper), 'graph' (Intune), 'ad' or 'unknown'; null for an empty
   field. Noted on the device (o.src) since the sources are kept; for older values it is worked out as far as it can be:
   kept by hand (unticked), still filled in by Lansweeper, added from Graph, or a device no sync has, else unknown. */
export function sourceOf(o, k){
  /* Type, status and kind are always set and say nothing of a source: no mark. */
  if (['type', 'status', 'kind'].includes(k)) return null;
  const custom = k.startsWith('custom.'), v = custom ? (o.custom || {})[k.slice(7)] : o[k];
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return null;
  if (custom) return 'hand';
  const s = o.src && o.src[k];
  if (s) return s;
  if (o.pick && o.pick[k] === 'hand') return 'hand';
  if (FIELD_LABEL[k] && feedLinked(o) && (feedOwns(o, k) || (o.feed && o.feed.created))) return 'ls';
  if (o.graph && o.graph.added && ['model', 'os', 'serial', 'user'].includes(k)) return 'graph';
  if (!o.feed && !(o.graph && o.graph.added)) return 'hand';
  return 'unknown';
}
const SRC_ICON = {
  hand: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  ls: '<circle cx="12" cy="12" r="9"/><path d="M12 7a5 5 0 1 0 5 5"/><path d="M12 12l6.4-6.4"/>',
  graph: '<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 10.2 4 4 0 0 0 7 18z"/>',
  ad: '<path d="M10 3h4v4h-4zM4 17h4v4H4zM16 17h4v4h-4zM12 7v5M6 17v-5h12v5"/>',
  unknown: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5M12 16.8h.01"/>',
};
/* What the source mark says when pointed at. */
export function sourceText(o, k, src = sourceOf(o, k)){
  const keep = ' Typing a value here keeps yours.';
  if (src === 'hand') return 'Set by hand' + (o.handAt ? ` · last edited here ${stamp(new Date(o.handAt))}` : '');
  if (src === 'ls') return 'From Lansweeper' + (o.feed && o.feed.scanned ? ` · last scan ${dayText(o.feed.scanned)}` : '');
  if (src === 'graph') return 'From Microsoft Entra & Intune' + (o.graph && (o.graph.lastCheckIn || o.graph.lastSync) ? ` · last check-in ${stamp(new Date(o.graph.lastCheckIn || o.graph.lastSync))}` : o.graph && o.graph.seen ? ` · read ${o.graph.seen}` : '') + '.' + keep;
  if (src === 'ad') return 'From the computer account in Active Directory' + (o.ad && o.ad.logon ? ` · last logon ${dayText(o.ad.logon)}` : '') + '.' + keep;
  if (src === 'unknown') return 'Where this value came from is not known: it was set before the sources were noted';
  return '';
}
/* The device a record named by a DNS name most likely stands for: argonb35.corp.example with no serial number, when a
   device here is named ARGONB35. Such a second record is often left in Lansweeper by a docking station's or a USB network
   adapter. A record marked as no duplicate (notTwin) has none, unless marked asks for the one it was marked against.
   Retired devices count on neither side; the device may also still wait in To review. The names are indexed
   once per task, so a list of thousands stays quick. */
let twinIdx = null;
export function twinOf(o, { marked = false } = {}){
  /* A record already decided on (ignored or merged in To review) is no open question. */
  if (!o || (o.notTwin && !marked) || (o.review && o.review.ignored) || o.serial || o.status === 'retired' || !/^[^.\s]+\.[^.\s]+/.test(o.name || '') || /^\d{1,3}(\.\d{1,3}){3}$/.test(o.name)) return null;
  if (!twinIdx){
    twinIdx = new Map();
    for (const x of [...objs, ...REVIEW.filter(r => !r.review.ignored)]) if (x.status !== 'retired' && x.name && !twinIdx.has(String(x.name).toLowerCase())) twinIdx.set(String(x.name).toLowerCase(), x);
    queueMicrotask(() => { twinIdx = null; });
  }
  const t = twinIdx.get(String(o.name).toLowerCase().split('.')[0]);
  return t && t.id !== o.id ? t : null;
}
/* The other way round: the probable second records of a device (argonb35.corp.example for ARGONB35), in the inventory or
   still waiting in To review. Indexed once per task, like twinOf. */
let twinsIdx = null;
export function twinsOf(o){
  if (!o) return [];
  if (!twinsIdx){
    twinsIdx = new Map();
    for (const x of [...objs, ...REVIEW.filter(r => !r.review.ignored)]){ const t = twinOf(x); if (t) twinsIdx.set(t.id, [...(twinsIdx.get(t.id) || []), x]); }
    queueMicrotask(() => { twinsIdx = null; });
  }
  return twinsIdx.get(o.id) || [];
}
/* Whether field k of o is fixed to one source: the source picked for it, or 'hand' for a value kept as typed here. */
export const fieldFixed = (o, k) => (o.pick && o.pick[k]) || '';
const LOCK = '<svg class="fsrc-lock" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5.5" width="8" height="5.5" rx="1.2"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/></svg>';
/* The source as a small monochrome mark beside the field, the one place that says where the value comes from and whether
   it follows its sources: a lock when it is fixed to one, a dot when the sources differ. Click it to compare and pick.
   An empty field has an empty slot of the same width, unless it is fixed (emptied by hand): then the lock shows. */
export function sourceMark(o, k){
  const src = sourceOf(o, k), fixed = FIELD_LABEL[k] ? fieldFixed(o, k) : '';
  if (!src && !fixed) return '<span class="fsrc-slot" aria-hidden="true"></span>';
  const shown = src || 'hand', others = sourcesDisagree(o, k);
  const t = src ? sourceText(o, k, src) : 'Emptied here: no source fills it in';
  const tip = t + (fixed === 'hand' ? ' · Kept as typed: the syncs leave it as it is' : fixed ? ` · Fixed: only ${{ ls: 'Lansweeper', graph: 'Entra & Intune', ad: 'Active Directory' }[fixed] || fixed} writes it` : '') + (others ? ' · The sources differ: click to compare and pick one' : ' · Click to see each source');
  return `<span class="fsrc${others ? ' fsrc-multi' : ''}${fixed ? ' fsrc-picked' : ''}${src ? '' : ' fsrc-empty'}" data-src="${shown}" data-fk="${esc(k)}" data-oid="${esc(o.id)}" role="button" tabindex="0" aria-label="${esc(tip)}" title="${esc(tip)}"><svg viewBox="0 0 24 24" aria-hidden="true">${SRC_ICON[shown]}</svg>${fixed ? LOCK : ''}</span>`;
}
/* Whether the sources give field k of o different values (or a value other than the one in use): worth a look. */
/* Once the field is fixed to a source (or kept as typed), the person has decided: no dot. A value kept from by hand does not count. */
export function sourcesDisagree(o, k){
  const f = o.vals && o.vals[k]; if (!f || fieldFixed(o, k)) return false;
  const vals = new Set(Object.entries(f).filter(([src]) => src !== 'hand').map(([, [v]]) => String(v)));
  if (!vals.size) return false;
  return vals.size > 1 || (o[k] != null && o[k] !== '' && !vals.has(String(o[k])));
}
export { SRC_ICON };
/* The source picker (srcpick.js) draws what a click on a mark shows when the field has values from the sources. */
let srcPicker = null;
export const setSrcPicker = f => { srcPicker = f; };
/* Whether Lansweeper writes field k of o: for a field the sources set, as its order says (Settings → Data sources);
   else the source picked for it, else the policy (Settings → Lansweeper); the lists
   (software, links) are Lansweeper's unless the policy turns them off. As the server's lsOwns (fill.js). */
export const feedOwns = (o, k, linked = feedLinked(o)) => !!(LS_ON() && st.feedOn && linked && (ORDER_FIELDS.includes(k) ? maySet(st, o, k, 'ls') : o.pick && o.pick[k] ? o.pick[k] === 'ls'
  : ['software', 'links'].includes(k) ? (st.policy || {})[k] !== false : !!(st.policy || {})[k]));
/* A field (or list) set by hand: no sync writes it from then on. */
export const pickHand = (o, k) => { o.pick = {...(o.pick || {}), [k]: 'hand'}; };

/* ---------- helpers ---------- */
/* What a custom type icon's viewBox and a type's colour may be. Checked by the server too (server/state.js). */
export const VIEWBOX_RE = /^-?[\d.]+([\s,]+-?[\d.]+){3}$/;
export const COLOR_RE = /^#[0-9a-f]{3,8}$/i;
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* A type's colour goes into a style attribute: only a hex colour is used. */
export const tcol = t => COLOR_RE.test(TYPES[t]?.color || '') ? TYPES[t].color : '#888';
/* A type's icon; hovering it names the type (Notebook, PC, Server …). */
export const tico = (t, cls='tico') => `<span class="${cls}" role="img" aria-label="${esc(TYPES[t]?.label || t)}" title="${esc(TYPES[t]?.label || t)}" style="--tc:${tcol(t)}">${svg(t)}</span>`;
export { pad2 };
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
export const now = () => stamp(new Date());
/* A short message at the bottom. The box is a live region that always stays in the page (it fades out, it is never
   hidden), so a screen reader hears each new text. The same message again is changed by an invisible character, so
   it is read again too. */
/* A short message at the bottom. One that says a change was not saved is red and stays longer (a click hides it). */
export function toast(msg, kind = /^Not saved/.test(msg) ? 'err' : ''){
  const t = $('#toast');
  t.textContent = t.textContent === msg ? msg + '\u200b' : msg;
  t.classList.toggle('err', kind === 'err');
  t.onclick = () => t.classList.add('off');
  t.classList.remove('off'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('off'), kind === 'err' ? 8000 : 2800);
}
/* A message with Undo: for a change made to many devices at once, or one hard to set back by hand (retire, a bulk move,
   a room renamed). Undo is offered for 10 seconds; the page that made the change says what undoing does. */
/* A reload from the server replaces every record (applyState counts them in epoch): an Undo offered before it would write
   into records that are no longer the page's, so it is refused instead. */
export const UNDO = { epoch: 0 };
/* anyEpoch: an Undo that finds its records again by id, so a reload in between does not stop it. */
export function toastUndo(msg, undo, { anyEpoch = false } = {}){
  const t = $('#toast'), epoch = UNDO.epoch;
  t.innerHTML = `<span>${esc(msg)}</span><button type="button" class="t-undo">Undo</button>`;
  t.classList.remove('err', 'off');
  t.onclick = e => {
    t.classList.add('off'); clearTimeout(toast.h);
    if (!e.target.closest('.t-undo')) return;
    if (!anyEpoch && UNDO.epoch !== epoch){ toast('The inventory was reloaded since, so this can no longer be undone. Change it back by hand.'); return; }
    undo(); toast('Undone');
  };
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('off'), 10000);
}
/* The devices as they are now, to put back on Undo: every field, so what the change touched is set back and nothing else. */
export const snapshot = list => list.filter(Boolean).map(o => [o, JSON.parse(JSON.stringify(o))]);
export function restoreSnapshot(snap, why = 'Undone'){
  for (const [o, was] of snap){
    /* The user is read from uid (and hotdesk); writing its name back would look the person up again, or make one. */
    const rest = { ...was }; delete rest.user;
    for (const k of Object.keys(o)) if (k !== 'user' && !(k in rest)) delete o[k];
    Object.assign(o, rest);
    hist(o, now(), why);
  }
}
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

/* The devices the sidebar's filters and the search leave. A Microsoft Graph filter left from before Graph was removed
   passes every device, except the join filters: AD joined only comes from the LDAP sync, so they still apply. */
/* Whether an object has the search text in one of the fields a search looks at. */
export const matchesQ = (o, q) => !q || [o.code,o.name,o.notes,o.ip,o.ip6,o.mac,o.serial,o.user,o.model,o.ext,...(o.nics || []).flatMap(n => [n.ip, n.mac]),...(o.accessories || []).flatMap(a => [a.name, a.serial, a.mac, a.seenAs]),...(o.adGroups || []),(contactOf(o.respIn) || {}).name,(contactOf(o.respEx) || {}).name,...(o.urls || []).flatMap(l => [l.label, l.url]),...(o.graph ? [o.graph.aadId, o.graph.entraId, o.graph.intuneId] : [])].some(v => v && String(v).toLowerCase().includes(q));
/* The filters picked on the left (type, place, status and the others), in words, for a message: "PC", "PC in Bern". */
export const leftFilters = () => !!(st.type || st.loc || st.status || st.warranty || st.scanOld || st.twins || st.intune || st.osFam || st.live || st.resp || st.adGroup || st.quality);
/* What Cards, Table and the sidebar show: the inventory, or (st.scope) the devices a sync found that wait in To review,
   one source of them (st.rvSrc), or the ones ignored there. */
export const scopePool = () => st.scope === 'ignored' ? REVIEW.filter(o => o.review && o.review.ignored)
  : st.scope === 'review' ? REVIEW.filter(o => o.review && !o.review.ignored && (!st.rvSrc || o.review.src === st.rvSrc) && (!st.rvKnown || o.inAd || !!o.graph) && (!st.rvOld || reviewStale(o))) : objs;
/* The objects a search finds when the filters on the left are left out: shown when those filters hide every hit, so a
   search for something that is there never ends in "nothing matches". */
export const searchAll = () => { const q = st.q.trim().toLowerCase(); return q && leftFilters() ? scopePool().filter(o => matchesQ(o, q)) : []; };
export function filtered(){
  const q = st.q.trim().toLowerCase();
  /* A search looks within the type, place and status picked on the left; with All objects it looks through every object. */
  return scopePool().filter(o => (((!st.type || o.type === st.type) && (!st.loc || (st.loc.includes(' / ') ? o.loc === st.loc : String(o.loc || '').split(' / ')[0] === st.loc)) && (!st.status || o.status === st.status) && (!st.warranty || warrantyState(o) === st.warranty) && (!st.scanOld || scanOld(o)) && (!st.twins || !!twinOf(o)) && (!st.intune || !GRAPH_FILTERS[st.intune] || (!SYNC.graph && GRAPH_FILTERS[st.intune][1] !== 'join') || GRAPH_FILTERS[st.intune][2](o)) && (!st.osFam || osFamily(o) === st.osFam) && (!st.live || o.status !== 'retired') && (!st.resp || o.respIn === st.resp || o.respEx === st.resp) && (!st.adGroup || (o.adGroups || []).some(g => g.toLowerCase() === st.adGroup.toLowerCase())) && (!st.quality || !QUALITY[st.quality] || QUALITY[st.quality][2](o))))
    && matchesQ(o, q));
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

/* Days since a stamp ("dd.mm.yyyy hh:mm"); 0 when it is not one. */
export function daysSince(s){ const t = stampTime(s); return t ? (Date.now() - t) / 864e5 : 0; }

/* A click (or Enter) on a source mark shows what its tooltip says, so it can be read on a touch screen and without
   waiting for the hover. Another click, a click elsewhere or Escape closes it. */
let srcPopAt = 0, srcPopMark = null;
/* Closing puts the focus back on the mark it came from (found again after a redraw by its device and field). */
function closeSrcPop(refocus = false){
  const p = document.getElementById('fsrcPop'); if (p) p.remove();
  if (refocus && srcPopMark){
    const { oid, fk } = srcPopMark;
    const m = document.querySelector(`.fsrc[data-oid="${CSS.escape(oid)}"][data-fk="${CSS.escape(fk)}"]`);
    if (m) m.focus();
  }
}
function openSrcPop(mark){
  const was = document.getElementById('fsrcPop');
  closeSrcPop();
  if (was && was.dataset.for === mark.dataset.popId) return;
  mark.dataset.popId ||= 'f' + Math.random().toString(36).slice(2);
  const p = document.createElement('div');
  p.id = 'fsrcPop'; p.className = 'fsrc-pop'; p.setAttribute('role', 'status'); p.dataset.for = mark.dataset.popId;
  srcPopMark = { oid: mark.dataset.oid || '', fk: mark.dataset.fk || '' };
  const picker = srcPicker && srcPicker(mark, () => closeSrcPop(true));
  if (picker){ p.classList.add('pick'); p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Where this value comes from'); p.append(picker); }
  else p.textContent = mark.getAttribute('aria-label') || mark.title;
  document.body.append(p); srcPopAt = Date.now();
  /* Under the mark, or above it when there is no room below; never past the window (a long list scrolls). */
  const r = mark.getBoundingClientRect(), room = window.innerHeight - 8;
  p.style.maxHeight = `${Math.max(160, room - 8)}px`;
  const h = p.offsetHeight, below = r.bottom + 6, above = r.top - 6 - h;
  const top = below + h <= room ? below : above >= 8 ? above : Math.max(8, room - h);
  p.style.top = `${top + window.scrollY}px`;
  p.style.left = `${Math.max(8, Math.min(window.innerWidth - p.offsetWidth - 8, r.left + r.width / 2 - p.offsetWidth / 2)) + window.scrollX}px`;
  /* The picker takes the focus on the value in use, so it works from the keyboard: arrows move, Enter picks. */
  if (picker){ const cur = p.querySelector('[role=radio][aria-checked=true]') || p.querySelector('[role=radio]'); if (cur) cur.focus(); }
}
if (typeof document !== 'undefined'){
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#fsrcPop')) return; const m = e.target.closest && e.target.closest('.fsrc'); if (m) openSrcPop(m); else closeSrcPop(); });
  document.addEventListener('keydown', e => {
    const pop = document.getElementById('fsrcPop');
    if (e.key === 'Escape' && pop){ closeSrcPop(pop.classList.contains('pick') || document.activeElement === document.body || !!(e.target.closest && e.target.closest('#fsrcPop'))); return; }
    if (pop && e.target.closest && e.target.closest('#fsrcPop')){
      const items = [...pop.querySelectorAll('[role=radio], .sp-foot button')];
      const i = items.indexOf(document.activeElement);
      if (['ArrowDown', 'ArrowUp'].includes(e.key) && items.length){ e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); return; }
      /* Tab stays in the picker; leaving it is Escape. */
      if (e.key === 'Tab' && items.length){ e.preventDefault(); items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus(); return; }
    }
    else if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('fsrc')){ e.preventDefault(); openSrcPop(e.target); }
  });
  /* On a phone, More in the top bar opens the account, sign-out and display buttons; any choice or a click elsewhere
     closes it. The search hint for Ctrl+K is left out where there is no keyboard. */
  const moreBtn = document.getElementById('barMoreBtn');
  const setMore = open => { document.body.classList.toggle('bar-more', open); if (moreBtn) moreBtn.setAttribute('aria-expanded', String(open)); };
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('#barMoreBtn')) { setMore(!document.body.classList.contains('bar-more')); return; }
    if (document.body.classList.contains('bar-more')) setMore(false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('bar-more')){ setMore(false); if (moreBtn) moreBtn.focus(); } });
  if (window.matchMedia && matchMedia('(hover:none)').matches){ const q = document.getElementById('search'); if (q) q.placeholder = 'Search…'; }
  /* A file button (a label around a hidden file field) opens the file dialog from the keyboard too. */
  document.addEventListener('keydown', e => {
    const l = (e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('label.btnlike[role=button]') ? e.target : null;
    if (!l || l.classList.contains('disabled')) return;
    e.preventDefault(); const f = l.querySelector('input[type=file]'); if (f && !f.disabled) f.click();
  });
  /* Scrolling closes it, except the scroll that brought the mark into view just before (it arrives after the click). */
  document.addEventListener('scroll', e => { if (Date.now() - srcPopAt > 400 && !(e.target.closest && e.target.closest('#fsrcPop'))) closeSrcPop(); }, true);
}

/* A field set by hand anywhere but its own field (a bulk move, a rack, a plan, a refused save applied again) is noted as
   the page's, so a sync that filled it does not put its value back. */
export function markHand(o, k){
  if (o.src && o.src[k] && o.src[k] !== 'hand') o.src = {...o.src, [k]: 'hand'};
  keepByHand(o, k);
  /* Lansweeper writes a field it owns whatever its source note says: a linked device keeps the value as set here. */
  if (feedLinked(o)) pickHand(o, k);
}
/* A value set by hand over a source picked for the field: the field is the page's from then on, no sync writes it. */
export function keepByHand(o, k){ if (o.pick && o.pick[k] && o.pick[k] !== 'hand') o.pick = {...o.pick, [k]: 'hand'}; }

/* The one way to edit a row or a card: a pencil button at its end, the same in every list (contacts, contracts, licences).
   attr says what it opens (data-…="id"); a viewer gets Show instead of Edit. */
/* Delete at the end of a row or card, next to Edit: a monochrome bin; what it does is asked first (confirmModal). */
export const deleteButton = (attr, name) => `<button type="button" class="icon ghost delbtn" ${attr} aria-label="Delete ${esc(name)}" title="Delete"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg></button>`;
export const editButton = (attr, name, edit = true) => `<button type="button" class="icon ghost editbtn" ${attr} aria-label="${edit ? 'Edit' : 'Show'} ${esc(name)}" title="${edit ? 'Edit' : 'Show'}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/></svg></button>`;
