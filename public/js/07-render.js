import { markHand, REVIEW, UNDO, CONTACTS, setAppVersion, lsLive, SYNC, daysSince } from './01-core.js';
import { setUsers } from './04-settings.js';
import { COMPANY, COSTS, updateSync, MODELS, SUBNETS, DOMAINS, FIELD_LAYOUT, TYPE_FIELDS, bindFullTextOnHover, fullTextTooltips, $, APP_VERSION, FIELD_LABEL, HISTORY, LOCS, VLANS, PLANS, PW_MIN, SITES, TYPES, byId, esc, objs, rels, st, toast, DEFAULT_TYPES } from './01-core.js';
import { USERS, applyRole, bindUser, canEdit, me, pushDate } from './04-settings.js';
import { renderContracts } from './09-costs.js';
import { renderContacts } from './11-contacts.js';
import { renderOverview } from './10-overview.js';
import { FIXED_TABS, renderCards, renderFilterBar, renderMap, renderPorts, renderSide, renderTable, renderTabs } from './02-views.js';
import { renderObj, renderRack, renderSoftware } from './03-object-modals.js';
import { leaveSettings, closeModal, modal } from './19-modal.js';
import { newObjModal } from './05-new-object.js';
import { renderPlans } from './20-plans.js';
/* ---------- render, saving and signing in ---------- */
/* Draws the open tab, the sidebar and the status bar. A redraw after a change also checks what is unsaved and sends it
   (saveData); a redraw that only shows something else (a filter, a search, another tab) skips that check, which goes
   through every record. */
export function render({ save = true } = {}){
  /* To review is no view of its own: it shows the waiting devices in Cards (or the Table) instead of the inventory. */
  if (st.tab === 'review'){ if (st.scope !== 'review'){ st.scope = 'review'; st.rvSrc = ''; st.bulk = new Set(); } st.tab = 'cards'; }
  updateSync(); renderSide(); renderTabs();
  if (st.tab === 'cards') renderCards();
  else if (st.tab === 'table') renderTable();
  else if (st.tab === 'map') renderMap();
  else if (st.tab === 'plans') renderPlans();
  else if (st.tab === 'net') renderPorts();
  else if (st.tab === 'rack') renderRack();
  else if (st.tab === 'sw') renderSoftware();
  else if (st.tab === 'contracts') renderContracts();
  else if (st.tab === 'contacts') renderContacts();
  else if (st.tab === 'overview') renderOverview();
  else renderObj(byId(st.tab));
  renderFilterBar();
  fullTextTooltips();
  bindFullTextOnHover();
  $('#stObjs').textContent = objs.length + ' objects';
  $('#stRels').textContent = rels.length + ' relations';
  renderStatus();
  applyRole();
  noteNav();
  if (save) saveData();
}
/* Back and forward (the browser's buttons, a mouse's side buttons, Alt+arrows) move between the views seen: the open tab
   and the sidebar filters. Each view drawn that differs from the last one is a step in the browser's history; a change of
   the search text only updates the current step, so typing does not make a step of every letter. The address stays. */
const NAV_KEYS = ['tab', 'scope', 'rvSrc', 'rvKnown', 'type', 'loc', 'status', 'warranty', 'scanOld', 'twins', 'intune', 'osFam', 'live', 'resp', 'adGroup'];
const navOf = () => ({ nobs: 1, ...Object.fromEntries(NAV_KEYS.map(k => [k, st[k] ?? null])), q: st.q || '' });
let navRestoring = false;
function noteNav(){
  if (navRestoring || typeof history === 'undefined') return;
  const now_ = navOf(), was = history.state && history.state.nobs ? history.state : null;
  if (!was) { history.replaceState(now_, ''); return; }
  if (NAV_KEYS.some(k => (was[k] ?? null) !== now_[k])) history.pushState(now_, '');
  else if (was.q !== now_.q) history.replaceState(now_, '');
}
window.addEventListener('popstate', e => {
  const to = e.state; if (!to || !to.nobs) return;
  /* An open dialog closes first, as Escape would; the view behind it stays. A dialog that must be answered stays open. */
  if ($('#mdl') && !$('#mdl.minimized')){
    history.pushState(navOf(), '');
    if (!$('#mdl .locked')) closeModal();
    return;
  }
  for (const k of NAV_KEYS) st[k] = to[k] ?? (typeof st[k] === 'boolean' ? false : null);
  st.q = to.q || '';
  /* A device's page that was closed since opens again; one that is gone (deleted) gives way to the cards. */
  if (!(st.tab in FIXED_TABS)){
    if (byId(st.tab)){ if (!st.open.includes(st.tab)){ st.open.push(st.tab); st.tabIds.push(st.tab); } }
    else st.tab = 'cards';
  }
  navRestoring = true;
  try { view(); } finally { navRestoring = false; }
  const v = $('#view'); if (v) v.scrollTop = 0;
});
/* A redraw that changes nothing: another tab, filter or search. */
export const view = () => render({ save: false });
/* The connection to the server: what it offers (LDAP, Lansweeper, Graph), the revision of each record this page has,
   and the state of the save in progress. Every change is sent to it; nothing is kept only in this browser. */
