/* Patch panel page: a row per port with its wall outlet, patch cord and device; the per-port dialog, the bulk helpers
   (name outlets, patch a range) and the patch list import, each with one Undo. The pure rules are in cabling.js. */
import { $$, $, LOCS, TYPES, byId, hist, now, objs, portLabel, rels, restoreSnapshot, rid, snapshot, toast, toastUndo } from './01-core.js';
import { allOutlets, cordOf, cordTarget, outletOf, outletPlan, outletNames, panelPort, patchPlan, plugAt, portState, swPortProblem, trunkOf } from './cabling.js';
import { PATCH_FIELDS, guessPatchMapping, patchChanges, planPatchImport } from './patch-import.js';
import { csvDelimiter, parseCsv } from './csv.js';
import { DELIMITER_NAME } from './device-import.js';
import { decodeText } from './contacts-import.js';
import { freePorts } from './17-fields.js';
import { closeModal, modal } from './19-modal.js';
import { render } from './07-render.js';
import { isAdmin, who } from './04-settings.js';
import { LINK_OF, plugOf } from './05-new-object.js';
import { html } from './html.js';

const DASH = '-';
const STATE_CLS = { ok: 'dot', warn: 'dot warn', off: 'dot off' };
const swLabel = (sw, p) => `${sw.name} port ${portLabel(sw, p)}`;
const room = loc => String(loc || '').split(' / ').pop();

/* Changes to panels (their outlets) and relations, set back as one: the panels as they were, and the relations added
   and removed in between. track() before the change, then its result after it gives the Undo. */
function track(panels){
  const snap = snapshot([...new Set(panels)]), before = new Set(rels);
  return () => {
    const after = new Set(rels), added = rels.filter(r => !before.has(r)), removed = [...before].filter(r => !after.has(r));
    return () => {
      for (const r of added){ const i = rels.indexOf(r); if (i >= 0) rels.splice(i, 1); }
      for (const r of removed) if (!rels.some(x => x.id === r.id)) rels.push(r);
      restoreSnapshot(snap, 'Cabling change undone'); render();
    };
  };
}
const setOutlet = (panel, port, x) => {
  const next = { ...(panel.outlets || {}) };
  if (x && x.name) next[port] = { name: x.name, ...(x.loc ? { loc: x.loc } : {}) }; else delete next[port];
  if (Object.keys(next).length) panel.outlets = next; else delete panel.outlets;
};
/* A panel port's cord goes to sw port n (or nowhere): the cord it had is taken out. */
const setCord = (panel, port, sw, n) => {
  const cur = cordOf(panel, port, rels);
  if (cur) rels.splice(rels.indexOf(cur), 1);
  if (sw) rels.push({ id: 'r' + rid(), from: panel.id, fromPort: port, to: sw.id, port: n, kind: 'patched', vlan: null });
};

