import { fetchLatestData, META_URL, POOLS_URL, BUNDLED_POOLS, BUNDLED_META } from '../data';

const GOOD_META = { updated_at: '2026-08-30T06:59:42Z', pool_count: 8 };
const GOOD_POOLS = Array.from({ length: 8 }, (_, i) => ({
  pool_name: `Pool ${i}`,
  pool_code: `X${i}`,
  status: 'open',
  schedules: [],
}));

function jsonResponse(body, { ok = true, status = 200, contentType = 'application/json' } = {}) {
  return {
    ok,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => body,
  };
}

function stubFetch(routes) {
  const calls = [];
  const impl = async (url, _opts) => {
    calls.push(String(url));
    for (const [match, response] of routes) {
      if (String(url).includes(match)) return typeof response === 'function' ? response() : response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  impl.calls = calls;
  return impl;
}

describe('bundled snapshot', () => {
  test('ships a plausible offline snapshot', () => {
    expect(Array.isArray(BUNDLED_POOLS)).toBe(true);
    expect(BUNDLED_POOLS.length).toBeGreaterThanOrEqual(8);
    expect(typeof BUNDLED_META.updated_at).toBe('string');
  });
});

describe('fetchLatestData', () => {
  test('fetches meta first, then pools keyed by updated_at', async () => {
    const fetchImpl = stubFetch([
      ['nyc_pools_meta.json', jsonResponse(GOOD_META)],
      ['nyc_pools_live.json', jsonResponse(GOOD_POOLS)],
    ]);

    const { pools, meta } = await fetchLatestData({ fetchImpl });

    expect(pools).toHaveLength(8);
    expect(meta.updated_at).toBe(GOOD_META.updated_at);
    expect(fetchImpl.calls).toHaveLength(2);
    expect(fetchImpl.calls[0]).toContain(META_URL);
    expect(fetchImpl.calls[0]).toMatch(/[?&]t=\d+/); // cache-busted meta
    expect(fetchImpl.calls[1]).toContain(POOLS_URL);
    expect(fetchImpl.calls[1]).toContain(`v=${encodeURIComponent(GOOD_META.updated_at)}`);
  });

  test('rejects an HTML response body (WP/Cloudflare fallback page)', async () => {
    const fetchImpl = stubFetch([
      ['nyc_pools_meta.json', jsonResponse(GOOD_META)],
      ['nyc_pools_live.json', jsonResponse(GOOD_POOLS, { contentType: 'text/html; charset=utf-8' })],
    ]);
    await expect(fetchLatestData({ fetchImpl })).rejects.toThrow(/content-type/i);
  });

  test('rejects non-ok responses', async () => {
    const fetchImpl = stubFetch([
      ['nyc_pools_meta.json', jsonResponse(GOOD_META, { ok: false, status: 500 })],
    ]);
    await expect(fetchLatestData({ fetchImpl })).rejects.toThrow(/500/);
  });

  test('rejects when pool count disagrees with meta', async () => {
    const fetchImpl = stubFetch([
      ['nyc_pools_meta.json', jsonResponse({ ...GOOD_META, pool_count: 13 })],
      ['nyc_pools_live.json', jsonResponse(GOOD_POOLS)],
    ]);
    await expect(fetchLatestData({ fetchImpl })).rejects.toThrow(/count/i);
  });

  test('rejects a suspiciously short pool list (same guard as refresh.sh)', async () => {
    const shortPools = GOOD_POOLS.slice(0, 3);
    const fetchImpl = stubFetch([
      ['nyc_pools_meta.json', jsonResponse({ ...GOOD_META, pool_count: 3 })],
      ['nyc_pools_live.json', jsonResponse(shortPools)],
    ]);
    await expect(fetchLatestData({ fetchImpl })).rejects.toThrow(/too few/i);
  });

  test('rejects meta without a usable updated_at', async () => {
    const fetchImpl = stubFetch([
      ['nyc_pools_meta.json', jsonResponse({ pool_count: 8 })],
    ]);
    await expect(fetchLatestData({ fetchImpl })).rejects.toThrow(/updated_at/i);
  });

  test('rejects a non-array pools payload', async () => {
    const fetchImpl = stubFetch([
      ['nyc_pools_meta.json', jsonResponse(GOOD_META)],
      ['nyc_pools_live.json', jsonResponse({ not: 'an array' })],
    ]);
    await expect(fetchLatestData({ fetchImpl })).rejects.toThrow(/array/i);
  });
});
