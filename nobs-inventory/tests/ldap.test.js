import { test } from 'node:test';
import assert from 'node:assert/strict';
import ldap from 'ldapjs';
import { startServer, signIn } from './helpers.js';

/* A small directory for the tests: one account in the admin group, one outside it. The test server only matches
   lowercase attribute names, so the names here are lowercase; the page reads them whatever the case. */
const people = {
  'cn=anna,ou=people,dc=test': { pw: 'annas-secret', attrs: { sAMAccountName: ['anna'], displayname: ['Anna Test'], department: ['IT'], memberof: ['CN=IT-Inventory,OU=Groups,DC=test'] } },
  'cn=ben,ou=people,dc=test': { pw: 'bens-secret', attrs: { sAMAccountName: ['ben'], displayname: ['Ben Test'], department: ['Sales'], memberof: ['CN=Sales,OU=Groups,DC=test'] } }
};

async function startDirectory() {
  const dir = ldap.createServer();
  dir.bind('dc=test', (req, res, next) => {
    const p = people[req.dn.toString().toLowerCase()];
    if (!p || !req.credentials || p.pw !== req.credentials) return next(new ldap.InvalidCredentialsError());
    res.end(); return next();
  });
  dir.search('dc=test', (req, res, next) => {
    for (const [dn, p] of Object.entries(people)) {
      if (req.filter.matches(p.attrs)) res.send({ dn, attributes: p.attrs });
    }
    res.end(); return next();
  });
  await new Promise(resolve => dir.listen(0, '127.0.0.1', resolve));
  return dir;
}

test('LDAP sign-in: the directory checks the password, the group sets the role, the user is kept', async () => {
  const dir = await startDirectory();
  const url = `ldap://127.0.0.1:${dir.address().port}`;
  const srv = await startServer({ ldap: { url, bindTemplate: 'cn={login},ou=people,dc=test', searchBase: 'dc=test', loginAttr: 'sAMAccountName', adminGroup: 'IT-Inventory' } });
  try {
    assert.equal((await signIn(srv, 'anna', 'wrong')).status, 401, 'a wrong password is refused');
    assert.equal((await signIn(srv, 'anna', '')).status, 401, 'an empty password is refused');
    const anna = await signIn(srv, 'anna', 'annas-secret');
    assert.equal(anna.status, 200);
    assert.equal(anna.user.role, 'admin', 'the IT-Inventory group makes an admin');
    assert.equal(anna.user.name, 'Anna Test');
    const ben = await signIn(srv, 'ben', 'bens-secret');
    assert.equal(ben.user.role, 'viewer', 'other groups are viewers');
    const saved = srv.db.prepare("SELECT data FROM docs WHERE kind = 'user' AND id = 'ldap-anna'").get();
    assert.ok(saved, 'the directory user is stored');
    assert.equal(JSON.parse(saved.data).source, 'ldap');
    assert.equal(srv.db.prepare("SELECT COUNT(*) AS n FROM credentials WHERE user_id = 'ldap-anna'").get().n, 0, 'no password is stored');
  } finally {
    await srv.close(); await new Promise(r => dir.close(r));
  }
});
