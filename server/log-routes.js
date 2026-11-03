/* The log's Restore: one settings change set back from Settings → System → Log, instead of a whole backup. Only a plain
   value the log kept whole (public/js/restore.js); never a secret. It is saved as any change from the page, with a new
   line in the log. Admins only. */
import { dateTimeText } from '../public/js/dates.js';
import { settingPatch, settingRestore } from '../public/js/restore.js';
import { settingDiff } from './audit-diff.js';
import { audit } from './db.js';
import { HttpError } from './errors.js';
import { PAGE_SETTINGS, SETTING_NAMES, applyChanges, settingOf } from './state.js';

/* Adds POST /api/log/restore, for admins: the old value is saved through applyChanges against the current revision (a
   409 when someone saved it at the same moment) and logged as a new change. */
export function registerLogRoutes(app, { db, requireUser, requireAdmin }) {
  /* body { at, setting, path }: the logged change, found again in the log; its old value is read from there, never from the page. */
  app.post('/api/log/restore', requireUser, requireAdmin, (req, res, next) => {
    try {
      const { at, setting, path } = req.body || {};
      if (typeof at !== 'string' || typeof setting !== 'string' || typeof path !== 'string') throw new HttpError(400, 'Name the logged change to set back.');
      const detailOf = d => { try { return JSON.parse(d); } catch { return null; } };
      const found = db.prepare("SELECT detail FROM audit WHERE at = ? AND action LIKE 'setting changed:%'").all(at)
        .map(r => detailOf(r.detail)).find(d => d && d.setting === setting && Array.isArray(d.changes));
      const c = found && found.changes.find(x => x && x.path === path);
      const r = c && settingRestore(setting, c, PAGE_SETTINGS);
      if (!r) throw new HttpError(404, 'This change cannot be set back from the log.');
      const cur = settingOf(db, setting), value = settingPatch(cur, r);
      if (value === undefined || value === null) throw new HttpError(400, 'This change cannot be set back from the log.');
      const rev = (db.prepare("SELECT rev FROM revs WHERE kind = 'setting' AND id = ?").get(setting) || {}).rev ?? 0;
      const result = applyChanges(db, { puts: [{ kind: 'setting', id: setting, value, base: rev }], dels: [] });
      if (result.conflicts.length) throw new HttpError(409, 'The setting was changed at the same moment. Try again.');
      const changes = settingDiff(cur, value);
      if (changes.length) audit(db, req.user.id, `setting changed: ${SETTING_NAMES[setting] || setting}, ${path || 'the value'} restored from ${dateTimeText(at)}`, { setting, changes });
      res.json(result);
    } catch (e) { next(e); }
  });
}
