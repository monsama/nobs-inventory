/* IP addresses: every address the inventory knows, one row each (a device's own address and those of its other
   adapters), in address order, with the device, whether it is static or dynamic, its subnet, and what is wrong with it:
   two devices on one address, a static address inside a DHCP range, the gateway taken by a device. The filters on the
   left and the search apply as in Cards and the Table. With one subnet picked, its free addresses can be shown too. */
import { $, STATUS, SUBNETS, TYPES, filtered, hist, menuHtml, now, objs, setByHand, st, tico, toast } from './01-core.js';
import { queueServerSave, render } from './07-render.js';
import { isAdmin } from './04-settings.js';
import { subnetFor, subnetName } from './17-fields.js';
import { csvCell } from './views-csv.js';
import { intToIp, ipInt, rangeKeptOut, subnetSpan } from './net.js';
import { html, rawHtml } from './html.js';

/* What a device says about its address: static, dynamic (DHCP) or not known. */
export const ASSIGN = { static: 'Static', dhcp: 'Dynamic (DHCP)', '': 'Not known' };
/* The most addresses of a subnet listed with the free ones: a /22 (1022 hosts); a larger one lists the used only. */
const FREE_MAX = 1024;

const rangeOf = (sub, n) => sub && n !== null ? (sub.ranges || []).find(r => n >= ipInt(r.from) && n <= ipInt(r.to)) || null : null;
const isDhcpRange = r => !!r && /^dhcp$/i.test(String(r.use || '').trim());

/* One row per address in use: the device, which adapter (main or another), the address and how it is given. */
export function ipRows(list, all = objs){
  const rows = [];
  for (const o of list) {
    if (o.status === 'retired') continue;
    if (o.ip && ipInt(o.ip) !== null) rows.push({ o, ip: o.ip, n: ipInt(o.ip), main: true, nic: '', mac: o.mac || '', dhcp: o.dhcp || '' });
    (o.nics || []).forEach((x, i) => { if (x.ip && ipInt(x.ip) !== null && x.ip !== o.ip) rows.push({ o, ip: x.ip, n: ipInt(x.ip), main: false, nic: x.name || x.merged || `Adapter ${i + 2}`, mac: x.mac || '', dhcp: x.dhcp || '' }); });
  }
  /* Who else has each address (any device in use, also those the filters hide), to name a clash. */
  const holders = new Map();
  for (const o of all) {
    if (o.status === 'retired') continue;
    for (const a of new Set([o.ip, ...(o.nics || []).map(x => x.ip)].filter(Boolean))) { const k = ipInt(a); if (k !== null) holders.set(k, [...(holders.get(k) || []), o]); }
  }
  for (const r of rows) {
    r.sub = subnetFor({ ...r.o, ip: r.ip, subnet: r.main ? r.o.subnet : '' });
    r.range = rangeOf(r.sub, r.n);
    r.others = (holders.get(r.n) || []).filter(x => x !== r.o);
    /* Not set on the device: an address inside a DHCP range is most likely dynamic. */
    r.guess = !r.dhcp && isDhcpRange(r.range) ? 'dhcp' : '';
    r.notes = [];
    if (r.others.length) r.notes.push({ warn: !(r.dhcp === 'dhcp' || isDhcpRange(r.range)), text: `Also on ${r.others.map(x => x.name).join(', ')}` });
    if (r.dhcp === 'static' && isDhcpRange(r.range)) r.notes.push({ warn: true, text: 'Static, but inside a DHCP range' });
    if (r.sub && r.sub.gateway === r.ip && !['router', 'firewall'].includes(r.o.type)) r.notes.push({ warn: true, text: `The gateway of ${subnetName(r.sub)}` });
    if (!r.sub && SUBNETS.length) r.notes.push({ warn: false, text: 'In no subnet listed in Settings' });
  }
  return rows.sort((a, b) => a.n - b.n || a.o.name.localeCompare(b.o.name));
}
const rowText = r => [r.ip, r.o.name, r.mac, r.nic, r.o.loc, TYPES[r.o.type] ? TYPES[r.o.type].label : r.o.type, ASSIGN[r.dhcp || r.guess] || ''].join(' ').toLowerCase();
const assignOf = r => r.dhcp || r.guess;

