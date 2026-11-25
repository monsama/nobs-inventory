/* The device lists: the sidebar, the filter bar, the tabs and the empty states. Cards, Table, bulk actions, CSV, the map and
   the ports are in views-*.js, re-exported at the end. */
import './side-sections.js';
import { syncButtonHtml } from './16-sync.js';
import { REGISTERED, REGISTERED_LABEL, registeredOnly, typeSelLabel, dirLocOf, SRV_KINDS, kindOf, ofTypeSel, listTypes, scanSpan, whereSignOf, NEW_DAYS, addedRecently, SEEN_FILTERS, GONE_FILTERS, sourcesOf, evEl, $$, QUALITY, scopePool, REVIEW_SRC, REVIEW_STALE_DAYS, twinOf, REVIEW, contactOf, osFamily, JOIN_INFO, SYNC, GRAPH_FILTERS, scanOld, LS_ON, LS_USED, WARRANTY_SOON_DAYS, warrantyState, hasPorts, $, LOCS, SITES, STATUS, byId, filtered, hist, leftFilters, now, objs, restoreSnapshot, searchAll, snapshot, toastUndo, st, tcol, tico, toast, newSeen, withDrawCache } from './01-core.js';
import { SERVER, reloadFromServer, render, view } from './07-render.js';
import { TBL, saveTBL } from './06-topbar.js';
import { flushSearch } from './14-global-search.js';
import { newObjModal } from './05-new-object.js';
import { SYNC_FIELD_LABEL } from './sync-map.js';
import { USERS, isAdmin, openSettings, ownOnly, pickLocTexts, seenSites } from './04-settings.js';
import { sheetModal } from './08-sheets.js';
import { handOutToModal, takeBackModal } from './27-handout.js';
import { waitReason } from './15-review.js';
import { QUALITY_FIX, qfix, tableShownList } from './views-table.js';
import { renderSavedViews } from './views-saved.js';
import { html, rawHtml } from './html.js';
/* ---------- sidebar ---------- */
/* What the problem filters mean, on hover. */
const GRAPH_TIPS = {
  missing: 'Devices that Entra and Intune do not have, or no longer have since a sync',
  nointune: 'Computers and phones that are in Entra but not enrolled in Intune yet (or managed by another tool)',
  duplicates: 'Devices Entra has more than one record of (reinstalled, or hybrid joined and also registered): the old records can be deleted in Entra',
  notjoined: 'Computers and phones that are neither in Entra nor have a computer account in AD',
  secureboot: 'Windows devices whose health attestation in Intune says Secure Boot is off (read when Settings → Entra & Intune turns it on)',
  ambiguous: 'Graph has a device whose serial number or name fits more than one device here, so it was put on none: give them distinct names or serial numbers',
};
/* The views that show a list of devices, the inventory's or (st.scope) Pending devices's. */
const LIST_TABS = ['cards', 'table', 'map'];
const MORE_KEY = 'ni-more-filters';
const moreOpen = () => { try { return localStorage.getItem(MORE_KEY) === '1'; } catch { return false; } };
/* Draws the sidebar: Pending devices, types, sites and rooms, More filters, the active one-off filters, status and the saved
   views, each with how many of the listed devices it holds. A click on an item is handled below. */
