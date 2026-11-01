/* Whether a backup can really be restored, tested weekly (Sundays 03:30) and on request: the newest copy outside the
   server (decrypted with its password), or the newest backup here when there is no copy, is restored into a database
   held in memory, never into the inventory. Then what came back is counted against what the backup holds. The result
   is kept for Settings and Health; only numbers, a file name and a short error, never data of the inventory. */
import fs from 'node:fs';
import path from 'node:path';
import { openDb, writeDoc } from './db.js';
import { getAppSecret } from './app-secrets.js';
import { decryptBackup, exportDir, exportSettings } from './backup-export.js';
import { restoreBackup } from './backup.js';
import { writeBackupFile } from './backup-store.js';
import { loadState } from './state.js';

const OURS = /^nobs-backup-\d{4}-\d{2}-\d{2}-\d{4}\.nobsbak$/;
const getDoc = (db, id, dflt) => { const r = db.prepare("SELECT data FROM docs WHERE kind = 'setting' AND id = ?").get(id); try { return r ? JSON.parse(r.data) : dflt; } catch { return dflt; } };
const putDoc = (db, id, v) => writeDoc(db, 'setting', id, v);
export const lastRestoreTest = db => getDoc(db, 'restoreTest', null);

/* The backup to test: { from: 'copy' | 'backup', name, text }. The copy outside when it is set up and has a file. */
async function newest(db, key, env) {
  const dir = exportDir(env);
  if (dir && exportSettings(db).on) {
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => OURS.test(f)).sort(); } catch { /* the folder is not there: the backups here are tested */ }
    if (files.length) {
      const name = files[files.length - 1], password = getAppSecret(db, key, 'backupExportPassword');
      if (!password) throw new Error('No password is set for the copies outside the server.');
      return { from: 'copy', name, text: decryptBackup(fs.readFileSync(path.join(dir, name)), password) };
    }
  }
  const row = db.prepare('SELECT id, at, reason, data, format FROM backups ORDER BY id DESC LIMIT 1').get();
  if (!row) throw new Error('There is no backup to test yet.');
  let text = '';
  await writeBackupFile(db, row, chunk => { text += chunk; });
  return { from: 'backup', name: `${row.at} (${row.reason})`, text };
}

/* Restores the newest backup into memory and checks it; the result (or the error) is kept and returned. */
export async function runRestoreTest(db, key, env = process.env, now = new Date()) {
  const t0 = Date.now();
  let mem = null, src = null;
  try {
    src = await newest(db, key, env);
    const data = JSON.parse(src.text);
    mem = openDb(':memory:');
    restoreBackup(mem, data, key);
    const got = loadState(mem), want = data.state;
    const photos = Array.isArray(data.photos) ? data.photos.length : 0;
    const gotPhotos = photos ? mem.prepare('SELECT COUNT(*) AS n FROM device_images').get().n : 0;
    const wrong = [['devices', got.objs.length, want.objs.length], ['relations', got.rels.length, want.rels.length], ['photos', gotPhotos, photos]]
      .filter(([, a, b]) => a !== b).map(([what, a, b]) => `${what}: ${a} of ${b} came back`);
    if (wrong.length) throw new Error(wrong.join(', '));
    const r = { at: now.toISOString(), ok: true, from: src.from, name: src.name, objects: got.objs.length, photos, ms: Date.now() - t0 };
    putDoc(db, 'restoreTest', r);
    return r;
  } catch (e) {
    const r = { at: now.toISOString(), ok: false, ...(src ? { from: src.from, name: src.name } : {}), error: String(e.message || e).replace(/\/[^\s]*/g, m => path.basename(m)).slice(0, 300) };
    putDoc(db, 'restoreTest', r);
    throw Object.assign(new Error(r.error), { status: 400 });
  } finally { if (mem) mem.close(); }
}
