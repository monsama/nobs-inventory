import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRecords, applyGraph, applyGraphPeople, intakeFromGraph, applyAutopilot } from '../server/graph.js';
import { applyComputers, listAdUnmatched, addFromAd, adType, intakeFromAd } from '../server/ldap-sync.js';
import { adDay, adOs, computerOf, COMPUTER_ATTRS, profileOf, cnOf } from '../server/ldap.js';
import { createThrottle } from '../server/throttle.js';
import { checkState } from '../server/state.js';
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
  assert.deepEqual(c, { name: 'SRV-01', dns: 'srv-01.Corp.Example.ch', groups: [], os: 'Windows Server 2022 Datacenter (10.0.20348)', domain: 'corp.example.ch', logon: '2023-10-29', created: '2021-10-05', ou: '', disabled: false,
    description: '', managedBy: '', location: '', services: [] });
  const d = computerOf({ cn: ['NB-7'], useraccountcontrol: ['4098'] }, 'CN=NB-7,OU=Notebooks,OU=Clients,DC=corp,DC=ch');
  assert.equal(d.disabled, true, 'userAccountControl 4098 has ACCOUNTDISABLE (2)');
  assert.equal(d.ou, 'Clients / Notebooks', 'the OUs, outermost first');
  assert.equal(computerOf({ cn: ['PC-1'], useraccountcontrol: ['4096'] }).disabled, false);
});

test('the computer lookup names what it reads: no LAPS password or BitLocker key is asked for', () => {
  assert.ok(!COMPUTER_ATTRS.includes('*'));
  for (const secret of ['ms-mcs-admpwd', 'mslaps-password', 'mslaps-encryptedpassword', 'msfve-recoverypassword']) assert.ok(!COMPUTER_ATTRS.includes(secret), secret);
});

