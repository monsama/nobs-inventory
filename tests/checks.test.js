import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer, signIn } from './helpers.js';

/* Checks on the edges of the server: the address in the push script, a CSV import with a byte-order mark and
   semicolons, and the limits on floor plan images. */

const adminUser = { id: 'u-admin', login: 'admin', name: 'Administrator', role: 'admin', active: true };
const state = (extra = {}) => ({ objs: [], rels: [], users: [adminUser], types: {}, history: {}, locs: ['Zürich HQ / Büro 2.OG'],
  policy: { ip: true, mac: true, os: true, model: true }, feedOn: true, feedSync: true, ldap: null, mapPos: {}, seq: 100, codeN: 0, rseq: 0, ...extra });

/* A request with its own Host header; fetch does not allow one, so this uses node's http. */
const rawGet = (srv, host, cookie, path) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: srv.base.split(':').pop(), path, method: 'GET', headers: { Host: host, Cookie: cookie } }, res => {
    let body = ''; res.on('data', c => { body += c; }); res.on('end', () => resolve({ status: res.statusCode, body }));
  });
  req.on('error', reject); req.end();
});

test('the push script carries the address of the server, and a Host header that is not an address is refused', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    await srv.call('PUT', '/api/state', { body: state({ users: [adminUser] }), cookie: admin.cookie });
    const good = await rawGet(srv, 'inventory.example.ch', admin.cookie, '/api/feed/push-script');
    assert.equal(good.status, 200);
    assert.match(good.body, /NobsUrl\s*=\s*'http:\/\/inventory\.example\.ch'/);
    const port = srv.base.split(':').pop();
    const withPort = await rawGet(srv, `10.0.0.5:${port}`, admin.cookie, '/api/feed/push-script');
    assert.equal(withPort.status, 200, 'an address with a port was refused');
    for (const bad of ["evil.example';Write-Host x", 'a b']) {
      const r = await rawGet(srv, bad, admin.cookie, '/api/feed/push-script');
      assert.equal(r.status, 400, `the host "${bad}" was written into the script`);
      assert.doesNotMatch(r.body, /Write-Host/);
    }
  } finally { await srv.close(); }
});

test('a CSV export with a byte-order mark and semicolons is imported; a file without a name column is refused', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    await srv.call('PUT', '/api/state', { body: state(), cookie: admin.cookie });
    const csv = '﻿AssetName;Serial;AssetType;IPAddress\r\nPC-CSV-1;CSV1;Windows;10.10.0.31\r\nSRV-CSV-1;CSV2;Server;10.10.0.32\r\n';
    const ok = await srv.call('POST', '/api/feed/import', { body: csv, type: 'csv', cookie: admin.cookie });
    assert.equal(ok.status, 200, ok.text);
    const after = await srv.call('GET', '/api/state', { cookie: admin.cookie });
    const names = after.json.objs.map(o => o.name).sort();
    assert.deepEqual(names, ['PC-CSV-1', 'SRV-CSV-1']);
    assert.equal(after.json.objs.find(o => o.name === 'PC-CSV-1').ip, '10.10.0.31');
    const again = await srv.call('POST', '/api/feed/import', { body: csv, type: 'csv', cookie: admin.cookie });
    assert.equal(again.status, 200);
    assert.equal((await srv.call('GET', '/api/state', { cookie: admin.cookie })).json.objs.length, 2, 'the same file added its devices twice');
    const bad = await srv.call('POST', '/api/feed/import', { body: 'Foo,Bar\n1,2\n', type: 'csv', cookie: admin.cookie });
    assert.equal(bad.status, 400, 'a file without a name or serial column was accepted');
  } finally { await srv.close(); }
});

test('a floor plan picture must be a PNG, JPEG, GIF or WebP, and no larger than 2 MB', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const put = (body, id = 'pl1') => srv.call('PUT', `/api/plans/${id}/image`, { body, type: 'text', cookie: admin.cookie });
    assert.equal((await put(png)).status, 200);
    assert.equal((await put('<script>alert(1)</script>')).status, 400, 'a script was accepted as a picture');
    assert.equal((await put('data:image/svg+xml;base64,PHN2Zz4=')).status, 400, 'an SVG picture was accepted');
    assert.equal((await put('data:image/png;base64,' + 'A'.repeat(2000001))).status, 413, 'a picture over 2 MB was accepted');
    const r = await fetch(srv.base + '/api/plans/pl1/image', { headers: { Cookie: admin.cookie } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^image\/png/, 'the picture is not served as an image');
    assert.equal(Buffer.from(await r.arrayBuffer()).subarray(1, 4).toString(), 'PNG', 'the picture bytes were not kept');
  } finally { await srv.close(); }
});

test('wrong feed tokens are throttled per address, so a token cannot be guessed by trying', async () => {
  const srv = await startServer({ feedToken: 'real-push-token-123456' });
  try {
    let status = 0;
    for (let i = 0; i < 40 && status !== 429; i++) {
      status = (await fetch(srv.base + '/api/feed/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer guess-' + i }, body: '{"records":[]}' })).status;
    }
    assert.equal(status, 429, 'wrong tokens were never throttled');
    const right = await fetch(srv.base + '/api/feed/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer real-push-token-123456' }, body: '{"records":[]}' });
    assert.equal(right.status, 429, 'a throttled address was let in');
  } finally { await srv.close(); }
});

test('a viewer cannot make themselves an admin through their account, and cannot read the log or the backups', async () => {
  const srv = await startServer();
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    const users = [adminUser, { id: 'u-anna', login: 'anna', name: 'Anna', role: 'viewer', active: true }];
    await srv.call('PUT', '/api/state', { body: { objs: [], rels: [], users, types: {}, history: {}, locs: [], policy: null, feedOn: true, feedSync: true, ldap: null, mapPos: {}, seq: 100, codeN: 0, rseq: 0 }, cookie: admin.cookie });
    await srv.call('POST', '/api/users/u-anna/password', { body: { password: 'viewerpw123' }, cookie: admin.cookie });
    const viewer = await signIn(srv, 'anna', 'viewerpw123');
    const put = await srv.call('PUT', '/api/me', { body: { first: 'Anna', last: 'X', dept: 'Y', role: 'admin' }, cookie: viewer.cookie });
    assert.equal(put.status, 200);
    assert.equal(put.json.me.role, 'viewer', 'a viewer became an admin through their account');
    assert.equal((await srv.call('GET', '/api/log', { cookie: viewer.cookie })).status, 403, 'a viewer read the log');
    assert.equal((await srv.call('GET', '/api/backups', { cookie: viewer.cookie })).status, 403, 'a viewer listed the backups');
    assert.equal((await srv.call('GET', '/api/feed/push-token', { cookie: viewer.cookie })).status, 403, 'a viewer saw the push token status');
  } finally { await srv.close(); }
});
