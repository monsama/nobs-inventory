/* Loading from the server: reloads, checks for other people's changes, unsaved changes put back on top. */
import { applyDelta } from './delta.js';
import { $, REVIEW, UNDO, CONTACTS, SYNC, OLD_TYPE_COLORS } from './01-core.js';
import { setUsers } from './04-settings.js';
import { HISTORY_KEEP, COMPANY, COSTS, MODELS, SUBNETS, DOMAINS, FIELD_LAYOUT, TYPE_FIELDS, HISTORY, LOCS, VLANS, PLANS, SITES, TYPES, byId, objs, rels, st, toast, DEFAULT_TYPES } from './01-core.js';
import { USERS, bindUser, isAdmin } from './04-settings.js';
import { FIXED_TABS } from './02-views.js';
import { forgetPhotos } from './23-photos.js';
import { render } from './07-render.js';
import { refreshHistory } from './28-restore.js';
import { newLines } from './history-merge.js';
import { SERVER, setSave, offlineKept, documents, pendingChanges, flushSave, queueServerSave, sendChanges } from './server-save.js';
import { loginModal } from './signin.js';
/* After sign-in: changes kept offline on this device go back on top of the server's inventory and are saved. */
export function restoreOffline(){
  const kept = offlineKept(); if (!kept || !isAdmin()) return;
  /* Of the settings, the inventory checks (what an inventory check found and noted) are what is changed without a connection. */
  const stk = kept.puts.find(c => c.kind === 'setting' && c.id === 'stocktakes');
  if (stk) st.stocktakes = JSON.parse(stk.json);
  /* Rooms added there come back too. */
  const locs = kept.puts.find(c => c.kind === 'setting' && c.id === 'locs');
  if (locs) for (const l of JSON.parse(locs.json)) if (!LOCS.includes(l)) LOCS.push(l);
  const n = replayLocal({ puts: kept.puts.filter(c => c.kind !== 'setting'), dels: kept.dels }, []) + (stk ? 1 : 0);
  /* Each is saved on the revision it was made on: what someone else changed meanwhile comes back as a conflict, to be
     decided, instead of being overwritten. */
  for (const c of [...kept.puts, ...kept.dels]) if (Number.isInteger(c.base) && c.base !== null) SERVER.revs[c.key] = c.base;
  if (n){ toast(`${n} change${n === 1 ? '' : 's'} made without a connection ${n === 1 ? 'is' : 'are'} saved now`); render(); queueServerSave(); }
}
let LOAD_FIX = null;
/* The inventory comes without the devices' history (api/state?history=0): it is most of a large inventory's bulk and
   only a device's own page shows it. HIST_FULL: the devices whose history the page has whole (read when their page
   opened, or sent since with what changed). For any other device HISTORY holds only the lines added here, which a
   save sends and the server puts on top of the stored ones (state.js applyChanges), so none is lost. */
export const HIST_FULL = new Set();
const histLoading = new Map();
/* Reads device id's history once, when its page opens, and draws its history panels again with it. */
export function ensureHistory(id){
  if (!SERVER.on || !SERVER.base || HIST_FULL.has(id) || histLoading.has(id)) return;
  const epoch = UNDO.epoch;
  let stale = false;
  histLoading.set(id, fetch(`api/history/${encodeURIComponent(id)}`, {credentials: 'same-origin'})
    .then(r => r.ok ? r.json() : null)
    .then(j => {
      /* A reload in between replaced the page's history: read again for it (below), unless it brought the history. */
      if (!j || !Array.isArray(j.history) || HIST_FULL.has(id)) return;
      if (epoch !== UNDO.epoch){ stale = true; return; }
      const mine = newLines(HISTORY[id] || [], j.history);
      if (j.history.length || mine.length) HISTORY[id] = [...mine, ...j.history].slice(0, HISTORY_KEEP);
      /* What the server holds is the base: only the lines made here and not saved yet are sent. */
      if (j.history.length) SERVER.base.set('history|' + id, JSON.stringify(j.history));
      /* The copy keeps a newer version a change sent meanwhile brought. */
      if (SERVER.copy) (SERVER.copy.history ||= {})[id] ??= j.history;
      HIST_FULL.add(id);
      /* Only its Timeline and All changes are drawn again: the rest of the page, and where the focus is, stay. */
      const o = st.tab === id ? byId(id) : null;
      if (o) refreshHistory(o);
    })
    .catch(() => { /* offline: what the page has is shown; tried again when the page is drawn next */ })
    .finally(() => { histLoading.delete(id); if (stale && st.tab === id) ensureHistory(id); }));
}
/* Makes what the page holds now the base the next save is compared with (SERVER.base). Records the load itself made
   (LOAD_FIX) are left out, so an admin's page saves them; a viewer's page takes them into the base instead. */
