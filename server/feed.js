import crypto from 'node:crypto';
import { HttpError } from './errors.js';

/* Lansweeper merge rules, shared by the file import and the API sync.
   Name and serial number are match keys. A field moves only where the policy allows it, and a field the object
   overrides by hand stays as it was set. */
import { checkAddress } from './validate.js';

const FEED_FIELDS = ['ip', 'mac', 'os', 'model', 'cpu', 'ram', 'fw', 'boot', 'disk', 'patch', 'av', 'domain'];
/* Lansweeper's type names -> the app's types. The first rule that matches wins; unmatched names become "other". */
const TYPE_WORDS = [
  [/virtual machine|\bvm\b/i, 'vm'],
  [/access ?point|wireless|wi-?fi|\bwlan\b/i, 'accesspoint'],
  [/webserver|\bweb\b/i, 'other'],
  [/ipad|iphone|\bios\b/i, 'ios'], [/android/i, 'android'], [/tablet|smartphone|mobile/i, 'mobile'],
  [/phone|voip|sip|dect|telefon|gigaset|handset/i, 'sip'], [/monitor/i, 'monitor'], [/switch/i, 'switch'], [/printer/i, 'printer'],
  [/firewall/i, 'firewall'], [/modem/i, 'modem'], [/router/i, 'router'], [/server|linux|vmware|virtual/i, 'server'],
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

const FEED_TEXT = ['name', 'serial', 'ip', 'mac', 'os', 'model', 'location', 'assetType', 'ref', 'cpu', 'ram', 'user', 'fw', 'boot', 'disk', 'patch', 'av', 'domain'];
/* Records pushed as JSON (scripts/Lansweeper-Push.ps1) keep only the known fields, as short text. */
export function recordsFromJson(list) {
  return list.map(raw => {
    const r = {};
    for (const k of FEED_TEXT) r[k] = raw && raw[k] != null ? String(raw[k]).trim().slice(0, 200) : '';
    /* A link joins this object to another one: by the other object's Lansweeper ref (or its name), with a port. */
    r.links = Array.isArray(raw && raw.links) ? raw.links.slice(0, 50).map(l => ({
      ref: String(l && l.ref != null ? l.ref : '').trim().slice(0, 200),
      name: String(l && l.name != null ? l.name : '').trim().slice(0, 200),
      kind: ['attached', 'hosted'].includes(l && l.kind) ? l.kind : 'connected',
      port: String(l && l.port != null ? l.port : '').trim().slice(0, 100)
    })) : [];
    /* Installed software: null when the push did not send it, so the software already on the object stays. */
    r.software = Array.isArray(raw && raw.software) ? raw.software.slice(0, 1000).map(x => ({
      name: String(x && x.name != null ? x.name : '').trim().slice(0, 200),
      version: String(x && x.version != null ? x.version : '').trim().slice(0, 100)
    })).filter(x => x.name) : null;
    return r;
  });
}

const findByRef = (s, ref) => s.objs.find(o => o.feed && String(o.feed.ref) === String(ref));
const findByName = (s, name) => {
  const same = s.objs.filter(o => o.name.toLowerCase() === name.toLowerCase());
  return same.length === 1 ? same[0] : null;
};

/* The software a push sends replaces what came from Lansweeper before; software typed in by hand is kept. */
function applySoftware(s, pairs) {
  let n = 0;
  if (s.feedOn === false) return n;
  for (const { r, obj } of pairs) {
    if (!Array.isArray(r.software) || (obj.ovr && obj.ovr.software === false)) continue;
    const manual = (obj.software || []).filter(x => x.src !== 'Lansweeper');
    obj.software = [...manual, ...r.software.map(x => ({ name: x.name, version: x.version, src: 'Lansweeper' }))];
    n++;
  }
  return n;
}

/* Makes the links of the records that were merged match what Lansweeper reports: new links are added, changed ports
   are updated, and links Lansweeper no longer reports are removed. Links made by hand are never touched. */
function applyLinks(s, pairs) {
  let n = 0;
  for (const { r, obj } of pairs) {
    if (!Array.isArray(r.links) || (obj.ovr && obj.ovr.links === false)) continue;
    const wanted = new Set();
    for (const l of r.links) {
      const to = (l.ref && findByRef(s, l.ref)) || (l.name && findByName(s, l.name));
      if (!to || to === obj) continue;
      const port = l.port || null;
      wanted.add(to.id + '|' + l.kind);
      const existing = s.rels.find(x => x.from === obj.id && x.to === to.id && x.kind === l.kind);
      /* A link made by hand is left as it is; only links Lansweeper made get a new port. */
      if (existing) {
        if (existing.src === 'Lansweeper' && port && existing.port !== port) { existing.port = port; n++; }
        continue;
      }
      s.rels.push({ id: 'r' + crypto.randomUUID(), from: obj.id, to: to.id, kind: l.kind, port, vlan: null, src: 'Lansweeper' });
      n++;
    }
    const before = s.rels.length;
    s.rels = s.rels.filter(x => !(x.from === obj.id && x.src === 'Lansweeper' && !wanted.has(x.to + '|' + x.kind)));
    n += before - s.rels.length;
  }
  return n;
}

/* The app type for a Lansweeper type name: the table in Settings first (names match without case), then the built-in rules. */
export function typeFor(s, name) {
  const text = String(name || '');
  const own = s.typeMap && Object.keys(s.typeMap).find(k => k.toLowerCase() === text.toLowerCase());
  if (own && s.typeMap[own]) return s.typeMap[own];
  return (TYPE_WORDS.find(([re]) => re.test(text)) || [null, 'other'])[1];
}

export function mergeRecords(s, records, now = new Date()) {
  const policy = s.policy || {};
  const seen = stamp(now);
  const counts = { created: 0, updated: 0, linked: 0, unchanged: 0 };
  const pairs = [];
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
    /* With "skip IP-only devices" on, a device named only by its IP address (no serial number) is left out. */
    if (s.skipIpOnly && /^\d{1,3}(\.\d{1,3}){3}$/.test(r.name) && !r.serial){ counts.skippedIp = (counts.skippedIp || 0) + 1; continue; }
    /* Matched by serial number. Without one, by name, but only when that name belongs to a single object: with two
       objects of the same name the record is left alone, so it cannot be merged into the wrong one. */
    const sameName = r.name ? s.objs.filter(o => o.name.toLowerCase() === r.name.toLowerCase()) : [];
    const found = s.objs.find(o => r.serial && (o.serial || '').toLowerCase() === r.serial.toLowerCase())
      || (sameName.length === 1 ? sameName[0] : null);
    if (!found && sameName.length > 1) { counts.ambiguous = (counts.ambiguous || 0) + 1; continue; }
    /* An object excluded from sync, or detached from it, is left as it is. */
    if (found && found.excluded) { counts.excluded = (counts.excluded || 0) + 1; continue; }
    if (found && found.detached) { counts.detached = (counts.detached || 0) + 1; continue; }
    if (!found) {
      if (!r.name) continue;
      const type = typeFor(s, r.assetType);
      s.codeN = (s.codeN || 0) + 1;
      s.seq = (s.seq || 100) + 1;
      const obj = {
        id: 'o' + s.seq, code: 'INV-' + String(s.codeN).padStart(4, '0'), type, name: r.name, serial: r.serial, status: 'active',
        feed: { sys: 'Lansweeper', ref: r.ref, seen }, ovr: {}, loc: locs.includes(r.location) ? r.location : (locs[0] || ''),
        ...Object.fromEntries(['ip', 'mac', 'os', 'model', 'cpu', 'ram', 'fw', 'boot', 'disk', 'patch', 'av', 'domain'].map(k => [k, r[k]]).filter(([, v]) => v)),
        ...(r.user ? { user: r.user } : {})
      };
      s.objs.push(obj);
      pairs.push({ r, obj });
      counts.created++;
      continue;
    }
    pairs.push({ r, obj: found });
    const wasLinked = !!found.feed;
    if (!found.feed) found.feed = { sys: 'Lansweeper', ref: r.ref, seen };
    else if (!found.feed.ref) found.feed.ref = r.ref;
    let changed = false;
    for (const k of FEED_FIELDS) {
      const incoming = r[k];
      if (!incoming || found[k] === incoming) continue;
      const owns = s.feedOn !== false && (found.ovr && k in found.ovr ? found.ovr[k] : !!policy[k]);
      if (owns) { found[k] = incoming; changed = true; }
    }
    /* The last user fills in an object that has nobody assigned yet; a person chosen by hand is never replaced. */
    const userOwned = s.feedOn !== false && (found.ovr && 'user' in found.ovr ? found.ovr.user : !!policy.user);
    if (r.user && userOwned && !found.uid && !found.user && !found.hotdesk) { found.user = r.user; changed = true; }
    if (wasLinked && changed) { found.feed.seen = seen; counts.updated++; }
    else if (!wasLinked) counts.linked++;
    else { found.feed.seen = seen; counts.unchanged++; }
  }
  counts.links = applyLinks(s, pairs);
  counts.software = applySoftware(s, pairs);
  return counts;
}

export function mergeFeed(s, text, now = new Date()) {
  return mergeRecords(s, recordsFromCsv(text), now);
}
