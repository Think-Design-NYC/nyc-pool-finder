import { useEffect, useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Waves } from 'lucide-react-native';

import FilterBar from './src/components/FilterBar';
import PoolCard from './src/components/PoolCard';
import StalenessBanner from './src/components/StalenessBanner';
import FaqFooter from './src/components/FaqFooter';
import { usePersistedFilter, usePoolData } from './src/lib/hooks';
import { ACTIVITIES, getBorough, isPastToday, matchesActivity, matchesDay } from './src/lib/utils';
import { colors } from './src/lib/theme';

const BOROUGH_ORDER = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Other'];
const DAY_OPTIONS = ['Today', 'Tomorrow', 'Week'];

export default function App() {
  return (
    <SafeAreaProvider>
      <PoolFinder />
    </SafeAreaProvider>
  );
}

function PoolFinder() {
  const { pools, meta, fetchState } = usePoolData();

  const [selectedBorough, setSelectedBorough, boroughHydrated] = usePersistedFilter(
    'poolfinder.borough',
    'Manhattan'
  );
  const [selectedActivity, setSelectedActivity, activityHydrated] = usePersistedFilter(
    'poolfinder.activity',
    'Lap Swim'
  );
  const [selectedDay, setSelectedDay, dayHydrated] = usePersistedFilter(
    'poolfinder.day',
    'Today'
  );
  const hydrated = boroughHydrated && activityHydrated && dayHydrated;

  const activityActive = selectedActivity && selectedActivity !== 'All activities';
  const dayActive = selectedDay && selectedDay !== 'Week';
  const hidePast = selectedDay === 'Today';

  // Unlike the website, `pools` can change at runtime (fetch replaces the
  // bundled snapshot), so every memo below must depend on it.
  const boroughs = useMemo(() => {
    const present = new Set();
    for (const p of pools) {
      if (activityActive || dayActive) {
        const hasMatch = (p.schedules ?? []).some(
          (s) =>
            (!activityActive || matchesActivity(s.session_type, selectedActivity)) &&
            (!dayActive || matchesDay(s.days, selectedDay)) &&
            (!hidePast || !isPastToday(s.time))
        );
        if (!hasMatch) continue;
      }
      present.add(getBorough(p));
    }
    return BOROUGH_ORDER.filter((b) => present.has(b));
  }, [pools, activityActive, dayActive, hidePast, selectedActivity, selectedDay]);

  // A stored/selected borough can disappear when filters or fresh data drop
  // its pools; reset only after hydration so a stored value isn't clobbered.
  useEffect(() => {
    if (!hydrated) return;
    if (selectedBorough !== 'All Boroughs' && !boroughs.includes(selectedBorough)) {
      setSelectedBorough('All Boroughs');
    }
  }, [hydrated, boroughs, selectedBorough]);

  // Same guard for a stored activity/day that no longer exists (e.g. a
  // renamed activity bucket in an app update).
  useEffect(() => {
    if (!hydrated) return;
    const validActivities = ['All activities', ...ACTIVITIES.map((a) => a.key)];
    if (!validActivities.includes(selectedActivity)) setSelectedActivity('Lap Swim');
    if (!DAY_OPTIONS.includes(selectedDay)) setSelectedDay('Today');
  }, [hydrated, selectedActivity, selectedDay]);

  const activities = useMemo(() => {
    const present = new Set();
    for (const p of pools) {
      for (const s of p.schedules ?? []) {
        for (const a of ACTIVITIES) {
          if (a.match(s.session_type)) present.add(a.key);
        }
      }
    }
    return ACTIVITIES.map((a) => a.key).filter((k) => present.has(k));
  }, [pools]);

  const openNames = useMemo(
    () => pools.filter((p) => p.status === 'open').map((p) => p.pool_name),
    [pools]
  );

  const lastUpdated = useMemo(() => {
    if (!meta.updated_at) return null;
    return new Date(meta.updated_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [meta]);

  const visiblePools = useMemo(() => {
    return pools
      .filter((p) => selectedBorough === 'All Boroughs' || getBorough(p) === selectedBorough)
      .map((p) => {
        if (!activityActive && !dayActive) return p;
        const filtered = (p.schedules ?? []).filter(
          (s) =>
            (!activityActive || matchesActivity(s.session_type, selectedActivity)) &&
            (!dayActive || matchesDay(s.days, selectedDay)) &&
            (!hidePast || !isPastToday(s.time))
        );
        return { ...p, schedules: filtered };
      })
      .filter((p) => (!activityActive && !dayActive) || (p.schedules?.length ?? 0) > 0)
      .sort((a, b) => {
        const rank = { open: 0, transitioning: 1, closed: 2 };
        return (rank[a.status] ?? 3) - (rank[b.status] ?? 3);
      });
  }, [pools, selectedBorough, selectedActivity, activityActive, selectedDay, dayActive, hidePast]);

  if (!hydrated) {
    return <View style={styles.screen} />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Waves size={24} color={colors.sky600} />
          <Text style={styles.title}>NYC Indoor Pool Finder</Text>
        </View>
        <Text style={styles.subtitle}>
          Public pools open now — lap swim & open swim schedules
          {lastUpdated ? <Text style={styles.subtleText}> · Updated {lastUpdated}</Text> : null}
        </Text>
        <Text style={styles.openCount}>
          {openNames.length} of {pools.length} NYC indoor pools open today
        </Text>
      </View>

      <FilterBar
        boroughs={boroughs}
        selectedBorough={selectedBorough}
        onSelectBorough={setSelectedBorough}
        activities={activities}
        selectedActivity={selectedActivity}
        onSelectActivity={setSelectedActivity}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />

      <StalenessBanner meta={meta} fetchState={fetchState} />

      <FlatList
        data={visiblePools}
        keyExtractor={(p) => p.pool_name}
        renderItem={({ item }) => (
          <PoolCard pool={item} activityLabel={activityActive ? selectedActivity : 'Swim'} />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No pools match your filters.</Text>
          </View>
        }
        ListFooterComponent={<FaqFooter openNames={openNames} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.slate50,
    flex: 1,
  },
  header: {
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  title: {
    color: colors.slate900,
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.slate500,
    fontSize: 13,
    marginTop: 4,
  },
  subtleText: {
    color: colors.slate400,
  },
  openCount: {
    color: colors.slate600,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  listContent: {
    padding: 16,
  },
  emptyBox: {
    backgroundColor: colors.white,
    borderColor: colors.slate200,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 40,
  },
  emptyText: {
    color: colors.slate500,
    fontSize: 14,
    textAlign: 'center',
  },
});
