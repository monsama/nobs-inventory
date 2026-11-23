/* A device attached to another (a monitor, a dock or a headset on a computer) is where that device is: it takes its
   location (site and room) whenever that one has a location. The page does this before each save, the server after
   each sync and save of the whole inventory (state.js saveState), so a host moved by hand, by a sync or by a bulk move
   takes what is attached to it along. A retired device or one waiting in Pending devices is left as it is. No DOM: the
   server imports it.
   note(o, msg) writes the history line. Returns how many moved.
   @param {any[]} objs @param {any[]} rels @param {(o: any, msg: string) => void} [note] */
export function followHosts(objs, rels, note = (_o, _m) => {}) {
  const byId = new Map((objs || []).map(o => [o.id, o]));
  let n = 0;
  for (const r of rels || []) {
    if (!r || r.kind !== 'attached') continue;
    const d = byId.get(r.from), h = byId.get(r.to);
    if (!d || !h || !h.loc || d.loc === h.loc || d.status === 'retired' || d.review || h.review) continue;
    const was = d.loc;
    d.loc = h.loc;
    /* Its own sources no longer say where it is: the host does. */
    if (d.src && d.src.loc) { delete d.src.loc; if (!Object.keys(d.src).length) delete d.src; }
    note(d, was ? `Location changed from ${was} to ${h.loc}: it is attached to ${h.name}` : `Location set to ${h.loc}: it is attached to ${h.name}`);
    n++;
  }
  return n;
}
/* The ids of the devices attached to another: their location is the host's, so no source writes it. */
export const attachedIds = rels => new Set((rels || []).filter(r => r && r.kind === 'attached').map(r => r.from));