export const SERVER = {on: false, ldap: false, lansweeper: false, graph: false, timer: null, revs: {}, base: null, busy: false, again: false, watching: false, save: 'saved'};
/* Lansweeper is late when nothing came for two days: the push normally runs every night. */
export const SYNC_LATE_DAYS = 2;
/* The status bar: whether changes reached the server, and when Lansweeper last sent data. */
export function renderStatus(){
  const save = $('#stSave'), sync = $('#stSync'); if (!save || !sync) return;
  const S = {
    saved: ['', 'All changes saved', 'Every change is stored on the server.'],
    saving: ['', 'Saving…', 'Changes are being sent to the server.'],
    failed: ['bad', 'Not saved', 'The last change was refused. It is kept here and sent again with the next change.'],
    offline: ['bad', 'Server not reachable', 'Changes are kept in this browser and sent when the server answers again.'],
  }[SERVER.save] || ['', '', ''];
  /* A change not saved is a red chip, so it is not read past like the usual "All changes saved". */
  save.innerHTML = S[0] === 'bad' ? `<span class="chip bad">${S[1]}</span>` : `<span class="dot ${S[0]}"></span>${S[1]}`; save.title = S[2];
  /* On a phone the status bar is short: a save that failed is shown there anyway. */
  save.classList.toggle('hide-n', !S[0]);
  if (!lsLive()){ sync.innerHTML = '<span class="dot off"></span>Lansweeper off'; sync.title = 'The Lansweeper sync is turned off in Settings.'; return; }
  updateSync();
  const last = SYNC.run ? {at: SYNC.run, days: daysSince(SYNC.run)} : null;
  if (!last){ sync.innerHTML = '<span class="dot off"></span>Lansweeper: no sync yet'; sync.title = 'No data has come from Lansweeper yet.'; return; }
  const late = last.days >= SYNC_LATE_DAYS;
  sync.innerHTML = `<span class="dot ${late ? 'warn' : ''}"></span>Lansweeper ${esc(last.at)}`;
  sync.title = late ? `Lansweeper has not sent data for ${Math.floor(last.days)} days. Check the push on the Lansweeper server.` : 'The last time Lansweeper sent data.';
}
const setSave = v => { SERVER.save = v; renderStatus(); };
export function saveData(){ queueServerSave(); }
/* Saving. The page remembers, for every record, what it last saw (SERVER.base) and the revision the server gave it
   (SERVER.revs). A save sends only the records that differ from what it saw, each with that revision. A record that
   changed on the server since is not saved; the page then shows the newer version. */
