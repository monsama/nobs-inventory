import crypto from 'node:crypto';

const SESSION_HOURS = 12;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}

export function setPassword(db, userId, password) {
  const { salt, hash } = hashPassword(password);
  db.prepare('INSERT INTO credentials (user_id, salt, hash) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET salt = excluded.salt, hash = excluded.hash')
    .run(userId, salt, hash);
}

export function hasPassword(db, userId) {
  return !!db.prepare('SELECT 1 FROM credentials WHERE user_id = ?').get(userId);
}

export function checkLocalPassword(db, userId, password) {
  const c = db.prepare('SELECT salt, hash FROM credentials WHERE user_id = ?').get(userId);
  if (!c) return false;
  const h = crypto.scryptSync(password, c.salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(c.hash, 'hex'));
}

export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)').run(sha(token), userId, Date.now() + SESSION_HOURS * 3600e3);
  return token;
}

export function sessionUserId(db, token) {
  if (!token) return null;
  const row = db.prepare('SELECT user_id, expires FROM sessions WHERE token_hash = ?').get(sha(token));
  if (!row || row.expires < Date.now()) return null;
  return row.user_id;
}

export function endSession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
}

export function readCookie(header, name) {
  for (const part of (header || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
