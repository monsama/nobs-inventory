/* What Lansweeper knows about the network, beyond one device: its IP locations (named address ranges, often named
   after a site) and the subnet, gateway and DNS servers each network adapter reports. Used to fill in a device's
   location from its address, and to suggest subnets the inventory does not list yet. Suggestions only: nothing here
   adds a subnet by itself. */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
export const ipNum = ip => {
  const m = IPV4.exec(String(ip || '').trim());
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.some(p => p > 255) ? null : ((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3];
};
const ipText = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

/* 255.255.255.0 -> 24. A mask whose ones are not all at the front is not a mask. */
export const prefixOf = mask => {
  const n = ipNum(mask);
  if (n === null) return null;
  const bits = n.toString(2).padStart(32, '0');
  return /^1*0*$/.test(bits) ? bits.indexOf('0') === -1 ? 32 : bits.indexOf('0') : null;
};

/* The subnet an address is in, written by its first address: 10.10.20.37 and 255.255.255.0 -> 10.10.20.0/24.
   Only /8 to /30, as the inventory's subnets are. */
export const subnetOf = (ip, mask) => {
  const n = ipNum(ip), p = prefixOf(mask);
  if (n === null || p === null || p < 8 || p > 30) return null;
  const size = 2 ** (32 - p);
  return `${ipText(Math.floor(n / size) * size)}/${p}`;
};

/* Lansweeper's IP locations as {name, from, to}; a range that is not two addresses in order is left out. */
export function cleanIpLocations(list) {
  if (!Array.isArray(list)) return null;
  return list.slice(0, 2000).map(x => ({
    name: String(x && x.name != null ? x.name : '').trim().slice(0, 120),
    from: String(x && x.from != null ? x.from : '').trim(), to: String(x && x.to != null ? x.to : '').trim()
  })).filter(x => x.name && ipNum(x.from) !== null && ipNum(x.to) !== null && ipNum(x.from) <= ipNum(x.to));
}

/* The narrowest IP location an address falls in. */
export function ipLocationOf(locations, ip) {
  const n = ipNum(ip);
  if (n === null) return null;
  let best = null;
  for (const l of locations || []) {
    const a = ipNum(l.from), b = ipNum(l.to);
    if (n >= a && n <= b && (!best || b - a < ipNum(best.to) - ipNum(best.from))) best = l;
  }
  return best;
}

/* An IP location named "Willisau Lager" is the inventory's room "Willisau / Lager": compared without case, spaces or signs. */
const flat = t => String(t || '').toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '');
export const roomForIpLocation = (locs, name) => {
  const want = flat(name);
  return want ? (locs || []).find(l => flat(l) === want) || null : null;
};

/* Subnets the adapters report that the inventory does not list: with the gateway and DNS servers most of their devices
   have, how many devices are in each, and the IP location most of those devices are in, as a name to start from. */
export function suggestNets(records, subnets, locations) {
  const known = new Set((subnets || []).map(n => n.cidr));
  const nets = new Map();
  for (const r of records) {
    const cidr = subnetOf(r.ip, r.mask);
    if (!cidr || known.has(cidr)) continue;
    const n = nets.get(cidr) || { cidr, devices: 0, gateways: {}, dns: {}, names: {} };
    n.devices++;
    const l = ipLocationOf(locations, r.ip);
    if (l) n.names[l.name] = (n.names[l.name] || 0) + 1;
    if (r.gateway) n.gateways[r.gateway] = (n.gateways[r.gateway] || 0) + 1;
    if (r.dns) n.dns[r.dns] = (n.dns[r.dns] || 0) + 1;
    nets.set(cidr, n);
  }
  const most = counts => Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  return [...nets.values()].sort((a, b) => b.devices - a.devices).slice(0, 200).map(n => (
    { cidr: n.cidr, devices: n.devices, gateway: most(n.gateways), dns: most(n.dns).split(',').map(x => x.trim()).filter(Boolean), name: most(n.names) }
  ));
}
