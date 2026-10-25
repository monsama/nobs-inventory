import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startServer, signIn } from './helpers.js';
import { takeBackup } from '../server/backup.js';

/* Microsoft Graph set up in Settings: the IDs, a certificate the server makes and keeps with its key (sealed), the .cer to
   download any time, Use this one, Test connection, and removing the ones not in use. */
const GUID_T = '11111111-2222-3333-4444-555555555555', GUID_C = '66666666-7777-8888-9999-000000000000';
/* Microsoft, as far as the test needs it: a token for the right certificate, the two lists, a permission switch. */
const fakeMicrosoft = (state) => async (url, opts = {}) => {
  const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
  if (String(url).includes('login.microsoftonline.com')) {
    const assertion = new URLSearchParams(String(opts.body)).get('client_assertion');
    const head = JSON.parse(Buffer.from(assertion.split('.')[0], 'base64url'));
    return head['x5t#S256'] === state.uploaded ? json(200, { access_token: 't' }) : json(401, { error: 'invalid_client', error_description: 'AADSTS700027: Client assertion failed signature validation.' });
  }
  if (String(url).includes('/managedDevices')) return state.intune ? json(200, { value: [] }) : json(403, {});
  return json(200, { value: [] });
};

test('Graph is set up in Settings: IDs, a certificate kept on the server, its .cer downloadable, then tested', async () => {
  const ms = { uploaded: null, intune: false };
  const srv = await startServer({ graphFetch: fakeMicrosoft(ms) });
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    assert.equal((await srv.call('POST', '/api/graph/settings', { cookie: a.cookie, body: { tenant: 'not a tenant!', clientId: GUID_C } })).status, 400);
    assert.equal((await srv.call('POST', '/api/graph/settings', { cookie: a.cookie, body: { tenant: GUID_T, clientId: GUID_C } })).status, 200);
    assert.equal((await srv.call('POST', '/api/graph/test', { cookie: a.cookie })).status, 400, 'no certificate yet');

    const one = (await srv.call('POST', '/api/graph/cert', { cookie: a.cookie })).json;
    assert.match(one.thumbprint, /^[0-9A-F]{40}$/, 'the thumbprint is SHA-1 hex, as Entra lists it');
    assert.equal(one.keyPem, undefined, 'the key is not given out');
    let st = (await srv.call('GET', '/api/graph/status', { cookie: a.cookie })).json;
    assert.equal(st.configured, true, 'the first certificate is the one used');
    assert.equal(st.source, 'app');
    assert.deepEqual(st.certs.map(c => [c.thumbprint, c.inUse, c.onServer]), [[one.thumbprint, true, true]]);

    // The .cer can be downloaded again, any time; it is the certificate, not the key.
    const cer = await srv.call('GET', `/api/graph/cert/${one.thumbprint}/cer`, { cookie: a.cookie });
    assert.equal(cer.status, 200);
    assert.match(cer.text, /BEGIN CERTIFICATE/);
    assert.ok(!cer.text.includes('PRIVATE KEY'));

    // Not uploaded to Entra yet: the test says what to do. Uploaded, but Intune not consented: it names the permission.
    let t = await srv.call('POST', '/api/graph/test', { cookie: a.cookie });
    assert.equal(t.status, 502);
    assert.match(t.json.error, /Upload the \.cer to the app registration/);
    ms.uploaded = crypto.createHash('sha256').update(new crypto.X509Certificate(one.certPem).raw).digest('base64url');
    t = await srv.call('POST', '/api/graph/test', { cookie: a.cookie });
    assert.deepEqual(t.json.missing, ['DeviceManagementManagedDevices.Read.All']);
    ms.intune = true;
    t = await srv.call('POST', '/api/graph/test', { cookie: a.cookie });
    assert.deepEqual([t.json.devices, t.json.managedDevices, t.json.missing], [true, true, []]);

    // A second one; switch to it; the first can then be removed, with its key.
    const two = (await srv.call('POST', '/api/graph/cert', { cookie: a.cookie })).json;
    st = (await srv.call('GET', '/api/graph/status', { cookie: a.cookie })).json;
    assert.deepEqual(st.certs.map(c => [c.thumbprint, c.inUse]), [[two.thumbprint, false], [one.thumbprint, true]], 'a new certificate does not replace the one in use');
    assert.equal((await srv.call('DELETE', '/api/graph/cert/' + one.thumbprint, { cookie: a.cookie })).status, 400, 'the one in use cannot be removed');
    assert.equal((await srv.call('POST', `/api/graph/cert/${two.thumbprint}/use`, { cookie: a.cookie })).status, 200);
    assert.equal((await srv.call('DELETE', '/api/graph/cert/' + one.thumbprint.toLowerCase(), { cookie: a.cookie })).status, 200);
    assert.equal((await srv.call('GET', `/api/graph/cert/${one.thumbprint}/cer`, { cookie: a.cookie })).status, 404);

    // The key is in no state, no backup, no log; only sealed in its own table.
    const state = (await srv.call('GET', '/api/state', { cookie: a.cookie })).text;
    const backup = srv.db.prepare('SELECT data FROM backups WHERE id = ?').get(takeBackup(srv.db, 'test')).data;
    const log = JSON.stringify(srv.db.prepare('SELECT * FROM audit').all());
    const kept = JSON.stringify(srv.db.prepare('SELECT * FROM graph_keys').all());
    for (const [where, text] of [['state', state], ['backup', backup], ['log', log], ['table', kept]]) assert.ok(!text.includes('PRIVATE KEY'), 'a readable key in the ' + where);

  } finally { await srv.close(); }
});

test('Graph settings on the server (NI_GRAPH_*) take precedence over those made in Settings', async () => {
  let server = null;
  const srv = await startServer({ graphConfig: () => server });
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    await srv.call('POST', '/api/graph/settings', { cookie: a.cookie, body: { tenant: GUID_T, clientId: GUID_C } });
    const one = (await srv.call('POST', '/api/graph/cert', { cookie: a.cookie })).json;
    assert.equal((await srv.call('GET', '/api/graph/status', { cookie: a.cookie })).json.source, 'app');
    const { generateGraphCert } = await import('../server/cert.js');
    const own = generateGraphCert();
    server = { tenant: 't', clientId: 'c', certPem: own.certPem, keyPem: own.keyPem };
    const st = (await srv.call('GET', '/api/graph/status', { cookie: a.cookie })).json;
    assert.equal(st.source, 'server');
    assert.deepEqual(st.certs.map(c => [c.thumbprint, c.inUse]), [[one.thumbprint, false]]);
  } finally { await srv.close(); }
});
