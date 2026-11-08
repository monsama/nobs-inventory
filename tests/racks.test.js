import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkState } from '../server/state.js';

/* What the server accepts for racks: devices fit in their rack, nothing takes the same U twice, and a rack is not in a rack. */
const dev = (id, more = {}) => ({ id, code: 'INV-' + id, name: id.toUpperCase(), type: 'server', status: 'active', loc: 'HQ', ovr: {}, feed: null, ...more });
const state = objs => ({ objs, rels: [], users: [], policy: {}, feedOn: true, locs: ['HQ'], seq: 100, codeN: 10, rseq: 0, types: {}, history: {} });
const ok = objs => assert.doesNotThrow(() => checkState(state(objs)));
const no = (objs, re) => assert.throws(() => checkState(state(objs)), re);

test('a rack has a whole height', () => {
  ok([dev('rk', { type: 'rack', units: 42 })]);
  no([dev('rk', { type: 'rack', units: 2.5 })], /1 to 200 U high/);
  no([dev('rk', { type: 'rack', units: -5 })], /1 to 200 U high/);
  no([dev('rk', { type: 'rack', units: 1000000 })], /1 to 200 U high/);
});

test('a device fits its rack; a rack without a height is 42 U', () => {
  ok([dev('rk', { type: 'rack' }), dev('s1', { rack: 'rk', u: 41, h: 2 })]);
  no([dev('rk', { type: 'rack' }), dev('s1', { rack: 'rk', u: 100, h: 1 })], /above the top/);
  no([dev('rk', { type: 'rack', units: 10 }), dev('s1', { rack: 'rk', u: 10, h: 2 })], /above the top/);
});

test('a retired device no longer takes its units, as the page counts them', () => {
  ok([dev('rk', { type: 'rack', units: 42 }), dev('s1', { rack: 'rk', u: 3, h: 2, status: 'retired' }), dev('s2', { rack: 'rk', u: 3, h: 2 })]);
  no([dev('rk', { type: 'rack', units: 42 }), dev('s1', { rack: 'rk', u: 3, h: 2 }), dev('s2', { rack: 'rk', u: 4, h: 1 })], /both take U4/);
});

test('a rack is not in a rack, and a device does not sit on itself', () => {
  no([dev('rk', { type: 'rack' }), dev('rk2', { type: 'rack', rack: 'rk', u: 1, h: 2 })], /a rack does not go in a rack/);
  no([dev('rk', { type: 'rack', rack: 'rk', u: 1 })], /a rack does not go in a rack/);
  no([dev('rk', { type: 'rack' }), dev('s1', { rack: 'rk', ontop: 's1' })], /not in the same rack/);
  ok([dev('rk', { type: 'rack' }), dev('s1', { rack: 'rk', u: 1 }), dev('s2', { rack: 'rk', ontop: 's1' })]);
});
