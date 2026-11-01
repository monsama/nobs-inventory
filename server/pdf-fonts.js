/* PDFs are written with the standard fonts (Helvetica, Courier), which have only the Western European letters. A text
   with other letters (Polish, Czech, Greek, Cyrillic …) is written with DejaVu Sans instead, bundled here
   (server/fonts, its licence beside it), so a name like "Łukasz Dvořák" prints as it is and not as "?ukasz Dvo?ák".
   Text in only Western letters keeps the standard font, so most PDFs look as before. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts');
const UNI = {
  Helvetica: 'DejaVuSans.ttf', 'Helvetica-Oblique': 'DejaVuSans.ttf',
  'Helvetica-Bold': 'DejaVuSans-Bold.ttf', 'Courier-Bold': 'DejaVuSansMono-Bold.ttf',
};
/* What the standard fonts can write (WinAnsi): ASCII, Latin-1 and a few more. */
const OTHER = /[^\n\r\t\x20-\x7e\xa0-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/;
export const needsUnicode = t => OTHER.test(String(t ?? ''));

/* Makes doc switch to the Unicode font for each text (and its measuring) that needs it, and back after. */
export function unicodeFonts(doc) {
  let cur = 'Helvetica';
  const font = doc.font.bind(doc);
  doc.font = (name, ...rest) => { if (typeof name === 'string' && !name.endsWith('.ttf')) cur = name; return font(name, ...rest); };
  let inside = false;   /* pdfkit measures each word of a text with widthOfString: that stays in the font chosen */
  const around = (fn) => function (t, ...rest) {
    if (inside || !UNI[cur] || !needsUnicode(t)) return fn.call(doc, t, ...rest);
    const was = cur;
    font(path.join(DIR, UNI[was])); inside = true;
    try { return fn.call(doc, t, ...rest); } finally { inside = false; font(was); }
  };
  for (const k of ['text', 'widthOfString', 'heightOfString']) doc[k] = around(doc[k]);
  return doc;
}
