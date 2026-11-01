#!/usr/bin/env node
/* Turns an encrypted copy of the backups (nobs-backup-….nobsbak, from NI_BACKUP_EXPORT_DIR) back into the backup file
   the app restores from (Settings → Maintenance → Restore from file…), on any computer with Node.js 22 or newer:
     node scripts/decrypt-backup.mjs nobs-backup-2026-11-01-0230.nobsbak > backup.json
   The password is asked for, or taken from NI_BACKUP_PASSWORD. Nothing else is needed: no server, no key file. */
import fs from 'node:fs';
import readline from 'node:readline';
import { decryptBackup } from '../server/backup-export.js';

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/decrypt-backup.mjs <file.nobsbak> > backup.json'); process.exit(2); }
const ask = () => new Promise(resolve => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  process.stderr.write('Password: ');
  rl._writeToOutput = () => {};   /* the password is not shown */
  rl.question('', a => { rl.close(); process.stderr.write('\n'); resolve(a); });
});
try {
  const pw = process.env.NI_BACKUP_PASSWORD || await ask();
  process.stdout.write(decryptBackup(fs.readFileSync(file), pw));
} catch (e) { console.error(e.message); process.exit(1); }
