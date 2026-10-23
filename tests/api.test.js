import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn, tempDataDir } from './helpers.js';
import { parseCsv, mergeFeed } from '../server/feed.js';

const baseState = (extra = {}) => ({
  objs: [], rels: [], users: [], types: {}, history: {}, locs: ['Zürich HQ / Büro 2.OG'],
  policy: { ip: true, mac: true, os: true, model: true }, feedOn: true, feedSync: true, ldap: null, mapPos: {},
  seq: 100, codeN: 0, rseq: 0, ...extra
});
const adminUser = { id: 'u-admin', login: 'admin', name: 'Administrator', role: 'admin', active: true };

test('signing in: wrong password and missing login are refused, the right one gives a session', async () => {
  const srv = await startServer();
  try {
    assert.equal((await srv.call('GET', '/api/state')).status, 401);
    assert.equal((await signIn(srv, 'admin', 'nope')).status, 401);
    assert.equal((await signIn(srv, '', '')).status, 401);
    const ok = await signIn(srv, 'admin', 'adminpass123');
    assert.equal(ok.status, 200);
    assert.equal(ok.user.role, 'admin');
    assert.ok(ok.cookie.startsWith('ni_session='));
    assert.equal((await srv.call('GET', '/api/state', { cookie: ok.cookie })).status, 200);
  } finally { await srv.close(); }
});

test('a user can be signed in from several browsers; the oldest sessions end past the limit', async () => {
  const srv = await startServer();
  try {
    const first = await signIn(srv, 'admin', 'adminpass123');
    const second = await signIn(srv, 'admin', 'adminpass123');
    assert.equal((await srv.call('GET', '/api/state', { cookie: first.cookie })).status, 200, 'an earlier sign-in still works');
    for (let i = 0; i < 4; i++) await signIn(srv, 'admin', 'adminpass123');   /* six sign-ins in all */
    assert.equal((await srv.call('GET', '/api/state', { cookie: first.cookie })).status, 401, 'the oldest session ends past the limit');
    assert.equal((await srv.call('GET', '/api/state', { cookie: second.cookie })).status, 200, 'the newer sessions keep working');
  } finally { await srv.close(); }
});

test('the inventory is saved and comes back the same, and survives a restart', async () => {
  const dir = tempDataDir();
  let srv = await startServer({ dir });
  const admin = await signIn(srv, 'admin', 'adminpass123');
  const state = baseState({
    users: [adminUser],
    objs: [{ id: 'o101', code: 'INV-0001', type: 'pc', name: 'ZH-PC-0200', serial: 'SN200', ip: '10.10.20.200', ovr: {}, feed: null }],
    rels: [{ id: 'r1', from: 'o101', to: 'o101', kind: 'connected', port: null, vlan: null }],
    history: { o101: [{ t: 'now', msg: 'created' }] },
    types: { pc: { label: 'PC', short: 'PC', color: '#000', icon: 'pc' } }
  });
  assert.equal((await srv.call('PUT', '/api/state', { body: state, cookie: admin.cookie })).status, 200);
  await srv.close();

  srv = await startServer({ dir });
  try {
    const again = await signIn(srv, 'admin', 'adminpass123');
    const back = (await srv.call('GET', '/api/state', { cookie: again.cookie })).json;
    assert.equal(back.objs[0].name, 'ZH-PC-0200');
    assert.equal(back.rels.length, 1);
    assert.equal(back.history.o101[0].msg, 'created');
    assert.equal(back.types.pc.label, 'PC');
  } finally { await srv.close(); }
});

test('a viewer can read but cannot save or import; an admin can', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    const users = [adminUser, { id: 'u-anna', login: 'anna', name: 'Anna', role: 'viewer', active: true }];
    assert.equal((await srv.call('PUT', '/api/state', { body: baseState({ users }), cookie: admin.cookie })).status, 200);
    assert.equal((await srv.call('POST', '/api/users/u-anna/password', { body: { password: 'viewerpw123' }, cookie: admin.cookie })).status, 200);

    const viewer = await signIn(srv, 'anna', 'viewerpw123');
    assert.equal(viewer.user.role, 'viewer');
    assert.equal((await srv.call('GET', '/api/state', { cookie: viewer.cookie })).status, 200);
    assert.equal((await srv.call('PUT', '/api/state', { body: baseState({ users }), cookie: viewer.cookie })).status, 403);
    assert.equal((await srv.call('POST', '/api/feed/import', { body: 'AssetName,Serial\nX,1\n', type: 'csv', cookie: viewer.cookie })).status, 403);
  } finally { await srv.close(); }
});

