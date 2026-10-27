/* Contacts: the people who look after devices. Internal ones work for the company (the IT team, a site's caretaker),
   external ones for an IT partner (a service provider, a maker's support). A device names up to one internal and one
   external responsible (o.respIn, o.respEx: a contact's id). Shared by the page and the server, which checks the list
   with contactsProblem before it stores it. */
export const CONTACT_KINDS = { internal: 'Internal', external: 'External' };
/* The longest each field may be. */
/* area: what the contact is the one to ask about (a system, a service): "Sage200 interface", "Firewall". */
export const CONTACT_MAX = { name: 120, company: 120, area: 120, role: 120, email: 200, phone: 40, mobile: 40, note: 1000 };
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const PHONE = /^[+\d][\d\s()./-]{2,39}$/;

export function contactProblem(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'A contact is a record.';
  if (typeof c.id !== 'string' || !/^[\w-]{1,40}$/.test(c.id)) return 'Every contact needs an id.';
  const name = typeof c.name === 'string' ? c.name.trim() : '';
  if (!name) return 'Every contact needs a name.';
  if (!CONTACT_KINDS[c.kind]) return `${name}: a contact is internal or external.`;
  for (const [k, max] of Object.entries(CONTACT_MAX)) {
    if (c[k] !== undefined && (typeof c[k] !== 'string' || c[k].length > max)) return `${name}: the ${k} is text of up to ${max} characters.`;
  }
  if (c.email && !EMAIL.test(c.email)) return `${name}: ${c.email} is not an e-mail address.`;
  for (const k of ['phone', 'mobile']) if (c[k] && !PHONE.test(c[k])) return `${name}: ${c[k]} is not a phone number (digits, spaces, + ( ) / . -).`;
  if (c.userId !== undefined && (typeof c.userId !== 'string' || c.userId.length > 60)) return `${name}: the linked user is not valid.`;
  return null;
}
export function contactsProblem(list) {
  if (!Array.isArray(list)) return 'The contacts are a list.';
  if (list.length > 2000) return 'At most 2000 contacts.';
  const ids = new Set();
  for (const c of list) {
    const p = contactProblem(c); if (p) return p;
    if (ids.has(c.id)) return `Two contacts have the id ${c.id}.`;
    ids.add(c.id);
  }
  return null;
}
/* How a contact reads in a list: the name, and the company for an external one. */
export const contactLabel = c => c ? c.name + (c.kind === 'external' && c.company ? ` (${c.company})` : '') : '';
