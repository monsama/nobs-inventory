/* Passwords set in Settings, such as the directory's service account. Each is sealed with the server's secret key
   (secrets/sheet_key, as the entry sheets and the Graph keys), kept in its own table, and never sent to the page,
   written to a backup or logged. Settings can replace or remove one, never read it back. */
import { openSheet, sealSheet } from './sheets.js';

export function initAppSecrets(db) {
  db.exec('CREATE TABLE IF NOT EXISTS app_secrets (name TEXT PRIMARY KEY, data TEXT NOT NULL, set_at TEXT NOT NULL)');
}
export function setAppSecret(db, key, name, value, now = new Date()) {
  initAppSecrets(db);
  db.prepare('INSERT OR REPLACE INTO app_secrets (name, data, set_at) VALUES (?, ?, ?)').run(name, sealSheet(key, { value: String(value) }), now.toISOString());
}
/* The value, or '' when none is set or it cannot be opened (a different secret key). */
export function getAppSecret(db, key, name) {
  initAppSecrets(db);
  const r = db.prepare('SELECT data FROM app_secrets WHERE name = ?').get(name);
  if (!r) return '';
  try { return String(openSheet(key, r.data).value || ''); } catch { return ''; }
}
/* When it was set, without the value. */
export function appSecretSetAt(db, name) {
  initAppSecrets(db);
  const r = db.prepare('SELECT set_at FROM app_secrets WHERE name = ?').get(name);
  return r ? r.set_at : null;
}
export function dropAppSecret(db, name) {
  initAppSecrets(db);
  db.prepare('DELETE FROM app_secrets WHERE name = ?').run(name);
}
