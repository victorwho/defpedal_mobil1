/**
 * Design System — SuggestedUserCard Molecule
 *
 * Compact card (~140px wide) for the horizontal suggested riders scroll.
 * Shows avatar, display name, tier pill, mutual follows hint, and follow button.
 */
import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SuggestedUser } from '@defensivepedal/core';

import { useTheme, type ThemeColors } from '../ThemeContext';
import { TierPill } from '../atoms/TierPill';
import { FollowButton } from '../atoms/FollowButton';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textXs } from '../tokens/typography';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SuggestedUserCardProps {
  user: SuggestedUser;
  onFollow: (id: string) => void;
  onUserPress?: (userId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getInitials = (name: string): string =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SuggestedUserCard = React.memo(function SuggestedUserCard({
  user,
  onFollow,
  onUserPress,
}: SuggestedUserCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const initials = useMemo(() => getInitials(user.displayName), [user.displayName]);

  const handleFollow = useCallback(() => onFollow(user.id), [user.id, onFollow]);
  const handleUserPress = useCallback(() => onUserPress?.(user.id), [user.id, onUserPress]);

  return (
    <Pressable
      style={styles.card}
      onPress={handleUserPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${user.displayName}'s profile`}
    >
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>

      {/* Display name */}
      <Text style={styles.displayName} numberOfLines={1}>
        {user.displayName}
      </Text>

      {/* Tier pill */}
      {user.riderTier && (
        <TierPill tier={user.riderTier} size="sm" />
      )}

      {/* Mutual follows hint */}
      {user.mutualFollows > 0 && (
        <Text style={styles.mutualText} numberOfLines={1}>
          {user.mutualFollows} mutual
        </Text>
      )}

      {/* Follow button */}
      <FollowButton status="none" onPress={handleFollow} />
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      width: 140,
      borderRadius: radii.xl,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgSecondary,
      padding: space[3],
      alignItems: 'center',
      gap: space[1],
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space[1],
    },
    avatarText: {
      color: colors.textInverse,
      fontSize: 18,
      fontFamily: fontFamily.heading.bold,
    },
    displayName: {
      color: colors.textPrimary,
      fontSize: 14,
      fontFamily: fontFamily.body.semiBold,
      textAlign: 'center',
    },
    mutualText: {
      ...textXs,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
