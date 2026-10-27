import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRecords, applyGraph, applyGraphPeople } from '../server/graph.js';
import { applyComputers } from '../server/ldap-sync.js';
import { adDay, adOs, computerOf, COMPUTER_ATTRS } from '../server/ldap.js';
import { fillField } from '../server/fill.js';
import { mergeRecords } from '../server/feed.js';

const NOW = new Date('2026-10-27T10:00:00Z');
const state = objs => ({ objs, rels: [], users: [], locs: [], types: {}, history: {}, policy: { os: true, domain: true, model: true } });
const rec = over => ({ graphId: 'g1', aadId: 'a1', name: 'PC-1', serial: 'S1', join: 'Hybrid joined', managed: 'mdm', enrolled: '', lastSync: '', lastCheckIn: '', lastSignIn: '',
  compliance: 'compliant', encrypted: 'yes', owner: '', ownerName: '', os: 'Windows 11 Enterprise 10.0.22631', platform: 'Windows', model: 'HP EliteBook', mac: '', ram: '16 GB', disk: '', ...over });

test('AD times and operating systems read the way the page shows them', () => {
  assert.equal(adDay('133430688000000000'), '2023-10-29', 'Windows file time');
  assert.equal(adDay('20211005123456.0Z'), '2021-10-05', 'generalized time');
  assert.equal(adDay('0'), '', 'never logged on');
  assert.equal(adDay(''), '');
  assert.equal(adOs('Windows Server 2019 Standard', '10.0 (17763)'), 'Windows Server 2019 Standard (10.0.17763)');
  assert.equal(adOs('Windows 10 Enterprise', ''), 'Windows 10 Enterprise');
  assert.equal(adOs('', '10.0 (19045)'), '');
  const c = computerOf({ cn: ['SRV-01'], dnshostname: ['srv-01.Corp.Example.ch'], operatingsystem: ['Windows Server 2022 Datacenter'], operatingsystemversion: ['10.0 (20348)'],
    lastlogontimestamp: ['133430688000000000'], whencreated: ['20211005123456.0Z'], memberof: [] });
  assert.deepEqual(c, { name: 'SRV-01', dns: 'srv-01.Corp.Example.ch', groups: [], os: 'Windows Server 2022 Datacenter (10.0.20348)', domain: 'corp.example.ch', logon: '2023-10-29', created: '2021-10-05' });
});

test('the computer lookup names what it reads: no LAPS password or BitLocker key is asked for', () => {
  assert.ok(!COMPUTER_ATTRS.includes('*'));
  for (const secret of ['ms-mcs-admpwd', 'mslaps-password', 'mslaps-encryptedpassword', 'msfve-recoverypassword']) assert.ok(!COMPUTER_ATTRS.includes(secret), secret);
});

test('AD fills empty OS and domain, notes the source and the history, and never replaces a value typed or from Lansweeper', () => {
  const s = state([
    { id: 'a', name: 'SRV-01', status: 'active' },
    { id: 'b', name: 'SRV-02', status: 'active', os: 'Windows Server 2016 (typed)' },
    { id: 'c', name: 'SRV-03', status: 'active', ovr: { os: false } },
    { id: 'd', name: 'SRV-04', status: 'active', excluded: true },
  ]);
  const comp = (name, os) => ({ name, dns: name.toLowerCase() + '.corp.ch', groups: [], os, domain: 'corp.ch', logon: '2026-10-20', created: '2020-01-02' });
  const list = ['SRV-01', 'SRV-02', 'SRV-03', 'SRV-04'].map(n => comp(n, 'Windows Server 2019 Standard (10.0.17763)'));
  assert.equal(applyComputers(s, list, NOW), 4);
  const [a, b, c, d] = s.objs;
  assert.equal(a.os, 'Windows Server 2019 Standard (10.0.17763)'); assert.equal(a.domain, 'corp.ch');
  assert.deepEqual(a.src, { os: 'ad', domain: 'ad' });
  assert.deepEqual(a.ad, { logon: '2026-10-20', created: '2020-01-02' });
  assert.match(s.history.a.map(h => h.msg).join('\n'), /Active Directory: Operating system filled in: Windows Server 2019/);
  assert.equal(b.os, 'Windows Server 2016 (typed)', 'a typed value stays'); assert.equal(b.src.os, undefined);
  assert.equal(c.os, undefined, 'cleared by hand: never filled');
  assert.equal(d.os, undefined, 'excluded: fields stay'); assert.deepEqual(d.ad, { logon: '2026-10-20', created: '2020-01-02' }, 'what AD says is still kept');
  assert.equal(applyComputers(s, list, NOW), 0, 'nothing changes the second time');
  // Settings turned AD filling off: the account is still read, no field is filled
  const s2 = { ...state([{ id: 'e', name: 'SRV-01', status: 'active' }]), fillAd: false };
  applyComputers(s2, list, NOW);
  assert.equal(s2.objs[0].os, undefined); assert.equal(s2.objs[0].inAd, true);
});

