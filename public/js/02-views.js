/* The device lists: the sidebar, the filter bar, the tabs and the empty states. Cards, Table, bulk actions, CSV, the map and
   the ports are in views-*.js, re-exported at the end. */
import { syncButtonHtml } from './16-sync.js';
import { QUALITY, scopePool, REVIEW_SRC, REVIEW_STALE_DAYS, twinOf, REVIEW, contactOf, osFamily, JOIN_INFO, SYNC, GRAPH_FILTERS, scanOld, LS_ON, LS_USED, WARRANTY_SOON_DAYS, warrantyState, hasPorts, $, LOCS, SITES, STATUS, TYPES, byId, filtered, hist, leftFilters, now, objs, restoreSnapshot, searchAll, snapshot, toastUndo, st, tcol, tico, toast } from './01-core.js';
import { SERVER, reloadFromServer, render, view } from './07-render.js';
import { TBL, saveTBL } from './06-topbar.js';
import { flushSearch } from './14-global-search.js';
import { newObjModal } from './05-new-object.js';
import { SYNC_FIELD_LABEL } from './sync-map.js';
import { USERS, isAdmin, ownOnly, seenSites } from './04-settings.js';
import { sheetModal } from './08-sheets.js';
import { handOutToModal, takeBackModal } from './27-handout.js';
import { reviewStale } from './15-review.js';
import { QUALITY_FIX, qfix } from './views-table.js';
import { renderSavedViews } from './views-saved.js';
import { html, rawHtml } from './html.js';
/* ---------- sidebar ---------- */
/* What the problem filters mean, on hover. */
const GRAPH_TIPS = {
  missing: 'Devices that Entra and Intune do not have, or no longer have since a sync',
  duplicates: 'Devices Entra has more than one record of (reinstalled, or hybrid joined and also registered): the old records can be deleted in Entra',
  notjoined: 'Computers and phones that are neither in Entra nor have a computer account in AD',
  secureboot: 'Windows devices whose health attestation in Intune says Secure Boot is off (read when Settings → Entra & Intune turns it on)',
  ambiguous: 'Graph has a device whose serial number or name fits more than one device here, so it was put on none: give them distinct names or serial numbers',
};
/* The views that show a list of devices, the inventory's or (st.scope) To review's. */
const LIST_TABS = ['cards', 'table', 'map'];
const MORE_KEY = 'ni-more-filters';
const moreOpen = () => { try { return localStorage.getItem(MORE_KEY) === '1'; } catch { return false; } };
export function renderSide(){
  /* To review on top: the devices the syncs found, shown in Cards and Table like the inventory (st.scope), each source
     on its own, and the ignored ones. The group is there while any wait or are ignored, or while it is picked. */
  const waitingR = REVIEW.filter(o => !o.review.ignored), ignoredR = REVIEW.filter(o => o.review.ignored);
  const srcs = Object.entries(REVIEW_SRC).map(([k, l]) => [k, l, waitingR.filter(o => o.review.src === k).length]).filter(([, , n]) => n);
  $('#scopeHdr').hidden = $('#scopeList').hidden = !(waitingR.length || ignoredR.length || st.scope);
  /* Under Waiting one choice at a time (Old, In AD or Entra, a source); a second click on it, or on Waiting or Ignored
     when shown, goes back a step. */
  const sub = !!(st.rvSrc || st.rvKnown || st.rvOld);
  $('#scopeList').innerHTML = html`<button class="item ${st.scope === 'review' && !sub ? 'sel' : ''}" data-scope="review" title="Devices a sync found, not in the inventory yet: accept or ignore them in Cards or Table"><span class="dot warn"></span><span class="lbl">Waiting</span><span class="cnt">${waitingR.length}</span></button>${
    st.scope === 'review' && waitingR.some(reviewStale) ? html`<button class="item sub ${st.rvOld ? 'sel' : ''}" data-rvold title="Not seen by any source for ${REVIEW_STALE_DAYS} days or more: likely gone"><span class="lbl">Old</span><span class="cnt">${waitingR.filter(reviewStale).length}</span></button>` : ''}${
    st.scope === 'review' && waitingR.some(o => o.inAd || o.graph) ? html`<button class="item sub ${st.rvKnown ? 'sel' : ''}" data-rvknown title="Only the ones Active Directory or Entra knows too: most likely real devices"><span class="lbl">In AD or Entra</span><span class="cnt">${waitingR.filter(o => o.inAd || o.graph).length}</span></button>` : ''}${
    st.scope === 'review' && srcs.length > 1 ? srcs.map(([k, l, n]) => html`<button class="item sub ${st.rvSrc === k ? 'sel' : ''}" data-scope="review" data-rvsrc="${k}"><span class="lbl">${l}</span><span class="cnt">${n}</span></button>`) : ''}${
    ignoredR.length ? html`<button class="item ${st.scope === 'ignored' ? 'sel' : ''}" data-scope="ignored" title="Kept out of the inventory and of every sync"><span class="dot off"></span><span class="lbl">Ignored</span><span class="cnt">${ignoredR.length}</span></button>` : ''}`;
  /* The sidebar counts what the list shows: in To review only while Cards, Table or the map show it. */
  const pool = LIST_TABS.includes(st.tab) ? scopePool() : objs, cnt = f => pool.filter(f).length;
  /* With an object type selected, the locations count only objects of that type. */
  const ofType = f => o => (!st.type || o.type === st.type) && f(o);
  /* Types without a device are folded away ("+ 8 more types"), so the places and states below come into view; the type
     picked stays. "All devices" is marked only when nothing at all narrows the list. */
  const byType = pool.reduce((m, o) => (m[o.type] = (m[o.type] || 0) + 1, m), {});
  const typeBtn = ([k, v]) => html`<button class="item ${st.type===k?'sel':''}" data-type="${k}">${rawHtml(tico(k,'tico sm'))}<span class="lbl">${v.label}</span><span class="cnt">${byType[k] || 0}</span></button>`;
  const types = Object.entries(TYPES), shown = types.filter(([k]) => byType[k] || st.type === k || st.sideAllTypes), folded = types.length - shown.length;
  $('#typeList').innerHTML = html`<button class="item ${!st.type && !leftFilters() && !st.q.trim() ? 'sel' : ''}" data-type=""><span class="lbl">All devices</span><span class="cnt">${pool.length}</span></button>${
    shown.map(typeBtn)}${
    folded ? html`<button class="side-more" data-alltypes="1">+ ${folded} more type${folded === 1 ? '' : 's'} without devices</button>`
      : st.sideAllTypes && types.some(([k]) => !byType[k] && st.type !== k) ? html`<button class="side-more" data-alltypes="0">Fewer types</button>` : ''}`;
  const limit = seenSites(), sites = [...new Set([...SITES, ...LOCS.map(l => l.split(' / ')[0])])].filter(s => !limit || limit.includes(s));
  $('#locList').innerHTML = html`${sites.map(s => html`<button class="item ${st.loc===s?'sel':''}" data-loc="${s}"><span class="lbl">${s}</span><span class="cnt">${cnt(ofType(o=>String(o.loc||'').split(' / ')[0]===s))}</span></button>${
    LOCS.filter(l => l.startsWith(s + ' / ')).map(l => html`<button class="item sub ${st.loc===l?'sel':''}" data-loc="${l}"><span class="lbl">${l.split(' / ')[1]}</span><span class="cnt">${cnt(ofType(o=>o.loc===l))}</span></button>`)}`)}`;
  /* Warranty: devices whose warranty ends within 90 days, and those whose has ended. */
  $('#wtyList').innerHTML = html`${[['soon', `Ends within ${WARRANTY_SOON_DAYS} days`, 'warn'], ['ended', 'Ended', 'bad']].map(([k, l, c]) => html`<button class="item ${st.warranty===k?'sel':''}" data-warranty="${k}"><span class="dot ${c}"></span><span class="lbl">${l}</span><span class="cnt">${cnt(o => warrantyState(o) === k)}</span></button>`)}`;
  /* Lansweeper: devices it has not scanned for three months, to be checked by hand. Shown while Lansweeper is in use. */
  const nOld = LS_USED() ? cnt(o => scanOld(o)) : 0;
  $('#chkHdr').hidden = $('#chkList').hidden = !LS_USED();
  $('#chkList').innerHTML = LS_USED() ? html`<button class="item ${st.scanOld?'sel':''}" data-scanold="1" title="Lansweeper has not scanned them for over 3 months"><span class="dot warn"></span><span class="lbl">Check by hand</span><span class="cnt">${nOld}</span></button>` : '';
  /* Duplicates, whatever found them: a second record by DNS name (Lansweeper, e.g. a docking station), more than one record
     in Entra, and a Graph record that fits two devices here. Each is listed only when it has devices; the group only when
     one is. */
  const dups = [
    ['twins', 'By DNS name', 'Named by a DNS name, with no serial number, beside a device of that name: most likely a second record of it, e.g. from a docking station', o => !!twinOf(o), st.twins, () => LS_ON()],
    ['duplicates', 'More than one in Entra', GRAPH_TIPS.duplicates, GRAPH_FILTERS.duplicates[2], st.intune === 'duplicates', () => SYNC.graph],
    ['ambiguous', 'Name or serial used twice', GRAPH_TIPS.ambiguous, GRAPH_FILTERS.ambiguous[2], st.intune === 'ambiguous', () => SYNC.graph],
  ].map(([k, l, tip, f, on, live]) => [k, l, tip, live() ? cnt(f) : 0, on]).filter(([, , , n, on]) => n || on);
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
  $('#statList').innerHTML = html`${st.live ? html`<button class="item sel" data-live title="Retired devices are left out, as on the Overview. Click to show them too"><span class="dot"></span><span class="lbl">Not retired</span><span class="cnt">${cnt(o => o.status !== 'retired')}</span><span aria-hidden="true">×</span></button>` : ''}${Object.entries(STATUS).map(([k,v]) => html`<button class="item ${st.status===k?'sel':''}" data-status="${k}"><span class="dot ${k==='active'?'':k==='retired'?'gone':'off'}"></span><span class="lbl">${v.label}</span><span class="cnt">${cnt(o=>o.status===k)}</span></button>`)}`;
  /* The saved views (views-saved.js). */
  renderSavedViews();
}
$('#side').addEventListener('click', e => {
  /* A saved view is opened, renamed or deleted by views-saved.js. */
  if (e.target.closest('#viewList')) return;
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
  if ('scope' in b.dataset || 'rvknown' in b.dataset || 'rvold' in b.dataset){
    const was = { scope: st.scope, rvSrc: st.rvSrc, rvKnown: st.rvKnown, rvOld: st.rvOld };
    const to = { scope: 'scope' in b.dataset ? b.dataset.scope || null : 'review', rvSrc: b.dataset.rvsrc || '', rvKnown: 'rvknown' in b.dataset, rvOld: 'rvold' in b.dataset };
    const same = Object.keys(to).every(k => was[k] === to[k]);
    /* The one shown, clicked again: a choice under Waiting goes back to Waiting, Waiting or Ignored to the inventory. */
    const next = !same ? to : to.rvSrc || to.rvKnown || to.rvOld ? { scope: 'review', rvSrc: '', rvKnown: false, rvOld: false } : { scope: null, rvSrc: '', rvKnown: false, rvOld: false };
    Object.assign(st, next); st.bulk = new Set();
    /* Records in To review have nobody assigned: a person's filter would leave the list empty. */
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
export function resetFilters(){
  st.type = st.loc = st.status = st.warranty = st.adGroup = st.intune = st.osFam = st.resp = st.person = st.quality = st.ids = st.handField = null; st.scanOld = st.twins = st.live = false; st.q = '';
  Object.values(TBL).forEach(t => { t.filters = {}; }); saveTBL();
}
$('#clearF').onclick = () => { resetFilters(); view(); };
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
    st.type && TYPES[st.type] && ['type', 'Type', TYPES[st.type].label],
    st.loc && ['loc', 'Location', st.loc],
    st.status && STATUS[st.status] && ['status', 'Status', STATUS[st.status].label],
    st.live && ['live', '', 'Not retired'],
    st.warranty && ['warranty', 'Warranty', st.warranty === 'soon' ? `ends within ${WARRANTY_SOON_DAYS} days` : 'ended'],
    st.scanOld && ['scanOld', '', 'Not scanned for 3 months'],
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
    st.q.trim() && ['q', 'Filter', '“' + st.q.trim() + '”'],
  ].filter(Boolean);
  const pool = list && st.scope ? scopePool().length : 0;
  const scope = !list || !st.scope ? '' : html`<span class="fb-scope">${st.scope === 'ignored' ? `${pool} ignored ${pool === 1 ? 'device' : 'devices'}: kept out of the inventory and every sync`
    : html`${pool} ${pool === 1 ? 'device' : 'devices'} waiting for review${st.rvSrc ? html` (found by ${REVIEW_SRC[st.rvSrc] || st.rvSrc})` : ''}: not in the inventory yet`}</span><button type="button" class="fb-clear" data-fx="scope">Back to inventory</button>`;
  /* A person's devices: who they are, and what is done with their devices when they come or go, in one place. */
  const mine = person ? objs.filter(o => o.uid === person.id && o.status !== 'retired') : [];
  const who = !list || !person ? '' : html`<div class="fb-person"><b>${person.name}</b>${person.active === false ? html` <span class="chip warn">left</span>` : ''}<span class="muted">${[person.dept, `${mine.length} ${mine.length === 1 ? 'device' : 'devices'}`].filter(Boolean).join(' · ')}</span>
    <span class="grow"></span>${SERVER.on && mine.length ? html`<a class="btnlike" href="api/reports/handback?id=${encodeURIComponent(person.id)}&format=pdf" download title="The devices ${person.name} has, as a PDF to tick off when they are handed back">Hand-back list</a>` : ''}${SERVER.on && isAdmin() ? html`<button type="button" data-pact="sheet" title="Print the devices handed out and, if wanted, a new initial password">Entry sheet…</button>` : ''}${isAdmin() ? html`<button type="button" data-pact="give" title="Give them devices from the stock">Hand out a device…</button>` : ''}${isAdmin() && mine.length ? html`<button type="button" data-pact="back" title="All of them in stock, nobody assigned (with Undo)">Take all back</button>` : ''}</div>`;
  /* Values set by hand in one field: given back to the sources, which write them again at their next sync. */
  const hf = list && st.handField && isAdmin() ? html`<div class="fb-person fb-qfix"><b>Set by hand: ${SYNC_FIELD_LABEL[st.handField] || st.handField}</b><span class="muted">no source changes these; given back, the sources write them again at their next sync.</span><span class="grow"></span><button type="button" data-handback="1">Give all back to the sources</button></div>` : '';
  const qf = st.tab === 'table' && qfix() && QUALITY_FIX[st.quality] && QUALITY[st.quality];
  const qbar = !qf ? '' : html`<div class="fb-person fb-qfix"><b>${QUALITY[st.quality][0]}</b><span class="muted">${QUALITY_FIX[st.quality][2]}.</span><span class="grow"></span>${QUALITY_FIX[st.quality][1] && isAdmin() ? html`<button type="button" data-qfix="1" id="qfixSel">Select all ${qfix().n}</button>` : ''}</div>`;
  bar.hidden = !chips.length && !scope && !who && !qbar && !hf;
  bar.innerHTML = html`${who}${qbar}${hf}${scope}${chips.length ? html`<span class="fb-l">Showing only</span>${chips.map(([k, l, v]) => html`<button type="button" class="fchip" data-fx="${k}" title="Take this filter off"><span>${l ? html`${l}: ` : ''}<b>${v}</b></span><span class="x" aria-hidden="true">×</span></button>`)}${chips.length > 1 ? html`<button type="button" class="fb-clear" data-fx="all">Clear all</button>` : ''}` : ''}`;
}
$('#fbar').addEventListener('click', e => {
  if (e.target.closest('[data-qfix]')){ if (qfix()) qfix().select(); return; }
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
  else if (k === 'scanOld' || k === 'twins' || k === 'live' || k === 'rvKnown' || k === 'rvOld') st[k] = false;
  else st[k] = null;
  view();
});
/* When the filters on the left (a type, a place, a status …) hide every object the search finds: says so and how many
   it finds without them, with a button that keeps the search and drops those filters. '' when that is not the case. */
export function hiddenHits(){
  const all = searchAll(), q = st.q.trim();
  if (!all.length) return '';
  const within = [st.type && TYPES[st.type] ? TYPES[st.type].label : '', st.loc || '', st.status && STATUS[st.status] ? STATUS[st.status].label.toLowerCase() : ''].filter(Boolean).join(', ') || 'the filters on the left';
  return String(html`<div class="empty">Nothing matches “${q}” within ${within}. ${all.length === 1 ? html`1 device outside ${st.type ? 'this type' : 'these filters'} does: <b>${all[0].name}</b>` : `${all.length} devices outside ${st.type ? 'this type' : 'these filters'} do`}. <button class="primary" id="searchAllBtn">Search all devices</button></div>`);
}
export function bindHiddenHits(){
  const b = $('#searchAllBtn');
  if (b) b.onclick = () => { const q = st.q; resetFilters(); st.q = q; view(); };
}
$('#sideBtn').onclick = () => document.body.classList.toggle('side-open');
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-empty-new]')) newObjModal(); });
document.addEventListener('click', async e => {
  const b = e.target.closest && e.target.closest('#reloadBtn'); if (!b || b.disabled) return;
  b.disabled = true; b.classList.add('spinning');
  try { if (await reloadFromServer()) toast('Up to date'); } finally { const n = $('#reloadBtn'); if (n){ n.disabled = false; n.classList.remove('spinning'); } }
});

