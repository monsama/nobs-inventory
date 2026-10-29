import { syncButtonHtml } from './16-sync.js';
import { money } from './09-costs.js';
import { parseCsv } from './csv.js';
import { respText, setResponsible } from './11-contacts.js';
import { CONTACT_KINDS, contactLabel } from './contacts.js';
import { linkHref, linkKind } from './links.js';
import { twinOf, markHand, FIELD_LABEL, sourceText, REVIEW, lastSeenOf, GRAPH_STALE_DAYS, seenChip, CONTACTS, contactOf, GRAPH_TYPES, joinBadges, feedLinked, osFamily, JOIN_INFO, SYNC, GRAPH_FILTERS, scanOld, scanChip, LS_ON, lagLinkOf, relIndex, FIELD_LAYOUT, WARRANTY_SOON_DAYS, warrantyState, dayText, graphChip, isAttached, markHtml, syncOf, TYPE_FIELDS, hasPorts, vlanLabel, $, LOCS, O, SITES, STATUS, TYPES, byId, esc, filtered, hist, isUplink, leftFilters, now, objs, restoreSnapshot, searchAll, snapshot, toastUndo, pfxOf, portLabel, rels, relsOf, st, syncChip, tcol, tico, toast, used } from './01-core.js';
import { SERVER, queueServerSave, render, view } from './07-render-plans.js';
import { TBL, bindListFilter, cmpCells, listFilterHtml, saveTBL } from './06-topbar.js';
import { linkObjModal, newObjModal } from './05-new-object.js';
import { USERS, bindUser, canEdit, checkAddress, rackOf, showDevicesOf } from './04-settings.js';
import { closeModal, modal } from './03-object-modals.js';
/* ---------- sidebar ---------- */
/* What the problem filters mean, on hover. */
const GRAPH_TIPS = {
  missing: 'Devices that Entra and Intune do not have, or no longer have since a sync',
  duplicates: 'Devices Entra has more than one record of (reinstalled, or hybrid joined and also registered): the old records can be deleted in Entra',
  notjoined: 'Computers and phones that are neither in Entra nor have a computer account in AD',
  ambiguous: 'Graph has a device whose serial number or name fits more than one device here, so it was put on none: give them distinct names or serial numbers',
};
export function renderSide(){
  const cnt = f => objs.filter(f).length;
  /* With an object type selected, the locations count only objects of that type. */
  const ofType = f => o => (!st.type || o.type === st.type) && f(o);
  /* Types without a device are folded away ("+ 8 more types"), so the places and states below come into view; the type
     picked stays. "All objects" is marked only when nothing at all narrows the list. */
  const byType = objs.reduce((m, o) => (m[o.type] = (m[o.type] || 0) + 1, m), {});
  const typeBtn = ([k, v]) => `<button class="item ${st.type===k?'sel':''}" data-type="${k}">${tico(k,'tico sm')}<span class="lbl">${esc(v.label)}</span><span class="cnt">${byType[k] || 0}</span></button>`;
  const types = Object.entries(TYPES), shown = types.filter(([k]) => byType[k] || st.type === k || st.sideAllTypes), folded = types.length - shown.length;
  $('#typeList').innerHTML =
    `<button class="item ${!st.type && !leftFilters() && !st.q.trim() ? 'sel' : ''}" data-type=""><span class="lbl">All objects</span><span class="cnt">${objs.length}</span></button>` +
    shown.map(typeBtn).join('') +
    (folded ? `<button class="side-more" data-alltypes="1">+ ${folded} more type${folded === 1 ? '' : 's'} without devices</button>`
      : st.sideAllTypes && types.some(([k]) => !byType[k] && st.type !== k) ? '<button class="side-more" data-alltypes="0">Fewer types</button>' : '');
  const sites = [...new Set([...SITES, ...LOCS.map(l => l.split(' / ')[0])])];
  $('#locList').innerHTML = sites.map(s => `<button class="item ${st.loc===s?'sel':''}" data-loc="${esc(s)}"><span class="lbl">${esc(s)}</span><span class="cnt">${cnt(ofType(o=>String(o.loc||'').split(' / ')[0]===s))}</span></button>` +
    LOCS.filter(l => l.startsWith(s + ' / ')).map(l => `<button class="item sub ${st.loc===l?'sel':''}" data-loc="${esc(l)}"><span class="lbl">${esc(l.split(' / ')[1])}</span><span class="cnt">${cnt(ofType(o=>o.loc===l))}</span></button>`).join('')).join('');
  /* Warranty: devices whose warranty ends within 90 days, and those whose has ended. */
  $('#wtyList').innerHTML = [['soon', `Ends within ${WARRANTY_SOON_DAYS} days`, 'warn'], ['ended', 'Ended', 'bad']].map(([k, l, c]) => `<button class="item ${st.warranty===k?'sel':''}" data-warranty="${k}"><span class="dot ${c}"></span><span class="lbl">${l}</span><span class="cnt">${cnt(o => warrantyState(o) === k)}</span></button>`).join('');
  /* Lansweeper: devices it has not scanned for three months, to be checked by hand. Shown while Lansweeper is in use. */
  const nOld = LS_ON() ? cnt(o => scanOld(o)) : 0;
  $('#chkHdr').hidden = $('#chkList').hidden = !LS_ON();
  /* Probable duplicates: a record named by a DNS name with no serial number, beside a device of that name. Listed only
     when there are some. */
  const nTwins = LS_ON() ? cnt(o => !!twinOf(o)) : 0;
  $('#chkList').innerHTML = LS_ON() ? `<button class="item ${st.scanOld?'sel':''}" data-scanold="1" title="Lansweeper has not scanned them for over 3 months"><span class="dot warn"></span><span class="lbl">Check by hand</span><span class="cnt">${nOld}</span></button>`
    + (nTwins || st.twins ? `<button class="item ${st.twins?'sel':''}" data-twins="1" title="Named by a DNS name, with no serial number, beside a device of that name: most likely a second record of it, e.g. from a docking station"><span class="dot warn"></span><span class="lbl">Probable duplicates</span><span class="cnt">${nTwins}</span></button>` : '') : '';
  /* Microsoft Graph: devices that are not compliant, not encrypted, not heard of for a while, or not in Entra and Intune.
     Shown once Graph is set up. */
  $('#grHdr').hidden = $('#grList').hidden = !SYNC.graph;
  /* The problems first; then how the devices are joined, each with what it means, and only the kinds that occur. */
  $('#grList').innerHTML = SYNC.graph ? Object.entries(GRAPH_FILTERS).map(([k, [l, c, f, onlyWhenSome, fromOverview]]) => {
    const n = cnt(f), join = c === 'join';
    if (fromOverview && st.intune !== k) return '';
    if ((join || onlyWhenSome) && !n && st.intune !== k) return '';
    return `${k === 'entra' ? '<div class="side-sub">Joined</div>' : ''}<button class="item ${st.intune === k ? 'sel' : ''}" data-intune="${k}" title="${esc(join ? JOIN_INFO[l === 'AD joined only' ? 'AD joined' : l] || GRAPH_TIPS[k] : GRAPH_TIPS[k] || l)}">${join ? '' : `<span class="dot ${c}"></span>`}<span class="lbl">${l}</span><span class="cnt">${n}</span></button>`;
  }).join('') : '';
  /* An operating system picked on the Overview: shown here while it filters, with a way out. */
  $('#osHdr').hidden = $('#osList').hidden = !st.osFam;
  $('#osList').innerHTML = st.osFam ? `<button class="item sel" data-osfam="" title="Show all devices again"><span class="lbl">${esc(st.osFam)}</span><span class="cnt">${cnt(o => osFamily(o) === st.osFam)}</span><span aria-hidden="true">×</span></button>` : '';
  /* A contact's devices, opened from Contacts: shown here while it filters, with a way out. */
  const rc = contactOf(st.resp);
  $('#respHdr').hidden = $('#respList').hidden = !rc;
  $('#respList').innerHTML = rc ? `<button class="item sel" data-resp="" title="Show all devices again"><span class="lbl">${esc(rc.name)}</span><span class="cnt">${cnt(o => o.respIn === rc.id || o.respEx === rc.id)}</span><span aria-hidden="true">×</span></button>` : '';
  /* An AD group picked on a device: shown here while it filters, with a way out. */
  $('#adgHdr').hidden = $('#adgList').hidden = !st.adGroup;
  $('#adgList').innerHTML = st.adGroup ? `<button class="item sel" data-adgroup="" title="Show all devices again"><span class="lbl">${esc(st.adGroup)}</span><span class="cnt">${cnt(o => (o.adGroups || []).some(g => g.toLowerCase() === st.adGroup.toLowerCase()))}</span><span aria-hidden="true">×</span></button>` : '';
  /* Retired devices left out, as the Overview counts: shown while it filters, with a way out. */
  $('#statList').innerHTML = (st.live ? `<button class="item sel" data-live title="Retired devices are left out, as on the Overview. Click to show them too"><span class="dot"></span><span class="lbl">Not retired</span><span class="cnt">${cnt(o => o.status !== 'retired')}</span><span aria-hidden="true">×</span></button>` : '') + Object.entries(STATUS).map(([k,v]) => `<button class="item ${st.status===k?'sel':''}" data-status="${k}"><span class="dot ${k==='active'?'':k==='repair'?'warn':k==='retired'?'bad':'off'}"></span><span class="lbl">${esc(v.label)}</span><span class="cnt">${cnt(o=>o.status===k)}</span></button>`).join('');
}
$('#side').addEventListener('click', e => {
  const more = e.target.closest('[data-alltypes]');
  if (more){ st.sideAllTypes = more.dataset.alltypes === '1'; renderSide(); return; }
  const b = e.target.closest('.item'); if (!b) return;
  /* A type clicked again goes back to all types. */
  if ('type' in b.dataset) st.type = b.dataset.type && st.type !== b.dataset.type ? b.dataset.type : null;
  if ('loc' in b.dataset) st.loc = st.loc === b.dataset.loc ? null : b.dataset.loc;
  if ('live' in b.dataset) st.live = false;
  if ('status' in b.dataset) st.status = st.status === b.dataset.status ? null : b.dataset.status;
  if ('warranty' in b.dataset) st.warranty = st.warranty === b.dataset.warranty ? null : b.dataset.warranty;
  if ('scanold' in b.dataset) st.scanOld = !st.scanOld;
  if ('twins' in b.dataset) st.twins = !st.twins;
  if ('adgroup' in b.dataset) st.adGroup = null;
  if ('resp' in b.dataset) st.resp = null;
  if ('osfam' in b.dataset) st.osFam = null;
  if ('intune' in b.dataset) st.intune = st.intune === b.dataset.intune ? null : b.dataset.intune;
  if (!['cards','table','map'].includes(st.tab)) st.tab = 'cards';
  document.body.classList.remove('side-open');
  view();
});
/* Every filter back to none: the sidebar's, the search and the table's column filters. Shared with the Overview. */
export function resetFilters(){
  st.type = st.loc = st.status = st.warranty = st.adGroup = st.intune = st.osFam = st.resp = null; st.scanOld = st.twins = st.live = false; st.q = '';
  Object.values(TBL).forEach(t => { t.filters = {}; }); saveTBL();
}
$('#clearF').onclick = () => { resetFilters(); view(); };
/* The filters in force, as chips over the list (Cards, Table, Relationships): what each is, and × to take it off, so a
   short list is never a mystery. Nothing is shown when nothing narrows the list. */
