import { autoBackup } from './backup.js';
import { HttpError } from './errors.js';
import { freeUserId, loadState, saveState, intakeOf } from './state.js';
import { audit } from './db.js';
import { ldapListComputers, ldapListUsers } from './ldap.js';
import { fillField, lsOwns, noteValue, pickOf } from './fill.js';
import { stamp, typeFor } from './feed.js';

/* Brings the users in line with the directory. Users are added and updated from it, their role follows the
   admin group, and users who are gone from it are deactivated, never deleted, so their devices keep their owner. */
export async function syncLdapUsers(db, config) {
  const people = await ldapListUsers(config);   /* the members of the sign-in group, with admin set for the admin group */
  /* The computers' groups: a directory that will not list computers does not stop the user sync. Everything is read from
     the directory before the inventory is loaded, so a save made on the page meanwhile is not overwritten. */
  let computers = null, computerError = null;
  if (config.computerGroups !== 'off') { try { computers = await ldapListComputers(config); } catch (e) { computerError = e.message; } }
  const s = loadState(db);
  const wanted = new Set(people.map(p => p.login.toLowerCase()));
  const counts = { created: 0, updated: 0, deactivated: 0, people: people.length };
  const linked = [];
  for (const p of people) {
    const u = s.users.find(x => x.login && x.login.toLowerCase() === p.login.toLowerCase());
    /* The admin group makes admins. Anyone else has no access (none) until an admin gives them the viewer role, which
       the sync keeps; an admin who left the admin group has none again. */
    const role = p.admin ? 'admin' : u && u.role === 'viewer' ? 'viewer' : 'none';
    if (!u) {
      s.users.push({ id: freeUserId(s.users, 'ldap-' + p.login.toLowerCase()), login: p.login, name: p.name, ...(p.dept ? { dept: p.dept } : {}), groups: p.groups, source: 'ldap', active: true, role, ...profileOf(p) });
      counts.created++;
    } else if (u.source === 'lansweeper' || u.source === 'entra') {
      /* A person Lansweeper (or Entra) named by this login: the same person, now from the directory. Kept as the same record, so
         devices assigned to them stay theirs. One an admin switched off stays off, and a password set for them here is
         removed after the save: from now on the directory checks it. */
      /* A department Lansweeper gave stays while the directory has none, noted as Lansweeper's. */
      const keepDept = !p.dept && u.source === 'lansweeper' && u.dept;
      Object.assign(u, { login: p.login, name: p.name, dept: keepDept ? u.dept : deptOf(u, p), groups: p.groups, role, source: 'ldap' });
      if (keepDept) u.deptFrom = 'lansweeper';
      const pr = profileNext(u, p); if (pr) u.profile = pr; else delete u.profile;
      if (p.dept) delete u.deptFrom;
      linked.push(u.id);
    } else if (u.source === 'ldap') {
      const next = { name: p.name, dept: deptOf(u, p), groups: p.groups, role, profile: profileNext(u, p) };
      if (p.dept) delete u.deptFrom;
      const changed = u.syncOff || Object.keys(next).some(k => JSON.stringify(u[k]) !== JSON.stringify(next[k]));
      Object.assign(u, next);
      if (!u.profile) delete u.profile;
      /* Back in the group: active again, but only when the sync was the one that switched the account off, never an admin. */
      if (u.syncOff) { u.active = true; delete u.syncOff; }
      if (changed) counts.updated++;
    }
    // A local account with the same login is left alone; it is not taken over by the directory.
  }
  for (const u of s.users) {
    if (u.source === 'ldap' && u.active !== false && !wanted.has((u.login || '').toLowerCase())) { u.active = false; u.syncOff = true; counts.deactivated++; }
  }
  /* No computer account at all is most likely a wrong search base: the groups on the devices are left as they are. */
  if (computerError) counts.computerError = computerError;
  else if (computers && computers.length) {
    counts.computers = applyComputers(s, computers);
    Object.assign(counts, listAdUnmatched(s, computers));
    const added = intakeFromAd(s);
    if (added.review) counts.review = added.review;
    if (added.direct) counts.added = added.direct;
    if (added.review || added.direct) counts.listChanged = true;
  }
  else if (computers) counts.computerError = 'No computer accounts were found in the computers search base.';
  if (!s.users.some(u => u.role === 'admin' && u.active !== false)) {
    throw new HttpError(400, 'The sync would leave no active admin, so nothing was changed. Check the admin group.');
  }
  /* A sync that changes no user saves nothing and takes no backup; one that changes users is backed up first. */
  if (linked.length) counts.linked = linked.length;
  const listChanged = counts.listChanged; delete counts.listChanged;
  if (counts.created || counts.updated || counts.linked || counts.deactivated || counts.computers || listChanged) { autoBackup(db, 'before an LDAP sync'); saveState(db, s); }
  for (const id of linked) db.prepare('DELETE FROM credentials WHERE user_id = ?').run(id);
  audit(db, null, 'ldap sync: ' + JSON.stringify(counts));
  return counts;
}

