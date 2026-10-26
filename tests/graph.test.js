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
