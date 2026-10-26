import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords, recordsFromJson } from '../server/feed.js';
import { checkState } from '../server/state.js';

/* The rules the Lansweeper merge follows: what it matches, what it may change, and what it leaves alone. */
const base = (extra = {}) => ({ objs: [], rels: [], users: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 0, rseq: 0, types: {}, history: {}, ...extra });
const now = new Date(2026, 9, 23, 10, 0);

test('a push does not touch a port a hand-made device already uses: switch links are not detected', () => {
  const s = base({
    objs: [
      { id: 'sw', type: 'switch', name: 'SW1', status: 'active', ports: 24, pfx: '1/', ovr: {}, feed: { sys: 'Lansweeper', ref: 'sw', seen: 'x' } },
      { id: 'man', type: 'pc', name: 'MANUAL-PC', status: 'active', ovr: {}, feed: null },
      { id: 'pc', type: 'pc', name: 'LS-PC', serial: 'LS1', status: 'active', ovr: {}, feed: { sys: 'Lansweeper', ref: 'pc1', seen: 'x' } },
    ],
    rels: [{ id: 'r0', from: 'man', to: 'sw', kind: 'connected', port: 7, vlan: null }],
  });
  const records = recordsFromJson([{ name: 'LS-PC', serial: 'LS1', ref: 'pc1', links: [{ ref: 'sw', kind: 'connected', port: '7' }] }]);
  mergeRecords(s, records, now);
  assert.deepEqual(s.rels.map(r => r.id), ['r0'], 'the hand-made connection is the only one, and it is unchanged');
  checkState(s);
});

test('a hand-made link is kept when Lansweeper stops reporting a monitor; the Lansweeper monitor link that is gone is removed', () => {
  const s = base({
    objs: [
      { id: 'pc', type: 'pc', name: 'LS-PC', serial: 'LS1', status: 'active', ovr: {}, feed: { sys: 'Lansweeper', ref: 'pc1', seen: 'x' } },
      { id: 'mon', type: 'monitor', name: 'MON', status: 'active', ovr: {}, feed: { sys: 'Lansweeper', ref: 'm1', seen: 'x' } },
    ],
    rels: [
      { id: 'hand', from: 'mon', to: 'pc', kind: 'attached', port: null, vlan: null },
      { id: 'ls', from: 'mon', to: 'pc', kind: 'attached', port: null, vlan: null, src: 'Lansweeper' },
    ],
  });
  mergeRecords(s, recordsFromJson([{ name: 'MON', serial: '', ref: 'm1', links: [] }]), now);
  assert.ok(s.rels.some(r => r.id === 'hand'), 'a link made by hand was removed');
  assert.ok(!s.rels.some(r => r.id === 'ls'), 'a Lansweeper monitor link that is gone was kept');
});

test('a name that two objects share is not merged into either; a serial number wins over the name', () => {
  const s = base({
    objs: [
      { id: 'a', type: 'pc', name: 'DUP', status: 'active', ovr: {}, feed: null },
      { id: 'b', type: 'pc', name: 'DUP', status: 'active', ovr: {}, feed: null },
      { id: 'c', type: 'pc', name: 'BY-SERIAL', serial: 'SN9', status: 'active', ovr: {}, feed: null },
      { id: 'd', type: 'pc', name: 'OTHER-NAME', status: 'active', ovr: {}, feed: null },
    ],
  });
  const counts = mergeRecords(s, recordsFromJson([
    { name: 'DUP', ref: 'x1' },
    { name: 'RENAMED-IN-LS', serial: 'SN9', ref: 'x2' },
  ]), now);
  assert.equal(s.objs.find(o => o.id === 'a').feed, null, 'an ambiguous name was merged');
  assert.equal(s.objs.find(o => o.id === 'b').feed, null, 'an ambiguous name was merged');
  assert.ok(s.objs.find(o => o.id === 'c').feed, 'the serial number did not match');
  assert.equal(s.objs.find(o => o.id === 'd').feed, null);
  assert.ok(counts.ambiguous >= 1);
});

