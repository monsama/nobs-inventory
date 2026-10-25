import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ldap from 'ldapjs';
import { startServer, signIn } from './helpers.js';
import { syncLdapUsers } from '../server/ldap-sync.js';
import { ldapListUsers, ldapLogin } from '../server/ldap.js';
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
  url, allowPlain: true, bindTemplate: 'cn={login},ou=people,dc=test', searchBase: 'dc=test', loginAttr: 'sAMAccountName',
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
    assert.equal((await signIn(srv, 'ben', 'bens-secret')).status, 401, 'a user outside the inventory group is refused, with the same answer as a wrong password');
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

test('a plain ldap:// address is refused unless it is allowed, so passwords are not sent unencrypted', async () => {
  await assert.rejects(ldapListUsers({ ...cfg('ldap://127.0.0.1:1'), allowPlain: false }), /unencrypted/);
});

/* A stand-in for the directory client that evaluates the filters the server sends, including the nested-group rule
   ("memberOf in chain"), so the queries and how their answers are used are both tested. */
const DIR = { group: 'CN=Inventory-Users,OU=Groups,DC=test', admin: 'CN=IT-Inventory,OU=Groups,DC=test', nested: 'CN=Field-Team,OU=Groups,DC=test', other: 'CN=Canteen,OU=Groups,DC=test' };
const fakePeople = [
  { login: 'anna', pw: 'pw-anna', groups: [DIR.admin], chain: [DIR.admin, DIR.group] },   /* admin group, which is inside the sign-in group */
  { login: 'ben', pw: 'pw-ben', groups: [DIR.nested], chain: [DIR.nested, DIR.group] },   /* in a group nested in the sign-in group */
  { login: 'carl', pw: 'pw-carl', groups: [DIR.other], chain: [DIR.other] },
];
const matchesFilter = (filter, p) => {
  const login = /\(sAMAccountName=([^()]*)\)/.exec(filter)?.[1];
  if (login !== undefined && p.login !== login.toLowerCase()) return false;
  const g = /memberOf:1\.2\.840\.113556\.1\.4\.1941:=([^()]*)\)/.exec(filter)?.[1];
  if (g !== undefined && !p.chain.some(x => x.toLowerCase() === g.toLowerCase())) return false;
  return true;
};
const fakeDirectory = opts => {
  const dn = p => `cn=${p.login},ou=people,dc=test`;
  return {
    on: () => {},
    unbind: cb => cb && cb(),
    bind: (name, pw, cb) => {
      const p = fakePeople.find(x => dn(x) === name);
      const ok = p ? p.pw === pw : name === 'cn=svc,ou=service,dc=test' && pw === 'svc-secret';
      setImmediate(() => cb(ok ? null : new ldap.InvalidCredentialsError()));
    },
    search: (base, o, cb) => {
      const res = new EventEmitter();
      cb(null, res);
      setImmediate(() => {
        for (const p of fakePeople.filter(x => matchesFilter(o.filter, x))) {
          res.emit('searchEntry', { pojo: { objectName: dn(p), attributes: [
            { type: 'sAMAccountName', values: [p.login] }, { type: 'displayName', values: [p.login.toUpperCase()] },
            { type: 'memberOf', values: p.groups }] } });
        }
        res.emit('end');
      });
    },
  };
};
const nestedCfg = { ...cfg('ldaps://fake'), group: DIR.group, adminGroup: DIR.admin, createClient: fakeDirectory };

test('nested groups: a member of a group inside the sign-in group may sign in; an admin is recognised the same way', async () => {
  assert.equal((await ldapLogin(nestedCfg, 'ben', 'pw-ben')).allowed, true, 'the nested member was refused');
  assert.equal((await ldapLogin(nestedCfg, 'ben', 'pw-ben')).admin, false);
  assert.equal((await ldapLogin(nestedCfg, 'anna', 'pw-anna')).admin, true, 'the admin was not recognised');
  assert.equal((await ldapLogin(nestedCfg, 'carl', 'pw-carl')).allowed, false, 'someone outside the group was let in');
  assert.equal(await ldapLogin(nestedCfg, 'ben', 'wrong'), null, 'a wrong password was accepted');
});

test('nested groups: the sync covers the members of the sign-in group, with admins flagged', async () => {
  const people = await ldapListUsers(nestedCfg);
  assert.deepEqual(people.map(p => [p.login, p.admin]).sort(), [['anna', true], ['ben', false]]);
});

