import { HttpError } from './errors.js';
import { loadState, saveState } from './state.js';
import { audit } from './db.js';
import { feedChanged, mergeRecords } from './feed.js';
import { autoBackup } from './backup.js';
import { readSecret } from './secrets.js';

export const DEFAULT_ENDPOINT = 'https://api.lansweeper.com/api/v2/graphql';
const MAX_PAGES = 200;

/* The Lansweeper settings in use: the address, site and scheme saved in the inventory (Settings → Feed), with the token
   from the server's environment (NI_LS_TOKEN or NI_LS_TOKEN_FILE). The NI_LS_* variables are the fallback. */
const clean = v => (typeof v === 'string' ? v.trim().slice(0, 500) : '');
export function lansweeperConfigOf(db, env) {
  const token = readSecret(env, 'NI_LS_TOKEN');
  if (!token) return null;
  const row = db.prepare("SELECT data FROM docs WHERE kind = 'setting' AND id = 'lansweeper'").get();
  const saved = row ? (JSON.parse(row.data) || {}) : {};
  /* The token is the server's: it is sent only to Lansweeper's own API or to the address the server names (NI_LS_URL),
     never to another address saved in Settings. */
  const host = u => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
  const own = clean(saved.endpoint);
  const allowed = own && /^https:\/\//i.test(own) && (/(^|\.)lansweeper\.com$/.test(host(own)) || (env.NI_LS_URL && host(own) === host(env.NI_LS_URL)));
  return {
    endpoint: (allowed ? own : '') || env.NI_LS_URL || DEFAULT_ENDPOINT,
    ...(own && !allowed ? { endpointProblem: `The API address in Settings (${host(own) || own}) is not Lansweeper's. The token is sent only to api.lansweeper.com over https, or to the address in NI_LS_URL.` } : {}),
    site: clean(saved.site) || env.NI_LS_SITE || '',
    authScheme: clean(saved.authScheme) || env.NI_LS_AUTH_SCHEME || 'Token',
    token,
  };
}

export const SITES_QUERY = 'query Sites { authorizedSites { sites { id name } } }';

/* The asset listing. The field names and the paging shape are NOT yet checked against the live schema. Run
   `npm run lansweeper:introspect -- AssetResources` with your token and correct the selection below before the first
   real sync. Everything else in this file works the same once the query matches the schema. */
export const ASSETS_QUERY = `query Assets($siteId: ID!, $after: String) {
  site(id: $siteId) {
    assetResources(first: 500, after: $after) {
      items { id name serialNumber ipAddress macAddress operatingSystem model location assetType }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

export async function graphql(cfg, query, variables = {}, fetchImpl = fetch) {
  if (cfg.endpointProblem) throw new HttpError(400, cfg.endpointProblem);
  let r;
  try {
    r = await fetchImpl(cfg.endpoint || DEFAULT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `${cfg.authScheme || 'Token'} ${cfg.token}` },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000)
    });
  } catch {
    throw new HttpError(502, 'Lansweeper cannot be reached from the server. Check the network and NI_LS_URL.');
  }
  if (r.status === 401 || r.status === 403) throw new HttpError(502, 'Lansweeper refused the token. Check NI_LS_TOKEN and NI_LS_AUTH_SCHEME.');
  if (!r.ok) throw new HttpError(502, `Lansweeper answered ${r.status}.`);
  const j = await r.json();
  if (j.errors?.length) throw new HttpError(502, 'Lansweeper: ' + j.errors[0].message);
  return j.data;
}

export const toRecord = item => ({
  name: item.name || '',
  serial: item.serialNumber || '',
  ip: item.ipAddress || '',
  mac: item.macAddress || '',
  os: item.operatingSystem || '',
  model: item.model || '',
  location: item.location || '',
  assetType: item.assetType || '',
  ref: String(item.id ?? '')
});

export async function fetchAssets(cfg, fetchImpl = fetch) {
  let siteId = cfg.site;
  if (!siteId) {
    const data = await graphql(cfg, SITES_QUERY, {}, fetchImpl);
    siteId = data?.authorizedSites?.sites?.[0]?.id;
    if (!siteId) throw new HttpError(502, 'Lansweeper returned no site for this token.');
  }
  const records = [];
  let after = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await graphql(cfg, ASSETS_QUERY, { siteId, after }, fetchImpl);
    const conn = data?.site?.assetResources;
    if (!conn) throw new HttpError(502, 'Lansweeper did not return assets for this site.');
    records.push(...conn.items.map(toRecord));
    if (!conn.pageInfo?.hasNextPage) return records;
    after = conn.pageInfo.endCursor;
  }
  throw new HttpError(502, 'Lansweeper returned more pages than the sync allows.');
}

/* One sync: fetch every asset for the site and merge them with the same rules as a file import. */
export async function syncLansweeper(db, cfg, now = new Date(), fetchImpl = fetch) {
  /* The token is sent to this address, so a remote one must be encrypted. A Lansweeper on this machine may be plain. */
  const ep = new URL(cfg.endpoint || DEFAULT_ENDPOINT);
  if (ep.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(ep.hostname)) throw new HttpError(400, 'The Lansweeper address must start with https://.');
  const records = await fetchAssets(cfg, fetchImpl);
  const s = loadState(db);
  const counts = mergeRecords(s, records, now);
  if (feedChanged(counts)) { autoBackup(db, 'before a Lansweeper sync'); saveState(db, s); }
  audit(db, null, 'lansweeper api sync: ' + JSON.stringify({ assets: records.length, ...counts }));
  return { assets: records.length, ...counts };
}
