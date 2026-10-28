/* Entry sheets: what a person gets on their first day, their devices and the initial password of their Windows (AD)
   account, printed and signed. IT sets that password in AD with "must change at next sign-in"; this app never writes
   to AD.

   A sheet is kept so it can be printed again, encrypted (AES-256-GCM) with a key that is not in the database and not
   in any backup: secrets/sheet_key (NI_SHEET_KEY_FILE), or else a key file in the data folder. The password is wiped
   from the kept sheet once it is marked as changed, and at the latest after PASSWORD_DAYS days; the rest stays. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readSecret } from './secrets.js';
import { HttpError } from './errors.js';

export const PASSWORD_DAYS = 14;
/* The names of the built-in types, as the page shows them (TYPES in public/js/01-core.js). A type of one's own has its label in the state. */
const TYPE_LABELS = { pc: 'PC', notebook: 'Notebook', camera: 'Camera / Recorder', bmc: 'iLO / iDRAC', server: 'Server', vm: 'Virtual machine', accesspoint: 'Access point', sip: 'VoIP phone', pbx: 'Telephone system',
  monitor: 'Monitor', switch: 'Switch', printer: 'Printer', patch: 'Patch panel', router: 'Router', firewall: 'Firewall', modem: 'Modem', storage: 'Storage',
  android: 'Android device', ios: 'iOS device', mobile: 'Other mobile device', plc: 'PLC / Controller', rack: 'Rack', other: 'Other' };

/* The key: from the secret when set, else a key file made once in the data folder. Any text works; it is hashed to 32 bytes. */
export function sheetKeyOf(env, dataDir) {
  let text = readSecret(env, 'NI_SHEET_KEY');
  if (!text) {
    const file = path.join(dataDir, 'sheet.key');
    if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
    text = fs.readFileSync(file, 'utf8').trim();
  }
  return crypto.createHash('sha256').update(text).digest();
}

export function sealSheet(key, value) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}
export function openSheet(key, sealed) {
  const raw = Buffer.from(sealed, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  try { return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')); }
  catch { throw new HttpError(500, 'This sheet cannot be read with the server\'s sheet key. Was the key replaced?'); }
}

/* An initial password: four groups of four, with upper and lower case and digits, without letters that are easily
   misread (0/O, 1/l/I). About 90 bits, and it meets the Active Directory complexity rule. */
const LOWER = 'abcdefghijkmnpqrstuvwxyz', UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ', DIGIT = '23456789', ALL = LOWER + UPPER + DIGIT;
const pick = set => set[crypto.randomInt(set.length)];
export function newPassword() {
  for (;;) {
    const groups = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => pick(ALL)).join(''));
    const p = groups.join('-');
    if (/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p)) return p;
  }
}

export function initSheets(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS sheets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created TEXT NOT NULL, by TEXT NOT NULL,
    password TEXT NOT NULL, data TEXT NOT NULL)`);   /* password: 'kept', 'changed' or 'expired' */
}

const row = r => ({ id: r.id, userId: r.user_id, created: r.created, by: r.by, password: r.password });

/* Takes the password out of a kept sheet: 'changed' when IT says so, 'expired' after PASSWORD_DAYS. */
function dropPassword(db, key, id, why) {
  const r = db.prepare('SELECT * FROM sheets WHERE id = ?').get(id);
  if (!r || r.password !== 'kept') return;
  const sheet = openSheet(key, r.data);
  delete sheet.password;
  db.prepare('UPDATE sheets SET data = ?, password = ? WHERE id = ?').run(sealSheet(key, sheet), why, id);
}
export function purgePasswords(db, key, now = new Date()) {
  const before = new Date(now.getTime() - PASSWORD_DAYS * 86400000).toISOString();
  const old = db.prepare("SELECT id FROM sheets WHERE password = 'kept' AND created < ?").all(before);
  /* A sheet the key cannot open (the key was replaced) is left as it is, so it does not stop the others. */
  let n = 0;
  for (const r of old) { try { dropPassword(db, key, r.id, 'expired'); n++; } catch { /* unreadable */ } }
  return n;
}

/* Makes a sheet for a person and the devices given, from what the inventory holds (not from what the page sends). */
export function createSheet(db, key, state, { userId, deviceIds = [], login = '', note = '' }, by, now = new Date()) {
  const person = state.users.find(u => u.id === userId);
  if (!person) throw new HttpError(404, 'No such person.');
  const ids = new Set(Array.isArray(deviceIds) ? deviceIds.map(String) : []);
  const devices = state.objs.filter(o => ids.has(String(o.id))).map(o => ({
    code: o.code || '', type: (state.types[o.type] || {}).label || TYPE_LABELS[o.type] || o.type, name: o.name, model: o.model || '', serial: o.serial || ''
  }));
  if (devices.length !== ids.size) throw new HttpError(400, 'A device on the sheet is not in the inventory.');
  const account = String(login || person.login || '').trim().slice(0, 120);
  if (!account) throw new HttpError(400, 'Give the Windows sign-in name of the person.');
  const pr = person.profile || {};
  const sheet = { person: { name: person.name, dept: person.dept || '', ...Object.fromEntries(['title', 'office', 'manager', 'mail'].filter(k => pr[k]).map(k => [k, String(pr[k]).slice(0, 200)])) }, login: account, devices, note: String(note || '').slice(0, 500),
    issued: now.toISOString(), by, password: newPassword(), passwordDays: PASSWORD_DAYS };
  const id = 'sh' + crypto.randomBytes(8).toString('hex');
  db.prepare("INSERT INTO sheets (id, user_id, created, by, password, data) VALUES (?, ?, ?, ?, 'kept', ?)")
    .run(id, userId, sheet.issued, by, sealSheet(key, sheet));
  return { id, sheet };
}
export const listSheets = (db, userId) => db.prepare('SELECT id, user_id, created, by, password FROM sheets WHERE user_id = ? ORDER BY created DESC').all(userId).map(row);
export function getSheet(db, key, id) {
  const r = db.prepare('SELECT * FROM sheets WHERE id = ?').get(id);
  if (!r) throw new HttpError(404, 'No such sheet.');
  return { ...row(r), sheet: openSheet(key, r.data) };
}
export function markChanged(db, key, id) {
  if (!db.prepare('SELECT 1 FROM sheets WHERE id = ?').get(id)) throw new HttpError(404, 'No such sheet.');
  dropPassword(db, key, id, 'changed');
}
export function deleteSheet(db, id) {
  if (!db.prepare('DELETE FROM sheets WHERE id = ?').run(id).changes) throw new HttpError(404, 'No such sheet.');
}