test('an unreachable directory: the directory sign-in is refused with an answer, local accounts still sign in, and the sync reports the failure', async () => {
  const srv = await startServer({ ldap: cfg('ldap://127.0.0.1:1') });
  try {
    const admin = await signIn(srv, 'admin', 'adminpass123');
    assert.equal(admin.status, 200, 'the local administrator cannot sign in while the directory is down');
    const r = await srv.call('POST', '/api/login', { body: { login: 'anna', password: 'whatever-1' } });
    assert.equal(r.status, 503, 'a directory sign-in while the directory is down did not say the directory is unavailable: ' + r.status);
    assert.match(r.json.error, /directory/i, 'the answer does not name the directory');
    assert.ok(!/stack|ECONNREFUSED|at /.test(r.text || ''), 'the answer shows internal details');
    const sync = await srv.call('POST', '/api/ldap/sync', { body: {}, cookie: admin.cookie });
    assert.ok(sync.status >= 400, 'a sync against a down directory reported success');
    assert.ok(!/stack|at /.test(sync.text || ''), 'the sync answer shows internal details');
  } finally { await srv.close(); }
});

test('a directory user with the same login as a local account cannot sign in as it, nor change it', async () => {
  /* The directory has an "admin" in the sign-in group but not the admin group; the local admin is the only admin. */
  const people = { 'cn=admin,ou=people,dc=test': person('admin', 'Directory Admin', 'IT', ['Inventory-Users'], 'directory-pw') };
  const dir = await startDirectory(people);
  const srv = await startServer({ ldap: cfg(`ldap://127.0.0.1:${dir.address().port}`) });
  try {
    assert.equal((await signIn(srv, 'admin', 'directory-pw')).status, 401, 'the directory password opened the local account');
    const local = loadState(srv.db).users.find(u => u.login === 'admin');
    assert.equal(local.source, 'manual', 'the local account was turned into a directory account');
    assert.equal(local.role, 'admin', 'the local admin was demoted');
    assert.equal((await signIn(srv, 'admin', 'adminpass123')).status, 200, 'the local password still works');
  } finally {
    await srv.close(); await new Promise(r => dir.close(r));
  }
});

test('an empty sign-in name is the login at the domain of the search base; one set by hand is kept', async () => {
  const { defaultBindTemplate, ldapConfigOf } = await import('../server/ldap-config.js');
  assert.equal(defaultBindTemplate('OU=Users,DC=example,DC=ch'), '{login}@example.ch');
  assert.equal(defaultBindTemplate('ou=people, dc=corp , dc=example,dc=com'), '{login}@corp.example.com');
  assert.equal(defaultBindTemplate('OU=Users'), '{login}', 'without a domain the login is used as it is');
  const srv = await startServer();
  try {
    saveState(srv.db, { ...loadState(srv.db), ldap: { url: 'ldaps://dc01.example.ch:636', searchBase: 'OU=Users,DC=example,DC=ch' } });
    let c = ldapConfigOf(srv.db, {});
    assert.equal(c.bindTemplate, '{login}@example.ch');
    assert.equal(c.loginAttr, 'sAMAccountName');
    saveState(srv.db, { ...loadState(srv.db), ldap: { url: 'ldaps://dc01.example.ch:636', searchBase: 'OU=Users,DC=example,DC=ch', bindTemplate: 'EXAMPLE\\{login}' } });
    c = ldapConfigOf(srv.db, {});
    assert.equal(c.bindTemplate, 'EXAMPLE\\{login}');
  } finally { await srv.close(); }
});

test('a failed directory test says what to fix, in the words of the settings', async () => {
  const { ldapHint } = await import('../server/ldap.js');
  assert.match(ldapHint('connect ECONNREFUSED 10.0.0.5:636'), /cannot be reached/);
  assert.match(ldapHint('self-signed certificate in certificate chain'), /certificate is not trusted/);
  assert.match(ldapHint('80090308: LdapErr: DSID-0C09044E, comment: AcceptSecurityContext error, data 52e, v4563'), /sign-in name or password is wrong/);
  assert.match(ldapHint('AcceptSecurityContext error, data 775, v4563'), /locked out/);
  assert.match(ldapHint('0000208D: NameErr: DSID-03100241, problem 2001 (NO_OBJECT)  No Such Object'), /search base does not exist/);
  assert.equal(ldapHint('something else'), null);
});
