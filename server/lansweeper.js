import { HttpError } from './errors.js';
import { loadState, saveState } from './state.js';
import { audit } from './db.js';
import { mergeRecords } from './feed.js';

export const DEFAULT_ENDPOINT = 'https://api.lansweeper.com/api/v2/graphql';
const MAX_PAGES = 200;

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
  let r;
  try {
    r = await fetchImpl(cfg.endpoint || DEFAULT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `${cfg.authScheme || 'Token'} ${cfg.token}` },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000)
    });
  } catch (e) {
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
  const records = await fetchAssets(cfg, fetchImpl);
  const s = loadState(db);
  const counts = mergeRecords(s, records, now);
  saveState(db, s);
  audit(db, null, 'lansweeper api sync: ' + JSON.stringify({ assets: records.length, ...counts }));
  return { assets: records.length, ...counts };
}
