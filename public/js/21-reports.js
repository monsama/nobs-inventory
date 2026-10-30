/* Reports, from the Overview: which one, how it is grouped or for which year, and the file to get (PDF to print or
   pass on, Excel to work on). The server makes the file from what is saved (public/js/reports.js). */
import { $, esc } from './01-core.js';
import { closeModal, modal } from './19-modal.js';
import { flushSave } from './07-render.js';
import { GROUPS, REPORTS } from './reports.js';

let last = { kind: 'inventory', group: 'site', years: 5, year: new Date().getFullYear() };

export function reportsModal(){
  const y = new Date().getFullYear();
  modal(`<div class="mh">Reports</div>
    <div class="mb"><fieldset class="rp-kinds"><legend class="sr-only">Report</legend>${Object.entries(REPORTS).map(([k, [name, what]]) => `<label class="rp-kind"><input type="radio" name="rpKind" value="${k}" ${k === last.kind ? 'checked' : ''}><span><b>${esc(name)}</b><small>${esc(what)}</small></span></label>`).join('')}</fieldset>
      <div class="rp-opts">
        <label class="rp-opt" data-for="inventory">Grouped by <select id="rpGroup">${Object.entries(GROUPS).map(([k, l]) => `<option value="${k}" ${k === last.group ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label class="rp-opt" data-for="lifecycle">Replace after <input id="rpYears" type="number" min="1" max="15" value="${last.years}" style="width:64px"> years from purchase</label>
        <label class="rp-opt" data-for="costs">Year <select id="rpYear">${[y - 2, y - 1, y, y + 1].map(n => `<option ${n === last.year ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <p class="note">Made from what is saved now. The PDF is ready to print or pass on; the Excel file has one row per entry, with filters, to sort and sum.</p></div>
    <div class="mf"><button id="rpCancel">Close</button><span class="grow"></span><a class="btnlike" id="rpXlsx" href="#" download>Excel</a><a class="btnlike primary" id="rpPdf" href="#" download>PDF</a></div>`);
  const kind = () => document.querySelector('[name=rpKind]:checked').value;
  const sync = () => {
    last = { kind: kind(), group: $('#rpGroup').value, years: Math.min(15, Math.max(1, Number($('#rpYears').value) || 5)), year: Number($('#rpYear').value) };
    document.querySelectorAll('.rp-opt').forEach(o => { o.hidden = o.dataset.for !== last.kind; });
    const q = new URLSearchParams({ group: last.group, years: last.years, year: last.year });
    $('#rpPdf').href = `api/reports/${last.kind}?${q}&format=pdf`;
    $('#rpXlsx').href = `api/reports/${last.kind}?${q}&format=xlsx`;
  };
  document.querySelectorAll('[name=rpKind], #rpGroup, #rpYears, #rpYear').forEach(el => { el.onchange = sync; el.oninput = sync; });
  /* What is still being saved goes first, so the report has it. */
  ['#rpPdf', '#rpXlsx'].forEach(id => $(id).addEventListener('click', () => { flushSave(); }));
  $('#rpCancel').onclick = closeModal;
  sync();
}