export const PREFERENCES = ['mapPos'];
export function documents(){
  const m = new Map();
  objs.forEach(o => m.set('object|' + o.id, {kind:'object', id:o.id, value:o}));
  REVIEW.forEach(o => m.set('object|' + o.id, {kind:'object', id:o.id, value:o}));
  rels.forEach(r => m.set('rel|' + r.id, {kind:'rel', id:String(r.id), value:r}));
  USERS.forEach(u => m.set('user|' + u.id, {kind:'user', id:u.id, value:u}));
  Object.entries(TYPES).forEach(([k, t]) => m.set('type|' + k, {kind:'type', id:k, value:t}));
  Object.entries(HISTORY).forEach(([k, h]) => { if (h.length) m.set('history|' + k, {kind:'history', id:k, value:h}); });
  const settings = {...(st.syncSchedule ? {syncSchedule: st.syncSchedule} : {}), autoBackups: st.autoBackups !== false, fieldLayout: FIELD_LAYOUT, locs: LOCS, sites: SITES, vlans: VLANS, domains: DOMAINS, models: MODELS, subnets: SUBNETS, typeFields: TYPE_FIELDS, lansweeper: st.lansweeper, policy: st.policy, feedOn: st.feedOn, feedSync: st.feedSync, ldap: st.ldap, mapPos: st.mapPos, plans: PLANS, useLansweeper: st.useLansweeper !== false, lsSource: st.lsSource === 'api' ? 'api' : 'push', typeMap: st.typeMap || {}, modelMap: st.modelMap || {}, skipIpOnly: !!st.skipIpOnly, mergeTwins: !!st.mergeTwins, fillGraph: st.fillGraph !== false, fillAd: st.fillAd !== false, intake: st.intake || {}, backupKeep: st.backupKeep || 10, contracts: COSTS.contracts, licences: COSTS.licences, contacts: CONTACTS.list, currency: COSTS.currency || 'CHF', company: {name: COMPANY.name || '', logo: COMPANY.logo || ''}};
  /* The type rules are kept only once edited; back to the defaults removes them, so the shipped ones apply. */
  if (Array.isArray(st.typeRules)) settings.typeRules = st.typeRules;
  Object.entries(settings).forEach(([k, v]) => m.set('setting|' + k, {kind:'setting', id:k, value:v}));
  return m;
}
export function setBaseline(){
  SERVER.base = new Map();
  for (const [k, d] of documents()) SERVER.base.set(k, JSON.stringify(d.value));
}
export function pendingChanges(){
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
export function flushSave(){ clearTimeout(SERVER.timer); return sendChanges(); }
export function queueServerSave(){
  if (!SERVER.base) return;   /* nothing has been loaded yet */
  clearTimeout(SERVER.timer);
  SERVER.timer = setTimeout(sendChanges, 400);
}
/* Changes are sent in batches of about BATCH.bytes, so a large edit is not refused as too big. Each batch is saved on its own. */
export const BATCH = { bytes: 2000000 };
export function batches(puts, dels){
  const out = []; let cur = {puts: [], dels: []}, size = 0;
  const add = (kind, c) => {
    const n = (c.json || '').length + String(c.id || '').length + 100;
    if (size + n > BATCH.bytes && (cur.puts.length || cur.dels.length)){ out.push(cur); cur = {puts: [], dels: []}; size = 0; }
    cur[kind].push(c); size += n;
  };
  puts.forEach(c => add('puts', c)); dels.forEach(c => add('dels', c));
  if (cur.puts.length || cur.dels.length) out.push(cur);
  return out;
}
/* A save that asks while another is in progress waits for that one, so the caller knows what was sent. */
export function sendChanges(){
  if (SERVER.busy){ SERVER.again = true; return SERVER.inflight; }
  SERVER.inflight = sendNow();
  return SERVER.inflight;
}
async function sendNow(){
  if (!canEdit()) return;
  const pending = pendingChanges();
  if (!pending.puts.length && !pending.dels.length) return;
  SERVER.busy = true; setSave('saving');
  let ok = false;
  try {
    for (const {puts, dels} of batches(pending.puts, pending.dels)) {
      const body = {puts: puts.map(({kind, id, value, base}) => ({kind, id, value, base})), dels: dels.map(({kind, id, base}) => ({kind, id, base}))};
      const r = await fetch('api/changes', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify(body)});
      if (r.status === 401){ loginModal('Your sign-in has ended. Sign in again.'); setSave('failed'); return; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok){ toast('Not saved: ' + (j.error || r.status)); setSave('failed'); return; }
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
        const KIND_NAME = { object: 'an object', rel: 'a connection', setting: 'a setting', user: 'a user', type: 'an object type', history: 'a history entry' };
      const names = j.conflicts.map(k => { const c = sent.get(k); return c && c.value && c.value.name ? c.value.name : KIND_NAME[k.split('|')[0]] || k; });
        const refused = j.conflicts.map(k => sent.get(k)).filter(c => c && c.kind === 'object' && c.json)
          .map(c => ({ id: c.id, name: c.value.name, mine: JSON.parse(c.json), base: JSON.parse(SERVER.base.get(c.key) || 'null') }));
        toast('Not saved, changed by someone else: ' + names.join(', ') + '. The newer version is shown.');
        /* Only the records someone else changed take their version; edits made meanwhile stay and are saved next. */
        await reloadFromServer({ flush: false, skip: j.conflicts });
        const items = refused.map(r => {
          const now = byId(r.id);
          return { id: r.id, name: r.name, gone: !now, fields: now ? changedFields(r.mine, r.base).map(k => ({ k, mine: r.mine[k], theirs: now[k] })) : [] };
        }).filter(i => i.gone || i.fields.length);
        if (items.length) refusedModal(items);
      }
    }
    ok = true;
  } catch {
    if (SERVER.save !== 'offline') toast('Not saved: the server cannot be reached.');
    setSave('offline');
  } finally {
    SERVER.busy = false;
    if (ok) setSave('saved');
    if (SERVER.again){ SERVER.again = false; queueServerSave(); }
  }
}
/* The fields a person changed on an object, to offer them again after a refused save. */
export const NOT_EDITED = ['id', 'code', 'feed'];
export function changedFields(mine, base){ return Object.keys(mine).filter(k => !NOT_EDITED.includes(k) && JSON.stringify(mine[k]) !== JSON.stringify((base || {})[k])); }
export const shown = v => (v && typeof v === 'object') ? JSON.stringify(v) : String(v ?? '');
/* Shows what a person changed and the newer version, so a refused edit is not lost. */
export function refusedModal(items){
  modal(`<div class="mh">Not saved: changed by someone else</div>
    <div class="mb"><p class="note">Someone else saved these records first, so your changes were not saved. The inventory shows their version. You can apply your changes again.</p>
      ${items.map(it => `<div class="panelbox"><div class="hdr">${esc(it.name)}${it.gone ? ' <span class="muted">· deleted by someone else</span>' : ''}</div>
        ${it.fields.length ? `<table class="grid mini" style="min-width:0"><thead><tr><th>Field</th><th>Yours</th><th>Theirs</th></tr></thead><tbody>${it.fields.map(f => `<tr><td>${esc(FIELD_LABEL[f.k] || f.k)}</td><td>${esc(shown(f.mine))}</td><td>${esc(shown(f.theirs))}</td></tr>`).join('')}</tbody></table>` : ''}
      </div>`).join('')}</div>
    <div class="mf"><button id="rfKeep">Keep theirs</button><button id="rfApply" class="primary">Apply mine again</button></div>`, 'wide');
  $('#rfKeep').onclick = closeModal;
  $('#rfApply').onclick = () => {
    let n = 0;
    for (const it of items){ const o = byId(it.id); if (!o || it.gone) continue; for (const f of it.fields){ o[f.k] = f.mine; if (f.k !== 'src') markHand(o, f.k); n++; } }
    closeModal(); saveData(); render(); toast(n ? 'Your changes are applied again' : 'Nothing to apply');
  };
}
/* Loads the inventory and its revisions from the server, and makes it the base for the next save. Changes not saved
   yet are saved first; what still cannot be saved (offline, signed out) is put back on top and saved later, so a
   reload never drops an edit. Records in skip are the ones someone else changed: their newer version is kept. After a restore (discard), the
   restored inventory replaces everything here. */
