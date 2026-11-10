/* Print the list on screen: the devices the filters leave, as cards or as a table, in a page of its own made for paper
   (light, no buttons), with what was filtered and when. The browser's print dialog also saves it as a PDF. */
import { $, filtered, menuHtml, relIndex, st, toast } from './01-core.js';
import { cardHtml, showJoin } from './views-cards.js';
import { tablePrintData } from './views-table.js';
import { html, rawHtml } from './html.js';

/* The Print menu of the Cards and Table toolbars. */
export const printMenuHtml = () => menuHtml('<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/></svg>Print', String(html`
  <button type="button" data-print="cards">As cards<span class="muted">, the devices shown</span></button>
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
  const what = st.scope === 'review' ? 'Devices waiting for review' : st.scope ? 'Ignored devices' : 'Devices';
  const filters = filterText();
  let body, n;
  if (kind === 'table'){
    const t = tablePrintData(); n = t.rows.length;
    body = html`<table class="pv-table"><thead><tr>${t.head.map(h => html`<th>${h}</th>`)}</tr></thead><tbody>${t.rows.map(r => html`<tr>${r.map(v => html`<td>${v}</td>`)}</tr>`)}</tbody></table>`;
  } else {
    const list = filtered(), idx = relIndex(), join = showJoin(); n = list.length;
    body = html`<div id="cards" class="pv-cards">${list.map(o => rawHtml(cardHtml(o, idx, join).replace(/<button type="button" class="nm card-open"[^>]*>([\s\S]*?)<\/button>/, '<span class="nm">$1</span>')))}</div>`;
  }
  const css = new URL('css/app.css', location.href).href;
  w.document.open();
  w.document.write(String(html`<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><title>${what}${filters ? ' · ' + filters : ''}</title><link rel="stylesheet" href="${css}">
    <style>
      body{background:#fff;color:#111;padding:14px;height:auto;overflow:visible;display:block}
      .pv-head{margin:0 0 10px}.pv-head h2{margin:0 0 2px;font-size:18px}.pv-head p{margin:0;color:#555;font-size:12px}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      /* Cards made for paper: small type, nothing cut off with an ellipsis. Three to a row on a page upright (portrait),
         four on a page on its side (landscape); on screen, as many as the window takes. */
      .pv-cards{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))!important;gap:5px!important;padding:0!important;overflow:visible!important;align-items:start}
      .pv-cards .card{content-visibility:visible!important;break-inside:avoid;page-break-inside:avoid;box-shadow:none!important;border:1px solid #bbb!important;border-radius:5px!important;background:#fff!important;cursor:default;font-size:9.5px;height:auto!important;min-height:0!important}
      .pv-cards .card .ch{padding:4px 6px!important;gap:5px}
      .pv-cards .card .ch .tico{width:18px;height:18px}
      .pv-cards .card .nm{font-size:10.5px;white-space:normal;overflow-wrap:anywhere}
      .pv-cards .card .model{font-size:9px;white-space:normal;display:block!important;-webkit-line-clamp:unset;overflow:visible}
      .pv-cards .card .chip{font-size:8.5px;padding:0 5px;line-height:15px;height:auto}
      .pv-cards .card .kv{padding:4px 6px!important;gap:1px 6px;font-size:9.5px;grid-template-columns:58px minmax(0,1fr)}
      .pv-cards .card .kv dt{overflow-wrap:anywhere}
      .pv-cards .card .kv dt,.pv-cards .card .kv dd{line-height:1.3}
      .pv-cards .card .kv dd{display:block!important;-webkit-line-clamp:unset;overflow:visible;white-space:normal}
      .pv-cards .card .jbar{padding:3px 6px!important;gap:3px}
      .pv-cards .card .jb{font-size:8.5px;padding:1px 3px;min-height:0;height:auto}
      .pv-cards .card .cf{flex-wrap:nowrap;align-items:center;min-height:0!important;padding:3px 6px!important;gap:6px;font-size:8.5px}
      .pv-cards .card .cf .code{font-size:8.5px}
      .pv-cards .card .cf .chip,.pv-cards .card .cf>span{flex:1 1 auto;min-width:0;max-width:none!important;overflow:visible!important;white-space:normal!important;text-overflow:clip!important}
      .pv-cards .card .cf .chip{line-height:1.25;padding:1px 5px}
      .pv-cards .card button,.pv-cards .card input,.pv-cards .card .rv-acts,.pv-cards .card .cselect,.pv-cards .card .pick,.pv-cards .card .cardtick{display:none!important}
      .pv-table{border-collapse:collapse;width:100%;font-size:10.5px}
      .pv-table th,.pv-table td{border:1px solid #ccc;padding:3px 5px;text-align:left;vertical-align:top}
      .pv-table th{background:#f0f0f0}.pv-table thead{display:table-header-group}.pv-table tr{break-inside:avoid}
      @media print{body{padding:0}@page{margin:8mm${kind === 'table' ? ';size:landscape' : ''}}
        .pv-cards{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
      @media print and (orientation:landscape){.pv-cards{grid-template-columns:repeat(4,minmax(0,1fr))!important}}
    </style></head>
    <body><div class="pv-head"><h2>${what}</h2><p>${n} ${n === 1 ? 'device' : 'devices'}${filters ? ' · ' + filters : ''} · printed ${new Date().toLocaleString()}</p></div>${body}</body></html>`));
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* the window was closed */ } }, 400);
}