/* The ports of a panel as a table: outlet, cord and device on each, and its state as a dot. */
export function patchPanel(o){
  const edit = isAdmin(), trunk = trunkOf(o, rels), tsw = trunk && byId(trunk.to), n = o.ports || 0;
  const rows = [];
  let cords = 0, plugs = 0;
  for (let i = 1; i <= n; i++){
    const port = panelPort(i), out = outletOf(o, port), cord = cordOf(o, port, rels), plug = plugAt(o, port, rels), dev = plug && byId(plug.from), sw = cord && byId(cord.to), s = portState(o, port, rels);
    cords += cord ? 1 : 0; plugs += plug ? 1 : 0;
    rows.push(html`<tr class="pp-row" data-ppport="${port}" data-state="${s.state}">
      <td class="n"><span class="${STATE_CLS[s.state]}" role="img" aria-label="${s.why}" title="${s.why}"></span> ${port}</td>
      <td>${out ? html`<b class="mono">${out.name}</b>${out.loc ? html`<span class="muted" title="${out.loc}"> · ${room(out.loc)}</span>` : ''}` : DASH}</td>
      <td>${sw ? html`<a class="link" data-open="${sw.id}">${sw.name}</a> <span class="mono">${portLabel(sw, cord.port)}</span>` : tsw ? html`<span class="muted" title="No cord of its own: the panel trunk">trunk · ${swLabel(tsw, trunk.port)}</span>` : DASH}</td>
      <td>${dev ? html`<a class="link" data-open="${dev.id}">${dev.name}</a>${dev.user ? html`<span class="muted"> · ${dev.user}</span>` : ''}` : DASH}</td>
      ${edit ? html`<td class="pp-act"><button type="button" class="icon ghost" data-ppedit="${port}" aria-label="Edit ${port}" title="Edit ${port}">Edit</button></td>` : ''}</tr>`);
  }
  const tools = edit ? html`<div class="addrel pp-tools"><button type="button" id="ppName">Name outlets…</button><button type="button" id="ppPatch">Patch range…</button><button type="button" id="ppImport">Import patch list…</button></div>` : '';
  return html`<div class="panelbox" id="ppBox"><div class="hdr">Ports <span class="cnt">${plugs} of ${n} in use · ${cords} patched${tsw ? ` · trunk to ${swLabel(tsw, trunk.port)}` : ''}</span></div>
    ${tools}
    ${n ? html`<div class="pp-wrap"><table class="grid mini pp-table"><thead><tr><th>Port</th><th>Outlet</th><th>Patched to</th><th>Device</th>${edit ? html`<th><span class="sr-only">Edit</span></th>` : ''}</tr></thead><tbody>${rows}</tbody></table></div>`
      : html`<p class="note lempty">No ports yet. Set its port count in its details.</p>`}</div>`;
}
export function bindPatchPanel(o){
  if (!isAdmin() || !$('#ppBox')) return;
  $('#ppBox').querySelectorAll('[data-ppedit]').forEach(b => b.onclick = () => portModal(o, b.dataset.ppedit));
  $('#ppName').onclick = () => nameOutletsModal(o);
  $('#ppPatch').onclick = () => patchRangeModal(o);
  $('#ppImport').onclick = () => patchImportModal();
}

const roomOptions = sel => html`<option value="">No room</option>${LOCS.map(l => html`<option value="${l}" ${l === sel ? 'selected' : ''}>${l}</option>`)}`;
const swOptions = sel => html`<option value="">Not patched</option>${objs.filter(x => cordTarget(x) && (x.status !== 'retired' || x.id === sel)).sort((a, b) => a.name.localeCompare(b.name)).map(x => html`<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${x.name} · ${TYPES[x.type] ? TYPES[x.type].short : x.type}</option>`)}`;

