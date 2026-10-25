import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';

/* Certificates made in Settings: their public details are kept and listed, the one the server uses is marked, and the
   others can be taken off the list. The private key is never kept. */
test('a certificate made here is listed by its Entra thumbprint, the one in use is marked, and only others can be removed', async () => {
  let inUse = null;
  const srv = await startServer({ graphConfig: () => inUse });
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const one = await srv.call('POST', '/api/graph/cert', { cookie: a.cookie });
    const two = await srv.call('POST', '/api/graph/cert', { cookie: a.cookie });
    assert.equal(one.status, 200);
    assert.match(one.json.thumbprint, /^[0-9A-F]{40}$/, 'the thumbprint is SHA-1 hex, as Entra lists it');
    // The server now signs in with the first one.
    inUse = { tenant: 't', clientId: 'c', certPem: one.json.certPem, keyPem: one.json.keyPem };
    let st = (await srv.call('GET', '/api/graph/status', { cookie: a.cookie })).json;
    assert.deepEqual(st.certs.map(c => [c.thumbprint, c.inUse]), [[two.json.thumbprint, false], [one.json.thumbprint, true]]);
    assert.ok(!JSON.stringify(st).includes('PRIVATE KEY'), 'no key is kept or shown');
    const state = (await srv.call('GET', '/api/state', { cookie: a.cookie })).json;
    assert.ok(!JSON.stringify(state).includes('PRIVATE KEY'), 'no key is in the inventory');
    assert.equal((await srv.call('DELETE', '/api/graph/cert/' + one.json.thumbprint, { cookie: a.cookie })).status, 400, 'the certificate in use cannot be removed');
    assert.equal((await srv.call('DELETE', '/api/graph/cert/' + two.json.thumbprint.toLowerCase(), { cookie: a.cookie })).status, 200);
    st = (await srv.call('GET', '/api/graph/status', { cookie: a.cookie })).json;
    assert.deepEqual(st.certs.map(c => c.thumbprint), [one.json.thumbprint]);
  } finally { await srv.close(); }
});
