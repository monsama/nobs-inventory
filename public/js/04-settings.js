import { DEFAULT_TYPE_RULES, RULE_FIELDS } from './type-rules.js';
import { EVERY_HOURS, SCHEDULE_JOBS, nextRun, scheduleOf, scheduleText } from './schedule.js';
import { COMPANY, dayText, daysSince, SYNC, hiddenOf, FIELD_LABEL, complianceChip } from './01-core.js';
import { setSettingsOpener, collapsedPanels, rememberPanel, typeFieldsOf, canAddPorts, fieldKind, bindPolicy, closeModal, modal, policyGrid, followOnTop } from './03-object-modals.js';
import { overlapProblem, subnetSpan, ipInt } from './net.js';
import { SUBNETS, VIEWBOX_RE, tcol } from './01-core.js';
import { subnetProblem } from './net.js';
import { pad2, tico, $, BUILTIN, MODELS, modelNames, DOMAINS, FIELD_LAYOUT, ICON, LOCS, LS_ON, PLANS, PW_MIN, SITES, TYPE_FIELDS, TYPES, VLANS, fullTextTooltips, rels, byId, esc, hist, iconSvg, now, objs, rackUnits, racksList, st, toast } from './01-core.js';
import { SERVER, clearConfirm, flushSave, loadVersion, queueServerSave, reloadFromServer, render } from './07-render-plans.js';
import { CARD_FIELDS, cardLines } from './02-views.js';
import { sheetModal } from './08-sheets.js';
/* ---------- settings ---------- */
/* ---------- settings: tabs, as in NOBS SQL ---------- */
export const SET_TABS = [['feed','Feed'],['directory','LDAP & Graph'],['locations','Locations'],['vlans','Network'],['types','Object types'],['users','Users'],['maintenance','Maintenance'],['log','Log'],['about','About']];
export function openSettings(){
  /* A dialog opened from here brings Settings back when it closes. */
  setSettingsOpener(openSettings);
  snEdit = null; snDraft = null;   /* Settings opens with no subnet half edited */
  modal(`<div class="mh">Settings</div>
    <div class="settabs" id="setTabs">${SET_TABS.map(([k,l]) => `<button class="tab" data-st="${k}">${l}</button>`).join('')}</div>
    <div class="mb" id="setPane"></div>
    <div class="mf">${canEdit() ? '<button id="setReset" class="danger-text" style="margin-right:auto">Clear inventory…</button>' : '<span style="margin-right:auto"></span>'}<button id="setClose" class="primary">Done</button></div>`, 'settings');
  $('#setTabs').addEventListener('click', e => { const t = e.target.closest('[data-st]'); if (!t) return; st.setTab = t.dataset.st; renderSetPane(); });
  collapsibleSections($('#setPane'), 'set:');
  $('#setClose').onclick = closeModal;
  const sr = $('#setReset');
  if (sr) sr.onclick = () => clearConfirm();
  renderSetPane();
}
/* The switch that turns Lansweeper on or off for this inventory. */
export function renderLsToggle(){
  const host = $('#setLsToggle'); if (!host) return;
  const ro = canEdit() ? '' : 'disabled';
  const on = LS_ON(), api = st.lsSource === 'api';
  host.innerHTML = `<div class="panelbox"><div class="hdr">Lansweeper</div>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)">
      <label for="useLs">Connect Lansweeper</label>
      <div><label class="pchk" style="width:auto"><input type="checkbox" id="useLs" ${on ? 'checked' : ''} ${ro}> ${on ? 'On. Lansweeper data is pulled in and shown.' : 'Off. Lansweeper is not used: its settings, data and panels are hidden.'}</label></div>
      <label for="lsSource">Data comes from</label>
      <div><select id="lsSource" ${ro} ${on ? '' : 'disabled'} aria-label="Where the Lansweeper data comes from">
        <option value="push" ${api ? '' : 'selected'}>Script push (recommended): the script on the Lansweeper server sends the data</option>
        <option value="api" ${api ? 'selected' : ''}>Lansweeper API: this server fetches the data</option></select>
        <p class="note" style="margin:6px 0 0">Only one of the two runs at a time, so they cannot overwrite each other. A manual CSV import is always available.</p></div>
    </div></div>`;
  const c = $('#useLs');
  if (c && canEdit()) c.onchange = () => { st.useLansweeper = c.checked; queueServerSave(); renderSetPane(); render(); };
  const src = $('#lsSource');
  if (src && canEdit()) src.onchange = () => { st.lsSource = src.value; queueServerSave(); renderSetPane(); };
}
/* ---------- Lansweeper type names -> object types, and skipping devices named only by an IP address ---------- */
/* Applies the mapping of one Lansweeper name (lower case) to the synced devices that carry it. Only that row is applied, so a type
   set by hand on another device is kept. Excluded and detached devices are left alone. Returns how many changed. */
export function applyTypeMap(only){
  let n = 0;
  for (const [name, type] of Object.entries(st.typeMap || {})) {
    if (!TYPES[type] || name.toLowerCase() !== only) continue;
    for (const o of objs) {
      const fromLs = o.feed && String(o.feed.assetType || '').toLowerCase() === name.toLowerCase();
      if (!fromLs || o.excluded || o.detached || o.type === type) continue;
      hist(o, now(), `Type changed to ${TYPES[type].label} by the type mapping of ${name}`);
      o.type = type; n++;
    }
  }
  return n;
}
/* The models on the devices, with how many devices have each. Renaming one here renames it on every device, and the old name
   is kept as a Lansweeper name, so the next sync maps it to the new one instead of bringing the old name back. */
export function renderSetModels(){
  const root = $('#setModels');
  if (!root) return;
  const edit = canEdit(), ro = edit ? '' : 'disabled';
  const count = {};
  for (const o of objs) if (o.model) count[o.model] = (count[o.model] || 0) + 1;
  const names = modelNames();
  root.innerHTML = `<div class="hdr">Models <span class="cnt">${names.length}</span></div>
    <p class="note" style="padding:10px 12px 6px">A model typed on a device is kept here, and every device can choose it. Renaming a model renames it on every device that has it. The old name still maps to the new one when Lansweeper sends it.</p>
    <div class="lrows">${names.length ? names.map((m, i) => `<div class="lrow mdl"><input data-mdn="${i}" value="${esc(m)}" aria-label="Model name" ${ro}><span class="muted">${count[m] ? count[m] + (count[m] === 1 ? ' device' : ' devices') : 'Not used yet'}</span>${!count[m] && edit ? `<button data-mdx="${i}" class="danger-text">Remove</button>` : '<span></span>'}</div>`).join('') : '<p class="note lempty">No models yet. A model appears here when a device has one.</p>'}</div>`;
  if (!edit) return;
  root.querySelectorAll('[data-mdn]').forEach(i => i.onchange = () => renameModel(names[+i.dataset.mdn], i.value));
  root.querySelectorAll('[data-mdx]').forEach(b => b.onclick = () => removeModel(names[+b.dataset.mdx]));
}
export function removeModel(name){
  const k = MODELS.indexOf(name);
  if (k >= 0) MODELS.splice(k, 1);
  queueServerSave(); renderSetModels();
}
export function renameModel(old, value){
  const name = value.trim();
  if (!name || name === old){ renderSetModels(); return; }
  if (name.length > 120){ toast('A model name is up to 120 characters.'); renderSetModels(); return; }
  for (const o of objs) if (o.model === old){ o.model = name; hist(o, now(), `Model renamed from ${old} to ${name} by ${who()}`); }
  /* The list follows the rename, so the new name is offered and the old one is not. */
  const k = MODELS.indexOf(old); if (k >= 0) MODELS[k] = name;
  MODELS.splice(0, MODELS.length, ...new Set(MODELS));
  /* A Lansweeper name that led to the old name now leads to the new one, and the old name leads to it too. */
  st.modelMap = Object.fromEntries(Object.entries(st.modelMap || {}).map(([from, to]) => [from, to === old ? name : to]));
  st.modelMap[old] = name;
  queueServerSave(); render(); renderSetModels();
}
export function renderTypeMap(){
  if (!$('#setTypeMap')) return;
  if (!LS_ON()){ $('#setTypeMap').innerHTML = ''; return; }
  const edit = canEdit(), ro = edit ? '' : 'disabled';
  const entries = Object.entries(st.typeMap || {});
  const typeOptions = sel => Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(t.label)}</option>`).join('');
  const rows = entries.map(([name, type], i) => `<div class="lrow tmap"><input data-tmn="${i}" value="${esc(name)}" aria-label="Lansweeper type name" ${ro}>
    <select data-tmt="${i}" aria-label="Object type" ${ro}>${typeOptions(type)}</select><button data-tmd="${i}" ${ro}>Remove</button></div>`).join('');
  $('#setTypeMap').innerHTML = `<div class="panelbox"><div class="hdr">Lansweeper type names <span class="cnt">${entries.length}</span></div>
    <p class="note" style="padding:10px 12px 6px">Sets the object type a Lansweeper type name becomes. It applies when a device syncs, and when a row is saved to devices already synced with that name. Names are matched without case. Names not listed here use the built-in rules.</p>
    <div class="lrows"><div class="lrow tmap head"><span>Lansweeper name</span><span>Object type</span><span></span></div>
      ${rows || '<p class="note lempty">No names yet.</p>'}</div>
    <div class="lpanel-add"><input id="tmName" placeholder="Lansweeper name, e.g. DECT base" aria-label="Lansweeper type name" ${ro}><select id="tmType" aria-label="Object type" ${ro}>${typeOptions('')}</select><button id="tmAdd" class="primary" ${ro}>Add</button></div>
</div>`;
  const put = (list, name) => {
    st.typeMap = Object.fromEntries(list.filter(([n]) => n));
    const changed = applyTypeMap(name?.toLowerCase()); if (changed) toast(`${changed} synced ${changed === 1 ? 'device' : 'devices'} changed type`);
    queueServerSave(); renderTypeMap();
  };
  if (!edit) return;
  $('#setTypeMap').querySelectorAll('[data-tmn]').forEach(i => i.onchange = () => { const l = entries.slice(); l[+i.dataset.tmn][0] = i.value.trim(); put(l, l[+i.dataset.tmn][0]); });
  $('#setTypeMap').querySelectorAll('[data-tmt]').forEach(i => i.onchange = () => { const l = entries.slice(); l[+i.dataset.tmt][1] = i.value; put(l, l[+i.dataset.tmt][0]); });
  $('#setTypeMap').querySelectorAll('[data-tmd]').forEach(b => b.onclick = () => { const l = entries.slice(); l.splice(+b.dataset.tmd, 1); put(l); });
  $('#tmAdd').onclick = () => {
    const name = $('#tmName').value.trim();
    if (!name){ toast('Give the Lansweeper name first.'); return; }
    if (entries.some(([n]) => n.toLowerCase() === name.toLowerCase())){ toast(name + ' is already in the table.'); return; }
    put([...entries, [name, $('#tmType').value]], name);
  };

}
/* The type rules: shipped with the app and editable here. The first rule that matches a device decides its type. A copy
   of the shipped list is kept once it is changed; Back to the defaults goes back to the shipped one. */
export function renderTypeRules(){
  const el = $('#setTypeRules'); if (!el) return;
  if (!LS_ON()){ el.innerHTML = ''; return; }
  const edit = canEdit(), ro = edit ? '' : 'disabled';
  const own = Array.isArray(st.typeRules);
  const rules = own ? st.typeRules : DEFAULT_TYPE_RULES;
  const opt = (map, sel) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(typeof v === 'string' ? v : v.label)}</option>`).join('');
  el.innerHTML = `<div class="panelbox"><div class="hdr">Type rules <span class="cnt">${own ? 'changed' : 'as shipped'} · ${rules.length}</span></div>
    <p class="note">The type a device from Lansweeper gets: the first rule that matches decides, top to bottom. The names in the table above come first, and Windows' own word (workstation or server) last. Words are separated by commas; a word of three letters or less matches a whole word only.</p>
    <div style="overflow-x:auto"><table class="grid mini trules" style="min-width:760px;table-layout:fixed"><colgroup><col style="width:44px"><col style="width:200px"><col><col style="width:180px"><col style="width:112px"></colgroup>
      <thead><tr><th>On</th><th>Looks at</th><th>Contains any of</th><th>Type</th><th></th></tr></thead><tbody>
      ${rules.map((x, i) => `<tr${x.on === false ? ' class="off"' : ''}><td><input type="checkbox" data-tron="${i}" ${x.on !== false ? 'checked' : ''} aria-label="Rule ${i + 1} on" ${ro}></td>
        <td><select data-trf="${i}" aria-label="Rule ${i + 1} looks at" ${ro}>${opt(RULE_FIELDS, x.field)}</select></td>
        <td><input data-trw="${i}" value="${esc(x.words)}" aria-label="Rule ${i + 1} words" ${ro}></td>
        <td><select data-trt="${i}" aria-label="Rule ${i + 1} type" ${ro}>${opt(TYPES, x.to)}</select></td>
        <td class="act"><button class="icon ghost" data-trup="${i}" aria-label="Move rule ${i + 1} up" title="Up" ${ro || (i ? '' : 'disabled')}>↑</button><button class="icon ghost" data-trdn="${i}" aria-label="Move rule ${i + 1} down" title="Down" ${ro || (i < rules.length - 1 ? '' : 'disabled')}>↓</button><button class="icon ghost" data-trdel="${i}" aria-label="Remove rule ${i + 1}" title="Remove" ${ro}>×</button></td></tr>`).join('')}
      </tbody></table></div>
    <div class="addrel" style="padding:10px 12px"><button id="trAdd" ${ro}>Add a rule</button>${own ? `<button id="trReset" ${ro}>Back to the defaults</button>` : ''}<div class="grow"></div><button id="trApply" class="primary" ${ro}>Apply to existing devices…</button></div></div>`;
  if (!edit) return;
  /* Any change keeps a copy of the list: from then on it is this inventory's own. */
  const put = list => { st.typeRules = list; queueServerSave(); renderTypeRules(); };
  const copy = () => rules.map(x => ({...x}));
  el.querySelectorAll('[data-tron]').forEach(c => c.onchange = () => { const l = copy(); l[+c.dataset.tron].on = c.checked; put(l); });
  el.querySelectorAll('[data-trf]').forEach(c => c.onchange = () => { const l = copy(); l[+c.dataset.trf].field = c.value; put(l); });
  el.querySelectorAll('[data-trt]').forEach(c => c.onchange = () => { const l = copy(); l[+c.dataset.trt].to = c.value; put(l); });
  el.querySelectorAll('[data-trw]').forEach(c => c.onchange = () => { if (!c.value.trim()){ toast('A rule needs words to look for.'); c.value = rules[+c.dataset.trw].words; return; } const l = copy(); l[+c.dataset.trw].words = c.value.trim(); put(l); });
  const move = (i, d) => { const l = copy(); [l[i], l[i + d]] = [l[i + d], l[i]]; put(l); };
  el.querySelectorAll('[data-trup]').forEach(b => b.onclick = () => move(+b.dataset.trup, -1));
  el.querySelectorAll('[data-trdn]').forEach(b => b.onclick = () => move(+b.dataset.trdn, 1));
  el.querySelectorAll('[data-trdel]').forEach(b => b.onclick = () => { const l = copy(); l.splice(+b.dataset.trdel, 1); put(l); });
  $('#trAdd').onclick = () => { put([{field: 'model', words: 'new words', to: 'other', on: true}, ...copy()]); const w = el.querySelector('[data-trw="0"]'); if (w){ w.focus(); w.select(); } };
  const reset = $('#trReset'); if (reset) reset.onclick = () => { if (confirm('Go back to the rules shipped with the app? Your changes to the rules are lost.')) put(null); };
  $('#trApply').onclick = retypeModal;
}
/* Apply to existing devices: what would change, each with a box; only the ticked ones change. A type set by hand is
   never in the list. */
async function retypeModal(){
  await flushSave();
  const r = await fetch('api/feed/retype', {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: '{}'});
  const j = await r.json().catch(() => ({}));
  if (!r.ok){ toast(j.error || 'The rules could not be checked.'); return; }
  const list = j.changes || [];
  const label = t => esc(TYPES[t] ? TYPES[t].label : t);
  modal(`<div class="mh">Apply the type rules to existing devices</div>
    <div class="mb">${list.length ? `<p class="note">${list.length} ${list.length === 1 ? 'device from Lansweeper gets' : 'devices from Lansweeper get'} another type by the rules. Untick the ones to leave as they are. A type set by hand is never changed, and each change is in the device's history.</p>
      <div style="overflow:auto;max-height:52vh"><table class="grid mini" style="min-width:680px"><thead><tr><th><input type="checkbox" id="rtAll" checked aria-label="All"></th><th>Device</th><th>Lansweeper type</th><th>Model</th><th>Now</th><th>Becomes</th></tr></thead><tbody>
      ${list.map(x => `<tr><td><input type="checkbox" data-rt="${esc(x.id)}" checked aria-label="Change ${esc(x.name)}"></td><td><b>${esc(x.name)}</b> <span class="code">${esc(x.code)}</span></td><td>${esc(x.assetType)}</td><td>${esc(x.model)}</td><td>${label(x.from)}</td><td><b>${label(x.to)}</b></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="note">Every device from Lansweeper already has the type the rules give it.</p>'}</div>
    <div class="mf"><button id="rtCancel">${list.length ? 'Cancel' : 'Close'}</button>${list.length ? `<button id="rtOk" class="primary">Change ${list.length} ${list.length === 1 ? 'device' : 'devices'}</button>` : ''}</div>`, 'wide');
  $('#rtCancel').onclick = closeModal;
  if (!list.length) return;
  const boxes = () => [...document.querySelectorAll('[data-rt]')];
  const count = () => { const n = boxes().filter(b => b.checked).length; $('#rtOk').textContent = `Change ${n} ${n === 1 ? 'device' : 'devices'}`; $('#rtOk').disabled = !n; };
  $('#rtAll').onchange = e => { boxes().forEach(b => { b.checked = e.target.checked; }); count(); };
  boxes().forEach(b => b.onchange = count);
  $('#rtOk').onclick = async () => {
    const ids = boxes().filter(b => b.checked).map(b => b.dataset.rt);
    const x = await fetch('api/feed/retype', {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ids})});
    const k = await x.json().catch(() => ({}));
    if (!x.ok){ toast(k.error || 'Not changed.'); return; }
    closeModal(); toast(`${k.changed} ${k.changed === 1 ? 'device' : 'devices'} changed type`); await reloadFromServer();
  };
}
/* Microsoft Graph: the join status, Intune enrolment and compliance of the devices, matched by serial number. Set up in
   four steps; the server makes the certificate and keeps its key, so no file is copied to the server. */
