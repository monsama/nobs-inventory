/* Microsoft Graph as a second source: the join status, Intune enrolment and compliance of each device, and the values
   the inventory does not have yet. It signs in with a certificate, so no password is kept, and it only reads. */
import crypto from 'node:crypto';
import { HttpError } from './errors.js';
import { loadState, saveState } from './state.js';
import { autoBackup } from './backup.js';
import { readSecret } from './secrets.js';
import { stamp, typeFor } from './feed.js';
import { checkAddress } from './validate.js';

/* Intune writes a MAC as twelve hex digits with no separators (00155D012345). It is stored the way the inventory writes
   one, 00:15:5d:01:23:45; a value that is not a MAC is left out, so it cannot make the whole sync fail its checks. */
export const macOf = raw => {
  const v = String(raw || '').trim();
  const r = checkAddress('mac', /^[0-9a-f]{12}$/i.test(v) ? v.match(/../g).join(':') : v);
  return v && r.ok ? r.value : '';
};

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
/* The thumbprint Entra shows for an uploaded certificate: SHA-1, upper-case hex. */
export const entraThumbprintOf = certPem => crypto.createHash('sha1').update(new crypto.X509Certificate(certPem).raw).digest('hex').toUpperCase();
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
    throw new HttpError(502, (signInHint(why) || 'Microsoft did not give a token.') + ' (' + why + ')');
  }
  return j.access_token;
}

/* What the usual sign-in errors mean, in the words of the setup steps. */
const SIGN_IN_HINTS = [
  [/AADSTS700027|AADSTS700023|certificate|Client assertion contains an invalid signature/i, 'Entra does not know this certificate. Upload the .cer to the app registration, under Certificates & secrets, and check the thumbprint.'],
  [/AADSTS700016|application with identifier .* was not found/i, 'There is no app with this application (client) ID in this tenant. Copy it from the app registration\'s Overview page.'],
  [/AADSTS90002|AADSTS900023|tenant .* not found|invalid tenant/i, 'There is no tenant with this directory (tenant) ID. Copy it from the app registration\'s Overview page.'],
  [/AADSTS7000112|disabled/i, 'The app registration is disabled in Entra.'],
];
const signInHint = why => (SIGN_IN_HINTS.find(([re]) => re.test(why)) || [])[1];

/* Signs in and reads one device from each list the sync reads. A list that answers 403 lacks its permission or the admin
   consent for it. */
export async function testGraph(cfg, fetchImpl = fetch) {
  const token = await graphToken(cfg, new Date(), fetchImpl);
  const lists = [['devices', 'Device.Read.All', `${GRAPH}/devices?$top=1&$select=id`], ['managedDevices', 'DeviceManagementManagedDevices.Read.All', `${GRAPH}/deviceManagement/managedDevices?$top=1&$select=id`]];
  const out = { signedIn: true, missing: [] };
  for (const [name, permission, url] of lists) {
    const r = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
    out[name] = r.ok;
    if (!r.ok) out.missing.push(r.status === 403 || r.status === 401 ? permission : `${permission} (Microsoft Graph answered ${r.status})`);
  }
  return out;
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
const MANAGED_SELECT = 'id,azureADDeviceId,deviceName,serialNumber,manufacturer,model,operatingSystem,osVersion,userPrincipalName,totalStorageSpaceInBytes,physicalMemoryInBytes,wiFiMacAddress,ethernetMacAddress,lastSyncDateTime,enrolledDateTime,complianceState,isEncrypted,managementAgent,userDisplayName';
/* How a join type reads in the inventory. Graph's ServerAd is a device joined to the on-premises AD and registered in Entra
   from there: hybrid joined. A device joined to the on-premises AD only is not in Graph at all. */
export const JOIN = { AzureAd: 'Entra joined', ServerAd: 'Hybrid joined', Workplace: 'Entra registered' };
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
      owner: clean(m.userPrincipalName), ownerName: clean(m.userDisplayName), os: clean([m.operatingSystem, m.osVersion].filter(Boolean).join(' ')),
      platform: clean(m.operatingSystem), lastCheckIn: clean(m.lastSyncDateTime), lastSignIn: clean(d.approximateLastSignInDateTime),
      model: clean([m.manufacturer, m.model].filter(Boolean).join(' ')), mac: macOf(m.wiFiMacAddress) || macOf(m.ethernetMacAddress),
      ram: gb(m.physicalMemoryInBytes), disk: gb(m.totalStorageSpaceInBytes),
    };
  });
  /* Devices Entra knows but Intune does not: they have no serial here, so they are matched by name. */
  for (const d of devices) if (!seen.has(d.deviceId)) out.push({
    graphId: d.id, aadId: d.deviceId, name: clean(d.displayName), serial: '', join: JOIN[d.trustType] || clean(d.trustType),
    managed: d.isManaged ? 'Intune' : '', enrolled: '', lastSync: clean(d.approximateLastSignInDateTime), compliance: '', encrypted: '',
    owner: '', ownerName: '', os: '', platform: '', lastCheckIn: '', lastSignIn: clean(d.approximateLastSignInDateTime), model: '', mac: '', ram: '', disk: '',
  });
  return out;
}

