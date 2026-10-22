import { loadState, saveState, SETTING_KEYS } from './state.js';
import { HttpError } from './errors.js';

/* Backups of the whole inventory: the devices, relations, history, types, settings, floor-plan images and the users
   (never the passwords). Taken before every Lansweeper sync, push and import, and by hand. The newest are kept. */
const KEEP = 10;
const COUNTERS = ['seq', 'codeN', 'rseq'];

export function takeBackup(db, reason) {
  const s = loadState(db);
  const settings = Object.fromEntries(SETTING_KEYS.filter(k => s[k] !== undefined).map(k => [k, s[k]]));
  const data = {
    version: 1,
    created: new Date().toISOString(),
    reason,
    state: { objs: s.objs, rels: s.rels, users: s.users, types: s.types, history: s.history, settings },
    planImages: db.prepare('SELECT id, data FROM plan_images').all()
  };
  const info = db.prepare('INSERT INTO backups (at, reason, objects, data) VALUES (?, ?, ?, ?)').run(data.created, reason, s.objs.length, JSON.stringify(data));
  db.prepare('DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY id DESC LIMIT ?)').run(KEEP);
  return Number(info.lastInsertRowid);
}

/* Puts a backup back. The users are kept (a backup adds the users it has that are missing now), and the number
   counters only go up, so no code is given out twice. The current state is backed up first by the caller. */
export function restoreBackup(db, data) {
  if (!data || data.version !== 1 || !data.state) throw new HttpError(400, 'This file is not a backup of NOBS Inventory.');
  const b = data.state;
  if (!Array.isArray(b.objs) || !Array.isArray(b.rels) || !Array.isArray(b.users) || !b.types || !b.history) throw new HttpError(400, 'The backup is incomplete.');
  const cur = loadState(db);
  const st = b.settings || {};
  const s = { ...cur, objs: b.objs, rels: b.rels, history: b.history, types: b.types };
  const users = new Map(cur.users.map(u => [String(u.id), u]));
  for (const u of b.users) if (!users.has(String(u.id))) users.set(String(u.id), u);
  s.users = [...users.values()];
  for (const k of SETTING_KEYS) if (st[k] !== undefined && !COUNTERS.includes(k)) s[k] = st[k];
  const codeOf = o => parseInt(String(o.code || '').replace(/\D/g, ''), 10) || 0;
  s.codeN = Math.max(cur.codeN || 0, st.codeN || 0, ...b.objs.map(codeOf));
  s.seq = Math.max(cur.seq || 0, st.seq || 0);
  s.rseq = Math.max(cur.rseq || 0, st.rseq || 0);
  delete s.revs; delete s.empty;
  saveState(db, s);
  db.prepare('DELETE FROM plan_images').run();
  const put = db.prepare('INSERT INTO plan_images (id, data) VALUES (?, ?)');
  for (const im of data.planImages || []) put.run(String(im.id), String(im.data));
}
