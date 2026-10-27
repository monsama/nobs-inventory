/* CSV as spreadsheets write it: quoted cells may hold the delimiter, quotes and line breaks. Shared by the page (CSV
   import) and the server (Lansweeper report files). */
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  /* The delimiter is the one the header line uses most of (semicolon, comma or tab, as Excel's "Unicode text" writes),
     so a semicolon inside an unquoted value does not split it. */
  const head = text.split(/\r?\n/)[0] || '';
  const count = c => head.split(c).length - 1;
  const delim = [';', ',', '\t'].reduce((best, c) => count(c) > count(best) ? c : best, ',');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
