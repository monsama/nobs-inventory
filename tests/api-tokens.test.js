/* Read-only API tokens: made by an admin, shown once, kept as a hash; they read the device list and nothing else. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';
import { loadState, saveState } from '../server/state.js';

test('an API token reads the devices (people only when made with them), nothing else, and can be revoked', async () => {
  const srv = await startServer();
  try {
    const s = loadState(srv.db);
    saveState(srv.db, { ...s, users: [...s.users, { id: 'u-a', name: 'Anna Muster', dept: 'Sales', role: 'none', source: 'manual', active: true, groups: [] }],
      objs: [{ id: 'o1', code: 'INV-0001', type: 'notebook', name: 'NB-1', serial: 'SN1', status: 'active', loc: 'Bern', uid: 'u-a', ovr: {}, feed: null },
        { id: 'o2', code: 'INV-0002', type: 'pc', name: 'PC-=2', status: 'stock', loc: '', ovr: {}, feed: null },
        { id: 'r1', code: 'INV-0003', type: 'pc', name: 'WAITING', status: 'active', ovr: {}, feed: null, review: { src: 'ad', at: 'x' } }],
      contracts: [{ id: 'k1', name: 'Firewall support', kind: 'support', supplier: 'Acme', end: '2027-12-31', renew: 12, notice: 3, cost: 1200, per: 'year', devices: ['o1'], note: 'internal note' }],
      licences: [{ id: 'l1', name: 'Office', seats: 5, cost: 10, per: 'month', note: 'x' }] });
    const a = await signIn(srv, 'admin', 'adminpass123');
    assert.equal((await srv.call('POST', '/api/tokens', { cookie: a.cookie, body: { name: '' } })).status, 400);
    const plain = (await srv.call('POST', '/api/tokens', { cookie: a.cookie, body: { name: 'Monitoring' } })).json;
    const named = (await srv.call('POST', '/api/tokens', { cookie: a.cookie, body: { name: 'Helpdesk', people: true } })).json;
    assert.match(plain.token, /^nobs_/);
    const list = (await srv.call('GET', '/api/tokens', { cookie: a.cookie })).json.tokens;
    assert.equal(list.length, 2); assert.ok(!JSON.stringify(list).includes(plain.token), 'the token is not listed again');
    assert.ok(!JSON.stringify(srv.db.prepare('SELECT * FROM api_tokens').all()).includes(plain.token), 'only its hash is kept');
    const get = (path, token) => fetch(srv.base + path, { headers: token ? { authorization: 'Bearer ' + token } : {} });
    assert.equal((await get('/api/v1/devices')).status, 401);
    assert.equal((await get('/api/v1/devices', 'nobs_wrong')).status, 401);
    const j = await (await get('/api/v1/devices', plain.token)).json();
    assert.equal(j.count, 2, 'not the one waiting in To review');
    assert.equal(j.devices[0].user, undefined, 'no names without the people choice');
    const k = await (await get('/api/v1/devices?status=active', named.token)).json();
    assert.deepEqual(k.devices.map(d => [d.code, d.user, d.department]), [['INV-0001', 'Anna Muster', 'Sales']]);
    const csv = await (await get('/api/v1/devices?format=csv', plain.token)).text();
    assert.match(csv, /^\ufeff?id,code,name/); assert.match(csv, /'PC-=2|PC-=2/); assert.ok(!csv.includes(',=') , 'no formula at the start of a cell');
    assert.equal((await (await get('/api/v1/devices/SN1', plain.token)).json()).code, 'INV-0001');
    assert.equal((await get('/api/v1/devices/INV-0003', plain.token)).status, 404);
    // contracts, licences, and people for a token made with them
    const c = await (await get('/api/v1/contracts', plain.token)).json();
    assert.equal(c.count, 1); assert.deepEqual(c.contracts[0].devices, ['INV-0001']); assert.equal(c.contracts[0].noticeBy, '2027-09-30');
    assert.ok(!JSON.stringify(c).includes('internal note'), 'no notes');
    assert.match(await (await get('/api/v1/contracts?format=csv', plain.token)).text(), /^\ufeff?id,name,kind[\s\S]*Firewall support,Support,Acme/);
    const l = await (await get('/api/v1/licences', plain.token)).json();
    assert.deepEqual([l.licences[0].name, l.licences[0].seats, l.licences[0].used], ['Office', 5, 0]);
    assert.equal((await get('/api/v1/people', plain.token)).status, 403, 'not without people');
    const pp = await (await get('/api/v1/people', named.token)).json();
    assert.deepEqual(pp.people.find(x => x.id === 'u-a'), { id: 'u-a', name: 'Anna Muster', department: 'Sales', active: true, devices: 1 });
    assert.ok(!JSON.stringify(pp).includes('"login"'));
    // a token is no session: the rest of the API stays closed to it
    assert.equal((await get('/api/state', plain.token)).status, 401);
    assert.equal((await get('/api/backups', plain.token)).status, 401);
    assert.ok((await srv.call('GET', '/api/tokens', { cookie: a.cookie })).json.tokens.find(t => t.name === 'Monitoring').used, 'its use is noted');
    await srv.call('DELETE', '/api/tokens/' + plain.info.id, { cookie: a.cookie });
    assert.equal((await get('/api/v1/devices', plain.token)).status, 401, 'revoked');
  } finally { await srv.close(); }
});

test('wrong tokens are throttled per address', async () => {
  const srv = await startServer();
  try {
    let last;
    for (let i = 0; i < 10; i++) last = await fetch(srv.base + '/api/v1/devices', { headers: { authorization: 'Bearer nobs_guess' + i } });
    assert.equal(last.status, 429);
  } finally { await srv.close(); }
});
