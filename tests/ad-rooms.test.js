/* Rooms from AD's location (Settings → Locations): off by default; set to a site, an AD sync makes a room of a location
   text that names none, maps the text to it and fills the device. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyComputers, autoRoom } from '../server/ldap-sync.js';

const state = more => ({ objs: [{ id: 'o1', code: 'INV-0001', type: 'pc', name: 'PRESS-PC', status: 'active', loc: '' }], rels: [], users: [], locs: ['Main / Office'], sites: ['Main'], history: {}, ...more });
const comp = { name: 'PRESS-PC', dns: 'press-pc.corp.example', location: 'Presse 1', groups: [] };

test('off: a text naming no room makes none', () => {
  const s = state();
  applyComputers(s, [comp]);
  assert.deepEqual(s.locs, ['Main / Office']);
  assert.equal(s.objs[0].loc, '');
});

test('set to a site: the room is made, mapped and filled in', () => {
  const s = state({ adLocAuto: 'Main' });
  applyComputers(s, [comp]);
  assert.ok(s.locs.includes('Main / Presse 1'));
  assert.equal(s.locMap['Presse 1'], 'Main / Presse 1');
  assert.equal(s.objs[0].loc, 'Main / Presse 1');
});

test('a slash in the text is no second level; an unknown site makes nothing', () => {
  const s = state({ adLocAuto: 'Main' });
  assert.equal(autoRoom(s, 'Hall 2 / Bay 4'), 'Main / Bay 4', 'as the page makes it: the room part');
});

test('the same room in another case is used; names stay within 200 characters; at most 1000 mapped texts', () => {
  const s = state({ adLocAuto: 'Main' });
  assert.equal(autoRoom(s, 'office'), 'Main / Office');
  assert.deepEqual(s.locs, ['Main / Office']);
  const long = 'S'.repeat(150), t = state({ adLocAuto: long, sites: [long] });
  assert.ok(autoRoom(t, 'R'.repeat(150)).length <= 200);
  const full = state({ adLocAuto: 'Main', locMap: Object.fromEntries(Array.from({ length: 1000 }, (_, i) => ['t' + i, 'Main / Office'])) });
  assert.equal(autoRoom(full, 'One more'), '');
  assert.equal(autoRoom({ ...state(), adLocAuto: 'Gone' }, 'Presse 1'), '');
});
