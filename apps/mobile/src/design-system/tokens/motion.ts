/**
 * Design System v1.0 — Motion Tokens
 *
 * Duration and easing constants for animations.
 * Compatible with react-native Animated and react-native-reanimated.
 */
import { Easing } from 'react-native';

// ---------------------------------------------------------------------------
// Durations (milliseconds)
// ---------------------------------------------------------------------------

export const duration = {
  /** Micro-feedback (tap) */
  instant: 50,

  /** Hover, focus changes */
  fast: 150,

  /** Panel slides, card transitions */
  normal: 250,

  /** Modal open/close, page transitions */
  slow: 400,

  /** Hazard alert entrance */
  emphasis: 600,
} as const;

// ---------------------------------------------------------------------------
// Easing curves
// ---------------------------------------------------------------------------

export const easing = {
  /** General purpose */
  default: Easing.bezier(0.4, 0, 0.2, 1),

  /** Entering elements */
  in: Easing.bezier(0.4, 0, 1, 1),

  /** Exiting elements */
  out: Easing.bezier(0, 0, 0.2, 1),

  /** Playful bounce — non-safety elements only */
  spring: Easing.bezier(0.34, 1.56, 0.64, 1),
} as const;

// ---------------------------------------------------------------------------
// Safety animation rule
// ---------------------------------------------------------------------------
// During active navigation, suppress all non-safety animations.
// Only these may run:
//   - Hazard pulse glow
//   - Turn cue slide-in
//   - Route polyline color transitions (400ms crossfade)
//   - User position dot heading update
