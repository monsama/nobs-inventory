import { HttpError } from './errors.js';
import { checkAddress } from './validate.js';

/* The settings that live beside the lists. Their names are the keys the page uses. */
export const SETTING_KEYS = ['locs', 'sites', 'racks', 'policy', 'feedOn', 'feedSync', 'ldap', 'lansweeper', 'mapPos', 'plans', 'typeMap', 'skipIpOnly', 'backupKeep', 'useLansweeper', 'lsSource', 'seq', 'codeN', 'rseq'];
/* The settings a page may change. The counters belong to the server. */
export const PAGE_SETTINGS = ['locs', 'sites', 'racks', 'policy', 'feedOn', 'feedSync', 'ldap', 'lansweeper', 'mapPos', 'plans', 'typeMap', 'skipIpOnly', 'backupKeep', 'useLansweeper', 'lsSource'];
const KINDS = ['object', 'rel', 'user', 'type', 'history', 'setting'];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_CHANGES = 5000;
const DEFAULT_POLICY = { ip: true, mac: true, os: true, model: true, cpu: true, ram: true, fw: true, boot: false, disk: false, patch: false, av: false, domain: true, user: false, loc: false, status: false };

/* One key per stored record, used for revisions: "object|o101", "setting|locs". */
export const docKey = (kind, id) => kind + '|' + id;

export function revsOf(db) {
  const m = {};
  for (const r of db.prepare('SELECT kind, id, rev FROM revs').all()) m[docKey(r.kind, r.id)] = r.rev;
  return m;
}

export function loadState(db) {
  const rows = db.prepare('SELECT kind, id, data FROM docs').all();
  const s = { objs: [], rels: [], users: [], types: {}, history: {}, locs: [], sites: [], racks: [], policy: null, feedOn: true, feedSync: true, ldap: null, mapPos: {}, seq: 100, codeN: 0, rseq: 0 };
  for (const r of rows) {
    const v = JSON.parse(r.data);
    if (r.kind === 'object') s.objs.push(v);
    else if (r.kind === 'rel') s.rels.push(v);
    else if (r.kind === 'user') s.users.push(v);
    else if (r.kind === 'type') s.types[r.id] = v;
    else if (r.kind === 'history') s.history[r.id] = v;
    else if (r.kind === 'setting' && SETTING_KEYS.includes(r.id)) s[r.id] = v;
  }
  s.empty = rows.length === 0;
  /* A new server starts with the same feed policy as the page, so nothing is missing on either side. */
  if (!s.policy) s.policy = { ...DEFAULT_POLICY };
  s.revs = revsOf(db);
  return s;
}

/* Factory reset: removes every record, setting, account and sign-in except the account that asked for it, and its
   sessions. The audit log is kept. The next load starts as a new server does. */
