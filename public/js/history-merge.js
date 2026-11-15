/* Merging a device's history: the lines a page adds go on top of the ones stored. A page's list is its new lines
   followed by the stored lines as it last saw them, so the new ones are those before the point where the page's list
   runs alongside the stored one. Lines are matched by time and text; the same text twice in one minute (bring back,
   undo, bring back) is still two lines. Shared by the server (applyChanges) and the page (reading a device's history).
   No browser code here. */
const keyOf = e => (e && e.t || '') + '\u0000' + (e && e.msg);
/* How many lines in a row must agree before the page's list counts as running alongside the stored one. */
const RUN = 3;

/* The lines of page that are not in stored yet, newest first. */
export function newLines(page, stored){
  if (!Array.isArray(page) || !page.length) return [];
  if (!Array.isArray(stored) || !stored.length) return page.slice();
  const at = new Map();
  stored.forEach((e, j) => { const k = keyOf(e); if (!at.has(k)) at.set(k, []); at.get(k).push(j); });
  for (let i = 0; i < page.length; i++){
    for (const j of at.get(keyOf(page[i])) || []){
      let ok = true;
      for (let n = 1; n < RUN && i + n < page.length && j + n < stored.length; n++) if (keyOf(page[i + n]) !== keyOf(stored[j + n])){ ok = false; break; }
      if (ok) return page.slice(0, i);
    }
  }
  /* Nothing runs alongside: the stored lines were all cut off since, or the page never had them. Lines that are stored
     already are left out all the same. */
  const have = new Set(stored.map(keyOf));
  return page.filter(e => !have.has(keyOf(e)));
}
