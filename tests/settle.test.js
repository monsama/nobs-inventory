/* Waiting devices with nothing unclear go into the inventory by themselves (server/settle.js); the unclear ones stay. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleWaiting } from '../server/settle.js';

const now = new Date('2026-11-17T10:00:00Z');
const w = (id, name, more = {}) => ({ id, name, type: 'pc', status: 'active', review: { src: 'lansweeper', at: '05.03.2026 09:30' }, ...more });

test('the clear ones are added, as of when they were found; the unclear ones wait', () => {
  const s = { intake: {}, history: {}, objs: [
    { id: 'o1', name: 'KEEP-1', type: 'pc', status: 'active', serial: 'S1' },
    w('a', 'PC-A', { serial: 'SA', feed: { scanned: '2026-11-10' } }),
    w('b', 'PC-B', { serial: 'SB', user: 'jdoe' }),
    w('dup', 'PC-DUP', { serial: 'S1' }),
    w('name', 'KEEP-1'),
    w('ip', '10.0.0.5'),
    w('dock', 'keep-1.corp.example'),
    w('old', 'PC-OLD', { feed: { scanned: '2026-01-02' } }),
    w('ign', 'PC-IGN', { review: { src: 'lansweeper', at: '05.03.2026', ignored: '06.03.2026' } }),
  ] };
  assert.equal(settleWaiting(s, '17.11.2026 10:00', now), 2);
  const by = id => s.objs.find(o => o.id === id);
  assert.equal(by('a').review, undefined); assert.equal(by('a').added, '2026-03-05T09:30:00.000Z');
  assert.equal(by('a').status, 'stock', 'nobody has it: in stock');
  assert.equal(by('b').status, 'active', 'it has a user');
  assert.match(s.history.a[0].msg, /Added to the inventory: nothing unclear \(found by Lansweeper\)/);
  for (const id of ['dup', 'name', 'ip', 'dock', 'old', 'ign']) assert.ok(by(id).review, `${id} waits`);
});

test('a source set to wait keeps its devices waiting', () => {
  const s = { intake: { lansweeper: 'review' }, history: {}, objs: [w('a', 'PC-A', { serial: 'SA' })] };
  assert.equal(settleWaiting(s, 'x', now), 0);
  assert.ok(s.objs[0].review);
});
