import crypto from 'node:crypto';

const SESSION_HOURS = 12;   /* a session ends this long after sign-in... */
const IDLE_MINUTES = 120;   /* ...or after this long without any use */
const TOUCH_EVERY_MS = 60e3; /* how often a session's last use is written: not on every request */
const MAX_SESSIONS = 5;   /* per user: a sign-in from another browser does not end this one */
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

/* The rule for a new password: at least 10 characters, not one of the most common passwords, and not the login name.
   Passwords set before this rule stay as they are until they are changed. */
export const PASSWORD_MIN = 12;
const COMMON = ['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyuiop', 'qwerty123', 'iloveyou', 'letmein123', 'welcome123', 'admin123', 'adminadmin', 'changeme', 'changeme1', 'inventory1', 'nobsinventory'];
export function passwordProblem(password, login = '') {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > 256) return 'Use at most 256 characters.';
  const p = password.toLowerCase();
  if (COMMON.includes(p)) return 'That password is too common. Choose another.';
  if (login && p.includes(String(login).toLowerCase()) && String(login).length >= 4) return 'The password must not contain the login name.';
  return '';
}

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
  if (!c) { crypto.scryptSync(password, 'x'.repeat(16), 64); return false; }   /* same work as a real check */
  const h = crypto.scryptSync(password, c.salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(c.hash, 'hex'));
}

export function createSession(db, userId, agent = '') {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires, last, agent) VALUES (?, ?, ?, ?, ?)').run(sha(token), userId, Date.now() + SESSION_HOURS * 3600e3, Date.now(), String(agent).slice(0, 160));
  /* Keep the newest few; the oldest end when a user goes past the limit. */
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY expires DESC LIMIT ?)')
    .run(userId, userId, MAX_SESSIONS);
  return token;
}

export function sessionUserId(db, token) {
  if (!token) return null;
  const now = Date.now();
  const row = db.prepare('SELECT token_hash, user_id, expires, last FROM sessions WHERE token_hash = ?').get(sha(token));
  if (!row || row.expires < now) return null;
  /* Idle for too long: the session ends, and the next sign-in starts a new one. */
  if (row.last != null && now - row.last > IDLE_MINUTES * 60e3){ db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(row.token_hash); return null; }
  if (row.last == null || now - row.last > TOUCH_EVERY_MS) db.prepare('UPDATE sessions SET last = ? WHERE token_hash = ?').run(now, row.token_hash);
  return row.user_id;
}

/* The sessions of one user, for the account screen. The id is a short part of the stored hash, never the token itself. */
export function listSessions(db, userId, currentToken) {
  const current = currentToken ? sha(currentToken) : '';
  return db.prepare('SELECT token_hash, expires, last, agent FROM sessions WHERE user_id = ? AND expires > ? ORDER BY last DESC').all(String(userId), Date.now())
    .map(r => ({ id: r.token_hash.slice(0, 16), last: r.last, expires: r.expires, agent: r.agent || 'Unknown browser', current: r.token_hash === current }));
}
export function endSessionById(db, userId, id) {
  const r = db.prepare('DELETE FROM sessions WHERE user_id = ? AND substr(token_hash, 1, 16) = ?').run(String(userId), String(id));
  return r.changes > 0;
}

/* Ends every session of a user except the one given: a new password signs the old sessions out. */
export function endOtherSessions(db, userId, keepToken) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(String(userId), keepToken ? sha(keepToken) : '');
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
