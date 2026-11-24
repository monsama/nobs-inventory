/* A computer or phone that came into the inventory while no source knew its user is put in stock by itself
   (o.stockAuto: settle.js, and Accept in Pending devices). Once a sync names its user (Intune's primary user, or the
   last user Lansweeper saw), it is in use. One put in stock by a person (taken back, a status picked) has no mark and
   stays there: a person decided, whatever a source still says. */

/* The history entries that say a person (or a sync, before) changed the status, newer than the automatic stock. */
const STATUS_SAID = /status|stock|in use|hand(ed)? (it )?out|handout|taken|took|given|retired|accepted/i;

/** Moves the devices in stock by themselves that now have a user to In use. @returns {number} how many */
export function stockToInUse(s, stampText){
  let n = 0;
  for (const o of s.objs || []) {
    if (!o || o.status !== 'stock' || !o.stockAuto || o.review || o.excluded || o.detached) continue;
    if (!o.uid && !String(o.user || '').trim()) continue;
    o.status = 'active'; delete o.stockAuto;
    ((s.history ??= {})[o.id] ??= []).unshift({ t: stampText, msg: `In use from now on: a sync names ${o.user} as its user (it was in stock only because nobody was known when it came in)` });
    n++;
  }
  return n;
}

/* Before 0.9.177 the mark did not exist: a device in stock whose history says it went there by itself ("in stock: nobody
   has it yet") and nothing newer about its status gets it, so the next sync can move it to In use. */
export function markStockAuto(s){
  let changed = false;
  for (const o of s.objs || []) {
    if (!o || o.status !== 'stock' || o.stockAuto) continue;
    const list = (s.history || {})[o.id] || [];
    const i = list.findIndex(h => /in stock: nobody has it yet/.test(String(h && h.msg || '')));
    if (i < 0 || list.slice(0, i).some(h => STATUS_SAID.test(String(h && h.msg || '')))) continue;
    o.stockAuto = true; changed = true;
  }
  return changed;
}
