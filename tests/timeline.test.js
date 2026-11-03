/* The lifecycle timeline of a device: its events from the device, its history, contracts and lifetimes, newest first. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyEvent, timelineOf } from '../public/js/timeline.js';
import { fieldNote } from '../public/js/restore.js';

const today = new Date(2026, 10, 3, 12, 0);
test('history lines: handed out, taken back, moved, status, retired, added', () => {
  assert.deepEqual(historyEvent({ msg: 'Handed out to Anna Muster (was Beat), to HQ / 1 by Admin' }), { kind: 'user', tone: 'ok', text: 'Handed out to Anna Muster, to HQ / 1' });
  assert.deepEqual(historyEvent({ msg: 'Given to Anna by Admin' }), { kind: 'user', tone: 'ok', text: 'Handed out to Anna' });
  assert.equal(historyEvent({ msg: 'Taken back into stock from Anna, to HQ / Store by Admin' }).text, 'Taken back from Anna into stock, to HQ / Store');
  assert.equal(historyEvent({ msg: 'Anna no longer has it: taken into stock by Admin' }).kind, 'back');
  assert.equal(historyEvent({ msg: 'Lansweeper: Location changed from HQ / 1 to HQ / 2' }).text, 'Moved to HQ / 2');
  assert.equal(historyEvent({ msg: 'Location set to HQ / 3 from Active Directory (x) by Admin' }).text, 'Moved to HQ / 3');
  assert.equal(historyEvent({ msg: 'Location changed from A to B: found there in Stocktake' }).text, 'Moved to B');
  assert.deepEqual(historyEvent({ msg: 'Location changed', ...fieldNote('loc', 'A', 'B') }), { kind: 'move', tone: '', text: 'Moved to B' });
  assert.deepEqual(historyEvent({ msg: 'Status', ...fieldNote('status', 'active', 'stock') }), { kind: 'status', tone: '', text: 'In stock' });
  assert.equal(historyEvent({ msg: 'User', ...fieldNote('user', 'Anna', 'Beat') }).text, 'Handed out to Beat');
  assert.equal(historyEvent({ msg: 'User', ...fieldNote('user', 'Anna', undefined) }).text, 'Taken back from Anna');
  assert.equal(historyEvent({ msg: 'Retired by Admin: broken' }).tone, 'gone');
  assert.equal(historyEvent({ msg: 'Created manually by Admin' }).kind, 'added');
  assert.equal(historyEvent({ msg: 'Added from Microsoft Graph by the sync' }).text, 'Added from Microsoft Graph');
  assert.equal(historyEvent({ msg: 'Found in Active Directory: waiting in To review' }).text, 'First found in Active Directory');
  assert.equal(historyEvent({ msg: 'Serial changed', ...fieldNote('serial', 'A', 'B') }), null);
  assert.equal(historyEvent({ msg: 'Relation "connected to sw1" added by Admin' }), null);
});

test('the timeline: newest first, things to come on top, tones by state', () => {
  const o = { id: 'a', type: 'notebook', status: 'active', purchased: '2022-03-01', warranty: '2026-12-31', feed: { firstSeen: '2022-03-05' },
    maint: [{ what: 'Battery check', every: 1, unit: 'y', due: '2027-05-01', log: [{ at: '2026-05-01', by: 'Admin' }] }] };
  const history = [
    { t: '01.10.2026 09:00', msg: 'Handed out to Anna by Admin' },
    { t: '01.09.2026 09:00', msg: 'Location changed', ...fieldNote('loc', 'HQ / EG', 'HQ / 1') },
    { t: '01.03.2022 10:00', msg: 'Created manually by Admin' }];
  const contracts = [{ name: 'Lease 7', start: '2022-03-01', end: '2027-02-28' }];
  const list = timelineOf(o, { history, contracts, life: {}, today });
  assert.deepEqual(list.map(e => [e.when, e.kind, e.tone, e.text]), [
    ['28.02.2027', 'contract', 'ok', 'Contract Lease 7 ends'],
    ['31.12.2026', 'warranty', 'warn', 'Warranty ends'],
    ['2026', 'replace', 'warn', 'Replacement due this year, by its lifetime'],
    ['01.10.2026', 'user', 'ok', 'Handed out to Anna'],
    ['01.09.2026', 'move', '', 'Moved to HQ / 1'],
    ['01.05.2026', 'maint', 'ok', 'Maintenance done: Battery check by Admin'],
    ['05.03.2022', 'seen', 'ok', 'First found by Lansweeper'],
    ['01.03.2022', 'added', 'ok', 'Added by hand'],
    ['01.03.2022', 'buy', 'ok', 'Purchased'],
    ['01.03.2022', 'contract', '', 'Contract Lease 7 starts']]);
  assert.deepEqual(list.filter(e => e.future).map(e => e.kind), ['contract', 'warranty']);
});

test('overdue replacement is red; a retired device has none, and its retirement is grey', () => {
  const late = timelineOf({ type: 'pc', status: 'active', purchased: '2018-01-01' }, { today });
  assert.deepEqual(late.map(e => [e.kind, e.tone, e.text]), [['replace', 'bad', 'Replacement overdue since 2023'], ['buy', 'ok', 'Purchased']]);
  const gone = timelineOf({ type: 'pc', status: 'retired', purchased: '2018-01-01', warranty: '2021-01-01' }, { history: [{ t: '02.01.2025 08:00', msg: 'Retired by Admin' }], today });
  assert.deepEqual(gone.map(e => [e.kind, e.tone]), [['retired', 'gone'], ['warranty', ''], ['buy', 'ok']]);
  // added from Lansweeper when the history no longer says so
  assert.equal(timelineOf({ type: 'pc', feed: { created: '03.04.2024 10:00' } }, { today })[0].text, 'Added from Lansweeper');
  assert.deepEqual(timelineOf({ type: 'vm' }, { today }), []);
});
