/* The copy of the backups in cloud storage, optional, beside or instead of the folder: Azure Blob Storage (a container
   URL with a SAS token that may write) or any S3 storage (Amazon S3, MinIO, Wasabi …: a bucket URL with an access key).
   Only the server names it (environment, or *_FILE for the secret parts); the page can neither see nor change it. The
   same encrypted file as in the folder is uploaded; the storage keeps it as long as its own lifecycle rule says (set
   one there: the inventory does not delete in the cloud). Nothing of the URL's token or the keys is ever logged or
   shown: errors name only the status. */
import crypto from 'node:crypto';
import { readSecret } from './secrets.js';

/* What the server names: { kind: 'azure', base, sas } or { kind: 's3', url, region, accessKey, secretKey }, or null. */
export function cloudTarget(env = process.env) {
  try { return readTarget(env); } catch (e) { return { error: String(e.message || e).slice(0, 200) }; }
}
/* Azure first, else S3, else null. A setting that is wrong comes back as { error }, a short reason without any secret,
   so Health can say what to fix; cloudTarget turns a throw (an unreadable secret file) into one too. */
function readTarget(env) {
  const az = String(readSecret(env, 'NI_BACKUP_EXPORT_AZURE_URL') || '').trim();
  if (az) {
    let u; try { u = new URL(az); } catch { return { error: 'NI_BACKUP_EXPORT_AZURE_URL is not an address.' }; }
    if (u.protocol !== 'https:' || !u.search) return { error: 'NI_BACKUP_EXPORT_AZURE_URL needs https and a SAS token (…?sv=…&sig=…).' };
    return { kind: 'azure', label: 'Azure Blob Storage', base: `${u.origin}${u.pathname.replace(/\/$/, '')}`, sas: u.search.slice(1) };
  }
  const s3 = String(env.NI_BACKUP_EXPORT_S3_URL || '').trim();
  if (s3) {
    let u; try { u = new URL(s3); } catch { return { error: 'NI_BACKUP_EXPORT_S3_URL is not an address.' }; }
    const accessKey = String(env.NI_BACKUP_EXPORT_S3_ACCESS_KEY || '').trim(), secretKey = String(readSecret(env, 'NI_BACKUP_EXPORT_S3_SECRET_KEY') || '').trim();
    if (u.protocol !== 'https:' && env.NI_BACKUP_EXPORT_S3_ALLOW_HTTP !== '1') return { error: 'NI_BACKUP_EXPORT_S3_URL needs https.' };
    if (!accessKey || !secretKey) return { error: 'S3 needs NI_BACKUP_EXPORT_S3_ACCESS_KEY and NI_BACKUP_EXPORT_S3_SECRET_KEY (or _FILE).' };
    return { kind: 's3', label: 'S3', url: `${u.origin}${u.pathname.replace(/\/$/, '')}`, region: String(env.NI_BACKUP_EXPORT_S3_REGION || 'us-east-1').trim(), accessKey, secretKey };
  }
  return null;
}

const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const encPath = p => p.split('/').map(seg => encodeURIComponent(seg).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
/* AWS Signature Version 4 for one request: the Authorization header for the headers given (all of them are signed). */
export function signS3({ method, path, query = '', headers, payloadHash, region, accessKey, secretKey, amzDate, service = 's3' }) {
  const names = Object.keys(headers).map(k => k.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
  const canonical = [method, encPath(path), query, names.map(n => `${n}:${lower[n]}`).join('\n') + '\n', names.join(';'), payloadHash].join('\n');
  const day = amzDate.slice(0, 8), scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac('AWS4' + secretKey, day), region), service), 'aws4_request');
  return `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${hmac(key, toSign).toString('hex')}`;
}

/* Uploads one file's bytes under name; throws with the status only. */
export async function uploadToCloud(target, name, bytes, fetchImpl = fetch, now = new Date()) {
  if (!target || target.error) throw new Error(target ? target.error : 'No cloud storage is set on the server.');
  let r;
  if (target.kind === 'azure') {
    r = await fetchImpl(`${target.base}/${encodeURIComponent(name)}?${target.sas}`, { method: 'PUT', body: bytes,
      headers: { 'x-ms-blob-type': 'BlockBlob', 'x-ms-version': '2021-08-06', 'content-type': 'application/octet-stream' } });
  } else {
    const u = new URL(target.url), path = `${u.pathname.replace(/\/$/, '')}/${name}`;
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const headers = { host: u.host, 'x-amz-content-sha256': sha(bytes), 'x-amz-date': amzDate, 'content-type': 'application/octet-stream' };
    const authorization = signS3({ method: 'PUT', path, headers, payloadHash: headers['x-amz-content-sha256'], region: target.region, accessKey: target.accessKey, secretKey: target.secretKey, amzDate });
    /* fetch sets Host itself (it is signed above with the same value). */
    const send = Object.fromEntries(Object.entries(headers).filter(([k]) => k !== 'host'));
    r = await fetchImpl(`${u.origin}${encPath(path)}`, { method: 'PUT', body: bytes, headers: { ...send, authorization } });
  }
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    const code = (/<Code>([^<]{1,80})<\/Code>/.exec(body) || [])[1] || '';
    throw new Error(`${target.label} refused the upload (${r.status}${code ? ' ' + code : ''}).`);
  }
  return { cloud: target.label };
}
