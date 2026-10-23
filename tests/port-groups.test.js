import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkState } from '../server/state.js';

/* A port group is a named range of a device's ports (copper and SFP together) with an optional kind; groups do not overlap. */
const base = (sw) => ({ objs: [{ id: 'sw', code: 'INV-0001', type: 'switch', name: 'SW1', status: 'active', ports: 24, sfp: 4, ovr: {}, feed: null, ...sw }], rels: [], users: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 1, rseq: 0, types: {}, history: {} });

test('port groups: a range of the ports, with a kind, is accepted', () => {
  const s = base({ portGroups: [{ name: 'Uplinks', from: 25, to: 28, kind: 'SFP+' }, { name: 'Phones', from: 1, to: 12 }] });
  assert.doesNotThrow(() => checkState(s));
});

test('port groups: an overlapping range is refused', () => {
  const s = base({ portGroups: [{ name: 'A', from: 1, to: 12 }, { name: 'B', from: 12, to: 16 }] });
  assert.throws(() => checkState(s), /overlap/);
});

test('port groups: a range outside the ports of the device is refused', () => {
  const s = base({ portGroups: [{ name: 'Far', from: 30, to: 32 }] });
  assert.throws(() => checkState(s), /not a range of its ports/);
});

test('port groups: a name is required', () => {
  const s = base({ portGroups: [{ name: '  ', from: 1, to: 2 }] });
  assert.throws(() => checkState(s), /needs a name/);
});
