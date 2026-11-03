/* Health, for Settings → Maintenance: what the people running the inventory check, each as ok, warn, bad or off with a
   short value and what to do. The server and its database, free disk, backups, each sync and its schedule, the
   certificates that expire, and the errors in the log. Numbers and dates only: no secret, no data of a device or person. */
import fs from 'node:fs';
import { scheduleOf } from '../public/js/schedule.js';
import { dateText, dateTimeText } from '../public/js/dates.js';
import { backupStorage } from './backup-store.js';

const DAY = 864e5;
const mb = n => n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : `${(n / 1048576).toFixed(1)} MB`;
const ago = (iso, now) => {
  const ms = now - Date.parse(iso); if (!(ms >= 0)) return '';
  const h = Math.floor(ms / 36e5);
  return h < 1 ? 'less than an hour ago' : h < 48 ? `${h} hour${h === 1 ? '' : 's'} ago` : `${Math.floor(h / 24)} days ago`;
};
const days = (iso, now) => Math.floor((Date.parse(iso) - now) / DAY);
const ERROR = /fail|refus|error|throttl|denied|wrong|could not|not set|not allowed/i;

/* on: which connections are set up ({ lansweeper, ldap, graph }); graphCert: the expiry of the certificate the server
   signs in to Graph with, if any. */
/* diskSpace(dir) → { free, total } in bytes: the file system's own numbers, or given (tests, so they do not depend on
   the disk of the machine they run on). */
