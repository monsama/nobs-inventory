/* A copy of the backups outside the server, optional: each night (and on request) the inventory is written as one
   encrypted file to a folder the server names with NI_BACKUP_EXPORT_DIR, a share mounted on the host. Only the server
   decides where (a page cannot point the server at another folder); an admin turns it on in Settings and gives the
   password the files are encrypted with. The password is kept encrypted on the server, never sent back, and is not in
   any backup: keep it apart, it is needed to restore from such a file.
   File: NOBSENC1, salt (16), IV (12), the backup's JSON gzipped and encrypted with AES-256-GCM (key from the password
   with scrypt), the tag (16). scripts/decrypt-backup.mjs turns one back into the JSON on any computer. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { once } from 'node:events';
import { getAppSecret } from './app-secrets.js';
import { takeBackup } from './backup.js';
import { writeBackupFile } from './backup-store.js';

export const MAGIC = Buffer.from('NOBSENC1');
export const EXT = '.nobsbak';
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const PASSWORD_MIN = 12;
const keyOf = (password, salt) => crypto.scryptSync(String(password), salt, 32, SCRYPT);

/* The folder the server allows, or null: set and absolute, nothing else. */
export function exportDir(env = process.env) {
  const d = String(env.NI_BACKUP_EXPORT_DIR || '').trim();
  return d && path.isAbsolute(d) ? path.resolve(d) : null;
}

/* Writes the encrypted file at file; write(chunkFn) gives the backup's text piece by piece (writeBackupFile). */
export async function writeEncrypted(file, password, produce) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyOf(password, salt), iv);
  const src = new PassThrough();
  const out = fs.createWriteStream(file, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, salt, iv]));
  const done = pipeline(src, zlib.createGzip({ level: 6 }), cipher, out);
  await produce(async chunk => { if (!src.write(chunk)) await once(src, 'drain'); });
  src.end();
  await done;
  fs.appendFileSync(file, cipher.getAuthTag());
}

/* The backup's JSON text from an encrypted file's bytes; a wrong password or a changed file is refused. */
export function decryptBackup(buf, password) {
  if (!Buffer.isBuffer(buf) || buf.length < MAGIC.length + 44 || !buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('This is not an encrypted backup of NOBS Inventory.');
  const salt = buf.subarray(8, 24), iv = buf.subarray(24, 36), tag = buf.subarray(buf.length - 16), body = buf.subarray(36, buf.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', keyOf(password, salt), iv);
  d.setAuthTag(tag);
  let plain;
  try { plain = Buffer.concat([d.update(body), d.final()]); } catch { throw new Error('The password is wrong, or the file was changed.'); }
  return zlib.gunzipSync(plain).toString('utf8');
}
export const isEncryptedBackup = buf => Buffer.isBuffer(buf) && buf.length > 8 && buf.subarray(0, 8).equals(MAGIC);

const stamp = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
const OURS = /^nobs-backup-\d{4}-\d{2}-\d{2}-\d{4}\.nobsbak$/;

/* One copy: written under a temporary name and then renamed, so a half-written file never looks like a backup; the
   oldest of the app's own files beyond keep are removed (nothing else in the folder is touched). */
export async function exportOnce(dir, password, produce, { keep = 14, now = new Date() } = {}) {
  if (!dir) throw new Error('No folder is set on the server (NI_BACKUP_EXPORT_DIR).');
  if (!password) throw new Error('No password is set for the copies: set it in Settings → Maintenance.');
  fs.accessSync(dir, fs.constants.W_OK);
  const name = `nobs-backup-${stamp(now)}${EXT}`, tmp = path.join(dir, `.${name}.part`), file = path.join(dir, name);
  try { await writeEncrypted(tmp, password, produce); fs.renameSync(tmp, file); }
  catch (e) { try { fs.rmSync(tmp, { force: true }); } catch { /* gone */ } throw e; }
  const mine = fs.readdirSync(dir).filter(f => OURS.test(f)).sort();
  for (const f of mine.slice(0, Math.max(0, mine.length - Math.max(1, keep)))) { try { fs.rmSync(path.join(dir, f)); } catch { /* left */ } }
  return { file: name, bytes: fs.statSync(file).size, kept: Math.min(mine.length, Math.max(1, keep)) };
}

/* Settings and the last run: kept as their own documents, not in the page's state (the page cannot change them by a save). */
const getDoc = (db, id, dflt) => { const r = db.prepare("SELECT data FROM docs WHERE kind = 'setting' AND id = ?").get(id); try { return r ? JSON.parse(r.data) : dflt; } catch { return dflt; } };
const putDoc = (db, id, v) => db.prepare("INSERT INTO docs (kind, id, data) VALUES ('setting', ?, ?) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data").run(id, JSON.stringify(v));
export const exportSettings = db => ({ on: false, keep: 14, ...getDoc(db, 'backupExport', {}) });
export const saveExportSettings = (db, v) => putDoc(db, 'backupExport', { on: !!v.on, keep: Math.min(365, Math.max(1, Math.floor(Number(v.keep) || 14))) });
export const lastExport = db => getDoc(db, 'backupExportRun', null);
export const recordExport = (db, r) => putDoc(db, 'backupExportRun', r);

/* Takes a backup and writes it as the copy outside; the result (or the error) is kept for Settings and Health. */
export async function runExport(db, key, env = process.env, now = new Date()) {
  const dir = exportDir(env), set = exportSettings(db);
  try {
    const password = getAppSecret(db, key, 'backupExportPassword');
    if (!dir) throw new Error('No folder is set on the server (NI_BACKUP_EXPORT_DIR).');
    if (!password) throw new Error('No password is set for the copies: set it in Settings → Maintenance.');
    const id = takeBackup(db, 'for the copy outside the server');
    const row = db.prepare('SELECT data, format FROM backups WHERE id = ?').get(id);
    const r = await exportOnce(dir, password, w => writeBackupFile(db, row, w), { keep: set.keep, now });
    recordExport(db, { at: now.toISOString(), ok: true, ...r });
    return r;
  } catch (e) {
    recordExport(db, { at: now.toISOString(), ok: false, error: String(e.message || e).replace(/\/[^\s]*/g, m => path.basename(m)).slice(0, 300) });
    throw e;
  }
}
