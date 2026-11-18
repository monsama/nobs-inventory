/* Print the list on screen: the devices the filters leave, as cards or as a table, in a page of its own made for paper
   (light, no buttons), with what was filtered and when. The browser's print dialog also saves it as a PDF. */
import { $, filtered, menuHtml, relIndex, st, toast } from './01-core.js';
import { cardHtml, listHead, sortCards } from './views-cards.js';
import { tablePrintData } from './views-table.js';
import { html, rawHtml } from './html.js';

/* The Print menu of the Cards and Table toolbars. */
export const printMenuHtml = () => menuHtml('<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/></svg>Print', String(html`
  <button type="button" data-print="cards">As a list<span class="muted">, the devices shown</span></button>
  <button type="button" data-print="table">As a table<span class="muted">, the columns of the Table</span></button>`), { id: 'printMenu' });
export function bindPrintMenu(){
  document.querySelectorAll('#printMenu [data-print]').forEach(b => b.addEventListener('click', () => {
    const box = /** @type {HTMLElement|null} */ ($('#printMenu .menubox')); if (box) try { box.hidePopover(); } catch { /* not open */ }
    printView(/** @type {HTMLElement} */ (b).dataset.print);
  }));
}

/* What narrows the list, as the bar above it says it ("Type: PC · Entra / Intune: Not in Intune"). */
const filterText = () => [...document.querySelectorAll('#fbar .fchip')].map(c => c.textContent.replace(/×\s*$/, '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ');

export function printView(kind){
  const w = window.open('', '_blank');
  if (!w){ toast('The browser blocked the print window. Allow pop-ups for this page and try again.'); return; }
  const what = st.scope === 'review' ? 'Pending devices' : st.scope ? 'Ignored devices' : 'Devices';
  const filters = filterText();
  let body, n;
  if (kind === 'table'){
    const t = tablePrintData(); n = t.rows.length;
    body = html`<table class="pv-table"><thead><tr>${t.head.map(h => html`<th>${h}</th>`)}</tr></thead><tbody>${t.rows.map(r => html`<tr>${r.map(v => html`<td>${v}</td>`)}</tr>`)}</tbody></table>`;
  } else {
    const list = sortCards(filtered()), idx = relIndex(); n = list.length;
    /* The rows as on screen, the name as text (no buttons on paper). */
    body = html`<div id="cards" class="lst pv-list${st.scope ? ' pend' : ''}">${rawHtml(String(listHead(!!st.scope, false)))}${list.map(o => rawHtml(cardHtml(o, idx, false).replace(/<button type="button" class="nm card-open"[^>]*>([\s\S]*?)<\/button>/, '<span class="nm">$1</span>')))}</div>`;
  }
  const css = new URL('css/app.css', location.href).href;
  w.document.open();
  w.document.write(String(html`<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><title>${what}${filters ? ' · ' + filters : ''}</title><link rel="stylesheet" href="${css}">
    <style>
      body{background:#fff;color:#111;padding:14px;height:auto;overflow:visible;display:block}
      .pv-head{margin:0 0 10px}.pv-head h2{margin:0 0 2px;font-size:18px}.pv-head p{margin:0;color:#555;font-size:12px}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      /* The list made for paper: small type, no ticks or buttons, the heading on every page. */
      .pv-list{margin:0!important;border:1px solid #bbb!important;overflow:visible!important}
      .pv-list .lhead{position:static!important;background:#f0f0f0!important;color:#333!important}
      .pv-list .lrow,.pv-list .lhead{gap:8px!important;padding:0 6px!important;font-size:9.5px!important;min-height:22px!important;grid-template-columns:0 14px minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.4fr) 80px minmax(0,1fr) minmax(0,1fr) 62px!important}
      .pv-list.pend .lrow,.pv-list.pend .lhead{grid-template-columns:0 14px minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.2fr) 80px 70px minmax(0,1.4fr) 62px 0!important}
      .pv-list .lrow{break-inside:avoid;border-top:1px solid #ddd!important}
      .pv-list .lrow>span{white-space:normal!important;overflow-wrap:anywhere}
      .pv-list .chip{font-size:8.5px;padding:0 4px;line-height:14px;height:auto}
      .pv-list button,.pv-list .cardtick,.pv-list .rv-acts{display:none!important}
      .pv-list .lh-sort{display:inline!important}
      .pv-table{border-collapse:collapse;width:100%;font-size:10.5px}
      .pv-table th,.pv-table td{border:1px solid #ccc;padding:3px 5px;text-align:left;vertical-align:top}
      .pv-table th{background:#f0f0f0}.pv-table thead{display:table-header-group}.pv-table tr{break-inside:avoid}
      @media print{body{padding:0}@page{margin:8mm${kind === 'table' ? ';size:landscape' : ''}}
}
    </style></head>
    <body><div class="pv-head"><h2>${what}</h2><p>${n} ${n === 1 ? 'device' : 'devices'}${filters ? ' · ' + filters : ''} · printed ${new Date().toLocaleString()}</p></div>${body}</body></html>`));
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* the window was closed */ } }, 400);
}
