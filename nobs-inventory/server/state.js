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
  const ids = s.objs.map(o => o.id);
  if (new Set(ids).size !== ids.length) bad('Two objects have the same id.');
  if (ids.some(id => typeof id !== 'string' || !id)) bad('Every object needs an id.');
  if (JSON.stringify(s).length > MAX_BYTES) throw new HttpError(413, 'The inventory is too large.');
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM docs');
    const put = db.prepare('INSERT INTO docs (kind, id, data) VALUES (?, ?, ?)');
    for (const o of s.objs) put.run('object', o.id, JSON.stringify(o));
    for (const r of s.rels) put.run('rel', String(r.id), JSON.stringify(r));
    for (const u of s.users) put.run('user', String(u.id), JSON.stringify(u));
    for (const [k, t] of Object.entries(s.types)) put.run('type', k, JSON.stringify(t));
    for (const [k, h] of Object.entries(s.history)) put.run('history', k, JSON.stringify(h));
    for (const k of SETTING_KEYS) if (s[k] !== undefined) put.run('setting', k, JSON.stringify(s[k]));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
