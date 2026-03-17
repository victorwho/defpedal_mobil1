/**
 * Design System v1.0 — useHaptics Hook
 *
 * Provides haptic feedback helpers at three intensity levels.
 * Respects the OS "Reduce Motion" setting — haptics are skipped when enabled,
 * since many users who disable motion also find vibration disorienting.
 *
 * Usage:
 *   const haptics = useHaptics();
 *   haptics.light();   // button tap, toggle flip
 *   haptics.medium();  // route selected, sheet snap
 *   haptics.heavy();   // hazard alert, critical modal
 */
import * as Haptics from 'expo-haptics';

import { useReducedMotion } from './useReducedMotion';

export const useHaptics = () => {
  const reducedMotion = useReducedMotion();

  const light = () => {
    if (reducedMotion) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const medium = () => {
    if (reducedMotion) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const heavy = () => {
    if (reducedMotion) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const warning = () => {
    if (reducedMotion) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const error = () => {
    if (reducedMotion) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const success = () => {
    if (reducedMotion) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return { light, medium, heavy, warning, error, success };
};