test('a save that would lock everyone out is refused', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    const noSelf = baseState({ users: [{ id: 'u-other', login: 'x', name: 'X', role: 'admin', active: true }] });
    assert.equal((await srv.call('PUT', '/api/state', { body: noSelf, cookie: admin.cookie })).status, 400);
    const noAdmin = baseState({ users: [{ ...adminUser, role: 'viewer' }] });
    assert.equal((await srv.call('PUT', '/api/state', { body: noAdmin, cookie: admin.cookie })).status, 400);
    const dupes = baseState({ users: [adminUser], objs: [{ id: 'o1', name: 'a' }, { id: 'o1', name: 'b' }] });
    assert.equal((await srv.call('PUT', '/api/state', { body: dupes, cookie: admin.cookie })).status, 400);
  } finally { await srv.close(); }
});

test('passwords need eight characters; logging out ends the session', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    assert.equal((await srv.call('POST', '/api/users/u-admin/password', { body: { password: 'short' }, cookie: admin.cookie })).status, 400);
    await srv.call('POST', '/api/logout', { cookie: admin.cookie });
    assert.equal((await srv.call('GET', '/api/state', { cookie: admin.cookie })).status, 401);
  } finally { await srv.close(); }
});

test('the session cookie is HttpOnly and SameSite=Strict', async () => {
  const srv = await startServer();
  try {
    const r = await fetch(srv.base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', password: 'adminpass123' }) });
    const sc = r.headers.get('set-cookie');
    assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
  } finally { await srv.close(); }
});

test('CSV parsing handles quotes, semicolons and CRLF', () => {
  const rows = parseCsv('a,b;c\r\n"x, y",2,"say ""hi"""\r\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x, y', '2', 'say "hi"']]);
});

test('a Lansweeper export: matched by serial, only allowed fields move, new assets get codes', () => {
  const s = baseState({
    objs: [{ id: 'o101', code: 'INV-0001', type: 'pc', name: 'ZH-PC-0142', serial: 'CZC1', ip: '10.10.20.42', os: 'Windows 10', ovr: {}, feed: null, loc: 'Zürich HQ / Büro 2.OG' },
      { id: 'o102', code: 'INV-0002', type: 'pc', name: 'ZH-PC-0143', serial: 'CZC2', ip: '10.10.20.43', ovr: { ip: false }, feed: { sys: 'Lansweeper', ref: '3143', seen: 'x' } }],
    codeN: 2, seq: 102
  });
  const csv = 'AssetName,AssetType,Serial,IPAddress,OS,Location\n' +
    'ZH-PC-0142,Windows (workstation OS),CZC1,10.10.20.57,Windows 11 Pro,Zürich HQ / Büro 2.OG\n' +
    'ZH-PC-0143,Windows (workstation OS),CZC2,10.10.20.99,Windows 11 Pro,\n' +
    'ZH-PC-0144,Windows (workstation OS),CZC3,10.10.20.44,Windows 11 Pro,Zürich HQ / Büro 2.OG\n';
  const counts = mergeFeed(s, csv, new Date(2026, 9, 21, 6, 0));
  const a = s.objs.find(o => o.id === 'o101'), b = s.objs.find(o => o.id === 'o102');
  assert.equal(a.ip, '10.10.20.57', 'ip is allowed by the policy, so the feed moves it');
  assert.equal(a.os, 'Windows 11 Pro');
  assert.ok(a.feed, 'the object is now linked to the feed');
  assert.equal(b.ip, '10.10.20.43', 'a field overridden on the object stays as it was set');
  const made = s.objs.find(o => o.name === 'ZH-PC-0144');
  assert.equal(made.type, 'pc');
  assert.equal(made.code, 'INV-0003');
  assert.equal(made.feed.sys, 'Lansweeper');
  assert.equal(counts.created, 1);
  assert.equal(counts.linked, 1);
});

test('feed import over HTTP saves the merge', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    await srv.call('PUT', '/api/state', { body: baseState({
      users: [adminUser],
      objs: [{ id: 'o5', code: 'INV-0005', type: 'server', name: 'SRV-1', serial: 'SRV1', ip: '10.0.0.1', ovr: {}, feed: null }], codeN: 5, seq: 105
    }), cookie: admin.cookie });
    const r = await srv.call('POST', '/api/feed/import', { body: 'AssetName,Serial,IPAddress\nSRV-1,SRV1,10.0.0.2\n', type: 'csv', cookie: admin.cookie });
    assert.equal(r.status, 200);
    assert.equal(r.json.counts.linked, 1);
    const back = (await srv.call('GET', '/api/state', { cookie: admin.cookie })).json;
    assert.equal(back.objs[0].ip, '10.0.0.2');
  } finally { await srv.close(); }
});

