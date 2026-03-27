import type { HazardType, NearbyHazard } from '@defensivepedal/core';
import { HAZARD_TYPE_OPTIONS } from '@defensivepedal/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { brandColors, gray, safetyColors } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textSm, textXs } from '../tokens/typography';

const HAZARD_ICONS: Record<HazardType, string> = {
  illegally_parked_car: 'car-outline',
  blocked_bike_lane: 'close-circle-outline',
  missing_bike_lane: 'remove-circle-outline',
  pothole: 'alert-circle-outline',
  poor_surface: 'warning-outline',
  narrow_street: 'resize-outline',
  dangerous_intersection: 'git-branch-outline',
  construction: 'construct-outline',
  aggressive_traffic: 'speedometer-outline',
  other: 'help-circle-outline',
};

const getHazardLabel = (type: HazardType): string =>
  HAZARD_TYPE_OPTIONS.find((opt) => opt.value === type)?.label ?? 'Hazard';

type HazardAlertProps = {
  hazard: NearbyHazard;
  distanceMeters: number;
  onConfirm: () => void;
  onDeny: () => void;
};

export const HazardAlert = ({
  hazard,
  distanceMeters,
  onConfirm,
  onDeny,
}: HazardAlertProps) => {
  const iconName = HAZARD_ICONS[hazard.hazardType] ?? 'warning-outline';
  const label = getHazardLabel(hazard.hazardType);
  const distanceText =
    distanceMeters < 100
      ? `${Math.round(distanceMeters)} m ahead`
      : `${Math.round(distanceMeters)} m`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name={iconName as any} size={24} color={safetyColors.caution} />
        <View style={styles.headerText}>
          <Text style={styles.title}>⚠️ {label}</Text>
          <Text style={styles.distance}>{distanceText}</Text>
        </View>
      </View>

      <View style={styles.promptRow}>
        <Text style={styles.promptText}>Still there?</Text>
        <View style={styles.buttons}>
          <Pressable style={styles.yesButton} onPress={onConfirm}>
            <Text style={styles.yesText}>Yes</Text>
          </Pressable>
          <Pressable style={styles.noButton} onPress={onDeny}>
            <Text style={styles.noText}>No</Text>
          </Pressable>
        </View>
      </View>

      {hazard.confirmCount > 0 ? (
        <Text style={styles.confirmCount}>
          {hazard.confirmCount} {hazard.confirmCount === 1 ? 'person' : 'people'} confirmed
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(30, 20, 0, 0.94)',
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: safetyColors.caution,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    marginHorizontal: space[4],
    gap: space[2],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  headerText: {
    flex: 1,
    gap: space[0.5],
  },
  title: {
    ...textBase,
    fontFamily: fontFamily.heading.bold,
    color: '#FDD700',
    fontSize: 15,
  },
  distance: {
    ...textXs,
    color: gray[400],
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space[1],
  },
  promptText: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: brandColors.textPrimary,
  },
  buttons: {
    flexDirection: 'row',
    gap: space[2],
  },
  yesButton: {
    backgroundColor: safetyColors.safe,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radii.lg,
    minWidth: 60,
    alignItems: 'center',
  },
  noButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radii.lg,
    minWidth: 60,
    alignItems: 'center',
  },
  yesText: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    color: '#000000',
  },
  noText: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    color: '#FFFFFF',
  },
  confirmCount: {
    ...textXs,
    color: gray[500],
  },
});
