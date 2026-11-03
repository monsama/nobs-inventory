/* The changes a server sends since a page's copy (GET api/state?since=), applied to that copy. No DOM: the tests use
   it too. */
const MAP_KINDS = { type: 'types', history: 'history' }, LIST_KINDS = { object: 'objs', rel: 'rels', user: 'users' };
/* Applies a delta from the server to copy in place: puts replace or add records, types, history and settings, dels
   remove them, and the revisions and change number (cseq) move on. Returns copy. */
export function applyDelta(copy, x){
  for (const [kind, id, v] of x.puts){
    if (LIST_KINDS[kind]){ const a = copy[LIST_KINDS[kind]] ||= [], i = a.findIndex(o => String(o.id) === id); if (i >= 0) a[i] = v; else a.push(v); }
    else if (MAP_KINDS[kind]) (copy[MAP_KINDS[kind]] ||= {})[id] = v;
    else if (kind === 'setting') copy[id] = v;
  }
  for (const [kind, id] of x.dels){
    if (LIST_KINDS[kind]) copy[LIST_KINDS[kind]] = (copy[LIST_KINDS[kind]] || []).filter(o => String(o.id) !== id);
    else if (MAP_KINDS[kind]){ if (copy[MAP_KINDS[kind]]) delete copy[MAP_KINDS[kind]][id]; }
    else if (kind === 'setting') delete copy[id];
  }
  copy.revs = { ...(copy.revs || {}), ...x.revs };
  copy.cseq = x.cseq;
  return copy;
}
