/**
 * ReviewPromptCard — the Stage 1 sentiment card in the Play Store review
 * prompt funnel. See `src/lib/review-prompt.ts` for the Stage 2 native call
 * and `@defensivepedal/core`'s `reviewEligibility.ts` for the gating logic.
 *
 * Three internal stages (no caller branching):
 *   - 'sentiment' → "Enjoying Defensive Pedal?"  ❤️ / 😐 / Later
 *   - 'positive'  → "Mind sharing on the Play Store?"  → triggers native call
 *   - 'negative'  → "Sorry to hear that — what's missing?"  → routes to feedback
 *   - 'thanks'    → terminal confirmation after the user engages
 *
 * Render contract:
 *   - Inline card; NEVER a blocking modal.
 *   - Dismissible (small ✕ → 'later' sentiment).
 *   - If the user unmounts the card without an explicit answer, the caller
 *     should call `onSoftDismiss` from its cleanup effect.
 *
 * The card itself records prompt-shown bookkeeping via Zustand on mount.
 * Callers only need to: render it if eligibility passes, react to
 * `onNegativeFeedback` (route to in-app feedback), and respect dismissal.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppStore } from '../../store/appStore';
import { useT } from '../../hooks/useTranslation';
import { requestPlayStoreReview } from '../../lib/review-prompt';
import { Button } from '../atoms/Button';
import { Mascot } from '../atoms/Mascot';
import { Card } from '../atoms/Card';
import { useTheme, type ThemeColors } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textLg, textSm } from '../tokens/typography';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Stage = 'sentiment' | 'positive' | 'negative' | 'thanks';

export interface ReviewPromptCardProps {
  /**
   * Invoked when the user picks "Could be better" and confirms — caller
   * should route them to the in-app feedback form so we capture the
   * complaint instead of losing it to a 1-star public review.
   */
  readonly onNegativeFeedback?: () => void;
  /** Called when the card terminates (any path) — caller hides it. */
  readonly onDismiss?: () => void;
  /** testID passthrough for E2E. */
  readonly testID?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReviewPromptCard({
  onNegativeFeedback,
  onDismiss,
  testID,
}: ReviewPromptCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();

  const markReviewPromptShown = useAppStore((s) => s.markReviewPromptShown);
  const setReviewSentiment = useAppStore((s) => s.setReviewSentiment);
  const markReviewSoftDismiss = useAppStore((s) => s.markReviewSoftDismiss);
  const markReviewRated = useAppStore((s) => s.markReviewRated);

  const [stage, setStage] = useState<Stage>('sentiment');
  const userAnswered = useRef(false);

  // Record "prompt shown" exactly once on mount, and emit a soft-dismiss
  // on unmount if the user never picked any option.
  //
  // Empty deps — Zustand setters returned by `useAppStore((s) => s.x)` are
  // stable references; re-firing on their identity would over-count.
  useEffect(() => {
    markReviewPromptShown();
    return () => {
      if (!userAnswered.current) {
        markReviewSoftDismiss();
      }
    };
  }, []);

  const handlePositive = () => {
    userAnswered.current = true;
    setReviewSentiment('positive');
    setStage('positive');
  };

  const handleNegative = () => {
    userAnswered.current = true;
    setReviewSentiment('negative');
    setStage('negative');
  };

  const handleLater = () => {
    userAnswered.current = true;
    setReviewSentiment('later');
    onDismiss?.();
  };

  const handleSureRate = async () => {
    // Optimistically mark "rated" so even if the native sheet fails to
    // open we still respect the long cooldown — the user has been given
    // the path and shouldn't be re-asked.
    markReviewRated();
    setStage('thanks');
    // Fire-and-forget; the native call resolves silently regardless of
    // whether the user actually submitted a rating.
    void requestPlayStoreReview();
  };

  const handleSendFeedback = () => {
    onNegativeFeedback?.();
    onDismiss?.();
  };

  const handleDismissTerminal = () => {
    onDismiss?.();
  };

  return (
    <View testID={testID} style={styles.cardWrapper}>
      <Card variant="solid" elevation="md" style={styles.card}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('reviewPrompt.dismissA11y')}
          onPress={handleLater}
          hitSlop={12}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>

      <View style={styles.body}>
        <View style={styles.mascotSlot}>
          <Mascot pose="high-five" size="md" />
        </View>

        {stage === 'sentiment' ? (
          <SentimentStage
            styles={styles}
            t={t}
            onPositive={handlePositive}
            onNegative={handleNegative}
            onLater={handleLater}
          />
        ) : null}

        {stage === 'positive' ? (
          <PositiveStage
            styles={styles}
            t={t}
            onRate={() => void handleSureRate()}
            onDismiss={handleDismissTerminal}
          />
        ) : null}

        {stage === 'negative' ? (
          <NegativeStage
            styles={styles}
            t={t}
            onSend={handleSendFeedback}
            onDismiss={handleDismissTerminal}
          />
        ) : null}

        {stage === 'thanks' ? (
          <ThanksStage styles={styles} t={t} onDone={handleDismissTerminal} />
        ) : null}
        </View>
      </Card>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stage sub-components — kept inline so the file stays self-contained.
// ---------------------------------------------------------------------------

type ThemedStyles = ReturnType<typeof createThemedStyles>;
type TFn = ReturnType<typeof useT>;

function SentimentStage({
  styles,
  t,
  onPositive,
  onNegative,
  onLater,
}: {
  styles: ThemedStyles;
  t: TFn;
  onPositive: () => void;
  onNegative: () => void;
  onLater: () => void;
}) {
  return (
    <View style={styles.content}>
      <Text style={styles.title}>{t('reviewPrompt.sentimentTitle')}</Text>
      <Text style={styles.body2}>{t('reviewPrompt.sentimentBody')}</Text>
      <View style={styles.buttonStack}>
        <Button variant="primary" size="md" fullWidth onPress={onPositive}>
          {t('reviewPrompt.sentimentPositive')}
        </Button>
        <Button variant="secondary" size="md" fullWidth onPress={onNegative}>
          {t('reviewPrompt.sentimentNegative')}
        </Button>
        <Button variant="ghost" size="sm" onPress={onLater}>
          {t('reviewPrompt.sentimentLater')}
        </Button>
      </View>
    </View>
  );
}

function PositiveStage({
  styles,
  t,
  onRate,
  onDismiss,
}: {
  styles: ThemedStyles;
  t: TFn;
  onRate: () => void;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.content}>
      <Text style={styles.title}>{t('reviewPrompt.positiveTitle')}</Text>
      <Text style={styles.body2}>{t('reviewPrompt.positiveBody')}</Text>
      <View style={styles.buttonStack}>
        <Button variant="primary" size="md" fullWidth onPress={onRate}>
          {t('reviewPrompt.positiveCta')}
        </Button>
        <Button variant="ghost" size="sm" onPress={onDismiss}>
          {t('reviewPrompt.positiveDismiss')}
        </Button>
      </View>
    </View>
  );
}

