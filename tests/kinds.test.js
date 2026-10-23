import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateState } from '../server/migrate.js';
import { checkState } from '../server/state.js';

/* Four relation kinds remain. Older kinds are migrated: patched is connected, docked is attached, a downlink is the uplink seen from its other end. */
const base = (rels) => ({ objs: [
  { id: 'sw', code: 'INV-0001', type: 'switch', name: 'SW1', status: 'active', ports: 24, sfp: 4, ovr: {}, feed: null },
  { id: 'rt', code: 'INV-0002', type: 'router', name: 'RT1', status: 'active', ports: 8, ovr: {}, feed: null },
  { id: 'pc', code: 'INV-0003', type: 'pc', name: 'PC1', status: 'active', ovr: {}, feed: null },
  { id: 'mon', code: 'INV-0004', type: 'monitor', name: 'MON1', status: 'active', ovr: {}, feed: null }], rels, users: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 4, rseq: 0, types: {}, history: {} });

test('an old patched relation becomes connected, an old docked relation becomes attached', () => {
  const s = base([{ id: 'a', from: 'pc', to: 'sw', kind: 'patched', port: 3 }, { id: 'b', from: 'mon', to: 'pc', kind: 'docked', port: null }]);
  assert.equal(migrateState(s), true);
  assert.deepEqual(s.rels.map(r => r.kind), ['connected', 'attached']);
  assert.doesNotThrow(() => checkState(s));
});

test('a downlink becomes the uplink seen from the other end, and is dropped when that uplink is already there', () => {
  const s = base([{ id: 'd1', from: 'rt', to: 'sw', kind: 'downlink', port: 5 }, { id: 'd2', from: 'sw', to: 'rt', kind: 'downlink', port: 2 }, { id: 'u', from: 'rt', to: 'sw', kind: 'uplink', port: null }]);
  migrateState(s);
  assert.deepEqual(s.rels.map(r => [r.id, r.kind]), [['d1', 'uplink'], ['u', 'uplink']], 'the second downlink mirrors the uplink already there, so it is dropped');
});

test('a downlink without its uplink becomes an uplink from the switch, its port is not kept', () => {
  const s = base([{ id: 'd', from: 'rt', to: 'sw', kind: 'downlink', port: 5 }]);
  migrateState(s);
  assert.deepEqual(s.rels, [{ id: 'd', from: 'sw', to: 'rt', kind: 'uplink', port: null }]);
});

test('migration changes nothing a second time', () => {
  const s = base([{ id: 'a', from: 'pc', to: 'sw', kind: 'patched', port: 3 }]);
  migrateState(s);
  assert.equal(migrateState(s), false);
});
