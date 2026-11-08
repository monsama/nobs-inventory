import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindProblem, relationProblem, linkKind } from '../public/js/relations.js';
import { checkState } from '../server/state.js';

/* One rule for which device may be related to which (relations.js), used by the page and the server. */
const d = (id, type, more = {}) => ({ id, name: id.toUpperCase(), type, ...more });
const pc = d('pc1', 'pc'), pc2 = d('pc2', 'pc'), mon = d('mon', 'monitor'), prn = d('prn', 'printer'), sw = d('sw', 'switch', { ports: 24 }),
  srv = d('srv', 'server'), vm = d('vm1', 'vm'), rack = d('rk', 'rack'), sw2 = d('sw2', 'switch', { ports: 8 });

test('the types fit the kind', () => {
  assert.equal(kindProblem('attached', mon, pc), '');
  assert.match(kindProblem('attached', mon, prn), /cannot be attached/);
  assert.equal(kindProblem('hosted', vm, srv), '');
  assert.match(kindProblem('hosted', pc, sw), /cannot run on/);
  assert.match(kindProblem('hosted', srv, vm), /cannot run on/);
  assert.equal(kindProblem('connected', pc, sw), '');
  assert.match(kindProblem('connected', rack, sw), /cannot be plugged into/);
  assert.match(kindProblem('connected', vm, sw), /cannot be plugged into/);
  assert.equal(kindProblem('uplink', sw2, sw), '');
  assert.match(kindProblem('uplink', sw, prn), /cannot have an uplink/);
  assert.equal(linkKind(sw2, sw), 'uplink'); assert.equal(linkKind(pc, sw), 'connected'); assert.equal(linkKind(vm, srv), 'hosted');
});

test('one host, and a host is not attached itself: no loops', () => {
  const rels = [{ id: 'a', from: 'mon', to: 'pc1', kind: 'attached' }];
  assert.match(relationProblem('attached', mon, pc2, rels), /already attached/, 'a monitor on two PCs');
  assert.equal(relationProblem('attached', mon, pc2, rels, rels[0]), '', 'moving it is fine');
  assert.match(relationProblem('attached', pc, mon, rels), /cannot be attached/);
  const loop = [{ id: 'a', from: 'pc1', to: 'pc2', kind: 'attached' }];
  assert.match(relationProblem('attached', d('x', 'camera'), pc, loop), /itself attached/);
  assert.match(relationProblem('connected', pc, pc), /itself/);
});

const state = (objs, rels) => ({ objs: objs.map(o => ({ code: 'INV-' + o.id, status: 'active', loc: '', ovr: {}, feed: null, ...o })), rels, users: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 10, rseq: 0, types: {}, history: {} });
test('the server refuses a new relation that does not fit, and keeps old ones it finds', () => {
  const objs = [pc, pc2, mon, prn, sw, srv, vm];
  const bad = [{ id: 'r1', from: 'mon', to: 'prn', kind: 'attached', port: null }];
  assert.throws(() => checkState(state(objs, bad), { newRels: new Set(['r1']) }), /cannot be attached/);
  assert.doesNotThrow(() => checkState(state(objs, bad)), 'an inventory saved before the rule still loads and saves');
  const two = [{ id: 'r1', from: 'mon', to: 'pc1', kind: 'attached', port: null }, { id: 'r2', from: 'mon', to: 'pc2', kind: 'attached', port: null }];
  assert.throws(() => checkState(state(objs, two), { newRels: new Set(['r2']) }), /already attached/);
  assert.doesNotThrow(() => checkState(state(objs, [{ id: 'r3', from: 'vm1', to: 'srv', kind: 'hosted', port: null }]), { newRels: new Set(['r3']) }));
});
