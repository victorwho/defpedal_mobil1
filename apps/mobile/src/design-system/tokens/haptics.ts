/**
 * Design System — Haptic Tokens
 *
 * Semantic haptic intents. Call sites use these instead of physical sensations
 * (`light` / `medium` / `heavy`) so intent is visible in the code and can be
 * re-tuned centrally.
 *
 * See `docs/haptic-map.md` for the per-interaction map and `docs/design-context.md`
 * §8 for the rationale.
 *
 * Fire via `useHaptics()` from `../hooks/useHaptics`:
 *
 *   const haptics = useHaptics();
 *   haptics.confirm();          // hazard vote, like, follow, toggle flip, button press
 *   haptics.success();          // route ready, trip saved, sign-in complete
 *   haptics.warning();          // hazard proximity, off-route, steep grade (safety — always fires)
 *   haptics.celebration();      // badge unlock, rank-up, streak milestone
 *   haptics.destructiveConfirm();// end ride, sign out, discard draft (paired with confirmation dialog)
 *   haptics.snap();             // sheet snap, modal open, kinetic UI feedback
 *
 * Rules enforced by the hook:
 *   1. `reducedMotion` on OS  → all tokens except `warning` are suppressed.
 *      `warning` is safety-critical (hazard alerts) and overrides user motion prefs.
 *   2. `appState === 'NAVIGATING'` → only `warning` fires. Everything else is
 *      suppressed to avoid distracting the rider.
 *   3. No native haptics module (missing expo-haptics binary) → silent fallback.
 *      Haptic is never load-bearing; always paired with a visual signal.
 */

export type HapticToken =
  | 'confirm'
  | 'success'
  | 'warning'
  | 'celebration'
  | 'destructiveConfirm'
  | 'snap';

export interface HapticTokenMeta {
  /** Category for docs and telemetry. */
  readonly category: 'ui-feedback' | 'task-complete' | 'attention' | 'reward' | 'irreversible' | 'ui-kinetic';
  /**
   * Safety-critical tokens fire even during `NAVIGATING` and even when the
   * user has enabled OS-level reduced motion. Reserved for alerts the rider
   * must be aware of while in motion.
   */
  readonly safetyCritical: boolean;
  /** Short description of what this token means — shown in docs and code hover. */
  readonly description: string;
}

export const HAPTIC_TOKENS: Readonly<Record<HapticToken, HapticTokenMeta>> = {
  confirm: {
    category: 'ui-feedback',
    safetyCritical: false,
    description: 'Small positive feedback on a deliberate user intent (like, follow, toggle, vote, button press, hazard report submitted).',
  },
  success: {
    category: 'task-complete',
    safetyCritical: false,
    description: 'A task finished successfully (route ready, trip saved, sign-in complete, share sent).',
  },
  warning: {
    category: 'attention',
    safetyCritical: true,
    description: 'Attention required — fires even during NAVIGATING (hazard proximity, off-route detected, steep grade onset, GPS degraded).',
  },
  celebration: {
    category: 'reward',
    safetyCritical: false,
    description: 'A major positive moment — escalated double impact (badge unlock, rank-up, streak milestone). Suppressed during NAVIGATING.',
  },
  destructiveConfirm: {
    category: 'irreversible',
    safetyCritical: false,
    description: 'Acknowledges the confirmation of an irreversible action paired with a confirmation dialog (end ride, sign out, discard draft).',
  },
  snap: {
    category: 'ui-kinetic',
    safetyCritical: false,
    description: 'Kinetic UI feedback — sheet snap, modal open, drawer dock, carousel page change.',
  },
} as const;
