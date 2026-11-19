/* Devices a source no longer lists: Lansweeper notes the day each device was last in a push, Active Directory the day
   its computer account went, and the page lists a device as gone from one source or from all the ones it was in. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords, recordsFromJson, feedChanged } from '../server/feed.js';
import { applyComputers } from '../server/ldap-sync.js';
import { checkState } from '../server/state.js';

const base = (objs) => ({ objs, rels: [], users: [], policy: {}, feedOn: true, locs: [], seq: 100, codeN: 0, rseq: 0, types: {}, history: {} });
const ls = (id, name) => ({ id, type: 'pc', name, serial: 'S-' + id, status: 'active', ovr: {}, feed: { sys: 'Lansweeper', ref: 'r-' + id, seen: 'x' } });

test('a push notes the day each device was in it, once a day, counts the devices per day and judges each day once the next starts', () => {
  const s = base([ls('a', 'PC-A'), ls('b', 'PC-B')]);
  const push = (refs, at) => mergeRecords(s, recordsFromJson(refs.map(r => ({ ref: 'r-' + r, name: 'PC-' + r.toUpperCase(), serial: 'S-' + r }))), new Date(at));
  const c1 = push(['a', 'b'], '2026-11-10T22:00:00Z');
  assert.ok(feedChanged(c1), 'the first push of a day is saved');
  assert.equal(s.objs[0].feed.inPush, '2026-11-10'); assert.equal(s.objs[1].feed.inPush, '2026-11-10');
  assert.deepEqual(s.lsPresence, { day: '2026-11-10', n: 2, since: '2026-11-10' });
  // a second batch the same day: nothing new to save for presence
  assert.ok(!push(['a'], '2026-11-10T22:05:00Z').present, 'already noted today');
  // the next day closes the first one: a full day of 2
  push(['a'], '2026-11-11T22:00:00Z');
  assert.deepEqual(s.lsPresence, { day: '2026-11-11', n: 1, since: '2026-11-10', full: { day: '2026-11-10', n: 2 }, days: [{ day: '2026-11-10', n: 2 }] });
  // three days on, B is no longer sent: A moves on, B keeps its day
  push(['a'], '2026-11-13T22:00:00Z');
  assert.equal(s.objs[0].feed.inPush, '2026-11-13'); assert.equal(s.objs[1].feed.inPush, '2026-11-10');
  assert.deepEqual(s.lsPresence.full, { day: '2026-11-11', n: 1 }, 'one of two is half: still a full day');
  assert.deepEqual(s.lsPresence.days.map(d => d.n), [1, 2], 'the sizes of the days judged, newest first');
  checkState(s);
});

test('a push that brings far fewer devices than the last full day is set aside: nothing is found gone by it', async () => {
  const { sourcesOfWith } = await import('../public/js/gone.js');
  const objs = Array.from({ length: 10 }, (_, i) => ls('d' + i, 'PC-' + i));
  const s = base(objs);
  const push = (n, at) => mergeRecords(s, recordsFromJson(objs.slice(0, n).map(o => ({ ref: o.feed.ref, name: o.name, serial: o.serial }))), new Date(at));
  push(10, '2026-11-01T22:00:00Z'); push(10, '2026-11-02T22:00:00Z');
  push(2, '2026-11-03T22:00:00Z');   // a query that failed half way: 2 of 10
  push(2, '2026-11-04T22:00:00Z'); push(2, '2026-11-05T22:00:00Z'); push(10, '2026-11-06T22:00:00Z');
  assert.deepEqual(s.lsPresence.full, { day: '2026-11-02', n: 10 }, 'the short days are not taken as full');
  assert.deepEqual(s.lsPresence.short, { day: '2026-11-05', n: 2, of: 10 });
  assert.ok(objs.every(o => !sourcesOfWith(o, s.lsPresence).some(x => x.gone)), 'none is gone');
  // a full day again: the short mark goes, and a device left out of full days is gone
  push(9, '2026-11-07T22:00:00Z'); push(9, '2026-11-08T22:00:00Z'); push(9, '2026-11-09T22:00:00Z');
  assert.equal(s.lsPresence.short, undefined);
  assert.deepEqual(objs.filter(o => sourcesOfWith(o, s.lsPresence).some(x => x.gone)).map(o => o.id), ['d9']);
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

test('the weekly e-mail names the devices that may no longer be there, as the Overview', async () => {
  const { buildDigest } = await import('../server/digest.js');
  const s = { ...base([
    { id: 'a', name: 'PC-GONE', code: 'INV-1', status: 'active', adGone: '2026-11-01', graph: { gone: '02.11.2026 08:00' } },
    { id: 'b', name: 'PC-HERE', code: 'INV-2', status: 'active', inAd: true },
    { id: 'c', name: 'PC-OLD', code: 'INV-3', status: 'retired', adGone: '2026-11-01' },
    { id: 'd', name: 'PC-QUIET', code: 'INV-4', status: 'active', inAd: true, ad: { logon: '2026-06-01T08:00:00Z' } },
    { id: 'e', name: 'PC-NOSCAN', code: 'INV-5', status: 'active', inAd: true, ad: { logon: '2026-11-15T08:00:00Z' }, feed: { sys: 'Lansweeper', ref: 'r5', scanned: '2026-07-01' } },
  ]), contracts: [], users: [] };
  const d = buildDigest(s, {}, new Date('2026-11-18T08:00:00Z'));
  assert.match(d.text, /Where are they\? 3 devices: 1 gone from every source, 1 not seen for 90 days, 1 not scanned by Lansweeper for 3 months/);
  assert.match(d.text, /- PC-GONE \(INV-1\): gone from every source\n\s+- PC-QUIET \(INV-4\): not seen for 90 days\n\s+- PC-NOSCAN \(INV-5\): not scanned by Lansweeper for 3 months/);
  assert.doesNotMatch(d.text, /PC-HERE|PC-OLD/);
  /* Lansweeper switched off: its scan dates no longer count. */
  assert.doesNotMatch(buildDigest({ ...s, useLansweeper: false }, {}, new Date('2026-11-18T08:00:00Z')).text, /PC-NOSCAN/);
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