const ENTRA = 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade';
/* When a sync runs by itself: an interval from a start time, or off. Saved with the settings; the server picks it up at once. */
export function scheduleRowHtml(job, edit){
  const plan = scheduleOf(st)[job], ro = edit ? '' : 'disabled';
  const label = h => h === 0 ? 'Off (only Sync now)' : h === 24 ? 'Daily' : h === 1 ? 'Every hour' : `Every ${h} hours`;
  return `<div class="sched-row" data-sched="${job}"><span class="sched-l">Runs by itself</span>
    <select data-sched-every="${job}" aria-label="How often ${esc(SCHEDULE_JOBS[job])} syncs" ${ro}>${EVERY_HOURS.map(h => `<option value="${h}" ${h === plan.every ? 'selected' : ''}>${label(h)}</option>`).join('')}</select>
    <span class="sched-from" ${plan.every ? '' : 'hidden'}>${plan.every === 24 ? 'at' : 'from'}</span><input type="time" data-sched-at="${job}" value="${esc(plan.at)}" aria-label="Start time" ${plan.every ? '' : 'hidden'} ${ro}>
    <span class="muted sched-next">${plan.every ? 'next at ' + nextRun(plan) : ''}</span></div>`;
}
export function bindScheduleRows(root){
  root.querySelectorAll('[data-sched]').forEach(row => {
    const job = row.dataset.sched, every = row.querySelector('[data-sched-every]'), at = row.querySelector('[data-sched-at]');
    const save = () => {
      const v = {every: +every.value, at: at.value || '06:00'};
      st.syncSchedule = {...(st.syncSchedule || {}), [job]: v};
      queueServerSave();
      row.outerHTML = scheduleRowHtml(job, true);
      bindScheduleRows(root);
      toast(`${SCHEDULE_JOBS[job]}: ${scheduleText(v)}`);
    };
    every.onchange = save; at.onchange = save;
  });
}
/* What a sync found, in one message: records are what Graph lists, devices what they come to once duplicates are one. */
export function graphSummary(c){
  const n = (k, one, many) => c[k] ? ` ${c[k]} ${c[k] === 1 ? one : many}` : '';
  const devices = c.devices ?? c.records;
  return [`${c.records ?? devices} records in Entra and Intune for ${devices} devices: ${c.matched} matched${c.filled ? `, ${c.filled} empty fields filled in` : ''}.`,
    c.duplicates ? `${c.duplicates} duplicate record${c.duplicates === 1 ? '' : 's'}: the current one is used (filter Duplicates in Entra).` : '',
    c.unmatched ? `${c.unmatched} not in the inventory: see the list below.` : '',
    c.ambiguous ? `${c.ambiguous} fit${c.ambiguous === 1 ? 's' : ''} more than one device here and ${c.ambiguous === 1 ? 'was' : 'were'} put on none: see below.` : '',
    c.gone ? `${n('gone', 'device is', 'devices are').trim()} no longer in Entra or Intune.` : ''].filter(Boolean).join(' ');
}
/* The devices Graph has that the inventory does not, from the last sync: each can be added, with what Graph knows. */
function unmatchedHtml(edit){
  const list = st.graphUnmatched || [];
  if (!list.length) return '';
  const day = t => { const d = t ? new Date(t) : null; return d && !isNaN(d) ? `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}` : ''; };
  return `<div class="gu-box"><div class="gs-head" style="padding:10px 12px 0"><b>In Entra or Intune, not in the inventory</b><span class="cnt">${list.length}</span></div>
    <p class="note" style="padding:4px 12px 8px">Found at the last sync, by neither serial number nor name. Often phones and tablets Lansweeper does not scan, or devices named differently. Added ones get their type from their system, and Graph keeps them up to date.</p>
    <div style="overflow:auto;max-height:340px;border-top:1px solid var(--bd2)"><table class="grid mini" id="guList" style="min-width:0"><thead><tr><th><input type="checkbox" id="guAllBox" aria-label="Select all" ${edit ? '' : 'disabled'}></th><th>Name</th><th>System</th><th>Model</th><th>Serial</th><th>Primary user</th><th>Compliance</th><th>Last contact</th></tr></thead><tbody>
      ${list.map(d => `<tr><td><input type="checkbox" data-gu="${esc(d.id)}" aria-label="Select ${esc(d.name)}" ${edit ? '' : 'disabled'}></td><td>${esc(d.name)}${d.others ? ` <span class="chip warn" title="Entra lists this device ${d.others + 1} times; the current record is shown">×${d.others + 1}</span>` : ''}</td><td>${esc(d.os || d.platform || (d.join ? d.join : ''))}</td><td>${esc(d.model || '')}</td><td class="mono">${esc(d.serial || '')}</td><td>${esc(d.owner || '')}</td><td>${complianceChip(d.compliance)}</td><td>${esc(day(d.lastSync))}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="addrel" style="padding:8px 12px"><button id="guAdd" disabled>Add selected</button><button id="guAddAll" ${edit ? '' : 'disabled'}>Add all ${list.length}</button></div></div>`;
}
/* Graph records that fit more than one device here, by serial number or name: put on none of them, listed to be fixed. */
function ambiguousHtml(){
  const list = st.graphAmbiguous || [];
  if (!list.length) return '';
  const dev = id => { const o = byId(id); return o ? `<button class="link" data-open="${esc(id)}" title="Open ${esc(o.name)}">${esc(o.code)} ${esc(o.name)}</button>` : ''; };
  return `<div class="gu-box"><div class="gs-head" style="padding:10px 12px 0"><b>Fits more than one device here</b><span class="cnt">${list.length}</span></div>
    <p class="note" style="padding:4px 12px 8px">Graph has these devices, but their serial number or name is used by more than one device in the inventory, so Graph put them on none. Give the devices distinct names or serial numbers, or retire the extra one, then sync again.</p>
    <div style="overflow:auto;max-height:240px;border-top:1px solid var(--bd2)"><table class="grid mini" id="gaList" style="min-width:0"><thead><tr><th>In Graph</th><th>Same</th><th>Devices here</th></tr></thead><tbody>
      ${list.map(a => `<tr><td>${esc(a.name)}${a.serial ? ` <span class="mono muted">${esc(a.serial)}</span>` : ''}</td><td>${a.by === 'serial' ? 'serial number' : 'name'}</td><td>${a.devices.map(dev).filter(Boolean).join(', ')}</td></tr>`).join('')}
    </tbody></table></div></div>`;
}
export async function renderSetGraph(){
  const root = $('#setGraph');
  if (!root) return;
  const edit = canEdit();
  const r = edit ? await fetch('api/graph/status', {credentials: 'same-origin'}).catch(() => null) : null;
  const j = r && r.ok ? await r.json().catch(() => null) : null;
  if (!$('#setGraph')) return;
  const g = j || {configured: SERVER.graph, source: null, tenant: '', clientId: '', certs: []};
  const fromServer = g.source === 'server';
  const ids = !!(g.tenant && g.clientId);
  const chosen = g.certs.find(c => c.chosen && c.onServer);
  const done = ok => ok ? '<span class="chip ok" title="Done" aria-label="done">✓</span>' : '';
  const day = t => esc(dayText(String(t || '').slice(0, 10)));
  const left = t => Math.floor((new Date(t) - Date.now()) / 86400000);
  const certRows = g.certs.map(c => `<tr><td class="mono">${esc(c.thumbprint)}</td><td>${day(c.created)}</td>
      <td>${day(c.expires)}${left(c.expires) < 60 ? ` <span class="chip ${left(c.expires) < 0 ? 'bad' : 'warn'}">${left(c.expires) < 0 ? 'expired' : 'in ' + left(c.expires) + ' days'}</span>` : ''}</td>
      <td>${c.inUse ? '<span class="chip ok">In use</span>' : c.onServer ? `<button data-gcuse="${esc(c.thumbprint)}" ${fromServer ? 'disabled title="The server settings decide the certificate"' : ''}>Use this one</button>` : '<span class="muted" title="Made before the server kept keys: make a new one">No key here</span>'}</td>
      <td class="act">${c.onServer ? `<a class="link" href="api/graph/cert/${esc(c.thumbprint)}/cer" download>Download .cer</a>` : ''}${fromServer && c.inUse ? '' : ` <button class="icon ghost" data-gcdel="${esc(c.thumbprint)}" ${c.inUse || c.chosen ? 'data-gcinuse="1"' : ''} aria-label="Delete this certificate" title="Delete">×</button>`}</td></tr>`).join('');
  root.innerHTML = `<div class="panelbox"><div class="hdr">Microsoft Graph ${g.configured ? '<span class="chip ok">Connected</span>' : '<span class="cnt">not set up</span>'}</div>
    <p class="note">Reads what Microsoft Entra and Intune know of each device: join type, management, compliance, encryption, primary user and last contact, shown on the device. Devices are matched by serial number, else by name. Fields a device does not have yet are filled in; ones it has stay, except on devices added from here, which Graph keeps up to date until Lansweeper takes them over. It only reads: it changes nothing in Entra or Intune.</p>
    ${fromServer ? '<p class="note" style="padding:8px 12px">The connection is set by the server settings (NI_GRAPH_TENANT, NI_GRAPH_CLIENT_ID, NI_GRAPH_CERT, NI_GRAPH_KEY). Remove them on the server to use the steps below instead.</p>' : ''}
    <ol class="graph-steps">
      <li><div class="gs-head">${done(ids)}<b>Register the app in Entra</b></div>
        <ol class="gs-sub">
          <li>Open the <a class="link" style="text-decoration:underline" href="${ENTRA}" target="_blank" rel="noopener">Entra admin center</a> → <b>Applications</b> → <b>App registrations</b> → <b>New registration</b>.</li>
          <li><b>Name:</b> <span class="mono">NOBS Inventory</span></li>
          <li><b>Supported account types:</b> <i>Accounts in this organizational directory only (single tenant)</i></li>
          <li><b>Redirect URI:</b> leave it empty. The inventory signs in as itself with a certificate, not as a person, so nothing is sent back to a web address.</li>
          <li>Click <b>Register</b>. The app's <b>Overview</b> page opens: copy its two IDs into the fields below and save.</li>
        </ol>
        <div class="form" style="padding:8px 0 0">
          <label for="gTenant">Directory (tenant) ID</label><input id="gTenant" class="mono" value="${esc(g.tenant)}" placeholder="1b2c3d4e-5f60-…" autocomplete="off" ${fromServer ? 'disabled' : ''}>
          <label for="gClient">Application (client) ID</label><input id="gClient" class="mono" value="${esc(g.clientId)}" placeholder="9a8b7c6d-…" autocomplete="off" ${fromServer ? 'disabled' : ''}>
        </div>
        <div class="addrel" style="padding:8px 0 0;border:0;background:none"><button id="gSave" ${fromServer ? 'disabled' : ''}>Save IDs</button><span class="note" id="gSaveMsg" role="status"></span></div></li>
      <li><div class="gs-head">${done(!!chosen || fromServer)}<b>Give the app a certificate</b></div>
        <ol class="gs-sub">
          <li>Click <b>Create a certificate</b> below. The server keeps its private key, encrypted; the key never leaves the server.</li>
          <li>Click <b>Download the .cer</b>.</li>
          <li>In the app in Entra: <b>Certificates &amp; secrets</b> → tab <b>Certificates</b> (not Client secrets) → <b>Upload certificate</b> → choose the .cer → <b>Add</b>.</li>
          <li>Entra lists it with a thumbprint: the same as in the list at the bottom of this box.</li>
        </ol>
        <div class="addrel" style="padding:8px 0 0;border:0;background:none"><button id="graphCert" ${edit && !fromServer ? '' : 'disabled'}>Create a certificate</button>${chosen ? `<a class="link" href="api/graph/cert/${esc(chosen.thumbprint)}/cer" download>Download the .cer</a>` : ''}</div></li>
      <li><div class="gs-head"><b>Allow it to read devices</b></div>
        <ol class="gs-sub">
          <li>In the app in Entra: <b>API permissions</b> → <b>Add a permission</b> → <b>Microsoft Graph</b> → <b>Application permissions</b> (not Delegated).</li>
          <li>Search and tick <span class="mono">Device.Read.All</span> and <span class="mono">DeviceManagementManagedDevices.Read.All</span> → <b>Add permissions</b>.</li>
          <li>Click <b>Grant admin consent for</b> your organisation → <b>Yes</b>. Both lines then show a green tick.</li>
          <li><span class="mono">User.Read</span> (Delegated), which Entra adds by itself, can stay: it only applies when a person signs in to the app, which never happens. Removing it is tidier, not needed.</li>
        </ol>
        <details class="gs-why"><summary>Why Application and not Delegated?</summary>
          <p class="note">Delegated permissions act for a person who signs in, and only reach what that person may see. The inventory reads the devices by itself, every night, with nobody signed in, so it needs Application permissions, which an admin grants once for the whole organisation. Both are read-only: the inventory cannot change anything in Entra or Intune.</p></details></li>
      <li><div class="gs-head">${done(g.configured)}<b>Test and sync</b></div>
        <p class="note">Test connection signs in and reads one device from each list; it names a permission that is still missing. Sync now reads them all; it also runs by itself, as set below.</p>
        <div class="addrel" style="padding:8px 0 0;border:0;background:none"><button id="graphTest" ${g.configured && edit ? '' : 'disabled'}>Test connection</button><button id="graphSync" class="primary" ${g.configured && edit ? '' : 'disabled'}>Sync now</button><span class="note" id="graphMsg" role="status"></span></div>
        ${scheduleRowHtml('graph', edit)}</li>
    </ol>
    ${certRows ? `<div style="overflow-x:auto;border-top:1px solid var(--bd2)"><table class="grid mini" style="min-width:0"><thead><tr><th>Certificate thumbprint (as Entra shows it)</th><th>Created</th><th>Expires</th><th>Sign-in</th><th></th></tr></thead><tbody>${certRows}</tbody></table></div>
    <p class="note" style="padding:8px 12px">Before one expires: create a new one, upload it to Entra, choose Use this one, test, then remove the old one here and in Entra.</p>` : ''}
    ${unmatchedHtml(edit)}${ambiguousHtml()}</div>`;
  const msg = $('#graphMsg');
  const say = (text, bad) => { msg.innerHTML = bad ? `<span style="color:var(--danger)">${esc(text)}</span>` : esc(text); };
  const post = async (url, body) => { const x = await fetch(url, {method: 'POST', credentials: 'same-origin', headers: body ? {'Content-Type': 'application/json'} : {}, body: body ? JSON.stringify(body) : undefined}); return {ok: x.ok, j: await x.json().catch(() => ({}))}; };
  $('#gSave').onclick = async () => {
    const x = await post('api/graph/settings', {tenant: $('#gTenant').value, clientId: $('#gClient').value});
    if (!x.ok){ $('#gSaveMsg').innerHTML = `<span style="color:var(--danger)">${esc(x.j.error || 'Not saved.')}</span>`; return; }
    toast('Microsoft Graph IDs saved'); await refreshGraph();
  };
  $('#graphCert').onclick = async () => {
    const x = await post('api/graph/cert');
    if (!x.ok){ toast(x.j.error || 'The certificate could not be made.'); return; }
    toast('Certificate created. Download the .cer and upload it to the app in Entra.'); await refreshGraph();
  };
  $('#graphTest').onclick = async () => {
    say('Testing…');
    const x = await post('api/graph/test');
    if (!x.ok) return say(x.j.error || 'The test failed.', true);
    if (x.j.missing.length) return say('Signed in, but these permissions are missing or not consented: ' + x.j.missing.join(', ') + '.', true);
    say('Signed in and read both lists. Ready to sync.');
  };
  $('#graphSync').onclick = async () => {
    const btn = $('#graphSync'); btn.disabled = true; say('Syncing…');
    const x = await post('api/graph/sync');
    btn.disabled = false;
    if (!x.ok) return say(x.j.error || 'The sync failed.', true);
    const c = x.j.counts;
    await reloadFromServer(); await renderSetGraph();
    /* The pane was drawn again: the message goes to its new line. */
    const m2 = $('#graphMsg'); if (m2) m2.textContent = graphSummary(c);
  };
  root.querySelectorAll('[data-gcuse]').forEach(b => b.onclick = async () => {
    const x = await post(`api/graph/cert/${encodeURIComponent(b.dataset.gcuse)}/use`);
    if (!x.ok){ toast(x.j.error || 'Not changed.'); return; }
    toast('The server signs in with this certificate now'); await refreshGraph();
  });
  /* Devices Graph has that the inventory does not: add the ticked ones, or all. */
  const addGraph = async ids => {
    const x = await post('api/graph/add', {ids});
    if (!x.ok){ toast(x.j.error || 'Not added.'); return; }
    toast(`${x.j.added} ${x.j.added === 1 ? 'device' : 'devices'} added from Microsoft Graph`);
    await reloadFromServer(); await renderSetGraph();
  };
  const gu = $('#guList');
  if (gu){
    const picked = () => [...gu.querySelectorAll('[data-gu]:checked')].map(c => c.dataset.gu);
    const fit = () => { const n = picked().length; $('#guAdd').disabled = !n; $('#guAdd').textContent = n ? `Add ${n} selected` : 'Add selected'; };
    gu.querySelectorAll('[data-gu]').forEach(c => c.onchange = fit);
    $('#guAllBox').onchange = e => { gu.querySelectorAll('[data-gu]').forEach(c => { c.checked = e.target.checked; }); fit(); };
    $('#guAdd').onclick = () => addGraph(picked());
    $('#guAddAll').onclick = () => { if (confirm(`Add all ${(st.graphUnmatched || []).length} devices to the inventory?`)) addGraph('all'); };
  }
  /* Deleting a certificate removes its key from the server. The one in use can go too: Graph then stops until another
     certificate is created and uploaded. */
  root.querySelectorAll('[data-gcdel]').forEach(b => b.onclick = async () => {
    const t = b.dataset.gcdel, inUse = !!b.dataset.gcinuse;
    if (!confirm(`Delete certificate ${t}? Its private key is deleted from the server; this cannot be undone. Delete it in Entra as well (the app → Certificates & secrets → Certificates).`
      + (inUse ? '\n\nThis is the certificate the inventory signs in with: Microsoft Graph stops working until you create a new one and upload it to Entra.' : ''))) return;
    const d = await fetch('api/graph/cert/' + encodeURIComponent(t) + (inUse ? '?inUse=1' : ''), {method: 'DELETE', credentials: 'same-origin'});
    if (!d.ok){ const e = await d.json().catch(() => ({})); toast(e.error || 'Not deleted.'); return; }
    toast('Certificate deleted' + (inUse ? '. Microsoft Graph is off until a new one is uploaded.' : ''));
    await refreshGraph();
  });
  bindScheduleRows(root);
  applyRole();
}
/* After a change: the server's view of Graph (is it connected now?) and the pane. */
async function refreshGraph(){
  const r = await fetch('api/me', {credentials: 'same-origin'}).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => null) : null;
  if (j) SYNC.graph = SERVER.graph = !!j.graph;
  await renderSetGraph();
}
/* Every section of Settings opens and closes by its title, and stays as it was left (kept in this browser by its title).
   The sections draw themselves again often, so the state is put back on each new title as it appears. */
export function collapsibleSections(root, prefix){
  const keyOf = h => prefix + (h.childNodes[0] ? h.childNodes[0].textContent : h.textContent).trim();
  const apply = () => root.querySelectorAll('.panelbox > .hdr:not(.sechdr)').forEach(h => {
    if (h.parentNode.parentElement.closest('.panelbox')) return;   /* a box inside a section opens with it */
    h.classList.add('sechdr'); h.setAttribute('role', 'button'); h.tabIndex = 0;
    const closed = !!collapsedPanels()[keyOf(h)];
    h.parentNode.classList.toggle('collapsed', closed); h.setAttribute('aria-expanded', String(!closed));
  });
  const toggle = h => { const c = h.parentNode.classList.toggle('collapsed'); h.setAttribute('aria-expanded', String(!c)); rememberPanel(keyOf(h), c); };
  root.addEventListener('click', e => { const h = e.target.closest('.panelbox > .hdr.sechdr'); if (h && !e.target.closest('button,input,select,a,label')) toggle(h); });
  root.addEventListener('keydown', e => { const h = e.target.closest('.panelbox > .hdr.sechdr'); if (h && e.target === h && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); toggle(h); } });
  new MutationObserver(apply).observe(root, {childList: true, subtree: true});
  apply();
}
export function renderSetPane(){
  document.querySelectorAll('#setTabs [data-st]').forEach(b => b.classList.toggle('active', b.dataset.st === st.setTab));
  const pane = $('#setPane');
  const policyPane = `<div class="panelbox"><div class="hdr">Feed may overwrite</div>${policyGrid()}<p class="note" style="padding:10px 12px">Default for every object. Each object can override it on its own page. Name and serial number are match keys and are never overwritten.</p><div class="lpanel-add"><label class="pchk" style="width:auto"><input type="checkbox" id="skipIp" ${st.skipIpOnly ? 'checked' : ''} ${canEdit() ? '' : 'disabled'}> Skip devices named only by an IP address (no serial number)</label></div></div>`;
  const html = {
    feed: '<div id="setLsToggle"></div><div id="setFeed"></div>' + (LS_ON() ? policyPane : '') + '<div id="setTypeMap"></div><div id="setTypeRules"></div>',
    directory: '<div id="setLdap"></div><div id="setGraph"></div>',
    locations: '<div id="setLocs"></div>',
    vlans: '<div class="panelbox"><div class="hdr">VLANs <span class="cnt" id="vlCnt"></span></div><div id="setVlans"></div></div><div class="panelbox" id="setSubnets"></div><div class="panelbox" id="setDomains"></div>',
    types: '<div class="panelbox"><div class="hdr">Object types</div><div id="setTypes"></div></div><div id="setTypeFields"></div><div class="panelbox" id="setModels"></div>',
    users: '<div id="setUsers"></div><div id="setCompany"></div>',
    maintenance: '<div id="setMaint"></div>',
    log: '<div id="setLog"></div>',
    about: '<div id="setAbout"></div>'
  }[st.setTab];
  pane.innerHTML = html;
  bindPolicy(pane);
  const skip = $('#skipIp'); if (skip) skip.onchange = () => { st.skipIpOnly = skip.checked; queueServerSave(); };
  fullTextTooltips(pane);
  ({feed: () => { renderLsToggle(); renderSetFeed(); renderTypeMap(); renderTypeRules(); }, directory: () => { renderSetLdap(); renderSetGraph(); }, locations: renderSetLocs, vlans: () => { renderSetVlans(); renderSetSubnets(); }, types: () => { renderSetTypes(); renderSetModels(); }, users: () => { renderSetUsers(); renderSetCompany(); }, maintenance: renderSetMaint, log: renderSetLog, about: renderSetAbout})[st.setTab]();
  applyRole();
}

/* About, as in NOBS SQL Editor: the version comes from the server, the licence text is the same. */
export async function renderSetAbout(){
  const version = await loadVersion();
  if (!$('#setAbout')) return;   /* Settings was closed while the version was loading */
  $('#setAbout').innerHTML = `<div class="panelbox" style="padding:12px 14px">
    <div class="muted" style="font-size:12px;line-height:1.6">
      <div class="brandmark" style="margin-bottom:8px;color:var(--fg)"><img src="logo.svg" alt=""><div><b>NOBS</b> <span>Inventory</span></div></div>
      Version ${esc(version || 'unknown')}<br>
      An inventory of PCs, servers, phones, switches and other devices, with their relations.<br>
      <i>No BS, just inventory.</i><br>
      Copyright &copy; 2026 Viktor Ljuca
    </div>
    <div class="hdr" style="margin:14px -14px 8px">License</div>
    <div class="muted" style="font-size:12px;line-height:1.6">
      This program is free software: you may redistribute and/or modify it under the terms of the
      <b>GNU General Public License version 3</b>, or (at your option) any later version.<br>
      It is distributed in the hope that it will be useful, but <b>WITHOUT ANY WARRANTY</b> - without
      even the implied warranty of merchantability or fitness for a particular purpose. See the
      GNU General Public License for details.
    </div>
    <div class="hdr" style="margin:14px -14px 8px">Links</div>
    <div style="display:grid;grid-template-columns:70px 1fr;gap:2px 12px;font-size:12px;line-height:1.7;overflow-wrap:anywhere">
      <span class="muted">Website</span><span>https://monsama.ch</span>
      <span class="muted">Source</span><span>https://github.com/monsama/nobs-inventory</span>
      <span class="muted">License</span><span>https://www.gnu.org/licenses/gpl-3.0.html</span>
    </div>
    <div style="margin-top:12px"><a class="btnlike" href="https://buymeacoffee.com/monsama" target="_blank" rel="noopener noreferrer" title="If NOBS Inventory saves you some time"><svg class="i" viewBox="0 0 24 24"><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3v3M12 3v3"/></svg>Buy me a coffee</a></div>
    <div class="hdr" style="margin:14px -14px 8px">Third party</div>
    <div class="muted" style="font-size:11px;line-height:1.6">
      Built with Node.js, Express and ldapjs. Each keeps its own licence.
    </div>
  </div>`;
}

/* ---------- users: people who have devices. Manual users are kept; LDAP users are kept in step with the directory. ---------- */
export let USERS = [];
export const setUsers = v => { USERS = v; };
export const devicesOf = name => objs.filter(o => o.user === name).length;
export const me = () => USERS.find(u => u.id === st.meId);
/* The name the history records for the signed-in person. */
export const who = () => (me() && me().name) || 'someone';
export const canEdit = () => !USERS.length || (!!me() && me().role === 'admin');
export const roleLabel = u => u.role === 'admin' ? 'Admin' : 'Viewer';
/* Viewers: controls in the page are disabled, navigation stays. */
export const RO_KEEP = /Cancel|Close|Back|^setTab|^setClose$/;
export const RO_NAV = '.wctl button,.tray-chip button,button[data-adg],button.ov-tile,button.ov-row,button.ov-bar,button[data-open],button[data-devs],button.sw-tg,button[data-person],button[data-loc],button[data-st],button[data-tab],button[data-close],button.item,button.tab,button.card,button.port,button.node,button.link,a';
/* Looking, not changing: searches, view switches and zoom. Settings → Object types: tfType picks whose fields are shown. */
export const RO_INPUT_OK = /^(search|ctQ|mapFind|mapFocus|mapOnly|mapLabels|cardJoin|mapAttached|grp|portsDevice|rkSel|swQ|swCollapse|plSel|plQ|plZoomIn|plZoomOut|plZoomReset|tfType|rkOpen)$/;
export function applyRole(){
  const ro = !canEdit();
  document.body.classList.toggle('readonly', ro);
  $('#newBtn').disabled = ro; $('#linkBtn').disabled = ro;
  $('#whoBtn').textContent = me() ? me().name + ' · ' + roleLabel(me()) : (USERS.length ? 'Signed out · read only' : 'No users yet');
  $('#signOutBtn').hidden = !me();
  ['#view', '#toolbar', '#modalHost'].forEach(sel => $(sel).querySelectorAll('button, input, select, textarea').forEach(el => {
    if (!ro){ if (el.dataset.roLocked){ el.disabled = false; delete el.dataset.roLocked; } return; }
    if (el.closest('.box.free') || el.matches(RO_NAV) || RO_KEEP.test(el.id) || RO_INPUT_OK.test(el.id) || el.closest('.fr') || el.closest('.hits') || el.closest('#setTabs')) return;
    if (el.matches('button, input, select, textarea') && !el.disabled){ el.dataset.roLocked = '1'; el.disabled = true; }
  }));
}
export const userId = () => 'u' + Math.random().toString(36).slice(2, 9);
/* source: 'lansweeper' for a person first named as a device's user by the feed; they are kept like one added by hand. */
/* A person picked or typed by hand (or a CSV import) names them; Lansweeper names a device's user by login. The exact
   name is looked for first, so a typed "Anna" stays Anna; then the login. */
export function ensureUser(name, source = 'manual'){
  const low = String(name).toLowerCase();
  let u = USERS.find(x => x.name === name) || USERS.find(x => x.login && x.login.toLowerCase() === low);
  if (!u){ u = {id:userId(), login:'', name, dept:'', role:'viewer', groups:[], source, active:true}; USERS.push(u); }
  return u;
}
/* A device keeps the id of its user; .user reads the name from that record, so renaming a user moves the devices with it. */
export function bindUser(o){
  const d = Object.getOwnPropertyDescriptor(o, 'user');
  if (d && d.get) return;
  const name = o.user;
  delete o.user;
  if (!o.uid) o.uid = name ? ensureUser(name, o.feed && o.feed.sys === 'Lansweeper' ? 'lansweeper' : 'manual').id : null;
  Object.defineProperty(o, 'user', {
    get(){ if (this.hotdesk) return 'Hot desk'; const u = USERS.find(x => x.id === this.uid); return u ? u.name : ''; },
    set(v){ this.uid = v ? ensureUser(v).id : null; },
    enumerable: true, configurable: true
  });
}
/* Rack placement. A device either takes U slots (rack, u, h) or sits on top of another device in the same rack (ontop). */
export const RACKABLE = ['server','switch','patch','storage','router','firewall','modem'];
export const TYPE_U = {server:2, switch:1, patch:1, storage:4, router:1, firewall:1, modem:1};
export const rackOf = id => racksList().find(r => r.id === id);
/* Returns an error for a placement that does not fit, or '' when it does. */
export function rackCheck(rackId, u, h, exceptId){
  const R_ = rackOf(rackId);
  if (!R_) return 'Pick a rack first.';
  if (!(u >= 1 && h >= 1 && u + h - 1 <= rackUnits(R_))) return `U${u}–${u + h - 1} is outside ${R_.name} (U1–U${rackUnits(R_)}).`;
  /* A retired device is kept for the record and no longer takes up rack units. */
  const hit = objs.find(x => x.id !== exceptId && x.status !== 'retired' && x.rack === rackId && x.u != null && !x.ontop && x.u <= u + h - 1 && u <= x.u + (x.h || 1) - 1);
  return hit ? `U${hit.u}${(hit.h || 1) > 1 ? '–U' + (hit.u + hit.h - 1) : ''} is taken by ${hit.name}.` : '';
}
export function rackFields(o){
  if (!RACKABLE.includes(o.type)) return '';
  /* Same row layout as every other field: the control fills the column and a linked object keeps the feed slot free. */
  const slot = (LS_ON() ? '<span class="pchk-slot" aria-hidden="true"></span>' : '') + (canEdit() ? '<span class="fm-slot" aria-hidden="true"></span>' : '');
  return `<label for="rk_rack">Rack</label><div class="ctlrow"><select id="rk_rack" data-rk="rack"><option value="">Not in a rack</option>${racksList().map(r => `<option value="${r.id}" ${o.rack===r.id && o.u!=null && !o.ontop ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>${slot}</div>
    <div class="rk-mount" ${o.rack && o.u != null && !o.ontop ? '' : 'hidden'}><label>Mounted at</label><div class="ctlrow"><div class="rkrow"><span class="muted">U</span><input type="number" min="1" data-rk="u" value="${o.u ?? ''}" style="width:64px" aria-label="Start U"><span class="muted">height</span><input type="number" min="1" data-rk="h" value="${o.h ?? TYPE_U[o.type] ?? 1}" style="width:64px" aria-label="Height in U"><span class="muted">U</span></div>${slot}</div></div>
    <label for="rk_top">Or on top of</label><div class="ctlrow"><select id="rk_top" data-rk="ontop"><option value="">Nothing</option>${objs.filter(x => x.id !== o.id && x.rack && x.u != null && !x.ontop && RACKABLE.includes(x.type)).map(x => `<option value="${x.id}" ${o.ontop===x.id ? 'selected' : ''}>${esc(x.name)} · U${x.u}</option>`).join('')}</select>${slot}</div>`;
}
/* Mount device…: pick a rack device that has no rack yet, a start U and a height. */
export function mountModal(){
  const free = objs.filter(o => RACKABLE.includes(o.type) && !o.rack && !(o.type === 'server' && o.kind === 'vm'));
  if (!free.length){ toast('Every rackable device is already in a rack.'); return; }
  modal(`<div class="mh">Mount device in ${esc(rackOf(st.rackId).name)}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="mdDev">Device</label><select id="mdDev">${free.map(o => `<option value="${o.id}">${esc(o.name)} · ${esc(TYPES[o.type].label)}</option>`).join('')}</select>
      <label for="mdU">Start U</label><input id="mdU" type="number" min="1" value="${rackUnits(rackOf(st.rackId))}">
      <label for="mdH">Height</label><input id="mdH" type="number" min="1" value="${TYPE_U[free[0].type] ?? 1}">
    </div><p class="note" id="mdErr"></p></div>
    <div class="mf"><button id="mdCancel">Cancel</button><button id="mdOk" class="primary">Mount</button></div>`, 'sm');
  const pick = () => { const o = byId($('#mdDev').value); $('#mdH').value = TYPE_U[o.type] ?? 1; };
  $('#mdDev').onchange = pick;
  $('#mdCancel').onclick = closeModal;
  $('#mdOk').onclick = () => {
    const o = byId($('#mdDev').value), u = +$('#mdU').value, h = +$('#mdH').value;
    const err = rackCheck(st.rackId, u, h, o.id);
    if (err){ $('#mdErr').textContent = err; return; }
    const prevRack = o.rack;
    Object.assign(o, {rack: st.rackId, u, h}); delete o.ontop;
    followOnTop(o, prevRack);
    hist(o, now(), `Mounted in ${rackOf(st.rackId).name} at U${u}, ${h} U high`);
    closeModal(); toast(o.name + ' mounted at U' + u); render();
  };
}

export function renderSetUsers(){
  /* Devices per person, counted in one pass: asking each person's count separately went through every device each time. */
  const devCount = new Map();
  for (const o of objs){ const n = o.user; if (n) devCount.set(n, (devCount.get(n) || 0) + 1); }
  const devicesOfUser = name => devCount.get(name) || 0;
  const rows = USERS.map((u, i) => `<tr>
      ${u.source === 'ldap' ? `<td title="From LDAP: changed in the directory">${esc(u.name)}</td>` : `<td><input data-uname="${i}" maxlength="80" value="${esc(u.name)}" aria-label="Name of ${esc(u.name)}"></td>`}<td class="mono">${esc(u.login || '—')}</td>
      ${u.source === 'ldap' ? `<td>${esc(u.dept || '')}</td>` : `<td><input data-udept="${i}" maxlength="80" value="${esc(u.dept || '')}" placeholder="Department" aria-label="Department of ${esc(u.name)}"></td>`}<td>${esc((u.groups || []).join(', '))}</td>
      <td>${u.source === 'ldap' ? '<span class="chip info usrc">LDAP</span>' : u.source === 'lansweeper' ? '<span class="chip info usrc" title="Named as a device\'s user by Lansweeper">Lansweeper</span>' : '<span class="chip kept usrc">Manual</span>'}</td>
      <td class="n"><a class="link" data-devs="${i}">${devicesOfUser(u.name)}</a></td>
      <td><select data-role="${i}" aria-label="Role of ${esc(u.name)}"><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option><option value="viewer" ${u.role !== 'admin' ? 'selected' : ''}>Viewer</option></select></td>
      <td><input type="checkbox" data-act="${i}" ${u.active ? 'checked' : ''} aria-label="Active"></td>
      <td>${SERVER.on && u.source !== 'ldap' ? (u.login ? `<button data-pw="${i}" title="Set this user's password">Password</button>` : `<button data-login="${i}" title="Give this user a login name">Login name</button>`) : ''}</td>
      <td>${SERVER.on ? `<button data-sheet="${i}" title="Print the devices handed out and a new initial Windows password">Entry sheet</button>` : ''}</td>
      <td><button class="icon ghost" data-del="${i}" ${u.source === 'ldap' ? 'disabled title="Managed by LDAP"' : devicesOfUser(u.name) ? 'disabled title="Has devices. Move them first."' : 'title="Remove"'} aria-label="Remove user">×</button></td></tr>`).join('');
  $('#setUsers').innerHTML = `<div class="panelbox"><div class="hdr">Users <span class="cnt">${USERS.filter(u => u.active).length} active</span></div>
    <p class="note">Each device names its user. The Devices count lists them, and clicking it shows those devices. Users from LDAP can't be removed here, only deactivated.</p>
    <div style="overflow-x:auto"><table class="grid mini" style="min-width:1020px;table-layout:fixed"><colgroup><col style="width:15%"><col style="width:9%"><col style="width:15%"><col style="width:8%"><col style="width:9%"><col style="width:7%"><col style="width:9%"><col style="width:6%"><col style="width:10%"><col style="width:9%"><col style="width:3%"></colgroup><thead><tr><th>Name</th><th>Login</th><th>Department</th><th>Groups</th><th>Source</th><th>Devices</th><th>Role</th><th>Active</th><th></th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="addrel"><input id="nuFirst" placeholder="First name" style="min-width:130px" aria-label="First name"><input id="nuLast" placeholder="Last name" style="min-width:130px" aria-label="Last name"><input id="nuDept" placeholder="Department" style="min-width:120px" aria-label="Department"></div>
    <div class="addrel"><input id="nuLogin" placeholder="Login (optional, lets them sign in)" style="min-width:200px" aria-label="Login" autocomplete="off"><input id="nuPw" type="password" placeholder="Password (min. ${PW_MIN})" style="min-width:160px" aria-label="Password" autocomplete="new-password"><select id="nuRole" aria-label="Role"><option value="viewer">Viewer</option><option value="admin">Admin</option></select><button id="nuAdd">Add user</button></div></div>`;
  const root = $('#setUsers');
  root.querySelectorAll('[data-devs]').forEach(a => a.onclick = () => showDevicesOf(USERS[+a.dataset.devs].name));
  /* Admins that are active: the inventory needs at least one of them, so the page refuses what the server would refuse. */
  const activeAdmins = () => USERS.filter(x => x.role === 'admin' && x.active !== false).length;
  root.querySelectorAll('[data-act]').forEach(c => c.onchange = () => {
    const u = USERS[+c.dataset.act];
    if (!c.checked && u.role === 'admin' && activeAdmins() <= 1){ toast('At least one active admin is needed.'); c.checked = true; return; }
    u.active = c.checked; queueServerSave(); renderSetUsers();
  });
  /* A user entered here or named by Lansweeper can be renamed; their devices move to the new name with them. Users from
     LDAP are named in the directory. */
  root.querySelectorAll('[data-uname]').forEach(i => i.onchange = () => {
    const u = USERS[+i.dataset.uname], was = u.name, name = i.value.trim().replace(/\s+/g, ' ');
    if (!name){ i.value = was; toast('A user needs a name.'); return; }
    if (name === was) return;
    if (USERS.some(x => x !== u && x.name.toLowerCase() === name.toLowerCase())){ i.value = was; toast(name + ' is already a user.'); return; }
    u.name = name; delete u.first; delete u.last;
    /* The devices keep the person's id, so they show the new name by themselves; each gets a history line. */
    for (const o of objs) if (o.uid === u.id) hist(o, now(), `User ${was} renamed to ${name} by ${who()}`);
    queueServerSave(); toast(`${was} is now ${name}`); renderSetUsers(); render();
  });
  root.querySelectorAll('[data-udept]').forEach(i => i.onchange = () => {
    const u = USERS[+i.dataset.udept], dept = i.value.trim();
    if (dept) u.dept = dept; else delete u.dept;
    queueServerSave(); toast('Department saved'); renderSetUsers();
  });
  root.querySelectorAll('[data-pw]').forEach(b => b.onclick = () => passwordModal(USERS[+b.dataset.pw]));
  root.querySelectorAll('[data-login]').forEach(b => b.onclick = () => userLoginModal(USERS[+b.dataset.login]));
  root.querySelectorAll('[data-sheet]').forEach(b => b.onclick = () => sheetModal(USERS[+b.dataset.sheet]));
  root.querySelectorAll('[data-role]').forEach(sel => sel.onchange = () => {
    const u = USERS[+sel.dataset.role];
    if (u.role === 'admin' && sel.value !== 'admin' && u.active !== false && activeAdmins() <= 1){ toast('At least one active admin is needed.'); renderSetUsers(); return; }
    u.role = sel.value; queueServerSave(); toast(u.name + ' is now ' + roleLabel(u).toLowerCase()); renderSetUsers();
  });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const u = USERS[+b.dataset.del];
    if (me() && String(u.id) === String(me().id)){ toast("You can't remove yourself."); return; }
    if (u.role === 'admin' && u.active !== false && activeAdmins() <= 1){ toast('At least one active admin is needed.'); return; }
    USERS.splice(+b.dataset.del, 1); queueServerSave(); toast(u.name + ' removed'); renderSetUsers();
  });
  $('#nuAdd').onclick = async () => {
    const first = $('#nuFirst').value.trim(), last = $('#nuLast').value.trim();
    const name = [first, last].filter(Boolean).join(' ');
    const login = $('#nuLogin').value.trim(), pw = $('#nuPw').value;
    if (!name){ toast('Give the user a first or last name.'); return; }
    if (USERS.some(u => u.name.toLowerCase() === name.toLowerCase())){ toast(name + ' is already a user.'); return; }
    if (login && USERS.some(u => (u.login || '').toLowerCase() === login.toLowerCase())){ toast('That login is already used.'); return; }
    if (login && pw.length < PW_MIN){ toast(`The password needs at least ${PW_MIN} characters.`); return; }
    const u = {id:userId(), login, first, last, name, dept:$('#nuDept').value.trim(), role:$('#nuRole').value, groups:[], source:'manual', active:true};
    USERS.push(u); queueServerSave();
    if (login){
      await flushSave();
      const r = await fetch('api/users/' + encodeURIComponent(u.id) + '/password', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({password: pw})});
      if (!r.ok){ toast('Added ' + name + ', but the password was not set. Use Password in the list.'); st.setTab = 'users'; openSettings(); return; }
    }
    toast('Added ' + name); st.setTab = 'users'; openSettings();
  };
}
/* The company the inventory belongs to: its name and logo, printed on entry sheets instead of NOBS Inventory. A logo is
   scaled to fit 600 × 200 and kept as a PNG, so an SVG, WebP or GIF works as well. */