function setBaseline(){
  SERVER.base = new Map();
  for (const [k, d] of documents()) SERVER.base.set(k, JSON.stringify(d.value));
  /* Who is signed in is known only once the load is done: an admin's page then saves what the load made, anyone
     else's takes it into the base again. */
  const fix = LOAD_FIX ? [...LOAD_FIX.users.map(id => 'user|' + id), ...LOAD_FIX.objs.map(id => 'object|' + id)] : [];
  LOAD_FIX = null;
  if (!fix.length) return;
  fix.forEach(k => SERVER.base.delete(k));
  setTimeout(() => {
    if (isAdmin()) return queueServerSave();
    const now = documents();
    fix.forEach(k => { if (!SERVER.base.has(k) && now.has(k)) SERVER.base.set(k, JSON.stringify(now.get(k).value)); });
  }, 0);
}
/* Loads the inventory and its revisions from the server, and makes it the base for the next save. Changes not saved
   yet are saved first; what still cannot be saved (offline, signed out) is put back on top and saved later, so a
   reload never drops an edit. Records in skip are the ones someone else changed: their newer version is kept. After a restore (discard), the
   restored inventory replaces everything here. */
export async function reloadFromServer({ flush = true, skip = [], discard = false, data = null } = {}){
  let d = data;
  if (flush && !discard && SERVER.base && isAdmin()){
    if (SERVER.busy) await SERVER.inflight;
    const had = pendingChanges();
    await flushSave();
    /* An edit made while the changes were loading was just saved: the copy loaded before it is older, so read again. */
    if (had.puts.length || had.dels.length) d = null;
  }
  if (!d){
    const r = await fetch('api/state?history=0', {credentials: 'same-origin'});
    if (r.status === 401){ loginModal(); return false; }
    if (!r.ok){ toast('The inventory could not be loaded.'); return false; }
    d = await r.json();
    keepServerCopy(d);
  }
  /* Taken just before the server's version replaces the page's, so an edit made while it loaded is kept too. */
  const keep = !discard && SERVER.base && isAdmin() ? pendingChanges() : null;
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
    /* A change kept by a page from before 0.9.88 can still say Not in use or In repair: In stock now, as on the server. */
    if (c.kind === 'object' && (v.status === 'unused' || v.status === 'repair')) v.status = 'stock';
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
function dropMissingTabs(){
  const gone = id => !FIXED_TABS[id] && !byId(id);
  st.open = st.open.filter(id => !gone(id));
  st.tabIds = st.tabIds.filter(id => !gone(id));
  if (gone(st.tab)) st.tab = 'table';
}
/* Other people's saves show up here: when the server says something was saved (live.js), every 15 seconds without that
   (every 2 minutes with it), and when the window gets focus. Nothing is replaced while there
   are unsaved changes, a dialog is open, or someone is typing. A viewer cannot save, so what they changed on the page
   (a box moved on the map, a room a plan added) does not hold the refresh back: it is replaced by the server's. */
/* The inventory as the server last sent it, untouched by the page, with its running number (cseq): the next check asks
   only for what changed since (api/state?since=) and applies that to this copy. */
function keepServerCopy(d){
  SERVER.copy = Number.isInteger(d.cseq) ? structuredClone(d) : null;
  SERVER.cseq = Number.isInteger(d.cseq) ? d.cseq : null;
}
/* false when it was held back (see above) and asked the server nothing. */
/* Someone is in a field, or a dialog is open: what they type must not be redrawn away. */
const heldBack = () => !!$('#mdl') || !!$('#objSaved.dirty') || !!(document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));
export async function checkForChanges(){
  if (!SERVER.base || SERVER.busy || heldBack()) return false;
  const {puts, dels} = pendingChanges();
  /* Changes that could not be sent while the server was away are sent again here. */
  if ((puts.length || dels.length) && isAdmin()){ if (SERVER.save === 'offline') sendChanges(); return false; }
  let r;
  const delta = SERVER.copy && SERVER.cseq !== null, saves = SERVER.saves;
  try { r = await fetch(delta ? `api/state?since=${SERVER.cseq}` : 'api/state?history=0', {credentials: 'same-origin'}); } catch { setSave('offline'); return true; }
  if (!r.ok) return true;
  if (SERVER.save === 'offline') setSave('saved');
  const d = await r.json();
  /* A save started while this was on its way: the answer may be older than the page's own change, which would then look
     like someone else's and reload (losing Undo). It is dropped; the next check asks again. */
  if (SERVER.busy || SERVER.saves !== saves) return false;
  /* Asked before someone started typing (or opened a dialog) and answered after: dropped too, so nothing is redrawn under
     their hands; the next check asks again from the same point. */
  if (heldBack()) return false;
  if (d.delta){
    /* The page's own saves come back here too: the copy takes them, but only a record someone else wrote reloads. */
    const other = Object.keys(d.revs).some(k => (SERVER.revs[k] ?? 0) !== d.revs[k]);
    applyDelta(SERVER.copy, d); SERVER.cseq = d.cseq;
    if (other) await reloadFromServer({ data: structuredClone(SERVER.copy) });
    return true;
  }
  keepServerCopy(d);
  const revs = d.revs || {};
  const changed = Object.keys(revs).some(k => (SERVER.revs[k] ?? 0) !== revs[k]) || Object.keys(SERVER.revs).some(k => !(k in revs));
  if (changed) await reloadFromServer({ data: structuredClone(d) });
  return true;
}
/* Puts the server's inventory d into the page's shared lists and settings, replacing what was there, with defaults
   for what an older or new server does not send. Also links devices to people and forgets the cached photos. */
