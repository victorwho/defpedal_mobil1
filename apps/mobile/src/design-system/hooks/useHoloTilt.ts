/**
 * useHoloTilt — shared, refcounted DeviceMotion subscription that writes
 * tilt values into caller-owned Animated.Values.
 *
 * The hook does NOT own its Animated.Values — callers pass in the same
 * `tiltX` / `tiltY` they already use for drag handling, so gyro tilt and
 * drag tilt drive the same render pipeline. When the caller wants drag to
 * take over, it just flips `enabled` to false; the hook stops writing
 * and the caller's PanResponder.onPanResponderMove handler is free to
 * setValue() directly.
 *
 * Why a shared subscription:
 *   The Trophy Case grid renders many HoloSticker instances at once. Each
 *   one on its own DeviceMotion listener would pay the sensor wakelock cost
 *   N times. We register exactly ONE listener at module scope and broadcast
 *   its filtered output to every consumer.
 *
 * Focus mode (claimHoloFocus / focused prop):
 *   The detail modal calls claimHoloFocus() on mount and releases on unmount.
 *   While ANY claim is active, every useHoloTilt consumer whose `focused`
 *   prop is false suspends — so the modal's hero sticker gets exclusive tilt
 *   and the grid stickers behind it stop animating. Tap-anywhere-to-close
 *   the modal releases the claim and the grid resumes.
 *
 * Bridgeless guard:
 *   expo-sensors is gated behind hasExpoNativeModule('ExponentDeviceMotion').
 *   On dev (old-arch bridge) and preview/production (bridgeless) the helper
 *   probes via requireOptionalNativeModule under the hood — see error-log
 *   #21 and src/lib/expoNativeModule.ts. If the sensor is absent (sim/web/
 *   unsupported device) the hook returns `gyroAvailable=false` and never
 *   touches the Animated.Values.
 *
 * Suppression:
 *   - When `appState === 'NAVIGATING'` (no shimmer-during-ride distraction).
 *   - When `useReducedMotion()` returns true (accessibility).
 *   The hook detaches the sensor entirely in either case, not just zeroes
 *   out the values.
 */
import { useEffect, useMemo, useState } from 'react';
import { Animated } from 'react-native';

import { useAppStore } from '../../store/appStore';
import { hasExpoNativeModule } from '../../lib/expoNativeModule';
import { useReducedMotion } from './useReducedMotion';

// expo-sensors types — kept loose so the import can be lazy.
type DeviceMotionMeasurement = {
  rotation?: { alpha: number; beta: number; gamma: number };
};
type Subscription = { remove: () => void };
type DeviceMotionModule = {
  setUpdateInterval: (ms: number) => void;
  addListener: (cb: (m: DeviceMotionMeasurement) => void) => Subscription;
};

const SAMPLE_INTERVAL_MS = 33; // ~30 Hz — plenty for visual tilt
const TILT_RANGE_RADIANS = Math.PI / 4; // 45° → ±1.0
const LOW_PASS_ALPHA = 0.25; // closer to 0 = smoother but laggier

// ---- Module-level shared state -----------------------------------------------

type Listener = (x: number, y: number) => void;

const listeners = new Set<Listener>();
let activeSubscription: Subscription | null = null;
let lastFilteredX = 0;
let lastFilteredY = 0;

// Refcounted focus claim — used by the detail modal to suspend grid stickers
// while the hero sticker has exclusive tilt.
let focusClaims = 0;
const focusListeners = new Set<() => void>();

/**
 * Claim exclusive holo tilt for the calling component. Returns a release
 * function that MUST be called when the component unmounts (typically from
 * a useEffect cleanup). Refcounted — multiple simultaneous claims are fine.
 */
export function claimHoloFocus(): () => void {
  focusClaims++;
  if (focusClaims === 1) focusListeners.forEach((l) => l());
  let released = false;
  return () => {
    if (released) return;
    released = true;
    focusClaims--;
    if (focusClaims === 0) focusListeners.forEach((l) => l());
  };
}

