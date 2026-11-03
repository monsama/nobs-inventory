import { handOutModal } from './27-handout.js';
import { syncButtonHtml } from './16-sync.js';
import { money } from './09-costs.js';
import { parseCsv } from './csv.js';
import { dueOf, lifeOf } from './lifecycle.js';
import { nextTask } from './maintenance.js';
import { respText, setResponsible } from './11-contacts.js';
import { CONTACT_KINDS, contactLabel } from './contacts.js';
import { linkHref, linkKind } from './links.js';
import { menuHtml, QUALITY, twinsOf, scopePool, REVIEW_SRC, REVIEW_STALE_DAYS, pickHand, twinOf, markHand, FIELD_LABEL, sourceText, REVIEW, lastSeenOf, GRAPH_STALE_DAYS, seenChip, CONTACTS, contactOf, GRAPH_TYPES, joinBadges, feedLinked, osFamily, JOIN_INFO, SYNC, GRAPH_FILTERS, scanOld, scanChip, LS_ON, LS_USED, relIndex, FIELD_LAYOUT, WARRANTY_SOON_DAYS, warrantyState, dayText, graphChip, isAttached, markHtml, syncOf, TYPE_FIELDS, hasPorts, $, LOCS, O, SITES, STATUS, TYPES, byId, esc, filtered, hist, leftFilters, now, objs, restoreSnapshot, searchAll, snapshot, toastUndo, portLabel, rels, relsOf, st, syncChip, tcol, tico, toast, used } from './01-core.js';
import { SERVER, reloadFromServer, render, view } from './07-render.js';
import { TBL, cmpCells, saveTBL } from './06-topbar.js';
import { flushSearch } from './14-global-search.js';
import { newObjModal } from './05-new-object.js';
import { reportsModal } from './21-reports.js';
import { SYNC_FIELD_LABEL } from './sync-map.js';
import { USERS, bindUser, isAdmin, ownOnly, seenSites, checkAddress, rackOf, showDevicesOf } from './04-settings.js';
import { closeModal, confirmModal, modal } from './19-modal.js';
import { sheetModal } from './08-sheets.js';
import { handOutToModal, takeBackModal } from './27-handout.js';
import { dupOf, mergeTarget, resolveModal, reviewDo, reviewStale } from './15-review.js';
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
  $('#scopeList').innerHTML = `<button class="item ${st.scope === 'review' && !sub ? 'sel' : ''}" data-scope="review" title="Devices a sync found, not in the inventory yet: accept or ignore them in Cards or Table"><span class="dot warn"></span><span class="lbl">Waiting</span><span class="cnt">${waitingR.length}</span></button>`
    + (st.scope === 'review' && waitingR.some(reviewStale) ? `<button class="item sub ${st.rvOld ? 'sel' : ''}" data-rvold title="Not seen by any source for ${REVIEW_STALE_DAYS} days or more: likely gone"><span class="lbl">Old</span><span class="cnt">${waitingR.filter(reviewStale).length}</span></button>` : '')
    + (st.scope === 'review' && waitingR.some(o => o.inAd || o.graph) ? `<button class="item sub ${st.rvKnown ? 'sel' : ''}" data-rvknown title="Only the ones Active Directory or Entra knows too: most likely real devices"><span class="lbl">In AD or Entra</span><span class="cnt">${waitingR.filter(o => o.inAd || o.graph).length}</span></button>` : '')
    + (st.scope === 'review' && srcs.length > 1 ? srcs.map(([k, l, n]) => `<button class="item sub ${st.rvSrc === k ? 'sel' : ''}" data-scope="review" data-rvsrc="${k}"><span class="lbl">${esc(l)}</span><span class="cnt">${n}</span></button>`).join('') : '')
    + (ignoredR.length ? `<button class="item ${st.scope === 'ignored' ? 'sel' : ''}" data-scope="ignored" title="Kept out of the inventory and of every sync"><span class="dot off"></span><span class="lbl">Ignored</span><span class="cnt">${ignoredR.length}</span></button>` : '')
    ;
  /* The sidebar counts what the list shows: in To review only while Cards, Table or the map show it. */
  const pool = LIST_TABS.includes(st.tab) ? scopePool() : objs, cnt = f => pool.filter(f).length;
  /* With an object type selected, the locations count only objects of that type. */
  const ofType = f => o => (!st.type || o.type === st.type) && f(o);
  /* Types without a device are folded away ("+ 8 more types"), so the places and states below come into view; the type
     picked stays. "All devices" is marked only when nothing at all narrows the list. */
  const byType = pool.reduce((m, o) => (m[o.type] = (m[o.type] || 0) + 1, m), {});
  const typeBtn = ([k, v]) => `<button class="item ${st.type===k?'sel':''}" data-type="${k}">${tico(k,'tico sm')}<span class="lbl">${esc(v.label)}</span><span class="cnt">${byType[k] || 0}</span></button>`;
  const types = Object.entries(TYPES), shown = types.filter(([k]) => byType[k] || st.type === k || st.sideAllTypes), folded = types.length - shown.length;
  $('#typeList').innerHTML =
    `<button class="item ${!st.type && !leftFilters() && !st.q.trim() ? 'sel' : ''}" data-type=""><span class="lbl">All devices</span><span class="cnt">${pool.length}</span></button>` +
    shown.map(typeBtn).join('') +
    (folded ? `<button class="side-more" data-alltypes="1">+ ${folded} more type${folded === 1 ? '' : 's'} without devices</button>`
      : st.sideAllTypes && types.some(([k]) => !byType[k] && st.type !== k) ? '<button class="side-more" data-alltypes="0">Fewer types</button>' : '');
  const limit = seenSites(), sites = [...new Set([...SITES, ...LOCS.map(l => l.split(' / ')[0])])].filter(s => !limit || limit.includes(s));
  $('#locList').innerHTML = sites.map(s => `<button class="item ${st.loc===s?'sel':''}" data-loc="${esc(s)}"><span class="lbl">${esc(s)}</span><span class="cnt">${cnt(ofType(o=>String(o.loc||'').split(' / ')[0]===s))}</span></button>` +
    LOCS.filter(l => l.startsWith(s + ' / ')).map(l => `<button class="item sub ${st.loc===l?'sel':''}" data-loc="${esc(l)}"><span class="lbl">${esc(l.split(' / ')[1])}</span><span class="cnt">${cnt(ofType(o=>o.loc===l))}</span></button>`).join('')).join('');
  /* Warranty: devices whose warranty ends within 90 days, and those whose has ended. */
  $('#wtyList').innerHTML = [['soon', `Ends within ${WARRANTY_SOON_DAYS} days`, 'warn'], ['ended', 'Ended', 'bad']].map(([k, l, c]) => `<button class="item ${st.warranty===k?'sel':''}" data-warranty="${k}"><span class="dot ${c}"></span><span class="lbl">${l}</span><span class="cnt">${cnt(o => warrantyState(o) === k)}</span></button>`).join('');
  /* Lansweeper: devices it has not scanned for three months, to be checked by hand. Shown while Lansweeper is in use. */
  const nOld = LS_USED() ? cnt(o => scanOld(o)) : 0;
  $('#chkHdr').hidden = $('#chkList').hidden = !LS_USED();
  $('#chkList').innerHTML = LS_USED() ? `<button class="item ${st.scanOld?'sel':''}" data-scanold="1" title="Lansweeper has not scanned them for over 3 months"><span class="dot warn"></span><span class="lbl">Check by hand</span><span class="cnt">${nOld}</span></button>` : '';
  /* Duplicates, whatever found them: a second record by DNS name (Lansweeper, e.g. a docking station), more than one record
     in Entra, and a Graph record that fits two devices here. Each is listed only when it has devices; the group only when
     one is. */
  const dups = [
    ['twins', 'By DNS name', 'Named by a DNS name, with no serial number, beside a device of that name: most likely a second record of it, e.g. from a docking station', o => !!twinOf(o), st.twins, () => LS_ON()],
    ['duplicates', 'More than one in Entra', GRAPH_TIPS.duplicates, GRAPH_FILTERS.duplicates[2], st.intune === 'duplicates', () => SYNC.graph],
    ['ambiguous', 'Name or serial used twice', GRAPH_TIPS.ambiguous, GRAPH_FILTERS.ambiguous[2], st.intune === 'ambiguous', () => SYNC.graph],
  ].map(([k, l, tip, f, on, live]) => [k, l, tip, live() ? cnt(f) : 0, on]).filter(([, , , n, on]) => n || on);
  $('#dupHdr').hidden = $('#dupList').hidden = !dups.length;
  $('#dupList').innerHTML = dups.map(([k, l, tip, n, on]) => `<button class="item ${on ? 'sel' : ''}" ${k === 'twins' ? 'data-twins="1"' : `data-intune="${k}"`} title="${esc(tip)}"><span class="dot warn"></span><span class="lbl">${l}</span><span class="cnt">${n}</span></button>`).join('');
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
    const head = join && !joinHead ? (joinHead = true, '<div class="side-sub">Joined</div>') : '';
    return `${head}<button class="item ${st.intune === k ? 'sel' : ''}" data-intune="${k}" title="${esc(join ? JOIN_INFO[l === 'AD joined only' ? 'AD joined' : l] || GRAPH_TIPS[k] : GRAPH_TIPS[k] || l)}">${join ? `<span class="dot jdot j-${k}"></span>` : `<span class="dot ${c}"></span>`}<span class="lbl">${l}</span><span class="cnt">${n}</span></button>`;
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
  $('#statList').innerHTML = (st.live ? `<button class="item sel" data-live title="Retired devices are left out, as on the Overview. Click to show them too"><span class="dot"></span><span class="lbl">Not retired</span><span class="cnt">${cnt(o => o.status !== 'retired')}</span><span aria-hidden="true">×</span></button>` : '') + Object.entries(STATUS).map(([k,v]) => `<button class="item ${st.status===k?'sel':''}" data-status="${k}"><span class="dot ${k==='active'?'':k==='retired'?'gone':'off'}"></span><span class="lbl">${esc(v.label)}</span><span class="cnt">${cnt(o=>o.status===k)}</span></button>`).join('');
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
  const scope = !list || !st.scope ? '' : `<span class="fb-scope">${st.scope === 'ignored' ? `${pool} ignored ${pool === 1 ? 'device' : 'devices'}: kept out of the inventory and every sync`
    : `${pool} ${pool === 1 ? 'device' : 'devices'} waiting for review${st.rvSrc ? ` (found by ${esc(REVIEW_SRC[st.rvSrc] || st.rvSrc)})` : ''}: not in the inventory yet`}</span><button type="button" class="fb-clear" data-fx="scope">Back to inventory</button>`;
  /* A person's devices: who they are, and what is done with their devices when they come or go, in one place. */
  const mine = person ? objs.filter(o => o.uid === person.id && o.status !== 'retired') : [];
  const who = !list || !person ? '' : `<div class="fb-person"><b>${esc(person.name)}</b>${person.active === false ? ' <span class="chip warn">left</span>' : ''}<span class="muted">${esc([person.dept, `${mine.length} ${mine.length === 1 ? 'device' : 'devices'}`].filter(Boolean).join(' · '))}</span>
    <span class="grow"></span>${SERVER.on && mine.length ? `<a class="btnlike" href="api/reports/handback?id=${encodeURIComponent(person.id)}&format=pdf" download title="The devices ${esc(person.name)} has, as a PDF to tick off when they are handed back">Hand-back list</a>` : ''}${SERVER.on && isAdmin() ? '<button type="button" data-pact="sheet" title="Print the devices handed out and, if wanted, a new initial password">Entry sheet…</button>' : ''}${isAdmin() ? '<button type="button" data-pact="give" title="Give them devices from the stock">Hand out a device…</button>' : ''}${isAdmin() && mine.length ? `<button type="button" data-pact="back" title="All of them in stock, nobody assigned (with Undo)">Take all back</button>` : ''}</div>`;
  /* Values set by hand in one field: given back to the sources, which write them again at their next sync. */
  const hf = list && st.handField && isAdmin() ? `<div class="fb-person fb-qfix"><b>Set by hand: ${esc(SYNC_FIELD_LABEL[st.handField] || st.handField)}</b><span class="muted">no source changes these; given back, the sources write them again at their next sync.</span><span class="grow"></span><button type="button" data-handback="1">Give all back to the sources</button></div>` : '';
  const qf = st.tab === 'table' && QFIX && QUALITY_FIX[st.quality] && QUALITY[st.quality];
  const qbar = !qf ? '' : `<div class="fb-person fb-qfix"><b>${esc(QUALITY[st.quality][0])}</b><span class="muted">${esc(QUALITY_FIX[st.quality][2])}.</span><span class="grow"></span>${QUALITY_FIX[st.quality][1] && isAdmin() ? `<button type="button" data-qfix="1" id="qfixSel">Select all ${QFIX.n}</button>` : ''}</div>`;
  bar.hidden = !chips.length && !scope && !who && !qbar && !hf;
  bar.innerHTML = who + qbar + hf + scope + (chips.length ? `<span class="fb-l">Showing only</span>${chips.map(([k, l, v]) => `<button type="button" class="fchip" data-fx="${k}" title="Take this filter off"><span>${l ? `${esc(l)}: ` : ''}<b>${esc(v)}</b></span><span class="x" aria-hidden="true">×</span></button>`).join('')}${chips.length > 1 ? '<button type="button" class="fb-clear" data-fx="all">Clear all</button>' : ''}` : '');
}
$('#fbar').addEventListener('click', e => {
  if (e.target.closest('[data-qfix]')){ if (QFIX) QFIX.select(); return; }
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
  return `<div class="empty">Nothing matches “${esc(q)}” within ${esc(within)}. ${all.length === 1 ? `1 device outside ${st.type ? 'this type' : 'these filters'} does: <b>${esc(all[0].name)}</b>` : `${all.length} devices outside ${st.type ? 'this type' : 'these filters'} do`}. <button class="primary" id="searchAllBtn">Search all devices</button></div>`;
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
function emptyHtml(){
  const n = REVIEW.filter(o => !o.review.ignored).length;
  return n ? `<div class="empty">No devices in the inventory yet, but <b>${n}</b> found by the syncs ${n === 1 ? 'waits' : 'wait'} in To review. <button type="button" class="primary" data-tab-go="review">Open To review</button></div>`
    : `<div class="empty">The inventory is empty.${isAdmin() ? ' <button type="button" class="primary" data-empty-new>New device</button>' : ''}</div>`;
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
  tb.insertAdjacentHTML('afterbegin', `<span class="vswitch" role="group" aria-label="${TAB_GROUPS[g][0]}">${m.map(id => `<button type="button" class="${id === st.tab ? 'on' : ''}" aria-pressed="${id === st.tab}" data-vsw="${id}">${FIXED_TABS[id]}</button>`).join('')}</span>`);
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
    return `<span class="tab objtab ${st.tab===id?'active':''}" draggable="true" data-tab="${id}" role="button" tabindex="0"><span class="tsw" style="background:${tcol(o.type)}"></span><span class="mono" title="${esc(o.name)}">${esc(o.name)}</span><span class="x" data-close="${id}" title="Close (middle-click also closes)">×</span></span>`;
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
  tabMenu.innerHTML = `<button data-a="close">Close tab</button><button data-a="others" ${others ? '' : 'disabled'}>Close other tabs</button><button data-a="all">Close all tabs</button>`;
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
  purpose: ['Description', o => esc(o.purpose || '')],
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
  /* Every card says the same thing the same way: when it was last seen (amber when long ago), or that it never was.
     Lansweeper's "check by hand" is the hint on a date it gave. */
  const s = lastSeenOf(o);
  if (s) return scanOld(o) && s.src === 'Lansweeper' ? seenChip(o).replace(/title="[^"]*"/, `title="Lansweeper last scanned it on ${esc(dayText(s.day))}. Check by hand that it is still there and in use."`) : seenChip(o);
  if (o.review || o.feed || o.inAd || o.graph) return `<span class="chip warn lsst seen" title="${scanOld(o) ? 'Lansweeper has tried to scan it but never has. Check by hand that it is there.' : 'No source has a date it was last seen.'}">Never seen</span>`;
  return (syncOf(o) || {}).k === 'manual' ? '' : syncChip(o);
};
export function cardHtml(o, idx, join = showJoin()){
  const rs = relsOf(o, idx);
  const lines = cardLines(o.type).map(k => cardLine(o, k, idx));
  const s = STATUS[o.status];
  const picked = !!(st.bulk && st.bulk.has(o.id)), stale = !!o.review && reviewStale(o);
  return `<button class="card${picked ? ' picked' : ''}${stale ? ' stale' : ''}" data-open="${esc(o.id)}" aria-pressed="${!!picked}"${o.review ? ` aria-label="${esc(o.name)}: waiting in To review"` : ''}><span class="cardtick" title="Select (or Ctrl+click the card; Shift+click picks a range)" aria-hidden="true"></span>
    <div class="ch">${tico(o.type)}<div class="hd"><span class="nmrow"><span class="nm">${esc(o.name)}</span>${markHtml(o)}</span><span class="model">${esc(o.model)}</span></div>
      ${o.status !== 'active' ? `<span class="chip ${s.cls}">${s.label}</span>` : ''}</div>
    <dl class="kv">${lines.map(([k,v]) => `<dt>${esc(k) || '&nbsp;'}</dt><dd${v ? '' : ' class="none"'}>${v || (k ? '—' : '&nbsp;')}</dd>`).join('')}</dl>
    ${join ? joinBadges(o) : ''}
    ${o.review && !o.review.ignored && isAdmin() ? `<span class="rv-acts"><span role="button" tabindex="0" class="rv-act yes" data-rvc="accept" data-rvid="${esc(o.id)}" title="Take it into the inventory">✓ Accept</span>${mergeTarget(o) ? `<span role="button" tabindex="0" class="rv-act" data-rvc="merge" data-rvid="${esc(o.id)}" title="Fold it into ${esc(mergeTarget(o).name)}; it is kept as ignored">Merge</span>` : ''}<span role="button" tabindex="0" class="rv-act no" data-rvc="ignore" data-rvid="${esc(o.id)}" title="Keep it out of the inventory and every sync">✕ Ignore</span></span>` : ''}
    ${o.review ? reviewChips(o, stale) : twinOf(o) ? `<div class="rv-chips">${twinChip(o)}</div>` : twinsOf(o).length ? `<div class="rv-chips">${twinsChip(o)}</div>` : ''}
    <div class="cf"><span class="code">${esc(o.code)}</span>${cardSeen(o)}${join && GRAPH_TYPES.includes(o.type) ? '' : graphChip(o)}<span class="grow"></span>${relSummary(rs)}</div>
  </button>`;
}
/* On a device waiting in To review: which sync found it, Old when no source has seen it for long (left out of Accept
   all), the other sources that know it, and the device it is most likely a second record of. */
const alsoIn = o => [o.review.src !== 'lansweeper' && o.feed && 'Lansweeper', o.review.src !== 'ad' && o.inAd && 'AD', o.review.src !== 'graph' && o.graph && 'Entra', o.defender && 'Defender'].filter(Boolean);
const reviewChips = (o, stale) => `<div class="rv-chips"><span class="chip rv-src">${esc(REVIEW_SRC[o.review.src] || o.review.src)}</span>${alsoIn(o).length ? `<span class="chip rv-also" title="Other sources that know this device: one the directory knows is most likely real">also ${esc(alsoIn(o).join(' · '))}</span>` : ''}${stale ? `<span class="chip warn rv-old" title="No source has seen it for ${REVIEW_STALE_DAYS} days or more: likely gone">Old</span>` : ''}${twinOf(o) ? twinChip(o) : mergeTarget(o) ? `<span class="chip warn rv-twin"${isAdmin() ? ` data-resolve="${esc(o.id)}" role="button"` : ''} title="A device of this name or serial number is in the inventory: accepting this one adds a second.${isAdmin() ? ' Click to resolve.' : ''}">Already in inventory: ${esc(mergeTarget(o).name)}</span>` : ''}</div>`;
/* On the card of a probable second record: which device it most likely is; a click opens Resolve (15-review.js). */
/* On the card of the device itself: its probable second records, so it is seen from both sides. */
const twinsChip = o => { const l = twinsOf(o); return `<span class="chip warn rv-twin"${isAdmin() ? ` data-resolve="${esc(l.map(x => x.id).join(','))}" role="button"` : ''} title="Most likely a second record of this device, e.g. from a docking station: ${esc(l.map(x => x.name).join(', '))}.${isAdmin() ? ' Click to resolve.' : ''}">${l.length === 1 ? `Also as ${esc(l[0].name)}` : `${l.length} possible duplicates`}</span>`; };
const twinChip = o => `<span class="chip warn rv-twin"${isAdmin() ? ` data-resolve="${esc(o.id)}" role="button"` : ''} title="Probably a second record of ${esc(twinOf(o).name)}: it has a DNS name and no serial number, as a docking station or USB network adapter leaves in Lansweeper.${isAdmin() ? ' Click to resolve it.' : ''}">Probably ${esc(twinOf(o).name)}</span>`;
/* In To review (st.scope): Accept or Ignore the picked devices (Back to review when ignored ones are shown), or, with
   none picked and allAlso, every one shown; Accept all leaves out the old ones, which are accepted one by one. */
function scopeActs(list, allAlso){
  if (!st.scope || !isAdmin()) return '';
  const n = st.bulk.size, ign = st.scope === 'ignored';
  /* Ignored ones: Unignore puts them back in To review; Accept takes them straight into the inventory (not a record merged
     into a device: that one is unmerged first, by Unignore). */
  const mergedIn = ign && [...st.bulk].map(byId).some(o => o && o.review && o.review.merged);
  if (n) return ign ? `<button id="rvRestore" title="Take ${n === 1 ? 'it' : 'them'} off the ignored list: ${n === 1 ? 'it waits' : 'they wait'} in To review again${mergedIn ? '; a merged record leaves its device' : ''}">Unignore ${n}</button>${mergedIn ? '' : `<button id="rvAccept" class="primary" title="Unignore and take ${n === 1 ? 'it' : 'them'} into the inventory">Accept ${n}</button>`}`
    : `<button id="rvAccept" class="primary">Accept ${n}</button><button id="rvIgnore" class="danger-text">Ignore ${n}</button>`;
  if (!allAlso || !list.length) return '';
  const fresh = list.filter(o => !reviewStale(o)).length;
  return ign ? `<button id="rvRestoreAll" title="Take every ignored device shown off the list: they wait in To review again">Unignore all ${list.length}</button>`
    : `<button id="rvIgnoreAll" class="danger-text">Ignore all ${list.length}</button><button id="rvAcceptAll" class="primary" title="${fresh === list.length || !fresh ? '' : `Devices no source has seen for ${REVIEW_STALE_DAYS} days are left out unless you tick them in the next step`}">Accept ${fresh === list.length ? `all ${fresh}` : fresh ? `${fresh} recently seen` : `all ${list.length} old`}</button>`;
}
/* Resolve: the picked records that are most likely a device the inventory has (a dock's DNS-named record, or one of the
   same name or serial number): say what they are, all at once; see 15-review.js. */
const mergeable = () => [...(st.bulk || [])].map(byId).filter(o => o && dupOf(o));
function mergeBtn(){
  if (!isAdmin()) return '';
  const m = mergeable().length;
  return m ? `<button id="rvResolve" title="Say what ${m === 1 ? 'it is' : 'they are'}: a dock's record, the same device, obsolete or no duplicate">Resolve ${m}…</button>` : '';
}
function bindScopeActs(list){
  const on = (id, f) => { const b = $('#' + id); if (b) b.onclick = f; };
  on('rvResolve', () => resolveModal(mergeable()));
  const picked = kind => () => { const l = [...st.bulk].map(byId).filter(o => o && o.review); if (kind !== 'accept') st.bulk.clear(); reviewDo(kind, l); };
  on('rvAccept', picked('accept')); on('rvIgnore', picked('ignore')); on('rvRestore', picked('restore'));
  const fresh = list.filter(o => !reviewStale(o)), old = list.length - fresh.length;
  /* Accept all takes the recently seen ones; the old ones (likely gone) only when ticked here. With only old ones shown,
     it says so instead. */
  on('rvAcceptAll', () => {
    let withOld = !fresh.length;
    confirmModal('Accept devices', fresh.length
      ? `Add the ${fresh.length} recently seen ${fresh.length === 1 ? 'device' : 'devices'} shown to the inventory?${old ? `<label class="pchk cf-old"><input type="checkbox" id="cfOld"> Also add the ${old} that no source has seen for ${REVIEW_STALE_DAYS} days (likely gone)</label>` : ''}`
      : `None of the ${list.length} ${list.length === 1 ? 'device' : 'devices'} shown has been seen by any source for ${REVIEW_STALE_DAYS} days: ${list.length === 1 ? 'it is' : 'they are'} likely gone. Add ${list.length === 1 ? 'it' : 'them'} to the inventory anyway?`,
      'Accept', () => reviewDo('accept', withOld ? list : fresh), { primary: true });
    const cb = $('#cfOld'), ok = $('#cfOk');
    const label = () => { ok.textContent = `Accept ${withOld ? list.length : fresh.length}`; };
    label();
    if (cb) cb.onchange = () => { withOld = cb.checked; label(); };
  });
  on('rvIgnoreAll', () => confirmModal('Ignore devices', `Ignore the ${list.length} ${list.length === 1 ? 'device' : 'devices'} shown? No sync brings them back; you can bring them back from Ignored.`, 'Ignore', () => reviewDo('ignore', list)));
  on('rvRestoreAll', () => reviewDo('restore', list));
}
/* How many cards or table rows are drawn before "Show all". */
export const SHOW_FIRST = 500;
export function renderCardsBody(){
  let list = filtered();
  const pool = scopePool();
  $('#toolbar').innerHTML = `<span class="muted">${list.length} of ${pool.length} ${st.scope === 'review' ? 'waiting' : st.scope ? 'ignored' : 'objects'}</span><span class="tbsep"></span>
    <label class="muted" for="grp">Group by</label><select id="grp"><option value="none">Nothing</option><option value="type">Type</option><option value="loc">Location</option><option value="user">User</option></select>
    ${st.cardsGroup !== 'none' ? '<button id="grpAll">Collapse all</button><button id="grpNone">Expand all</button>' : ''}
    ${joinCardsAvailable() ? `<span class="tbsep"></span><label class="pchk" title="Show on computers and phones whether they are in Active Directory, Microsoft Entra ID (Azure AD) and Intune"><input type="checkbox" id="cardJoin" ${cardJoin ? 'checked' : ''}> Show directory status</label>` : ''}
    <div class="grow"></div>${pickBar(list)}`;
  bindScopeActs(list);
  $('#grp').value = st.cardsGroup;
  $('#grp').onchange = e => { st.cardsGroup = e.target.value; view(); };
  const cj = $('#cardJoin');
  if (cj) cj.onchange = () => { cardJoin = cj.checked; try { localStorage.setItem('ni-card-join', cardJoin ? '1' : '0'); } catch { /* not kept */ } renderCards(); };
  if (!list.length){
    $('#view').innerHTML = pool.length
      ? hiddenHits() || (st.q.trim() ? `<div class="empty">Nothing matches “${esc(st.q.trim())}”. <button class="primary" id="newFromSearch">Create “${esc(st.q.trim())}” as a new device</button></div>` : `<div class="empty">Nothing matches these filters. <a class="link" id="clr2">Clear filters</a></div>`)
      : st.scope ? `<div class="empty">${st.scope === 'ignored' ? 'No ignored devices.' : 'Nothing waits for review. New devices from Lansweeper, Active Directory, Entra and Intune show up here.'} <button type="button" data-fx-go="scope">Back to inventory</button></div>`
      : (SERVER.on && !st.meId ? `<div class="empty">Sign in to see the inventory.</div>` : emptyHtml());
    const bk = $('[data-fx-go]'); if (bk) bk.onclick = () => { st.scope = null; st.rvSrc = ''; st.rvKnown = false; st.rvOld = false; st.bulk = new Set(); view(); };
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

export function renderCards(){ st.bulk = pickedInPool(); renderCardsBody(); addSearchHits(); bindPickBar(); }
/* Cards picked (the same choice as the Table's ticks): open them all as tabs, or go on in the Table, where the picked
   rows can be moved, given a status or a responsible together. */
function pickBar(list){
  const n = (st.bulk || new Set()).size;
  /* The picked devices' actions on a row of their own, always in one order: count, the To review actions, Resolve, the rest. */
  return n ? `<div class="pickrow"><b class="pick-n">${n} selected</b>${scopeActs(list)}${mergeBtn()}<button id="cdOpen" title="Open each as a tab">Open in tabs</button>${st.scope ? '' : '<button id="cdTable" title="The Table shows the same selection, with actions for all of them">Edit in Table</button>'}<button id="cdClear">Clear selection</button></div>`
    : '<span class="muted hide-n">Click a card to open it · Ctrl+click or its corner selects several · Ctrl+A all</span>' + scopeActs(list, true);
}
/* The picked devices that are still among those shown (the inventory, or To review): a pick does not reach across. */
const pickedInPool = () => { const ids = new Set(scopePool().map(o => o.id)); return new Set([...(st.bulk || [])].filter(id => ids.has(id))); };
function bindPickBar(){
  const o = $('#cdOpen'); if (o) o.onclick = () => openObjs([...st.bulk]);
  const t = $('#cdTable'); if (t) t.onclick = () => { st.tab = 'table'; view(); };
  const c = $('#cdClear'); if (c) c.onclick = () => { st.bulk.clear(); keepScroll(renderCards); };
}
/* Several objects at once, each in its own tab; the first is shown. A very long pick opens its first 30. */
export function openObjs(ids){
  const list = ids.filter(byId).slice(0, 30);
  if (!list.length) return;
  for (const id of list) if (!st.open.includes(id)){ st.open.push(id); st.tabIds.push(id); }
  if (ids.length > list.length) toast(`The first ${list.length} of ${ids.length} are open: the tab bar holds no more at once.`);
  openObj(list[0]);
}
/* A redraw that leaves the list where it was scrolled to. */
export const keepScroll = draw => { const v = $('#view'), y = v ? v.scrollTop : 0; draw(); const w = $('#view'); if (w) w.scrollTop = y; };
/* Picking cards (also of To review): Ctrl (⌘) + click or the tick in a card's corner picks one or takes it back;
   Shift + click picks every card from the last one picked to this one. A plain click still opens the card. */
let lastPick = null;
document.addEventListener('click', e => {
  const card = e.target.closest && e.target.closest('#view .card[data-open]'); if (!card || e.target.closest('[data-rvc]')) return;
  const tick = e.target.closest('.cardtick');
  if (!tick && !e.ctrlKey && !e.metaKey && !e.shiftKey) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const id = card.dataset.open, set = (st.bulk ??= new Set());
  if (e.shiftKey && lastPick && lastPick !== id){
    const ids = [...$('#view').querySelectorAll('.card[data-open]')].map(c => c.dataset.open), a = ids.indexOf(lastPick), b = ids.indexOf(id);
    if (a >= 0 && b >= 0) ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => set.add(x)); else set.add(id);
  } else if (set.has(id)) set.delete(id); else set.add(id);
  lastPick = id;
  keepScroll(renderCards);
}, true);
/* Accept, Merge and Ignore on a card in To review act on it straight away, without opening it. */
const rvAct = e => {
  const c = e.target.closest && e.target.closest('#view [data-rvc]'); if (!c) return false;
  e.preventDefault(); e.stopImmediatePropagation();
  const o = byId(c.dataset.rvid); if (o) reviewDo(c.dataset.rvc, [o]);
  return true;
};
document.addEventListener('click', rvAct, true);
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('#view [data-rvc]')) rvAct(e); }, true);
/* The "Probably …" chip on a card opens Resolve instead of the card. */
document.addEventListener('click', e => {
  const c = e.target.closest && e.target.closest('#view [data-resolve]'); if (!c) return;
  e.preventDefault(); e.stopImmediatePropagation();
  resolveModal(c.dataset.resolve.split(',').map(byId).filter(Boolean));
}, true);
/* Ctrl (⌘) + A in Cards or the Table picks every device shown (in the Table, the rows its column filters leave); Escape
   takes the pick back. Not while typing or in a dialog, where they keep their usual meaning. */
