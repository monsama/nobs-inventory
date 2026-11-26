/* Sweep 0.9.186: an Entra sync never switches back on a person an admin switched off, and merging two people by hand
   moves the password of the one merged away to the kept one, who had none. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGraphPeople } from '../server/graph.js';
import { checkState, loadState, saveState } from '../server/state.js';
import { setPassword } from '../server/auth.js';
import { startServer, signIn } from './helpers.js';

const NOW = new Date(2026, 10, 26, 10, 0);
const person = (id, extra = {}) => ({ id, login: id + '@example.ch', name: id, role: 'none', source: 'entra', active: true, entra: { id: 'e-' + id, upn: id + '@example.ch', enabled: true }, ...extra });
const user = (p, enabled) => ({ id: 'e-' + p, userPrincipalName: p + '@example.ch', displayName: p, accountEnabled: enabled, userType: 'Member' });

test('Entra: disabled switches off, enabled again switches back on; a person an admin switched off stays off', () => {
  const s = { objs: [], rels: [], types: {}, history: {}, locs: [], users: [person('ana'), person('ben', { active: false, leftAt: '2026-10-01T00:00:00.000Z' })] };
  applyGraphPeople(s, [user('ana', false), user('ben', true)], 'match', NOW);
  const [ana, ben] = s.users;
  assert.deepEqual([ana.active, ana.entraOff], [false, true], 'disabled in Entra: off, marked');
  assert.equal(ben.active, false, 'switched off by an admin: Entra being enabled does not switch it on');
  checkState(s);
  applyGraphPeople(s, [user('ana', false), user('ben', true)], 'match', NOW);
  assert.deepEqual([ana.active, ana.entraOff], [false, true], 'still disabled: still off and marked');
  applyGraphPeople(s, [user('ana', true), user('ben', true)], 'match', NOW);
  assert.deepEqual([ana.active, ana.entraOff, ana.leftAt], [true, undefined, undefined], 'enabled again in Entra: back on');
  assert.equal(ben.active, false);
  /* From before the mark: off while Entra said disabled counts as Entra's doing. */
  const old = { objs: [], rels: [], types: {}, history: {}, locs: [], users: [person('cem', { active: false, entra: { id: 'e-cem', upn: 'cem@example.ch', enabled: false } })] };
  applyGraphPeople(old, [user('cem', true)], 'match', NOW);
  assert.equal(old.users[0].active, true);
  assert.throws(() => checkState({ ...s, users: [{ ...ana, entraOff: 'yes' }] }), /Switched off by Entra/);
});

test('merging by hand: the password of the one merged away goes to the kept one, who had none', async () => {
  const srv = await startServer();
  try {
    const s = loadState(srv.db);
    saveState(srv.db, { ...s, users: [...s.users, { id: 'k1', name: 'Anna Muster', role: 'viewer', active: true, source: 'manual', groups: [] },
      { id: 'd1', name: 'amuster', login: 'amuster', role: 'viewer', active: true, source: 'manual', groups: [] }] });
    setPassword(srv.db, 'd1', 'amusterpass123');
    const a = await signIn(srv, 'admin', 'adminpass123');
    const r = await srv.call('POST', '/api/users/merge', { cookie: a.cookie, body: { keep: 'k1', drop: 'd1' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(srv.db.prepare('SELECT COUNT(*) AS n FROM credentials WHERE user_id = ?').get('k1').n, 1, 'the password moved');
    assert.equal(srv.db.prepare('SELECT COUNT(*) AS n FROM credentials WHERE user_id = ?').get('d1').n, 0);
  } finally { await srv.close(); }
});
