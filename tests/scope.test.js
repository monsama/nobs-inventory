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

test('an editor limited to sites changes the devices of those sites, and nothing else', async () => {
  const srv = await startServer();
  try {
    const s = loadState(srv.db);
    saveState(srv.db, { ...s, sites: ['Bern', 'Zürich'], locs: ['Bern / EG', 'Zürich / EG'],
      users: [...s.users, { id: 'e-bern', login: 'ebern', name: 'Eva Editor', role: 'editor', source: 'manual', active: true, groups: [], sites: ['Bern'] },
        { id: 'e-all', login: 'eall', name: 'Ed All', role: 'editor', source: 'manual', active: true, groups: [] }],
      objs: [dev('b1', 'Bern / EG', null), dev('z1', 'Zürich / EG', null)], rels: [], history: {},
      stocktakes: [{ id: 'stB', name: 'Bern', scope: 'Bern', started: '2026-10-01T00:00:00Z', by: 'x' }, { id: 'stZ', name: 'Zürich', scope: 'Zürich', started: '2026-10-02T00:00:00Z', by: 'x' }] });
    setPassword(srv.db, 'e-bern', 'ebernpass12345'); setPassword(srv.db, 'e-all', 'eallpass12345');
    const a = await signIn(srv, 'ebern', 'ebernpass12345');
    const me = (await srv.call('GET', '/api/me', { cookie: a.cookie })).json.user;
    assert.equal(me.role, 'editor');
    let st = (await srv.call('GET', '/api/state', { cookie: a.cookie })).json;
    assert.deepEqual(st.objs.map(o => o.id), ['b1']); assert.deepEqual(st.stocktakes.map(t => t.id), ['stB']);
    const rev = k => st.revs[k] ?? 0;
    const save = body => srv.call('POST', '/api/changes', { cookie: a.cookie, body: { dels: [], ...body } });
    const b1 = st.objs[0];
    // a device of Bern: changed; moved to Zürich, or a device of Zürich: refused
    let r = await save({ puts: [{ kind: 'object', id: 'b1', value: { ...b1, model: 'X1' }, base: rev('object|b1') }] });
    assert.equal(r.status, 200, r.text); assert.equal(loadState(srv.db).objs.find(o => o.id === 'b1').model, 'X1');
    st = (await srv.call('GET', '/api/state', { cookie: a.cookie })).json;
    r = await save({ puts: [{ kind: 'object', id: 'b1', value: { ...b1, loc: 'Zürich / EG' }, base: rev('object|b1') }] });
    assert.equal(r.status, 403); assert.match(r.json.error, /not in a site you may change/);
    r = await save({ puts: [{ kind: 'object', id: 'z1', value: { ...dev('z1', 'Bern / EG', null) }, base: 1 }] });
    assert.equal(r.status, 403, 'not even moving it into Bern');
    r = await save({ puts: [], dels: [{ kind: 'object', id: 'z1', base: 1 }] });
    assert.equal(r.status, 403);
    // a new device in Bern with its history; a new room in Bern, not in Zürich
    r = await save({ puts: [{ kind: 'object', id: 'n1', value: dev('n1', 'Bern / OG', null), base: 0 }, { kind: 'history', id: 'n1', value: [{ t: 'x', msg: 'added' }], base: 0 },
      { kind: 'setting', id: 'locs', value: ['Bern / EG', 'Zürich / EG', 'Bern / OG'], base: rev('setting|locs') }] });
    assert.equal(r.status, 200, r.text);
    st = (await srv.call('GET', '/api/state', { cookie: a.cookie })).json;
    r = await save({ puts: [{ kind: 'setting', id: 'locs', value: ['Bern / EG', 'Zürich / EG', 'Bern / OG', 'Zürich / OG'], base: rev('setting|locs') }] });
    assert.equal(r.status, 403);
    r = await save({ puts: [{ kind: 'setting', id: 'locs', value: ['Bern / EG'], base: rev('setting|locs') }] });
    assert.equal(r.status, 403, 'no rooms removed');
    // a stocktake of Bern: saved, Zürich's kept although the editor does not see it; Zürich's refused
    r = await save({ puts: [{ kind: 'setting', id: 'stocktakes', value: [{ ...st.stocktakes[0], done: '2026-10-05T00:00:00Z' }], base: rev('setting|stocktakes') }] });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(loadState(srv.db).stocktakes.map(t => [t.id, !!t.done]).sort(), [['stB', true], ['stZ', false]]);
    st = (await srv.call('GET', '/api/state', { cookie: a.cookie })).json;
    r = await save({ puts: [{ kind: 'setting', id: 'stocktakes', value: [...st.stocktakes, { id: 'stN', name: 'Zürich again', scope: 'Zürich / EG', started: '2026-10-06T00:00:00Z', by: 'Eva' }], base: rev('setting|stocktakes') }] });
    assert.equal(r.status, 403);
    // a stocktake of Bern sent under the id of Zürich's: Zürich's stays as it was
    r = await save({ puts: [{ kind: 'setting', id: 'stocktakes', value: [...st.stocktakes, { id: 'stZ', name: 'gone', scope: 'Bern', started: '2026-10-02T00:00:00Z', by: 'Eva' }], base: rev('setting|stocktakes') }] });
    assert.deepEqual(loadState(srv.db).stocktakes.find(x => x.id === 'stZ'), { id: 'stZ', name: 'Zürich', scope: 'Zürich', started: '2026-10-02T00:00:00Z', by: 'x' });
    // never people, types or other settings
    for (const c of [{ kind: 'user', id: 'e-bern', value: { ...st.users.find(u => u.id === 'e-bern'), role: 'admin' } }, { kind: 'type', id: 'pc', value: { label: 'X' } }, { kind: 'setting', id: 'contracts', value: [] }]) {
      r = await save({ puts: [{ ...c, base: rev(`${c.kind}|${c.id}`) }] });
      assert.equal(r.status, 403, c.kind + ' ' + c.id);
    }
    assert.equal((await srv.call('PUT', '/api/state', { cookie: a.cookie, body: st })).status, 403, 'no full save');
    // photos: of Bern's devices, not of Zürich's
    const seg = (m, body) => { const b = Buffer.from(body); const h = Buffer.alloc(4); h[0] = 0xff; h[1] = m; h.writeUInt16BE(b.length + 2, 2); return Buffer.concat([h, b]); };
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, 'JFIF\0\x01\x01\0\0\x01\0\x01\0\0'), seg(0xdb, 'q'), seg(0xda, 's'), Buffer.from('px'), Buffer.from([0xff, 0xd9])]).toString('base64');
    const photo = id => srv.call('POST', `/api/objects/${id}/images`, { cookie: a.cookie, body: { name: 'p.jpg', data: jpg, thumb: jpg, w: 10, h: 10 } });
    const ph = await photo('b1');
    assert.equal(ph.status, 200, ph.text);
    const bigPhoto = await srv.call('POST', '/api/objects/b1/images', { cookie: a.cookie, body: { name: 'big.jpg', data: Buffer.concat([Buffer.from(jpg, 'base64').subarray(0, -2), Buffer.alloc(1500000, 1), Buffer.from([0xff, 0xd9])]).toString('base64'), thumb: jpg, w: 10, h: 10 } });
    assert.equal(bigPhoto.status, 200, 'an editor sends photos larger than 1 MB: ' + bigPhoto.text);
    assert.equal((await photo('z1')).status, 404);
    assert.equal((await srv.call('PATCH', `/api/images/${ph.json.image.id}`, { cookie: a.cookie, body: { caption: 'Label' } })).status, 200);
    assert.equal((await srv.call('DELETE', `/api/images/${ph.json.image.id}`, { cookie: a.cookie })).status, 200);
    // an editor without sites changes every device, still no settings
    const e = await signIn(srv, 'eall', 'eallpass12345');
    const all = (await srv.call('GET', '/api/state', { cookie: e.cookie })).json;
    r = await srv.call('POST', '/api/changes', { cookie: e.cookie, body: { puts: [{ kind: 'object', id: 'z1', value: { ...all.objs.find(o => o.id === 'z1'), model: 'Z9' }, base: all.revs['object|z1'] }], dels: [] } });
    assert.equal(r.status, 200, r.text);
    r = await srv.call('POST', '/api/changes', { cookie: e.cookie, body: { puts: [{ kind: 'setting', id: 'sites', value: ['Bern'], base: all.revs['setting|sites'] }], dels: [] } });
    assert.equal(r.status, 403);
  } finally { await srv.close(); }
});

