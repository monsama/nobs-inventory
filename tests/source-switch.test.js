/* The switches of Active Directory and Entra & Intune (useAd, useGraph): off, Sync now is refused and the scheduler skips
   the source, its devices are left as they are; sign-in with the directory keeps working. On by default. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ldap from 'ldapjs';
import { startServer, signIn, tempDataDir } from './helpers.js';
import { checkState, loadState, saveState } from '../server/state.js';
import { healthReport } from '../server/health.js';

/* A directory with one admin, who signs in with it. */
function startDirectory() {
  const dir = ldap.createServer();
  const anna = { sAMAccountName: ['anna'], displayName: ['Anna Test'], memberOf: ['CN=IT-Inventory,OU=Groups,DC=test', 'CN=Inventory-Users,OU=Groups,DC=test'], objectClass: ['person'] };
  dir.bind('dc=test', (req, res, next) => {
    const dn = req.dn.toString().toLowerCase();
    const ok = (dn === 'cn=anna,ou=people,dc=test' && req.credentials === 'annas-secret') || (dn === 'cn=svc,ou=service,dc=test' && req.credentials === 'svc-secret');
    if (!ok) return next(new ldap.InvalidCredentialsError());
    res.end(); return next();
  });
  dir.search('dc=test', (req, res, next) => {
    dir.searches = (dir.searches || 0) + 1;
    if (req.filter.matches(anna)) res.send({ dn: 'cn=anna,ou=people,dc=test', attributes: anna });
    res.end(); return next();
  });
  return new Promise(resolve => dir.listen(0, '127.0.0.1', () => resolve(dir)));
}
const cfg = url => ({ url, allowPlain: true, bindTemplate: 'cn={login},ou=people,dc=test', searchBase: 'dc=test', loginAttr: 'sAMAccountName',
  adminGroup: 'IT-Inventory', group: 'Inventory-Users', serviceDn: 'cn=svc,ou=service,dc=test', servicePassword: 'svc-secret', userFilter: '(objectClass=person)' });

test('on by default, and only on or off', () => {
  const s = { objs: [], rels: [], users: [], types: {}, history: {}, locs: [] };
  assert.doesNotThrow(() => checkState({ ...s, useAd: false, useGraph: true }));
  assert.throws(() => checkState({ ...s, useAd: 'no' }), /useAd is on or off/);
  assert.throws(() => checkState({ ...s, useGraph: 0 }), /useGraph is on or off/);
});

test('AD off: Sync now is refused and not recorded, the devices stay; sign-in with AD keeps working', async () => {
  const dir = await startDirectory();
  const srv = await startServer({ ldap: cfg(`ldap://127.0.0.1:${dir.address().port}`) });
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    const before = loadState(srv.db);
    saveState(srv.db, { ...before, useAd: false, objs: [{ id: 'o1', code: 'INV-0001', type: 'pc', name: 'PC-1', status: 'active', feed: null, inAd: true, ad: { os: 'Windows 11' } }] });
    const r = await srv.call('POST', '/api/ldap/sync', { cookie: admin.cookie });
    assert.equal(r.status, 403);
    assert.match(r.json.error, /turned off[\s\S]*Sign-in with AD accounts is not affected/);
    assert.equal((loadState(srv.db).syncRuns || {}).ldap, undefined, 'not recorded as a run');
    assert.equal(dir.searches || 0, 0, 'the directory was not read');
    assert.deepEqual(loadState(srv.db).objs[0].ad, { os: 'Windows 11' }, 'the data already here stays');
    const anna = await signIn(srv, 'anna', 'annas-secret');
    assert.equal(anna.status, 200, 'sign-in with the directory does not depend on the switch');
    assert.equal(anna.user.role, 'admin');
    // on again: the sync runs
    saveState(srv.db, { ...loadState(srv.db), useAd: true });
    const on = await srv.call('POST', '/api/ldap/sync', { cookie: admin.cookie });
    assert.equal(on.status, 200, JSON.stringify(on.json));
    assert.equal(loadState(srv.db).syncRuns.ldap.ok, true);
  } finally { await srv.close(); await new Promise(r => dir.close(r)); }
});

test('Entra & Intune off: Sync now is refused before Graph is asked', async () => {
  let asked = 0;
  const srv = await startServer({ graphConfig: () => { asked++; return null; } });
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    saveState(srv.db, { ...loadState(srv.db), useGraph: false });
    const n = asked;
    const r = await srv.call('POST', '/api/graph/sync', { cookie: admin.cookie });
    assert.equal(r.status, 403);
    assert.match(r.json.error, /Entra & Intune sync is turned off[\s\S]*Sign-in with Microsoft is not affected/);
    assert.equal(asked, n, 'the connection was not even read');
    assert.equal((loadState(srv.db).syncRuns || {}).graph, undefined);
    // the page gets the switch back as saved
    const page = await srv.call('GET', '/api/state', { cookie: admin.cookie });
    assert.equal(page.json.settings ? page.json.settings.useGraph : page.json.useGraph, false);
  } finally { await srv.close(); }
});

test('the scheduler skips a source switched off, and runs it again when on', async t => {
  const { startScheduler } = await import('../server/index.js');
  const srv = await startServer({ dir: tempDataDir() });
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: new Date(2026, 9, 26, 5, 59, 50) });
  const runs = [];
  saveState(srv.db, { ...loadState(srv.db), useAd: false, useGraph: false, syncSchedule: { graph: { every: 24, at: '06:00' }, ldap: { every: 24, at: '06:00' } } });
  const timer = startScheduler(srv.db, {}, { ldapConfig: () => { runs.push('ldap'); return null; }, graphConfig: () => { runs.push('graph'); return null; } }, () => {});
  try {
    t.mock.timers.tick(30_000); await new Promise(r => setImmediate(r));
    assert.deepEqual(runs, [], 'both off at 06:00');
    saveState(srv.db, { ...loadState(srv.db), useAd: true, useGraph: true, syncSchedule: { graph: { every: 24, at: '06:01' }, ldap: { every: 24, at: '06:01' } } });
    t.mock.timers.tick(30_000); await new Promise(r => setImmediate(r));
    t.mock.timers.tick(30_000); await new Promise(r => setImmediate(r));
    assert.deepEqual(runs, ['ldap', 'graph'], 'on again at 06:01');
  } finally { clearInterval(timer); t.mock.timers.reset(); await srv.close(); }
});

test('Health says Off for a source switched off, Not set up for one without a connection', async () => {
  const srv = await startServer({});
  try {
    const s = { ...loadState(srv.db), useAd: false, useGraph: true };
    const h = healthReport(srv.db, s, { on: { lansweeper: false, ldap: true, graph: false }, diskSpace: () => ({ free: 2 ** 40, total: 2 ** 41 }) });
    const row = name => h.checks.find(c => c.area === 'Syncs' && c.name === name);
    assert.deepEqual([row('Active Directory').state, row('Active Directory').value], ['off', 'Off']);
    assert.match(row('Active Directory').note, /Sign-in is not affected/);
    assert.deepEqual([row('Entra & Intune').state, row('Entra & Intune').value], ['off', 'Not set up']);
  } finally { await srv.close(); }
});
