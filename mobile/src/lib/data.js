export const BUNDLED_POOLS = require('../../../nyc_pools_live.json');
export const BUNDLED_META = require('../../../nyc_pools_meta.json');

export const DATA_BASE_URL = 'https://thinkdesign.com/pools';
export const META_URL = `${DATA_BASE_URL}/nyc_pools_meta.json`;
export const POOLS_URL = `${DATA_BASE_URL}/nyc_pools_live.json`;

// Same guard as scripts/refresh.sh: a short list means a broken scrape.
const MIN_POOLS = 8;
const FETCH_TIMEOUT_MS = 8000;

async function fetchJson(fetchImpl, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const contentType = res.headers?.get('content-type') ?? '';
    // WP Engine/Cloudflare serve HTML error and challenge pages with 200s;
    // never let one of those replace good pool data.
    if (!/json/i.test(contentType)) {
      throw new Error(`unexpected content-type "${contentType}" for ${url}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Meta is fetched cache-busted; pools are keyed to meta's updated_at so a
// CDN-cached copy can never be older than the meta that referenced it.
export async function fetchLatestData({ fetchImpl = fetch } = {}) {
  const meta = await fetchJson(fetchImpl, `${META_URL}?t=${Date.now()}`);
  if (!meta || typeof meta.updated_at !== 'string' || !meta.updated_at) {
    throw new Error('meta is missing updated_at');
  }

  const pools = await fetchJson(
    fetchImpl,
    `${POOLS_URL}?v=${encodeURIComponent(meta.updated_at)}`
  );
  if (!Array.isArray(pools)) throw new Error('pools payload is not an array');
  if (pools.length < MIN_POOLS) throw new Error(`too few pools (${pools.length})`);
  if (Number(meta.pool_count) !== pools.length) {
    throw new Error(`pool count mismatch: meta says ${meta.pool_count}, payload has ${pools.length}`);
  }

  return { pools, meta };
}