function subscribeToFocus(cb: () => void): () => void {
  focusListeners.add(cb);
  return () => focusListeners.delete(cb);
}

// ---- Sensor module + subscription -------------------------------------------

const moduleCache: { mod?: DeviceMotionModule | null } = {};

function loadDeviceMotion(): DeviceMotionModule | null {
  if (moduleCache.mod !== undefined) return moduleCache.mod;
  if (!hasExpoNativeModule('ExponentDeviceMotion')) {
    moduleCache.mod = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('expo-sensors') as { DeviceMotion: DeviceMotionModule };
    moduleCache.mod = pkg.DeviceMotion;
    return moduleCache.mod;
  } catch {
    moduleCache.mod = null;
    return null;
  }
}

function attachListener() {
  if (activeSubscription) return;
  const motion = loadDeviceMotion();
  if (!motion) return;

  motion.setUpdateInterval(SAMPLE_INTERVAL_MS);
  activeSubscription = motion.addListener(({ rotation }) => {
    if (!rotation) return;
    const rawX = Math.max(-1, Math.min(1, rotation.gamma / TILT_RANGE_RADIANS));
    const rawY = Math.max(-1, Math.min(1, rotation.beta / TILT_RANGE_RADIANS));
    lastFilteredX = lastFilteredX * (1 - LOW_PASS_ALPHA) + rawX * LOW_PASS_ALPHA;
    lastFilteredY = lastFilteredY * (1 - LOW_PASS_ALPHA) + rawY * LOW_PASS_ALPHA;
    for (const listener of listeners) {
      listener(lastFilteredX, lastFilteredY);
    }
  });
}

function detachListener() {
  if (!activeSubscription) return;
  activeSubscription.remove();
  activeSubscription = null;
  lastFilteredX = 0;
  lastFilteredY = 0;
}

// ---- Hook --------------------------------------------------------------------

export interface UseHoloTiltOptions {
  /** Caller-owned Animated.Value for X tilt; written when gyro enabled. */
  tiltX: Animated.Value;
  /** Caller-owned Animated.Value for Y tilt; written when gyro enabled. */
  tiltY: Animated.Value;
  /** Caller can pause gyro (e.g. during drag) without unmounting the consumer. */
  enabled?: boolean;
  /**
   * Set true when THIS instance is the focused one (modal hero). While ANY
   * claimHoloFocus() refcount is active, only consumers with focused=true
   * receive gyro updates.
   */
  focused?: boolean;
}

export interface UseHoloTiltResult {
  /** True iff the sensor is currently driving the passed Animated.Values. */
  gyroAvailable: boolean;
}

export function useHoloTilt(options: UseHoloTiltOptions): UseHoloTiltResult {
  const { tiltX, tiltY, enabled = true, focused = false } = options;
  const appState = useAppStore((s) => s.appState);
  const reducedMotion = useReducedMotion();

  // Track focus mode reactively so non-focused consumers update when the
  // modal mounts/unmounts.
  const [focusModeOn, setFocusModeOn] = useState(focusClaims > 0);
  useEffect(() => subscribeToFocus(() => setFocusModeOn(focusClaims > 0)), []);

  const moduleAvailable = useMemo(() => loadDeviceMotion() != null, []);
  const gyroAvailable =
    enabled &&
    moduleAvailable &&
    appState !== 'NAVIGATING' &&
    !reducedMotion &&
    (!focusModeOn || focused);

  useEffect(() => {
    if (!gyroAvailable) return;
    const listener: Listener = (x, y) => {
      tiltX.setValue(x);
      tiltY.setValue(y);
    };
    listeners.add(listener);
    if (listeners.size === 1) attachListener();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) detachListener();
    };
  }, [gyroAvailable, tiltX, tiltY]);

  return { gyroAvailable };
}
