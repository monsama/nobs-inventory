/* Subnets, shared by the server (which checks what it saves) and the page (which checks what is typed). No browser code here. */
export const ipInt = s => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s || ''));
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every(n => n <= 255) ? p[0] * 16777216 + p[1] * 65536 + p[2] * 256 + p[3] : null;
};
/* Returns the first problem with a subnet, or null. A subnet is an IPv4 network with a prefix from /8 to /30, written by its
   first address, with its gateway and ranges inside it. */
export const subnetProblem = n => {
  if (!n || typeof n !== 'object') return 'A subnet is an object.';
  if (typeof n.name !== 'string' || !n.name.trim() || n.name.length > 60) return 'A subnet needs a name of up to 60 characters.';
  if (n.vid != null && (!Number.isInteger(n.vid) || n.vid < 1 || n.vid > 4094)) return `${n.name}: the VLAN is a number from 1 to 4094, or none.`;
  const m = /^([\d.]+)\/(\d{1,2})$/.exec(String(n.cidr || ''));
  const base = m ? ipInt(m[1]) : null, prefix = m ? Number(m[2]) : 0;
  if (base === null || prefix < 8 || prefix > 30) return `${n.name}: write the subnet as an address and a prefix from /8 to /30, e.g. 10.10.20.0/24.`;
  const size = 2 ** (32 - prefix), net = Math.floor(base / size) * size;
  if (net !== base) return `${n.name}: ${m[1]} is not the first address of ${n.cidr}.`;
  const inside = ip => ip >= net && ip < net + size;
  if (n.gateway && (ipInt(n.gateway) === null || !inside(ipInt(n.gateway)))) return `${n.name}: the gateway must be an address inside ${n.cidr}.`;
  if (!Array.isArray(n.dns) || !n.dns.every(d => ipInt(d) !== null)) return `${n.name}: DNS servers are IPv4 addresses.`;
  if (!Array.isArray(n.ranges)) return `${n.name}: the ranges are a list.`;
  for (const r of n.ranges) {
    const a = ipInt(r.from), b = ipInt(r.to);
    if (a === null || b === null || a > b || !inside(a) || !inside(b)) return `${n.name}: a range runs from one address to a higher one, inside ${n.cidr}.`;
    if (r.use !== undefined && (typeof r.use !== 'string' || r.use.length > 60)) return `${n.name}: a range's use is text of up to 60 characters.`;
  }
  if (!Array.isArray(n.types) || !n.types.every(t => typeof t === 'string')) return `${n.name}: the device types are a list.`;
  return null;
};
/* An address as text, from its number. */
export const intToIp = n => [24, 16, 8, 0].map(s => Math.floor(n / 2 ** s) % 256).join('.');
/* A range the DHCP server hands out, or one kept back: no address is picked from it for a device. */
export const rangeKeptOut = r => /^(dhcp|reserved)$/i.test(String(r && r.use || '').trim());
/* The first address in a subnet's ranges that is not in use, or null when the ranges are full. DHCP and reserved ranges
   are skipped. */
export const freeAddress = (subnet, used) => {
  for (const r of (subnet.ranges || []).filter(x => !rangeKeptOut(x))) {
    const a = ipInt(r.from), b = ipInt(r.to);
    if (a === null || b === null) continue;
    for (let x = a; x <= b; x++) if (!used.has(x)) return intToIp(x);
  }
  return null;
};
/* The free addresses of a subnet's ranges, in order, each with the range it is in; DHCP and reserved ranges are left
   out. Only those starting with what was typed, and at most limit of them: a /16 has 65'000. */
export const freeAddresses = (subnet, used, limit = 20, typed = '') => {
  const out = [];
  for (const r of (subnet.ranges || []).filter(x => !rangeKeptOut(x))) {
    const a = ipInt(r.from), b = ipInt(r.to);
    if (a === null || b === null) continue;
    for (let x = a; x <= b && out.length < limit; x++) {
      if (used.has(x)) continue;
      const ip = intToIp(x);
      if (!typed || ip.startsWith(typed)) out.push({ ip, range: r });
    }
    if (out.length >= limit) break;
  }
  return out;
};
/* The first and last address of a subnet, as numbers, or null when it is not a valid subnet. */
export const subnetSpan = n => {
  const m = /^([\d.]+)\/(\d{1,2})$/.exec(String(n && n.cidr || ''));
  const base = m ? ipInt(m[1]) : null, prefix = m ? Number(m[2]) : 0;
  if (base === null || prefix < 8 || prefix > 30) return null;
  const size = 2 ** (32 - prefix), net = Math.floor(base / size) * size;
  return { first: net, last: net + size - 1 };
};
/* The first subnet of a list that overlaps another one, as a message, or null. */
export const overlapProblem = list => {
  const spans = list.map(n => ({ n, s: subnetSpan(n) })).filter(x => x.s);
  for (let i = 0; i < spans.length; i++) for (let j = i + 1; j < spans.length; j++) {
    const a = spans[i], b = spans[j];
    if (a.s.first <= b.s.last && b.s.first <= a.s.last) return `${a.n.name} (${a.n.cidr}) overlaps ${b.n.name} (${b.n.cidr}).`;
  }
  return null;
};
