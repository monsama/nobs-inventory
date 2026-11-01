/* The same person found twice: by Lansweeper (a login or a name), the directory (LDAP), Microsoft Entra or by hand.
   Strong signs are a shared login, e-mail or user principal name, read the way each source writes them (CORP\amuster,
   amuster@corp.example, AMuster); a weak sign is the same name, in any order and with or without accents ("Muster,
   Anna" is Anna Muster). Two directory accounts are never one person, and a pair marked as not the same is left out.
   Shared by the page (Settings → Users) and the server (the merge, and the syncs reading aliases). No DOM. */
const low = v => String(v || '').trim().toLowerCase();
/* A login without its domain: CORP\amuster and amuster@corp.example are amuster. */
export const loginCore = v => { const t = low(v); return t.includes('\\') ? t.slice(t.lastIndexOf('\\') + 1) : t; };
const localPart = v => { const t = low(v); return t.includes('@') ? t.slice(0, t.indexOf('@')) : t; };
export const normName = v => {
  let t = String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss');
  if (t.includes(',')) { const [last, first] = t.split(',', 2); t = `${first} ${last}`; }
  return t.split(/[^a-z0-9]+/).filter(w => w.length > 1).sort().join(' ');
};
/* The strong keys of a person: logins, e-mail and UPN, full and without the domain, and the aliases kept from merges. */
export function strongKeys(u) {
  const out = new Set();
  const add = v => { const t = low(v); if (!t || t.length < 3) return; out.add(t); const c = loginCore(t), l = localPart(c); if (c.length >= 3) out.add(c); if (l.length >= 3) out.add(l); };
  add(u.login); add(u.entra && u.entra.upn); add(u.profile && u.profile.mail);
  for (const a of u.aliases || []) if (!/\s/.test(a)) add(a);
  return out;
}
const nameKeys = u => new Set([normName(u.name), ...(u.aliases || []).filter(a => /\s/.test(a)).map(normName)].filter(k => k.includes(' ')));
export const pairKey = (a, b) => [String(a), String(b)].sort().join('|');

/* Groups of people who look like one: [{ ids: [...], why: 'login' | 'name' }]. Strong signs first; a name match only for
   people no strong sign tells apart (two different logins with the same name are two people). */
export function duplicateGroups(users, notSame = []) {
  const skip = new Set(notSame), list = (users || []).filter(u => u && u.id);
  const parent = new Map(list.map(u => [u.id, u.id])), why = new Map();
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const ok = (a, b) => a.id !== b.id && !(a.source === 'ldap' && b.source === 'ldap') && !skip.has(pairKey(a.id, b.id));
  const join = (a, b, w) => { const ra = find(a.id), rb = find(b.id); if (ra === rb) return; parent.set(rb, ra); why.set(ra, why.get(ra) === 'login' || w === 'login' || why.get(rb) === 'login' ? 'login' : 'name'); };
  const byKey = new Map();
  for (const u of list) for (const k of strongKeys(u)) byKey.set(k, [...(byKey.get(k) || []), u]);
  for (const group of byKey.values()) for (let i = 1; i < group.length; i++) if (ok(group[0], group[i])) join(group[0], group[i], 'login');
  /* Different logins on both sides tell two people apart, even with the same name. */
  const logins = u => new Set([u.login, ...(u.aliases || []).filter(a => !/\s/.test(a))].map(loginCore).filter(Boolean));
  const differ = (a, b) => { const la = logins(a), lb = logins(b); return la.size && lb.size && ![...la].some(x => lb.has(x)); };
  const byName = new Map();
  for (const u of list) for (const k of nameKeys(u)) byName.set(k, [...(byName.get(k) || []), u]);
  for (const group of byName.values()) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++)
    if (ok(group[i], group[j]) && !differ(group[i], group[j])) join(group[i], group[j], 'name');
  const groups = new Map();
  for (const u of list) { const r = find(u.id); groups.set(r, [...(groups.get(r) || []), u.id]); }
  return [...groups.entries()].filter(([, ids]) => ids.length > 1).map(([r, ids]) => ({ ids, why: why.get(r) || 'name' }));
}
/* Which record to keep: the directory's, then Entra's, then one made here, then Lansweeper's; then the one with a login. */
const RANK = { ldap: 0, entra: 1, manual: 2, lansweeper: 3 };
export const keepOf = people => [...people].sort((a, b) => (RANK[a.source] ?? 2) - (RANK[b.source] ?? 2) || (!!b.login - !!a.login) || String(a.id).localeCompare(String(b.id)))[0];

/* Merges the person drop into keep in s (users, objs): devices move, what keep lacks is taken over, drop's login and
   name are kept as aliases (so a sync finds the person again), drop goes. Returns { moved } or throws. */
export function mergePeople(s, keepId, dropId, stamp = '') {
  const keep = s.users.find(u => u.id === keepId), drop = s.users.find(u => u.id === dropId);
  if (!keep || !drop || keep === drop) throw new Error('Pick two different people.');
  if (drop.source === 'ldap') throw new Error(`${drop.name} comes from the directory: keep that one and merge the other into it.`);
  let moved = 0;
  for (const o of s.objs) if (o.uid === drop.id) { o.uid = keep.id; o.user = keep.name; moved++; if (stamp && s.history) (s.history[o.id] ||= []).unshift({ t: stamp, msg: `User ${drop.name} merged into ${keep.name}` }); }
  if (!keep.dept && drop.dept) keep.dept = drop.dept;
  if (!keep.profile && drop.profile) keep.profile = drop.profile;
  if (!keep.entra && drop.entra) keep.entra = drop.entra;
  if (!keep.login && drop.login) keep.login = drop.login;
  const ROLE = { admin: 2, viewer: 1, none: 0 };
  if ((ROLE[drop.role] ?? 0) > (ROLE[keep.role] ?? 0)) keep.role = drop.role;
  if (drop.active !== false && keep.active === false && keep.source !== 'ldap') { keep.active = true; delete keep.leftAt; delete keep.leftBy; }
  const aliases = new Set(keep.aliases || []);
  for (const v of [drop.login, drop.name, ...(drop.aliases || [])]) if (v && low(v) !== low(keep.login) && low(v) !== low(keep.name)) aliases.add(String(v).slice(0, 120));
  if (aliases.size) keep.aliases = [...aliases].slice(0, 20);
  s.users = s.users.filter(u => u !== drop);
  return { moved };
}
/* A person a source names by login or name, also by an alias a merge left (for the syncs). */
export const matchesAlias = (u, v) => !!v && (u.aliases || []).some(a => low(a) === low(v) || loginCore(a) === loginCore(v));
