import { autoBackup } from './backup.js';
import { HttpError } from './errors.js';
import { loadState, saveState } from './state.js';
import { audit } from './db.js';
import { ldapListComputers, ldapListUsers } from './ldap.js';

/* Brings the users in line with the directory. Users are added and updated from it, their role follows the
   admin group, and users who are gone from it are deactivated, never deleted, so their devices keep their owner. */
export async function syncLdapUsers(db, config) {
  const people = await ldapListUsers(config);   /* the members of the sign-in group, with admin set for the admin group */
  /* The computers' groups: a directory that will not list computers does not stop the user sync. Everything is read from
     the directory before the inventory is loaded, so a save made on the page meanwhile is not overwritten. */
  let computers = null, computerError = null;
  if (config.computerGroups !== 'off') { try { computers = await ldapListComputers(config); } catch (e) { computerError = e.message; } }
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
      const next = { name: p.name, dept: p.dept, groups: p.groups, role };
      const changed = u.syncOff || Object.keys(next).some(k => JSON.stringify(u[k]) !== JSON.stringify(next[k]));
      Object.assign(u, next);
      /* Back in the group: active again, but only when the sync was the one that switched the account off, never an admin. */
      if (u.syncOff) { u.active = true; delete u.syncOff; }
      if (changed) counts.updated++;
    }
    // A local account with the same login is left alone; it is not taken over by the directory.
  }
  for (const u of s.users) {
    if (u.source === 'ldap' && u.active !== false && !wanted.has((u.login || '').toLowerCase())) { u.active = false; u.syncOff = true; counts.deactivated++; }
  }
  /* No computer account at all is most likely a wrong search base: the groups on the devices are left as they are. */
  if (computerError) counts.computerError = computerError;
  else if (computers && computers.length) counts.computers = applyComputerGroups(s, computers);
  else if (computers) counts.computerError = 'No computer accounts were found in the computers search base.';
  if (!s.users.some(u => u.role === 'admin' && u.active !== false)) {
    throw new HttpError(400, 'The sync would leave no active admin, so nothing was changed. Check the admin group.');
  }
  /* A sync that changes no user saves nothing and takes no backup; one that changes users is backed up first. */
  if (counts.created || counts.updated || counts.deactivated || counts.computers) { autoBackup(db, 'before an LDAP sync'); saveState(db, s); }
  audit(db, null, 'ldap sync: ' + JSON.stringify(counts));
  return counts;
}

/* Each device gets the groups of the computer account of the same name (its name, or the first part of its DNS name) as
   adGroups, and is marked as being in Active Directory (inAd). A device with no account, or whose account is in no
   group, has no groups. Returns how many devices changed. */
export function applyComputerGroups(s, computers) {
  const byName = new Map();
  for (const c of computers) {
    for (const k of [c.name, c.dns, String(c.dns || '').split('.')[0]]) if (k && !byName.has(k.toLowerCase())) byName.set(k.toLowerCase(), c);
  }
  let n = 0;
  for (const o of s.objs) {
    if (o.status === 'retired' || !o.name) continue;
    const key = String(o.name).toLowerCase(), c = byName.get(key) || byName.get(key.split('.')[0]);
    const groups = c && c.groups.length ? c.groups : null;
    /* Whether the device has a computer account in Active Directory: with Graph, this tells an AD-only device apart. */
    if (JSON.stringify(groups) === JSON.stringify(o.adGroups || null) && !!c === !!o.inAd) continue;
    if (groups) o.adGroups = groups; else delete o.adGroups;
    if (c) o.inAd = true; else delete o.inAd;
    n++;
  }
  return n;
}