export function renderSetCompany(){
  const el = $('#setCompany'); if (!el) return;
  const edit = canEdit();
  el.innerHTML = `<div class="panelbox"><div class="hdr">Company</div>
    <p class="note">The name and logo on entry sheets, printed and as PDF. Without them the sheets show NOBS Inventory.</p>
    <div class="form" style="padding:10px 12px">
      <label for="coName">Company name</label><input id="coName" maxlength="80" value="${esc(COMPANY.name)}" placeholder="e.g. Argolite AG" ${edit ? '' : 'disabled'}>
      <label>Logo</label><div class="ctlrow" style="align-items:center"><span class="company-logo">${COMPANY.logo ? `<img src="${esc(COMPANY.logo)}" alt="Company logo">` : '<span class="muted">No logo</span>'}</span>
        <span class="unit" style="display:flex;gap:6px;align-items:center"><button id="coPick" ${edit ? '' : 'disabled'}>${COMPANY.logo ? 'Replace logo…' : 'Choose logo…'}</button>${COMPANY.logo ? `<button id="coDel" class="icon ghost" title="Remove the logo" aria-label="Remove the logo" ${edit ? '' : 'disabled'}>×</button>` : ''}</span>
        <input id="coFile" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" hidden></div>
    </div><p class="note" id="coMsg" role="status" style="padding:0 12px 10px"></p></div>`;
  $('#coName').onchange = e => { COMPANY.name = e.target.value.trim(); queueServerSave(); toast('Company name saved'); };
  $('#coPick').onclick = () => $('#coFile').click();
  const del = $('#coDel'); if (del) del.onclick = () => { COMPANY.logo = ''; queueServerSave(); renderSetCompany(); toast('Logo removed'); };
  $('#coFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const msg = $('#coMsg');
    if (f.size > 5 * 1024 * 1024){ msg.textContent = 'The file is larger than 5 MB.'; return; }
    try {
      const url = URL.createObjectURL(f);
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('This file is not an image the browser can read.')); i.src = url; });
      URL.revokeObjectURL(url);
      const w = img.naturalWidth || 600, h = img.naturalHeight || 200, k = Math.min(1, 600 / w, 200 / h);
      const c = Object.assign(document.createElement('canvas'), {width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k))});
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const png = c.toDataURL('image/png');
      if (png.length > 560000){ msg.textContent = 'The logo is too detailed to keep. Try a simpler or smaller picture.'; return; }
      COMPANY.logo = png; queueServerSave(); renderSetCompany(); toast('Logo saved');
    } catch (err) { msg.textContent = err.message; }
  };
}
/* A manual user without a login: the login and the first password are set together, so the user can sign in at once. */
export function userLoginModal(u){
  modal(`<div class="mh">Login name for ${esc(u.name)}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="lgNew">Login name</label><input id="lgNew" class="mono" autocomplete="off">
      <label for="lgNewPw">Password</label><input id="lgNewPw" type="password" autocomplete="new-password" placeholder="At least ${PW_MIN} characters">
    </div><p class="note" id="lgNewErr">The login and password let ${esc(u.name)} sign in.</p></div>
    <div class="mf"><button id="lgNewCancel">Cancel</button><button id="lgNewOk" class="primary">Save</button></div>`, 'sm');
  $('#lgNew').focus();
  $('#lgNewCancel').onclick = closeModal;
  $('#lgNewOk').onclick = async () => {
    const login = $('#lgNew').value.trim(), pw = $('#lgNewPw').value;
    const fail = msg => { $('#lgNewErr').textContent = msg; };
    if (!login) return fail('Write a login.');
    if (USERS.some(x => x !== u && (x.login || '').toLowerCase() === login.toLowerCase())) return fail('That login is already used.');
    if (pw.length < PW_MIN) return fail(`The password needs at least ${PW_MIN} characters.`);
    u.login = login; queueServerSave(); await flushSave();
    const r = await fetch('api/users/' + encodeURIComponent(u.id) + '/password', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({password: pw})});
    closeModal();
    toast(r.ok ? u.name + ' can sign in as ' + login : 'The login is saved, but the password was not set. Use Password in the list.');
    st.setTab = 'users'; openSettings();
  };
}
/* Shows one user's devices in Cards, by searching for the name. */
export function showDevicesOf(name){
  closeModal();
  st.q = name; $('#search').value = name; st.tab = 'cards'; st.cardsGroup = 'none';
  render();
}

