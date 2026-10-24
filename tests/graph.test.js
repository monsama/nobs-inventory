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