/* The directory's department; when it has none, the one Entra gave (deptFrom 'entra') stays. */
const deptOf = (u, p) => p.dept || (['entra', 'lansweeper'].includes(u.deptFrom) ? u.dept : '') || '';
/* Title, phones, office, manager and e-mail from the directory: they replace what Entra gave. */
const profileOf = p => p.profile && Object.keys(p.profile).length ? { profile: { ...p.profile, from: 'ldap' } } : {};
/* A directory entry with none of them keeps what Entra gave, so the two syncs do not take it away from each other. */
const profileNext = (u, p) => profileOf(p).profile || (u.profile && u.profile.from === 'entra' ? u.profile : undefined);

/* Each device gets the groups of the computer account of the same name (its name, or the first part of its DNS name) as
   adGroups, and is marked as being in Active Directory (inAd), with the account's last logon and creation day (o.ad).
   Its operating system and domain fill empty fields, as fill.js rules, unless Settings turned that off. A device with no
   account, or whose account is in no group, has no groups. Returns how many devices changed. */
export function applyComputers(s, computers, now = new Date()) {
  const at = stamp(now);
  const byName = new Map();
  for (const c of computers) {
    for (const k of [c.name, c.dns, String(c.dns || '').split('.')[0]]) if (k && !byName.has(k.toLowerCase())) byName.set(k.toLowerCase(), c);
  }
  let n = 0;
  for (const o of s.objs) {
    if (o.status === 'retired' || !o.name) continue;
    const key = String(o.name).toLowerCase(), c = byName.get(key) || byName.get(key.split('.')[0]);
    const groups = c && c.groups.length ? c.groups : null;
    /* Whether the device has a computer account in Active Directory: with Graph, this tells an AD-only device apart. */
    const ad = c ? adOf(c) : null;
    let changed = false;
    /* The account's description fills the purpose; its location only a location the inventory knows by that name, so a
       free text never makes a new one. What AD says of each is kept beside the field (o.vals), to pick from on the page. */
    const loc = c && c.location && (s.locs || []).find(l => low(l) === low(c.location));
    const fields = [['os', c && c.os, 'Operating system'], ['domain', c && c.domain, 'Domain'], ['purpose', c && c.description, 'Purpose'], ['loc', loc || '', 'Location']];
    const valsBefore = JSON.stringify(o.vals || null);
    for (const [k, v] of fields) noteValue(o, k, 'ad', v, c && c.logon);
    if (JSON.stringify(o.vals || null) !== valsBefore) changed = true;
    /* Detached or excluded from sync, a device keeps its fields; what AD says of the account is still shown. A field a
       person picked AD for is AD's whatever the setting. */
    if (c && !o.excluded && !o.detached) {
      for (const [k, v, label] of fields) {
        if (s.fillAd === false && pickOf(o, k) !== 'ad') continue;
        /* A field Lansweeper fills in gets only filled while it is empty. */
        if (lsOwns(s, o, k) && o[k]) continue;
        if (fillField(s, o, k, v, 'ad', at, label)) changed = true;
      }
    }
    if (JSON.stringify(groups) === JSON.stringify(o.adGroups || null) && !!c === !!o.inAd && JSON.stringify(ad) === JSON.stringify(o.ad || null) && !changed) continue;
    if (groups) o.adGroups = groups; else delete o.adGroups;
    if (c) o.inAd = true; else delete o.inAd;
    if (ad) o.ad = ad; else delete o.ad;
    n++;
  }
  return n;
}
const low = v => String(v || '').trim().toLowerCase();
/* What AD says of a computer account, kept on its device: last logon, creation day, who manages it, its location as
   written there and what it runs (from its service principal names). */
function adOf(c) {
  const ad = { ...(c.logon ? { logon: c.logon } : {}), ...(c.created ? { created: c.created } : {}), ...(c.managedBy ? { managedBy: c.managedBy } : {}),
    ...(c.location ? { location: c.location } : {}), ...(c.description ? { description: c.description } : {}), ...(c.services && c.services.length ? { services: c.services } : {}) };
  return Object.keys(ad).length ? ad : null;
}
/* The computer accounts no device here stands for (by name, or the first part of the DNS name; retired devices count,
   so they are not offered again), as s.adUnmatched for intakeFromAd. A disabled account is not offered.
   Returns { adUnmatched, adDisabled }. */
