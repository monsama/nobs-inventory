/* The bell's notices: what needs attention, coloured by how bad, where each leads, scoped for a viewer, and hidden only
   until it changes. Also the e-mail's lists come from the same place, and a sync's state from the schedule. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attention, fingerprint, hideNotice, notices, shownNotices, warrantyState } from '../public/js/notices.js';
import { syncState } from '../public/js/schedule.js';

const TODAY = new Date('2026-11-03T10:00:00');
const S = () => ({
  objs: [
    { id: 'a', name: 'NB-OLD', status: 'active', loc: 'Bern / 1', warranty: '2026-10-01' },
    { id: 'b', name: 'NB-SOON', status: 'active', loc: 'Zurich / 2', warranty: '2026-12-01' },
    { id: 'c', name: 'NB-STOCK', status: 'stock', loc: 'Bern / 1', warranty: '2026-12-01' },
    { id: 'd', name: 'GONE', status: 'retired', loc: 'Bern / 1', warranty: '2020-01-01', reported: { at: '2026-10-01T08:00:00Z', by: 'X', text: 'old' } },
    { id: 'e', name: 'UPS-1', status: 'active', loc: 'Bern / 1', maint: [{ id: 'm1', what: 'Test battery', every: 1, unit: 'y', due: '2026-10-20' }, { id: 'm2', what: 'Firmware', every: 6, unit: 'm', due: '2026-11-20' }],
      reported: { at: '2026-11-01T08:00:00Z', by: 'Anna', text: 'Beeps' } },
    { id: 'r', name: 'WAIT', status: 'active', loc: 'Zurich / 2', review: { src: 'ad' } },
    { id: 'i', name: 'IGNORED', status: 'active', review: { src: 'ad', ignored: true } },
  ],
  contracts: [{ id: 'k1', name: 'Firewall support', end: '2027-01-31', renew: 12, notice: 2, devices: ['b'] }, { id: 'k2', name: 'Copier lease', end: '2026-11-20', renew: 12, notice: 1 }],
  syncRuns: { ldap: { at: '2026-11-03T06:00:00Z', ok: false, error: 'The directory refused the sign-in' }, graph: { at: '2026-10-30T06:00:00Z', ok: true }, lansweeper: { at: '2026-10-01T06:00:00Z', ok: true, how: 'push' } },
  restoreTest: { at: '2026-11-01T03:30:00Z', ok: false, error: 'The backup could not be opened' },
  backupExportRun: { at: '2026-11-03T02:30:00Z', ok: true },
});

test('the lists the bell and the e-mail share', () => {
  const a = attention(S(), TODAY);
  assert.deepEqual(a.wEnded.map(o => o.id), ['a']);
  assert.deepEqual(a.wSoon.map(o => o.id), ['b'], 'devices in use only: not in stock, not retired');
  assert.deepEqual(a.maint.map(x => x.m.id), ['m1', 'm2']);
  assert.deepEqual(a.reported.map(o => o.id), ['e'], 'retired devices are left out');
  assert.deepEqual(a.review.map(o => o.id), ['r'], 'ignored ones are no longer waiting');
  assert.deepEqual(a.contracts.map(x => [x.c.id, x.st.state]), [['k2', 'late'], ['k1', 'soon']]);
  assert.equal(warrantyState({ warranty: '2026-11-03' }, TODAY), 'soon');
  assert.equal(warrantyState({ warranty: '2026-11-02' }, TODAY), 'ended');
  assert.equal(warrantyState({ warranty: 'soon' }, TODAY), null);
});

test('an admin gets every notice, red ones first, each leading somewhere', () => {
  const list = notices(S(), { admin: true, sources: ['lansweeper', 'ldap', 'graph'], today: TODAY });
  const by = Object.fromEntries(list.map(n => [n.id, n]));
  assert.deepEqual(list.map(n => n.sev), [...list.filter(n => n.sev === 'bad'), ...list.filter(n => n.sev === 'warn')].map(n => n.sev), 'red first');
  assert.deepEqual(Object.keys(by).sort(), ['contract-k1', 'contract-k2', 'maint-due', 'maint-late', 'reported-e', 'restore-test', 'review', 'sync-graph', 'sync-ldap', 'warranty-ended', 'warranty-soon'].sort());
  assert.deepEqual([by['warranty-ended'].sev, by['warranty-ended'].go], ['bad', { device: 'a' }], 'one device: it opens');
  assert.deepEqual([by['maint-late'].sev, by['maint-late'].text], ['bad', 'UPS-1: Test battery']);
  assert.deepEqual([by['contract-k1'].sev, by['contract-k1'].go, by['contract-k2'].sev], ['warn', { tab: 'contracts' }, 'bad']);
  assert.match(by['contract-k1'].text, /Give notice by 30\.11\.2026/);
  assert.deepEqual([by['sync-ldap'].sev, by['sync-ldap'].go, by['sync-ldap'].text], ['bad', { settings: 'ldap' }, 'The directory refused the sign-in']);
  assert.equal(by['sync-graph'].sev, 'warn', 'every 4 hours by default: four days without a run is late');
  assert.ok(!by['sync-lansweeper'], 'a push is never late');
  assert.deepEqual([by['restore-test'].go, by.review.go, by['reported-e'].go], [{ settings: 'backups' }, { review: true }, { device: 'e' }]);
  /* Many devices: the Table, filtered. */
  const s = S(); s.objs.push({ id: 'z', name: 'NB-Z', status: 'active', warranty: '2026-01-01' });
  assert.deepEqual(notices(s, { today: TODAY }).find(n => n.id === 'warranty-ended').go, { table: { warranty: 'ended', status: 'active' } });
});

