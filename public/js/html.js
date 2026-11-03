/* HTML from a template, safe by default: html`<b>${name}</b>` escapes every value put in, so a name can never become
   markup. What html`` itself made (or a list of those) goes in as it is, so templates nest; rawHtml() marks HTML that
   is known to be safe, such as an icon. null, undefined and false give nothing, so ${cond && html`…`} works. The result
   turns into its text wherever a string is wanted (innerHTML, a template string). No DOM: the tests use it too. */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escText = s => s.replace(/[&<>"']/g, c => ESC[c]);

export class Html {
  constructor(text){ this.text = text; }
  toString(){ return this.text; }
}
const part = v => v instanceof Html ? v.text : Array.isArray(v) ? v.map(part).join('') : v == null || v === false ? '' : escText(String(v));

/** @param {TemplateStringsArray} strings @param {...any} values @returns {Html} */
export function html(strings, ...values){
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new Html(out);
}
/** HTML that is known to be safe (made by the app, never from data). @param {string} text */
export const rawHtml = text => new Html(String(text));
