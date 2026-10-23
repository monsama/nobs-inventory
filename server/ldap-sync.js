import { takeBackup } from './backup.js';
import { HttpError } from './errors.js';
import { loadState, saveState } from './state.js';
import { audit } from './db.js';
import { ldapListUsers } from './ldap.js';

/* Brings the users in line with the directory. Users are added and updated from it, their role follows the
   admin group, and users who are gone from it are deactivated, never deleted, so their devices keep their owner. */
export async function syncLdapUsers(db, config) {
  const people = await ldapListUsers(config);   /* the members of the sign-in group, with admin set for the admin group */
  const s = loadState(db);
  const wanted = new Set(people.map(p => p.login.toLowerCase()));
  const counts = { created: 0, updated: 0, deactivated: 0, people: people.length };
  for (const p of people) {
    const role = p.admin ? 'admin' : 'viewer';
    const u = s.users.find(x => x.login && x.login.toLowerCase() === p.login.toLowerCase());
    if (!u) {
      s.users.push({ id: 'ldap-' + p.login.toLowerCase(), login: p.login, name: p.name, dept: p.dept, groups: p.groups, source: 'ldap', active: true, role });
      counts.created++;
    } else if (u.source === 'ldap') {
      Object.assign(u, { name: p.name, dept: p.dept, groups: p.groups, active: true, role });
      counts.updated++;
    }
    // A local account with the same login is left alone; it is not taken over by the directory.
  }
  for (const u of s.users) {
    if (u.source === 'ldap' && u.active !== false && !wanted.has((u.login || '').toLowerCase())) { u.active = false; counts.deactivated++; }
  }
  if (!s.users.some(u => u.role === 'admin' && u.active !== false)) {
    throw new HttpError(400, 'The sync would leave no active admin, so nothing was changed. Check the admin group.');
  }
  /* A sync that changes no user saves nothing and takes no backup; one that changes users is backed up first. */
  if (counts.created || counts.updated || counts.deactivated) { takeBackup(db, 'before an LDAP sync'); saveState(db, s); }
  audit(db, null, 'ldap sync: ' + JSON.stringify(counts));
  return counts;
}
