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
  assert.equal(anna.source, 'lansweeper', 'the person is marked as named by Lansweeper');
  assert.equal(s.users.find(u => u.name === 'Bea Directory').dept, '', 'the directory decides a directory user\'s department');
  checkState(s);
});

test('subnets the adapters report and the inventory lacks are suggested, with their usual gateway and the IP location name', () => {
  const recs = [
    { ip: '172.21.108.14', mask: '255.255.255.0', gateway: '172.21.108.1', dns: '172.21.1.5, 172.21.1.6', type: 'pc', dhcp: 'dhcp' },
    { ip: '172.21.108.150', mask: '255.255.255.0', gateway: '172.21.108.1', dns: '172.21.1.5, 172.21.1.6', type: 'pc', dhcp: 'dhcp' },
    { ip: '172.21.108.16', mask: '255.255.255.0', gateway: '172.21.108.254', dns: '', type: 'printer', dhcp: 'static' },
    { ip: '10.10.20.5', mask: '255.255.255.0', gateway: '10.10.20.1' },
  ];
  const nets = suggestNets(recs, [{ cidr: '10.10.20.0/24' }], IP_LOCATIONS);
  assert.equal(nets.length, 1, 'a subnet the inventory has is not suggested');
  assert.deepEqual(nets[0], { cidr: '172.21.108.0/24', devices: 3, gateway: '172.21.108.1', dns: ['172.21.1.5', '172.21.1.6'], name: 'Willisau Lager',
    types: [{ type: 'pc', count: 2 }, { type: 'printer', count: 1 }],
    seen: [{ use: 'DHCP', from: '172.21.108.14', to: '172.21.108.150', count: 2 }, { use: 'Static', from: '172.21.108.16', to: '172.21.108.16', count: 1 }] },
    'the device types seen there, and the lowest and highest address per kind');
  const s = base({ subnets: [] });
  const counts = mergeRecords(s, recordsFromJson(recs.map((r, i) => ({ ...r, name: 'D' + i, ref: String(i) }))), now, IP_LOCATIONS);
  assert.equal(s.lsNets.length, 2);
  assert.equal(counts.networks, 1, 'a push that only brings new suggestions is still saved');
  // A push comes in batches: a second batch with other devices keeps the first batch's subnets in the suggestions.
  mergeRecords(s, recordsFromJson([{ name: 'E1', ref: 'e1', ip: '192.168.5.10', mask: '255.255.255.0', gateway: '192.168.5.1' }]), now);
  assert.deepEqual(s.lsNets.map(n => n.cidr).sort(), ['10.10.20.0/24', '172.21.108.0/24', '192.168.5.0/24']);
});

test('a drive or motion controller that Lansweeper files as a switch is a PLC / controller; a real switch stays one', async () => {
  const { typeFor } = await import('../server/feed.js');
  assert.equal(typeFor({}, 'Switch', 'SIEMENS AG, Digital Factory, Motion Control System SINAMICS G120 CU240E-2'), 'plc');
  assert.equal(typeFor({}, 'Network device', 'Allen-Bradley PowerFlex 525'), 'plc');
  assert.equal(typeFor({}, 'Switch', 'Siemens SCALANCE XC208'), 'switch');
  assert.equal(typeFor({ typeMap: { switch: 'switch' } }, 'Switch', 'SINAMICS G120'), 'switch', 'a mapping set in Settings still wins');
});

test('every box in Feed may overwrite does what it says: location, room from IP, IPv6, Windows update, software, monitors, departments', () => {
  const pc = (extra = {}) => ({ id: 'a', code: 'INV-1', type: 'pc', name: 'PC-A', status: 'active', loc: 'Willisau / Büro', ovr: {}, feed: { sys: 'Lansweeper', ref: '1' }, ...extra });
  const mon = { id: 'm', code: 'INV-2', type: 'monitor', name: 'MON-A', status: 'active', loc: '', ovr: {}, feed: { sys: 'Lansweeper', ref: '2' } };
  const rec = { name: 'PC-A', ref: '1', ip: '172.21.108.14', ip6: '2001:DB8::14', patch: 'KB5066835 (2026-10-14)', location: 'Willisau / Lager',
    user: 'Anna Muster', userDept: 'Logistik', software: [{ name: 'Tool A', version: '1' }], links: [{ kind: 'attached', ref: '2' }] };
  const run = (policy, objs = [pc(), { ...mon }], users = []) => {
    const s = base({ policy, objs, users });
    mergeRecords(s, recordsFromJson([rec, { name: 'MON-A', ref: '2' }]), now, IP_LOCATIONS);
    return s;
  };
  const all = { loc: true, ipRoom: true, ip6: true, patch: true, software: true, links: true, dept: true, user: true };
  let s = run(all);
  let o = s.objs.find(x => x.id === 'a');
  assert.equal(o.loc, 'Willisau / Lager', 'Location: Lansweeper\'s room replaces the one the device had');
  assert.match(s.history.a[0].msg, /Location changed from Willisau \/ Büro to Willisau \/ Lager/);
  assert.equal(o.ip6, '2001:db8::14', 'IPv6 is kept in its stored form');
  assert.equal(o.patch, 'KB5066835 (2026-10-14)');
  assert.deepEqual(o.software.map(x => x.name), ['Tool A']);
  assert.ok(s.rels.some(r => r.from === 'a' && r.to === 'm' && r.kind === 'attached'), 'the monitor is attached');

  s = run({ loc: false, ipRoom: true, ip6: false, patch: false, software: false, links: false, dept: false, user: true });
  o = s.objs.find(x => x.id === 'a');
  assert.equal(o.loc, 'Willisau / Büro', 'Location off: the room stays');
  assert.equal(o.ip6, undefined); assert.equal(o.patch, undefined);
  assert.equal(o.software, undefined, 'Installed software off');
  assert.equal(s.rels.length, 0, 'Monitors off');
  assert.ok(!s.users.some(u => u.dept === 'Logistik'), 'Departments off');

  // Room from IP location: fills an empty location when on, leaves it empty when off
  assert.equal(run({ ipRoom: true }, [pc({ loc: '' }), { ...mon }]).objs.find(x => x.id === 'a').loc, 'Willisau / Lager');
  assert.equal(run({ ipRoom: false }, [pc({ loc: '' }), { ...mon }]).objs.find(x => x.id === 'a').loc, '');
  // An IPv6 that is not one is not stored
  const bad = base({ policy: all, objs: [pc()] });
  mergeRecords(bad, recordsFromJson([{ ...rec, ip6: 'fe80::zz' }]), now);
  assert.equal(bad.objs[0].ip6, undefined);
  checkState(s);
});
