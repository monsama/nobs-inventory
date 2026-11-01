/* A page asks only for what changed since its copy: the records written since, deleted ones named, revisions given;
   a page that sees part of the inventory, and a long gap, get everything. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';
import { loadState, saveState, changesSince, stateSeq } from '../server/state.js';
import { applyDelta } from '../public/js/delta.js';

test('since: only what changed, deletes named, and the page copy patched to what a full load gives', async () => {
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const s = loadState(srv.db);
    saveState(srv.db, { ...s, objs: [{ id: 'o1', code: 'INV-1', type: 'pc', name: 'PC-1', status: 'active', loc: '' }, { id: 'o2', code: 'INV-2', type: 'pc', name: 'PC-2', status: 'active', loc: '' }], locs: ['HQ / 1'], sites: ['HQ'] });
    const full = (await srv.call('GET', '/api/state', { cookie: a.cookie })).json;
    assert.ok(Number.isInteger(full.cseq));
    let d = (await srv.call('GET', `/api/state?since=${full.cseq}`, { cookie: a.cookie })).json;
    assert.deepEqual([d.delta, d.puts, d.dels], [true, [], []], 'nothing changed');
    // one device changed, one deleted, a setting changed
    const s2 = loadState(srv.db);
    s2.objs = s2.objs.filter(o => o.id !== 'o2'); s2.objs[0].name = 'PC-1 new'; s2.locs = ['HQ / 1', 'HQ / 2'];
    saveState(srv.db, s2);
    d = (await srv.call('GET', `/api/state?since=${full.cseq}`, { cookie: a.cookie })).json;
    assert.deepEqual(d.puts.map(p => p.slice(0, 2)).sort(), [['object', 'o1'], ['setting', 'locs']]);
    assert.deepEqual(d.dels, [['object', 'o2']]);
    assert.ok(d.revs['object|o1'] > full.revs['object|o1'] && d.revs['object|o2'] > full.revs['object|o2']);
    const patched = applyDelta(structuredClone(full), d), now = (await srv.call('GET', '/api/state', { cookie: a.cookie })).json;
    for (const k of ['objs', 'locs', 'revs']) assert.deepEqual(k === 'objs' ? patched.objs.sort((x, y) => x.id.localeCompare(y.id)) : patched[k], k === 'objs' ? now.objs.sort((x, y) => x.id.localeCompare(y.id)) : now[k], k);
    assert.equal(patched.cseq, now.cseq);
    // a gap the server cannot answer (a number from another database) gives everything
    assert.ok(!(await srv.call('GET', `/api/state?since=${now.cseq + 1000}`, { cookie: a.cookie })).json.delta);
    assert.equal(changesSince(srv.db, 0, 1), null, 'too many: everything instead');
    assert.ok(stateSeq(srv.db) >= now.cseq);
    // a viewer gets no sign-in names in a delta either; a viewer limited to sites gets everything (filtered)
    const s3 = loadState(srv.db);
    s3.users.push({ id: 'v1', name: 'Vera Viewer', login: 'vera', role: 'viewer', source: 'manual' });
    s3.users.push({ id: 'v2', name: 'Sam Site', login: 'sam', role: 'viewer', source: 'manual', sites: ['HQ'] });
    saveState(srv.db, s3);
    await srv.call('POST', '/api/users/v1/password', { cookie: a.cookie, body: { password: 'viewerpass123' } });
    await srv.call('POST', '/api/users/v2/password', { cookie: a.cookie, body: { password: 'viewerpass123' } });
    const v = await signIn(srv, 'vera', 'viewerpass123');
    d = (await srv.call('GET', `/api/state?since=${now.cseq}`, { cookie: v.cookie })).json;
    assert.ok(d.delta); assert.ok(d.puts.some(p => p[0] === 'user'));
    assert.ok(!JSON.stringify(d).includes('"login"'), 'no logins');
    const site = await signIn(srv, 'sam', 'viewerpass123');
    // a viewer limited to sites: the changes as they see them; a device moving in comes with its history and connections
    const s4 = loadState(srv.db);
    s4.objs.find(o => o.id === 'o1').loc = 'HQ / 1';
    s4.objs.push({ id: 'z1', code: 'INV-9', type: 'pc', name: 'PC-ZH', status: 'active', loc: 'ZH / 1' });
    s4.rels.push({ id: 'r1', from: 'z1', to: 'o1', kind: 'connected' }); s4.history.z1 = [{ t: 'x', msg: 'bought in Zürich' }];
    saveState(srv.db, s4);
    let sv = (await srv.call('GET', '/api/state', { cookie: site.cookie })).json;
    assert.deepEqual(sv.objs.map(o => o.id), ['o1']);
    const s5 = loadState(srv.db); s5.objs.find(o => o.id === 'z1').loc = 'HQ / 1'; s5.sites = ['HQ', 'ZH']; saveState(srv.db, s5);
    d = (await srv.call('GET', `/api/state?since=${sv.cseq}`, { cookie: site.cookie })).json;
    assert.ok(d.delta);
    assert.deepEqual(d.puts.map(p => p.slice(0, 2).join('|')).sort(), ['history|z1', 'object|z1', 'rel|r1', 'setting|sites']);
    const mine = applyDelta(structuredClone(sv), d), whole = (await srv.call('GET', '/api/state', { cookie: site.cookie })).json;
    assert.deepEqual(mine.objs.map(o => o.id).sort(), whole.objs.map(o => o.id).sort());
    assert.deepEqual(mine.rels, whole.rels); assert.deepEqual(mine.history, whole.history);
    // and moving out again: named as gone, with its connection and history
    sv = whole;
    const s6 = loadState(srv.db); s6.objs.find(o => o.id === 'z1').loc = 'ZH / 1'; saveState(srv.db, s6);
    d = (await srv.call('GET', `/api/state?since=${sv.cseq}`, { cookie: site.cookie })).json;
    assert.deepEqual(d.dels.map(x => x.join('|')).sort(), ['history|z1', 'object|z1', 'rel|r1']);
    assert.ok(!JSON.stringify(d.puts).includes('ZH / 1'), 'nothing of the other site');
    // their own account changed (other sites): everything again
    const s7 = loadState(srv.db); s7.users.find(u => u.id === 'v2').sites = ['ZH']; saveState(srv.db, s7);
    assert.ok(!(await srv.call('GET', `/api/state?since=${sv.cseq}`, { cookie: site.cookie })).json.delta);
  } finally { await srv.close(); }
});