/* One port: its outlet (name and room), its cord (a switch and one of its free ports) and the device on it. */
export function portModal(panel, port){
  const out = outletOf(panel, port) || {}, cord = cordOf(panel, port, rels), plug = plugAt(panel, port, rels);
  const devs = objs.filter(d => d.id !== panel.id && d.status !== 'retired' && d.type !== 'patch' && (LINK_OF(d.type) || {}).kind === 'connected' && !(d.type === 'server' && d.kind === 'vm'))
    .sort((a, b) => (plugOf(a) ? 1 : 0) - (plugOf(b) ? 1 : 0) || a.name.localeCompare(b.name));
  modal(html`<div class="mh">${panel.name} · ${port}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="ppOutName">Outlet</label><input id="ppOutName" class="mono" maxlength="60" value="${out.name || ''}" placeholder="e.g. 2.OG-R12-04" autocomplete="off">
      <label for="ppOutLoc">Room</label><select id="ppOutLoc">${roomOptions(out.loc || '')}</select>
      <label for="ppSw">Patched to</label><select id="ppSw">${swOptions(cord ? cord.to : '')}</select>
      <label for="ppSwPort">Switch port</label><select id="ppSwPort"></select>
      <label for="ppDev">Device</label><select id="ppDev"><option value="">Nothing</option>${devs.map(d => html`<option value="${d.id}" ${plug && plug.from === d.id ? 'selected' : ''}>${d.name} · ${TYPES[d.type] ? TYPES[d.type].short : d.type}${plugOf(d) && plugOf(d).id !== panel.id ? ' · now on ' + plugOf(d).name : ''}</option>`)}</select>
    </div><p class="fieldnote warn" id="ppMsg" role="alert" hidden></p></div>
    <div class="mf"><button id="ppCancel">Cancel</button><button id="ppOk" class="primary">Save</button></div>`, 'sm');
  const fitPorts = () => {
    const sw = byId($('#ppSw').value);
    const keep = cord && sw && cord.to === sw.id ? [{ v: String(cord.port), label: portLabel(sw, cord.port) }] : [];
    /* A switch's free ports, each with its label (a patch panel's would be names only). */
    const list = sw ? [...keep, .../** @type {{ v: string, label: string }[]} */ (freePorts(sw))].sort((a, b) => +a.v - +b.v) : [];
    $('#ppSwPort').innerHTML = html`${list.length ? list.map(p => html`<option value="${p.v}">${p.label}</option>`) : html`<option value="">${sw ? 'No free port' : DASH}</option>`}`;
    if (keep.length) $('#ppSwPort').value = keep[0].v;
    $('#ppSwPort').disabled = !sw;
  };
  fitPorts();
  $('#ppSw').onchange = fitPorts;
  $('#ppCancel').onclick = closeModal;
  const say = msg => { $('#ppMsg').textContent = msg; $('#ppMsg').hidden = !msg; };
  $('#ppOk').onclick = () => {
    const name = $('#ppOutName').value.trim(), loc = $('#ppOutLoc').value, sw = byId($('#ppSw').value), n = +$('#ppSwPort').value, dev = byId($('#ppDev').value);
    if (name){ const p = outletPlan(panel, [{ port, name }], objs)[0]; if (p.err){ say(`Outlet ${name}: ${p.err}.`); return; } }
    if (loc && !name){ say('A room goes with an outlet name.'); return; }
    if (sw && !(cord && cord.to === sw.id && cord.port === n)){ const why = swPortProblem(sw, n, rels, { panel, panelPort: port }); if (why){ say(why + '.'); return; } }
    const panels = [panel], oldDev = plug && byId(plug.from);
    /* The devices plugged in or out are tracked too: Undo notes it in their history, after the lines this writes there. */
    const done = track([...panels, oldDev, dev]);
    const msgs = [];
    if ((out.name || '') !== name || (out.loc || '') !== loc){ setOutlet(panel, port, { name, loc }); msgs.push(name ? `outlet ${name}` : 'outlet removed'); }
    if ((cord ? cord.to + '|' + cord.port : '') !== (sw ? sw.id + '|' + n : '')){ setCord(panel, port, sw, n); msgs.push(sw ? `patched to ${swLabel(sw, n)}` : 'patch cord removed'); }
    if ((oldDev ? oldDev.id : '') !== (dev ? dev.id : '')){
      if (plug) rels.splice(rels.indexOf(plug), 1);
      if (oldDev) hist(oldDev, now(), `Unplugged from ${panel.name} ${port} by ${who()}`);
      if (dev){
        /* A device on one connection moves here; one on several (a server) keeps the others. */
        const mine = rels.filter(r => r.from === dev.id && r.kind === 'connected');
        if (mine.length === 1) rels.splice(rels.indexOf(mine[0]), 1);
        rels.push({ id: 'r' + rid(), from: dev.id, to: panel.id, kind: 'connected', port, vlan: null });
        hist(dev, now(), `Plugged into ${panel.name} ${port}${name ? ` (outlet ${name})` : ''} by ${who()}`);
      }
      msgs.push(dev ? `${dev.name} on it` : 'device unplugged');
    }
    closeModal();
    if (!msgs.length){ toast('Nothing changed'); return; }
    hist(panel, now(), `${port}: ${msgs.join(', ')} by ${who()}`);
    render();
    toastUndo(`${port}: ${msgs.join(', ')}`, done());
  };
}

/* A small preview table, one row per port: what it gets, and why not. */
const previewTable = (heads, rows) => html`<div class="imp-table pp-prev" id="ppPrev"><table class="grid mini"><thead><tr>${heads.map(h => html`<th>${h}</th>`)}</tr></thead><tbody>${rows}</tbody></table></div>`;
const rangeInputs = (panel, a, b) => html`<label for="ppFrom">Ports</label><div class="ctlrow"><input id="ppFrom" type="number" min="1" max="${panel.ports || 1}" value="${a}" style="width:80px" aria-label="First port"> to <input id="ppTo" type="number" min="1" max="${panel.ports || 1}" value="${b}" style="width:80px" aria-label="Last port"></div>`;

