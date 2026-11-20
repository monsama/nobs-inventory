/* Cards: the device cards, their lines and chips, and the Cards view (split out of 02-views.js, which re-exports it). */
import { respText } from './11-contacts.js';
import { linkKind } from './links.js';
import { REVIEW, addedTime, listCount, evEl, twinsOf, scopePool, REVIEW_SRC, REVIEW_STALE_DAYS, twinOf, lastSeenOf, GRAPH_STALE_DAYS, GRAPH_TYPES, joinBadges, SYNC, scanOld, relIndex, FIELD_LAYOUT, warrantyState, dayText, agoText, COMPLIANCE, isAttached, markHtml, handHtml, TYPE_FIELDS, hasPorts, $, LOCS, STATUS, TYPES, byId, esc, filtered, objs, relsOf, st, syncChip, tico, used, noMatchHtml } from './01-core.js';
import { SERVER, view, viewSig } from './07-render.js';
import { newObjModal } from './05-new-object.js';
import { USERS, isAdmin, showDevicesOf } from './04-settings.js';
import { mergeTarget, resolveModal, reviewDo, reviewStale, waitReason } from './15-review.js';
import { emptyHtml, hiddenHits, bindHiddenHits } from './02-views.js';
import { pickBar, bindScopeActs, pickedInPool, bindPickBar } from './views-bulk.js';
import { bindSaveView, saveViewBtn } from './views-saved.js';
import { bindPrintMenu, printMenuHtml } from './print-view.js';
import { html, rawHtml } from './html.js';
import { quickEditBtn } from './quick-edit.js';
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
  /* A device attached to another (a monitor to its PC) with no user or location of its own shows the host's, marked so. */
  user: ['User', (o, idx) => o.user ? esc(o.user) : viaHost(o, idx, h => h.user)],
  loc: ['Location', (o, idx) => o.loc ? esc(o.loc.replace(' / ', ' · ')) : viaHost(o, idx, h => h.loc && h.loc.replace(' / ', ' · '))],
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
/* The device o is attached to (attached to: a monitor to its PC), when it is one; the host a virtual machine runs on. */
const hostOf = (o, idx) => { const x = relsOf(o, idx).find(y => y.out && isAttached(y.r.kind)); return x && x.other; };
const runsOn = (o, idx) => { const x = relsOf(o, idx).find(y => y.out && y.r.kind === 'hosted'); return x && x.other; };
const viaHost = (o, idx, f) => { const h = hostOf(o, idx), v = h && f(h); return v ? String(html`${v} <span class="via" title="From ${h.name}, the device it is attached to">via ${h.name}</span>`) : ''; };
/* The list's Detail column: the one column whose content depends on the type, so the other columns mean the same on
   every row (Name, User, Location, IP, Last seen). The OS on computers and phones, the model on the rest. Settings ->
   Device types can change it per type (FIELD_LAYOUT[type].detail). */
export const DETAIL_DEFAULTS = {
  pc: 'os', notebook: 'os', server: 'os', vm: 'os', android: 'os', ios: 'os', mobile: 'os',
  storage: 'cap', rack: 'units',
};
export const detailOf = type => { const d = (FIELD_LAYOUT[type] || {}).detail; return typeof d === 'string' && d ? d : DETAIL_DEFAULTS[type] || 'model'; };
/* A field's label and value: a built-in one (CARD_FIELDS), or a field the type has (custom.<key>). '' when the device has none. */
export function cardLine(o, key, idx){
  if (key.startsWith('custom.')){
    const f = (TYPE_FIELDS[o.type] || []).find(x => x.key === key.slice(7)), v = (o.custom || {})[key.slice(7)];
    return [f ? f.label : key.slice(7), v != null && v !== '' ? esc(String(v)) : ''];
  }
  const c = CARD_FIELDS[key];
  return c ? [c[0], c[1](o, idx)] : ['', ''];
}
/* Whether the list shows AD, Entra and Intune (joinBadges) as a column of its own: off unless this person turns it on
   (it is on every computer's page anyway, under Directory). Kept in this browser. */
