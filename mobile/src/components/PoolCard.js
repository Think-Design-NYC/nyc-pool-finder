import { useState } from 'react';
import {
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Building2,
  Clock,
  ExternalLink,
  Info,
  MapPin,
  Phone,
  TrainFront,
  Waves,
} from 'lucide-react-native';

import { fullAddress, getBorough, getStatusStyle } from '../lib/utils';
import { colors } from '../lib/theme';

function StatusBadge({ status }) {
  const s = getStatusStyle(status);
  return (
    <View style={[styles.badge, { backgroundColor: s.badgeBg }]}>
      <View style={[styles.badgeDot, { backgroundColor: s.dot }]} />
      <Text style={[styles.badgeText, { color: s.badgeText }]}>{s.label}</Text>
    </View>
  );
}

function ScheduleRow({ schedule }) {
  return (
    <View style={styles.scheduleRow}>
      <Text style={styles.scheduleType}>{schedule.session_type}</Text>
      <View style={styles.scheduleMeta}>
        <Text style={styles.scheduleDays}>{schedule.days}</Text>
        <Text style={styles.scheduleTime}>{schedule.time}</Text>
      </View>
      {schedule.notes ? <Text style={styles.scheduleNotes}>{schedule.notes}</Text> : null}
    </View>
  );
}

const openUrl = (url) => Linking.openURL(url).catch(() => {});

