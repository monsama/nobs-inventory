/* CSV: export of the listed devices and the import wizard (split out of 02-views.js, which re-exports it). */
import { csvDelimiter, parseCsv } from './csv.js';
import { DELIMITER_NAME, DEVICE_FIELDS, guessDeviceMapping, planDeviceImport, rememberMapping } from './device-import.js';
import { decodeText } from './contacts-import.js';
import { parseDay } from './datefield.js';
import { num } from './09-costs.js';
import { HISTORY, markHand, restoreSnapshot, snapshot, toastUndo, $, LOCS, O, STATUS, TYPES, hist, now, objs, toast } from './01-core.js';
import { render } from './07-render.js';
import { bindUser } from './04-settings.js';
import { closeModal, modal } from './19-modal.js';
import { html } from './html.js';
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

/* The last column mapping, kept in this browser: a file with the same headings is mapped the same way next time. */
const MAP_KEY = 'ni-csv-map';
const keptMap = () => { try { const m = JSON.parse(localStorage.getItem(MAP_KEY) || '{}'); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch { return {}; } };
const keepMap = m => { try { localStorage.setItem(MAP_KEY, JSON.stringify(m)); } catch { /* Browser storage can be blocked (a private window): then the mapping is simply not kept. */ } };
const CSV_MAX_BYTES = 5 * 1024 * 1024;
const BY_LABEL = { serial: 'serial number', name: 'name', mac: 'MAC address' };
/* Import devices from a CSV file, in three steps in one dialog: (1) a file or pasted rows, (2) which column fills which
   field, (3) what each row does: rows with a problem are skipped; a row that is a device here already (by serial
   number, else name, else MAC address) is skipped or fills that device's empty fields. One Undo takes it all back. */
export function importCsvModal(){
  const w = { step: 1, text: '', fileName: '', headers: [], rows: [], mapping: [], plan: [], dup: {} };
  modal(html`<div class="mh">Import devices from CSV</div>
    <div class="mb csvwiz">
      <ol class="wiz-steps" aria-label="Steps">${['File', 'Columns', 'Check and import'].map((l, i) => html`<li data-wstep="${i + 1}">${l}</li>`)}</ol>
      <div id="csvBody" class="imp"></div>
    </div>
    <div class="mf"><span class="muted" id="csvSum"></span><div class="grow"></div><button id="csvCancel">Cancel</button><button id="csvBack" hidden>Back</button><button id="csvNext" class="primary" disabled>Next</button><button id="csvGo" class="primary" hidden disabled>Import</button></div>`, 'wide');
  $('#csvCancel').onclick = closeModal;
  const read = () => {
    const rows = parseCsv(w.text);
    w.headers = (rows[0] || []).map(h => h.trim()); w.rows = rows.slice(1);
  };
  const steps = () => document.querySelectorAll('[data-wstep]').forEach(li => {
    const n = +li.dataset.wstep;
    li.className = n === w.step ? 'on' : n < w.step ? 'done' : '';
    if (n === w.step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  });
  const foot = (next, go) => {
    $('#csvBack').hidden = w.step === 1; $('#csvNext').hidden = w.step === 3; $('#csvGo').hidden = w.step !== 3;
    $('#csvNext').disabled = !next; $('#csvGo').disabled = !go;
  };
  /* (1) The file, or rows pasted: the delimiter found and how many rows, before going on. */
  const step1 = () => {
    $('#csvBody').innerHTML = html`<label class="imp-drop" id="csvDrop"><input type="file" id="csvFile" accept=".csv,.txt,text/csv"><span><b id="csvFileName">${w.fileName || 'Choose a CSV file'}</b><span class="imp-or"> or drop it here</span></span>
        <span class="muted">The first row holds the column headings; any names will do, the next step maps them. Comma, semicolon or tab; UTF-8 or Windows.</span></label>
      <label class="note" for="csvText">Or paste the rows</label>
      <textarea id="csvText" rows="6" class="mono" placeholder="Hostname;Device type;Serial number;Room">${w.text}</textarea>
      <div id="csvInfo" class="muted" aria-live="polite"></div>`;
    const info = () => {
      read();
      const ok = w.headers.length > 0 && w.rows.length > 0;
      $('#csvInfo').innerHTML = !w.text.trim() ? '' : html`Delimiter: <b id="csvDelim">${DELIMITER_NAME[csvDelimiter(w.text)]}</b> · ${w.headers.length} ${w.headers.length === 1 ? 'column' : 'columns'} · ${w.rows.length} ${w.rows.length === 1 ? 'row' : 'rows'}${ok ? '' : ' · a heading row and at least one row are needed'}`;
      foot(ok, false);
    };
    const load = async f => {
      if (!f) return;
      if (f.size > CSV_MAX_BYTES) { toast('The file is larger than 5 MB. Is it the right one?'); return; }
      w.text = decodeText(await f.arrayBuffer()); w.fileName = f.name;
      $('#csvText').value = w.text; $('#csvFileName').textContent = f.name; info();
    };
    $('#csvFile').onchange = e => load(e.target.files[0]);
    const drop = $('#csvDrop');
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); load(e.dataTransfer.files[0]); };
    $('#csvText').oninput = e => { w.text = e.target.value; w.fileName = ''; info(); };
    info();
  };
  /* (2) A field for each column, guessed from its heading (or as mapped last time); "Ignore" leaves it out. */
  const step2 = () => {
    const sample = i => (w.rows.find(r => String(r[i] || '').trim()) || [])[i] || '';
    const opts = sel => html`<option value="">Ignore</option>${Object.entries(DEVICE_FIELDS).map(([k, f]) => html`<option value="${k}" ${sel === k ? 'selected' : ''}>${f.label}</option>`)}`;
    const has = f => w.mapping.includes(f);
    $('#csvBody').innerHTML = html`<div class="imp-h">Columns <span class="muted">${w.fileName ? w.fileName + ' · ' : ''}${w.rows.length} ${w.rows.length === 1 ? 'row' : 'rows'}</span></div>
      <div class="imp-map">${w.headers.map((h, i) => html`<label class="imp-col"><span class="imp-head" title="${h}">${h || `Column ${i + 1}`}</span>
        <select data-csvcol="${i}" aria-label="Field for the column ${h || `Column ${i + 1}`}">${opts(w.mapping[i])}</select><span class="muted imp-sample" title="${sample(i)}">${sample(i) || '—'}</span></label>`)}</div>
      <p class="note" id="csvMapNote">${!has('name') ? html`<b>Pick the column with the name</b> to go on.` : !has('type') ? 'No column is the type: only rows that are devices here already can be imported.' : 'Each field comes from one column. The mapping is kept in this browser for the next file.'}</p>`;
    document.querySelectorAll('[data-csvcol]').forEach(s => s.onchange = () => {
      const i = +s.dataset.csvcol, f = s.value;
      /* A field comes from one column: picking it for this one takes it from the other. */
      w.mapping = w.mapping.map((m, j) => j === i ? f : m === f ? '' : m);
      step2();
      const again = $(`[data-csvcol="${i}"]`); if (again) again.focus();
    });
    foot(has('name'), false);
  };
  /* (3) What each row does, the problems of each, and for a duplicate: skip it or fill the device's empty fields. */
  const step3 = () => {
    w.plan = planDeviceImport(w.rows, w.mapping, { objs, types: TYPES, statuses: STATUS, locs: LOCS, parseDay, num });
    const n = a => w.plan.filter(p => p.action === a).length;
    const dups = w.plan.filter(p => p.action === 'dup');
    const fills = dups.filter(p => w.dup[p.line] === 'update' && p.fill.length).length;
    const label = k => { const l = DEVICE_FIELDS[k].label; return /^[A-Z]{2}/.test(l) ? l : l.toLowerCase(); };
    const what = p => p.action === 'error' ? html`<span class="chip warn">Not imported</span>` : p.action === 'new' ? html`<span class="chip ok">New</span>` : html`<span class="chip info">Duplicate</span>`;
    const detail = p => p.action === 'error' ? html`<span class="imp-why">${p.errs.join('; ')}</span>`
      : p.action === 'new' ? html`<span class="muted">${TYPES[p.v.type].label}${p.v.loc ? ' · ' + p.v.loc : ''}</span>`
      : html`Same ${BY_LABEL[p.by]} as <b>${p.match.name}</b>. <select data-csvdup="${p.line}" aria-label="Line ${p.line}: what to do"><option value="skip">Skip</option><option value="update" ${w.dup[p.line] === 'update' ? 'selected' : ''} ${p.fill.length ? '' : 'disabled'}>Update empty fields only</option></select> <span class="muted">${p.fill.length ? 'empty there: ' + p.fill.map(label).join(', ') : 'nothing empty there to fill'}</span>`;
    $('#csvBody').innerHTML = html`<div class="csvprev-top"><div class="chip-row imp-counts" id="csvCounts"><span class="chip ok">${n('new')} new</span><span class="chip info">${dups.length} ${dups.length === 1 ? 'duplicate' : 'duplicates'}</span><span class="chip warn">${n('error')} with problems</span></div>
      ${dups.length > 1 ? html`<label class="muted">All duplicates <select id="csvDupAll"><option value="">—</option><option value="skip">Skip</option><option value="update">Update empty fields only</option></select></label>` : ''}</div>
      <div class="imp-table csvprev" id="csvPrev"><table class="grid mini"><thead><tr><th>Line</th><th>Name</th><th>What</th><th>Details</th></tr></thead><tbody>
      ${w.plan.map(p => html`<tr class="imp-${p.action}" data-csvline="${p.line}"><td class="mono">${p.line}</td><td title="${p.v.name || ''}">${p.v.name || '—'}</td><td>${what(p)}</td><td>${detail(p)}</td></tr>`)}
      </tbody></table></div>`;
    document.querySelectorAll('[data-csvdup]').forEach(s => s.onchange = () => { w.dup[s.dataset.csvdup] = s.value; step3(); });
    const all = $('#csvDupAll'); if (all) all.onchange = () => { if (!all.value) return; for (const p of dups) w.dup[p.line] = all.value === 'update' && p.fill.length ? 'update' : 'skip'; step3(); };
    $('#csvGo').textContent = fills && n('new') ? `Add ${n('new')} and update ${fills}` : fills ? `Update ${fills}` : `Import ${n('new')}`;
    $('#csvSum').textContent = [dups.length - fills ? `${dups.length - fills} skipped` : '', n('error') ? `${n('error')} with problems left out` : ''].filter(Boolean).join(' · ');
    foot(false, n('new') + fills > 0);
  };
  const show = () => { steps(); $('#csvSum').textContent = ''; $('#csvGo').textContent = 'Import'; [step1, step2, step3][w.step - 1](); };
  $('#csvBack').onclick = () => { w.step--; show(); };
  $('#csvNext').onclick = () => {
    if (w.step === 1){ read(); w.mapping = guessDeviceMapping(w.headers, keptMap()); w.dup = {}; }
    else if (w.step === 2) keepMap(rememberMapping(w.headers, w.mapping, keptMap()));
    w.step++; show();
  };
  $('#csvGo').onclick = () => importPlan(w.plan, w.dup);
  show();
}
/* Adds the new rows and fills the empty fields of the duplicates to update; one Undo takes both back. */
function importPlan(plan, dup){
  const news = plan.filter(p => p.action === 'new'), fills = plan.filter(p => p.action === 'dup' && dup[p.line] === 'update' && p.fill.length);
  const snap = snapshot(fills.map(p => p.match)), added = [];
  for (const p of fills){
    const o = p.match;
    /* Values from the file are set by hand: noted so, and no sync puts its own back. */
    for (const k of p.fill){ o[k] = p.v[k]; markHand(o, k); if (!o.src || !o.src[k]) o.src = {...(o.src || {}), [k]: 'hand'}; }
    if (p.fill.includes('user')) bindUser(o);
    hist(o, now(), `Empty fields filled from CSV: ${p.fill.map(k => DEVICE_FIELDS[k].label).join(', ')}`);
  }
  for (const p of news){
    const { name, type, ...rest } = p.v;
    const o = O(type, name, rest);
    if (type === 'switch') Object.assign(o, {ports: 24, sfp: 4, pfx: '1/'});
    objs.push(o); bindUser(o); hist(o, now(), 'Imported from CSV'); added.push(o);
  }
  closeModal(); render();
  const msg = [added.length ? `${added.length} added` : '', fills.length ? `${fills.length} updated` : ''].filter(Boolean).join(' · ');
  if (!msg){ toast('Nothing imported'); return; }
  toastUndo(`CSV import: ${msg}`, () => {
    for (const o of added){ const i = objs.indexOf(o); if (i >= 0) objs.splice(i, 1); delete HISTORY[o.id]; }
    restoreSnapshot(snap, 'CSV import undone'); render();
  });
}