test('a viewer sees only their sites, and no syncs or backups', () => {
  const list = notices(S(), { admin: false, sites: ['Zurich'], sources: ['ldap'], today: TODAY });
  assert.deepEqual(list.map(n => n.id), ['warranty-soon', 'contract-k1', 'review']);
  assert.ok(!notices(S(), { admin: false, sources: ['ldap'], today: TODAY }).some(n => /^(sync|restore|backup)/.test(n.id)));
});

test('a hidden notice stays hidden until it changes', () => {
  const list = notices(S(), { today: TODAY });
  const soon = list.find(n => n.id === 'warranty-soon');
  let hidden = hideNotice({}, soon, list);
  assert.equal(shownNotices(list, hidden).length, list.length - 1);
  /* Another device's warranty now ends soon too: the notice says something else and is back. */
  const s = S(); s.objs.push({ id: 'y', name: 'NB-Y', status: 'active', warranty: '2026-12-24' });
  const again = notices(s, { today: TODAY });
  assert.ok(shownNotices(again, hidden).some(n => n.id === 'warranty-soon'));
  /* Only what is still listed is kept. */
  hidden = hideNotice({ gone: 'x', ...hidden }, list.find(n => n.id === 'review'), list);
  assert.deepEqual(Object.keys(hidden).sort(), ['review', 'warranty-soon']);
  assert.notEqual(fingerprint(['a', 'b']), fingerprint(['a', 'c']));
  assert.match(fingerprint(['a', 'b']), /^2:/);
});

test('a sync stands as failed, late or fine against its schedule', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');
  assert.equal(syncState(null, { every: 4 }, now), 'none');
  assert.equal(syncState({ at: '2026-11-03T11:00:00Z', ok: false }, { every: 4 }, now), 'failed');
  assert.equal(syncState({ at: '2026-11-03T02:00:00Z', ok: true }, { every: 4 }, now), 'late');
  assert.equal(syncState({ at: '2026-11-03T04:00:00Z', ok: true }, { every: 4 }, now), 'ok');
  assert.equal(syncState({ at: '2026-10-01T00:00:00Z', ok: true }, { every: 0 }, now), 'ok', 'only by hand: never late');
  assert.equal(syncState({ at: '2026-10-01T00:00:00Z', ok: true, how: 'push' }, { every: 24 }, now), 'ok');
});
