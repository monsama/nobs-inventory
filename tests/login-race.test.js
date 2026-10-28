/* Directory sign-ins that overlap: two first sign-ins of one login make one account, and an admin's deactivation made
   while a sign-in waits on the directory holds. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ldap from 'ldapjs';
import { startServer, signIn } from './helpers.js';
import { loadState } from '../server/state.js';

const people = { 'cn=cla,ou=people,dc=test': { pw: 'clas-secret', attrs: { sAMAccountName: ['cla'], displayName: ['Cla'], memberOf: ['CN=Inventory-Users,OU=Groups,DC=test'], objectClass: ['person'] } } };
async function directory(){
  const dir = ldap.createServer();
  /* A slow bind, so the sign-ins overlap. */
  dir.bind('dc=test', (req, res, next) => { const p = people[req.dn.toString().toLowerCase()]; if (!p || p.pw !== req.credentials) return next(new ldap.InvalidCredentialsError()); setTimeout(() => { res.end(); next(); }, 150); });
  dir.search('dc=test', (req, res, next) => { for (const [dn, p] of Object.entries(people)) if (req.filter.matches(p.attrs)) res.send({ dn, attributes: p.attrs }); res.end(); next(); });
  await new Promise(r => dir.listen(0, '127.0.0.1', r));
  return { dir, cfg: { url: `ldap://127.0.0.1:${dir.address().port}`, allowPlain: true, bindTemplate: 'cn={login},ou=people,dc=test', searchBase: 'dc=test', loginAttr: 'sAMAccountName', group: 'Inventory-Users', adminGroup: 'IT', serviceDn: 'x', servicePassword: 'y' } };
}

test('two first sign-ins of one directory login at once make one account, and saves keep working', async () => {
  const { dir, cfg } = await directory();
  const srv = await startServer({ ldap: cfg });
  try {
    const [a, b] = await Promise.all([signIn(srv, 'cla', 'clas-secret'), signIn(srv, 'cla', 'clas-secret')]);
    assert.deepEqual([a.status, b.status], [403, 403], 'new from the directory: no access yet, but known');
    assert.equal(loadState(srv.db).users.filter(u => u.login === 'cla').length, 1, 'one account for the login');
    const adm = await signIn(srv, 'admin', 'adminpass123'), st = loadState(srv.db);
    const r = await srv.call('POST', '/api/changes', { cookie: adm.cookie, body: { puts: [{ kind: 'setting', id: 'locs', value: ['HQ'], base: st.revs['setting|locs'] ?? 0 }], dels: [] } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  } finally { await srv.close(); dir.close(); }
});

test('an account deactivated while its sign-in waits on the directory stays deactivated, and the sign-in fails', async () => {
  const { dir, cfg } = await directory();
  const srv = await startServer({ ldap: cfg });
  try {
    await signIn(srv, 'cla', 'clas-secret');
    const adm = await signIn(srv, 'admin', 'adminpass123');
    const id = loadState(srv.db).users.find(u => u.login === 'cla').id;
    const pending = signIn(srv, 'cla', 'clas-secret');
    await new Promise(r => setTimeout(r, 60));
    const s = loadState(srv.db), u = s.users.find(x => x.id === id);
    const r = await srv.call('POST', '/api/changes', { cookie: adm.cookie, body: { puts: [{ kind: 'user', id, value: { ...u, active: false }, base: s.revs['user|' + id] }], dels: [] } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const res = await pending;
    assert.equal(res.status, 401, 'the sign-in is refused');
    assert.equal(loadState(srv.db).users.find(x => x.id === id).active, false, 'still deactivated');
  } finally { await srv.close(); dir.close(); }
});
