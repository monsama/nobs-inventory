/* Slows password guessing: failed sign-ins are counted per login and per client address in a sliding window.
   After the limit, further attempts are refused for a while, whatever the password. In memory: a restart clears it. */
const WINDOW_MS = 15 * 60e3;
const LIMIT_IP = 8;       /* failures from one address */
const LIMIT_LOGIN = 20;  /* failures on one login: higher, so an attacker cannot lock an account for everyone */
const LOCK_MS = 15 * 60e3;
/* One throttle per server, so separate servers (and tests) do not share their counts. */
export function createThrottle() {
  const buckets = new Map();
  const bucket = key => { let b = buckets.get(key); if (!b) { b = { fails: [], lockedUntil: 0 }; buckets.set(key, b); } return b; };
  return {
    blocked(keys, now = Date.now()) { return keys.some(k => { const b = buckets.get(k); return b && b.lockedUntil > now; }); },
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
