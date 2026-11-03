/* Saved views: a view made from the page state and put back on it, the table's column filters and sort kept by column
   key, saving under a name, and the server keeping only sane lists, saved by admins only. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';
import { loadState, saveState } from '../server/state.js';
import { applyViewFilters, hiddenFor, remapTable, removeView, renameView, sameView, savedViewsProblem, serializeView, tableStateFor, upsertView, VIEWS_MAX } from '../public/js/saved-views.js';

test('a view keeps the filters, search, columns, column filters and sort, and puts them back', () => {
  const st = { tab: 'table', q: ' latitude ', type: 'notebook', loc: null, status: 'active', live: true, twins: false, scope: null, quality: 'noloc' };
  /* The table shows code, name, model, user; it filters the model and sorts by user, downwards. */
  const tv = { keys: ['code', 'name', 'model', 'user'], filters: { 3: '7450', 2: ' ' }, sort: { ci: 4, dir: -1 }, widths: { 1: 90 }, order: null };
  const v = serializeView(st, { cols: ['code', 'model', 'user'], tv });
  assert.deepEqual(v, { tab: 'table', q: 'latitude', filters: { type: 'notebook', status: 'active', live: true }, cols: ['code', 'model', 'user'], sort: { col: 'user', dir: -1 }, colFilters: { model: '7450' } });

  /* Put back on a page with other filters: those not in the view are taken off, a data-quality list is not touched. */
  const page = { tab: 'cards', q: 'x', type: 'pc', loc: 'HQ / 1', warranty: 'soon', scanOld: true, quality: 'noloc' };
  applyViewFilters(v, page);
  assert.deepEqual(page, { tab: 'table', q: 'latitude', type: 'notebook', loc: null, status: 'active', warranty: null, intune: null, osFam: null, resp: null, person: null, adGroup: null, scanOld: false, twins: false, live: true, quality: 'noloc' });
  assert.deepEqual(hiddenFor(v, ['code', 'type', 'model', 'ip', 'user']), ['type', 'ip']);

  /* The table now shows other columns: the column filter and the sort go to their columns there, widths move along. */
  const keys = ['code', 'name', 'type', 'model', 'user'];
  const t = tableStateFor(v, tv, keys);
  assert.deepEqual([t.keys, t.filters, t.sort, t.widths], [keys, { 4: '7450' }, { ci: 5, dir: -1 }, { 1: 90 }]);
  assert.deepEqual(tv.keys, ['code', 'name', 'model', 'user'], 'the kept table state is not changed in place');
  assert.ok(sameView(serializeView({ ...page }, { cols: ['user', 'code', 'model'], tv: t }), v), 'the view put back is the view saved');
  assert.equal(sameView(v, { ...v, q: 'other' }), false);

  /* Columns moved by hand: the view keeps them in the order shown, and puts that order back. */
  const moved = serializeView(st, { cols: ['code', 'name', 'model', 'user'], tv: { ...tv, order: [0, 4, 2, 1, 3] } });
  assert.deepEqual(moved.cols, ['user', 'name', 'code', 'model']);
  assert.deepEqual(tableStateFor(moved, null, ['code', 'name', 'type', 'model', 'user']).order, [0, 5, 2, 1, 4, 3]);
});

test('the table state follows its columns: a column gone takes its filter and sort along', () => {
  const tv = remapTable({ keys: ['a', 'b', 'c'], filters: { 1: 'x', 3: 'z' }, sort: { ci: 2, dir: 1 }, widths: {}, order: [0, 3, 1, 2] }, ['a', 'c']);
  assert.deepEqual([tv.filters, tv.sort, tv.order, tv.keys], [{ 1: 'x', 2: 'z' }, null, [0, 2, 1], ['a', 'c']]);
});

test('saving under a name replaces the view of that name; rename and delete', () => {
  const v = { tab: 'cards', q: '', filters: {}, cols: [], sort: null, colFilters: {} };
  let list = upsertView([], v, ' Notebooks ', 'v1');
  list = upsertView(list, { ...v, q: 'dell' }, 'Printers', 'v2');
  list = upsertView(list, { ...v, q: 'lenovo', extra: 'dropped' }, 'notebooks', 'v3');
  assert.deepEqual(list.map(x => [x.id, x.name, x.q]), [['v1', 'notebooks', 'lenovo'], ['v2', 'Printers', 'dell']]);
  assert.equal('extra' in list[0], false);
  assert.equal(savedViewsProblem(list), null);
  assert.deepEqual(renameView(list, 'v2', ' Print ').map(x => x.name), ['notebooks', 'Print']);
  assert.deepEqual(removeView(list, 'v1').map(x => x.id), ['v2']);
});

test('the server keeps only sane saved views, and only an admin saves them', async () => {
  const ok = [{ id: 'v1', name: 'Old notebooks', tab: 'table', q: 'dell', filters: { type: 'notebook', live: true }, cols: ['model', 'user'], sort: { col: 'user', dir: 1 }, colFilters: { model: '7450' } }];
  const bad = [
    'nope', [{ name: 'x' }], [{ id: 'v', name: '' }], [{ id: 'v', name: 'x'.repeat(81) }], [{ id: 'v', name: 'a' }, { id: 'v', name: 'b' }],
    [{ id: 'v', name: 'a', filters: { scope: 'review' } }], [{ id: 'v', name: 'a', filters: { live: 'yes' } }], [{ id: 'v', name: 'a', tab: 'overview' }],
    [{ id: 'v', name: 'a', sort: { col: 'x', dir: 2 } }], [{ id: 'v', name: 'a', cols: Array(61).fill('x') }], [{ id: 'v', name: 'a', q: 'q'.repeat(201) }],
    [{ id: 'v', name: 'a', script: 'alert(1)' }], Array.from({ length: VIEWS_MAX + 1 }, (_, i) => ({ id: 'v' + i, name: 'n' + i })),
  ];
  for (const b of bad) assert.ok(savedViewsProblem(b), `accepted: ${JSON.stringify(b).slice(0, 80)}`);

  const srv = await startServer();
  try {
    const s = loadState(srv.db);
    assert.throws(() => saveState(srv.db, { ...s, savedViews: [{ id: 'v', name: '' }] }), /name/);
    saveState(srv.db, { ...s, users: [...s.users, { id: 'u-anna', login: 'anna', name: 'Anna', role: 'viewer', active: true, source: 'manual' }] });
    const admin = await signIn(srv, 'admin', 'adminpass123');
    assert.equal((await srv.call('POST', '/api/users/u-anna/password', { body: { password: 'blue-river-1234' }, cookie: admin.cookie })).status, 200);
    const put = (cookie, value) => srv.call('POST', '/api/changes', { cookie, body: { puts: [{ kind: 'setting', id: 'savedViews', value, base: loadState(srv.db).revs['setting|savedViews'] ?? 0 }], dels: [] } });
    assert.equal((await put(admin.cookie, ok)).status, 200);
    assert.deepEqual(loadState(srv.db).savedViews, ok);
    assert.equal((await put(admin.cookie, [{ id: 'v', name: 'a', filters: { scope: 'x' } }])).status, 400);
    const anna = await signIn(srv, 'anna', 'blue-river-1234');
    assert.equal((await put(anna.cookie, [])).status, 403, 'a viewer changed the saved views');
    /* A viewer gets them, to use. */
    assert.deepEqual((await srv.call('GET', '/api/state', { cookie: anna.cookie })).json.savedViews, ok);
  } finally { await srv.close(); }
});
