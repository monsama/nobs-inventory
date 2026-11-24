/* The Table: its columns, the Columns menu and the Table view (split out of 02-views.js, which re-exports it). */
import { money } from './09-costs.js';
import { dueOf, lifeOf } from './lifecycle.js';
import { nextTask } from './maintenance.js';
import { respText } from './11-contacts.js';
import { linkHref, linkKind } from './links.js';
import { typeSelLabel, sourceMark, sourcesDisagree, vmsOn, dirLocOf, SRV_KIND_TEXT, kindOf, GRAPH_TYPES, joinBadges, typeText, listCount, listCountShown, MORE_DOTS, closeMoreOnPick, scopePool, SEEN_FILTERS, sourcesOf, QUALITY, menuHtml, REVIEW_SRC, FIELD_LABEL, sourceText, lastSeenOf, GRAPH_STALE_DAYS, scanOld, scanChip, LS_USED, relIndex, warrantyState, dayText, markHtml, $, STATUS, byId, filtered, leftFilters, objs, portLabel, rels, st, syncChip, tcol, toast } from './01-core.js';
import { SERVER, viewSig } from './07-render.js';
import { TBL, cmpCells, saveTBL } from './06-topbar.js';
import { reportsModal } from './21-reports.js';
import { isAdmin, rackOf } from './04-settings.js';
import { hiddenHits, bindHiddenHits, renderFilterBar } from './02-views.js';
import { bindScopeActs, pickedInPool, scopeActs, tableBulkBar, bindTableBulk } from './views-bulk.js';
import { alsoIn, SHOW_FIRST } from './views-cards.js';
import { exportCsv, importCsvModal } from './views-csv.js';
import { patchImportModal } from './24-patch.js';
import { bindSaveView, saveViewBtn } from './views-saved.js';
import { remapTable } from './saved-views.js';
import { bindPrintMenu, moreBtnAttrs, printItems } from './print-view.js';
import { html, rawHtml } from './html.js';
import { waitReason } from './15-review.js';
/* ---------- table ---------- */
/* The columns of the objects table. Name always shows; the others can be hidden from the Columns menu. */
export const TABLE_COLS = [
  {k:'code', w:100, label:'Code', cell: o => String(html`<td class="code">${o.code}</td>`)},
  /* The name opens the device, from the keyboard too (Tab to it, Enter): one stop per row, not the whole row as well. */
  {k:'name', w:220, label:'Name', fixed: true, cell: o => String(html`<td class="n"><a class="link rowopen" data-open="${o.id}"><b>${o.name}</b></a>${rawHtml(markHtml(o))}</td>`)},
  {k:'type', w:160, label:'Type', cell: o => String(html`<td><span class="tdot"><span class="tsw" style="background:${tcol(o.type)}"></span>${typeText(o)}</span></td>`)},
  /* A server's Kind (virtual, physical, not known); empty for the other types. */
  {k:'kind', w:140, label:'Kind', cell: o => String(html`<td>${o.type === 'server' ? SRV_KIND_TEXT[kindOf(o)] : ''}</td>`)},
  /* The host a virtual machine runs on. */
  {k:'host', w:160, label:'Runs on', cell: (o, idx) => { const r = (idx ? idx.get(o.id) || [] : rels).find(x => x.from === o.id && x.kind === 'hosted'); const h = r && byId(r.to); return String(html`<td class="n">${h ? h.name : ''}${h && h.status === 'retired' ? html` <span class="mk wty soon">retired</span>` : ''}</td>`); }},
  /* How many virtual machines run on a host (not retired ones). */
  {k:'vms', w:80, label:'VMs', cell: o => { const n = o.type === 'server' && kindOf(o) !== 'vm' ? vmsOn(o).length : 0; return String(html`<td class="num">${n || ''}</td>`); }},
  {k:'model', w:210, label:'Model', cell: o => String(html`<td>${o.model}</td>`)},
  {k:'ip', w:130, label:'IP', cell: o => String(html`<td class="n">${o.ip || ''}</td>`)},
  {k:'mac', w:150, label:'MAC', cell: o => String(html`<td class="n">${o.mac || ''}</td>`)},
  {k:'serial', w:160, label:'Serial', cell: o => String(html`<td class="n">${o.serial}</td>`)},
  {k:'loc', w:190, label:'Location', cell: o => String(html`<td>${o.loc}</td>`)},
  {k:'rack', w:130, label:'Rack', cell: o => String(html`<td class="n">${o.rack && o.u != null && rackOf(o.rack) ? rackOf(o.rack).name + ' · U' + o.u : ''}</td>`)},
  {k:'user', w:160, label:'User', cell: o => String(html`<td>${o.user || ''}</td>`)},
  {k:'warranty', w:130, label:'Warranty ends', cell: o => String(html`<td>${o.warranty ? html`<span class="wty ${warrantyState(o)}">${dayText(o.warranty)}</span>` : ''}</td>`)},
  /* Replacement planning: when it was bought, the year it is due (and why), and what replacing it costs. */
  {k:'purchased', w:130, label:'Purchased', cell: o => String(html`<td>${o.purchased ? dayText(o.purchased) : ''}</td>`)},
  {k:'due', w:200, label:'Due for replacement', cell: o => { const d = dueOf(o, st.lifecycle); return String(html`<td>${d ? html`${d.year} <span class="muted">· ${d.from === 'purchase' ? 'by purchase' : 'warranty ends'}</span>` : ''}</td>`); }},
  {k:'replPrice', w:150, label:'Replacement price', cell: o => { const p = lifeOf(st.lifecycle, o.type).price; return String(html`<td class="n">${p ? rawHtml(money(p)) : ''}</td>`); }},
  /* The maintenance due next: its date first, so the column sorts by it. */
  {k:'maint', w:240, label:'Next maintenance', cell: o => { const m = nextTask(o); return String(html`<td>${m ? html`${dayText(m.due)} <span class="muted">· ${m.what}</span>` : ''}</td>`); }},
  {k:'secureBoot', w:120, label:'Secure Boot', cell: o => String(html`<td>${o.graph && !o.graph.gone && o.graph.secureBoot ? (o.graph.secureBoot === 'on' ? 'On' : html`<span class="wty soon">Off</span>`) : ''}</td>`)},
  {k:'price', w:110, label:'Price', cell: o => String(html`<td class="n">${typeof o.price === 'number' ? rawHtml(money(o.price)) : ''}</td>`)},
  {k:'supplier', w:160, label:'Supplier', cell: o => String(html`<td>${o.supplier || ''}</td>`)},
  {k:'invoice', w:130, label:'Invoice', cell: o => String(html`<td class="n">${o.invoice || ''}</td>`)},
  {k:'purpose', w:180, label:'Description', cell: o => String(html`<td>${o.purpose || ''}</td>`)},
  /* AD, Entra, Intune and Defender as in the List's Directory column; the words (joined, compliant…) in the export. */
  {k:'dir', w:132, label:'Directory', cell: o => String(html`<td class="c-dir">${GRAPH_TYPES.includes(o.type) ? rawHtml(joinBadges(o)) : ''}</td>`)},
  /* What AD (or the user's office) gives as location; marked when it is no room here yet, or another room. */
  {k:'dloc', w:200, label:'AD location', cell: o => { const d = dirLocOf(o); return String(html`<td>${d ? html`${d.src === 'Office' ? 'Office: ' : ''}${d.text}${d.state === 'new' ? html` <span class="mk wty soon">not a room</span>` : d.state === 'diff' ? html` <span class="mk wty soon">${d.room}</span>` : ''}` : ''}</td>`); }},
  {k:'conn', w:190, label:'Connected to', cell: (o, idx) => { const up = (idx ? idx.get(o.id) || [] : rels).find(r => r.from === o.id && ['connected','uplink'].includes(r.kind)); const t = up && byId(up.to);
    return String(html`<td class="n">${t ? html`${t.name}${up.port != null ? html` · ${portLabel(t, up.port)}` : ''}` : ''}</td>`); }},
  {k:'urls', w:200, label:'Links', cell: o => String(html`<td>${(o.urls || []).map((l, i) => html`${i ? ' · ' : ''}<a class="lnk" href="${linkHref(l.url)}" target="_blank" rel="noopener noreferrer" title="${l.url}">${l.label || linkKind(l.url)}</a>`)}</td>`)},
  {k:'resp', w:200, label:'Responsible', cell: o => String(html`<td>${respText(o)}</td>`)},
  {k:'status', w:110, label:'Status', cell: o => String(html`<td>${STATUS[o.status].label}</td>`)},
  /* The date first, so the column sorts by it. */
  {k:'seen', w:190, label:'Last seen', cell: o => { const s = lastSeenOf(o); return String(html`<td>${s ? html`<span class="${s.days > GRAPH_STALE_DAYS ? 'wty soon' : ''}" title="Last seen ${s.at} by ${s.src}">${dayText(s.day)}</span> <span class="muted">· ${s.src}</span>` : ''}</td>`); }},
  /* The sources that no longer list it, or every one it was in. */
  {k:'gone', w:200, label:'Gone from', cell: o => { const all = o.status === 'retired' ? [] : sourcesOf(o), g = all.filter(x => x.gone);
    return String(html`<td>${g.length ? html`<span class="wty soon" title="${g.map(x => `${x.name}: ${x.when}`).join('\n')}">${g.length === all.length && all.length > 1 ? 'All: ' : ''}${g.map(x => x.name).join(', ')}</span>` : ''}</td>`); }},
  {k:'ls', w:240, label:'Lansweeper', cell: o => String(html`<td>${rawHtml(scanOld(o) ? scanChip(o) : syncChip(o) || '-')}</td>`)},
  /* In Pending devices only, and last, so the other columns keep their places: which sync found it, and which others know it. */
  {k:'why', w:300, label:'Why it waits', cell: o => String(html`<td>${o.review && !o.review.ignored ? waitReason(o).text : ''}</td>`)},
  {k:'found', w:220, label:'Found by', cell: o => String(html`<td>${o.review ? [REVIEW_SRC[o.review.src] || o.review.src, ...(alsoIn(o).length ? [`also ${alsoIn(o).join(' · ')}`] : [])].join(' · ') : ''}</td>`)}
];
/* The Lansweeper column is left out while Lansweeper is off; Found by shows only in Pending devices. */
/* The rows the Table shows (after its column filters and sort, also those not drawn yet), for printing. */
let LAST = null;
/* The rows the Table shows now, its column filters applied (null before it is drawn): what an action on "these" means. */
export const tableShownList = () => LAST ? LAST.list : null;
const cellText = h => String(h).replace(/<span class="mk\b[^"]*"[^>]*>[^<]*<\/span>/g, '').replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, m => ({'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'"})[m]).replace(/\s+/g, ' ').trim();
/* The Table's columns in the order shown and the text of each cell; from the Cards, the devices listed with the
   Table's columns. */
