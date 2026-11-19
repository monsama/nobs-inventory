/* Devices a source no longer lists: Lansweeper notes the day each device was last in a push, Active Directory the day
   its computer account went, and the page lists a device as gone from one source or from all the ones it was in. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords, recordsFromJson, feedChanged } from '../server/feed.js';
import { applyComputers } from '../server/ldap-sync.js';
import { checkState } from '../server/state.js';

const base = (objs) => ({ objs, rels: [], users: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 0, rseq: 0, types: {}, history: {} });
const ls = (id, name) => ({ id, type: 'pc', name, serial: 'S-' + id, status: 'active', ovr: {}, feed: { sys: 'Lansweeper', ref: 'r-' + id, seen: 'x' } });

test('a push notes the day each device was in it, once a day, and the newest push day', () => {
  const s = base([ls('a', 'PC-A'), ls('b', 'PC-B')]);
  const day1 = new Date('2026-11-10T22:00:00Z');
  const c1 = mergeRecords(s, recordsFromJson([{ ref: 'r-a', name: 'PC-A', serial: 'S-a' }, { ref: 'r-b', name: 'PC-B', serial: 'S-b' }]), day1);
  assert.ok(feedChanged(c1), 'the first push of a day is saved');
  assert.equal(s.objs[0].feed.inPush, '2026-11-10'); assert.equal(s.objs[1].feed.inPush, '2026-11-10');
  assert.deepEqual(s.lsPresence, { day: '2026-11-10', since: '2026-11-10' });
  // the same day again: nothing new to save for presence
  const c2 = mergeRecords(s, recordsFromJson([{ ref: 'r-a', name: 'PC-A', serial: 'S-a' }]), new Date('2026-11-10T23:00:00Z'));
  assert.ok(!c2.present, 'already noted today');
  // three days later, B is no longer sent: A moves on, B keeps its day; since stays the first day
  mergeRecords(s, recordsFromJson([{ ref: 'r-a', name: 'PC-A', serial: 'S-a' }]), new Date('2026-11-13T22:00:00Z'));
  assert.equal(s.objs[0].feed.inPush, '2026-11-13'); assert.equal(s.objs[1].feed.inPush, '2026-11-10');
  assert.deepEqual(s.lsPresence, { day: '2026-11-13', since: '2026-11-10' });
  checkState(s);
});

test('a file uploaded by hand is not the whole list: it notes no presence', () => {
  const s = base([ls('a', 'PC-A')]);
  mergeRecords(s, recordsFromJson([{ ref: 'r-a', name: 'PC-A', serial: 'S-a' }]), new Date('2026-11-10T10:00:00Z'), null, { byHand: true });
  assert.equal(s.objs[0].feed.inPush, undefined); assert.equal(s.lsPresence, undefined);
});

test('a device whose computer account leaves AD keeps the day, with a history line; back in AD the mark goes', () => {
  const s = base([{ id: 'a', name: 'PC-A', status: 'active' }]);
  const comp = { name: 'PC-A', dns: 'pc-a.corp.example', groups: [], os: '', domain: '', logon: '2026-11-01', created: '2020-01-02' };
  applyComputers(s, [comp], new Date('2026-11-01T10:00:00Z'));
  assert.equal(s.objs[0].inAd, true); assert.equal(s.objs[0].adGone, undefined);
  applyComputers(s, [{ ...comp, name: 'OTHER', dns: 'other.corp.example' }], new Date('2026-11-05T10:00:00Z'));
  assert.equal(s.objs[0].inAd, undefined); assert.equal(s.objs[0].adGone, '2026-11-05');
  assert.match(s.history.a[0].msg, /Gone from Active Directory/);
  // a later sync without it keeps the first day
  applyComputers(s, [{ ...comp, name: 'OTHER', dns: 'other.corp.example' }], new Date('2026-11-09T10:00:00Z'));
  assert.equal(s.objs[0].adGone, '2026-11-05');
  applyComputers(s, [comp], new Date('2026-11-10T10:00:00Z'));
  assert.equal(s.objs[0].inAd, true); assert.equal(s.objs[0].adGone, undefined);
  assert.match(s.history.a[0].msg, /Back in Active Directory/);
});

test('the weekly e-mail names the devices no source lists any more', async () => {
  const { buildDigest } = await import('../server/digest.js');
  const s = { ...base([
    { id: 'a', name: 'PC-GONE', code: 'INV-1', status: 'active', adGone: '2026-11-01', graph: { gone: '02.11.2026 08:00' } },
    { id: 'b', name: 'PC-HERE', code: 'INV-2', status: 'active', inAd: true },
    { id: 'c', name: 'PC-OLD', code: 'INV-3', status: 'retired', adGone: '2026-11-01' },
  ]), contracts: [], users: [] };
  const d = buildDigest(s, {}, new Date('2026-11-18T08:00:00Z'));
  assert.match(d.text, /1 device no source lists any more\n\s+- PC-GONE \(INV-1\)/);
  assert.doesNotMatch(d.text, /PC-HERE|PC-OLD/);
});

test('saved views of Contracts and Contacts keep their search and filter, and are never sent by mail', async () => {
  const { savedViewsProblem, serializeView, applyViewFilters } = await import('../public/js/saved-views.js');
  const v = serializeView({ tab: 'contracts', q: 'lease', ctDue: true });
  assert.deepEqual(v, { tab: 'contracts', q: 'lease', filters: { ctDue: true }, cols: [], sort: null, colFilters: {} });
  assert.equal(savedViewsProblem([{ id: 'v1', name: 'Due leases', ...v }]), null);
  assert.match(savedViewsProblem([{ id: 'v1', name: 'Due leases', ...v, mail: { every: 'daily', hour: 7, to: ['it@example.com'] } }]), /only a list of devices is sent by mail/);
  const st = applyViewFilters({ tab: 'contacts', q: 'netz', filters: { cnKind: 'external' } }, { tab: 'cards', ctDue: true });
  assert.equal(st.tab, 'contacts'); assert.equal(st.cnKind, 'external'); assert.equal(st.ctDue, false); assert.equal(st.q, 'netz');
});