/* The places from AD (or the user's office) the shown devices name that are no room here yet, A to Z. */
const newLocTexts = () => [...new Set(filtered().map(o => o.status !== 'retired' && dirLocOf(o)).filter(d => d && d.state === 'new' && !d.auto).map(d => d.text))].sort((a, b) => a.localeCompare(b));
export function renderSide(){ withDrawCache(drawSide); }
function drawSide(){
  /* The left bar is the inventory's: Pending devices is a list of its own, with its filters over it (renderFilterBar). */
  $('#scopeHdr').hidden = $('#scopeList').hidden = true; $('#scopeList').innerHTML = '';
  /* The sidebar counts what the list shows: in Pending devices only while Cards, Table or the map show it. */
  const pool = LIST_TABS.includes(st.tab) ? scopePool() : objs, cnt = f => pool.filter(f).length;
  /* With an object type selected, the locations count only objects of that type. */
  const ofType = f => o => ofTypeSel(o, st.type) && f(o);
  /* Types without a device are folded away ("+ 8 more types"), so the places and states below come into view; the type
     picked stays. "All devices" is marked only when nothing at all narrows the list. */
  const byType = pool.reduce((m, o) => (registeredOnly(o) ? 0 : m[o.type] = (m[o.type] || 0) + 1, m), {});
  /* The devices only registered in Entra: under the types, on their own, while there are any. */
  const nReg = pool.filter(registeredOnly).length;
  const regBtn = nReg || st.type === REGISTERED ? html`<button class="item ${st.type === REGISTERED ? 'sel' : ''}" data-type="${REGISTERED}" title="${JOIN_INFO['Entra registered'] || 'Registered in Entra only, not joined'}: kept out of the types above"><span class="dot jdot j-registered"></span><span class="lbl">${REGISTERED_LABEL}</span><span class="cnt">${nReg}</span></button>` : '';
  /* Under Server: its Kind (virtual, physical, not known), the way rooms are under a site. */
  const kinds = k => k !== 'server' || !byType.server ? '' : html`${Object.entries(SRV_KINDS).map(([kk, l]) => html`<button class="item sub ${st.type === 'server' && st.srvKind === kk ? 'sel' : ''}" data-srvkind="${kk}"><span class="lbl">${l}</span><span class="cnt">${pool.filter(o => !registeredOnly(o) && kindOf(o) === kk).length}</span></button>`)}`;
  const typeBtn = ([k, v]) => html`<button class="item ${st.type===k && !(k === 'server' && st.srvKind)?'sel':''}" data-type="${k}">${rawHtml(tico(k,'tico sm'))}<span class="lbl">${v.label}</span><span class="cnt">${byType[k] || 0}</span></button>${kinds(k)}`;
  const types = listTypes(), shown = types.filter(([k]) => byType[k] || st.type === k || st.sideAllTypes), folded = types.length - shown.length;
  /* Clear filters only while something is filtered: an idle button is noise. */
  $('#clearF').hidden = !leftFilters() && !st.q.trim() && !colFiltered();
  $('#typeList').innerHTML = html`<button class="item ${!st.type && !leftFilters() && !st.q.trim() ? 'sel' : ''}" data-type=""><span class="lbl">All devices</span><span class="cnt">${pool.length}</span></button>${
    shown.map(typeBtn)}${
    folded ? html`<button class="side-more" data-alltypes="1">+ ${folded} more type${folded === 1 ? '' : 's'} without devices</button>`
      : st.sideAllTypes && types.some(([k]) => !byType[k] && st.type !== k) ? html`<button class="side-more" data-alltypes="0">Fewer types</button>` : ''}${regBtn}`;
  const limit = seenSites(), sites = [...new Set([...SITES, ...LOCS.map(l => l.split(' / ')[0])])].filter(s => !limit || limit.includes(s));
  $('#locList').innerHTML = html`${sites.map(s => html`<button class="item ${st.loc===s?'sel':''}" data-loc="${s}"><span class="lbl">${s}</span><span class="cnt">${cnt(ofType(o=>String(o.loc||'').split(' / ')[0]===s))}</span></button>${
    LOCS.filter(l => l.startsWith(s + ' / ')).map(l => html`<button class="item sub ${st.loc===l?'sel':''}" data-loc="${l}"><span class="lbl">${l.split(' / ')[1]}</span><span class="cnt">${cnt(ofType(o=>o.loc===l))}</span></button>`)}`)}`;
  /* Warranty: devices whose warranty ends within 90 days, and those whose has ended. */
  $('#wtyList').innerHTML = html`${[['soon', `Ends within ${WARRANTY_SOON_DAYS} days`, 'off'], ['ended', 'Ended', 'off']].map(([k, l, c]) => html`<button class="item ${st.warranty===k?'sel':''}" data-warranty="${k}"><span class="dot ${c}"></span><span class="lbl">${l}</span><span class="cnt">${cnt(o => warrantyState(o) === k)}</span></button>`)}`;
  $('#seenList').innerHTML = html`${Object.entries(SEEN_FILTERS).map(([k, [l, f]]) => html`<button class="item ${st.seen===k?'sel':''}" data-seen="${k}"><span class="dot ${k === 'd30' ? 'warn' : 'bad'}"></span><span class="lbl">${l}</span><span class="cnt">${cnt(f)}</span></button>`)}<button class="item ${st.where ? 'sel' : ''}" data-where="1" title="Gone from every source, not seen or not scanned for long (Settings → Data sources)"><span class="dot bad"></span><span class="lbl">Where are they?</span><span class="cnt">${cnt(o => o.status !== 'retired' && !!whereSignOf(o))}</span></button>`;
  /* Gone from a source: one source in particular (only the sources some device has been in), any of them, or all of
     the ones the device was in. Hidden while no device has ever been in a source. */
  const inSrc = new Set(objs.flatMap(o => sourcesOf(o).map(x => x.src)));
  const goneRows = Object.entries(GONE_FILTERS).filter(([k]) => k === 'any' || k === 'all' ? inSrc.size > 0 : inSrc.has(k));
  $('#goneHdr').hidden = $('#goneList').hidden = !goneRows.length;
  $('#goneList').innerHTML = html`${goneRows.map(([k, [l, f]]) => html`<button class="item ${st.gone===k?'sel':''}" data-gone="${k}"><span class="dot ${k === 'all' ? 'bad' : 'warn'}"></span><span class="lbl">${l}</span><span class="cnt">${cnt(f)}</span></button>`)}`;
  /* Lansweeper: devices it has not scanned for three months, to be checked by hand. Shown while Lansweeper is in use. */
  const nOld = LS_USED() ? cnt(o => scanOld(o)) : 0;
  $('#chkHdr').hidden = $('#chkList').hidden = !LS_USED();
  $('#chkList').innerHTML = LS_USED() ? html`<button class="item ${st.scanOld?'sel':''}" data-scanold="1" title="${`Lansweeper has not scanned them for over ${scanSpan()}`}"><span class="dot warn"></span><span class="lbl">Check by hand</span><span class="cnt">${nOld}</span></button>` : '';
  /* Duplicates, whatever found them: a second record by DNS name (Lansweeper, e.g. a docking station), more than one record
     in Entra, and a Graph record that fits two devices here. Each is listed only when it has devices; the group only when
     one is. */
  const dups = /** @type {[string, string, string, (o: any) => boolean, boolean, () => boolean][]} */ ([
    ['twins', 'By DNS name', 'Named by a DNS name, with no serial number, beside a device of that name: most likely a second record of it, e.g. from a docking station', o => !!twinOf(o), st.twins, () => LS_ON()],
    ['duplicates', 'More than one in Entra', GRAPH_TIPS.duplicates, GRAPH_FILTERS.duplicates[2], st.intune === 'duplicates', () => SYNC.graph],
    ['ambiguous', 'Name or serial used twice', GRAPH_TIPS.ambiguous, GRAPH_FILTERS.ambiguous[2], st.intune === 'ambiguous', () => SYNC.graph],
  ]).map(([k, l, tip, f, on, live]) => [k, l, tip, live() ? cnt(f) : 0, on]).filter(([, , , n, on]) => n || on);
  $('#dupHdr').hidden = $('#dupList').hidden = !dups.length;
  $('#dupList').innerHTML = html`${dups.map(([k, l, tip, n, on]) => html`<button class="item ${on ? 'sel' : ''}" ${k === 'twins' ? html`data-twins="1"` : html`data-intune="${k}"`} title="${tip}"><span class="dot warn"></span><span class="lbl">${l}</span><span class="cnt">${n}</span></button>`)}`;
  /* Microsoft Graph: devices that are not compliant, not encrypted, not heard of for a while, or not in Entra and Intune.
     Shown once Graph is set up. */
  $('#grHdr').hidden = $('#grList').hidden = !SYNC.graph;
  /* The problems first; then how the devices are joined, each with what it means, and only the kinds that occur. */
  /* The join kinds sit under their own heading, before the first one shown, each with its colour from the Overview. */
  let joinHead = false;
  $('#grList').innerHTML = SYNC.graph ? Object.entries(GRAPH_FILTERS).map(([k, [l, c, f, onlyWhenSome, fromOverview]]) => {
    const n = cnt(f), join = c === 'join';
    if (fromOverview && st.intune !== k) return '';
    if (k === 'duplicates' || k === 'ambiguous') return '';   /* under Duplicates */
    if ((join || onlyWhenSome) && !n && st.intune !== k) return '';
    const head = join && !joinHead ? (joinHead = true, html`<div class="side-sub">Joined</div>`) : '';
    return html`${head}<button class="item ${st.intune === k ? 'sel' : ''}" data-intune="${k}" title="${join ? JOIN_INFO[l === 'AD joined only' ? 'AD joined' : l] || GRAPH_TIPS[k] : GRAPH_TIPS[k] || l}">${join ? html`<span class="dot jdot j-${k}"></span>` : html`<span class="dot ${c}"></span>`}<span class="lbl">${l}</span><span class="cnt">${n}</span></button>`;
  }).join('') : '';
  /* An operating system picked on the Overview: shown here while it filters, with a way out. */
  $('#osHdr').hidden = $('#osList').hidden = !st.osFam;
  $('#osList').innerHTML = st.osFam ? html`<button class="item sel" data-osfam="" title="Show all devices again"><span class="lbl">${st.osFam}</span><span class="cnt">${cnt(o => osFamily(o) === st.osFam)}</span><span aria-hidden="true">×</span></button>` : '';
  /* A contact's devices, opened from Contacts: shown here while it filters, with a way out. */
  const rc = contactOf(st.resp);
  $('#respHdr').hidden = $('#respList').hidden = !rc;
  $('#respList').innerHTML = rc ? html`<button class="item sel" data-resp="" title="Show all devices again"><span class="lbl">${rc.name}</span><span class="cnt">${cnt(o => o.respIn === rc.id || o.respEx === rc.id)}</span><span aria-hidden="true">×</span></button>` : '';
  /* An AD group picked on a device: shown here while it filters, with a way out. */
  $('#adgHdr').hidden = $('#adgList').hidden = !st.adGroup;
  $('#adgList').innerHTML = st.adGroup ? html`<button class="item sel" data-adgroup="" title="Show all devices again"><span class="lbl">${st.adGroup}</span><span class="cnt">${cnt(o => (o.adGroups || []).some(g => g.toLowerCase() === st.adGroup.toLowerCase()))}</span><span aria-hidden="true">×</span></button>` : '';
  /* Warranty, Lansweeper checks, duplicates and Entra & Intune under More filters: open while one of them filters, and
     once opened (this browser). */
  const mf = $('#moreFilters');
  if (mf){
    const on = mf.querySelectorAll('.item.sel').length;
    $('#moreFiltersOn').textContent = on ? `${on} on` : '';
    if (on || moreOpen()) mf.open = true;
    mf.ontoggle = () => { try { if (mf.open) localStorage.setItem(MORE_KEY, '1'); else if (!mf.querySelector('.item.sel')) localStorage.removeItem(MORE_KEY); } catch { /* not kept */ } };
  }
  /* Retired devices left out, as the Overview counts: shown while it filters, with a way out. */
  $('#statList').innerHTML = html`${st.live ? html`<button class="item sel" data-live title="Retired devices are left out, as on the Overview. Click to show them too"><span class="dot"></span><span class="lbl">Not retired</span><span class="cnt">${cnt(o => o.status !== 'retired')}</span><span aria-hidden="true">×</span></button>` : ''}${Object.entries(STATUS).map(([k,v]) => html`<button class="item ${st.status===k?'sel':''}" data-status="${k}"><span class="dot ${k==='active'?'':k==='retired'?'gone':'off'}"></span><span class="lbl">${v.label}</span><span class="cnt">${cnt(o=>o.status===k)}</span></button>`)}${
    !st.scope && (st.newWeek || cnt(addedRecently)) ? html`<button class="item ${st.newWeek ? 'sel' : ''}" data-newweek title="Came into the inventory in the last ${NEW_DAYS} days: from a sync, taken from Pending devices, or added by hand"><span class="dot new"></span><span class="lbl">Added this week</span><span class="cnt">${cnt(addedRecently)}</span></button>` : ''}`;
  /* The saved views (views-saved.js). */
  renderSavedViews();
  sideSummaries();
}
/* A folded section says the filter it holds, beside its name ("Types · PC"), so a filter in force is never hidden. */
function sideSummaries(){
  const rc = st.resp ? contactOf(st.resp) : null;
  const said = { types: typeSelLabel(st.type), locs: st.loc || '', status: st.status && STATUS[st.status] ? STATUS[st.status].label : st.live ? 'Not retired' : '',
    os: st.osFam || '', resp: rc ? rc.name : '', adg: st.adGroup || '' };
  for (const [sec, txt] of Object.entries(said)){
    const h = document.querySelector(`#side .sidesec[data-sec="${sec}"] > .hdr`); if (!h) continue;
    let sp = /** @type {HTMLElement|null} */ (h.querySelector('.sec-sum'));
    if (!sp){ sp = document.createElement('span'); sp.className = 'sec-sum'; const t = h.querySelector('.sec-t'); if (t) t.after(sp); else h.append(sp); }
    sp.textContent = txt ? `· ${txt}` : ''; sp.title = txt ? `Filtered: ${txt}` : '';
  }
}
$('#side').addEventListener('click', e => {
  /* A saved view is opened, renamed or deleted by views-saved.js. */
  if (e.target.closest('#viewList')) return;
  const more = e.target.closest('[data-alltypes]');
  if (more){ st.sideAllTypes = more.dataset.alltypes === '1'; renderSide(); return; }
  const b = e.target.closest('.item'); if (!b) return;
  /* A type clicked again goes back to all types. */
  if ('type' in b.dataset){ st.type = b.dataset.type && (st.type !== b.dataset.type || st.srvKind) ? b.dataset.type : null; st.srvKind = null; }
  if ('srvkind' in b.dataset){ const k = b.dataset.srvkind; st.srvKind = st.type === 'server' && st.srvKind === k ? null : k; st.type = 'server'; }
  if ('loc' in b.dataset) st.loc = st.loc === b.dataset.loc ? null : b.dataset.loc;
  if ('live' in b.dataset) st.live = false;
  if ('status' in b.dataset) st.status = st.status === b.dataset.status ? null : b.dataset.status;
  if ('warranty' in b.dataset) st.warranty = st.warranty === b.dataset.warranty ? null : b.dataset.warranty;
  if ('seen' in b.dataset) st.seen = st.seen === b.dataset.seen ? null : b.dataset.seen;
  if ('where' in b.dataset) st.where = !st.where;
  if ('gone' in b.dataset) st.gone = st.gone === b.dataset.gone ? null : b.dataset.gone;
  if ('scanold' in b.dataset) st.scanOld = !st.scanOld;
  if ('newweek' in b.dataset) st.newWeek = !st.newWeek;
  if ('twins' in b.dataset) st.twins = !st.twins;
  if ('scope' in b.dataset || 'rvknown' in b.dataset || 'rvold' in b.dataset){
    const was = { scope: st.scope, rvSrc: st.rvSrc, rvKnown: st.rvKnown, rvOld: st.rvOld };
    const to = { scope: 'scope' in b.dataset ? b.dataset.scope || null : 'review', rvSrc: b.dataset.rvsrc || '', rvKnown: 'rvknown' in b.dataset, rvOld: 'rvold' in b.dataset };
    const same = Object.keys(to).every(k => was[k] === to[k]);
    /* The one shown, clicked again: a choice under Waiting goes back to Waiting, Waiting or Ignored to the inventory. */
    const next = !same ? to : to.rvSrc || to.rvKnown || to.rvOld ? { scope: 'review', rvSrc: '', rvKnown: false, rvOld: false } : { scope: null, rvSrc: '', rvKnown: false, rvOld: false };
    Object.assign(st, next); st.bulk = new Set();
    /* Records in Pending devices have nobody assigned: a person's filter would leave the list empty. */
    st.person = null; st.live = false;
    if (st.scope && !LIST_TABS.includes(st.tab)) st.tab = 'cards';
  }
  if ('adgroup' in b.dataset) st.adGroup = null;
  if ('resp' in b.dataset) st.resp = null;
  if ('osfam' in b.dataset) st.osFam = null;
  if ('intune' in b.dataset) st.intune = st.intune === b.dataset.intune ? null : b.dataset.intune;
  if (!['cards','table','map'].includes(st.tab)) st.tab = 'cards';
  document.body.classList.remove('side-open');
  view();
});
/* Every filter back to none: the sidebar's, the search and the table's column filters. Shared with the Overview. */
/* Pending devices, from its tab, the bell or the Overview: a list of its own, so the inventory's filters go;
   type: only the ones of that type. */
