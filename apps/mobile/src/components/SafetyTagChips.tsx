import { SAFETY_TAG_OPTIONS } from '@defensivepedal/core';
import type { SafetyTag } from '@defensivepedal/core';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { mobileTheme } from '../lib/theme';

type SafetyTagChipsProps = {
  tags: SafetyTag[];
};

const tagLabelMap = new Map(SAFETY_TAG_OPTIONS.map((o) => [o.value, o.label]));

export const SafetyTagChips = ({ tags }: SafetyTagChipsProps) => {
  if (tags.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {tags.map((tag) => (
        <View key={tag} style={styles.chip}>
          <Text style={styles.chipText}>{tagLabelMap.get(tag) ?? tag}</Text>
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  chip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: mobileTheme.colors.borderStrong,
    backgroundColor: 'rgba(250, 204, 21, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    color: mobileTheme.colors.brand,
    fontSize: 11,
    fontWeight: '700',
  },
});