export function tablePrintData(){
  if (st.tab === 'table' && LAST){
    const ks = [...document.querySelectorAll('#view table.grid thead th[data-ck]')].map(th => /** @type {HTMLElement} */ (th).dataset.ck);
    const cols = ks.map(k => LAST.shown.find(c => c.k === k)).filter(Boolean);
    return { head: cols.map(c => c.label), rows: LAST.list.map(o => cols.map(c => cellText(c.cell(o, LAST.idx)))) };
  }
  const idx = relIndex(), cols = tableCols().filter(c => c.fixed || !hiddenCols().includes(c.k));
  return { head: cols.map(c => c.label), rows: filtered().map(o => cols.map(c => cellText(c.cell(o, idx)))) };
}
export const tableCols = () => TABLE_COLS.filter(c => (c.k !== 'ls' || LS_USED()) && (c.k !== 'found' || st.scope) && (c.k !== 'why' || st.scope === 'review'));
/* Rack is hidden until it is wanted: most devices do not go in a rack. */
export const DEFAULT_HIDDEN_COLS = ['kind', 'host', 'vms', 'dir', 'dloc', 'rack', 'price', 'supplier', 'invoice', 'resp', 'urls', 'purchased', 'due', 'replPrice', 'maint', 'secureBoot'];
/* Columns added after a browser kept its choice: hidden there too until they are picked. */
const LATER_COLS = {2: ['price', 'supplier', 'invoice'], 3: ['resp'], 4: ['urls'], 5: ['purchased', 'due', 'replPrice'], 6: ['maint'], 7: ['secureBoot'], 8: ['kind', 'host', 'dir'], 9: ['dloc'], 10: ['vms']};
export function hiddenCols(){
  if (!st.hiddenCols){
    try {
      st.hiddenCols = JSON.parse(localStorage.getItem('ni-hidden-cols')) || DEFAULT_HIDDEN_COLS;
      const seen = +localStorage.getItem('ni-cols-v') || 1;
      for (const [v, cols] of Object.entries(LATER_COLS)) if (seen < +v) st.hiddenCols = [...new Set([...st.hiddenCols, ...cols])];
      localStorage.setItem('ni-cols-v', '10');
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
  lifecycle: ['Lifecycle', ['type', 'model', 'purchased', 'warranty', 'due', 'replPrice', 'maint', 'seen', 'gone', 'status']],
  costs: ['Costs', ['type', 'price', 'supplier', 'invoice', 'purchased', 'replPrice', 'resp']],
};
let colPickOpen = false;
const presetOn = (shown, hidden) => tableCols().filter(c => !c.fixed).every(c => shown.includes(c.k) !== hidden.includes(c.k));
export function columnsMenu(){
  const hidden = hiddenCols();
  return menuHtml('Columns', html`
    <div class="colpresets" role="group" aria-label="Column sets">${Object.entries(COL_PRESETS).map(([k, [l, shown]]) => html`<button type="button" data-colpreset="${k}" class="${presetOn(shown, hidden) ? 'on' : ''}" aria-pressed="${String(presetOn(shown, hidden))}">${l}</button>`)}</div>
    <details class="colpick" id="colPick" ${colPickOpen ? 'open' : ''}><summary>Choose columns…</summary><div class="colpick-list">${tableCols().map(c => html`<label style="display:flex;gap:6px;align-items:center;white-space:nowrap"><input type="checkbox" data-col="${c.k}" ${c.fixed ? 'disabled' : ''} ${c.fixed || !hidden.includes(c.k) ? 'checked' : ''}> ${c.label}</label>`)}</div></details>`, { id: 'colMenu', boxCls: 'colmenu' });
}

/* A field's cell says where its value came from in its hover text (the device page shows it as a mark). */
const SOURCE_COLS = new Set([...Object.keys(FIELD_LABEL), 'serial']);
const withSource = (o, c, cell) => {
  /* Where the sources differ: the cell is marked, its tooltip says what each says, and the source mark in it opens the
     picker (as beside the field on the device's page). */
  if (SOURCE_COLS.has(c.k) && sourcesDisagree(o, c.k)) {
    const says = choicesOfCell(o, c.k);
    /* The cell's own class is kept (IP, MAC and serial are in the code font) and its title replaced. */
    return cell.replace(/^<td([^>]*)>/, (_m, attrs) => {
      const cls = (attrs.match(/\bclass="([^"]*)"/) || [])[1] || '', rest = attrs.replace(/\s*\b(class|title)="[^"]*"/g, '');
      return String(html`<td${rawHtml(rest)} class="${(cls + ' disagree').trim()}" title="${says}">`);
    }).replace(/<\/td>$/, () => sourceMark(o, c.k) + '</td>');
  }
  if (!SOURCE_COLS.has(c.k) || /^<td[^>]*title=/.test(cell)) return cell;
  const t = sourceText(o, c.k);
  return t ? cell.replace(/^<td/, () => String(html`<td title="${t}"`)) : cell;
};
/* What each source says of field k, for a cell's tooltip: "Lansweeper: X · Entra & Intune: Y". */
const SRC_NAMES = { ls: 'Lansweeper', graph: 'Entra & Intune', ad: 'Active Directory', hand: 'By hand' };
const choicesOfCell = (o, k) => 'The sources differ: ' + Object.entries((o.vals || {})[k] || {}).map(([s, [v]]) => `${SRC_NAMES[s] || s}: ${v || '(empty)'}`).join(' · ') + ' · Click the mark to pick one';
/* Listed by a data-quality check, the Table helps fix it: the column the check is about comes next to Name (shown even
   when hidden), and a bar offers to select them all for the bulk action that fixes it. [column, bulk control, what to do] */
export const QUALITY_FIX = {
  noloc: ['loc', 'bkAct', 'select them and move them to their location'],
  noresp: ['resp', 'bkAct', 'select them and set their responsible'],
  noserial: ['serial', null, 'open each and add its serial number'],
  nouser: ['user', 'bkAct', 'give each its user, or select them and set them to In stock'],
  unseen: ['seen', 'bkAct', 'check where they are; select the ones gone and set them to Retired'],
  unconfirmed: ['loc', null, 'find them in the next inventory check, or confirm each on its page'],
  leaver: ['user', 'bkAct', 'select them and take them back into stock, or give them to someone else'],
  addisabled: ['status', 'bkAct', 'select the ones no longer used and set their status'],
  ownerdiff: ['user', null, 'open each and give it to the right person'],
  reported: [null, null, 'open each, look at the problem and mark it as done'],
  /* The bar for it is "Make them rooms…" (02-views.js); the column shows what AD says. */
  locnew: ['dloc', null, ''],
  hostgone: ['host', null, 'open each: under Relations, take away the old host and link the one it runs on now, or retire it'],
};
/* The export's file name says what was listed: inventory-notebook-zurich-hq-not-seen-for-90-days-2026-11-08.csv. */
function fileName(){
  const parts = [typeSelLabel(st.type), st.loc, st.status && STATUS[st.status] && STATUS[st.status].label,
    st.warranty && 'warranty ' + st.warranty, st.seen && SEEN_FILTERS[st.seen] && SEEN_FILTERS[st.seen][0], st.quality && QUALITY[st.quality] && QUALITY[st.quality][0], st.q.trim()];
  const slug = ['inventory', ...parts].filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, '');
  const d = new Date(), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${slug}-${day}.csv`;
}
/* The bar of a data-quality check over the Table (drawn with the filters, like a person's bar): set by renderTable. */
let QFIX = null;
export const qfix = () => QFIX;
/* Draws the Table tab: the toolbar (columns, Export CSV, and for admins the imports), then the filtered rows with the
   column filters and sort applied to the data first. The first SHOW_FIRST rows are drawn, the rest after Show all. */
export function renderTable(){
  let list = filtered();
  const colOpen = !!$('#colMenu .menubox:popover-open');
  st.bulk = pickedInPool();
  const n = st.bulk.size;
  const impCsv = isAdmin() && !st.scope, impPatch = isAdmin() && objs.some(o => o.type === 'patch');
  $('#toolbar').innerHTML = html`<span class="muted" id="tblCount">${listCountShown(list.length, scopePool().length)}</span><span class="tbsep"></span>
    ${rawHtml(columnsMenu())}${rawHtml(menuHtml(MORE_DOTS, String(html`${SERVER.on ? html`<button type="button" id="xlsxShown">Excel<span class="muted">, the columns shown</span></button>` : ''}<button type="button" id="csvShown">CSV<span class="muted">, the columns shown</span></button><button type="button" id="csvBtn">CSV, all fields<span class="muted">, to import again</span></button><hr class="msep">${rawHtml(printItems())}${impCsv || impPatch ? html`<hr class="msep">` : ''}${impCsv ? html`<button type="button" id="csvImp">Import CSV…</button>` : ''}${impPatch ? html`<button type="button" id="patchImp" title="Outlets and patch cords of patch panels, from a CSV file">Import patch list…</button>` : ''}${saveViewBtn() || (!st.scope && SERVER.on) ? html`<hr class="msep">` : ''}${rawHtml(saveViewBtn())}${st.scope || !SERVER.on ? '' : html`<button type="button" id="rpBtn" title="The inventory or lifecycle report, of the devices listed here if filtered">Report…</button>`}`), { id: 'csvMenu', cls: 'tb-more', btn: moreBtnAttrs(['export', 'print', (impCsv || impPatch) && 'import', saveViewBtn() && 'save view', !st.scope && SERVER.on && 'report']) }))}${!n && st.scope ? html`<span class="grow"></span>${rawHtml(scopeActs(list, true))}` : ''}${rawHtml(tableBulkBar(list, n))}`;
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
  $('#csvBtn').onclick = () => { $('#csvMenu .menubox').hidePopover(); exportCsv(list, null, fileName()); };
  /* The columns in the order they are shown (moved by their heading too), each cell's text as it is seen. */
  const shownRows = () => {
    const ks = [...$('#view').querySelectorAll('table.grid thead th[data-ck]')].map(th => /** @type {HTMLElement} */ (th).dataset.ck);
    const cols = ks.map(k => shown.find(c => c.k === k)).filter(Boolean);
    return { head: cols.map(c => c.label), rows: list.map(o => cols.map(c => textOf(c.cell(o, idx)))) };
  };
  $('#csvShown').onclick = () => { $('#csvMenu .menubox').hidePopover(); exportCsv(list, shownRows(), fileName()); };
  /* Excel: the same rows and columns, made into a workbook by the server (with filters on the heading row, like the
     Reports); the file is named like the CSV. */
  const xb = $('#xlsxShown');
  if (xb) xb.onclick = async () => {
    $('#csvMenu .menubox').hidePopover();
    const { head, rows } = shownRows(), name = fileName().replace(/\.csv$/, '');
    const subtitle = `${listCount(list.length, scopePool().length)}${st.q.trim() ? ` · search: ${st.q.trim()}` : ''}`;
    const r = await fetch('api/reports/list?format=xlsx', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list: 'devices', name, subtitle, columns: head.map(label => ({ label, w: 1 })), rows }) }).catch(() => null);
    if (!r || !r.ok){ toast(r ? ((await r.json().catch(() => ({}))).error || 'The file could not be made.') : 'The server cannot be reached.'); return; }
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await r.blob()), download: `${name}.xlsx` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const imp = $('#csvImp'); if (imp) imp.onclick = importCsvModal;
  const pimp = $('#patchImp'); if (pimp) pimp.onclick = () => patchImportModal();
  bindSaveView(); bindPrintMenu(); closeMoreOnPick();
  const rb = $('#rpBtn'); if (rb) rb.onclick = () => reportsModal({ ids: leftFilters() || st.q.trim() || Object.values(tv.filters || {}).some(v => String(v || '').trim()) ? list.map(o => o.id) : null });
  bindTableBulk(n);
  const idx = relIndex();   /* one index of the relations for all rows */
  let shown = tableCols().filter(c => c.fixed || !hiddenCols().includes(c.k));
  /* A data-quality check's column, or the columns a list from the Overview asks for (the replacement plan: purchase,
     due year, price), go right after Name while it is listed. */
  const fix = !st.scope && st.quality && QUALITY_FIX[st.quality];
  /* Sources disagree: the columns whose sources differ on the devices listed, the most first, right after Name. */
  const differ = !st.scope && st.quality === 'conflict' ? (() => { const n = new Map(); for (const o of list) for (const k of Object.keys(o.vals || {})) if (sourcesDisagree(o, k)) n.set(k, (n.get(k) || 0) + 1); return [...n.keys()].sort((a, b) => n.get(b) - n.get(a)); })() : [];
  const after = fix && fix[0] ? [fix[0]] : differ.length ? differ : !st.scope && st.ids && Array.isArray(st.ids.cols) ? st.ids.cols : !st.scope && st.seen ? ['seen'] : !st.scope && st.gone ? ['gone'] : [];
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
  if (TBL['view:table:0']) remapTable(tv, keys);
  /* A column order of one's own: the column of the data-quality check still goes right after Name. */
  if (after.length && Array.isArray(tv.order)){
    let prev = keys.indexOf('name') + 1;
    for (const k of after.filter(x => keys.includes(x))){
      const ci = keys.indexOf(k) + 1;
      tv.order = tv.order.filter(x => x !== ci); tv.order.splice(tv.order.indexOf(prev) + 1, 0, ci); prev = ci;
    }
  }
  /* A cell's text as data: marks beside the value (Edited, the source badges) are not part of it. */
  const textOf = html => html.replace(/<span class="mk\b[^"]*"[^>]*>[^<]*<\/span>/g, '').replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, m => ({'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'"})[m]).trim();
  const colOf = ci => shown[ci - 1];
  for (const [ci, q] of Object.entries(tv.filters || {})) {
    const c = colOf(+ci), want = String(q || '').trim().toLowerCase();
    if (c && want) list = list.filter(o => textOf(c.cell(o, idx)).toLowerCase().includes(want));
  }
  const sc = tv.sort && colOf(tv.sort.ci);
  if (sc) { const key = new Map(list.map(o => [o, textOf(sc.cell(o, idx))])); list = [...list].sort((a, b) => tv.sort.dir * cmpCells(key.get(a), key.get(b))); }
  /* What Print → As a table prints: these rows, in this order, with these columns. */
  LAST = { list, shown, idx };
  /* Thousands of rows take seconds to lay out: the first ones are drawn, the rest on request. */
  $('#tblCount').textContent = listCountShown(list.length, scopePool().length);
  const cut = st.tableAll !== viewSig() && list.length > SHOW_FIRST + 100;
  const rowsOf = cut ? list.slice(0, SHOW_FIRST) : list;
  $('#view').innerHTML = html`<div class="gridwrap"><table class="grid" data-data="1"><thead><tr>
    <th data-w="52" data-pin="1" class="selcol"><input type="checkbox" id="selAll" aria-label="Select all shown rows" style="height:auto"></th>
    ${shown.map(c => html`<th data-ck="${c.k}" data-w="${c.w || 140}"${c.k === 'code' || c.k === 'name' ? html` data-pin="1"` : ''}>${c.label}</th>`)}</tr></thead><tbody>
    ${rowsOf.map(o => html`<tr data-open="${o.id}"><td class="selcol"><input type="checkbox" data-sel="${o.id}" ${st.bulk.has(o.id) ? 'checked' : ''} aria-label="Select ${o.name}" style="height:auto"></td>${shown.map(c => rawHtml(withSource(o, c, c.cell(o, idx))))}</tr>`)}
    </tbody></table>${list.length ? '' : rawHtml(hiddenHits())}${cut ? html`<div class="more-rows"><span class="muted">Showing the first ${SHOW_FIRST} of ${list.length} rows. Search or filter a column to narrow them down.</span><button id="tableAll">Show all ${list.length}</button></div>` : ''}</div>`;
  const ta = $('#tableAll'); if (ta) ta.onclick = () => { st.tableAll = viewSig(); renderTable(); };
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

