/* Undoing one change from a history: which device history entries and which logged settings changes can be set back,
   and the patch that does it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch, editText, fieldNote, fieldPatch, fieldRestore, rawOf, settingChangedSince, settingPatch, settingRestore } from '../public/js/restore.js';
import { settingDiff } from '../server/audit-diff.js';

test('a field edit is noted with both values; a long or empty value is left out', () => {
  assert.deepEqual(fieldNote('loc', 'HQ / EG', 'HQ / 1'), { f: 'loc', from: 'HQ / EG', to: 'HQ / 1' });
  assert.deepEqual(fieldNote('serial', '', 'S1'), { f: 'serial', to: 'S1' });
  assert.deepEqual(fieldNote('price', 1290, undefined), { f: 'price', from: 1290 });
  assert.deepEqual(fieldNote('purpose', 'x'.repeat(600), 'y'), { f: 'purpose', to: 'y', cut: true });
  assert.equal(editText('Location', 'A', 'B'), 'Location changed from A to B');
  assert.equal(editText('Serial number', '', 'S1'), 'Serial number set to S1');
  assert.equal(editText('Price', 10, undefined), 'Price cleared (was 10)');
});

test('which history entries can be restored', () => {
  const o = { id: 'a', loc: 'HQ / 1', status: 'active', serial: 'S2', custom: { asset: 'B' } };
  const h = (msg, extra) => ({ t: '01.11.2026 10:00', msg, ...extra });
  // a plain field edit: back to the value before, not changed since
  assert.deepEqual(fieldRestore(h('Location changed', fieldNote('loc', 'HQ / EG', 'HQ / 1')), o), { k: 'loc', value: 'HQ / EG', current: 'HQ / 1', changedSince: false });
  // changed again since: asked first
  assert.equal(fieldRestore(h('Serial', fieldNote('serial', 'S0', 'S1')), o).changedSince, true);
  // a custom field of the type
  assert.deepEqual(fieldRestore(h('Asset', fieldNote('custom.asset', 'A', 'B')), o), { k: 'custom.asset', value: 'A', current: 'B', changedSince: false });
  // lines without the values (relations, merges, retiring, sync lines, older entries) are not restorable
  for (const x of [h('Relation "connected to sw1" added by Admin'), h('Merged into PC-1 by Admin'), h('Retired by Admin · port freed'), h('Lansweeper: IP address changed from 10.0.0.1 to 10.0.0.2'), h('Saved by Admin')]) assert.equal(fieldRestore(x, o), null);
  // the user, the type, port counts; a value cut short; already the value; retiring by status; a sync that owns the field
  assert.equal(fieldRestore(h('User', fieldNote('user', 'Anna', 'Beat')), o), null);
  assert.equal(fieldRestore(h('Type', fieldNote('type', 'pc', 'notebook')), o), null);
  assert.equal(fieldRestore(h('Ports', fieldNote('ports', 24, 48)), o), null);
  assert.equal(fieldRestore(h('Desc', fieldNote('purpose', 'x'.repeat(600), 'y')), { ...o, purpose: 'y' }), null);
  assert.equal(fieldRestore(h('Location', fieldNote('loc', 'HQ / 1', 'HQ / 2')), o), null);
  assert.equal(fieldRestore(h('Status', fieldNote('status', 'retired', 'active')), o), null);
  assert.equal(fieldRestore(h('Status', fieldNote('status', 'stock', 'active')), o).value, 'stock');
  assert.equal(fieldRestore(h('Location changed', fieldNote('loc', 'HQ / EG', 'HQ / 1')), o, k => k === 'loc'), null);
  assert.equal(fieldRestore(h('Name', fieldNote('name', '', 'PC-1')), { name: 'PC-1' }), null, 'a name is never emptied');
});

test('the patch: the field set back, emptied when it was empty, a custom field within custom', () => {
  const o = { id: 'a', loc: 'HQ / 1', serial: 'S1', custom: { asset: 'B', other: 1 } };
  assert.deepEqual(fieldPatch(o, 'loc', 'HQ / EG'), { loc: 'HQ / EG' });
  assert.deepEqual(fieldPatch(o, 'serial', undefined), { serial: undefined });
  assert.deepEqual(fieldPatch(o, 'custom.asset', 'A'), { custom: { asset: 'A', other: 1 } });
  assert.deepEqual(fieldPatch(o, 'custom.asset', ''), { custom: { other: 1 } });
  applyPatch(o, fieldPatch(o, 'serial', undefined));
  assert.ok(!('serial' in o));
});

test('the log keeps a plain value whole; secrets, lists, pictures and long texts never', () => {
  assert.deepEqual(rawOf(['currency'], 'CHF', 'EUR'), { keys: ['currency'], before: 'CHF', after: 'EUR' });
  assert.deepEqual(rawOf(['notebook', 'years'], undefined, 5), { keys: ['notebook', 'years'], after: 5 });
  assert.equal(rawOf(['bindPassword'], 'a', 'b'), null);
  assert.equal(rawOf(['logo'], 'data:image/png;base64,AA', ''), null);
  assert.equal(rawOf(['x'], ['a'], ['b']), null);
  assert.equal(rawOf(['x'], 'a'.repeat(600), 'b'), null);
  // the diff the server logs carries it
  const d = settingDiff({ notebook: { years: 4, price: 1500 }, pc: { years: 5 } }, { notebook: { years: 6, price: 1500 }, pc: { years: 5 } });
  assert.deepEqual(d, [{ path: 'notebook.years', before: '4', after: '6', raw: { keys: ['notebook', 'years'], before: 4, after: 6 } }]);
  assert.deepEqual(settingDiff({ url: 'a', bindPassword: 'x' }, { url: 'a', bindPassword: 'y' }), [{ path: 'bindPassword', before: '(hidden)', after: '(hidden)' }]);
});

test('which logged settings changes can be restored, and the setting they give', () => {
  const [c] = settingDiff({ notebook: { years: 4, price: 1500 } }, { notebook: { years: 6, price: 1500 } });
  const r = settingRestore('lifecycle', c);
  assert.deepEqual(r, { keys: ['notebook', 'years'], value: 4, unset: false, after: 6 });
  assert.deepEqual(settingPatch({ notebook: { years: 6, price: 1500 }, pc: { years: 5 } }, r), { notebook: { years: 4, price: 1500 }, pc: { years: 5 } });
  assert.equal(settingChangedSince({ notebook: { years: 6 } }, r), false);
  assert.equal(settingChangedSince({ notebook: { years: 7 } }, r), true);
  // a value that was not there before is taken away again
  const [n] = settingDiff({}, { pc: { years: 7 } }).filter(x => x.path === 'pc.years');
  const rn = settingRestore('lifecycle', n);
  assert.equal(rn.unset, true);
  assert.deepEqual(settingPatch({ pc: { years: 7, price: 900 } }, rn), { pc: { price: 900 } });
  // a whole setting that is a plain value
  const [cur] = settingDiff('CHF', 'EUR');
  assert.equal(settingPatch('EUR', settingRestore('currency', cur)), 'CHF');
  // not restorable: a secret (shown hidden), a list, a picture, the map's layout, a setting the page cannot change, a whole setting that was unset
  assert.equal(settingRestore('ldap', { path: 'bindPassword', before: '(hidden)', after: '(hidden)' }), null);
  assert.equal(settingRestore('ldap', { path: 'bindPassword', before: '(hidden)', after: '(hidden)', raw: { keys: ['bindPassword'], before: 'pw' } }), null, 'a secret is never set back, even if a value were there');
  const [list] = settingDiff(['A'], ['A', 'B']);
  assert.equal(settingRestore('locs', list), null);
  const [pic] = settingDiff({ logo: 'data:image/png;base64,AA' }, { logo: '' });
  assert.equal(settingRestore('company', pic), null);
  assert.equal(settingRestore('mapPos', c), null);
  assert.equal(settingRestore('smtp', c, ['lifecycle']), null);
  const [whole] = settingDiff(undefined, 'EUR');
  assert.equal(settingRestore('currency', whole), null);
});

test('the server sets a logged change back, logs it, and refuses secrets, lists and the signed out', async () => {
  const { startServer, signIn } = await import('./helpers.js');
  const { loadState } = await import('../server/state.js');
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const save = async (id, value) => {
      const revs = loadState(srv.db).revs;
      const r = await srv.call('POST', '/api/changes', { cookie: a.cookie, body: { puts: [{ kind: 'setting', id, value, base: revs['setting|' + id] ?? 0 }], dels: [] } });
      assert.equal(r.status, 200, JSON.stringify(r.json));
    };
    await save('lifecycle', { notebook: { years: 4, price: 1500 } });
    await save('lifecycle', { notebook: { years: 6, price: 1500 } });
    await save('locs', ['HQ / EG', 'HQ / 1']);
    const log = (await srv.call('GET', '/api/log', { cookie: a.cookie })).json.entries;
    const e = log.find(x => x.detail && x.detail.setting === 'lifecycle' && x.detail.changes.some(c => c.path === 'notebook.years' && c.before === '4'));
    assert.ok(e, JSON.stringify(log.slice(0, 4)));
    const r = await srv.call('POST', '/api/log/restore', { cookie: a.cookie, body: { at: e.at, setting: 'lifecycle', path: 'notebook.years' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(loadState(srv.db).lifecycle, { notebook: { years: 4, price: 1500 } });
    const top = (await srv.call('GET', '/api/log', { cookie: a.cookie })).json.entries[0];
    assert.match(top.action, /^setting changed: lifetimes and replacement prices, notebook\.years restored from /);
    assert.deepEqual(top.detail.changes.map(c => [c.path, c.before, c.after]), [['notebook.years', '6', '4']]);
    // a list change has no value to set back; nor a path the change did not have
    const l = log.find(x => x.detail && x.detail.setting === 'locs');
    assert.equal((await srv.call('POST', '/api/log/restore', { cookie: a.cookie, body: { at: l.at, setting: 'locs', path: '' } })).status, 404);
    assert.equal((await srv.call('POST', '/api/log/restore', { cookie: a.cookie, body: { at: e.at, setting: 'lifecycle', path: 'bindPassword' } })).status, 404);
    assert.equal((await srv.call('POST', '/api/log/restore', { body: { at: e.at, setting: 'lifecycle', path: 'notebook.years' } })).status, 401);
  } finally { await srv.close(); }
});
