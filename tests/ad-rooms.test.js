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

test('renamed in AD: the device keeps its room, no second room is made; without the rooms setting nothing moves', () => {
  /* The device was in Main / Presse 1 through its AD text "Presse 1"; AD now says "Presse 2". */
  const was = more => state({ locs: ['Main / Office', 'Main / Presse 1'], locMap: { 'Presse 1': 'Main / Presse 1' },
    objs: [{ id: 'o1', code: 'INV-0001', type: 'pc', name: 'PRESS-PC', status: 'active', loc: 'Main / Presse 1', src: { loc: 'ad' }, ad: { location: 'Presse 1' } }], ...more });
  const renamed = { ...comp, location: 'Presse 2' };
  const s = was({ adLocAuto: 'Main' });
  applyComputers(s, [renamed]);
  assert.deepEqual(s.locs, ['Main / Office', 'Main / Presse 1'], 'no Main / Presse 2');
  assert.equal(s.locMap['Presse 2'], 'Main / Presse 1');
  assert.equal(s.objs[0].loc, 'Main / Presse 1');
  assert.equal(s.objs[0].ad.location, 'Presse 2');
  /* Off: the new text names no room, so AD gives no location and the device stays where it is. */
  const t = was();
  applyComputers(t, [renamed]);
  assert.equal(t.objs[0].loc, 'Main / Presse 1');
  assert.ok(!('Presse 2' in t.locMap));
  /* A device that never had the old text is not taken for a rename: a new room as before. */
  const u = was({ adLocAuto: 'Main' }); delete u.objs[0].ad;
  applyComputers(u, [renamed]);
  assert.ok(u.locs.includes('Main / Presse 2'));
});

test('a device moved in AD is no rename: another account still gives the old text, so a room of the new text is made', () => {
  const s = state({ adLocAuto: 'Main', locs: ['Main / Office', 'Main / Presse 1'], locMap: { 'Presse 1': 'Main / Presse 1' },
    objs: [{ id: 'o1', code: 'INV-0001', type: 'pc', name: 'PRESS-PC', status: 'active', loc: 'Main / Presse 1', src: { loc: 'ad' }, ad: { location: 'Presse 1' } },
      { id: 'o2', code: 'INV-0002', type: 'pc', name: 'PRESS-PC2', status: 'active', loc: 'Main / Presse 1', src: { loc: 'ad' }, ad: { location: 'Presse 1' } }] });
  applyComputers(s, [{ ...comp, location: 'Werkstatt' }, { name: 'PRESS-PC2', dns: 'press-pc2.corp.example', location: 'Presse 1', groups: [] }]);
  assert.ok(s.locs.includes('Main / Werkstatt'), 'a room of its own');
  assert.equal(s.locMap.Werkstatt, 'Main / Werkstatt');
  assert.equal(s.objs[0].loc, 'Main / Werkstatt');
  assert.equal(s.objs[1].loc, 'Main / Presse 1');
});
