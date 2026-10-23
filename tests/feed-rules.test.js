import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords, recordsFromJson } from '../server/feed.js';
import { checkState } from '../server/state.js';

/* The rules the Lansweeper merge follows: what it matches, what it may change, and what it leaves alone. */
const base = (extra = {}) => ({ objs: [], rels: [], users: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 0, rseq: 0, types: {}, history: {}, ...extra });
const now = new Date(2026, 9, 23, 10, 0);

test('a link Lansweeper reports on a port that a hand-made device already uses does not fail the whole push', () => {
  const s = base({
    objs: [
      { id: 'sw', type: 'switch', name: 'SW1', status: 'active', ports: 24, pfx: '1/', ovr: {}, feed: null },
      { id: 'man', type: 'pc', name: 'MANUAL-PC', status: 'active', ovr: {}, feed: null },
      { id: 'pc', type: 'pc', name: 'LS-PC', serial: 'LS1', status: 'active', ovr: {}, feed: { sys: 'Lansweeper', ref: 'pc1', seen: 'x' } },
    ],
    rels: [{ id: 'r0', from: 'man', to: 'sw', kind: 'connected', port: 7, vlan: null }],
  });
  const records = recordsFromJson([{ name: 'LS-PC', serial: 'LS1', ref: 'pc1', links: [{ ref: 'sw', kind: 'connected', port: '7' }] }]);
  const sw = s.objs[0]; sw.feed = { sys: 'Lansweeper', ref: 'sw', seen: 'x' };
  const counts = mergeRecords(s, records, now);
  assert.equal(s.rels.filter(r => r.to === 'sw' && String(r.port) === '7').length, 1, 'the port is used twice');
  assert.ok(counts.portConflict >= 1, 'the conflict is not counted');
  checkState(s);
});

test('a link made by hand is kept when Lansweeper stops reporting it; a Lansweeper link that is gone is removed', () => {
  const s = base({
    objs: [
      { id: 'sw', type: 'switch', name: 'SW1', status: 'active', ports: 24, pfx: '1/', ovr: {}, feed: { sys: 'Lansweeper', ref: 'sw', seen: 'x' } },
      { id: 'pc', type: 'pc', name: 'LS-PC', serial: 'LS1', status: 'active', ovr: {}, feed: { sys: 'Lansweeper', ref: 'pc1', seen: 'x' } },
    ],
    rels: [
      { id: 'hand', from: 'pc', to: 'sw', kind: 'connected', port: 2, vlan: null },
      { id: 'ls', from: 'pc', to: 'sw', kind: 'uplink', port: 9, vlan: null, src: 'Lansweeper' },
    ],
  });
  mergeRecords(s, recordsFromJson([{ name: 'LS-PC', serial: 'LS1', ref: 'pc1', links: [] }]), now);
  assert.ok(s.rels.some(r => r.id === 'hand'), 'a link made by hand was removed');
  assert.ok(!s.rels.some(r => r.id === 'ls'), 'a Lansweeper link that is gone was kept');
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
