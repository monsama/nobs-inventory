/* Read-only access for other tools (monitoring, helpdesk, Excel Power Query): tokens an admin makes in Settings, each
   with a name, shown once and kept only as a hash. A token reads the device list and nothing else: no history, no
   settings, no secrets; people's names only when the token was made with them. Each use is noted (at most once a
   minute), and a token can be revoked at any time. */
import crypto from 'node:crypto';

const digest = s => crypto.createHash('sha256').update(String(s)).digest('hex');
export const TOKEN_PREFIX = 'nobs_';

export function ensureApiTokens(db) {
  db.exec('CREATE TABLE IF NOT EXISTS api_tokens (id TEXT PRIMARY KEY, name TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, people INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, by TEXT NOT NULL, used TEXT)');
}
const row = r => ({ id: r.id, name: r.name, people: !!r.people, created: r.created, by: r.by, used: r.used || '' });
export const listApiTokens = db => { ensureApiTokens(db); return db.prepare('SELECT * FROM api_tokens ORDER BY created DESC').all().map(row); };

export function createApiToken(db, { name, people = false }, by, now = new Date()) {
  ensureApiTokens(db);
  const n = String(name || '').trim().slice(0, 80);
  if (!n) throw Object.assign(new Error('Give the token a name: what uses it.'), { status: 400 });
  if (db.prepare('SELECT COUNT(*) AS n FROM api_tokens').get().n >= 50) throw Object.assign(new Error('There are 50 tokens already: revoke some first.'), { status: 400 });
  const token = TOKEN_PREFIX + crypto.randomBytes(30).toString('base64url'), id = 't' + crypto.randomBytes(6).toString('hex');
  db.prepare('INSERT INTO api_tokens (id, name, hash, people, created, by) VALUES (?, ?, ?, ?, ?, ?)').run(id, n, digest(token), people ? 1 : 0, now.toISOString(), String(by || ''));
  return { token, info: row(db.prepare('SELECT * FROM api_tokens WHERE id = ?').get(id)) };
}
export function revokeApiToken(db, id) { ensureApiTokens(db); return db.prepare('DELETE FROM api_tokens WHERE id = ?').run(String(id)).changes > 0; }

/* The token's record when given is a valid token, else null; its use is noted at most once a minute. */
export function checkApiToken(db, given, now = new Date()) {
  if (!given || !String(given).startsWith(TOKEN_PREFIX) || String(given).length > 200) return null;
  ensureApiTokens(db);
  const r = db.prepare('SELECT * FROM api_tokens WHERE hash = ?').get(digest(given));
  if (!r) return null;
  if (!r.used || now - Date.parse(r.used) > 60000) db.prepare('UPDATE api_tokens SET used = ? WHERE id = ?').run(now.toISOString(), r.id);
  return row(r);
}

/* A device as the API gives it: what the Table shows, plain. */
export function apiDevice(o, s, { people = false } = {}) {
  const users = new Map((s.users || []).map(u => [u.id, u]));
  const u = o.uid ? users.get(o.uid) : null;
  const typeLabel = (s.types && s.types[o.type] && s.types[o.type].label) || o.type;
  return {
    id: o.id, code: o.code || '', name: o.name || '', type: o.type, typeLabel, model: o.model || '', serial: o.serial || '', status: o.status || '',
    location: o.loc || '', ip: o.ip || '', mac: o.mac || '', os: o.os || '', purchased: o.purchased || '', warranty: o.warranty || '',
    ...(people ? { user: (u && u.name) || o.user || '', department: (u && u.dept) || '' } : {}),
    intune: o.graph && !o.graph.gone ? { compliance: o.graph.compliance || '', encrypted: o.graph.encrypted || '', lastCheckIn: o.graph.lastCheckIn || '' } : null,
  };
}
export const csvCellApi = v => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",;\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
