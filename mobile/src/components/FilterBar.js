import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../lib/theme';

function PillRow({ options, selected, onSelect, activeColor }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map((o) => {
        const active = selected === o;
        return (
          <Pressable
            key={o}
            onPress={() => onSelect(o)}
            style={[styles.pill, active && { backgroundColor: activeColor }]}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{o}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function FilterBar({
  boroughs,
  selectedBorough,
  onSelectBorough,
  activities,
  selectedActivity,
  onSelectActivity,
  selectedDay,
  onSelectDay,
}) {
  const hasActivities = activities && activities.length > 0;
  return (
    <View style={styles.bar}>
      <PillRow
        options={['All Boroughs', ...boroughs]}
        selected={selectedBorough}
        onSelect={onSelectBorough}
        activeColor={colors.sky600}
      />
      {hasActivities && (
        <PillRow
          options={['All activities', ...activities]}
          selected={selectedActivity}
          onSelect={onSelectActivity}
          activeColor={colors.emerald600}
        />
      )}
      <PillRow
        options={['Today', 'Tomorrow', 'Week']}
        selected={selectedDay}
        onSelect={onSelectDay}
        activeColor={colors.orange500}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.white,
    borderBottomColor: colors.slate200,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    gap: 8,
  },
  row: {
    gap: 8,
    paddingHorizontal: 16,
  },
  pill: {
    backgroundColor: colors.slate100,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  pillText: {
    color: colors.slate700,
    fontSize: 14,
    fontWeight: '500',
  },
  pillTextActive: {
    color: colors.white,
  },
});
