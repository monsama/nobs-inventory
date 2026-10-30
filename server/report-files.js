/* A report (public/js/reports.js) as a file: a PDF in A4 landscape, or an Excel workbook (.xlsx). The PDF has the
   company's name, the title and what the report holds, the groups with their rows and totals, the column heads on every
   page and the page numbers. The workbook is one sheet with a row of heads (fixed, with filters), the group as its first
   column, so it can be sorted, filtered and summed in Excel; numbers stay numbers. Written without any further library:
   the .xlsx is a small zip of XML files. */
import PDFDocument from 'pdfkit';
import zlib from 'node:zlib';

const M = 36, PW = 841.89, PH = 595.28, W = PW - 2 * M;   /* A4 landscape, margins */
const money = n => typeof n === 'number' ? n.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(n ?? '');
const cellText = (col, v) => col.money ? money(v) : typeof v === 'number' ? String(v) : String(v ?? '');

export function reportPdf(r, company = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: M, bufferPages: true, info: { Title: r.title, Author: company.name || 'NOBS Inventory' } });
    const chunks = [];
    doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const weights = r.columns.reduce((t, c) => t + (c.w || 1), 0);
    const widths = r.columns.map(c => (c.w || 1) / weights * W);
    const xs = widths.map((_, i) => M + widths.slice(0, i).reduce((t, w) => t + w, 0));
    const right = c => c.num || c.money;
    let y = M;
    const head = () => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569');
      r.columns.forEach((c, i) => doc.text(c.label, xs[i] + 2, y, { width: widths[i] - 4, align: right(c) ? 'right' : 'left', lineBreak: false, ellipsis: true }));
      y += 12; doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.6).strokeColor('#94a3b8').stroke(); y += 4;
    };
    const room = h => { if (y + h > PH - M - 18) { doc.addPage(); y = M; head(); } };
    /* Title block, then the heads. */
    doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(company.name || '', M, y, { width: W }); y += company.name ? 13 : 0;
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a').text(r.title, M, y, { width: W }); y += 24;
    doc.font('Helvetica').fontSize(9).fillColor('#475569').text(r.subtitle || '', M, y, { width: W }); y += 20;
    if (!r.groups.some(g => g.rows.length)) { doc.fontSize(10).fillColor('#0f172a').text('Nothing to list.', M, y); }
    else head();
    for (const g of r.groups) {
      if (!g.rows.length) continue;
      if (g.name) {
        room(30);
        y += 4; doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text(`${g.name}  `, M, y, { continued: true }).font('Helvetica').fontSize(8).fillColor('#64748b').text(`${g.rows.length}`);
        y += 15;
      }
      doc.font('Helvetica').fontSize(8).fillColor('#0f172a');
      g.rows.forEach((row, n) => {
        room(13);
        if (n % 2) doc.rect(M, y - 2, W, 13).fill('#f1f5f9').fillColor('#0f172a');
        r.columns.forEach((c, i) => doc.text(cellText(c, row[i]), xs[i] + 2, y, { width: widths[i] - 4, align: right(c) ? 'right' : 'left', lineBreak: false, ellipsis: true }));
        y += 13;
      });
      if (typeof g.total === 'number') {
        room(16); doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.4).strokeColor('#cbd5e1').stroke(); y += 3;
        const last = r.columns.length - 1;
        doc.font('Helvetica-Bold').fontSize(8).text(`Total ${g.name.toLowerCase()}`, M + 2, y, { width: xs[last] - M - 6 });
        doc.text(money(g.total), xs[last] + 2, y, { width: widths[last] - 4, align: 'right' }); y += 15;
      }
    }
    if (typeof r.total === 'number' && r.groups.length > 1) {
      room(20); y += 2; doc.moveTo(M, y).lineTo(M + W, y).lineWidth(1).strokeColor('#0f172a').stroke(); y += 4;
      const last = r.columns.length - 1;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(`Total${r.currency ? ` (${r.currency})` : ''}`, M + 2, y, { width: xs[last] - M - 6 });
      doc.text(money(r.total), xs[last] + 2, y, { width: widths[last] - 4, align: 'right' });
    }
    /* Page numbers, once every page is there. */
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.font('Helvetica').fontSize(7).fillColor('#94a3b8').text(`${r.title} · page ${i + 1} of ${range.count}`, M, PH - M - 4, { width: W, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

/* ---------- .xlsx ---------- */
/* Control characters are not allowed in XML: they are left out. */
const xml = v => [...String(v ?? '')].filter(ch => { const c = ch.charCodeAt(0); return c >= 32 || c === 9 || c === 10 || c === 13; }).join('').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = i => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
/* A zip of the files as they are (stored, not compressed): what an .xlsx is. */
function zip(files) {
  const parts = [], dir = [];
  let at = 0;
  for (const [name, text] of files) {
    const data = Buffer.from(text, 'utf8'), fn = Buffer.from(name, 'utf8'), crc = zlib.crc32(data) >>> 0;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fn.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(fn.length, 28);
    central.writeUInt32LE(at, 42);
    parts.push(local, fn, data); dir.push(central, fn);
    at += 30 + fn.length + data.length;
  }
  const size = dir.reduce((t, b) => t + b.length, 0);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(at, 16);
  return Buffer.concat([...parts, ...dir, end]);
}
export function reportXlsx(r) {
  const groupLabel = { Inventory: 'Group' }[r.title] || 'Group';
  const cols = [...(r.groups.some(g => g.name) ? [{ label: groupLabel, w: 1.4, group: true }] : []), ...r.columns];
  const hasGroup = cols[0].group;
  const cell = (ref, v, col, style = 0) => {
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${col && col.money ? 2 : style}"><v>${v}</v></c>`;
    if (v === '' || v == null) return '';
    return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  };
  const rows = [`<row r="1">${cols.map((c, i) => cell(`${colName(i)}1`, c.label, null, 1)).join('')}</row>`];
  let n = 1;
  for (const g of r.groups) for (const row of g.rows) {
    n++;
    const vals = hasGroup ? [g.name, ...row] : row;
    rows.push(`<row r="${n}">${vals.map((v, i) => cell(`${colName(i)}${n}`, v, cols[i])).join('')}</row>`);
  }
  if (typeof r.total === 'number') {
    n += 2;
    const last = cols.length - 1;
    rows.push(`<row r="${n}">${cell(`A${n}`, `Total${r.currency ? ` (${r.currency})` : ''}`, null, 1)}<c r="${colName(last)}${n}" s="3"><f>SUM(${colName(last)}2:${colName(last)}${n - 2})</f><v>${r.total}</v></c></row>`);
  }
  const widths = cols.map((c, i) => Math.min(60, Math.max(10, c.label.length + 2, ...r.groups.flatMap(g => g.rows.map(row => String((hasGroup ? [g.name, ...row] : row)[i] ?? '').length + 2)).slice(0, 2000))));
  const lastRef = `${colName(cols.length - 1)}${Math.max(1, r.groups.reduce((t, g) => t + g.rows.length, 0) + 1)}`;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rows.join('')}</sheetData><autoFilter ref="A1:${lastRef}"/></worksheet>`;
  const name = xml(r.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${name.replace(/'/g, "''")}'!$A$1:$${lastRef.replace(/(\d+)$/, '$$$1')}</definedName></definedNames></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', sheet],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
  ]);
}