/* Esc in Pending devices goes back to the inventory (from Ignored, back to Pending devices). Not while typing, in a
   dialog or with devices picked (Esc takes the pick back first). Caught before the pick's own Esc. */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !st.scope || !LIST_TABS.includes(st.tab) || $('#mdl') || (st.bulk && st.bulk.size) || document.querySelector(':popover-open, #fsrcPop')) return;
  const el = evEl(e); if (el.closest && el.closest('input, textarea, select, [contenteditable], [popover]:popover-open, .menu')) return;
  if (st.scope === 'ignored') st.scope = 'review'; else leavePending();
  view();
  /* What had the focus is drawn anew: it goes to the Pending tab, so the keyboard keeps its place. */
  const tab = $('#tabsbar .tab-review'); if (tab) tab.focus();
}, true);
/* Back from Pending devices (or Ignored) to the inventory, in the same view (List, Table). */
export function leavePending(){ st.scope = null; st.rvSrc = st.rvWhy = ''; st.rvKnown = st.rvOld = false; st.bulk = new Set(); }
export function enterCheck(type = null){
  resetFilters();
  Object.assign(st, { scope: 'review', rvSrc: '', rvWhy: '', rvKnown: false, rvOld: false, bulk: new Set(), person: null, live: false, type });
  if (!LIST_TABS.includes(st.tab)) st.tab = 'cards';
}
export function resetFilters(){
  st.type = st.srvKind = st.loc = st.status = st.warranty = st.seen = st.gone = st.where = st.adGroup = st.intune = st.osFam = st.resp = st.person = st.quality = st.ids = st.handField = null; st.scanOld = st.twins = st.live = st.newWeek = false; st.q = '';
  Object.values(TBL).forEach(t => { t.filters = {}; }); saveTBL();
}
/** A filter typed under a column of the device table counts too: Clear filters clears it. */
export const colFiltered = () => st.tab === 'table' && Object.values((TBL['view:table:0'] || {}).filters || {}).some(v => String(v || '').trim());
$('#clearF').onclick = () => { resetFilters(); view(); };
/* Clear filters in a list's "Nothing matches": the list's own filters go too. */
document.addEventListener('click', e => {
  if (!(evEl(e).closest && evEl(e).closest('#view [data-clearall]'))) return;
  e.preventDefault(); resetFilters();
  st.ipSub = st.ipAssign = st.prnShow = st.cnKind = ''; st.ipProblems = st.ctDue = false;
  view();
});
/* The filters in force, as chips over the list (Cards, Table, Relationships): what each is, and × to take it off, so a
   short list is never a mystery. Nothing is shown when nothing narrows the list. */
