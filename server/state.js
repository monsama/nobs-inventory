import { HttpError } from './errors.js';

/* The settings that live beside the lists. Their names are the keys the page uses. */
export const SETTING_KEYS = ['locs', 'policy', 'feedOn', 'feedSync', 'ldap', 'mapPos', 'seq', 'codeN', 'rseq'];
const MAX_BYTES = 5 * 1024 * 1024;

export function loadState(db) {
  const rows = db.prepare('SELECT kind, id, data FROM docs').all();
  const s = { objs: [], rels: [], users: [], types: {}, history: {}, locs: [], policy: null, feedOn: true, feedSync: true, ldap: null, mapPos: {}, seq: 100, codeN: 0, rseq: 0 };
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
  return s;
}

/* Replaces the stored inventory with the one sent. Logins and sessions are not touched. */
export function saveState(db, s) {
  const bad = msg => { throw new HttpError(400, msg); };
  if (!Array.isArray(s.objs) || !Array.isArray(s.rels) || !Array.isArray(s.users) || !Array.isArray(s.locs)) bad('The inventory must list objects, relations, users and locations.');
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
  const rows = [];
  for (const o of s.objs) rows.push(['object', o.id, o]);
  for (const r of s.rels) rows.push(['rel', String(r.id), r]);
  for (const u of s.users) rows.push(['user', String(u.id), u]);
  for (const [k, t] of Object.entries(s.types)) rows.push(['type', k, t]);
  for (const [k, h] of Object.entries(s.history)) rows.push(['history', k, h]);
  for (const k of SETTING_KEYS) if (s[k] !== undefined) rows.push(['setting', k, s[k]]);
  /* Only the records that changed are written, so a small edit to a large inventory is a small write. */
  const current = new Map(db.prepare('SELECT kind, id, data FROM docs').all().map(r => [r.kind + '\u0000' + r.id, r.data]));
  const wanted = new Set();
  db.exec('BEGIN');
  try {
    const put = db.prepare('INSERT INTO docs (kind, id, data) VALUES (?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data');
    const del = db.prepare('DELETE FROM docs WHERE kind = ? AND id = ?');
    for (const [kind, id, value] of rows) {
      const key = kind + '\u0000' + id;
      wanted.add(key);
      const json = JSON.stringify(value);
      if (current.get(key) !== json) put.run(kind, id, json);
    }
    for (const [key, _] of current) {
      if (!wanted.has(key)) { const [kind, id] = key.split('\u0000'); del.run(kind, id); }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
