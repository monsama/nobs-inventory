/* Microsoft Graph certificates made in Settings. The server keeps each one with its private key, sealed with the
   server's secret key (secrets/sheet_key, as the entry sheets), so nobody has to copy a key file or restart the server.
   The key never leaves the server and is not in the inventory or in a backup; the certificate (public) can be downloaded
   any time, to upload it to the Entra app. */
import { HttpError } from './errors.js';
import { openSheet, sealSheet } from './sheets.js';

export function initGraphKeys(db) {
  db.exec('CREATE TABLE IF NOT EXISTS graph_keys (thumbprint TEXT PRIMARY KEY, cert TEXT NOT NULL, key TEXT NOT NULL)');
}
export const storeGraphKey = (db, sealKey, thumbprint, certPem, keyPem) =>
  db.prepare('INSERT OR REPLACE INTO graph_keys (thumbprint, cert, key) VALUES (?, ?, ?)').run(thumbprint, certPem, sealSheet(sealKey, { keyPem }));
export const hasGraphKey = (db, thumbprint) => !!db.prepare('SELECT 1 FROM graph_keys WHERE thumbprint = ?').get(thumbprint);
export function graphCertPem(db, thumbprint) {
  const r = db.prepare('SELECT cert FROM graph_keys WHERE thumbprint = ?').get(thumbprint);
  if (!r) throw new HttpError(404, 'This certificate is not on the server.');
  return r.cert;
}
/* The certificate and key to sign in with, or null when the server does not have them. */
export function graphKeyPair(db, sealKey, thumbprint) {
  const r = thumbprint && db.prepare('SELECT cert, key FROM graph_keys WHERE thumbprint = ?').get(thumbprint);
  if (!r) return null;
  try { return { certPem: r.cert, keyPem: openSheet(sealKey, r.key).keyPem }; } catch { return null; }
}
export const dropGraphKey = (db, thumbprint) => db.prepare('DELETE FROM graph_keys WHERE thumbprint = ?').run(thumbprint);

/* The connection settings made in Settings: the tenant, the app (client) id and the certificate in use. Not secret. */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function graphSettingsProblem(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return 'The Microsoft Graph settings are a record.';
  if (g.tenant && !(GUID.test(g.tenant) || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(g.tenant))) return 'The directory (tenant) ID is a GUID such as 1b2c3d4e-…, or a domain such as contoso.onmicrosoft.com.';
  if (g.clientId && !GUID.test(g.clientId)) return 'The application (client) ID is a GUID such as 1b2c3d4e-5f60-….';
  if (g.thumbprint && !/^[0-9A-F]{40}$/.test(g.thumbprint)) return 'The certificate is named by its thumbprint.';
  return null;
}
