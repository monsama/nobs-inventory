/* A device in stock only because nobody was known when it came in goes to In use once a sync names its user; one a
   person put in stock stays there (server/stock-auto.js, settle.js, graph.js). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { stockToInUse, markStockAuto } from '../server/stock-auto.js';
import { settleWaiting } from '../server/settle.js';
import { applyGraph } from '../server/graph.js';
import { migrateState } from '../server/migrate.js';

const now = new Date('2026-11-17T10:00:00Z');

test('a device settled into stock is marked, and in use once a user is known', () => {
  const s = { intake: {}, history: {}, objs: [{ id: 'a', name: 'PC-A', type: 'pc', status: 'active', serial: 'SA', review: { src: 'lansweeper', at: '05.03.2026' } }] };
  settleWaiting(s, '17.11.2026 10:00', now);
  const o = s.objs[0];
  assert.equal(o.status, 'stock'); assert.equal(o.stockAuto, true);
  assert.equal(stockToInUse(s, '18.11.2026'), 0, 'nobody yet: stays');
  o.user = 'jdoe';
  assert.equal(stockToInUse(s, '18.11.2026'), 1);
  assert.equal(o.status, 'active'); assert.equal(o.stockAuto, undefined);
  assert.match(s.history.a[0].msg, /In use from now on: a sync names jdoe as its user/);
});

test('a device a person put in stock, or one waiting or excluded, is left alone', () => {
  const s = { history: {}, objs: [
    { id: 'hand', type: 'pc', status: 'stock', user: 'jdoe' },
    { id: 'wait', type: 'pc', status: 'stock', stockAuto: true, user: 'jdoe', review: { src: 'graph' } },
    { id: 'excl', type: 'pc', status: 'stock', stockAuto: true, user: 'jdoe', excluded: true },
  ] };
  assert.equal(stockToInUse(s, 'x'), 0);
  assert.deepEqual(s.objs.map(o => o.status), ['stock', 'stock', 'stock']);
});

test('Intune fills the primary user of a device in stock by itself, not of one taken back', () => {
  const rec = { graphId: 'm1', aadId: 'aad-1', name: 'NB-1', serial: 'S1', join: 'Entra joined', managed: 'mdm', compliance: 'compliant', owner: 'ana@contoso.ch', ownerName: 'Ana' };
  const s = { history: {}, objs: [
    { id: 'auto', name: 'NB-1', serial: 'S1', type: 'notebook', status: 'stock', stockAuto: true },
    { id: 'back', name: 'NB-2', serial: 'S2', type: 'notebook', status: 'stock' },
  ] };
  applyGraph(s, [rec, { ...rec, graphId: 'm2', aadId: 'aad-2', name: 'NB-2', serial: 'S2' }], now);
  assert.equal(s.objs[0].user, 'Ana'); assert.equal(s.objs[1].user, undefined, 'taken back: nobody, whatever Intune says');
  assert.equal(stockToInUse(s, 'x'), 1);
  assert.deepEqual(s.objs.map(o => o.status), ['active', 'stock']);
});

test('devices in stock from before get the mark when their history says they went there by themselves', () => {
  const s = { history: {
    a: [{ t: '1', msg: 'Lansweeper changed the IP address' }, { t: '0', msg: 'Added to the inventory: nothing unclear (found by Lansweeper), in stock: nobody has it yet' }],
    b: [{ t: '2', msg: 'Status set to In stock by admin' }, { t: '1', msg: 'Status set to In use by admin' }, { t: '0', msg: 'Accepted into the inventory by admin (found by Entra & Intune), in stock: nobody has it yet' }],
    c: [{ t: '0', msg: 'Ana no longer has it: taken into stock by admin' }],
  }, objs: [
    { id: 'a', type: 'pc', status: 'stock' }, { id: 'b', type: 'pc', status: 'stock' }, { id: 'c', type: 'pc', status: 'stock' },
  ] };
  assert.equal(markStockAuto(s), true);
  assert.deepEqual(s.objs.map(o => !!o.stockAuto), [true, false, false]);
  assert.equal(markStockAuto(s), false, 'once');
  // the migration on start does it too
  const s2 = { history: { a: s.history.a }, objs: [{ id: 'a', type: 'pc', status: 'stock' }] };
  migrateState(s2); assert.equal(s2.objs[0].stockAuto, true);
});