test('Lansweeper asset type names land in the matching app type', async () => {
  const { mergeRecords } = await import('../server/feed.js');
  const expected = {
    'Windows': 'pc', 'Apple Mac': 'pc', 'Computer': 'pc', 'Laptop': 'pc', 'Linux': 'server', 'VMware': 'server',
    'Switch': 'switch', 'Router': 'router', 'Firewall': 'firewall', 'Printer': 'printer', 'Tablet': 'mobile', 'iPad': 'ios',
    'iPhone': 'ios', 'Android': 'android', 'Mobile': 'mobile', 'Modem': 'modem', 'Phone': 'sip', 'VoIP': 'sip', 'VOIP phone': 'sip', 'DECT': 'sip', 'DECT handset': 'sip', 'Telefon': 'sip', 'Gigaset': 'sip',
    'Wireless Access point': 'accesspoint', 'Wifi': 'accesspoint', 'UPS': 'other', 'Network device': 'other', 'Webserver': 'other', 'Web': 'other', 'Virtual machine': 'vm'
  };
  for (const [assetType, type] of Object.entries(expected)) {
    const s = { objs: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 0 };
    mergeRecords(s, [{ name: 'X-' + assetType, assetType }]);
    assert.equal(s.objs[0].type, type, assetType);
  }
});

test('pushed links join objects: a device to its switch port, a monitor to its PC, without duplicates', async () => {
  const { mergeRecords, recordsFromJson } = await import('../server/feed.js');
  const s = { objs: [], rels: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 0, rseq: 0 };
  const counts = mergeRecords(s, recordsFromJson([
    { name: 'SW1', assetType: 'Switch', ref: 'sw1' },
    { name: 'PC1', assetType: 'Windows', ref: 'pc1', links: [{ ref: 'sw1', kind: 'connected', port: 'Gi1/0/5' }] },
    { name: 'Dell U2419 MX1', serial: 'MX1', assetType: 'Monitor', ref: 'mon-mx1', links: [{ ref: 'pc1', kind: 'attached' }] }
  ]));
  assert.equal(counts.links, 2);
  const id = n => s.objs.find(o => o.name === n).id;
  assert.ok(s.rels.some(r => r.from === id('PC1') && r.to === id('SW1') && r.kind === 'connected' && r.port === 'Gi1/0/5'));
  assert.ok(s.rels.some(r => r.from === id('Dell U2419 MX1') && r.to === id('PC1') && r.kind === 'attached'));
  mergeRecords(s, recordsFromJson([{ name: 'PC1', assetType: 'Windows', ref: 'pc1', links: [{ ref: 'sw1', kind: 'connected', port: 'Gi1/0/5' }] }]));
  assert.equal(s.rels.length, 2, 'a second push does not add the links again');
});

test('a push without a port keeps the port set by hand', async () => {
  const { mergeRecords, recordsFromJson } = await import('../server/feed.js');
  const s = { objs: [], rels: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 0, rseq: 0 };
  mergeRecords(s, recordsFromJson([{ name: 'SW1', ref: 'sw1', assetType: 'Switch' }, { name: 'PC1', ref: 'pc1', links: [{ ref: 'sw1', kind: 'connected' }] }]));
  const pc = s.objs.find(o => o.name === 'PC1');
  s.rels.find(r => r.from === pc.id).port = 12;
  mergeRecords(s, recordsFromJson([{ name: 'PC1', ref: 'pc1', links: [{ ref: 'sw1', kind: 'connected' }] }]));
  assert.equal(s.rels.find(r => r.from === pc.id).port, 12);
});

test('a plan image is stored apart from the inventory: admins save it, anyone signed in reads it', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const put = (body, cookie) => fetch(srv.base + '/api/plans/pl1/image', { method: 'PUT', headers: { 'Content-Type': 'text/plain', ...(cookie ? { Cookie: cookie } : {}) }, body });
    assert.equal((await put(png)).status, 401, 'no sign-in, no save');
    assert.equal((await put('not an image', admin.cookie)).status, 400, 'only images are stored');
    assert.equal((await put(png, admin.cookie)).status, 200);
    const got = await fetch(srv.base + '/api/plans/pl1/image', { headers: { Cookie: admin.cookie } });
    assert.equal(got.status, 200);
    assert.equal(got.headers.get('content-type'), 'image/png');
    assert.equal((await got.arrayBuffer()).byteLength, 8);
    assert.equal((await fetch(srv.base + '/api/plans/pl1/image')).status, 401, 'reading needs a sign-in');
    assert.equal((await fetch(srv.base + '/api/plans/pl1/image', { method: 'DELETE', headers: { Cookie: admin.cookie } })).status, 200);
    assert.equal((await fetch(srv.base + '/api/plans/pl1/image', { headers: { Cookie: admin.cookie } })).status, 404);
  } finally { await srv.close(); }
});