export function listAdUnmatched(s, computers) {
  const known = new Set();
  for (const o of s.objs) if (o.name) { known.add(low(o.name)); known.add(low(o.name).split('.')[0]); }
  const list = [], seen = new Set();
  let disabled = 0;
  for (const c of computers) {
    const keys = [c.name, c.dns, String(c.dns || '').split('.')[0]].map(low).filter(Boolean);
    if (keys.some(k => known.has(k)) || seen.has(low(c.name))) continue;
    if (c.disabled) { disabled++; continue; }
    seen.add(low(c.name));
    list.push({ id: low(c.name), name: c.name, ...(c.dns ? { dns: c.dns } : {}), ...(c.os ? { os: c.os } : {}), ...(c.domain ? { domain: c.domain } : {}),
      ...(c.logon ? { logon: c.logon } : {}), ...(c.created ? { created: c.created } : {}), ...(c.ou ? { ou: c.ou } : {}), ...(c.groups && c.groups.length ? { groups: c.groups } : {}),
      ...Object.fromEntries(['description', 'managedBy', 'location'].filter(k => c[k]).map(k => [k, c[k]])), ...(c.services && c.services.length ? { services: c.services } : {}) });
  }
  s.adUnmatched = list.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 2000);
  return { adUnmatched: list.length, adDisabled: disabled };
}
/* The type of a computer account: the type rules on its name (NB-… a notebook), a server by its operating system,
   any other Windows computer a PC. */
export function adType(s, d) {
  const server = /server/i.test(d.os || '');
  const t = typeFor(s, '', '', server ? 'server' : d.os ? 'workstation' : '', d.name, '');
  return t === 'other' && /windows/i.test(d.os || '') ? (server ? 'server' : 'pc') : t;
}
/* Adds devices from the list of computer accounts the inventory does not have. Each gets the next code, its type from
   the rules, its operating system and domain (marked as from AD, so Lansweeper and Intune can replace them), and what
   AD says of the account; the sync keeps that up to date from then on. */
/* A computer account with no logon for this many days (or none at all) is likely gone: it always waits in To review. */
export const AD_STALE_DAYS = 90;
const adStale = (d, now) => !d.logon || (now - Date.parse(d.logon + 'T00:00:00Z')) / 864e5 > AD_STALE_DAYS;
/* The computer accounts the sync found and the inventory does not have become devices: waiting in To review, or straight
   in when Settings says so (a stale account still waits). The list is used up. */
export function intakeFromAd(s, now = new Date()) {
  const list = s.adUnmatched || [], direct = intakeOf(s, 'ad') === 'direct';
  const live = new Set(list.filter(d => direct && !adStale(d, now)).map(d => d.id));
  const n = addFromAd(s, list.filter(d => live.has(d.id)).map(d => d.id), 'the directory sync', now).length;
  const m = addFromAd(s, 'all', 'the directory sync', now, { review: true }).length;
  s.adUnmatched = [];
  return { direct: n, review: m };
}
export function addFromAd(s, ids, who, now = new Date(), { review = false } = {}) {
  const at = stamp(now), want = ids === 'all' ? null : new Set(ids.map(low));
  const list = (s.adUnmatched || []).filter(d => !want || want.has(d.id));
  const names = new Set(s.objs.map(o => low(o.name)).filter(Boolean)), codes = new Set(s.objs.map(o => o.code)), ids2 = new Set(s.objs.map(o => o.id));
  const added = [];
  for (const d of list) {
    /* The list is from the last sync: a device the inventory got since (from Lansweeper or Graph) is not added twice. */
    if (!d.name || names.has(low(d.name))) continue;
    names.add(low(d.name));
    /* The next free code and id: one taken by hand (or an older counter) is passed over. */
    do { s.codeN = (s.codeN || 0) + 1; } while (codes.has('INV-' + String(s.codeN).padStart(4, '0')));
    do { s.seq = (s.seq || 100) + 1; } while (ids2.has('o' + s.seq));
    codes.add('INV-' + String(s.codeN).padStart(4, '0')); ids2.add('o' + s.seq);
    const src = { ...(d.os ? { os: 'ad' } : {}), ...(d.domain ? { domain: 'ad' } : {}), ...(d.description ? { purpose: 'ad' } : {}) };
    const o = { id: 'o' + s.seq, code: 'INV-' + String(s.codeN).padStart(4, '0'), type: adType(s, d), name: d.name, serial: '', status: 'active',
      loc: '', ovr: {}, feed: null, ...(d.os ? { os: d.os } : {}), ...(d.domain ? { domain: d.domain } : {}), ...(d.description ? { purpose: d.description } : {}), ...(Object.keys(src).length ? { src } : {}),
      inAd: true, ...(adOf(d) ? { ad: adOf(d) } : {}),
      ...(d.groups ? { adGroups: d.groups } : {}), ...(review ? { review: { src: 'ad', at } } : {}) };
    s.objs.push(o);
    (s.history[o.id] ??= []).unshift({ t: at, msg: review ? 'Found in Active Directory: waiting in To review' : `Added from Active Directory by ${who}` });
    added.push(o.id);
  }
  const done = new Set(list.map(d => d.id));
  s.adUnmatched = (s.adUnmatched || []).filter(d => !done.has(d.id));
  return added;
}
/* The name the tests and older callers know. */
export const applyComputerGroups = applyComputers;
