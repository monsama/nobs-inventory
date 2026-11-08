/* Saving to the server: what changed since the last load, sent in batches, conflicts, changes kept offline. */
import { markHand, REVIEW, CONTACTS } from './01-core.js';
import { COMPANY, COSTS, MODELS, SUBNETS, DOMAINS, FIELD_LAYOUT, TYPE_FIELDS, $, FIELD_LABEL, HISTORY, LOCS, VLANS, PLANS, SITES, TYPES, byId, objs, rels, st, toast } from './01-core.js';
import { html } from './html.js';
import { USERS, isAdmin } from './04-settings.js';
import { leaveSettings, closeModal, modal } from './19-modal.js';
import { render, renderStatus } from './07-render.js';
import { reloadFromServer } from './server-load.js';
import { loginModal } from './signin.js';
/* The connection to the server: what it offers (LDAP, Lansweeper, Graph), the revision of each record this page has,
   and the state of the save in progress. Every change is sent to it; nothing is kept only in this browser. */
export const SERVER = {on: false, ldap: false, lansweeper: false, graph: false, timer: null, revs: {}, base: null, busy: false, again: false, watching: false, save: 'saved'};
export const setSave = v => { SERVER.save = v; renderStatus(); };
/* Without a connection (an inventory check in a basement, a phone between floors) what is not saved yet is also kept on this
   device, so closing the page or the phone dropping it loses nothing: after the next sign-in on it, by the same person,
   it goes back on top and is saved. Only this person's own unsaved changes; removed once saved or on sign-out. */
const OFFLINE_KEY = 'ni-offline';
function keepOffline(){
  try {
    const { puts, dels } = pendingChanges();
    if (!puts.length && !dels.length) return;
    localStorage.setItem(OFFLINE_KEY, JSON.stringify({ user: st.meId, at: new Date().toISOString(),
      puts: puts.map(({ kind, id, key, json, base }) => ({ kind, id, key, json, base })), dels: dels.map(({ kind, id, key, base }) => ({ kind, id, key, base })) }));
  } catch { /* storage full or blocked: the changes stay in the page, as before */ }
}
export function dropOffline(){ try { localStorage.removeItem(OFFLINE_KEY); } catch { /* none */ } }
export const offlineKept = () => { try { const v = JSON.parse(localStorage.getItem(OFFLINE_KEY) || 'null'); return v && v.user === st.meId ? v : null; } catch { return null; } };
if (typeof window !== 'undefined') window.addEventListener('online', () => { if (SERVER.base && SERVER.save === 'offline') sendChanges(); });
export function saveData(){ queueServerSave(); }
/* Saving. The page remembers, for every record, what it last saw (SERVER.base) and the revision the server gave it
   (SERVER.revs). A save sends only the records that differ from what it saw, each with that revision. A record that
   changed on the server since is not saved; the page then shows the newer version. */
const PREFERENCES = ['mapPos'];
/* Everything the page holds as the records the server stores, by key (kind|id): devices, devices under review,
   connections, users, types, history and one record per setting. Compared with SERVER.base to find the changes. */
