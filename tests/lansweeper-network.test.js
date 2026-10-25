import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords, recordsFromJson, dayOf } from '../server/feed.js';
import { cleanIpLocations, prefixOf, roomForIpLocation, subnetOf, suggestNets } from '../server/lsnet.js';
import { checkState } from '../server/state.js';

/* What a push brings beyond the device itself: IP locations, the adapter's network, warranty dates, the Windows role
   and the user's department. */
const base = (extra = {}) => ({ objs: [], rels: [], users: [], policy: { ip: true, mask: true, gateway: true, dns: true, dhcp: true, purchased: true, warranty: true }, feedOn: true,
  locs: ['Willisau / Lager', 'Willisau / Büro'], seq: 100, codeN: 0, rseq: 0, types: {}, history: {}, ...extra });
const now = new Date(2026, 9, 25, 10, 0);
const IP_LOCATIONS = cleanIpLocations([
  { name: 'Willisau Lager', from: '172.21.108.1', to: '172.21.108.254' },
  { name: 'Willisau', from: '172.21.0.1', to: '172.21.255.254' },
  { name: 'broken', from: '10.0.0.9', to: '10.0.0.1' },
]);

test('masks, subnets and IP location names are read the way the inventory writes them', () => {
  assert.equal(prefixOf('255.255.255.0'), 24);
  assert.equal(prefixOf('255.255.0.255'), null, 'a mask with a hole is not a mask');
  assert.equal(subnetOf('10.10.20.37', '255.255.255.0'), '10.10.20.0/24');
  assert.equal(subnetOf('10.10.20.37', '255.255.255.255'), null, 'a /32 is not a subnet');
  assert.equal(IP_LOCATIONS.length, 2, 'a range that runs backwards is left out');
  assert.equal(roomForIpLocation(['Willisau / Lager'], 'Willisau Lager'), 'Willisau / Lager');
  assert.equal(roomForIpLocation(['Willisau / Lager'], 'Willisau'), null, 'a site is not a room');
  assert.equal(dayOf('2027-03-31T00:00:00'), '2027-03-31');
  assert.equal(dayOf('31.3.2027'), '2027-03-31');
  assert.equal(dayOf('1900-01-01'), '', 'Lansweeper\'s empty date is no date');
});

test('a device with no location gets the room its address is in; a location set by hand or held by the device stays', () => {
  const s = base({ objs: [
    { id: 'a', code: 'INV-1', type: 'pc', name: 'PC-A', status: 'active', loc: '', ovr: {}, feed: null },
    { id: 'b', code: 'INV-2', type: 'pc', name: 'PC-B', status: 'active', loc: 'Willisau / Büro', ovr: {}, feed: null },
    { id: 'c', code: 'INV-3', type: 'pc', name: 'PC-C', status: 'active', loc: '', ovr: { loc: false }, feed: null },
  ] });
  mergeRecords(s, recordsFromJson([
    { name: 'PC-A', ip: '172.21.108.14', ref: '1' }, { name: 'PC-B', ip: '172.21.108.15', ref: '2' }, { name: 'PC-C', ip: '172.21.108.16', ref: '3' },
    { name: 'NEW-1', ip: '172.21.108.17', ref: '4', assetType: 'Windows' }, { name: 'NEW-2', ip: '10.9.9.9', ref: '5', assetType: 'Windows' },
  ]), now, IP_LOCATIONS);
  const loc = n => s.objs.find(o => o.name === n).loc;
  assert.equal(loc('PC-A'), 'Willisau / Lager');
  assert.equal(loc('PC-B'), 'Willisau / Büro', 'a location the device has is not replaced');
  assert.equal(loc('PC-C'), '', 'a device that holds its location keeps none');
  assert.equal(loc('NEW-1'), 'Willisau / Lager', 'a new device gets the room of its address');
  assert.equal(loc('NEW-2'), '', 'an address in no known room gives no location, not the first room in the list');
  assert.equal(s.lsIpLocations.length, 2, 'the IP locations are kept for the next sync');
});