export function renderFilterBar(){
  const bar = $('#fbar'); if (!bar) return;
  const list = ['cards', 'table', 'map'].includes(st.tab);
  const rc = contactOf(st.resp);
  const chips = !list ? [] : [
    st.type && TYPES[st.type] && ['type', 'Type', TYPES[st.type].label],
    st.loc && ['loc', 'Location', st.loc],
    st.status && STATUS[st.status] && ['status', 'Status', STATUS[st.status].label],
    st.live && ['live', '', 'Not retired'],
    st.warranty && ['warranty', 'Warranty', st.warranty === 'soon' ? `ends within ${WARRANTY_SOON_DAYS} days` : 'ended'],
    st.scanOld && ['scanOld', '', 'Not scanned for 3 months'],
    st.twins && ['twins', '', 'Probable duplicates'],
    st.intune && GRAPH_FILTERS[st.intune] && ['intune', 'Entra / Intune', GRAPH_FILTERS[st.intune][0]],
    st.osFam && ['osFam', 'OS', st.osFam],
    rc && ['resp', 'Responsible', rc.name],
    st.adGroup && ['adGroup', 'AD group', st.adGroup],
    st.q.trim() && ['q', 'Filter', '“' + st.q.trim() + '”'],
  ].filter(Boolean);
  bar.hidden = !chips.length;
  bar.innerHTML = chips.length ? `<span class="fb-l">Showing only</span>${chips.map(([k, l, v]) => `<button type="button" class="fchip" data-fx="${k}" title="Take this filter off"><span>${l ? `${esc(l)}: ` : ''}<b>${esc(v)}</b></span><span class="x" aria-hidden="true">×</span></button>`).join('')}${chips.length > 1 ? '<button type="button" class="fb-clear" data-fx="all">Clear all</button>' : ''}` : '';
}
$('#fbar').addEventListener('click', e => {
  const b = e.target.closest('[data-fx]'); if (!b) return;
  const k = b.dataset.fx;
  if (k === 'all') resetFilters();
  else if (k === 'q') st.q = '';
  else if (k === 'scanOld' || k === 'twins' || k === 'live') st[k] = false;
  else st[k] = null;
  view();
});
/* When the filters on the left (a type, a place, a status …) hide every object the search finds: says so and how many
   it finds without them, with a button that keeps the search and drops those filters. '' when that is not the case. */
export function hiddenHits(){
  const all = searchAll(), q = st.q.trim();
  if (!all.length) return '';
  const within = [st.type && TYPES[st.type] ? TYPES[st.type].label : '', st.loc || '', st.status && STATUS[st.status] ? STATUS[st.status].label.toLowerCase() : ''].filter(Boolean).join(', ') || 'the filters on the left';
  return `<div class="empty">Nothing matches “${esc(q)}” within ${esc(within)}. ${all.length === 1 ? `1 object outside ${st.type ? 'this type' : 'these filters'} does: <b>${esc(all[0].name)}</b>` : `${all.length} objects outside ${st.type ? 'this type' : 'these filters'} do`}. <button class="primary" id="searchAllBtn">Search all objects</button></div>`;
}
export function bindHiddenHits(){
  const b = $('#searchAllBtn');
  if (b) b.onclick = () => { const q = st.q; resetFilters(); st.q = q; view(); };
}
$('#sideBtn').onclick = () => document.body.classList.toggle('side-open');

/* ---------- tabs ---------- */
/* Tabs: the views and the open objects, in one row that can be reordered by dragging, as in NOBS SQL. */
export const FIXED_TABS = {overview:'Overview', review:'To review', cards:'Cards', table:'Table', map:'Relationships', plans:'Floor plans', net:'Ports', rack:'Racks', sw:'Software', contracts:'Contracts', contacts:'Contacts'};
export function renderTabs(){
  /* To review shows while devices wait in it, with how many; once it is empty it goes, unless it is the tab open. */
  const waiting = REVIEW.filter(o => !o.review.ignored).length;
  const ids = st.tabIds.filter(id => (FIXED_TABS[id] || st.open.includes(id)) && (id !== 'review' || waiting || st.tab === 'review'));
  /* Views (Cards, Table, ...) and the objects opened from them are two groups: the objects are marked with their type colour. */
  const views = ids.filter(id => FIXED_TABS[id]), objs = ids.filter(id => !FIXED_TABS[id]);
  const viewTab = id => `<button class="tab ${st.tab===id?'active':''}" draggable="true" data-tab="${id}">${FIXED_TABS[id]}${id === 'review' && waiting ? ` <span class="tab-cnt">${waiting}</span>` : ''}</button>`;
  /* To review sits on its own at the right end of the bar: an inbox, not one of the views. */
  /* Sync (admins) and To review sit on their own at the right end of the bar: actions and an inbox, not views. */
  const sync = syncButtonHtml(), right = sync || views.includes('review');
  $('#tabsbar').innerHTML = views.filter(id => id !== 'review').map(viewTab).join('') + (right ? '<span class="grow"></span>' : '') + sync
    + (views.includes('review') ? viewTab('review').replace('class="tab ', 'class="tab tab-review ').replace(' draggable="true"', '') : '');
  /* The open objects have a row of their own under the views, shown while at least one is open. */
  $('#objbar').hidden = !objs.length;
  $('#objbar').innerHTML = (objs.length ? '<span class="tabs-cap">Open objects</span>' : '') + objs.map(id => {
    const o = byId(id);
    return `<span class="tab objtab ${st.tab===id?'active':''}" draggable="true" data-tab="${id}" role="button" tabindex="0"><span class="tsw" style="background:${tcol(o.type)}"></span><span class="mono" title="${esc(o.name)}">${esc(o.name)}</span><span class="x" data-close="${id}" title="Close (middle-click also closes)">×</span></span>`;
  }).join('') + (objs.length > 1 ? '<span class="grow"></span><button class="objbar-close" id="closeAllTabs" title="Close all open objects">Close all</button>' : '');
  document.querySelectorAll('#tabsbar [data-tab], #objbar [data-tab]').forEach(el => {
    const id = el.dataset.tab;
    el.addEventListener('dragstart', e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('dragover'); });
    el.addEventListener('dragleave', () => el.classList.remove('dragover'));
    el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('dragover'); const src = e.dataTransfer.getData('text/plain'); if (src && src !== id) reorderTabs(src, id); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); st.tab = id; view(); } });
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
  view();
}
export function closeObjTab(id){
  st.open = st.open.filter(x => x !== id); st.tabIds = st.tabIds.filter(x => x !== id);
  if (st.tab === id) st.tab = 'cards';
  view();
}
/* Closes every open object tab except `keep` (or all of them when keep is null). The views stay open. */
export function closeObjTabs(keep){
  st.open = st.open.filter(x => x === keep);
  st.tabIds = st.tabIds.filter(x => FIXED_TABS[x] || x === keep);
  if (!FIXED_TABS[st.tab] && st.tab !== keep) st.tab = keep || 'cards';
  view();
}
export let tabMenu = null;
export function hideTabMenu(){ if (tabMenu){ tabMenu.remove(); tabMenu = null; } }
/* A menu opens at the pointer, but never past the window edge: it moves left or up to stay whole. */
function placeMenu(el, x, y){
  const w = el.offsetWidth, h = el.offsetHeight, m = 8;
  el.style.left = Math.max(m, Math.min(x, window.innerWidth - w - m)) + 'px';
  el.style.top = Math.max(m, Math.min(y, window.innerHeight - h - m)) + 'px';
}
export function showTabMenu(e, id){
  e.preventDefault(); hideTabMenu();
  tabMenu = document.createElement('div');
  tabMenu.className = 'tabmenu';
  const others = st.open.some(x => x !== id);
  tabMenu.innerHTML = `<button data-a="close">Close tab</button><button data-a="others" ${others ? '' : 'disabled'}>Close other tabs</button><button data-a="all">Close all tabs</button>`;
  tabMenu.style.visibility = 'hidden';
  document.body.appendChild(tabMenu);
  placeMenu(tabMenu, e.clientX, e.clientY);
  tabMenu.style.visibility = '';
  tabMenu.addEventListener('click', ev => {
    const a = ev.target.dataset.a; hideTabMenu();
    if (a === 'close') closeObjTab(id);
    if (a === 'others') closeObjTabs(id);
    if (a === 'all') closeObjTabs(null);
  });
}
document.addEventListener('click', hideTabMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTabMenu(); });
const onTabClick = e => {
  if (e.target.closest('#closeAllTabs')){ closeObjTabs(null); return; }
  const c = e.target.closest('[data-close]');
  if (c){ closeObjTab(c.dataset.close); return; }
  const t = e.target.closest('[data-tab]');
  /* Back to Cards from Ports opens the device the ports were of. */
  if (t && t.dataset.tab === 'cards' && st.tab === 'net' && byId(st.portsDevice)){ openObj(st.portsDevice); return; }
  /* From an open device, Ports shows that device when it has ports (otherwise the one shown before), and Map is centred
     on it. */
  if (t){ st.planFlash = null; if (t.dataset.tab === 'net' && byId(st.tab) && hasPorts(byId(st.tab))) st.portsDevice = st.tab; if (t.dataset.tab === 'map' && st.open.includes(st.tab)) st.mapFocus = st.tab; st.tab = t.dataset.tab; view(); }
};
$('#tabsbar').addEventListener('click', onTabClick);
$('#objbar').addEventListener('click', onTabClick);
export function openObj(id){
  if (!st.open.includes(id)){ st.open.push(id); st.tabIds.push(id); }
  st.tab = id; view(); const v = $('#view'); if (v) v.scrollTop = 0;
  /* The focus was on what opened it (a card, a row, the search), which is gone now: it goes to the device's name, so Tab
     carries on in the device instead of from the top of the page. A field focused on purpose keeps it. */
  const a = document.activeElement;
  if (!a || a === document.body || !document.contains(a) || a.id === 'search') { const t = $('#objTitle'); if (t) t.focus({ preventScroll: true }); }
}