export function documents(){
  const m = new Map();
  objs.forEach(o => m.set('object|' + o.id, {kind:'object', id:o.id, value:o}));
  REVIEW.forEach(o => m.set('object|' + o.id, {kind:'object', id:o.id, value:o}));
  rels.forEach(r => m.set('rel|' + r.id, {kind:'rel', id:String(r.id), value:r}));
  USERS.forEach(u => m.set('user|' + u.id, {kind:'user', id:u.id, value:u}));
  Object.entries(TYPES).forEach(([k, t]) => m.set('type|' + k, {kind:'type', id:k, value:t}));
  Object.entries(HISTORY).forEach(([k, h]) => { if (h.length) m.set('history|' + k, {kind:'history', id:k, value:h}); });
  /** @type {Record<string, any>} */
  const settings = {...(st.syncSchedule ? {syncSchedule: st.syncSchedule} : {}), autoBackups: st.autoBackups !== false, fieldLayout: FIELD_LAYOUT, locs: LOCS, sites: SITES, vlans: VLANS, domains: DOMAINS, models: MODELS, subnets: SUBNETS, typeFields: TYPE_FIELDS, lansweeper: st.lansweeper, policy: st.policy, feedOn: st.feedOn, feedSync: st.feedSync, ldap: st.ldap, mapPos: st.mapPos, plans: PLANS, useLansweeper: st.useLansweeper !== false, useAd: st.useAd !== false, useGraph: st.useGraph !== false, lsSource: st.lsSource === 'api' ? 'api' : 'push', typeMap: st.typeMap || {}, modelMap: st.modelMap || {}, skipIpOnly: !!st.skipIpOnly, mergeTwins: !!st.mergeTwins, adLocMap: st.adLocMap || {}, locMap: st.locMap || {}, locFromOffice: !!st.locFromOffice, stockRooms: st.stockRooms || {}, savedViews: st.savedViews || [], fieldOrder: st.fieldOrder || {}, fieldMode: st.fieldMode || {}, stocktakes: st.stocktakes || [], peopleNotSame: st.peopleNotSame || [], groupRoles: st.groupRoles || [], lifecycle: st.lifecycle || {}, fillGraph: st.fillGraph !== false, fillAd: st.fillAd !== false, intake: st.intake || {}, backupKeep: st.backupKeep || 10, contracts: COSTS.contracts, licences: COSTS.licences, contacts: CONTACTS.list, currency: COSTS.currency || 'CHF', company: {name: COMPANY.name || '', logo: COMPANY.logo || ''}};
  /* The type rules are kept only once edited; back to the defaults removes them, so the shipped ones apply. */
  if (Array.isArray(st.typeRules)) settings.typeRules = st.typeRules;
  Object.entries(settings).forEach(([k, v]) => m.set('setting|' + k, {kind:'setting', id:k, value:v}));
  return m;
}
/* Only an admin saves: a viewer's page sends nothing (what moved on their screen, a box on the map, goes with the next
   reload). */