export function renderFilterBar(){
  const bar = $('#fbar'); if (!bar) return;
  const list = ['cards', 'table', 'map'].includes(st.tab);
  const rc = contactOf(st.resp), person = st.person ? USERS.find(u => u.id === st.person) : null;
  /* A person removed meanwhile: the filter goes with them, so it never hides everything unseen. */
  if (st.person && !person) st.person = null;
  /* The other lists the search filters (Floor plans, Software, Contracts, Contacts) show its chip too, so a list
     narrowed by text typed on another one is not read as everything. */
  const qOnly = !list && ['plans', 'sw', 'contracts', 'contacts'].includes(st.tab) && st.q.trim();
  const chips = qOnly ? [['q', 'Filter', '“' + st.q.trim() + '”']] : !list ? [] : [
    typeSelLabel(st.type) && ['type', 'Type', typeSelLabel(st.type)],
    st.type === 'server' && st.srvKind && SRV_KINDS[st.srvKind] && ['srvKind', 'Kind', SRV_KINDS[st.srvKind]],
    st.loc && ['loc', 'Location', st.loc],
    st.status && STATUS[st.status] && ['status', 'Status', STATUS[st.status].label],
    st.live && ['live', '', 'Not retired'],
    st.warranty && ['warranty', 'Warranty', st.warranty === 'soon' ? `ends within ${WARRANTY_SOON_DAYS} days` : 'ended'],
    st.seen && SEEN_FILTERS[st.seen] && ['seen', 'Last seen', SEEN_FILTERS[st.seen][0].replace(/^Not seen/, 'not').replace(/^Never seen by a source/, 'never')],
    st.gone && GONE_FILTERS[st.gone] && ['gone', 'Gone', GONE_FILTERS[st.gone][0].replace(/^From/, 'from')],
    st.where && ['where', '', 'Where are they?'],
    st.scanOld && ['scanOld', '', `Not scanned for ${scanSpan()}`],
    st.twins && ['twins', 'Duplicates', 'by DNS name'],
    st.scope === 'review' && st.rvKnown && ['rvKnown', '', 'In AD or Entra'],
    st.scope === 'review' && st.rvOld && ['rvOld', '', `Not seen for ${REVIEW_STALE_DAYS} days`],
    st.intune && GRAPH_FILTERS[st.intune] && ['intune', 'Entra / Intune', GRAPH_FILTERS[st.intune][0]],
    st.osFam && ['osFam', 'OS', st.osFam],
    rc && ['resp', 'Responsible', rc.name],
    person && ['person', 'Person', person.name],
    st.adGroup && ['adGroup', 'AD group', st.adGroup],
    st.quality && QUALITY[st.quality] && ['quality', 'Data quality', QUALITY[st.quality][0]],
    st.ids && ['ids', 'List', st.ids.label],
    st.handField && ['handField', 'Set by hand', SYNC_FIELD_LABEL[st.handField] || st.handField],
    st.newWeek && ['newWeek', 'Added', `in the last ${NEW_DAYS} days`],
    st.q.trim() && ['q', 'Filter', '“' + st.q.trim() + '”'],
  ].filter(Boolean);
  const pool = list && st.scope ? scopePool().length : 0;
  /* Pending devices, a list of its own: what it is, and its filters (why they wait, which source found them, the ignored ones),
     in place of the inventory's left bar. */
  const waitAll = REVIEW.filter(o => o.review && !o.review.ignored), ignAll = REVIEW.filter(o => o.review && o.review.ignored);
  /* The counts follow the type picked (+N beside a type), so they add up to what is shown. */
  const ofType = waitAll.filter(o => ofTypeSel(o, st.type));
  const bySrc = ofType.filter(o => !st.rvSrc || o.review.src === st.rvSrc);
  const whyN = k => k ? bySrc.filter(o => waitReason(o).kind === k).length : bySrc.length;
  const WHY = [['', 'All'], ['clear', 'Nothing unclear'], ['dup', 'Possible duplicate'], ['ip', 'Address only'], ['old', `Not seen for ${REVIEW_STALE_DAYS} days`]];
  const srcs = Object.entries(REVIEW_SRC).map(([k, l]) => [k, l, ofType.filter(o => o.review.src === k).length]).filter(([, , c]) => c);
  const backInv = html`<button type="button" class="fb-back" data-fx="scope" title="Back to the inventory">${rawHtml('<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>')}Inventory</button>`;
  const seg = (label, items) => html`<span class="vswitch fb-seg" role="group" aria-label="${label}">${items}</span>`;
  const scope = !list || !st.scope ? '' : st.scope === 'ignored'
    ? html`<div class="fb-inbox">${backInv}<span class="fb-inbox-t">${rawHtml(INBOX_ICON)}<b>Ignored</b><span class="muted">${pool} ${pool === 1 ? 'device' : 'devices'} kept out of the inventory and every sync</span></span><span class="grow"></span><button type="button" data-ckign>Back to pending (${waitAll.length})</button></div>`
    /* Pending devices: no bar of its own (its tab says where you are, and a second click on it, or Esc, goes back): only
       its filters, with Ignored at the end. */
    : (() => {
      const ign = ignAll.length ? html`<span class="grow"></span><button type="button" data-ckign title="Kept out of the inventory and of every sync">Ignored (${ignAll.length})</button>` : '';
      const segs = !waitAll.length ? '' : html`${seg('Why they wait', WHY.filter(([k]) => !k || whyN(k) || st.rvWhy === k).map(([k, l]) => html`<button type="button" class="${st.rvWhy === k ? 'on' : ''}" aria-pressed="${st.rvWhy === k}" data-ckwhy="${k}">${l} <span class="cnt">${whyN(k)}</span></button>`))}${srcs.length > 1 ? seg('Found by', [['', 'All sources', ofType.length], ...srcs].map(([k, l, c]) => html`<button type="button" class="${st.rvSrc === k ? 'on' : ''}" aria-pressed="${st.rvSrc === k}" data-cksrc="${k}">${l} <span class="cnt">${c}</span></button>`)) : ''}`;
      return segs || ign ? html`<div class="fb-person fb-check fb-ckrow">${segs}${ign}</div>` : '';
    })();
  /* A person's devices: who they are, and what is done with their devices when they come or go, in one place. */
  const mine = person ? objs.filter(o => o.uid === person.id && o.status !== 'retired') : [];
  const who = !list || !person ? '' : html`<div class="fb-person"><b>${person.name}</b>${person.active === false ? html` <span class="chip warn">left</span>` : ''}<span class="muted">${[person.dept, `${mine.length} ${mine.length === 1 ? 'device' : 'devices'}`].filter(Boolean).join(' · ')}</span>
    <span class="grow"></span>${SERVER.on && mine.length ? html`<a class="btnlike" href="api/reports/handback?id=${encodeURIComponent(person.id)}&format=pdf" download title="The devices ${person.name} has, as a PDF to tick off when they are handed back">Hand-back list</a>` : ''}${SERVER.on && isAdmin() ? html`<button type="button" data-pact="sheet" title="Print the devices handed out and, if wanted, a new initial password">Entry sheet…</button>` : ''}${isAdmin() ? html`<button type="button" data-pact="give" title="Give them devices from the stock">Hand out a device…</button>` : ''}${isAdmin() && mine.length ? html`<button type="button" data-pact="back" title="All of them in stock, nobody assigned (with Undo)">Take all back</button>` : ''}</div>`;
  /* Values set by hand in one field: given back to the sources, which write them again at their next sync. */
  const hf = list && st.handField && isAdmin() ? html`<div class="fb-person fb-qfix"><b>Set by hand: ${SYNC_FIELD_LABEL[st.handField] || st.handField}</b><span class="muted">no source changes these; given back, the sources write them again at their next sync.</span><span class="grow"></span><button type="button" data-handback="1">Give all back to the sources</button></div>` : '';
  const qf = st.tab === 'table' && st.quality !== 'locnew' && qfix() && QUALITY_FIX[st.quality] && QUALITY[st.quality];
  const qbar = !qf ? '' : html`<div class="fb-person fb-qfix"><b>${QUALITY[st.quality][0]}</b><span class="muted">${QUALITY_FIX[st.quality][2]}</span><span class="grow"></span>${QUALITY_FIX[st.quality][1] && isAdmin() ? html`<button type="button" data-qfix="1" id="qfixSel">Select all ${qfix().n}</button>` : ''}</div>`;
  /* Sources disagree: the values side by side, to pick from (compare-sources.js). */
  const cmpBar = list && st.quality === 'conflict' ? html`<div class="fb-person fb-qfix"><b>Sources disagree</b><span class="muted">${st.tab === 'table' ? 'the differing values are marked: click the mark in a cell to pick one, or compare them all' : 'compare what each source says and pick the value to keep'}</span><span class="grow"></span><button type="button" data-cmpsrc="1">Compare and pick…</button></div>` : '';
  /* Location from AD not a room yet: the texts the listed devices name, made rooms in Settings in one go. */
  const newLocs = list && st.quality === 'locnew' && isAdmin() ? newLocTexts() : [];
  const locBar = !newLocs.length ? '' : html`<div class="fb-person fb-qfix"><b>${newLocs.length} ${newLocs.length === 1 ? 'place' : 'places'} from AD not a room yet</b><span class="muted">${newLocs.slice(0, 3).join(', ')}${newLocs.length > 3 ? ` and ${newLocs.length - 3} more` : ''}</span><span class="grow"></span><button type="button" data-locrooms="1" title="Opens Settings → Locations with these ticked: pick the site and create them">Make them rooms…</button></div>`;
  /* No line over the inventory about devices waiting in Pending devices: the Pending tab says how many. In Pending
     devices, the clear ones are taken in with the filter Nothing unclear and Accept all. */
  /* Gone from a source: the devices listed can be retired in one go (admins, in the inventory's lists). */
  const goneN = list && !st.scope && (st.gone || st.where) && isAdmin() ? goneShown().length : 0;
  const goneBar = !goneN ? '' : html`<div class="fb-person fb-wait"><b>${goneN} ${goneN === 1 ? 'device' : 'devices'} ${st.gone ? 'gone' : 'may no longer be there'}</b><span class="muted">check where they are, then retire the ones no longer there</span><span class="grow"></span><button type="button" data-goneretire="1">Retire these ${goneN}…</button></div>`;
  bar.hidden = !chips.length && !scope && !who && !qbar && !hf && !goneBar && !locBar && !cmpBar;
  bar.innerHTML = html`${who}${qbar}${cmpBar}${locBar}${hf}${scope}${goneBar}${chips.length ? html`<span class="fb-l">Showing only</span>${chips.map(([k, l, v]) => html`<button type="button" class="fchip" data-fx="${k}" title="Take this filter off"><span>${l ? html`${l}: ` : ''}<b>${v}</b></span><span class="x" aria-hidden="true">×</span></button>`)}${chips.length > 1 ? html`<button type="button" class="fb-clear" data-fx="all">Clear all</button>` : ''}` : ''}`;
}
/* The devices a Gone from list shows, not retired: in the Table only the rows its column filters leave. */
const goneShown = () => ((st.tab === 'table' && tableShownList()) || filtered()).filter(o => o.status !== 'retired');
$('#fbar').addEventListener('click', e => {
  if (e.target.closest('[data-goneretire]')){ import('./gone-retire.js').then(m => m.retireGoneModal(goneShown())); return; }
  /* Pending devices's own filters: why they wait, which source found them, the ignored ones. */
  const ck = e.target.closest('[data-ckwhy], [data-cksrc], [data-ckign]');
  if (ck){
    if ('ckwhy' in ck.dataset) st.rvWhy = ck.dataset.ckwhy;
    if ('cksrc' in ck.dataset) st.rvSrc = ck.dataset.cksrc;
    if ('ckign' in ck.dataset){ st.scope = st.scope === 'ignored' ? 'review' : 'ignored'; st.rvWhy = st.rvSrc = ''; }
    st.bulk = new Set(); view();
    /* The bar is drawn again: the keyboard stays on the filter just picked. */
    const sel = 'ckwhy' in ck.dataset ? `[data-ckwhy="${ck.dataset.ckwhy}"]` : 'cksrc' in ck.dataset ? `[data-cksrc="${ck.dataset.cksrc}"]` : '[data-ckign]';
    const again = $('#fbar ' + sel); if (again && e.detail === 0) again.focus();
    return;
  }
  if (e.target.closest('[data-qfix]')){ if (qfix()) qfix().select(); return; }
  if (e.target.closest('[data-cmpsrc]')){ import('./compare-sources.js').then(m => m.compareSourcesModal()); return; }
  if (e.target.closest('[data-locrooms]')){
    pickLocTexts(newLocTexts()); st.setTab = 'locations'; openSettings();
    requestAnimationFrame(() => { const b = document.querySelector('#adLocs .adloc-bulk') || document.querySelector('#adLocs'); if (b) b.scrollIntoView({ block: 'center' }); const go = /** @type {HTMLElement|null} */ (document.querySelector('#adBulkGo')); if (go) go.focus(); });
    return;
  }
  if (e.target.closest('[data-handback]') && st.handField){
    const k = st.handField, list = filtered(), snap = snapshot(list);
    for (const o of list){ if (o.pick && o.pick[k] === 'hand') delete o.pick[k]; if (o.src && o.src[k] === 'hand') delete o.src[k]; hist(o, now(), `${SYNC_FIELD_LABEL[k] || k}: given back to the sources`); }
    st.handField = null;
    toastUndo(`${list.length} ${list.length === 1 ? 'device' : 'devices'}: ${SYNC_FIELD_LABEL[k] || k} given back to the sources`, () => { restoreSnapshot(snap, 'Give back undone'); render(); });
    render(); return;
  }
  const pa = e.target.closest('[data-pact]');
  if (pa){
    const person = USERS.find(u => u.id === st.person); if (!person) return;
    if (pa.dataset.pact === 'sheet'){ sheetModal(person); return; }
    if (pa.dataset.pact === 'give'){ handOutToModal(person); return; }
    /* Everything the person has goes back into stock, with nobody assigned: one Undo takes it all back. */
    takeBackModal(objs.filter(o => o.uid === person.id && o.status !== 'retired')); return;
  }
  const b = e.target.closest('[data-fx]'); if (!b) return;
  const k = b.dataset.fx;
  if (k === 'all') resetFilters();
  else if (k === 'q') st.q = '';
  else if (k === 'scope'){ st.scope = null; st.rvSrc = ''; st.rvKnown = false; st.rvOld = false; st.bulk = new Set(); }
  else if (k === 'scanOld' || k === 'where' || k === 'twins' || k === 'live' || k === 'rvKnown' || k === 'rvOld' || k === 'newWeek') st[k] = false;
  else { st[k] = null; if (k === 'type') st.srvKind = null; }
  view();
});
/* When the filters on the left (a type, a place, a status …) hide every object the search finds: says so and how many
   it finds without them, with a button that keeps the search and drops those filters. '' when that is not the case. */