/* ---------- cards ---------- */
/* Network and attached relations are counted apart: a PC with a monitor is not a PC with more network links. */
export function relSummary(rs){
  const net = rs.filter(x => !isAttached(x.r.kind)).length, att = rs.length - net;
  return [net ? net + (net === 1 ? ' relation' : ' relations') : '', att ? att + ' attached' : ''].filter(Boolean).join(' · ');
}
/* What a card line can show: its label, and the value for a device ('' when the device has none). */
const mono = v => v ? `<span class="mono">${esc(String(v))}</span>` : '';
export const CARD_FIELDS = {
  ip: ['IP', o => mono(o.ip)],
  mac: ['MAC', o => mono(o.mac)],
  user: ['User', o => esc(o.user || '')],
  loc: ['Location', o => esc((o.loc || '').replace(' / ', ' · '))],
  warranty: ['Warranty', o => { const w = warrantyState(o); return w ? `<span class="wty ${w}">${w === 'ended' ? 'ended ' : 'ends '}${esc(dayText(o.warranty))}</span>` : ''; }],
  serial: ['Serial', o => mono(o.serial)],
  os: ['OS', o => esc(o.os || '')],
  fw: ['Firmware', o => esc(o.fw || '')],
  ports: ['Ports', (o, idx) => o.type === 'switch' ? `${o.ports || 0} + ${o.sfp || 0} SFP · ${used(o, idx)} used` : (o.type === 'patch' || hasPorts(o)) && o.ports ? `${o.ports} · ${used(o, idx)} used` : ''],
  ext: ['Extension', o => mono(o.ext)],
  kind: ['Kind', o => o.type === 'server' ? (o.kind === 'vm' ? 'Virtual machine' : 'Physical') : ''],
  cap: ['Capacity', o => esc([o.cap, o.proto].filter(Boolean).join(' · '))],
  ssid: ['Wi-Fi', o => esc(o.ssid || '')],
  domain: ['Domain', o => esc(o.domain || '')],
  units: ['Height', o => o.units ? o.units + ' U' : ''],
  purpose: ['Purpose', o => esc(o.purpose || '')],
  model: ['Model', o => esc(o.model || '')],
  resp: ['Responsible', o => esc(respText(o))],
  /* On a card (a button) a link cannot be clicked: the line names the links, the device page opens them. */
  urls: ['Links', o => esc((o.urls || []).map(l => l.label || linkKind(l.url)).join(' · '))],
};
/* Every card shows four lines, the same four for every device of a type, so cards are the same height and a value sits
   in the same place on each. A value a device does not have shows as a dash. Settings -> Object types can change them. */
export const CARD_DEFAULTS = {
  pc: ['ip', 'user', 'loc', 'warranty'], notebook: ['ip', 'user', 'loc', 'warranty'], camera: ['ip', 'model', 'loc', 'serial'], bmc: ['ip', 'fw', 'loc', 'serial'], server: ['ip', 'os', 'ports', 'loc'], vm: ['ip', 'os', 'loc', 'purpose'],
  accesspoint: ['ip', 'ssid', 'loc', 'serial'], sip: ['ext', 'ip', 'user', 'loc'], pbx: ['ip', 'fw', 'loc', 'serial'],
  monitor: ['serial', 'user', 'loc', 'warranty'], switch: ['ip', 'ports', 'loc', 'fw'], printer: ['ip', 'serial', 'loc', 'warranty'],
  patch: ['ports', 'loc', 'purpose', 'serial'], router: ['ip', 'ports', 'loc', 'fw'], firewall: ['ip', 'ports', 'loc', 'fw'],
  modem: ['ip', 'loc', 'serial', 'purpose'], storage: ['ip', 'cap', 'loc', 'warranty'], android: ['user', 'os', 'serial', 'loc'],
  ios: ['user', 'os', 'serial', 'loc'], mobile: ['user', 'os', 'serial', 'loc'], plc: ['ip', 'fw', 'loc', 'serial'],
  rack: ['loc', 'units', 'purpose', 'serial'], other: ['ip', 'user', 'loc', 'serial'],
};
export const cardLines = type => {
  const set = (FIELD_LAYOUT[type] || {}).card;
  return (Array.isArray(set) && set.length ? [...set, '', '', '', ''] : CARD_DEFAULTS[type] || CARD_DEFAULTS.other).slice(0, 4);
};
/* A line's label and value: a built-in line, or a field the type has (custom.<key>). An empty slot is a blank line. */
export function cardLine(o, key, idx){
  if (key.startsWith('custom.')){
    const f = (TYPE_FIELDS[o.type] || []).find(x => x.key === key.slice(7)), v = (o.custom || {})[key.slice(7)];
    return [f ? f.label : key.slice(7), v != null && v !== '' ? esc(String(v)) : ''];
  }
  const c = CARD_FIELDS[key];
  return c ? [c[0], c[1](o, idx)] : ['', ''];
}
/* idx: the relations index of the view drawing many cards (relIndex), so each card does not go through every relation. */
/* Whether the cards show AD, Entra and Intune (joinBadges). Kept in this browser: it is how this person likes to look. */
export const joinCardsAvailable = () => SYNC.graph || objs.some(o => o.inAd);
/* On unless this person turned it off: a computer's place in AD, Entra and Intune is what one looks for first. */
let cardJoin = true;
try { cardJoin = localStorage.getItem('ni-card-join') !== '0'; } catch { /* Browser storage can be blocked (a private window): then the choice is simply not kept. */ }
const showJoin = () => cardJoin && joinCardsAvailable();
/* The card's status: excluded or detached from Lansweeper says so; else when the device was last seen and by whom
   (Lansweeper, AD, Intune, Entra or Defender, whichever saw it last); else Lansweeper's own state. */
const cardSeen = o => {
  if (o.excluded || o.detached) return syncChip(o);
  /* Lansweeper's "Check by hand" stays, unless AD, Intune, Entra or Defender saw the device later than Lansweeper did. */
  const s = lastSeenOf(o);
  if (scanOld(o) && (!s || s.src === 'Lansweeper')) return scanChip(o);
  return seenChip(o) || ((syncOf(o) || {}).k === 'manual' ? '' : syncChip(o));
};
export function cardHtml(o, idx, join = showJoin()){
  const rs = relsOf(o, idx);
  const lines = cardLines(o.type).map(k => cardLine(o, k, idx));
  const s = STATUS[o.status];
  return `<button class="card" data-open="${esc(o.id)}">
    <div class="ch">${tico(o.type)}<div class="hd"><span class="nmrow"><span class="nm">${esc(o.name)}</span>${markHtml(o)}</span><span class="model">${esc(o.model)}</span></div>
      ${o.status !== 'active' ? `<span class="chip ${s.cls}">${s.label}</span>` : ''}</div>
    <dl class="kv">${lines.map(([k,v]) => `<dt>${esc(k) || '&nbsp;'}</dt><dd${v ? '' : ' class="none"'}>${v || (k ? '—' : '&nbsp;')}</dd>`).join('')}</dl>
    ${join ? joinBadges(o) : ''}
    <div class="cf"><span class="code">${esc(o.code)}</span>${cardSeen(o)}${join && GRAPH_TYPES.includes(o.type) ? '' : graphChip(o)}<span class="grow"></span>${relSummary(rs)}</div>
  </button>`;
}
/* How many cards or table rows are drawn before "Show all". */
export const SHOW_FIRST = 500;
export function renderCardsBody(){
  let list = filtered();
  $('#toolbar').innerHTML = `${listFilterHtml()}<span class="muted">${list.length} of ${objs.length} objects</span><span class="tbsep"></span>
    <label class="muted" for="grp">Group by</label><select id="grp"><option value="none">Nothing</option><option value="type">Type</option><option value="loc">Location</option><option value="user">User</option></select>
    ${st.cardsGroup !== 'none' ? '<button id="grpAll">Collapse all</button><button id="grpNone">Expand all</button>' : ''}
    ${joinCardsAvailable() ? `<span class="tbsep"></span><label class="pchk" title="Show on computers and phones whether they are in Active Directory, Microsoft Entra ID (Azure AD) and Intune"><input type="checkbox" id="cardJoin" ${cardJoin ? 'checked' : ''}> AD · Entra · Intune</label>` : ''}
    <div class="grow"></div><span class="muted hide-n">Click a card to open it in its own tab</span>`;
  bindListFilter();
  $('#grp').value = st.cardsGroup;
  $('#grp').onchange = e => { st.cardsGroup = e.target.value; view(); };
  const cj = $('#cardJoin');
  if (cj) cj.onchange = () => { cardJoin = cj.checked; try { localStorage.setItem('ni-card-join', cardJoin ? '1' : '0'); } catch { /* not kept */ } renderCards(); };
  if (!list.length){
    $('#view').innerHTML = objs.length
      ? hiddenHits() || (st.q.trim() ? `<div class="empty">Nothing matches “${esc(st.q.trim())}”. <button class="primary" id="newFromSearch">Create “${esc(st.q.trim())}” as a new object</button></div>` : `<div class="empty">Nothing matches these filters. <a class="link" id="clr2">Clear filters</a></div>`)
      : (SERVER.on && !st.meId ? `<div class="empty">Sign in to see the inventory.</div>` : `<div class="empty">The inventory is empty. Add an object with New object, or connect a feed in Settings.</div>`);
    const c2 = $('#clr2'); if (c2) c2.onclick = () => $('#clearF').click();
    const nfs = $('#newFromSearch'); if (nfs) nfs.onclick = () => newObjModal({name: st.q.trim()});
    bindHiddenHits();
    return;
  }
  const idx = relIndex(), join = showJoin(), card = o => cardHtml(o, idx, join);
  /* Thousands of cards take long to draw: the first ones are drawn, the rest on request. A search or a filter narrows it. */
  const cut = !st.cardsAll && list.length > SHOW_FIRST + 100;
  const more = cut ? `<div class="more-rows"><span class="muted">Showing the first ${SHOW_FIRST} of ${list.length}. Search or filter to narrow them down.</span><button id="cardsAll">Show all ${list.length}</button></div>` : '';
  const bindMore = () => { const b = $('#cardsAll'); if (b) b.onclick = () => { st.cardsAll = true; renderCards(); }; };
  if (cut) list = list.slice(0, SHOW_FIRST);
  if (st.cardsGroup === 'none'){ $('#view').innerHTML = `<div id="cards">${list.map(card).join('')}</div>${more}`; bindMore(); return; }
  const key = st.cardsGroup === 'type' ? o => TYPES[o.type].label : st.cardsGroup === 'user' ? o => o.user || 'No user' : o => o.loc || 'No location';
  /* The group of devices without a user or location comes last. */
  const none = g => g === 'No user' || g === 'No location';
  const groups = [...new Set(list.map(key))].sort((a, b) => none(a) ? 1 : none(b) ? -1 : a.localeCompare(b));
  st.groupsClosed ??= {};
  $('#view').innerHTML = groups.map(g => {
    const closed = !!st.groupsClosed[st.cardsGroup + ':' + g], items = list.filter(o => key(o) === g);
    return `<section class="grp${closed ? ' collapsed' : ''}"><div class="hdr sechdr grphdr" role="button" tabindex="0" aria-expanded="${!closed}" data-grp="${esc(g)}" style="position:sticky;top:0;z-index:2">${esc(g)} <span class="muted">${items.length}</span></div><div id="cards">${items.map(card).join('')}</div></section>`;
  }).join('') + more;
  bindMore();
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
  /* Counted in one pass over the devices: a search that matches many people must not go through them once per person. */
  const count = new Map();
  for (const o of objs) if (o.user) count.set(o.user, (count.get(o.user) || 0) + 1);
  $('#view').insertAdjacentHTML('afterbegin', `<div class="hits">${people.map(u => `<button class="chip info" data-person="${esc(u.name)}">${esc(u.name)} · ${count.get(u.name) || 0} devices</button>`).join('')}${locs.map(l => `<button class="chip ls" data-loc="${esc(l)}">${esc(l)}</button>`).join('')}</div>`);
  $('#view').querySelectorAll('[data-person]').forEach(b => b.onclick = () => showDevicesOf(b.dataset.person));
  $('#view').querySelectorAll('[data-loc]').forEach(b => b.onclick = () => { st.loc = b.dataset.loc; st.q = ''; view(); });
}