test('gateway, DHCP and warranty dates come in under the overwrite rules; the Windows role sets PC or server', () => {
  const s = base({ objs: [{ id: 'a', code: 'INV-1', type: 'pc', name: 'PC-A', status: 'active', loc: '', ovr: { warranty: false }, warranty: '2026-01-01', feed: null }] });
  mergeRecords(s, recordsFromJson([
    { name: 'PC-A', ref: '1', ip: '10.10.20.5', mask: '255.255.255.0', gateway: '10.10.20.1', dhcp: 'True', purchased: '2023-04-01T00:00:00', warranty: '2028-04-01' },
    { name: 'DC01', ref: '2', assetType: 'Windows', role: 'dc', ip: '10.10.1.5' },
    { name: 'WS-LAB', ref: '3', assetType: 'Windows Server', role: 'workstation' },
    { name: 'VM-1', ref: '4', assetType: 'Virtual machine', role: 'server' },
    { name: 'PC-NEW', ref: '5', assetType: 'Windows', gateway: 'not an address', dhcp: 'maybe', warranty: 'soon' },
  ]), now);
  const o = n => s.objs.find(x => x.name === n);
  assert.equal(o('PC-A').gateway, '10.10.20.1');
  assert.equal(o('PC-A').dhcp, 'dhcp');
  assert.equal(o('PC-A').purchased, '2023-04-01');
  assert.equal(o('PC-A').warranty, '2026-01-01', 'a warranty date the device holds is kept');
  assert.equal(o('DC01').type, 'server', 'a domain controller filed as Windows is a server');
  assert.equal(o('WS-LAB').type, 'pc', 'a workstation is a PC whatever its type is called');
  assert.equal(o('VM-1').type, 'vm', 'a virtual machine stays one');
  assert.equal(o('PC-NEW').gateway, undefined, 'a gateway that is not an address is not stored');
  assert.equal(o('PC-NEW').dhcp, undefined);
  assert.equal(o('PC-NEW').warranty, undefined, 'a warranty that is not a date is not stored');
  checkState(s);
});

test('a user\'s department is filled in from the directory Lansweeper reads; a directory user\'s is left alone', () => {
  const s = base({ policy: { user: true }, users: [{ id: 'l1', login: 'bea', name: 'Bea Directory', dept: '', role: 'viewer', source: 'ldap', active: true }] });
  mergeRecords(s, recordsFromJson([
    { name: 'PC-1', ref: '1', assetType: 'Windows', user: 'Anna Muster', userDept: 'Logistik' },
    { name: 'PC-2', ref: '2', assetType: 'Windows', user: 'Bea Directory', userDept: 'Einkauf' },
  ]), now);
  const anna = s.users.find(u => u.name === 'Anna Muster');
  assert.ok(anna, 'the person named by the feed is made');
  assert.equal(anna.dept, 'Logistik');
  assert.equal(anna.role, 'viewer');
  assert.equal(s.users.find(u => u.name === 'Bea Directory').dept, '', 'the directory decides a directory user\'s department');
  checkState(s);
});

test('subnets the adapters report and the inventory lacks are suggested, with their usual gateway and the IP location name', () => {
  const recs = [
    { ip: '172.21.108.14', mask: '255.255.255.0', gateway: '172.21.108.1', dns: '172.21.1.5, 172.21.1.6' },
    { ip: '172.21.108.15', mask: '255.255.255.0', gateway: '172.21.108.1', dns: '172.21.1.5, 172.21.1.6' },
    { ip: '172.21.108.16', mask: '255.255.255.0', gateway: '172.21.108.254', dns: '' },
    { ip: '10.10.20.5', mask: '255.255.255.0', gateway: '10.10.20.1' },
  ];
  const nets = suggestNets(recs, [{ cidr: '10.10.20.0/24' }], IP_LOCATIONS);
  assert.equal(nets.length, 1, 'a subnet the inventory has is not suggested');
  assert.deepEqual(nets[0], { cidr: '172.21.108.0/24', devices: 3, gateway: '172.21.108.1', dns: ['172.21.1.5', '172.21.1.6'], name: 'Willisau Lager' });
  const s = base({ subnets: [] });
  const counts = mergeRecords(s, recordsFromJson(recs.map((r, i) => ({ ...r, name: 'D' + i, ref: String(i) }))), now, IP_LOCATIONS);
  assert.equal(s.lsNets.length, 2);
  assert.equal(counts.networks, 1, 'a push that only brings new suggestions is still saved');
  // A push comes in batches: a second batch with other devices keeps the first batch's subnets in the suggestions.
  mergeRecords(s, recordsFromJson([{ name: 'E1', ref: 'e1', ip: '192.168.5.10', mask: '255.255.255.0', gateway: '192.168.5.1' }]), now);
  assert.deepEqual(s.lsNets.map(n => n.cidr).sort(), ['10.10.20.0/24', '172.21.108.0/24', '192.168.5.0/24']);
});
