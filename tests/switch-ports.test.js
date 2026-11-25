/* Switch ports from Lansweeper: a device a switch scan sees alone on a port is plugged into it ("Plugged into", with the
   port); it moves with the device, never replaces a connection made by hand, never takes a port another device has, and
   a port the switch does not have is passed over. What Lansweeper sees is kept with the device for its Sources tab. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords, recordsFromJson } from '../server/feed.js';

const base = (objs, more = {}) => ({ objs, rels: [], users: [], policy: { links: true }, feedOn: true, locs: [], seq: 100, codeN: 0, rseq: 0, types: {}, history: {}, ...more });
const ls = (id, name, ref, type, more = {}) => ({ id, code: 'INV-' + id, type, name, status: 'active', loc: '', ovr: {}, feed: { sys: 'Lansweeper', ref }, ...more });
const now = new Date(2026, 10, 25, 10, 0);
const recs = (pcLinks, more = []) => recordsFromJson([
  { name: 'SW03', ref: '50', assetType: 'Switch' }, { name: 'SW04', ref: '60', assetType: 'Switch' },
  { name: 'PC-1', ref: '51', assetType: 'Windows', role: 'workstation', links: pcLinks }, ...more,
]);
const plugs = s => s.rels.filter(r => r.kind === 'connected').map(r => [r.from, r.to, r.port, r.src]);

test('a device is plugged into the switch port a scan sees it on, and moves with it', () => {
  const s = base([ls('sw', 'SW03', '50', 'switch', { ports: 24 }), ls('sw4', 'SW04', '60', 'switch', { ports: 48 }), ls('pc', 'PC-1', '51', 'pc')]);
  mergeRecords(s, recs([{ kind: 'connected', ref: '50', port: '22' }]), now, []);
  assert.deepEqual(plugs(s), [['pc', 'sw', 22, 'Lansweeper']]);
  assert.deepEqual(s.objs.find(o => o.id === 'pc').feed.plug, { to: 'sw', port: 22 });
  mergeRecords(s, recs([{ kind: 'connected', ref: '50', port: '7' }]), now, []);
  assert.deepEqual(plugs(s), [['pc', 'sw', 7, 'Lansweeper']], 'another port');
  mergeRecords(s, recs([{ kind: 'connected', ref: '60', port: '40' }]), now, []);
  assert.deepEqual(plugs(s), [['pc', 'sw4', 40, 'Lansweeper']], 'another switch: the old link goes');
  mergeRecords(s, recs([]), now, []);
  assert.deepEqual(plugs(s), [['pc', 'sw4', 40, 'Lansweeper']], 'not seen this time (switched off): the link stays');
});

test('a connection made by hand stays; a used port or one the switch lacks is passed over', () => {
  const s = base([ls('sw', 'SW03', '50', 'switch', { ports: 24 }), ls('sw4', 'SW04', '60', 'switch', { ports: 48 }), ls('pc', 'PC-1', '51', 'pc'), ls('pc2', 'PC-2', '52', 'pc')],
    { rels: [{ id: 'r1', from: 'pc', to: 'sw4', kind: 'connected', port: 3, vlan: null }, { id: 'r2', from: 'pc2', to: 'sw', kind: 'connected', port: 22, vlan: null }] });
  const c = mergeRecords(s, recs([{ kind: 'connected', ref: '50', port: '22' }]), now, []);
  assert.deepEqual(plugs(s), [['pc', 'sw4', 3, undefined], ['pc2', 'sw', 22, undefined]], 'by hand: kept');
  assert.deepEqual(s.objs.find(o => o.id === 'pc').feed.plug, { to: 'sw', port: 22 }, 'what Lansweeper sees is kept for Sources');
  assert.equal(c.plugHand, 1);
  s.rels = [s.rels[1]];
  const c2 = mergeRecords(s, recs([{ kind: 'connected', ref: '50', port: '22' }]), now, []);
  assert.equal(c2.portConflict, 1, 'PC-2 has port 22');
  const c3 = mergeRecords(s, recs([{ kind: 'connected', ref: '50', port: '30' }]), now, []);
  assert.equal(c3.plugNoPort, 1, 'SW03 has 24 ports');
  assert.deepEqual(plugs(s), [['pc2', 'sw', 22, undefined]]);
});

test('network gear is not plugged into the switch above it', () => {
  const s = base([ls('sw', 'SW03', '50', 'switch', { ports: 48 }), ls('fw', 'FW-1', '70', 'firewall')]);
  mergeRecords(s, recordsFromJson([{ name: 'SW03', ref: '50', assetType: 'Switch' }, { name: 'FW-1', ref: '70', assetType: 'Firewall', links: [{ kind: 'connected', ref: '50', port: '48' }] }]), now, []);
  assert.deepEqual(plugs(s), []);
});

test('a laptop with a dock kept as an attachment: its own port wins over the dock\'s, and nothing swaps between pushes', () => {
  const s = base([ls('sw', 'SW03', '50', 'switch', { ports: 48 }),
    ls('pc', 'PC-1', '51', 'notebook', { accessories: [{ name: 'Docking station', kind: 'Dock', seenAs: 'pc-1.corp.example', ref: '80' }] })], { mergeTwins: true });
  const push = (pcLinks, dockLinks) => mergeRecords(s, recordsFromJson([
    { name: 'SW03', ref: '50', assetType: 'Switch' },
    { name: 'PC-1', ref: '51', assetType: 'Windows', role: 'workstation', links: pcLinks },
    { name: 'pc-1.corp.example', ref: '80', assetType: 'Windows', links: dockLinks },
  ]), now, []);
  push([{ kind: 'connected', ref: '50', port: '7' }], [{ kind: 'connected', ref: '50', port: '12' }]);
  assert.deepEqual(plugs(s), [['pc', 'sw', 7, 'Lansweeper']], 'its own record\'s port');
  const ids = s.rels.map(r => r.id);
  push([{ kind: 'connected', ref: '50', port: '7' }], [{ kind: 'connected', ref: '50', port: '12' }]);
  assert.deepEqual(s.rels.map(r => r.id), ids, 'the same push again changes nothing');
  push([], [{ kind: 'connected', ref: '50', port: '12' }]);
  assert.deepEqual(plugs(s), [['pc', 'sw', 12, 'Lansweeper']], 'seen only through its dock: the dock\'s port');
});

test('a switch scan fills the port count of a switch that has none; ports set by hand stay', () => {
  const s = base([ls('sw', 'SW03', '50', 'switch'), ls('sw2', 'SW04', '60', 'switch', { ports: 22, sfp: 22 })]);
  mergeRecords(s, recordsFromJson([{ name: 'SW03', ref: '50', assetType: 'Switch', portCount: '24', sfpCount: '4' }, { name: 'SW04', ref: '60', assetType: 'Switch', portCount: '48', sfpCount: '4' },
    { name: 'SW05', ref: '61', assetType: 'Switch', portCount: '8', sfpCount: '0' }]), now, []);
  const by = n => s.objs.find(o => o.name === n);
  assert.deepEqual([by('SW03').ports, by('SW03').sfp], [24, 4]);
  assert.match(s.history.sw[0].msg, /Lansweeper: 24 ports and 4 SFP\+ ports, from the switch scan/);
  assert.deepEqual([by('SW04').ports, by('SW04').sfp], [22, 22], 'set by hand: kept');
  assert.deepEqual([by('SW05').ports, by('SW05').sfp], [8, undefined], 'a new switch gets its ports too');
});

test('a port Lansweeper linked before is freed when the push no longer brings it: replaced devices, swapped ports', () => {
  const s = base([ls('sw', 'SW03', '50', 'switch', { ports: 24 }), ls('a', 'PC-A', '51', 'pc'), ls('b', 'PC-B', '52', 'pc')]);
  const push = (aLinks, bLinks) => mergeRecords(s, recordsFromJson([{ name: 'SW03', ref: '50', assetType: 'Switch' },
    { name: 'PC-A', ref: '51', assetType: 'Windows', links: aLinks }, { name: 'PC-B', ref: '52', assetType: 'Windows', links: bLinks }]), now, []);
  push([{ kind: 'connected', ref: '50', port: '5' }], [{ kind: 'connected', ref: '50', port: '7' }]);
  assert.deepEqual(plugs(s), [['a', 'sw', 5, 'Lansweeper'], ['b', 'sw', 7, 'Lansweeper']]);
  const c = push([{ kind: 'connected', ref: '50', port: '7' }], [{ kind: 'connected', ref: '50', port: '5' }]);
  assert.ok(!c.portConflict, 'swapped ports are no conflict');
  assert.deepEqual(plugs(s).sort(), [['a', 'sw', 7, 'Lansweeper'], ['b', 'sw', 5, 'Lansweeper']]);
  push([], [{ kind: 'connected', ref: '50', port: '7' }]);
  assert.deepEqual(plugs(s), [['b', 'sw', 7, 'Lansweeper']], 'A seen on no port any more: its link goes, port 7 is B\'s');
  assert.equal(s.objs.find(o => o.id === 'a').feed.plug, undefined, 'and what Lansweeper saw goes with it');
  const again = mergeRecords(s, recordsFromJson([{ name: 'SW03', ref: '50', assetType: 'Switch' }, { name: 'PC-A', ref: '51', assetType: 'Windows', links: [] }, { name: 'PC-B', ref: '52', assetType: 'Windows', links: [{ kind: 'connected', ref: '50', port: '7' }] }]), now, []);
  assert.ok(!again.links, 'the same push again changes nothing');
});

test('a push without switch ports at all (the switch scan failed) keeps the links', () => {
  const s = base([ls('sw', 'SW03', '50', 'switch', { ports: 24 }), ls('a', 'PC-A', '51', 'pc')],
    { rels: [{ id: 'r1', from: 'a', to: 'sw', kind: 'connected', port: 5, vlan: null, src: 'Lansweeper' }] });
  mergeRecords(s, recordsFromJson([{ name: 'SW03', ref: '50', assetType: 'Switch' }, { name: 'PC-A', ref: '51', assetType: 'Windows', links: [] }]), now, []);
  assert.deepEqual(plugs(s), [['a', 'sw', 5, 'Lansweeper']]);
});

test('ports are filled once: a count a person cleared stays cleared, and none while the feed is off', () => {
  const s = base([ls('sw', 'SW03', '50', 'switch')]);
  const push = () => mergeRecords(s, recordsFromJson([{ name: 'SW03', ref: '50', assetType: 'Switch', portCount: '24', sfpCount: '4' }]), now, []);
  push(); const o = s.objs[0];
  assert.equal(o.ports, 24);
  o.ports = 0; delete o.sfp; push();
  assert.equal(o.ports, 0, 'cleared by a person: stays');
  const t = base([ls('sw', 'SW03', '50', 'switch')], { feedOn: false });
  mergeRecords(t, recordsFromJson([{ name: 'SW03', ref: '50', assetType: 'Switch', portCount: '24' }]), now, []);
  assert.equal(t.objs[0].ports, undefined, 'feed off: nothing written');
});
