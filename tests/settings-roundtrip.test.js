import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { openDb } from '../server/db.js';
import { bootstrap } from '../server/index.js';
import { loadState, saveState } from '../server/state.js';
import { takeBackup, restoreBackup } from '../server/backup.js';

/* The lists kept in Settings survive a save, a backup and a restore into an empty database. */
const freshDb = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-round-'));
  const db = openDb(path.join(dir, 'i.db'));
  bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
  return db;
};
const subnets = [{ name: 'Users', vid: 10, cidr: '10.10.20.0/24', gateway: '10.10.20.1', dns: ['10.10.1.5'], ranges: [{ from: '10.10.20.50', to: '10.10.20.99', use: 'DHCP' }], types: ['pc'] }];

test('settings kept in Settings are saved and loaded again', () => {
  const db = freshDb();
  const s = loadState(db);
  Object.assign(s, { vlans: [{ vid: 10, name: 'Users' }], models: ['ThinkPad T14'], modelMap: { 'Dell Latitude': 'Latitude 14' }, subnets });
  saveState(db, s);
  const again = loadState(db);
  assert.deepEqual(again.vlans, [{ vid: 10, name: 'Users' }]);
  assert.deepEqual(again.models, ['ThinkPad T14']);
  assert.deepEqual(again.modelMap, { 'Dell Latitude': 'Latitude 14' });
  assert.deepEqual(again.subnets, subnets);
  db.close();
});

test('a backup carries those settings, and a restore into an empty database brings them back', () => {
  const db = freshDb();
  const s = loadState(db);
  Object.assign(s, { vlans: [{ vid: 10, name: 'Users' }], models: ['ThinkPad T14'], subnets });
  saveState(db, s);
  const id = takeBackup(db, 'test');
  const data = JSON.parse(db.prepare('SELECT data FROM backups WHERE id = ?').get(id).data);
  assert.deepEqual(data.state.settings.subnets, subnets);
  const fresh = freshDb();
  restoreBackup(fresh, data);
  const back = loadState(fresh);
  assert.deepEqual(back.subnets, subnets);
  assert.deepEqual(back.models, ['ThinkPad T14']);
  assert.deepEqual(back.vlans, [{ vid: 10, name: 'Users' }]);
  db.close(); fresh.close();
});
