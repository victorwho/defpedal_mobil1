import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { BackHandler, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../atoms/Button';
import { FadeSlideIn } from '../atoms/FadeSlideIn';
import { useTheme, type ThemeColors } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textSm, textXs } from '../tokens/typography';

export interface CoachmarkStep {
  readonly key: string;
  readonly text: string;
  /** The element to spotlight. A step whose target is not mounted is skipped. */
  readonly targetRef: RefObject<View | null>;
}

export type CoachmarkAction = 'next' | 'skip' | 'done';

export interface CoachmarkLabels {
  readonly next: string;
  readonly done: string;
  readonly skip: string;
  /** e.g. "{{current}} of {{total}}", already interpolated by the caller. */
  readonly progress: (current: number, total: number) => string;
}

export interface CoachmarkProps {
  readonly steps: readonly CoachmarkStep[];
  readonly labels: CoachmarkLabels;
  /** Runs before a step is measured — e.g. scroll its target into view. */
  readonly onBeforeStep?: (key: string) => Promise<void> | void;
  readonly onAction?: (key: string, action: CoachmarkAction) => void;
  readonly onFinish: () => void;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 6;
/** Room the bubble needs below a target before it flips above it. */
const BUBBLE_ROOM = 190;

const measureInWindow = (view: View | null): Promise<Rect | null> =>
  new Promise((resolve) => {
    if (!view || typeof view.measureInWindow !== 'function') {
      resolve(null);
      return;
    }
    view.measureInWindow((x, y, width, height) =>
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null),
    );
  });

/**
 * Wait before measuring: long enough for a FadeSlideIn entry (200 ms) to
 * finish, or the spotlight lands where the target was mid-animation.
 */
const SETTLE_MS = 260;
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, SETTLE_MS));

/**
 * One-at-a-time spotlight tour over a screen (first-ride onboarding [D4]).
 *
 * Mount it as the LAST child of the screen's root view so it covers the whole
 * screen, footer included. It dims everything except the current target, so
 * the screen underneath cannot be operated mid-tour; Skip and Android back
 * always end it. Each step is announced to screen readers when it appears,
 * and motion follows the rider's reduced-motion setting (FadeSlideIn).
 */
export const Coachmark = ({ steps, labels, onBeforeStep, onAction, onFinish }: CoachmarkProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const rootRef = useRef<View>(null);
  const [index, setIndex] = useState(0);
  const [layout, setLayout] = useState<{ target: Rect; root: Rect } | null>(null);
  // Steps skipped because their target was not on screen, so the progress
  // line counts only what the rider actually sees.
  const [skippedCount, setSkippedCount] = useState(0);
  const finishedRef = useRef(false);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish();
  }, [onFinish]);

  const skip = useCallback(() => {
    if (step) onAction?.(step.key, 'skip');
    finish();
  }, [step, onAction, finish]);

  const advance = useCallback(() => {
    if (!step) return;
    onAction?.(step.key, isLast ? 'done' : 'next');
    if (isLast) finish();
    else setIndex((i) => i + 1);
  }, [step, isLast, onAction, finish]);

  // Measure the current target (after letting the screen bring it into view).
  // A target that is not on screen is skipped rather than spotlighting nothing.
  useEffect(() => {
    if (!step) {
      finish();
      return;
    }
    let cancelled = false;
    setLayout(null);
    void (async () => {
      await onBeforeStep?.(step.key);
      await settle();
      const [target, root] = await Promise.all([
        measureInWindow(step.targetRef.current),
        measureInWindow(rootRef.current),
      ]);
      // The overlay fills the screen, so the window is a faithful fallback.
      const rootRect = root ?? { x: 0, y: 0, ...Dimensions.get('window') };
      if (cancelled) return;
      if (!target) {
        setSkippedCount((n) => n + 1);
        if (isLast) finish();
        else setIndex((i) => i + 1);
        return;
      }
      setLayout({ target, root: rootRect });
    })();
    return () => {
      cancelled = true;
    };
  }, [step, isLast, onBeforeStep, finish]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      skip();
      return true;
    });
    return () => sub.remove();
  }, [skip]);

  const hole = layout
    ? {
        x: layout.target.x - layout.root.x - SPOTLIGHT_PADDING,
        y: layout.target.y - layout.root.y - SPOTLIGHT_PADDING,
        width: layout.target.width + SPOTLIGHT_PADDING * 2,
        height: layout.target.height + SPOTLIGHT_PADDING * 2,
      }
    : null;
  const below = hole && layout ? layout.root.height - (hole.y + hole.height) >= BUBBLE_ROOM : true;

  return (
    <View ref={rootRef} style={StyleSheet.absoluteFill} accessibilityViewIsModal collapsable={false}>
      {hole ? (
        <>
          <View style={[styles.scrim, { top: 0, left: 0, right: 0, height: Math.max(0, hole.y) }]} />
          <View style={[styles.scrim, { top: hole.y + hole.height, left: 0, right: 0, bottom: 0 }]} />
          <View style={[styles.scrim, { top: hole.y, left: 0, width: Math.max(0, hole.x), height: hole.height }]} />
          <View style={[styles.scrim, { top: hole.y, left: hole.x + hole.width, right: 0, height: hole.height }]} />
          {/* Swallows touches inside the spotlight: the target is shown, not
              operable, until the tour ends (the map would otherwise pan). */}
          <View style={{ position: 'absolute', top: hole.y, left: hole.x, width: hole.width, height: hole.height }} />
          <View
            pointerEvents="none"
            style={[styles.ring, { top: hole.y, left: hole.x, width: hole.width, height: hole.height }]}
          />
          <View
            style={[
              styles.bubbleWrap,
              below ? { top: hole.y + hole.height + space[3] } : { bottom: layout!.root.height - hole.y + space[3] },
            ]}
          >
            <FadeSlideIn key={step?.key}>
              <View style={styles.bubble} accessibilityLiveRegion="polite">
                <Text style={styles.progress}>{labels.progress(index + 1 - skippedCount, steps.length - skippedCount)}</Text>
                <Text style={styles.text}>{step?.text}</Text>
                <View style={styles.actions}>
                  <Pressable onPress={skip} accessibilityRole="button" hitSlop={12} style={styles.skip}>
                    <Text style={styles.skipText}>{labels.skip}</Text>
                  </Pressable>
                  <Button variant="primary" size="md" onPress={advance}>
                    {isLast ? labels.done : labels.next}
                  </Button>
                </View>
              </View>
            </FadeSlideIn>
          </View>
        </>
      ) : (
        <View style={[styles.scrim, StyleSheet.absoluteFill]} />
      )}
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scrim: {
      position: 'absolute',
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    ring: {
      position: 'absolute',
      borderRadius: radii.lg,
      borderWidth: 2,
      borderColor: colors.accent,
    },
    bubbleWrap: {
      position: 'absolute',
      left: space[4],
      right: space[4],
    },
    bubble: {
      gap: space[2],
      padding: space[4],
      borderRadius: radii.xl,
      backgroundColor: colors.bgPrimary,
    },
    progress: {
      ...textXs,
      fontFamily: fontFamily.heading.extraBold,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      color: colors.accent,
    },
    text: {
      ...textBase,
      color: colors.textPrimary,
      lineHeight: 22,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: space[2],
    },
    skip: {
      minHeight: 44,
      justifyContent: 'center',
    },
    skipText: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textSecondary,
    },
  });
