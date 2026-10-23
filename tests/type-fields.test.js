import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkState } from '../server/state.js';

/* Fields a type has beyond the built-in ones: a key, a label and text or number. An object keeps its values under custom. */
const base = (extra = {}) => ({ objs: [{ id: 'pc', code: 'INV-0001', type: 'pc', name: 'PC1', status: 'active', ovr: {}, feed: null, ...extra }], rels: [], users: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 1, rseq: 0, types: {}, history: {} });

test('a type can have fields, and an object keeps their values', () => {
  const s = base({ custom: { asset_tag: 'AT-42', rack_units: 2, note: null } });
  s.typeFields = { pc: [{ key: 'asset_tag', label: 'Asset tag', kind: 'text' }, { key: 'rack_units', label: 'Rack units', kind: 'number' }] };
  assert.doesNotThrow(() => checkState(s));
});

test('a field key must be lowercase letters, digits and underscores, starting with a letter', () => {
  const s = base(); s.typeFields = { pc: [{ key: 'Asset Tag', label: 'Asset tag', kind: 'text' }] };
  assert.throws(() => checkState(s), /needs a key/);
});

test('a field is text or number', () => {
  const s = base(); s.typeFields = { pc: [{ key: 'date', label: 'Date', kind: 'date' }] };
  assert.throws(() => checkState(s), /text or number/);
});

test('a field key is listed once per type', () => {
  const s = base(); s.typeFields = { pc: [{ key: 'a', label: 'A', kind: 'text' }, { key: 'a', label: 'B', kind: 'text' }] };
  assert.throws(() => checkState(s), /listed twice/);
});

test('an object value is text or a number', () => {
  assert.throws(() => checkState(base({ custom: { tag: { nested: true } } })), /its own fields|the value of tag/);
});
