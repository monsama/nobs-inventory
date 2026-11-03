/* Live updates (GET /api/events): signed-in only; a stream gets the new running number after a save, from the API or
   written some other way; it closes when its session ends; streams are capped; a server with open streams stops. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';
import { loadState, saveState, stateSeq } from '../server/state.js';

/* Opens a stream and hands out its messages one by one (null when it ended). */
async function openStream(srv, cookie) {
  const ac = new AbortController();
  const r = await fetch(srv.base + '/api/events', { headers: { Cookie: cookie }, signal: ac.signal });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/event-stream/);
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '';
  const next = async (ms = 4000) => {
    const end = Date.now() + ms;
    for (;;) {
      const i = buf.indexOf('\n\n');
      if (i >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim());
        if (data.length) return Number(data.join(''));
        continue;
      }
      const left = end - Date.now();
      if (left <= 0) throw new Error('no message in time');
      const got = await Promise.race([reader.read(), new Promise(res => setTimeout(() => res('timeout'), left))]);
      if (got === 'timeout') throw new Error('no message in time');
      if (got.done) return null;
      buf += dec.decode(got.value, { stream: true });
    }
  };
  return { next, close: () => ac.abort() };
}

test('a stream needs a session, and gets the new number after a save', async () => {
  const srv = await startServer();
  try {
    assert.equal((await srv.call('GET', '/api/events')).status, 401, 'no session');
    assert.equal((await srv.call('GET', '/api/events', { cookie: 'ni_session=nope' })).status, 401, 'a made-up session');
    const a = await signIn(srv, 'admin', 'adminpass123');
    const st = await openStream(srv, a.cookie);
    const first = await st.next();
    assert.equal(first, stateSeq(srv.db), 'the number now, at once');
    // a save through the API: own details
    assert.equal((await srv.call('PUT', '/api/me', { cookie: a.cookie, body: { first: 'Ada', last: 'Admin' } })).status, 200);
    const second = await st.next();
    assert.ok(second > first, 'a higher number after the save');
    assert.equal(second, stateSeq(srv.db));
    // a write that does not come through the API (a scheduled sync): seen at the next tick
    const s = loadState(srv.db); s.locs = ['HQ / 1']; saveState(srv.db, s);
    const third = await st.next();
    assert.ok(third > second);
    // no data goes over the stream, only the number
    assert.ok(Number.isInteger(third));
    st.close();
  } finally { await srv.close(); }
});

test('a stream closes when its session ends; streams are capped per session', async () => {
  const srv = await startServer();
  try {
    const s = loadState(srv.db);
    s.users.push({ id: 'v1', name: 'Vera Viewer', login: 'vera', role: 'viewer', source: 'manual', active: true });
    saveState(srv.db, s);
    const a = await signIn(srv, 'admin', 'adminpass123');
    await srv.call('POST', '/api/users/v1/password', { cookie: a.cookie, body: { password: 'viewerpass123' } });
    const v = await signIn(srv, 'vera', 'viewerpass123');
    assert.equal(v.status, 200);
    // a viewer gets the stream too
    const vs = await openStream(srv, v.cookie);
    await vs.next();
    // signed out: the stream ends
    await srv.call('POST', '/api/logout', { cookie: v.cookie });
    assert.equal(await vs.next(6000), null, 'the stream ended with the session');
    // deactivated: the stream ends too
    const v2 = await signIn(srv, 'vera', 'viewerpass123');
    const vs2 = await openStream(srv, v2.cookie);
    await vs2.next();
    const s1 = loadState(srv.db); s1.users.find(u => u.id === 'v1').active = false; saveState(srv.db, s1);
    assert.equal(await vs2.next(6000), null, 'the stream ended when the user was deactivated');
    // at most four per session
    const open = [];
    for (let i = 0; i < 4; i++) { const x = await openStream(srv, a.cookie); await x.next(); open.push(x); }
    assert.equal((await srv.call('GET', '/api/events', { cookie: a.cookie })).status, 429);
    open.pop().close();
    await new Promise(r => setTimeout(r, 200));
    const again = await openStream(srv, a.cookie); await again.next(); open.push(again);
    // every open stream hears a change
    const s2 = loadState(srv.db); s2.users.find(u => u.id === 'u-admin').name = 'Admin'; saveState(srv.db, s2);
    for (const x of open) assert.ok(await x.next() > 0, 'every open stream hears the change');
    for (const x of open) x.close();
  } finally { await srv.close(); }
});

test('a server with an open stream stops', async () => {
  const srv = await startServer();
  const a = await signIn(srv, 'admin', 'adminpass123');
  const st = await openStream(srv, a.cookie);
  await st.next();
  const t0 = Date.now();
  await srv.close();
  assert.ok(Date.now() - t0 < 5000, 'the server waited on the stream');
  assert.equal(await st.next(), null, 'the stream ended');
});
