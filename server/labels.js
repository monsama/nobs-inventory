/* Labels to stick on the devices: a QR code and the inventory number, the name and the serial number, as a PDF on
   sheets of labels (A4) or one label per page for a label printer. The QR code holds the address of the device in the
   inventory (…/?o=INV-0001): a phone camera opens it, and the stocktake reads it as the inventory number. Drawn as
   vector squares, so it prints sharp at any size. */
import PDFDocument from 'pdfkit';
import qrcode from 'qrcode-generator';
import { unicodeFonts } from './pdf-fonts.js';

const MM = 72 / 25.4;
/* [name, page width and height (mm, null: the label itself), columns, rows, label width and height, left and top
   margin, gaps between columns and rows]. */
export const LABEL_FORMATS = {
  'a4-24': ['A4, 24 labels 70 × 37 mm (e.g. Avery 3474)', [210, 297], 3, 8, 70, 37, 0, 0.5, 0, 0],
  'a4-40': ['A4, 40 labels 52.5 × 29.7 mm (e.g. Avery 3651)', [210, 297], 4, 10, 52.5, 29.7, 0, 0, 0, 0],
  'a4-65': ['A4, 65 labels 38.1 × 21.2 mm (e.g. Avery L7651)', [210, 297], 5, 13, 38.1, 21.2, 4.7, 10.7, 2.5, 0],
  'roll-62x29': ['Label printer, 62 × 29 mm (e.g. Brother DK-11209)', null, 1, 1, 62, 29, 0, 0, 0, 0],
};

/* The address a label's QR code holds: the inventory's address with the device's inventory number (or its id). */
export const labelLink = (base, o) => `${String(base).replace(/\/+$/, '')}/?o=${encodeURIComponent(o.code || o.id)}`;

function drawQr(doc, text, x, y, size) {
  const q = qrcode(0, 'M'); q.addData(text, 'Byte'); q.make();
  const n = q.getModuleCount(), quiet = 1, cell = size / (n + quiet * 2);
  doc.save().fillColor('#000');
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) doc.rect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell + 0.02, cell + 0.02);
  doc.fill().restore();
}

/* devices: [{ id, code, name, serial }]; skip: labels already used on the first sheet. */
export function labelsPdf(devices, { format = 'a4-24', base, company = '', skip = 0 } = {}) {
  const f = LABEL_FORMATS[format] || LABEL_FORMATS['a4-24'];
  const [, page, cols, rows, lw, lh, ml, mt, gx, gy] = f;
  const per = cols * rows;
  return new Promise((resolve, reject) => {
    const doc = unicodeFonts(new PDFDocument({ size: page ? [page[0] * MM, page[1] * MM] : [lw * MM, lh * MM], margin: 0, autoFirstPage: false, info: { Title: 'Device labels', Author: company || 'NOBS Inventory' } }));
    const parts = [];
    doc.on('data', b => parts.push(b)); doc.on('end', () => resolve(Buffer.concat(parts))); doc.on('error', reject);
    const start = page ? Math.max(0, Math.min(per - 1, Math.floor(Number(skip) || 0))) : 0;
    devices.forEach((o, i) => {
      const k = i + start, at = k % per;
      if (at === 0 || i === 0) doc.addPage();
      const x = (ml + (at % cols) * (lw + gx)) * MM, y = (mt + Math.floor(at / cols) * (lh + gy)) * MM, w = lw * MM, h = lh * MM;
      const pad = Math.min(2.5, lh * 0.08) * MM, qs = h - pad * 2;
      drawQr(doc, labelLink(base, o), x + pad, y + pad, qs);
      const tx = x + pad + qs + pad * 0.6, tw = w - (tx - x) - pad;
      const big = Math.max(6, Math.min(11, lh * 0.33)), small = Math.max(4.5, big * 0.62);
      let ty = y + pad + 1;
      if (company && lh >= 25) { doc.font('Helvetica').fontSize(small).fillColor('#555').text(company, tx, ty, { width: tw, height: small * 1.3, ellipsis: true, lineBreak: false }); ty += small * 1.5; }
      doc.font('Helvetica-Bold').fontSize(big).fillColor('#000').text(o.code || '—', tx, ty, { width: tw, height: big * 1.3, ellipsis: true, lineBreak: false }); ty += big * 1.35;
      doc.font('Helvetica').fontSize(small * 1.1).fillColor('#111').text(o.name || '', tx, ty, { width: tw, height: small * 1.4, ellipsis: true, lineBreak: false }); ty += small * 1.5;
      if (o.serial && ty + small < y + h - pad) doc.font('Helvetica').fontSize(small).fillColor('#444').text(`S/N ${o.serial}`, tx, ty, { width: tw, height: small * 1.3, ellipsis: true, lineBreak: false });
    });
    if (!devices.length) doc.addPage();
    doc.end();
  });
}