export function hiddenHits(){
  const all = searchAll(), q = st.q.trim();
  if (!all.length) return '';
  const within = [typeSelLabel(st.type), st.loc || '', st.status && STATUS[st.status] ? STATUS[st.status].label.toLowerCase() : ''].filter(Boolean).join(', ') || 'the filters on the left';
  return String(html`<div class="empty">Nothing matches “${q}” within ${within}. ${all.length === 1 ? html`1 device outside ${st.type ? 'this type' : 'these filters'} does: <b>${all[0].name}</b>` : `${all.length} devices outside ${st.type ? 'this type' : 'these filters'} do`}. <button class="primary" id="searchAllBtn">Search all devices</button></div>`);
}
export function bindHiddenHits(){
  const b = $('#searchAllBtn');
  if (b) b.onclick = () => { const q = st.q; resetFilters(); st.q = q; view(); };
}
/* On a phone the filters are a drawer, opened with Filters in the bar. On a wider screen they sit beside the list, as
   wide as their edge is dragged (kept in this browser); dragged to the left edge they fold away into a thin strip, which
   a click or a drag to the right opens again, as wide as before. The strip shows how many filters are in force. */
const wide = () => window.innerWidth > 820;
$('#sideBtn').onclick = () => { document.body.classList.toggle('side-open'); };
/* Not chosen yet: open on a screen with room for it (1280 px and wider), folded away below that. Worked out once when
   the page loads, so making the window a little narrower does not take the filters away. */