/* The log: what was synced, saved, restored and signed in, and what failed. */
export let LOG_FILTER = 'all';
export const LOG_KINDS = [['all', 'All'], ['errors', 'Errors'], ['sync', 'Sync and push'], ['backup', 'Backups'], ['access', 'Access']];
/* A log line's kind, by its words. Backups first ("restored" is not a sign-in), then sign-ins and accounts, then the
   syncs; anything else is in All only. */
export const logKind = e => /backup|restor/i.test(e.action) ? 'backup' : /sign in|password|login|user|removed by/i.test(e.action) ? 'access' : /sync|push|import|feed|ldap/i.test(e.action) ? 'sync' : 'other';
export async function renderSetLog(){
  const pane = $('#setLog');
  if (!pane) return;
  if (!canEdit()){ pane.innerHTML = '<div class="panelbox"><div class="hdr">Log</div><p class="note" style="padding:12px">Only administrators can see the log.</p></div>'; return; }
  const r = await fetch('api/log?limit=500', {credentials: 'same-origin'});
  if (!$('#setLog')) return;
  const j = r.ok ? await r.json() : {entries: []};
  const entries = j.entries.filter(e => LOG_FILTER === 'all' || (LOG_FILTER === 'errors' ? e.level === 'error' : logKind(e) === LOG_FILTER));
  const errors = j.entries.filter(e => e.level === 'error').length;
  if (!$('#setLog')) return;
  $('#setLog').innerHTML = `<div class="panelbox"><div class="hdr">Log <span class="cnt">${j.entries.length}</span>${errors ? ` <span class="chip warn">${errors} error${errors === 1 ? '' : 's'}</span>` : ''}</div>
    <div class="addrel" style="padding:10px 12px;border-top:0">
      ${LOG_KINDS.map(([k, l]) => `<button class="tab ${LOG_FILTER === k ? 'active' : ''}" data-logf="${k}">${l}</button>`).join('')}
      <span class="grow"></span><button id="logRefresh">Refresh</button></div>
    ${entries.length ? `<div style="overflow-x:auto"><table class="grid mini" style="min-width:560px"><thead><tr><th style="width:170px">Time</th><th style="width:90px">Level</th><th style="width:160px">Who</th><th>What happened</th></tr></thead><tbody>
      ${entries.map(e => `<tr class="${e.level === 'error' ? 'logerr' : ''}"><td class="mono">${esc(pushDate(e.at))}</td><td>${e.level === 'error' ? '<span class="chip warn">Error</span>' : '<span class="chip kept">Info</span>'}</td><td>${esc(e.who)}</td><td style="white-space:normal">${esc(e.action)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="note" style="padding:12px">Nothing to show for this filter.</p>'}</div>`;
  pane.querySelectorAll('[data-logf]').forEach(b => b.onclick = () => { LOG_FILTER = b.dataset.logf; renderSetLog(); });
  $('#logRefresh').onclick = () => renderSetLog();
}
/* Backups of the inventory: taken before each Lansweeper sync, push and import, and by hand. */
export let BACKUPS = null;
export async function loadBackups(){
  const r = await fetch('api/backups', {credentials: 'same-origin'});
  if (r.ok){ BACKUPS = (await r.json()).backups; if ($('#setMaint')) renderSetMaint(); }
}
export function backupPanel(edit){
  const list = BACKUPS || [];
  const rows = list.map(b => `<tr><td>${esc(pushDate(b.at))}</td><td>${esc(b.reason)}</td><td class="n hide-n">${b.objects}</td><td class="n hide-n">${(b.bytes / 1048576).toFixed(1)} MB</td>
    <td class="act"><a class="link" href="api/backups/${b.id}/download">Download</a> <button data-brestore="${b.id}" data-bat="${esc(pushDate(b.at))}" ${edit ? '' : 'disabled'}>Restore</button> <button class="icon ghost" data-bdel="${b.id}" ${edit ? '' : 'disabled'} aria-label="Delete this backup">×</button></td></tr>`).join('');
  return `<div class="panelbox"><div class="hdr">Backups <span class="cnt">${list.length}</span></div>
    <p class="note" style="padding:10px 12px">${st.autoBackups !== false ? 'A backup is taken before every Lansweeper sync, push and import, before an LDAP or Microsoft Graph sync (once a day for Graph), before devices are added from Graph and before the type rules are applied.' : 'Automatic backups are off: none is taken before a sync, push or import. Backups made by hand and before a restore still are.'} A backup holds the devices, relations, history, types, locations, networks, plans with their pictures, contracts, licences, the settings and the entry sheets (still sealed). Restoring puts all of that back as it was. Users are kept, and the current state is backed up before a restore, so it can be restored again. Not in a backup: passwords, the Lansweeper push token, the Graph certificates' private keys, the LDAP service password and the log; the connections stay as they are now.</p>
    <div class="lpanel-add"><label class="pchk" style="width:auto"><input type="checkbox" id="bkAuto" ${st.autoBackups !== false ? 'checked' : ''} ${edit ? '' : 'disabled'}> Automatic backups</label></div>
    <div class="lpanel-add"><span class="note" style="flex:1">${list.length} backup${list.length === 1 ? '' : 's'}, ${(list.reduce((a, b) => a + (b.bytes || 0), 0) / 1048576).toFixed(1)} MB in total. Keep the last <input id="bkKeep" type="number" min="1" max="100" value="${st.backupKeep || 10}" style="width:64px;min-width:0" aria-label="Backups to keep" ${edit ? '' : 'disabled'}> (applied at the next backup).</span></div>
    ${list.length ? `<div style="overflow-x:auto"><table class="grid mini" style="min-width:0"><thead><tr><th>Taken</th><th>Reason</th><th class="n hide-n">Devices</th><th class="n hide-n">Size</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="note" style="padding:0 12px 10px">No backups yet.</p>'}
    <div class="addrel" style="padding:10px 12px"><button id="bkNew" class="primary" ${edit ? '' : 'disabled'}>Back up now</button><span class="note" style="flex:1"></span><label class="btnlike ${edit ? '' : 'disabled'}">Restore from file…<input type="file" id="bkFile" accept="application/json,.json" hidden ${edit ? '' : 'disabled'}></label></div></div>`;
}
export function wireBackups(edit){
  const msg = t => toast(t);
  if ($('#bkNew')) $('#bkNew').onclick = async () => {
    const r = await fetch('api/backups', {method: 'POST', credentials: 'same-origin'});
    if (!r.ok){ msg('The backup could not be taken.'); return; }
    msg('Backup taken'); loadBackups();
  };
  document.querySelectorAll('[data-bdel]').forEach(b => b.onclick = async () => {
    const at = b.closest('tr')?.querySelector('[data-bat]')?.dataset.bat || '';
    if (!confirm(`Delete the backup${at ? ' of ' + at : ''}? It cannot be brought back.`)) return;
    const r = await fetch('api/backups/' + b.dataset.bdel, {method: 'DELETE', credentials: 'same-origin'});
    if (r.ok){ msg('Backup deleted'); loadBackups(); }
    else msg((await r.json().catch(() => ({}))).error || 'The backup was not deleted.');
  });
  document.querySelectorAll('[data-brestore]').forEach(b => b.onclick = () => restoreModal(b.dataset.bat, () => fetch('api/backups/' + b.dataset.brestore + '/restore', {method: 'POST', credentials: 'same-origin'})));
  const file = $('#bkFile');
  if ($('#bkAuto')) $('#bkAuto').onchange = () => { st.autoBackups = $('#bkAuto').checked; queueServerSave(); toast(st.autoBackups ? 'Automatic backups are on' : 'Automatic backups are off'); renderSetMaint(); };
  if ($('#bkKeep')) $('#bkKeep').onchange = () => { const v = Math.max(1, Math.min(100, Math.floor(+$('#bkKeep').value) || 10)); st.backupKeep = v; queueServerSave(); toast('Keeping the last ' + v + ' backups'); renderSetMaint(); };
  if (file) file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    const text = await f.text();
    restoreModal(f.name, () => fetch('api/backups/restore-file', {method: 'POST', headers: {'Content-Type': 'text/plain'}, credentials: 'same-origin', body: text}));
    file.value = '';
  };
}
/* A restore replaces the inventory, so it asks for the word RESTORE. */
export function restoreModal(label, run){
  modal(`<div class="mh">Restore a backup</div><div class="mb"><p class="note">The inventory is replaced with the backup from ${esc(label)}. The current state is backed up first, so the restore can be undone from the list.</p>
    <div class="form" style="padding:0"><label for="rsWord">Type RESTORE to confirm</label><input id="rsWord" autocomplete="off"></div></div>
    <div class="mf"><button id="rsCancel">Cancel</button><button id="rsOk" class="danger-text" disabled>Restore</button></div>`, 'sm');
  $('#rsCancel').onclick = closeModal;
  $('#rsWord').oninput = () => { $('#rsOk').disabled = $('#rsWord').value !== 'RESTORE'; };
  $('#rsOk').onclick = async () => {
    /* Changes not saved yet are saved first, so the backup taken before the restore has them. */
    await flushSave();
    const r = await run();
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'The backup could not be restored.'); return; }
    closeModal(); toast('Restored'); await reloadFromServer({ discard: true }); loadBackups();
  };
  $('#rsWord').focus();
}
/* Maintenance: the factory reset. Only an admin can use it, and it asks for the typed word first. */
export function renderSetMaint(){
  const edit = canEdit();
  if (edit && BACKUPS === null) loadBackups();
  $('#setMaint').innerHTML = `${edit ? backupPanel(edit) : ''}<div class="panelbox" style="border-color:var(--danger-bg)"><div class="hdr">Factory reset</div>
    <div class="note" style="padding:12px">Returns the app to the state of a new installation. Everything is removed: devices, relations and history, users and their sign-in, locations, sites, racks, object types and settings, the LDAP and Microsoft Graph connections with Graph's certificates and keys, the Lansweeper push token, and the entry sheets. Only your own account stays, with its password, so you can sign in again.</div>
    <div class="note" style="padding:10px 12px">Backups stay unless you choose to delete them too, and the audit log keeps a record of the reset. What is set on the server itself (NI_LDAP_…, NI_GRAPH_… and the service passwords) is outside the app: remove it there.</div>
    <div class="addrel" style="padding:10px 12px"><button id="frReset" class="danger-text" ${edit ? '' : 'disabled'}>Factory reset…</button></div></div>`;
  if (edit) wireBackups(edit);
  if (edit) $('#frReset').onclick = factoryResetModal;
}
export function factoryResetModal(){
  modal(`<div class="mh">Factory reset?</div>
    <div class="mb"><p class="note">Everything is removed, except your own account, including the LDAP and Microsoft Graph connections with Graph's certificates and keys, and the entry sheets. This cannot be undone: only a backup brings the data back.</p>
      <label class="pchk" style="display:flex;gap:6px;align-items:center;margin:8px 0"><input type="checkbox" id="frBackups"> Also delete all backups (then nothing can be brought back)</label>
      <label class="note" for="frWord" style="display:block;margin-top:6px">Type FACTORY RESET to confirm</label><input id="frWord" autocomplete="off" aria-label="Type FACTORY RESET" style="width:100%"></div>
    <div class="mf"><button id="frCancel">Cancel</button><button id="frOk" class="danger-text" disabled>Factory reset</button></div>`, 'sm');
  $('#frWord').oninput = () => { $('#frOk').disabled = $('#frWord').value.trim() !== 'FACTORY RESET'; };
  $('#frWord').focus();
  $('#frCancel').onclick = closeModal;
  $('#frOk').onclick = async () => {
    clearTimeout(SERVER.timer);
    const r = await fetch('api/factory-reset', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({confirm: 'FACTORY RESET', backups: $('#frBackups').checked})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'The reset did not run.'); return; }
    location.reload();
  };
}
/* ---------- LDAP / Active Directory. The settings are saved in the inventory and used at the next sign-in or sync. The
   service account's password is not in the inventory: it is saved here into the server's encrypted store (or set in
   the server's environment) and never sent back to the page. ---------- */
/* The same default as the server: the login at the domain the search base names. */
const bindDefault = base => { const dcs = [...String(base || '').matchAll(/(?:^|,)\s*DC\s*=\s*([^,]+)/gi)].map(m => m[1].trim()); return dcs.length ? `{login}@${dcs.join('.')}` : '{login}@example.ch'; };
/* The computers are looked for in the whole domain of the search base, unless a base is given. */
const computerDefault = base => { const dcs = String(base || '').split(',').map(x => x.trim()).filter(x => /^DC=/i.test(x)); return dcs.length ? dcs.join(',') : 'DC=example,DC=ch'; };
/* How the connection to the directory is secured. ldaps:// is TLS from the start (port 636); StartTLS starts on ldap://
   (port 389) and is encrypted before anything is sent; none sends the passwords readable. */
const SECURITY_OPTS = [['', 'TLS: ldaps://, port 636'], ['starttls', 'StartTLS: ldap://, port 389, then encrypted'], ['plain', 'None: unencrypted (not recommended)']];
const securityNote = L => {
  const t = L.security === 'plain' ? '<span style="color:var(--danger)">Passwords cross the network readable: those of everyone who signs in, and the service account\'s. Only on a network you trust, and prefer StartTLS.</span>'
    : L.security === 'starttls' ? 'Encrypted like ldaps://, on the usual port 389. The certificate is checked the same way.'
    : 'The domain controller needs a certificate. If your company’s CA issued it (AD Certificate Services), add that CA’s certificate below.';
  return `<p class="note" style="padding:4px 0 0;margin:0">${t}</p>`;
};
/* Moves the address to the scheme and port of the security chosen: ldaps:// and 636, or ldap:// and 389. */
export const ldapUrlFor = (url, security) => {
  const u = String(url || '').trim();
  if (!u) return u;
  return security ? u.replace(/^ldaps:\/\//i, 'ldap://').replace(/:636(\/|$)/, ':389$1') : u.replace(/^ldap:\/\//i, 'ldaps://').replace(/:389(\/|$)/, ':636$1');
};
/* The CA certificate the directory server's certificate is checked against, when a company CA issued it. */
function caHtml(edit){
  const ca = st.ldapCa;
  const day = t => { const d = t ? new Date(t) : null; return d && !isNaN(d) ? `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}` : ''; };
  const pick = `<label class="btnlike ${edit ? '' : 'disabled'}" style="flex:none" title="The root CA certificate, exported as .cer (DER or Base-64), .crt or .pem">${ca ? 'Replace…' : 'Add CA certificate…'}<input type="file" id="caFile" accept=".cer,.crt,.pem,.der" hidden ${edit ? '' : 'disabled'}></label>`;
  if (!ca) return `<span class="muted" style="flex:1">None: only certificates from public CAs are trusted</span>${pick}`;
  return `<span style="flex:1;min-width:0">${ca.certs.map(c => `<span class="chip ok" style="flex:none">${esc(c.name)}</span> <span class="muted">until ${esc(day(c.expires))}</span>`).join(' ')}</span>${pick}<button type="button" id="caRemove" class="danger-text" style="flex:none" ${edit ? '' : 'disabled'}>Remove</button>`;
}
function bindCa(){
  const f = $('#caFile');
  if (f) f.onchange = async () => {
    const file = f.files[0]; if (!file) return;
    /* Changes still waiting to be saved go first: the settings are read again from the server afterwards. */
    await flushSave();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
    const r = await fetch('api/ldap/ca', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({file: btoa(bin)})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'The certificate was not added.'); f.value = ''; return; }
    toast('CA certificate added: ' + j.certs.map(c => c.name).join(', ') + '. Test the connection.');
    await reloadFromServer(); renderSetLdap();
  };
  const rm = $('#caRemove');
  if (rm) rm.onclick = async () => {
    if (!confirm('Remove the CA certificate? A directory server whose certificate it issued can no longer be reached.')) return;
    await flushSave();
    const r = await fetch('api/ldap/ca', {method: 'DELETE', credentials: 'same-origin'});
    if (r.ok){ toast('CA certificate removed'); await reloadFromServer(); renderSetLdap(); }
  };
}
/* LDAP: the directory settings, saved in the inventory (the service password encrypted on the server), the CA, a
   test and a sync. */
export function renderSetLdap(){
  if (!st.ldap) st.ldap = {};
  const L = st.ldap, edit = canEdit();
  const ro = edit ? '' : 'disabled';
  const field = (k, label, hint) => `<label for="lk_${k}">${label}</label><input id="lk_${k}" data-lk="${k}" class="mono" value="${esc(L[k] || '')}" placeholder="${esc(hint)}" ${ro}>`;
  const ready = !!L.url && edit;
  $('#setLdap').innerHTML = `<div class="panelbox"><div class="hdr">LDAP / Active Directory</div>
    <div class="note" style="padding:10px 12px">Changes are saved in the inventory and used at the next sign-in or sync. The service account’s password is kept apart, encrypted on the server: it can be replaced or removed here, never shown, and it is not in backups.</div>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)">
      ${field('url', 'Server', 'ldaps://dc01.example.ch:636')}
      <label for="lk_security">Connection security</label><div><select id="lk_security" ${ro}>
        ${SECURITY_OPTS.map(([v, t]) => `<option value="${v}" ${(L.security || '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
        ${securityNote(L)}</div>
      ${L.security === 'plain' ? '' : `<label>CA certificate</label><div class="ctlrow" id="ldapCa">${caHtml(edit)}</div>`}
      ${L.security === 'plain' ? '' : `<label for="lk_legacyTls">Old certificates</label><div>
        <label class="pchk" style="width:auto"><input type="checkbox" id="lk_legacyTls" ${L.legacyTls === 'on' ? 'checked' : ''} ${ro}> Accept old certificates (RSA keys from 1024 bits)</label>
        <p class="note" style="padding:4px 0 0;margin:0">${L.legacyTls === 'on'
          ? '<span class="chip warn">On</span> <span style="color:var(--danger)">Not recommended: a 1024-bit key is no longer considered safe. Only for compatibility, until the domain controller’s certificate is renewed with a 2048-bit key; then switch this off.</span>'
          : 'Not recommended. Only for a domain controller whose certificate still has a 1024-bit key (“key too weak”), until it is renewed. The certificate is still checked against the CA and the name.'}</p></div>`}
      ${field('searchBase', 'Search base', 'OU=Users,DC=example,DC=ch')}
      ${field('serviceDn', 'Service account', 'CN=inventory-sync,OU=Service,DC=example,DC=ch')}
      <label for="lk_pw">Service password</label><div class="ctlrow" id="ldapPw"><span class="muted">…</span></div>
      ${field('group', 'Sign-in group', 'CN=Inventory-Users,OU=Groups,DC=example,DC=ch')}
      ${field('adminGroup', 'Admin group', 'CN=IT-Inventory,OU=Groups,DC=example,DC=ch')}
    </div>
    <details class="ldap-adv" ${L.bindTemplate || L.loginAttr || L.userFilter || L.computerBase || L.computerGroups === 'off' ? 'open' : ''}><summary>Advanced: only when the defaults do not suit your directory</summary>
      <div class="form" style="grid-template-columns:170px minmax(0,1fr)">
        ${field('bindTemplate', 'Sign-in name', bindDefault(L.searchBase) + '   (or EXAMPLE\\{login})')}
        ${field('loginAttr', 'Login attribute', 'sAMAccountName')}
        ${field('userFilter', 'User filter', '(&(objectClass=person)(!(objectClass=computer)))')}
        ${field('computerBase', 'Computers search base', computerDefault(L.searchBase))}
        <label for="lk_computerGroups">Computer groups</label><label class="pchk" style="width:auto"><input type="checkbox" id="lk_computerGroups" ${L.computerGroups === 'off' ? '' : 'checked'} ${ro}> Read the groups of each computer account (shown on the device)</label>
      </div>
      <p class="note" style="padding:0 12px 10px">Empty fields use the Active Directory defaults shown in them. The sign-in name defaults to the login at the domain of the search base.</p>
    </details>
    <div style="padding:8px 12px 12px">${scheduleRowHtml('ldap', edit)}</div>
    <div class="addrel" style="padding:10px 12px"><button id="ldapTest" ${ready ? '' : 'disabled'}>Test connection</button><button id="ldapSync" class="primary" ${ready ? '' : 'disabled'}>Sync now</button><span class="note" id="ldapMsg"></span></div></div>`;
  bindScheduleRows($('#setLdap'));
  if (edit) loadLdapPassword(); else $('#ldapPw').innerHTML = '<span class="muted">Only an admin can see this</span>';
  $('#setLdap').querySelectorAll('[data-lk]').forEach(i => i.onchange = () => {
    st.ldap[i.dataset.lk] = i.value.trim();
    /* An address typed with ldaps:// is TLS; one with ldap:// is secured with StartTLS unless something else was chosen. */
    if (i.dataset.lk === 'url'){ if (/^ldaps:\/\//i.test(st.ldap.url)) delete st.ldap.security; else if (/^ldap:\/\//i.test(st.ldap.url) && !st.ldap.security) st.ldap.security = 'starttls'; }
    queueServerSave(); renderSetLdap();
  });
  $('#lk_security').onchange = e => {
    const v = e.target.value;
    if (v === 'plain' && !confirm('Send passwords unencrypted? Anyone on the network path can read them. StartTLS encrypts on the same port.')){ e.target.value = st.ldap.security || ''; return; }
    if (v) st.ldap.security = v; else delete st.ldap.security;
    st.ldap.url = ldapUrlFor(st.ldap.url, v);
    queueServerSave(); renderSetLdap();
  };
  const legacy = $('#lk_legacyTls');
  if (legacy) legacy.onchange = e => {
    if (e.target.checked && !confirm('Accept old certificates with 1024-bit keys? This weakens the protection of every directory sign-in. Use it only until the domain controller’s certificate is renewed with a 2048-bit key.')){ e.target.checked = false; return; }
    if (e.target.checked) st.ldap.legacyTls = 'on'; else delete st.ldap.legacyTls;
    queueServerSave(); renderSetLdap();
  };
  if (edit) bindCa();
  $('#lk_computerGroups').onchange = e => { if (e.target.checked) delete st.ldap.computerGroups; else st.ldap.computerGroups = 'off'; queueServerSave(); renderSetLdap(); };
  const bad = t => `<span style="color:var(--danger)">${esc(t)}</span>`;
  $('#ldapTest').onclick = async () => {
    const msg = $('#ldapMsg'); msg.textContent = 'Testing…';
    await flushSave();
    const r = await fetch('api/ldap/test', {method: 'POST', credentials: 'same-origin'});
    const j = await r.json().catch(() => ({}));
    /* Connected, but nobody in the sign-in group: most often the group's name or DN is not the one in the directory. */
    msg.innerHTML = !r.ok ? bad(j.error || 'The directory cannot be reached.')
      : j.people ? `<span style="color:var(--ok)">Connected. ${j.people} ${j.people === 1 ? 'user' : 'users'} can sign in, ${j.admins} of them ${j.admins === 1 ? 'admin' : 'admins'}.</span>`
      : bad('Connected, but no user is in the sign-in group. Check the group\'s name or DN, and the search base.');
  };
  $('#ldapSync').onclick = async () => {
    const msg = $('#ldapMsg'), btn = $('#ldapSync');
    btn.disabled = true; msg.textContent = 'Syncing…';
    await flushSave();
    const r = await fetch('api/ldap/sync', {method: 'POST', credentials: 'same-origin'});
    const j = await r.json().catch(() => ({}));
    btn.disabled = false;
    if (!r.ok){ msg.innerHTML = bad(j.error || 'The sync failed.'); return; }
    const c = j.counts;
    msg.textContent = `${c.people} users in scope: ${c.created} new, ${c.updated} updated, ${c.deactivated} deactivated.`
      + (c.computerError ? ` Computer groups could not be read: ${c.computerError}` : c.computers != null ? ` Computer groups changed on ${c.computers} ${c.computers === 1 ? 'device' : 'devices'}.` : '');
    await reloadFromServer();
  };
}
/* The service account's password: saved encrypted on the server, never sent back. Set on the server instead, it says so. */
async function loadLdapPassword(replace = false){
  const box = $('#ldapPw'); if (!box) return;
  const r = await fetch('api/ldap/password', {credentials: 'same-origin'}).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => ({})) : {};
  if (!$('#ldapPw')) return;
  const day = t => { const d = t ? new Date(t) : null; return d && !isNaN(d) ? `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}` : ''; };
  if (j.source === 'server'){ box.innerHTML = '<span class="muted">Set on the server (NI_LDAP_SERVICE_PASSWORD), which takes precedence</span>'; return; }
  if (j.source === 'app' && !replace){
    box.innerHTML = `<span class="chip ok" style="flex:none">Saved</span><span class="muted" style="flex:none">${esc(day(j.setAt))}</span><span style="flex:1"></span><button type="button" id="lpReplace" style="flex:none">Replace</button><button type="button" id="lpRemove" class="danger-text" style="flex:none">Remove</button>`;
    $('#lpReplace').onclick = () => loadLdapPassword(true);
    $('#lpRemove').onclick = async () => {
      if (!confirm('Remove the saved password? The directory cannot be read until a new one is saved.')) return;
      await fetch('api/ldap/password', {method: 'DELETE', credentials: 'same-origin'});
      toast('Password removed'); loadLdapPassword();
    };
    return;
  }
  box.innerHTML = `<input id="lk_pw" type="password" autocomplete="new-password" placeholder="The service account’s password" aria-label="Service account password"><button type="button" id="lpSave" style="flex:none">Save password</button>${replace ? '<button type="button" id="lpCancel" style="flex:none">Cancel</button>' : ''}`;
  const save = async () => {
    const pw = $('#lk_pw').value;
    if (!pw){ $('#lk_pw').focus(); return; }
    const x = await fetch('api/ldap/password', {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password: pw})});
    const e = await x.json().catch(() => ({}));
    if (!x.ok){ toast(e.error || 'Not saved.'); return; }
    toast('Password saved. Test connection checks it.'); loadLdapPassword();
  };
  $('#lpSave').onclick = save;
  $('#lk_pw').onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); save(); } };
  if ($('#lpCancel')) $('#lpCancel').onclick = () => loadLdapPassword();
}
/* An uploaded icon keeps only its drawing: scripts, event handlers, styles and links to anything outside the file are dropped. */
export function sanitizeSvg(text){
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) return null;
  const OK_EL = ['svg','g','path','circle','ellipse','rect','line','polyline','polygon','title','defs','desc'];
  const OK_AT = ['d','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','width','height','points','fill','fill-rule','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray','opacity','transform','id'];
  root.querySelectorAll('*').forEach(n => { if (n !== root && !OK_EL.includes(n.localName)) n.remove(); });
  /* Comments (an icon set's licence line) are dropped too: the server keeps shapes only. */
  const notes = doc.createTreeWalker(root, NodeFilter.SHOW_COMMENT), drop = [];
  while (notes.nextNode()) drop.push(notes.currentNode);
  drop.forEach(n => n.remove());
  root.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => { if (!OK_AT.includes(a.name.toLowerCase())) n.removeAttribute(a.name); }));
  const ser = new XMLSerializer();
  /* The viewBox goes into an attribute: only numbers are kept, anything else gets the usual box. */
  const view = (root.getAttribute('viewBox') || '').trim();
  return {inner: [...root.childNodes].map(n => ser.serializeToString(n)).join(''), view: VIEWBOX_RE.test(view) ? view : '0 0 24 24'};
}
export function passwordModal(u){
  modal(`<div class="mh">Password for ${esc(u.name)}</div>
    <div class="mb"><div class="form" style="padding:0"><label for="pwNew">New password</label><input id="pwNew" type="password" autocomplete="new-password" aria-describedby="pwHint"></div>
    <p class="note" id="pwHint">At least ${PW_MIN} characters, not a common password. The server stores only a salted hash.</p></div>
    <div class="mf"><button id="pwCancel">Cancel</button><button id="pwOk" class="primary">Set password</button></div>`, 'sm');
  $('#pwCancel').onclick = closeModal;
  $('#pwOk').onclick = async () => {
    const r = await fetch('api/users/' + encodeURIComponent(u.id) + '/password', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({password: $('#pwNew').value})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'Not set.'); return; }
    closeModal(); toast('Password set for ' + u.name);
  };
  $('#pwNew').focus();
}
/* Locations are 'Site / Room'. Renaming one moves the objects and racks that use it. */
export const cleanLoc = v => { const t = v.trim().split(/\s*\/\s*/).map(x => x.trim()); return t.length === 2 && t[0] && t[1] ? t.join(' / ') : ''; };
/* The uses a range can have. DHCP and reserved ranges are skipped when an address is picked for a device. */
const RANGE_USES = ['DHCP', 'Static', 'Reserved'];
const rangeRowHtml = (r = {}) => {
  const use = r.use || '', opts = [...new Set(['', ...RANGE_USES, use])];
  return `<div class="sn-range"><input data-rf class="mono" placeholder="10.10.20.50" value="${esc(r.from || '')}" aria-label="First address">
    <span class="muted">to</span><input data-rt class="mono" placeholder="10.10.20.99" value="${esc(r.to || '')}" aria-label="Last address">
    <select data-ru aria-label="Use of the range">${opts.map(u => `<option value="${esc(u)}" ${u === use ? 'selected' : ''}>${u ? esc(u) : 'No use set'}</option>`).join('')}</select>
    <button type="button" class="sn-rx" data-rx aria-label="Remove this range" title="Remove this range">×</button></div>`;
};
/* A subnet as typed in the editor. A range left empty is dropped; a half-filled one is kept, so the check says what is wrong. */
const subnetFromEditor = ed => {
  const q = s => ed.querySelector(s);
  const ranges = [...ed.querySelectorAll('.sn-range')].map(r => ({from: r.querySelector('[data-rf]').value.trim(), to: r.querySelector('[data-rt]').value.trim(), use: r.querySelector('[data-ru]').value}))
    .filter(r => r.from || r.to).map(r => ({from: r.from, to: r.to, ...(r.use ? {use: r.use} : {})}));
  return {
    name: q('[data-sn]').value.trim(), vid: q('[data-sv]').value === '' ? null : +q('[data-sv]').value,
    cidr: q('[data-sc]').value.trim(), gateway: q('[data-sg]').value.trim(),
    dns: q('[data-sd]').value.split(',').map(x => x.trim()).filter(Boolean), ranges,
    types: [...ed.querySelectorAll('[data-sty]:checked')].map(c => c.value)
  };
};
/* The editor of one subnet, for a new one or one in the list. A note says what was filled in from Lansweeper. */
const subnetEditorHtml = (n, key, hint = '') => `<div class="sn-edit" data-sub="${key}">
    <div class="sn-grid">
      <label>Name<input data-sn maxlength="60" value="${esc(n.name || '')}" placeholder="e.g. Office Willisau"></label>
      <label>Subnet<input data-sc class="mono" placeholder="10.10.20.0/24" value="${esc(n.cidr || '')}"></label>
      <label>VLAN<select data-sv><option value="">None</option>${VLANS.map(v => `<option value="${v.vid}" ${v.vid === n.vid ? 'selected' : ''}>${v.vid} · ${esc(v.name)}</option>`).join('')}</select></label>
      <label>Gateway<input data-sg class="mono" placeholder="10.10.20.1" value="${esc(n.gateway || '')}"></label>
      <label class="span2">DNS servers<input data-sd class="mono" placeholder="10.10.1.5, 10.10.1.6" value="${esc((n.dns || []).join(', '))}"></label>
    </div>
    <div class="sn-sect"><div class="sn-sh">Ranges<button type="button" data-radd>Add range</button></div>
      <div class="sn-ranges">${(n.ranges || []).map(rangeRowHtml).join('')}</div>
      <p class="note">A device's IP address lists the free addresses of Static ranges and of ones without a use; DHCP and Reserved ranges are left out.</p></div>
    <div class="sn-sect"><div class="sn-sh">Device types that take an address here<span class="sn-tq"><button type="button" class="link" data-tall>All</button><button type="button" class="link" data-tnone>None</button></span></div>
      <div class="sn-typegrid">${Object.entries(TYPES).map(([k, t]) => `<label class="sn-type"><input type="checkbox" data-sty value="${k}" ${(n.types || []).includes(k) ? 'checked' : ''}>${tico(k, 'tico sm')}<span>${esc(t.label)}</span></label>`).join('')}</div></div>
    ${hint ? `<p class="note sn-hint">${hint}</p>` : ''}
    <div class="subnet-foot"><span class="snmsg" aria-live="polite"></span><span class="grow"></span><button type="button" data-scancel>Cancel</button><button type="button" class="primary" data-ssave>${key === 'new' ? 'Add subnet' : 'Save'}</button></div></div>`;
