/* Cards: the device cards, their lines and chips, and the Cards view (split out of 02-views.js, which re-exports it). */
import { respText } from './11-contacts.js';
import { linkKind } from './links.js';
import { listCount, evEl, twinsOf, scopePool, REVIEW_SRC, REVIEW_STALE_DAYS, twinOf, lastSeenOf, seenChip, GRAPH_TYPES, joinBadges, SYNC, scanOld, relIndex, FIELD_LAYOUT, warrantyState, dayText, graphChip, isAttached, markHtml, handHtml, syncOf, TYPE_FIELDS, hasPorts, $, LOCS, STATUS, TYPES, byId, esc, filtered, objs, relsOf, st, syncChip, tico, used } from './01-core.js';
import { SERVER, view } from './07-render.js';
import { newObjModal } from './05-new-object.js';
import { USERS, isAdmin, showDevicesOf } from './04-settings.js';
import { mergeTarget, resolveModal, reviewDo, reviewStale } from './15-review.js';
import { emptyHtml, hiddenHits, bindHiddenHits } from './02-views.js';
import { pickBar, bindScopeActs, pickedInPool, bindPickBar } from './views-bulk.js';
import { bindSaveView, saveViewBtn } from './views-saved.js';
import { html, rawHtml } from './html.js';
/* ---------- cards ---------- */
/* Network and attached relations are counted apart: a PC with a monitor is not a PC with more network links. */
export function relSummary(rs){
  const net = rs.filter(x => !isAttached(x.r.kind)).length, att = rs.length - net;
  return [net ? net + (net === 1 ? ' relation' : ' relations') : '', att ? att + ' attached' : ''].filter(Boolean).join(' · ');
}
/* What a card line can show: its label, and the value for a device ('' when the device has none). */
const mono = v => v ? String(html`<span class="mono">${String(v)}</span>`) : '';
export const CARD_FIELDS = {
  ip: ['IP', o => mono(o.ip)],
  mac: ['MAC', o => mono(o.mac)],
  user: ['User', o => esc(o.user || '')],
  loc: ['Location', o => esc((o.loc || '').replace(' / ', ' · '))],
  warranty: ['Warranty', o => { const w = warrantyState(o); return w ? String(html`<span class="wty ${w}">${w === 'ended' ? 'ended ' : 'ends '}${dayText(o.warranty)}</span>`) : ''; }],
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
  if (s) return scanOld(o) && s.src === 'Lansweeper' ? seenChip(o).replace(/title="[^"]*"/, () => String(html`title="Lansweeper last scanned it on ${dayText(s.day)}. Check by hand that it is still there and in use."`)) : seenChip(o);
  if (o.review || o.feed || o.inAd || o.graph) return `<span class="chip warn lsst seen" title="${scanOld(o) ? 'Lansweeper has tried to scan it but never has. Check by hand that it is there.' : 'No source has a date it was last seen.'}">Never seen</span>`;
  return (syncOf(o) || {}).k === 'manual' ? '' : syncChip(o);
};
/* One device's card as HTML text: name, model, status, its type's lines, the join marks when join is on, the To review
   actions and chips, and a footer with code, last seen and relations. idx: the relation index (relIndex). */