test('who wins: hand, then Lansweeper, then Graph, then AD', () => {
  const s = state([{ id: 'p', name: 'PC-1', serial: 'S1', status: 'active' }]);
  const o = s.objs[0];
  applyComputers(s, [{ name: 'PC-1', dns: '', groups: [], os: 'Windows 10 Enterprise (10.0.22631)', domain: '', logon: '', created: '' }], NOW);
  assert.equal(o.src.os, 'ad');
  // Graph knows better than AD
  applyGraph(s, [rec()], NOW);
  assert.equal(o.os, 'Windows 11 Enterprise 10.0.22631'); assert.equal(o.src.os, 'graph');
  assert.match(s.history.p.map(h => h.msg).join('\n'), /Intune: Operating system changed from Windows 10 Enterprise/);
  // AD does not take it back
  applyComputers(s, [{ name: 'PC-1', dns: '', groups: [], os: 'Windows 10 Enterprise (10.0.22631)', domain: '', logon: '', created: '' }], NOW);
  assert.equal(o.src.os, 'graph');
  // Lansweeper's value is Lansweeper's: the note goes
  mergeRecords(s, [{ name: 'PC-1', serial: 'S1', os: 'Windows 11 Enterprise (10.0.22631)', ref: '7' }], NOW);
  assert.equal(o.os, 'Windows 11 Enterprise (10.0.22631)'); assert.equal(o.src && o.src.os, undefined);
  // and Graph only fills gaps on a device Lansweeper has
  applyGraph(s, [rec({ os: 'Windows 11 Enterprise 10.0.26100' })], NOW);
  assert.equal(o.os, 'Windows 11 Enterprise (10.0.22631)');
  // a value typed by hand: fillField leaves it
  const t = { id: 't', os: 'typed' };
  assert.equal(fillField(null, t, 'os', 'Windows 11', 'graph', 'now'), false);
});

test('Graph: values it gave before are noted as its own, phone details are kept, and Settings can turn filling off', () => {
  const s = state([{ id: 'p', name: 'PC-1', serial: 'S1', status: 'active', model: 'HP EliteBook' }]);
  applyGraph(s, [rec()], NOW);
  assert.equal(s.objs[0].src.model, 'graph', 'the same value as Graph has: noted as Graph\'s');
  const records = toRecords([{ id: 'e1', deviceId: 'a9', displayName: 'iPhone Ana', trustType: 'Workplace' }],
    [{ id: 'm9', azureADDeviceId: 'a9', deviceName: 'iPhone Ana', serialNumber: 'F2', operatingSystem: 'iOS', osVersion: '18.1', imei: '35 123456 789012 3', phoneNumber: '+41 79 123 45 67',
      managedDeviceOwnerType: 'company', freeStorageSpaceInBytes: 32 * 2 ** 30, totalStorageSpaceInBytes: 128 * 2 ** 30 }]);
  assert.equal(records[0].imei, '351234567890123'); assert.equal(records[0].phone, '+41 79 123 45 67'); assert.equal(records[0].ownership, 'Company'); assert.equal(records[0].free, '32 GB');
  const s2 = state([{ id: 'i', name: 'iPhone Ana', serial: 'F2', status: 'active' }]);
  applyGraph(s2, records, NOW);
  const g = s2.objs[0].graph;
  assert.deepEqual([g.imei, g.phone, g.ownership, g.free], ['351234567890123', '+41 79 123 45 67', 'Company', '32 GB']);
  const s3 = { ...state([{ id: 'q', name: 'PC-1', serial: 'S1', status: 'active' }]), fillGraph: false };
  applyGraph(s3, [rec()], NOW);
  assert.equal(s3.objs[0].os, undefined); assert.equal(s3.objs[0].graph.compliance, 'compliant', 'what Graph reports is still kept');
});

test('department from Entra for anyone without one, and it gives way to the directory and Lansweeper', () => {
  const s = state([]);
  s.users = [{ id: 'u1', login: 'ana', name: 'Ana', source: 'ldap' }, { id: 'u2', login: 'ben', name: 'Ben', source: 'local', dept: 'Typed' }];
  applyGraphPeople(s, [{ id: 'e1', userPrincipalName: 'ana@x.ch', onPremisesSamAccountName: 'ana', displayName: 'Ana', department: 'Finance' },
    { id: 'e2', userPrincipalName: 'ben@x.ch', onPremisesSamAccountName: 'ben', displayName: 'Ben', department: 'Sales' }], 'match', NOW);
  assert.equal(s.users[0].dept, 'Finance'); assert.equal(s.users[0].deptFrom, 'entra');
  assert.equal(s.users[1].dept, 'Typed', 'a department typed here stays');
});
