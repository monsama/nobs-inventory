import { HttpError } from './errors.js';

/* Lansweeper merge rules, shared by the file import and the API sync.
   Name and serial number are match keys. A field moves only where the policy allows it, and a field the object
   overrides by hand stays as it was set. */
import { checkAddress } from './validate.js';

const FEED_FIELDS = ['ip', 'mac', 'os', 'model'];
/* Lansweeper's type names -> the app's types. The first rule that matches wins; unmatched names become "other". */
const TYPE_WORDS = [
  [/ipad|tablet/i, 'tablet'], [/iphone|smartphone|mobile|android/i, 'smartphone'],
  [/phone|voip|sip/i, 'sip'], [/monitor/i, 'monitor'], [/switch/i, 'switch'], [/printer/i, 'printer'],
  [/firewall/i, 'firewall'], [/router/i, 'router'], [/server|linux|vmware|virtual/i, 'server'],
  [/windows|mac|computer|workstation|pc|notebook|laptop/i, 'pc']
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

const FEED_TEXT = ['name', 'serial', 'ip', 'mac', 'os', 'model', 'location', 'assetType', 'ref'];
/* Records pushed as JSON (scripts/Lansweeper-Push.ps1) keep only the known fields, as short text. */
export function recordsFromJson(list) {
  return list.map(raw => {
    const r = {};
    for (const k of FEED_TEXT) r[k] = raw && raw[k] != null ? String(raw[k]).trim().slice(0, 200) : '';
    return r;
  });
}

export function mergeRecords(s, records, now = new Date()) {
  const policy = s.policy || {};
  const seen = stamp(now);
  const counts = { created: 0, updated: 0, linked: 0, unchanged: 0 };
  const locs = s.locs || [];
  /* A field that is not a valid address is left out of the record, so it is never stored. */
  const clean = raw => {
    const r = { ...raw };
    for (const k of ['ip', 'mac']) { const c = checkAddress(k, r[k]); r[k] = c.ok ? c.value : ''; }
    return r;
  };
  for (const raw of records) {
    const r = clean(raw);
    if (!r.name && !r.serial) continue;
    /* Matched by serial number. Without one, by name, but only when that name belongs to a single object: with two
       objects of the same name the record is left alone, so it cannot be merged into the wrong one. */
    const sameName = r.name ? s.objs.filter(o => o.name.toLowerCase() === r.name.toLowerCase()) : [];
    const found = s.objs.find(o => r.serial && (o.serial || '').toLowerCase() === r.serial.toLowerCase())
      || (sameName.length === 1 ? sameName[0] : null);
    if (!found && sameName.length > 1) { counts.ambiguous = (counts.ambiguous || 0) + 1; continue; }
    /* An object excluded from sync is left as it is. */
    if (found && found.excluded) { counts.excluded = (counts.excluded || 0) + 1; continue; }
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
