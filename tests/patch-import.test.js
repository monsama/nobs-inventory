/* The patch list import: columns guessed from their headings, each row checked, and the changes it makes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessPatchMapping, patchChanges, planPatchImport, swPortOf } from '../public/js/patch-import.js';
import { parseCsv } from '../public/js/csv.js';

const obj = (id, type, name, extra = {}) => ({ id, type, name, status: 'active', ...extra });
const ctx = () => ({
  objs: [
    obj('sw', 'switch', 'SW-01', { ports: 24, pfx: 'Gi1/0/' }),
    obj('pp', 'patch', 'PP-01', { ports: 4, outlets: { P01: { name: 'R12-01', loc: 'Site / Room 12' } } }),
    obj('pp2', 'patch', 'PP-02', { ports: 4, outlets: { P01: { name: 'R14-01' } } }),
    obj('pc', 'pc', 'PC-1'),
  ],
  rels: [{ id: 'd', from: 'pc', to: 'sw', kind: 'connected', port: 9 }, { id: 'c', from: 'pp', fromPort: 'P01', to: 'sw', port: 1, kind: 'patched' }],
  locs: ['Site / Room 12', 'Site / Room 14'],
});

test('the columns are found by their headings', () => {
  assert.deepEqual(guessPatchMapping(['Panel', 'Port', 'Outlet', 'Room', 'Switch', 'Switch port', 'Notes']), ['panel', 'port', 'outlet', 'room', 'switch', 'swport', '']);
  assert.deepEqual(guessPatchMapping(['patch_panel', 'PP Port', 'Wall outlet', 'Location', 'SW', 'SW-Port']), ['panel', 'port', 'outlet', 'room', 'switch', 'swport']);
});

test('a switch port is read as a number, with or without the switch naming', () => {
  const sw = { pfx: 'Gi1/0/' };
  assert.equal(swPortOf(sw, '12'), 12); assert.equal(swPortOf(sw, 'Gi1/0/12'), 12); assert.equal(swPortOf(sw, '1/12'), 12);
  assert.equal(swPortOf(sw, ''), null); assert.ok(Number.isNaN(swPortOf(sw, 'x')));
});

test('each row is checked: unknown panel or switch, port out of range, outlet name used, switch port taken', () => {
  const text = [
    'Panel;Port;Outlet;Room;Switch;Switch port',
    'PP-01;2;R12-02;Room 12;SW-01;Gi1/0/2',   // fine: room by its last part, port with the naming
    'PP-09;1;X;;SW-01;3',                      // unknown panel
    'PP-01;9;Y;;;',                            // beyond the panel
    'PP-01;3;R14-01;;;',                       // outlet on another panel
    'PP-01;4;Z;;SW-01;9',                      // switch port taken by a device
    'PP-01;4;;;SW-99;5',                       // the same panel port again, unknown switch
    'PP-01;1;R12-01;;SW-01;1',                 // its own cord and outlet: no conflict
    'PP-02;2;R12-02;Room 99;SW-01;2',          // outlet and switch port twice in the file, unknown room
    ';;;;;',                                   // empty: skipped
  ].join('\n');
  const rows = parseCsv(text), c = ctx();
  const plan = planPatchImport(rows.slice(1), guessPatchMapping(rows[0]), c);
  const errs = Object.fromEntries(plan.map(p => [p.line, p.errs.join(' | ')]));
  assert.equal(plan.length, 8, 'the empty row is left out');
  assert.equal(errs[2], '');
  assert.match(errs[3], /Unknown panel PP-09/);
  assert.match(errs[4], /ports P01 to P04/);
  assert.match(errs[5], /already on PP-02 P01/);
  assert.match(errs[6], /port 9 on SW-01 is taken/i);
  assert.match(errs[7], /on line 6 too/); assert.match(errs[7], /Unknown switch SW-99/);
  assert.equal(errs[8], '');
  assert.match(errs[9], /Outlet R12-02 is on line 2 too/); assert.match(errs[9], /SW-01 port 2 is on line 2 too/); assert.match(errs[9], /Unknown room Room 99/);
  const ch = patchChanges(plan);
  assert.deepEqual(ch.outlets.map(x => [x.panel.id, x.port, x.outlet]), [['pp', 'P02', { name: 'R12-02', loc: 'Site / Room 12' }], ['pp', 'P01', { name: 'R12-01', loc: 'Site / Room 12' }]]);
  assert.deepEqual(ch.cords.map(x => [x.panel.id, x.port, x.sw.id, x.swPort]), [['pp', 'P02', 'sw', 2]], 'P01 is patched so already');
});

test('a row with only a room needs an outlet there; a row with nothing to set is an error', () => {
  const c = ctx(), map = ['panel', 'port', 'outlet', 'room', 'switch', 'swport'];
  const plan = planPatchImport([['PP-01', 'P01', '', 'Room 14', '', ''], ['PP-01', 'P02', '', 'Room 14', '', ''], ['PP-01', 'P03', '', '', '', '']], map, c);
  assert.deepEqual(plan.map(p => p.errs), [[], ['A room needs an outlet name'], ['Nothing to set: no outlet and no switch']]);
  assert.deepEqual(patchChanges(plan).outlets[0].outlet, { name: 'R12-01', loc: 'Site / Room 14' }, 'the outlet keeps its name and moves room');
});
