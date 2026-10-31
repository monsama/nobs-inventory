import { DatabaseSync } from 'node:sqlite';
import { ensureBackupStore } from './backup-store.js';

/* One SQLite file. Inventory data is stored as one JSON document per object, relation, user, type and setting,
   so the screens can keep their shape while the storage becomes a real database. Logins and sessions have their own tables. */
export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS docs (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (kind, id));
    CREATE TABLE IF NOT EXISTS revs (kind TEXT NOT NULL, id TEXT NOT NULL, rev INTEGER NOT NULL, PRIMARY KEY (kind, id));
    CREATE TABLE IF NOT EXISTS credentials (user_id TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS feed_token (id INTEGER PRIMARY KEY CHECK (id = 1), hash TEXT NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS plan_images (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS backups (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, reason TEXT NOT NULL, objects INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
    CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires);
  `);
  /* Added after the first version: when a session was last used, and the browser that signed in. */
  const cols = db.prepare('PRAGMA table_info(sessions)').all().map(c => c.name);
  if (!cols.includes('last')) db.exec('ALTER TABLE sessions ADD COLUMN last INTEGER');
  if (!cols.includes('agent')) db.exec("ALTER TABLE sessions ADD COLUMN agent TEXT NOT NULL DEFAULT ''");
  /* Added in 0.9.67: what a settings change changed, before and after (JSON), shown under its log line. */
  if (!db.prepare('PRAGMA table_info(audit)').all().some(c => c.name === 'detail')) db.exec('ALTER TABLE audit ADD COLUMN detail TEXT');
  /* Added in 0.9.75: backups kept as parts, and the device photos (server/backup-store.js, server/device-images.js). */
  ensureBackupStore(db);
  return db;
}

export function audit(db, userId, action, detail = null) {
  db.prepare('INSERT INTO audit (at, user_id, action, detail) VALUES (?, ?, ?, ?)').run(new Date().toISOString(), userId ?? null, action, detail == null ? null : JSON.stringify(detail));
  /* Keep the last 20,000 entries; older ones are removed when the log grows. */
  if (Math.random() < 0.01) db.prepare('DELETE FROM audit WHERE id <= (SELECT MAX(id) - 20000 FROM audit)').run();
}
