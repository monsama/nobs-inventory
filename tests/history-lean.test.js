import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';
import { HISTORY_KEEP, loadState, saveState, trimHistory } from '../server/state.js';
import { mergeRecords, recordsFromJson } from '../server/feed.js';
import { healthReport } from '../server/health.js';

const dev = (id, more = {}) => ({ id, code: 'INV-' + id, type: 'pc', name: 'PC-' + id, status: 'active', ...more });
const line = (t, msg) => ({ t, msg });

/* The page loads the inventory without the history and reads a device's history when its page opens. Its saves only
   ever add lines: the server puts them on top of the stored ones, so a page that never read a device's history, or one
   that missed a sync's line, loses none. */
test('the inventory without its history, one device\'s history on its own, and saves that only add lines', async () => {
  const srv = await startServer();
  try {
    saveState(srv.db, { ...loadState(srv.db), objs: [dev('a'), dev('b')], history: { a: [line('2026-11-02 09:00', 'Lansweeper: IP changed from 10.0.0.1 to 10.0.0.2'), line('2026-11-01 08:00', 'Created')] } });
    const a = await signIn(srv, 'admin', 'adminpass123');
    const lean = (await srv.call('GET', '/api/state?history=0', { cookie: a.cookie })).json;
    assert.deepEqual(lean.history, {}, 'the history came along');
    assert.ok(lean.revs['history|a'], 'the revision of the history is there');
    assert.equal(lean.objs.length, 2);
    assert.equal(Object.keys((await srv.call('GET', '/api/state', { cookie: a.cookie })).json.history).length, 1, 'without history=0 it is all there, as before');
    const h = await srv.call('GET', '/api/history/a', { cookie: a.cookie });
    assert.equal(h.status, 200); assert.equal(h.json.history.length, 2);
    assert.deepEqual((await srv.call('GET', '/api/history/b', { cookie: a.cookie })).json.history, []);
    assert.equal((await srv.call('GET', '/api/history/nope', { cookie: a.cookie })).status, 404);
    assert.equal((await srv.call('GET', '/api/history/a')).status, 401);

    /* A page that never read a's history sends only its new line, on an old revision: it goes on top, none is lost. */
    const r = await srv.call('POST', '/api/changes', { cookie: a.cookie, body: { puts: [{ kind: 'history', id: 'a', value: [line('2026-11-03 10:00', 'Note by hand')], base: 0 }], dels: [] } });
    assert.equal(r.status, 200); assert.deepEqual(r.json.conflicts, []);
    assert.deepEqual(loadState(srv.db).history.a.map(e => e.msg), ['Note by hand', 'Lansweeper: IP changed from 10.0.0.1 to 10.0.0.2', 'Created']);
    /* A page with all of it, and a line the server got meanwhile that it has not: kept, nothing twice. */
    const page = [line('2026-11-03 11:00', 'Moved'), line('2026-11-02 09:00', 'Lansweeper: IP changed from 10.0.0.1 to 10.0.0.2'), line('2026-11-01 08:00', 'Created')];
    await srv.call('POST', '/api/changes', { cookie: a.cookie, body: { puts: [{ kind: 'history', id: 'a', value: page, base: null }], dels: [] } });
    assert.deepEqual(loadState(srv.db).history.a.map(e => e.msg), ['Moved', 'Note by hand', 'Lansweeper: IP changed from 10.0.0.1 to 10.0.0.2', 'Created']);

    /* A device deleted takes its history along, also when the page did not send its removal. */
    const revs = (await srv.call('GET', '/api/state?history=0', { cookie: a.cookie })).json.revs;
    const del = await srv.call('POST', '/api/changes', { cookie: a.cookie, body: { puts: [], dels: [{ kind: 'object', id: 'a', base: revs['object|a'] }] } });
    assert.equal(del.status, 200);
    assert.equal(loadState(srv.db).history.a, undefined, 'the history of the deleted device stayed');
    assert.ok(del.json.revs['history|a'], 'the page is told the history went too');
  } finally { await srv.close(); }
});