export function cardHtml(o, idx, join = showJoin()){
  const rs = relsOf(o, idx);
  const lines = cardLines(o.type).map(k => cardLine(o, k, idx));
  const s = STATUS[o.status];
  const picked = !!(st.bulk && st.bulk.has(o.id)), stale = !!o.review && reviewStale(o);
  return String(html`<button class="card${picked ? ' picked' : ''}${stale ? ' stale' : ''}" data-open="${o.id}" aria-pressed="${String(picked)}"${o.review ? html` aria-label="${o.name}: waiting in To review"` : ''}><span class="cardtick" title="Select (or Ctrl+click the card; Shift+click picks a range)" aria-hidden="true"></span>
    <div class="ch">${rawHtml(tico(o.type))}<div class="hd"><span class="nmrow"><span class="nm">${o.name}</span>${rawHtml(markHtml(o, false))}</span><span class="model">${o.model}</span></div>
      ${o.status !== 'active' ? html`<span class="chip ${s.cls}">${s.label}</span>` : ''}</div>
    <dl class="kv">${lines.map(([k,v]) => html`<dt>${k || rawHtml('&nbsp;')}</dt><dd${v ? '' : html` class="none"`}>${v ? rawHtml(v) : k ? '-' : rawHtml('&nbsp;')}</dd>`)}</dl>
    ${join ? rawHtml(joinBadges(o)) : ''}
    ${o.review ? reviewChips(o, stale) : twinOf(o) ? html`<div class="rv-chips">${twinChip(o)}</div>` : twinsOf(o).length ? html`<div class="rv-chips">${twinsChip(o)}</div>` : ''}
    ${o.review && !o.review.ignored && isAdmin() ? html`<span class="rv-acts"><span role="button" tabindex="0" class="rv-act yes" data-rvc="accept" data-rvid="${o.id}" title="Take it into the inventory">✓ Accept</span>${mergeTarget(o) ? html`<span role="button" tabindex="0" class="rv-act" data-rvc="merge" data-rvid="${o.id}" title="Fold it into ${mergeTarget(o).name}; it is kept as ignored">Merge</span>` : ''}<span role="button" tabindex="0" class="rv-act no" data-rvc="ignore" data-rvid="${o.id}" title="Keep it out of the inventory and every sync">✕ Ignore</span></span>` : ''}
    <div class="cf"><span class="code">${o.code}</span>${rawHtml(cardSeen(o))}${rawHtml(handHtml(o))}${join && GRAPH_TYPES.includes(o.type) ? '' : rawHtml(graphChip(o))}<span class="grow"></span>${relSummary(rs)}</div>
  </button>`);
}
/* On a device waiting in To review: which sync found it, Old when no source has seen it for long (left out of Accept
   all), the other sources that know it, and the device it is most likely a second record of. */
export const alsoIn = o => [o.review.src !== 'lansweeper' && o.feed && 'Lansweeper', o.review.src !== 'ad' && o.inAd && 'AD', o.review.src !== 'graph' && o.graph && 'Entra', o.defender && 'Defender'].filter(Boolean);
/* Where it came from is a quiet line of text (the directory bar above already shows each source); only what needs a
   look (Old, a likely second record) is a coloured chip, at the end of the line. */
const reviewChips = (o, stale) => html`<div class="rv-chips"><span class="rv-from">Found by <b>${REVIEW_SRC[o.review.src] || o.review.src}</b>${alsoIn(o).length ? html`<span class="rv-also" title="Other sources that know this device: one the directory knows is most likely real"> · also in ${alsoIn(o).join(', ')}</span>` : ''}</span>${stale ? html`<span class="chip warn rv-old" title="No source has seen it for ${REVIEW_STALE_DAYS} days or more: likely gone">Old</span>` : ''}${twinOf(o) ? twinChip(o) : mergeTarget(o) ? html`<span class="chip warn rv-twin"${isAdmin() ? html` data-resolve="${o.id}" role="button"` : ''} title="A device of this name or serial number is in the inventory: accepting this one adds a second.${isAdmin() ? ' Click to resolve.' : ''}">Already in inventory: ${mergeTarget(o).name}</span>` : ''}</div>`;
/* On the card of a probable second record: which device it most likely is; a click opens Resolve (15-review.js). */
/* On the card of the device itself: its probable second records, so it is seen from both sides. */
const twinsChip = o => { const l = twinsOf(o); return html`<span class="chip warn rv-twin"${isAdmin() ? html` data-resolve="${l.map(x => x.id).join(',')}" role="button"` : ''} title="Most likely a second record of this device, e.g. from a docking station: ${l.map(x => x.name).join(', ')}.${isAdmin() ? ' Click to resolve.' : ''}">${l.length === 1 ? html`Also as ${l[0].name}` : `${l.length} possible duplicates`}</span>`; };
const twinChip = o => html`<span class="chip warn rv-twin"${isAdmin() ? html` data-resolve="${o.id}" role="button"` : ''} title="Probably a second record of ${twinOf(o).name}: it has a DNS name and no serial number, as a docking station or USB network adapter leaves in Lansweeper.${isAdmin() ? ' Click to resolve it.' : ''}">Probably ${twinOf(o).name}</span>`;
/* How many cards or table rows are drawn before "Show all". */
export const SHOW_FIRST = 500;
/* Draws the Cards toolbar (count, Group by, the join marks, Save view, the pick bar) and the cards, in one list or in
   groups that fold. The first SHOW_FIRST are drawn, the rest after Show all. An empty list says why. */
