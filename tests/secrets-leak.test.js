import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';

/* Secrets the server keeps must not come back out: not in the state the page loads, not in a backup, not in the log,
   not in the push script. */
const adminUser = { id: 'u-admin', login: 'admin', name: 'Administrator', role: 'admin', active: true };

test('the push token, shown once, and the admin password are never in the state, a backup, the log or the push script', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    await srv.call('PUT', '/api/state', { body: { objs: [], rels: [], users: [adminUser], types: {}, history: {}, locs: [], policy: null, feedOn: true, feedSync: true, ldap: null, mapPos: {}, seq: 100, codeN: 0, rseq: 0 }, cookie: admin.cookie });
    const made = await srv.call('POST', '/api/feed/push-token', { body: {}, cookie: admin.cookie });
    assert.equal(made.status, 200, made.text);
    const token = made.json.token;
    assert.ok(token && token.length > 20, 'no token was shown once');
    const backup = await srv.call('POST', '/api/backups', { body: {}, cookie: admin.cookie });
    assert.equal(backup.status, 200);
    const id = (await srv.call('GET', '/api/backups', { cookie: admin.cookie })).json.backups[0].id;
    const dl = await fetch(srv.base + `/api/backups/${id}/download`, { headers: { Cookie: admin.cookie } });
    const log = await srv.call('GET', '/api/log', { cookie: admin.cookie });
    const script = await srv.call('GET', '/api/feed/push-script', { cookie: admin.cookie });
    const state = await srv.call('GET', '/api/state', { cookie: admin.cookie });
    const texts = {
      state: JSON.stringify(state.json), backup: await dl.text(), log: JSON.stringify(log.json), script: script.text,
    };
    for (const [where, text] of Object.entries(texts)) {
      assert.ok(!text.includes(token), `the push token is in the ${where}`);
      assert.ok(!text.includes('adminpass123'), `the admin password is in the ${where}`);
    }
    const again = await srv.call('GET', '/api/feed/push-token', { cookie: admin.cookie });
    assert.ok(!JSON.stringify(again.json).includes(token), 'the token is shown again after it was created');
  } finally { await srv.close(); }
});