test('a device\'s history is only for those who may see the device', async () => {
  const srv = await startServer();
  try {
    saveState(srv.db, { ...loadState(srv.db), sites: ['HQ', 'Branch'], locs: ['HQ / Office', 'Branch / Store'],
      objs: [dev('a', { loc: 'HQ / Office' }), dev('b', { loc: 'Branch / Store' })], history: { a: [line('2026-11-01 08:00', 'Created')], b: [line('2026-11-01 08:00', 'Created')] } });
    const s = loadState(srv.db);
    s.users.push({ id: 'v1', name: 'Viewer', login: 'viewer', role: 'viewer', active: true, sites: ['HQ'] });
    saveState(srv.db, s);
    const { setPassword } = await import('../server/auth.js');
    setPassword(srv.db, 'v1', 'viewerpass123');
    const v = await signIn(srv, 'viewer', 'viewerpass123');
    assert.equal((await srv.call('GET', '/api/history/a', { cookie: v.cookie })).status, 200);
    assert.equal((await srv.call('GET', '/api/history/b', { cookie: v.cookie })).status, 404, 'a device of another site');
  } finally { await srv.close(); }
});

test('history kept longer than now is cut once; an address from DHCP that changes is no history line', () => {
  return (async () => {
    const srv = await startServer();
    try {
      const long = Array.from({ length: 500 }, (_, i) => line(`2026-01-01 ${String(i % 24).padStart(2, '0')}:00`, 'Line ' + i));
      srv.db.prepare("INSERT INTO docs (kind, id, data) VALUES ('history', 'x', ?) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data").run(JSON.stringify(long));
      assert.equal(trimHistory(srv.db), 1);
      const h = loadState(srv.db).history.x;
      assert.equal(h.length, HISTORY_KEEP); assert.equal(h[0].msg, 'Line 0', 'the newest are kept');
      assert.equal(trimHistory(srv.db), 0, 'once only');
    } finally { await srv.close(); }
  })().then(() => {
    const s = { objs: [dev('a', { serial: 'S1', ip: '10.0.0.1', dhcp: 'dhcp', feed: { sys: 'Lansweeper', ref: '1' } }), dev('b', { serial: 'S2', ip: '10.0.0.5', dhcp: 'static', feed: { sys: 'Lansweeper', ref: '2' } })],
      rels: [], users: [], policy: { ip: true }, feedOn: true, intake: 'direct', locs: [], seq: 10, codeN: 2, rseq: 0, types: {}, history: {} };
    mergeRecords(s, recordsFromJson([{ name: 'PC-a', serial: 'S1', ref: '1', ip: '10.0.0.9' }, { name: 'PC-b', serial: 'S2', ref: '2', ip: '10.0.0.6' }]), new Date(), []);
    assert.equal(s.objs[0].ip, '10.0.0.9', 'the new address is taken all the same');
    assert.ok(!(s.history.a || []).some(e => /IP/.test(e.msg)), 'a line for a DHCP address');
    assert.ok((s.history.b || []).some(e => /IP changed from 10\.0\.0\.5 to 10\.0\.0\.6/.test(e.msg)), 'a static address that changed is still noted');
  });
});

test('Health says when the inventory comes close to its limit, and when the Lansweeper push has stopped', async () => {
  const srv = await startServer();
  try {
    const roomy = { diskSpace: () => ({ free: 2 ** 40, total: 2 ** 41 }) };
    const size = () => healthReport(srv.db, loadState(srv.db), roomy).checks.find(c => c.name === 'Inventory size');
    assert.equal(size().state, 'ok');
    /* 75 MB of settings: three quarters of the limit */
    srv.db.prepare("INSERT INTO docs (kind, id, data) VALUES ('setting', 'bulk', ?)").run(JSON.stringify('x'.repeat(75 * 1024 * 1024)));
    assert.equal(size().state, 'warn'); assert.match(size().note, /75% of the limit/);
    srv.db.prepare("DELETE FROM docs WHERE kind = 'setting' AND id = 'bulk'").run();
    const push = days => healthReport(srv.db, { ...loadState(srv.db), syncRuns: { lansweeper: { at: new Date(Date.now() - days * 864e5).toISOString(), ok: true, how: 'push' } } },
      { ...roomy, on: { lansweeper: true } }).checks.find(c => c.name === 'Lansweeper');
    assert.equal(push(1).state, 'ok');
    assert.equal(push(3).state, 'warn'); assert.match(push(3).note, /No push from Lansweeper for more than two days/);
    assert.equal(push(8).state, 'bad', 'a week without a push: also in the weekly e-mail');
  } finally { await srv.close(); }
});

/* History belongs to its device: a removal of it is not done while the device stays, lines for a device that is gone are
   not kept, and lines the server cut off as the oldest do not come back on top. */