/* ---------- table ---------- */
/* The columns of the objects table. Name always shows; the others can be hidden from the Columns menu. */
export const TABLE_COLS = [
  {k:'code', w:100, label:'Code', cell: o => `<td class="code">${esc(o.code)}</td>`},
  /* The name opens the device, from the keyboard too (Tab to it, Enter): one stop per row, not the whole row as well. */
  {k:'name', w:220, label:'Name', fixed: true, cell: o => `<td class="n"><a class="link rowopen" data-open="${esc(o.id)}"><b>${esc(o.name)}</b></a>${markHtml(o)}</td>`},
  {k:'type', w:160, label:'Type', cell: o => `<td><span class="tdot"><span class="tsw" style="background:${tcol(o.type)}"></span>${esc(TYPES[o.type].label)}</span></td>`},
  {k:'model', w:210, label:'Model', cell: o => `<td>${esc(o.model)}</td>`},
  {k:'ip', w:130, label:'IP', cell: o => `<td class="n">${esc(o.ip || '')}</td>`},
  {k:'mac', w:150, label:'MAC', cell: o => `<td class="n">${esc(o.mac || '')}</td>`},
  {k:'serial', w:160, label:'Serial', cell: o => `<td class="n">${esc(o.serial)}</td>`},
  {k:'loc', w:190, label:'Location', cell: o => `<td>${esc(o.loc)}</td>`},
  {k:'rack', w:130, label:'Rack', cell: o => `<td class="n">${esc(o.rack && o.u != null && rackOf(o.rack) ? rackOf(o.rack).name + ' · U' + o.u : '')}</td>`},
  {k:'user', w:160, label:'User', cell: o => `<td>${esc(o.user || '')}</td>`},
  {k:'warranty', w:130, label:'Warranty ends', cell: o => `<td>${o.warranty ? `<span class="wty ${warrantyState(o)}">${esc(dayText(o.warranty))}</span>` : ''}</td>`},
  {k:'price', w:110, label:'Price', cell: o => `<td class="n">${typeof o.price === 'number' ? money(o.price) : ''}</td>`},
  {k:'supplier', w:160, label:'Supplier', cell: o => `<td>${esc(o.supplier || '')}</td>`},
  {k:'invoice', w:130, label:'Invoice', cell: o => `<td class="n">${esc(o.invoice || '')}</td>`},
  {k:'purpose', w:180, label:'Purpose', cell: o => `<td>${esc(o.purpose || '')}</td>`},
  {k:'conn', w:190, label:'Connected to', cell: (o, idx) => { const up = (idx ? idx.get(o.id) || [] : rels).find(r => r.from === o.id && ['connected','uplink'].includes(r.kind)); const t = up && byId(up.to);
    return `<td class="n">${t ? esc(t.name) + (up.port != null ? ' · ' + esc(portLabel(t, up.port)) : '') : ''}</td>`; }},
  {k:'urls', w:200, label:'Links', cell: o => `<td>${(o.urls || []).map(l => `<a class="lnk" href="${esc(linkHref(l.url))}" target="_blank" rel="noopener noreferrer" title="${esc(l.url)}">${esc(l.label || linkKind(l.url))}</a>`).join(' · ')}</td>`},
  {k:'resp', w:200, label:'Responsible', cell: o => `<td>${esc(respText(o))}</td>`},
  {k:'status', w:110, label:'Status', cell: o => `<td>${STATUS[o.status].label}</td>`},
  /* The date first, so the column sorts by it. */
  {k:'seen', w:190, label:'Last seen', cell: o => { const s = lastSeenOf(o); return `<td>${s ? `<span class="${s.days > GRAPH_STALE_DAYS ? 'wty soon' : ''}" title="Last seen ${esc(s.at)} by ${esc(s.src)}">${esc(dayText(s.day))}</span> <span class="muted">· ${esc(s.src)}</span>` : ''}</td>`; }},
  {k:'ls', w:240, label:'Lansweeper', cell: o => `<td>${scanOld(o) ? scanChip(o) : syncChip(o) || '—'}</td>`}
];
/* The Lansweeper column is left out while Lansweeper is off. */
export const tableCols = () => TABLE_COLS.filter(c => c.k !== 'ls' || LS_ON());
/* Rack is hidden until it is wanted: most devices do not go in a rack. */
export const DEFAULT_HIDDEN_COLS = ['rack', 'price', 'supplier', 'invoice', 'resp', 'urls'];
/* Columns added after a browser kept its choice: hidden there too until they are picked. */
const LATER_COLS = {2: ['price', 'supplier', 'invoice'], 3: ['resp'], 4: ['urls']};
export function hiddenCols(){
  if (!st.hiddenCols){
    try {
      st.hiddenCols = JSON.parse(localStorage.getItem('ni-hidden-cols')) || DEFAULT_HIDDEN_COLS;
      const seen = +localStorage.getItem('ni-cols-v') || 1;
      for (const [v, cols] of Object.entries(LATER_COLS)) if (seen < +v) st.hiddenCols = [...new Set([...st.hiddenCols, ...cols])];
      localStorage.setItem('ni-cols-v', '4');
    } catch { st.hiddenCols = DEFAULT_HIDDEN_COLS; }
  }
  return st.hiddenCols;
}
export function setHiddenCols(list){
  st.hiddenCols = list;
  try { localStorage.setItem('ni-hidden-cols', JSON.stringify(list)); } catch { /* Browser storage can be blocked (a private window): then the choice is simply not kept. */ }
}
export function columnsMenu(){
  const hidden = hiddenCols();
  return `<details class="menu" id="colMenu"><summary>Columns</summary><div class="menubox">${tableCols().map(c => `<label style="display:flex;gap:6px;align-items:center;white-space:nowrap"><input type="checkbox" data-col="${c.k}" ${c.fixed ? 'disabled' : ''} ${c.fixed || !hidden.includes(c.k) ? 'checked' : ''}> ${c.label}</label>`).join('')}</div></details>`;
}

