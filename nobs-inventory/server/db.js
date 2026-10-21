import { DatabaseSync } from 'node:sqlite';

/* One SQLite file. Inventory data is stored as one JSON document per object, relation, user, type and setting,
   so the screens can keep their shape while the storage becomes a real database. Logins and sessions have their own tables. */
export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS docs (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (kind, id));
    CREATE TABLE IF NOT EXISTS credentials (user_id TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL);
  `);
  return db;
}

export function audit(db, userId, action) {
  db.prepare('INSERT INTO audit (at, user_id, action) VALUES (?, ?, ?)').run(new Date().toISOString(), userId ?? null, action);
}