test('history is removed only with its device, kept only for a device there is, and old lines do not come back', async () => {
  const srv = await startServer();
  try {
    const old = Array.from({ length: HISTORY_KEEP }, (_, i) => line(`2026-10-01 ${String(i).padStart(4, '0')}`, 'p' + i)).reverse();
    saveState(srv.db, { ...loadState(srv.db), objs: [dev('a'), dev('b')], history: { a: [line('2026-11-01 08:00', 'Created')], b: old } });
    const a = await signIn(srv, 'admin', 'adminpass123');
    const revs = (await srv.call('GET', '/api/state?history=0', { cookie: a.cookie })).json.revs;
    // device a changed meanwhile: its delete is stale; the history removal sent with it is not done either
    saveState(srv.db, { ...loadState(srv.db), objs: [{ ...dev('a'), purpose: 'changed' }, dev('b')] });
    const r = await srv.call('POST', '/api/changes', { cookie: a.cookie, body: { puts: [], dels: [{ kind: 'history', id: 'a', base: revs['history|a'] }, { kind: 'object', id: 'a', base: revs['object|a'] }] } });
    assert.deepEqual(r.json.conflicts, ['object|a']);
    assert.equal(loadState(srv.db).history.a.length, 1, 'the history of a device that stays was removed');
    // lines for a device that is not there are not kept
    await srv.call('POST', '/api/changes', { cookie: a.cookie, body: { puts: [{ kind: 'history', id: 'gone', value: [line('2026-11-02 09:00', 'x')], base: 0 }], dels: [] } });
    assert.equal(loadState(srv.db).history.gone, undefined, 'history kept for a device that does not exist');
    // b at the limit: a sync adds two lines (the two oldest go); a page that still has them adds one: they stay gone
    const synced = [line('2026-11-03 10:01', 's2'), line('2026-11-03 10:00', 's1'), ...old].slice(0, HISTORY_KEEP);
    saveState(srv.db, { ...loadState(srv.db), history: { ...loadState(srv.db).history, b: synced } });
    await srv.call('POST', '/api/changes', { cookie: a.cookie, body: { puts: [{ kind: 'history', id: 'b', value: [line('2026-11-03 11:00', 'new'), ...old], base: 0 }], dels: [] } });
    const h = loadState(srv.db).history.b.map(e => e.msg);
    assert.deepEqual(h.slice(0, 4), ['new', 's2', 's1', 'p199'], 'old lines came back on top: ' + h.slice(0, 6).join(','));
    assert.equal(h.length, HISTORY_KEEP);
  } finally { await srv.close(); }
});

test('the same line twice in one minute is kept twice (bring back, undo, bring back)', async () => {
  const { newLines } = await import('../public/js/history-merge.js');
  const t = '2026-11-15 10:00', A = line(t, 'Brought back to stock'), B = line(t, 'Bring back undone'), old = [line('2026-11-01 08:00', 'Created'), line('2026-10-01 08:00', 'Bought')];
  const stored = [B, A, ...old];
  assert.deepEqual(newLines([A, B, A, ...old], stored), [A], 'the third line was dropped');
  assert.deepEqual(newLines([B, A, ...old], stored), [], 'lines already stored came again');
  assert.deepEqual(newLines([line(t, 'new')], stored), [line(t, 'new')], 'a page that never read the history: its line');
  assert.deepEqual(newLines([A], stored), [], 'a line of its own already saved is not added twice');
});

/* A large inventory goes packed with gzip to a browser that takes it (also without the proxy); a small answer, or one to
   a client that does not take gzip, goes as it is. */
test('a large inventory is sent packed when the client takes gzip', async () => {
  const srv = await startServer();
  try {
    const sw = Array.from({ length: 30 }, (_, i) => ({ name: 'Package ' + i, version: '1.' + i }));
    saveState(srv.db, { ...loadState(srv.db), objs: Array.from({ length: 200 }, (_, i) => dev('d' + i, { software: sw })) });
    const a = await signIn(srv, 'admin', 'adminpass123');
    const get = enc => fetch(srv.base + '/api/state?history=0', { headers: { Cookie: a.cookie, 'Accept-Encoding': enc } });
    const packed = await get('gzip, deflate');
    assert.equal(packed.headers.get('content-encoding'), 'gzip');
    assert.match(String(packed.headers.get('vary')), /Accept-Encoding/i);
    assert.equal((await packed.json()).objs.length, 200, 'unpacked, it is the whole inventory');
    const plain = await get('identity');
    assert.equal(plain.headers.get('content-encoding'), null);
    assert.equal((await plain.json()).objs.length, 200);
    const me = await fetch(srv.base + '/api/history/d1', { headers: { Cookie: a.cookie, 'Accept-Encoding': 'gzip' } });
    assert.equal(me.headers.get('content-encoding'), null, 'a small answer goes as it is');
  } finally { await srv.close(); }
});

