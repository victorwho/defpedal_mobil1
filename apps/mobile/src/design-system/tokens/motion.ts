/**
 * Design System v1.0 — Motion Tokens
 *
 * Duration, easing, spring, and stagger constants for animations.
 * Compatible with react-native Animated.
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
// Exit ratio
// ---------------------------------------------------------------------------
// Exits feel snappier when ~70% of the entrance duration. Multiply enter
// duration by this value to get the matching exit duration.
export const EXIT_RATIO = 0.7;

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
// Spring presets
// ---------------------------------------------------------------------------
// Tension/friction pairs tuned for Animated.spring. Use these for response
// motions (press, snap, drag-end). Prefer over timing+easing whenever the
// motion is reactive to user input — springs feel alive, easings feel
// scripted.
//
// Mental model:
//   - tension  = stiffness  (higher = snappier)
//   - friction = damping    (higher = less bounce, settles faster)
//
// Use `useNativeDriver: true` whenever the animated property is transform
// or opacity (which covers all standard P0 cases).

export const springs = {
  /** Soft, slow-settling — toasts, gentle reveals */
  gentle: { tension: 80, friction: 10 } as const,

  /** Default for press feedback — quick, lightly damped */
  snappy: { tension: 220, friction: 18 } as const,

  /** No-bounce snap — pill indicators, tab indicators */
  stiff: { tension: 280, friction: 24 } as const,

  /** Visible bounce — celebrations, like-bloom */
  wobbly: { tension: 180, friction: 8 } as const,
} as const;

// ---------------------------------------------------------------------------
// Stagger
// ---------------------------------------------------------------------------
// Used by useStaggeredEntrance and other cascade reveals. Keep small enough
// that a 10-item list completes in < 600ms total.
export const stagger = {
  /** Per-item delay in a cascade (ms) */
  step: 40,

  /** Cap to avoid >1s tails on long lists */
  maxItems: 12,
} as const;

// ---------------------------------------------------------------------------
// Safety animation rule
// ---------------------------------------------------------------------------
// During active navigation (appState === 'NAVIGATING'), suppress all
// non-safety animations. Only these may run:
//   - Hazard pulse glow
//   - Turn cue slide-in
//   - Route polyline color transitions (400ms crossfade)
//   - User position dot heading update
