/* Editing fields of many devices at once: the fields offered, values checked as the device page checks them, which
   devices change and how, and the history line each change gets. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BULK_UNIQUE, bulkFields, changedDevices, fieldSummary, historyLine, ownedNote, parseBulkValue, planBulk, shownValue } from '../public/js/bulk-edit.js';
import { fieldRestore } from '../public/js/restore.js';

const TYPES = {
  pc: [['name', 'Name'], ['model', 'Model'], ['serial', 'Serial number'], ['purchased', 'Purchased', 'date'], ['warranty', 'Warranty ends', 'date'], ['price', 'Price', 'money'], ['supplier', 'Supplier'], ['invoice', 'Invoice no.', 'mono'], ['ip', 'IP address'], ['os', 'Operating system'], ['custom.asset', 'Asset tag', 'text']],
  monitor: [['name', 'Name'], ['model', 'Model'], ['purchased', 'Purchased', 'date'], ['warranty', 'Warranty ends', 'date'], ['price', 'Price', 'money'], ['supplier', 'Supplier'], ['invoice', 'Invoice no.', 'mono'], ['custom.size', 'Size', 'number']],
};
const fieldsOf = t => TYPES[t] || [];
const ctx = {
  parseDay: t => { const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(t); return m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null; },
  num: t => /^\d+(\.\d+)?$/.test(t) ? +t : undefined,
};
const devs = () => [
  { id: 'a', name: 'PC-1', type: 'pc', supplier: 'Alpha', notes: 'old note', custom: { asset: 'A1' } },
  { id: 'b', name: 'PC-2', type: 'pc', supplier: 'Beta', os: 'Windows 10', feed: { ref: 'r' } },
  { id: 'c', name: 'MON-1', type: 'monitor', notes: 'cable missing', custom: { size: 27 } },
];

test('the fields offered: the editable built-in ones the picked types have, notes, and the types\' own fields', () => {
  const f = bulkFields(devs(), fieldsOf);
  assert.deepEqual(f.map(x => x.k), ['model', 'supplier', 'purchased', 'warranty', 'price', 'invoice', 'os', 'notes', 'custom.asset', 'custom.size']);
  for (const k of BULK_UNIQUE) assert.ok(!f.some(x => x.k === k), `${k} is not offered`);
  assert.deepEqual(f.find(x => x.k === 'os').types, ['pc'], 'only the PCs have an operating system');
  assert.deepEqual(f.find(x => x.k === 'supplier').types, ['pc', 'monitor']);
  assert.equal(f.find(x => x.k === 'purchased').kind, 'date');
  assert.equal(f.find(x => x.k === 'custom.size').kind, 'number');
  assert.deepEqual(bulkFields([devs()[2]], fieldsOf).map(x => x.k), ['model', 'supplier', 'purchased', 'warranty', 'price', 'invoice', 'notes', 'custom.size']);
});

test('values are checked as on the device page: days, prices, numbers, lengths', () => {
  const f = Object.fromEntries(bulkFields(devs(), fieldsOf).map(x => [x.k, x]));
  assert.deepEqual(parseBulkValue(f.purchased, '31.12.2026', ctx), { ok: true, value: '2026-12-31' });
  assert.match(parseBulkValue(f.purchased, '31.12.', ctx).msg, /not a day/);
  assert.deepEqual(parseBulkValue(f.price, '1290', ctx), { ok: true, value: 1290 });
  assert.match(parseBulkValue(f.price, 'abc', ctx).msg, /price is a number/);
  assert.deepEqual(parseBulkValue(f['custom.size'], '24,5', ctx), { ok: true, value: 24.5 });
  assert.match(parseBulkValue(f['custom.size'], 'big', ctx).msg, /not a number/);
  assert.deepEqual(parseBulkValue(f.supplier, '  Acme  ', ctx), { ok: true, value: 'Acme' });
  assert.match(parseBulkValue(f.supplier, '   ', ctx).msg, /Type a value for Supplier, or choose Clear/);
  assert.match(parseBulkValue(f.supplier, 'x'.repeat(501), ctx).msg, /up to 500/);
  assert.equal(parseBulkValue(f.notes, 'x'.repeat(5000) + '\n', ctx).value.length, 5000, 'notes: long text, trailing space dropped');
});

test('which devices change: set, clear, only where empty, a type without the field, a value already there', () => {
  const list = devs(), fields = bulkFields(list, fieldsOf);
  const ownerOf = (o, k) => o.feed && k === 'supplier' ? 'ls' : '';
  const plan = planBulk(list, [
    { k: 'supplier', op: 'set', raw: 'Alpha' },
    { k: 'notes', op: 'clear', raw: 'ignored' },
    { k: 'os', op: 'set', raw: 'Windows 11' },
    { k: 'model', op: 'set', raw: 'M1', onlyEmpty: true },
  ], fields, { ...ctx, ownerOf });
  assert.deepEqual(plan.errors, []);
  const [sup, notes, os, model] = plan.fields;
  assert.deepEqual(sup.changes.map(c => [c.o.id, c.from, c.to]), [['b', 'Beta', 'Alpha'], ['c', undefined, 'Alpha']]);
  assert.equal(sup.same, 1);
  assert.deepEqual(sup.owned, { ls: 1 });
  assert.equal(ownedNote(sup, { ls: 'Lansweeper' }), '1 device takes this from Lansweeper: setting it here keeps your value.');
  assert.equal(ownedNote(notes, { ls: 'Lansweeper' }), '');
  assert.deepEqual(notes.changes.map(c => [c.o.id, c.from, c.to]), [['a', 'old note', undefined], ['c', 'cable missing', undefined]]);
  assert.equal(notes.same, 1);
  assert.deepEqual(os.changes.map(c => c.o.id), ['a', 'b']);
  assert.equal(os.without, 1, 'a monitor has no operating system');
  assert.equal(model.changes.length, 3);
  assert.deepEqual(changedDevices(plan).map(o => o.id), ['b', 'c', 'a']);
  assert.equal(fieldSummary(sup, 3), 'Supplier: 2 of 3 devices change (1 already has it)');
  assert.equal(fieldSummary(notes, 3), 'Notes: 2 of 3 devices cleared (1 already empty)');
  assert.equal(fieldSummary(os, 3), 'Operating system: 2 of 3 devices change (1 without this field)');
  // only where empty leaves values alone
  const kept = planBulk(list, [{ k: 'supplier', op: 'set', raw: 'Gamma', onlyEmpty: true }], fields, ctx).fields[0];
  assert.deepEqual(kept.changes.map(c => c.o.id), ['c']);
  assert.equal(fieldSummary(kept, 3), 'Supplier: 1 of 3 devices change (2 have a value, left as it is)');
  // a custom field: only the devices whose type has it; a number stays a number
  const size = planBulk(list, [{ k: 'custom.size', op: 'set', raw: '24' }], fields, ctx).fields[0];
  assert.deepEqual(size.changes.map(c => [c.o.id, c.from, c.to]), [['c', 27, 24]]);
  assert.equal(size.without, 2);
});

test('mistakes stop the edit: a bad value, a field picked twice, no field', () => {
  const list = devs(), fields = bulkFields(list, fieldsOf);
  const plan = planBulk(list, [{ k: 'price', op: 'set', raw: 'ten' }, { k: 'warranty', op: 'set', raw: 'soon' }, { k: 'supplier', op: 'set', raw: 'A' }, { k: 'supplier', op: 'clear' }, { k: 'serial', op: 'set', raw: 'S' }], fields, ctx);
  assert.equal(plan.errors.length, 4);
  assert.match(plan.errors[0], /price is a number/);
  assert.match(plan.errors[1], /not a day/);
  assert.match(plan.errors[2], /Supplier is picked twice/);
  assert.match(plan.errors[3], /Pick a field/);
});

test('each change gets a history line the device page can restore', () => {
  const list = devs(), fields = bulkFields(list, fieldsOf), f = fields.find(x => x.k === 'purchased');
  const { msg, note } = historyLine('Purchased', f, undefined, '2026-03-01');
  assert.equal(msg, 'Purchased set to 01.03.2026');
  assert.deepEqual(note, { f: 'purchased', to: '2026-03-01' });
  const notes = fields.find(x => x.k === 'notes');
  const h = historyLine('Notes', notes, 'old note', undefined);
  assert.equal(h.msg, 'Notes cleared (was old note)');
  const o = { id: 'a' };   // notes cleared on the device
  assert.deepEqual(fieldRestore({ t: '01.11.2026 10:00', msg: h.msg, ...h.note }, o), { k: 'notes', value: 'old note', current: undefined, changedSince: false });
  assert.equal(shownValue(notes, 'a\nb  c'), 'a b c');
  assert.equal(shownValue(notes, 'x'.repeat(100)).length, 60);
});
