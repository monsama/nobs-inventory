/* Slows password guessing: failed sign-ins are counted per login and per client address in a sliding window.
   After the limit, further attempts are refused for a while, whatever the password. In memory: a restart clears it. */
const WINDOW_MS = 15 * 60e3;
const LIMIT_IP = 8;       /* failures from one address */
const LIMIT_LOGIN = 20;  /* failures on one login: higher, so an attacker cannot lock an account for everyone */
const LOCK_MS = 15 * 60e3;
/* One throttle per server, so separate servers (and tests) do not share their counts. */
export function createThrottle() {
  const buckets = new Map(), known = new Map();
  const bucket = key => { let b = buckets.get(key); if (!b) { b = { fails: [], lockedUntil: 0 }; buckets.set(key, b); } return b; };
  return {
    /* An address that signed in to a login before is not held off by that login's lock (only by its own), so failures
       from elsewhere cannot lock the owner out. */
    blocked(keys, now = Date.now()) {
      const login = keys.find(k => k.startsWith('login:')), ip = keys.find(k => k.startsWith('ip:'));
      const trusted = login && ip && (known.get(login) || new Set()).has(ip);
      return keys.some(k => { if (trusted && k === login) return false; const b = buckets.get(k); return b && b.lockedUntil > now; });
    },
    rememberSuccess(keys) {
      const login = keys.find(k => k.startsWith('login:')), ip = keys.find(k => k.startsWith('ip:'));
      if (!login || !ip) return;
      const set = known.get(login) || new Set(); set.add(ip);
      if (set.size > 20) set.delete(set.values().next().value);
      known.set(login, set);
      if (known.size > 5000) known.delete(known.keys().next().value);
    },
    recordFailure(keys, now = Date.now()) {
      /* Counts that have run out are dropped now and then, so addresses and logins tried once do not pile up for good. */
      if (buckets.size > 1000) for (const [k, b] of buckets) if (b.lockedUntil <= now && b.fails.every(t => now - t >= WINDOW_MS)) buckets.delete(k);
      for (const k of keys) {
        const b = bucket(k);
        b.fails = b.fails.filter(t => now - t < WINDOW_MS);
        b.fails.push(now);
        const limit = k.startsWith('login:') ? LIMIT_LOGIN : LIMIT_IP;
        if (b.fails.length >= limit) { b.lockedUntil = now + LOCK_MS; b.fails = []; }
      }
    },
    clearFailures(keys) { for (const k of keys) buckets.delete(k); },
    size: () => buckets.size
  };
}