export async function reloadFromServer({ flush = true, skip = [], discard = false } = {}){
  if (flush && !discard && SERVER.base && canEdit()){ if (SERVER.busy) await SERVER.inflight; await flushSave(); }
  const r = await fetch('api/state', {credentials: 'same-origin'});
  if (r.status === 401){ loginModal(); return false; }
  if (!r.ok){ toast('The inventory could not be loaded.'); return false; }
  const d = await r.json();
  /* Taken just before the server's version replaces the page's, so an edit made while it loaded is kept too. */
  const keep = !discard && SERVER.base && canEdit() ? pendingChanges() : null;
  applyState(d);
  SERVER.revs = d.revs || {};
  setBaseline();
  /* Settings changed here while it loaded (contracts, plans, locations …) go back on top too; the base stays the
     server's, so they are saved. */
  const sets = keep ? keep.puts.filter(c => c.kind === 'setting' && !skip.includes(c.key)) : [];
  if (sets.length){ const mine = { ...d }; for (const c of sets) mine[c.id] = JSON.parse(c.json); applyState(mine); }
  if (keep && replayLocal(keep, skip)) queueServerSave();
  dropMissingTabs();
  render();
  return true;
}
/* Puts unsaved records back after a reload: objects, connections, users, types and history. */
function replayLocal({ puts, dels }, skip){
  const lists = { object: objs, rel: rels, user: USERS };
  const maps = { type: TYPES, history: HISTORY };
  let n = 0;
  for (const c of puts){
    if (skip.includes(c.key)) continue;
    const v = JSON.parse(c.json);
    if (c.kind === 'object'){ for (const a of [objs, REVIEW]){ const i = a.findIndex(x => x.id === c.id); if (i >= 0) a.splice(i, 1); } (v.review ? REVIEW : objs).push(v); n++; }
    else if (lists[c.kind]){ const a = lists[c.kind], i = a.findIndex(x => String(x.id) === c.id); if (i >= 0) a[i] = v; else a.push(v); n++; }
    else if (maps[c.kind]){ maps[c.kind][c.id] = v; n++; }
  }
  for (const c of dels){
    if (skip.includes(c.key)) continue;
    if (c.kind === 'object'){ for (const a of [objs, REVIEW]){ const i = a.findIndex(x => x.id === c.id); if (i >= 0){ a.splice(i, 1); n++; } } }
    else if (lists[c.kind]){ const a = lists[c.kind], i = a.findIndex(x => String(x.id) === c.id); if (i >= 0){ a.splice(i, 1); n++; } }
    else if (maps[c.kind] && c.id in maps[c.kind]){ delete maps[c.kind][c.id]; n++; }
  }
  return n;
}
/* An object open in a tab may have been deleted by someone else: its tab is closed. */
export function dropMissingTabs(){
  const gone = id => !FIXED_TABS[id] && !byId(id);
  st.open = st.open.filter(id => !gone(id));
  st.tabIds = st.tabIds.filter(id => !gone(id));
  if (gone(st.tab)) st.tab = 'table';
}
/* Other people's saves show up here: every 15 seconds and when the window gets focus. Nothing is replaced while there
   are unsaved changes, a dialog is open, or someone is typing. A viewer cannot save, so what they changed on the page
   (a box moved on the map, a room a plan added) does not hold the refresh back: it is replaced by the server's. */
