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
  /* Added in 0.9.80: a running number on every record's revision, so a page asks only for what changed since its copy
     (GET /api/state?since=). A trigger sets it on every write, whichever code writes. */
  if (!db.prepare('PRAGMA table_info(revs)').all().some(c => c.name === 'seq')) {
    db.exec('ALTER TABLE revs ADD COLUMN seq INTEGER NOT NULL DEFAULT 0; UPDATE revs SET seq = rowid;');
  }
  db.exec(`CREATE INDEX IF NOT EXISTS revs_seq ON revs (seq);
    CREATE TRIGGER IF NOT EXISTS revs_seq_ins AFTER INSERT ON revs BEGIN UPDATE revs SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM revs) WHERE rowid = NEW.rowid; END;
    CREATE TRIGGER IF NOT EXISTS revs_seq_upd AFTER UPDATE OF rev ON revs BEGIN UPDATE revs SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM revs) WHERE rowid = NEW.rowid; END;`);
  return db;
}

/* A record written outside a full save (a run's result, a sign-in): stored, and its revision raised when it changed, so
   pages that copy only what changed since (and the conflict check) see it. */
export function writeDoc(db, kind, id, value) {
  const json = JSON.stringify(value);
  const cur = db.prepare('SELECT data FROM docs WHERE kind = ? AND id = ?').get(kind, String(id));
  if (cur && cur.data === json) return false;
  db.prepare('INSERT INTO docs (kind, id, data) VALUES (?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data').run(kind, String(id), json);
  db.prepare('INSERT INTO revs (kind, id, rev) VALUES (?, ?, 1) ON CONFLICT(kind, id) DO UPDATE SET rev = rev + 1').run(kind, String(id));
  return true;
}

export function audit(db, userId, action, detail = null) {
  db.prepare('INSERT INTO audit (at, user_id, action, detail) VALUES (?, ?, ?, ?)').run(new Date().toISOString(), userId ?? null, action, detail == null ? null : JSON.stringify(detail));
  /* Keep the last 20,000 entries; older ones are removed when the log grows, but never one of the last 90 days. */
  if (Math.random() < 0.01) db.prepare('DELETE FROM audit WHERE id <= (SELECT MAX(id) - 20000 FROM audit) AND at < ?').run(new Date(Date.now() - 90 * 864e5).toISOString());
}
