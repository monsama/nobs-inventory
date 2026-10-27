/* Serial numbers a maker leaves unset ("To be filled by O.E.M.", "Default string", "System Serial Number"): many machines
   share them, so they never say two records are one device. Shared by the page (the address note) and the server
   (matching what Lansweeper sends), which treats such a serial as none. */
const PLACEHOLDER = /^(to be filled( by o\.?e\.?m\.?)?|default string|system serial( number)?|chassis serial( number)?|base board serial( number)?|not specified|not applicable|not available|none|null|unknown|n\/?a|o\.?e\.?m\.?|0+|f+|x+|1234567(89)?|123456789(0)?|serial|serial number|invalid|empty|-+)$/i;
export const isPlaceholderSerial = v => {
  const t = String(v ?? '').trim().replace(/[\s.:;,_-]+$/, '');
  return !t || PLACEHOLDER.test(t);
};
