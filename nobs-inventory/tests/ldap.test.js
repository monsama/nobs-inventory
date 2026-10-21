import { test } from 'node:test';
import assert from 'node:assert/strict';
import ldap from 'ldapjs';
import { startServer, signIn } from './helpers.js';
import { syncLdapUsers } from '../server/ldap-sync.js';
import { loadState, saveState } from '../server/state.js';

/* A directory stand-in. It checks passwords, applies the requested filter and returns every attribute. */
function startDirectory(people) {
  const dir = ldap.createServer();
  const accounts = { 'cn=svc,ou=service,dc=test': 'svc-secret' };
  dir.bind('dc=test', (req, res, next) => {
    const dn = req.dn.toString().toLowerCase();
    const p = people[dn];
    const ok = (p && p.pw === req.credentials) || accounts[dn] === req.credentials;
    if (!ok) return next(new ldap.InvalidCredentialsError());
    res.end(); return next();
  });
  dir.search('dc=test', (req, res, next) => {
    for (const [dn, p] of Object.entries(people)) if (req.filter.matches(p.attrs)) res.send({ dn, attributes: p.attrs });
    res.end(); return next();
  });
  return new Promise(resolve => dir.listen(0, '127.0.0.1', () => resolve(dir)));
}

const person = (login, name, dept, groups, pw) => ({
  pw,
  attrs: { sAMAccountName: [login], displayName: [name], department: [dept], memberOf: groups.map(g => `CN=${g},OU=Groups,DC=test`), mail: [login + '@test.ch'], objectClass: ['person'] }
});

const cfg = url => ({
  url, bindTemplate: 'cn={login},ou=people,dc=test', searchBase: 'dc=test', loginAttr: 'sAMAccountName',
  adminGroup: 'IT-Inventory', group: 'Inventory-Users', serviceDn: 'cn=svc,ou=service,dc=test', servicePassword: 'svc-secret', userFilter: '(objectClass=person)'
});

test('directory sign-in: password checked by the directory, role from the admin group, group required', async () => {
  const people = {
    'cn=anna,ou=people,dc=test': person('anna', 'Anna Test', 'IT', ['IT-Inventory', 'Inventory-Users'], 'annas-secret'),
    'cn=ben,ou=people,dc=test': person('ben', 'Ben Test', 'Sales', ['Sales'], 'bens-secret'),
    'cn=cla,ou=people,dc=test': person('cla', 'Cla Test', 'Sales', ['Inventory-Users'], 'clas-secret')
  };
  const dir = await startDirectory(people);
  const srv = await startServer({ ldap: cfg(`ldap://127.0.0.1:${dir.address().port}`) });
  try {
    assert.equal((await signIn(srv, 'anna', 'wrong')).status, 401, 'a wrong password is refused');
    assert.equal((await signIn(srv, 'anna', '')).status, 401, 'an empty password is refused');
    assert.equal((await signIn(srv, 'ben', 'bens-secret')).status, 403, 'a user outside the inventory group is refused');
    const anna = await signIn(srv, 'anna', 'annas-secret');
    assert.equal(anna.status, 200);
    assert.equal(anna.user.role, 'admin');
    assert.equal(anna.user.name, 'Anna Test');
    const cla = await signIn(srv, 'cla', 'clas-secret');
    assert.equal(cla.user.role, 'viewer');
    assert.equal(srv.db.prepare("SELECT COUNT(*) AS n FROM credentials WHERE user_id = 'ldap-anna'").get().n, 0, 'no password is stored');
  } finally {
    await srv.close(); await new Promise(r => dir.close(r));
  }
});

test('directory sync: adds people, follows role changes, deactivates people who left, keeps their devices', async () => {
  const people = {
    'cn=anna,ou=people,dc=test': person('anna', 'Anna Test', 'IT', ['IT-Inventory', 'Inventory-Users'], 'x'),
    'cn=cla,ou=people,dc=test': person('cla', 'Cla Test', 'Sales', ['Inventory-Users'], 'x'),
    'cn=ben,ou=people,dc=test': person('ben', 'Ben Test', 'Sales', ['Inventory-Users'], 'x')
  };
  const dir = await startDirectory(people);
  const srv = await startServer({ ldap: cfg(`ldap://127.0.0.1:${dir.address().port}`) });
  try {
    saveState(srv.db, { objs: [{ id: 'o1', code: 'INV-0001', type: 'pc', name: 'PC-BEN', user: '', uid: 'ldap-ben', ovr: {}, feed: null }],
      rels: [], users: [{ id: 'u-admin', login: 'admin', name: 'Administrator', role: 'admin', active: true, source: 'manual' }],
      types: {}, history: {}, locs: [], policy: {}, feedOn: true, feedSync: true, ldap: null, mapPos: {}, seq: 101, codeN: 1, rseq: 0 });
    const first = await syncLdapUsers(srv.db, cfg(`ldap://127.0.0.1:${dir.address().port}`));
    assert.equal(first.created, 3);
    let st = loadState(srv.db);
    assert.equal(st.users.find(u => u.login === 'anna').role, 'admin');
    assert.equal(st.users.find(u => u.login === 'cla').role, 'viewer');

    // Ben leaves the directory; Anna moves out of the admin group.
    delete people['cn=ben,ou=people,dc=test'];
    people['cn=anna,ou=people,dc=test'].attrs.memberOf = ['CN=Inventory-Users,OU=Groups,DC=test'];
    people['cn=cla,ou=people,dc=test'].attrs.memberOf = ['CN=IT-Inventory,OU=Groups,DC=test', 'CN=Inventory-Users,OU=Groups,DC=test'];
    const second = await syncLdapUsers(srv.db, cfg(`ldap://127.0.0.1:${dir.address().port}`));
    assert.equal(second.deactivated, 1);
    st = loadState(srv.db);
    assert.equal(st.users.find(u => u.login === 'ben').active, false, 'a user who left is deactivated, not deleted');
    assert.equal(st.objs[0].uid, 'ldap-ben', 'their device still points at them');
    assert.equal(st.users.find(u => u.login === 'anna').role, 'viewer');
    assert.equal(st.users.find(u => u.login === 'cla').role, 'admin');
  } finally {
    await srv.close(); await new Promise(r => dir.close(r));
  }
});

test('directory sync refuses a change that would leave no active admin, and changes nothing', async () => {
  const people = { 'cn=anna,ou=people,dc=test': person('anna', 'Anna Test', 'IT', ['Inventory-Users'], 'x') };
  const dir = await startDirectory(people);
  const config = cfg(`ldap://127.0.0.1:${dir.address().port}`);
  const srv = await startServer({ ldap: config });
  try {
    saveState(srv.db, { objs: [], rels: [], users: [{ id: 'ldap-anna', login: 'anna', name: 'Anna', role: 'admin', active: true, source: 'ldap' }],
      types: {}, history: {}, locs: [], policy: {}, feedOn: true, feedSync: true, ldap: null, mapPos: {}, seq: 100, codeN: 0, rseq: 0 });
    await assert.rejects(syncLdapUsers(srv.db, config), /no active admin/);
    assert.equal(loadState(srv.db).users[0].role, 'admin');
  } finally {
    await srv.close(); await new Promise(r => dir.close(r));
  }
});
