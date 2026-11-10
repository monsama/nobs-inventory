import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords, recordsFromJson } from '../server/feed.js';

/* Which device a Lansweeper record goes to, and what the sync may change there. */
const base = (objs, rels = []) => ({ objs, rels, users: [], policy: { ip: true, links: true }, feedOn: true, intake: 'direct',
  locs: [], seq: 100, codeN: 10, rseq: 0, types: {}, history: {} });
const dev = (id, name, more = {}) => ({ id, code: 'INV-' + id, type: 'pc', name, status: 'active', loc: '', ovr: {}, feed: { sys: 'Lansweeper', ref: 'x' + id }, ...more });
const now = new Date(2026, 10, 8, 10, 0);
const push = (s, recs) => mergeRecords(s, recordsFromJson(recs), now, []);
const ip = (s, id) => s.objs.find(o => o.id === id).ip;

test('a retired device is never changed by the sync', () => {
  const s = base([dev('r', 'OLD-PC', { status: 'retired', serial: 'S1', ip: '10.0.0.1', type: 'other' })]);
  push(s, [{ name: 'OLD-PC', serial: 'S1', ip: '10.0.0.9', assetType: 'Windows' }]);
  const o = s.objs.find(x => x.id === 'r');
  assert.deepEqual([o.ip, o.type], ['10.0.0.1', 'other']);
  assert.equal(s.objs.length, 1, 'nothing new is made for it either');
});

test('a retired device does not block the one in use with its name; two in use with one serial are told apart by name', () => {
  let s = base([dev('r', 'PRN-1', { status: 'retired', feed: null }), dev('a', 'PRN-1', { feed: null })]);
  push(s, [{ name: 'PRN-1', ip: '10.0.0.5' }]);
  assert.equal(ip(s, 'a'), '10.0.0.5', 'the active namesake is not updated');
  s = base([dev('a', 'PC-A', { serial: 'S', feed: null }), dev('b', 'PC-B', { serial: 'S', feed: null })]);
  push(s, [{ name: 'PC-B', serial: 'S', ip: '10.0.0.7' }]);
  assert.deepEqual([ip(s, 'a'), ip(s, 'b')], [undefined, '10.0.0.7']);
});

test('Lansweeper\'s asset id finds a renamed device, or one with a new serial number', () => {
  const s = base([dev('a', 'PC-OLD', { feed: { sys: 'Lansweeper', ref: '77' } }), dev('b', 'PC-2', { serial: 'OLD', feed: { sys: 'Lansweeper', ref: '78' } })]);
  push(s, [{ name: 'PC-NEW', ref: '77', ip: '10.0.0.3' }, { name: 'PC-2', serial: 'NEWBOARD', ref: '78', ip: '10.0.0.4' }]);
  assert.equal(s.objs.length, 2, 'a second device was made');
  assert.deepEqual([ip(s, 'a'), ip(s, 'b')], ['10.0.0.3', '10.0.0.4']);
});

test('a record merged into a device as the same device updates that device, not nothing', () => {
  const rec = dev('m', 'PC-1', { serial: 'Y', excluded: true, review: { src: 'lansweeper', merged: 't', ignored: 'x' }, feed: { sys: 'Lansweeper', ref: 'r9' } });
  const s = base([dev('t', 'PC-1', { serial: 'X', feed: { sys: 'Lansweeper', ref: 'r1' } }), rec]);
  push(s, [{ name: 'PC-1', serial: 'Y', ref: 'r9', ip: '10.0.0.8' }]);
  assert.equal(ip(s, 't'), '10.0.0.8');
});

test('links from Lansweeper follow the relation rule: one host, never a retired one', () => {
  const pcA = dev('a', 'PC-A', { feed: { sys: 'Lansweeper', ref: '1' } }), pcB = dev('b', 'PC-B', { feed: { sys: 'Lansweeper', ref: '2' } });
  const mon = dev('m', 'MON', { type: 'monitor', feed: { sys: 'Lansweeper', ref: '3' } });
  const old = dev('o', 'PC-OLD', { status: 'retired', feed: { sys: 'Lansweeper', ref: '4' } });
  /* attached to A by hand; Lansweeper says B: the hand-made link stays, no second host */
  let s = base([pcA, pcB, { ...mon }], [{ id: 'h', from: 'm', to: 'a', kind: 'attached', port: null, vlan: null }]);
  push(s, [{ name: 'MON', ref: '3', links: [{ kind: 'attached', ref: '2' }] }]);
  assert.deepEqual(s.rels.filter(r => r.from === 'm').map(r => r.to), ['a']);
  /* one Lansweeper made moves with Lansweeper */
  s = base([pcA, pcB, { ...mon }], [{ id: 'l', from: 'm', to: 'a', kind: 'attached', port: null, vlan: null, src: 'Lansweeper' }]);
  push(s, [{ name: 'MON', ref: '3', links: [{ kind: 'attached', ref: '2' }] }]);
  assert.deepEqual(s.rels.filter(r => r.from === 'm').map(r => r.to), ['b']);
  /* never onto a retired computer */
  s = base([old, { ...mon }]);
  push(s, [{ name: 'MON', ref: '3', links: [{ kind: 'attached', ref: '4' }] }]);
  assert.equal(s.rels.length, 0);
});

test('a field sent as an object or list is left empty', () => {
  const [r] = recordsFromJson([{ name: { a: 1 }, serial: ['x'], ip: '10.0.0.1' }]);
  assert.deepEqual([r.name, r.serial, r.ip], ['', '', '10.0.0.1']);
});

test('a gateway outside the network of the device\'s address is left out, and one stored that way is cleared', () => {
  const s = base([dev('a', 'PC-A', { ip: '172.21.103.40', gateway: '192.168.179.1', src: { gateway: 'ls' } })]);
  s.subnets = [{ name: 'Office', cidr: '172.21.103.0/24', gateway: '172.21.103.2', dns: [], ranges: [], types: [] }];
  s.policy.gateway = true;
  push(s, [{ name: 'PC-A', ref: 'xa', ip: '172.21.103.40', gateway: '192.168.179.1' }]);
  assert.equal(s.objs[0].gateway, undefined, 'the device takes its subnet\'s gateway');
  /* by its own mask, without a listed subnet; one inside the network is kept */
  const t = base([dev('b', 'PC-B', {})]); t.policy.gateway = true;
  push(t, [{ name: 'PC-B', ref: 'xb', ip: '10.1.2.3', mask: '255.255.255.0', gateway: '10.9.9.1' }]);
  assert.equal(t.objs[0].gateway, undefined);
  push(t, [{ name: 'PC-B', ref: 'xb', ip: '10.1.2.3', mask: '255.255.255.0', gateway: '10.1.2.1' }]);
  assert.equal(t.objs[0].gateway, '10.1.2.1');
});
