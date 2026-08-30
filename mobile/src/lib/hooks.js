import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { BUNDLED_POOLS, BUNDLED_META, fetchLatestData } from './data';

export const DATA_CACHE_KEY = 'poolfinder.dataCache';

// Filter value persisted to AsyncStorage. Returns [value, setValue, hydrated];
// callers gate the first render on `hydrated` so a stored filter never
// flashes the default.
export function usePersistedFilter(storageKey, defaultValue) {
  const [value, setValue] = useState(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!cancelled && raw != null) setValue(JSON.parse(raw));
      } catch {
        // corrupt or unreadable — keep the default
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const setAndPersist = (next) => {
    setValue(next);
    AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
  };

  return [value, setAndPersist, hydrated];
}

function isPlausibleRecord(record) {
  return (
    record &&
    Array.isArray(record.pools) &&
    record.pools.length >= 8 &&
    typeof record.meta?.updated_at === 'string'
  );
}

// Seeds from the bundled snapshot, overlays a newer AsyncStorage cache, then
// fetches the latest data. Success = one atomic cache write + one state
// update; any failure is silent and keeps whatever data we already have.
// `fetchState` settles to 'success' | 'error' so the staleness banner can
// wait for the fetch before judging the bundled snapshot.
export function usePoolData({ fetchImpl = fetch } = {}) {
  const [data, setData] = useState({ pools: BUNDLED_POOLS, meta: BUNDLED_META });
  const [fetchState, setFetchState] = useState('pending');
  // updated_at values are scraper-emitted ISO-8601 UTC, so string compare
  // is chronological. Ref so the fetch compares against the cache overlay
  // without re-running the effect.
  const updatedAtRef = useRef(BUNDLED_META.updated_at);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DATA_CACHE_KEY);
        if (raw != null) {
          const cached = JSON.parse(raw);
          if (isPlausibleRecord(cached) && cached.meta.updated_at > updatedAtRef.current) {
            if (cancelled) return;
            updatedAtRef.current = cached.meta.updated_at;
            setData({ pools: cached.pools, meta: cached.meta });
          }
        }
      } catch {
        // corrupt cache — ignore, the bundled snapshot stands
      }

      try {
        const fresh = await fetchLatestData({ fetchImpl });
        if (cancelled) return;
        updatedAtRef.current = fresh.meta.updated_at;
        // A failed cache write shouldn't discard good fetched data.
        await AsyncStorage.setItem(DATA_CACHE_KEY, JSON.stringify(fresh)).catch(() => {});
        if (cancelled) return;
        setData(fresh);
        setFetchState('success');
      } catch {
        if (!cancelled) setFetchState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
    // Fetch exactly once per mount; deliberately not keyed on fetchImpl so an
    // unstable reference can't retrigger the network call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pools: data.pools, meta: data.meta, fetchState };
}
