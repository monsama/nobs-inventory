/* Slows password guessing: failed sign-ins are counted per login and per client address in a sliding window.
   After the limit, further attempts are refused for a while, whatever the password. In memory: a restart clears it. */
const WINDOW_MS = 15 * 60e3;
const LIMIT = 8;
const LOCK_MS = 15 * 60e3;
/* One throttle per server, so separate servers (and tests) do not share their counts. */
export function createThrottle() {
  const buckets = new Map();
  const bucket = key => { let b = buckets.get(key); if (!b) { b = { fails: [], lockedUntil: 0 }; buckets.set(key, b); } return b; };
  return {
    blocked(keys, now = Date.now()) { return keys.some(k => { const b = buckets.get(k); return b && b.lockedUntil > now; }); },
    recordFailure(keys, now = Date.now()) {
      for (const k of keys) {
        const b = bucket(k);
        b.fails = b.fails.filter(t => now - t < WINDOW_MS);
        b.fails.push(now);
        if (b.fails.length >= LIMIT) { b.lockedUntil = now + LOCK_MS; b.fails = []; }
      }
    },
    clearFailures(keys) { for (const k of keys) buckets.delete(k); }
  };
}