const SIDE_DEFAULT = window.innerWidth >= 1280;
export const sidePinned = () => { let v = null; try { v = localStorage.getItem('ni-side-pin'); } catch { /* not kept */ } return v === null ? SIDE_DEFAULT : v === '1'; };
const SIDE_MIN = 180, SIDE_MAX = 480, SIDE_SNAP = 140;
const sideWidth = () => { let v = NaN; try { v = Number(localStorage.getItem('ni-side-w')); } catch { /* not kept */ } return v >= SIDE_MIN && v <= SIDE_MAX ? v : 250; };
const keepWidth = w => { try { localStorage.setItem('ni-side-w', String(Math.round(w))); } catch { /* not kept */ } };
export function placeSide(){
  document.body.classList.remove('side-drawer');
  document.body.classList.toggle('side-shut', !sidePinned());
  document.documentElement.style.setProperty('--sidew', sideWidth() + 'px');
  const g = $('#sideGrip'); if (g){ g.setAttribute('aria-valuenow', String(sidePinned() ? sideWidth() : 0)); g.setAttribute('aria-valuemin', '0'); g.setAttribute('aria-valuemax', String(SIDE_MAX)); }
  const rail = $('#sideRail'); if (rail) rail.setAttribute('aria-expanded', String(sidePinned()));
  const sb = $('#sideBtn');
  const n = $('#sideN'); if (n){ const k = [st.type, st.srvKind, st.loc, st.status, st.warranty, st.seen, st.gone, st.where, st.adGroup, st.intune, st.osFam, st.resp, st.quality, st.handField].filter(Boolean).length + (st.scanOld ? 1 : 0) + (st.twins ? 1 : 0) + (st.live ? 1 : 0) + (st.newWeek ? 1 : 0); n.textContent = String(k); n.hidden = !k; const rl = $('#sideRail'); if (rl) rl.setAttribute('aria-label', `Show the filters${k ? `, ${k} in force` : ''}`); if (sb) sb.setAttribute('aria-label', `Filters${k ? `, ${k} in force` : ''}${sidePinned() ? ', kept open' : ''}`); }
}
/* The Filters button says whether the drawer is open, however it closes (Escape, a tap beside it, a filter picked). */
new MutationObserver(() => { const b = $('#sideBtn'); if (b) b.setAttribute('aria-expanded', String(document.body.classList.contains('side-open'))); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
function setSidePin(on){ try { localStorage.setItem('ni-side-pin', on ? '1' : '0'); } catch { /* not kept */ } document.body.classList.remove('side-open'); placeSide(); }
/* Dragging the edge (or the strip): the width follows the pointer; let go nearer the left edge than SIDE_SNAP, the
   filters fold away (the width before is kept for when they open again). A click on the strip opens them, a click on
   the small tab in the middle of the edge folds them. */
function dragSide(e, fromRail){
  if (!wide() || e.button !== 0) return;
  e.preventDefault();
  const left = $('#main').getBoundingClientRect().left, startX = e.clientX, startY = e.clientY, was = sideWidth();
  /* The small tab on the edge: a click hides the filters (a drag from it still sets the width). */
  const fold = !fromRail && !!(e.target instanceof Element && e.target.closest('.side-fold'));
  let moved = false, movedY = false, w = sidePinned() ? was : 0;
  document.body.classList.add('side-dragging');
  const move = ev => {
    if (Math.abs(ev.clientX - startX) > 3) moved = true;
    if (Math.abs(ev.clientY - startY) > 3) movedY = true;
    if (!moved) return;
    w = Math.max(0, Math.min(SIDE_MAX, ev.clientX - left));
    if (w >= SIDE_SNAP && !sidePinned()) setSidePin(true);
    document.body.classList.toggle('side-snap', w < SIDE_SNAP);
    document.documentElement.style.setProperty('--sidew', Math.max(w, SIDE_MIN) + 'px');
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    document.body.classList.remove('side-dragging', 'side-snap');
    if (!moved){ if (fromRail) setSidePin(true); else if (fold && !movedY){ setSidePin(false); /* by mouse: no focus on the strip (its blue ring); by keyboard (Enter on the edge) it gets it */ } return; }
    if (w < SIDE_SNAP){ keepWidth(was); setSidePin(false); return; }
    keepWidth(Math.max(SIDE_MIN, w)); setSidePin(true);
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
$('#sideGrip').addEventListener('pointerdown', e => dragSide(e, false));
$('#sideRail').addEventListener('pointerdown', e => dragSide(e, true));
$('#sideRail').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); setSidePin(true); $('#sideGrip')?.focus(); } });
/* The edge by keyboard: ← and → by 20 px (Shift: 60), Home the narrowest, Enter folds away or opens. */
$('#sideGrip').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); const open = !sidePinned(); setSidePin(open); if (!open) $('#sideRail')?.focus(); return; }
  const step = e.shiftKey ? 60 : 20, d = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
  if (e.key === 'Home'){ e.preventDefault(); keepWidth(SIDE_MIN); placeSide(); return; }
  if (!d) return;
  e.preventDefault();
  if (!sidePinned()){ if (d > 0) setSidePin(true); return; }
  const next = sideWidth() + d;
  if (next < SIDE_MIN){ setSidePin(false); $('#sideRail')?.focus(); return; }
  keepWidth(Math.min(SIDE_MAX, next)); placeSide();
});
/* The filter drawer on a phone closes like a menu: Escape, or a tap beside it. */
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('side-open') && !$('#modalHost').childElementCount){ document.body.classList.remove('side-open'); $('#sideBtn').focus(); } });
document.addEventListener('pointerdown', e => { if (!document.body.classList.contains('side-open')) return; const t = evEl(e); if (t.closest && !t.closest('#side, #sideBtn')) document.body.classList.remove('side-open'); }, true);
document.addEventListener('click', e => { if (evEl(e).closest && evEl(e).closest('[data-empty-new]')) newObjModal(); });
document.addEventListener('click', async e => {
  const b = evEl(e).closest && evEl(e).closest('#reloadBtn'); if (!b || b.disabled) return;
  b.disabled = true; b.classList.add('spinning');
  try { if (await reloadFromServer()) toast('Up to date'); } finally { const n = $('#reloadBtn'); if (n){ n.disabled = false; n.classList.remove('spinning'); } }
});

/* An empty inventory says where the devices a sync found are: pending (after a clear, every device is new). */
export function emptyHtml(){
  const n = REVIEW.filter(o => !o.review.ignored).length;
  return String(n ? html`<div class="empty">No devices in the inventory yet, but <b>${n}</b> found by the syncs ${n === 1 ? 'waits' : 'wait'} in Pending devices. <button type="button" class="primary" data-tab-go="review">Open Pending devices</button></div>`
    : html`<div class="empty">The inventory is empty.${isAdmin() ? html` <button type="button" class="primary" data-empty-new>New device</button>` : ''}</div>`);
}
document.addEventListener('click', e => { const b = evEl(e).closest && evEl(e).closest('[data-tab-go]'); if (b){ st.tab = b.dataset.tabGo; view(); } });
/* ---------- tabs ---------- */
/* Tabs: the views and the open objects, in one row that can be reordered by dragging, as in NOBS SQL. */
export const FIXED_TABS = {mine:'My devices', overview:'Overview', review:'Pending devices', cards:'List', table:'Table', map:'Relations', plans:'Floor plans', net:'Ports', ips:'IP addresses', prn:'Printers', rack:'Racks', sw:'Software', contracts:'Contracts', contacts:'Contacts', stocktake:'Inventory check'};
/* The views someone gets: My devices only for a viewer who sees only their own devices, and for them only it and the
   lists (Cards, Table); the others show nothing they can use. */
