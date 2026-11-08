/* What a viewer limited to sites, or to their own devices, gets of the floor plans: only their sites' plans and
   pictures. And a viewer's problem reports are limited, so a loop cannot flood the admins. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';
import { loadState, saveState } from '../server/state.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('floor plans: a site-limited viewer gets only their sites\' plans and pictures, an own-devices viewer none', async () => {
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const s = loadState(srv.db);
    s.sites = ['HQ', 'Bern']; s.locs = ['HQ / 1', 'Bern / EG'];
    s.plans = [{ id: 'p-hq', name: 'HQ 1', site: 'HQ', areas: [] }, { id: 'p-be', name: 'Bern EG', site: 'Bern', areas: [] }];
    s.objs = [{ id: 'o1', code: 'INV-1', type: 'pc', name: 'PC-1', status: 'active', loc: 'HQ / 1', uid: 'v3' }];
    s.users.push({ id: 'v2', name: 'Sam Site', login: 'sam', role: 'viewer', source: 'manual', sites: ['HQ'] });
    s.users.push({ id: 'v3', name: 'Olga Own', login: 'olga', role: 'viewer', source: 'manual', own: true });
    saveState(srv.db, s);
    for (const id of ['v2', 'v3']) await srv.call('POST', `/api/users/${id}/password`, { cookie: a.cookie, body: { password: 'viewerpass123' } });
    for (const id of ['p-hq', 'p-be']) assert.equal((await srv.call('PUT', `/api/plans/${id}/image`, { cookie: a.cookie, body: PNG, type: 'text' })).status, 200);
    const sam = await signIn(srv, 'sam', 'viewerpass123'), olga = await signIn(srv, 'olga', 'viewerpass123');
    assert.deepEqual((await srv.call('GET', '/api/state', { cookie: sam.cookie })).json.plans.map(p => p.id), ['p-hq']);
    assert.equal((await srv.call('GET', '/api/plans/p-hq/image', { cookie: sam.cookie })).status, 200);
    assert.equal((await srv.call('GET', '/api/plans/p-be/image', { cookie: sam.cookie })).status, 404, 'another site\'s picture');
    assert.deepEqual((await srv.call('GET', '/api/state', { cookie: olga.cookie })).json.plans, []);
    assert.equal((await srv.call('GET', '/api/plans/p-hq/image', { cookie: olga.cookie })).status, 404);
    assert.equal((await srv.call('GET', '/api/plans/p-be/image', { cookie: a.cookie })).status, 200, 'an admin sees every plan');
    // problem reports: a few are fine, a flood is refused
    const codes = [];
    for (let i = 0; i < 7; i++) codes.push((await srv.call('POST', '/api/my/devices/o1/report', { cookie: olga.cookie, body: { text: 'Broken ' + i } })).status);
    assert.deepEqual(codes, [200, 200, 200, 200, 200, 429, 429]);
  } finally { await srv.close(); }
});

test('a site-limited viewer gets a whole-inventory check cut to their devices, and no revisions of other sites\' records', async () => {
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const s = loadState(srv.db);
    s.sites = ['HQ', 'Bern']; s.locs = ['HQ / 1', 'Bern / EG'];
    s.objs = [{ id: 'h1', code: 'INV-1', type: 'pc', name: 'HQ-PC', status: 'active', loc: 'HQ / 1' }, { id: 'b1', code: 'INV-2', type: 'pc', name: 'BERN-SECRET', status: 'active', loc: 'Bern / EG' }];
    s.stocktakes = [{ id: 'st1', name: 'All', scope: '', started: '2026-11-01', by: 'Administrator', finished: '2026-11-02',
      unknown: [{ text: 'SERIAL-RUN-7', at: '2026-11-01' }], result: { total: 2, confirmed: 0, missing: [{ id: 'h1', name: 'HQ-PC', code: 'INV-1', loc: 'HQ / 1' }, { id: 'b1', name: 'BERN-SECRET', code: 'INV-2', loc: 'Bern / EG' }], moved: [], unknown: ['SERIAL-BERN-9'] } }];
    s.users.push({ id: 'v2', name: 'Sam Site', login: 'sam', role: 'viewer', source: 'manual', sites: ['HQ'] });
    saveState(srv.db, s);
    await srv.call('POST', '/api/users/v2/password', { cookie: a.cookie, body: { password: 'viewerpass123' } });
    const sam = await signIn(srv, 'sam', 'viewerpass123');
    const got = (await srv.call('GET', '/api/state', { cookie: sam.cookie })).json;
    const text = JSON.stringify(got);
    assert.ok(!text.includes('BERN-SECRET') && !text.includes('SERIAL-BERN-9') && !text.includes('SERIAL-RUN-7'), 'another site\'s device or a scanned serial reached the viewer');
    assert.deepEqual(got.stocktakes[0].result.missing.map(m => m.id), ['h1']);
    assert.ok(!Object.keys(got.revs || {}).some(k => k.endsWith('|b1')), 'the revisions name another site\'s device');
  } finally { await srv.close(); }
});
