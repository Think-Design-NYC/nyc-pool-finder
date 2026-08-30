import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor, act } from '@testing-library/react-native';

import { usePersistedFilter, usePoolData, DATA_CACHE_KEY } from '../hooks';
import { BUNDLED_POOLS, BUNDLED_META } from '../data';

beforeEach(() => AsyncStorage.clear());

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

function stubFetch(meta, pools) {
  return async (url) => {
    if (String(url).includes('nyc_pools_meta.json')) return jsonResponse(meta);
    if (String(url).includes('nyc_pools_live.json')) return jsonResponse(pools);
    throw new Error(`unexpected fetch: ${url}`);
  };
}

const failingFetch = async () => {
  throw new Error('network down');
};

function makeData(updatedAt, count = 9) {
  return {
    meta: { updated_at: updatedAt, pool_count: count },
    pools: Array.from({ length: count }, (_, i) => ({
      pool_name: `Pool ${i}`,
      pool_code: `X${i}`,
      status: 'open',
      schedules: [],
    })),
  };
}

describe('usePersistedFilter', () => {
  test('exposes the default once hydrated when nothing is stored', async () => {
    const { result } = await renderHook(() =>
      usePersistedFilter('poolfinder.borough', 'Manhattan')
    );
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0]).toBe('Manhattan');
  });

  test('hydrates a previously stored value', async () => {
    await AsyncStorage.setItem('poolfinder.borough', JSON.stringify('Queens'));
    const { result } = await renderHook(() =>
      usePersistedFilter('poolfinder.borough', 'Manhattan')
    );
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0]).toBe('Queens');
  });

  test('round-trips null (a cleared filter)', async () => {
    await AsyncStorage.setItem('poolfinder.activity', JSON.stringify(null));
    const { result } = await renderHook(() =>
      usePersistedFilter('poolfinder.activity', 'Lap Swim')
    );
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0]).toBeNull();
  });

  test('falls back to the default on corrupt stored JSON', async () => {
    await AsyncStorage.setItem('poolfinder.day', '{not json');
    const { result } = await renderHook(() => usePersistedFilter('poolfinder.day', 'Today'));
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0]).toBe('Today');
  });

  test('setValue updates state and persists', async () => {
    const { result } = await renderHook(() =>
      usePersistedFilter('poolfinder.borough', 'Manhattan')
    );
    await waitFor(() => expect(result.current[2]).toBe(true));

    await act(async () => result.current[1]('Brooklyn'));
    expect(result.current[0]).toBe('Brooklyn');
    await waitFor(async () => {
      expect(await AsyncStorage.getItem('poolfinder.borough')).toBe(JSON.stringify('Brooklyn'));
    });
  });
});

describe('usePoolData', () => {
  test('keeps the bundled snapshot silently when the fetch fails', async () => {
    const { result } = await renderHook(() => usePoolData({ fetchImpl: failingFetch }));
    await waitFor(() => expect(result.current.fetchState).toBe('error'));
    expect(result.current.pools).toBe(BUNDLED_POOLS);
    expect(result.current.meta).toBe(BUNDLED_META);
  });

  test('overlays a cached record newer than the bundled snapshot', async () => {
    const cached = makeData('2099-01-01T06:00:00Z');
    await AsyncStorage.setItem(DATA_CACHE_KEY, JSON.stringify(cached));

    const { result } = await renderHook(() => usePoolData({ fetchImpl: failingFetch }));
    await waitFor(() => expect(result.current.fetchState).toBe('error'));
    expect(result.current.meta.updated_at).toBe('2099-01-01T06:00:00Z');
    expect(result.current.pools).toHaveLength(9);
  });

  test('ignores a cached record older than the bundled snapshot', async () => {
    const cached = makeData('2000-01-01T06:00:00Z');
    await AsyncStorage.setItem(DATA_CACHE_KEY, JSON.stringify(cached));

    const { result } = await renderHook(() => usePoolData({ fetchImpl: failingFetch }));
    await waitFor(() => expect(result.current.fetchState).toBe('error'));
    expect(result.current.meta.updated_at).toBe(BUNDLED_META.updated_at);
  });

  test('ignores a corrupt cache record', async () => {
    await AsyncStorage.setItem(DATA_CACHE_KEY, '{definitely not json');

    const { result } = await renderHook(() => usePoolData({ fetchImpl: failingFetch }));
    await waitFor(() => expect(result.current.fetchState).toBe('error'));
    expect(result.current.meta.updated_at).toBe(BUNDLED_META.updated_at);
  });

  test('adopts fetched data and writes one atomic cache record', async () => {
    const fresh = makeData('2099-06-01T06:00:00Z', 11);
    const { result } = await renderHook(() =>
      usePoolData({ fetchImpl: stubFetch(fresh.meta, fresh.pools) })
    );

    await waitFor(() => expect(result.current.fetchState).toBe('success'));
    expect(result.current.meta.updated_at).toBe('2099-06-01T06:00:00Z');
    expect(result.current.pools).toHaveLength(11);

    const stored = JSON.parse(await AsyncStorage.getItem(DATA_CACHE_KEY));
    expect(stored.meta.updated_at).toBe('2099-06-01T06:00:00Z');
    expect(stored.pools).toHaveLength(11);
  });

  test('rejects fetched data that fails validation (short list) and keeps current data', async () => {
    const bad = makeData('2099-06-01T06:00:00Z', 3);
    const { result } = await renderHook(() =>
      usePoolData({ fetchImpl: stubFetch(bad.meta, bad.pools) })
    );
    await waitFor(() => expect(result.current.fetchState).toBe('error'));
    expect(result.current.meta.updated_at).toBe(BUNDLED_META.updated_at);
  });
});
