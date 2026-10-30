import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateState } from '../server/migrate.js';
import { checkState } from '../server/state.js';

/* Notes are one text box (o.notes). The entries of before (a title, a text and a link each) become its lines. */
const base = (extra) => ({ objs: [{ id: 'pc', code: 'INV-0001', type: 'pc', name: 'PC1', status: 'active', ovr: {}, feed: null, ...extra }], rels: [], users: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 1, rseq: 0, types: {}, history: {} });

test('the note entries of before become lines of the one notes text', () => {
  const s = base({ notes: 'Old text', entries: [{ title: 'Warranty', text: 'until 2027' }, { title: 'Manual', link: 'https://files.example.ch/a.pdf' }] });
  assert.equal(migrateState(s), true);
  assert.equal(s.objs[0].entries, undefined);
  assert.equal(s.objs[0].notes, 'Old text\nWarranty — until 2027\nManual — https://files.example.ch/a.pdf');
  assert.equal(migrateState(s), false, 'a second migration changes nothing');
  const t = base({ entries: [] }); migrateState(t);
  assert.equal(t.objs[0].notes, undefined, 'no entries, no notes');
});

test('the notes are text of up to 5000 characters', () => {
  assert.doesNotThrow(() => checkState(base({ notes: 'Papers in the blue folder' })));
  assert.throws(() => checkState(base({ notes: 'x'.repeat(5001) })), /5000/);
  assert.throws(() => checkState(base({ notes: 42 })), /notes/);
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

test('a connection VLAN saved as text is made a number and added to the VLAN list, so the state can be saved', () => {
  const s = base();
  s.objs.push({ ...base().objs[0], id: 'sw', name: 'SW1', code: 'INV-0002' });
  s.rels = [{ id: 'r1', from: 'pc', to: 'sw', kind: 'uplink', port: null, vlan: '8' }];
  assert.equal(migrateState(s), true);
  assert.equal(s.rels[0].vlan, 8);
  assert.deepEqual(s.vlans, [{ vid: 8, name: 'VLAN 8' }]);
  assert.doesNotThrow(() => checkState(s));
});

test('a connection VLAN that is not a VLAN id is cleared, so an old bad value cannot stop the server from starting', () => {
  const s = base();
  s.objs.push({ ...base().objs[0], id: 'sw', name: 'SW1', code: 'INV-0002' });
  s.rels = [{ id: 'r1', from: 'pc', to: 'sw', kind: 'uplink', port: null, vlan: 'n/a' }];
  migrateState(s);
  assert.equal(s.rels[0].vlan, null);
  assert.doesNotThrow(() => checkState(s));
});

test('a device can be marked not in use and stays in the inventory', () => {
  const s = base();
  s.objs[0].status = 'unused';
  assert.doesNotThrow(() => checkState(s));
  s.objs[0].status = 'gone';
  assert.throws(() => checkState(s));
});