document.addEventListener('keydown', e => {
  if (!['cards', 'table'].includes(st.tab) || $('#mdl') || (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]'))) return;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'a'){
    e.preventDefault();
    /* In the Table the same as its select-all box: every row its filters leave, also those past the first drawn. */
    if (st.tab === 'table'){ const all = $('#selAll'); if (all && !all.checked) all.click(); return; }
    st.bulk = new Set(filtered().map(o => o.id));
    keepScroll(renderCards);
  } else if (e.key === 'Escape' && st.bulk && st.bulk.size){
    st.bulk.clear(); keepScroll(st.tab === 'table' ? renderTable : renderCards);
  }
});
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
  /* Replacement planning: when it was bought, the year it is due (and why), and what replacing it costs. */
  {k:'purchased', w:130, label:'Purchased', cell: o => `<td>${o.purchased ? esc(dayText(o.purchased)) : ''}</td>`},
  {k:'due', w:200, label:'Due for replacement', cell: o => { const d = dueOf(o, st.lifecycle); return `<td>${d ? `${d.year} <span class="muted">· ${d.from === 'purchase' ? 'by purchase' : 'warranty ends'}</span>` : ''}</td>`; }},
  {k:'replPrice', w:150, label:'Replacement price', cell: o => { const p = lifeOf(st.lifecycle, o.type).price; return `<td class="n">${p ? money(p) : ''}</td>`; }},
  /* The maintenance due next: its date first, so the column sorts by it. */
  {k:'maint', w:240, label:'Next maintenance', cell: o => { const m = nextTask(o); return `<td>${m ? `${esc(dayText(m.due))} <span class="muted">· ${esc(m.what)}</span>` : ''}</td>`; }},
  {k:'secureBoot', w:120, label:'Secure Boot', cell: o => `<td>${o.graph && !o.graph.gone && o.graph.secureBoot ? (o.graph.secureBoot === 'on' ? 'On' : '<span class="wty soon">Off</span>') : ''}</td>`},
  {k:'price', w:110, label:'Price', cell: o => `<td class="n">${typeof o.price === 'number' ? money(o.price) : ''}</td>`},
  {k:'supplier', w:160, label:'Supplier', cell: o => `<td>${esc(o.supplier || '')}</td>`},
  {k:'invoice', w:130, label:'Invoice', cell: o => `<td class="n">${esc(o.invoice || '')}</td>`},
  {k:'purpose', w:180, label:'Description', cell: o => `<td>${esc(o.purpose || '')}</td>`},
  {k:'conn', w:190, label:'Connected to', cell: (o, idx) => { const up = (idx ? idx.get(o.id) || [] : rels).find(r => r.from === o.id && ['connected','uplink'].includes(r.kind)); const t = up && byId(up.to);
    return `<td class="n">${t ? esc(t.name) + (up.port != null ? ' · ' + esc(portLabel(t, up.port)) : '') : ''}</td>`; }},
  {k:'urls', w:200, label:'Links', cell: o => `<td>${(o.urls || []).map(l => `<a class="lnk" href="${esc(linkHref(l.url))}" target="_blank" rel="noopener noreferrer" title="${esc(l.url)}">${esc(l.label || linkKind(l.url))}</a>`).join(' · ')}</td>`},
  {k:'resp', w:200, label:'Responsible', cell: o => `<td>${esc(respText(o))}</td>`},
  {k:'status', w:110, label:'Status', cell: o => `<td>${STATUS[o.status].label}</td>`},
  /* The date first, so the column sorts by it. */
  {k:'seen', w:190, label:'Last seen', cell: o => { const s = lastSeenOf(o); return `<td>${s ? `<span class="${s.days > GRAPH_STALE_DAYS ? 'wty soon' : ''}" title="Last seen ${esc(s.at)} by ${esc(s.src)}">${esc(dayText(s.day))}</span> <span class="muted">· ${esc(s.src)}</span>` : ''}</td>`; }},
  {k:'ls', w:240, label:'Lansweeper', cell: o => `<td>${scanOld(o) ? scanChip(o) : syncChip(o) || '—'}</td>`},
  /* In To review only, and last, so the other columns keep their places: which sync found it, and which others know it. */
  {k:'found', w:220, label:'Found by', cell: o => `<td>${o.review ? esc([REVIEW_SRC[o.review.src] || o.review.src, ...(alsoIn(o).length ? [`also ${alsoIn(o).join(' · ')}`] : [])].join(' · ')) : ''}</td>`}
];
/* The Lansweeper column is left out while Lansweeper is off; Found by shows only in To review. */
export const tableCols = () => TABLE_COLS.filter(c => (c.k !== 'ls' || LS_USED()) && (c.k !== 'found' || st.scope));
/* Rack is hidden until it is wanted: most devices do not go in a rack. */
export const DEFAULT_HIDDEN_COLS = ['rack', 'price', 'supplier', 'invoice', 'resp', 'urls', 'purchased', 'due', 'replPrice', 'maint', 'secureBoot'];
/* Columns added after a browser kept its choice: hidden there too until they are picked. */
const LATER_COLS = {2: ['price', 'supplier', 'invoice'], 3: ['resp'], 4: ['urls'], 5: ['purchased', 'due', 'replPrice'], 6: ['maint'], 7: ['secureBoot']};
export function hiddenCols(){
  if (!st.hiddenCols){
    try {
      st.hiddenCols = JSON.parse(localStorage.getItem('ni-hidden-cols')) || DEFAULT_HIDDEN_COLS;
      const seen = +localStorage.getItem('ni-cols-v') || 1;
      for (const [v, cols] of Object.entries(LATER_COLS)) if (seen < +v) st.hiddenCols = [...new Set([...st.hiddenCols, ...cols])];
      localStorage.setItem('ni-cols-v', '7');
    } catch { st.hiddenCols = DEFAULT_HIDDEN_COLS; }
  }
  return st.hiddenCols;
}
export function setHiddenCols(list){
  st.hiddenCols = list;
  try { localStorage.setItem('ni-hidden-cols', JSON.stringify(list)); } catch { /* Browser storage can be blocked (a private window): then the choice is simply not kept. */ }
}
/* Column sets for the usual jobs, and each column on its own under Choose columns (kept open while the menu is). */
const COL_PRESETS = {
  basic: ['Basic', ['code', 'type', 'model', 'serial', 'loc', 'user', 'status']],
  network: ['Network', ['type', 'ip', 'mac', 'loc', 'conn', 'status', 'seen']],
  lifecycle: ['Lifecycle', ['type', 'model', 'purchased', 'warranty', 'due', 'replPrice', 'maint', 'status']],
  costs: ['Costs', ['type', 'price', 'supplier', 'invoice', 'purchased', 'replPrice', 'resp']],
};
let colPickOpen = false;
const presetOn = (shown, hidden) => tableCols().filter(c => !c.fixed).every(c => shown.includes(c.k) !== hidden.includes(c.k));
export function columnsMenu(){
  const hidden = hiddenCols();
  return menuHtml('Columns', `
    <div class="colpresets" role="group" aria-label="Column sets">${Object.entries(COL_PRESETS).map(([k, [l, shown]]) => `<button type="button" data-colpreset="${k}" class="${presetOn(shown, hidden) ? 'on' : ''}" aria-pressed="${presetOn(shown, hidden)}">${l}</button>`).join('')}</div>
    <details class="colpick" id="colPick" ${colPickOpen ? 'open' : ''}><summary>Choose columns…</summary><div class="colpick-list">${tableCols().map(c => `<label style="display:flex;gap:6px;align-items:center;white-space:nowrap"><input type="checkbox" data-col="${c.k}" ${c.fixed ? 'disabled' : ''} ${c.fixed || !hidden.includes(c.k) ? 'checked' : ''}> ${c.label}</label>`).join('')}</div></details>`, { id: 'colMenu', boxCls: 'colmenu' });
}

