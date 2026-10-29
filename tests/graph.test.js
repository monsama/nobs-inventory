import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { clientAssertion, graphToken, graphAll, thumbprintOf, toRecords, applyGraph, JOIN } from '../server/graph.js';
import { HttpError } from '../server/errors.js';

/* Recorded test certificate: it signs nothing real, and it only checks the sign-in is built the way Microsoft reads it. */
const certPem = fs.readFileSync(new URL('./fixtures/graph/test.crt', import.meta.url), 'utf8');
const keyPem = fs.readFileSync(new URL('./fixtures/graph/test.key', import.meta.url), 'utf8');
const cfg = { tenant: 'contoso.onmicrosoft.com', clientId: 'app-1', keyPem, certPem };
const NOW = new Date('2026-10-24T10:00:00Z');

test('the sign-in is a certificate assertion, signed with the private key, that names the certificate', () => {
  const [head, body, sig] = clientAssertion(cfg, NOW).split('.');
  const h = JSON.parse(Buffer.from(head, 'base64url').toString());
  const b = JSON.parse(Buffer.from(body, 'base64url').toString());
  assert.equal(h.alg, 'RS256');
  assert.equal(h['x5t#S256'], thumbprintOf(certPem));
  assert.equal(b.aud, 'https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/token');
  assert.equal(b.iss, 'app-1'); assert.equal(b.sub, 'app-1');
  assert.equal(b.exp - b.nbf, 300);
  const pub = new crypto.X509Certificate(certPem).publicKey;
  assert.equal(crypto.verify('sha256', Buffer.from(`${head}.${body}`), pub, Buffer.from(sig, 'base64url')), true);
});

