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

test('port groups: a link aggregate is marked as a flag, true or false', () => {
  assert.doesNotThrow(() => checkState(base({ portGroups: [{ name: 'Uplink LAG', from: 25, to: 26, lag: true }] })));
  assert.throws(() => checkState(base({ portGroups: [{ name: 'Uplink LAG', from: 25, to: 26, lag: 'yes' }] })), /link aggregate/);
});

const twoSwitches = (rels) => ({ objs: [
  { id: 'a', code: 'INV-0001', type: 'switch', name: 'SW-A', status: 'active', ports: 24, sfp: 4, ovr: {}, feed: null, portGroups: [{ name: 'Uplink', from: 25, to: 26, lag: true }] },
  { id: 'b', code: 'INV-0002', type: 'switch', name: 'SW-B', status: 'active', ports: 24, sfp: 4, ovr: {}, feed: null, portGroups: [{ name: 'Core', from: 25, to: 26, lag: true }, { name: 'Three', from: 1, to: 3, lag: true }] }],
  rels, users: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 2, rseq: 0, types: {}, history: {} });

test('a LAG links a LAG of the same size on the other device', () => {
  assert.doesNotThrow(() => checkState(twoSwitches([{ id: 'l', from: 'a', to: 'b', kind: 'uplink', port: null, lag: 'Core', fromLag: 'Uplink' }])));
});

test('a LAG link to a LAG with a different number of ports is refused', () => {
  assert.throws(() => checkState(twoSwitches([{ id: 'l', from: 'a', to: 'b', kind: 'uplink', port: null, lag: 'Three', fromLag: 'Uplink' }])), /different numbers/);
});

test('a single port inside a LAG is refused; the LAG is connected instead', () => {
  assert.throws(() => checkState(twoSwitches([{ id: 'p', from: 'a', to: 'b', kind: 'uplink', port: 25, vlan: null }])), /part of the LAG Core/);
});

test('a LAG is linked to one other LAG only', () => {
  assert.throws(() => checkState(twoSwitches([
    { id: 'l1', from: 'a', to: 'b', kind: 'uplink', port: null, lag: 'Core', fromLag: 'Uplink' },
    { id: 'l2', from: 'a', to: 'b', kind: 'uplink', port: null, lag: 'Core', fromLag: 'Uplink' }])), /linked twice/);
});
