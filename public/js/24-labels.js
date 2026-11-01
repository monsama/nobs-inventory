/* Labels for devices: which sheet of labels (or a label printer), where on a sheet already partly used to start, and
   the PDF. The server makes it from what is saved (server/labels.js); each label's QR code opens the device. */
import { $, esc, toast } from './01-core.js';
import { closeModal, modal } from './19-modal.js';
import { flushSave } from './07-render.js';

const FORMATS = {
  'a4-24': ['A4, 24 labels 70 × 37 mm (e.g. Avery 3474)', 24],
  'a4-40': ['A4, 40 labels 52.5 × 29.7 mm (e.g. Avery 3651)', 40],
  'a4-65': ['A4, 65 labels 38.1 × 21.2 mm (e.g. Avery L7651)', 65],
  'roll-62x29': ['Label printer, 62 × 29 mm (e.g. Brother DK-11209)', 1],
};
const kept = () => { try { const f = localStorage.getItem('ni-label-format'); return FORMATS[f] ? f : 'a4-24'; } catch { return 'a4-24'; } };

export function labelsModal(ids){
  const n = ids.length;
  modal(`<div class="mh">Labels for ${n} ${n === 1 ? 'device' : 'devices'}</div>
    <div class="mb"><p class="note">Each label has a QR code, the inventory number, the name and the serial number. The QR code opens the device here when scanned with a phone, and a stocktake reads it.</p>
      <div class="form" style="padding:0">
        <label for="lbFormat">Labels</label><select id="lbFormat">${Object.entries(FORMATS).map(([k, [l]]) => `<option value="${k}" ${k === kept() ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <label for="lbSkip" class="lb-sheet">Start at label</label><div class="lb-sheet"><input id="lbSkip" type="number" min="1" value="1" style="width:80px" aria-describedby="lbSkipNote"> <span class="note" id="lbSkipNote">On a sheet already partly used: the first free label, counted across then down.</span></div>
      </div><span class="note" id="lbErr" role="status"></span></div>
    <div class="mf"><button id="lbCancel">Close</button><span class="grow"></span><button id="lbPdf" class="primary">Download PDF</button></div>`, 'sm');
  const sync = () => {
    const per = FORMATS[$('#lbFormat').value][1];
    document.querySelectorAll('.lb-sheet').forEach(e => { e.hidden = per === 1; });
    $('#lbSkip').max = String(per);
  };
  $('#lbFormat').onchange = () => { try { localStorage.setItem('ni-label-format', $('#lbFormat').value); } catch { /* not kept */ } sync(); };
  $('#lbCancel').onclick = closeModal;
  $('#lbPdf').onclick = async () => {
    const b = $('#lbPdf'); b.disabled = true; $('#lbErr').textContent = '';
    try {
      await flushSave();
      const r = await fetch('api/labels', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, format: $('#lbFormat').value, skip: Math.max(0, (Number($('#lbSkip').value) || 1) - 1) }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'The labels could not be made.');
      const name = (/filename="?([^";]+)"?/.exec(r.headers.get('content-disposition') || '') || [])[1] || 'labels.pdf';
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await r.blob()), download: name });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      toast(`Labels for ${n} ${n === 1 ? 'device' : 'devices'} ready`);
    } catch (e) { $('#lbErr').textContent = e.message; } finally { b.disabled = false; }
  };
  sync();
}