export async function fetchGraph(cfg, now = new Date(), fetchImpl = fetch) {
  const token = await graphToken(cfg, now, fetchImpl);
  const devices = await graphAll(token, `${GRAPH}/devices?$select=${DEVICE_SELECT}`, fetchImpl);
  const managed = await graphAll(token, `${GRAPH}/deviceManagement/managedDevices?$select=${MANAGED_SELECT}`, fetchImpl);
  return toRecords(devices, managed);
}

/* What Graph keeps on a device: how it is joined and managed, its compliance, encryption, primary user and when it was
   last seen, as Graph reports them. Shown on the device; never edited there. */
const graphOf = (r, at, added) => ({ id: r.graphId, aadId: r.aadId, join: r.join, managed: r.managed, enrolled: r.enrolled, lastSync: r.lastSync,
  lastCheckIn: r.lastCheckIn || '', lastSignIn: r.lastSignIn || '', compliance: r.compliance, encrypted: r.encrypted, owner: r.owner,
  ownerName: r.ownerName || '', os: r.os || '', seen: at, ...(added ? { added: true } : {}) });
/* The fields Graph can give a device. */
const FILL = ['os', 'model', 'mac', 'ram', 'disk'];
/* Puts the records on the devices. The join, enrolment and compliance are kept on the device as they come. Values the
   device does not have yet are filled in, the primary user and the serial number among them; values it has are never
   replaced here, except on a device that was added from Graph, which Graph keeps up to date. A change of compliance
   is logged. The devices Graph has that the inventory does not are kept as a list, to be added from Settings. */
export function applyGraph(s, records, now = new Date()) {
  const at = stamp(now);
  const counts = { matched: 0, unmatched: 0, filled: 0 };
  const live = s.objs.filter(o => o.status !== 'retired');
  const unmatched = [];
  for (const r of records) {
    const o = (r.serial && live.find(x => clean(x.serial).toLowerCase() === r.serial.toLowerCase()))
      || (r.name && live.find(x => clean(x.name).toLowerCase() === r.name.toLowerCase()));
    /* A device the inventory has as retired is known: it is not offered to be added again. */
    if (!o && s.objs.some(x => x.status === 'retired' && ((r.serial && clean(x.serial).toLowerCase() === r.serial.toLowerCase()) || (r.name && clean(x.name).toLowerCase() === r.name.toLowerCase())))) { counts.retired = (counts.retired || 0) + 1; continue; }
    if (!o) {
      counts.unmatched++;
      unmatched.push({ id: r.graphId, name: r.name, serial: r.serial, model: r.model, os: r.os, platform: r.platform || '', owner: r.ownerName || r.owner,
        join: r.join, managed: r.managed, compliance: r.compliance, lastSync: r.lastSync });
      continue;
    }
    counts.matched++;
    const before = o.graph || {};
    if (before.compliance && r.compliance && before.compliance !== r.compliance) {
      (s.history[o.id] ??= []).unshift({ t: at, msg: `Compliance changed from ${before.compliance} to ${r.compliance} (Microsoft Graph)` });
    }
    /* Graph keeps a device it added up to date, until Lansweeper takes it over; then Graph only fills gaps, like everywhere. */
    const owns = !!before.added && !o.feed;
    o.graph = graphOf(r, at, owns);
    /* A device excluded from sync, or detached, keeps its fields: only what Graph reports about it is updated. */
    if (o.excluded || o.detached) continue;
    const ovr = o.ovr || {};
    for (const k of FILL) {
      if (!r[k] || o[k] === r[k]) continue;
      if (!o[k] || (owns && ovr[k] !== false)) { o[k] = r[k]; counts.filled++; }
    }
    /* Matched by name: the serial number Intune knows is taken over. */
    if (!o.serial && r.serial) { o.serial = r.serial; counts.filled++; }
    /* The primary user, on a device that has nobody yet; a person chosen by hand is never replaced. */
    if (r.ownerName && !o.uid && !o.user && !o.hotdesk && ovr.user !== false) { o.user = r.ownerName; counts.filled++; }
  }
  s.graphUnmatched = unmatched.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 2000);
  return counts;
}