export const joinCardsAvailable = () => SYNC.graph || objs.some(o => o.inAd);
let cardJoin = false;
try { cardJoin = localStorage.getItem('ni-card-join') === '1'; } catch { /* Browser storage can be blocked (a private window): then the choice is simply not kept. */ }
export const showJoin = () => cardJoin && joinCardsAvailable();
/* Intune's word on the device only when something is wrong (not compliant, grace period, conflict). */
const graphProblem = o => {
  if (!SYNC.graph || !o.graph || o.graph.gone) return '';
  const c = COMPLIANCE[o.graph.compliance];
  return c && c[0] !== 'ok' ? String(html`<span class="chip ${c[0]}" title="Intune: ${c[1]}">${c[1]}</span>`) : '';
};
/* Last seen, as a few words: today, yesterday, 12 days ago, or the date; amber after 30 days, "Never" for a device a
   source knows but none has a date for. The title says when exactly and which source. */
const seenCell = o => {
  const s = lastSeenOf(o);
  if (s){
    const when = agoText(s.day);
    const hint = scanOld(o) && s.src === 'Lansweeper' ? `Lansweeper last scanned it on ${dayText(s.day)}. Check by hand that it is still there and in use.` : `Last seen ${s.at} by ${s.src}`;
    return html`<span class="seen lsst${s.days > GRAPH_STALE_DAYS ? ' warn' : ''}" title="${hint}">${when}</span>`;
  }
  if (o.review || o.feed || o.inAd || o.graph) return html`<span class="seen lsst warn" title="${scanOld(o) ? 'Lansweeper has tried to scan it but never has. Check by hand that it is there.' : 'No source has a date it was last seen.'}">Never</span>`;
  return html`<span class="seen lsst"></span>`;
};
/* At most two chips on a row, then +N with the rest in its title: what needs a look first (amber), then the rest. */
const MAX_CHIPS = 2;
const chipsCell = list => {
  const shown = list.slice(0, MAX_CHIPS), rest = list.slice(MAX_CHIPS);
  const text = h => String(h).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  return rawHtml(shown.join('') + (rest.length ? String(html`<span class="chip more" title="${rest.map(text).join(' · ')}">+${rest.length}</span>`) : ''));
};
/* Who has it: the user; else, on a device attached to another (a monitor), the host's user; else the responsible
   (a server, a switch: shared devices have one), in grey. */
const userCell = (o, idx) => {
  if (o.user) return html`<span class="c-user">${o.user}</span>`;
  const h = hostOf(o, idx);
  if (h && h.user) return html`<span class="c-user" title="From ${h.name}, the device it is attached to">${h.user}</span>`;
  const r = respText(o);
  return html`<span class="c-user resp" title="${r ? 'Responsible' : ''}">${r}</span>`;
};
/* Where it is: its location; else its host's (a monitor on a PC, marked in the chips); a virtual machine "on" its host. */
const locCell = (o, idx) => {
  if (o.loc) return html`<span class="c-loc" title="${o.loc}">${o.loc}</span>`;
  const h = hostOf(o, idx);
  if (h && h.loc) return html`<span class="c-loc" title="${h.loc}, from ${h.name}">${h.loc}</span>`;
  const r = runsOn(o, idx);
  return r ? html`<span class="c-loc sub">on ${r.name}</span>` : html`<span class="c-loc"></span>`;
};
/* The state of a row as two small icons in fixed places, so they line up down the list and are never cut: the status
   when it is not In use (In stock, Retired), then an ended warranty. The words are in the tooltip and read out. */
