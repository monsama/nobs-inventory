import zlib from 'node:zlib';

/* The text drawn on a PDF made with pdfkit: its streams unpacked, and the hex strings of each text operation joined
   (kerning splits a word into several). Enough for tests; not a PDF reader. */
export function pdfText(buf) {
  const raw = buf.toString('latin1'), out = [];
  for (let i = raw.indexOf('stream'); i >= 0; i = raw.indexOf('stream', i + 6)) {
    if (raw.slice(i - 3, i) === 'end') continue;
    const start = raw[i + 6] === '\r' ? i + 8 : i + 7, end = raw.indexOf('endstream', start);
    const body = Buffer.from(raw.slice(start, end), 'latin1');
    let text; try { text = zlib.inflateSync(body).toString('latin1'); } catch { text = body.toString('latin1'); }
    for (const m of text.matchAll(/\[(.*?)\]\s*TJ|<([0-9a-f]+)>\s*Tj/g)) {
      const hex = m[1] ? [...m[1].matchAll(/<([0-9a-f]+)>/g)].map(x => x[1]).join('') : m[2];
      out.push(Buffer.from(hex, 'hex').toString('latin1'));
    }
  }
  return out.join('\n');
}
