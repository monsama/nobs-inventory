/* Roles from groups (Settings → Users): a person in a group of the directory (AD, by name or distinguished name) or of
   Entra (by the group's object ID, in the sign-in token) gets the role and the sites of the first rule that matches,
   at each directory sync and sign-in. Admin is never given this way: that is the directory's admin group. A person a
   rule gave a role loses it (No access) once no rule matches any more; a role given by hand, without a rule, stays.
   Shared by the page and the server. No DOM. */
export const GROUP_ROLES = ['editor', 'viewer'];
const low = v => String(v || '').trim().toLowerCase();
/* A group as the sources write it: CN=IT-Bern,OU=Groups,DC=corp → it-bern; an object ID stays as it is. */
const nameOf = g => { const t = low(g); const m = /^cn=([^,]+)/.exec(t); return m ? m[1] : t; };
export const groupMatches = (rule, groups) => {
  const want = low(rule.group), wantName = nameOf(rule.group);
  return !!want && (groups || []).some(g => low(g) === want || nameOf(g) === wantName);
};
export function roleFromGroups(rules, groups) {
  const r = (Array.isArray(rules) ? rules : []).find(x => x && GROUP_ROLES.includes(x.role) && groupMatches(x, groups));
  return r ? { role: r.role, sites: Array.isArray(r.sites) ? r.sites.filter(Boolean) : [], group: r.group } : null;
}
/* Gives u the role and sites its groups say; true when that changed u. Admins are left as they are. */
export function applyGroupRole(u, rules, groups) {
  if (!u || u.role === 'admin' || !Array.isArray(rules) || !rules.length) return false;
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
  if (!Array.isArray(v) || v.length > 50) return 'Roles from groups are a list of at most 50 rules.';
  for (const r of v) {
    if (!r || typeof r !== 'object' || typeof r.group !== 'string' || !r.group.trim() || r.group.length > 300) return 'Each rule names a group.';
    if (!GROUP_ROLES.includes(r.role)) return 'A group gives the role editor or viewer.';
    if (r.sites !== undefined && (!Array.isArray(r.sites) || r.sites.length > 50 || r.sites.some(x => typeof x !== 'string' || x.length > 120))) return 'The sites of a rule are a list of site names.';
  }
  return '';
}
