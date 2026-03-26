import { getPreviewOrigin, SAFETY_TAG_OPTIONS } from '@defensivepedal/core';
import type { SafetyTag, ShareTripRequest } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '../src/components/Screen';
import { SafetyTagChips } from '../src/components/SafetyTagChips';
import { StatusCard } from '../src/components/StatusCard';
import { useShareTrip } from '../src/hooks/useFeed';
import { generateSafetyTags } from '../src/lib/safetyTagGenerator';
import { mobileTheme } from '../src/lib/theme';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useAppStore } from '../src/store/appStore';

const formatCoordinateLabel = (lat: number, lon: number) => `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export default function FeedbackScreen() {
  const { user } = useAuthSession();
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

  return (
    <Screen
      title="Trip Feedback"
      eyebrow="Post-ride"
      subtitle="Close the ride with the same product tone as the web app: quick rating, short notes, and a clear sync outcome."
    >
      <StatusCard title="Feedback status" tone="accent">
        <Text style={styles.darkText}>
          {user
            ? 'Your ride feedback can queue offline and sync automatically when connectivity returns.'
            : 'You can still finish anonymously, but synced ride feedback requires sign-in.'}
        </Text>
      </StatusCard>

      <StatusCard title="Ride summary">
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
          <Text style={styles.bodyText}>
            Start: {formatCoordinateLabel(getPreviewOrigin(routeRequest).lat, getPreviewOrigin(routeRequest).lon)}
          </Text>
          <Text style={styles.bodyText}>
            Destination: {formatCoordinateLabel(routeRequest.destination.lat, routeRequest.destination.lon)}
          </Text>
          <Text style={styles.bodyText}>
            Route id: {selectedRoute?.id ?? 'No selected route'}
          </Text>
        </View>
      </StatusCard>

      <StatusCard title="How safe did it feel?">
        <View style={styles.ratingRow}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable
              key={value}
              style={[styles.ratingButton, rating >= value ? styles.ratingButtonActive : null]}
              onPress={() => setRating(value)}
            >
              <Text style={[styles.ratingLabel, rating >= value ? styles.ratingLabelActive : null]}>
                {value}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.ratingLegend}>
          <Text style={styles.helperText}>1 = unsafe</Text>
          <Text style={styles.helperText}>5 = very safe</Text>
        </View>

        <TextInput
          multiline
          numberOfLines={5}
          style={styles.commentInput}
          placeholder="Add any route notes, hazard context, or why this route felt better or worse than expected."
          placeholderTextColor="#94a3b8"
          value={comments}
          onChangeText={setComments}
        />

        {feedbackQueued ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>
              Feedback for this ride is already queued and will sync automatically.
            </Text>
          </View>
        ) : null}
        {!user ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>
              Sign in from the account screen if you want this ride feedback stored on the backend.
            </Text>
          </View>
        ) : null}
      </StatusCard>

      <Pressable
        style={[styles.primaryButton, feedbackLocked ? styles.primaryButtonDisabled : null]}
        disabled={feedbackLocked}
        onPress={finishRide}
      >
        <Text style={styles.primaryLabel}>{queueLabel}</Text>
      </Pressable>

      {/* Share to Community */}
      {user ? (
        <ShareToCommunitySection
          routeRequest={routeRequest}
          selectedRoute={selectedRoute}
          navigationSession={navigationSession}
          rating={rating}
          activeTripClientId={activeTripClientId}
          tripServerIds={tripServerIds}
        />
      ) : null}

      <Pressable
        style={styles.secondaryButton}
        onPress={() => {
          resetFlow();
          router.replace('/route-planning');
        }}
      >
        <Text style={styles.secondaryLabel}>Skip and start a new route</Text>
      </Pressable>
    </Screen>
  );
}

function ShareToCommunitySection({
  routeRequest,
  selectedRoute,
  navigationSession,
  rating,
  activeTripClientId,
  tripServerIds,
}: {
  routeRequest: ReturnType<typeof useAppStore>['routeRequest'];
  selectedRoute: ReturnType<typeof useAppStore>['routePreview'] extends { routes: (infer R)[] } | null ? R | null : never;
  navigationSession: ReturnType<typeof useAppStore>['navigationSession'];
  rating: number;
  activeTripClientId: string | null;
  tripServerIds: Record<string, string>;
}) {
  const [showShare, setShowShare] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const [selectedTags, setSelectedTags] = useState<SafetyTag[]>([]);
  const [tagsInitialized, setTagsInitialized] = useState(false);
  const shareTrip = useShareTrip();

  if (!selectedRoute || !navigationSession) return null;

  // Auto-generate tags on first render of share section
  if (showShare && !tagsInitialized) {
    // We don't have composition in RouteOption directly, so start with empty auto tags
    // In a full implementation we'd pass RouteAnalysis through; for now start empty
    setSelectedTags([]);
    setTagsInitialized(true);
  }

  const origin = getPreviewOrigin(routeRequest);
  const destination = routeRequest.destination;

  const handleShare = () => {
    const payload: ShareTripRequest = {
      tripId: activeTripClientId ? tripServerIds[activeTripClientId] : undefined,
      startLocationText: `${origin.lat.toFixed(4)}, ${origin.lon.toFixed(4)}`,
      destinationText: `${destination.lat.toFixed(4)}, ${destination.lon.toFixed(4)}`,
      distanceMeters: selectedRoute.distanceMeters,
      durationSeconds: selectedRoute.adjustedDurationSeconds ?? selectedRoute.durationSeconds,
      elevationGainMeters: selectedRoute.totalClimbMeters,
      safetyRating: rating > 0 ? rating : undefined,
      geometryPolyline6: selectedRoute.geometryPolyline6,
      safetyTags: selectedTags,
      note: shareNote.trim() || undefined,
      startCoordinate: origin,
    };

    shareTrip.mutate(payload);
  };

  const toggleTag = (tag: SafetyTag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  if (!showShare) {
    return (
      <Pressable style={styles.shareToggleButton} onPress={() => setShowShare(true)}>
        <Text style={styles.shareToggleLabel}>Share to Community</Text>
      </Pressable>
    );
  }

  return (
    <StatusCard title="Share this ride">
      <Text style={styles.bodyText}>
        Share your ride with nearby cyclists. Help others discover safe routes.
      </Text>

      {/* Safety tag picker */}
      <Text style={styles.tagPickerLabel}>Route safety tags</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.tagPickerRow}>
          {SAFETY_TAG_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.tagPickerChip,
                selectedTags.includes(option.value) ? styles.tagPickerChipActive : null,
              ]}
              onPress={() => toggleTag(option.value)}
            >
              <Text
                style={[
                  styles.tagPickerText,
                  selectedTags.includes(option.value) ? styles.tagPickerTextActive : null,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Note input */}
      <TextInput
        style={styles.shareNoteInput}
        placeholder="Add a note about this route (optional)"
        placeholderTextColor="#94a3b8"
        value={shareNote}
        onChangeText={setShareNote}
        multiline
        numberOfLines={3}
      />

      <Pressable
        style={[
          styles.primaryButton,
          shareTrip.isPending ? styles.primaryButtonDisabled : null,
        ]}
        disabled={shareTrip.isPending || shareTrip.isSuccess}
        onPress={handleShare}
      >
        <Text style={styles.primaryLabel}>
          {shareTrip.isSuccess ? 'Shared!' : shareTrip.isPending ? 'Sharing...' : 'Share ride'}
        </Text>
      </Pressable>
    </StatusCard>
  );
}

const styles = StyleSheet.create({
  darkText: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 15,
    lineHeight: 21,
  },
  bodyText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  helperText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricTile: {
    minWidth: 132,
    flexGrow: 1,
    borderRadius: mobileTheme.radii.md,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  metricLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metricValue: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '900',
  },
  detailStack: {
    gap: 6,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 10,
  },
  ratingButton: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surface,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ratingButtonActive: {
    borderColor: mobileTheme.colors.borderStrong,
    backgroundColor: '#fff8d6',
  },
  ratingLabel: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 20,
    fontWeight: '900',
  },
  ratingLabelActive: {
    color: mobileTheme.colors.textPrimary,
  },
  ratingLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  commentInput: {
    minHeight: 124,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 14,
    textAlignVertical: 'top',
    color: mobileTheme.colors.textPrimary,
    fontSize: 15,
  },
  noticeCard: {
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
    padding: 14,
  },
  noticeText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    borderRadius: 22,
    backgroundColor: mobileTheme.colors.brand,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#8f9bad',
  },
  primaryLabel: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryLabel: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 16,
    fontWeight: '800',
  },
  shareToggleButton: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mobileTheme.colors.borderStrong,
    backgroundColor: 'rgba(250, 204, 21, 0.08)',
    paddingVertical: 16,
    alignItems: 'center',
  },
  shareToggleLabel: {
    color: mobileTheme.colors.brand,
    fontSize: 16,
    fontWeight: '900',
  },
  tagPickerLabel: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tagPickerRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
  },
  tagPickerChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagPickerChipActive: {
    borderColor: mobileTheme.colors.borderStrong,
    backgroundColor: '#fff8d6',
  },
  tagPickerText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  tagPickerTextActive: {
    color: mobileTheme.colors.textPrimary,
  },
  shareNoteInput: {
    minHeight: 80,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
    color: mobileTheme.colors.textPrimary,
    fontSize: 14,
  },
});