export async function checkForChanges(){
  if (!SERVER.base || SERVER.busy || document.querySelector('#mdl')) return;
  if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  const {puts, dels} = pendingChanges();
  /* Changes that could not be sent while the server was away are sent again here. */
  if ((puts.length || dels.length) && canEdit()){ if (SERVER.save === 'offline') sendChanges(); return; }
  let r;
  try { r = await fetch('api/state', {credentials: 'same-origin'}); } catch { setSave('offline'); return; }
  if (!r.ok) return;
  if (SERVER.save === 'offline') setSave('saved');
  const d = await r.json();
  const revs = d.revs || {};
  const changed = Object.keys(revs).some(k => (SERVER.revs[k] ?? 0) !== revs[k]) || Object.keys(SERVER.revs).some(k => !(k in revs));
  if (changed) await reloadFromServer();
}
export function applyState(d){
  UNDO.epoch++;
  objs.splice(0, objs.length, ...d.objs.filter(o => !o.review));
  REVIEW.splice(0, REVIEW.length, ...d.objs.filter(o => o.review));
  rels.splice(0, rels.length, ...d.rels);
  Object.keys(HISTORY).forEach(k => delete HISTORY[k]); Object.assign(HISTORY, d.history);
  setUsers(d.users); LOCS.splice(0, LOCS.length, ...d.locs);
  SITES.splice(0, SITES.length, ...(d.sites || []));
  VLANS.splice(0, VLANS.length, ...(d.vlans || []));
  DOMAINS.splice(0, DOMAINS.length, ...(d.domains || []));
  MODELS.splice(0, MODELS.length, ...(d.models || []));
  CONTACTS.list = Array.isArray(d.contacts) ? d.contacts : [];
  COSTS.contracts = Array.isArray(d.contracts) ? d.contracts : []; COSTS.licences = Array.isArray(d.licences) ? d.licences : []; COSTS.currency = d.currency || 'CHF';
  st.typeRules = Array.isArray(d.typeRules) ? d.typeRules : null;
  st.graphUnmatched = Array.isArray(d.graphUnmatched) ? d.graphUnmatched : [];
  st.graphAmbiguous = Array.isArray(d.graphAmbiguous) ? d.graphAmbiguous : [];
  st.adUnmatched = Array.isArray(d.adUnmatched) ? d.adUnmatched : [];
  st.ldapCa = d.ldapCa && Array.isArray(d.ldapCa.certs) ? d.ldapCa : null;
  st.syncSchedule = d.syncSchedule && typeof d.syncSchedule === 'object' ? d.syncSchedule : null;
  COMPANY.name = (d.company && d.company.name) || ''; COMPANY.logo = (d.company && d.company.logo) || '';
  SUBNETS.splice(0, SUBNETS.length, ...(d.subnets || []));
  for (const k of Object.keys(FIELD_LAYOUT)) delete FIELD_LAYOUT[k];
  Object.assign(FIELD_LAYOUT, d.fieldLayout || {});
  for (const k of Object.keys(TYPE_FIELDS)) delete TYPE_FIELDS[k];
  Object.assign(TYPE_FIELDS, d.typeFields || {});
  PLANS.splice(0, PLANS.length, ...(d.plans || []));
  st.useLansweeper = d.useLansweeper !== false; st.lsSource = d.lsSource === 'api' ? 'api' : 'push';
  st.lsNets = Array.isArray(d.lsNets) ? d.lsNets : [];   /* subnet suggestions from Lansweeper, read only */
  st.autoBackups = d.autoBackups !== false; st.typeMap = d.typeMap || {}; st.modelMap = d.modelMap || {}; st.skipIpOnly = !!d.skipIpOnly; st.mergeTwins = !!d.mergeTwins; st.fillGraph = d.fillGraph !== false; st.fillAd = d.fillAd !== false; st.intake = d.intake && typeof d.intake === 'object' ? d.intake : {}; st.syncRuns = d.syncRuns && typeof d.syncRuns === 'object' ? d.syncRuns : {}; st.backupKeep = d.backupKeep || 10;
  LOCS.forEach(l => { const x = l.split(' / ')[0]; if (!SITES.includes(x)) SITES.push(x); });   /* locations saved before sites existed */
  if (d.types){   /* the built-in types are always there; the saved ones add to them or change them */
    Object.keys(TYPES).forEach(k => delete TYPES[k]); Object.assign(TYPES, JSON.parse(JSON.stringify({ ...DEFAULT_TYPES, ...d.types })));
  }
  /* A new server has no saved policy yet: start from the defaults so the Settings panes can be drawn. */
  Object.assign(st, {policy: d.policy || {ip:true, mac:true, os:true, model:true, cpu:true, ram:true, fw:true, boot:true, disk:false, av:false, domain:true, user:false, loc:false, ip6:true, patch:true, software:true, links:true, dept:true, ipRoom:true}, feedOn: d.feedOn ?? true, feedSync: d.feedSync ?? true, ldap: d.ldap ?? {url: '', bindDn: '', base: '', filter: '', group: '', nightly: true, disable: true, last: null}, mapPos: d.mapPos || {}, lansweeper: d.lansweeper || {}});
  objs.forEach(bindUser); REVIEW.forEach(bindUser);
  SYNC.defender = objs.some(o => o.defender);   /* the cards show a Defender mark once Defender has been read */
}
/* Clears the devices, relations and history on the server for everyone; users, locations, types and settings stay, the
   racks too unless their box is ticked.
   It deletes every device, so it asks first, and only goes ahead when the word CLEAR is typed. */