/* An empty inventory says where the devices a sync found are: waiting in To review (after a clear, every device is new). */
export function emptyHtml(){
  const n = REVIEW.filter(o => !o.review.ignored).length;
  return String(n ? html`<div class="empty">No devices in the inventory yet, but <b>${n}</b> found by the syncs ${n === 1 ? 'waits' : 'wait'} in To review. <button type="button" class="primary" data-tab-go="review">Open To review</button></div>`
    : html`<div class="empty">The inventory is empty.${isAdmin() ? html` <button type="button" class="primary" data-empty-new>New device</button>` : ''}</div>`);
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-tab-go]'); if (b){ st.tab = b.dataset.tabGo; view(); } });
/* ---------- tabs ---------- */
/* Tabs: the views and the open objects, in one row that can be reordered by dragging, as in NOBS SQL. */
export const FIXED_TABS = {mine:'My devices', overview:'Overview', review:'To review', cards:'Cards', table:'Table', map:'Relations', plans:'Floor plans', net:'Ports', rack:'Racks', sw:'Software', contracts:'Contracts', contacts:'Contacts', stocktake:'Stocktake'};
/* The views someone gets: My devices only for a viewer who sees only their own devices, and for them only it and the
   lists (Cards, Table); the others show nothing they can use. */
const OWN_TABS = ['mine', 'cards', 'table'];
export const tabAllowed = id => !FIXED_TABS[id] || (ownOnly() ? OWN_TABS.includes(id) : id !== 'mine');
export const TAB_GROUPS = { devices: ['Devices', ['cards', 'table']], business: ['Contracts', ['contracts', 'sw', 'contacts']] };
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
export function renderTabs(){
  /* To review shows while devices wait in it, with how many; once it is empty it goes, unless it is the tab open. */
  const waiting = REVIEW.filter(o => !o.review.ignored).length;
  /* Stocktake shows while one runs, or while it is the tab open (from the Overview). Relationships only while it is open:
     it is opened from a device (More → Relationships), centred on it. */
  if (!st.tabIds.includes('stocktake')) st.tabIds.push('stocktake');
  const stk = (st.stocktakes || []).some(t => !t.finished);
  if (!st.tabIds.includes('mine')) st.tabIds.unshift('mine');
  const ids = st.tabIds.filter(id => (FIXED_TABS[id] || st.open.includes(id)) && tabAllowed(id) && (id !== 'review' || waiting || st.scope) && (id !== 'stocktake' || stk || st.tab === 'stocktake') && (id !== 'map' || st.tab === 'map'));
  /* Views (Cards, Table, ...) and the objects opened from them are two groups: the objects are marked with their type colour. */
  const views = ids.filter(id => FIXED_TABS[id]), objs = ids.filter(id => !FIXED_TABS[id]);
  /* Cards and Table are one tab, Devices; Software, Contracts and Contacts one, Contracts: the button opens the view used
     last, a switch over the view changes between them (viewSwitch). */
  const viewTab = id => {
    const g = TAB_GROUP_OF[id], members = g ? TAB_GROUPS[g][1] : [id], open = g ? (members.includes(st.tab) ? st.tab : groupLast(g)) : id;
    const on = members.includes(st.tab) || (id === 'review' && st.scope && LIST_TABS.includes(st.tab));
    return `<button class="tab ${on ? 'active' : ''}" draggable="true" data-tab="${open}">${g ? TAB_GROUPS[g][0] : FIXED_TABS[id]}${id === 'review' && waiting ? ` <span class="tab-cnt">${waiting}</span>` : ''}</button>`;
  };
  /* To review sits on its own at the right end of the bar: an inbox, not one of the views. */
  /* Sync (admins) and To review sit on their own at the right end of the bar: actions and an inbox, not views. */
  /* Reload: what others (or a Lansweeper push) changed on the server, now, instead of at the next check. */
  const reload = SERVER.on && !syncButtonHtml() ? `<button type="button" id="reloadBtn" class="tab sync-btn" title="Reload: show what changed on the server since this page loaded"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg><span class="tlbl">Reload</span></button>` : '';
  const sync = syncButtonHtml(), right = sync || reload || views.includes('review');
  /* A group shows once, where its first member stands in the order. */
  const shownViews = views.filter(id => id !== 'review' && (!TAB_GROUP_OF[id] || views.find(v => TAB_GROUP_OF[v] === TAB_GROUP_OF[id]) === id));
  $('#tabsbar').innerHTML = shownViews.map(viewTab).join('') + (right ? '<span class="grow"></span>' : '') + reload + sync
    + (views.includes('review') ? viewTab('review').replace('class="tab ', 'class="tab tab-review ').replace(' draggable="true"', '') : '');
  /* The open objects have a row of their own under the views, shown while at least one is open. */
  $('#objbar').hidden = !objs.length;
  $('#objbar').innerHTML = (objs.length ? '<span class="tabs-cap">Open devices</span>' : '') + objs.map(id => {
    const o = byId(id);
    return html`<span class="tab objtab ${st.tab===id?'active':''}" draggable="true" data-tab="${id}" role="button" tabindex="0"><span class="tsw" style="background:${tcol(o.type)}"></span><span class="mono" title="${o.name}">${o.name}</span><span class="x" data-close="${id}" title="Close (middle-click also closes)">×</span></span>`;
  }).join('') + (objs.length > 1 ? '<span class="grow"></span><button class="objbar-close" id="closeAllTabs" title="Close all open devices">Close all</button>' : '');
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
/* The menu of a tab is a popover at the pointer: a click beside it or Escape closes it, and it is then gone. */
export let tabMenu = null;
export function hideTabMenu(){ if (tabMenu){ const m = tabMenu; tabMenu = null; m.remove(); } }
/* A menu opens at the pointer, but never past the window edge: it moves left or up to stay whole. */
function placeMenu(el, x, y){
  const w = el.offsetWidth, h = el.offsetHeight, m = 8;
  el.style.left = Math.max(m, Math.min(x, window.innerWidth - w - m)) + 'px';
  el.style.top = Math.max(m, Math.min(y, window.innerHeight - h - m)) + 'px';
}
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


export * from './views-map.js';
export * from './views-ports.js';
export * from './views-cards.js';
export * from './views-table.js';
export * from './views-bulk.js';
export * from './views-csv.js';
export * from './views-saved.js';
