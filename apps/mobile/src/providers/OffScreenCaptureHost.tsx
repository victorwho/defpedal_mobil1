/**
 * OffScreenCaptureHost — hidden view host that serialises PNG captures.
 *
 * Designed for the image-based social sharing flow:
 *   1. A feature hook (e.g. `useShareRide`) hands in a rendered React element
 *      describing the share card.
 *   2. This provider mounts the element into a measured-but-invisible `View`
 *      parked far off-screen, waits for layout + paint, then asks
 *      `react-native-view-shot` to snapshot the view to a `tmpfile` PNG URI.
 *   3. The provider serialises concurrent captures via a single promise chain
 *      so nothing ends up half-rendered.
 *
 * Guards the native module per `.claude/error-log.md` errors #2, #21, #23:
 *   - check `NativeModules.RNViewShot` / `TurboModuleRegistry.get('RNViewShot')`
 *     before calling `require()`.
 *   - fall back with a descriptive rejection if the native side isn't linked.
 */
import type { FC, ReactElement, ReactNode } from 'react';
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  InteractionManager,
  NativeModules,
  StyleSheet,
  TurboModuleRegistry,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CaptureOptions {
  readonly width?: number;
  readonly height?: number;
  /**
   * Additional settle time (ms) after layout + paint, before the snapshot
   * runs. Use this when the captured node contains remote `<Image>` sources
   * that still need time to decode from the cache. Defaults to 0.
   */
  readonly settleMs?: number;
}

export interface CaptureHost {
  readonly capture: (node: ReactElement, options?: CaptureOptions) => Promise<string>;
}

interface CaptureJob {
  readonly node: ReactElement;
  readonly width: number;
  readonly height: number;
  readonly settleMs: number;
  readonly resolve: (uri: string) => void;
  readonly reject: (error: Error) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1080;
const OFFSCREEN_OFFSET = -10000;

// ---------------------------------------------------------------------------
// Native module guard
// ---------------------------------------------------------------------------

/**
 * react-native-view-shot ships both a legacy bridge module and a TurboModule
 * (new arch). We probe both — either is sufficient evidence that the native
 * binary is linked. See error-log #23 — the module's invariant throws on
 * import in builds where neither is available, so the check MUST come first.
 */
const hasViewShotNative = (): boolean => {
  if (NativeModules && NativeModules.RNViewShot) return true;
  try {
    return TurboModuleRegistry.get('RNViewShot') != null;
  } catch {
    return false;
  }
};

type CaptureRefFn = (
  node: unknown,
  options?: { format?: string; quality?: number; width?: number; height?: number; result?: string },
) => Promise<string>;

let _captureRef: CaptureRefFn | null | undefined;
const getCaptureRef = (): CaptureRefFn | null => {
  if (!hasViewShotNative()) return null;
  if (_captureRef !== undefined) return _captureRef;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-view-shot') as {
      captureRef?: CaptureRefFn;
      default?: { captureRef?: CaptureRefFn };
    };
    _captureRef = mod.captureRef ?? mod.default?.captureRef ?? null;
  } catch {
    _captureRef = null;
  }
  return _captureRef;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CaptureHostContext = createContext<CaptureHost | null>(null);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves once the view has been measured + painted at least twice. Two
 * `requestAnimationFrame` ticks is the canonical "wait for paint" pattern for
 * RN; we also run inside `InteractionManager.runAfterInteractions` so a
 * capture kicked off mid-transition waits for the transition to settle.
 */
const waitForPaint = (): Promise<void> =>
  new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface OffScreenCaptureHostProviderProps {
  readonly children: ReactNode;
}

export const OffScreenCaptureHostProvider: FC<OffScreenCaptureHostProviderProps> = ({
  children,
}) => {
  const [pending, setPending] = useState<CaptureJob | null>(null);
  const viewRef = useRef<View | null>(null);
  // Serialise captures — a single in-flight promise chain.
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());

  // Core worker: measure → paint → snapshot → resolve → clear.
  const runJob = useCallback(async (job: CaptureJob): Promise<void> => {
    const captureRef = getCaptureRef();
    if (!captureRef) {
      job.reject(
        new Error(
          'OffScreenCaptureHost: react-native-view-shot native module not linked',
        ),
      );
      return;
    }

    // Mount the node — React will paint it on the next frame.
    setPending(job);

    try {
      await waitForPaint();

      if (job.settleMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, job.settleMs));
      }

      if (!viewRef.current) {
        throw new Error('OffScreenCaptureHost: hidden view ref missing after paint');
      }

      const uri = await captureRef(viewRef.current, {
        format: 'png',
        quality: 1,
        width: job.width,
        height: job.height,
        result: 'tmpfile',
      });

      job.resolve(uri);
    } catch (error: unknown) {
      const wrapped = error instanceof Error ? error : new Error(String(error));
      job.reject(wrapped);
    } finally {
      // Clear on next tick so React has time to commit.
      setTimeout(() => setPending(null), 0);
    }
  }, []);

  const capture = useCallback<CaptureHost['capture']>(
    (node, options) => {
      const width = options?.width ?? DEFAULT_WIDTH;
      const height = options?.height ?? DEFAULT_HEIGHT;
      const settleMs = options?.settleMs ?? 0;

      return new Promise<string>((resolve, reject) => {
        const job: CaptureJob = { node, width, height, settleMs, resolve, reject };
        // Chain onto the existing promise so jobs run sequentially even if
        // callers fire multiple captures back-to-back.
        chainRef.current = chainRef.current.then(
          () => runJob(job),
          () => runJob(job), // errors from a previous job shouldn't block next
        );
      });
    },
    [runJob],
  );

  const contextValue = useMemo<CaptureHost>(() => ({ capture }), [capture]);

  const width = pending?.width ?? DEFAULT_WIDTH;
  const height = pending?.height ?? DEFAULT_HEIGHT;

  return (
    <CaptureHostContext.Provider value={contextValue}>
      {children}
      <View
        ref={viewRef}
        collapsable={false}
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.host, { width, height }]}
      >
        {pending ? pending.node : null}
      </View>
    </CaptureHostContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCaptureHost(): CaptureHost {
  const ctx = useContext(CaptureHostContext);
  if (!ctx) {
    throw new Error(
      'useCaptureHost must be used inside OffScreenCaptureHostProvider',
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: OFFSCREEN_OFFSET,
    top: OFFSCREEN_OFFSET,
    overflow: 'hidden',
  },
});