/* Names outlets over a range of ports from a pattern ({n}: 04, {#}: 4), with a room for all of them if wanted. */
export function nameOutletsModal(panel){
  modal(html`<div class="mh">Name outlets on ${panel.name}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label for="ppPattern">Pattern</label><input id="ppPattern" class="mono" maxlength="60" placeholder="e.g. 2.OG-R12-{n}" autocomplete="off">
      ${rangeInputs(panel, 1, panel.ports || 1)}
      <label for="ppRoom">Room</label><select id="ppRoom"><option value="">Keep as it is</option>${LOCS.map(l => html`<option value="${l}">${l}</option>`)}</select>
    </div><p class="note">{n} is the port number with two digits (04), {#} the number as it is (4).</p><div id="ppPrevBox"></div></div>
    <div class="mf"><span class="muted" id="ppSum"></span><div class="grow"></div><button id="ppCancel">Cancel</button><button id="ppGo" class="primary" disabled>Name outlets</button></div>`, 'wide');
  let plan = [];
  const preview = () => {
    plan = outletPlan(panel, outletNames($('#ppPattern').value, +$('#ppFrom').value, +$('#ppTo').value), objs);
    const ok = plan.filter(p => !p.err);
    $('#ppPrevBox').innerHTML = plan.length ? previewTable(['Port', 'Now', 'New name', ''], plan.map(p => html`<tr class="${p.err ? 'imp-error' : ''}"><td class="mono">${p.port}</td><td class="mono">${p.was || DASH}</td><td class="mono">${p.name}</td><td>${p.err ? html`<span class="imp-why">${p.err}</span>` : ''}</td></tr>`)) : html`<p class="note">Type a pattern and a range of ports to see the names.</p>`;
    $('#ppGo').disabled = !ok.length; $('#ppGo').textContent = `Name ${ok.length} ${ok.length === 1 ? 'outlet' : 'outlets'}`;
    $('#ppSum').textContent = plan.length - ok.length ? `${plan.length - ok.length} with problems left out` : '';
  };
  ['ppPattern', 'ppFrom', 'ppTo'].forEach(id => { $('#' + id).oninput = preview; });
  preview();
  $('#ppCancel').onclick = closeModal;
  $('#ppGo').onclick = () => {
    const ok = plan.filter(p => !p.err), loc = $('#ppRoom').value;
    if (!ok.length) return;
    const done = track([panel]);
    for (const p of ok){ const was = outletOf(panel, p.port) || {}; setOutlet(panel, p.port, { name: p.name, loc: loc || was.loc }); }
    hist(panel, now(), `Outlets named on ${ok[0].port}-${ok[ok.length - 1].port}: ${ok[0].name} … by ${who()}`);
    closeModal(); render();
    toastUndo(`${ok.length} ${ok.length === 1 ? 'outlet' : 'outlets'} named on ${panel.name}`, done());
  };
}

/* Patches a range of panel ports to a range of switch ports, one to one. Conflicts are listed and left out. */
export function patchRangeModal(panel){
  const first = rels.find(r => r.kind === 'patched' && r.from === panel.id);
  modal(html`<div class="mh">Patch ports of ${panel.name}</div>
    <div class="mb"><div class="form" style="padding:0">
      ${rangeInputs(panel, 1, panel.ports || 1)}
      <label for="ppSw">Switch</label><select id="ppSw">${swOptions(first ? first.to : '')}</select>
      <label for="ppSwFrom">From switch port</label><input id="ppSwFrom" type="number" min="1" value="1" style="width:80px">
    </div><div id="ppPrevBox"></div></div>
    <div class="mf"><span class="muted" id="ppSum"></span><div class="grow"></div><button id="ppCancel">Cancel</button><button id="ppGo" class="primary" disabled>Patch</button></div>`, 'wide');
  let plan = [], sw = null;
  const preview = () => {
    sw = byId($('#ppSw').value);
    plan = sw ? patchPlan(panel, +$('#ppFrom').value, +$('#ppTo').value, sw, +$('#ppSwFrom').value, rels, byId) : [];
    const ok = plan.filter(p => !p.err && !p.same);
    $('#ppPrevBox').innerHTML = plan.length ? previewTable(['Panel port', 'Switch port', 'Now', ''], plan.map(p => html`<tr class="${p.err ? 'imp-error' : ''}"><td class="mono">${p.port}</td><td class="mono">${portLabel(sw, p.swPort)}</td><td>${p.same ? 'Patched so already' : p.was ? `Replaces ${p.was}` : DASH}</td><td>${p.err ? html`<span class="imp-why">${p.err}</span>` : ''}</td></tr>`))
      : html`<p class="note">${sw ? 'Give a range of panel ports and the first switch port.' : 'Choose the switch.'}</p>`;
    const bad = plan.filter(p => p.err).length;
    $('#ppGo').disabled = !ok.length; $('#ppGo').textContent = `Patch ${ok.length} ${ok.length === 1 ? 'port' : 'ports'}`;
    $('#ppSum').textContent = bad ? `${bad} ${bad === 1 ? 'conflict' : 'conflicts'} left out` : '';
  };
  ['ppFrom', 'ppTo', 'ppSwFrom'].forEach(id => { $('#' + id).oninput = preview; });
  $('#ppSw').onchange = preview;
  preview();
  $('#ppCancel').onclick = closeModal;
  $('#ppGo').onclick = () => {
    const ok = plan.filter(p => !p.err && !p.same);
    if (!ok.length || !sw) return;
    const done = track([panel, sw]);
    for (const p of ok) setCord(panel, p.port, sw, p.swPort);
    const msg = `${ok[0].port}-${ok[ok.length - 1].port} patched to ${sw.name} ports ${portLabel(sw, ok[0].swPort)}-${portLabel(sw, ok[ok.length - 1].swPort)}`;
    hist(panel, now(), `${msg} by ${who()}`); hist(sw, now(), `Patch cords from ${panel.name}: ${msg} by ${who()}`);
    closeModal(); render();
    toastUndo(msg, done());
  };
}

