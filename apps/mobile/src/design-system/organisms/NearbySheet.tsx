/**
 * "Show nearby" quick-pick sheet — replaces scattered POI toggles.
 * Renders as a modal overlay with a grid of toggleable POI categories.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { brandColors, gray } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textSm, textBase } from '../tokens/typography';
import { surfaceTints } from '../tokens/tints';
import { zIndex } from '../tokens/zIndex';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NearbySheetProps {
  visible: boolean;
  onDismiss: () => void;
  poiVisibility: {
    hydration: boolean;
    repair: boolean;
    restroom: boolean;
    bikeRental: boolean;
    bikeParking: boolean;
    supplies: boolean;
  };
  showBicycleLanes: boolean;
  onTogglePoi: (category: string, enabled: boolean) => void;
  onToggleBikeLanes: (enabled: boolean) => void;
}

// ---------------------------------------------------------------------------
// Category config
// ---------------------------------------------------------------------------

type CategoryItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

const CATEGORIES: CategoryItem[] = [
  { key: 'bikeParking', label: 'Parking', icon: 'bicycle', color: '#2196F3' },
  { key: 'bikeRental', label: 'Rental', icon: 'key-outline', color: '#2E7D32' },
  { key: 'hydration', label: 'Water', icon: 'water-outline', color: '#0EA5E9' },
  { key: 'repair', label: 'Repair', icon: 'build-outline', color: '#F59E0B' },
  { key: 'restroom', label: 'Restroom', icon: 'man-outline', color: '#8B5CF6' },
  { key: 'supplies', label: 'Supplies', icon: 'basket-outline', color: '#EC4899' },
  { key: 'bikeLanes', label: 'Bike lanes', icon: 'trail-sign-outline', color: '#22C55E' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const NearbySheet: React.FC<NearbySheetProps> = ({
  visible,
  onDismiss,
  poiVisibility,
  showBicycleLanes,
  onTogglePoi,
  onToggleBikeLanes,
}) => {
  if (!visible) return null;

  const isActive = (key: string): boolean => {
    if (key === 'bikeLanes') return showBicycleLanes;
    return poiVisibility[key as keyof typeof poiVisibility] ?? false;
  };

  const handleToggle = (key: string) => {
    if (key === 'bikeLanes') {
      onToggleBikeLanes(!showBicycleLanes);
    } else {
      const current = poiVisibility[key as keyof typeof poiVisibility] ?? false;
      onTogglePoi(key, !current);
    }
  };

  return (
    <Pressable
      style={styles.overlay}
      onPress={onDismiss}
      accessibilityRole="button"
      accessibilityLabel="Dismiss nearby places"
    >
      <Pressable
        style={styles.sheet}
        onPress={(e) => e.stopPropagation()}
        accessible={false}
      >
        <View style={styles.handle} />
        <Text style={styles.title}>Show nearby</Text>
        <View style={styles.grid}>
          {CATEGORIES.map((cat) => {
            const active = isActive(cat.key);
            return (
              <Pressable
                key={cat.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => handleToggle(cat.key)}
                accessibilityRole="switch"
                accessibilityState={{ checked: active }}
                accessibilityLabel={cat.label}
              >
                <View style={[styles.iconCircle, { backgroundColor: active ? cat.color : gray[600] }]}>
                  <Ionicons name={cat.icon} size={18} color="#FFFFFF" />
                </View>
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: surfaceTints.scrim,
    justifyContent: 'flex-end',
    zIndex: zIndex.modal,
  },
  sheet: {
    backgroundColor: brandColors.bgPrimary,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    paddingHorizontal: space[4],
    paddingBottom: space[8],
    paddingTop: space[3],
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: radii.full,
    backgroundColor: gray[600],
    alignSelf: 'center',
    marginBottom: space[4],
  },
  title: {
    color: brandColors.textPrimary,
    fontSize: textBase.fontSize,
    fontFamily: fontFamily.heading.bold,
    fontWeight: '700',
    marginBottom: space[4],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[3],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    backgroundColor: brandColors.bgSecondary,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  chipActive: {
    borderColor: brandColors.accent,
    backgroundColor: brandColors.bgDeep,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: {
    color: brandColors.textSecondary,
    fontSize: textSm.fontSize,
    fontFamily: fontFamily.body.medium,
    fontWeight: '600',
  },
  chipLabelActive: {
    color: brandColors.textPrimary,
  },
});