/* The type of a device Graph has, from its platform: a phone or tablet by its system, a Windows device by the type
   rules on its model (a notebook model is a notebook), anything else from the rules or Other. */
export function graphType(s, d) {
  const p = String(d.platform || d.os || '').toLowerCase();
  if (/ipados|ios/.test(p)) return 'ios';
  if (/android/.test(p)) return 'android';
  const t = typeFor(s, '', d.model, '', d.name, '');
  if (/macos|mac os/.test(p)) return t === 'other' || t === 'pc' ? 'notebook' : t;
  if (/windows/.test(p)) return t === 'other' ? 'pc' : t;
  return t;
}
/* Adds devices from the list of those Graph has and the inventory does not. Each gets the next code, its type from its
   platform, what Graph knows of it, and is kept up to date by Graph from then on. */
export function addFromGraph(s, ids, who, now = new Date()) {
  const at = stamp(now), want = ids === 'all' ? null : new Set(ids);
  const list = (s.graphUnmatched || []).filter(d => !want || want.has(d.id));
  const added = [];
  /* The list is from the last sync: a device the inventory got since (from Lansweeper, say), or one listed twice in Graph
     (enrolled again), is not added a second time. Retired devices count, so they are not brought back as new ones. */
  const low = v => clean(v).toLowerCase();
  const names = new Set(s.objs.map(o => low(o.name)).filter(Boolean)), serials = new Set(s.objs.map(o => low(o.serial)).filter(Boolean));
  for (const d of list) {
    if (!d.name || names.has(low(d.name)) || (d.serial && serials.has(low(d.serial)))) continue;
    names.add(low(d.name)); if (d.serial) serials.add(low(d.serial));
    s.codeN = (s.codeN || 0) + 1; s.seq = (s.seq || 100) + 1;
    const o = { id: 'o' + s.seq, code: 'INV-' + String(s.codeN).padStart(4, '0'), type: graphType(s, d), name: d.name, serial: d.serial || '', status: 'active',
      loc: '', ovr: {}, feed: null, ...(d.model ? { model: d.model } : {}), ...(d.os ? { os: d.os } : {}), ...(d.owner ? { user: d.owner } : {}),
      graph: { id: d.id, join: d.join, managed: d.managed, compliance: d.compliance, lastSync: d.lastSync, seen: at, added: true } };
    s.objs.push(o);
    (s.history[o.id] ??= []).unshift({ t: at, msg: `Added from Microsoft Graph by ${who}` });
    added.push(o.id);
  }
  const done = new Set(list.map(d => d.id));
  s.graphUnmatched = (s.graphUnmatched || []).filter(d => !done.has(d.id));
  return added;
}

export async function syncGraph(db, cfg, now = new Date(), fetchImpl = fetch) {
  const records = await fetchGraph(cfg, now, fetchImpl);
  const s = loadState(db);
  const counts = applyGraph(s, records, now);
  autoBackup(db, 'before a Microsoft Graph sync');
  saveState(db, s);
  return { devices: records.length, ...counts };
}
export function addGraphDevices(db, ids, who) {
  const s = loadState(db);
  autoBackup(db, 'before adding devices from Microsoft Graph');
  const added = addFromGraph(s, ids, who);
  saveState(db, s);
  return added;
}