const OWN_TABS = ['mine', 'cards', 'table'];
export const tabAllowed = id => !FIXED_TABS[id] || (ownOnly() ? OWN_TABS.includes(id) : id !== 'mine');
/** @type {Record<string, [string, string[]]>} */
export const TAB_GROUPS = { devices: ['Devices', ['cards', 'table']], network: ['Network', ['net', 'ips', 'prn']], business: ['Contracts & software', ['contracts', 'sw', 'contacts']] };
const TAB_GROUP_OF = Object.fromEntries(Object.entries(TAB_GROUPS).flatMap(([g, [, m]]) => m.map(id => [id, g])));
const groupLast = g => { const m = TAB_GROUPS[g][1], l = (st.tabLast || {})[g]; return m.includes(l) && tabAllowed(l) ? l : m.find(tabAllowed) || m[0]; };
/* The switch over a grouped view (Cards | Table, Contracts | Software | Contacts): put first in the toolbar. */
export function viewSwitch(){
  const g = TAB_GROUP_OF[st.tab]; if (!g) return;
  (st.tabLast = st.tabLast || {})[g] = st.tab;
  const m = TAB_GROUPS[g][1].filter(tabAllowed); if (m.length < 2) return;
  const tb = $('#toolbar'); if (!tb || tb.querySelector('.vswitch')) return;
  tb.insertAdjacentHTML('afterbegin', html`<span class="vswitch" role="group" aria-label="${TAB_GROUPS[g][0]}">${m.map(id => html`<button type="button" class="${id === st.tab ? 'on' : ''}" aria-pressed="${String(id === st.tab)}" data-vsw="${id}">${FIXED_TABS[id]}</button>`)}</span>`);
  tb.querySelectorAll('[data-vsw]').forEach(b => b.onclick = () => { flushSearch(); if (b.dataset.vsw !== st.tab){ st.tab = b.dataset.vsw; view(); } });
}
/* A view that draws its toolbar again on its own (ticking rows, typing in its search) would drop the switch: it is put
   back whenever the toolbar changes. */
{ const tb = document.getElementById('toolbar'); if (tb) new MutationObserver(() => { if (!tb.querySelector('.vswitch')) viewSwitch(); }).observe(tb, { childList: true }); }
/* Draws the tab bar (the views, Devices and Contracts as one tab each, Reload or Sync and Pending devices at the right) and the
   row of open devices under it. Wires drag to reorder, Enter, middle-click to close and the right-click menu. */
