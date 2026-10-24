import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateState } from '../server/migrate.js';
import { checkState } from '../server/state.js';

/* Notes are entries (a title, a text and an optional http(s) link). An old one-text note becomes the first entry. */
const base = (extra) => ({ objs: [{ id: 'pc', code: 'INV-0001', type: 'pc', name: 'PC1', status: 'active', ovr: {}, feed: null, ...extra }], rels: [], users: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 1, rseq: 0, types: {}, history: {} });

test('an old note text becomes the first entry, and is not kept as a text', () => {
  const s = base({ notes: 'Warranty until 2027' });
  assert.equal(migrateState(s), true);
  assert.equal(s.objs[0].notes, undefined);
  assert.deepEqual(s.objs[0].entries, [{ title: 'Note', text: 'Warranty until 2027' }]);
  assert.equal(migrateState(s), false, 'a second migration changes nothing');
});

test('an attachment link must be http or https', () => {
  assert.doesNotThrow(() => checkState(base({ entries: [{ title: 'Doc', text: '', link: 'https://files.example.ch/a.pdf' }] })));
  assert.throws(() => checkState(base({ entries: [{ title: 'Doc', link: 'file:///C:/a.pdf' }] })), /http/);
});

test('the attachment text of a PC becomes accessories, one per line or comma', () => {
  const s = base({ attach: 'Headset, Dock\nKeyboard' });
  assert.equal(migrateState(s), true);
  assert.equal(s.objs[0].attach, undefined);
  assert.deepEqual(s.objs[0].accessories.map(a => a.name), ['Headset', 'Dock', 'Keyboard']);
});

test('an attachment needs a name', () => {
  assert.throws(() => checkState(base({ accessories: [{ name: '  ' }] })), /needs a name/);
  assert.doesNotThrow(() => checkState(base({ accessories: [{ name: 'Headset', kind: 'Audio', serial: 'HS-9' }] })));
});

test('a VLAN id that is not a number from 1 to 4094 is not added to the VLAN list', () => {
  const s = base();
  s.rels = [{ id: 'r1', from: 'pc', to: 'pc', kind: 'uplink', port: null, vlan: 9999 }, { id: 'r2', from: 'pc', to: 'pc', kind: 'uplink', port: null, vlan: 'x' }];
  migrateState(s);
  assert.equal((s.vlans || []).length, 0);
});

test('a valid VLAN id on a connection is added to the VLAN list', () => {
  const s = base();
  s.rels = [{ id: 'r1', from: 'pc', to: 'pc', kind: 'uplink', port: null, vlan: 20 }];
  migrateState(s);
  assert.deepEqual(s.vlans, [{ vid: 20, name: 'VLAN 20' }]);
});

test('an old Lansweeper update text is cleared on synced devices, a commissioning date is kept', () => {
  const s = base({ feed: { ref: 'x' }, patch: 'KB5034441 (2026-10-01)' });
  s.objs.push({ ...base().objs[0], id: 'pc2', feed: { ref: 'y' }, patch: '2026-03-01' });
  migrateState(s);
  assert.equal(s.objs[0].patch, undefined);
  assert.equal(s.objs[1].patch, '2026-03-01');
});
