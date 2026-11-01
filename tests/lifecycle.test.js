/* Replacement planning: due a lifetime after purchase, else at the warranty's end; per year with the budget. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueOf, lifecycleProblem, replacementPlan } from '../public/js/lifecycle.js';

test('due a lifetime after purchase, else when the warranty ends; types without one are not planned', () => {
  assert.deepEqual(dueOf({ type: 'notebook', purchased: '2022-03-01' }, {}), { year: 2026, from: 'purchase' });
  assert.deepEqual(dueOf({ type: 'pc', warranty: '2027-06-30' }, {}), { year: 2027, from: 'warranty' });
  assert.deepEqual(dueOf({ type: 'pc', purchased: '2020-01-01' }, { pc: { years: 8 } }), { year: 2028, from: 'purchase' });
  assert.equal(dueOf({ type: 'vm', purchased: '2020-01-01' }, {}), null);
  assert.equal(dueOf({ type: 'pc' }, {}), null);
});
test('the plan: overdue, the next years with their cost and sites, the unknown counted; retired left out', () => {
  const objs = [
    { id: 'a', type: 'notebook', purchased: '2020-05-01', loc: 'Bern / EG', status: 'active' },
    { id: 'b', type: 'notebook', purchased: '2023-05-01', loc: 'Bern / EG', status: 'active' },
    { id: 'c', type: 'switch', purchased: '2019-01-01', loc: 'Zürich / 1', status: 'active' },
    { id: 'd', type: 'pc', status: 'active' },
    { id: 'e', type: 'pc', purchased: '2010-01-01', status: 'retired' },
    { id: 'f', type: 'vm', status: 'active' }];
  const p = replacementPlan(objs, { notebook: { years: 4, price: 1500 }, switch: { years: 8, price: 4000 } }, 2026, 5);
  assert.deepEqual(p.rows.map(r => [r.key, r.ids, r.cost]), [['overdue', ['a'], 1500], ['2026', [], 0], ['2027', ['b', 'c'], 5500], ['2028', [], 0], ['2029', [], 0], ['2030', [], 0]]);
  assert.deepEqual(p.rows[2].sites, { Bern: 1, 'Zürich': 1 });
  assert.equal(p.unknown, 1); assert.equal(p.planned, 3); assert.equal(p.priced, true);
  assert.equal(lifecycleProblem({ pc: { years: 50 } }), 'A lifetime is a number of years, up to 40.');
  assert.equal(lifecycleProblem({ pc: { years: 5, price: 900 } }), '');
});
