/* Microsoft Graph as a second source: the join status, Intune enrolment and compliance of each device, and the values
   the inventory does not have yet. It signs in with a certificate, so no password is kept, and it only reads. */
import crypto from 'node:crypto';
import { HttpError } from './errors.js';
import { loadState, saveState } from './state.js';
import { autoBackup } from './backup.js';
import { readSecret } from './secrets.js';
import { stamp } from './feed.js';

export const GRAPH = 'https://graph.microsoft.com/v1.0';
const GRAPH_ORIGIN = 'https://graph.microsoft.com';

/* The tenant and the app are named in the environment; the certificate and its private key come from secrets (or files). */
export function graphConfigOf(env) {
  const tenant = (env.NI_GRAPH_TENANT || '').trim(), clientId = (env.NI_GRAPH_CLIENT_ID || '').trim();
  const keyPem = readSecret(env, 'NI_GRAPH_KEY'), certPem = readSecret(env, 'NI_GRAPH_CERT');
  if (!tenant || !clientId || !keyPem || !certPem) return null;
  return { tenant, clientId, keyPem, certPem };
}

/* The thumbprint Microsoft matches the certificate by: the SHA-256 of the certificate, base64url. */
export const thumbprintOf = certPem => crypto.createHash('sha256').update(new crypto.X509Certificate(certPem).raw).digest('base64url');

/* A signed assertion that proves the app holds the private key. It is valid for five minutes. */
export function clientAssertion(cfg, now = new Date()) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const t = Math.floor(now.getTime() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT', 'x5t#S256': thumbprintOf(cfg.certPem) });
  const body = b64({ aud: `https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/token`, iss: cfg.clientId, sub: cfg.clientId, jti: crypto.randomUUID(), nbf: t, exp: t + 300 });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), cfg.keyPem).toString('base64url');
  return `${head}.${body}.${sig}`;
}

