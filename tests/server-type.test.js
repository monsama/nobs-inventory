/* A server model (ProLiant, PowerEdge) or a Windows Server is a server, from every source; devices typed PC before
   become servers on start, unless a person chose their type. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { typeFor } from '../server/feed.js';
import { graphType } from '../server/graph.js';
import { adType } from '../server/ldap-sync.js';
import { migrateState } from '../server/migrate.js';

test('a server model is a server, whatever the type name, role or rules list', () => {
  assert.equal(typeFor({}, 'Windows', 'HP ProLiant DL380 Gen9', ''), 'server', 'Lansweeper without a role');
  assert.equal(typeFor({}, 'Windows', 'HP ProLiant DL380 Gen9', 'workstation'), 'server', 'a server model beats the role');
  assert.equal(typeFor({}, 'Windows', 'Dell PowerEdge R740', '', 'ACMEPC11'), 'server', 'beats a PC-like name');
  assert.equal(typeFor({ typeRules: [{ field: 'type', words: 'windows', to: 'pc', on: true }] }, 'Windows', 'HPE ProLiant DL360 Gen10', ''), 'server', 'with rules edited in Settings');
  assert.equal(typeFor({}, 'Windows', 'VMware Virtual Platform', ''), 'server', 'a VM is still a server');
  assert.equal(typeFor({}, 'Windows', 'HP EliteBook 840 G8', 'workstation'), 'notebook');
  assert.equal(typeFor({}, 'Windows', 'HP ProDesk 600', 'workstation'), 'pc');
});

test('Intune: a Windows server is a server, a Windows client a PC', () => {
  assert.equal(graphType({}, { platform: 'Windows', os: 'Windows Server 2019 Standard', model: '', name: 'APP01' }), 'server');
  assert.equal(graphType({}, { platform: 'Windows', os: 'Windows 11 Pro', model: '', name: 'X1' }), 'pc');
  assert.equal(graphType({}, { platform: 'Windows', os: 'Windows 10', model: 'ProLiant DL380 Gen9', name: 'X2' }), 'server');
  assert.equal(adType({}, { os: 'Windows Server 2022 Datacenter', name: 'APP02' }), 'server');
});

test('devices typed PC before become servers on start, unless a person chose the type', () => {
  const s = { history: { c: [{ t: '1', msg: 'Type changed from Server to PC by admin' }] }, objs: [
    { id: 'a', type: 'pc', model: 'Hewlett-Packard ProLiant DL380 Gen9', feed: { assetType: 'Windows' } },
    { id: 'b', type: 'other', os: 'Windows Server 2016 Standard', graph: { id: 'g' } },
    { id: 'c', type: 'pc', model: 'Dell PowerEdge R640', feed: {} },
    { id: 'd', type: 'pc', model: 'HP ProDesk 600', os: 'Windows 11', ad: {} },
    /* Added by hand, as a PC: the type chosen in New device stays. */
    { id: 'e', type: 'pc', model: 'HP ProLiant DL360 Gen10' },
  ] };
  migrateState(s);
  assert.deepEqual(s.objs.map(o => o.type), ['server', 'server', 'pc', 'pc', 'pc']);
  assert.match(s.history.a[0].msg, /Type changed from PC to Server by the type rules: its model is a server's \(Hewlett-Packard ProLiant DL380 Gen9\)/);
});

test('a type rules message with " by " in a model is not a person\'s choice; a person\'s is', async () => {
  const { typeSetByHand } = await import('../server/feed.js');
  const h = msg => ({ history: { a: [{ t: '1', msg }] } });
  assert.equal(typeSetByHand(h("Type changed from PC to Server by the type rules: its model is a server's (Server by Acme)"), { id: 'a' }), false);
  assert.equal(typeSetByHand(h('Type changed from other to Switch by the type rules (Lansweeper)'), { id: 'a' }), false);
  assert.equal(typeSetByHand(h('Type changed from Server to PC by admin'), { id: 'a' }), true);
  assert.equal(typeSetByHand(h('Type changed from Access point to Other by Ana Muster'), { id: 'a' }), true);
});

test('the start-up retyping leaves a type mapping of Settings and a device moved away from Server alone', () => {
  const s = { typeMap: { Windows: 'pc' }, history: { b: [{ t: '1', msg: 'Type changed from Server to PC by the type rules (Ana)' }] }, objs: [
    { id: 'a', type: 'pc', model: 'HP ProLiant DL380 Gen9', feed: { sys: 'Lansweeper', ref: '1', assetType: 'Windows' } },
    { id: 'b', type: 'pc', model: 'Dell PowerEdge R640', graph: { id: 'g1' } },
    { id: 'c', type: 'pc', model: 'Dell PowerEdge R640', graph: { id: 'g2' } },
  ] };
  migrateState(s); migrateState(s);
  assert.deepEqual(s.objs.map(o => o.type), ['pc', 'pc', 'server']);
});

test('a server with a server model and no Kind is physical; a Kind already set stays', async () => {
  const { normalizeVirtual } = await import('../server/state.js');
  const s = { history: {}, objs: [
    { id: 'a', type: 'server', model: 'HP ProLiant ML350 Gen10' }, { id: 'b', type: 'server', model: 'Dell PowerEdge R640', kind: 'vm' },
    { id: 'c', type: 'server', model: 'Supermicro X11' },
  ] };
  normalizeVirtual(s, { rules: true });
  assert.deepEqual(s.objs.map(o => o.kind), ['physical', 'vm', undefined]);
  assert.match(s.history.a[0].msg, /Kind set to Physical \(a server model: HP ProLiant ML350 Gen10\)/);
});