/* A field's cell says where its value came from in its hover text (the device page shows it as a mark). */
const SOURCE_COLS = new Set([...Object.keys(FIELD_LABEL), 'serial']);
const withSource = (o, c, html) => {
  if (!SOURCE_COLS.has(c.k) || /^<td[^>]*title=/.test(html)) return html;
  const t = sourceText(o, c.k);
  return t ? html.replace(/^<td/, `<td title="${esc(t)}"`) : html;
};
export function renderTable(){
  let list = filtered();
  const colOpen = !!($('#colMenu') && $('#colMenu').open);
  st.bulk ??= new Set();
  st.bulk = new Set([...st.bulk].filter(id => objs.some(o => o.id === id)));
  const n = st.bulk.size;
  $('#toolbar').innerHTML = `${listFilterHtml()}<span class="muted" id="tblCount">${list.length} rows</span><span class="tbsep"></span>
    ${n ? `<b>${n} selected</b><select id="bkLoc" aria-label="Move selected to location"><option value="">Move to location…</option>${LOCS.map(l => `<option>${esc(l)}</option>`).join('')}</select><select id="bkStatus" aria-label="Set status of selected"><option value="">Set status…</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>${CONTACTS.list.length && canEdit() ? `<select id="bkResp" aria-label="Set the responsible of the selected"><option value="">Responsible…</option>${Object.entries(CONTACT_KINDS).map(([k, l]) => `<optgroup label="${l}">${CONTACTS.list.filter(c => c.kind === k).sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${k}:${esc(c.id)}">${esc(contactLabel(c))}</option>`).join('')}<option value="${k}:">— no ${l.toLowerCase()} responsible</option></optgroup>`).join('')}</select>` : ''}<button id="bkClear">Clear selection</button><span class="tbsep"></span>` : ''}
    ${columnsMenu()}<button id="csvBtn"><svg class="i" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg>Export CSV</button><button id="csvImp">Import CSV…</button>`;
  if (colOpen) $('#colMenu').open = true;
  bindListFilter();
  $('#toolbar').querySelectorAll('[data-col]').forEach(c => c.onchange = () => {
    const k = c.dataset.col, hidden = hiddenCols();
    setHiddenCols(c.checked ? hidden.filter(x => x !== k) : [...hidden, k]);
    renderTable();
  });
  $('#csvBtn').onclick = () => exportCsv(list);
  $('#csvImp').onclick = importCsvModal;
  /* A move by hand, as on the device's page: the location is kept from then on, so the next sync does not move it back. */
  const bk = $('#bkLoc'); if (bk) bk.onchange = () => {
    if (!bk.value) return;
    const snap = snapshot([...st.bulk].map(byId));
    let moved = 0;
    st.bulk.forEach(id => {
      const o = byId(id); if (!o || o.loc === bk.value) return;
      moved++;
      if (feedLinked(o) || (o.graph && o.graph.added)) (o.ovr ??= {}).loc = false;
      o.loc = bk.value; markHand(o, 'loc'); o.handAt = new Date().toISOString();
      hist(o, now(), 'Moved to ' + bk.value + ' (bulk)');
    });
    toastUndo(moved === n ? `${n} moved to ${bk.value}` : `${moved} moved to ${bk.value}; ${n - moved} already there`, () => { restoreSnapshot(snap, 'Bulk move undone'); render(); }); renderTable(); render();
  };
  const bs = $('#bkStatus'); if (bs) bs.onchange = () => { if (!bs.value) return; const snap = snapshot([...st.bulk].map(byId)); st.bulk.forEach(id => { const o = byId(id); o.status = bs.value; hist(o, now(), 'Status set to ' + STATUS[bs.value].label + ' (bulk)'); }); toastUndo(n + ' set to ' + STATUS[bs.value].label, () => { restoreSnapshot(snap, 'Bulk status undone'); render(); }); renderTable(); render(); };
  /* Internal or external responsible for every selected device; each device that changes gets a history line. */
  const br = $('#bkResp'); if (br) br.onchange = () => {
    const [kind, id] = br.value.split(':'); if (!kind) return;
    let changed = 0;
    const snap = snapshot([...st.bulk].map(byId));
    st.bulk.forEach(x => { const o = byId(x); if (o && setResponsible(o, kind, id)) changed++; });
    toastUndo(`${CONTACT_KINDS[kind]} responsible ${id ? 'set' : 'removed'} on ${changed} ${changed === 1 ? 'device' : 'devices'}`, () => { restoreSnapshot(snap, 'Responsible change undone'); render(); }); renderTable(); render();
  };
  const bc = $('#bkClear'); if (bc) bc.onclick = () => { st.bulk.clear(); renderTable(); };
  const idx = relIndex();   /* one index of the relations for all rows */
  const shown = tableCols().filter(c => c.fixed || !hiddenCols().includes(c.k));
  /* The column filters and the sort apply to the devices, before anything is drawn: by the text each cell shows, as
     the table showed it. Column 0 is the tick box; column k is shown[k - 1]. */
  const tv = TBL['view:table:0'] || {};
  /* The filters, sort, widths and order are kept by column position. When a column is shown or hidden the positions
     move, so each is carried to where its column is now (by the column's key), and one whose column is gone is dropped. */
  const keys = shown.map(c => c.k);
  if (TBL['view:table:0'] && Array.isArray(tv.keys) && tv.keys.join() !== keys.join()){
    const to = ci => +ci === 0 ? 0 : keys.indexOf(tv.keys[+ci - 1]) + 1 || null;   /* 0 is the tick box */
    const move = obj => Object.fromEntries(Object.entries(obj || {}).map(([ci, v]) => [to(ci), v]).filter(([ci]) => ci !== null));
    tv.filters = move(tv.filters); tv.widths = move(tv.widths);
    if (tv.sort) tv.sort = to(tv.sort.ci) === null ? null : { ...tv.sort, ci: to(tv.sort.ci) };
    if (Array.isArray(tv.order)){ const kept = tv.order.map(to).filter(ci => ci !== null); tv.order = [...kept, ...keys.map((_, i) => i + 1).filter(ci => !kept.includes(ci))]; }
  }
  if (TBL['view:table:0']) tv.keys = keys;
  const textOf = html => html.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, m => ({'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'"})[m]).trim();
  const colOf = ci => shown[ci - 1];
  for (const [ci, q] of Object.entries(tv.filters || {})) {
    const c = colOf(+ci), want = String(q || '').trim().toLowerCase();
    if (c && want) list = list.filter(o => textOf(c.cell(o, idx)).toLowerCase().includes(want));
  }
  const sc = tv.sort && colOf(tv.sort.ci);
  if (sc) { const key = new Map(list.map(o => [o, textOf(sc.cell(o, idx))])); list = [...list].sort((a, b) => tv.sort.dir * cmpCells(key.get(a), key.get(b))); }
  /* Thousands of rows take seconds to lay out: the first ones are drawn, the rest on request. */
  $('#tblCount').textContent = list.length + ' rows';
  const cut = !st.tableAll && list.length > SHOW_FIRST + 100;
  const rowsOf = cut ? list.slice(0, SHOW_FIRST) : list;
  $('#view').innerHTML = `<div class="gridwrap"><table class="grid" data-data="1"><thead><tr>
    <th data-w="40" data-pin="1" class="selcol"><input type="checkbox" id="selAll" aria-label="Select all shown rows" style="height:auto"></th>
    ${shown.map(c => `<th data-w="${c.w || 140}"${c.k === 'code' || c.k === 'name' ? ' data-pin="1"' : ''}>${c.label}</th>`).join('')}</tr></thead><tbody>
    ${rowsOf.map(o => `<tr data-open="${esc(o.id)}"><td><input type="checkbox" data-sel="${esc(o.id)}" ${st.bulk.has(o.id) ? 'checked' : ''} aria-label="Select ${esc(o.name)}" style="height:auto"></td>${shown.map(c => withSource(o, c, c.cell(o, idx))).join('')}</tr>`).join('')}
    </tbody></table>${list.length ? '' : hiddenHits()}${cut ? `<div class="more-rows"><span class="muted">Showing the first ${SHOW_FIRST} of ${list.length} rows. Search or filter a column to narrow them down.</span><button id="tableAll">Show all ${list.length}</button></div>` : ''}</div>`;
  const ta = $('#tableAll'); if (ta) ta.onclick = () => { st.tableAll = true; renderTable(); };
  bindHiddenHits();
  const selBox = el => el.addEventListener('click', e => e.stopPropagation());
  $('#view').querySelectorAll('[data-sel]').forEach(c => { selBox(c); c.onchange = () => { c.checked ? st.bulk.add(c.dataset.sel) : st.bulk.delete(c.dataset.sel); renderTable(); }; });
  const all = $('#selAll'); selBox(all);
  /* Only the rows shown: a row hidden by a column filter is not selected. */
  /* Every device the filters leave, also those past the first 500 rows not drawn. */
  const rowIds = () => list.map(o => o.id);
  all.checked = rowIds().length > 0 && rowIds().every(id => st.bulk.has(id));
  /* Ticking it selects every row shown; ticking it again, when they are all selected, clears them. */
  all.onchange = () => { const ids = rowIds(), on = ids.every(id => st.bulk.has(id)); ids.forEach(id => on ? st.bulk.delete(id) : st.bulk.add(id)); renderTable(); };
}

/* CSV: a plain comma or semicolon file, first row is the header (public/js/csv.js decides which). */
export { parseCsv };
/* A cell that starts with = + - @ or a tab or return would run as a formula in a spreadsheet, so it gets a leading apostrophe. */
export const csvCell = v => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",;\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
export function exportCsv(list){
  const head = ['code','name','type','model','serial','ip','mac','location','user','status','purchased','warranty','price','supplier','invoice'];
  const lines = [head.join(',')].concat(list.map(o => [o.code, o.name, TYPES[o.type].label, o.model, o.serial, o.ip, o.mac, o.loc, o.user, STATUS[o.status].label, o.purchased, o.warranty, o.price, o.supplier, o.invoice].map(csvCell).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], {type: 'text/csv'});
  const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: 'inventory.csv'});
  document.body.appendChild(a); a.click(); a.remove();
  toast('Exported ' + list.length + ' rows');
}
/* The columns a CSV row can update on a device already here, with their names for the preview and the history. */
const CSV_FIELDS = ['loc', 'model', 'serial', 'ip', 'mac', 'user'];
const CSV_LABEL = { loc: 'Location', model: 'Model', serial: 'Serial number', ip: 'IP address', mac: 'MAC address', user: 'User' };
export function importCsvModal(){
  modal(`<div class="mh">Import objects from CSV</div>
    <div class="mb">
      <p class="note">The first row is the header. Columns: <span class="mono">name, type, model, serial, ip, mac, location, user</span>. Type is an object type name. Location must match a location exactly. Comma or semicolon separated. Rows with a problem are shown and skipped. A row whose serial number (or else name) is a device here updates that device instead of adding it.</p>
      <div class="form" style="padding:0"><label for="csvFile">File</label><div class="filepick"><label class="btnlike" tabindex="0" role="button">Choose CSV file…<input id="csvFile" type="file" accept=".csv,text/csv" hidden></label><span class="muted" id="csvFileName">No file chosen</span></div></div>
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
      const row = {line: i + 2, name, type: tKey, loc, model: g('model'), serial: g('serial'), ip: ip.value, mac: g('mac'), user: g('user'), errs};
      /* The same device already here (by serial number, else by name): its fields are updated with what the row has. */
      const low = v => String(v || '').trim().toLowerCase();
      row.match = (row.serial && objs.find(o => low(o.serial) === low(row.serial))) || (name && objs.find(o => o.status !== 'retired' && low(o.name) === low(name))) || null;
      if (row.match) row.changes = CSV_FIELDS.filter(k => row[k] && String(row.match[k] ?? '') !== String(row[k]));
      return row;
    });
    const okRows = parsed.filter(p => !p.errs.length), ok = okRows.length;
    const adds = okRows.filter(p => !p.match).length, updates = okRows.filter(p => p.match && p.changes.length).length, same = okRows.filter(p => p.match && !p.changes.length).length;
    const result = p => p.errs.length ? '<span class="chip warn">' + esc(p.errs.join(', ')) + '</span>'
      : !p.match ? '<span class="chip ok">new</span>'
      : p.changes.length ? `<span class="chip">updates ${esc(p.match.name)}: ${esc(p.changes.map(k => CSV_LABEL[k]).join(', '))}</span>` : `<span class="chip">${esc(p.match.name)}: nothing new</span>`;
    $('#csvPrev').innerHTML = `<div class="summary"><span class="chip ok">${adds} new</span>${updates ? `<span class="chip">${updates} to update</span>` : ''}${same ? `<span class="chip">${same} unchanged</span>` : ''}${parsed.length - ok ? `<span class="chip warn">${parsed.length - ok} with problems</span>` : ''}</div>
      <div style="overflow-x:auto"><table class="grid mini" style="min-width:0"><thead><tr><th>Line</th><th>Name</th><th>Type</th><th>Location</th><th>Result</th></tr></thead><tbody>
      ${parsed.map(p => `<tr><td class="n">${p.line}</td><td>${esc(p.name)}</td><td>${p.type ? esc(TYPES[p.type].label) : '—'}</td><td>${esc(p.loc || (p.match ? '' : 'none'))}</td><td>${result(p)}</td></tr>`).join('')}
      </tbody></table></div>`;
    $('#csvGo').disabled = adds + updates === 0;
    $('#csvGo').textContent = updates && adds ? `Add ${adds} and update ${updates}` : updates ? `Update ${updates}` : 'Import';
  };
  $('#csvFile').onchange = async e => { const f = e.target.files[0]; $('#csvFileName').textContent = f ? f.name : 'No file chosen'; if (f){ $('#csvText').value = await f.text(); parse(); } };
  $('#csvText').oninput = parse;
  $('#csvCancel').onclick = closeModal;
  $('#csvGo').onclick = () => {
    const ready = parsed.filter(p => !p.errs.length);
    let added = 0, updated = 0;
    ready.forEach(p => {
      if (p.match){
        if (!p.changes.length) return;
        /* Values from the file are set by hand: noted so, and no sync puts its own back. */
        for (const k of p.changes){ p.match[k] = p[k]; markHand(p.match, k); if (!p.match.src || !p.match.src[k]) p.match.src = {...(p.match.src || {}), [k]: 'hand'}; }
        if (p.changes.includes('user')) bindUser(p.match);
        hist(p.match, now(), `Updated from CSV: ${p.changes.map(k => CSV_LABEL[k]).join(', ')}`); updated++;
        return;
      }
      const o = O(p.type, p.name, {loc: p.loc, model: p.model, serial: p.serial, ip: p.ip, mac: p.mac, user: p.user});
      if (p.type === 'switch') Object.assign(o, {ports: 24, sfp: 4, pfx: '1/'});
      objs.push(o); bindUser(o); hist(o, now(), 'Imported from CSV'); added++;
    });
    closeModal(); toast([added ? `${added} added` : '', updated ? `${updated} updated` : ''].filter(Boolean).join(' · ') || 'Nothing to import'); render();
  };
}

