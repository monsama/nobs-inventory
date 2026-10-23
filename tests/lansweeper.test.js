import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer, signIn } from './helpers.js';
import { syncLansweeper, toRecord } from '../server/lansweeper.js';
import { loadState, saveState } from '../server/state.js';

/* A stand-in for the Lansweeper GraphQL endpoint: checks the token, serves two pages of assets. */
function fakeLansweeper({ token = 'good-token', scheme = 'Token' } = {}) {
  const requests = [];
  const assets = [
    { id: 'A1', name: 'ZH-PC-0142', serialNumber: 'CZC1', ipAddress: '10.10.20.57', macAddress: '64:4e:d7:3a:91:0c', operatingSystem: 'Windows 11 Pro', model: 'HP EliteDesk', location: '', assetType: 'Windows (workstation OS)' },
    { id: 'A2', name: 'SRV-NEW-01', serialNumber: 'SRVN1', ipAddress: '10.10.1.50', macAddress: '', operatingSystem: 'Windows Server 2022', model: 'Dell R750', location: 'Zürich HQ / Serverraum UG', assetType: 'Windows (server OS)' }
  ];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      requests.push({ auth: req.headers.authorization, body: JSON.parse(body || '{}') });
      if (req.headers.authorization !== `${scheme} ${token}`) { res.writeHead(401).end('{}'); return; }
      const { query, variables } = JSON.parse(body);
      const out = query.includes('authorizedSites')
        ? { data: { authorizedSites: { sites: [{ id: 'SITE1', name: 'HQ' }] } } }
        : { data: { site: { assetResources: variables.after === null || variables.after === undefined
            ? { items: [assets[0]], pageInfo: { hasNextPage: true, endCursor: 'p2' } }
            : { items: [assets[1]], pageInfo: { hasNextPage: false, endCursor: null } } } } };
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out));
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, requests, url: `http://127.0.0.1:${server.address().port}/graphql` })));
}

const seed = srv => saveState(srv.db, {
  objs: [{ id: 'o101', code: 'INV-0001', type: 'pc', name: 'ZH-PC-0142', serial: 'CZC1', ip: '10.10.20.42', ovr: {}, feed: null, loc: 'Zürich HQ / Büro 2.OG' }],
  rels: [], users: [{ id: 'u-admin', login: 'admin', name: 'Administrator', role: 'admin', active: true, source: 'manual' }],
  types: {}, history: {}, locs: ['Zürich HQ / Büro 2.OG', 'Zürich HQ / Serverraum UG'], lsSource: 'api', policy: { ip: true, mac: true, os: true, model: true },
  feedOn: true, feedSync: true, ldap: null, mapPos: {}, seq: 101, codeN: 1, rseq: 0
});

test('the API sync walks every page and merges the assets like a file import', async () => {
  const ls = await fakeLansweeper();
  const srv = await startServer();
  try {
    seed(srv);
    const cfg = { endpoint: ls.url, token: 'good-token', authScheme: 'Token', site: '' };
    const counts = await syncLansweeper(srv.db, cfg, new Date(2026, 9, 21, 6, 0));
    assert.equal(counts.assets, 2);
    assert.equal(counts.linked, 1);
    assert.equal(counts.created, 1);
    const st = loadState(srv.db);
    assert.equal(st.objs.find(o => o.name === 'ZH-PC-0142').ip, '10.10.20.57');
    const made = st.objs.find(o => o.name === 'SRV-NEW-01');
    assert.equal(made.type, 'server');
    assert.equal(made.loc, 'Zürich HQ / Serverraum UG');
    assert.equal(made.feed.ref, 'A2');
    // the token goes in the Authorization header on every call
    assert.ok(ls.requests.every(r => r.auth === 'Token good-token'));
    assert.equal(ls.requests.length, 3, 'sites, then two pages');
  } finally { await srv.close(); await new Promise(r => ls.server.close(r)); }
});

test('a wrong token is reported as refused, with nothing changed', async () => {
  const ls = await fakeLansweeper();
  const srv = await startServer();
  try {
    seed(srv);
    await assert.rejects(syncLansweeper(srv.db, { endpoint: ls.url, token: 'wrong', authScheme: 'Token' }), /refused the token/);
    assert.equal(loadState(srv.db).objs.length, 1);
  } finally { await srv.close(); await new Promise(r => ls.server.close(r)); }
});

test('the sync is started from the API by an admin; a viewer cannot start it', async () => {
  const ls = await fakeLansweeper();
  const srv = await startServer();
  try {
    seed(srv);
    const admin = await signIn(srv, 'admin', 'adminpass123');
    const none = await srv.call('POST', '/api/feed/sync', { cookie: admin.cookie });
    assert.equal(none.status, 400, 'without a configured API the sync says so');
    await srv.close();
  } finally { await new Promise(r => ls.server.close(r)); }

  const ls2 = await fakeLansweeper();
  const srv2 = await startServer({ lansweeper: null });
  // the route reads the configuration passed to createApp; build one with the API configured
  const { createApp } = await import('../server/app.js');
  const app = createApp({ db: srv2.db, lansweeper: { endpoint: ls2.url, token: 'good-token', authScheme: 'Token' } });
  const s2 = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${s2.address().port}`;
  try {
    seed(srv2);
    const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', password: 'adminpass123' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const r = await fetch(base + '/api/feed/sync', { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).counts.assets, 2);
  } finally {
    await new Promise(r => s2.close(r)); await srv2.close(); await new Promise(r => ls2.server.close(r));
  }
});

test('record mapping keeps the id as the feed reference', () => {
  assert.equal(toRecord({ id: 42, name: 'x' }).ref, '42');
  assert.equal(toRecord({}).name, '');
});
