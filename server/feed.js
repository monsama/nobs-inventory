import crypto from 'node:crypto';
import { isPlaceholderSerial } from '../public/js/serials.js';
import { HttpError } from './errors.js';
import { KNOWN_TYPES } from './state.js';

/* Lansweeper merge rules, shared by the file import and the API sync.
   Name and serial number are match keys. A field moves only where the policy allows it, and a field the object
   overrides by hand stays as it was set. */
import { checkAddress } from './validate.js';
import { parseCsv } from '../public/js/csv.js';
export { parseCsv };
import { ipLocationOf, prefixOf, roomForIpLocation, suggestNets } from './lsnet.js';
import { typeByRules } from '../public/js/type-rules.js';

const FEED_FIELDS = ['ip', 'ip6', 'patch', 'mac', 'os', 'model', 'cpu', 'ram', 'fw', 'boot', 'disk', 'av', 'domain', 'mask', 'gateway', 'dns', 'dhcp', 'purchased', 'warranty'];
/* A change to one of these by a sync is written to the device's history, with the old and the new value. Others change silently. */
const LOG_FIELDS = { ip: 'IP', mac: 'MAC', model: 'Model', os: 'Operating system', domain: 'Domain', warranty: 'Warranty end' };
import { stamp } from '../public/js/dates.js';
export { stamp };


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

/* Lansweeper's own days for an asset: the last scan that worked (scanned), the last one it tried (tried) and when it first
   found it (firstSeen). Only those it sent are set, so an older push script that sends none keeps what is there. */
const scanDays = r => Object.fromEntries(['scanned', 'tried', 'firstSeen'].filter(k => r[k]).map(k => [k, r[k]]));
const FEED_TEXT = ['name', 'serial', 'ip', 'ip6', 'mac', 'os', 'model', 'location', 'assetType', 'ref', 'cpu', 'ram', 'user', 'fw', 'boot', 'disk', 'patch', 'av', 'domain',
  'mask', 'gateway', 'dns', 'dhcp', 'purchased', 'warranty', 'role', 'chassis', 'userDept', 'userName', 'scanned', 'tried', 'firstSeen'];
/* Lists joined with "; " (every antivirus product, every drive) are longer than one value. */
const LONG_TEXT = ['av', 'disk'];
/* Records pushed as JSON (scripts/Lansweeper-Push.ps1) keep only the known fields, as short text. */
export function recordsFromJson(list) {
  return list.map(raw => {
    const r = {};
    for (const k of FEED_TEXT) r[k] = raw && raw[k] != null ? String(raw[k]).trim().slice(0, LONG_TEXT.includes(k) ? 1000 : 200) : '';
    /* A link joins this object to another one: by the other object's Lansweeper ref (or its name), with a port. */
    r.links = Array.isArray(raw && raw.links) ? raw.links.filter(l => l && l.kind === 'attached').slice(0, 50).map(l => ({
      ref: String(l && l.ref != null ? l.ref : '').trim().slice(0, 200),
      name: String(l && l.name != null ? l.name : '').trim().slice(0, 200),
      kind: 'attached',
      port: String(l && l.port != null ? l.port : '').trim().slice(0, 100)
    })) : [];
    /* Installed software: null when the push did not send it, so the software already on the object stays. */
    r.software = Array.isArray(raw && raw.software) ? raw.software.slice(0, 1000).map(x => ({
      name: String(x && x.name != null ? x.name : '').trim().slice(0, 200),
      version: String(x && x.version != null ? x.version : '').trim().slice(0, 100)
    })).filter(x => x.name) : null;
    /* The device's other network adapters (Wi-Fi next to the cable, a second network): null when not sent. */
    r.nics = Array.isArray(raw && raw.nics) ? raw.nics.slice(0, 16).map(x => {
      const t = k => String(x && x[k] != null ? x[k] : '').trim().slice(0, 120);
      return { name: t('name'), ip: t('ip'), mac: t('mac'), mask: t('mask'), gateway: t('gateway'), dhcp: t('dhcp') };
    }) : null;
    return r;
  });
}
/* The other adapters with valid addresses only, each address once, never the device's own address. */
export function cleanNics(list, mainIp) {
  const seen = new Set(mainIp ? [mainIp] : []), out = [];
  for (const n of Array.isArray(list) ? list : []) {
    const ip = checkAddress('ip', n.ip), mac = checkAddress('mac', n.mac), gw = checkAddress('ip', n.gateway);
    if (!ip.ok || !ip.value || seen.has(ip.value)) continue;
    seen.add(ip.value);
    out.push({ name: n.name || '', ip: ip.value, ...(mac.ok && mac.value ? { mac: mac.value } : {}), ...(prefixOf(n.mask) !== null ? { mask: n.mask } : {}),
      ...(gw.ok && gw.value ? { gateway: gw.value } : {}), ...(['dhcp', 'static'].includes(n.dhcp) ? { dhcp: n.dhcp } : {}) });
  }
  return out;
}

