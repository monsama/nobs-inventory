/* The room a location text from a source becomes in a site, the same on the page (Settings → Locations) and on the
   server (Rooms from AD's location): a text of the form "Building / Room" gives its room part, slashes become dashes,
   and the whole name stays within the 200 characters a location may have. No browser code here. */
export const LOC_MAX = 200;
export function roomFor(site, text){
  const t = String(text || '').trim(), part = t.includes(' / ') ? t.split(' / ').slice(1).join(' - ') : t;
  const room = part.replace(/\s*\/\s*/g, ' - ').replace(/\s+/g, ' ').trim();
  if (!site || !room) return '';
  const name = `${site} / ${room}`.slice(0, LOC_MAX).trim();
  return name.endsWith('/') ? '' : name;
}