const ST_ICON = {
  stock: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  retired: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9"/><path d="M10 13h4"/>',
  wty: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M5 5l14 14"/>',
};
/* The word is kept beside the icon for paper (the printed list shows it, the screen does not). */
const stIcon = (k, cls, label, word) => html`<span class="st-ico ${cls}" role="img" aria-label="${label}" title="${label}">${rawHtml(`<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ST_ICON[k]}</svg>`)}<span class="st-txt" aria-hidden="true">${word}</span></span>`;
function stateIcons(o){
  const s = STATUS[o.status];
  const hasSt = o.status !== 'active' && !!s, hasW = warrantyState(o) === 'ended';
  /* Nothing to say: no cell at all, so the row stays as short as it can (on a phone the chips take a line of their own). */
  if (!hasSt && !hasW) return '';
  const st = hasSt ? stIcon(o.status === 'retired' ? 'retired' : 'stock', o.status, s.label, s.label) : html`<span class="st-ico"></span>`;
  const w = hasW ? stIcon('wty', 'wty-ended', `Warranty ended on ${dayText(o.warranty)}`, 'Warranty ended') : html`<span class="st-ico"></span>`;
  return html`<span class="c-st">${st}${w}</span>`;
}
/* The chips of an inventory row, in order of what needs a look. */
function rowChips(o, idx){
  const out = [];
  if (o.excluded || o.detached) out.push(syncChip(o));
  if (twinOf(o)) out.push(String(twinChip(o))); else if (twinsOf(o).length) out.push(String(twinsChip(o)));
  const gp = graphProblem(o); if (gp) out.push(gp);
  const h = hostOf(o, idx); if (h && ((!o.user && h.user) || (!o.loc && h.loc))) out.push(String(html`<span class="chip via" title="User and location come from ${h.name}, the device it is attached to">via ${h.name}</span>`));
  if ((['switch', 'patch', 'router', 'firewall'].includes(o.type) || hasPorts(o)) && (+o.ports || +o.sfp)){ const pt = cardLine(o, 'ports', idx)[1]; if (pt) out.push(String(html`<span class="chip">${pt}</span>`)); }
  if (o.handAt && Date.parse(o.handAt) > SYNC.time) out.push(handHtml(o));
  return out;
}
/* The headings of the list: each sorts by its column, a second click turns the order. [key, label, sort key]. */
/* [sort key, label, the class of the column's cells]: a heading and its cells share the class, so a column left out on a
   narrow screen goes with its heading. */
const HEADS = [['name', 'Name', 'c-name'], ['user', 'User', 'c-user'], ['loc', 'Location', 'c-loc'], ['ip', 'IP', 'c-ip'], ['detail', 'Detail', 'c-det'], ['', '', 'c-chips'], ['seen', 'Last seen', 'seen']];
const PEND_HEADS = [['name', 'Name', 'c-name'], ['user', 'User', 'c-user'], ['loc', 'Location', 'c-loc'], ['ip', 'IP', 'c-ip'], ['src', 'Found by', 'c-src'], ['', 'Why it waits', 'c-chips'], ['seen', 'Last seen', 'seen'], ['', '', 'rv-acts']];
export function listHead(pend = false, join = showJoin()){
  const cell = ([k, l, c]) => k ? html`<span class="${c}"><button type="button" class="lh-sort${cardSort.k === k ? ' on' : ''}" data-csort="${k}" title="Sort by ${l.toLowerCase()}" aria-label="${`Sort by ${l.toLowerCase()}` + (cardSort.k === k ? (cardSort.dir === 1 ? ', now ascending' : ', now descending') : '')}">${l}${cardSort.k === k ? rawHtml(sortIcon(cardSort.dir)) : ''}</button></span>` : html`<span class="${c}">${l}</span>`;
  const picking = !!(st.bulk && st.bulk.size);
  return html`<div class="lhead"><span><button type="button" class="cardtick all${picking ? ' some' : ''}" data-pickall="1" aria-pressed="${picking ? 'mixed' : 'false'}" title="${picking ? 'Clear the selection' : 'Select every device shown'}" aria-label="${picking ? 'Clear the selection' : 'Select every device shown'}"></button></span><span></span>${(pend ? PEND_HEADS : join ? [...HEADS.slice(0, 5), ['', 'Directory', 'c-dir'], ...HEADS.slice(5)] : HEADS).map(cell)}</div>`;
}
/* One device as a row of the list, as HTML text: tick, type, name with its inventory number, user, location, IP, the
   type's detail, chips and last seen. A device waiting in Pending devices shows which source found it, why it waits
   and the actions instead of the detail. idx: the relation index (relIndex). */
