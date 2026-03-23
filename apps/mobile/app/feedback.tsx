import { getPreviewOrigin } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { brandColors } from '../src/design-system/tokens/colors';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { fontFamily, text2xl, textBase, textSm } from '../src/design-system/tokens/typography';
import { useRouteGuard } from '../src/hooks/useRouteGuard';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useAppStore } from '../src/store/appStore';

const STAR_SIZE = 40;
const STAR_COLOR_ACTIVE = '#FACC15';
const STAR_COLOR_INACTIVE = '#D1D5DB';

const formatCoordinateLabel = (lat: number, lon: number) =>
  `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

function StarRow({
  rating,
  onSelect,
}: {
  rating: number;
  onSelect: (value: number) => void;
}) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Pressable
          key={value}
          onPress={() => onSelect(value)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${value} star${value > 1 ? 's' : ''}`}
        >
          <Text
            style={[
              styles.starIcon,
              { color: rating >= value ? STAR_COLOR_ACTIVE : STAR_COLOR_INACTIVE },
            ]}
          >
            ★
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function FeedbackScreen() {
  const { user } = useAuthSession();
  const guardPassed = useRouteGuard({
    requiredStates: ['AWAITING_FEEDBACK'],
  });
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const routeRequest = useAppStore((s) => s.routeRequest);
  const routePreview = useAppStore((s) => s.routePreview);
  const selectedRouteId = useAppStore((s) => s.selectedRouteId);
  const navigationSession = useAppStore((s) => s.navigationSession);
  const activeTripClientId = useAppStore((s) => s.activeTripClientId);
  const tripServerIds = useAppStore((s) => s.tripServerIds);
  const queuedMutations = useAppStore((s) => s.queuedMutations);
  const enqueueMutation = useAppStore((s) => s.enqueueMutation);
  const resetFlow = useAppStore((s) => s.resetFlow);

  const selectedRoute =
    routePreview?.routes.find((r) => r.id === selectedRouteId) ??
    routePreview?.routes[0] ??
    null;

  const feedbackQueued = queuedMutations.some(
    (m) =>
      m.type === 'feedback' &&
      (m.payload as { clientTripId?: string }).clientTripId === activeTripClientId,
  );

  const submitDisabled = rating === 0 || feedbackQueued;

  const handleSubmit = () => {
    if (!navigationSession) return;

    if (user && !feedbackQueued) {
      enqueueMutation('feedback', {
        clientTripId: activeTripClientId ?? undefined,
        tripId: activeTripClientId ? tripServerIds[activeTripClientId] : undefined,
        sessionId: navigationSession.sessionId,
        startLocationText: formatCoordinateLabel(
          getPreviewOrigin(routeRequest).lat,
          getPreviewOrigin(routeRequest).lon,
        ),
        destinationText: formatCoordinateLabel(
          routeRequest.destination.lat,
          routeRequest.destination.lon,
        ),
        distanceMeters: selectedRoute?.distanceMeters ?? 0,
        durationSeconds: selectedRoute?.adjustedDurationSeconds ?? 0,
        rating,
        feedbackText: comments,
        submittedAt: new Date().toISOString(),
      });
    }

    setSubmitted(true);
  };

  const handleDone = () => {
    resetFlow();
    router.replace('/route-planning');
  };

  const handleCancel = () => {
    resetFlow();
    router.replace('/route-planning');
  };

  if (!guardPassed) return null;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.cardContainer}>
            <View style={styles.card}>
              {submitted ? (
                <>
                  <Text style={styles.thankYouEmoji}>🙏</Text>
                  <Text style={styles.title}>Thank you!</Text>
                  <Text style={styles.subtitle}>
                    Thank you for submitting feedback, you are making the street safer for everyone 🤗
                  </Text>
                  <Pressable
                    style={[styles.button, styles.doneButton]}
                    onPress={handleDone}
                  >
                    <Text style={styles.doneButtonText}>Done</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  {/* Title */}
                  <Text style={styles.title}>How safe was your trip?</Text>
                  <Text style={styles.subtitle}>
                    Your feedback helps improve future routes.
                  </Text>

                  {/* Star rating */}
                  <Text style={styles.sectionLabel}>Perceived safety</Text>
                  <StarRow rating={rating} onSelect={setRating} />

                  {/* Comments */}
                  <Text style={styles.sectionLabel}>Comments (optional)</Text>
                  <TextInput
                    style={styles.commentInput}
                    multiline
                    numberOfLines={4}
                    placeholder="Any comments about the route?"
                    placeholderTextColor="#9CA3AF"
                    value={comments}
                    onChangeText={setComments}
                    textAlignVertical="top"
                  />

                  {/* Buttons */}
                  <View style={styles.buttonRow}>
                    <Pressable
                      style={[styles.button, styles.cancelButton]}
                      onPress={handleCancel}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.button,
                        styles.submitButton,
                        submitDisabled && styles.submitButtonDisabled,
                      ]}
                      onPress={handleSubmit}
                      disabled={submitDisabled}
                    >
                      <Text
                        style={[
                          styles.submitButtonText,
                          submitDisabled && styles.submitButtonTextDisabled,
                        ]}
                      >
                        Submit
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: brandColors.bgDeep,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space[5],
  },
  card: {
    backgroundColor: '#FFFDF5',
    borderRadius: radii.xl,
    padding: space[6],
    gap: space[4],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  thankYouEmoji: {
    fontSize: 56,
    textAlign: 'center',
  },
  title: {
    ...text2xl,
    fontFamily: fontFamily.heading.extraBold,
    color: '#111827',
    textAlign: 'center',
  },
  subtitle: {
    ...textBase,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: -space[2],
  },
  sectionLabel: {
    ...textSm,
    fontFamily: fontFamily.body.bold,
    color: '#374151',
    textAlign: 'center',
  },
  starRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space[3],
  },
  starIcon: {
    fontSize: STAR_SIZE,
    lineHeight: STAR_SIZE + 8,
  },
  commentInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: space[3],
    minHeight: 100,
    fontSize: 15,
    color: '#111827',
    fontFamily: fontFamily.body.regular,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: space[3],
    marginTop: space[2],
  },
  button: {
    flex: 1,
    paddingVertical: space[4],
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#D1D5DB',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: fontFamily.body.bold,
    color: '#374151',
  },
  submitButton: {
    backgroundColor: '#6B7280',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: fontFamily.body.bold,
    color: '#FFFFFF',
  },
  submitButtonTextDisabled: {
    color: '#D1D5DB',
  },
  doneButton: {
    backgroundColor: '#FDD700',
    marginTop: space[2],
    paddingVertical: space[4],
    minHeight: 52,
  },
  doneButtonText: {
    fontSize: 16,
    fontFamily: fontFamily.body.bold,
    color: '#111827',
  },
});
