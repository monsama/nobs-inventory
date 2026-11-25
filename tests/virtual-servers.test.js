/* A virtual machine is a Server whose Kind is Virtual machine (0.9.160): the old type vm becomes a server (a PC for a
   Windows workstation), always virtual; a synced server the type rules know as virtual gets that Kind at start and after
   a sync (not on a person's save), a Kind already set stays; the page's saves convert too; the start-up migration moves
   what was kept for the type vm to Server. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVirtual, virtualByRules, virtualType } from '../server/state.js';
import { migrateState } from '../server/migrate.js';

const base = (objs, more = {}) => ({ objs, rels: [], users: [], policy: {}, locs: [], seq: 100, codeN: 0, rseq: 0, types: {}, history: {}, ...more });
const dev = (id, more) => ({ id, code: 'INV-' + id, name: 'D-' + id, status: 'active', ovr: {}, ...more });

test('the old type vm becomes a virtual server, or a virtual PC when Windows calls it a workstation', () => {
  const s = base([dev('a', { type: 'vm' }), dev('b', { type: 'vm', feed: { sys: 'Lansweeper', ref: '1', role: 'workstation' } }), dev('c', { type: 'vm', kind: 'physical' })]);
  assert.equal(normalizeVirtual(s), 3);
  assert.deepEqual(s.objs.map(o => [o.type, o.kind]), [['server', 'vm'], ['pc', 'vm'], ['server', 'vm']]);
  assert.equal(normalizeVirtual(s), 0, 'nothing more the second time');
});

test('a synced server the rules know as virtual gets Kind virtual at start or sync; a set Kind and a hand-entered one stay', () => {
  const ls = ref => ({ sys: 'Lansweeper', ref });
  const s = base([
    dev('v1', { type: 'server', model: 'VMware Virtual Platform', feed: ls('1') }),
    dev('v2', { type: 'server', model: 'Microsoft Corporation Virtual Machine', feed: ls('2') }),
    dev('v3', { type: 'server', feed: { ...ls('3'), assetType: 'VMware Guest' } }),
    dev('v4', { type: 'server', feed: { ...ls('4'), assetType: 'Virtual Server' } }),
    dev('p1', { type: 'server', model: 'ProLiant DL380 Gen10', feed: ls('5') }),
    dev('p2', { type: 'server', model: 'HPE SimpliVity 380 Gen10', feed: ls('6') }),
    dev('h1', { type: 'server', model: 'VMware Virtual Platform', kind: 'physical', feed: ls('7') }),
    dev('m1', { type: 'server', model: 'VMware Virtual Platform' }),
    dev('w1', { type: 'pc', model: 'VMware Virtual Platform', feed: ls('8') }),
  ], { typeMap: { 'virtual server': 'vm' } });
  assert.equal(normalizeVirtual(s), 0, 'a save does not guess');
  normalizeVirtual(s, { rules: true });
  const k = id => s.objs.find(o => o.id === id).kind;
  assert.deepEqual(['v1', 'v2', 'v3', 'v4', 'w1'].map(k), ['vm', 'vm', 'vm', 'vm', 'vm']);
  assert.equal(k('p1'), 'physical', 'a server line\'s model (ProLiant) is physical');
  assert.deepEqual(['p2', 'm1'].map(k), [undefined, undefined], 'other models and hand-entered servers: not known until someone says');
  assert.equal(k('h1'), 'physical', 'a Kind already set stays');
  assert.match(s.history.v1[0].msg, /Kind set to Virtual machine/);
  assert.equal(virtualByRules(s, { model: 'KVM', name: 'app-vm03' }), true);
  const o = { type: 'vm', name: 'X' };
  assert.equal(virtualType(o), true); assert.deepEqual([o.type, o.kind], ['server', 'vm']);
});

test('the migration at start converts once and drops the stored look of the type vm', () => {
  const s = base([dev('a', { type: 'vm' })], { types: { vm: { label: 'Virtual machine', short: 'VM', color: '#7c3aed', icon: 'server' } },
    typeFields: { vm: [{ key: 'host', label: 'Host', kind: 'text' }, { key: 'rack', label: 'Rack', kind: 'text' }], server: [{ key: 'rack', label: 'Rack slot', kind: 'text' }] },
    fieldLayout: { vm: { hidden: ['serial'] } }, subnets: [{ cidr: '10.0.0.0/24', types: ['vm', 'pc'] }, { cidr: '10.0.1.0/24', types: ['vm', 'server'] }] });
  assert.equal(migrateState(s), true);
  assert.deepEqual([s.objs[0].type, s.objs[0].kind, s.types.vm], ['server', 'vm', undefined]);
  assert.deepEqual(s.typeFields, { server: [{ key: 'rack', label: 'Rack slot', kind: 'text' }, { key: 'host', label: 'Host', kind: 'text' }] });
  assert.equal(s.fieldLayout.vm, undefined);
  assert.deepEqual(s.subnets.map(n => n.types), [['server', 'pc'], ['server']]);
  assert.equal(migrateState(s), false, 'nothing more the second time');
});

test('a page that still saves type vm (an older page, a cached one) stores a virtual server', async () => {
  const { startServer, signIn } = await import('./helpers.js');
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const v = { id: 'o1', code: null, type: 'vm', name: 'VM-1', status: 'active', feed: null, ovr: {} };
    const r = await srv.call('POST', '/api/changes', { cookie: a.cookie, body: { puts: [{ kind: 'object', id: 'o1', value: v, base: 0 }], dels: [] } });
    assert.equal(r.status, 200);
    const o = (await srv.call('GET', '/api/state', { cookie: a.cookie })).json.objs.find(x => x.id === 'o1');
    assert.deepEqual([o.type, o.kind], ['server', 'vm']);
  } finally { await srv.close(); }
});

test('a push links a virtual machine to the host its scan lists ("Runs on"), and moves it with the guest', async () => {
  const { mergeRecords, recordsFromJson } = await import('../server/feed.js');
  const now = new Date(2026, 9, 25, 10, 0);
  const srv = (id, name, ref, more = {}) => ({ id, code: 'INV-' + id, type: 'server', name, status: 'active', loc: '', ovr: {}, feed: { sys: 'Lansweeper', ref }, ...more });
  const s = base([srv('h1', 'HV-01', '10', { kind: 'physical' }), srv('h2', 'HV-02', '11', { kind: 'physical' }), srv('v', 'APP-01', '12', { model: 'Microsoft Corporation Virtual Machine' })],
    { policy: { links: true }, feedOn: true });
  const push = host => mergeRecords(s, recordsFromJson([
    { name: 'HV-01', ref: '10', assetType: 'Windows', role: 'server' }, { name: 'HV-02', ref: '11', assetType: 'Windows', role: 'server' },
    { name: 'APP-01', ref: '12', assetType: 'Windows', role: 'server', model: 'Microsoft Corporation Virtual Machine', links: [{ kind: 'hosted', ref: host }] },
  ]), now, []);
  push('10');
  assert.equal(s.objs.find(o => o.id === 'v').kind, 'vm');
  assert.deepEqual(s.rels.filter(r => r.kind === 'hosted').map(r => [r.from, r.to, r.src]), [['v', 'h1', 'Lansweeper']]);
  push('11');
  assert.deepEqual(s.rels.filter(r => r.kind === 'hosted').map(r => [r.from, r.to]), [['v', 'h2']], 'moved to the other host');
});

test('host links from Lansweeper: a host that does not fit keeps the old link, a guest no longer listed loses it, and a guest of unknown Kind becomes virtual', async () => {
  const { mergeRecords, recordsFromJson } = await import('../server/feed.js');
  const now = new Date(2026, 9, 25, 10, 0);
  const srv = (id, name, ref, more = {}) => ({ id, code: 'INV-' + id, type: 'server', name, status: 'active', loc: '', ovr: {}, feed: { sys: 'Lansweeper', ref }, ...more });
  const s = base([srv('h1', 'HV-01', '10', { kind: 'physical' }), srv('pc', 'WS-01', '11', { type: 'pc' }), srv('v', 'APP-01', '12')], { policy: { links: true }, feedOn: true });
  const push = links => mergeRecords(s, recordsFromJson([
    { name: 'HV-01', ref: '10', assetType: 'Windows', role: 'server' }, { name: 'WS-01', ref: '11', assetType: 'Windows', role: 'workstation' },
    { name: 'APP-01', ref: '12', assetType: 'Linux', links },
  ]), now, []);
  push([{ kind: 'hosted', ref: '10' }]);
  assert.equal(s.objs.find(o => o.id === 'v').kind, 'vm', 'listed by a host scan: virtual');
  assert.match(s.history.v[0].msg, /Kind set to Virtual machine \(it runs on HV-01\)/);
  assert.deepEqual(s.rels.filter(r => r.kind === 'hosted').map(r => r.to), ['h1']);
  push([{ kind: 'hosted', ref: '11' }]);
  assert.deepEqual(s.rels.filter(r => r.kind === 'hosted').map(r => r.to), ['h1'], 'a PC is no host here: the old link stays');
  push([]);
  assert.deepEqual(s.rels.filter(r => r.kind === 'hosted'), [], 'no longer listed by a host: the link goes');
});

test('sweep: a guest whose host the push cannot tell (keep) keeps its link; a refused host does not make it virtual', async () => {
  const { mergeRecords, recordsFromJson } = await import('../server/feed.js');
  const now = new Date(2026, 10, 23, 10, 0);
  const srv = (id, name, ref, more = {}) => ({ id, code: 'INV-' + id, type: 'server', name, status: 'active', loc: '', ovr: {}, feed: { sys: 'Lansweeper', ref }, ...more });
  const s = base([srv('h1', 'HV-01', '10', { kind: 'physical' }), srv('v', 'APP-01', '12', { kind: 'vm' }), srv('x', 'FILE-01', '13'), srv('g', 'GUEST-02', '14', { kind: 'vm' })], { policy: { links: true }, feedOn: true });
  const push = links => mergeRecords(s, recordsFromJson([
    { name: 'HV-01', ref: '10', assetType: 'Windows', role: 'server' }, { name: 'APP-01', ref: '12', assetType: 'Windows', role: 'server', links },
    { name: 'FILE-01', ref: '13', assetType: 'Windows', role: 'server', links: [{ kind: 'hosted', ref: '14' }] }, { name: 'GUEST-02', ref: '14', assetType: 'Windows', role: 'server' },
  ]), now, []);
  push([{ kind: 'hosted', ref: '10' }]);
  assert.deepEqual(s.rels.filter(r => r.kind === 'hosted' && r.from === 'v').map(r => r.to), ['h1']);
  push([{ kind: 'hosted', keep: true }]);
  assert.deepEqual(s.rels.filter(r => r.kind === 'hosted' && r.from === 'v').map(r => r.to), ['h1'], 'kept while the push cannot tell');
  assert.equal(s.objs.find(o => o.id === 'x').kind, undefined, 'a host that is itself virtual is refused, and the server is not made virtual');
});
