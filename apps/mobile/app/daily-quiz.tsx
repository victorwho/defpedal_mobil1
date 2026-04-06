import type { QuizAnswer, QuizQuestion } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '../src/design-system/atoms/Button';
import { Toast } from '../src/design-system/molecules/Toast';
import { useTheme, type ThemeColors } from '../src/design-system';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { space } from '../src/design-system/tokens/spacing';
import {
  fontFamily,
  text2xl,
  textBase,
  textLg,
  textSm,
  textXs,
} from '../src/design-system/tokens/typography';
import { mobileApi } from '../src/lib/api';
import { brandTints, safetyTints } from '../src/design-system/tokens/tints';

// ---------------------------------------------------------------------------
// Option button
// ---------------------------------------------------------------------------

type OptionState = 'default' | 'selected' | 'correct' | 'wrong';

type OptionButtonProps = {
  readonly label: string;
  readonly index: number;
  readonly state: OptionState;
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly colors: ThemeColors;
  readonly styles: ReturnType<typeof createThemedStyles>;
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

const getOptionColors = (state: OptionState, colors: ThemeColors) => {
  switch (state) {
    case 'correct':
      return { bg: safetyTints.safeMedium, border: colors.safe, text: colors.safe };
    case 'wrong':
      return { bg: safetyTints.dangerMedium, border: colors.danger, text: colors.danger };
    case 'selected':
      return { bg: brandTints.accentLight, border: colors.accent, text: colors.accent };
    default:
      return { bg: colors.bgSecondary, border: colors.borderDefault, text: colors.textPrimary };
  }
};

const OptionButton = ({ label, index, state, disabled, onPress, colors, styles }: OptionButtonProps) => {
  const optColors = getOptionColors(state, colors);
  const letter = OPTION_LETTERS[index] ?? String(index + 1);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.optionButton,
        { backgroundColor: optColors.bg, borderColor: optColors.border },
        pressed && !disabled && styles.optionPressed,
        disabled && state === 'default' && styles.optionDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Option ${letter}: ${label}`}
    >
      <View style={[styles.optionLetter, { borderColor: optColors.border }]}>
        <Text style={[styles.optionLetterText, { color: optColors.text }]}>{letter}</Text>
      </View>
      <Text style={[styles.optionLabel, { color: optColors.text }]}>{label}</Text>
      {state === 'correct' ? (
        <Ionicons name="checkmark-circle" size={22} color={colors.safe} />
      ) : state === 'wrong' ? (
        <Ionicons name="close-circle" size={22} color={colors.danger} />
      ) : null}
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const QUIZ_KEY = 'daily-quiz';

export default function DailyQuizScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const queryClient = useQueryClient();

  const { data: question, isLoading, error, refetch } = useQuery<QuizQuestion>({
    queryKey: [QUIZ_KEY],
    queryFn: () => mobileApi.fetchDailyQuiz(),
    staleTime: 30 * 60_000,
  });

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [answer, setAnswer] = useState<QuizAnswer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStreakToast, setShowStreakToast] = useState(false);

  const feedbackOpacity = useRef(new Animated.Value(0)).current;

  const handleSelectOption = async (index: number) => {
    if (!question || selectedIndex !== null) return;

    setSelectedIndex(index);
    setIsSubmitting(true);

    try {
      const result = await mobileApi.submitQuizAnswer(question.id, index);
      setAnswer(result);

      // Animate feedback in
      Animated.timing(feedbackOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // If correct, show streak toast and invalidate dashboard cache
      if (result.isCorrect) {
        setShowStreakToast(true);
        void queryClient.invalidateQueries({ queryKey: ['impact-dashboard'] });
      }
    } catch {
      // Reset selection on error so user can retry
      setSelectedIndex(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getOptionState = (index: number): OptionState => {
    if (!answer) {
      return index === selectedIndex ? 'selected' : 'default';
    }

    if (answer.isCorrect && index === selectedIndex) return 'correct';
    if (!answer.isCorrect && index === selectedIndex) return 'wrong';
    return 'default';
  };

  const handleDone = () => {
    router.back();
  };

  return (
    <ScrollView
      style={[styles.root, { paddingTop: insets.top }]}
      contentContainerStyle={[styles.rootContent, { paddingBottom: insets.bottom + space[6] }]}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Daily Quiz</Text>
        <View style={styles.backButton} />
      </View>

      {/* Loading */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Failed to load quiz</Text>
          <Button variant="secondary" size="md" onPress={() => void refetch()}>
            Retry
          </Button>
        </View>
      ) : question ? (
        <View style={styles.content}>
          {/* Category badge */}
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{question.category}</Text>
          </View>

          {/* Question */}
          <Text style={styles.questionText}>{question.questionText}</Text>

          {/* Options */}
          <View style={styles.optionsList}>
            {question.options.map((option, index) => (
              <OptionButton
                key={index}
                label={option}
                index={index}
                state={getOptionState(index)}
                disabled={answer != null || isSubmitting}
                onPress={() => void handleSelectOption(index)}
                colors={colors}
                styles={styles}
              />
            ))}
          </View>

          {/* Feedback */}
          {answer ? (
            <Animated.View style={[styles.feedbackCard, { opacity: feedbackOpacity }]}>
              <View style={styles.feedbackHeader}>
                <Ionicons
                  name={answer.isCorrect ? 'checkmark-circle' : 'information-circle'}
                  size={22}
                  color={answer.isCorrect ? colors.safe : colors.caution}
                />
                <Text
                  style={[
                    styles.feedbackTitle,
                    { color: answer.isCorrect ? colors.safe : colors.caution },
                  ]}
                >
                  {answer.isCorrect ? 'Correct!' : 'Not quite'}
                </Text>
              </View>
              <Text style={styles.feedbackExplanation}>{answer.explanation}</Text>
              <Button variant="primary" size="lg" fullWidth onPress={handleDone}>
                Done
              </Button>
            </Animated.View>
          ) : null}
        </View>
      ) : null}

      {/* Streak toast */}
      {showStreakToast ? (
        <View style={styles.toastContainer}>
          <Toast
            message="Streak maintained! Keep it up."
            variant="success"
            durationMs={3000}
            onDismiss={() => setShowStreakToast(false)}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bgDeep,
    },
    rootContent: {
      flexGrow: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space[4],
      paddingVertical: space[3],
    },
    backButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      ...textLg,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
    },
    centerContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[4],
      paddingHorizontal: space[5],
    },
    errorText: {
      ...textBase,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    content: {
      flex: 1,
      paddingHorizontal: space[5],
      gap: space[4],
    },
    categoryBadge: {
      alignSelf: 'flex-start',
      backgroundColor: brandTints.accentLight,
      borderRadius: radii.full,
      paddingHorizontal: space[3],
      paddingVertical: space[1],
    },
    categoryText: {
      ...textXs,
      fontFamily: fontFamily.heading.semiBold,
      color: colors.accent,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    questionText: {
      ...text2xl,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
      letterSpacing: -0.3,
      lineHeight: 32,
    },
    optionsList: {
      gap: space[3],
      paddingTop: space[2],
    },
    optionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      borderWidth: 1,
      borderRadius: radii.xl,
      paddingHorizontal: space[4],
      paddingVertical: space[3] + 2,
    },
    optionPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.98 }],
    },
    optionDisabled: {
      opacity: 0.5,
    },
    optionLetter: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionLetterText: {
      ...textSm,
      fontFamily: fontFamily.body.bold,
      fontSize: 13,
    },
    optionLabel: {
      ...textBase,
      fontFamily: fontFamily.body.medium,
      flex: 1,
    },
    feedbackCard: {
      backgroundColor: colors.bgPrimary,
      borderRadius: radii['2xl'],
      borderWidth: 1,
      borderColor: colors.borderDefault,
      padding: space[5],
      gap: space[3],
      ...shadows.md,
    },
    feedbackHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    feedbackTitle: {
      ...textLg,
      fontFamily: fontFamily.heading.bold,
    },
    feedbackExplanation: {
      ...textSm,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    toastContainer: {
      position: 'absolute',
      bottom: 100,
      left: space[5],
      right: space[5],
    },
  });