/* A field's cell says where its value came from in its hover text (the device page shows it as a mark). */
const SOURCE_COLS = new Set([...Object.keys(FIELD_LABEL), 'serial']);
const withSource = (o, c, html) => {
  if (!SOURCE_COLS.has(c.k) || /^<td[^>]*title=/.test(html)) return html;
  const t = sourceText(o, c.k);
  return t ? html.replace(/^<td/, `<td title="${esc(t)}"`) : html;
};
/* Listed by a data-quality check, the Table helps fix it: the column the check is about comes next to Name (shown even
   when hidden), and a bar offers to select them all for the bulk action that fixes it. [column, bulk control, what to do] */
const QUALITY_FIX = {
  noloc: ['loc', 'bkAct', 'select them and move them to their location'],
  noresp: ['resp', 'bkAct', 'select them and set their responsible'],
  noserial: ['serial', null, 'open each and add its serial number'],
  nouser: ['user', 'bkAct', 'give each its user, or select them and set them to In stock'],
  unseen: ['seen', 'bkAct', 'check where they are; select the ones gone and set them to Retired'],
  unconfirmed: ['loc', null, 'find them in the next stocktake, or confirm each on its page'],
  leaver: ['user', 'bkAct', 'select them and take them back into stock, or give them to someone else'],
  addisabled: ['status', 'bkAct', 'select the ones no longer used and set their status'],
  ownerdiff: ['user', null, 'open each and give it to the right person'],
  conflict: [null, null, 'open each and pick the value to keep'],
  reported: [null, null, 'open each, look at the problem and mark it as done'],
};
/* The bar of a data-quality check over the Table (drawn with the filters, like a person's bar): set by renderTable. */
let QFIX = null;
export function renderTable(){
  let list = filtered();
  const colOpen = !!$('#colMenu .menubox:popover-open');
  st.bulk = pickedInPool();
  const n = st.bulk.size;
  $('#toolbar').innerHTML = `<span class="muted" id="tblCount">${list.length} ${list.length === 1 ? 'row' : 'rows'}</span><span class="tbsep"></span>
    ${columnsMenu()}<button id="csvBtn"><svg class="i" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg>Export CSV</button>${isAdmin() ? '<button id="csvImp">Import CSV…</button>' : ''}${st.scope || !SERVER.on ? '' : '<button id="rpBtn" title="The inventory or lifecycle report, of the devices listed here if filtered">Report…</button>'}${!n && st.scope ? `<span class="grow"></span>${scopeActs(list, true)}` : ''}${n && st.scope ? `<div class="pickrow"><b class="pick-n">${n} selected</b>${scopeActs(list)}${mergeBtn()}<button id="bkOpen" title="Open each as a tab">Open in tabs</button><button id="bkClear">Clear selection</button></div>` : ''}
${n && !st.scope ? `<div class="pickrow"><b class="pick-n">${n} selected</b>${mergeBtn()}<select id="bkAct" aria-label="Do with the selected"><option value="">Actions…</option><option value="open">Open in tabs</option>${isAdmin() ? '<option value="handout">Hand out to a person…</option>' : ''}
${isAdmin() ? `<optgroup label="Move to location">${LOCS.map(l => `<option value="loc:${esc(l)}">${esc(l)}</option>`).join('')}</optgroup>
<optgroup label="Set status">${Object.entries(STATUS).map(([k, v]) => `<option value="status:${k}">${v.label}</option>`).join('')}<option value="status:__back">Take back into stock (no user)</option></optgroup>
${CONTACTS.list.length && isAdmin() ? Object.entries(CONTACT_KINDS).map(([k, l]) => `<optgroup label="${l} responsible">${CONTACTS.list.filter(c => c.kind === k).sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="resp:${k}:${esc(c.id)}">${esc(contactLabel(c))}</option>`).join('')}<option value="resp:${k}:">— no ${l.toLowerCase()} responsible</option></optgroup>`).join('') : ''}` : ''}</select><button id="bkClear">Clear selection</button></div>` : ''}`;
  if (colOpen) $('#colMenu .menubox').showPopover();
  bindScopeActs(list);
  const cp = $('#colPick'); if (cp) cp.ontoggle = () => { colPickOpen = cp.open; };
  $('#toolbar').querySelectorAll('[data-colpreset]').forEach(b => b.onclick = () => {
    const shown = COL_PRESETS[b.dataset.colpreset][1];
    setHiddenCols(tableCols().filter(c => !c.fixed && !shown.includes(c.k)).map(c => c.k));
    /* A set is a whole choice: the menu closes on it, so the table (and a selection bar under it) shows. */
    $('#colMenu .menubox').hidePopover(); renderTable();
  });
  $('#toolbar').querySelectorAll('[data-col]').forEach(c => c.onchange = () => {
    const k = c.dataset.col, hidden = hiddenCols();
    setHiddenCols(c.checked ? hidden.filter(x => x !== k) : [...hidden, k]);
    renderTable();
  });
  $('#csvBtn').onclick = () => exportCsv(list);
  const imp = $('#csvImp'); if (imp) imp.onclick = importCsvModal;
  const rb = $('#rpBtn'); if (rb) rb.onclick = () => reportsModal({ ids: leftFilters() || st.q.trim() || Object.values(tv.filters || {}).some(v => String(v || '').trim()) ? list.map(o => o.id) : null });
  /* A move by hand, as on the device's page: the location is kept from then on, so the next sync does not move it back. */
  const bulkLoc = to => {
    const snap = snapshot([...st.bulk].map(byId));
    let moved = 0;
    st.bulk.forEach(id => {
      const o = byId(id); if (!o || o.loc === to) return;
      moved++;
      if (feedLinked(o) || (o.graph && o.graph.added)) pickHand(o, 'loc');
      o.loc = to; markHand(o, 'loc'); o.handAt = new Date().toISOString();
      hist(o, now(), 'Moved to ' + to + ' (bulk)');
    });
    toastUndo(moved === n ? `${n} moved to ${to}` : `${moved} moved to ${to}; ${n - moved} already there`, () => { restoreSnapshot(snap, 'Bulk move undone'); render(); }); renderTable(); render();
  };
  const bulkStatus = v => {
    /* Take back: the same dialog as on a device or a person (where they go, with the store room proposed). */
    if (v === '__back'){ takeBackModal([...st.bulk].map(byId).filter(Boolean)); return; }
    const to = v;
    const snap = snapshot([...st.bulk].map(byId));
    st.bulk.forEach(id => { const o = byId(id); o.status = to; hist(o, now(), 'Status set to ' + STATUS[to].label + ' (bulk)'); });
    toastUndo(n + ' set to ' + STATUS[to].label, () => { restoreSnapshot(snap, 'Bulk status undone'); render(); }); renderTable(); render(); };
  /* Internal or external responsible for every selected device; each device that changes gets a history line. */
  const bulkResp = v => {
    const [kind, id] = v.split(':'); if (!kind) return;
    let changed = 0;
    const snap = snapshot([...st.bulk].map(byId));
    st.bulk.forEach(x => { const o = byId(x); if (o && setResponsible(o, kind, id)) changed++; });
    toastUndo(`${CONTACT_KINDS[kind]} responsible ${id ? 'set' : 'removed'} on ${changed} ${changed === 1 ? 'device' : 'devices'}`, () => { restoreSnapshot(snap, 'Responsible change undone'); render(); }); renderTable(); render();
  };
  const bc = $('#bkClear'); if (bc) bc.onclick = () => { st.bulk.clear(); renderTable(); };
  /* All the listed devices (those past the first rows drawn too), then the control that fixes them has the focus. */
  const bo = $('#bkOpen'); if (bo) bo.onclick = () => openObjs([...st.bulk]);
  /* One menu for what is done with the selected: open them, move them, set their status or responsible. */
  const ba = $('#bkAct'); if (ba) ba.onchange = () => {
    const v = ba.value, at = v.indexOf(':'), what = at < 0 ? v : v.slice(0, at), arg = v.slice(at + 1); ba.value = '';
    if (what === 'open') openObjs([...st.bulk]); else if (what === 'handout') handOutModal([...st.bulk]); else if (what === 'loc') bulkLoc(arg); else if (what === 'status') bulkStatus(arg); else if (what === 'resp') bulkResp(arg);
  };
  const idx = relIndex();   /* one index of the relations for all rows */
  let shown = tableCols().filter(c => c.fixed || !hiddenCols().includes(c.k));
  /* A data-quality check's column, or the columns a list from the Overview asks for (the replacement plan: purchase,
     due year, price), go right after Name while it is listed. */
  const fix = !st.scope && st.quality && QUALITY_FIX[st.quality];
  const after = fix && fix[0] ? [fix[0]] : !st.scope && st.ids && Array.isArray(st.ids.cols) ? st.ids.cols : [];
  const laid = !!fix || after.length > 0;
  if (after.length){
    const cs = after.map(k => tableCols().find(x => x.k === k)).filter(Boolean), at = shown.findIndex(x => x.k === 'name') + 1;
    shown = [...shown.slice(0, at).filter(x => !cs.includes(x)), ...cs, ...shown.slice(at).filter(x => !cs.includes(x))];
  }
  /* The column filters and the sort apply to the devices, before anything is drawn: by the text each cell shows, as
     the table showed it. Column 0 is the tick box; column k is shown[k - 1]. */
  /* The Table listed by a data-quality check is laid out for it for a while: the layout from before (order, widths,
     filters) is kept aside and comes back once the check is no longer listed, so the moved column does not stay. */
  const KEEP = 'view:table:0:keep';
  if (laid && !TBL[KEEP]) TBL[KEEP] = TBL['view:table:0'] ? JSON.parse(JSON.stringify(TBL['view:table:0'])) : { none: true };
  else if (!laid && TBL[KEEP]) { if (TBL[KEEP].none) delete TBL['view:table:0']; else TBL['view:table:0'] = TBL[KEEP]; delete TBL[KEEP]; saveTBL(); }
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
  /* A column order of one's own: the column of the data-quality check still goes right after Name. */
  if (after.length && Array.isArray(tv.order)){
    let prev = keys.indexOf('name') + 1;
    for (const k of after.filter(x => keys.includes(x))){
      const ci = keys.indexOf(k) + 1;
      tv.order = tv.order.filter(x => x !== ci); tv.order.splice(tv.order.indexOf(prev) + 1, 0, ci); prev = ci;
    }
  }
  const textOf = html => html.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, m => ({'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'"})[m]).trim();
  const colOf = ci => shown[ci - 1];
  for (const [ci, q] of Object.entries(tv.filters || {})) {
    const c = colOf(+ci), want = String(q || '').trim().toLowerCase();
    if (c && want) list = list.filter(o => textOf(c.cell(o, idx)).toLowerCase().includes(want));
  }
  const sc = tv.sort && colOf(tv.sort.ci);
  if (sc) { const key = new Map(list.map(o => [o, textOf(sc.cell(o, idx))])); list = [...list].sort((a, b) => tv.sort.dir * cmpCells(key.get(a), key.get(b))); }
  /* Thousands of rows take seconds to lay out: the first ones are drawn, the rest on request. */
  $('#tblCount').textContent = `${list.length} ${list.length === 1 ? 'row' : 'rows'}`;
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
  QFIX = !n && fix && list.length ? { n: list.length, select: () => { list.forEach(o => st.bulk.add(o.id)); renderTable(); const c = $('#' + fix[1]); if (c) c.focus(); } } : null;
  renderFilterBar();
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
  toast(`Exported ${list.length} ${list.length === 1 ? 'row' : 'rows'}`);
}
/* The columns a CSV row can update on a device already here, with their names for the preview and the history. */
const CSV_FIELDS = ['loc', 'model', 'serial', 'ip', 'mac', 'user'];
const CSV_LABEL = { loc: 'Location', model: 'Model', serial: 'Serial number', ip: 'IP address', mac: 'MAC address', user: 'User' };
export function importCsvModal(){
  modal(`<div class="mh">Import devices from CSV</div>
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

export * from './views-map.js';
export * from './views-ports.js';