test('a field the policy does not give to the feed, or an override, is never overwritten by the feed', () => {
  const s = base({
    policy: { model: false, os: true },
    objs: [{ id: 'pc', type: 'pc', name: 'PC1', serial: 'SN1', model: 'Mine', os: 'Mine OS', status: 'active', ovr: {}, feed: { sys: 'Lansweeper', ref: 'p', seen: 'x' } }],
  });
  mergeRecords(s, recordsFromJson([{ name: 'PC1', serial: 'SN1', ref: 'p', model: 'Feed model', os: 'Feed OS' }]), now);
  const pc = s.objs[0];
  assert.equal(pc.model, 'Mine', 'a field the feed may not own was overwritten');
  assert.equal(pc.os, 'Feed OS', 'a field the feed owns was not updated');
  pc.ovr.os = false;
  mergeRecords(s, recordsFromJson([{ name: 'PC1', serial: 'SN1', ref: 'p', os: 'Newer OS' }]), now);
  assert.equal(pc.os, 'Feed OS', 'an overridden field was overwritten');
});

test('a Lansweeper name is never a second copy of an object that already exists with a different serial number', () => {
  const s = base({ objs: [{ id: 'a', type: 'pc', name: 'PC-X', serial: 'AAA', status: 'active', ovr: {}, feed: null }] });
  mergeRecords(s, recordsFromJson([{ name: 'PC-X', serial: 'BBB', ref: 'q' }]), now);
  assert.equal(s.objs.length, 2, 'a second object with the same name and a different serial was not created');
  assert.equal(s.objs[0].feed, null, 'an object with another serial number was linked');
});

test('a sync that changes IP writes the old and new value to the history, a first fill does not', () => {
  const state = { objs: [], rels: [], users: [], history: {}, policy: { ip: true }, feedOn: true };
  const obj = { id: 'pc', code: 'INV-0001', type: 'pc', name: 'PC1', serial: 'SN1', status: 'active', ip: '10.0.0.5', ovr: {}, feed: { ref: 'x', seen: '' } };
  state.objs.push(obj);
  mergeRecords(state, [{ name: 'PC1', serial: 'SN1', ip: '10.0.0.9' }], new Date('2026-10-24T10:00:00'));
  assert.deepEqual(state.history.pc.map(h => h.msg), ['Lansweeper: IP changed from 10.0.0.5 to 10.0.0.9']);
  const fresh = { id: 'pc2', code: 'INV-0002', type: 'pc', name: 'PC2', serial: 'SN2', status: 'active', ovr: {}, feed: { ref: 'y', seen: '' } };
  state.objs.push(fresh);
  mergeRecords(state, [{ name: 'PC2', serial: 'SN2', ip: '10.0.0.7' }], new Date('2026-10-24T10:00:00'));
  assert.equal(state.history.pc2, undefined);
});

test('a PLC is recognised by its model, even when Lansweeper files it as a switch; a type mapping still wins', () => {
  const s = base();
  mergeRecords(s, recordsFromJson([
    { name: 'Siemens AG 172.21.103.38', ref: 'plc1', assetType: 'Switch', model: 'Siemens AG SIMATIC CPU 1515F-2 PN', links: [] },
    { name: 'SW-CORE', ref: 'sw1', assetType: 'Switch', model: 'Aruba 6300M', links: [] },
    { name: 'LINE-3', ref: 'plc2', assetType: 'Network device', model: 'Allen-Bradley ControlLogix 5580', links: [] },
  ]), now);
  const typeOf = n => s.objs.find(o => o.name === n).type;
  assert.equal(typeOf('Siemens AG 172.21.103.38'), 'plc');
  assert.equal(typeOf('SW-CORE'), 'switch', 'an ordinary switch stays a switch');
  assert.equal(typeOf('LINE-3'), 'plc');
  checkState({ ...s, locs: [] });   /* plc is a known type, so the inventory can be stored */

  const mapped = base({ typeMap: { switch: 'other' } });
  mergeRecords(mapped, recordsFromJson([{ name: 'S7', ref: 'x', assetType: 'Switch', model: 'SIMATIC S7-1500', links: [] }]), now);
  assert.equal(mapped.objs[0].type, 'other', 'a mapping set in Settings decides over the model');
});

test('every antivirus product and drive is kept, past 200 characters', () => {
  const av = ['Windows Defender', 'Cortex XDR', 'Sophos Intercept X', 'SentinelOne'].map(n => n + ', scanning on, up to date').join('; ');
  const disk = Array.from({ length: 12 }, (_, i) => String.fromCharCode(67 + i) + ': 117/237 GB').join('; ');
  const [r] = recordsFromJson([{ name: 'PC-1', av, disk, model: 'x'.repeat(300) }]);
  assert.equal(r.av, av);
  assert.equal(r.disk, disk);
  assert.equal(r.model.length, 200, 'other fields stay short');
});