export const statDisk = dir => { const f = fs.statfsSync(dir); return { free: f.bavail * f.bsize, total: f.blocks * f.bsize }; };
export function healthReport(db, s, { version, on = {}, graphCert = null, photos = null, copy = null, restore = null, diskSpace = statDisk, now = Date.now(), started = now - process.uptime() * 1000 } = {}) {
  const checks = [];
  const add = (area, name, state, value, note = '') => checks.push({ area, name, state, value, note });

  /* Server and database */
  add('Server', 'Version', 'ok', `NOBS Inventory ${version} · Node.js ${process.versions.node}`, `Running since ${dateTimeText(new Date(started).toISOString())}`);
  const file = (db.prepare('PRAGMA database_list').all().find(d => d.name === 'main') || {}).file || '';
  let size = 0; for (const f of file ? [file, `${file}-wal`] : []) { try { size += fs.statSync(f).size; } catch { /* none */ } }
  /* Counted as everywhere in the app: the inventory's objects, not those waiting in To review or ignored there. */
  const docs = db.prepare("SELECT COUNT(*) AS n FROM docs WHERE kind = 'object' AND json_extract(data, '$.review') IS NULL").get().n;
  add('Server', 'Database', 'ok', file ? `${mb(size)} · ${docs} objects` : `${docs} objects (in memory)`);
  if (photos && photos.n) add('Server', 'Device photos', photos.bytes > 3.5 * 1073741824 ? 'warn' : 'ok', `${photos.n} photo${photos.n === 1 ? '' : 's'} of ${photos.devices} device${photos.devices === 1 ? '' : 's'} · ${mb(photos.bytes)}`,
    photos.bytes > 3.5 * 1073741824 ? 'Close to the 4 GB the photos may take together: remove photos that are no longer needed.' : 'In the database, and in every backup (each photo stored once).');
  if (file) {
    try {
      const { free, total } = diskSpace(file.replace(/[^/\\]+$/, '') || '.'), share = total ? free / total : 1;
      add('Server', 'Free disk space', free < 1073741824 || share < 0.05 ? 'bad' : free < 5368709120 || share < 0.15 ? 'warn' : 'ok', `${mb(free)} free of ${mb(total)}`,
        free < 5368709120 ? 'The database, its backups and the log need room: free some space on the server.' : '');
    } catch { /* not every file system says */ }
  }

  /* Backups */
  const last = db.prepare('SELECT at, reason FROM backups ORDER BY id DESC LIMIT 1').get();
  const n = { n: db.prepare('SELECT COUNT(*) AS n FROM backups').get().n, bytes: backupStorage(db) };
  const old = last ? (now - Date.parse(last.at)) / DAY : Infinity;
  add('Backups', 'Last backup', !last ? 'warn' : old > 14 ? 'bad' : old > 7 ? 'warn' : 'ok',
    last ? `${ago(last.at, now)} (${last.reason}) · ${n.n} kept, ${mb(n.bytes)}` : 'None yet',
    !last || old > 7 ? 'Take one under Maintenance → Backups, and download it to keep a copy off this server.' : '');
  /* The copy outside the server (optional): off unless the server names a folder and it is turned on. */
  if (copy && copy.dir && copy.on) {
    const c = copy.last, age = c ? (now - Date.parse(c.at)) / DAY : Infinity, lastOk = c && c.ok;
    add('Backups', 'Copy outside the server', !c ? 'warn' : !lastOk ? 'bad' : age > 3 ? 'bad' : age > 1.5 ? 'warn' : 'ok',
      !c ? 'None yet' : lastOk ? `${ago(c.at, now)} · ${c.file} · ${mb(c.bytes || 0)}` : `Failed ${ago(c.at, now)}: ${c.error || 'unknown'}`,
      !c ? 'The first copy is made tonight at 02:30, or with Copy now under Maintenance → Backups.' : !lastOk || age > 1.5 ? 'Check where the server copies to (NI_BACKUP_EXPORT_DIR, or the cloud storage) and the password, then use Copy now.' : '');
  } else add('Backups', 'Copy outside the server', 'off', copy && copy.dir ? 'Off' : 'Not set up', 'Optional: a nightly encrypted copy to a share or to cloud storage (Azure Blob, S3), set up on the server and turned on under Maintenance → Backups.');
  /* The weekly restore test: a backup that cannot be restored is worse than none, because it is trusted. */
  {
    const age = restore ? (now - Date.parse(restore.at)) / DAY : Infinity;
    add('Backups', 'Restore test', !restore ? 'warn' : !restore.ok ? 'bad' : age > 8 ? 'warn' : 'ok',
      !restore ? 'Not tested yet' : restore.ok ? `${ago(restore.at, now)} · ${restore.objects} devices came back` : `Failed ${ago(restore.at, now)}: ${restore.error || 'unknown'}`,
      !restore ? 'The newest backup is restored into memory each Sunday at 03:30, or with Test now under Maintenance → Backups.' : !restore.ok ? 'Look at the error; then take a new backup and use Test now.' : age > 8 ? 'The weekly test did not run: use Test now under Maintenance → Backups.' : '');
  }
  add('Backups', 'Automatic backups', s.autoBackups === false ? 'warn' : 'ok', s.autoBackups === false ? 'Off' : 'Before every sync, push and import, and once a day before the first change',
    s.autoBackups === false ? 'Without them a sync that goes wrong cannot be undone.' : '');

  /* Syncs: each one set up, its last run and its schedule. */
  const runs = s.syncRuns || {}, plan = scheduleOf(s);
  const names = { lansweeper: 'Lansweeper', ldap: 'Active Directory', graph: 'Entra & Intune' };
  for (const src of ['lansweeper', 'ldap', 'graph']) {
    if (!on[src]) { add('Syncs', names[src], 'off', 'Not set up'); continue; }
    const r = runs[src], every = plan[src] && plan[src].every;
    const late = r && every && now - Date.parse(r.at) > 2 * every * 36e5 + 36e5;
    const push = src === 'lansweeper' && r && r.how === 'push';
    add('Syncs', names[src], !r ? 'warn' : !r.ok ? 'bad' : late && !push ? 'warn' : 'ok',
      !r ? 'Not run yet' : `${r.ok ? 'Last run' : 'Last run failed'} ${ago(r.at, now)}${push ? ' (push)' : ''}${every ? ` · runs ${every === 24 ? 'daily' : `every ${every} h`}` : ' · only by hand'}`,
      !r ? 'Run it once with Sync now.' : !r.ok ? String(r.error || '').slice(0, 200) : late && !push ? 'It has not run as often as planned: is the server kept running?' : '');
  }

  /* Certificates that expire: the one the server signs in to Graph with, and the directory's CA. */
  const certState = d => d < 0 ? 'bad' : d < 30 ? 'warn' : 'ok';
  const certValue = (iso, now2) => { const d = days(iso, now2); return d < 0 ? `Expired on ${dateText(iso.slice(0, 10))}` : `Valid until ${dateText(iso.slice(0, 10))} (${d} days)`; };
  if (graphCert) {
    const d = days(graphCert, now);
    add('Certificates', 'Microsoft Graph sign-in', certState(d), certValue(graphCert, now), d < 30 ? 'Make a new one in Settings → Entra & Intune and upload it to the app registration before this one ends.' : '');
  }
  for (const c of (s.ldapCa && s.ldapCa.certs) || []) {
    const d = days(c.expires, now);
    add('Certificates', `Directory CA ${c.name || ''}`.trim(), certState(d), certValue(c.expires, now), d < 30 ? 'Add the new CA certificate in Settings → Active Directory.' : '');
  }

  /* The log: errors in the last day. */
  const since = new Date(now - DAY).toISOString();
  const errors = db.prepare('SELECT action FROM audit WHERE at >= ? ORDER BY id DESC LIMIT 2000').all(since).filter(r => ERROR.test(r.action)).length;
  add('Log', 'Errors in the last 24 hours', errors > 20 ? 'bad' : errors ? 'warn' : 'ok', String(errors), errors ? 'See the Log tab, filtered to Errors.' : '');
  const sessions = db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE expires > ?').get(now).n;
  add('Log', 'Signed in', 'ok', `${sessions} session${sessions === 1 ? '' : 's'}`);

  const worst = checks.some(c => c.state === 'bad') ? 'bad' : checks.some(c => c.state === 'warn') ? 'warn' : 'ok';
  return { state: worst, at: new Date(now).toISOString(), checks };
}
