import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';
import { loadState, saveState } from '../server/state.js';
import { mergeRecords, recordsFromJson } from '../server/feed.js';

const dev = (id, more = {}) => ({ id, code: 'INV-' + id, type: 'pc', name: 'PC-' + id, status: 'active', ...more });

test('the same asset twice in one push still updates its device', () => {
  const s = { objs: [dev('a', { serial: 'S1', os: 'Windows 10', feed: { sys: 'Lansweeper', ref: '42' } })], rels: [], users: [], policy: { os: true },
    feedOn: true, intake: 'direct', locs: [], seq: 10, codeN: 1, rseq: 0, types: {}, history: {} };
  const rec = { name: 'PC-a', serial: 'S1', ref: '42', os: 'Windows 11' };
  const c = mergeRecords(s, recordsFromJson([rec, rec]), new Date(), []);
  assert.equal(s.objs[0].os, 'Windows 11', 'a repeated row left the device as it was: ' + JSON.stringify(c));
  assert.ok(!c.superseded);
});

test('a history line sent with a change refused as stale is not kept', async () => {
  const srv = await startServer();
  try {
    saveState(srv.db, { ...loadState(srv.db), objs: [dev('a', { ip: '10.0.0.1' })], history: { a: [{ t: '2026-11-01 08:00', msg: 'Created' }] } });
    const a = await signIn(srv, 'admin', 'adminpass123');
    const revs = (await srv.call('GET', '/api/state?history=0', { cookie: a.cookie })).json.revs;
    saveState(srv.db, { ...loadState(srv.db), objs: [dev('a', { ip: '10.0.0.9' })] });
    const r = await srv.call('POST', '/api/changes', { cookie: a.cookie, body: { puts: [
      { kind: 'object', id: 'a', value: dev('a', { ip: '10.0.0.2' }), base: revs['object|a'] },
      { kind: 'history', id: 'a', value: [{ t: '2026-11-15 10:00', msg: 'IP changed from 10.0.0.1 to 10.0.0.2' }], base: 0 }], dels: [] } });
    assert.deepEqual(r.json.conflicts, ['object|a']);
    assert.equal(loadState(srv.db).objs[0].ip, '10.0.0.9');
    assert.deepEqual(loadState(srv.db).history.a.map(e => e.msg), ['Created'], 'the history tells of a change that was not made');
  } finally { await srv.close(); }
});

test('a list export is bounded as a whole', async () => {
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const big = Array.from({ length: 20000 }, () => Array.from({ length: 12 }, () => 'x'.repeat(120)));
    const r = await srv.call('POST', '/api/reports/list?format=xlsx', { cookie: a.cookie, body: { list: 'ips', columns: Array.from({ length: 12 }, (_, i) => ({ label: 'c' + i })), rows: big } });
    assert.equal(r.status, 413);
    const ok = await srv.call('POST', '/api/reports/list?format=xlsx', { cookie: a.cookie, body: { list: 'ips', columns: [{ label: 'IP' }], rows: [['10.0.0.1']] } });
    assert.equal(ok.status, 200);
  } finally { await srv.close(); }
});

test('a failed sync says what to do, on Health and in the notices', async () => {
  const { syncFix } = await import('../public/js/sync-errors.js');
  assert.match(syncFix('ldap', 'LDAP bind failed: 80090308: LdapErr: DSID-0C09044E, comment: AcceptSecurityContext error, data 52e, v4563 (InvalidCredentialsError)'), /refused the service account or its password/);
  assert.match(syncFix('graph', 'AADSTS700027: Client assertion contains an invalid signature.'), /did not accept the app's certificate/);
  assert.match(syncFix('graph', 'AADSTS700016: Application with identifier x was not found'), /client\) ID names no app/);
  assert.match(syncFix('lansweeper', 'connect ECONNREFUSED 10.0.0.5:443'), /could not be reached/);
  assert.equal(syncFix('graph', 'something else entirely'), '');
  const { healthReport } = await import('../server/health.js');
  const srv = await startServer();
  try {
    const s = { ...loadState(srv.db), syncRuns: { ldap: { at: new Date().toISOString(), ok: false, error: 'data 52e InvalidCredentials' } } };
    const c = healthReport(srv.db, s, { diskSpace: () => ({ free: 2 ** 40, total: 2 ** 41 }), on: { ldap: true } }).checks.find(x => x.name === 'Active Directory');
    assert.equal(c.state, 'bad');
    assert.match(c.note, /Service password: Replace[\s\S]*Error: data 52e/);
  } finally { await srv.close(); }
});

test('Preview sync is admin only, needs the source set up, and saves nothing', async () => {
  const srv = await startServer();
  try {
    const before = JSON.stringify(loadState(srv.db));
    const a = await signIn(srv, 'admin', 'adminpass123');
    assert.equal((await srv.call('POST', '/api/graph/preview', { cookie: a.cookie })).status, 400);
    assert.equal((await srv.call('POST', '/api/ldap/preview', { cookie: a.cookie })).status, 400);
    assert.equal((await srv.call('POST', '/api/ldap/preview')).status, 401);
    const after = loadState(srv.db);
    assert.equal(JSON.stringify(after), before, 'a preview changed the inventory');
    assert.equal(after.syncRuns && after.syncRuns.graph, undefined, 'a preview is recorded as a run');
  } finally { await srv.close(); }
});