export function clearConfirm(){
  modal(`<div class="mh">Clear the whole inventory?</div>
    <div class="mb"><p class="note">This deletes every device on the server, with its relations and history, for everyone, and takes them out of the contracts that list them. Users, locations, sites, floor plans, contracts and settings stay, and so do the racks and the objects excluded from sync unless you tick the boxes below. A backup is taken first and kept until you delete it: restoring it (Settings → Maintenance) brings the devices back.</p>
      <label class="pchk" style="display:flex;gap:6px;align-items:center;margin:8px 0"><input type="checkbox" id="clrAll"> Also delete the objects excluded from sync (protected)</label>
      <label class="pchk" style="display:flex;gap:6px;align-items:center;margin:8px 0"><input type="checkbox" id="clrRacks"> Also delete the racks</label>
      <label class="pchk" style="display:flex;gap:6px;align-items:flex-start;margin:8px 0"><input type="checkbox" id="clrConn" style="margin-top:2px"> Also remove the connections: LDAP, Microsoft Graph with its certificates and keys, the Lansweeper API settings and push token</label>
      <label class="note" for="clrWord" style="display:block;margin-top:6px">Type CLEAR to confirm</label><input id="clrWord" autocomplete="off" aria-label="Type CLEAR" style="width:100%"></div>
    <div class="mf"><button id="clrCancel">Cancel</button><button id="clrOk" class="danger-text" disabled>Clear inventory</button></div>`, 'sm');
  $('#clrWord').oninput = () => { $('#clrOk').disabled = $('#clrWord').value.trim() !== 'CLEAR'; };
  $('#clrWord').focus();
  $('#clrCancel').onclick = closeModal;
  $('#clrOk').onclick = () => clearAll();
}
/* Clears the devices, relations and history on the server, all of them, including any another person added since
   this page loaded. Users, locations, types and settings stay. */
export async function clearAll(){
  if (!canEdit()){ toast('Only an admin can clear the inventory.'); return; }
  const r = await fetch('api/state', {credentials: 'same-origin'});
  if (!r.ok){ toast('The inventory could not be loaded.'); return; }
  const d = await r.json();
  /* Objects excluded from sync are kept, unless the box to delete protected objects is ticked. Relations and history of
     the removed objects go with them; relations between kept objects stay. */
  const deleteAll = !!($('#clrAll') && $('#clrAll').checked), racksToo = !!($('#clrRacks') && $('#clrRacks').checked);
  /* Racks stay unless their box is ticked: they are objects, so they are kept here as well. */
  const removed = new Set(d.objs.filter(o => (racksToo || o.type !== 'rack') && (deleteAll || !o.excluded)).map(o => o.id));
  const kept = d.objs.length - removed.size;
  const base = (kind, id) => d.revs[kind + '|' + id] ?? 0;
  /* What stays must not point at what goes: a kept device leaves a deleted rack (or the device it sat on), and the
     contracts no longer list the deleted devices. */
  const puts = d.objs.filter(o => !removed.has(o.id) && (removed.has(o.rack) || removed.has(o.ontop))).map(o => {
    const v = {...o}; if (removed.has(v.rack)) { delete v.rack; delete v.u; delete v.h; } if (removed.has(v.ontop)) delete v.ontop;
    return {kind: 'object', id: o.id, value: v, base: base('object', o.id)};
  });
  if (Array.isArray(d.contracts) && d.contracts.some(c => (c.devices || []).some(id => removed.has(id))))
    puts.push({kind: 'setting', id: 'contracts', value: d.contracts.map(c => c.devices ? {...c, devices: c.devices.filter(id => !removed.has(id))} : c), base: base('setting', 'contracts')});
  const dels = [
    ...d.objs.filter(o => removed.has(o.id)).map(o => ({kind:'object', id:o.id})),
    ...d.rels.filter(x => removed.has(x.from) || removed.has(x.to)).map(x => ({kind:'rel', id:String(x.id)})),
    ...Object.keys(d.history).filter(id => removed.has(id)).map(id => ({kind:'history', id})),
  ].map(c => ({...c, base: base(c.kind, c.id)}));
  /* A backup first, kept until someone deletes it: without one nothing is cleared. */
  const bk = await fetch('api/backups', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({reason: 'before clearing the inventory'})});
  if (!bk.ok){ toast('Not cleared: the backup before it could not be taken.'); return; }
  const res = await fetch('api/changes', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({puts, dels})});
  const j = await res.json().catch(() => ({}));
  if (!res.ok){ toast('Not cleared: ' + (j.error || res.status)); return; }
  /* The connections go after the devices, so the save above cannot write their settings back. */
  let connMsg = '';
  if ($('#clrConn') && $('#clrConn').checked){
    const c = await fetch('api/connections/clear', {method: 'POST', credentials: 'same-origin'});
    connMsg = c.ok ? ' Connections removed.' : ' The connections could not be removed.';
  }
  leaveSettings(); closeModal();   /* the emptied inventory is shown, not Settings */
  await reloadFromServer();
  toast((j.conflicts && j.conflicts.length ? 'Cleared, except ' + j.conflicts.length + ' record(s) that someone changed meanwhile' : (kept ? 'Cleared. ' + kept + ' excluded object' + (kept === 1 ? ' kept' : 's kept') : 'Inventory cleared')) + connMsg);
}
/* Keyboard: N new object, / search, C T M R switch views, ? the list. Not while typing or in a dialog. */
export const SHORTCUTS = [['N','New object'],['Ctrl + K','Search everything: devices, people, contacts, contracts, rooms'],['/','Filter the list of this view'],['↑ ↓ Enter','In the search: pick a hit and open it'],['Enter','In a list filter: open the one object left, or go to the first'],['C','Cards'],['T','Table'],['M','Relationships'],['R','Racks'],['Enter','In a dialog: its main button (Create, Save …)'],['Esc','Close a dialog'],['Ctrl + wheel','Zoom the floor plan or the relationship map'],['?','This list']];
export function shortcutsModal(){
  modal(`<div class="mh">Keyboard shortcuts</div><div class="mb"><table class="grid mini" style="min-width:0"><tbody>
    ${SHORTCUTS.map(([k, t]) => `<tr><td class="mono"><b>${k}</b></td><td>${t}</td></tr>`).join('')}</tbody></table></div>
    <div class="mf"><button id="scClose" class="primary">Done</button></div>`, 'sm');
  $('#scClose').onclick = closeModal;
}
{ const kb = $('#keysBtn'); if (kb) kb.onclick = shortcutsModal; }
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest('input, textarea, select') || $('#mdl')) return;
  const key = e.key.toLowerCase();
  if (e.key === '?'){ e.preventDefault(); shortcutsModal(); return; }
  /* / goes to the list's own filter where the view has one (Cards, Table, Relationships, Contracts …), else to the search. */
  if (e.key === '/'){ e.preventDefault(); const f = $('#listQ') || $('#plQ') || $('#toolbar input[type=search]') || $('#search'); f.focus(); return; }
  if (key === 'n' && canEdit()){ e.preventDefault(); newObjModal(); return; }
  const tab = {c: 'cards', t: 'table', m: 'map', r: 'rack'}[key];
  if (tab){ if (tab === 'map' && st.open.includes(st.tab)) st.mapFocus = st.tab; st.tab = tab; render(); }
});

