/* What the code review of 0.9.28 found on the server, each kept fixed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startServer, signIn, tempDataDir } from './helpers.js';
import { openDb } from '../server/db.js';
import { bootstrap } from '../server/index.js';
import { HISTORY_KEEP, checkState, freeUserId, loadState, saveState } from '../server/state.js';
import { hasPassword, setPassword } from '../server/auth.js';

test('a start with an admin under another login makes no account and no password', () => {
  const db = openDb(path.join(tempDataDir(), 'inventory.db'));
  const logs = [];
  bootstrap(db, {}, m => logs.push(m));
  const s = loadState(db);
  s.users = [{ id: 'u-boss', login: 'boss', name: 'Boss', role: 'admin', active: true, source: 'manual' }];
  saveState(db, s);
  db.prepare("DELETE FROM credentials WHERE user_id = 'u-admin'").run();
  logs.length = 0;
  bootstrap(db, {}, m => logs.push(m));
  assert.equal(hasPassword(db, 'u-admin'), false, 'no password for an account that does not exist');
  assert.deepEqual(logs, [], 'no password in the log');
  assert.deepEqual(loadState(db).users.map(u => u.login), ['boss']);
  db.close();
});

test('a page save keeps the history short too', async () => {
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const long = Array.from({ length: HISTORY_KEEP + 300 }, (_, i) => ({ t: 'x', msg: 'note ' + i }));
    const r = await srv.call('POST', '/api/changes', { cookie: a.cookie, body: { puts: [{ kind: 'history', id: 'o1', value: long, base: 0 }], dels: [] } });
    assert.equal(r.status, 200, r.text);
    assert.equal(loadState(srv.db).history.o1.length, HISTORY_KEEP);
  } finally { await srv.close(); }
});

test('a null where a record belongs is refused as a wrong value, not a server error', async () => {
  assert.throws(() => checkState({ ...loadStateBlank(), vlans: [null] }), e => e.status === 400);
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const revs = (await srv.call('GET', '/api/state', { cookie: a.cookie })).json.revs || {};
    const r = await srv.call('POST', '/api/changes', { cookie: a.cookie, body: { puts: [{ kind: 'setting', id: 'vlans', value: [null], base: revs['setting|vlans'] ?? 0 }], dels: [] } });
    assert.equal(r.status, 400, r.text);
    const p = await srv.call('PUT', '/api/state', { cookie: a.cookie, body: { users: [null] } });
    assert.equal(p.status, 400);
  } finally { await srv.close(); }
});
const loadStateBlank = () => ({ objs: [], rels: [], users: [], types: {}, history: {}, locs: [] });

test('a type icon or colour with anything but shapes is refused', () => {
  const ok = { ...loadStateBlank(), types: { dect: { label: 'DECT', color: '#3a7bd5', icon: 'custom', svgView: '0 0 24 24', svgInner: '<path d="M1 1h4"/>' } } };
  assert.doesNotThrow(() => checkState(ok));
  assert.doesNotThrow(() => checkState({ ...ok, types: { dect: { ...ok.types.dect, svgInner: '<g transform="translate(1 1)"><circle cx="12" cy="12" r="4" fill="none" stroke-width="2"/><title>On "x"</title></g>' } } }), 'shapes with their usual attributes stay allowed');
  for (const t of [{ svgView: '0 0 24 24"><script>' }, { svgInner: '<path onload="x()"/>' }, { svgInner: '<foreignObject><img/></foreignObject>' }, { svgInner: '<a href="javascript:x">' }, { color: 'red;background:url(x)' }, { svgInner: '<svg/onload=alert(1)>' }, { svgInner: '<path/onclick="x()" d="M1 1"/>' }, { svgInner: '<path d="M1 1" fill=\'red\' onmouseover=x>' }, { svgInner: '<path d="M1 1" style="x"/>' }]) {
    assert.throws(() => checkState({ ...ok, types: { dect: { ...ok.types.dect, ...t } } }), e => e.status === 400, JSON.stringify(t));
  }
});

test('a directory user gets a free id when the one made from the login is taken', () => {
  assert.equal(freeUserId([{ id: 'ldap-bob' }], 'ldap-bob'), 'ldap-bob-2');
  assert.equal(freeUserId([{ id: 'ldap-bob' }, { id: 'ldap-bob-2' }], 'ldap-bob'), 'ldap-bob-3');
  assert.equal(freeUserId([], 'ldap-bob'), 'ldap-bob');
});

test('a viewer gets the inventory without the connections\' settings', async () => {
  const srv = await startServer();
  try {
    const s = loadState(srv.db);
    s.users.push({ id: 'u-v', login: 'viewer', name: 'Viewer', role: 'viewer', active: true, source: 'manual' });
    s.lansweeper = { url: 'https://ls.example/api', site: 'x' };
    s.graphAmbiguous = [];
    saveState(srv.db, s);
    setPassword(srv.db, 'u-v', 'viewer-pass-123');
    const v = await signIn(srv, 'viewer', 'viewer-pass-123');
    const st = (await srv.call('GET', '/api/state', { cookie: v.cookie })).json;
    assert.equal(st.lansweeper, undefined);
    assert.ok(Array.isArray(st.graphAmbiguous), 'the device filter data stays');
    const a = await signIn(srv, 'admin', 'adminpass123');
    assert.equal((await srv.call('GET', '/api/state', { cookie: a.cookie })).json.lansweeper.site, 'x');
  } finally { await srv.close(); }
});