export function pendingChanges(){
  const now = documents(), puts = [], dels = [];
  if (!isAdmin()) return {puts, dels};
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
/* Changes are sent in batches of about BATCH.bytes and at most BATCH.items (the server takes 5000 at once), so a large
   edit is not refused as too big. Each batch is saved on its own. */
export const BATCH = { bytes: 2000000, items: 4000 };
export function batches(puts, dels){
  const out = []; let cur = {puts: [], dels: []}, size = 0;
  const add = (kind, c) => {
    const n = (c.json || '').length + String(c.id || '').length + 100;
    if ((size + n > BATCH.bytes || cur.puts.length + cur.dels.length >= BATCH.items) && (cur.puts.length || cur.dels.length)){ out.push(cur); cur = {puts: [], dels: []}; size = 0; }
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
/* Sends the pending changes to api/changes in batches (admin only). Takes in the codes and revisions given back;
   a refused record (403) is taken back, a conflict shows the newer version and what was not saved. Without a
   connection the changes are kept on this device and the save shows offline. */
async function sendNow(){
  if (!isAdmin()) return;
  const pending = pendingChanges();
  if (!pending.puts.length && !pending.dels.length) return;
  SERVER.busy = true; SERVER.saves = (SERVER.saves || 0) + 1; setSave('saving');
  let ok = false;
  try {
    for (const {puts, dels} of batches(pending.puts, pending.dels)) {
      const body = {puts: puts.map(({kind, id, value, base}) => ({kind, id, value, base})), dels: dels.map(({kind, id, base}) => ({kind, id, base}))};
      const r = await fetch('api/changes', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify(body)});
      if (r.status === 401){ loginModal('Your sign-in has ended. Sign in again.'); setSave('failed'); return; }
      const j = await r.json().catch(() => ({}));
      /* Refused for good (403: not this person's to change): those changes are taken back from the server's version, so
         they neither block every later save nor come back with a reload. */
      if (r.status === 403){
        toast('Not saved: ' + (j.error || 'not yours to change') + ' The change was taken back.');
        SERVER.busy = false;
        await reloadFromServer({ flush: false, skip: [...puts, ...dels].map(c => c.key) });
        setSave('saved'); return;
      }
      if (!r.ok){ toast('Not saved: ' + (j.error || r.status)); setSave('failed'); return; }
      for (const [id, code] of Object.entries(j.codes || {})){ const o = byId(id); if (o) o.code = code; }
      if (Object.keys(j.codes || {}).length) render();
      const sent = new Map([...puts, ...dels].map(c => [c.key, c]));
      for (const [key, rev] of Object.entries(j.revs || {})){
        SERVER.revs[key] = rev;
        /* A record the server wrote along with this save (the code counter): only its version is kept. */
        const c = sent.get(key); if (!c) continue;
        if (c.json === undefined){ SERVER.base.delete(key); continue; }
        const v = JSON.parse(c.json); if (j.codes && j.codes[c.id]) v.code = j.codes[c.id];
        SERVER.base.set(key, JSON.stringify(v));
      }
      if (j.conflicts && j.conflicts.length){
        const KIND_NAME = { object: 'a device', rel: 'a connection', setting: 'a setting', user: 'a user', type: 'a device type', history: 'a history entry' };
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
    if (SERVER.save !== 'offline') toast('No connection: your changes are kept on this device and sent when it is back.');
    keepOffline();
    setSave('offline');
  } finally {
    SERVER.busy = false;
    if (ok){ setSave('saved'); if (!pendingChanges().puts.length) dropOffline(); }
    if (SERVER.again){ SERVER.again = false; queueServerSave(); }
  }
}
/* The fields a person changed on an object, to offer them again after a refused save. */
const NOT_EDITED = ['id', 'code', 'feed'];
function changedFields(mine, base){ return Object.keys(mine).filter(k => !NOT_EDITED.includes(k) && JSON.stringify(mine[k]) !== JSON.stringify((base || {})[k])); }
const shown = v => (v && typeof v === 'object') ? JSON.stringify(v) : String(v ?? '');
/* Shows what a person changed and the newer version, so a refused edit is not lost. */
function refusedModal(items){
  modal(html`<div class="mh">Not saved: changed by someone else</div>
    <div class="mb"><p class="note">Someone else saved these records first, so your changes were not saved. The inventory shows their version. You can apply your changes again.</p>
      ${items.map(it => html`<div class="panelbox"><div class="hdr">${it.name}${it.gone && html` <span class="muted">· deleted by someone else</span>`}</div>
        ${it.fields.length > 0 && html`<table class="grid mini" style="min-width:0"><thead><tr><th>Field</th><th>Yours</th><th>Theirs</th></tr></thead><tbody>${it.fields.map(f => html`<tr><td>${FIELD_LABEL[f.k] || f.k}</td><td>${shown(f.mine)}</td><td>${shown(f.theirs)}</td></tr>`)}</tbody></table>`}
      </div>`)}</div>
    <div class="mf"><button id="rfKeep">Keep theirs</button><button id="rfApply" class="primary">Apply mine again</button></div>`, 'wide');
  $('#rfKeep').onclick = closeModal;
  $('#rfApply').onclick = () => {
    let n = 0;
    for (const it of items){ const o = byId(it.id); if (!o || it.gone) continue; for (const f of it.fields){ o[f.k] = f.mine; if (f.k !== 'src') markHand(o, f.k); n++; } }
    closeModal(); saveData(); render(); toast(n ? 'Your changes are applied again' : 'Nothing to apply');
  };
}
/* Clears the devices, relations and history on the server for everyone; users, locations, types and settings stay, the
   racks too unless their box is ticked.
   It deletes every device, so it asks first, and only goes ahead when the word CLEAR is typed. */
export function clearConfirm(){
  modal(html`<div class="mh">Clear the whole inventory?</div>
    <div class="mb"><p class="note">This deletes every device on the server, with its relations and history, for everyone, and takes them out of the contracts that list them. Users, locations, sites, floor plans, contracts and settings stay, and so do the racks and the objects excluded from sync unless you tick the boxes below. A backup is taken first and kept until you delete it: restoring it (Settings → System → Backups) brings the devices back.</p>
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
async function clearAll(){
  if (!isAdmin()){ toast('Only an admin can clear the inventory.'); return; }
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
  /* In batches, as a large inventory has more records than the server takes at once. */
  const j = { conflicts: [] };
  for (const b of batches(puts, dels)){
    const res = await fetch('api/changes', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify(b)});
    const r1 = await res.json().catch(() => ({}));
    if (!res.ok){ toast('Not cleared: ' + (r1.error || res.status)); await reloadFromServer(); return; }
    j.conflicts.push(...(r1.conflicts || []));
  }
  /* The connections go after the devices, so the save above cannot write their settings back. */
  let connMsg = '';
  if ($('#clrConn') && $('#clrConn').checked){
    const c = await fetch('api/connections/clear', {method: 'POST', credentials: 'same-origin'});
    connMsg = c.ok ? ' Connections removed.' : ' The connections could not be removed.';
  }
  leaveSettings(); closeModal();   /* the emptied inventory is shown, not Settings */
  await reloadFromServer();
  toast((j.conflicts && j.conflicts.length ? 'Cleared, except ' + j.conflicts.length + ' record(s) that someone changed meanwhile' : (kept ? 'Cleared. ' + kept + ' excluded device' + (kept === 1 ? ' kept' : 's kept') : 'Inventory cleared')) + connMsg);
}
