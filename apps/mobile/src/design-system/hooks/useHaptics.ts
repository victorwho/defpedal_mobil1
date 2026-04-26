/**
 * Design System — useHaptics Hook
 *
 * Fires semantic haptic tokens (see `../tokens/haptics.ts`).
 *
 * Rules enforced here:
 *   1. OS reduced-motion → suppress everything except safety-critical tokens.
 *      (Rationale: hazard alerts are a safety signal, not decoration.)
 *   2. appState === 'NAVIGATING' → suppress everything except safety-critical tokens.
 *      (Rationale: a rider in motion should not be pinged by UI feedback.)
 *   3. No expo-haptics native module → silent no-op. Haptic is never load-bearing.
 *
 * Usage:
 *   const haptics = useHaptics();
 *   haptics.confirm();            // semantic token (preferred)
 *   haptics.warning();            // safety-critical, fires during NAVIGATING
 *   haptics.light();              // physical shortcut (deprecated — see below)
 *
 * The physical shortcuts (`light`, `medium`, `heavy`, `warning`, `error`, `success`)
 * are retained for backwards compatibility during the Phase 1 migration. New code
 * should use semantic tokens; existing call sites are migrated phase-by-phase.
 */
import { useCallback, useMemo } from 'react';
import { NativeModules } from 'react-native';

import { useAppStore } from '../../store/appStore';

import { HAPTIC_TOKENS, type HapticToken } from '../tokens/haptics';
import { useReducedMotion } from './useReducedMotion';

// ---------------------------------------------------------------------------
// Lazy haptics module — same guard pattern as src/lib/haptics.ts
// (defends against builds where the native binary is missing — CLAUDE.md #8)
// ---------------------------------------------------------------------------

const hasHapticsNative = Boolean(NativeModules.ExpoHaptics);
let _haptics: typeof import('expo-haptics') | null | undefined;

function getHaptics(): typeof import('expo-haptics') | null {
  if (!hasHapticsNative) return null;
  if (_haptics !== undefined) return _haptics;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _haptics = require('expo-haptics') as typeof import('expo-haptics');
  } catch {
    _haptics = null;
  }
  return _haptics;
}

// ---------------------------------------------------------------------------
// Physical firing — each token maps to a concrete expo-haptics call
// ---------------------------------------------------------------------------

function fireToken(token: HapticToken): void {
  const H = getHaptics();
  if (!H) return;

  switch (token) {
    case 'confirm':
      H.impactAsync(H.ImpactFeedbackStyle.Light);
      return;
    case 'success':
      H.notificationAsync(H.NotificationFeedbackType.Success);
      return;
    case 'warning':
      H.notificationAsync(H.NotificationFeedbackType.Warning);
      return;
    case 'celebration':
      // Double-impact for a bigger felt moment. Fire-and-forget — no await.
      H.impactAsync(H.ImpactFeedbackStyle.Heavy);
      setTimeout(() => {
        const H2 = getHaptics();
        if (H2) H2.impactAsync(H2.ImpactFeedbackStyle.Heavy);
      }, 90);
      return;
    case 'destructiveConfirm':
      H.impactAsync(H.ImpactFeedbackStyle.Heavy);
      return;
    case 'snap':
      H.impactAsync(H.ImpactFeedbackStyle.Medium);
      return;
  }
}

// ---------------------------------------------------------------------------
// Hook API
// ---------------------------------------------------------------------------

export interface UseHapticsApi {
  // Semantic tokens (preferred) ---------------------------------------------
  /** Small positive feedback on a deliberate user intent. */
  confirm: () => void;
  /** A task finished successfully (route ready, trip saved, sign-in). */
  success: () => void;
  /** Attention required — fires even during NAVIGATING. Safety-critical. */
  warning: () => void;
  /** Major positive moment — escalated double impact. */
  celebration: () => void;
  /** Acknowledges a confirmed irreversible action. */
  destructiveConfirm: () => void;
  /** Kinetic UI feedback — sheet snap, modal open. */
  snap: () => void;
  /** Fire a token by name — handy for data-driven callsites. */
  fire: (token: HapticToken) => void;

  // Physical shortcuts (deprecated) — kept for backwards compat ------------
  /** @deprecated Use `confirm()` instead. */
  light: () => void;
  /** @deprecated Use `snap()` or `warning()` depending on intent. */
  medium: () => void;
  /** @deprecated Use `destructiveConfirm()` or `celebration()` depending on intent. */
  heavy: () => void;
  /** @deprecated Use `warning()` instead. */
  error: () => void;
}

export function useHaptics(): UseHapticsApi {
  const reducedMotion = useReducedMotion();
  const appState = useAppStore((s) => s.appState);
  const isNavigating = appState === 'NAVIGATING';

  const fire = useCallback(
    (token: HapticToken) => {
      const meta = HAPTIC_TOKENS[token];

      // Safety-critical tokens override both reduced-motion and NAVIGATING.
      // Non-safety tokens respect both.
      if (!meta.safetyCritical) {
        if (reducedMotion) return;
        if (isNavigating) return;
      }

      fireToken(token);
    },
    [reducedMotion, isNavigating],
  );

  return useMemo<UseHapticsApi>(() => {
    const confirm = () => fire('confirm');
    const success = () => fire('success');
    const warning = () => fire('warning');
    const celebration = () => fire('celebration');
    const destructiveConfirm = () => fire('destructiveConfirm');
    const snap = () => fire('snap');

    return {
      confirm,
      success,
      warning,
      celebration,
      destructiveConfirm,
      snap,
      fire,

      // Physical shortcuts — map to the closest semantic token.
      light: confirm,
      medium: snap,
      heavy: destructiveConfirm,
      error: warning,
    };
  }, [fire]);
}