/* A subnet in the list: its name, address and VLAN, with the gateway, ranges and device types underneath. */
const subnetItemHtml = (n, i, edit) => {
  const ranges = (n.ranges || []).map(r => `${r.use ? esc(r.use) + ' ' : ''}<span class="mono">${esc(r.from)}${r.to !== r.from ? '–' + esc(r.to.split('.').pop()) : ''}</span>`).join(', ');
  const types = (n.types || []).filter(t => TYPES[t]).map(t => TYPES[t].label);
  const meta = [n.gateway ? `Gateway <span class="mono">${esc(n.gateway)}</span>` : '', (n.dns || []).length ? `DNS <span class="mono">${esc(n.dns.join(', '))}</span>` : '',
    ranges ? `Ranges ${ranges}` : 'No ranges', types.length ? `For ${esc(types.slice(0, 4).join(', '))}${types.length > 4 ? ` and ${types.length - 4} more` : ''}` : 'No device types'].filter(Boolean);
  return `<div class="sn-item"><div class="sn-head"><b>${esc(n.name)}</b><span class="mono">${esc(n.cidr)}</span>${n.vid != null ? `<span class="chip">VLAN ${n.vid}</span>` : ''}<span class="grow"></span>
    ${edit ? `<button data-sedit="${i}">Edit</button><button data-sx="${i}">Delete</button>` : ''}</div><div class="sn-meta">${meta.join(' · ')}</div></div>`;
};
/* Which subnet is open in the editor: 'new', a position in the list, or none; and what a new one starts with. */
let snEdit = null, snDraft = null;
/* The subnets of the network. Each row is checked when it is changed, and a row that is not right is kept as typed, with the reason. */
export function renderSetSubnets(){
  const root = $('#setSubnets');
  if (!root) return;
  const edit = canEdit();
  if (!edit) snEdit = null;
  /* Subnets the devices' adapters are in that the list does not have yet. Use opens the editor filled in; nothing is added by itself. */
  const suggested = (st.lsNets || []).filter(n => !SUBNETS.some(x => x.cidr === n.cidr));
  root.innerHTML = `<div class="hdr">Subnets <span class="cnt">${SUBNETS.length}</span></div>
    <p class="note" style="padding:10px 12px 0">Each subnet is on one VLAN. Its gateway, DNS servers and ranges are inside it, and the device types are the ones that take an address from it.</p>
    <div class="subnets">${SUBNETS.length ? SUBNETS.map((n, i) => snEdit === i ? subnetEditorHtml(n, i) : subnetItemHtml(n, i, edit && snEdit === null)).join('') : '<p class="note lempty">No subnets yet.</p>'}</div>
    ${snEdit === 'new' ? subnetEditorHtml(snDraft ? snDraft.n : {}, 'new', snDraft ? snDraft.hint : '') : edit ? `<div class="sn-addbar"><button id="snNew">Add subnet</button></div>` : ''}
    ${suggested.length ? `<div class="sn-suggest"><div class="sn-sughead"><p class="note" style="padding:0">Seen by Lansweeper, not listed yet</p>${edit && snEdit === null && suggested.length > 1 ? `<button id="snUseAll">Use all ${suggested.length}</button>` : ''}</div>${suggested.map((n, i) => `<div class="snrow"><span class="mono">${esc(n.cidr)}</span><span class="grow">${n.devices} ${n.devices === 1 ? 'device' : 'devices'}${n.gateway ? ' · gateway ' + esc(n.gateway) : ''}${n.name ? ' · ' + esc(n.name) : ''}</span>${edit && snEdit === null ? `<button data-snuse="${i}">Use</button>` : ''}</div>`).join('')}</div>` : ''}`;
  if (!edit) return;
  const open = (key, draft = null) => { snEdit = key; snDraft = draft; renderSetSubnets(); const f = root.querySelector('.sn-edit [data-sn]'); if (f) f.focus(); };
  root.querySelectorAll('[data-sedit]').forEach(b => b.onclick = () => open(+b.dataset.sedit));
  const nb = $('#snNew'); if (nb) nb.onclick = () => open('new');
  root.querySelectorAll('[data-sx]').forEach(b => b.onclick = () => {
    const gone = SUBNETS[+b.dataset.sx];
    if (!confirm(`Delete the subnet ${gone.name} (${gone.cidr})? Devices on it keep their addresses.`)) return;
    for (const o of objs) if (o.subnet === gone.cidr){ delete o.subnet; hist(o, now(), `Subnet ${gone.name} (${gone.cidr}) deleted by ${who()}`); }
    SUBNETS.splice(+b.dataset.sx, 1); queueServerSave(); toast('Subnet deleted'); renderSetSubnets();
  });
  /* A suggestion as a subnet: name, gateway, DNS, the types seen there and a range per kind of address seen. */
  const fromSuggestion = n => ({name: n.name || n.cidr, cidr: n.cidr, vid: null, gateway: n.gateway || '', dns: n.dns || [],
    types: (n.types || []).map(t => t.type).filter(t => TYPES[t]), ranges: (n.seen || []).map(x => ({from: x.from, to: x.to, use: x.use}))});
  /* Use all: every suggestion is added. A gateway, DNS server or range that does not fit is left out of that subnet, and one
     that overlaps a subnet already listed is skipped; the message says what was done. */
  const all = $('#snUseAll');
  if (all) all.onclick = () => {
    const added = [], trimmed = [], skipped = [];
    for (const n of suggested) {
      const v = fromSuggestion(n), cut = [], span = subnetSpan(v), inside = a => { const x = ipInt(a); return x !== null && span && x >= span.first && x <= span.last; };
      if (v.gateway && !inside(v.gateway)){ cut.push(`gateway ${v.gateway}`); v.gateway = ''; }
      if (v.dns.some(d => ipInt(d) === null)){ v.dns = v.dns.filter(d => ipInt(d) !== null); cut.push('DNS'); }
      const ok = v.ranges.filter(r => inside(r.from) && inside(r.to) && ipInt(r.from) <= ipInt(r.to));
      if (ok.length < v.ranges.length){ v.ranges = ok; cut.push('a range'); }
      if (subnetProblem(v) || overlapProblem([...SUBNETS, v])){ skipped.push(n.cidr); continue; }
      SUBNETS.push(v); added.push(n.cidr); if (cut.length) trimmed.push(`${n.cidr} without its ${cut.join(' and ')}`);
    }
    if (added.length) queueServerSave();
    toast(`Added ${added.length} ${added.length === 1 ? 'subnet' : 'subnets'}${trimmed.length ? `; ${trimmed.join(', ')}` : ''}${skipped.length ? `; skipped ${skipped.join(', ')}` : ''}. Check their ranges against your DHCP server.`);
    renderSetSubnets();
  };
  /* Use: the editor filled in with what Lansweeper saw: name, gateway, DNS, the device types there, and a range per kind
     of address (DHCP, static) from the lowest to the highest address seen. */
  root.querySelectorAll('[data-snuse]').forEach(b => b.onclick = () => {
    const n = suggested[+b.dataset.snuse];
    const types = (n.types || []).map(t => t.type).filter(t => TYPES[t]);
    const seen = n.seen || [];
    const hint = `Filled in from what Lansweeper saw in ${esc(n.cidr)}: ${n.devices} ${n.devices === 1 ? 'device' : 'devices'}${types.length ? ` of ${types.length} ${types.length === 1 ? 'type' : 'types'}` : ''}.`
      + (seen.length ? ` Each range runs from the lowest to the highest address seen of its kind (${seen.map(x => `${x.use}: ${x.count}`).join(', ')}): check them against your DHCP server before saving.` : '');
    open('new', {n: fromSuggestion(n), hint});
  });
  const ed = root.querySelector('.sn-edit');
  if (!ed) return;
  const key = ed.dataset.sub;
  const bindRanges = () => ed.querySelectorAll('[data-rx]').forEach(x => x.onclick = () => x.closest('.sn-range').remove());
  bindRanges();
  ed.querySelector('[data-radd]').onclick = () => { ed.querySelector('.sn-ranges').insertAdjacentHTML('beforeend', rangeRowHtml({use: 'Static'})); bindRanges(); ed.querySelector('.sn-range:last-child [data-rf]').focus(); };
  ed.querySelector('[data-tall]').onclick = () => ed.querySelectorAll('[data-sty]').forEach(c => { c.checked = true; });
  ed.querySelector('[data-tnone]').onclick = () => ed.querySelectorAll('[data-sty]').forEach(c => { c.checked = false; });
  ed.querySelector('[data-scancel]').onclick = () => { snEdit = null; snDraft = null; renderSetSubnets(); };
  ed.querySelector('[data-ssave]').onclick = () => {
    const v = subnetFromEditor(ed), problem = subnetProblem(v), msg = ed.querySelector('.snmsg');
    if (problem){ msg.innerHTML = warn(problem); return; }
    const others = key === 'new' ? SUBNETS : SUBNETS.filter((_, k) => k !== +key), clash = overlapProblem([...others, v]);
    if (clash){ msg.innerHTML = warn(clash); return; }
    if (key === 'new'){ SUBNETS.push(v); toast('Subnet added'); }
    else {
      /* A subnet written with a new address keeps its devices: they point at it by its address. */
      const was = SUBNETS[+key].cidr;
      if (was !== v.cidr) for (const o of objs) if (o.subnet === was){ o.subnet = v.cidr; hist(o, now(), `Subnet ${v.name} is now ${v.cidr} (was ${was}), changed by ${who()}`); }
      SUBNETS[+key] = v; toast('Subnet saved');
    }
    snEdit = null; snDraft = null; queueServerSave(); renderSetSubnets();
  };
}
/* VLANs are one list for the whole inventory. A connection picks one from it, so a VLAN is named once. */
export function renderSetVlans(){
  const cnt = $('#vlCnt'); if (cnt) cnt.textContent = VLANS.length;
  const usedBy = vid => rels.filter(r => r.vlan === vid).length;
  const subnetsOn = vid => SUBNETS.filter(n => n.vid === vid).length;
  $('#setVlans').innerHTML = `<div class="lrows"><div class="lrow head vl"><span>VLAN</span><span>Name</span><span>Description</span><span class="n">Used by</span><span></span></div>
    ${VLANS.length ? VLANS.map((v, i) => { const n = usedBy(v.vid); return `<div class="lrow vl"><span class="mono">${v.vid}</span><input data-vn="${i}" maxlength="60" value="${esc(v.name)}" aria-label="Name of VLAN ${v.vid}"><input data-vdesc="${i}" maxlength="120" value="${esc(v.desc || '')}" placeholder="Description" aria-label="Description of VLAN ${v.vid}"><span class="n">${n}</span>
      <button data-vd="${i}" ${n || subnetsOn(v.vid) ? `disabled title="${subnetsOn(v.vid) ? 'A subnet is on this VLAN' : 'In use by ' + n + ' connections'}"` : ''}>Delete</button></div>`; }).join('') : '<p class="note lempty">No VLANs yet. Add the ones your network uses.</p>'}</div>
    <div class="lpanel-add"><input id="vlId" type="number" min="1" max="4094" placeholder="ID, e.g. 10" aria-label="VLAN ID" style="width:120px"><input id="vlName" placeholder="Name, e.g. Users" aria-label="VLAN name"><input id="vlDesc" maxlength="120" placeholder="Description (optional)" aria-label="VLAN description"><button id="vlAdd">Add VLAN</button></div>
    ${SUBNETS.some(n => n.vid != null) ? `<p class="note lnote">${SUBNETS.filter(n => n.vid != null).map(n => `VLAN ${n.vid} carries ${esc(n.name)}, ${esc(n.cidr)}`).join(' · ')}</p>` : ''}
    <p class="note lnote" id="vlMsg">IDs run from 1 to 4094. Each VLAN ID is listed once.</p>`;
  const root = $('#setVlans');
  root.querySelectorAll('[data-vn]').forEach(i => i.onchange = () => {
    const name = i.value.trim(), v = VLANS[+i.dataset.vn];
    if (!name){ i.value = v.name; $('#vlMsg').innerHTML = warn('A VLAN needs a name.'); return; }
    v.name = name; queueServerSave(); render(); renderSetVlans();
  });
  root.querySelectorAll('[data-vd]').forEach(b => b.onclick = () => { VLANS.splice(+b.dataset.vd, 1); queueServerSave(); toast('VLAN deleted'); renderSetVlans(); render(); });
  root.querySelectorAll('[data-vdesc]').forEach(i => i.onchange = () => { VLANS[+i.dataset.vdesc].desc = i.value.trim(); queueServerSave(); renderSetVlans(); });
  const add = () => {
    const vid = +$('#vlId').value, name = $('#vlName').value.trim(), msg = $('#vlMsg');
    if (!Number.isInteger(vid) || vid < 1 || vid > 4094){ msg.innerHTML = warn('The ID is a number from 1 to 4094.'); $('#vlId').focus(); return; }
    if (!name){ msg.innerHTML = warn('Give the VLAN a name.'); $('#vlName').focus(); return; }
    if (VLANS.some(v => v.vid === vid)){ msg.innerHTML = warn('VLAN ' + vid + ' is already listed.'); return; }
    const desc = $('#vlDesc').value.trim();
    VLANS.push({vid, name, ...(desc ? {desc} : {})}); VLANS.sort((a, b) => a.vid - b.vid);
    queueServerSave(); toast('Added VLAN ' + vid); renderSetVlans(); render();
  };
  $('#vlAdd').onclick = add;
  $('#vlName').onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); add(); } };
  renderSetDomains();
}
/* Domains are one list for the whole inventory; an object's domain is picked from it. */
export function renderSetDomains(){
  const usedBy = d => objs.filter(o => o.domain === d.name).length;
  const counts = new Map();
  for (const o of objs) if (o.domain && o.status !== 'retired' && !DOMAINS.some(d => d.name.toLowerCase() === o.domain.toLowerCase())) counts.set(o.domain, (counts.get(o.domain) || 0) + 1);
  const seen = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  $('#setDomains').innerHTML = `<div class="hdr">Domains <span class="cnt">${DOMAINS.length}</span></div>
    <div class="lrows">${DOMAINS.length ? DOMAINS.map((d, i) => { const n = usedBy(d); return `<div class="lrow dm"><input data-dname="${i}" class="mono" maxlength="60" value="${esc(d.name)}" aria-label="Domain ${esc(d.name)}"><input data-ddesc="${i}" maxlength="120" value="${esc(d.desc || '')}" placeholder="Description" aria-label="Description of ${esc(d.name)}"><span class="n">${n}</span><button data-dd="${i}" ${n ? `disabled title="Used by ${n} objects"` : ''}>Delete</button></div>`; }).join('') : '<p class="note lempty">No domains yet. Add the domains your devices join.</p>'}</div>
    <div class="lpanel-add"><input id="dmName" maxlength="60" placeholder="Domain, e.g. corp.example.ch" aria-label="New domain"><input id="dmDesc" maxlength="120" placeholder="Description (optional)" aria-label="Domain description"><button id="dmAdd">Add domain</button></div>
    ${seen.length ? `<div class="sn-suggest"><div class="sn-sughead"><p class="note" style="padding:0">Seen on devices, not listed yet</p>${canEdit() && seen.length > 1 ? `<button id="dmUseAll">Add all ${seen.length}</button>` : ''}</div>${seen.map(([d, n], i) => `<div class="snrow"><span class="mono">${esc(d)}</span><span class="grow">${n} ${n === 1 ? 'device' : 'devices'}</span>${canEdit() ? `<button data-dmuse="${i}">Add</button>` : ''}</div>`).join('')}</div>` : ''}`;
  const root = $('#setDomains');
  /* Domains the devices are in (from Lansweeper, or typed on a device) that the list does not have yet. */
  const addSeen = list => { for (const [d] of list) if (!DOMAINS.some(x => x.name.toLowerCase() === d.toLowerCase())) DOMAINS.push({name: d}); DOMAINS.sort((a, b) => a.name.localeCompare(b.name)); queueServerSave(); renderSetDomains(); render(); };
  root.querySelectorAll('[data-dmuse]').forEach(b => b.onclick = () => { const x = seen[+b.dataset.dmuse]; addSeen([x]); toast('Added ' + x[0]); });
  const all = $('#dmUseAll'); if (all) all.onclick = () => { addSeen(seen); toast(`Added ${seen.length} domains`); };
  root.querySelectorAll('[data-dd]').forEach(b => b.onclick = () => { DOMAINS.splice(+b.dataset.dd, 1); queueServerSave(); toast('Domain deleted'); renderSetDomains(); render(); });
  root.querySelectorAll('[data-ddesc]').forEach(i => i.onchange = () => { DOMAINS[+i.dataset.ddesc].desc = i.value.trim(); queueServerSave(); renderSetDomains(); });
  /* A domain can be renamed; the objects in it move with it. */
  root.querySelectorAll('[data-dname]').forEach(i => i.onchange = () => {
    const d = DOMAINS[+i.dataset.dname], was = d.name, name = i.value.trim();
    if (!name || name === was) { i.value = was; return; }
    if (/\s/.test(name)){ i.value = was; toast('A domain name has no spaces.'); return; }
    if (DOMAINS.some(x => x !== d && x.name.toLowerCase() === name.toLowerCase())){ i.value = was; toast(name + ' is already listed.'); return; }
    d.name = name;
    for (const o of objs) if (o.domain === was){ o.domain = name; hist(o, now(), `Domain ${was} renamed to ${name} by ${who()}`); }
    queueServerSave(); toast(`${was} is now ${name}`); renderSetDomains(); render();
  });
  const add = () => {
    const name = $('#dmName').value.trim(), desc = $('#dmDesc').value.trim();
    if (!name){ toast('Write the domain name.'); return; }
    if (DOMAINS.some(d => d.name.toLowerCase() === name.toLowerCase())){ toast(name + ' is already listed.'); return; }
    DOMAINS.push({name, ...(desc ? {desc} : {})}); DOMAINS.sort((a, b) => a.name.localeCompare(b.name));
    queueServerSave(); toast('Added ' + name); renderSetDomains(); render();
  };
  $('#dmAdd').onclick = add;
  $('#dmName').onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); add(); } };
}
export const warn = t => '<span style="color:var(--danger)">' + esc(t) + '</span>';
export const siteOf = l => String(l || '').split(' / ')[0];
export function renderSetLocs(){
  const siteRow = (x, i) => {
    const n = objs.filter(o => siteOf(o.loc) === x).length + LOCS.filter(l => siteOf(l) === x).length;
    return `<div class="lrow"><input data-si="${i}" value="${esc(x)}" aria-label="Site name"><span class="n">${n}</span>
      <button data-sd="${i}" ${n ? `disabled title="In use by ${n} rooms, objects or racks"` : ''}>Delete</button></div>`;
  };
  const roomRow = (l, i) => {
    const n = objs.filter(o => o.loc === l).length;
    return `<div class="lrow room"><span class="site" title="${esc(siteOf(l))}">${esc(siteOf(l))}</span><input data-lo="${i}" value="${esc(l.split(' / ').slice(1).join(' / '))}" aria-label="Room in ${esc(siteOf(l))}">
      <span class="n">${n}</span><button data-ld="${i}" ${n ? `disabled title="In use by ${n} objects or racks"` : ''}>Delete</button></div>`;
  };
  $('#setLocs').innerHTML = `<div class="locgrid">
    <section class="panelbox locpanel"><div class="hdr">Sites <span class="cnt">${SITES.length}</span></div>
      <div class="lrows"><div class="lrow head"><span>Site</span><span class="n">Used by</span><span></span></div>
        ${SITES.length ? SITES.map(siteRow).join('') : '<p class="note lempty">No sites yet. Add the first one below.</p>'}</div>
      <div class="lpanel-add"><input id="nsName" placeholder="New site, e.g. Basel" aria-label="New site"><button id="nsAdd">Add site</button></div>
      <p class="note lnote" id="nsMsg">A site is a town or a building.</p></section>
    <section class="panelbox locpanel"><div class="hdr">Rooms <span class="cnt">${LOCS.length}</span></div>
      <div class="lrows"><div class="lrow room head"><span>Site</span><span>Room</span><span class="n">Used by</span><span></span></div>
        ${LOCS.length ? LOCS.map(roomRow).join('') : '<p class="note lempty">No rooms yet.</p>'}</div>
      <div class="lpanel-add"><select id="nlSite" aria-label="Site for the new room">${SITES.map(x => `<option>${esc(x)}</option>`).join('')}</select><input id="nlRoom" placeholder="New room, e.g. Lager" aria-label="New room"><button id="nlAdd" class="primary" ${SITES.length ? '' : 'disabled'}>Add room</button></div>
      <p class="note lnote" id="nlMsg">${SITES.length ? 'Each room belongs to one site.' : 'Add a site first.'}</p></section>
  </div>`;
  const root = $('#setLocs');
  root.querySelectorAll('[data-si]').forEach(i => i.onchange = () => renameSite(SITES[+i.dataset.si], i.value));
  root.querySelectorAll('[data-sd]').forEach(b => b.onclick = () => { SITES.splice(+b.dataset.sd, 1); toast('Site deleted'); renderSetLocs(); render(); });
  root.querySelectorAll('[data-lo]').forEach(i => i.onchange = () => { const old = LOCS[+i.dataset.lo]; renameLoc(old, siteOf(old) + ' / ' + i.value.trim()); });
  root.querySelectorAll('[data-ld]').forEach(b => b.onclick = () => { LOCS.splice(+b.dataset.ld, 1); toast('Room deleted'); renderSetLocs(); render(); });
  const enter = (id, fn) => $(id).onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); fn(); } };
  $('#nsAdd').onclick = addSite; enter('#nsName', addSite);
  $('#nlAdd').onclick = addRoom; enter('#nlRoom', addRoom);
}
export function addSite(){
  const name = $('#nsName').value.trim(), msg = $('#nsMsg');
  if (!name || name.includes(' / ')){ msg.innerHTML = warn('Write the site name, without a slash.'); $('#nsName').focus(); return; }
  if (SITES.includes(name)){ msg.innerHTML = warn(name + ' already exists.'); return; }
  SITES.push(name); toast('Added site ' + name); renderSetLocs(); render();
}
export function addRoom(){
  const site = $('#nlSite') ? $('#nlSite').value : '', room = $('#nlRoom').value.trim(), msg = $('#nlMsg');
  if (!site){ msg.innerHTML = warn('Add a site first.'); return; }
  if (!room || room.includes(' / ')){ msg.innerHTML = warn('Write the room name, without a slash.'); $('#nlRoom').focus(); return; }
  const name = site + ' / ' + room;
  if (LOCS.includes(name)){ msg.innerHTML = warn(name + ' already exists.'); return; }
  LOCS.push(name); toast('Added ' + name); renderSetLocs(); render();
}
/* Renaming a site renames its rooms, the locations of the objects in them, and the racks. */
export function renameSite(old, value){
  const name = value.trim();
  if (!name || name.includes(' / ')){ toast('Write the site name, without a slash.'); renderSetLocs(); return; }
  if (name === old) return;
  if (SITES.includes(name)){ toast(name + ' already exists.'); renderSetLocs(); return; }
  SITES[SITES.indexOf(old)] = name;
  const move = l => (l === old || String(l || '').startsWith(old + ' / ')) ? name + String(l).slice(old.length) : l;
  LOCS.forEach((l, i) => { LOCS[i] = move(l); });
  objs.forEach(o => { if (o.loc) o.loc = move(o.loc); });
  /* Plans and their areas follow the rename, so the devices stay on them. */
  PLANS.forEach(p => { if (p.site === old) p.site = name; (p.areas || []).forEach(a => { if (a.room) a.room = move(a.room); }); });
  if (st.loc) st.loc = move(st.loc);
  renderSetLocs(); render();
}
export function renameLoc(old, value){
  const name = cleanLoc(value);
  if (!name){ toast('Use the form Site / Room, e.g. Basel / Lager'); renderSetLocs(); return; }
  if (name !== old && LOCS.includes(name)){ toast(name + ' already exists.'); renderSetLocs(); return; }
  if (name === old) return;
  LOCS[LOCS.indexOf(old)] = name;
  objs.forEach(o => { if (o.loc === old) o.loc = name; });
  PLANS.forEach(p => (p.areas || []).forEach(a => { if (a.room === old) a.room = name; }));
  if (st.loc === old) st.loc = name;
  toast('Renamed to ' + name); renderSetLocs(); render();
}
/* Address checks, the same rules as server/validate.js: an empty value is allowed. */
export const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
export const MAC_RE = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
export function validIPv6(v){
  if (v.length > 45 || !/^[0-9a-f:.]+$/i.test(v)) return false;
  if (v.includes('.')){ const i = v.lastIndexOf(':'); if (i < 0 || !IPV4_RE.test(v.slice(i + 1))) return false; v = v.slice(0, i + 1) + '0:0'; }
  const parts = v.split('::'); if (parts.length > 2) return false;
  const groups = x => (x === '' ? [] : x.split(':'));
  const all = [...groups(parts[0]), ...(parts.length === 2 ? groups(parts[1]) : [])];
  if (!all.every(g => /^[0-9a-f]{1,4}$/i.test(g))) return false;
  return parts.length === 2 ? all.length <= 7 : all.length === 8;
}
export function checkAddress(k, raw){
  const v = String(raw ?? '').trim();
  if (!v) return {ok: true, value: ''};
  if (k === 'ip') return IPV4_RE.test(v) ? {ok: true, value: v} : {ok: false, msg: `"${v}" is not an IPv4 address, such as 10.10.0.12.`};
  if (k === 'ip6') return validIPv6(v) ? {ok: true, value: v.toLowerCase()} : {ok: false, msg: `"${v}" is not an IPv6 address, such as 2001:db8::12.`};
  if (k === 'mac') return MAC_RE.test(v) ? {ok: true, value: v.toLowerCase().replace(/-/g, ':')} : {ok: false, msg: `"${v}" is not a MAC address, such as 70:b3:17:4a:00:01.`};
  return {ok: true, value: v};
}
/* Readable names for the icons, for the dropdown. */
export const ICON_LABEL = { plc: 'PLC / Controller', tablet: 'Tablet', pc: 'Computer', laptop: 'Laptop', server: 'Server', sip: 'VoIP phone', mobile: 'Mobile device', rack: 'Rack',
  monitor: 'Monitor', switch: 'Switch', router: 'Router', firewall: 'Firewall', modem: 'Modem', patch: 'Patch panel',
  printer: 'Printer', scanner: 'Scanner', projector: 'Projector', camera: 'Camera', storage: 'Storage', nas: 'NAS',
  ups: 'UPS', accesspoint: 'Access point', pbx: 'PBX', bmc: 'Remote management', other: 'Other' };
