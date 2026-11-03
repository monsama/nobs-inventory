/* Backups: the list, by hand, download, restore (from the list, a file or an encrypted copy), delete, the copy outside
   the server and the restore test. Split out of app.js. */
import express from 'express';
import { audit } from './db.js';
import { PASSWORD_MIN, decryptBackup, exportSet, exportWhere, exportSettings, isEncryptedBackup, lastExport, runExport, saveExportSettings } from './backup-export.js';
import { lastRestoreTest, runRestoreTest } from './restore-test.js';
import { BEFORE_CLEAR, autoBackup, takeBackup, restoreBackup } from './backup.js';
import { backupPhotos, backupStorage, collectParts, loadBackup, writeBackupFile } from './backup-store.js';
import { getAppSecret, setAppSecret, appSecretSetAt } from './app-secrets.js';
import { HttpError } from './errors.js';

/* Adds the backup routes, all for admins: /api/backups (list, take one, download, restore from the list, a file or an
   encrypted copy, delete), the copy outside the server (/api/backup-export: settings, password, copy now) and the
   restore test. Every restore takes a backup first. It also puts restoreTest on app.locals for the scheduler. */
export function registerBackupRoutes(app, ctx) {
  const { db, requireUser, requireAdmin, SECRET_KEY, SHEET_KEY } = ctx;
  /* Backups: the list, a new one by hand, download, restore (from the list or from a file), and delete. Admins only. */
  app.get('/api/backups', requireUser, requireAdmin, (req, res) => {
    res.json({ backups: db.prepare('SELECT id, at, reason, objects, COALESCE(size, LENGTH(data)) AS bytes FROM backups ORDER BY id DESC').all(), storage: backupStorage(db) });
  });
  app.post('/api/backups', requireUser, requireAdmin, (req, res, next) => {
    try {
      /* The page takes one before a contact import: an automatic backup (it follows the setting and is pushed out in time). */
      if (req.body?.reason === 'before a contact import') { const id = autoBackup(db, 'before a contact import'); res.json({ id }); return; }
      /* Before the inventory is cleared: always taken, whatever the setting, and kept like one taken by hand. */
      if (req.body?.reason === BEFORE_CLEAR) { const id = takeBackup(db, BEFORE_CLEAR); audit(db, req.user.id, 'backup taken before clearing the inventory'); res.json({ id }); return; }
      const id = takeBackup(db, 'by hand'); audit(db, req.user.id, 'backup taken by hand'); res.json({ id });
    }
    catch (e) { next(e); }
  });
  app.get('/api/backups/:id/download', requireUser, requireAdmin, async (req, res, next) => {
    try {
      const row = db.prepare('SELECT at, data, format FROM backups WHERE id = ?').get(Number(req.params.id));
      if (!row) throw new HttpError(404, 'No such backup.');
      /* The whole backup as one file, the photos in it, written part by part. */
      res.attachment(`nobs-backup-${row.at.slice(0, 19).replace(/[:T]/g, '-')}.json`).type('application/json');
      /* Waits whenever the connection holds enough, so a slow download never piles the photos up in memory. */
      await writeBackupFile(db, row, chunk => res.write(chunk) || res.destroyed ? null : new Promise(r => { res.once('drain', r); res.once('close', r); }));
      res.end();
    } catch (e) { next(e); }
  });
  app.post('/api/backups/:id/restore', requireUser, requireAdmin, (req, res, next) => {
    try {
      const row = db.prepare('SELECT data, format FROM backups WHERE id = ?').get(Number(req.params.id));
      if (!row) throw new HttpError(404, 'No such backup.');
      /* The photos are read one at a time while they are put back; the backup before the restore leaves the parts in
         place until the restore is done. */
      const data = loadBackup(db, row, { photos: false });
      takeBackup(db, 'before a restore', { gc: false });
      restoreBackup(db, data, SHEET_KEY, { photosFrom: () => backupPhotos(db, row) });
      collectParts(db);
      audit(db, req.user.id, 'restored backup ' + req.params.id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  app.post('/api/backups/restore-file', requireUser, requireAdmin, (req, res, next) => {
    try {
      let data;
      try { data = JSON.parse(typeof req.body === 'string' ? req.body : ''); } catch { throw new HttpError(400, 'This file is not a backup of NOBS Inventory.'); }
      takeBackup(db, 'before a restore from file');
      restoreBackup(db, data, SHEET_KEY);
      audit(db, req.user.id, 'restored a backup from a file');
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  /* The copy outside the server (server/backup-export.js): only when the server names a folder. */
  const exportInfo = () => ({ dir: exportSet(), where: exportWhere(), ...exportSettings(db), passwordSet: appSecretSetAt(db, 'backupExportPassword') || '', last: lastExport(db), passwordMin: PASSWORD_MIN, restoreTest: lastRestoreTest(db) });
  /* The restore test (server/restore-test.js): weekly from the scheduler, and on request here. */
  app.locals.restoreTest = now => runRestoreTest(db, SECRET_KEY, process.env, now);
  app.post('/api/restore-test', requireUser, requireAdmin, async (req, res, next) => {
    try { const r = await runRestoreTest(db, SECRET_KEY); audit(db, req.user.id, `restore test: ${r.objects} devices came back`); res.json(exportInfo()); }
    catch (e) { audit(db, req.user.id, 'restore test failed: ' + e.message); next(e); }
  });
  app.get('/api/backup-export', requireUser, requireAdmin, (req, res) => res.set('Cache-Control', 'no-store').json(exportInfo()));
  app.put('/api/backup-export', requireUser, requireAdmin, (req, res, next) => {
    try {
      const b = req.body || {};
      if (b.on && !exportSet()) throw new HttpError(400, 'Nowhere is set on the server: set NI_BACKUP_EXPORT_DIR, NI_BACKUP_EXPORT_AZURE_URL or NI_BACKUP_EXPORT_S3_URL first.');
      const before = exportSettings(db);
      saveExportSettings(db, { ...before, ...('on' in b ? { on: !!b.on } : {}), ...('keep' in b ? { keep: b.keep } : {}) });
      const after = exportSettings(db);
      audit(db, req.user.id, `copy of the backups outside the server: ${after.on ? 'on' : 'off'}, keep ${after.keep}`);
      res.json(exportInfo());
    } catch (e) { next(e); }
  });
  app.post('/api/backup-export/password', requireUser, requireAdmin, (req, res, next) => {
    try {
      const pw = req.body && typeof req.body.password === 'string' ? req.body.password : '';
      if (pw.length < PASSWORD_MIN) throw new HttpError(400, `The password needs at least ${PASSWORD_MIN} characters.`);
      if (pw.length > 256) throw new HttpError(400, 'The password is longer than 256 characters.');
      setAppSecret(db, SECRET_KEY, 'backupExportPassword', pw);
      audit(db, req.user.id, 'password of the backup copies set');
      res.json(exportInfo());
    } catch (e) { next(e); }
  });
  app.post('/api/backup-export/run', requireUser, requireAdmin, async (req, res, next) => {
    try { const r = await runExport(db, SECRET_KEY); audit(db, req.user.id, `backup copied outside the server: ${r.file}`); res.json(exportInfo()); }
    catch (e) { audit(db, req.user.id, 'copy of the backups outside the server failed: ' + (lastExport(db) || {}).error); next(new HttpError(400, (lastExport(db) || {}).error || e.message)); }
  });
  /* An encrypted copy restored: its password typed in, or the one set here. */
  app.post('/api/backups/restore-encrypted', requireUser, requireAdmin, express.raw({ type: 'application/octet-stream', limit: '200mb', inflate: false }), (req, res, next) => {
    try {
      const pw = String(req.get('x-backup-password') || '') || getAppSecret(db, SECRET_KEY, 'backupExportPassword');
      if (!isEncryptedBackup(req.body)) throw new HttpError(400, 'This is not an encrypted backup of NOBS Inventory.');
      let data;
      try { data = JSON.parse(decryptBackup(req.body, pw)); } catch (e) { throw new HttpError(400, e.message); }
      takeBackup(db, 'before a restore from file');
      restoreBackup(db, data, SHEET_KEY);
      audit(db, req.user.id, 'restored an encrypted backup from a file');
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  app.delete('/api/backups/:id', requireUser, requireAdmin, (req, res, next) => {
    try { db.prepare('DELETE FROM backups WHERE id = ?').run(Number(req.params.id)); collectParts(db); audit(db, req.user.id, 'backup deleted'); res.json({ ok: true }); }
    catch (e) { next(e); }
  });
}