/* The page reads the inventory without the installed software (software=0) and the software next (api/software, only
   the devices the person may see); a save of a device without it leaves the stored software as it is. */
test('the inventory without its software, the software on its own, and saves that keep it', async () => {
  const { setPassword } = await import('../server/auth.js');
  const srv = await startServer();
  try {
    const sw = [{ name: 'Office Suite', version: '16.0' }];
    const s0 = loadState(srv.db);
    saveState(srv.db, { ...s0, sites: ['Bern', 'Zürich'], locs: ['Bern / EG', 'Zürich / EG'],
      users: [...s0.users, { id: 'v-bern', login: 'vbern', name: 'Bern Only', role: 'viewer', source: 'manual', active: true, groups: [], sites: ['Bern'] }],
      objs: [dev('a', { loc: 'Bern / EG', software: sw }), dev('b', { loc: 'Zürich / EG', software: sw }), dev('c', { loc: 'Bern / EG' })],
      lsPresence: { day: '2026-11-19', n: 3, since: '2026-11-01', full: { day: '2026-11-18', n: 3 }, days: [{ day: '2026-11-18', n: 3 }] },
      adShort: { day: '2026-11-19', n: 1, of: 12 } });
    setPassword(srv.db, 'v-bern', 'vbernpass12345');
    const a = await signIn(srv, 'admin', 'adminpass123');
    const lean = (await srv.call('GET', '/api/state?history=0&software=0', { cookie: a.cookie })).json;
    assert.ok(lean.objs.every(o => !('software' in o)), 'no software in the inventory');
    assert.ok((await srv.call('GET', '/api/state?history=0', { cookie: a.cookie })).json.objs.find(o => o.id === 'a').software, 'without software=0 it is there');
    assert.deepEqual((await srv.call('GET', '/api/software', { cookie: a.cookie })).json.software, { a: sw, b: sw });
    assert.equal((await srv.call('GET', '/api/software')).status, 401);
    /* A device saved without its software keeps it; one saved with an empty list has none. */
    const revs = lean.revs, obj = lean.objs.find(o => o.id === 'a');
    let r = await srv.call('POST', '/api/changes', { cookie: a.cookie, body: { puts: [{ kind: 'object', id: 'a', value: { ...obj, name: 'PC-A2' }, base: revs['object|a'] }], dels: [] } });
    assert.equal(r.status, 200); assert.deepEqual(r.json.conflicts, []);
    assert.deepEqual(loadState(srv.db).objs.find(o => o.id === 'a'), { ...obj, name: 'PC-A2', software: sw });
    r = await srv.call('POST', '/api/changes', { cookie: a.cookie, body: { puts: [{ kind: 'object', id: 'a', value: { ...obj, software: [] }, base: r.json.revs['object|a'] }], dels: [] } });
    assert.deepEqual(loadState(srv.db).objs.find(o => o.id === 'a').software, []);
    /* One device's software, and the licences' use counted on the server. */
    assert.deepEqual((await srv.call('GET', '/api/software/b', { cookie: a.cookie })).json, { id: 'b', software: sw });
    assert.deepEqual((await srv.call('GET', '/api/software/c', { cookie: a.cookie })).json.software, []);
    assert.equal((await srv.call('GET', '/api/software/nope', { cookie: a.cookie })).status, 404);
    const s1 = loadState(srv.db); saveState(srv.db, { ...s1, licences: [{ id: 'l1', name: 'Office', seats: 0, per: 'year' }] });
    assert.deepEqual((await srv.call('GET', '/api/licence-use', { cookie: a.cookie })).json.use, { l1: 1 });
    /* Someone limited to Bern: the software of Bern's devices only, and no counts of the whole inventory. */
    const v = await signIn(srv, 'vbern', 'vbernpass12345');
    assert.deepEqual(Object.keys((await srv.call('GET', '/api/software', { cookie: v.cookie })).json.software), []);
    assert.equal((await srv.call('GET', '/api/software/b', { cookie: v.cookie })).status, 404, 'a device of another site');
    assert.deepEqual((await srv.call('GET', '/api/licence-use', { cookie: v.cookie })).json.use, { l1: 0 }, 'only their devices counted');
    const vs = (await srv.call('GET', '/api/state?history=0', { cookie: v.cookie })).json;
    assert.deepEqual(vs.lsPresence, { day: '2026-11-19', since: '2026-11-01', full: { day: '2026-11-18' } });
    assert.deepEqual(vs.adShort, { day: '2026-11-19' });
  } finally { await srv.close(); }
});
