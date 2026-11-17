/* Network → Printers: every printer the computers use, once each, from the printers Lansweeper finds on them. Each row
   says how it is reached, how many computers use it (opening them in the Table), the printer device it stands for or
   Add as device, the print server a shared one goes through, and computers whose port points to an address the printer
   no longer has. Printers of the inventory no computer uses are listed too. */
import { $, objs, rels, st, tico } from './01-core.js';
import { queueServerSave, render } from './07-render.js';
import { isAdmin } from './04-settings.js';
import { resetFilters } from './02-views.js';
import { printerRows } from './printers.js';
import { addPrinterDevice } from './printers-panel.js';
import { html, rawHtml } from './html.js';

const HOW = { usb: 'USB', ip: 'Network', share: 'Shared', net: 'Network' };
const SHOW = [['', 'All printers'], ['missing', 'Not in the inventory'], ['stale', 'Port with an old address'], ['unused', 'Used by no computer']];
/* The printer's own address when it is known, else how the computers reach it. */
const where = (r) => (r.d && r.d.ip) || (r.p ? (r.p.kind === 'ip' ? r.p.ip : r.p.kind === 'share' ? `\\\\${r.p.host}\\${r.p.share}` : r.p.port || '') : '');
const nameOf = r => r.d ? r.d.name : r.p.kind === 'share' ? r.p.share : r.p.name;

export function renderPrinters(){
  const all = printerRows(objs, rels), q = (st.q || '').trim().toLowerCase(), edit = isAdmin();
  const show = SHOW.some(([k]) => k === st.prnShow) ? st.prnShow || '' : '';
  const n = { missing: all.filter(r => !r.d).length, stale: all.filter(r => r.stale.length).length, unused: all.filter(r => !r.users.length).length };
  $('#toolbar').innerHTML = html`<label class="muted" for="prnShow">Show</label><select id="prnShow" aria-label="Which printers">
    ${SHOW.map(([k, l]) => html`<option value="${k}" ${show === k ? 'selected' : ''}>${l}${k ? ` (${n[k]})` : ''}</option>`)}</select>
    <span class="muted" id="prnCount"></span><div class="grow"></div>`;
  let rows = all;
  if (show === 'missing') rows = rows.filter(r => !r.d);
  else if (show === 'stale') rows = rows.filter(r => r.stale.length);
  else if (show === 'unused') rows = rows.filter(r => !r.users.length);
  if (q) rows = rows.filter(r => [nameOf(r), where(r), r.d && r.d.model, r.p && r.p.driver, ...r.users.map(u => u.pc.name)].some(v => v && String(v).toLowerCase().includes(q)));
  rows.sort((a, b) => b.users.length - a.users.length || nameOf(a).localeCompare(nameOf(b)));
  $('#prnCount').textContent = `${rows.length} ${rows.length === 1 ? 'printer' : 'printers'}${n.missing ? ` · ${n.missing} not in the inventory` : ''}${n.stale ? ` · ${n.stale} with an old address on a computer` : ''}`;

  const anyData = objs.some(o => Array.isArray(o.lsPrinters) && o.lsPrinters.length);
  const body = rows.length ? rows.map((r, i) => html`<tr class="${r.stale.length ? 'prn-stale' : ''}">
      <td data-label="Printer"><div>${r.d ? html`<span class="prn-dev">${rawHtml(tico(r.d.type, 'tico sm'))}<a class="link mono" data-open="${r.d.id}">${r.d.name}</a></span>` : html`<span class="mono">${nameOf(r)}</span>`}
        ${(r.d && r.d.model) || (r.p && r.p.driver) ? html`<div class="muted prn-sub">${(r.d && r.d.model) || r.p.driver}</div>` : ''}${!r.d && r.p.kind === 'usb' ? html`<div class="muted prn-sub">plugged into ${r.users[0].pc.name}</div>` : ''}</div></td>
      <td data-label="Connection"><div>${[...r.kinds].map(k => html`<span class="chip prn-${k}">${HOW[k] || k}</span> `)}${r.via ? html`<div class="prn-sub">via <a class="link mono" data-open="${r.via.id}">${r.via.name}</a></div>` : ''}</div></td>
      <td data-label="Address" class="mono">${where(r)}</td>
      <td data-label="Used by">${r.users.length ? html`<button type="button" class="link" data-prnusers="${i}">${r.users.length} ${r.users.length === 1 ? 'computer' : 'computers'}</button>` : html`<span class="muted">None</span>`}</td>
      <td data-label="Inventory">${r.d ? html`<span class="chip ok">In the inventory</span>` : edit ? html`<button type="button" class="link" data-prnadd="${i}">Add as device</button>` : html`<span class="muted">Not in the inventory</span>`}</td>
      <td data-label="${r.stale.length ? 'Notes' : ''}">${r.stale.length ? html`<span class="ip-note warn" title="${r.stale.map(s => `${s.pc.name}: ${s.port}`).join(', ')}">${r.stale.length === 1 ? `${r.stale[0].pc.name} prints to ${r.stale[0].port}` : `${r.stale.length} computers print to an old address`}; the printer is at ${r.stale[0].now}</span>` : ''}</td></tr>`)
    : html`<tr><td colspan="6" class="muted" style="padding:14px">${anyData ? 'No printer matches.' : 'No printers yet: Lansweeper sends the printers set up on each Windows computer with its push.'}</td></tr>`;
  $('#view').innerHTML = html`<div class="ip-page"><div class="gridwrap" style="height:auto"><table class="grid prns stack" data-tb="own">
    <thead><tr><th>Printer</th><th>Connection</th><th>Address or share</th><th>Used by</th><th>Inventory</th><th>Notes</th></tr></thead><tbody>${body}</tbody></table></div></div>`;

  $('#prnShow').onchange = e => { st.prnShow = /** @type {HTMLSelectElement} */ (e.target).value; renderPrinters(); };
  $('#view').querySelectorAll('[data-prnusers]').forEach(b => b.addEventListener('click', () => {
    const r = rows[+(/** @type {HTMLElement} */ (b).dataset.prnusers)]; if (!r) return;
    resetFilters(); st.ids = { label: `Computers using ${nameOf(r)}`, ids: r.users.map(u => u.pc.id) }; st.scope = null; st.tab = 'table'; render();
  }));
  $('#view').querySelectorAll('[data-prnadd]').forEach(b => b.addEventListener('click', () => {
    const r = rows[+(/** @type {HTMLElement} */ (b).dataset.prnadd)]; if (!r || r.d) return;
    addPrinterDevice(r.p, r.users[0].pc); queueServerSave(); render();
  }));
}