export function factoryReset(db, keepUserId) {
  const me = loadState(db).users.find(u => String(u.id) === String(keepUserId));
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM docs; DELETE FROM revs; DELETE FROM plan_images;');
    db.prepare('DELETE FROM credentials WHERE user_id != ?').run(keepUserId);
    db.prepare('DELETE FROM sessions WHERE user_id != ?').run(keepUserId);
    if (me) db.prepare('INSERT INTO docs (kind, id, data) VALUES (?, ?, ?)').run('user', String(me.id), JSON.stringify(me));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/* The rules a whole inventory must follow before it is stored. */
/* The types the page knows out of the box, and the statuses. Keep in step with TYPES and STATUS in public/js/01-core.js. */
const KNOWN_TYPES = ['pc', 'server', 'vm', 'accesspoint', 'sip', 'mobile', 'monitor', 'switch', 'printer', 'patch', 'router', 'firewall', 'modem', 'storage', 'android', 'ios', 'rack', 'other', 'pbx'];
const STATUSES = ['active', 'stock', 'repair', 'retired'];
const REL_KINDS = ['attached', 'hosted', 'connected', 'uplink'];
export function checkState(s) {
  const bad = msg => { throw new HttpError(400, msg); };
  if (!Array.isArray(s.objs) || !Array.isArray(s.rels) || !Array.isArray(s.users) || !Array.isArray(s.locs)) bad('The inventory must list objects, relations, users and locations.');
  if (s.racks !== undefined && !Array.isArray(s.racks)) bad('Racks must be a list.');
  if (!s.types || typeof s.types !== 'object' || !s.history || typeof s.history !== 'object') bad('Types and history must be objects.');
  for (const u of s.users) {
    if (!u || typeof u !== 'object' || typeof u.id !== 'string' || !u.id) bad('Every user needs an id.');
    if (!['admin', 'viewer'].includes(u.role)) bad('A user\'s role must be admin or viewer.');
    if (u.active !== undefined && typeof u.active !== 'boolean') bad('Active must be yes or no.');
    if (u.login !== undefined && (typeof u.login !== 'string' || u.login.length > 200)) bad('A login must be short text.');
  }
  /* A login names one account: sign-in picks the first match, so a second one would lock its owner out. */
  const logins = new Map();
  for (const u of s.users) {
    if (!u.login) continue;
    const key = u.login.toLowerCase();
    if (logins.has(key) && logins.get(key) !== u.id) bad(`The login ${u.login} is already used by another user.`);
    logins.set(key, u.id);
  }
  const ids = s.objs.map(o => o.id);
  if (new Set(ids).size !== ids.length) bad('Two objects have the same id.');
  if (ids.some(id => typeof id !== 'string' || !id)) bad('Every object needs an id.');
  /* The page cannot show an object with an unknown type or status, or a relation to an object that is not there. */
  const types = new Set([...KNOWN_TYPES, ...Object.keys(s.types)]);
  for (const o of s.objs) {
    if (o.status === undefined) o.status = 'active';   /* a hand-written object is in use until it says otherwise */
    if (!types.has(o.type)) bad(`${o.name || o.id} has an unknown type: ${o.type}.`);
    if (!STATUSES.includes(o.status)) bad(`${o.name || o.id} has an unknown status: ${o.status}.`);
    if (typeof o.name !== 'string' || !o.name.trim()) bad('Every object needs a name.');
    /* Addresses are checked and written in their stored form, however the object arrived. */
    for (const k of ['ip', 'ip6', 'mac']) { if (o[k] === undefined) continue; const r = checkAddress(k, o[k]); if (!r.ok) bad(`${o.name}: ${r.msg}`); o[k] = r.value; }
    for (const k of ['name', 'model', 'serial', 'user', 'notes', 'loc', 'os', 'cpu', 'ram', 'fw', 'domain']) if (o[k] !== undefined && (typeof o[k] !== 'string' || o[k].length > 500)) bad(`${o.name}: ${k} is too long or not text.`);
    if (o.ports !== undefined && (!Number.isInteger(o.ports) || o.ports < 0 || o.ports > 1000)) bad(`${o.name}: the port count must be a whole number from 0 to 1000.`);
    /* A port group names a range of the ports (copper and SFP together), with an optional kind. Groups do not overlap. */
    if (o.portGroups !== undefined) {
      if (!Array.isArray(o.portGroups)) bad(`${o.name}: port groups must be a list.`);
      else {
        const total = (o.ports || 0) + (o.sfp || 0);
        o.portGroups.forEach((g, i) => {
          if (!g || typeof g.name !== 'string' || !g.name.trim() || g.name.length > 60) bad(`${o.name}: a port group needs a name of up to 60 characters.`);
          if (!Number.isInteger(g.from) || !Number.isInteger(g.to) || g.from < 1 || g.to < g.from || g.to > total) bad(`${o.name}: port group ${g && g.name} is not a range of its ports.`);
          if (g.kind !== undefined && (typeof g.kind !== 'string' || g.kind.length > 20)) bad(`${o.name}: the kind of a port group is text of up to 20 characters.`);
          if (o.portGroups.slice(0, i).some(p => g.from <= p.to && g.to >= p.from)) bad(`${o.name}: port groups ${g.name} and another overlap.`);
        });
      }
    }
    if (o.u != null && (!Number.isInteger(o.u) || o.u < 1 || o.u > 200)) bad(`${o.name}: the rack position must be a U from 1 to 200.`);
  }
  const idSet = new Set(ids);
  const byId = new Map(s.objs.map(o => [o.id, o]));
  for (const r of s.rels) {
    if (!idSet.has(r.from) || !idSet.has(r.to)) bad('A relation points at an object that is not in the inventory.');
    if (!REL_KINDS.includes(r.kind)) bad(`A relation has an unknown kind: ${r.kind}.`);
    if (r.from === r.to) bad('An object cannot be related to itself.');
  }
  /* One device per port of a switch or patch panel. */
  const taken = new Set();
  for (const r of s.rels) {
    if (r.port == null) continue;
    const t = byId.get(r.to);
    if (t.type !== 'patch' && !(t.ports > 0)) continue;
    const key = r.to + '|' + String(r.port);
    if (taken.has(key)) bad(`Port ${r.port} on ${t.name} is used twice.`);
    taken.add(key);
  }
  /* A device sits in one rack place: the rack exists, the U positions do not overlap, and a device on top of another is in the same rack. */
  const racks = new Set(s.objs.filter(o => o.type === 'rack').map(o => o.id));
  const used = {};
  for (const o of s.objs) {
    if (o.rack == null) continue;
    if (!racks.has(o.rack)) bad(`${o.name}: its rack does not exist.`);
    if (o.ontop != null) {
      const below = byId.get(o.ontop);
      if (!below || below.rack !== o.rack) bad(`${o.name}: the device it sits on is not in the same rack.`);
      continue;
    }
    if (o.u == null) continue;
    const h = o.h || 1;
    for (let u = o.u; u < o.u + h; u++) {
      const key = o.rack + '|' + u;
      if (used[key]) bad(`${o.name} and ${used[key]} both take U${u} in the same rack.`);
      used[key] = o.name;
    }
  }
  if (JSON.stringify(s).length > MAX_BYTES) throw new HttpError(413, 'The inventory is too large.');
}

function rowsOf(s) {
  const rows = [];
  for (const o of s.objs) rows.push(['object', o.id, o]);
  for (const r of s.rels) rows.push(['rel', String(r.id), r]);
  for (const u of s.users) rows.push(['user', String(u.id), u]);
  for (const [k, t] of Object.entries(s.types)) rows.push(['type', k, t]);
  for (const [k, h] of Object.entries(s.history)) rows.push(['history', k, h]);
  for (const k of SETTING_KEYS) if (s[k] !== undefined) rows.push(['setting', k, s[k]]);
  return rows;
}

/* Writes the records that changed, deletes the ones that are gone, and gives each of them a new revision.
   Only changed records are written, so a small edit to a large inventory is a small write. */
function writeDocs(db, s) {
  const rows = rowsOf(s);
  const current = new Map(db.prepare('SELECT kind, id, data FROM docs').all().map(r => [docKey(r.kind, r.id), r.data]));
  const wanted = new Set();
  const bumped = [];
  const bump = (kind, id) => { db.prepare('INSERT INTO revs (kind, id, rev) VALUES (?, ?, 1) ON CONFLICT(kind, id) DO UPDATE SET rev = rev + 1').run(kind, id); bumped.push(docKey(kind, id)); };
  db.exec('BEGIN');
  try {
    const put = db.prepare('INSERT INTO docs (kind, id, data) VALUES (?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data');
    const del = db.prepare('DELETE FROM docs WHERE kind = ? AND id = ?');
    for (const [kind, id, value] of rows) {
      const key = docKey(kind, id);
      wanted.add(key);
      const json = JSON.stringify(value);
      if (current.get(key) !== json) { put.run(kind, id, json); bump(kind, id); }
    }
    for (const key of current.keys()) {
      if (!wanted.has(key)) { const i = key.indexOf('|'); const kind = key.slice(0, i), id = key.slice(i + 1); del.run(kind, id); bump(kind, id); }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return bumped;
}

/* Replaces the stored inventory with the one sent. Used by the admin's full save and by the server's own jobs
   (feed, directory). Logins and sessions are not touched. */
export function saveState(db, s) {
  checkState(s);
  writeDocs(db, s);
}

/* The page's saves. Each change says which kind of record it is, its new value (or none, for a delete) and the
   revision it was based on. A change based on an old revision is not applied: someone else changed that record
   first. The other changes are applied. New objects get their code here, so codes stay unique. */
export function applyChanges(db, body, guard = () => {}) {
  const bad = msg => { throw new HttpError(400, msg); };
  const puts = body && body.puts, dels = body && body.dels;
  if (!Array.isArray(puts) || !Array.isArray(dels)) bad('Changes must list puts and dels.');
  if (puts.length + dels.length > MAX_CHANGES) bad('Too many changes at once. Save in smaller parts.');
  for (const c of [...puts, ...dels]) {
    if (!c || !KINDS.includes(c.kind) || typeof c.id !== 'string' || !c.id) bad('Every change needs a kind and an id.');
    if (c.kind === 'setting' && !PAGE_SETTINGS.includes(c.id)) bad(`${c.id} is not a setting the page can change.`);
  }
  for (const c of puts) if (c.value === undefined || c.value === null || (c.kind !== 'setting' && typeof c.value !== 'object')) bad('Every saved record needs a value.');

  const revs = revsOf(db);
  const conflicts = [];
  const usable = c => {
    if (c.base === null || c.base === undefined) return true;   /* a preference: the last save wins */
    if (!Number.isInteger(c.base)) bad('A change needs the revision it was based on.');
    const key = docKey(c.kind, c.id);
    if ((revs[key] ?? 0) !== c.base) { conflicts.push(key); return false; }
    return true;
  };
  const okPuts = puts.filter(usable), okDels = dels.filter(usable);

  const s = loadState(db);
  delete s.revs; delete s.empty;
  for (const c of okDels) {
    if (c.kind === 'object') s.objs = s.objs.filter(o => o.id !== c.id);
    else if (c.kind === 'rel') s.rels = s.rels.filter(r => String(r.id) !== c.id);
    else if (c.kind === 'user') s.users = s.users.filter(u => String(u.id) !== c.id);
    else if (c.kind === 'type') delete s.types[c.id];
    else if (c.kind === 'history') delete s.history[c.id];
    else if (c.kind === 'setting') delete s[c.id];
  }
  const codes = {};
  for (const c of okPuts) {
    const v = c.value;
    if (c.kind === 'object') {
      if (v.id !== c.id) bad('A saved object must have the id it is saved under.');
      for (const k of ['ip', 'ip6', 'mac']) { const r = checkAddress(k, v[k]); if (!r.ok) bad(r.msg); if (v[k] !== undefined) v[k] = r.value; }
      if (!v.code) { s.codeN = (s.codeN || 0) + 1; v.code = 'INV-' + String(s.codeN).padStart(4, '0'); codes[c.id] = v.code; }
      const i = s.objs.findIndex(o => o.id === c.id);
      if (i >= 0) s.objs[i] = v; else s.objs.push(v);
    } else if (c.kind === 'rel') {
      const rid = String(c.id); const v2 = { ...v, id: rid };
      const i = s.rels.findIndex(r => String(r.id) === rid);
      if (i >= 0) s.rels[i] = v2; else s.rels.push(v2);
    } else if (c.kind === 'user') {
      const v2 = { ...v, id: c.id };
      const i = s.users.findIndex(u => String(u.id) === c.id);
      if (i >= 0) s.users[i] = v2; else s.users.push(v2);
    } else if (c.kind === 'type') s.types[c.id] = v;
    else if (c.kind === 'history') s.history[c.id] = v;
    else if (c.kind === 'setting') s[c.id] = v;
  }
  checkState(s);
  guard(s);
  writeDocs(db, s);
  const after = revsOf(db);
  const applied = {};
  for (const c of [...okPuts, ...okDels]) { const key = docKey(c.kind, c.id); applied[key] = after[key] ?? 0; }
  return { revs: applied, codes, conflicts };
}