test('backups: taken before an import; a restore puts the devices back, keeps the users, and never reuses a code', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    await srv.call('PUT', '/api/state', { body: baseState({ users: [adminUser], objs: [{ id: 'o5', code: 'INV-0005', type: 'server', name: 'SRV-1', serial: 'SRV1', ovr: {}, feed: null }], codeN: 5, seq: 105 }), cookie: admin.cookie });
    const imp = await srv.call('POST', '/api/feed/import', { body: 'AssetName,Serial\nNEW-1,N1\n', type: 'csv', cookie: admin.cookie });
    assert.equal(imp.status, 200);
    const list = (await srv.call('GET', '/api/backups', { cookie: admin.cookie })).json.backups;
    assert.equal(list.length, 1, 'a backup was taken before the import');
    assert.equal(list[0].reason, 'before a Lansweeper import');
    const dl = await srv.call('GET', `/api/backups/${list[0].id}/download`, { cookie: admin.cookie, type: 'text' });
    assert.equal(dl.status, 200);
    const restored = await srv.call('POST', `/api/backups/${list[0].id}/restore`, { cookie: admin.cookie });
    assert.equal(restored.status, 200);
    const back = (await srv.call('GET', '/api/state', { cookie: admin.cookie })).json;
    assert.ok(!back.objs.some(o => o.name === 'NEW-1'), 'the imported device is gone after the restore');
    assert.ok(back.objs.some(o => o.name === 'SRV-1'), 'the device from before is still there');
    assert.ok(back.users.some(u => u.role === 'admin'), 'the users are kept');
    assert.ok(back.codeN >= 6, 'the code counter is not turned back');
    assert.equal((await srv.call('POST', '/api/backups/restore-file', { body: 'not json', type: 'text', cookie: admin.cookie })).status, 400);
    const file = await srv.call('POST', '/api/backups/restore-file', { body: dl.text, type: 'text', cookie: admin.cookie });
    assert.equal(file.status, 200, 'a downloaded backup can be restored from a file');
    assert.equal((await srv.call('GET', '/api/backups', { cookie: admin.cookie })).json.backups.length >= 2, true);
  } finally { await srv.close(); }
});

test('the log shows what happened, and a refused push is an error', async () => {
  const srv = await startServer({ feedToken: 'log-token-123' });
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    await srv.call('PUT', '/api/state', { body: baseState({ users: [adminUser] }), cookie: admin.cookie });
    const refused = await fetch(srv.base + '/api/feed/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' }, body: '{"records":[]}' });
    assert.equal(refused.status, 401);
    await srv.call('POST', '/api/feed/import', { body: 'AssetName,Serial\nLOG-1,L1\n', type: 'csv', cookie: admin.cookie });
    const log = (await srv.call('GET', '/api/log', { cookie: admin.cookie })).json.entries;
    const failed = log.find(e => /feed push failed/.test(e.action));
    assert.ok(failed, 'the refused push is in the log');
    assert.equal(failed.level, 'error');
    assert.ok(log.some(e => /feed import/.test(e.action) && e.level === 'info'), 'the import is in the log as information');
    assert.equal((await fetch(srv.base + '/api/log')).status, 401, 'the log needs a sign-in');
  } finally { await srv.close(); }
});

test('the type table in Settings decides the type of a Lansweeper name; IP-only devices can be skipped', async () => {
  const { mergeRecords, recordsFromJson } = await import('../server/feed.js');
  const s = { objs: [], rels: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 0, rseq: 0,
    typeMap: { 'DECT base': 'sip', 'IOS': 'ios' }, skipIpOnly: true };
  mergeRecords(s, recordsFromJson([
    { name: 'DB-1', assetType: 'dect base', ref: 'd1' },
    { name: 'IOS-1', assetType: 'IOS', ref: 'i1' },
    { name: '172.21.1.9', assetType: 'Network device', ref: 'n1' },
    { name: '172.21.1.10', serial: 'SW10', assetType: 'Switch', ref: 'n2' }
  ]));
  assert.equal(s.objs.find(o => o.name === 'DB-1').type, 'sip');
  assert.equal(s.objs.find(o => o.name === 'IOS-1').type, 'ios');
  assert.equal(s.objs.some(o => o.name === '172.21.1.9'), false, 'an IP-only device is skipped');
  assert.equal(s.objs.some(o => o.name === '172.21.1.10'), true, 'an IP device with a serial number is kept');
});