test('a token is asked for with the assertion, and the token is returned', async () => {
  let sent = null;
  const fakeFetch = async (url, opts) => { sent = { url, body: new URLSearchParams(opts.body) }; return { ok: true, json: async () => ({ access_token: 'TOKEN' }) }; };
  assert.equal(await graphToken(cfg, NOW, fakeFetch), 'TOKEN');
  assert.equal(sent.body.get('grant_type'), 'client_credentials');
  assert.equal(sent.body.get('client_assertion_type'), 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
  assert.equal(sent.body.get('scope'), 'https://graph.microsoft.com/.default');
  assert.ok(sent.body.get('client_assertion').split('.').length === 3);
});

test('a refused sign-in says why, and no token is used', async () => {
  const refused = async () => ({ ok: false, status: 401, json: async () => ({ error_description: 'AADSTS700027: certificate not registered\r\nTrace' }) });
  await assert.rejects(graphToken(cfg, NOW, refused), err => err instanceof HttpError && /certificate not registered/.test(err.message) && !/Trace/.test(err.message));
});

test('every page of a list is read, and a link to another site is refused', async () => {
  const pages = { 'https://graph.microsoft.com/v1.0/devices': { value: [{ id: 1 }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/devices?page=2' }, 'https://graph.microsoft.com/v1.0/devices?page=2': { value: [{ id: 2 }] } };
  const fakeFetch = async url => ({ ok: true, json: async () => pages[url] });
  assert.deepEqual((await graphAll('T', 'https://graph.microsoft.com/v1.0/devices', fakeFetch)).map(x => x.id), [1, 2]);
  const evil = async () => ({ ok: true, json: async () => ({ value: [], '@odata.nextLink': 'https://evil.example.com/x' }) });
  await assert.rejects(graphAll('T', 'https://graph.microsoft.com/v1.0/devices', evil), /somewhere else/);
});

test('an Intune device and its Entra device are one record, and an Entra-only device is kept by name', () => {
  const devices = [{ id: 'd1', deviceId: 'aad-1', displayName: 'ZH-PC-0142', trustType: 'AzureAd', isManaged: true }, { id: 'd2', deviceId: 'aad-2', displayName: 'LAPTOP-9', trustType: 'AzureAd', isManaged: false }];
  const managed = [{ id: 'm1', azureADDeviceId: 'aad-1', deviceName: 'ZH-PC-0142', serialNumber: 'SN-ZH-PC-0142', manufacturer: 'Dell', model: 'Latitude 5420', operatingSystem: 'Windows', osVersion: '10.0.19045', physicalMemoryInBytes: 17179869184, totalStorageSpaceInBytes: 512110190592, complianceState: 'compliant', isEncrypted: true, managementAgent: 'mdm', userPrincipalName: 'ana@contoso.ch' }];
  const recs = toRecords(devices, managed);
  assert.equal(recs.length, 2);
  const pc = recs.find(r => r.serial === 'SN-ZH-PC-0142');
  assert.equal(pc.join, JOIN.AzureAd); assert.equal(pc.model, 'Dell Latitude 5420'); assert.equal(pc.ram, '16 GB'); assert.equal(pc.encrypted, 'yes');
  assert.equal(recs.find(r => r.name === 'LAPTOP-9').serial, '');
  assert.equal(pc.managed, 'Intune');
  assert.deepEqual([pc.aadId, pc.entraId, pc.intuneId], ['aad-1', 'd1', 'm1'], 'device ID, Entra object ID and Intune ID');
  assert.deepEqual([recs[1].aadId, recs[1].entraId, recs[1].intuneId], ['aad-2', 'd2', undefined]);
});

test('only an Intune agent counts as managed by Intune: Defender, Configuration Manager or mail alone do not', async () => {
  const { isIntune, otherManager } = await import('../public/js/intune.js');
  const dev = (id, agent) => ({ id: 'm' + id, azureADDeviceId: 'aad-' + id, deviceName: 'PC-' + id, serialNumber: 'S' + id, managementAgent: agent, complianceState: 'unknown' });
  const recs = toRecords([{ id: 'e9', deviceId: 'aad-9', displayName: 'PC-9', trustType: 'ServerAd', isManaged: true }],
    [dev(1, 'mdm'), dev(2, 'msSense'), dev(3, 'configurationManagerClient'), dev(4, 'configurationManagerClientMdm'), dev(5, 'eas')]);
  assert.deepEqual(recs.map(r => [r.name, isIntune(r.managed), otherManager(r.managed)]), [
    ['PC-1', true, ''], ['PC-2', false, 'Defender for Endpoint only'], ['PC-3', false, 'Configuration Manager only'],
    ['PC-4', true, ''], ['PC-5', false, 'Exchange ActiveSync only'], ['PC-9', false, 'Another MDM or Configuration Manager']]);
  // what older syncs kept (the raw agent) is read the same way
  assert.equal(isIntune('msSense'), false); assert.equal(isIntune('mdm'), true); assert.equal(isIntune('Intune'), true);
});

test('records fill the empty fields of matching devices, keep the ones they have, and log a compliance change', () => {
  const s = { objs: [
    { id: 'o1', name: 'ZH-PC-0142', serial: 'SN-ZH-PC-0142', model: 'Old model', status: 'active' },
    { id: 'o2', name: 'OLD-PC', serial: 'SN-OLD', status: 'retired' },
  ], history: {} };
  const rec = { graphId: 'm1', aadId: 'aad-1', name: 'ZH-PC-0142', serial: 'SN-ZH-PC-0142', join: 'Entra joined', managed: 'mdm', enrolled: '', lastSync: '', compliance: 'compliant', encrypted: 'yes', owner: 'ana@contoso.ch', os: 'Windows 10.0.19045', model: 'Dell Latitude 5420', mac: 'aa:bb', ram: '16 GB', disk: '512 GB' };
  const counts = applyGraph(s, [rec, { ...rec, serial: 'SN-OLD', name: 'OLD-PC' }], NOW);
  assert.equal(counts.matched, 1);
  const o = s.objs[0];
  assert.equal(o.model, 'Old model', 'a value the device has is kept');
  assert.equal(o.os, 'Windows 10.0.19045'); assert.equal(o.ram, '16 GB');
  assert.equal(o.graph.join, 'Entra joined');
  assert.equal(s.objs[1].graph, undefined, 'a retired device is not matched');
  applyGraph(s, [{ ...rec, compliance: 'noncompliant' }], NOW);
  assert.match(s.history.o1[0].msg, /Compliance changed from compliant to noncompliant/);
});

test('a MAC from Intune, written without separators, is stored as the inventory writes one, and the result can be saved', async () => {
  const { checkState } = await import('../server/state.js');
  const records = toRecords([], [{ id: 'm1', deviceName: 'PC-9', serialNumber: 'SN9', wiFiMacAddress: '00155D012345' }, { id: 'm2', deviceName: 'PC-8', serialNumber: 'SN8', ethernetMacAddress: 'not a mac' }]);
  assert.equal(records.find(r => r.serial === 'SN9').mac, '00:15:5d:01:23:45');
  assert.equal(records.find(r => r.serial === 'SN8').mac, '', 'a value that is not a MAC is left out');
  const s = { objs: [{ id: 'o1', code: 'INV-1', type: 'pc', name: 'PC-9', serial: 'SN9', status: 'active', ovr: {}, feed: null }, { id: 'o2', code: 'INV-2', type: 'pc', name: 'PC-8', serial: 'SN8', status: 'active', ovr: {}, feed: null }],
    rels: [], users: [], locs: [], types: {}, history: {} };
  applyGraph(s, records);
  assert.equal(s.objs[0].mac, '00:15:5d:01:23:45');
  checkState(s);   /* before, the sync stopped here: "00155D012345" is not a MAC address */
});

test('a sync fills the primary user and a missing serial, keeps the devices it did not match as a list, and adds them on request', async () => {
  const { checkState } = await import('../server/state.js');
  const { addFromGraph, graphType } = await import('../server/graph.js');
  const s = { objs: [
    { id: 'o1', code: 'INV-0001', type: 'pc', name: 'ZH-PC-0142', serial: '', status: 'active', ovr: {}, feed: null },
    { id: 'o2', code: 'INV-0002', type: 'pc', name: 'ZH-PC-0143', serial: 'SN43', status: 'active', ovr: {}, feed: null, uid: 'u1' },
  ], rels: [], users: [], locs: [], types: {}, history: {}, codeN: 2, seq: 102 };
  const base = { graphId: 'm1', aadId: 'a1', join: 'Entra joined', managed: 'mdm', enrolled: '', lastSync: '2026-10-25T08:00:00Z', lastCheckIn: '2026-10-25T08:00:00Z', lastSignIn: '', compliance: 'compliant', encrypted: 'yes', owner: 'ana@contoso.ch', ownerName: 'Ana Muster', os: 'Windows 10.0.22631', platform: 'Windows', model: '', mac: '', ram: '', disk: '' };
  const counts = applyGraph(s, [
    { ...base, name: 'ZH-PC-0142', serial: 'SN42' },
    { ...base, graphId: 'm2', name: 'ZH-PC-0143', serial: 'SN43' },
    { ...base, graphId: 'm3', name: 'iPhone Ana', serial: 'F2LX', platform: 'iOS', os: 'iOS 18.1', model: 'Apple iPhone 15' },
    { ...base, graphId: 'm4', name: 'LAPTOP-77', serial: 'L77', model: 'Lenovo ThinkPad T14 Gen 5' },
  ], NOW);
  assert.deepEqual([counts.matched, counts.unmatched], [2, 2]);
  assert.equal(s.objs[0].serial, 'SN42', 'a serial missing on a device matched by name is taken over');
  assert.equal(s.objs[0].user, 'Ana Muster', 'the primary user fills a device without one');
  assert.equal(s.objs[1].user, undefined, 'a device with a person keeps them');
  assert.equal(s.objs[0].graph.lastCheckIn, '2026-10-25T08:00:00Z');
  assert.deepEqual(s.graphUnmatched.map(d => d.name), ['iPhone Ana', 'LAPTOP-77'], 'the devices not in the inventory are kept, by name');
  assert.equal(graphType(s, s.graphUnmatched[0]), 'ios');
  assert.equal(graphType(s, s.graphUnmatched[1]), 'notebook', 'a Windows notebook model is a notebook');
  // add one, then all: each gets a code and its type, and leaves the list
  addFromGraph(s, ['m3'], 'Admin', NOW);
  const phone = s.objs.find(o => o.name === 'iPhone Ana');
  assert.equal(phone.code, 'INV-0003'); assert.equal(phone.type, 'ios'); assert.equal(phone.user, 'Ana Muster'); assert.equal(phone.graph.added, true);
  assert.deepEqual(s.graphUnmatched.map(d => d.name), ['LAPTOP-77']);
  addFromGraph(s, 'all', 'Admin', NOW);
  assert.equal(s.graphUnmatched.length, 0);
  // a device added from Graph is kept up to date by Graph; others only get empty fields filled
  applyGraph(s, [{ ...base, graphId: 'm3', name: 'iPhone Ana', serial: 'F2LX', platform: 'iOS', os: 'iOS 18.2', model: 'Apple iPhone 15' }], NOW);
  assert.equal(phone.os, 'iOS 18.2');
  checkState(s);
});

test('Graph keeps hand edits on a device it added, hands it over to Lansweeper, leaves excluded devices, and adds nothing twice', async () => {
  const { addFromGraph } = await import('../server/graph.js');
  const rec = { graphId: 'm1', aadId: 'a1', name: 'iPhone Ana', serial: 'F2LX', join: 'Registered', managed: 'mdm', enrolled: '', lastSync: '', lastCheckIn: '', lastSignIn: '', compliance: 'compliant', encrypted: 'yes', owner: '', ownerName: '', os: 'iOS 18.1', platform: 'iOS', model: 'Apple iPhone 15', mac: '', ram: '', disk: '' };
  const s = { objs: [{ id: 'r1', code: 'INV-0001', type: 'pc', name: 'OLD-PC', serial: 'OLD1', status: 'retired', ovr: {}, feed: null }], rels: [], users: [], locs: [], types: {}, history: {}, codeN: 1, seq: 101 };
  // a device that only matches a retired one is known, not offered again
  const c1 = applyGraph(s, [rec, { ...rec, graphId: 'm2', name: 'OLD-PC', serial: 'OLD1' }, { ...rec, graphId: 'm3' }], NOW);
  assert.equal(c1.retired, 1);
  assert.deepEqual(s.graphUnmatched.map(d => [d.id, d.others]), [['m1', 1]], 'listed twice in Graph (enrolled again): one entry, with one duplicate');
  addFromGraph(s, 'all', 'Admin', NOW);
  assert.equal(s.objs.filter(o => o.name === 'iPhone Ana').length, 1, 'a device listed twice is added once');
  const phone = s.objs.find(o => o.name === 'iPhone Ana');
  // a model corrected by hand is kept
  phone.model = 'iPhone 15 (blue)'; phone.pick = { ...(phone.pick || {}), model: 'hand' };
  applyGraph(s, [{ ...rec, os: 'iOS 18.2' }], NOW);
  assert.equal(phone.model, 'iPhone 15 (blue)'); assert.equal(phone.os, 'iOS 18.2');
  // once Lansweeper has it, and fills the OS in, Graph only fills gaps
  phone.feed = { sys: 'Lansweeper', ref: 'x' }; s.policy = { os: true };
  applyGraph(s, [{ ...rec, os: 'iOS 19' }], NOW);
  assert.equal(phone.os, 'iOS 18.2'); assert.equal(phone.graph.added, undefined);
  // excluded: what Graph reports is updated, the fields are not
  const pc = { id: 'p1', code: 'INV-0009', type: 'pc', name: 'PC-X', serial: 'X1', status: 'active', ovr: {}, feed: null, excluded: true };
  s.objs.push(pc);
  applyGraph(s, [{ ...rec, graphId: 'm9', name: 'PC-X', serial: 'X1', os: 'Windows 11', ownerName: 'Ana Muster' }], NOW);
  assert.equal(pc.os, undefined); assert.equal(pc.user, undefined); assert.equal(pc.graph.compliance, 'compliant');
  // a device that got into the inventory since the last sync is not added again
  s.graphUnmatched = [{ id: 'm9', name: 'PC-X', serial: 'X1' }];
  assert.deepEqual(addFromGraph(s, 'all', 'Admin', NOW), []);
});

test('several Graph records of one device: the current one gives the join, the others are listed as duplicates', async () => {
  const { applyGraph, toRecords, pickPrimary } = await import('../server/graph.js');
  const at = new Date('2026-10-26T10:00:00Z');
  const s = { objs: [{ id: 'o1', name: 'PC-01', status: 'active', ovr: {} }, { id: 'o2', name: 'PC-02', status: 'active', ovr: {} }], history: {} };
  const devices = [
    /* Dual state: hybrid joined and, from before, Entra registered; the registered record is the newer one here. */
    { id: 'h', deviceId: 'h1', displayName: 'PC-01', trustType: 'ServerAd', approximateLastSignInDateTime: '2026-10-20T08:00:00Z' },
    { id: 'w', deviceId: 'w1', displayName: 'PC-01', trustType: 'Workplace', approximateLastSignInDateTime: '2026-10-25T08:00:00Z' },
    /* Reinstalled: the old record has not signed in for two years; the new one is managed by Intune. */
    { id: 'old', deviceId: 'x1', displayName: 'PC-02', trustType: 'AzureAd', approximateLastSignInDateTime: '2024-01-01T08:00:00Z' },
    { id: 'new', deviceId: 'x2', displayName: 'PC-02', trustType: 'AzureAd', approximateLastSignInDateTime: '2026-10-25T08:00:00Z' },
  ];
  const managed = [{ id: 'm-new', azureADDeviceId: 'x2', deviceName: 'PC-02', complianceState: 'compliant', lastSyncDateTime: '2026-10-25T09:00:00Z', managementAgent: 'mdm' }];
  const c = applyGraph(s, toRecords(devices, managed), at);
  assert.equal(s.objs[0].graph.join, 'Hybrid joined', 'joined wins over registered when both are recent');
  assert.deepEqual(s.objs[0].graph.others.map(x => x.join), ['Entra registered']);
  assert.equal(s.objs[1].graph.id, 'm-new', 'the current record, not the stale one');
  assert.equal(s.objs[1].graph.others[0].last.slice(0, 10), '2024-01-01');
  assert.deepEqual([c.records, c.devices, c.matched, c.duplicates], [4, 2, 2, 2]);
  /* A stale record never wins over a current one, even with the stronger join. */
  assert.equal(pickPrimary([{ join: 'Entra joined', lastSignIn: '2024-01-01T00:00:00Z' }, { join: 'Entra registered', lastSignIn: '2026-10-25T00:00:00Z' }]).join, 'Entra registered');
  /* The same sync again logs no compliance change: only the current record counts. */
  applyGraph(s, toRecords(devices, managed), at);
  assert.equal((s.history.o2 || []).length, 0);
});

test('a Graph record that fits two inventory devices is put on neither and listed; a device Graph no longer has is marked gone', async () => {
  const { applyGraph } = await import('../server/graph.js');
  const rec = (id, name, serial = '') => ({ graphId: id, aadId: id, name, serial, join: 'Entra joined', managed: 'mdm', compliance: 'compliant', lastSync: '2026-10-25T08:00:00Z' });
  const s = { objs: [
    { id: 'o1', name: 'KIOSK', status: 'active', ovr: {} }, { id: 'o2', name: 'kiosk', status: 'active', ovr: {} },
    { id: 'o3', name: 'PC-03', status: 'active', ovr: {}, graph: { id: 'g3', join: 'Entra joined', seen: '01.10.2026 06:00' } },
  ], history: {} };
  const c = applyGraph(s, [rec('k', 'Kiosk')], new Date('2026-10-26T10:00:00Z'));
  assert.equal(s.objs[0].graph, undefined); assert.equal(s.objs[1].graph, undefined);
  assert.deepEqual(s.graphAmbiguous, [{ name: 'Kiosk', serial: '', by: 'name', devices: ['o1', 'o2'], records: 1 }]);
  assert.equal(c.ambiguous, 1);
  assert.ok(s.objs[2].graph.gone, 'PC-03 is no longer in Graph');
  assert.equal(s.objs[2].graph.join, 'Entra joined', 'what Graph said is kept');
  assert.equal(c.gone, 1);
  /* Back in Graph: no longer gone. */
  applyGraph(s, [rec('g3', 'PC-03')], new Date('2026-10-27T10:00:00Z'));
  assert.equal(s.objs[2].graph.gone, undefined);
  assert.deepEqual(s.graphAmbiguous, []);
});

test('Graph does not refill a field cleared by hand, and does not take a device by name when its serial number is another', async () => {
  const { applyGraph, graphAll } = await import('../server/graph.js');
  const rec = { graphId: 'g1', aadId: 'a1', name: 'PC1', serial: 'AAA', join: 'Entra joined', managed: 'mdm', compliance: 'compliant', lastSync: '2026-10-25T08:00:00Z', model: 'Dell X', os: 'Windows 11' };
  const s = { objs: [{ id: 'o1', name: 'PC1', status: 'active', pick: { model: 'hand' }, model: '' }], history: {} };
  applyGraph(s, [rec], NOW);
  assert.equal(s.objs[0].model, '', 'cleared by hand, stays empty');
  assert.equal(s.objs[0].os, 'Windows 11', 'other empty fields are filled');
  /* PC1 has serial AAA; a new machine also named PC1 with serial BBB is another device. */
  const t = { objs: [{ id: 'o1', name: 'PC1', serial: 'AAA', status: 'active', ovr: {} }], history: {} };
  const c = applyGraph(t, [{ ...rec, graphId: 'g2', serial: 'BBB', model: 'New' }], NOW);
  assert.equal(t.objs[0].graph, undefined); assert.equal(t.objs[0].model, undefined);
  assert.equal(c.unmatched, 1);
  /* A listing longer than the limit stops the sync instead of being cut short. */
  const endless = async () => ({ ok: true, json: async () => ({ value: [{}], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/devices?page' }) });
  await assert.rejects(graphAll('t', 'https://graph.microsoft.com/v1.0/devices', endless), /more than 1000 pages/);
});

test('Defender for Endpoint: read with its own token when Settings asks for it, matched by Entra id or name', async () => {
  const { fetchGraphAll, applyDefender } = await import('../server/graph.js');
  const asked = [];
  const reply = (status, json) => ({ ok: status === 200, status, json: async () => json });
  const fakeFetch = (allowDefender) => async (url, opts) => {
    asked.push(String(url));
    if (String(url).includes('/oauth2/')) return reply(200, { access_token: new URLSearchParams(opts.body).get('scope').includes('securitycenter') ? 'MDE' : 'GRAPH' });
    if (String(url).startsWith('https://api.securitycenter.microsoft.com/')) return allowDefender
      ? reply(200, { value: [{ id: 'x1', computerDnsName: 'zh-pc-0142.corp.local', aadDeviceId: 'AAD-1', healthStatus: 'Active', onboardingStatus: 'Onboarded', riskScore: 'Low', exposureLevel: 'Medium', lastSeen: '2026-10-27T08:00:00Z' },
        { id: 'x2', computerDnsName: 'srv-files', healthStatus: 'Inactive', riskScore: 'High', lastSeen: '2026-09-01T08:00:00Z' }] })
      : reply(403, {});
    return reply(200, { value: [] });
  };
  const off = await fetchGraphAll({ ...cfg, defender: 'off' }, NOW, fakeFetch(true));
  assert.equal(off.machines, null); assert.ok(!asked.some(u => u.includes('securitycenter')), 'not asked when off');
  const no = await fetchGraphAll({ ...cfg, defender: 'on' }, NOW, fakeFetch(false));
  assert.match(no.defenderError, /Machine\.Read\.All \(WindowsDefenderATP\)/);
  const on = await fetchGraphAll({ ...cfg, defender: 'on' }, NOW, fakeFetch(true));
  assert.equal(on.machines.length, 2);
  const s = { objs: [
    { id: 'a', name: 'LAPTOP-RENAMED', status: 'active', graph: { aadId: 'aad-1' } },
    { id: 'b', name: 'SRV-FILES', status: 'active' }, { id: 'c', name: 'PC-NONE', status: 'active', defender: { health: 'Active' } }] };
  assert.equal(applyDefender(s, on.machines, NOW), 2);
  assert.deepEqual([s.objs[0].defender.health, s.objs[0].defender.risk], ['Active', 'Low'], 'by the Entra device id, whatever the name');
  assert.deepEqual([s.objs[1].defender.health, s.objs[1].defender.risk], ['Inactive', 'High'], 'by the name');
  assert.equal(s.objs[2].defender, undefined, 'a device Defender does not have any more loses it');
});

test('a record disabled in Entra is no duplicate: an enabled one is the device, and a device with only disabled records is not offered', () => {
  const dev = (id, name, enabled, last) => ({ id: 'e' + id, deviceId: 'aad-' + id, displayName: name, trustType: 'AzureAd', accountEnabled: enabled, approximateLastSignInDateTime: last });
  const recs = toRecords([dev(1, 'PC-A', false, '2026-10-26T08:00:00Z'), dev(2, 'PC-A', true, '2026-10-01T08:00:00Z'), dev(3, 'OLD-PC', false, '2026-01-01T08:00:00Z')], []);
  const s = { objs: [{ id: 'o1', name: 'PC-A', status: 'active' }], history: {} };
  const c = applyGraph(s, recs, NOW);
  assert.equal(s.objs[0].graph.aadId, 'aad-2', 'the enabled record is the device, though the disabled one signed in later');
  assert.equal(s.objs[0].graph.disabled, undefined);
  assert.deepEqual(s.objs[0].graph.others.map(x => [x.id, x.disabled]), [['e1', true]]);
  assert.equal(c.duplicates, 0); assert.equal(c.disabled, 2);
  assert.deepEqual(s.graphUnmatched, [], 'OLD-PC is only disabled records: not offered to be added');
});

test('Intune devices: a property Graph does not know (400) does not stop the sync; the list comes without the extras', async () => {
  const { fetchGraphAll } = await import('../server/graph.js');
  const asked = [];
  const reply = (status, json) => ({ ok: status === 200, status, json: async () => json });
  const fakeFetch = async (url, opts) => {
    const u = decodeURIComponent(String(url)); asked.push(u);
    if (u.includes('/oauth2/')) return reply(200, { access_token: 'GRAPH' });
    if (u.includes('/deviceManagement/managedDevices')) {
      if (/autopilotEnrolled/.test(u)) return reply(400, {});
      if (/jailBroken/.test(u) && fakeFetch.refuseExtras) return reply(400, {});
      return reply(200, { value: [{ id: 'm1', deviceName: 'PC-1', serialNumber: 'S1', managementAgent: 'mdm', jailBroken: 'False' }] });
    }
    return reply(200, { value: [] });
  };
  const ok = await fetchGraphAll({ ...cfg, defender: 'off' }, NOW, fakeFetch);
  assert.ok(!asked.some(u => /autopilotEnrolled/.test(u)), 'v1.0 has no autopilotEnrolled: not asked for');
  assert.equal(ok.records.length, 1);
  fakeFetch.refuseExtras = true; asked.length = 0;
  const fallback = await fetchGraphAll({ ...cfg, defender: 'off' }, NOW, fakeFetch);
  assert.equal(fallback.records.length, 1, 'read again without the extras');
  assert.ok(asked.some(u => u.includes('/managedDevices') && !/jailBroken/.test(u)));
});