export async function graphToken(cfg, now = new Date(), fetchImpl = fetch) {
  const body = new URLSearchParams({
    client_id: cfg.clientId, scope: `${GRAPH_ORIGIN}/.default`, grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: clientAssertion(cfg, now),
  });
  const r = await fetchImpl(`https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    const why = String(j.error_description || j.error || r.status).split('\r')[0].slice(0, 200);
    throw new HttpError(502, 'Microsoft did not give a token: ' + why);
  }
  return j.access_token;
}

/* Every page of a list. A next link is only followed while it stays on Microsoft Graph. */
export async function graphAll(token, url, fetchImpl = fetch) {
  const out = [];
  for (let next = url, pages = 0; next && pages < 200; pages++) {
    if (new URL(next).origin !== GRAPH_ORIGIN) throw new HttpError(502, 'Microsoft Graph gave a link to somewhere else.');
    const r = await fetchImpl(next, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) throw new HttpError(502, `Microsoft Graph answered ${r.status} for ${new URL(url).pathname}.`);
    const j = await r.json();
    out.push(...(j.value || []));
    next = j['@odata.nextLink'] || null;
  }
  return out;
}

const DEVICE_SELECT = 'id,deviceId,displayName,trustType,isManaged,approximateLastSignInDateTime';
const MANAGED_SELECT = 'id,azureADDeviceId,deviceName,serialNumber,manufacturer,model,operatingSystem,osVersion,userPrincipalName,totalStorageSpaceInBytes,physicalMemoryInBytes,wiFiMacAddress,ethernetMacAddress,lastSyncDateTime,enrolledDateTime,complianceState,isEncrypted,managementAgent';
/* How a join type reads in the inventory. */
export const JOIN = { AzureAd: 'Entra joined', ServerAd: 'Domain joined', Workplace: 'Registered' };
const clean = v => String(v ?? '').trim();
const gb = bytes => (Number(bytes) > 0 ? `${Math.round(Number(bytes) / 2 ** 30)} GB` : '');

/* One record per device: the Intune view where there is one, otherwise the Entra view, matched by the Entra device id. */
export function toRecords(devices, managed) {
  const byAad = new Map(devices.map(d => [d.deviceId, d]));
  const seen = new Set();
  const out = managed.map(m => {
    const d = byAad.get(m.azureADDeviceId) || {};
    seen.add(m.azureADDeviceId);
    return {
      graphId: m.id, aadId: m.azureADDeviceId, name: clean(m.deviceName || d.displayName), serial: clean(m.serialNumber),
      join: JOIN[d.trustType] || clean(d.trustType), managed: m.managementAgent ? clean(m.managementAgent) : (d.isManaged ? 'Intune' : ''),
      enrolled: clean(m.enrolledDateTime), lastSync: clean(m.lastSyncDateTime || d.approximateLastSignInDateTime),
      compliance: clean(m.complianceState), encrypted: m.isEncrypted === true ? 'yes' : m.isEncrypted === false ? 'no' : '',
      owner: clean(m.userPrincipalName), os: clean([m.operatingSystem, m.osVersion].filter(Boolean).join(' ')),
      model: clean([m.manufacturer, m.model].filter(Boolean).join(' ')), mac: clean(m.wiFiMacAddress || m.ethernetMacAddress),
      ram: gb(m.physicalMemoryInBytes), disk: gb(m.totalStorageSpaceInBytes),
    };
  });
  /* Devices Entra knows but Intune does not: they have no serial here, so they are matched by name. */
  for (const d of devices) if (!seen.has(d.deviceId)) out.push({
    graphId: d.id, aadId: d.deviceId, name: clean(d.displayName), serial: '', join: JOIN[d.trustType] || clean(d.trustType),
    managed: d.isManaged ? 'Intune' : '', enrolled: '', lastSync: clean(d.approximateLastSignInDateTime), compliance: '', encrypted: '',
    owner: '', os: '', model: '', mac: '', ram: '', disk: '',
  });
  return out;
}

export async function fetchGraph(cfg, now = new Date(), fetchImpl = fetch) {
  const token = await graphToken(cfg, now, fetchImpl);
  const devices = await graphAll(token, `${GRAPH}/devices?$select=${DEVICE_SELECT}`, fetchImpl);
  const managed = await graphAll(token, `${GRAPH}/deviceManagement/managedDevices?$select=${MANAGED_SELECT}`, fetchImpl);
  return toRecords(devices, managed);
}

/* Puts the records on the devices. The join, enrolment and compliance are kept on the device as they come. Values the
   device does not have yet are filled in; values it has are never replaced here. A change of compliance is logged. */
export function applyGraph(s, records, now = new Date()) {
  const at = stamp(now);
  const counts = { matched: 0, unmatched: 0, filled: 0 };
  const live = s.objs.filter(o => o.status !== 'retired');
  for (const r of records) {
    const o = (r.serial && live.find(x => clean(x.serial).toLowerCase() === r.serial.toLowerCase()))
      || (r.name && live.find(x => clean(x.name).toLowerCase() === r.name.toLowerCase()));
    if (!o) { counts.unmatched++; continue; }
    counts.matched++;
    const before = o.graph || {};
    if (before.compliance && r.compliance && before.compliance !== r.compliance) {
      (s.history[o.id] ??= []).unshift({ t: at, msg: `Compliance changed from ${before.compliance} to ${r.compliance} (Microsoft Graph)` });
    }
    o.graph = { id: r.graphId, aadId: r.aadId, join: r.join, managed: r.managed, enrolled: r.enrolled, lastSync: r.lastSync, compliance: r.compliance, encrypted: r.encrypted, owner: r.owner, seen: at };
    for (const k of ['os', 'model', 'mac', 'ram', 'disk']) if (!o[k] && r[k]) { o[k] = r[k]; counts.filled++; }
  }
  return counts;
}

export async function syncGraph(db, cfg, now = new Date(), fetchImpl = fetch) {
  const records = await fetchGraph(cfg, now, fetchImpl);
  const s = loadState(db);
  const counts = applyGraph(s, records, now);
  autoBackup(db, 'before a Microsoft Graph sync');
  saveState(db, s);
  return { devices: records.length, ...counts };
}
