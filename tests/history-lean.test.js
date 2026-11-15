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
