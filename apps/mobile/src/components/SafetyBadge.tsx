import { StyleSheet, Text, View } from 'react-native';

import { safetyColors } from '../design-system/tokens/colors';
import { radii } from '../design-system/tokens/radii';

type SafetyBadgeProps = {
  rating: number | null;
};

const getBadgeColor = (rating: number): string => {
  if (rating >= 4) return safetyColors.safe;
  if (rating >= 3) return safetyColors.caution;
  return safetyColors.danger;
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
    borderRadius: radii.lg,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