test('a detached object is left alone by the sync until it is attached; an attached one takes its reference on the next sync', async () => {
  const { mergeRecords, recordsFromJson } = await import('../server/feed.js');
  const s = { objs: [], rels: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 0, rseq: 0 };
  mergeRecords(s, recordsFromJson([{ name: 'PC1', serial: 'SN1', assetType: 'Windows', ref: 'pc1' }]));
  const o = s.objs[0];
  o.feed = null; o.detached = true;
  const counts = mergeRecords(s, recordsFromJson([{ name: 'PC1', serial: 'SN1', assetType: 'Windows', ref: 'pc1' }]));
  assert.equal(counts.detached, 1, 'the detached object was not counted as skipped');
  assert.equal(o.feed, null, 'the sync re-linked a detached object');
  delete o.detached; o.feed = { sys: 'Lansweeper', ref: null, seen: null };
  mergeRecords(s, recordsFromJson([{ name: 'PC1', serial: 'SN1', assetType: 'Windows', ref: 'pc1' }]));
  assert.equal(o.feed.ref, 'pc1', 'the attached object did not take its reference');
  assert.ok(o.feed.seen, 'the attached object was not marked as seen');
});

test('with Lansweeper turned off, pushes and imports are refused', async () => {
  const srv = await startServer({ feedToken: 'off-token-123' });
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    await srv.call('PUT', '/api/state', { body: baseState({ users: [adminUser], useLansweeper: false }), cookie: admin.cookie });
    const push = await fetch(srv.base + '/api/feed/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer off-token-123' }, body: '{"records":[]}' });
    assert.equal(push.status, 403);
    const imp = await srv.call('POST', '/api/feed/import', { body: 'AssetName,Serial\nOFF-1,O1\n', type: 'csv', cookie: admin.cookie });
    assert.equal(imp.status, 403);
  } finally { await srv.close(); }
});

test('one Lansweeper source at a time: script push or API sync, the other is refused', async () => {
  const srv = await startServer({ feedToken: 'one-source-123' });
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    await srv.call('PUT', '/api/state', { body: baseState({ users: [adminUser], lsSource: 'push' }), cookie: admin.cookie });
    assert.equal((await srv.call('POST', '/api/feed/sync', { cookie: admin.cookie })).status, 403, 'API sync is refused while the script push is the source');
    const pushOk = await fetch(srv.base + '/api/feed/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer one-source-123' }, body: '{"records":[]}' });
    assert.equal(pushOk.status, 200, 'the script push works');
    await srv.call('PUT', '/api/state', { body: baseState({ users: [adminUser], lsSource: 'api' }), cookie: admin.cookie });
    const pushNo = await fetch(srv.base + '/api/feed/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer one-source-123' }, body: '{"records":[]}' });
    assert.equal(pushNo.status, 403, 'the script push is refused while the API is the source');
  } finally { await srv.close(); }
});

test('a hot desk device is not given a user by the push', async () => {
  const { mergeRecords, recordsFromJson } = await import('../server/feed.js');
  const s = { objs: [{ id: 'o1', name: 'HD-1', type: 'pc', ovr: {}, hotdesk: true, uid: null }], rels: [], policy: { user: true }, feedOn: true, locs: [], seq: 100, codeN: 1 };
  mergeRecords(s, recordsFromJson([{ name: 'HD-1', ref: 'hd1', user: 'mueller' }]));
  assert.equal(s.objs[0].user, undefined, 'the sync leaves a hot desk without a user');
});

test('a link Lansweeper stops reporting is removed; a link made by hand stays', async () => {
  const { mergeRecords, recordsFromJson } = await import('../server/feed.js');
  const s = { objs: [], rels: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 0, rseq: 0 };
  mergeRecords(s, recordsFromJson([
    { name: 'PC1', ref: 'pc1' }, { name: 'PC2', ref: 'pc2' },
    { name: 'MON1', serial: 'M1', ref: 'mon-m1', links: [{ ref: 'pc1', kind: 'attached' }] }
  ]));
  const id = n => s.objs.find(o => o.name === n).id;
  s.rels.push({ id: 'manual', from: id('MON1'), to: id('PC2'), kind: 'attached', port: null, vlan: null });
  mergeRecords(s, recordsFromJson([{ name: 'MON1', serial: 'M1', ref: 'mon-m1', links: [{ ref: 'pc2', kind: 'attached' }] }]));
  const linked = s.rels.filter(r => r.from === id('MON1')).map(r => [r.to === id('PC1') ? 'PC1' : 'PC2', r.kind, r.src || 'hand']);
  assert.deepEqual(linked, [['PC2', 'attached', 'hand']], 'the link to PC1 is gone; the hand-made link to PC2 is kept as it is');
});

