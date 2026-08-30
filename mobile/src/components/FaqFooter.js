import { useState } from 'react';
import { LayoutAnimation, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';

import { FAQ } from '../lib/faq';
import {
  IDNYC_NOTE,
  MEMBERSHIP_CHECKED,
  MEMBERSHIP_TIERS,
  MEMBERSHIP_URL,
} from '../lib/membership';
import { colors } from '../lib/theme';

function FaqItem({ item, openNames }) {
  const [open, setOpen] = useState(false);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View style={styles.faqItem}>
      <Pressable style={styles.faqQuestion} onPress={toggle}>
        <Text style={styles.faqQuestionText}>{item.q}</Text>
        <Chevron size={16} color={colors.slate400} />
      </Pressable>
      {open ? <Text style={styles.faqAnswer}>{item.a(openNames)}</Text> : null}
    </View>
  );
}

export default function FaqFooter({ openNames }) {
  return (
    <View style={styles.footer}>
      <Text style={styles.heading}>What a membership costs</Text>
      <Text style={styles.checkedNote}>As of {MEMBERSHIP_CHECKED}</Text>
      <View style={styles.tierTable}>
        {MEMBERSHIP_TIERS.map((tier) => (
          <View key={tier.who} style={styles.tierRow}>
            <Text style={styles.tierWho}>{tier.who}</Text>
            <View style={styles.tierPriceCell}>
              <Text style={styles.tierPrice}>{tier.price}</Text>
              {tier.note ? <Text style={styles.tierNote}>{tier.note}</Text> : null}
            </View>
          </View>
        ))}
      </View>
      <Text style={styles.bodyText}>
        Prices are for the “Access to All Centers” package — the cheaper $100/year tier
        excludes every center with a pool. {IDNYC_NOTE}
      </Text>
      <Pressable onPress={() => Linking.openURL(MEMBERSHIP_URL).catch(() => {})}>
        <Text style={styles.link}>Full membership details on nycgovparks.org</Text>
      </Pressable>

      <Text style={[styles.heading, styles.faqHeading]}>Frequently asked questions</Text>
      {FAQ.map((item) => (
        <FaqItem key={item.q} item={item} openNames={openNames} />
      ))}

      <Text style={styles.disclaimer}>
        Schedules are scraped from nycgovparks.org and can change without notice. Call
        the pool before making a trip.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    borderTopColor: colors.slate200,
    borderTopWidth: 1,
    marginTop: 24,
    paddingBottom: 48,
    paddingTop: 24,
  },
  heading: {
    color: colors.slate900,
    fontSize: 16,
    fontWeight: '700',
  },
  faqHeading: {
    marginTop: 28,
  },
  checkedNote: {
    color: colors.slate400,
    fontSize: 12,
    marginTop: 2,
  },
  tierTable: {
    marginTop: 10,
  },
  tierRow: {
    borderBottomColor: colors.slate100,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  tierWho: {
    color: colors.slate600,
    flex: 1,
    fontSize: 14,
  },
  tierPriceCell: {
    alignItems: 'flex-end',
  },
  tierPrice: {
    color: colors.slate800,
    fontSize: 14,
    fontWeight: '600',
  },
  tierNote: {
    color: colors.slate400,
    fontSize: 12,
  },
  bodyText: {
    color: colors.slate500,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  link: {
    color: colors.sky700,
    fontSize: 13,
    marginTop: 8,
    textDecorationLine: 'underline',
  },
  faqItem: {
    borderBottomColor: colors.slate100,
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  faqQuestion: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  faqQuestionText: {
    color: colors.slate800,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  faqAnswer: {
    color: colors.slate600,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  disclaimer: {
    color: colors.slate400,
    fontSize: 12,
    marginTop: 24,
  },
});