/* The version comes from the server. It is shown in the footer and in Settings → About. */
export async function loadVersion(){
  if (!APP_VERSION){
    try { const r = await fetch('api/health', {credentials: 'same-origin'}); if (r.ok) setAppVersion((await r.json()).version || ''); } catch { /* no version is shown when it cannot be read */ }
  }
  const foot = $('#verFoot'); if (foot) foot.textContent = 'NOBS Inventory ' + APP_VERSION;
  return APP_VERSION;
}
export async function boot(){
  loadVersion();
  let info = null;
  try { const r = await fetch('api/me', {credentials: 'same-origin'}); if (r.ok) info = await r.json(); } catch { info = null; }
  if (!info){ showUnreachable(); return; }
  SERVER.on = true; SERVER.ldap = info.ldap; SERVER.lansweeper = info.lansweeper; SERVER.graph = !!info.graph; SYNC.graph = SERVER.graph;
  if (!info.user){ clearInventory(); render(); loginModal(); return; }
  await loadFromServer(info.user);
}
/* The page works only with its server. Without one nothing is shown; the dialog offers to try again. */
export function showUnreachable(){
  document.body.classList.add('signed-out');
  modal(`<div class="mh">NOBS Inventory</div><div class="mb"><p class="note" style="color:var(--danger)">The inventory server cannot be reached. Check that it is running, then try again.</p></div>
    <div class="mf"><button id="unTry" class="primary">Try again</button></div>`, 'sm free locked');
  $('#unTry').onclick = () => location.reload();
}
/* Before sign-in the page holds no inventory. */
export function clearInventory(){
  objs.length = 0; REVIEW.length = 0; rels.length = 0; LOCS.length = 0; VLANS.length = 0; DOMAINS.length = 0; setUsers([]);
  for (const k of Object.keys(FIELD_LAYOUT)) delete FIELD_LAYOUT[k];
  for (const k of Object.keys(TYPE_FIELDS)) delete TYPE_FIELDS[k];
  Object.keys(HISTORY).forEach(k => delete HISTORY[k]);
  st.open = []; st.tab = 'cards';
}
export async function loadFromServer(user){
  if (!(await reloadFromServer())) return;
  document.body.classList.remove('signed-out');
  st.meId = user.id;
  if (!SERVER.watching){ SERVER.watching = true; setInterval(checkForChanges, 15000); window.addEventListener('focus', checkForChanges); }
  render();
}/* Sign in with a login and password. The server checks the account, or the directory when LDAP is set up. */
export function loginModal(err = '', login = ''){
  document.body.classList.add('signed-out');
  modal(`<div class="mh">Sign in</div>
    <div class="mb"><div class="brandmark" style="margin:2px 0 16px"><img src="logo.svg" alt=""><div><b>NOBS</b> <span>Inventory</span></div></div><form id="loginForm" class="form" style="padding:0">
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
    closeModal();
    /* Signed in again after the sign-in ended: what was not saved is sent now (the load saves it first). Someone else
       signing in on this page does not send the previous person's changes under their name. */
    if (SERVER.base && String(j.user.id) !== String(st.meId)) SERVER.base = null;
    await loadFromServer(j.user);
  };
  $('#lgOk').onclick = go;
  $('#loginForm').addEventListener('submit', e => { e.preventDefault(); go(); });
  (login ? $('#lgPw') : $('#lgUser')).focus();
}
/* The browsers this account is signed in on. A session ends on its own after two hours without use. */
export const browserName = ua => {
  const b = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? b + ' on ' + os : b;
};
export async function loadMySessions(){
  const box = $('#acSessions'); if (!box) return;
  const r = await fetch('api/me/sessions', {credentials: 'same-origin'});
  if (!r.ok){ box.innerHTML = '<p class="note">The sessions could not be loaded.</p>'; return; }
  const list = (await r.json()).sessions;
  const others = list.filter(x => !x.current).length;
  box.innerHTML = list.length ? `<div class="sess-list">${list.map(x => `<div class="sess">
      <div class="sess-main"><div class="sess-name">${esc(browserName(x.agent))}${x.current ? '<span class="sess-here">This browser</span>' : ''}</div><div class="sess-when">Last used ${esc(pushDate(x.last))}</div></div>
      ${x.current ? '' : `<button data-endsess="${esc(x.id)}" aria-label="End this session">End</button>`}</div>`).join('')}</div>
    <div class="sess-foot"><button id="acEndOthers" ${others ? '' : 'disabled'}>End all other sessions</button></div>` : '<p class="note">No browsers are signed in.</p>';
  box.querySelectorAll('[data-endsess]').forEach(b => b.onclick = async () => { await fetch('api/me/sessions/' + encodeURIComponent(b.dataset.endsess), {method: 'DELETE', credentials: 'same-origin'}); loadMySessions(); });
  if ($('#acEndOthers')) $('#acEndOthers').onclick = async () => { for (const x of list.filter(y => !y.current)) await fetch('api/me/sessions/' + encodeURIComponent(x.id), {method: 'DELETE', credentials: 'same-origin'}); toast('Other browsers are signed out'); loadMySessions(); };
}
/* Your own account: name and department, and the password. Directory users keep their name, department and password in
   the directory, so for them it only shows them (and the signed-in browsers). */
export function accountModal(){
  const u = me(), ldap = u.source === 'ldap';
  const parts = (u.name || '').split(' ');
  modal(`<div class="mh">Your account</div>
    <div class="mb"><div class="form" style="padding:0">
      <label>Login</label><div class="mono" style="padding:4px 0">${esc(u.login || '—')}${ldap ? ' · directory' : ''}</div>
      <label for="acFirst">First name</label><input id="acFirst" value="${esc(u.first ?? parts[0] ?? '')}" ${ldap ? 'disabled' : ''}>
      <label for="acLast">Last name</label><input id="acLast" value="${esc(u.last ?? parts.slice(1).join(' '))}" ${ldap ? 'disabled' : ''}>
      <label for="acDept">Department</label><input id="acDept" value="${esc(u.dept || '')}" ${ldap ? 'disabled' : ''}>
    </div>
    ${ldap ? '<p class="note">Your name, department and password come from the directory.</p>' : `<div class="hdr" style="margin:14px -14px 8px">Password</div>
    <div class="form" style="padding:0">
      <label for="acCur">Current</label><input id="acCur" type="password" autocomplete="current-password">
      <label for="acNew">New</label><input id="acNew" type="password" autocomplete="new-password" placeholder="At least ${PW_MIN} characters">
      <label for="acNew2">Repeat</label><input id="acNew2" type="password" autocomplete="new-password">
    </div>`}
    <div class="hdr" style="margin:14px -14px 8px">Signed-in browsers</div>
    <div id="acSessions"><p class="note">Loading…</p></div>
    <p class="note" id="acErr"></p></div>
    <div class="mf"><button id="acClose">Close</button><button id="acPw" ${ldap ? 'hidden' : ''}>Change password</button><button id="acSave" class="primary" ${ldap ? 'hidden' : ''}>Save</button></div>`, 'sm');
  loadMySessions();
  const fail = msg => { $('#acErr').textContent = msg; };
  $('#acClose').onclick = closeModal;
  $('#acSave').onclick = async () => {
    if (ldap){ closeModal(); return; }
    const first = $('#acFirst').value.trim(), last = $('#acLast').value.trim();
    if (!first && !last) return fail('Give a first or last name.');
    const r = await fetch('api/me', {method: 'PUT', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({first, last, dept: $('#acDept').value.trim()})});
    if (!r.ok) return fail((await r.json().catch(() => ({}))).error || 'The details could not be saved.');
    closeModal(); await reloadFromServer(); toast('Saved');
  };
  $('#acPw').onclick = async () => {
    const cur = $('#acCur').value, pw = $('#acNew').value;
    if (!cur) return fail('Type your current password.');
    if (pw.length < PW_MIN) return fail(`The new password needs at least ${PW_MIN} characters.`);
    if (pw !== $('#acNew2').value) return fail('The two new passwords are not the same.');
    const r = await fetch('api/me/password', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({current: cur, password: pw})});
    if (!r.ok) return fail((await r.json().catch(() => ({}))).error || 'The password was not changed.');
    closeModal(); toast('Password changed. Other browsers are signed out.');
  };
  $('#acFirst').focus();
}
export async function signOut(){
  await fetch('api/logout', {method: 'POST', credentials: 'same-origin'});
  location.reload();
}
