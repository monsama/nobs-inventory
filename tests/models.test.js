import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelFor, mergeRecords } from '../server/feed.js';
import { checkState } from '../server/state.js';

/* A model renamed in Settings keeps its Lansweeper name mapped to the new one, so the sync does not bring the old name back. */
const s = { modelMap: { 'Dell Latitude 5420': 'Latitude 14', 'hp elitebook': 'EliteBook 840' } };

test('a Lansweeper model with a rename is given the new name, in any letter case', () => {
  assert.equal(modelFor(s, 'Dell Latitude 5420'), 'Latitude 14');
  assert.equal(modelFor(s, 'DELL LATITUDE 5420'), 'Latitude 14');
});

test('a Lansweeper model without a rename is kept as it comes', () => {
  assert.equal(modelFor(s, 'ThinkPad T14'), 'ThinkPad T14');
  assert.equal(modelFor(s, undefined), '');
});

test('a sync does not overwrite a renamed model with the old Lansweeper name', () => {
  const state = { objs: [], rels: [], users: [], policy: {}, modelMap: s.modelMap };
  const obj = { id: 'pc', code: 'INV-0001', type: 'pc', name: 'PC1', serial: 'SN1', status: 'active', model: 'Latitude 14', ovr: {}, feed: { ref: 'x', seen: '' } };
  state.objs.push(obj);
  mergeRecords(state, [{ name: 'PC1', serial: 'SN1', model: 'Dell Latitude 5420' }]);
  assert.equal(obj.model, 'Latitude 14');
});

test('a model map must map text to text', () => {
  const base = { objs: [], rels: [], users: [], types: {}, history: {}, locs: [], sites: [], vlans: [], domains: [], typeFields: {}, racks: [], policy: null, feedOn: true, feedSync: true, ldap: null, mapPos: {}, seq: 100, codeN: 0, rseq: 0 };
  assert.doesNotThrow(() => checkState({ ...base, modelMap: { 'Old': 'New' } }));
  assert.throws(() => checkState({ ...base, modelMap: ['Old', 'New'] }), /model name/);
  assert.throws(() => checkState({ ...base, modelMap: { 'Old': 42 } }), /model name/);
});