/* A patch list from a CSV file, in three steps: the file, which column is which, and what each row does. Rows with a
   problem are left out; one Undo takes the rest back. */
export function patchImportModal(){
  const w = { step: 1, text: '', fileName: '', headers: [], rows: [], mapping: [], plan: [] };
  modal(html`<div class="mh">Import a patch list</div>
    <div class="mb csvwiz">
      <ol class="wiz-steps" aria-label="Steps">${['File', 'Columns', 'Check and import'].map((l, i) => html`<li data-pistep="${i + 1}">${l}</li>`)}</ol>
      <div id="piBody" class="imp"></div>
    </div>
    <div class="mf"><span class="muted" id="piSum"></span><div class="grow"></div><button id="piCancel">Cancel</button><button id="piBack" hidden>Back</button><button id="piNext" class="primary" disabled>Next</button><button id="piGo" class="primary" hidden disabled>Import</button></div>`, 'wide');
  $('#piCancel').onclick = closeModal;
  const read = () => { const rows = parseCsv(w.text); w.headers = (rows[0] || []).map(h => h.trim()); w.rows = rows.slice(1); };
  const foot = (next, go) => {
    $$('[data-pistep]').forEach(li => { const n = +li.dataset.pistep; li.className = n === w.step ? 'on' : n < w.step ? 'done' : ''; });
    $('#piBack').hidden = w.step === 1; $('#piNext').hidden = w.step === 3; $('#piGo').hidden = w.step !== 3;
    $('#piNext').disabled = !next; $('#piGo').disabled = !go;
  };
  const step1 = () => {
    $('#piBody').innerHTML = html`<label class="imp-drop"><input type="file" id="piFile" accept=".csv,.txt,text/csv"><span><b id="piFileName">${w.fileName || 'Choose a CSV file'}</b></span>
        <span class="muted">Columns: panel, port, outlet, room, switch, switch port. Save an Excel sheet as CSV first.</span></label>
      <label class="note" for="piText">Or paste the rows</label>
      <textarea id="piText" rows="6" class="mono" placeholder="Panel;Port;Outlet;Room;Switch;Switch port">${w.text}</textarea>
      <div id="piInfo" class="muted" aria-live="polite"></div>`;
    const info = () => {
      read();
      const ok = w.headers.length > 0 && w.rows.length > 0;
      $('#piInfo').textContent = !w.text.trim() ? '' : `Delimiter: ${DELIMITER_NAME[csvDelimiter(w.text)]} · ${w.headers.length} columns · ${w.rows.length} rows${ok ? '' : ' · a heading row and at least one row are needed'}`;
      foot(ok, false);
    };
    $('#piFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; w.text = decodeText(await f.arrayBuffer()); w.fileName = f.name; $('#piText').value = w.text; $('#piFileName').textContent = f.name; info(); };
    $('#piText').oninput = e => { w.text = e.target.value; w.fileName = ''; info(); };
    info();
  };
  const step2 = () => {
    const opts = sel => html`<option value="">Ignore</option>${Object.entries(PATCH_FIELDS).map(([k, f]) => html`<option value="${k}" ${sel === k ? 'selected' : ''}>${f.label}</option>`)}`;
    $('#piBody').innerHTML = html`<div class="imp-map">${w.headers.map((h, i) => html`<label class="imp-col"><span class="imp-head" title="${h}">${h || `Column ${i + 1}`}</span><select data-picol="${i}" aria-label="Field for the column ${h || `Column ${i + 1}`}">${opts(w.mapping[i])}</select></label>`)}</div>
      <p class="note">${w.mapping.includes('panel') && w.mapping.includes('port') ? 'Each field comes from one column.' : html`<b>Pick the columns with the panel and its port</b> to go on.`}</p>`;
    $$('[data-picol]').forEach(s => s.onchange = () => { const i = +s.dataset.picol, f = s.value; w.mapping = w.mapping.map((m, j) => j === i ? f : m === f ? '' : m); step2(); });
    foot(w.mapping.includes('panel') && w.mapping.includes('port'), false);
  };
  const step3 = () => {
    w.plan = planPatchImport(w.rows, w.mapping, { objs, rels, locs: LOCS });
    const ok = w.plan.filter(p => !p.errs.length), bad = w.plan.length - ok.length;
    $('#piBody').innerHTML = html`<div class="chip-row imp-counts" id="piCounts"><span class="chip ok">${ok.length} to import</span><span class="chip warn">${bad} with problems</span></div>
      <div class="imp-table csvprev" id="piPrev"><table class="grid mini"><thead><tr><th>Line</th><th>Panel port</th><th>Outlet</th><th>Switch port</th><th>Problems</th></tr></thead><tbody>
      ${w.plan.map(p => html`<tr class="${p.errs.length ? 'imp-error' : 'imp-new'}" data-piline="${p.line}"><td class="mono">${p.line}</td><td class="mono">${p.v.panel} ${p.port || p.v.port}</td><td class="mono">${p.v.outlet || DASH}${p.v.room ? ' · ' + p.v.room : ''}</td><td class="mono">${p.v.switch ? `${p.v.switch} ${p.v.swport}` : DASH}</td><td>${p.errs.length ? html`<span class="imp-why">${p.errs.join('; ')}</span>` : ''}</td></tr>`)}
      </tbody></table></div>`;
    $('#piGo').textContent = `Import ${ok.length} ${ok.length === 1 ? 'row' : 'rows'}`;
    $('#piSum').textContent = bad ? `${bad} with problems left out` : '';
    foot(false, ok.length > 0);
  };
  const show = () => { $('#piSum').textContent = ''; [step1, step2, step3][w.step - 1](); };
  $('#piBack').onclick = () => { w.step--; show(); };
  $('#piNext').onclick = () => { if (w.step === 1){ read(); w.mapping = guessPatchMapping(w.headers); } w.step++; show(); };
  $('#piGo').onclick = () => {
    const ch = patchChanges(w.plan);
    const panels = [...new Set([...ch.outlets, ...ch.cords].map(c => c.panel))];
    if (!panels.length){ closeModal(); toast('Nothing to import'); return; }
    const done = track(panels);
    for (const c of ch.outlets) setOutlet(c.panel, c.port, c.outlet);
    for (const c of ch.cords) setCord(c.panel, c.port, c.sw, c.swPort);
    for (const p of panels) hist(p, now(), `Patch list imported by ${who()}`);
    closeModal(); render();
    toastUndo(`Patch list: ${ch.outlets.length} ${ch.outlets.length === 1 ? 'outlet' : 'outlets'}, ${ch.cords.length} ${ch.cords.length === 1 ? 'cord' : 'cords'}`, done());
  };
  show();
}

/* The outlets a device can be plugged into, for the outlet pickers: free ones (nothing on the port behind), by name,
   room or panel. */
export function outletChoices(input, all){
  const q = all ? '' : String(input.value || '').trim().toLowerCase();
  return allOutlets(objs).filter(x => x.panel.status !== 'retired' && !plugAt(x.panel, x.port, rels) && (!q || [x.name, x.loc, x.panel.name].some(v => String(v).toLowerCase().includes(q))))
    .map(x => ({ v: x.name, label: `Outlet ${x.name} (${x.panel.name} ${x.port})${x.loc ? ' · ' + room(x.loc) : ''}` }));
}
export const anyOutlets = () => objs.some(o => o.type === 'patch' && o.outlets && Object.keys(o.outlets).length);
