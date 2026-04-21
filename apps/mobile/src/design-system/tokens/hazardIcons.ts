/**
 * Design System — Hazard Icons Token
 *
 * Central mapping from `HazardType` to an Ionicons glyph name.
 * Shared between `HazardAlert`, `HazardAlertPill`, `HazardDetailSheet`.
 */
import type { HazardType } from '@defensivepedal/core';

export const HAZARD_ICONS: Record<HazardType, string> = {
  illegally_parked_car: 'car-outline',
  blocked_bike_lane: 'close-circle-outline',
  missing_bike_lane: 'remove-circle-outline',
  pothole: 'alert-circle-outline',
  poor_surface: 'warning-outline',
  narrow_street: 'resize-outline',
  dangerous_intersection: 'git-branch-outline',
  aggro_dogs: 'paw-outline',
  aggressive_traffic: 'speedometer-outline',
  other: 'help-circle-outline',
};

export const getHazardIcon = (type: HazardType): string =>
  HAZARD_ICONS[type] ?? 'warning-outline';