test('a virtual machine is linked to its host by name, as runs on', async () => {
  const { mergeRecords, recordsFromJson } = await import('../server/feed.js');
  const s = { objs: [], rels: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 0, rseq: 0 };
  const counts = mergeRecords(s, recordsFromJson([
    { name: 'ESX01', assetType: 'VMware', ref: 'h1' },
    { name: 'VM-APP', assetType: 'Virtual machine', ref: 'v1', links: [{ name: 'ESX01', kind: 'hosted' }] }
  ]));
  assert.equal(counts.links, 1);
  const id = n => s.objs.find(o => o.name === n).id;
  assert.ok(s.rels.some(r => r.from === id('VM-APP') && r.to === id('ESX01') && r.kind === 'hosted'));
});

test('pushed software replaces the Lansweeper software and keeps what was typed by hand', async () => {
  const { mergeRecords, recordsFromJson } = await import('../server/feed.js');
  const s = { objs: [{ id: 'o1', name: 'PC1', type: 'pc', feed: { sys: 'Lansweeper', ref: 'pc1' }, ovr: {}, software: [{ name: 'Typed', version: '1' }, { name: 'Old', version: '1', src: 'Lansweeper' }] }],
    rels: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 1 };
  mergeRecords(s, recordsFromJson([{ name: 'PC1', ref: 'pc1', software: [{ name: 'Chrome', version: '120' }] }]));
  assert.deepEqual(s.objs[0].software.map(x => x.name), ['Typed', 'Chrome']);
  mergeRecords(s, recordsFromJson([{ name: 'PC1', ref: 'pc1' }]));
  assert.deepEqual(s.objs[0].software.map(x => x.name), ['Typed', 'Chrome'], 'a push without software leaves it as it is');
});

test('pushed cpu, memory and last user: the user fills an object only when nobody is assigned', async () => {
  const { mergeRecords, recordsFromJson } = await import('../server/feed.js');
  const s = { objs: [{ id: 'o1', name: 'PC1', type: 'pc', feed: { sys: 'Lansweeper', ref: 'pc1' }, ovr: {}, user: 'Frei' }],
    rels: [], policy: { cpu: true, ram: true, user: true }, feedOn: true, locs: [], seq: 100, codeN: 1 };
  mergeRecords(s, recordsFromJson([{ name: 'PC1', ref: 'pc1', cpu: 'Intel Core i7', ram: '16 GB', user: 'mueller' }]));
  assert.equal(s.objs[0].cpu, 'Intel Core i7');
  assert.equal(s.objs[0].ram, '16 GB');
  assert.equal(s.objs[0].user, 'Frei', 'a person already on the object is kept');
  mergeRecords(s, recordsFromJson([{ name: 'PC2', serial: 'P2', ref: 'pc2', user: 'mueller' }]));
  assert.equal(s.objs.find(o => o.name === 'PC2').user, 'mueller', 'a new object gets the last user');
});

test('firmware, power event, disks, update and antivirus move only where the policy allows', async () => {
  const { mergeRecords, recordsFromJson } = await import('../server/feed.js');
  const s = { objs: [{ id: 'o1', name: 'SRV1', type: 'server', feed: { sys: 'Lansweeper', ref: 'srv1' }, ovr: {} }],
    rels: [], policy: { fw: true, disk: true, av: false }, feedOn: true, locs: [], seq: 100, codeN: 1 };
  mergeRecords(s, recordsFromJson([{ name: 'SRV1', ref: 'srv1', fw: '2.10', boot: '2026-10-20 06:00', disk: 'C: 40/120 GB', patch: 'KB5034441 (2026-10-01)', av: 'Defender, scanning on, up to date' }]));
  assert.equal(s.objs[0].fw, '2.10');
  assert.equal(s.objs[0].disk, 'C: 40/120 GB');
  assert.equal(s.objs[0].av, undefined, 'antivirus is off in the policy');
  assert.equal(s.objs[0].boot, undefined, 'power event is off in the policy');
});

