import crypto from 'node:crypto';

/* The token the Lansweeper push script sends. Only a hash is stored, so the token is shown once, when it is made. */
const digest = s => crypto.createHash('sha256').update(String(s)).digest();

export function feedTokenInfo(db) {
  const row = db.prepare('SELECT created FROM feed_token WHERE id = 1').get();
  return row ? { created: row.created } : null;
}

export function createFeedToken(db) {
  const token = crypto.randomBytes(24).toString('base64url');
  db.prepare('INSERT INTO feed_token (id, hash, created) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET hash = excluded.hash, created = excluded.created')
    .run(digest(token).toString('hex'), new Date().toISOString());
  return token;
}

export function revokeFeedToken(db) {
  db.prepare('DELETE FROM feed_token WHERE id = 1').run();
}

/* True when the given token is the one made in the app, or the one set on the server (NI_FEED_TOKEN). */
export function feedTokenValid(db, given, envToken) {
  if (!given) return false;
  if (envToken && crypto.timingSafeEqual(digest(given), digest(envToken))) return true;
  const row = db.prepare('SELECT hash FROM feed_token WHERE id = 1').get();
  return !!row && crypto.timingSafeEqual(digest(given), Buffer.from(row.hash, 'hex'));
}
