import { formatMicrolivesAsTime } from '@defensivepedal/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { brandColors, gray } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily } from '../tokens/typography';

type TimeBankWidgetProps = {
  totalMicrolives: number;
  totalCommunitySeconds: number;
  isLoading?: boolean;
};

export const TimeBankWidget = ({
  totalMicrolives,
  totalCommunitySeconds,
  isLoading = false,
}: TimeBankWidgetProps) => {
  if (isLoading) return null;

  return (
    <View style={[styles.container, shadows.sm]}>
      <Ionicons name="heart" size={13} color="#F2C30F" />
      <Text style={styles.text}>
        +{formatMicrolivesAsTime(totalMicrolives)} of life earned
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    backgroundColor: 'rgba(17, 24, 39, 0.86)',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  text: {
    fontFamily: fontFamily.body.medium,
    fontSize: 13,
    color: '#F2C30F',
  },
});
