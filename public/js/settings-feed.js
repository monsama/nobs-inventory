/* Settings → Feed: Lansweeper on or off, its source (push or API), the push token and script, the type names and
   type rules, the model renames, and the sync schedule rows every sync uses. */
import { parseTime, timeFieldHtml } from './datefield.js';
import { dateTimeText } from './dates.js';
import { scheduleOf, SCHEDULE_JOBS, EVERY_HOURS, nextRun, scheduleText } from './schedule.js';
import { modal, closeModal } from './03-object-modals.js';
import { DEFAULT_TYPE_RULES, RULE_FIELDS } from './type-rules.js';
import { queueServerSave, render, flushSave, reloadFromServer, SERVER } from './07-render-plans.js';
import { canEdit, renderSetPane, who } from './04-settings.js';
import { $, LS_ON, st, TYPES, objs, hist, now, modelNames, esc, MODELS, toast, daysSince } from './01-core.js';
/* The switch that turns Lansweeper on or off for this inventory. */
export function renderLsToggle(){
  const host = $('#setLsToggle'); if (!host) return;
  const ro = canEdit() ? '' : 'disabled';
  const on = LS_ON(), api = st.lsSource === 'api';
  host.innerHTML = `<div class="panelbox"><div class="hdr">Lansweeper</div>
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)">
      <label for="useLs">Connect Lansweeper</label>
      <div><label class="pchk" style="width:auto"><input type="checkbox" id="useLs" ${on ? 'checked' : ''} ${ro}> ${on ? 'On. Lansweeper data comes in and is shown.' : 'Off. Lansweeper is not used: its settings, data and panels are hidden.'}</label></div>
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
  /* The names Lansweeper sends that become each model (kept when a model is renamed), so a rename can be seen and undone. */
  const map = st.modelMap || {}, from = {};
  for (const [lsName, to] of Object.entries(map)) (from[to] ||= []).push(lsName);
  const fromLine = m => from[m] && from[m].length ? `<div class="mdl-from"><span class="muted">From Lansweeper also as</span>${from[m].sort((a, b) => a.localeCompare(b)).map(n => `<span class="chip kept mdl-map">${esc(n)}${edit ? `<button class="icon ghost" data-mdmap="${esc(n)}" aria-label="Stop turning ${esc(n)} into ${esc(m)}" title="Stop: Lansweeper's name is kept as it is">×</button>` : ''}</span>`).join('')}</div>` : '';
  const elsewhere = Object.keys(from).filter(m => !names.includes(m)).sort((a, b) => a.localeCompare(b));
  root.innerHTML = `<div class="hdr">Models <span class="cnt">${names.length}</span></div>
    <p class="note" style="padding:10px 12px 6px">A model typed on a device is kept here, and every device can choose it. Renaming a model renames it on every device that has it. The old name still maps to the new one when Lansweeper sends it: shown under the model, and × stops it.</p>
    <div class="lrows">${names.length ? names.map((m, i) => `<div class="lrow mdl"><input data-mdn="${i}" value="${esc(m)}" aria-label="Model name" ${ro}><span class="muted">${count[m] ? count[m] + (count[m] === 1 ? ' device' : ' devices') : 'Not used yet'}</span>${!count[m] && edit ? `<button data-mdx="${i}" class="danger-text">Remove</button>` : '<span></span>'}${fromLine(m)}</div>`).join('') : '<p class="note lempty">No models yet. A model appears here when a device has one.</p>'}
    ${elsewhere.map(m => `<div class="lrow mdl"><span><b>${esc(m)}</b> <span class="muted">(not in the list)</span></span><span></span><span></span>${fromLine(m)}</div>`).join('')}</div>`;
  if (!edit) return;
  root.querySelectorAll('[data-mdn]').forEach(i => i.onchange = () => renameModel(names[+i.dataset.mdn], i.value));
  root.querySelectorAll('[data-mdx]').forEach(b => b.onclick = () => removeModel(names[+b.dataset.mdx]));
  root.querySelectorAll('[data-mdmap]').forEach(b => b.onclick = () => {
    const n = b.dataset.mdmap, to = (st.modelMap || {})[n];
    delete st.modelMap[n];
    queueServerSave(); renderSetModels();
    toast(`From the next sync, “${n}” from Lansweeper stays as it is (not ${to}).`);
  });
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
export const ENTRA = 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade';
/* When a sync runs by itself: an interval from a start time, or off. Saved with the settings; the server picks it up at once. */
export function scheduleRowHtml(job, edit){
  const plan = scheduleOf(st)[job], ro = edit ? '' : 'disabled';
  const label = h => h === 0 ? 'Off (only Sync now)' : h === 24 ? 'Daily' : h === 1 ? 'Every hour' : `Every ${h} hours`;
  return `<div class="sched-row" data-sched="${job}"><span class="sched-l">Runs by itself</span>
    <select data-sched-every="${job}" aria-label="How often ${esc(SCHEDULE_JOBS[job])} syncs" ${ro}>${EVERY_HOURS.map(h => `<option value="${h}" ${h === plan.every ? 'selected' : ''}>${label(h)}</option>`).join('')}</select>
    <span class="sched-from" ${plan.every ? '' : 'hidden'}>${plan.every === 24 ? 'at' : 'from'}</span>${timeFieldHtml(`data-sched-at="${job}" aria-label="Start time" ${ro}`, plan.at, { hidden: !plan.every })}
    <span class="muted sched-next">${plan.every ? 'next at ' + nextRun(plan) : ''}</span></div>`;
}
export function bindScheduleRows(root){
  root.querySelectorAll('[data-sched]').forEach(row => {
    const job = row.dataset.sched, every = row.querySelector('[data-sched-every]'), at = row.querySelector('[data-sched-at]');
    const save = () => {
      /* A time that is not one is kept out: the last good one stays (the field says what is wrong). */
      const t = parseTime(at.value || '06:00');
      if (t === null){ at.classList.add('bad'); at.focus(); return; }
      const v = {every: +every.value, at: t};
      st.syncSchedule = {...(st.syncSchedule || {}), [job]: v};
      queueServerSave();
      const was = document.activeElement === every ? '[data-sched-every]' : document.activeElement === at ? '[data-sched-at]' : '';
      row.outerHTML = scheduleRowHtml(job, true);
      bindScheduleRows(root);
      /* The row is drawn again: the focus goes back to the control just changed. */
      const again = was && root.querySelector(`[data-sched="${job}"] ${was}`); if (again && !again.hidden) again.focus();
      toast(`${SCHEDULE_JOBS[job]}: ${scheduleText(v)}`);
    };
    every.onchange = save; at.onchange = save;
  });
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
export const pushDate = dateTimeText;
/* Under the push token: the last push, and the linked devices that have not been seen for 30 days. */
export function pushStatus(){
  const c = pushLast ? pushLast.counts : null;
  const last = c ? `${pushDate(pushLast.at)}: ${c.created || 0} new, ${c.updated || 0} updated, ${c.links || 0} links, ${c.software || 0} with software${c.ambiguous ? ', ' + c.ambiguous + ' skipped (shared names)' : ''}` : 'No push yet';
  const old = objs.filter(o => o.feed && o.feed.seen && daysSince(o.feed.seen) >= 30);
  const stale = old.length ? `${old.length} linked device${old.length === 1 ? '' : 's'} not seen for 30 days or more: ${old.slice(0, 20).map(o => esc(o.name)).join(', ')}${old.length > 20 ? ' …' : ''}.` : 'All linked devices were seen in the last 30 days.';
  return `<label>Last push</label><span>${last}</span><label>Not seen</label><span>${stale}</span>`;
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
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label>Token</label><span>${pushInfo ? `Active since ${esc(pushDate(pushInfo.created))}` : 'None yet. Create one to connect the script.'}</span>
    ${pushStatus()}</div>
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
    <div class="form" style="grid-template-columns:170px minmax(0,1fr)"><label>Report</label><div style="display:flex;gap:8px;align-items:center;min-width:0"><label class="btnlike ${edit ? '' : 'disabled'}" tabindex="${edit ? 0 : -1}" role="button">Choose CSV file…<input id="feedUp" type="file" accept=".csv,text/csv" hidden ${ro}></label><span class="muted" id="feedUpName">A Lansweeper report saved as CSV</span></div></div>
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
    const nm = $('#feedUpName'); if (nm) nm.textContent = f.name;
    const r = await fetch('api/feed/import', {method: 'POST', headers: {'Content-Type': 'text/csv'}, credentials: 'same-origin', body: await f.text()});
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'The export could not be imported.'); return; }
    const c = j.counts;
    toast(`Import: ${c.created} new, ${c.updated} updated, ${c.linked} linked, ${c.unchanged} unchanged${c.ambiguous ? ', ' + c.ambiguous + ' skipped (shared names)' : ''}`);
    await reloadFromServer();
  };
}
/* The feed is optional: without one, every object is entered and kept by hand. */
