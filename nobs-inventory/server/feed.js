import { HttpError } from './errors.js';

/* Lansweeper: the merge rules of the page, applied on the server. Name and serial number are match keys.
   Fields move only where the policy allows; a field changed by hand on an object stays as it was set. */
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

export function mergeFeed(s, text, now = new Date()) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new HttpError(400, 'The export needs a header row and at least one asset.');
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = k => head.findIndex(h => h === k || h.replace(/\s/g, '') === k);
  const iName = col('assetname') >= 0 ? col('assetname') : col('name');
  const iSerial = col('serial');
  if (iName < 0 && iSerial < 0) throw new HttpError(400, 'The export needs an AssetName or Serial column.');
  const pick = (r, k) => { const i = col(k); return i >= 0 ? (r[i] || '').trim() : ''; };
  const policy = s.policy || {};
  const seen = stamp(now);
  const counts = { created: 0, updated: 0, linked: 0, unchanged: 0 };
  const locs = s.locs || [];

  for (const r of rows.slice(1)) {
    const name = iName >= 0 ? (r[iName] || '').trim() : '';
    const serial = iSerial >= 0 ? (r[iSerial] || '').trim() : '';
    if (!name && !serial) continue;
    const found = s.objs.find(o => serial && (o.serial || '').toLowerCase() === serial.toLowerCase())
      || s.objs.find(o => name && o.name.toLowerCase() === name.toLowerCase());
    const values = { ip: pick(r, 'ipaddress') || pick(r, 'ip'), mac: pick(r, 'mac'), os: pick(r, 'os'), model: pick(r, 'model') };
    const loc = pick(r, 'location');
    const ref = pick(r, 'assetid') || pick(r, 'id');
    if (!found) {
      if (!name) continue;
      const typeText = pick(r, 'assettype');
      const type = (TYPE_WORDS.find(([re]) => re.test(typeText)) || [null, 'other'])[1];
      s.codeN = (s.codeN || 0) + 1;
      s.seq = (s.seq || 100) + 1;
      s.objs.push({
        id: 'o' + s.seq, code: 'INV-' + String(s.codeN).padStart(4, '0'), type, name, serial, status: 'active',
        feed: { sys: 'Lansweeper', ref, seen }, ovr: {}, loc: locs.includes(loc) ? loc : (locs[0] || ''),
        ...Object.fromEntries(Object.entries(values).filter(([, v]) => v))
      });
      counts.created++;
      continue;
    }
    const wasLinked = !!found.feed;
    if (!found.feed) found.feed = { sys: 'Lansweeper', ref, seen };
    let changed = false;
    for (const k of FEED_FIELDS) {
      const incoming = values[k];
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
