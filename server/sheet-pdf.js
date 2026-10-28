/* An entry sheet as a PDF (A4), laid out like the printed sheet: the company's logo and name, the person, the initial
   password while the kept sheet has it, the devices handed out, a note and the signature lines. */
import { dateText } from '../public/js/dates.js';
import PDFDocument from 'pdfkit';

const M = 50, W = 595.28 - 2 * M;   /* A4 width, margins */
const day = dateText;
/* The person's title, office, manager and e-mail, when the directory or Entra gave them. */
const SHEET_PROFILE = [['title', 'Title'], ['office', 'Office'], ['manager', 'Manager'], ['mail', 'E-mail']];

/* The NOBS mark, drawn: a rounded square with the three faces of a box. Used when no company logo is set. */
function nobsMark(doc, x, y, s) {
  const k = s / 32;
  doc.save().roundedRect(x, y, s, s, 8 * k).fill('#5563e8');
  doc.polygon([x + 16 * k, y + 6.5 * k], [x + 24.5 * k, y + 11.2 * k], [x + 16 * k, y + 16 * k], [x + 7.5 * k, y + 11.2 * k]).fill('#ffffff');
  doc.fillOpacity(0.62).polygon([x + 7.5 * k, y + 11.2 * k], [x + 16 * k, y + 16 * k], [x + 16 * k, y + 25.5 * k], [x + 7.5 * k, y + 20.7 * k]).fill('#ffffff');
  doc.fillOpacity(0.34).polygon([x + 24.5 * k, y + 11.2 * k], [x + 16 * k, y + 16 * k], [x + 16 * k, y + 25.5 * k], [x + 24.5 * k, y + 20.7 * k]).fill('#ffffff');
  doc.restore();
}

export function sheetPdf(sheet, company = {}, { compress = true } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: M, compress, info: { Title: `Entry sheet ${sheet.person.name}`, Author: company.name || 'NOBS Inventory' } });
    const parts = [];
    doc.on('data', b => parts.push(b)); doc.on('end', () => resolve(Buffer.concat(parts))); doc.on('error', reject);
    const bottom = () => doc.page.height - M;
    const need = h => { if (doc.y + h > bottom()) doc.addPage(); };
    const heading = t => { need(40); doc.moveDown(0.8).font('Helvetica-Bold').fontSize(10).fillColor('#333').text(t.toUpperCase(), M, doc.y, { characterSpacing: 0.5 }).moveDown(0.3); };

    /* Header: the logo on its own line, then the company name and the title from the left margin, as the section titles;
       issued date and by on the right of the title. */
    let top = M;
    if (company.logo) {
      try { doc.image(Buffer.from(company.logo.split(',')[1], 'base64'), M, M, { fit: [180, 48], align: 'left', valign: 'top' }); top = M + 58; } catch { top = M; }
    }
    if (top === M) { nobsMark(doc, M, M, 34); top = M + 44; }
    doc.font('Helvetica').fontSize(10).fillColor('#444').text(company.name || 'NOBS Inventory', M, top, { width: W - 160 });
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111').text('Entry sheet', M, top + 13, { width: W - 160 });
    doc.font('Helvetica').fontSize(9).fillColor('#444').text(`Issued ${day(sheet.issued)}\nby ${sheet.by}`, M + W - 150, top + 14, { width: 150, align: 'right' });
    doc.moveTo(M, top + 42).lineTo(M + W, top + 42).lineWidth(1.5).strokeColor('#111').stroke();
    doc.y = top + 48;

    heading('Person');
    for (const [k, v] of [['Name', sheet.person.name], ['Department', sheet.person.dept || '-'], ...SHEET_PROFILE.filter(([f]) => sheet.person[f]).map(([f, l]) => [l, sheet.person[f]]), ['Windows sign-in name', sheet.login]]) {
      const y = doc.y;
      doc.font('Helvetica').fontSize(10).fillColor('#555').text(k, M, y, { width: 150 });
      doc.font('Helvetica-Bold').fillColor('#111').text(v, M + 160, y, { width: W - 160 });
      doc.moveDown(0.25);
    }

    heading('Sign-in');
    if (sheet.password) {
      need(80);
      const y = doc.y;
      doc.roundedRect(M, y, W, 74, 5).lineWidth(1.5).strokeColor('#111').stroke();
      doc.font('Helvetica').fontSize(9).fillColor('#222').text('Initial password of your Windows account', M + 12, y + 9);
      doc.font('Courier-Bold').fontSize(18).fillColor('#111').text(sheet.password, M + 12, y + 23, { characterSpacing: 1 });
      doc.font('Helvetica').fontSize(8.5).fillColor('#222').text('Windows asks you to choose your own password when you first sign in. Keep this sheet private and do not write your new password on it.', M + 12, y + 47, { width: W - 24 });
      doc.y = y + 80;
    } else {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor('#555').text(`The initial password is no longer on this copy of the sheet. It has been changed, or ${sheet.passwordDays || 14} days have passed. IT can set a new one.`, M, doc.y, { width: W });
    }

    heading('Devices handed out');
    if (sheet.devices.length) {
      const cols = [['Inventory no.', 0.17], ['Type', 0.17], ['Name', 0.2], ['Model', 0.26], ['Serial number', 0.2]].map(([t, f]) => [t, f * W]);
      const row = (cells, head) => {
        doc.font(head ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
        const h = Math.max(...cells.map((c, i) => doc.heightOfString(c || ' ', { width: cols[i][1] - 10 }))) + 10;
        need(h);
        const y = doc.y;
        let x = M;
        cells.forEach((c, i) => {
          if (head) doc.rect(x, y, cols[i][1], h).fill('#eeeeee');
          doc.rect(x, y, cols[i][1], h).lineWidth(0.6).strokeColor('#999').stroke();
          doc.fillColor('#111').text(c || '', x + 5, y + 5, { width: cols[i][1] - 10 });
          x += cols[i][1];
        });
        doc.y = y + h;
      };
      row(cols.map(c => c[0]), true);
      for (const d of sheet.devices) row([d.code, d.type, d.name, d.model, d.serial]);
    } else doc.font('Helvetica-Oblique').fontSize(10).fillColor('#555').text('No devices are handed out with this sheet.', M, doc.y);

    if (sheet.note) {
      heading('Note');
      doc.font('Helvetica').fontSize(10).fillColor('#111').text(sheet.note, M + 10, doc.y, { width: W - 10 });
    }
    need(110);
    doc.moveDown(1.2).font('Helvetica').fontSize(10).fillColor('#111')
      .text('I have received the devices listed above in working order. I will look after them and give them back when I leave or when IT asks.', M, doc.y, { width: W });
    const y = doc.y + 46, half = (W - 32) / 2;
    doc.moveTo(M, y).lineTo(M + half, y).moveTo(M + half + 32, y).lineTo(M + W, y).lineWidth(0.8).strokeColor('#111').stroke();
    doc.font('Helvetica').fontSize(9).fillColor('#444').text(`Date, signature of ${sheet.person.name}`, M, y + 4, { width: half })
      .text('Date, signature of IT', M + half + 32, y + 4, { width: half });
    doc.end();
  });
}
