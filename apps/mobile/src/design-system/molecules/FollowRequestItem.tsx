/**
 * Design System — FollowRequestItem Molecule
 *
 * Shows a pending follow request with avatar, display name, tier pill,
 * and Accept / Decline action buttons.
 */
import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { FollowRequest } from '@defensivepedal/core';

import { useTheme, type ThemeColors } from '../ThemeContext';
import { TierPill } from '../atoms/TierPill';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textXs } from '../tokens/typography';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FollowRequestItemProps {
  request: FollowRequest;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  /**
   * Optional context subtitle. Renders under the timestamp as a muted
   * one-liner explaining why the request was made. Used by slice-4 route-
   * share claims to surface "Signed up via your shared route"; callers that
   * don't have a context signal should omit the prop entirely.
   */
  context?: string;
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

const formatRelativeTime = (isoDate: string): string => {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const FollowRequestItem = React.memo(function FollowRequestItem({
  request,
  onApprove,
  onDecline,
  context,
}: FollowRequestItemProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const initials = useMemo(
    () => getInitials(request.user.displayName),
    [request.user.displayName],
  );

  const handleApprove = useCallback(() => onApprove(request.id), [request.id, onApprove]);
  const handleDecline = useCallback(() => onDecline(request.id), [request.id, onDecline]);

  return (
    <View style={styles.container}>
      {/* Left: Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>

      {/* Center: Name + timestamp */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.displayName} numberOfLines={1}>
            {request.user.displayName}
          </Text>
          {request.user.riderTier && (
            <TierPill tier={request.user.riderTier} size="sm" />
          )}
        </View>
        <Text style={styles.timestamp}>{formatRelativeTime(request.requestedAt)}</Text>
        {context ? (
          <Text style={styles.context} numberOfLines={2}>
            {context}
          </Text>
        ) : null}
      </View>

      {/* Right: Action buttons */}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [
            styles.acceptButton,
            pressed && styles.acceptButtonPressed,
          ]}
          onPress={handleApprove}
          accessibilityRole="button"
          accessibilityLabel={`Accept follow request from ${request.user.displayName}`}
        >
          <Text style={styles.acceptLabel}>Accept</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.declineButton,
            pressed && styles.declineButtonPressed,
          ]}
          onPress={handleDecline}
          accessibilityRole="button"
          accessibilityLabel={`Decline follow request from ${request.user.displayName}`}
        >
          <Text style={styles.declineLabel}>Decline</Text>
        </Pressable>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      paddingVertical: space[2],
      paddingHorizontal: space[4],
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: colors.textInverse,
      fontSize: 15,
      fontFamily: fontFamily.heading.bold,
    },
    info: {
      flex: 1,
      gap: 1,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[1],
    },
    displayName: {
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: fontFamily.body.semiBold,
      flexShrink: 1,
    },
    timestamp: {
      ...textXs,
      color: colors.textSecondary,
    },
    context: {
      ...textXs,
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginTop: 2,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    acceptButton: {
      height: 32,
      paddingHorizontal: space[3],
      borderRadius: radii.full,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      borderCurve: 'continuous',
    },
    acceptButtonPressed: {
      backgroundColor: colors.accentHover,
      transform: [{ scale: 0.97 }],
    },
    acceptLabel: {
      fontFamily: fontFamily.body.semiBold,
      fontSize: 13,
      color: colors.textInverse,
    },
    declineButton: {
      height: 32,
      paddingHorizontal: space[3],
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      borderCurve: 'continuous',
    },
    declineButtonPressed: {
      backgroundColor: colors.bgTertiary,
      transform: [{ scale: 0.97 }],
    },
    declineLabel: {
      fontFamily: fontFamily.body.semiBold,
      fontSize: 13,
      color: colors.textSecondary,
    },
  });
