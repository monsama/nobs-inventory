/* A device attached to another (a monitor on a PC) is where that device is: it takes its location (site and room),
   on the server after a sync and a save of the whole inventory, and a Lansweeper push does not move it elsewhere. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followHosts, attachedIds } from '../public/js/follow-host.js';

const dev = (id, more) => ({ id, code: 'INV-' + id, name: 'D-' + id, type: 'pc', status: 'active', loc: '', ovr: {}, ...more });
const att = (from, to) => ({ id: 'r' + from, from, to, kind: 'attached', port: null, vlan: null });

test('an attached device takes its host\'s location; retired, pending or a host without one are left', () => {
  const objs = [dev('pc', { loc: 'Main / Office' }), dev('m1', { type: 'monitor', loc: 'Main / Lab', src: { loc: 'ls' } }), dev('m2', { type: 'monitor' }),
    dev('m3', { type: 'monitor', status: 'retired', loc: 'Main / Store' }), dev('pc2'), dev('m4', { type: 'monitor', loc: 'Main / Lab' }), dev('m5', { type: 'monitor', review: { src: 'ls' } })];
  const notes = [];
  const n = followHosts(objs, [att('m1', 'pc'), att('m2', 'pc'), att('m3', 'pc'), att('m4', 'pc2'), att('m5', 'pc')], (o, msg) => notes.push([o.id, msg]));
  assert.equal(n, 2);
  const loc = id => objs.find(o => o.id === id).loc;
  assert.deepEqual(['m1', 'm2', 'm3', 'm4', 'm5'].map(loc), ['Main / Office', 'Main / Office', 'Main / Store', 'Main / Lab', '']);
  assert.equal(objs[1].src, undefined, 'its own source no longer says where it is');
  assert.deepEqual(notes, [['m1', 'Location changed from Main / Lab to Main / Office: it is attached to D-pc'], ['m2', 'Location set to Main / Office: it is attached to D-pc']]);
  assert.equal(followHosts(objs, [att('m1', 'pc')]), 0, 'nothing more the second time');
  assert.deepEqual([...attachedIds([att('m1', 'pc'), { from: 'v', to: 'h', kind: 'hosted' }])], ['m1']);
});

test('a Lansweeper push gives the host its room; the monitor follows and Lansweeper\'s own room for it is not used', async () => {
  const { mergeRecords, recordsFromJson } = await import('../server/feed.js');
  const { followHosts: follow } = await import('../public/js/follow-host.js');
  const s = { objs: [dev('pc', { name: 'WS-01', feed: { sys: 'Lansweeper', ref: '1' } }), dev('m', { type: 'monitor', name: 'MON-1', serial: 'S1', feed: { sys: 'Lansweeper', ref: '2' } })],
    rels: [att('m', 'pc')], users: [], policy: { loc: true }, locs: ['Main / Office', 'Main / Lab', 'Main / Hall'], sites: ['Main'], seq: 100, codeN: 0, rseq: 0, types: {}, history: {}, feedOn: true,
    locMap: { 'Lab': 'Main / Lab', 'Hall': 'Main / Hall' } };
  mergeRecords(s, recordsFromJson([{ name: 'WS-01', ref: '1', assetType: 'Windows', role: 'workstation', location: 'Lab' }, { name: 'MON-1', ref: '2', assetType: 'Monitor', serial: 'S1', location: 'Hall' }]), new Date(2026, 10, 23), []);
  follow(s.objs, s.rels, (o, msg) => (s.history[o.id] ??= []).unshift({ msg }));
  const loc = id => s.objs.find(o => o.id === id).loc;
  assert.equal(loc('pc'), 'Main / Lab');
  assert.equal(loc('m'), 'Main / Lab', 'with its computer, not in the Hall Lansweeper names for it');
  assert.ok(!(s.history.m || []).some(h => /Hall/.test(h.msg)));
});

test('a save of the whole inventory (what the sync jobs do) brings attached devices to their host', async () => {
  const { openDb } = await import('../server/db.js');
  const { loadState, saveState } = await import('../server/state.js');
  const { bootstrap } = await import('../server/index.js');
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-follow-'));
  const db = openDb(path.join(dir, 'inventory.db'));
  try {
    bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
    saveState(db, { ...loadState(db), sites: ['Main'], locs: ['Main / Office'], objs: [dev('pc', { loc: 'Main / Office' }), dev('m', { type: 'monitor' })], rels: [att('m', 'pc')], history: {} });
    const s = loadState(db);
    assert.equal(s.objs.find(o => o.id === 'm').loc, 'Main / Office');
    assert.match(s.history.m[0].msg, /Location set to Main \/ Office: it is attached to D-pc/);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sweep: a retired host keeps nothing with it; a source picked for the location goes, so AD does not move it back', () => {
  const objs = [dev('pc', { loc: 'Store / Disposal', status: 'retired' }), dev('m', { type: 'monitor', loc: 'Main / Office' }),
    dev('pc2', { loc: 'Main / Lab' }), dev('d', { type: 'other', loc: 'Main / Office', pick: { loc: 'ad' }, src: { loc: 'ad' } }), null];
  followHosts(objs, [att('m', 'pc'), att('d', 'pc2')]);
  assert.equal(objs[1].loc, 'Main / Office', 'not to the disposal room');
  assert.equal(objs[3].loc, 'Main / Lab');
  assert.equal(objs[3].pick, undefined);
});
