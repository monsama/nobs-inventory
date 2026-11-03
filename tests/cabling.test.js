/* Structured cabling: outlets on panel ports, patch cords to switch ports, the way up through them, and their checks. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allOutlets, cordProblem, findOutlet, netChain, outletClash, outletNames, outletPlan, patchGaps, patchPlan, portState, swPortProblem, viaOf } from '../public/js/cabling.js';
import { checkState } from '../server/state.js';
import { migrateState } from '../server/migrate.js';
import { notices } from '../public/js/notices.js';

const obj = (id, type, name, extra = {}) => ({ id, code: 'INV-' + id, type, name, status: 'active', ovr: {}, feed: null, ...extra });
const world = (rels = [], panel = {}) => {
  const objs = [
    obj('sw', 'switch', 'SW-01', { ports: 24, sfp: 4, pfx: '1/' }),
    obj('core', 'switch', 'SW-CORE', { ports: 24 }),
    obj('pp', 'patch', 'PP-01', { ports: 4, outlets: { P01: { name: 'R12-01' }, P02: { name: 'R12-02', loc: 'Site / Room 12' } }, ...panel }),
    obj('pp2', 'patch', 'PP-02', { ports: 4 }),
    obj('pc', 'pc', 'PC-0142', { user: 'Anna Muster' }),
    obj('pr', 'printer', 'PRN-01'),
  ];
  const all = [{ id: 'up', from: 'sw', to: 'core', kind: 'uplink', port: 1 }, ...rels];
  const byId = id => objs.find(o => o.id === id);
  return { objs, rels: all, byId, state: { objs, rels: all, users: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 10, rseq: 0, types: {}, history: {} } };
};
const cord = (id, fromPort, port, from = 'pp', to = 'sw') => ({ id, from, fromPort, to, port, kind: 'patched', vlan: null });
const plug = (id, from, port, to = 'pp') => ({ id, from, to, port, kind: 'connected', vlan: null });

test('path: a device on an outlet goes outlet → panel port → its own patch cord → switch → uplinks', () => {
  const w = world([cord('c2', 'P02', 6), cord('c1', 'P01', 5), plug('p', 'pc', 'P02')]);
  const chain = netChain(w.byId('pc'), w.rels, w.byId);
  assert.deepEqual(chain.map(n => n.o.name), ['PC-0142', 'PP-01', 'SW-01', 'SW-CORE']);
  assert.deepEqual(chain[1].outlet, { name: 'R12-02', loc: 'Site / Room 12', port: 'P02' }, 'the outlet is a hop with its room');
  assert.equal(chain[2].via.id, 'c2', 'the cord of the port it came in on, not the first cord of the panel');
  assert.equal(chain[2].via.port, 6);
});

test('path: a panel port without a cord of its own takes the panel trunk, as before', () => {
  const w = world([cord('c1', 'P01', 5), { id: 't', from: 'pp', to: 'sw', kind: 'connected', port: 20 }, plug('p', 'pc', 'P03')]);
  const chain = netChain(w.byId('pc'), w.rels, w.byId);
  assert.deepEqual(chain.map(n => n.o.name), ['PC-0142', 'PP-01', 'SW-01', 'SW-CORE']);
  assert.equal(chain[2].via.id, 't', 'the trunk');
  assert.equal(chain[1].outlet, undefined, 'P03 has no outlet');
});

test('path: old data, a panel with a trunk only, paths as before', () => {
  const w = world([{ id: 't', from: 'pp2', to: 'sw', kind: 'connected', port: 20 }, plug('p', 'pc', 'P01', 'pp2')]);
  assert.deepEqual(netChain(w.byId('pc'), w.rels, w.byId).map(n => [n.o.name, n.via ? n.via.id : null]), [['PC-0142', null], ['PP-02', 'p'], ['SW-01', 't'], ['SW-CORE', 'up']]);
  assert.deepEqual(netChain(w.byId('pp2'), w.rels, w.byId).map(n => n.o.name), ['PP-02', 'SW-01', 'SW-CORE'], 'from the panel itself: its trunk');
  assert.equal(portState(w.byId('pp2'), 'P01', w.rels).state, 'ok');
});

test('path: a panel port with neither a cord nor a trunk ends at the panel', () => {
  const w = world([cord('c1', 'P01', 5), plug('p', 'pc', 'P02')]);
  assert.deepEqual(netChain(w.byId('pc'), w.rels, w.byId).map(n => n.o.name), ['PC-0142', 'PP-01']);
});

test('switch side: a patched port leads to the panel port, its outlet and the device', () => {
  const w = world([cord('c2', 'P02', 6), cord('c1', 'P01', 5), plug('p', 'pc', 'P02')]);
  const v = viaOf(w.byId('sw'), 6, w.rels, w.byId);
  assert.equal(v.panel.name, 'PP-01'); assert.equal(v.port, 'P02'); assert.equal(v.outlet.name, 'R12-02'); assert.equal(v.device.name, 'PC-0142');
  const free = viaOf(w.byId('sw'), 5, w.rels, w.byId);
  assert.equal(free.device, null); assert.equal(free.outlet.name, 'R12-01');
  assert.equal(viaOf(w.byId('sw'), 7, w.rels, w.byId), null);
});

test('port state: green with outlet, cord and device; amber when it leads nowhere or a cord has no outlet; grey ring unused', () => {
  const w = world([cord('c2', 'P02', 6), cord('c3', 'P03', 7), plug('p', 'pc', 'P02'), plug('q', 'pr', 'P04')]);
  const s = p => portState(w.byId('pp'), p, w.rels).state;
  assert.equal(s('P02'), 'ok');
  assert.equal(s('P03'), 'warn', 'a cord to no outlet');
  assert.equal(s('P04'), 'warn', 'a device with no cord and no trunk');
  assert.equal(s('P01'), 'off', 'an outlet with nothing on it');
  assert.deepEqual(patchGaps(w.objs, w.rels).map(o => o.name), ['PRN-01']);
});

test('the patch list gaps notice lists devices on a port that leads nowhere', () => {
  const w = world([plug('q', 'pr', 'P04')]);
  const n = notices(w.state).find(x => x.id === 'patch-gaps');
  assert.equal(n.sev, 'warn'); assert.match(n.text, /PRN-01/); assert.deepEqual(n.go, { device: 'pr' });
  assert.equal(notices({ objs: w.objs }).some(x => x.id === 'patch-gaps'), false, 'without relations, no notice');
});

test('outlets: names from a pattern over a range, and their preview', () => {
  assert.deepEqual(outletNames('2.OG-R12-{n}', 3, 4), [{ port: 'P03', name: '2.OG-R12-03' }, { port: 'P04', name: '2.OG-R12-04' }]);
  assert.deepEqual(outletNames('A-{#}', 9, 10).map(x => x.name), ['A-9', 'A-10']);
  assert.deepEqual(outletNames('R12-', 1, 1).map(x => x.name), ['R12-01'], 'no placeholder: the number at the end');
  assert.deepEqual(outletNames('', 1, 2), []);
  const w = world([], {});
  w.byId('pp2').outlets = { P01: { name: 'X-01' } };
  const plan = outletPlan(w.byId('pp'), [{ port: 'P03', name: 'X-01' }, { port: 'P04', name: 'R12-01' }, { port: 'P05', name: 'Y' }], w.objs);
  assert.match(plan[0].err, /Already used on PP-02 P01/);
  assert.match(plan[1].err, /Already used on P01/, 'P01 keeps its name unless it is renamed too');
  assert.match(plan[2].err, /no port P05/);
  const ren = outletPlan(w.byId('pp'), [{ port: 'P01', name: 'R12-09' }, { port: 'P04', name: 'R12-01' }], w.objs);
  assert.deepEqual(ren.map(p => [p.err, p.was]), [['', 'R12-01'], ['', '']], 'a name freed by a rename in the same go can be used');
  const re = outletPlan(w.byId('pp'), [{ port: 'P01', name: 'R12-02' }, { port: 'P02', name: 'R12-01' }], w.objs);
  assert.deepEqual(re.map(p => p.err), ['', ''], 'two names swapped in one go');
});

test('outlets: found by name, case aside, with their panel and port', () => {
  const w = world();
  assert.equal(allOutlets(w.objs).length, 2);
  const x = findOutlet(w.objs, 'r12-02');
  assert.equal(x.panel.id, 'pp'); assert.equal(x.port, 'P02');
  assert.equal(findOutlet(w.objs, 'nope'), null);
});

test('patch range: one to one, with taken ports, LAG members and the end of the switch as conflicts', () => {
  const w = world([plug('q', 'pr', 7, 'sw'), cord('c1', 'P01', 5)]);
  w.byId('sw').portGroups = [{ name: 'Up', from: 27, to: 28, lag: true }];
  const plan = patchPlan(w.byId('pp'), 1, 4, w.byId('sw'), 5, w.rels, w.byId);
  assert.deepEqual(plan.map(p => [p.port, p.swPort]), [['P01', 5], ['P02', 6], ['P03', 7], ['P04', 8]]);
  assert.equal(plan[0].same, true, 'P01 is patched so already');
  assert.match(plan[2].err, /taken/);
  assert.equal(plan[1].err, ''); assert.equal(plan[3].err, '');
  const far = patchPlan(w.byId('pp'), 1, 2, w.byId('sw'), 27, w.rels, w.byId);
  assert.match(far[0].err, /LAG Up/);
  assert.match(patchPlan(w.byId('pp'), 1, 1, w.byId('sw'), 29, w.rels, w.byId)[0].err, /ports 1 to 28/);
  const moved = patchPlan(w.byId('pp'), 1, 1, w.byId('sw'), 9, w.rels, w.byId)[0];
  assert.equal(moved.err, ''); assert.equal(moved.was, 'SW-01 port 5', 'the cord it replaces');
});

test('port taken: a patched switch port is taken for a device, and a device port for a cord', () => {
  const w = world([cord('c1', 'P01', 5), plug('q', 'pr', 7, 'sw')]);
  assert.match(swPortProblem(w.byId('sw'), 5, w.rels), /taken by a cord from P01/);
  assert.equal(swPortProblem(w.byId('sw'), 5, w.rels, { panel: w.byId('pp'), panelPort: 'P01' }), '', 'its own cord does not block it');
  assert.match(swPortProblem(w.byId('sw'), 7, w.rels), /taken/);
  assert.throws(() => checkState(w.state = { ...w.state, rels: [...w.rels, plug('x', 'pc', 5, 'sw')] }), /used twice/, 'the server refuses a device on a patched port');
});

test('server: outlets and cords are checked', () => {
  assert.doesNotThrow(() => checkState(world([cord('c1', 'P01', 5), plug('p', 'pc', 'P01')]).state));
  const bad = (panel, re) => assert.throws(() => checkState(world([], panel).state), re);
  bad({ outlets: { P09: { name: 'A' } } }, /P09 is not one of its ports/);
  bad({ outlets: { X1: { name: 'A' } } }, /X1 is not one of its ports/);
  bad({ outlets: { P01: { name: '' } } }, /needs a name/);
  bad({ outlets: { P01: { name: 'x'.repeat(61) } } }, /needs a name of up to 60/);
  bad({ outlets: { P01: { name: 'A', loc: 5 } } }, /room/);
  bad({ outlets: { P01: { name: 'A', extra: 1 } } }, /a name and a room only/);
  bad({ outlets: [] }, /must be an object/);
  bad({ ports: 1, outlets: { P01: { name: 'A' }, P02: { name: 'B' } } }, /2 outlets but 1 ports/);
  bad({ outlets: { P01: { name: 'A' }, P02: { name: 'a' } } }, /two of its outlets/);
  const w = world();
  w.byId('pp2').outlets = { P01: { name: 'R12-01' } };
  assert.throws(() => checkState(w.state), /R12-01 is on PP-01 and on PP-02/);
  assert.match(outletClash(w.objs), /R12-01/);
  const cords = rels => assert.throws(() => checkState(world(rels).state), /./);
  cords([cord('c1', 'P01', 5), cord('c2', 'P01', 6)]);   // two cords on one panel port
  cords([cord('c1', 'P09', 5)]);   // beyond the panel
  cords([cord('c1', 'P01', 40)]);   // beyond the switch
  cords([cord('c1', 'P01', 5, 'pc')]);   // not from a panel
  cords([cord('c1', 'P01', 5, 'pp', 'pp2')]);   // to another panel
  cords([cord('c1', 'P01', 5), cord('c2', 'P02', 5)]);   // one switch port twice
  cords([{ ...plug('p', 'pc', 3, 'sw'), fromPort: 'P01' }]);   // fromPort on a connection
  assert.match(cordProblem(cord('c', 'P01', null), world().byId), /needs a port number/);
});

test('migration keeps a patch cord and turns only an old patched connection into connected', () => {
  const w = world([cord('c1', 'P01', 5), { id: 'old', from: 'pc', to: 'sw', kind: 'patched', port: 3 }]);
  migrateState(w.state);
  assert.deepEqual(w.state.rels.map(r => r.kind), ['uplink', 'patched', 'connected']);
  assert.equal(migrateState(w.state), false);
  assert.doesNotThrow(() => checkState(w.state));
});
