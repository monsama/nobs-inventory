import { HttpError } from './errors.js';

/* The settings that live beside the lists. Their names are the keys the page uses. */
export const SETTING_KEYS = ['locs', 'racks', 'policy', 'feedOn', 'feedSync', 'ldap', 'mapPos', 'seq', 'codeN', 'rseq'];
/* The settings a page may change. The counters belong to the server. */
export const PAGE_SETTINGS = ['locs', 'racks', 'policy', 'feedOn', 'feedSync', 'ldap', 'mapPos'];
const KINDS = ['object', 'rel', 'user', 'type', 'history', 'setting'];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_CHANGES = 5000;
const DEFAULT_POLICY = { ip: true, mac: true, os: true, model: true, cpu: true, ram: true, fw: true, user: false, loc: false, status: false };

/* One key per stored record, used for revisions: "object|o101", "setting|locs". */
export const docKey = (kind, id) => kind + '|' + id;

export function revsOf(db) {
  const m = {};
  for (const r of db.prepare('SELECT kind, id, rev FROM revs').all()) m[docKey(r.kind, r.id)] = r.rev;
  return m;
}

export function loadState(db) {
  const rows = db.prepare('SELECT kind, id, data FROM docs').all();
  const s = { objs: [], rels: [], users: [], types: {}, history: {}, locs: [], racks: [], policy: null, feedOn: true, feedSync: true, ldap: null, mapPos: {}, seq: 100, codeN: 0, rseq: 0 };
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

/* The rules a whole inventory must follow before it is stored. */
function checkState(s) {
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
  const ids = s.objs.map(o => o.id);
  if (new Set(ids).size !== ids.length) bad('Two objects have the same id.');
  if (ids.some(id => typeof id !== 'string' || !id)) bad('Every object needs an id.');
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