/* The IP addresses tab. */
export function renderIps(){
  const subs = [...SUBNETS].sort((a, b) => (subnetSpan(a)?.first ?? 0) - (subnetSpan(b)?.first ?? 0));
  if (st.ipSub && st.ipSub !== '-' && !subs.some(n => n.cidr === st.ipSub)) st.ipSub = '';
  const sub = subs.find(n => n.cidr === st.ipSub) || null, span = sub ? subnetSpan(sub) : null;
  const canFree = !!span && span.last - span.first - 1 <= FREE_MAX;
  const edit = isAdmin();
  $('#toolbar').innerHTML = html`<label class="muted" for="ipSub">Subnet</label><select id="ipSub" aria-label="Subnet">
      <option value="">All addresses</option>${subs.map(n => html`<option value="${n.cidr}" ${st.ipSub === n.cidr ? 'selected' : ''}>${n.name && n.name !== n.cidr ? `${n.name} · ${n.cidr}` : n.cidr}</option>`)}
      ${subs.length ? html`<option value="-" ${st.ipSub === '-' ? 'selected' : ''}>In no listed subnet</option>` : ''}</select>
    <label class="muted" for="ipAssign">Assignment</label><select id="ipAssign" aria-label="Assignment">
      <option value="">All</option><option value="static" ${st.ipAssign === 'static' ? 'selected' : ''}>Static</option><option value="dhcp" ${st.ipAssign === 'dhcp' ? 'selected' : ''}>Dynamic (DHCP)</option><option value="none" ${st.ipAssign === 'none' ? 'selected' : ''}>Not known</option></select>
    <label class="pchk" style="width:auto"><input type="checkbox" id="ipProblems" ${st.ipProblems ? 'checked' : ''}> Only problems</label>
    ${canFree ? html`<label class="pchk" style="width:auto"><input type="checkbox" id="ipFree" ${st.ipFree ? 'checked' : ''}> Free addresses</label>` : ''}
    <span class="muted" id="ipCount"></span><div class="grow"></div>${rawHtml(menuHtml('Export', String(html`
      <button type="button" data-ipx="xlsx">Excel<span class="muted">the rows shown</span></button>
      <button type="button" data-ipx="pdf">PDF<span class="muted">A4 landscape</span></button>
      <button type="button" data-ipx="csv">CSV<span class="muted">for other tools</span></button>
      <button type="button" data-ipx="print">Print…<span class="muted">or save as PDF from the browser</span></button>`), { id: 'ipExport' }))}`;

  const q = (st.q || '').trim().toLowerCase();
  let rows = ipRows(filtered());
  /* The search finds the address, device, MAC or adapter of a row; a device found by something else shows all its rows. */
  if (q) { const hit = rows.filter(r => rowText(r).includes(q)); if (hit.length) rows = hit; }
  if (sub) rows = rows.filter(r => r.n >= span.first && r.n <= span.last);
  else if (st.ipSub === '-') rows = rows.filter(r => !r.sub);
  const total = rows.length;
  if (st.ipAssign) rows = rows.filter(r => st.ipAssign === 'none' ? !assignOf(r) : assignOf(r) === st.ipAssign);
  if (st.ipProblems) rows = rows.filter(r => r.notes.some(x => x.warn));
  const count = (k) => rows.filter(r => assignOf(r) === k).length;
  const nUnknown = rows.filter(r => !assignOf(r)).length, nProb = rows.filter(r => r.notes.some(x => x.warn)).length;

  /* With one subnet and Free addresses: every host address of it, the free ones as rows of their own, marked by their range. */
  /** @type {{ r?: any, free?: { ip: string, what: string, use: string } }[]} */
  let lines = rows.map(r => ({ r }));
  let nFree = 0;
  if (canFree && st.ipFree && !st.ipProblems && !st.ipAssign && !q) {
    const used = new Map(); rows.forEach(r => used.set(r.n, [...(used.get(r.n) || []), r]));
    lines = [];
    for (let n = span.first + 1; n < span.last; n++) {
      if (used.has(n)) { used.get(n).forEach(r => lines.push({ r })); continue; }
      const range = rangeOf(sub, n), ip = intToIp(n);
      const what = sub.gateway === ip ? 'Gateway' : (sub.dns || []).includes(ip) ? 'DNS server' : range && rangeKeptOut(range) ? (isDhcpRange(range) ? 'DHCP range' : 'Reserved') : 'Free';
      if (what === 'Free') nFree++;
      lines.push({ free: { ip, what, use: range && range.use ? range.use : '' } });
    }
  }
  $('#ipCount').textContent = `${total === rows.length ? `${rows.length} ${rows.length === 1 ? 'address' : 'addresses'}` : `${rows.length} of ${total} addresses`} · ${count('static')} static · ${count('dhcp')} dynamic · ${nUnknown} not known${nProb ? ` · ${nProb} with a problem` : ''}${nFree ? ` · ${nFree} free` : ''}`;

  const assignCell = r => {
    const v = assignOf(r), label = r.guess && !r.dhcp ? 'Dynamic (DHCP range)' : ASSIGN[v] || 'Not known';
    if (!edit || !r.main) return html`<span class="ip-as ${v || 'none'}${r.guess && !r.dhcp ? ' guess' : ''}" ${r.guess && !r.dhcp ? html`title="Not set on the device: the address is in a DHCP range of its subnet"` : ''}>${label}</span>`;
    return html`<select class="ip-assign" data-ipas="${r.o.id}" aria-label="${`Assignment of ${r.ip} on ${r.o.name}`}">
      <option value="" ${r.dhcp ? '' : 'selected'}>${r.guess ? 'In DHCP range' : 'Not known'}</option><option value="static" ${r.dhcp === 'static' ? 'selected' : ''}>Static</option><option value="dhcp" ${r.dhcp === 'dhcp' ? 'selected' : ''}>Dynamic (DHCP)</option></select>`;
  };
  const head = html`<thead><tr><th class="ip-addr">Address</th><th>Device</th><th class="ip-opt">Type</th><th class="ip-as-col">Assignment</th><th class="ip-opt">Subnet</th><th class="ip-opt">MAC address</th><th class="ip-opt">Location</th><th>Notes</th></tr></thead>`;
  const body = lines.length ? html`${lines.map(({ r, free }) => free
    ? html`<tr class="ip-free ${free.what === 'Free' ? '' : 'kept'}"><td class="mono">${free.ip}</td><td colspan="7" class="muted">${free.what}${free.use && free.what === 'Free' ? html` <span class="chip">${free.use}</span>` : ''}</td></tr>`
    : html`<tr class="${r.notes.some(x => x.warn) ? 'ip-warn' : ''}">
      <td class="mono">${r.ip}</td>
      <td><span class="ip-dev">${rawHtml(tico(r.o.type, 'tico sm'))}<a class="link mono" data-open="${r.o.id}">${r.o.name}</a>${r.main ? '' : html` <span class="muted">${r.nic}</span>`}${r.o.status !== 'active' && STATUS[r.o.status] ? html` <span class="chip ${STATUS[r.o.status].cls}">${STATUS[r.o.status].label}</span>` : ''}</span></td>
      <td class="ip-opt">${TYPES[r.o.type] ? TYPES[r.o.type].short : r.o.type}</td>
      <td class="ip-as-col">${assignCell(r)}</td>
      <td class="ip-opt">${r.sub ? html`${subnetName(r.sub)}${r.range && r.range.use ? html` <span class="muted">· ${r.range.use}</span>` : ''}` : html`<span class="muted">-</span>`}</td>
      <td class="ip-opt mono">${r.mac}</td>
      <td class="ip-opt">${(r.o.loc || '').replace(' / ', ' · ')}</td>
      <td>${r.notes.map(x => html`<span class="ip-note ${x.warn ? 'warn' : 'info'}">${x.text}</span>`)}</td></tr>`)}`
    : html`<tr><td colspan="8" class="muted" style="padding:14px">${objs.some(o => o.ip) ? 'No address matches.' : 'No device has an IP address yet. Lansweeper, Intune or a device page fills them in.'}</td></tr>`;
  $('#view').innerHTML = html`<div class="ip-page"><div class="gridwrap" style="height:auto"><table class="grid ips" data-tb="own">${head}<tbody>${body}</tbody></table></div></div>`;

  const set = (k, v) => { st[k] = v; renderIps(); };
  $('#ipSub').onchange = e => set('ipSub', /** @type {HTMLSelectElement} */ (e.target).value);
  $('#ipAssign').onchange = e => set('ipAssign', /** @type {HTMLSelectElement} */ (e.target).value);
  $('#ipProblems').onchange = e => set('ipProblems', /** @type {HTMLInputElement} */ (e.target).checked);
  const fr = $('#ipFree'); if (fr) fr.onchange = e => set('ipFree', /** @type {HTMLInputElement} */ (e.target).checked);
  /* The assignment of a device's own address, set here as on its page: kept from the syncs, with a history line. */
  $('#view').querySelectorAll('[data-ipas]').forEach(s => s.onchange = () => {
    const o = objs.find(x => x.id === /** @type {HTMLElement} */ (s).dataset.ipas); if (!o) return;
    const v = /** @type {HTMLSelectElement} */ (s).value;
    if ((o.dhcp || '') === v) return;
    setByHand(o, 'dhcp', v);
    if (v) o.dhcp = v; else delete o.dhcp;
    hist(o, now(), `IP assignment set to ${ASSIGN[v]}`);
    queueServerSave(); toast(`${o.name}: ${ASSIGN[v]}`); render();
  });
  /* The rows shown, as they read on screen, for every export. */
  const cols = [['Address', 0.9], ['Device', 1.3], ['Adapter', 0.8], ['Type', 0.8], ['Assignment', 1], ['Subnet', 1.1], ['MAC address', 1.1], ['Location', 1.2], ['Notes', 1.8]];
  const data = () => lines.map(({ r, free }) => free ? [free.ip, '', '', '', '', sub ? subnetName(sub) : '', '', '', free.what + (free.use && free.what === 'Free' ? ` (${free.use})` : '')]
    : [r.ip, r.o.name, r.main ? '' : r.nic, TYPES[r.o.type] ? TYPES[r.o.type].label : r.o.type, ASSIGN[r.dhcp] || (r.guess ? 'Dynamic (DHCP range)' : 'Not known'), r.sub ? subnetName(r.sub) : '', r.mac, (r.o.loc || '').replace(' / ', ' · '), r.notes.map(x => x.text).join('; ')]);
  const what = () => [sub ? `Subnet ${subnetName(sub)} (${sub.cidr})` : st.ipSub === '-' ? 'In no listed subnet' : 'All addresses', st.ipAssign ? `Assignment: ${st.ipAssign === 'none' ? 'Not known' : ASSIGN[st.ipAssign]}` : '', st.ipProblems ? 'Only problems' : '', q ? `Search: ${st.q.trim()}` : '', $('#ipCount').textContent].filter(Boolean).join(' · ');
  const fileName = `ip-addresses${sub ? '-' + sub.cidr.replace(/[./]/g, '-') : ''}`;
  const save = (blob, name) => { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  $('#ipExport').querySelectorAll('[data-ipx]').forEach(b => b.addEventListener('click', async () => {
    const box = /** @type {HTMLElement|null} */ ($('#ipExport .menubox')); if (box) try { box.hidePopover(); } catch { /* not open */ }
    const kind = /** @type {HTMLElement} */ (b).dataset.ipx, rows = data();
    if (kind === 'csv') return save(new Blob(['\ufeff' + [cols.map(c => c[0]), ...rows].map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv' }), fileName + '.csv');
    if (kind === 'print') return printIps(cols.map(c => c[0]), rows, what());
    /* Excel and PDF are made by the server, like the Reports: the rows go there, the file comes back. */
    const r = await fetch(`api/reports/list?format=${kind}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'IP addresses', name: fileName, subtitle: what(), columns: cols.map(([label, w]) => ({ label, w })), rows }) }).catch(() => null);
    if (!r || !r.ok){ toast(r ? ((await r.json().catch(() => ({}))).error || 'The file could not be made.') : 'The server cannot be reached.'); return; }
    save(await r.blob(), `${fileName}.${kind}`);
  }));
}

/* The list in a page of its own made for A4 paper (landscape, light, the heads on every page), with what it shows and
   when; the browser's print dialog also saves it as a PDF. */
function printIps(head, rows, what){
  const w = window.open('', '_blank');
  if (!w){ toast('The browser blocked the print window. Allow pop-ups for this page and try again.'); return; }
  w.document.open();
  w.document.write(String(html`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>IP addresses</title>
    <style>
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}
      body{font:11px/1.35 system-ui,"Segoe UI",Roboto,Arial,sans-serif;color:#111;background:#fff;margin:0;padding:14px}
      h2{margin:0 0 2px;font-size:17px}p.sub{margin:0 0 10px;color:#555;font-size:11px}
      table{border-collapse:collapse;width:100%;table-layout:fixed}
      th,td{border:1px solid #c8c8c8;padding:3px 5px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
      th{background:#eef1f5;font-weight:600}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}
      td.mono{font-family:ui-monospace,Consolas,monospace;font-size:10px;white-space:nowrap;overflow-wrap:normal}
      tr.free td{color:#777;background:#f7f7f7}tr.warn td:last-child{color:#b42318}
      col.c0{width:9%}col.c1{width:13%}col.c2{width:6%}col.c3{width:7%}col.c4{width:10%}col.c5{width:9%}col.c6{width:13%}col.c7{width:13%}col.c8{width:20%}
      @page{size:A4 landscape;margin:10mm}
      @media print{body{padding:0}}
    </style></head><body><h2>IP addresses</h2><p class="sub">${what} · printed ${new Date().toLocaleString()}</p>
    <table><colgroup>${head.map((_, i) => html`<col class="c${i}">`)}</colgroup><thead><tr>${head.map(h => html`<th>${h}</th>`)}</tr></thead><tbody>
    ${rows.map(r => html`<tr class="${!r[1] ? 'free' : r[8] ? 'warn' : ''}">${r.map((v, i) => html`<td class="${i === 0 || i === 6 ? 'mono' : ''}">${v}</td>`)}</tr>`)}</tbody></table></body></html>`));
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* the window was closed */ } }, 400);
}
