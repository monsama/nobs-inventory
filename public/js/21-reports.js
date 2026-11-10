/* Reports, from the Overview: which one, how it is grouped or for which year, and the file to get (PDF to print or
   pass on, Excel to work on). The server makes the file from what is saved (public/js/reports.js). */
import { $$, $, objs, toast } from './01-core.js';
import { USERS } from './04-settings.js';
import { closeModal, modal } from './19-modal.js';
import { flushSave } from './07-render.js';
import { html } from './html.js';
import { GROUPS, REPORTS } from './reports.js';

let last = { kind: 'inventory', group: 'site', years: 5, year: new Date().getFullYear(), person: '' };
/* The hand-back list is picked here too, with its person; the inventory check report comes from the Inventory check view. */
const SHOWN = k => !REPORTS[k][2] || k === 'handback';

/* ids: the devices the Table lists now, to report on only those (the inventory and the lifecycle). */
export function reportsModal({ ids = null } = {}){
  const y = new Date().getFullYear();
  /* The people who have devices, for the hand-back list. */
  const held = new Map();
  for (const o of objs) if (o.uid && o.status !== 'retired' && !o.review) held.set(String(o.uid), (held.get(String(o.uid)) || 0) + 1);
  const people = USERS.filter(u => held.has(String(u.id))).sort((a, b) => a.name.localeCompare(b.name));
  modal(html`<div class="mh">Reports</div>
    <div class="mb"><fieldset class="rp-kinds"><legend class="sr-only">Report</legend>${Object.entries(REPORTS).filter(([k]) => SHOWN(k)).map(([k, [name, what]]) => html`<label class="rp-kind"><input type="radio" name="rpKind" value="${k}" ${k === last.kind ? 'checked' : ''}><span><b>${name}</b><small>${what}</small></span></label>`)}</fieldset>
      <div class="rp-opts">
        <label class="rp-opt" data-for="inventory">Grouped by <select id="rpGroup">${Object.entries(GROUPS).map(([k, l]) => html`<option value="${k}" ${k === last.group ? 'selected' : ''}>${l}</option>`)}</select></label>
        <label class="rp-opt" data-for="lifecycle">Replace after <input id="rpYears" type="number" min="1" max="15" value="${last.years}" style="width:64px"> years from purchase</label>
        <label class="rp-opt" data-for="handback">Person <select id="rpPerson"><option value="">Pick a person…</option>${people.map(u => html`<option value="${u.id}" ${String(u.id) === last.person ? 'selected' : ''}>${u.name} · ${held.get(String(u.id))} device${held.get(String(u.id)) === 1 ? '' : 's'}</option>`)}</select></label>
        ${ids ? html`<label class="rp-opt pchk" data-for="inventory lifecycle"><input type="checkbox" id="rpOnly" checked> Only the ${ids.length} device${ids.length === 1 ? '' : 's'} the Table lists now</label>` : ''}
        <label class="rp-opt" data-for="costs">Year <select id="rpYear">${[y - 2, y - 1, y, y + 1].map(n => html`<option ${n === last.year ? 'selected' : ''}>${n}</option>`)}</select></label>
      </div>
      <p class="note">Made from what is saved now. The PDF is ready to print or pass on; the Excel file has one row per entry, with filters, to sort and sum.</p></div>
    <div class="mf"><span class="grow"></span><button id="rpCancel">Close</button><a class="btnlike" id="rpXlsx" href="#" download>Excel</a><a class="btnlike primary" id="rpPdf" href="#" download>PDF</a></div>`);
  const kind = () => $('[name=rpKind]:checked').value;
  const sync = () => {
    last = { kind: kind(), group: $('#rpGroup').value, years: Math.min(15, Math.max(1, Number($('#rpYears').value) || 5)), year: Number($('#rpYear').value), person: $('#rpPerson').value };
    $$('.rp-opt').forEach(o => { o.hidden = !o.dataset.for.split(' ').includes(last.kind); });
    const q = new URLSearchParams({ group: last.group, years: String(last.years), year: String(last.year), ...(last.kind === 'handback' ? { id: last.person } : {}) });
    const off = last.kind === 'handback' && !last.person;
    ['#rpPdf', '#rpXlsx'].forEach(id => { $(id).classList.toggle('disabled', off); $(id).setAttribute('aria-disabled', off ? 'true' : 'false'); });
    $('#rpPdf').href = `api/reports/${last.kind}?${q}&format=pdf`;
    $('#rpXlsx').href = `api/reports/${last.kind}?${q}&format=xlsx`;
  };
  $$('[name=rpKind], #rpGroup, #rpYears, #rpYear, #rpPerson, #rpOnly').forEach(el => { el.onchange = sync; el.oninput = sync; });
  /* What is still being saved goes first, so the report has it. */
  /* Only the listed devices: their ids go in the body (too many for an address), and the file comes back as a download. */
  ['#rpPdf', '#rpXlsx'].forEach(id => $(id).addEventListener('click', async e => {
    if (last.kind === 'handback' && !last.person){ e.preventDefault(); $('#rpPerson').focus(); return; }
    const only = ids && $('#rpOnly') && $('#rpOnly').checked && ['inventory', 'lifecycle'].includes(last.kind);
    if (!only){ flushSave(); return; }
    e.preventDefault();
    await flushSave();
    try {
      const r = await fetch($(id).getAttribute('href'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }), credentials: 'same-origin' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'The report could not be made.');
      const name = (/filename="?([^";]+)"?/.exec(r.headers.get('content-disposition') || '') || [])[1] || 'report';
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await r.blob()), download: name });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (err) { toast(err.message); }
  }));
  $('#rpCancel').onclick = closeModal;
  sync();
}
