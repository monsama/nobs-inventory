/* The OpenAPI description of the token API (server/openapi.json): every route that takes an API token is in it, nothing
   else is, and it is served without signing in. The routes are read from the server's code. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path';
import { startServer } from './helpers.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'server', 'openapi.json'), 'utf8'));
/* Each route registered with the token check (apiAuth), as [method, OpenAPI path]: /api/v1/devices/:code → {code}. */
const tokenRoutes = fs.readdirSync(path.join(root, 'server')).filter(f => f.endsWith('.js'))
  .flatMap(f => [...fs.readFileSync(path.join(root, 'server', f), 'utf8').matchAll(/app\.(get|post|put|patch|delete)\(\s*'([^']+)'\s*,\s*apiAuth\b/g)])
  .map(m => [m[1], m[2].replace(/:(\w+)/g, '{$1}')]);

test('every route that takes an API token is described, with its token and its errors', () => {
  assert.ok(tokenRoutes.length >= 5, 'the routes were found in the code: ' + JSON.stringify(tokenRoutes));
  assert.equal(doc.openapi, '3.1.0');
  assert.deepEqual([doc.components.securitySchemes.token.type, doc.components.securitySchemes.token.scheme], ['http', 'bearer']);
  assert.deepEqual(doc.security, [{ token: [] }]);
  for (const [method, p] of tokenRoutes) {
    const op = doc.paths[p] && doc.paths[p][method];
    assert.ok(op, `${method.toUpperCase()} ${p} is not in server/openapi.json`);
    assert.ok(!op.security || op.security.length, `${p} needs the token`);
    assert.ok(op.responses['200'] && op.responses['401'], `${p}: an answer and the 401 for a wrong token`);
    const params = [...p.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
    assert.deepEqual((op.parameters || []).filter(x => x.in === 'path').map(x => x.name), params, `${p}: its path parameters`);
  }
  // and nothing that is not there: only the token routes, and the description itself
  const described = Object.entries(doc.paths).flatMap(([p, ops]) => Object.keys(ops).map(m => `${m} ${p}`));
  assert.deepEqual(described.sort(), [...tokenRoutes.map(([m, p]) => `${m} ${p}`), 'get /api/openapi.json'].sort());
  assert.deepEqual(doc.paths['/api/openapi.json'].get.security, [], 'the description needs no token');
  // every reference points at something
  const refs = [...JSON.stringify(doc).matchAll(/"\$ref":"#\/([^"]+)"/g)].map(m => m[1]);
  for (const r of refs) assert.ok(r.split('/').reduce((o, k) => o && o[k], doc), `${r} is referenced but missing`);
});

test('the description is served without signing in, and holds no data', async () => {
  const srv = await startServer();
  try {
    const r = await fetch(srv.base + '/api/openapi.json');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^application\/json/);
    assert.deepEqual(await r.json(), doc);
    assert.equal((await fetch(srv.base + '/api/v1/devices')).status, 401, 'the API itself still needs a token');
  } finally { await srv.close(); }
});
