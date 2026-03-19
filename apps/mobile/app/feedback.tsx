import { getPreviewOrigin } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '../src/components/Screen';
import { useTheme } from '../src/design-system';
import { Button } from '../src/design-system/atoms';
import { TextInput } from '../src/design-system/atoms';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import {
  fontFamily,
  textBase,
  textSm,
  textXs,
  textXl,
  textDataSm,
  text2xs,
} from '../src/design-system/tokens/typography';
import { useRouteGuard } from '../src/hooks/useRouteGuard';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useAppStore } from '../src/store/appStore';

const formatCoordinateLabel = (lat: number, lon: number) => `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

function SummaryMetric({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.metricTile, { backgroundColor: `${colors.bgTertiary}20` }]}>
      <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

export default function FeedbackScreen() {
  const { colors } = useTheme();
  const { user } = useAuthSession();
  const guardPassed = useRouteGuard({
    requiredStates: ['AWAITING_FEEDBACK'],
  });
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState('');

  const routeRequest = useAppStore((state) => state.routeRequest);
  const routePreview = useAppStore((state) => state.routePreview);
  const selectedRouteId = useAppStore((state) => state.selectedRouteId);
  const navigationSession = useAppStore((state) => state.navigationSession);
  const activeTripClientId = useAppStore((state) => state.activeTripClientId);
  const tripServerIds = useAppStore((state) => state.tripServerIds);
  const queuedMutations = useAppStore((state) => state.queuedMutations);
  const enqueueMutation = useAppStore((state) => state.enqueueMutation);
  const resetFlow = useAppStore((state) => state.resetFlow);

  const selectedRoute =
    routePreview?.routes.find((route) => route.id === selectedRouteId) ?? routePreview?.routes[0] ?? null;
  const feedbackQueued = queuedMutations.some(
    (mutation) =>
      mutation.type === 'feedback' &&
      (mutation.payload as { clientTripId?: string }).clientTripId === activeTripClientId,
  );
  const feedbackLocked = user ? rating === 0 || feedbackQueued : false;

  const queueLabel = useMemo(() => {
    if (feedbackQueued) {
      return 'Feedback already queued';
    }

    return user ? 'Queue feedback and finish' : 'Finish without syncing';
  }, [feedbackQueued, user]);

  const finishRide = () => {
    if (!navigationSession) {
      return;
    }

    if (user) {
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

    resetFlow();
    router.replace('/route-planning');
  };

  if (!guardPassed) return null;

  return (
    <Screen
      title="Trip Feedback"
      eyebrow="Post-ride"
      subtitle="Close the ride with the same product tone as the web app: quick rating, short notes, and a clear sync outcome."
    >
      {/* ---- Feedback status card ---- */}
      <View style={[styles.card, { backgroundColor: colors.accent, borderColor: colors.borderAccent }, shadows.md]}>
        <Text style={[styles.cardTitle, { color: colors.textInverse }]}>Feedback status</Text>
        <Text style={[styles.cardBody, { color: colors.textInverse }]}>
          {user
            ? 'Your ride feedback can queue offline and sync automatically when connectivity returns.'
            : 'You can still finish anonymously, but synced ride feedback requires sign-in.'}
        </Text>
      </View>

      {/* ---- Ride summary card ---- */}
      <View style={[styles.card, { backgroundColor: colors.bgSecondary, borderColor: colors.borderDefault }, shadows.md]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Ride summary</Text>
        <View style={styles.metricGrid}>
          <SummaryMetric
            label="Session"
            value={navigationSession?.sessionId ? 'Tracked' : 'Missing'}
          />
          <SummaryMetric
            label="Route"
            value={selectedRoute?.id ? 'Selected' : 'Not found'}
          />
          <SummaryMetric
            label="Queue"
            value={`${queuedMutations.length} pending`}
          />
          <SummaryMetric
            label="Sync"
            value={user ? 'Signed in' : 'Anonymous'}
          />
        </View>
        <View style={styles.detailStack}>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            Start: {formatCoordinateLabel(getPreviewOrigin(routeRequest).lat, getPreviewOrigin(routeRequest).lon)}
          </Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            Destination: {formatCoordinateLabel(routeRequest.destination.lat, routeRequest.destination.lon)}
          </Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            Route id: {selectedRoute?.id ?? 'No selected route'}
          </Text>
        </View>
      </View>

      {/* ---- Rating card ---- */}
      <View style={[styles.card, { backgroundColor: colors.bgSecondary, borderColor: colors.borderDefault }, shadows.md]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>How safe did it feel?</Text>
        <View style={styles.ratingRow}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable
              key={value}
              style={[
                styles.ratingButton,
                {
                  borderColor: colors.borderDefault,
                  backgroundColor: colors.bgSecondary,
                },
                rating >= value && {
                  borderColor: colors.accentHover,
                  backgroundColor: colors.accent,
                },
              ]}
              onPress={() => setRating(value)}
            >
              <Text
                style={[
                  styles.ratingLabel,
                  { color: colors.textSecondary },
                  rating >= value && { color: colors.textInverse },
                ]}
              >
                {value}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.ratingLegend}>
          <Text style={[styles.helperText, { color: colors.textMuted }]}>1 = unsafe</Text>
          <Text style={[styles.helperText, { color: colors.textMuted }]}>5 = very safe</Text>
        </View>

        <TextInput
          multiline
          numberOfLines={5}
          placeholder="Add any route notes, hazard context, or why this route felt better or worse than expected."
          value={comments}
          onChangeText={setComments}
        />

        {feedbackQueued ? (
          <View style={[styles.noticeCard, { borderColor: colors.borderDefault, backgroundColor: `${colors.bgTertiary}18` }]}>
            <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
              Feedback for this ride is already queued and will sync automatically.
            </Text>
          </View>
        ) : null}
        {!user ? (
          <View style={[styles.noticeCard, { borderColor: colors.borderDefault, backgroundColor: `${colors.bgTertiary}18` }]}>
            <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
              Sign in from the account screen if you want this ride feedback stored on the backend.
            </Text>
          </View>
        ) : null}
      </View>

      {/* ---- Actions ---- */}
      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={feedbackLocked}
        onPress={finishRide}
      >
        {queueLabel}
      </Button>

      <Button
        variant="secondary"
        size="lg"
        fullWidth
        onPress={() => {
          resetFlow();
          router.replace('/route-planning');
        }}
      >
        Skip and start a new route
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  /* Card container — replaces StatusCard */
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: space[4],
    gap: space[3],
  },
  cardTitle: {
    ...textXl,
  },
  cardBody: {
    ...textBase,
  },

  /* Body / helper text */
  bodyText: {
    ...textSm,
  },
  helperText: {
    ...textXs,
  },

  /* Metric grid */
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  metricTile: {
    minWidth: 132,
    flexGrow: 1,
    borderRadius: radii.md,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    gap: space[1],
  },
  metricLabel: {
    ...text2xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metricValue: {
    ...textDataSm,
    fontFamily: fontFamily.mono.bold,
    fontSize: 17,
  },

  /* Detail stack */
  detailStack: {
    gap: space[1],
  },

  /* Rating */
  ratingRow: {
    flexDirection: 'row',
    gap: space[2],
  },
  ratingButton: {
    flex: 1,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingVertical: space[4],
    alignItems: 'center',
  },
  ratingLabel: {
    fontFamily: fontFamily.heading.extraBold,
    fontSize: 20,
  },
  ratingLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  /* Notice */
  noticeCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: space[3],
  },
  noticeText: {
    ...textSm,
  },
});