/* ---------- relationship map ----------
   Like the ER diagram in NOBS SQL: boxes with a header, right-angled lines between them, the line's kind and port
   written on it. Hover a box to light up its lines. Drag a box to move it, drag the background to pan, Ctrl + wheel to zoom. */
export const MAP = {zoom:1, px:24, py:24, drag:null, L:null, found:null};
export const MAP_W = 200, MAP_STEP = 340;
/* A text inside a box is cut to the box's width, with an ellipsis; the full text is the tooltip. */
const fitMap = (t, px) => {
  const text = String(t ?? ''), max = Math.floor((MAP_W - 16) / (px * 0.56));
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
};
export const mapLines = o => [o.model, o.ip || o.user || (o.ext ? 'Ext ' + o.ext : ''), o.type === 'patch' ? (o.ports || 24) + ' ports · ' + used(o) + ' used' : o.type === 'storage' ? [o.cap, o.proto].filter(Boolean).join(' · ') : o.kind === 'vm' ? 'Virtual machine' : ''].filter(Boolean);
/* Every box has the same height, so the rows line up across a column. */
export const mapH = () => 91;

export function mapLayout(nodes){
  const ids = new Set(nodes.map(o => o.id));
  /* Attached devices are left out of the map unless asked for, so the map shows the network. Showing one object's
     relations shows all of them, its monitors and accessories included, and the object itself even without any. */
  const focused = !!MAP.focused;
  const E = rels.filter(r => ids.has(r.from) && ids.has(r.to) && (focused || st.mapAttached || !isAttached(r.kind)));
  const connected = new Set(E.flatMap(r => [r.from, r.to]));
  /* With attached devices off, a device that is only attached to another one (a monitor on a PC) is left out too, not
     drawn as a loose box; a monitor attached to nothing still shows when objects without relations are shown. */
  const attachedOnly = o => !connected.has(o.id) && rels.some(r => r.from === o.id && isAttached(r.kind) && ids.has(r.to));
  const list = st.mapOnly && !focused ? nodes.filter(o => connected.has(o.id)) : nodes.filter(o => focused || st.mapAttached || !attachedOnly(o));
  const inList = new Set(list.map(o => o.id));
  const edges = E.filter(r => inList.has(r.from) && inList.has(r.to));
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
export const MAP_SHORT = {attached:'attached', connected:'connected', uplink:'uplink', hosted:'runs on'};

/* The drawing as SVG markup. The same markup is used on screen and in the export.
   Line labels are hidden until a line is hovered, or until Labels is switched on. */
export function mapInner(L){
  const routes = mapRoutes(L);
  const edges = L.edges.map((r, i) => {
    const a = byId(r.from), b = byId(r.to), p = routes[i];
    const label = MAP_SHORT[r.kind] + (r.port != null ? ' · ' + portLabel(b, r.port) : '');
    return `<g class="mline" data-from="${esc(a.id)}" data-to="${esc(b.id)}">
      <path class="mhit" d="${p.d}" fill="none" stroke="transparent" stroke-width="10"/>
      <path d="${p.d}" fill="none" stroke="var(--line)" stroke-width="1.4"/>
      <circle cx="${p.A.x}" cy="${p.A.y}" r="3" fill="var(--line)"/><circle cx="${p.B.x}" cy="${p.B.y}" r="3" fill="var(--line)"/>
      <text class="mlab" x="${p.lx}" y="${p.ly}" text-anchor="${p.anchor}" font-size="10" font-family="var(--mono)" fill="var(--muted)" stroke="var(--bg)" stroke-width="3" paint-order="stroke">${esc(label)}</text></g>`;
  }).join('');
  const nodes = L.list.map(o => {
    const p = L.pos[o.id], h = mapH(o), lines = mapLines(o), c = tcol(o.type);
    /* The header names the type next to the code, so each box says what it is (PC, Switch, Server …). */
    return `<g class="mnode${MAP.found === o.id ? ' found' : ''}" data-id="${esc(o.id)}" transform="translate(${p.x} ${p.y})"><title>${esc(o.name)} · ${esc(TYPES[o.type] ? TYPES[o.type].label : o.type)}</title>
      <rect width="${MAP_W}" height="${h}" rx="5" fill="var(--bg)" stroke="var(--bd)"/>
      <rect width="${MAP_W}" height="20" rx="5" fill="var(--panel2)"/><rect y="12" width="${MAP_W}" height="8" fill="var(--panel2)"/>
      <rect width="3" height="${h}" rx="1.5" fill="${c}"/>
      <text x="9" y="14" font-size="10" fill="var(--muted)"><tspan font-family="var(--mono)">${esc(o.code)}</tspan> · ${esc(TYPES[o.type] ? (o.status !== 'active' ? TYPES[o.type].short : TYPES[o.type].label) : o.type)}</text>
      <text x="8" y="36" font-size="13" font-weight="600" font-family="var(--mono)" fill="var(--fg)">${esc(fitMap(o.name, 13))}<title>${esc(o.name)}</title></text>
      ${lines.map((t, i) => `<text x="8" y="${52 + i * 15}" font-size="11" fill="var(--muted)">${esc(fitMap(t, 11))}<title>${esc(t)}</title></text>`).join('')}
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
export function mapApply(){
  const g = $('#mapG'); if (g) g.setAttribute('transform', `translate(${MAP.px} ${MAP.py}) scale(${MAP.zoom})`);
  const z = $('#mapZoomReset'); if (z) z.textContent = Math.round(MAP.zoom * 100) + '%';
}
/* Zooms the map to z, keeping the point (mx, my) of the drawing area where it is: the pointer for Ctrl + wheel, the
   middle for the buttons. */
export function mapZoomTo(z, mx, my){
  const svg = $('#mapSvg'); if (!svg) return;
  if (mx === undefined){ mx = svg.clientWidth / 2; my = svg.clientHeight / 2; }
  const z0 = MAP.zoom, z1 = Math.min(2.5, Math.max(0.3, z));
  MAP.px = mx - (mx - MAP.px) * (z1 / z0); MAP.py = my - (my - MAP.py) * (z1 / z0); MAP.zoom = z1; mapApply();
}
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

/* The toolbar controls that redraw the map; bound also when the map is empty, so it can be switched back. */
function bindMapToolbar(){
  $('#mapOnly').onchange = e => { st.mapOnly = e.target.checked; view(); };
  $('#mapFocus').onchange = e => { st.mapFocus = e.target.value || null; MAP.found = null; view(); };
  $('#mapAttached').onchange = e => { st.mapAttached = e.target.checked; MAP.found = null; view(); };
  $('#mapLabels').onchange = e => { st.mapLabels = e.target.checked; const svg = $('#mapSvg'); if (svg) svg.classList.toggle('labels', st.mapLabels); };
  /* The same zoom control as on the floor plan: the steps of the plan's buttons, around the middle of the map. */
  $('#mapZoomOut').onclick = () => mapZoomTo(MAP.zoom / 1.25);
  $('#mapZoomIn').onclick = () => mapZoomTo(MAP.zoom * 1.25);
  $('#mapZoomReset').onclick = () => mapZoomTo(1);
}
export function renderMap(){
  /* Showing one object's relations: that object and the objects linked to it directly, and nothing else. */
  const focus = st.mapFocus && byId(st.mapFocus) ? byId(st.mapFocus) : null;
  if (st.mapFocus && !focus) st.mapFocus = null;
  const around = focus ? new Set([focus.id, ...rels.filter(r => r.from === focus.id || r.to === focus.id).flatMap(r => [r.from, r.to])]) : null;
  /* With a filter on (a type, a place, a search), the map shows the objects it finds and the objects linked to them, so
     a notebook's monitor or switch is drawn with it; a relation needs both ends on the map. */
  const found = around ? null : filtered(), narrowed = !!found && found.length < objs.length;
  let nodes = around ? objs.filter(o => around.has(o.id)) : found;
  if (narrowed){
    const ids = new Set(found.map(o => o.id));
    rels.filter(r => (ids.has(r.from) || ids.has(r.to)) && (st.mapAttached || !isAttached(r.kind))).forEach(r => { ids.add(r.from); ids.add(r.to); });
    nodes = objs.filter(o => ids.has(o.id));
  }
  const linked = new Set(rels.flatMap(r => [r.from, r.to]));   /* once, not a pass over the relations per object */
  const withRelations = objs.filter(o => o === focus || linked.has(o.id)).sort((a, b) => a.name.localeCompare(b.name));
  $('#toolbar').innerHTML = `${listFilterHtml()}<span class="muted" id="mapCount"></span><span class="tbsep"></span>
    <span class="tbgroup"><label class="muted" for="mapFocus">Relations of</label>
    <select id="mapFocus" aria-label="Show only the relations of this object"><option value="">All objects</option>${withRelations.map(o => `<option value="${esc(o.id)}" ${focus && focus.id === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></span>
    <label class="pchk"><input type="checkbox" id="mapOnly" ${st.mapOnly?'checked':''}> Only objects with relations</label>
    <label class="pchk"><input type="checkbox" id="mapLabels" ${st.mapLabels?'checked':''}> Labels</label>
    <label class="pchk"><input type="checkbox" id="mapAttached" ${st.mapAttached?'checked':''}> Attached devices</label>
    <input id="mapFind" type="search" placeholder="Find object…" style="width:160px" value="${esc(st.mapFind)}" aria-label="Find object">
    <div class="grow"></div><span class="tbgroup"><span class="pl-zoom"><button id="mapZoomOut" aria-label="Zoom out" title="Zoom out (Ctrl + wheel)">−</button><button id="mapZoomReset" title="Actual size" class="pl-zv">${Math.round(MAP.zoom * 100)}%</button><button id="mapZoomIn" aria-label="Zoom in" title="Zoom in (Ctrl + wheel)">+</button></span><button id="mapFitBtn" title="Zoom so the whole map fits">Fit</button>
    <details class="menu"><summary>More</summary><div class="menubox"><button id="mapReset">Reset layout</button><button id="mapExport">Export SVG</button></div></details></span>`;
  MAP.nodes = nodes;   /* a drag lays out these again, so a focused map keeps its own boxes */
  MAP.focused = !!focus;
  MAP.L = mapLayout(nodes);
  if (!MAP.L.list.length){
    $('#mapCount').textContent = '0 objects';
    $('#view').innerHTML = narrowed
      ? (!found.length && hiddenHits()) || (found.length
        ? `<div class="empty">None of the ${found.length} objects in the current filter ${found.length === 1 ? 'has' : 'have'} relations. <a class="link" id="mapClr">Clear filters</a> to see the whole map.</div>`
        : `<div class="empty">No object matches the current filter. <a class="link" id="mapClr">Clear filters</a> to see the whole map.</div>`)
      : '<div class="empty">Nothing to draw. Objects with relations appear here. Untick "Only objects with relations", or link two objects on an object page.</div>';
    const clr = $('#mapClr'); if (clr) clr.onclick = () => $('#clearF').click();
    bindHiddenHits();
    bindMapToolbar();
    return;
  }
  const nL = MAP.L.list.length, nE = MAP.L.edges.length;
  $('#mapCount').textContent = `${nL} ${nL === 1 ? 'object' : 'objects'} · ${nE} ${nE === 1 ? 'relation' : 'relations'}`;
  $('#view').innerHTML = `<div class="mapwrap"><svg id="mapSvg" role="img" aria-label="Relationship map"><g id="mapG">${mapInner(MAP.L)}</g></svg>
    <div class="maphint">Drag a box to move it · drag the background to pan · Ctrl + wheel to zoom · click a box to open it</div>${mapLegend(MAP.L)}</div>`;
  const svg = $('#mapSvg');
  /* A right click on a box shows only its relations (the same as Relations of in the toolbar). */
  svg.addEventListener('contextmenu', e => {
    const n = e.target.closest('.mnode'); if (!n) return;
    e.preventDefault(); st.mapFocus = n.dataset.id; MAP.found = null; view();
  });
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
    MAP.L = mapLayout(MAP.nodes); $('#mapG').innerHTML = mapInner(MAP.L);
    mapHighlight(d.id);
  });
  /* A box moved by an admin is saved (the layout is shared); a viewer's moves stay on this page until it is reloaded. */
  svg.addEventListener('pointerup', () => { const d = MAP.drag; MAP.drag = null; if (d && !d.pan && !d.moved) openObj(d.id); else if (d && !d.pan && canEdit()) queueServerSave(); });
  svg.addEventListener('pointerleave', () => { if (!MAP.drag) mapHighlight(null); });
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    if (!e.ctrlKey){ MAP.px -= e.deltaX; MAP.py -= e.deltaY; mapApply(); return; }
    const r = svg.getBoundingClientRect();
    mapZoomTo(MAP.zoom * (e.deltaY < 0 ? 1.1 : 0.91), e.clientX - r.left, e.clientY - r.top);
  }, {passive: false});
  bindMapToolbar();
  svg.classList.toggle('labels', st.mapLabels);
  bindListFilter();
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
  $('#mapExport').onclick = e => {
    e.target.closest('details').open = false;
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
/* Why a port setup cannot be saved, or null. Ports in use and port groups must stay inside the new count. */
export function portSetupError(sw, ports, sfp){
  if (!Number.isInteger(ports) || ports < 0 || ports > 1000) return 'Copper ports: a whole number from 0 to 1000.';
  if (!Number.isInteger(sfp) || sfp < 0 || sfp > 1000) return 'SFP ports: a whole number from 0 to 1000.';
  const total = ports + sfp;
  if (rels.some(r => r.to === sw.id && typeof r.port === 'number' && r.port > total)) return `Ports in use above ${total} block this change. Move or remove those connections first.`;
  const g = (sw.portGroups || []).find(x => x.to > total);
  if (g) return `The port group ${g.name} reaches port ${g.to}. Change or remove it first.`;
  return null;
}
export function renderPorts(){
  const devs = objs.filter(o => hasPorts(o));
  if (!devs.length){
    $('#toolbar').innerHTML = '';
    $('#view').innerHTML = `<div class="empty">No devices with ports yet. Add a switch, router, firewall or physical server to see its ports.${canEdit() ? ' <button class="primary" id="portsNew">New switch</button>' : ''}</div>`;
    const b = $('#portsNew'); if (b) b.onclick = () => newObjModal({type: 'switch'});
    return;
  }
  /* Without a device picked (or come from), the one used last in this browser, else the first switch: the ports people
     look at most, not whichever device comes first. */
  let last = null; try { last = localStorage.getItem('ni-ports-device'); } catch { /* not kept */ }
  const first = ['switch', 'patch', 'router', 'firewall'].map(t => devs.find(o => o.type === t)).find(Boolean);
  const sw = byId(st.portsDevice) || devs.find(o => o.id === last) || first || devs[0];
  try { localStorage.setItem('ni-ports-device', sw.id); } catch { /* not kept */ }
  $('#toolbar').innerHTML = `<label class="muted" for="portsDevice">Device</label><select id="portsDevice">${devs.map(s => `<option value="${esc(s.id)}">${esc(s.name)}${s.loc ? ' · ' + esc(s.loc.split(' / ')[0]) : ''}</option>`).join('')}</select>
    <span class="muted hide-n">${esc(sw.model)} · ${esc(sw.ip)}</span><div class="grow"></div><button id="portsOpen">Open device</button>`;
  $('#portsDevice').value = sw.id;
  $('#portsDevice').onchange = e => { st.portsDevice = e.target.value; st.portNo = null; view(); };
  $('#portsOpen').onclick = () => openObj(sw.id);
  const onPort = p => rels.filter(r => r.to === sw.id && r.port === p);
  /* A relation's port belongs to its far end (the device it goes to), so every port here is one a relation comes in on. */
  const groupOf = p => (sw.portGroups || []).find(g => p >= g.from && p <= g.to);
  /* Each group has its own colour on the front panel, shown in the legend below it. A LAG group has dashed ports. */
  const groupColour = i => `hsl(${(210 + i * 97) % 360} 28% 50%)`;   /* muted: a group is a group, not a warning */
  /* A port in a linked LAG is in use by the device on the other end of the LAG. */
  const lagUse = p => { const g = groupOf(p); const r = g && g.lag ? lagLinkOf(sw, g) : null; return r ? {r, d: byId(r.to === sw.id ? r.from : r.to), g} : null; };
  const portBtn = p => {
    const inc = onPort(p), lu = lagUse(p);
    const dev = inc[0] ? byId(inc[0].from) : lu ? lu.d : null;
    const isUp = (inc[0] && isUplink(inc[0].kind)) || (lu && isUplink(lu.r.kind));
    const poe = dev && (dev.type === 'sip');
    const note = (sw.portNotes || {})[p];
    const tip = pfxOf(sw) + p + (note ? ' · ' + note : '') + (groupOf(p) ? ' · ' + groupOf(p).name + (groupOf(p).lag ? ' (LAG)' : '') : '') + (dev ? ' → ' + dev.name : ' · free');
    /* A device with a single port has nothing to choose: its port is shown, but not selectable. */
    const single = (sw.ports || 0) + (sw.sfp || 0) === 1;
    const gi = (sw.portGroups || []).findIndex(g => p >= g.from && p <= g.to);
    const grp = gi >= 0 ? ` grp${(sw.portGroups[gi].lag) ? ' lag' : ''}" style="--g:${groupColour(gi)}` : '';
    return `<button class="port ${dev?(isUp?'upl':'used'):''} ${poe?'poe':''} ${st.portNo===p?'sel':''} ${single?'single':''}${grp}" data-port="${p}" ${single?'disabled':''} title="${esc(tip)}" aria-label="${esc(tip)}">${p}</button>`;
  };
  const groups0 = sw.portGroups || [];
  /* A group being edited fills the form at the bottom; Save group writes it back in its place. */
  if (st.pgEdit && (st.pgEdit.sw !== sw.id || !groups0[st.pgEdit.i])) st.pgEdit = null;
  const pgEditing = st.pgEdit ? groups0[st.pgEdit.i] : null;
  const groups = []; for (let g = 0; g < (sw.ports || 0); g += 12){ const ps = []; for (let p = g+1; p <= Math.min(g+12, sw.ports || 0); p++) ps.push(p); groups.push(ps); }
  const sfps = []; for (let p = (sw.ports || 0)+1; p <= (sw.ports || 0)+(sw.sfp || 0); p++) sfps.push(p);
  const usedN = used(sw);

  /* Everything plugged into the switch, with what hangs behind each device (a PC behind a phone, monitors behind a PC). */
  const behind = (o, depth=0) => rels.filter(r => r.to === o.id && !isUplink(r.kind)).map(r => { const d = byId(r.from); return {d, r, depth, kids: depth < 3 ? behind(d, depth+1) : []}; });
  const flat = (arr, out=[]) => { arr.forEach(x => { out.push(x); flat(x.kids, out); }); return out; };
  const rows = [];
  for (let p = 1; p <= (sw.ports || 0) + (sw.sfp || 0); p++){
    onPort(p).forEach(r => { const d = byId(r.from); rows.push({p, d, r, sub: flat(behind(d))}); });
  }
  /* A LAG link is a row of its own, named by the LAG, with the device on the other end. */
  rels.forEach(r => {
    if (r.lag != null && r.to === sw.id) rows.push({p: 'LAG ' + r.lag, d: byId(r.from), r, sub: flat(behind(byId(r.from)))});
    if (r.fromLag != null && r.from === sw.id) rows.push({p: 'LAG ' + r.fromLag, d: byId(r.to), r, sub: flat(behind(byId(r.to)))});
  });
  const portDetail = st.portNo != null ? rows.filter(x => x.p === st.portNo) : [];
  const selLag = st.portNo != null ? lagUse(st.portNo) : null;
  const selGroup = st.portNo != null ? groupOf(st.portNo) : null;

  $('#view').innerHTML = `<div id="net">
    <div class="panelbox"><div class="hdr">Port setup</div>
      <div class="form" style="padding:10px 12px">
        <label for="psPorts">Copper ports</label><input id="psPorts" type="number" min="0" max="1000" value="${sw.ports || 0}" style="width:180px">
        <label for="psSfp">SFP ports</label><input id="psSfp" type="number" min="0" max="1000" value="${sw.sfp || 0}" style="width:180px">
        <label for="psPfx">Port naming</label><input id="psPfx" class="mono" maxlength="20" value="${esc(sw.pfx || '')}" placeholder="e.g. 1/ or Gi1/0/" style="width:180px">
      </div>
      <div class="addrel"><span class="note" id="psMsg" style="flex:1">A port is the naming followed by its number, for example ${esc((sw.pfx || '') + '12')}.</span></div>
    </div>
    ${!sw.ports && !sw.sfp ? `<p class="note">No ports yet. Set the port count in the details of ${esc(sw.name)}.</p>` : ''}
    <div class="panelbox"><div class="hdr">Front panel <span class="cnt">${usedN} of ${(sw.ports || 0) + (sw.sfp || 0)} ports in use</span></div>
      <div class="face"><div class="chassis"><span class="model">${esc(sw.name)}</span>
        <div class="pgroups">${groups.map(g => `<div class="pgroup">${g.map(portBtn).join('')}</div>`).join('')}<div class="pgroup sfp">${sfps.map(portBtn).join('')}</div></div></div></div>
      ${groups0.length ? `<div class="pgrouplegend">${groups0.map((g, i) => `<span class="pgl${g.lag ? ' lag' : ''}" style="--g:${groupColour(i)}"><i></i>${esc(g.name)} <span class="muted">${esc(pfxOf(sw) + g.from)}${g.to !== g.from ? '–' + esc(pfxOf(sw) + g.to) : ''}</span>${g.lag ? '<b>LAG</b>' : ''}</span>`).join('')}</div>` : ''}
      <div class="legend"><span><i></i>Free</span><span><i style="background:var(--used);border-color:var(--used)"></i>Device</span><span><i style="background:var(--upl);border-color:var(--upl)"></i>Uplink / trunk</span><span><i style="position:relative;background:var(--port)"><b style="position:absolute;top:1px;right:1px;width:5px;height:5px;border-radius:50%;background:var(--poe)"></b></i>PoE powered</span>${((sw.sfp || 0) || 0) ? `<span>Ports ${(sw.ports || 0)+1}–${(sw.ports || 0)+(sw.sfp || 0)} are SFP+</span>` : ''}</div>
    </div>
    ${st.portNo != null ? `<div class="panelbox"><div class="hdr">Description of port ${esc(pfxOf(sw) + st.portNo)}</div><div class="addrel"><input id="pnDesc" maxlength="120" value="${esc((sw.portNotes || {})[st.portNo] || '')}" placeholder="What is on this port, e.g. Printer, 3rd floor" aria-label="Description of this port" style="flex:1"></div></div>` : ''}
    ${st.portNo != null ? `<div class="panelbox"><div class="hdr">Port ${esc(pfxOf(sw) + st.portNo)}</div>${portDetail.length ? portDetail.map(x => `<div class="path">${[{o:x.d}, ...x.sub.map(s => ({o:s.d}))].map(n => `<button class="node" data-open="${n.o.id}">${tico(n.o.type,'tico sm')}${esc(n.o.name)}</button>`).join('<span class="edge">behind</span>')}</div>`).join('') : `<div class="path">${selLag ? `<span class="muted">Part of the LAG ${esc(selLag.g.name)}, linked to</span> <button class="node" data-open="${selLag.d.id}">${tico(selLag.d.type,'tico sm')}${esc(selLag.d.name)}</button>` : selGroup && selGroup.lag ? `<span class="muted">Part of the LAG ${esc(selGroup.name)}, not linked yet. Link the LAG from a device page: Relations, then choose the LAG.</span>` : `<span class="muted">Port is free.</span><button id="assignBtn" class="primary">Plug in a device…</button><button id="assignNewBtn">New device…</button>`}</div>`}</div>` : ''}
    <div class="panelbox"><div class="hdr">Port groups <span class="cnt">${groups0.length} ${groups0.length === 1 ? 'group' : 'groups'}</span></div>
      <div class="relist">${groups0.length ? groups0.map((g, i) => `<div class="relrow"><span class="k">${esc(g.name)}</span><span class="t">${g.from === g.to ? 'Port ' : 'Ports '}${esc(pfxOf(sw) + g.from)}${g.from === g.to ? '' : '–' + esc(pfxOf(sw) + g.to)}${g.kind ? ` · ${esc(g.kind)}` : ''}${g.lag ? ' · link aggregate (LAG)' : ''}</span><button data-editgroup="${i}" aria-label="Edit group ${esc(g.name)}">Edit</button><button class="icon ghost" data-delgroup="${i}" title="Remove group" aria-label="Remove group ${esc(g.name)}">×</button></div>`).join('') : '<p class="note lempty">No port groups yet. A group names a range of ports, such as the uplinks.</p>'}</div>
      <div class="addrel">${pgEditing ? `<span class="muted">Edit ${esc(pgEditing.name)}:</span>` : ''}<input id="pgName" placeholder="Group name, e.g. Uplinks" aria-label="Group name" value="${esc(pgEditing ? pgEditing.name : '')}"><input id="pgFrom" type="number" min="1" placeholder="From" style="width:80px" aria-label="First port" value="${pgEditing ? pgEditing.from : ''}"><input id="pgTo" type="number" min="1" placeholder="To" style="width:80px" aria-label="Last port" value="${pgEditing ? pgEditing.to : ''}"><input id="pgKind" placeholder="Kind, e.g. SFP+" style="width:120px" aria-label="Kind of port" value="${esc(pgEditing ? pgEditing.kind || '' : '')}"><label class="pchk" title="The ports act as one logical link, bundled with LACP or similar"><input type="checkbox" id="pgLag" ${pgEditing && pgEditing.lag ? 'checked' : ''}> LAG</label>${pgEditing ? '<button id="pgCancel">Cancel</button><button id="pgAdd" class="primary">Save group</button>' : '<button id="pgAdd">Add group</button>'}</div></div>
    <div class="panelbox"><div class="hdr">Port map</div><div style="overflow-x:auto"><table class="grid mini"><thead><tr><th>Port</th><th>Device</th><th>Type</th><th>VLAN</th><th>Behind it</th></tr></thead><tbody>
      ${rows.map(x => `<tr><td class="n">${esc(typeof x.p === 'number' ? pfxOf(sw) + x.p : x.p)}</td><td class="n"><a class="link" data-open="${x.d.id}">${esc(x.d.name)}</a></td><td>${isUplink(x.r.kind) ? 'Uplink' : esc(TYPES[x.d.type].short)}</td><td>${esc(x.r.vlan ? vlanLabel(x.r.vlan) : (isUplink(x.r.kind) ? 'Trunk' : ''))}</td>
        <td>${x.sub.map(s => `<a class="link mono" data-open="${s.d.id}">${esc(s.d.name)}</a>`).join(', ')}</td></tr>`).join('')}
    </tbody></table></div></div></div>`;
  $('#view').querySelectorAll('.port').forEach(b => b.onclick = () => { st.portNo = +b.dataset.port; view(); });
  const total = (sw.ports || 0) + (sw.sfp || 0);
  $('#view').querySelectorAll('[data-delgroup]').forEach(b => b.onclick = () => {
    const g = groups0[+b.dataset.delgroup];
    if (rels.some(r => (r.to === sw.id && r.lag === g.name) || (r.from === sw.id && r.fromLag === g.name))){ toast(`${g.name} is linked. Remove its link first.`); return; }
    sw.portGroups.splice(+b.dataset.delgroup, 1); queueServerSave(); toast('Port group removed'); render();
  });
  $('#view').querySelectorAll('[data-editgroup]').forEach(b => b.onclick = () => { st.pgEdit = {sw: sw.id, i: +b.dataset.editgroup}; render(); $('#pgName').focus(); });
  const pgCancel = $('#pgCancel'); if (pgCancel) pgCancel.onclick = () => { st.pgEdit = null; render(); };
  const pgAdd = $('#pgAdd'); if (pgAdd) pgAdd.onclick = () => {
    const name = $('#pgName').value.trim(), from = +$('#pgFrom').value, to = +($('#pgTo').value || $('#pgFrom').value), kind = $('#pgKind').value.trim();
    const editing = pgEditing, others = groups0.filter(g => g !== editing);
    if (!name){ toast('Give the group a name.'); return; }
    if (!Number.isInteger(from) || from < 1 || !Number.isInteger(to) || to < from || to > total){ toast(`The ports are numbered 1 to ${total}. Give a range within them.`); return; }
    if (others.some(g => from <= g.to && to >= g.from)){ toast('Those ports are already in a group. Pick ports outside it.'); return; }
    if (others.some(g => g.name.toLowerCase() === name.toLowerCase())){ toast(`There is already a group named ${name}. Give it another name.`); return; }
    /* A device on a port the group did not have yet must move first; one already in the group stays. */
    const wasIn = p => editing && p >= editing.from && p <= editing.to;
    if (rels.some(r => r.to === sw.id && typeof r.port === 'number' && r.port >= from && r.port <= to && !wasIn(r.port))){ toast('A device is on one of these ports. Move it first.'); return; }
    const lag = $('#pgLag').checked;
    const next = {name, from, to, ...(kind ? {kind} : {}), ...(lag ? {lag: true} : {})};
    if (!editing){ sw.portGroups = [...groups0, next]; queueServerSave(); toast('Port group added'); render(); return; }
    /* A linked LAG stays a LAG of the same size, so it still matches the LAG on the other end; a new name moves with its link. */
    const link = editing.lag ? lagLinkOf(sw, editing) : null;
    if (link && (!lag || to - from !== editing.to - editing.from)){ toast(`${editing.name} is linked to a LAG of ${editing.to - editing.from + 1} ports. Keep it a LAG of that size, or remove the link first.`); return; }
    if (link && name !== editing.name) for (const r of rels){ if (r.to === sw.id && r.lag === editing.name) r.lag = name; if (r.from === sw.id && r.fromLag === editing.name) r.fromLag = name; }
    sw.portGroups = groups0.map(g => g === editing ? next : g);
    st.pgEdit = null; queueServerSave(); toast('Port group saved'); render();
  };
  /* The port setup saves when a field is left, like every other field; a count that would drop a used port is refused
     and said beside the fields. */
  const savePorts = () => {
    const ports = $('#psPorts').value === '' ? NaN : +$('#psPorts').value, sfp = $('#psSfp').value === '' ? NaN : +$('#psSfp').value, pfx = $('#psPfx').value.trim();
    if (ports === sw.ports && sfp === (sw.sfp || 0) && pfx === (sw.pfx || '')) return;
    const err = portSetupError(sw, ports, sfp);
    if (err){ $('#psMsg').textContent = err; $('#psMsg').classList.add('err'); return; }
    Object.assign(sw, {ports, sfp, pfx}); queueServerSave(); toast('Ports saved'); render();
  };
  ['#psPorts', '#psSfp', '#psPfx'].forEach(id => { const el = $(id); if (el) el.onchange = savePorts; });
  const pn = $('#pnDesc'); if (pn) pn.onchange = () => {
    const v = pn.value.trim(); sw.portNotes = {...(sw.portNotes || {})};
    if (v) sw.portNotes[st.portNo] = v; else delete sw.portNotes[st.portNo];
    queueServerSave(); toast('Description saved'); render();
  };
  /* A free port: plug in a device the inventory has, or create one already plugged in. */
  const ab = $('#assignBtn'); if (ab) ab.onclick = () => linkObjModal({to: sw.id, port: st.portNo});
  const an = $('#assignNewBtn'); if (an) an.onclick = () => newObjModal({sw: sw.id, port: st.portNo});
}

