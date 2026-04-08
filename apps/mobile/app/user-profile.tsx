import type { UserPublicProfile } from '@defensivepedal/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ScreenHeader } from '../src/design-system/atoms/ScreenHeader';
import { SectionTitle } from '../src/design-system/atoms/SectionTitle';
import { Button } from '../src/design-system/atoms/Button';
import { useTheme, type ThemeColors } from '../src/design-system';
import { gray } from '../src/design-system/tokens/colors';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { space } from '../src/design-system/tokens/spacing';
import { fontFamily, text2xl, textBase, textSm, textXs } from '../src/design-system/tokens/typography';
import { mobileApi } from '../src/lib/api';
import { useAuthSession } from '../src/providers/AuthSessionProvider';

export default function UserProfileScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
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
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader variant="back" title="Profile" />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} size="large" />
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
                <Text style={[styles.statValue, { color: colors.safe }]}>
                  {profile.totalCo2SavedKg.toFixed(1)} kg
                </Text>
                <Text style={styles.statLabel}>CO2 Saved</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.caution }]}>
                  {profile.totalHazardsReported}
                </Text>
                <Text style={styles.statLabel}>Hazards</Text>
              </View>
            </View>
          </View>

          {/* Recent trips */}
          <SectionTitle variant="muted">Recent Trips</SectionTitle>
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
    </SafeAreaView>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgDeep },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space[3] },
    errorText: { ...textBase, color: colors.textSecondary },
    scrollContent: { paddingHorizontal: space[4], gap: space[4] },
    userCard: {
      alignItems: 'center', gap: space[3],
      backgroundColor: colors.bgPrimary, borderRadius: radii['2xl'], borderWidth: 1,
      borderColor: colors.borderDefault, padding: space[5], ...shadows.md,
    },
    avatar: {
      width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { fontFamily: fontFamily.heading.bold, fontSize: 24, color: colors.textInverse },
    displayName: { ...text2xl, fontFamily: fontFamily.heading.bold, color: colors.textPrimary },
    followRow: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
    followStat: { alignItems: 'center', gap: 2 },
    followCount: { fontFamily: fontFamily.mono.bold, fontSize: 18, color: colors.textPrimary },
    followLabel: { ...textXs, color: colors.textSecondary },
    followDivider: { width: 1, height: 24, backgroundColor: colors.borderDefault },
    statsCard: {
      backgroundColor: colors.bgPrimary, borderRadius: radii.xl, borderWidth: 1,
      borderColor: colors.borderDefault, padding: space[4], ...shadows.md,
    },
    statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
    statItem: { alignItems: 'center', gap: 2 },
    statValue: { fontFamily: fontFamily.mono.bold, fontSize: 16, color: colors.textPrimary },
    statLabel: { ...textXs, color: colors.textSecondary },
    emptyText: { ...textSm, color: colors.textMuted, textAlign: 'center', paddingVertical: space[4] },
    tripCard: {
      backgroundColor: colors.bgPrimary, borderRadius: radii.lg, borderWidth: 1,
      borderColor: colors.borderDefault, padding: space[3], gap: space[1],
    },
    tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    tripTitle: { ...textSm, fontFamily: fontFamily.body.semiBold, color: colors.textPrimary, flex: 1 },
    tripDate: { ...textXs, color: colors.textMuted },
    tripStats: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    tripStat: { ...textXs, fontFamily: fontFamily.mono.medium, color: colors.textSecondary },
    tripStatDivider: { ...textXs, color: gray[600] },
  });