const INBOX_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6H3v-6z"/></svg>';
export function renderTabs(){
  /* Pending devices shows while devices wait in it, with how many; once it is empty it goes, unless it is the tab open. */
  const waiting = REVIEW.filter(o => !o.review.ignored).length;
  /* Inventory check shows while one runs, or while it is the tab open (from the Overview). Relationships only while it is open:
     it is opened from a device (More → Relationships), centred on it. */
  if (!st.tabIds.includes('stocktake')) st.tabIds.push('stocktake');
  /* IP addresses (0.9.127) sits beside Ports in a saved order from before it. */
  if (!st.tabIds.includes('ips')){ const i = st.tabIds.indexOf('net'); st.tabIds.splice(i < 0 ? st.tabIds.length : i + 1, 0, 'ips'); }
  /* Printers (0.9.133) beside IP addresses. */
  if (!st.tabIds.includes('prn')){ const i = st.tabIds.indexOf('ips'); st.tabIds.splice(i < 0 ? st.tabIds.length : i + 1, 0, 'prn'); }
  const stk = (st.stocktakes || []).some(t => !t.finished);
  if (!st.tabIds.includes('mine')) st.tabIds.unshift('mine');
  const ids = st.tabIds.filter(id => (FIXED_TABS[id] || st.open.includes(id)) && tabAllowed(id) && (id !== 'review' || waiting || st.scope) && (id !== 'stocktake' || stk || st.tab === 'stocktake') && (id !== 'map' || st.tab === 'map'));
  /* Views (Cards, Table, ...) and the objects opened from them are two groups: the objects are marked with their type colour. */
  const views = ids.filter(id => FIXED_TABS[id]), objs = ids.filter(id => !FIXED_TABS[id]);
  /* Cards and Table are one tab, Devices; Software, Contracts and Contacts one, Contracts: the button opens the view used
     last, a switch over the view changes between them (viewSwitch). */
  const viewTab = id => {
    const g = TAB_GROUP_OF[id], members = g ? TAB_GROUPS[g][1] : [id], open = g ? (members.includes(st.tab) ? st.tab : groupLast(g)) : id;
    /* In Pending devices (or Ignored) only its own tab is the one open, not Devices. */
    const inbox = !!st.scope && LIST_TABS.includes(st.tab);
    const on = id === 'review' ? inbox : members.includes(st.tab) && !(inbox && members.some(m => LIST_TABS.includes(m)));
    return `<button class="tab ${on ? 'active' : ''}" draggable="true" data-tab="${open}"${on ? ' aria-current="page"' : ''}${id === 'review' ? (on && st.scope === 'review' ? ' title="Back to the inventory (Esc)" aria-pressed="true"' : ' title="Pending devices: found by the syncs, waiting for a decision before they go into the inventory" aria-pressed="false"') : ''}>${id === 'review' ? `${INBOX_ICON}<span class="tlbl">Pending</span>` : g ? TAB_GROUPS[g][0] : FIXED_TABS[id]}${id === 'review' && waiting ? ` <span class="tab-cnt">${waiting}</span>` : ''}</button>`;
  };
  /* Pending devices sits on its own at the right end of the bar: an inbox, not one of the views. */
  /* Sync (admins) and Pending devices sit on their own at the right end of the bar: actions and an inbox, not views. */
  /* Reload: what others (or a Lansweeper push) changed on the server, now, instead of at the next check. */
  const reload = SERVER.on && !syncButtonHtml() ? `<button type="button" id="reloadBtn" class="tab sync-btn" title="Reload: show what changed on the server since this page loaded"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg><span class="tlbl">Reload</span></button>` : '';
  const sync = syncButtonHtml(), right = sync || reload || views.includes('review');
  /* A group shows once, where its first member stands in the order. */
  const shownViews = views.filter(id => id !== 'review' && (!TAB_GROUP_OF[id] || views.find(v => TAB_GROUP_OF[v] === TAB_GROUP_OF[id]) === id));
  /* A tab shown only while it is open (Relations, Inventory check with none running) comes after the others, so opening and
     closing it moves no other tab. It is not dragged into the order either. */
  const fleeting = id => id === 'map' || (id === 'stocktake' && !stk);
  const tabsHtml = shownViews.filter(id => !fleeting(id)).map(viewTab).join('')
    + shownViews.filter(fleeting).map(id => viewTab(id).replace(' draggable="true"', '')).join('');
  $('#tabsbar').innerHTML = tabsHtml + (right ? '<span class="grow"></span>' : '') + reload + sync
    + (views.includes('review') ? viewTab('review').replace('class="tab ', 'class="tab tab-review ').replace(' draggable="true"', '') : '');
  /* The open objects have a row of their own under the views, shown while at least one is open. */
  $('#objbar').hidden = !objs.length;
  /* The tabs scroll in a strip of their own; the caption and Close all stay where they are. */
  $('#objbar').innerHTML = (objs.length ? '<span class="tabs-cap">Open devices</span>' : '') + '<span class="objtabs">' + objs.map(id => {
    const o = byId(id);
    return html`<span class="tab objtab ${st.tab===id?'active':''}" draggable="true" data-tab="${id}" role="button" tabindex="0"><span class="tsw" style="background:${tcol(o.type)}"></span><span class="mono" title="${o.name}">${o.name}</span><span class="x" data-close="${id}" title="Close (middle-click also closes)">×</span></span>`;
  }).join('') + '</span>' + (objs.length > 1 ? '<button class="objbar-close" id="closeAllTabs" title="Close all open devices">Close all</button>' : '');
  { const strip = /** @type {HTMLElement|null} */ ($('#objbar .objtabs')), on = strip && /** @type {HTMLElement|null} */ (strip.querySelector('.tab.active'));
    if (on && strip.scrollWidth > strip.clientWidth) on.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  /* On a narrow screen the bar scrolls: a fade on the side where more tabs are says so, and the tab shown is scrolled
     into view. */
  const tb = $('#tabsbar'), edges = () => { tb.classList.toggle('more-r', tb.scrollLeft + tb.clientWidth < tb.scrollWidth - 2); tb.classList.toggle('more-l', tb.scrollLeft > 2); };
  const act = /** @type {HTMLElement|null} */ (tb.querySelector('.tab.active'));
  if (act && tb.scrollWidth > tb.clientWidth) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  edges(); tb.onscroll = edges;
  $$('#tabsbar [data-tab], #objbar [data-tab]').forEach(el => {
    const id = el.dataset.tab;
    el.addEventListener('dragstart', e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('dragover'); });
    el.addEventListener('dragleave', () => el.classList.remove('dragover'));
    el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('dragover'); const src = e.dataTransfer.getData('text/plain'); if (src && src !== id && el.draggable) reorderTabs(src, id); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); st.tab = id; view(); } });
    el.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
    el.addEventListener('auxclick', e => { if (e.button === 1 && st.open.includes(id)) closeObjTab(id); });
    if (st.open.includes(id)) el.addEventListener('contextmenu', e => showTabMenu(e, id));
  });
}
/* Moved the way NOBS SQL does it: after the target when moving right, before it when moving left. */
export function reorderTabs(src, tgt){
  /* A grouped tab (Devices, Contracts) moves with all its views, and lands before or after the whole target group. */
  const members = id => TAB_GROUP_OF[id] ? TAB_GROUPS[TAB_GROUP_OF[id]][1] : [id];
  const move = members(src), arr = st.tabIds, onto = members(tgt);
  if (move.includes(tgt)) return;
  const a = arr.findIndex(x => move.includes(x)), b = arr.findIndex(x => onto.includes(x));
  if (a < 0 || b < 0) return;
  const kept = arr.filter(x => !move.includes(x)), at = kept.findIndex(x => onto.includes(x));
  const atEnd = at + onto.filter(x => kept.includes(x)).length;
  kept.splice(a < b ? atEnd : at, 0, ...move.filter(x => arr.includes(x)));
  st.tabIds = kept;
  view();
}
export function closeObjTab(id){
  st.open = st.open.filter(x => x !== id); st.tabIds = st.tabIds.filter(x => x !== id);
  if (st.tab === id) st.tab = backTab();
  view();
}
/* Where closing the last device page leads: the list it was opened from, else the List. */
const backTab = () => ['cards', 'table', 'map'].includes(st.backTab) ? st.backTab : 'cards';
/* Closes every open object tab except `keep` (or all of them when keep is null). The views stay open. */
export function closeObjTabs(keep){
  st.open = st.open.filter(x => x === keep);
  st.tabIds = st.tabIds.filter(x => FIXED_TABS[x] || x === keep);
  if (!FIXED_TABS[st.tab] && st.tab !== keep) st.tab = keep || backTab();
  view();
}
/* The menu of a tab is a popover at the pointer: a click beside it or Escape closes it, and it is then gone. */
export let tabMenu = null;
export function hideTabMenu(){ if (tabMenu){ const m = tabMenu; tabMenu = null; m.remove(); } }
/* A menu opens at the pointer, but never past the window edge: it moves left or up to stay whole. */
function placeMenu(el, x, y){
  const w = el.offsetWidth, h = el.offsetHeight, m = 8;
  el.style.left = Math.max(m, Math.min(x, window.innerWidth - w - m)) + 'px';
  el.style.top = Math.max(m, Math.min(y, window.innerHeight - h - m)) + 'px';
}
/* The right-click menu of an open device's tab, at the pointer: close this tab, the others or all of them. */
export function showTabMenu(e, id){
  e.preventDefault(); hideTabMenu();
  tabMenu = document.createElement('div');
  tabMenu.className = 'tabmenu'; tabMenu.popover = 'auto';
  const others = st.open.some(x => x !== id);
  tabMenu.innerHTML = html`<button data-a="close">Close tab</button><button data-a="others" ${others ? '' : 'disabled'}>Close other tabs</button><button data-a="all">Close all tabs</button>`;
  document.body.appendChild(tabMenu);
  const m = tabMenu; m.addEventListener('toggle', ev => { if (ev.newState === 'closed' && tabMenu === m) hideTabMenu(); });
  tabMenu.showPopover();
  placeMenu(tabMenu, e.clientX, e.clientY);
  tabMenu.addEventListener('click', ev => {
    const a = ev.target.dataset.a; hideTabMenu();
    if (a === 'close') closeObjTab(id);
    if (a === 'others') closeObjTabs(id);
    if (a === 'all') closeObjTabs(null);
  });
}
/* A click in either tab bar: close one or all device tabs, or go to the tab clicked. */
const onTabClick = e => {
  flushSearch();
  if (e.target.closest('#closeAllTabs')){ closeObjTabs(null); return; }
  const c = e.target.closest('[data-close]');
  if (c){ closeObjTab(c.dataset.close); return; }
  const t = e.target.closest('[data-tab]');
  /* Back to Cards from Ports opens the device the ports were of. */
  if (t && t.dataset.tab === 'cards' && st.tab === 'net' && byId(st.portsDevice)){ openObj(st.portsDevice); return; }
  /* From an open device, Ports shows that device when it has ports (otherwise the one shown before), and Map is centred
     on it. */
  /* Pending devices' tab is a switch: pressed again while in it, it goes back to the inventory (from Ignored it opens Pending). */
  if (t && t.classList.contains('tab-review') && st.scope === 'review' && LIST_TABS.includes(st.tab)){ leavePending(); view(); return; }
  /* The Devices tab is the inventory: from Pending devices it goes back to it. */
  if (t && st.scope && !t.classList.contains('tab-review') && LIST_TABS.includes(t.dataset.tab)){ st.scope = null; st.rvSrc = st.rvWhy = ''; st.rvKnown = st.rvOld = false; st.bulk = new Set(); }
  if (t){ st.planFlash = null; if (t.dataset.tab === 'net' && byId(st.tab) && hasPorts(byId(st.tab))){ if (st.portsDevice !== st.tab) st.portNo = null; st.portsDevice = st.tab; } if (t.dataset.tab === 'map' && st.open.includes(st.tab)) st.mapFocus = st.tab; st.tab = t.dataset.tab; view(); }
};
$('#tabsbar').addEventListener('click', onTabClick);
$('#objbar').addEventListener('click', onTabClick);
export function openObj(id){
  newSeen(id);
  if (!st.open.includes(id)){ st.open.push(id); st.tabIds.push(id); }
  /* The list it was opened from (List, Table or the map), so closing the device goes back there (a Data quality list
     in the Table keeps its bar and selection). */
  if (['cards', 'table', 'map'].includes(st.tab)) st.backTab = st.tab;
  st.tab = id; view(); const v = $('#view'); if (v) v.scrollTop = 0;
  /* The focus was on what opened it (a card, a row, the search), which is gone now: it goes to the device's name, so Tab
     carries on in the device instead of from the top of the page. A field focused on purpose keeps it. */
  const a = document.activeElement;
  if (!a || a === document.body || !document.contains(a) || a.id === 'search') { const t = $('#objTitle'); if (t) t.focus({ preventScroll: true }); }
}


export * from './views-map.js';
export * from './views-ports.js';
export * from './views-cards.js';
export * from './views-table.js';
export * from './views-bulk.js';
export * from './views-csv.js';
export * from './views-saved.js';