function NegativeStage({
  styles,
  t,
  onSend,
  onDismiss,
}: {
  styles: ThemedStyles;
  t: TFn;
  onSend: () => void;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.content}>
      <Text style={styles.title}>{t('reviewPrompt.negativeTitle')}</Text>
      <Text style={styles.body2}>{t('reviewPrompt.negativeBody')}</Text>
      <View style={styles.buttonStack}>
        <Button variant="primary" size="md" fullWidth onPress={onSend}>
          {t('reviewPrompt.negativeCta')}
        </Button>
        <Button variant="ghost" size="sm" onPress={onDismiss}>
          {t('reviewPrompt.negativeDismiss')}
        </Button>
      </View>
    </View>
  );
}

function ThanksStage({
  styles,
  t,
  onDone,
}: {
  styles: ThemedStyles;
  t: TFn;
  onDone: () => void;
}) {
  return (
    <View style={styles.content}>
      <Text style={styles.title}>{t('reviewPrompt.thanksTitle')}</Text>
      <Text style={styles.body2}>{t('reviewPrompt.thanksBody')}</Text>
      <View style={styles.buttonStack}>
        <Button variant="ghost" size="sm" onPress={onDone}>
          {t('common.done')}
        </Button>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    cardWrapper: {
      // Lets the parent control horizontal margin; Card owns its own chrome.
    },
    card: {
      borderRadius: radii.xl,
    },
    closeButton: {
      position: 'absolute',
      top: space[2],
      right: space[2],
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    body: {
      // Stacked: mascot on top, full-width text + buttons below. Gives the
      // copy room to breathe vs the earlier side-by-side which competed
      // with the mascot for horizontal space on narrow phones.
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: space[3],
    },
    mascotSlot: {
      alignItems: 'center',
      // Reserve clearance from the absolute-positioned close button so the
      // mascot stays optically centered.
      marginTop: space[1],
    },
    content: {
      gap: space[2],
    },
    title: {
      ...textLg,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    body2: {
      ...textSm,
      fontFamily: fontFamily.body.regular,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    buttonStack: {
      gap: space[2],
      marginTop: space[3],
    },
  });