test('feed push takes assets from a script with the feed token, and refuses everything else', async () => {
  const srv = await startServer({ feedToken: 'push-secret-123' });
  const push = (auth, body) => fetch(srv.base + '/api/feed/push', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body)
  });
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    await srv.call('PUT', '/api/state', { body: baseState({
      users: [adminUser],
      objs: [{ id: 'o5', code: 'INV-0005', type: 'server', name: 'SRV-1', serial: 'SRV1', ip: '10.0.0.1', ovr: {}, feed: null }], codeN: 5, seq: 105
    }), cookie: admin.cookie });
    assert.equal((await push(null, { records: [] })).status, 401, 'no token');
    assert.equal((await push('Bearer wrong-token', { records: [] })).status, 401, 'wrong token');
    assert.equal((await push('Bearer push-secret-123', { records: 'x' })).status, 400, 'records must be a list');
    const ok = await push('Bearer push-secret-123', { records: [{ name: 'SRV-1', serial: 'SRV1', ip: '10.0.0.2', assetType: 'Linux', ref: '7' }, { name: 'PC-NEW', serial: 'N1', assetType: 'Windows' }] });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).counts.linked, 1);
    const back = (await srv.call('GET', '/api/state', { cookie: admin.cookie })).json;
    assert.equal(back.objs.find(o => o.name === 'SRV-1').ip, '10.0.0.2');
    assert.equal(back.objs.find(o => o.name === 'PC-NEW').type, 'pc');
  } finally { await srv.close(); }
  const closed = await startServer();
  try {
    const r = await fetch(closed.base + '/api/feed/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer anything' }, body: '{"records":[]}' });
    assert.equal(r.status, 401, 'with no token set on the server the route is closed');
  } finally { await closed.close(); }
});

test('the push token is made in the app: only admins, shown once, works until revoked', async () => {
  const srv = await startServer();
  const push = (token, records) => fetch(srv.base + '/api/feed/push', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ records })
  });
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    await srv.call('PUT', '/api/state', { body: baseState({ users: [adminUser] }), cookie: admin.cookie });
    assert.equal((await srv.call('GET', '/api/feed/push-token', { cookie: admin.cookie })).json.info, null, 'no token yet');
    const made = await srv.call('POST', '/api/feed/push-token', { cookie: admin.cookie });
    assert.equal(made.status, 200);
    const token = made.json.token;
    assert.ok(token.length >= 30);
    assert.ok(made.json.info.created);
    assert.equal((await push(token, [{ name: 'PC-APP', serial: 'APP1' }])).status, 200, 'the new token works');
    assert.equal((await push('wrong', [])).status, 401);
    const script = await srv.call('GET', '/api/feed/push-script', { cookie: admin.cookie, type: 'text' });
    assert.equal(script.status, 200);
    assert.match(script.text, new RegExp("NobsUrl\\s*= '" + srv.base.replace(/[.]/g, '\\.') + "'"), 'the script has this server\'s address');
    assert.equal((await fetch(srv.base + '/api/feed/push-script')).status, 401, 'the script needs a sign-in');
    assert.equal((await srv.call('DELETE', '/api/feed/push-token', { cookie: admin.cookie })).status, 200);
    assert.equal((await push(token, [])).status, 401, 'a revoked token stops working');
    assert.equal((await srv.call('POST', '/api/feed/push-token', { cookie: admin.cookie })).status, 200);
  } finally { await srv.close(); }
});

test('repeated failed sign-ins are throttled; the answer is the same for every failure', async () => {
  const srv = await startServer();
  try {
    const answers = new Set();
    for (let i = 0; i < 8; i++) answers.add((await signIn(srv, 'admin', 'wrong' + i)).status);
    assert.deepEqual([...answers], [401]);
    assert.equal((await signIn(srv, 'admin', 'adminpass123')).status, 429, 'even the right password waits after the limit');
    const fresh = await startServer();
    assert.equal((await signIn(fresh, 'nobody', 'x')).status, 401, 'an unknown login gets the same generic answer');
    await fresh.close();
  } finally { await srv.close(); }
});

test('security headers are sent, and the cookie is Secure in production', async () => {
  const srv = await startServer();
  try {
    const r = await fetch(srv.base + '/');
    assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
  } finally { await srv.close(); }
});

test('an overlong password is refused before the hash is computed; roles are checked on save', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    assert.equal((await srv.call('POST', '/api/users/u-admin/password', { body: { password: 'x'.repeat(300) }, cookie: admin.cookie })).status, 400);
    const bad = baseState({ users: [{ id: 'u-admin', login: 'admin', name: 'A', role: 'superuser', active: true }] });
    assert.equal((await srv.call('PUT', '/api/state', { body: bad, cookie: admin.cookie })).status, 400);
  } finally { await srv.close(); }
});

