/* Printers on a device page. On a computer: the printers set up on it, as Lansweeper scans them (only the real ones:
   by USB, on the network, shared by a print server), each with the printer device it stands for where one is found.
   A USB printer not in the inventory yet can be added as a printer attached to the computer, in one click. On a
   printer: the computers that use it. */
import { $, O, hist, now, objs, rels, rid, tico, toast } from './01-core.js';
import { queueServerSave, render } from './07-render.js';
import { isAdmin, who } from './04-settings.js';
import { printerDevice, printerMatch } from './printers.js';
import { html, rawHtml } from './html.js';

const HOW = { usb: 'USB', ip: 'Network', share: 'Shared', net: 'Network' };
const howTitle = p => p.kind === 'usb' ? 'Plugged into this computer' : p.kind === 'share' ? `Through the print server ${p.host}` : p.kind === 'ip' ? `On the network at ${p.ip}` : 'On the network';
const where = p => p.kind === 'ip' ? p.ip : p.kind === 'share' ? `\\\\${p.host}\\${p.share}` : p.port;

/* The Printers panel of a computer, or '' when Lansweeper sent none for it. */
export function printersPanel(o){
  const list = o.lsPrinters || [];
  if (!list.length) return '';
  const edit = isAdmin() && o.status !== 'retired' && !o.review;
  return String(html`<div class="panelbox"><div class="hdr">Printers <span class="cnt">${list.length} from Lansweeper</span></div>
    <div style="overflow-x:auto"><table class="grid mini prn-table" style="min-width:0"><thead><tr><th>Printer</th><th>Connection</th><th>Port or address</th><th>In the inventory</th></tr></thead><tbody>
    ${list.map((p, i) => { const m = printerMatch(p, o, objs, rels), d = m.d; return html`<tr${m.stale ? html` class="prn-stale"` : ''}>
      <td>${p.name}${p.driver && p.driver !== p.name ? html`<div class="muted prn-sub">${p.driver}</div>` : ''}</td>
      <td><span class="chip prn-${p.kind}" title="${howTitle(p)}">${HOW[p.kind] || p.kind}</span>${m.via ? html`<div class="prn-sub">via <a class="link mono" data-open="${m.via.id}">${m.via.name}</a></div>` : ''}</td>
      <td><span class="mono">${where(p)}</span>${m.stale ? html`<div class="prn-warn">The printer is now at ${m.stale.now}: this port still points to the old address</div>` : ''}</td>
      <td>${d ? html`<span class="prn-dev">${rawHtml(tico(d.type, 'tico sm'))}<a class="link mono" data-open="${d.id}">${d.name}</a></span>${m.by === 'name' || m.by === 'model' ? html`<div class="muted prn-sub">found by its ${m.by}</div>` : ''}`
        : edit ? html`<button type="button" class="link" data-prnadd="${i}" title="${p.kind === 'usb' ? `Add it as a printer attached to ${o.name}` : 'Add it as a printer of the inventory'}">Add as device</button>`
        : html`<span class="muted">${p.kind === 'usb' ? 'Not recorded' : 'Not found'}</span>`}</td></tr>`; })}
    </tbody></table></div></div>`);
}

/* The computers that use printer o (by its address, its share, or attached by USB), as a panel, or ''. */
export function printerUsersPanel(o){
  if (o.type !== 'printer') return '';
  const users = [];
  for (const pc of objs) {
    if (pc === o || pc.status === 'retired' || !(pc.lsPrinters || []).length) continue;
    const p = pc.lsPrinters.find(x => printerDevice(x, pc, objs, rels) === o);
    if (p) users.push({ pc, p });
  }
  if (!users.length) return '';
  users.sort((a, b) => a.pc.name.localeCompare(b.pc.name));
  return String(html`<div class="panelbox"><div class="hdr">Used by <span class="cnt">${users.length} ${users.length === 1 ? 'computer' : 'computers'}</span></div>
    <div style="overflow-x:auto"><table class="grid mini prn-table" style="min-width:0"><thead><tr><th>Computer</th><th>User</th><th>Connection</th></tr></thead><tbody>
    ${users.map(({ pc, p }) => html`<tr><td><span class="prn-dev">${rawHtml(tico(pc.type, 'tico sm'))}<a class="link mono" data-open="${pc.id}">${pc.name}</a></span></td><td>${pc.user || ''}</td><td><span class="chip prn-${p.kind}" title="${howTitle(p)}">${HOW[p.kind] || p.kind}</span></td></tr>`)}
    </tbody></table></div></div>`);
}

/* A printer a computer uses, added as a printer of the inventory: a USB one in the computer's room and attached to it;
   one on the network with its address (by its share's name for a shared one), not placed (it is not where the computer
   is). The next match finds it. */
export function addPrinterDevice(p, pc){
  const name = (p.kind === 'share' ? p.share : p.name).replace(/\s*\((wsd|copy \d+)\)\s*$/i, '').trim() || p.name;
  if (p.kind === 'usb') {
    const d = O('printer', name, { model: p.driver || '', loc: pc.loc || '', status: 'active' });
    objs.push(d);
    rels.push({ id: 'r' + rid(), from: d.id, to: pc.id, kind: 'attached', port: null, vlan: null });
    hist(d, now(), `Added by ${who()} from the printers Lansweeper found on ${pc.name} (USB), attached to it`);
    hist(pc, now(), `USB printer ${p.name} added as a device by ${who()}, attached here`);
    return d;
  }
  const d = O('printer', name, { model: p.driver || '', status: 'active', ...(p.kind === 'ip' ? { ip: p.ip } : {}) });
  objs.push(d);
  hist(d, now(), `Added by ${who()} from the printers Lansweeper found on ${pc.name} (${p.kind === 'share' ? `shared by ${p.host}` : p.kind === 'ip' ? `at ${p.ip}` : 'on the network'})`);
  return d;
}
/* Add as device on a computer's Printers panel. */
export function bindPrinters(o){
  $('#view').querySelectorAll('[data-prnadd]').forEach(b => b.addEventListener('click', () => {
    const p = (o.lsPrinters || [])[+(/** @type {HTMLElement} */ (b).dataset.prnadd)]; if (!p) return;
    const d = addPrinterDevice(p, o);
    queueServerSave(); toast(p.kind === 'usb' ? `${d.name} added, attached to ${o.name}` : `${d.name} added`); render();
  }));
}
