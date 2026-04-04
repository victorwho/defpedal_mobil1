import { formatMicrolivesAsTime, formatCommunitySeconds } from '@defensivepedal/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { brandColors, gray } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textSm, textXs } from '../tokens/typography';
import { useT } from '../../hooks/useTranslation';

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
  const t = useT();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (totalMicrolives <= 0) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [totalMicrolives > 0]);

  if (isLoading) return null;
  if (totalMicrolives <= 0 && totalCommunitySeconds <= 0) return null;

  return (
    <View style={[styles.container, shadows.md]}>
      <View style={styles.row}>
        <Ionicons name="heart" size={18} color="#F2C30F" />
        <Animated.Text style={[styles.timeText, { transform: [{ scale: pulseAnim }] }]}>
          +{formatMicrolivesAsTime(totalMicrolives)}
        </Animated.Text>
      </View>
      <Text style={styles.label}>{t('microlives.lifeEarned')}</Text>
      {totalCommunitySeconds > 0 ? (
        <Text style={styles.community}>
          {formatCommunitySeconds(totalCommunitySeconds)} {t('microlives.donatedToCity')}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(17, 24, 39, 0.86)',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    gap: space[1],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  timeText: {
    ...textBase,
    fontFamily: fontFamily.heading.bold,
    color: '#F2C30F',
    fontSize: 17,
  },
  label: {
    ...textXs,
    fontFamily: fontFamily.body.medium,
    color: gray[400],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  community: {
    ...textXs,
    color: '#60A5FA',
    fontFamily: fontFamily.body.medium,
  },
});
