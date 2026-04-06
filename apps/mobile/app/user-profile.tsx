import type { UserPublicProfile } from '@defensivepedal/core';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { BackButton } from '../src/design-system/atoms/BackButton';
import { Button } from '../src/design-system/atoms/Button';
import { brandColors, darkTheme, gray, safetyColors } from '../src/design-system/tokens/colors';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { space } from '../src/design-system/tokens/spacing';
import { fontFamily, text2xl, textBase, textSm, textXs } from '../src/design-system/tokens/typography';
import { mobileApi } from '../src/lib/api';
import { useAuthSession } from '../src/providers/AuthSessionProvider';

export default function UserProfileScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthSession();
  const queryClient = useQueryClient();

  const profileKey = ['user-profile', id];

  const { data: profile, isLoading, error } = useQuery<UserPublicProfile>({
    queryKey: profileKey,
    queryFn: () => mobileApi.getUserProfile(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  });

  const followMutation = useMutation({
    mutationFn: () => mobileApi.followUser(id!),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: profileKey });
      const prev = queryClient.getQueryData<UserPublicProfile>(profileKey);
      if (prev) {
        queryClient.setQueryData<UserPublicProfile>(profileKey, {
          ...prev,
          isFollowedByMe: true,
          followersCount: prev.followersCount + 1,
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(profileKey, ctx.prev);
    },
    onSettled: () => {
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: profileKey }), 2000);
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: () => mobileApi.unfollowUser(id!),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: profileKey });
      const prev = queryClient.getQueryData<UserPublicProfile>(profileKey);
      if (prev) {
        queryClient.setQueryData<UserPublicProfile>(profileKey, {
          ...prev,
          isFollowedByMe: false,
          followersCount: Math.max(0, prev.followersCount - 1),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(profileKey, ctx.prev);
    },
    onSettled: () => {
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: profileKey }), 2000);
    },
  });

  const isOwnProfile = user?.id === id;
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={brandColors.accent} size="large" />
        </View>
      ) : error || !profile ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>User not found</Text>
          <Button variant="secondary" size="md" onPress={() => router.back()}>Go back</Button>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + space[6] }]} showsVerticalScrollIndicator={false}>
          {/* User card */}
          <View style={styles.userCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(profile.username ?? profile.displayName).charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.displayName}>
              {profile.username ? `@${profile.username}` : profile.displayName}
            </Text>

            {/* Follow counts */}
            <View style={styles.followRow}>
              <View style={styles.followStat}>
                <Text style={styles.followCount}>{profile.followersCount}</Text>
                <Text style={styles.followLabel}>Followers</Text>
              </View>
              <View style={styles.followDivider} />
              <View style={styles.followStat}>
                <Text style={styles.followCount}>{profile.followingCount}</Text>
                <Text style={styles.followLabel}>Following</Text>
              </View>
            </View>

            {/* Follow/unfollow button */}
            {!isOwnProfile ? (
              <Button
                variant={profile.isFollowedByMe ? 'secondary' : 'primary'}
                size="md"
                fullWidth
                onPress={() => {
                  if (profile.isFollowedByMe) {
                    unfollowMutation.mutate();
                  } else {
                    followMutation.mutate();
                  }
                }}
              >
                {profile.isFollowedByMe ? 'Unfollow' : 'Follow'}
              </Button>
            ) : null}
          </View>

          {/* Stats */}
          <View style={styles.statsCard}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{profile.totalTrips}</Text>
                <Text style={styles.statLabel}>Trips</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{(profile.totalDistanceMeters / 1000).toFixed(0)} km</Text>
                <Text style={styles.statLabel}>Cycled</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: safetyColors.safe }]}>
                  {profile.totalCo2SavedKg.toFixed(1)} kg
                </Text>
                <Text style={styles.statLabel}>CO2 Saved</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: safetyColors.caution }]}>
                  {profile.totalHazardsReported}
                </Text>
                <Text style={styles.statLabel}>Hazards</Text>
              </View>
            </View>
          </View>

          {/* Recent trips */}
          <Text style={styles.sectionTitle}>Recent Trips</Text>
          {profile.recentTrips.length === 0 ? (
            <Text style={styles.emptyText}>No shared trips yet.</Text>
          ) : (
            profile.recentTrips.map((trip) => (
              <View key={trip.id} style={styles.tripCard}>
                <View style={styles.tripHeader}>
                  <Text style={styles.tripTitle} numberOfLines={1}>
                    {trip.title || 'Ride'}
                  </Text>
                  <Text style={styles.tripDate}>
                    {new Date(trip.sharedAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.tripStats}>
                  <Text style={styles.tripStat}>
                    {(trip.distanceMeters / 1000).toFixed(1)} km
                  </Text>
                  <Text style={styles.tripStatDivider}>|</Text>
                  <Text style={styles.tripStat}>
                    {Math.round(trip.durationSeconds / 60)} min
                  </Text>
                  {trip.safetyRating ? (
                    <>
                      <Text style={styles.tripStatDivider}>|</Text>
                      <Text style={styles.tripStat}>
                        Safety: {trip.safetyRating}/5
                      </Text>
                    </>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkTheme.bgDeep },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space[4], paddingVertical: space[3],
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...textBase, fontFamily: fontFamily.heading.bold, color: darkTheme.textPrimary },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space[3] },
  errorText: { ...textBase, color: darkTheme.textSecondary },
  scrollContent: { paddingHorizontal: space[4], gap: space[4] },
  userCard: {
    alignItems: 'center', gap: space[3],
    backgroundColor: darkTheme.bgPrimary, borderRadius: radii['2xl'], borderWidth: 1,
    borderColor: darkTheme.borderDefault, padding: space[5], ...shadows.md,
  },
  avatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: brandColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: fontFamily.heading.bold, fontSize: 24, color: '#000' },
  displayName: { ...text2xl, fontFamily: fontFamily.heading.bold, color: darkTheme.textPrimary },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  followStat: { alignItems: 'center', gap: 2 },
  followCount: { fontFamily: fontFamily.mono.bold, fontSize: 18, color: darkTheme.textPrimary },
  followLabel: { ...textXs, color: darkTheme.textSecondary },
  followDivider: { width: 1, height: 24, backgroundColor: darkTheme.borderDefault },
  statsCard: {
    backgroundColor: darkTheme.bgPrimary, borderRadius: radii.xl, borderWidth: 1,
    borderColor: darkTheme.borderDefault, padding: space[4], ...shadows.md,
  },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: 2 },
  statValue: { fontFamily: fontFamily.mono.bold, fontSize: 16, color: darkTheme.textPrimary },
  statLabel: { ...textXs, color: darkTheme.textSecondary },
  sectionTitle: { ...textSm, fontFamily: fontFamily.heading.bold, color: darkTheme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  emptyText: { ...textSm, color: darkTheme.textMuted, textAlign: 'center', paddingVertical: space[4] },
  tripCard: {
    backgroundColor: darkTheme.bgPrimary, borderRadius: radii.lg, borderWidth: 1,
    borderColor: darkTheme.borderDefault, padding: space[3], gap: space[1],
  },
  tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tripTitle: { ...textSm, fontFamily: fontFamily.body.semiBold, color: darkTheme.textPrimary, flex: 1 },
  tripDate: { ...textXs, color: darkTheme.textMuted },
  tripStats: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  tripStat: { ...textXs, fontFamily: fontFamily.mono.medium, color: darkTheme.textSecondary },
  tripStatDivider: { ...textXs, color: gray[600] },
});
