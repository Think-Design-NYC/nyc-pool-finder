import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../lib/theme';

const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

// Only rendered once the fetch has settled: on a fresh install the bundled
// snapshot is always "stale", and flashing a warning before the fetch had a
// chance to replace it would be noise.
export default function StalenessBanner({ meta, fetchState }) {
  if (fetchState === 'pending') return null;
  const updated = Date.parse(meta?.updated_at ?? '');
  if (!Number.isFinite(updated) || Date.now() - updated <= STALE_AFTER_MS) return null;

  const dateStr = new Date(updated).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        Schedules were last updated {dateStr} and may be out of date. Call the pool
        before making a trip.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.amber100,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  text: {
    color: colors.amber800,
    fontSize: 13,
  },
});