export function cardHtml(o, idx, join = showJoin()){
  const picked = !!(st.bulk && st.bulk.has(o.id)), stale = !!o.review && reviewStale(o);
  const t = TYPES[o.type] || { label: o.type };
  const [dl, dv] = cardLine(o, detailOf(o.type), idx);
  const tip = [o.purpose, o.serial && 'Serial number ' + o.serial, o.model && o.model].filter(Boolean).join(' · ');
  /* Every row has two lines: the name, and under it, quieter, the description; a device without one shows its serial
   number there instead (in the code font). The rows are all as tall; a name with nothing under it sits in the middle. */
  const purpose = String(o.purpose || '').trim(), alt = !purpose && o.serial ? `Serial number ${o.serial}` : '';
  const desc = purpose || alt;
  const name = html`<span class="c-name has-desc${desc ? '' : ' nodesc'}"><span class="c-nl"><button type="button" class="nm card-open" data-open="${o.id}" title="${tip || 'Open ' + o.name}">${o.name}</button>${rawHtml(markHtml(o, false))}${o.code && !o.review ? html`<small class="code">${o.code}</small>` : ''}</span>${desc ? html`<span class="c-desc${alt ? ' alt' : ''}" title="${desc}">${purpose || html`<span class="mono">${o.serial}</span>`}</span>` : ''}</span>`;
  const head = html`<button type="button" class="cardtick" title="Select (Shift + click selects a range)" aria-pressed="${String(picked)}" aria-label="${`Select ${o.name}`}"></button><span class="c-ico" title="${t.label}">${rawHtml(tico(o.type))}</span>${name}${userCell(o, idx)}${locCell(o, idx)}<span class="c-ip mono">${o.ip || ''}</span>`;
  if (o.review){
    const why = !o.review.ignored && waitReason(o).text;
    const chips = [stale ? String(html`<span class="chip warn rv-old" title="No source has seen it for ${REVIEW_STALE_DAYS} days or more: likely gone">Old</span>`) : '',
      twinOf(o) ? String(twinChip(o)) : mergeTarget(o) ? String(html`<span class="chip warn rv-twin"${isAdmin() ? html` data-resolve="${o.id}" role="button"` : ''} title="A device of this name or serial number is in the inventory: accepting this one adds a second.${isAdmin() ? ' Click to resolve.' : ''}">Already in inventory: ${mergeTarget(o).name}</span>`) : ''].filter(Boolean);
    const acts = o.review.ignored || !isAdmin() ? '' : mergeTarget(o)
      ? html`<button type="button" class="rv-act yes" data-rvc="merge" data-rvid="${o.id}" title="Fold it into ${mergeTarget(o).name}; it is kept as ignored">Merge</button><button type="button" class="rv-act" data-rvc="accept" data-rvid="${o.id}" title="Take it into the inventory as a device of its own">Accept</button>`
      : html`<button type="button" class="rv-act yes" data-rvc="accept" data-rvid="${o.id}" title="Take it into the inventory">✓ Accept</button>`;
    return String(html`<article class="card lrow${picked ? ' picked' : ''}${stale ? ' stale' : ''}" data-open="${o.id}" aria-label="${`${o.name}: pending`}">${head}<span class="c-src rv-from" title="${alsoIn(o).length ? 'Also in ' + alsoIn(o).join(', ') : ''}">${REVIEW_SRC[o.review.src] || o.review.src}${alsoIn(o).length ? html`<span class="rv-also"> +${alsoIn(o).length}</span>` : ''}</span><span class="c-chips rv-chips">${why ? html`<span class="rv-why" title="${why}">${why}</span>` : ''}${chipsCell(chips)}</span>${seenCell(o)}<span class="rv-acts">${acts}${o.review.ignored || !isAdmin() ? '' : html`<button type="button" class="rv-act no" data-rvc="ignore" data-rvid="${o.id}" title="Keep it out of the inventory and every sync">✕ Ignore</button>`}</span></article>`);
  }
  return String(html`<article class="card lrow${picked ? ' picked' : ''}" data-open="${o.id}" aria-label="${o.name}">${head}<span class="c-det" title="${dv ? dl : ''}">${dv ? rawHtml(dv) : ''}</span>${join ? html`<span class="c-dir">${GRAPH_TYPES.includes(o.type) ? rawHtml(joinBadges(o)) : ''}</span>` : ''}<span class="c-chips">${stateIcons(o)}${chipsCell(rowChips(o, idx))}</span>${seenCell(o)}${rawHtml(quickEditBtn(o))}</article>`);
}
/* On a device waiting in Pending devices: the other sources that know it. */
export const alsoIn = o => [o.review.src !== 'lansweeper' && o.feed && 'Lansweeper', o.review.src !== 'ad' && o.inAd && 'AD', o.review.src !== 'graph' && o.graph && 'Entra', o.defender && 'Defender'].filter(Boolean);
/* On the row of a probable second record: which device it most likely is; a click opens Resolve (15-review.js). */
/* On the row of the device itself: its probable second records, so it is seen from both sides. */
const twinsChip = o => { const l = twinsOf(o); return html`<span class="chip rv-twin"${isAdmin() ? html` data-resolve="${l.map(x => x.id).join(',')}" role="button"` : ''} title="Most likely a second record of this device, e.g. from a docking station: ${l.map(x => x.name).join(', ')}.${isAdmin() ? ' Click to resolve.' : ''}">${l.length === 1 ? html`Also as ${l[0].name}` : `${l.length} possible duplicates`}</span>`; };
const twinChip = o => html`<span class="chip rv-twin"${isAdmin() ? html` data-resolve="${o.id}" role="button"` : ''} title="Probably a second record of ${twinOf(o).name}: it has a DNS name and no serial number, as a docking station or USB network adapter leaves in Lansweeper.${isAdmin() ? ' Click to resolve it.' : ''}">Probably ${twinOf(o).name}</span>`;
/* Sort by, for the cards: [label, value of a card, direction it starts in]. Default keeps the list's own order (the
   inventory as kept; pending devices the most recently seen first). Cards without a value go last, either way. Kept per
   browser, like the other view choices here. */
