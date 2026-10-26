import { openSheet, sealSheet } from './sheets.js';
import { loadState, saveState, settingOf, SETTING_KEYS, CONNECTION_SETTINGS, blankState } from './state.js';
import { HttpError } from './errors.js';
import { migrateState } from './migrate.js';

/* Backups of the whole inventory: the devices, relations, history, types, settings, floor-plan images and the users
   (never the passwords). Taken by hand and before what changes much at once: a Lansweeper sync, push or import, an LDAP
   or Graph sync, adding Graph, applying type rules, and a restore. The newest are kept (Settings → Backups). */
const KEEP_DEFAULT = 10;
const COUNTERS = ['seq', 'codeN', 'rseq'];
/* How backups are taken is not part of the inventory: a restore of an old backup never switches them off or keeps fewer. */
const BACKUP_SETTINGS = ['autoBackups', 'backupKeep'];

/* A backup taken by the app itself, before one of the changes above. Off when the setting "Automatic backups" is off.
   daily: at most one a day for this reason (a sync that runs every few hours). */
export function autoBackup(db, reason, { daily = false } = {}) {
  if (settingOf(db, 'autoBackups') === false) return null;
  /* A sync that runs every few hours backs up once a day, so its backups do not push the older ones out. */
  if (daily && db.prepare("SELECT 1 FROM backups WHERE reason = ? AND at > ?").get(reason, new Date(Date.now() - 864e5).toISOString())) return null;
  return takeBackup(db, reason);
}
export function takeBackup(db, reason) {
  const s = loadState(db);
  const keep = Number(s.backupKeep) > 0 ? Math.min(100, Math.floor(Number(s.backupKeep))) : KEEP_DEFAULT;
  const settings = Object.fromEntries(SETTING_KEYS.filter(k => s[k] !== undefined).map(k => [k, s[k]]));
  const data = {
    version: 1,
    created: new Date().toISOString(),
    reason,
    state: { objs: s.objs, rels: s.rels, users: s.users, types: s.types, history: s.history, settings },
    planImages: db.prepare('SELECT id, data FROM plan_images').all(),
    /* Entry sheets as they are stored: sealed. The key is not in the backup, so a backup alone opens none of them. */
    sheets: db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sheets'").get() ? db.prepare('SELECT * FROM sheets').all() : []
  };
  const info = db.prepare('INSERT INTO backups (at, reason, objects, data) VALUES (?, ?, ?, ?)').run(data.created, reason, s.objs.length, JSON.stringify(data));
  db.prepare('DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY id DESC LIMIT ?)').run(keep);
  return Number(info.lastInsertRowid);
}

/* Puts a backup back. The users are kept (a backup adds the users it has that are missing now), and the number
   counters only go up, so no code is given out twice. The current state is backed up first by the caller. */
export function restoreBackup(db, data, sheetKey = null) {
  if (!data || data.version !== 1 || !data.state) throw new HttpError(400, 'This file is not a backup of NOBS Inventory.');
  const b = data.state;
  if (!Array.isArray(b.objs) || !Array.isArray(b.rels) || !Array.isArray(b.users) || !b.types || !b.history) throw new HttpError(400, 'The backup is incomplete.');
  /* The plan pictures are checked the same way an upload is, before anything is written. */
  const images = Array.isArray(data.planImages) ? data.planImages : [];
  for (const im of images) {
    if (!im || typeof im.id !== 'string' || typeof im.data !== 'string' || im.data.length > 2000000 || !/^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(im.data))
      throw new HttpError(400, 'The backup has a plan picture that is not a PNG, JPEG, GIF or WebP image.');
  }
  if (new Set(images.map(im => im.id)).size !== images.length) throw new HttpError(400, 'The backup has two plan pictures for the same plan.');
  const cur = loadState(db);
  const st = b.settings || {};
  const blank = blankState();
  const s = { ...cur, objs: b.objs, rels: b.rels, history: b.history, types: b.types };
  /* An account of the backup that is not here (deleted since, or a new server) comes back switched off and without a password,
     never with old sign-ins: an admin switches them on again, and a directory user is switched on by the next LDAP sync
     when still in the group. A login now used by another account is not taken twice. */
  const users = new Map(cur.users.map(u => [String(u.id), u]));
  const logins = new Set(cur.users.map(u => String(u.login || '').toLowerCase()).filter(Boolean));
  for (const u of b.users) {
    if (users.has(String(u.id))) continue;
    const login = String(u.login || '').toLowerCase();
    if (login && logins.has(login)) continue;
    if (login) logins.add(login);
    /* People without a login (device owners from Lansweeper) are not accounts: they come back as they were. */
    const back = login ? { ...u, active: false } : u;
    if (login && u.source === 'ldap' && u.active !== false) back.syncOff = true;
    users.set(String(u.id), back);
  }
  s.users = [...users.values()];
  /* Every setting is put back as it was, and one the backup does not have goes back to how a new server starts. The
     connections (LDAP, Graph and its certificates, the Lansweeper API) stay as they are now: their keys and passwords
     are not in a backup, so the backup's would not work. A server with no connection at all (a new one) takes the
     backup's. */
  const freshServer = CONNECTION_SETTINGS.every(k => cur[k] === undefined || cur[k] === null);
  for (const k of SETTING_KEYS) {
    if (COUNTERS.includes(k) || BACKUP_SETTINGS.includes(k)) continue;
    if (CONNECTION_SETTINGS.includes(k) && !freshServer) continue;
    if (st[k] !== undefined) s[k] = st[k]; else if (k in blank) s[k] = blank[k]; else delete s[k];
  }
  const codeOf = o => parseInt(String(o.code || '').replace(/\D/g, ''), 10) || 0;
  s.codeN = Math.max(cur.codeN || 0, st.codeN || 0, ...b.objs.map(codeOf));
  s.seq = Math.max(cur.seq || 0, st.seq || 0);
  s.rseq = Math.max(cur.rseq || 0, st.rseq || 0);
  delete s.revs; delete s.empty;
  migrateState(s);
  saveState(db, s);
  db.prepare('DELETE FROM plan_images').run();
  const put = db.prepare('INSERT INTO plan_images (id, data) VALUES (?, ?)');
  for (const im of images) put.run(im.id, im.data);
  /* Entry sheets: those missing here are added; one that is here is kept as it is, so an older backup cannot bring back
     a password that was removed from a sheet since. A sheet added back never brings its password: it was deleted here
     (or this is another server), so the password is taken out, and a sheet that cannot be opened to do that is left out. */
  const sheets = Array.isArray(data.sheets) ? data.sheets.filter(r => r && ['id', 'user_id', 'created', 'by', 'data'].every(k => typeof r[k] === 'string') && ['kept', 'changed', 'expired'].includes(r.password)) : [];
  if (sheets.length) {
    db.exec(`CREATE TABLE IF NOT EXISTS sheets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created TEXT NOT NULL, by TEXT NOT NULL, password TEXT NOT NULL, data TEXT NOT NULL)`);
    const add = db.prepare('INSERT OR IGNORE INTO sheets (id, user_id, created, by, password, data) VALUES (?, ?, ?, ?, ?, ?)');
    const have = new Set(db.prepare('SELECT id FROM sheets').all().map(r => r.id));
    for (const r of sheets) {
      if (have.has(r.id)) continue;
      let { password, data: sealed } = r;
      if (password === 'kept') {
        try { const sheet = openSheet(sheetKey, sealed); delete sheet.password; sealed = sealSheet(sheetKey, sheet); password = 'expired'; }
        catch { continue; }
      }
      add.run(r.id, r.user_id, r.created, r.by, password, sealed);
    }
  }
}