function applyState(d){
  UNDO.epoch++;
  /* The photos are read again when a device page opens: the server may have others now (a restore, another admin). */
  forgetPhotos();
  objs.splice(0, objs.length, ...d.objs.filter(o => !o.review));
  REVIEW.splice(0, REVIEW.length, ...d.objs.filter(o => o.review));
  rels.splice(0, rels.length, ...d.rels);
  Object.keys(HISTORY).forEach(k => delete HISTORY[k]); Object.assign(HISTORY, d.history);
  HIST_FULL.clear(); for (const k of Object.keys(d.history || {})) HIST_FULL.add(k);
  setUsers(d.users); LOCS.splice(0, LOCS.length, ...d.locs);
  SITES.splice(0, SITES.length, ...(d.sites || []));
  VLANS.splice(0, VLANS.length, ...(d.vlans || []));
  DOMAINS.splice(0, DOMAINS.length, ...(d.domains || []));
  MODELS.splice(0, MODELS.length, ...(d.models || []));
  CONTACTS.list = Array.isArray(d.contacts) ? d.contacts : [];
  COSTS.contracts = Array.isArray(d.contracts) ? d.contracts : []; COSTS.licences = Array.isArray(d.licences) ? d.licences : []; COSTS.currency = d.currency || 'CHF';
  st.typeRules = Array.isArray(d.typeRules) ? d.typeRules : null;
  st.graphUnmatched = Array.isArray(d.graphUnmatched) ? d.graphUnmatched : []; st.graphFields = d.graphFields && typeof d.graphFields === 'object' ? d.graphFields : null;
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
  st.useLansweeper = d.useLansweeper !== false; st.useAd = d.useAd !== false; st.useGraph = d.useGraph !== false; st.lsSource = d.lsSource === 'api' ? 'api' : 'push';
  st.lsPresence = d.lsPresence && typeof d.lsPresence === 'object' ? d.lsPresence : null;   /* the newest Lansweeper push day, for Gone from */
  st.lsNets = Array.isArray(d.lsNets) ? d.lsNets : [];   /* subnet suggestions from Lansweeper, read only */
  st.autoBackups = d.autoBackups !== false; st.typeMap = d.typeMap || {}; st.modelMap = d.modelMap || {}; st.skipIpOnly = !!d.skipIpOnly; st.mergeTwins = !!d.mergeTwins; st.adLocMap = d.adLocMap || {}; st.locMap = d.locMap || {}; st.locFromOffice = !!d.locFromOffice; st.adLocAuto = typeof d.adLocAuto === 'string' ? d.adLocAuto : ''; st.stockRooms = d.stockRooms && typeof d.stockRooms === 'object' ? d.stockRooms : {}; st.savedViews = Array.isArray(d.savedViews) ? d.savedViews : []; st.fieldOrder = d.fieldOrder || null; st.fieldMode = d.fieldMode || null; st.syncChanges = d.syncChanges || {}; st.stocktakes = Array.isArray(d.stocktakes) ? d.stocktakes : []; st.peopleNotSame = Array.isArray(d.peopleNotSame) ? d.peopleNotSame : []; st.groupRoles = Array.isArray(d.groupRoles) ? d.groupRoles : []; st.lifecycle = d.lifecycle && typeof d.lifecycle === 'object' ? d.lifecycle : {}; st.fillGraph = d.fillGraph !== false; st.fillAd = d.fillAd !== false; st.intake = d.intake && typeof d.intake === 'object' ? d.intake : {}; st.syncRuns = d.syncRuns && typeof d.syncRuns === 'object' ? d.syncRuns : {}; st.testRuns = d.testRuns && typeof d.testRuns === 'object' ? d.testRuns : {}; st.backupKeep = d.backupKeep || 10;
  /* For an admin: the last restore test and copy of the backups (for the bell), the last mail of each saved view. */
  st.restoreTest = d.restoreTest || null; st.backupExportRun = d.backupExportRun || null; st.viewMailRuns = d.viewMailRuns && typeof d.viewMailRuns === 'object' ? d.viewMailRuns : {};
  LOCS.forEach(l => { const x = l.split(' / ')[0]; if (!SITES.includes(x)) SITES.push(x); });   /* locations saved before sites existed */
  if (d.types){   /* the built-in types are always there; the saved ones add to them or change them */
    Object.keys(TYPES).forEach(k => delete TYPES[k]); Object.assign(TYPES, JSON.parse(JSON.stringify({ ...DEFAULT_TYPES, ...d.types })));
    /* A built-in type still in its old default colour takes the new one (OLD_TYPE_COLORS); a colour picked stays. */
    for (const [k, c] of Object.entries(OLD_TYPE_COLORS)) if (TYPES[k] && DEFAULT_TYPES[k] && String(TYPES[k].color || '').toLowerCase() === c) TYPES[k].color = DEFAULT_TYPES[k].color;
  }
  /* A new server has no saved policy yet: start from the defaults so the Settings panes can be drawn. */
  Object.assign(st, {policy: d.policy || {ip:true, mac:true, os:true, model:true, cpu:true, ram:true, fw:true, boot:true, disk:false, av:false, domain:true, user:false, loc:false, ip6:true, patch:true, software:true, links:true, dept:true, ipRoom:true}, feedOn: d.feedOn ?? true, feedSync: d.feedSync ?? true, ldap: d.ldap ?? {url: '', bindDn: '', base: '', filter: '', group: '', nightly: true, disable: true, last: null}, mapPos: d.mapPos || {}, lansweeper: d.lansweeper || {}});
  /* People made here for devices that named a user only by name (a Lansweeper record, an older inventory): they, and the
     devices now linked to them, are left out of the baseline so the next save sends them (an admin's; a viewer's page
     keeps them as they are). */
  const hadUsers = new Set(USERS.map(u => u.id)), hadUid = new Set([...objs, ...REVIEW].filter(o => o.uid).map(o => o.id));
  objs.forEach(bindUser); REVIEW.forEach(bindUser);
  LOAD_FIX = { users: USERS.filter(u => !hadUsers.has(u.id)).map(u => u.id), objs: [...objs, ...REVIEW].filter(o => o.uid && !hadUid.has(o.id)).map(o => o.id) };
  SYNC.defender = objs.some(o => o.defender);   /* the cards show a Defender mark once Defender has been read */
}
