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
      rels: [{ id: 'r1', from: 'b1', to: 'z1', kind: 'connected' }], history: { z1: [{ t: 'x', msg: 'secret move' }] },
      graphAmbiguous: [{ name: 'ZH-CEO-LAPTOP', serial: 'SECRETSER', devices: ['z1'] }, { name: 'NB-b2', devices: ['b2'] }],
      syncChanges: { ad: { at: '2026-11-01T00:00:00Z', changed: { Model: 2 }, filled: {}, ids: ['z1', 'b2'], n: 2 } },
      digest: { on: true, to: ['it-admin@corp.ch'], day: 1, hour: 7 }, groupRoles: [{ group: 'IT', role: 'viewer' }] });
    for (const [id, l] of [['v-all', 'vall'], ['v-bern', 'vbern'], ['v-own', 'vown']]) setPassword(srv.db, id, l + 'pass12345');
    const ids = async login => { const a = await signIn(srv, login, login + 'pass12345'); const j = (await srv.call('GET', '/api/state', { cookie: a.cookie })).json; return { a, j, ids: j.objs.map(o => o.id).sort() }; };
    assert.deepEqual((await ids('vall')).ids, ['b1', 'b2', 'z1']);
    const bern = await ids('vbern');
    assert.deepEqual(bern.ids, ['b1', 'b2']); assert.equal(bern.j.rels.length, 0, 'no link to the other site'); assert.equal(bern.j.history.z1, undefined);
    // nothing about the other site's devices, and no admin settings
    assert.ok(!JSON.stringify(bern.j).includes('SECRETSER') && !JSON.stringify(bern.j).includes('it-admin@corp.ch'));
    assert.deepEqual(bern.j.graphAmbiguous.map(a => a.name), ['NB-b2']); assert.deepEqual(bern.j.syncChanges.ad.ids, ['b2']);
    assert.equal(bern.j.digest, undefined); assert.equal(bern.j.groupRoles, undefined);
    assert.equal((await ids('vall')).j.digest, undefined, 'not for any viewer');
    const own = await ids('vown');
    assert.deepEqual(own.ids, ['b1']);
    // reports and labels hold the same devices only
    const rep = await fetch(`${srv.base}/api/reports/inventory?format=xlsx`, { headers: { cookie: bern.a.cookie } });
    assert.equal(rep.status, 200);
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

test('the editor role of older versions is gone: such a person reads, as a viewer, and saves nothing', async () => {
  const srv = await startServer();
  try {
    const s = loadState(srv.db);
    saveState(srv.db, { ...s, sites: ['Bern'], locs: ['Bern / EG'],
      users: [...s.users, { id: 'e-bern', login: 'ebern', name: 'Eva Old', role: 'editor', source: 'manual', active: true, groups: [], sites: ['Bern'] }],
      objs: [dev('b1', 'Bern / EG', null)], rels: [], history: {} });
    assert.equal(loadState(srv.db).users.find(u => u.id === 'e-bern').role, 'viewer');
    setPassword(srv.db, 'e-bern', 'ebernpass12345');
    const a = await signIn(srv, 'ebern', 'ebernpass12345');
    assert.equal((await srv.call('GET', '/api/me', { cookie: a.cookie })).json.user.role, 'viewer');
    const st = (await srv.call('GET', '/api/state', { cookie: a.cookie })).json;
    const r = await srv.call('POST', '/api/changes', { cookie: a.cookie, body: { puts: [{ kind: 'object', id: 'b1', value: { ...st.objs[0], model: 'X1' }, base: st.revs['object|b1'] }], dels: [] } });
    assert.equal(r.status, 403);
    const photo = await srv.call('POST', '/api/objects/b1/images', { cookie: a.cookie, body: { name: 'p.jpg', data: 'eA==', thumb: 'eA==', w: 1, h: 1 } });
    assert.equal(photo.status, 403);
  } finally { await srv.close(); }
});

