import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';
import { loadState, saveState } from '../server/state.js';

/* Test connection is kept: when, whether it passed and what it said, for the source's tab after a reload. Only an admin's
   page gets it, like the sync runs. */
test('the last Test connection is kept, for admins only', async () => {
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const g = await srv.call('POST', '/api/graph/test', { cookie: a.cookie });
    assert.equal(g.status, 400);
    const l = await srv.call('POST', '/api/ldap/test', { cookie: a.cookie });
    assert.equal(l.status, 400);
    const runs = loadState(srv.db).testRuns;
    assert.equal(runs.graph.ok, false); assert.match(runs.graph.text, /not set up yet/);
    assert.equal(runs.ldap.ok, false); assert.match(runs.ldap.text, /directory server/);
    assert.ok(Date.parse(runs.graph.at));
    assert.ok((await srv.call('GET', '/api/state', { cookie: a.cookie })).json.testRuns.graph, 'the admin page gets it');
    const s = loadState(srv.db);
    s.users.push({ id: 'v1', name: 'Viewer', login: 'viewer', role: 'viewer', active: true });
    saveState(srv.db, s);
    const { setPassword } = await import('../server/auth.js');
    setPassword(srv.db, 'v1', 'viewerpass123');
    const v = await signIn(srv, 'viewer', 'viewerpass123');
    assert.equal((await srv.call('GET', '/api/state', { cookie: v.cookie })).json.testRuns, undefined, 'a viewer gets it');
    assert.equal((await srv.call('POST', '/api/ldap/test', { cookie: v.cookie })).status, 403);
  } finally { await srv.close(); }
});
