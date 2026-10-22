/* Checks for addresses typed into the inventory and read from a feed. An empty value is allowed everywhere. The page
   has the same rules, so what it refuses is refused here too. */
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const MAC_RE = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;

export function validIPv6(v) {
  if (v.length > 45 || !/^[0-9a-f:.]+$/i.test(v)) return false;
  if (v.includes('.')) {
    const i = v.lastIndexOf(':');
    if (i < 0 || !IPV4_RE.test(v.slice(i + 1))) return false;
    v = v.slice(0, i + 1) + '0:0';
  }
  const parts = v.split('::');
  if (parts.length > 2) return false;
  const groups = s => (s === '' ? [] : s.split(':'));
  const all = [...groups(parts[0]), ...(parts.length === 2 ? groups(parts[1]) : [])];
  if (!all.every(g => /^[0-9a-f]{1,4}$/i.test(g))) return false;
  return parts.length === 2 ? all.length <= 7 : all.length === 8;
}

/* Returns { ok, value, msg }: value is the form to store (lower case, colons for a MAC). */
export function checkAddress(k, raw) {
  const v = String(raw ?? '').trim();
  if (!v) return { ok: true, value: '' };
  if (k === 'ip') return IPV4_RE.test(v) ? { ok: true, value: v } : { ok: false, msg: `"${v}" is not an IPv4 address, such as 10.10.0.12.` };
  if (k === 'ip6') return validIPv6(v) ? { ok: true, value: v.toLowerCase() } : { ok: false, msg: `"${v}" is not an IPv6 address, such as 2001:db8::12.` };
  if (k === 'mac') return MAC_RE.test(v) ? { ok: true, value: v.toLowerCase().replace(/-/g, ':') } : { ok: false, msg: `"${v}" is not a MAC address, such as 70:b3:17:4a:00:01.` };
  return { ok: true, value: v };
}
