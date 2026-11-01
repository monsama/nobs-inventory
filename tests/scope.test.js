/* What a viewer sees: all, some sites, or only their own devices; nothing else reaches them. Their own devices they
   confirm and report a problem with; nobody else's. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';
import { loadState, saveState } from '../server/state.js';
import { setPassword } from '../server/auth.js';

const dev = (id, loc, uid) => ({ id, code: 'INV-' + id, type: 'notebook', name: 'NB-' + id, status: 'active', loc, uid, ovr: {}, feed: null });
test('a viewer limited to sites or to own devices gets nothing else', async () => {
  const srv = await startServer();
  try {
    const s = loadState(srv.db);
    saveState(srv.db, { ...s,
      users: [...s.users, { id: 'v-all', login: 'vall', name: 'All', role: 'viewer', source: 'manual', active: true, groups: [] },
        { id: 'v-bern', login: 'vbern', name: 'Bern Only', role: 'viewer', source: 'manual', active: true, groups: [], sites: ['Bern'] },
        { id: 'v-own', login: 'vown', name: 'Own Only', role: 'viewer', source: 'manual', active: true, groups: [], own: true }],
      objs: [dev('b1', 'Bern / EG', 'v-own'), dev('b2', 'Bern / OG', null), dev('z1', 'Zürich / EG', null)],
      rels: [{ id: 'r1', from: 'b1', to: 'z1', kind: 'connected' }], history: { z1: [{ t: 'x', msg: 'secret move' }] } });
    for (const [id, l] of [['v-all', 'vall'], ['v-bern', 'vbern'], ['v-own', 'vown']]) setPassword(srv.db, id, l + 'pass12345');
    const ids = async login => { const a = await signIn(srv, login, login + 'pass12345'); const j = (await srv.call('GET', '/api/state', { cookie: a.cookie })).json; return { a, j, ids: j.objs.map(o => o.id).sort() }; };
    assert.deepEqual((await ids('vall')).ids, ['b1', 'b2', 'z1']);
    const bern = await ids('vbern');
    assert.deepEqual(bern.ids, ['b1', 'b2']); assert.equal(bern.j.rels.length, 0, 'no link to the other site'); assert.equal(bern.j.history.z1, undefined);
    const own = await ids('vown');
    assert.deepEqual(own.ids, ['b1']);
    // reports and labels hold the same devices only
    const rep = await fetch(`${srv.base}/api/reports/inventory?format=xlsx`, { headers: { cookie: bern.a.cookie } });
    assert.equal(rep.status, 200);
    assert.equal((await srv.call('POST', '/api/labels', { cookie: bern.a.cookie, body: { ids: ['z1'] } })).status, 400, 'no label for another site');
    // own devices: confirmed and reported by their user only
    assert.equal((await srv.call('POST', '/api/my/devices/b2/confirm', { cookie: own.a.cookie })).status, 404);
    assert.equal((await srv.call('POST', '/api/my/devices/b1/confirm', { cookie: own.a.cookie })).status, 200);
    assert.equal((await srv.call('POST', '/api/my/devices/b1/report', { cookie: own.a.cookie, body: { text: '' } })).status, 400);
    assert.equal((await srv.call('POST', '/api/my/devices/b1/report', { cookie: own.a.cookie, body: { text: 'Screen flickers' } })).status, 200);
    const b1 = loadState(srv.db).objs.find(o => o.id === 'b1');
    assert.equal(b1.verified.by, 'Own Only'); assert.equal(b1.reported.text, 'Screen flickers');
    assert.equal((await srv.call('POST', '/api/changes', { cookie: own.a.cookie, body: { puts: [] } })).status, 403, 'still no editing');
  } finally { await srv.close(); }
});
