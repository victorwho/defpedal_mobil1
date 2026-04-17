/**
 * Design System — SuggestedUsersRow Organism
 *
 * Horizontal scroll section showing suggested riders to follow.
 * Includes a "Suggested Riders" title and a dismiss (X) button
 * that hides the section for the current session.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { SuggestedUser } from '@defensivepedal/core';

import { useTheme, type ThemeColors } from '../ThemeContext';
import { SuggestedUserCard } from '../molecules/SuggestedUserCard';
import { FadeSlideIn } from '../atoms/FadeSlideIn';
import { space } from '../tokens/spacing';
import { fontFamily } from '../tokens/typography';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SuggestedUsersRowProps {
  users: readonly SuggestedUser[];
  onFollow: (id: string) => void;
  onUserPress: (userId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SuggestedUsersRow = React.memo(function SuggestedUsersRow({
  users,
  onFollow,
  onUserPress,
}: SuggestedUsersRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = useCallback(() => setDismissed(true), []);

  const renderItem = useCallback(
    ({ item }: { item: SuggestedUser }) => (
      <SuggestedUserCard
        user={item}
        onFollow={onFollow}
        onUserPress={onUserPress}
      />
    ),
    [onFollow, onUserPress],
  );

  const keyExtractor = useCallback((item: SuggestedUser) => item.id, []);

  if (dismissed || users.length === 0) return null;

  return (
    <FadeSlideIn>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Suggested Riders</Text>
          <Pressable
            onPress={handleDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss suggested riders"
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Horizontal scroll */}
        <FlatList
          data={users as SuggestedUser[]}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={ItemSeparator}
        />
      </View>
    </FadeSlideIn>
  );
});

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const ItemSeparator = () => <View style={{ width: space[3] }} />;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      gap: space[3],
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space[4],
    },
    title: {
      color: colors.textPrimary,
      fontSize: 16,
      fontFamily: fontFamily.heading.semiBold,
    },
    listContent: {
      paddingHorizontal: space[4],
    },
  });