/* A date as YYYY-MM-DD, from what Lansweeper writes (2027-03-31, 2027-03-31T00:00:00, 31.03.2027); anything else is no date. */
export const dayOf = v => {
  const t = String(v || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (!m) { const d = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(t); if (d) m = [null, d[3], d[2].padStart(2, '0'), d[1].padStart(2, '0')]; }
  if (!m || +m[1] < 1990 || +m[1] > 2100 || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return '';
  return `${m[1]}-${m[2]}-${m[3]}`;
};

/* The person behind a device's user, from the directory Lansweeper reads. Lansweeper names the user by their login
   (tblAssets.Username, the sAMAccountName); the full name and department come from its AD users. The person is found
   by login (or, for one kept before 0.9.28, by a name that is that login), else made when a device names them. A
   person from the directory (LDAP) keeps what the directory says; one from Lansweeper gets the full name and
   department, each only while it is empty (the name while it is still the login): a name or department changed by hand
   on the page is kept, so a later change in AD reaches the person through the LDAP sync, not through Lansweeper. A
   user that is not a login (a report file can give a full name) makes a person without a login, found by name.
   The same login in two trusted domains is one person: Lansweeper's user domain is not sent. A login another account
   already has is not given twice. The devices that name the person by login are
   bound to them (uid), so the page shows the person's name and a rename moves the devices with them.
   A login is letters (umlauts too), digits and . _ @ ' -, as Active Directory allows them. */
export const LOGIN_RE = /^[\p{L}\p{N}_.@'-]{1,64}$/u;
function applyDepartments(s, records) {
  let n = 0;
  if (s.feedOn === false || (s.policy && s.policy.dept === false)) return n;
  const low = v => String(v || '').toLowerCase();
  if (!records.some(r => r.user && (r.userDept || r.userName))) return n;
  s.users ??= [];
  /* Lookups instead of a pass over every person and device per record; kept up to date as people are added. */
  const byLogin = new Map(), byName = new Map(), byUser = new Map();
  const indexPerson = u => { if (u.login && !byLogin.has(low(u.login))) byLogin.set(low(u.login), u); if (!byName.has(low(u.name))) byName.set(low(u.name), u); };
  s.users.forEach(indexPerson);
  for (const o of s.objs) if (o.user) { const k = low(o.user); byUser.set(k, [...(byUser.get(k) || []), o]); }
  for (const r of records) {
    if (!r.user || (!r.userDept && !r.userName)) continue;
    const login = low(r.user), named = byUser.has(login);
    /* A user that comes with a full name is a login; one without, that is not a login (a full name, as a report file
       may give it), is a name, as before. */
    const isLogin = !!r.userName || LOGIN_RE.test(r.user);
    let p = byLogin.get(login) || byName.get(login);
    if (!p && named) {
      p = { id: 'u' + crypto.randomBytes(4).toString('hex'), login: isLogin ? r.user : '', name: r.userName || r.user, dept: '', role: 'viewer', groups: [], source: 'lansweeper', active: true };
      s.users.push(p); indexPerson(p); n++;
    }
    if (!p) continue;
    if (p.source === 'lansweeper') {
      if (!p.login && isLogin && !byLogin.has(login)) { p.login = r.user; byLogin.set(login, p); n++; }
      if (r.userName && p.name !== r.userName.slice(0, 120) && low(p.name) === low(p.login || r.user)) { p.name = r.userName.slice(0, 120); n++; }
      if (r.userDept && !p.dept) { p.dept = r.userDept.slice(0, 120); n++; }
    }
    for (const o of byUser.get(login) || []) if (!o.uid && !o.hotdesk && low(o.user) === login) { o.uid = p.id; o.user = p.name; n++; }
  }
  return n;
}

/* The software a push sends replaces what came from Lansweeper before; software typed in by hand is kept. */
function applySoftware(s, pairs) {
  let n = 0;
  if (s.feedOn === false) return n;
  for (const { r, obj } of pairs) {
    const owned = obj.ovr && 'software' in obj.ovr ? obj.ovr.software : !(s.policy && s.policy.software === false);
    if (!Array.isArray(r.software) || !owned) continue;
    const manual = (obj.software || []).filter(x => x.src !== 'Lansweeper');
    const next = [...manual, ...r.software.map(x => ({ name: x.name, version: x.version, src: 'Lansweeper' }))];
    /* Counted only when the software really changed, so an unchanged push saves nothing. */
    if (JSON.stringify(next) !== JSON.stringify(obj.software || [])) { obj.software = next; n++; }
  }
  return n;
}

/* Makes the links of the records that were merged match what Lansweeper reports: new links are added, changed ports
   are updated, and links Lansweeper no longer reports are removed. Links made by hand are never touched. */
function applyLinks(s, pairs, counts) {
  let n = 0;
  if (s.feedOn === false) return n;
  /* The devices by Lansweeper ref and by name, once; and the links each merged device should have, removed in one pass. */
  const byRef = new Map(), byName = new Map();
  for (const o of s.objs) {
    if (o.feed && o.feed.ref != null && !byRef.has(String(o.feed.ref))) byRef.set(String(o.feed.ref), o);
    const k = o.name.toLowerCase(); byName.set(k, byName.has(k) ? null : o);   /* null: the name is used twice */
  }
  const wantedOf = new Map();
  for (const { r, obj } of pairs) {
    const owned = obj.ovr && 'links' in obj.ovr ? obj.ovr.links : !(s.policy && s.policy.links === false);
    if (!Array.isArray(r.links) || !owned) continue;
    const wanted = new Set();
    wantedOf.set(obj.id, wanted);
    for (const l of r.links) {
      const to = (l.ref && byRef.get(String(l.ref))) || (l.name && byName.get(l.name.toLowerCase())) || null;
      if (!to || to === obj) continue;
      const port = l.port || null;
      wanted.add(to.id + '|' + l.kind);
      /* A port that another device already uses is not taken: the link is left out and counted, and the push goes on. */
      if (port != null && (to.type === 'patch' || to.ports > 0) && s.rels.some(x => x.to === to.id && String(x.port) === String(port) && x.from !== obj.id)){
        counts.portConflict = (counts.portConflict || 0) + 1; continue;
      }
      const existing = s.rels.find(x => x.from === obj.id && x.to === to.id && x.kind === l.kind);
      /* A link made by hand is left as it is; only links Lansweeper made get a new port. */
      if (existing) {
        if (existing.src === 'Lansweeper' && port && existing.port !== port) { existing.port = port; n++; }
        continue;
      }
      s.rels.push({ id: 'r' + crypto.randomUUID(), from: obj.id, to: to.id, kind: l.kind, port, vlan: null, src: 'Lansweeper' });
      n++;
    }
  }
  if (!wantedOf.size) return n;
  const before = s.rels.length;
  /* Only monitor links are managed; a connection of another kind that Lansweeper made earlier is left alone (it keeps
     its Lansweeper mark, but nothing changes or removes it any more). */
  s.rels = s.rels.filter(x => !(x.src === 'Lansweeper' && x.kind === 'attached' && wantedOf.has(x.from) && !wantedOf.get(x.from).has(x.to + '|' + x.kind)));
  n += before - s.rels.length;
  return n;
}

/* A model from Lansweeper is the model the user gave it, when there is a rename for it; otherwise it is kept as it comes. */
export function modelFor(s, name) {
  const text = String(name || '');
  const own = s.modelMap && Object.keys(s.modelMap).find(k => k.toLowerCase() === text.toLowerCase());
  return own && s.modelMap[own] ? s.modelMap[own] : text;
}
/* The app type for a Lansweeper type name: a type mapping set in Settings (the name, without case) wins; then the type
   rules, in their order (the ones shipped, or the list edited in Settings → Feed). */
export function typeFor(s, name, model, role, devName = '', chassis = '') {
  const text = String(name || '');
  const own = s.typeMap && Object.keys(s.typeMap).find(k => k.toLowerCase() === text.toLowerCase());
  /* A mapping to a type that is not there (deleted since) is passed over: the rules decide, instead of the whole push failing. */
  if (own && s.typeMap[own] && (KNOWN_TYPES.includes(s.typeMap[own]) || (s.types || {})[s.typeMap[own]])) return s.typeMap[own];
  const byRules = typeByRules(s.typeRules, { type: text, model, name: devName, chassis }).type;
  /* Windows says whether it is a workstation, a server or a domain controller, which is surer than the type's name:
     it moves a computer between PC and server. A virtual machine stays one. */
  if ((role === 'server' || role === 'dc') && ['pc', 'notebook', 'other'].includes(byRules)) return 'server';
  if (role === 'workstation' && byRules === 'server') return 'pc';
  return byRules;
}

/* A feed run that created, updated, linked or added something. A run that changes nothing saves nothing and takes no backup. */
export const feedChanged = counts => ['created', 'updated', 'linked', 'links', 'software', 'people', 'networks'].some(k => counts[k] > 0);

/* ipLocations: Lansweeper's named address ranges, when the push sent them; the ones kept from the last push otherwise. */
export function mergeRecords(s, records, now = new Date(), ipLocations = null) {
  const before = { ipLocations: s.lsIpLocations || [] };
  if (ipLocations) s.lsIpLocations = ipLocations; else ipLocations = s.lsIpLocations || [];
  for (const r of records) if (r.model) r.model = modelFor(s, r.model);
  const policy = s.policy || {};
  const seen = stamp(now);
  const counts = { created: 0, updated: 0, linked: 0, unchanged: 0 };
  const pairs = [];
  const locs = s.locs || [];
  /* A field that is not a valid address is left out of the record, so it is never stored. */
  const clean = raw => {
    const r = { ...raw };
    for (const k of ['ip', 'ip6', 'mac']) { const c = checkAddress(k, r[k]); r[k] = c.ok ? c.value : ''; }
    const ip = v => { const c = checkAddress('ip', v); return c.ok ? c.value : ''; };
    r.gateway = ip(r.gateway);
    r.mask = prefixOf(r.mask) === null ? '' : r.mask;
    r.dns = String(r.dns || '').split(/[,;\s]+/).map(ip).filter(Boolean).slice(0, 4).join(', ');
    r.dhcp = /^(1|true|yes|dhcp)$/i.test(r.dhcp || '') ? 'dhcp' : /^(0|false|no|static)$/i.test(r.dhcp || '') ? 'static' : '';
    for (const k of ['purchased', 'warranty', 'scanned', 'tried', 'firstSeen']) r[k] = dayOf(r[k]);
    /* A maker's placeholder serial ("To be filled by O.E.M.") is shared by many machines: it is no serial at all, so two
       of them are never folded into one device by it. */
    if (isPlaceholderSerial(r.serial)) r.serial = '';
    if (Array.isArray(r.nics)) r.nics = cleanNics(r.nics, r.ip);
    r.role = ['workstation', 'server', 'dc'].includes(r.role) ? r.role : '';
    return r;
  };
  /* The room a device's address puts it in, by Lansweeper's IP locations, when the location it reports is not one. */
  const roomByIp = r => { const l = ipLocationOf(ipLocations, r.ip); return l ? roomForIpLocation(locs, l.name) : null; };
  /* Lookups by serial number (the first device that has it) and by name, kept up to date as devices are added, so a
     push of thousands does not go through every device for every record. */
  const lc = v => String(v || '').toLowerCase();
  const bySerial = new Map(), byName = new Map();
  const index = o => { if (o.serial && !bySerial.has(lc(o.serial))) bySerial.set(lc(o.serial), o); const k = lc(o.name); byName.set(k, [...(byName.get(k) || []), o]); };
  s.objs.forEach(index);
  const cleaned = [];
  for (const raw of records) {
    const r = clean(raw);
    cleaned.push(r);
    if (!r.name && !r.serial) continue;
    /* With "skip IP-only devices" on, a device named only by its IP address (no serial number) is left out. */
    if (s.skipIpOnly && /^\d{1,3}(\.\d{1,3}){3}$/.test(r.name) && !r.serial){ counts.skippedIp = (counts.skippedIp || 0) + 1; continue; }
    /* Matched by serial number. Without one, by name, but only when that name belongs to a single object: with two
       objects of the same name the record is left alone, so it cannot be merged into the wrong one. */
    /* A name only matches an object that has no other serial number: two devices can share a name, not a serial. */
    const sameName = r.name ? (byName.get(lc(r.name)) || []).filter(o => !(r.serial && o.serial && lc(o.serial) !== lc(r.serial))) : [];
    const found = (r.serial && bySerial.get(lc(r.serial))) || (sameName.length === 1 ? sameName[0] : null);
    if (!found && sameName.length > 1) { counts.ambiguous = (counts.ambiguous || 0) + 1; continue; }
    /* An object excluded from sync, or detached from it, is left as it is. */
    if (found && found.excluded) { counts.excluded = (counts.excluded || 0) + 1; continue; }
    if (found && found.detached) { counts.detached = (counts.detached || 0) + 1; continue; }
    if (!found) {
      if (!r.name) continue;
      const type = typeFor(s, r.assetType, r.model, r.role, r.name, r.chassis);
      s.codeN = (s.codeN || 0) + 1;
      s.seq = (s.seq || 100) + 1;
      const obj = {
        id: 'o' + s.seq, code: 'INV-' + String(s.codeN).padStart(4, '0'), type, name: r.name, serial: r.serial, status: 'active',
        feed: { sys: 'Lansweeper', ref: r.ref, seen, created: seen, assetType: r.assetType || '', ...(r.role ? { role: r.role } : {}), ...(r.chassis ? { chassis: r.chassis } : {}), ...scanDays(r) }, ovr: {}, loc: locs.includes(r.location) ? r.location : (roomByIp(r) || ''),
        ...Object.fromEntries(FEED_FIELDS.map(k => [k, r[k]]).filter(([, v]) => v)),
        ...(r.user ? { user: r.user } : {}),
        ...(r.nics && r.nics.length ? { nics: r.nics } : {})
      };
      s.objs.push(obj); index(obj);
      pairs.push({ r, obj });
      counts.created++;
      continue;
    }
    pairs.push({ r, obj: found });
    const wasLinked = !!found.feed;
    /* linked: when this inventory's device was first matched to the Lansweeper asset. */
    if (!found.feed) found.feed = { sys: 'Lansweeper', ref: r.ref, seen, linked: seen, assetType: r.assetType || '' };
    else if (!found.feed.ref) found.feed.ref = r.ref;
    if (found.feed && r.assetType) found.feed.assetType = r.assetType;   /* the type name is kept, so a type mapping can apply to it later */
    /* Windows' role and the chassis are kept with the feed's data, for the type rules (Apply to existing devices). */
    if (found.feed && r.role) found.feed.role = r.role;
    if (found.feed && r.chassis) found.feed.chassis = r.chassis;
    /* The day Lansweeper last scanned it: a device not scanned for months is flagged for a check by hand. It is not a
       change of the device, so it does not count as an update. */
    if (found.feed) Object.assign(found.feed, scanDays(r));
    let changed = false;
    for (const k of FEED_FIELDS) {
      const incoming = r[k];
      if (!incoming || found[k] === incoming) continue;
      const owns = s.feedOn !== false && (found.ovr && k in found.ovr ? found.ovr[k] : !!policy[k]);
      if (owns){
        if (LOG_FIELDS[k] && found[k]) (s.history[found.id] ??= []).unshift({ t: seen, msg: `Lansweeper: ${LOG_FIELDS[k]} changed from ${found[k]} to ${incoming}` });
        found[k] = incoming; changed = true;
      }
    }
    /* The other adapters go with the address: kept from Lansweeper while it fills in the IP address. */
    const nicsOwned = s.feedOn !== false && (found.ovr && 'ip' in found.ovr ? found.ovr.ip : !!policy.ip);
    if (nicsOwned && Array.isArray(r.nics) && JSON.stringify(r.nics) !== JSON.stringify(found.nics || [])) {
      if (r.nics.length) found.nics = r.nics; else delete found.nics;
      changed = true;
    }
    /* The last user fills in an object that has nobody assigned yet; a person chosen by hand is never replaced. */
    const userOwned = s.feedOn !== false && (found.ovr && 'user' in found.ovr ? found.ovr.user : !!policy.user);
    if (r.user && userOwned && !found.uid && !found.user && !found.hotdesk) { found.user = r.user; changed = true; }
    /* Location: Lansweeper's location, when the policy lets the feed set it and the room is in the inventory's list. */
    const locOwned = s.feedOn !== false && (found.ovr && 'loc' in found.ovr ? found.ovr.loc : !!policy.loc);
    if (locOwned && r.location && locs.includes(r.location) && found.loc !== r.location) {
      if (found.loc) (s.history[found.id] ??= []).unshift({ t: seen, msg: `Lansweeper: Location changed from ${found.loc} to ${r.location}` });
      found.loc = r.location; changed = true;
    }
    /* A device with no location gets the room its address is in (Room from IP location); one held by the device stays. */
    if (!found.loc && s.feedOn !== false && policy.ipRoom !== false && !(found.ovr && found.ovr.loc === false)) { const room = roomByIp(r); if (room) { found.loc = room; changed = true; } }
    if (wasLinked && changed) { found.feed.seen = seen; counts.updated++; }
    else if (!wasLinked) counts.linked++;
    else { found.feed.seen = seen; counts.unchanged++; }
  }
  counts.people = applyDepartments(s, cleaned);
  /* Subnets to suggest, from the masks the devices' adapters report. Worked out from the whole inventory, as a push comes
     in batches; kept from the last push when this one sent no masks. */
  const netsBefore = JSON.stringify([s.lsNets || [], before.ipLocations]);
  if (cleaned.some(r => r.mask)) s.lsNets = suggestNets(s.objs.filter(o => o.status !== 'retired'), s.subnets, ipLocations);
  counts.networks = JSON.stringify([s.lsNets || [], s.lsIpLocations || []]) === netsBefore ? 0 : 1;
  counts.links = applyLinks(s, pairs, counts);
  counts.software = applySoftware(s, pairs);
  return counts;
}

export function mergeFeed(s, text, now = new Date()) {
  return mergeRecords(s, recordsFromCsv(text), now);
}
