/* Sweep 0.9.187: a Graph sync that finds nothing new keeps the records saved the same day (no rewrite of every device
   and person), and an admin reads what a person last had from the History. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGraphPeople, freshen } from '../server/graph.js';
import { loadState, saveState } from '../server/state.js';
import { startServer, signIn } from './helpers.js';

test('freshen keeps the saved record when only the time read changed, the same day', () => {
  const old = { id: 'g', join: 'Entra', seen: '26.11.2026 09:00' };
  assert.equal(freshen(old, { id: 'g', join: 'Entra', seen: '26.11.2026 15:00' }), old, 'same day, nothing new');
  assert.notEqual(freshen(old, { id: 'g', join: 'Hybrid', seen: '26.11.2026 15:00' }), old, 'something new');
  assert.deepEqual(freshen(old, { id: 'g', join: 'Entra', seen: '27.11.2026 08:00' }).seen, '27.11.2026 08:00', 'the next day: read again');
  assert.equal(freshen(undefined, old), old);
});

test('a second Entra sync the same day leaves a person as saved', () => {
  const s = { objs: [], rels: [], types: {}, history: {}, locs: [], users: [{ id: 'a', login: 'ana@x.ch', name: 'Ana', role: 'none', source: 'entra', active: true }] };
  const u = [{ id: 'e1', userPrincipalName: 'ana@x.ch', displayName: 'Ana', accountEnabled: true, userType: 'Member' }];
  applyGraphPeople(s, u, 'match', new Date(2026, 10, 26, 9, 0));
  const first = s.users[0].entra;
  applyGraphPeople(s, u, 'match', new Date(2026, 10, 26, 15, 0));
  assert.equal(s.users[0].entra, first);
});

test('what a person last had: the newest hand-outs and take-backs, for admins', async () => {
  const srv = await startServer();
  try {
    const s = loadState(srv.db);
    saveState(srv.db, { ...s, users: [...s.users, { id: 'p1', name: 'Finn Graf', role: 'none', active: true, source: 'manual', groups: [] }, { id: 'p2', name: 'Finn', role: 'none', active: true, source: 'manual', groups: [] }],
      objs: [{ id: 'o1', code: 'INV-1', type: 'pc', name: 'PC-1', status: 'stock', loc: '', ovr: {} }, { id: 'o2', code: 'INV-2', type: 'pc', name: 'PC-2', status: 'stock', loc: '', ovr: {} }],
      history: { o1: [{ t: '20.11.2026 10:00', msg: 'Taken back into stock from Finn Graf by Admin' }, { t: '01.10.2026 10:00', msg: 'Handed out to Finn Graf by Admin' }],
        o2: [{ t: '21.11.2026 10:00', msg: 'Handed out to Finn by Admin' }] } });
    const a = await signIn(srv, 'admin', 'adminpass123');
    const r = await srv.call('GET', '/api/people/p1/past', { cookie: a.cookie });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.past.map(x => [x.id, x.back]), [['o1', true], ['o1', false]], 'Finn is another person');
    assert.equal((await srv.call('GET', '/api/people/p2/past', { cookie: a.cookie })).json.past.length, 1);
    assert.equal((await srv.call('GET', '/api/people/nobody/past', { cookie: a.cookie })).status, 404);
    assert.equal((await srv.call('GET', '/api/people/p1/past')).status, 401);
  } finally { await srv.close(); }
});