test('AD fills empty OS and domain, notes the source and the history, and never replaces a value typed or from Lansweeper', () => {
  const s = state([
    { id: 'a', name: 'SRV-01', status: 'active' },
    { id: 'b', name: 'SRV-02', status: 'active', os: 'Windows Server 2016 (typed)' },
    { id: 'c', name: 'SRV-03', status: 'active', pick: { os: 'hand' } },
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
  // Lansweeper's value is Lansweeper's, and noted so
  mergeRecords(s, [{ name: 'PC-1', serial: 'S1', os: 'Windows 11 Enterprise (10.0.22631)', ref: '7' }], NOW);
  assert.equal(o.os, 'Windows 11 Enterprise (10.0.22631)'); assert.equal(o.src.os, 'ls');
  // and Graph only fills gaps on a field Lansweeper fills in
  applyGraph(s, [rec({ os: 'Windows 11 Enterprise 10.0.26100' })], NOW);
  assert.equal(o.os, 'Windows 11 Enterprise (10.0.22631)');
  // a field Lansweeper does not fill in (policy off) on a linked device: Graph still replaces AD and refreshes its own
  const s2 = { ...state([{ id: 'q', name: 'PC-1', serial: 'S1', status: 'active', feed: { sys: 'Lansweeper', ref: '8' } }]), policy: { os: false } };
  applyComputers(s2, [{ name: 'PC-1', dns: '', groups: [], os: 'Windows 10 Enterprise (10.0.19045)', domain: '', logon: '', created: '' }], NOW);
  applyGraph(s2, [rec()], NOW);
  assert.equal(s2.objs[0].os, 'Windows 11 Enterprise 10.0.22631'); assert.equal(s2.objs[0].src.os, 'graph');
  applyGraph(s2, [rec({ os: 'Windows 11 Enterprise 10.0.26100' })], NOW);
  assert.equal(s2.objs[0].os, 'Windows 11 Enterprise 10.0.26100');
  // a value typed by hand: fillField leaves it
  const t = { id: 't', os: 'typed' };
  assert.equal(fillField(null, t, 'os', 'Windows 11', 'graph', 'now'), false);
  assert.equal(fillField(null, { id: 'h', os: 'typed', src: { os: 'hand' } }, 'os', 'Windows 11', 'graph', 'now'), false, 'noted as typed by hand');
  assert.equal(fillField(null, { id: 'l', os: 'from LS', src: { os: 'ls' } }, 'os', 'Windows 11', 'ad', 'now'), false, 'Lansweeper\'s value');
  // a device Lansweeper brings in: every value it came with is noted as Lansweeper's
  const n = { objs: [], rels: [], policy: {}, feedOn: true, locs: ['HQ'], seq: 100, codeN: 0, rseq: 0, intake: { lansweeper: 'direct' }, history: {} };
  mergeRecords(n, [{ name: 'PC-9', serial: 'S9', os: 'Windows 11', ip: '10.0.0.9', location: 'HQ', ref: '9' }], NOW);
  assert.deepEqual(n.objs[0].src, { ip: 'ls', os: 'ls', loc: 'ls' });
});

test('Graph: a value typed that matches it stays the page\'s, phone details are kept, and Settings can turn filling off', () => {
  const s = state([{ id: 'p', name: 'PC-1', serial: 'S1', status: 'active', model: 'HP EliteBook' }]);
  applyGraph(s, [rec()], NOW);
  assert.equal(s.objs[0].src && s.objs[0].src.model, undefined, 'the same value as Graph has: not marked as Graph\'s');
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

test('computer accounts the inventory does not have are listed, and added on request with what AD knows', () => {
  const s = { ...state([{ id: 'a', name: 'PC-1', status: 'active' }, { id: 'r', name: 'OLD-PC', status: 'retired' }, { id: 'f', name: 'srv-9.corp.ch', status: 'active' }]), typeRules: undefined, seq: 100, codeN: 3 };
  const comp = (name, over) => ({ name, dns: name.toLowerCase() + '.corp.ch', groups: [], os: 'Windows 11 Enterprise (10.0.22631)', domain: 'corp.ch', logon: '2026-10-20', created: '2024-01-02', ou: 'Clients', disabled: false, ...over });
  const counts = listAdUnmatched(s, [comp('PC-1'), comp('OLD-PC'), comp('SRV-9', { os: 'Windows Server 2022 Standard' }), comp('NB-20', { groups: ['GPO-Laptops'] }),
    comp('PC-OFF', { disabled: true }), comp('SRV-NEW', { os: 'Windows Server 2022 Standard (10.0.20348)', ou: 'Servers' })]);
  assert.deepEqual(s.adUnmatched.map(d => d.name), ['NB-20', 'SRV-NEW'], 'in the inventory (also retired, also by DNS name) or disabled: not listed');
  assert.deepEqual(counts, { adUnmatched: 2, adDisabled: 1 });
  assert.equal(adType(s, { name: 'NB-20', os: 'Windows 11 Enterprise' }), 'notebook', 'the type rules on the name');
  assert.equal(adType(s, { name: 'SRV-NEW', os: 'Windows Server 2022 Standard' }), 'server', 'a server by its system');
  assert.equal(adType(s, { name: 'WS-17', os: 'Windows 10 Pro' }), 'pc', 'another Windows computer is a PC');

  const added = addFromAd(s, ['nb-20'], 'Ana', NOW);
  assert.equal(added.length, 1);
  const o = s.objs.find(x => x.id === added[0]);
  assert.equal(o.name, 'NB-20'); assert.equal(o.type, 'notebook'); assert.equal(o.code, 'INV-0004');
  assert.equal(o.os, 'Windows 11 Enterprise (10.0.22631)'); assert.equal(o.domain, 'corp.ch');
  assert.deepEqual(o.src, { os: 'ad', domain: 'ad' }, 'marked as from AD, so Lansweeper and Intune can replace the values');
  assert.equal(o.inAd, true); assert.deepEqual(o.ad, { logon: '2026-10-20', created: '2024-01-02' }); assert.deepEqual(o.adGroups, ['GPO-Laptops']);
  assert.match(s.history[o.id][0].msg, /Added from Active Directory by Ana/);
  assert.deepEqual(s.adUnmatched.map(d => d.name), ['SRV-NEW'], 'an added one leaves the list');
  // the device Lansweeper brought in since the sync is not added a second time
  s.objs.push({ id: 'x', name: 'srv-new', status: 'active' });
  assert.equal(addFromAd(s, 'all', 'Ana', NOW).length, 0);
  assert.equal(s.adUnmatched.length, 0);
});

test('found devices wait in To review by default; a source set to add directly adds them, except ones not seen for long', () => {
  const comp = (name, logon) => ({ id: name.toLowerCase(), name, os: 'Windows 11 Enterprise', domain: 'corp.ch', ...(logon ? { logon } : {}) });
  const s = { ...state([]), seq: 100, codeN: 0, adUnmatched: [comp('PC-NEW', '2026-10-20'), comp('PC-OLD', '2025-01-01'), comp('PC-NEVER')] };
  assert.deepEqual(intakeFromAd(s, NOW), { direct: 0, review: 3 });
  assert.deepEqual(s.objs.map(o => [o.name, o.review && o.review.src]), [['PC-NEW', 'ad'], ['PC-OLD', 'ad'], ['PC-NEVER', 'ad']]);
  assert.match(s.history[s.objs[0].id][0].msg, /waiting in To review/);
  assert.deepEqual(s.adUnmatched, [], 'the list is used up');

  const t = { ...state([]), seq: 100, codeN: 0, intake: { ad: 'direct' }, adUnmatched: [comp('PC-NEW', '2026-10-20'), comp('PC-OLD', '2025-01-01')] };
  assert.deepEqual(intakeFromAd(t, NOW), { direct: 1, review: 1 });
  assert.equal(t.objs.find(o => o.name === 'PC-NEW').review, undefined, 'straight in');
  assert.equal(t.objs.find(o => o.name === 'PC-OLD').review.src, 'ad', 'no logon for long: still waits');

  const g = { ...state([]), seq: 100, codeN: 0, graphUnmatched: [{ id: 'm1', name: 'iPhone Ana', platform: 'iOS', lastSync: '2026-10-26T08:00:00Z' }, { id: 'm2', name: 'OLD-TAB', platform: 'Android', lastSync: '2025-02-01T08:00:00Z' }] };
  assert.deepEqual(intakeFromGraph(g, NOW), { direct: 0, review: 2 });
  assert.deepEqual(g.objs.map(o => [o.name, o.type, o.review.src]), [['iPhone Ana', 'ios', 'graph'], ['OLD-TAB', 'android', 'graph']]);
  const h = { ...state([]), seq: 100, codeN: 0, intake: { graph: 'direct' }, graphUnmatched: g.objs.length ? [{ id: 'm1', name: 'iPhone Ana', platform: 'iOS', lastSync: '2026-10-26T08:00:00Z' }, { id: 'm2', name: 'OLD-TAB', platform: 'Android', lastSync: '2025-02-01T08:00:00Z' }] : [] };
  assert.deepEqual(intakeFromGraph(h, NOW), { direct: 1, review: 1 });
  // a device that waits (or was ignored) is in the inventory's list, so no sync offers it again
  g.graphUnmatched = [{ id: 'm1', name: 'iPhone Ana', platform: 'iOS', lastSync: '2026-10-26T08:00:00Z' }];
  assert.deepEqual(intakeFromGraph(g, NOW), { direct: 0, review: 0 });
});

test('a computer account tells who manages it, where it is and what it runs, and its description fills the purpose', () => {
  const c = computerOf({ cn: ['SQL-01'], description: ['ERP database'], managedby: ['CN=Anna Muster,OU=IT,DC=corp,DC=ch'], location: ['Server room'],
    serviceprincipalname: ['MSSQLSvc/sql-01.corp.ch:1433', 'HOST/SQL-01', 'TERMSRV/SQL-01', 'RestrictedKrbHost/SQL-01', 'HTTP/sql-01.corp.ch'] });
  assert.equal(c.description, 'ERP database');
  assert.equal(c.managedBy, 'Anna Muster');
  assert.equal(c.location, 'Server room');
  assert.deepEqual(c.services, ['Remote Desktop', 'SQL Server', 'Web']);
  const s = state([{ id: 'a', name: 'SQL-01', status: 'active' }, { id: 'b', name: 'SQL-02', status: 'active', purpose: 'typed' }]);
  s.locs = ['Server room'];
  applyComputers(s, [{ ...c, groups: [], logon: '2026-10-20' }, { ...c, name: 'SQL-02', location: 'Somewhere new', groups: [] }], NOW);
  const [a, b] = s.objs;
  assert.equal(a.purpose, 'ERP database'); assert.equal(a.src.purpose, 'ad');
  assert.equal(a.loc, 'Server room', 'a location the inventory knows by that name');
  assert.equal(b.purpose, 'typed', 'a purpose typed is kept');
  assert.equal(b.loc, undefined, 'a location the inventory does not know is not made up');
  assert.deepEqual(a.ad, { logon: '2026-10-20', managedBy: 'Anna Muster', location: 'Server room', description: 'ERP database', services: ['Remote Desktop', 'SQL Server', 'Web'] });
  assert.doesNotThrow(() => checkState(JSON.parse(JSON.stringify({ ...s, objs: s.objs.map(o => ({ ...o, type: 'server' })) }))));
});

test('a person gets title, phones, office, manager and e-mail from the directory, or from Entra when the directory has none', () => {
  const p = profileOf({ samaccountname: ['amu'], displayname: ['Anna Muster'], title: ['IT lead'], telephonenumber: ['+41 44 000 00 00'], mobile: [''],
    physicaldeliveryofficename: ['B2.14'], manager: ['CN=Ben Boss,OU=Staff,DC=corp,DC=ch'], mail: ['anna@corp.ch'] }, { loginAttr: 'sAMAccountName' });
  assert.deepEqual(p.profile, { title: 'IT lead', phone: '+41 44 000 00 00', office: 'B2.14', manager: 'Ben Boss', mail: 'anna@corp.ch' });
  const s = { users: [{ id: 'u1', login: 'amu', name: 'Anna Muster', source: 'ldap', profile: { ...p.profile, from: 'ldap' } }, { id: 'u2', login: 'cco', name: 'Carl Co', source: 'local' }], objs: [] };
  const entra = [
    { id: 'e1', userPrincipalName: 'amu@corp.ch', displayName: 'Anna Muster', onPremisesSamAccountName: 'amu', jobTitle: 'Other title', mobilePhone: '+41 79 1' },
    { id: 'e2', userPrincipalName: 'cco@corp.ch', displayName: 'Carl Co', onPremisesSamAccountName: 'cco', jobTitle: 'Accountant', businessPhones: ['+41 44 2'], manager: { displayName: 'Ben Boss' } },
  ];
  applyGraphPeople(s, entra, 'match', NOW);
  assert.equal(s.users[0].profile.title, 'IT lead', 'the directory wins: Entra has it from there');
  assert.deepEqual(s.users[1].profile, { title: 'Accountant', phone: '+41 44 2', manager: 'Ben Boss', from: 'entra' });
  applyGraphPeople(s, [{ ...entra[0] }, { ...entra[1], jobTitle: '', businessPhones: [], manager: null }], 'match', NOW);
  assert.equal(s.users[1].profile, undefined, 'what Entra no longer says goes');
});

test('Autopilot: a known serial gets its group tag; an unknown one waits in To review until Intune names it', () => {
  const s = state([{ id: 'a', name: 'NB-1', serial: 'SER1', status: 'active', type: 'notebook' }]);
  s.seq = 100; s.codeN = 0;
  const r = applyAutopilot(s, [
    { serialNumber: 'SER1', groupTag: 'Sales', purchaseOrderIdentifier: 'PO-7', enrollmentState: 'enrolled', model: 'HP', lastContactedDateTime: '2026-10-20T08:00:00Z' },
    { serialNumber: 'SER2', groupTag: 'Lab', model: 'Surface Laptop 5', manufacturer: 'Microsoft', enrollmentState: 'notContacted' },
  ], NOW);
  assert.equal(r.autopilot, 1, 'devices the inventory had'); assert.equal(r.autopilotNew, 1);
  assert.equal(s.objs[0].autopilot.groupTag, 'Sales');
  assert.equal(s.objs[0].autopilot.order, 'PO-7');
  const n = s.objs[1];
  assert.equal(n.name, 'SER2'); assert.equal(n.serial, 'SER2'); assert.equal(n.review.src, 'graph');
  applyAutopilot(s, [{ serialNumber: 'SER2', groupTag: 'Lab' }], NOW);
  assert.equal(s.objs.length, 2, 'not added twice');
  assert.equal(s.objs[0].autopilot, undefined, 'out of Autopilot: what it said goes');
});

test('a name with a comma in a DN is read whole', () => {
  assert.equal(cnOf('CN=Doe\\, John,OU=Staff,DC=corp'), 'Doe, John');
  assert.equal(cnOf('CN=Sales\\2C Zurich,OU=Groups'), 'Sales, Zurich');
  assert.equal(computerOf({ cn: ['PC'], managedby: ['CN=Smith\\, Ann,OU=IT'] }).managedBy, 'Smith, Ann');
});

test('a directory entry without title or phones keeps what Entra gave: the two syncs do not take it from each other', () => {
  const s = { users: [{ id: 'u1', login: 'amu', name: 'Anna', source: 'ldap', profile: { title: 'Lead', from: 'entra' } }], objs: [] };
  applyGraphPeople(s, [{ id: 'e1', userPrincipalName: 'amu@corp.ch', displayName: 'Anna', onPremisesSamAccountName: 'amu', jobTitle: 'Lead' }], 'match', NOW);
  assert.deepEqual(s.users[0].profile, { title: 'Lead', from: 'entra' });
});

test('Autopilot: Intune\'s name is not given when another device has it; a model renamed in Settings stays renamed', () => {
  const s = state([{ id: 'a', name: 'SER9', serial: 'SER9', status: 'active', type: 'pc', autopilot: { groupTag: 'X' } }, { id: 'b', name: 'PC-9', status: 'active', type: 'pc', inAd: true }]);
  s.modelMap = { 'HP EliteBook': 'EliteBook 840' };
  applyGraph(s, [rec({ name: 'PC-9', serial: 'SER9' })], NOW);
  assert.equal(s.objs[0].name, 'SER9', 'not a second PC-9');
  assert.equal(s.objs[0].model, 'EliteBook 840', 'the renamed model, not Intune\'s');
});

test('sign-in lock: an address that signed in to a login before is not locked out by failures from elsewhere', () => {
  const t = createThrottle(), now = Date.now();
  t.rememberSuccess(['login:admin', 'ip:10.0.0.5']);
  for (let i = 0; i < 20; i++) t.recordFailure(['login:admin', `ip:198.51.100.${i % 4}`], now);
  assert.equal(t.blocked(['login:admin', 'ip:198.51.100.9'], now), true, 'a new address is held off');
  assert.equal(t.blocked(['login:admin', 'ip:10.0.0.5'], now), false, 'the owner\'s address is not');
});

test('each source\'s value is kept beside the field, and a source picked for it is the only one that writes it', () => {
  const s = state([{ id: 'a', name: 'PC-1', serial: 'S1', status: 'active', type: 'pc', os: 'Win 10 (typed)', src: { os: 'hand' }, pick: { os: 'hand' } }]);
  applyGraph(s, [rec({ name: 'PC-1', serial: 'S1', os: 'Windows 11 Enterprise', lastCheckIn: '2026-10-28T07:00:00Z' })], NOW);
  applyComputers(s, [{ name: 'PC-1', dns: 'pc-1.corp.ch', groups: [], os: 'Windows 11 Enterprise (10.0.26100)', domain: 'corp.ch', logon: '2026-10-24' }], NOW);
  const o = s.objs[0];
  assert.equal(o.os, 'Win 10 (typed)', 'a value set by hand stays');
  assert.deepEqual(o.vals.os, { graph: ['Windows 11 Enterprise', '2026-10-28T07:00:00Z'], ad: ['Windows 11 Enterprise (10.0.26100)', '2026-10-24'] });
  // picked: AD writes it from now on, Intune does not
  o.pick = { os: 'ad' };
  applyGraph(s, [rec({ name: 'PC-1', serial: 'S1', os: 'Windows 11 Enterprise', lastCheckIn: '2026-10-28T08:00:00Z' })], NOW);
  assert.equal(o.os, 'Win 10 (typed)', 'Intune is not the picked source');
  applyComputers(s, [{ name: 'PC-1', dns: 'pc-1.corp.ch', groups: [], os: 'Windows 11 Enterprise (10.0.26100)', domain: 'corp.ch', logon: '2026-10-24' }], NOW);
  assert.equal(o.os, 'Windows 11 Enterprise (10.0.26100)'); assert.equal(o.src.os, 'ad');
  assert.doesNotThrow(() => checkState(JSON.parse(JSON.stringify(s))));
});

test('a location picked from AD is not taken back by Lansweeper; Intune\'s values go when the device leaves Intune', () => {
  const s = state([{ id: 'a', name: 'PC-1', serial: 'S1', status: 'active', type: 'pc', loc: 'Zurich', src: { loc: 'ad' }, pick: { loc: 'ad' }, feed: { sys: 'Lansweeper', ref: '7' }, ovr: {} }]);
  s.locs = ['Zurich', 'Bern']; s.policy = { ...s.policy, loc: true };
  mergeRecords(s, [{ name: 'PC-1', serial: 'S1', location: 'Bern', ref: '7' }], NOW);
  assert.equal(s.objs[0].loc, 'Zurich', 'the picked source keeps it');
  assert.deepEqual(s.objs[0].vals.loc.ls[0], 'Bern', 'Lansweeper\'s location is on offer');
  applyGraph(s, [rec({ name: 'PC-1', serial: 'S1', os: 'Windows 11' })], NOW);
  assert.ok(s.objs[0].vals.os.graph);
  applyGraph(s, [], NOW);
  assert.equal((s.objs[0].vals.os || {}).graph, undefined, 'gone from Intune: not offered any more');
});

test('a second record named by the DNS name: the AD account stays with the device of its own name, and Lansweeper puts the record in To review', () => {
  const s = state([
    { id: 'n', name: 'NB-35', serial: 'MP2V76BR', status: 'active', type: 'notebook' },
    { id: 'd', name: 'nb-35.corp.example', status: 'active', type: 'other', mac: '64:c9:01:e3:9c:d1' },
    { id: 'x', name: 'nb-99.corp.example', status: 'active', type: 'other' },
  ]);
  const comp = name => ({ name, dns: name.toLowerCase() + '.corp.example', groups: ['G_Clients'], os: 'Windows 11 Business (10.0.26200)', domain: 'corp.example', logon: '2026-10-22', created: '2026-10-02', description: 'Desk 4' });
  applyComputers(s, [comp('NB-35'), comp('NB-99')], NOW);
  const [n, d, x] = s.objs;
  assert.equal(n.inAd, true); assert.deepEqual(n.adGroups, ['G_Clients']); assert.equal(n.purpose, 'Desk 4');
  assert.equal(d.inAd, undefined, 'the DNS-named record does not get the account of NB-35');
  assert.equal(d.adGroups, undefined); assert.equal(d.os, undefined); assert.equal(d.purpose, undefined);
  assert.equal(x.inAd, true, 'with no device named NB-99, the DNS name still finds its account');

  // Lansweeper: a new record named nb-35.corp.example with no serial waits in To review, even when new devices go straight in
  const t = { ...state([{ id: 'n', name: 'NB-35', serial: 'MP2V76BR', status: 'active', type: 'notebook' }]), intake: { lansweeper: 'direct' }, feedOn: true, codeN: 1, seq: 100 };
  mergeRecords(t, [{ name: 'nb-35.corp.example', serial: '', ip: '10.1.2.104', mac: '64:c9:01:e3:9c:d1', model: 'INVENTEC Corporation', ref: '18257' },
    { name: 'nb-77.corp.example', serial: '', ip: '10.1.2.105', ref: '18258' },
    { name: 'NB-36', serial: 'S36', ip: '10.1.2.106', ref: '18259' }], NOW);
  const by = name => t.objs.find(o => o.name === name);
  assert.equal(by('nb-35.corp.example').review.src, 'lansweeper', 'a probable second record of NB-35 waits');
  assert.equal(by('nb-77.corp.example').review, undefined, 'no device named nb-77: added as Settings says');
  assert.equal(by('NB-36').review, undefined);

  // after Clear inventory both are new: the DNS-named record comes first in the push and is still known as the second one
  const u = { ...state([]), intake: { lansweeper: 'direct' }, feedOn: true, codeN: 1, seq: 100 };
  mergeRecords(u, [{ name: 'nb-35.corp.example', serial: '', ip: '10.1.2.104', ref: '18257' }, { name: 'NB-35', serial: 'MP2V76BR', ip: '10.1.2.107', ref: '18200' }], NOW);
  assert.equal(u.objs.find(o => o.name === 'nb-35.corp.example').review.src, 'lansweeper', 'in To review, whatever the order of the push');
  assert.equal(u.objs.find(o => o.name === 'NB-35').review, undefined, 'the device itself goes in as Settings says');

  // with "Merge second records" on, the record is no device: its address goes to NB-35 as a dock's adapter, and the next
  // push, which brings the device's own adapters, keeps it
  const w = { ...state([]), feedOn: true, mergeTwins: true, codeN: 1, seq: 100, policy: { ip: true } };
  mergeRecords(w, [{ name: 'nb-35.corp.example', serial: '', ip: '10.1.2.104', mac: '64:c9:01:e3:9c:d1', ref: '18257' }, { name: 'NB-35', serial: 'MP2V76BR', ip: '10.1.2.107', ref: '18200' }], NOW);
  assert.deepEqual(w.objs.map(o => o.name), ['NB-35'], 'no second device');
  assert.deepEqual(w.objs[0].nics, [{ name: 'Dock / USB adapter', ip: '10.1.2.104', mac: '64:c9:01:e3:9c:d1', merged: 'nb-35.corp.example' }]);
  mergeRecords(w, [{ name: 'NB-35', serial: 'MP2V76BR', ip: '10.1.2.107', ref: '18200', nics: [{ name: 'Wi-Fi', ip: '10.1.3.9' }] }, { name: 'nb-35.corp.example', serial: '', ip: '10.1.2.110', ref: '18257' }], NOW);
  assert.deepEqual(w.objs[0].nics.map(n => [n.name, n.ip]), [['Wi-Fi', '10.1.3.9'], ['Dock / USB adapter', '10.1.2.110']], 'the device\'s own adapter from Lansweeper, and the dock\'s new address');
  const ok = { objs: [], rels: [], users: [], locs: [], types: {}, history: {} };
  checkState({ ...ok, mergeTwins: true, objs: [{ id: 'x', code: 'INV-0001', type: 'pc', name: 'nb-1.corp.example', status: 'active', excluded: true, notTwin: true, review: { src: 'lansweeper', at: '2026-10-27 10:00', ignored: '2026-10-27 10:05', merged: 'o1' } }] });
  assert.throws(() => checkState({ ...ok, objs: [{ id: 'x', code: 'INV-0001', type: 'pc', name: 'nb-1.corp.example', status: 'active', notTwin: 'no' }] }), /not a duplicate/);
  assert.throws(() => checkState({ ...ok, mergeTwins: 'yes' }), /mergeTwins is on or off/);
});

test('a device\'s old overrides (o.ovr) become picks: false is By hand, true is Lansweeper only where the policy says otherwise', async () => {
  const { liftOvr } = await import('../server/fill.js');
  const policy = { os: true, user: false, software: true, links: false };
  const o = { id: 'x', name: 'PC-1', ovr: { os: false, user: true, ip: true, type: false, software: false, links: true }, pick: { ip: 'graph' } };
  assert.equal(liftOvr(o, policy), true);
  assert.equal(o.ovr, undefined, 'o.ovr goes');
  assert.deepEqual(o.pick, { ip: 'graph', os: 'hand', user: 'ls', type: 'hand', software: 'hand', links: 'ls' },
    'a pick already there stays; true only where the policy would not give the field to Lansweeper');
  const p = { id: 'y', name: 'PC-2', ovr: { os: true } };
  liftOvr(p, policy);
  assert.equal(p.pick, undefined, 'true where the policy says so already: automatic, nothing to keep');
  assert.equal(liftOvr({ id: 'z', name: 'PC-3' }, policy), false, 'nothing to do');
});
