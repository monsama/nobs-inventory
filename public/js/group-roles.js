/* Viewers from groups (Settings → Users): a person in a group of the directory (AD, by name or distinguished name) or of
   Entra (by the group's object ID, in the sign-in token) gets the role and the sites of the first rule that matches,
   at each directory sync and sign-in. Admin is never given this way: that is the directory's admin group. A person a
   rule gave a role loses it (No access) once no rule matches any more; a role given by hand, without a rule, stays.
   Shared by the page and the server. No DOM. */
/* A rule is a group and, optionally, sites: its members may sign in and look (viewers). Rules of older versions also
   named a role (viewer, before that editor); it is dropped, as it can only be viewer. */
const low = v => String(v || '').trim().toLowerCase();
/* A group as the sources write it: CN=IT-Bern,OU=Groups,DC=corp → it-bern; an object ID stays as it is. */
const nameOf = g => { const t = low(g); const m = /^cn=([^,]+)/.exec(t); return m ? m[1] : t; };
/* A rule written as a distinguished name matches only that group (a group of the same name in another OU is another
   group); a rule by name matches the group's name, whatever its OU; an Entra ID matches itself. */
export const groupMatches = (rule, groups) => {
  const want = low(rule.group);
  if (!want) return false;
  if (want.includes('=')) return (groups || []).some(g => low(g) === want);
  return (groups || []).some(g => low(g) === want || nameOf(g) === want);
};
/* Entra groups the last Microsoft sign-in named count this long; after that (the person may have left the group) only
   a new Microsoft sign-in brings them back. */
export const ENTRA_GROUPS_FRESH_MS = 12 * 3600e3;
export const freshEntraGroups = (u, now = Date.now()) => (u && Array.isArray(u.entraGroups) && u.entraGroupsAt && now - Date.parse(u.entraGroupsAt) < ENTRA_GROUPS_FRESH_MS ? u.entraGroups : []);
/* The groups a person's role is worked out from: the directory's (names and DNs) and fresh Entra groups. */
export const groupsOf = (u, dirGroups = null, dirDns = null) => [...(dirGroups || u.groups || []), ...(dirDns || u.groupDns || []), ...freshEntraGroups(u)];
export function roleFromGroups(rules, groups) {
  const r = (Array.isArray(rules) ? rules : []).find(x => x && (x.role === undefined || x.role === 'viewer' || x.role === 'editor') && groupMatches(x, groups));
  return r ? { role: 'viewer', sites: Array.isArray(r.sites) ? r.sites.filter(Boolean) : [], group: r.group } : null;
}
/* Gives u the role and sites its groups say; true when that changed u. Admins are left as they are. */
export function applyGroupRole(u, rules, groups) {
  if (!u || u.role === 'admin') return false;
  if (!Array.isArray(rules)) rules = [];   /* no rules any more: the roles they gave go too */
  const before = JSON.stringify([u.role, u.sites, u.own, u.roleBy]);
  const r = roleFromGroups(rules, groups);
  if (r) {
    u.role = r.role; u.roleBy = r.group; delete u.own;
    if (r.sites.length) u.sites = r.sites; else delete u.sites;
  } else if (u.roleBy) {
    u.role = 'none'; delete u.roleBy; delete u.sites;
  }
  return JSON.stringify([u.role, u.sites, u.own, u.roleBy]) !== before;
}
/* What is wrong with a list of rules, or ''. */
export function groupRolesProblem(v) {
  if (!Array.isArray(v) || v.length > 50) return 'Viewers from groups are a list of at most 50 groups.';
  for (const r of v) {
    if (!r || typeof r !== 'object' || typeof r.group !== 'string' || !r.group.trim() || r.group.length > 300) return 'Each rule names a group.';
    if (r.role !== undefined && !['viewer', 'editor'].includes(r.role)) return 'A group gives the role viewer.';
    delete r.role;   /* only viewer is left: a rule no longer names it */
    if (r.sites !== undefined && (!Array.isArray(r.sites) || r.sites.length > 50 || r.sites.some(x => typeof x !== 'string' || x.length > 120))) return 'The sites of a rule are a list of site names.';
  }
  return '';
}
