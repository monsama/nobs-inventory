/* Live updates (GET /api/events): a Server-Sent Events stream per open page that says when anything was saved. It sends
   only the running number of the last write (db.js), never data: the page then asks api/state?since= for what changed,
   which gives each person only what they may see. */
import { readCookie, sessionOpen } from './auth.js';
import { stateSeq } from './state.js';

/* Per session: a browser keeps at most 6 connections to a server over HTTP/1.1, and each open page holds one, so a few
   tabs leave room for the page's own requests; more tabs check by polling. */
const PER_SESSION = 4, TOTAL = 200;
const TICK_MS = 1000, SWEEP_MS = 5000;

/* Adds GET /api/events, and a hook on every /api request that is not a read so a check runs as soon as it is answered.
   Streams are limited per session and in total; a tick each second sends the new number when there is one, a heartbeat,
   and closes the streams of ended sessions. Returns { check, count }. */
export function registerLiveEvents(app, { db, requireUser, userDoc, COOKIE, perSession = PER_SESSION, total = TOTAL, heartbeatMs = 25_000 }) {
  const streams = new Set();
  let seq = 0, timer = null, beat = 0, swept = 0;
  /* closing: the server is stopping, so the connection goes too (it would otherwise wait idle for another request). */
  const drop = (s, closing = false) => {
    if (!streams.delete(s)) return;
    const sock = s.res.socket;
    try { s.res.end(closing && sock ? () => sock.destroy() : undefined); } catch { /* already gone */ }
    if (!streams.size && timer) { clearInterval(timer); timer = null; }
  };
  const send = (s, text) => { try { s.res.write(text); } catch { drop(s); } };
  /* The session is still open (not signed out, ended, expired or idle) and its user still has access. */
  const allowed = s => {
    const uid = sessionOpen(db, s.token);
    if (!uid || String(uid) !== String(s.uid)) return false;
    const u = userDoc(uid);
    return !!u && u.active !== false && u.role !== 'none';
  };
  /* Each tick (and after every change made through the API): a new number goes out; streams whose server is closing, or
     whose session ended, are closed, so a server can stop and a signed-out page hears nothing more. */
  const check = (force = false) => {
    if (!streams.size) return;
    for (const s of [...streams]) if (!s.res.socket || !s.res.socket.server || !s.res.socket.server.listening) drop(s, true);
    if (!streams.size) return;
    const now = Date.now(), n = stateSeq(db), changed = n !== seq;
    if (changed || force || now - swept >= SWEEP_MS) { swept = now; for (const s of [...streams]) if (!allowed(s)) drop(s); }
    if (changed) { seq = n; for (const s of streams) send(s, `data: ${seq}\n\n`); }
    if (now - beat >= heartbeatMs) { beat = now; for (const s of streams) send(s, ': ping\n\n'); }
  };
  /* A save, sign-out or anything else that is not a read is followed by a check at once, not at the next tick. */
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') res.on('finish', () => { try { check(true); } catch (e) { console.error('live updates:', e.message); } });
    next();
  });
  app.get('/api/events', requireUser, (req, res) => {
    const token = readCookie(req.headers.cookie, COOKIE);
    let mine = 0; for (const s of streams) if (s.token === token) mine++;
    if (mine >= perSession || streams.size >= total) return res.status(429).set('Retry-After', '60').json({ error: 'Too many live connections are open; this page checks for changes by itself.' });
    /* no-transform: a proxy that compresses (Caddy's encode) leaves the stream as it is, so each message goes out at once. */
    res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    if (!streams.size) { seq = stateSeq(db); beat = swept = Date.now(); }
    const s = { res, token, uid: req.user.id };
    streams.add(s);
    res.on('close', () => drop(s));
    res.on('error', () => drop(s));
    /* The number now, so a page that reconnects catches up on what it missed. */
    send(s, `retry: 5000\ndata: ${stateSeq(db)}\n\n`);
    if (!timer) { timer = setInterval(() => { try { check(); } catch (e) { console.error('live updates:', e.message); } }, TICK_MS); timer.unref(); }
  });
  return { check, count: () => streams.size };
}