test('an AD read that would take the mark from more than half of the devices is set aside: none is found gone', () => {
  const objs = Array.from({ length: 12 }, (_, i) => ({ id: 'a' + i, name: 'PC-' + i, status: 'active' }));
  const s = base(objs);
  const comp = name => ({ name, dns: name.toLowerCase() + '.corp.example', groups: [], os: '', domain: '', logon: '2026-11-01', created: '2020-01-02' });
  applyComputers(s, objs.map(o => comp(o.name)), new Date('2026-11-01T10:00:00Z'));
  assert.ok(objs.every(o => o.inAd));
  applyComputers(s, objs.slice(0, 3).map(o => comp(o.name)), new Date('2026-11-02T10:00:00Z'));   // 3 of 12 came back
  assert.ok(objs.every(o => o.inAd && !o.adGone), 'nobody loses the mark');
  assert.deepEqual(s.adShort, { day: '2026-11-02', n: 3, of: 12, ns: [3], days: 1 });
  applyComputers(s, objs.slice(0, 11).map(o => comp(o.name)), new Date('2026-11-03T10:00:00Z'));   // one really gone
  assert.equal(s.adShort, undefined);
  assert.deepEqual(objs.filter(o => o.adGone).map(o => o.id), ['a11']);
});

test('a week of short AD reads of about the same size is the new size: the devices no longer there are found gone', () => {
  const objs = Array.from({ length: 20 }, (_, i) => ({ id: 'a' + i, name: 'PC-' + i, status: 'active' }));
  const s = base(objs);
  const comp = name => ({ name, dns: name.toLowerCase() + '.corp.example', groups: [], os: '', domain: '', logon: '2026-11-01', created: '2020-01-02' });
  applyComputers(s, objs.map(o => comp(o.name)), new Date('2026-11-01T10:00:00Z'));
  for (const d of ['2026-11-02', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']){   // twice on one day counts once
    applyComputers(s, objs.slice(0, 8).map(o => comp(o.name)), new Date(d + 'T10:00:00Z'));
    assert.ok(s.adShort && objs.every(o => !o.adGone), 'still set aside on ' + d);
  }
  applyComputers(s, objs.slice(0, 8).map(o => comp(o.name)), new Date('2026-11-08T10:00:00Z'));
  assert.equal(s.adShort, undefined);
  assert.equal(objs.filter(o => o.adGone).length, 12);
});

test('a week of short push days of about the same size becomes the new full day', () => {
  const s = base([ls('a', 'PC-A')]);
  const days = Array.from({ length: 7 }, (_, i) => ({ day: `2026-11-${String(10 - i).padStart(2, '0')}`, n: 4 }));
  s.lsPresence = { day: '2026-11-11', n: 4, since: '2026-10-01', full: { day: '2026-11-03', n: 10 }, short: { day: '2026-11-10', n: 4, of: 10 }, days };
  mergeRecords(s, recordsFromJson([{ ref: 'r-a', name: 'PC-A', serial: 'S-a' }]), new Date('2026-11-12T08:00:00Z'));
  assert.deepEqual(s.lsPresence.full, { day: '2026-11-11', n: 4 });
  assert.equal(s.lsPresence.short, undefined);
});

test('a device a file uploaded by hand brought is not gone from Lansweeper before it was there', async () => {
  const { sourcesOfWith } = await import('../public/js/gone.js');
  const P = { day: '2026-11-21', since: '2026-10-01', full: { day: '2026-11-21', n: 50 } };
  const o = { id: 'z', status: 'active', feed: { sys: 'Lansweeper', ref: 'rz', created: '20.11.2026 09:00' } };
  assert.equal(sourcesOfWith(o, P)[0].gone, false, 'came on 20.11, one day before the full day');
  const later = sourcesOfWith(o, { ...P, day: '2026-11-23', full: { day: '2026-11-23', n: 50 } })[0];
  assert.equal(later.gone, true); assert.match(later.when, /since 20\.11\.2026/);
});

test('a device the push finds by serial number under a new asset id is still listed by Lansweeper', () => {
  const s = base([ls('a', 'PC-A')]);   // feed.ref r-a
  mergeRecords(s, recordsFromJson([{ ref: 'NEW-77', name: 'PC-A', serial: 'S-a' }]), new Date('2026-11-10T22:00:00Z'));
  assert.equal(s.objs.length, 1, 'no second device');
  assert.equal(s.objs[0].feed.inPush, '2026-11-10');
});

test('a saved built-in type in its old default colour takes the new one; a colour picked stays', async () => {
  const { migrateState } = await import('../server/migrate.js');
  const s = { ...base([]), types: { switch: { label: 'Switch', short: 'Switch', color: '#c2410c', icon: 'switch' }, printer: { label: 'Printer', short: 'Printer', color: '#123456', icon: 'printer' } } };
  assert.equal(migrateState(s), true);
  assert.equal(s.types.switch.color, '#0d9488'); assert.equal(s.types.printer.color, '#123456');
  assert.equal(migrateState(s), false, 'nothing more the second time');
  const same = { ...base([]), types: { vm: { label: 'Virtual machine', short: 'VM', color: '#7c3aed', icon: 'server' } } };
  assert.equal(migrateState(same), false, 'a colour that stayed the same is no upgrade');
});