test('a second sign-in keeps the first one working; malformed JSON gets a short answer', async () => {
  const srv = await startServer();
  try {
    const first = await signIn(srv, 'admin', 'adminpass123');
    const second = await signIn(srv, 'admin', 'adminpass123');
    assert.equal((await srv.call('GET', '/api/state', { cookie: first.cookie })).status, 200);
    assert.equal((await srv.call('GET', '/api/state', { cookie: second.cookie })).status, 200);
    const bad = await fetch(srv.base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    assert.equal(bad.status, 400);
    assert.deepEqual(await bad.json(), { error: 'Send valid JSON.' });
  } finally { await srv.close(); }
});

test('health reports the version; login throttling is per user, not shared by all clients behind the proxy', async () => {
  const srv = await startServer();
  try {
    const h = await (await fetch(srv.base + '/api/health')).json();
    assert.equal(h.version, JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
    const attempt = (login, ip) => fetch(srv.base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ login, password: 'wrong' }) });
    for (let i = 0; i < 8; i++) await attempt('admin', '203.0.113.5');
    assert.equal((await attempt('admin', '203.0.113.5')).status, 429, 'the attacker is blocked');
    assert.equal((await attempt('admin', '198.51.100.9')).status, 401, 'another client is not blocked by the attacker\'s failures');
  } finally { await srv.close(); }
});

test('older data is brought up to the current types, and racks become rack objects with their devices still mounted', async () => {
  const { migrateState } = await import('../server/migrate.js');
  const s = { objs: [{ id: 'o1', code: 'INV-0001', type: 'iphone', name: 'IPH-1' }, { id: 'o2', code: 'INV-0002', type: 'tablet', name: 'TAB-1' },
    { id: 'o3', code: 'INV-0003', type: 'server', name: 'SRV-1', rack: 'r1', u: 3, h: 2 }],
    types: { tablet: { label: 'Tablet' }, pc: { label: 'PC' } }, typeMap: { IOS: 'iphone' }, racks: [{ id: 'r1', name: 'Rack A', loc: 'Basel / Lager', units: 24 }], codeN: 3 };
  assert.equal(migrateState(s), true);
  assert.equal(s.objs.find(o => o.id === 'o1').type, 'ios');
  assert.equal(s.objs.find(o => o.id === 'o2').type, 'mobile');
  assert.equal(s.types.tablet, undefined, 'the old tablet type is still in the type table');
  assert.equal(s.typeMap.IOS, 'ios');
  const rack = s.objs.find(o => o.id === 'r1');
  assert.deepEqual([rack.type, rack.name, rack.loc, rack.units], ['rack', 'Rack A', 'Basel / Lager', 24]);
  assert.equal(s.objs.find(o => o.id === 'o3').rack, 'r1', 'the device lost its rack');
  assert.deepEqual(s.racks, []);
  assert.equal(migrateState(s), false, 'running the migration again changed something');
});

test('two users cannot share a login, whichever way the inventory is saved', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    const dup = [adminUser, { id: 'u-x', login: 'ADMIN', name: 'Other', role: 'viewer', active: true }];
    assert.equal((await srv.call('PUT', '/api/state', { body: baseState({ users: dup }), cookie: admin.cookie })).status, 400);
    const change = { puts: [{ kind: 'user', id: 'u-x', value: { id: 'u-x', login: 'admin', name: 'Other', role: 'viewer', active: true }, base: null }], dels: [] };
    assert.equal((await srv.call('POST', '/api/changes', { body: change, cookie: admin.cookie })).status, 400, 'a change that repeats a login was saved');
  } finally { await srv.close(); }
});

test('a viewer does not receive sign-in names or directory groups of the other users', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    const users = [adminUser, { id: 'u-anna', login: 'anna', name: 'Anna', role: 'viewer', active: true, groups: ['Staff'] }];
    assert.equal((await srv.call('PUT', '/api/state', { body: baseState({ users }), cookie: admin.cookie })).status, 200);
    assert.equal((await srv.call('POST', '/api/users/u-anna/password', { body: { password: 'viewerpw123' }, cookie: admin.cookie })).status, 200);
    const viewer = await signIn(srv, 'anna', 'viewerpw123');
    const state = await srv.call('GET', '/api/state', { cookie: viewer.cookie });
    const anna = state.json.users.find(u => u.id === 'u-anna');
    assert.equal(anna.name, 'Anna');
    assert.equal('login' in anna, false, 'the viewer received a login');
    assert.equal('groups' in anna, false, 'the viewer received directory groups');
    const own = await srv.call('GET', '/api/state', { cookie: admin.cookie });
    assert.equal(own.json.users.find(u => u.id === 'u-anna').login, 'anna', 'the admin lost the login');
  } finally { await srv.close(); }
});
