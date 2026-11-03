/* CSV: export of the listed devices and import from a file (split out of 02-views.js, which re-exports it). */
import { parseCsv } from './csv.js';
import { markHand, $, LOCS, O, STATUS, TYPES, esc, hist, now, objs, toast } from './01-core.js';
import { render } from './07-render.js';
import { bindUser, checkAddress } from './04-settings.js';
import { closeModal, modal } from './19-modal.js';
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
/* The columns a CSV row can update on a device already here, with their names for the preview and the history. */
const CSV_FIELDS = ['loc', 'model', 'serial', 'ip', 'mac', 'user'];
const CSV_LABEL = { loc: 'Location', model: 'Model', serial: 'Serial number', ip: 'IP address', mac: 'MAC address', user: 'User' };
export function importCsvModal(){
  modal(`<div class="mh">Import devices from CSV</div>
    <div class="mb">
      <p class="note">The first row is the header. Columns: <span class="mono">name, type, model, serial, ip, mac, location, user</span>. Type is an object type name. Location must match a location exactly. Comma or semicolon separated. Rows with a problem are shown and skipped. A row whose serial number (or else name) is a device here updates that device instead of adding it.</p>
      <div class="form" style="padding:0"><label for="csvFile">File</label><div class="filepick"><label class="btnlike" tabindex="0" role="button">Choose CSV file…<input id="csvFile" type="file" accept=".csv,text/csv" hidden></label><span class="muted" id="csvFileName">No file chosen</span></div></div>
      <label class="note" for="csvText">Or paste the rows</label>
      <textarea id="csvText" rows="5" class="mono" placeholder="name,type,model,serial,ip,mac,location,user"></textarea>
      <div id="csvPrev"></div>
    </div>
    <div class="mf"><button id="csvCancel">Cancel</button><button id="csvGo" class="primary" disabled>Import</button></div>`, 'wide');
  let parsed = [];
  const parse = () => {
    const rows = parseCsv($('#csvText').value);
    const head = (rows[0] || []).map(h => h.trim().toLowerCase());
    const col = k => head.indexOf(k);
    if (!rows.length || col('name') < 0 || col('type') < 0){
      $('#csvPrev').innerHTML = rows.length ? '<p class="note">The first row needs at least the columns name and type.</p>' : '';
      parsed = []; $('#csvGo').disabled = true; return;
    }
    parsed = rows.slice(1).map((r, i) => {
      const g = k => col(k) >= 0 ? (r[col(k)] || '').trim() : '';
      const name = g('name'), tv = g('type').toLowerCase(), loc = g('location');
      const tKey = Object.keys(TYPES).find(k => k === tv || TYPES[k].label.toLowerCase() === tv);
      const errs = [];
      if (!name) errs.push('no name');
      if (!tKey) errs.push('unknown type');
      if (loc && !LOCS.includes(loc)) errs.push('unknown location');
      const ip = checkAddress('ip', g('ip')), mac = checkAddress('mac', g('mac'));
      if (!ip.ok) errs.push('IP address is not valid');
      if (!mac.ok) errs.push('MAC address is not valid');
      const row = {line: i + 2, name, type: tKey, loc, model: g('model'), serial: g('serial'), ip: ip.value, mac: g('mac'), user: g('user'), errs};
      /* The same device already here (by serial number, else by name): its fields are updated with what the row has. */
      const low = v => String(v || '').trim().toLowerCase();
      row.match = (row.serial && objs.find(o => low(o.serial) === low(row.serial))) || (name && objs.find(o => o.status !== 'retired' && low(o.name) === low(name))) || null;
      if (row.match) row.changes = CSV_FIELDS.filter(k => row[k] && String(row.match[k] ?? '') !== String(row[k]));
      return row;
    });
    const okRows = parsed.filter(p => !p.errs.length), ok = okRows.length;
    const adds = okRows.filter(p => !p.match).length, updates = okRows.filter(p => p.match && p.changes.length).length, same = okRows.filter(p => p.match && !p.changes.length).length;
    const result = p => p.errs.length ? '<span class="chip warn">' + esc(p.errs.join(', ')) + '</span>'
      : !p.match ? '<span class="chip ok">new</span>'
      : p.changes.length ? `<span class="chip">updates ${esc(p.match.name)}: ${esc(p.changes.map(k => CSV_LABEL[k]).join(', '))}</span>` : `<span class="chip">${esc(p.match.name)}: nothing new</span>`;
    $('#csvPrev').innerHTML = `<div class="summary"><span class="chip ok">${adds} new</span>${updates ? `<span class="chip">${updates} to update</span>` : ''}${same ? `<span class="chip">${same} unchanged</span>` : ''}${parsed.length - ok ? `<span class="chip warn">${parsed.length - ok} with problems</span>` : ''}</div>
      <div style="overflow-x:auto"><table class="grid mini" style="min-width:0"><thead><tr><th>Line</th><th>Name</th><th>Type</th><th>Location</th><th>Result</th></tr></thead><tbody>
      ${parsed.map(p => `<tr><td class="n">${p.line}</td><td>${esc(p.name)}</td><td>${p.type ? esc(TYPES[p.type].label) : '—'}</td><td>${esc(p.loc || (p.match ? '' : 'none'))}</td><td>${result(p)}</td></tr>`).join('')}
      </tbody></table></div>`;
    $('#csvGo').disabled = adds + updates === 0;
    $('#csvGo').textContent = updates && adds ? `Add ${adds} and update ${updates}` : updates ? `Update ${updates}` : 'Import';
  };
  $('#csvFile').onchange = async e => { const f = e.target.files[0]; $('#csvFileName').textContent = f ? f.name : 'No file chosen'; if (f){ $('#csvText').value = await f.text(); parse(); } };
  $('#csvText').oninput = parse;
  $('#csvCancel').onclick = closeModal;
  $('#csvGo').onclick = () => {
    const ready = parsed.filter(p => !p.errs.length);
    let added = 0, updated = 0;
    ready.forEach(p => {
      if (p.match){
        if (!p.changes.length) return;
        /* Values from the file are set by hand: noted so, and no sync puts its own back. */
        for (const k of p.changes){ p.match[k] = p[k]; markHand(p.match, k); if (!p.match.src || !p.match.src[k]) p.match.src = {...(p.match.src || {}), [k]: 'hand'}; }
        if (p.changes.includes('user')) bindUser(p.match);
        hist(p.match, now(), `Updated from CSV: ${p.changes.map(k => CSV_LABEL[k]).join(', ')}`); updated++;
        return;
      }
      const o = O(p.type, p.name, {loc: p.loc, model: p.model, serial: p.serial, ip: p.ip, mac: p.mac, user: p.user});
      if (p.type === 'switch') Object.assign(o, {ports: 24, sfp: 4, pfx: '1/'});
      objs.push(o); bindUser(o); hist(o, now(), 'Imported from CSV'); added++;
    });
    closeModal(); toast([added ? `${added} added` : '', updated ? `${updated} updated` : ''].filter(Boolean).join(' · ') || 'Nothing to import'); render();
  };
}
