/* Recurring maintenance (public/js/maintenance.js): the next due date by the interval, done records, what is due, the
   check of a save, and the weekly e-mail's section. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addInterval, doneTask, dueState, dueTasks, everyText, maintProblem, nextTask, MAINT_LOG } from '../public/js/maintenance.js';
import { checkState, blankState } from '../server/state.js';
import { buildDigest } from '../server/digest.js';

const task = (over = {}) => ({ id: 'm1', what: 'Test the UPS battery', every: 6, unit: 'm', due: '2026-11-15', ...over });

test('the interval: days, weeks, months (the 31st to the last day of a shorter month) and years', () => {
  assert.equal(addInterval('2026-11-01', 10, 'd'), '2026-11-11');
  assert.equal(addInterval('2026-12-28', 1, 'w'), '2027-01-04');
  assert.equal(addInterval('2026-01-31', 1, 'm'), '2026-02-28');
  assert.equal(addInterval('2027-08-31', 6, 'm'), '2028-02-29');
  assert.equal(addInterval('2028-02-29', 1, 'y'), '2029-02-28');
  assert.equal(addInterval('2026-11-01', 18, 'm'), '2028-05-01');
  assert.equal(everyText(task()), 'every 6 months');
  assert.equal(everyText(task({ every: 1, unit: 'y' })), 'every year');
});

test('done: the next due date from the day it was done, the record kept (the newest first, at most the last 20)', () => {
  let m = doneTask(task(), '2026-11-20', 'Eva', 'battery replaced');
  assert.deepEqual([m.due, m.last, m.log], ['2027-05-20', '2026-11-20', [{ at: '2026-11-20', by: 'Eva', note: 'battery replaced' }]]);
  for (let i = 0; i < 25; i++) m = doneTask(m, '2026-11-21', 'Max');
  assert.equal(m.log.length, MAINT_LOG);
  assert.equal(maintProblem([m]), '');
});

test('what is due: overdue first, within 30 days, on devices in use only', () => {
  const objs = [
    { id: 'a', name: 'UPS-1', status: 'active', maint: [task({ due: '2026-10-20' }), task({ id: 'm2', what: 'Firmware', due: '2027-06-01' })] },
    { id: 'b', name: 'AC-1', status: 'active', maint: [task({ id: 'm3', what: 'Filter', due: '2026-11-25' })] },
    { id: 'c', name: 'Old', status: 'retired', maint: [task({ due: '2026-10-01' })] },
    { id: 'd', name: 'Waiting', status: 'active', review: { src: 'ad' }, maint: [task({ due: '2026-10-01' })] },
  ];
  const due = dueTasks(objs, '2026-11-01');
  assert.deepEqual(due.map(x => [x.o.id, x.m.id, x.days]), [['a', 'm1', -12], ['b', 'm3', 24]]);
  assert.equal(dueState(objs[0].maint[0], '2026-11-01'), 'late');
  assert.equal(dueState(objs[0].maint[1], '2026-11-01'), 'ok');
  assert.equal(nextTask(objs[0]).id, 'm1');
});

test('a save is checked: a task needs what, an interval and a due date', () => {
  assert.equal(maintProblem([task()]), '');
  assert.match(maintProblem([task({ what: '' })]), /says what/);
  assert.match(maintProblem([task({ every: 0 })]), /interval/);
  assert.match(maintProblem([task({ unit: 'h' })]), /interval/);
  assert.match(maintProblem([task({ due: '15.11.2026' })]), /due date/);
  assert.match(maintProblem([task(), task()]), /own id/);
  assert.match(maintProblem([task({ log: [{ at: 'yesterday', by: 'x' }] })]), /record/);
  const s = { ...blankState(), objs: [{ id: 'o1', code: 'INV-1', type: 'other', name: 'UPS-1', status: 'active', loc: '', maint: [task({ every: 'six' })] }] };
  assert.throws(() => checkState(s), /UPS-1: .*interval/);
  s.objs[0].maint = [task()];
  assert.doesNotThrow(() => checkState(s));
});

test('the weekly e-mail lists maintenance overdue or due in the next two weeks', () => {
  const s = { objs: [
    { id: 'a', name: 'UPS-1', code: 'INV-1', status: 'active', maint: [task({ due: '2026-10-20' })] },
    { id: 'b', name: 'AC-1', status: 'active', maint: [task({ id: 'm3', what: 'Change the filter', due: '2026-11-10' }), task({ id: 'm4', what: 'Later', due: '2026-12-31' })] },
  ] };
  const m = buildDigest(s, {}, new Date('2026-11-01T08:00:00'));
  assert.match(m.text, /Maintenance: 1 overdue, 1 due within 14 days/);
  assert.match(m.text, /UPS-1 \(INV-1\): Test the UPS battery, overdue since 20\.10\.2026/);
  assert.match(m.text, /AC-1: Change the filter, due 10\.11\.2026/);
  assert.ok(!/Later/.test(m.text));
});

test('a device is in use, in stock or retired: Not in use and In repair from before are taken as In stock', async () => {
  const { migrateState } = await import('../server/migrate.js');
  const s = { ...blankState(), objs: [
    { id: 'a', code: 'INV-1', type: 'pc', name: 'A', status: 'unused', loc: '' }, { id: 'b', code: 'INV-2', type: 'pc', name: 'B', status: 'repair', loc: '' },
    { id: 'c', code: 'INV-3', type: 'pc', name: 'C', status: 'active', loc: '' }] };
  assert.equal(migrateState(s), true);
  assert.deepEqual(s.objs.map(o => o.status), ['stock', 'stock', 'active']);
  s.objs[2].status = 'repair';
  assert.doesNotThrow(() => checkState(s), 'a save that still sends the old one');
  assert.equal(s.objs[2].status, 'stock');
  s.objs[2].status = 'lost';
  assert.throws(() => checkState(s), /unknown status/);
});
