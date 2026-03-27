import { StyleSheet, Text, View } from 'react-native';

import { mobileTheme } from '../lib/theme';

type SafetyBadgeProps = {
  rating: number | null;
};

const getBadgeColor = (rating: number): string => {
  if (rating >= 4) return mobileTheme.colors.success;
  if (rating >= 3) return '#ca8a04'; // amber-600
  return mobileTheme.colors.danger;
};

export const SafetyBadge = ({ rating }: SafetyBadgeProps) => {
  if (rating == null) return null;

  const color = getBadgeColor(rating);

  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.label}>{rating}/5 safety</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  label: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
