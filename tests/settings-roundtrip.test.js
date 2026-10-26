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

test('a backup and a restore keep what came with 0.9.7 and after: new fields, card lines, certificates, network data', () => {
  const db = freshDb();
  const s = loadState(db);
  const obj = {
    id: 'o9', code: 'INV-0009', type: 'plc', name: 'PLC-1', status: 'active', loc: '', ovr: { warranty: false }, feed: { sys: 'Lansweeper', ref: 'x', seen: '01.10.2026 06:00' },
    ip: '172.21.103.38', mask: '255.255.255.0', gateway: '172.21.103.1', dns: '172.21.1.5, 172.21.1.6', dhcp: 'static', purchased: '2023-04-01', warranty: '2027-03-31', uid: 'u-ls1',
  };
  const printer = { id: 'o10', code: 'INV-0010', type: 'printer', name: 'PRN-1', status: 'active', loc: '', ovr: {}, feed: null, ports: 2, pfx: 'eth' };
  Object.assign(s, {
    objs: [obj, printer],
    users: [...s.users, { id: 'u-ls1', login: '', name: 'Anna Muster', dept: 'Logistik', role: 'viewer', groups: [], source: 'lansweeper', active: true }],
    fieldLayout: { pc: { card: ['ip', 'user', 'loc', 'warranty'] }, plc: { order: ['name', 'ip'], card: ['ip', 'custom.line', '', 'serial'] } },
    graphCerts: [{ thumbprint: 'ABCDEF0123456789ABCDEF0123456789ABCDEF01', created: '2026-10-25T13:00:00.000Z', expires: '2028-10-24T13:00:00.000Z', by: 'Administrator' }],
    lsIpLocations: [{ name: 'Willisau Lager', from: '172.21.108.1', to: '172.21.108.254' }],
    lsNets: [{ cidr: '172.21.108.0/24', devices: 3, gateway: '172.21.108.1', dns: ['172.21.1.5'], name: 'Willisau Lager' }],
  });
  saveState(db, s);
  const id = takeBackup(db, 'test');
  const data = JSON.parse(db.prepare('SELECT data FROM backups WHERE id = ?').get(id).data);
  const fresh = freshDb();
  restoreBackup(fresh, data);
  const back = loadState(fresh);
  assert.deepEqual(back.objs.find(o => o.id === 'o9'), obj, 'the device and its new fields');
  assert.deepEqual(back.objs.find(o => o.id === 'o10'), printer, 'ports on a printer');
  assert.deepEqual(back.users.find(u => u.id === 'u-ls1'), s.users.find(u => u.id === 'u-ls1'), 'a person from Lansweeper, with department');
  for (const k of ['fieldLayout', 'graphCerts', 'lsIpLocations', 'lsNets']) assert.deepEqual(back[k], s[k], k);
  for (const k of ['mask', 'gateway', 'dns', 'dhcp', 'purchased', 'warranty']) assert.ok(back.policy[k] !== undefined, 'the overwrite policy knows ' + k);
  db.close(); fresh.close();
});

test('the company name and logo are kept; a logo that is not a PNG or JPEG is refused', async () => {
  const { checkState } = await import('../server/state.js');
  const base = { objs: [], rels: [], users: [], locs: [], types: {}, history: {} };
  checkState({ ...base, company: { name: 'Argolite AG', logo: 'data:image/png;base64,iVBORw0KGgo=' } });
  assert.throws(() => checkState({ ...base, company: { name: 'x', logo: 'data:image/svg+xml;base64,PHN2Zz4=' } }), /PNG or JPEG/);
  assert.throws(() => checkState({ ...base, company: { name: 'x'.repeat(81) } }), /80 characters/);
});

test('a restore puts every setting back as it was, also those that were not there yet when the backup was taken', () => {
  const db = freshDb();
  const s = loadState(db);
  Object.assign(s, { vlans: [{ vid: 10, name: 'Users' }], currency: 'CHF', graph: { tenant: 'contoso.onmicrosoft.com', client: '11111111-1111-1111-1111-111111111111' } });
  saveState(db, s);
  const id = takeBackup(db, 'test');
  const data = JSON.parse(db.prepare('SELECT data FROM backups WHERE id = ?').get(id).data);
  const later = loadState(db);
  Object.assign(later, {
    vlans: [{ vid: 20, name: 'Servers' }], currency: 'EUR', models: ['Added later'], subnets,
    contracts: [{ id: 'c1', name: 'Support', kind: 'support', start: '2026-01-01', end: '2026-12-31', renew: 12, notice: 3, cost: 1, per: 'year', devices: [] }],
    graph: { tenant: 'fabrikam.onmicrosoft.com', client: '22222222-2222-2222-2222-222222222222' },
  });
  saveState(db, later);
  restoreBackup(db, data);
  const back = loadState(db);
  assert.deepEqual(back.vlans, [{ vid: 10, name: 'Users' }]);
  assert.equal(back.currency, 'CHF');
  assert.equal(back.models, undefined, 'a list that was added after the backup is gone again');
  assert.deepEqual(back.sites, [], 'a list a new server starts with is empty again');
  assert.equal(back.subnets, undefined);
  assert.equal(back.contracts, undefined);
  /* The connections are not part of the inventory: they stay as they are now, so a restore does not break a working sync. */
  assert.equal(back.graph.tenant, 'fabrikam.onmicrosoft.com');
  /* Into an empty database, the backup's connection settings are taken. */
  const fresh = freshDb();
  restoreBackup(fresh, data);
  assert.equal(loadState(fresh).graph.tenant, 'contoso.onmicrosoft.com');
  db.close(); fresh.close();
});