export default function PoolCard({ pool, activityLabel = 'Swim' }) {
  const [hoursOpen, setHoursOpen] = useState(false);
  const loc = pool.location ?? {};
  const address = fullAddress(loc);
  const isClosed = pool.status === 'closed';
  const hours = loc.building_hours;

  const mapsUrl = pool.pool_name
    ? Platform.select({
        ios: `maps:0,0?q=${encodeURIComponent(`${pool.pool_name} New York NY`)}`,
        android: `geo:0,0?q=${encodeURIComponent(`${pool.pool_name} New York NY`)}`,
        default: `https://maps.google.com/?q=${encodeURIComponent(`${pool.pool_name} New York NY`)}`,
      })
    : null;

  const toggleHours = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHoursOpen((v) => !v);
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.poolName}>{pool.pool_name}</Text>
          <Text style={styles.borough}>{getBorough(pool)}</Text>
        </View>
        <StatusBadge status={pool.status} />
      </View>

      <View style={styles.cardBody}>
        {address ? (
          <Pressable
            style={styles.infoRow}
            onPress={mapsUrl ? () => openUrl(mapsUrl) : undefined}
          >
            <MapPin size={16} color={colors.slate400} style={styles.infoIcon} />
            <View style={styles.infoText}>
              <Text style={styles.addressLink}>
                {loc.address}
                {loc.cross_streets ? (
                  <Text style={styles.muted}> ({loc.cross_streets})</Text>
                ) : null}
              </Text>
              {loc.city || loc.zip_code ? (
                <Text style={styles.muted}>
                  {[loc.city, loc.state].filter(Boolean).join(', ')} {loc.zip_code}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ) : null}

        {loc.nearest_subway ? (
          <View style={styles.infoRow}>
            <TrainFront size={16} color={colors.slate400} style={styles.infoIcon} />
            <Text style={[styles.infoText, styles.infoBody]}>{loc.nearest_subway}</Text>
          </View>
        ) : null}

        {pool.phone ? (
          <Pressable
            style={styles.infoRow}
            onPress={() => openUrl(`tel:${pool.phone.replace(/[^+\d]/g, '')}`)}
          >
            <Phone size={16} color={colors.slate400} style={styles.infoIcon} />
            <Text style={styles.phoneLink}>{pool.phone}</Text>
          </Pressable>
        ) : null}

        {pool.notes ? (
          <View style={[styles.notesBox, isClosed ? styles.notesClosed : styles.notesWarn]}>
            <Info size={16} color={isClosed ? colors.red800 : colors.amber800} />
            <Text style={[styles.notesText, { color: isClosed ? colors.red800 : colors.amber800 }]}>
              {pool.notes}
            </Text>
          </View>
        ) : null}

        {!isClosed && pool.schedules?.length > 0 ? (
          <View>
            <View style={styles.sectionHeading}>
              <Waves size={14} color={colors.sky500} />
              <Text style={styles.sectionHeadingText}>{activityLabel} Times</Text>
            </View>
            <View style={styles.scheduleList}>
              {pool.schedules.map((s, i) => (
                <ScheduleRow key={i} schedule={s} />
              ))}
            </View>
          </View>
        ) : null}

        {hours ? (
          <View>
            <Pressable style={styles.hoursToggle} onPress={toggleHours}>
              <Building2 size={15} color={colors.slate500} />
              <Text style={styles.hoursToggleText}>Building hours</Text>
            </Pressable>
            {hoursOpen ? (
              <View style={styles.hoursList}>
                {Object.entries(hours).map(([day, time]) => (
                  <View key={day} style={styles.hoursRow}>
                    <Text style={styles.hoursDay}>{day.replaceAll('_', ' – ')}</Text>
                    <Text style={styles.hoursTime}>{time}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {pool.url ? (
        <Pressable style={styles.cardFooter} onPress={() => openUrl(pool.url)}>
          <Clock size={12} color={colors.slate400} />
          <Text style={styles.footerText}>Check latest schedule on nycgovparks.org</Text>
          <ExternalLink size={12} color={colors.slate400} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderColor: colors.slate200,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
    overflow: 'hidden',
  },
  cardHeader: {
    alignItems: 'flex-start',
    borderBottomColor: colors.slate100,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 16,
  },
  cardHeaderText: {
    flex: 1,
  },
  poolName: {
    color: colors.slate900,
    fontSize: 18,
    fontWeight: '700',
  },
  borough: {
    color: colors.slate400,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  badge: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeDot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardBody: {
    gap: 12,
    padding: 16,
  },
  infoRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  infoIcon: {
    marginTop: 2,
  },
  infoText: {
    flex: 1,
  },
  infoBody: {
    color: colors.slate600,
    fontSize: 14,
  },
  addressLink: {
    color: colors.slate600,
    fontSize: 14,
  },
  muted: {
    color: colors.slate400,
    fontSize: 14,
  },
  phoneLink: {
    color: colors.sky700,
    fontSize: 14,
    fontWeight: '500',
  },
  notesBox: {
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  notesClosed: {
    backgroundColor: colors.red50,
  },
  notesWarn: {
    backgroundColor: colors.amber50,
  },
  notesText: {
    flex: 1,
    fontSize: 14,
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  sectionHeadingText: {
    color: colors.slate500,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  scheduleList: {
    gap: 8,
  },
  scheduleRow: {
    backgroundColor: colors.sky50,
    borderColor: colors.sky100,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  scheduleType: {
    color: colors.sky900,
    fontSize: 14,
    fontWeight: '600',
  },
  scheduleMeta: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'space-between',
    marginTop: 4,
  },
  scheduleDays: {
    color: colors.slate500,
    fontSize: 12,
  },
  scheduleTime: {
    color: colors.sky700,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  scheduleNotes: {
    color: colors.slate500,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  hoursToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  hoursToggleText: {
    color: colors.slate500,
    fontSize: 14,
    fontWeight: '500',
  },
  hoursList: {
    gap: 4,
    marginTop: 8,
    paddingLeft: 24,
  },
  hoursRow: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  hoursDay: {
    color: colors.slate600,
    fontSize: 14,
  },
  hoursTime: {
    color: colors.slate600,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  cardFooter: {
    alignItems: 'center',
    borderTopColor: colors.slate100,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  footerText: {
    color: colors.slate400,
    fontSize: 12,
    fontWeight: '500',
  },
});
