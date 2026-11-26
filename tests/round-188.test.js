/* Sweep 0.9.188: a merge of two viewers limited to sites keeps only the sites both may see; a person Entra deleted and
   restored is switched back on; a device made by hand, copied or imported keeps its type at start. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePeople } from '../public/js/people-match.js';
import { applyGraphPeople } from '../server/graph.js';
import { migrateState } from '../server/migrate.js';

test('a merge of two viewers limited to sites: the sites both have; none in common: own devices only', () => {
  const two = (keep, drop) => { const s = { objs: [], history: {}, users: [{ id: 'k', name: 'Dana', source: 'manual', role: 'viewer', ...keep }, { id: 'd', name: 'dana', source: 'manual', role: 'viewer', ...drop }] }; mergePeople(s, 'k', 'd'); return s.users[0]; };
  const a = two({ sites: ['A', 'B'] }, { sites: ['B', 'C'] });
  assert.deepEqual([a.sites, a.own], [['B'], undefined]);
  const b = two({ sites: ['A', 'B'] }, { sites: ['C'] });
  assert.deepEqual([b.sites, b.own], [undefined, true], 'nothing in common');
  const c = two({}, { sites: ['C'] });
  assert.deepEqual(c.sites, ['C'], 'all sites and one: that one');
});

test('Entra: deleted (gone) switches the person off as Entra\'s doing; restored, they are back on', () => {
  const s = { objs: [], rels: [], types: {}, history: {}, locs: [], users: [{ id: 'a', login: 'ana@x.ch', name: 'Ana', role: 'none', source: 'entra', active: true, entra: { id: 'e1', upn: 'ana@x.ch', enabled: true } }] };
  const ana = { id: 'e1', userPrincipalName: 'ana@x.ch', displayName: 'Ana', accountEnabled: true, userType: 'Member' };
  const NOW = new Date(2026, 10, 26, 10, 0);
  applyGraphPeople(s, [], 'match', NOW);
  assert.deepEqual([s.users[0].active, s.users[0].entraOff], [false, true]);
  applyGraphPeople(s, [ana], 'match', NOW);
  assert.equal(s.users[0].active, true);
});

test('start: a device made by hand, copied or imported keeps its type, whatever its history', () => {
  const s = { history: {}, objs: [
    { id: 'a', type: 'pc', model: 'HP ProLiant DL380 Gen9', feed: { assetType: 'Windows' }, pick: { type: 'hand' } },
    { id: 'b', type: 'pc', model: 'HP ProLiant DL380 Gen9', feed: { assetType: 'Windows' } },
    { id: 'c', type: 'pc', model: 'HP ProLiant DL380 Gen9', graph: { id: 'g' } },
  ] };
  s.history.b = [{ t: '2', msg: 'Linked to Lansweeper' }, { t: '1', msg: 'Imported from CSV' }];
  s.history.c = [{ t: '3', msg: 'Name changed' }, { t: '2', msg: 'Created manually by Admin' }, { t: '1', msg: 'older' }];
  migrateState(s);
  assert.deepEqual(s.objs.map(o => o.type), ['pc', 'pc', 'pc']);
});