export function renderCardsBody(){
  let list = filtered();
  const pool = scopePool();
  $('#toolbar').innerHTML = html`<span class="muted">${listCount(list.length, pool.length)}</span><span class="tbsep"></span>
    <span class="tb-grp"><label class="muted" for="grp">Group by</label><select id="grp"><option value="none">Nothing</option><option value="type">Type</option><option value="loc">Location</option><option value="user">User</option></select></span>
    ${st.cardsGroup !== 'none' ? html`<button id="grpAll">Collapse all</button><button id="grpNone">Expand all</button>` : ''}
    ${joinCardsAvailable() ? html`<span class="tbsep"></span><label class="pchk" title="Show on computers and phones whether they are in Active Directory, Microsoft Entra ID (Azure AD) and Intune"><input type="checkbox" id="cardJoin" ${cardJoin ? 'checked' : ''}> Show directory status</label>` : ''}
    ${saveViewBtn() ? html`<span class="tbsep"></span>${rawHtml(saveViewBtn())}` : ''}<div class="grow"></div>${rawHtml(pickBar(list))}`;
  bindScopeActs(list); bindSaveView();
  $('#grp').value = st.cardsGroup;
  $('#grp').onchange = e => { st.cardsGroup = e.target.value; view(); };
  const cj = $('#cardJoin');
  if (cj) cj.onchange = () => { cardJoin = cj.checked; try { localStorage.setItem('ni-card-join', cardJoin ? '1' : '0'); } catch { /* not kept */ } renderCards(); };
  if (!list.length){
    $('#view').innerHTML = pool.length
      ? hiddenHits() || (st.q.trim() ? html`<div class="empty">Nothing matches “${st.q.trim()}”. <button class="primary" id="newFromSearch">Create “${st.q.trim()}” as a new device</button></div>` : html`<div class="empty">Nothing matches these filters. <a class="link" id="clr2">Clear filters</a></div>`)
      : st.scope ? html`<div class="empty">${st.scope === 'ignored' ? 'No ignored devices.' : 'Nothing waits for review. New devices from Lansweeper, Active Directory, Entra and Intune show up here.'} <button type="button" data-fx-go="scope">Back to inventory</button></div>`
      : (SERVER.on && !st.meId ? html`<div class="empty">Sign in to see the inventory.</div>` : emptyHtml());
    const bk = $('[data-fx-go]'); if (bk) bk.onclick = () => { st.scope = null; st.rvSrc = ''; st.rvKnown = false; st.rvOld = false; st.bulk = new Set(); view(); };
    const c2 = $('#clr2'); if (c2) c2.onclick = () => $('#clearF').click();
    const nfs = $('#newFromSearch'); if (nfs) nfs.onclick = () => newObjModal({name: st.q.trim()});
    bindHiddenHits();
    return;
  }
  const idx = relIndex(), join = showJoin(), card = o => cardHtml(o, idx, join);
  /* Thousands of cards take long to draw: the first ones are drawn, the rest on request. A search or a filter narrows it. */
  const cut = !st.cardsAll && list.length > SHOW_FIRST + 100;
  const more = cut ? html`<div class="more-rows"><span class="muted">Showing the first ${SHOW_FIRST} of ${list.length}. Search or filter to narrow them down.</span><button id="cardsAll">Show all ${list.length}</button></div>` : '';
  const bindMore = () => { const b = $('#cardsAll'); if (b) b.onclick = () => { st.cardsAll = true; renderCards(); }; };
  if (cut) list = list.slice(0, SHOW_FIRST);
  if (st.cardsGroup === 'none'){ $('#view').innerHTML = html`<div id="cards">${list.map(o => rawHtml(card(o)))}</div>${more}`; bindMore(); return; }
  const key = st.cardsGroup === 'type' ? o => TYPES[o.type].label : st.cardsGroup === 'user' ? o => o.user || 'No user' : o => o.loc || 'No location';
  /* The group of devices without a user or location comes last. */
  const none = g => g === 'No user' || g === 'No location';
  const groups = [...new Set(list.map(key))].sort((a, b) => none(a) ? 1 : none(b) ? -1 : a.localeCompare(b));
  st.groupsClosed ??= {};
  $('#view').innerHTML = groups.map(g => {
    const closed = !!st.groupsClosed[st.cardsGroup + ':' + g], items = list.filter(o => key(o) === g);
    return html`<section class="grp${closed ? ' collapsed' : ''}"><div class="hdr sechdr grphdr" role="button" tabindex="0" aria-expanded="${String(!closed)}" data-grp="${g}" style="position:sticky;top:0;z-index:2">${g} <span class="muted">${items.length}</span></div><div id="cards">${items.map(o => rawHtml(card(o)))}</div></section>`;
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
/* Accept, Merge and Ignore on a card in To review act on it straight away, without opening it. */
const rvAct = e => {
  const c = e.target.closest && e.target.closest('#view [data-rvc]'); if (!c) return false;
  e.preventDefault(); e.stopImmediatePropagation();
  const o = byId(c.dataset.rvid); if (o) reviewDo(c.dataset.rvc, [o]);
  return true;
};
document.addEventListener('click', rvAct, true);
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && evEl(e).matches && evEl(e).matches('#view [data-rvc]')) rvAct(e); }, true);
/* The "Probably …" chip on a card opens Resolve instead of the card. */
document.addEventListener('click', e => {
  const c = evEl(e).closest && evEl(e).closest('#view [data-resolve]'); if (!c) return;
  e.preventDefault(); e.stopImmediatePropagation();
  resolveModal(c.dataset.resolve.split(',').map(byId).filter(Boolean));
}, true);
/* When the search matches a person or a place, those come first as buttons. */
export function addSearchHits(){
  const q = st.q.trim().toLowerCase(); if (!q) return;
  const people = USERS.filter(u => [u.name, u.login, u.dept].some(v => v && v.toLowerCase().includes(q)));
  const locs = LOCS.filter(l => l.toLowerCase().includes(q));
  if (!people.length && !locs.length) return;
  /* Counted in one pass over the devices: a search that matches many people must not go through them once per person. */
  const count = new Map();
  for (const o of objs) if (o.user) count.set(o.user, (count.get(o.user) || 0) + 1);
  $('#view').insertAdjacentHTML('afterbegin', html`<div class="hits">${people.map(u => html`<button class="chip info" data-person="${u.name}">${u.name} · ${count.get(u.name) || 0} devices</button>`)}${locs.map(l => html`<button class="chip ls" data-loc="${l}">${l}</button>`)}</div>`);
  $('#view').querySelectorAll('[data-person]').forEach(b => b.onclick = () => showDevicesOf(b.dataset.person));
  $('#view').querySelectorAll('[data-loc]').forEach(b => b.onclick = () => { st.loc = b.dataset.loc; st.q = ''; view(); });
}

