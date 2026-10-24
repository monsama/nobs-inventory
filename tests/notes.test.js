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