export const iconLabel = n => (n === 'custom' ? 'Uploaded icon' : ICON_LABEL[n] || n);
/* A dropdown that shows the icon and its name, for the object type's icon. */
export function iconChoice(k, t){
  const names = [...Object.keys(ICON), ...(t.svgInner ? ['custom'] : [])];
  const preview = n => n === 'custom' ? `<svg class="i cu" viewBox="${VIEWBOX_RE.test(t.svgView || '') ? t.svgView : '0 0 24 24'}">${t.svgInner}</svg>` : iconSvg(n);
  return `<div class="icondd"><button type="button" class="icondd-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(iconLabel(t.icon))}, icon for ${esc(t.label)}">${preview(t.icon)}<span>${esc(iconLabel(t.icon))}</span><span class="icondd-caret">▾</span></button>
    <div class="icondd-list" role="listbox" hidden>${names.map(n => `<button type="button" role="option" class="icondd-item" aria-selected="${n === t.icon}" data-ic="${k}" data-icon="${n}">${preview(n)}<span>${esc(iconLabel(n))}</span></button>`).join('')}<label class="icondd-up">Upload SVG icon...<input type="file" hidden accept=".svg,image/svg+xml" data-up="${k}" aria-label="Upload SVG icon for ${esc(t.label)}"></label></div></div>`;
}
export function closeIconLists(){ document.querySelectorAll('.icondd-list').forEach(l => { l.hidden = true; const b = l.previousElementSibling; if (b) b.setAttribute('aria-expanded', 'false'); }); }
document.addEventListener('click', e => { if (!e.target.closest('.icondd')) closeIconLists(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeIconLists(); });
/* The list is fixed to the viewport, so it closes when the page scrolls away from its button. */
document.addEventListener('scroll', e => { if (!e.target.closest?.('.icondd-list')) closeIconLists(); }, true);
/* A key for a field, from its name: lowercase letters, digits and underscores, starting with a letter. */
export const fieldKey = label => {
  let k = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 28);
  if (k && !/^[a-z]/.test(k)) k = 'f_' + k;
  return k.replace(/_+$/, '');
};
/* The fields a type has beyond the built-in ones. They are filled in by hand on every object of that type. */
export function renderSetTypeFields(){
  let box = $('#setTypeFields');
  if (!box) return;
  const type = st.fieldType && TYPES[st.fieldType] ? st.fieldType : Object.keys(TYPES)[0];
  st.fieldType = type;
  const list = TYPE_FIELDS[type] || [];
  const nOf = objs.filter(o => o.type === type).length;
  box.innerHTML = `<div class="panelbox tf-box"><div class="hdr">Per type</div>
    <div class="tf-pick"><label for="tfType">Type</label><select id="tfType">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select><span class="muted">${nOf} ${nOf === 1 ? 'object' : 'objects'}</span></div>
    <div id="tfBuiltin"></div>
    <div class="lpanel-add tf-add"><input id="tfLabel" maxlength="40" placeholder="Add a field of your own, e.g. Asset tag" aria-label="Name of a new field"><select id="tfKind" aria-label="Kind of value"><option value="text">Text</option><option value="number">Number</option></select><button id="tfAdd">Add field</button></div>
    <div id="tfCard"></div></div>`;
  $('#tfType').onchange = e => { st.fieldType = e.target.value; renderSetTypeFields(); };
  const add = () => {
    const label = $('#tfLabel').value.trim(), key = fieldKey(label);
    if (!label){ toast('Give the field a name.'); return; }
    if (!key){ toast('Use letters or digits in the name.'); return; }
    if (list.some(f => f.key === key)){ toast('That field already exists for this type.'); return; }
    TYPE_FIELDS[type] = [...list, {key, label, kind: $('#tfKind').value}];
    queueServerSave(); toast('Added ' + label); renderSetTypeFields(); render();
  };
  $('#tfAdd').onclick = add;
  $('#tfLabel').onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); add(); } };
  renderBuiltinFields($('#tfBuiltin'), type);
  renderCardLines($('#tfCard'), type);
}
/* The four lines a card shows for this type. Every card of the type shows the same four, so cards line up. */
export function renderCardLines(box, type){
  const lay = FIELD_LAYOUT[type] || {}, cur = cardLines(type), own = Array.isArray(lay.card) && lay.card.length;
  const choices = [...Object.entries(CARD_FIELDS).map(([k, [l]]) => [k, l]), ...(TYPE_FIELDS[type] || []).map(f => ['custom.' + f.key, f.label])];
  box.insertAdjacentHTML('beforeend', `<div class="tf-sub"><div class="tf-sh">On the ${esc(TYPES[type].label)} card</div>
    <p class="note tf-note">The four lines every ${esc(TYPES[type].label)} card shows. A device without a value shows a dash, so all cards have the same height.</p>
    <div class="cardlines">${cur.map((k, i) => `<label>Line ${i + 1}<select data-cl="${i}" aria-label="Card line ${i + 1}"><option value="">Nothing</option>${choices.map(([v, l]) => `<option value="${esc(v)}" ${v === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`).join('')}
      <button id="clReset" ${own ? '' : 'disabled'}>Back to the default</button></div></div>`);
  const save = card => { const next = {...lay}; if (card) next.card = card; else delete next.card; FIELD_LAYOUT[type] = next; queueServerSave(); render(); renderSetTypeFields(); };
  box.querySelectorAll('[data-cl]').forEach(sel => sel.onchange = () => { const next = [...cur]; next[+sel.dataset.cl] = sel.value; save(next); });
  $('#clReset').onclick = () => save(null);
}
/* Every field of a type in one list, in the order its object page shows them: the built-in ones and the type's own.
   Click a name to rename it, untick Shown to hide it (its values are kept), move it with the arrows. Name, type, status
   and location are always shown; a field of the type's own can be removed. */
const ALWAYS_SHOWN = ['name', 'type', 'status', 'loc'];
export function renderBuiltinFields(box, type){
  const lay = FIELD_LAYOUT[type] || {}, own = TYPE_FIELDS[type] || [];
  const base = typeFieldsOf(type);
  if (canAddPorts(type)) base.push(['ports', 'Ports', 'mono'], ['pfx', 'Port naming', 'mono']);
  const seen = new Set(), builtins = base.filter(f => !seen.has(f[0]) && seen.add(f[0]));
  const ofType = objs.filter(o => o.type === type);
  /* Fields Lansweeper fills in on devices of this type that the type does not have (firmware on a printer): listed too,
     so they can be renamed, moved and hidden here like the rest. */
  const extras = LS_ON() ? Object.keys(FIELD_LABEL).filter(k => !seen.has(k) && ofType.some(o => o.feed && o[k] !== undefined && o[k] !== '')).map(k => [k, FIELD_LABEL[k], fieldKind(k), false, true]) : [];
  /* In the order the page shows them before any is moved: the type's fields, its own ones, then Lansweeper's extras.
     Each is [key, label, kind, own (a field added to this type), extra (Lansweeper's, the type does not have it)]. */
  const all = [...builtins, ...own.map(f => ['custom.' + f.key, f.label, f.kind, true]), ...extras];
  /* Rows whose Shown tick is not the whole story. */
  const NOTES = { boot: 'Only while Lansweeper is on' };
  if (canAddPorts(type)) Object.assign(NOTES, { ports: 'Only on devices with ports', pfx: 'Only on devices with ports' });
  const at = f => { const i = (lay.order || []).indexOf(f[0]); return i < 0 ? 1e6 + all.indexOf(f) : i; };
  const ordered = [...all].sort((a, b) => at(a) - at(b));
  const save = next => { FIELD_LAYOUT[type] = next; queueServerSave(); render(); renderSetTypeFields(); };
  const put = patch => save({order: ordered.map(f => f[0]), hidden: [...hiddenOf(type)], labels: {...(lay.labels || {})}, ...(lay.card ? {card: lay.card} : {}), ...patch});
  const valueOf = (o, k) => k.startsWith('custom.') ? (o.custom || {})[k.slice(7)] : o[k];
  const filled = k => ofType.filter(o => { const v = valueOf(o, k); return v != null && v !== '' && v !== 0 && !(Array.isArray(v) && !v.length); }).length;
  const tl = esc(TYPES[type].label);
  box.innerHTML = `<p class="note tf-note">The fields a ${tl} page shows, top to bottom. Click a name to rename it. Hidden fields keep their values.</p>
    <div class="tf-list"><div class="tf-row tf-head" aria-hidden="true"><span></span><span>Field</span><span></span><span class="fl-use">Filled in</span><span>On the page</span><span></span></div>${ordered.map((f, i) => {
      const k = f[0], mine = !!f[3], hidden = hiddenOf(type).includes(k), fixed = ALWAYS_SHOWN.includes(k), n = filled(k);
      const name = mine ? f[1] : ((lay.labels || {})[k] || f[1]);
      return `<div class="tf-row${hidden ? ' off' : ''}">
        <span class="fl-move"><button class="icon ghost" data-fup="${i}" aria-label="Move ${esc(name)} up" ${i === 0 ? 'disabled' : ''}>↑</button><button class="icon ghost" data-fdown="${i}" aria-label="Move ${esc(name)} down" ${i === ordered.length - 1 ? 'disabled' : ''}>↓</button></span>
        <input class="tf-name" data-flab="${esc(k)}" maxlength="40" value="${esc(name)}" aria-label="Name of field ${esc(f[1])}" title="${mine ? 'A field of your own' : 'Built in: ' + esc(f[1])}">
        <span class="tf-tag">${mine ? `<span class="chip">Own · ${esc(f[2] || 'text')}</span>` : f[4] ? '<span class="chip" title="This type does not have it; Lansweeper fills it in on some devices">From Lansweeper</span>' : NOTES[k] ? `<span class="muted tf-note-k">${NOTES[k]}</span>` : ''}</span>
        <span class="fl-use ${n ? '' : 'muted'}" title="${n} of ${ofType.length} ${tl} objects have a value">${ofType.length ? `${n} of ${ofType.length}` : ''}</span>
        ${fixed ? '<span class="muted tf-fixed">Always shown</span>' : `<label class="pchk tf-shown"><input type="checkbox" data-fhide="${esc(k)}" ${hidden ? '' : 'checked'}> Shown</label>`}
        ${mine ? `<button class="icon ghost tf-del" data-tfd="${own.findIndex(x => 'custom.' + x.key === k)}" aria-label="Remove field ${esc(name)}" title="Remove this field (its values are kept)">×</button>` : '<span></span>'}
      </div>`;
    }).join('')}</div>`;
  box.querySelectorAll('[data-flab]').forEach(i => i.onchange = () => {
    const k = i.dataset.flab, name = i.value.trim(), f = ordered.find(x => x[0] === k);
    if (f[3]){
      if (!name){ i.value = f[1]; toast('A field needs a name.'); return; }
      own.find(x => 'custom.' + x.key === k).label = name; queueServerSave(); toast('Field renamed'); render(); renderSetTypeFields(); return;
    }
    const labels = {...(lay.labels || {})};
    if (!name || name === f[1]) delete labels[k]; else labels[k] = name;
    put({labels});
  });
  box.querySelectorAll('[data-fhide]').forEach(c => c.onchange = () => {
    const k = c.dataset.fhide, hidden = hiddenOf(type).filter(x => x !== k);
    if (!c.checked) hidden.push(k);
    put({hidden});
  });
  box.querySelectorAll('[data-tfd]').forEach(b => b.onclick = () => {
    const f = own[+b.dataset.tfd]; if (!f) return;
    own.splice(+b.dataset.tfd, 1); if (!own.length) delete TYPE_FIELDS[type];
    const k = 'custom.' + f.key;
    put({hidden: hiddenOf(type).filter(x => x !== k), order: ordered.map(x => x[0]).filter(x => x !== k)});
    toast('Field removed');
  });
  const move = (i, to) => { if (to < 0 || to >= ordered.length) return; const o = ordered.map(f => f[0]); [o[i], o[to]] = [o[to], o[i]]; put({order: o}); };
  box.querySelectorAll('[data-fup]').forEach(b => b.onclick = () => move(+b.dataset.fup, +b.dataset.fup - 1));
  box.querySelectorAll('[data-fdown]').forEach(b => b.onclick = () => move(+b.dataset.fdown, +b.dataset.fdown + 1));
}
/* A type's name as the server keeps it: plain text of up to 60 characters. */
const typeName = v => String(v || '').replace(/[<>]/g, '').trim().slice(0, 60);
/* Object types: rename, recolour, change the icon, add new ones. A type can be deleted only when it is not built in, no
   object has it, and no type rule or Lansweeper type name leads to it. */
export function renderSetTypes(){
  const rows = Object.entries(TYPES).map(([k,t]) => {
    const n = objs.filter(o => o.type === k).length;
    const lock = BUILTIN.includes(k) ? 'Built in' : n ? `In use by ${n} objects` : '';
    return `<tr>
      <td style="width:1%"><input type="color" value="${esc(tcol(k))}" data-tc="${k}" aria-label="Colour for ${esc(t.label)}" style="width:40px;height:28px;padding:2px"></td>
      <td><input data-tl="${k}" value="${esc(t.label)}" style="width:100%" aria-label="Name"></td>
      <td><input data-ts="${k}" value="${esc(t.short)}" aria-label="Short name"></td>
      <td>${iconChoice(k, t)}</td>
      <td class="n">${n}</td>
      <td><button data-td="${k}" ${BUILTIN.includes(k) || n ? `disabled title="${lock}"` : ''}>Delete</button></td></tr>`;
  }).join('');
  $('#setTypes').innerHTML = `<div style="overflow-x:auto"><table class="grid mini types" style="min-width:0"><colgroup><col style="width:70px"><col><col style="width:120px"><col style="width:200px"><col style="width:80px"><col style="width:100px"></colgroup><thead><tr><th>Colour</th><th>Name</th><th>Short</th><th>Icon</th><th class="n">Objects</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="addrel"><input id="ntName" placeholder="New type, e.g. Access point" style="flex:1;min-width:160px" aria-label="New type name"><button id="ntAdd">Add type</button></div>`;
  const root = $('#setTypes');
  renderSetTypeFields();
  root.querySelectorAll('[data-tc]').forEach(i => i.oninput = () => { TYPES[i.dataset.tc].color = i.value; render(); });
  root.querySelectorAll('[data-tl]').forEach(i => i.onchange = () => { TYPES[i.dataset.tl].label = typeName(i.value) || TYPES[i.dataset.tl].label; renderSetTypes(); render(); });
  root.querySelectorAll('[data-ts]').forEach(i => i.onchange = () => { TYPES[i.dataset.ts].short = typeName(i.value) || TYPES[i.dataset.ts].short; render(); });
  root.querySelectorAll('.icondd-btn').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const list = b.nextElementSibling, open = list.hidden;
    closeIconLists();
    if (open) {
      /* Below the button when there is room, above it when there is not, and kept inside the window. */
      const r = b.getBoundingClientRect();
      Object.assign(list.style, { left: Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)) + 'px', width: r.width + 'px', top: '0px' });
      list.hidden = false;
      const h = Math.min(list.offsetHeight, 320), below = window.innerHeight - r.bottom - 8;
      list.style.top = (h <= below || r.top < h + 8 ? r.bottom + 4 : r.top - h - 4) + 'px';
    }
    list.hidden = !open; b.setAttribute('aria-expanded', String(open));
  });
  root.querySelectorAll('.icondd-item').forEach(b => b.onclick = () => { TYPES[b.dataset.ic].icon = b.dataset.icon; renderSetTypes(); render(); });
  root.querySelectorAll('[data-up]').forEach(f => f.onchange = async () => {
    const file = f.files[0]; if (!file) return;
    const clean = sanitizeSvg(await file.text());
    if (!clean){ toast('That file is not an SVG icon.'); f.value = ''; return; }
    Object.assign(TYPES[f.dataset.up], {svgInner: clean.inner, svgView: clean.view, icon: 'custom'});
    toast('Icon uploaded for ' + TYPES[f.dataset.up].label); renderSetTypes(); render();
  });
  /* A type a type rule or a Lansweeper type name still leads to stays: the server would refuse every later save. */
  root.querySelectorAll('[data-td]').forEach(b => b.onclick = () => {
    const k = b.dataset.td;
    const rule = (Array.isArray(st.typeRules) ? st.typeRules : []).findIndex(r => r && r.to === k);
    const named = Object.keys(st.typeMap || {}).find(n => st.typeMap[n] === k);
    if (rule >= 0){ toast(`${TYPES[k].label} is used by type rule ${rule + 1} (Settings → Feed). Change that rule first.`); return; }
    if (named){ toast(`${TYPES[k].label} is the type for the Lansweeper type name “${named}” (Settings → Feed). Change that first.`); return; }
    toast(TYPES[k].label + ' deleted'); delete TYPES[k]; renderSetTypes(); render();
  });
  $('#ntAdd').onclick = () => {
    const name = typeName($('#ntName').value);
    if (!name){ toast('Give the new type a name first.'); return; }
    if (Object.values(TYPES).some(t => t.label.toLowerCase() === name.toLowerCase())){ toast(name + ' already exists.'); return; }
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'type';
    let k = base, i = 2; while (TYPES[k]) k = base + '-' + i++;
    TYPES[k] = {label:name, short:name, color:'#5a6b7d', icon:'other'};
    toast('Added ' + name + '. Pick it when you create an object.'); renderSetTypes(); render();
  };
}
/* Feed on the server: upload the report, and the server applies the policy and the merge rules. */
/* Feed. The Lansweeper API settings are saved in the inventory; the token is on the server. A Lansweeper export
   can also be uploaded here. */
/* The push token made in this panel. undefined until it is loaded; the new token is shown once, here. */
export let pushInfo;
export let pushLast = null;
export let pushNew = '';
export let pushNote = '';
export async function loadPushInfo(){
  const r = await fetch('api/feed/push-token', {credentials: 'same-origin'});
  if (r.ok){ const j = await r.json(); pushInfo = j.info; pushLast = j.last; if ($('#setFeed')) renderSetFeed(); }
}
/* A date for people: "22.10.2026 18:03", '—' when there is none. */
export const pushDate = v => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : ''; };
/* Under the push token: the last push, and the linked devices that have not been seen for 30 days. */
export function pushStatus(){
  const c = pushLast ? pushLast.counts : null;
  const last = c ? `${pushDate(pushLast.at)}: ${c.created || 0} new, ${c.updated || 0} updated, ${c.links || 0} links, ${c.software || 0} with software${c.ambiguous ? ', ' + c.ambiguous + ' skipped (shared names)' : ''}` : 'No push yet';
  const old = objs.filter(o => o.feed && o.feed.seen && daysSince(o.feed.seen) >= 30);
  const stale = old.length ? `${old.length} linked device${old.length === 1 ? '' : 's'} not seen for 30 days or more: ${old.slice(0, 20).map(o => esc(o.name)).join(', ')}${old.length > 20 ? ' …' : ''}.` : 'All linked devices were seen in the last 30 days.';
  return `<div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label>Last push</label><span>${last}</span></div>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label>Not seen</label><span>${stale}</span></div>`;
}
export function renderSetFeed(){
  if (!LS_ON()){ $('#setFeed').innerHTML = ''; return; }
  if (!st.lansweeper) st.lansweeper = {};
  const L = st.lansweeper, edit = canEdit(), ro = edit ? '' : 'disabled';
  const field = (k, label, hint) => `<label for="ls_${k}">${label}</label><input id="ls_${k}" data-ls="${k}" class="mono" value="${esc(L[k] || '')}" placeholder="${esc(hint)}" ${ro}>`;
  const ready = SERVER.lansweeper && edit;
  if (edit && pushInfo === undefined) loadPushInfo();
  const pushPanel = edit ? `<div class="panelbox" id="lsPushPanel"><div class="hdr">Lansweeper push</div>
    <div class="note" style="padding:10px 12px 6px">
      <p style="margin:0 0 6px"><b>Setup on the Lansweeper server</b></p>
      <ol style="margin:0;padding-left:20px;line-height:1.6">
        <li>Create a token below and copy it. It is shown once, and it is the password the script uses for this inventory.</li>
        <li>Get the script from <a class="link" style="text-decoration:underline" href="https://github.com/monsama/nobs-inventory/blob/main/scripts/Lansweeper-Push.ps1" target="_blank" rel="noopener">GitHub (scripts/Lansweeper-Push.ps1)</a>, or use <b>Download script</b> below, which already has this address in it.</li>
        <li>In PowerShell on the Lansweeper server, run <code>.\Lansweeper-Push.ps1</code>. The first time it asks for this inventory's address and the token, checks both, keeps them, and sends the data. <code>-Setup</code> asks again; <code>-DryRun</code> only shows what it would send.</li>
      </ol>
      <p style="margin:6px 0 0">If the script cannot read the Lansweeper database, store its SQL login with <code>-SetSqlCredential</code>.</p>
    </div>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label>Token</label><span>${pushInfo ? `Active since ${esc(pushDate(pushInfo.created))}` : 'None yet. Create one to connect the script.'}</span></div>
    ${pushStatus()}
    ${pushNew ? `<div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label for="pushTok">New token</label><input id="pushTok" class="mono" readonly value="${esc(pushNew)}"></div>
    <p class="note" style="padding:0 12px 10px">Copy it now. It is shown only once. The script asks for it on its first run.</p>` : ''}
    <div class="addrel" style="padding:10px 12px">
      <button id="pushNew" class="primary" ${pushInfo === undefined ? 'disabled' : ''}>${pushInfo ? 'Replace token' : 'Create token'}</button>
      ${pushNew ? '<button id="pushCopy">Copy token</button>' : ''}
      ${pushInfo ? '<button id="pushRevoke" class="danger-text">Revoke</button>' : ''}
      <button id="pushScript" ${pushInfo ? '' : 'disabled title="Create a token first"'}>Download script</button>
      <span class="note" id="pushMsg">${esc(pushNote)}</span></div></div>` : '';
  $('#setFeed').innerHTML = pushPanel + `<div class="panelbox" id="lsApiPanel"><div class="hdr">Lansweeper API <span class="chip warn" title="Not yet verified against a live Lansweeper">Experimental</span></div>
    <div class="note" style="padding:10px 12px">${SERVER.lansweeper ? 'The API token is set on the server.' : 'No API token is set on the server yet. An administrator sets NI_LS_TOKEN (or NI_LS_TOKEN_FILE) on the server; the token is never stored in the inventory.'}</div>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)">
      ${field('endpoint', 'API address', 'https://api.lansweeper.com/api/v2/graphql')}
      ${field('site', 'Site ID', 'empty: the first site of the token')}
      ${field('authScheme', 'Authorization', 'Token')}
    </div>
    <div style="padding:8px 12px 12px">${scheduleRowHtml('lansweeper', edit)}</div>
    <div class="addrel" style="padding:10px 12px"><button id="lsSync" class="primary" ${ready ? '' : 'disabled'}>Sync now</button><span class="note" id="lsMsg"></span></div></div>
  <div class="panelbox"><div class="hdr">CSV import <span class="chip warn" title="Import is not yet verified against a live Lansweeper export">Experimental</span></div>
    <div class="note" style="padding:10px 12px">Or upload a Lansweeper report (CSV). Matches are found by serial number, then name. Only the fields the policy allows are changed; what you set by hand stays.</div>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label for="feedUp">Report</label><input id="feedUp" type="file" accept=".csv,text/csv" ${ro}></div>
    <div class="note" style="padding:10px 12px">The server can also import this report by itself, on the Lansweeper schedule, from a file your administrator sets up.</div></div>`;
  /* One source at a time: show the script push or the API panel, never both. */
  if ($('#lsPushPanel')) $('#lsPushPanel').hidden = st.lsSource === 'api';
  if ($('#lsApiPanel')) $('#lsApiPanel').hidden = st.lsSource !== 'api';
  bindScheduleRows($('#setFeed'));
  $('#setFeed').querySelectorAll('[data-ls]').forEach(i => i.onchange = () => { st.lansweeper[i.dataset.ls] = i.value.trim(); queueServerSave(); renderSetFeed(); });
  const pushMsg = t => { const m = $('#pushMsg'); if (m) m.textContent = t; };
  if ($('#pushNew')) $('#pushNew').onclick = async () => {
    const r = await fetch('api/feed/push-token', {method: 'POST', credentials: 'same-origin'});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ pushMsg(j.error || 'The token could not be made.'); return; }
    pushNew = j.token; pushInfo = j.info; pushNote = ''; renderSetFeed();
  };
  /* After a copy the token is hidden again; it can only be read once, then a new token is made. */
  if ($('#pushCopy')) $('#pushCopy').onclick = async () => {
    const box = $('#pushTok'); box.select();
    let copied = false;
    try { await navigator.clipboard.writeText(pushNew); copied = true; } catch { copied = document.execCommand('copy'); }
    if (!copied){ pushMsg('Could not copy. Select the token and copy it by hand.'); return; }
    pushNew = ''; pushNote = 'Copied. The token is hidden now. Make a new one if you need it again.'; renderSetFeed();
  };
  if ($('#pushRevoke')) $('#pushRevoke').onclick = async () => {
    if (!confirm('Revoke the token? The Lansweeper script stops working until you make a new one.')) return;
    const r = await fetch('api/feed/push-token', {method: 'DELETE', credentials: 'same-origin'});
    if (!r.ok){ pushMsg('The token could not be revoked.'); return; }
    pushInfo = null; pushNew = ''; pushNote = ''; renderSetFeed();
  };
  if ($('#pushScript')) $('#pushScript').onclick = () => { window.location.href = 'api/feed/push-script'; };
  const bad = t => `<span style="color:var(--danger)">${esc(t)}</span>`;
  $('#lsSync').onclick = async () => {
    const msg = $('#lsMsg'), btn = $('#lsSync');
    btn.disabled = true; msg.textContent = 'Syncing…';
    await flushSave();
    const r = await fetch('api/feed/sync', {method: 'POST', credentials: 'same-origin'});
    const j = await r.json().catch(() => ({}));
    btn.disabled = false;
    if (!r.ok){ msg.innerHTML = bad(j.error || 'The sync failed.'); return; }
    const c = j.counts;
    msg.textContent = `${c.assets} assets: ${c.created} new, ${c.updated} updated, ${c.linked} linked${c.excluded ? ', ' + c.excluded + ' excluded' : ''}${c.ambiguous ? ', ' + c.ambiguous + ' skipped (shared names)' : ''}.`;
    await reloadFromServer();
  };
  $('#feedUp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const r = await fetch('api/feed/import', {method: 'POST', headers: {'Content-Type': 'text/csv'}, credentials: 'same-origin', body: await f.text()});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'The export could not be imported.'); return; }
    const c = j.counts;
    toast(`Import: ${c.created} new, ${c.updated} updated, ${c.linked} linked, ${c.unchanged} unchanged${c.ambiguous ? ', ' + c.ambiguous + ' skipped (shared names)' : ''}`);
    await reloadFromServer();
  };
}
/* The feed is optional: without one, every object is entered and kept by hand. */

