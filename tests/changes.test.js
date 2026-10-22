import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';

const pc = (id, name, model) => ({ id, code: null, type: 'pc', name, status: 'active', feed: null, ovr: {}, model });
/* Loads the inventory the way the page does: the documents and the revision of each. */
const load = async (srv, cookie) => (await srv.call('GET', '/api/state', { cookie })).json;
const put = (srv, cookie, changes) => srv.call('POST', '/api/changes', { cookie, body: changes });

test('a save based on an old revision is refused, and the rest of the save goes through', async () => {
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const s0 = await load(srv, a.cookie);
    const r1 = await put(srv, a.cookie, { puts: [{ kind: 'object', id: 'o1', value: pc('o1', 'PC-1', 'old'), base: 0 }, { kind: 'object', id: 'o2', value: pc('o2', 'PC-2', 'old'), base: 0 }], dels: [] });
    assert.equal(r1.status, 200);
    assert.deepEqual(r1.json.conflicts, []);
    const base = (await load(srv, a.cookie)).revs;
    // A changes PC-1.
    const rA = await put(srv, a.cookie, { puts: [{ kind: 'object', id: 'o1', value: pc('o1', 'PC-1', 'A'), base: base['object|o1'] }], dels: [] });
    assert.deepEqual(rA.json.conflicts, []);
    // B, still holding the old revision, changes PC-1 too, and changes PC-2, which is unchanged since.
    const rB = await put(srv, a.cookie, {
      puts: [{ kind: 'object', id: 'o1', value: pc('o1', 'PC-1', 'B'), base: base['object|o1'] }, { kind: 'object', id: 'o2', value: pc('o2', 'PC-2', 'B'), base: base['object|o2'] }],
      dels: [],
    });
    assert.deepEqual(rB.json.conflicts, ['object|o1'], 'the stale change to PC-1 was not refused');
    const now = await load(srv, a.cookie);
    assert.equal(now.objs.find(o => o.id === 'o1').model, 'A', 'A\'s change was overwritten');
    assert.equal(now.objs.find(o => o.id === 'o2').model, 'B', 'the other change in the same save was lost');
    assert.ok(s0.revs !== undefined);
  } finally { await srv.close(); }
});

test('an object deleted by one user does not come back when another user saves a stale copy', async () => {
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    await put(srv, a.cookie, { puts: [{ kind: 'object', id: 'o1', value: pc('o1', 'PC-1', 'x'), base: 0 }, { kind: 'object', id: 'o2', value: pc('o2', 'PC-2', 'x'), base: 0 }], dels: [] });
    const rev = (await load(srv, a.cookie)).revs;
    await put(srv, a.cookie, { puts: [], dels: [{ kind: 'object', id: 'o2', base: rev['object|o2'] }] });
    const stale = await put(srv, a.cookie, { puts: [{ kind: 'object', id: 'o2', value: pc('o2', 'PC-2', 'stale'), base: rev['object|o2'] }], dels: [] });
    assert.deepEqual(stale.json.conflicts, ['object|o2']);
    const now = await load(srv, a.cookie);
    assert.equal(now.objs.some(o => o.id === 'o2'), false, 'the deleted object came back');
  } finally { await srv.close(); }
});

test('two new objects saved at the same time get different codes', async () => {
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const r1 = await put(srv, a.cookie, { puts: [{ kind: 'object', id: 'oAAA', value: pc('oAAA', 'NEW-1', ''), base: 0 }], dels: [] });
    const r2 = await put(srv, a.cookie, { puts: [{ kind: 'object', id: 'oBBB', value: pc('oBBB', 'NEW-2', ''), base: 0 }], dels: [] });
    const codes = [r1.json.codes.oAAA, r2.json.codes.oBBB];
    assert.ok(codes[0] && codes[1] && codes[0] !== codes[1], 'codes are not unique: ' + codes);
    const now = await load(srv, a.cookie);
    assert.equal(new Set(now.objs.map(o => o.code)).size, now.objs.length, 'two objects share a code');
  } finally { await srv.close(); }
});

test('a viewer cannot save changes; the admin cannot remove themselves or the last active admin', async () => {
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const me = (await load(srv, a.cookie)).users.find(u => u.login === 'admin');
    const bad = await put(srv, a.cookie, { puts: [], dels: [{ kind: 'user', id: me.id, base: (await load(srv, a.cookie)).revs['user|' + me.id] }] });
    assert.equal(bad.status, 400, 'the admin removed themselves');
    assert.equal((await load(srv, a.cookie)).users.some(u => u.id === me.id), true);
    const noAuth = await srv.call('POST', '/api/changes', { body: { puts: [], dels: [] } });
    assert.equal(noAuth.status, 401);
    const viewer = { id: 'u-view', login: 'viewer', name: 'Viewer', role: 'viewer', active: true, groups: [], dept: '', source: 'manual' };
    assert.equal((await put(srv, a.cookie, { puts: [{ kind: 'user', id: viewer.id, value: viewer, base: 0 }], dels: [] })).status, 200);
    await srv.call('POST', `/api/users/${viewer.id}/password`, { cookie: a.cookie, body: { password: 'viewerpass123' } });
    const v = await signIn(srv, 'viewer', 'viewerpass123');
    const denied = await put(srv, v.cookie, { puts: [{ kind: 'object', id: 'oV', value: pc('oV', 'NOPE', ''), base: 0 }], dels: [] });
    assert.equal(denied.status, 403, 'a viewer could save');
  } finally { await srv.close(); }
});

test('the page cannot change the counters, and a preference saves without a revision', async () => {
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const badSetting = await put(srv, a.cookie, { puts: [{ kind: 'setting', id: 'codeN', value: 500, base: 0 }], dels: [] });
    assert.equal(badSetting.status, 400);
    const pref = await put(srv, a.cookie, { puts: [{ kind: 'setting', id: 'mapPos', value: { x: 1 }, base: null }], dels: [] });
    assert.equal(pref.status, 200);
    assert.deepEqual((await load(srv, a.cookie)).mapPos, { x: 1 });
  } finally { await srv.close(); }
});