const CARD_SORTS = {
  '': ['Default', null, 1],
  name: ['Name', o => o.name, 1],
  added: ['Date added', o => addedTime(o) || null, -1],
  seen: ['Last seen', o => { const s = lastSeenOf(o); return s ? s.day : null; }, -1],
  type: ['Type', o => TYPES[o.type] ? TYPES[o.type].label : o.type, 1],
  loc: ['Location', o => o.loc || null, 1],
  user: ['User', o => o.user || null, 1],
  warranty: ['Warranty end', o => /^\d{4}-\d{2}-\d{2}$/.test(o.warranty || '') ? o.warranty : null, 1],
  code: ['Inventory code', o => o.code || null, 1],
  /* An address sorts by its numbers: 10.0.0.9 before 10.0.0.10. */
  ip: ['IP', o => /^\d{1,3}(\.\d{1,3}){3}$/.test(o.ip || '') ? o.ip.split('.').reduce((n, x) => n * 256 + +x, 0) : null, 1],
  detail: ['Detail', o => String(cardLine(o, detailOf(o.type))[1] || '').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') || null, 1],
  src: ['Found by', o => o.review ? REVIEW_SRC[o.review.src] || o.review.src : null, 1],
};
/* A heading sorts by its column; the same heading again turns the order, a third time back to the list's own order. */
export function sortBy(k){
  if (!(k in CARD_SORTS)) return;
  cardSort = cardSort.k !== k ? { k, dir: CARD_SORTS[k][2] } : cardSort.dir === CARD_SORTS[k][2] ? { k, dir: -cardSort.dir } : { k: '', dir: 1 };
  keepSort();
}
let cardSort = { k: '', dir: 1 };
/* Only a sort a heading shows: one kept from before the list (date added, warranty end...) would order it unseen. */
const HEAD_SORTS = ['name', 'user', 'loc', 'ip', 'detail', 'seen', 'src'];
try { const v = JSON.parse(localStorage.getItem('ni-card-sort') || 'null'); if (v && HEAD_SORTS.includes(v.k) && (v.dir === 1 || v.dir === -1)) cardSort = v; } catch { /* not kept */ }
const keepSort = () => { try { localStorage.setItem('ni-card-sort', JSON.stringify(cardSort)); } catch { /* not kept */ } };
const byText = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export function sortCards(list){
  const f = CARD_SORTS[cardSort.k] && CARD_SORTS[cardSort.k][1];
  if (!f) return list;
  const vals = new Map(list.map(o => [o, f(o)])), d = cardSort.dir;
  return [...list].sort((a, b) => {
    const x = vals.get(a), y = vals.get(b);
    if (x == null || x === '') return y == null || y === '' ? 0 : 1;
    if (y == null || y === '') return -1;
    return d * (typeof x === 'number' && typeof y === 'number' ? x - y : byText.compare(String(x), String(y))) || byText.compare(a.name || '', b.name || '');
  });
}
const sortIcon = dir => dir === 1 ? '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>' : '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
/* How many cards or table rows are drawn before "Show all". */
export const SHOW_FIRST = 500;
/* Draws the List toolbar (count, Group by, Save view, Print, the pick bar) and the list: a heading row that sorts, then
   the rows, in one run or in groups that fold. The first SHOW_FIRST are drawn, the rest after Show all. An empty list says why. */
export function renderCardsBody(){
  let list = sortCards(filtered());
  const pool = scopePool();
  $('#toolbar').innerHTML = html`<span class="muted">${listCount(list.length, pool.length)}</span><span class="tbsep"></span>
    <span class="tb-grp"><label class="muted" for="grp">Group by</label><select id="grp"><option value="none">Nothing</option><option value="type">Type</option><option value="loc">Location</option><option value="user">User</option></select></span>
    <span class="tb-grp ph-only"><label class="muted" for="cardSortM">Sort by</label><select id="cardSortM">${[['', 'Default'], ...(st.scope ? PEND_HEADS : HEADS).filter(h => h[0]).flatMap(([k, l]) => [[k + ':1', l + (k === 'seen' ? ', oldest first' : ', A to Z')], [k + ':-1', l + (k === 'seen' ? ', newest first' : ', Z to A')]])].map(([v, l]) => html`<option value="${v}" ${(cardSort.k ? cardSort.k + ':' + cardSort.dir : '') === v ? 'selected' : ''}>${l}</option>`)}</select></span>
    ${list.length ? html`<button type="button" class="ph-only" data-pickall="1">${st.bulk && st.bulk.size ? 'Clear selection' : 'Select all'}</button>` : ''}
    ${st.cardsGroup !== 'none' ? html`<button id="grpAll">Collapse all</button><button id="grpNone">Expand all</button>` : ''}
    ${joinCardsAvailable() && !st.scope ? html`<span class="tbsep"></span><label class="pchk" title="A column that shows whether computers and phones are in Active Directory, Microsoft Entra ID (Azure AD) and Intune"><input type="checkbox" id="cardJoin" ${cardJoin ? 'checked' : ''}> Directory status</label>` : ''}
    ${saveViewBtn() ? html`<span class="tbsep"></span>${rawHtml(saveViewBtn())}` : ''}${list.length ? html`<span class="tbsep"></span>${rawHtml(printMenuHtml())}` : ''}<div class="grow"></div>${rawHtml(pickBar(list))}`;
  bindScopeActs(list); bindSaveView(); bindPrintMenu();
  const cj = $('#cardJoin');
  if (cj) cj.onchange = () => { cardJoin = cj.checked; try { localStorage.setItem('ni-card-join', cardJoin ? '1' : '0'); } catch { /* not kept */ } renderCards(); };
  $('#grp').value = st.cardsGroup;
  $('#grp').onchange = e => { st.cardsGroup = e.target.value; view(); };
  /* On a phone the headings are not shown: the same sorts as a list, each way round. */
  const sm = $('#cardSortM'); if (sm) sm.onchange = () => { const [k, d] = sm.value.split(':'); cardSort = k && k in CARD_SORTS ? { k, dir: d === '-1' ? -1 : 1 } : { k: '', dir: 1 }; keepSort(); renderCards(); const again = $('#cardSortM'); if (again) again.focus(); };
  if (!list.length){
    $('#view').innerHTML = pool.length
      ? hiddenHits() || (st.q.trim() ? html`<div class="empty">${rawHtml(noMatchHtml())} <button class="primary" id="newFromSearch">Create “${st.q.trim()}” as a new device</button></div>` : html`<div class="empty">${rawHtml(noMatchHtml())}</div>`)
      : st.scope === 'review' && REVIEW.some(o => !o.review.ignored) ? html`<div class="empty">None of the devices waiting match these filters. <button type="button" class="primary" data-ck-all>Show all waiting</button></div>`
      : st.scope ? html`<div class="empty empty-inbox"><b>${st.scope === 'ignored' ? 'No ignored devices' : 'No pending devices'}</b><span class="muted">${st.scope === 'ignored' ? 'Devices you ignore stay here, out of the inventory and every sync.' : 'New devices go straight into the inventory. Only those that need a decision wait here.'}</span></div>`
      : (SERVER.on && !st.meId ? html`<div class="empty">Sign in to see the inventory.</div>` : emptyHtml());
    const ca = $('[data-ck-all]'); if (ca) ca.onclick = () => { st.rvWhy = st.rvSrc = ''; st.type = null; view(); };
    const bk = $('[data-fx-go]'); if (bk) bk.onclick = () => { st.scope = null; st.rvSrc = ''; st.rvKnown = false; st.rvOld = false; st.bulk = new Set(); view(); };
    const nfs = $('#newFromSearch'); if (nfs) nfs.onclick = () => newObjModal({name: st.q.trim()});
    bindHiddenHits();
    return;
  }
  const pend = !!st.scope, join = !pend && showJoin(), idx = relIndex(), card = o => cardHtml(o, idx, join);
  /* Thousands of rows take long to draw: the first ones are drawn, the rest on request. A search or a filter narrows it. */
  const cut = st.cardsAll !== viewSig() && list.length > SHOW_FIRST + 100;
  const more = cut ? html`<div class="more-rows"><span class="muted">Showing the first ${SHOW_FIRST} of ${list.length}. Search or filter to narrow them down.</span><button id="cardsAll">Show all ${list.length}</button></div>` : '';
  if (cut) list = list.slice(0, SHOW_FIRST);
  let rows;
  if (st.cardsGroup === 'none') rows = list.map(o => card(o)).join('');
  else {
    const key = st.cardsGroup === 'type' ? o => (TYPES[o.type] || { label: o.type }).label : st.cardsGroup === 'user' ? o => o.user || 'No user' : o => o.loc || 'No location';
    /* The group of devices without a user or location comes last. */
    const none = g => g === 'No user' || g === 'No location';
    const groups = [...new Set(list.map(key))].sort((a, b) => none(a) ? 1 : none(b) ? -1 : a.localeCompare(b));
    st.groupsClosed ??= {};
    rows = groups.map(g => {
      const closed = !!st.groupsClosed[st.cardsGroup + ':' + g], items = list.filter(o => key(o) === g);
      return String(html`<div class="lgrp grphdr${closed ? ' collapsed' : ''}" role="button" tabindex="0" aria-expanded="${String(!closed)}" data-grp="${g}">${g} <span class="muted">${items.length}</span></div>`) + (closed ? '' : items.map(o => card(o)).join(''));
    }).join('');
  }
  $('#view').innerHTML = html`<div id="cards" class="lst${pend ? ' pend' : ''}${join ? ' join' : ''}${isAdmin() && !pend ? ' qe' : ''}${st.bulk && st.bulk.size ? ' picking' : ''}" aria-label="${pend ? 'Pending devices' : 'Devices'}">${listHead(pend, join)}${rawHtml(rows)}</div>${more}`;
  const b = $('#cardsAll'); if (b) b.onclick = () => { st.cardsAll = viewSig(); renderCards(); };
  $('#view').querySelectorAll('[data-csort]').forEach(h => h.addEventListener('click', e => { e.stopPropagation(); sortBy(h.dataset.csort); renderCards(); const again = $(`#view [data-csort="${h.dataset.csort}"]`); if (again) again.focus(); }));
  $('#view').querySelectorAll('.grphdr').forEach(h => {
    const toggle = () => { const k = st.cardsGroup + ':' + h.dataset.grp; st.groupsClosed[k] = !st.groupsClosed[k]; renderCards(); const again = $(`#view .grphdr[data-grp="${CSS.escape(h.dataset.grp)}"]`); if (again) again.focus(); };
    h.addEventListener('click', toggle);
    h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });
  const setAll = closed => { $('#view').querySelectorAll('.grphdr').forEach(h => st.groupsClosed[st.cardsGroup + ':' + h.dataset.grp] = closed); renderCards(); };
  const ca = $('#grpAll'), ea = $('#grpNone');
  if (ca) ca.onclick = () => setAll(true);
  if (ea) ea.onclick = () => setAll(false);
}

export function renderCards(){ st.bulk = pickedInPool(); renderCardsBody(); addSearchHits(); bindPickBar(); }
/* Accept, Merge and Ignore on a card in Pending devices act on it straight away, without opening it. */
const rvAct = e => {
  const c = e.target.closest && e.target.closest('#view [data-rvc]'); if (!c) return false;
  e.preventDefault(); e.stopImmediatePropagation();
  const o = byId(c.dataset.rvid); if (o) reviewDo(c.dataset.rvc, [o]);
  return true;
};
document.addEventListener('click', rvAct, true);
/* They are buttons: Enter and Space click them like any other. */
/* The "Probably …" chip on a card opens Resolve instead of the card. */
document.addEventListener('click', e => {
  const c = evEl(e).closest && evEl(e).closest('#view [data-resolve]'); if (!c) return;
  e.preventDefault(); e.stopImmediatePropagation();
  resolveModal(c.dataset.resolve.split(',').map(byId).filter(Boolean));
}, true);
/* Up and down arrows move between the rows of the list (to each row's name, which Enter opens). */
document.addEventListener('keydown', e => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const row = evEl(e).closest && evEl(e).closest('#view .lrow'); if (!row || e.altKey || e.ctrlKey || e.metaKey) return;
  const rows = [...$('#view').querySelectorAll('.lrow')], i = rows.indexOf(row), next = rows[i + (e.key === 'ArrowDown' ? 1 : -1)];
  if (!next) return;
  e.preventDefault();
  const b = next.querySelector('.card-open'); if (b) { b.focus(); next.scrollIntoView({ block: 'nearest' }); }
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
  $('#view').insertAdjacentHTML('afterbegin', html`<div class="hits">${people.map(u => html`<button class="chip info" data-person="${u.name}">${u.name} · ${count.get(u.name) || 0} devices</button>`)}${locs.map(l => html`<button class="chip ls" data-loc="${l}">${l}</button>`)}</div>`);
  $('#view').querySelectorAll('[data-person]').forEach(b => b.onclick = () => showDevicesOf(b.dataset.person));
  $('#view').querySelectorAll('[data-loc]').forEach(b => b.onclick = () => { st.loc = b.dataset.loc; st.q = ''; view(); });
}

