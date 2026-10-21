import { HttpError } from './errors.js';

/* Lansweeper merge rules, shared by the file import and the API sync.
   Name and serial number are match keys. A field moves only where the policy allows it, and a field the object
   overrides by hand stays as it was set. */
const FEED_FIELDS = ['ip', 'mac', 'os', 'model'];
const TYPE_WORDS = [
  [/phone|sip/i, 'sip'], [/monitor/i, 'monitor'], [/switch/i, 'switch'], [/printer/i, 'printer'],
  [/ipad|ios|android|tablet/i, 'tablet'], [/server|linux/i, 'server'], [/router|firewall/i, 'router'],
  [/windows|workstation|pc|notebook|laptop/i, 'pc']
];
const stamp = d => { const p = n => String(n).padStart(2, '0'); return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };

export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === ';') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

/* A CSV export becomes records with the same fields the API gives. */
export function recordsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new HttpError(400, 'The export needs a header row and at least one asset.');
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = k => head.findIndex(h => h === k || h.replace(/\s/g, '') === k);
  if (col('assetname') < 0 && col('name') < 0 && col('serial') < 0) throw new HttpError(400, 'The export needs an AssetName or Serial column.');
  const pick = (r, k) => { const i = col(k); return i >= 0 ? (r[i] || '').trim() : ''; };
  return rows.slice(1).map(r => ({
    name: pick(r, 'assetname') || pick(r, 'name'),
    serial: pick(r, 'serial'),
    ip: pick(r, 'ipaddress') || pick(r, 'ip'),
    mac: pick(r, 'mac'),
    os: pick(r, 'os'),
    model: pick(r, 'model'),
    location: pick(r, 'location'),
    assetType: pick(r, 'assettype'),
    ref: pick(r, 'assetid') || pick(r, 'id')
  }));
}

export function mergeRecords(s, records, now = new Date()) {
  const policy = s.policy || {};
  const seen = stamp(now);
  const counts = { created: 0, updated: 0, linked: 0, unchanged: 0 };
  const locs = s.locs || [];
  for (const r of records) {
    if (!r.name && !r.serial) continue;
    const found = s.objs.find(o => r.serial && (o.serial || '').toLowerCase() === r.serial.toLowerCase())
      || s.objs.find(o => r.name && o.name.toLowerCase() === r.name.toLowerCase());
    if (!found) {
      if (!r.name) continue;
      const type = (TYPE_WORDS.find(([re]) => re.test(r.assetType || '')) || [null, 'other'])[1];
      s.codeN = (s.codeN || 0) + 1;
      s.seq = (s.seq || 100) + 1;
      s.objs.push({
        id: 'o' + s.seq, code: 'INV-' + String(s.codeN).padStart(4, '0'), type, name: r.name, serial: r.serial, status: 'active',
        feed: { sys: 'Lansweeper', ref: r.ref, seen }, ovr: {}, loc: locs.includes(r.location) ? r.location : (locs[0] || ''),
        ...Object.fromEntries(['ip', 'mac', 'os', 'model'].map(k => [k, r[k]]).filter(([, v]) => v))
      });
      counts.created++;
      continue;
    }
    const wasLinked = !!found.feed;
    if (!found.feed) found.feed = { sys: 'Lansweeper', ref: r.ref, seen };
    let changed = false;
    for (const k of FEED_FIELDS) {
      const incoming = r[k];
      if (!incoming || found[k] === incoming) continue;
      const owns = s.feedOn !== false && (found.ovr && k in found.ovr ? found.ovr[k] : !!policy[k]);
      if (owns) { found[k] = incoming; changed = true; }
    }
    if (wasLinked && changed) { found.feed.seen = seen; counts.updated++; }
    else if (!wasLinked) counts.linked++;
    else { found.feed.seen = seen; counts.unchanged++; }
  }
  return counts;
}

export function mergeFeed(s, text, now = new Date()) {
  return mergeRecords(s, recordsFromCsv(text), now);
}
