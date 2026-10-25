import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contractProblem, contractStatus, licenceProblem, licenceUse, listProblem, yearlyCost, costInYear } from '../public/js/costs.js';
import { checkState } from '../server/state.js';
import { startServer, signIn } from './helpers.js';

/* Contracts: where one stands on a given day, what it costs a year, and what the server refuses. Licences: seats against installs. */
const day = s => new Date(s + 'T12:00:00Z');

test('a contract that renews by itself runs on in terms; its notice is due the notice period before the end of the term', () => {
  const c = { id: 'c1', name: 'Switch maintenance', kind: 'maintenance', end: '2026-12-31', renew: 12, notice: 3 };
  assert.deepEqual(contractStatus(c, day('2026-06-01')), { state: 'ok', end: '2026-12-31', noticeBy: '2026-09-30', days: 121 });
  assert.equal(contractStatus(c, day('2026-08-15')).state, 'soon', 'notice due within 60 days');
  assert.equal(contractStatus(c, day('2026-10-15')).state, 'late', 'the notice date has passed: it renews');
  const next = contractStatus(c, day('2027-01-05'));
  assert.equal(next.end, '2027-12-31', 'after the end, the next term');
  assert.equal(next.noticeBy, '2027-09-30');
  assert.equal(contractStatus({ ...c, end: '2026-01-31', renew: 1, notice: 1 }, day('2026-03-10')).end, '2026-03-31', 'a month term from the end of January lands on month ends');
});

test('a contract that does not renew ends; one without an end date is open', () => {
  const c = { id: 'c2', name: 'Lease', kind: 'lease', end: '2026-11-30', renew: 0, notice: 0 };
  assert.equal(contractStatus(c, day('2026-06-01')).state, 'ok');
  assert.equal(contractStatus(c, day('2026-11-01')).state, 'soon');
  assert.equal(contractStatus(c, day('2026-12-01')).state, 'ended');
  assert.equal(contractStatus({ ...c, end: undefined }).state, 'open');
});

test('the yearly cost counts a monthly cost twelve times and a one-off cost not at all', () => {
  assert.equal(yearlyCost({ cost: 1200, per: 'year' }), 1200);
  assert.equal(yearlyCost({ cost: 50, per: 'month' }), 600);
  assert.equal(yearlyCost({ cost: 5000, per: 'once' }), 0);
  assert.equal(yearlyCost({}), 0);
});

test('the cost in a calendar year counts the months a contract runs in it; a one-off cost counts in the year it starts', () => {
  assert.equal(costInYear({ cost: 1200, per: 'year', start: '2026-07-01', end: '2027-06-30', renew: 12 }, 2026), 600, 'from July: half a year');
  assert.equal(costInYear({ cost: 1200, per: 'year', start: '2026-07-01', end: '2027-06-30', renew: 12 }, 2028), 1200, 'renews: runs on');
  assert.equal(costInYear({ cost: 1200, per: 'year', start: '2026-07-01', end: '2027-06-30', renew: 0 }, 2027), 600, 'ends in June');
  assert.equal(costInYear({ cost: 1200, per: 'year', end: '2025-12-31', renew: 0 }, 2026), 0, 'ended before');
  assert.equal(costInYear({ cost: 100, per: 'month' }, 2026), 1200, 'no dates: the whole year');
  assert.equal(costInYear({ cost: 5000, per: 'once', start: '2026-03-01' }, 2026), 5000);
  assert.equal(costInYear({ cost: 5000, per: 'once', start: '2026-03-01' }, 2027), 0);
});

test('a licence counts the devices, not retired, that have software with its name; more than its seats is over-use', () => {
  const objs = [
    { id: 'a', status: 'active', software: [{ name: 'Microsoft 365 Apps for enterprise - de-de', version: '16.0' }] },
    { id: 'b', status: 'active', software: [{ name: 'Microsoft 365 Apps for enterprise - en-us', version: '16.0' }] },
    { id: 'c', status: 'retired', software: [{ name: 'Microsoft 365 Apps for enterprise', version: '16.0' }] },
    { id: 'd', status: 'stock', software: [{ name: 'Adobe Acrobat', version: '24' }] },
  ];
  const u = licenceUse({ name: 'microsoft 365 apps', seats: 1 }, objs);
  assert.equal(u.used, 2);
  assert.equal(u.over, true);
  assert.equal(licenceUse({ name: 'Acrobat', seats: 5 }, objs).free, 4);
});

test('the server refuses contracts and licences that are not right, and keeps those that are', async () => {
  const good = { id: 'c1', name: 'Support', kind: 'support', start: '2026-01-01', end: '2026-12-31', renew: 12, notice: 3, cost: 1200.5, per: 'year', devices: ['o1'] };
  assert.equal(contractProblem(good), null);
  assert.match(contractProblem({ ...good, kind: 'gift' }), /kind is one of/);
  assert.match(contractProblem({ ...good, end: '2025-12-31' }), /ends before it starts/);
  assert.match(contractProblem({ ...good, cost: -1 }), /cost/);
  assert.match(contractProblem({ ...good, end: '31.12.2026' }), /end is a date/);
  assert.match(licenceProblem({ id: 'l1', name: 'Office', seats: 2.5 }), /whole number/);
  assert.match(listProblem([good, good], contractProblem, 'contracts'), /twice/);
  const base = { objs: [{ id: 'o1', type: 'pc', name: 'PC-1', status: 'active', price: 1290 }], rels: [], users: [], locs: [], types: {}, history: {} };
  checkState({ ...base, contracts: [good], licences: [{ id: 'l1', name: 'Office', seats: 10 }], currency: 'EUR' });
  assert.throws(() => checkState({ ...base, objs: [{ ...base.objs[0], price: 'a lot' }] }), /price is a number/);
  assert.throws(() => checkState({ ...base, currency: 'Swiss francs' }), /currency/);

  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const put = async value => { const base = (await srv.call('GET', '/api/state', { cookie: a.cookie })).json.revs['setting|contracts'] || 0;
      return srv.call('POST', '/api/changes', { cookie: a.cookie, body: { puts: [{ kind: 'setting', id: 'contracts', value, base }], dels: [] } }); };
    assert.equal((await put([good])).status, 200);
    assert.equal((await put([{ ...good, kind: 'gift' }])).status, 400);
    const s = (await srv.call('GET', '/api/state', { cookie: a.cookie })).json;
    assert.deepEqual(s.contracts, [good], 'saved and given back as it was');
  } finally { await srv.close(); }
});
