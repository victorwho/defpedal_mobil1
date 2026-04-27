import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '../src/components/Screen';
import { useTheme, type ThemeColors } from '../src/design-system';
import { useHaptics } from '../src/design-system/hooks/useHaptics';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { fontFamily, textBase, textSm } from '../src/design-system/tokens/typography';
import { useBlockedUsersQuery, useUnblockUser, type BlockedUser } from '../src/hooks/useBlockUser';
import { useT } from '../src/hooks/useTranslation';

/**
 * Compliance plan item 7. Profile → Account → Blocked users.
 *
 * Lists everyone the current user has blocked. Tapping a row offers an
 * Unblock confirmation; on confirm, the cache invalidates and the row
 * disappears.
 */
export default function BlockedUsersScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const haptics = useHaptics();
  const { data: blocked, isLoading, isError, refetch } = useBlockedUsersQuery();
  const unblockMutation = useUnblockUser();

  const handleBack = useCallback(() => router.back(), []);

  const handleUnblock = useCallback(
    (user: BlockedUser) => {
      Alert.alert(
        t('blockedUsers.unblockConfirmTitle'),
        t('blockedUsers.unblockConfirmMessage', { name: user.displayName }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('blockedUsers.unblock'),
            onPress: () => {
              haptics.light();
              unblockMutation.mutate(user.userId, {
                onError: () =>
                  Alert.alert(t('blockedUsers.errorTitle'), t('blockedUsers.errorMessage')),
              });
            },
          },
        ],
      );
    },
    [haptics, unblockMutation, t],
  );

  const renderRow = useCallback(
    ({ item }: { item: BlockedUser }) => (
      <View style={styles.row}>
        <View style={styles.avatar} importantForAccessibility="no" accessibilityElementsHidden>
          <Text style={styles.avatarText}>
            {item.displayName.slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.displayName}
          </Text>
          <Text style={styles.rowMeta}>
            {t('blockedUsers.blockedAt', { date: new Date(item.blockedAt).toLocaleDateString() })}
          </Text>
        </View>
        <Pressable
          style={styles.unblockButton}
          onPress={() => handleUnblock(item)}
          hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel={t('blockedUsers.unblock')}
        >
          <Text style={styles.unblockButtonText}>{t('blockedUsers.unblock')}</Text>
        </Pressable>
      </View>
    ),
    [styles, t, handleUnblock],
  );

  return (
    <Screen title={t('blockedUsers.title')} headerVariant="back" onBack={handleBack}>
      <View style={styles.body}>
        {isLoading ? (
          <Text style={styles.statusText} accessibilityLiveRegion="polite">
            {t('blockedUsers.loading')}
          </Text>
        ) : isError ? (
          <View style={styles.statusBox} accessibilityLiveRegion="polite">
            <Ionicons
              name="alert-circle-outline"
              size={20}
              color={colors.danger}
              importantForAccessibility="no"
              accessibilityElementsHidden
            />
            <Text style={styles.statusText}>{t('blockedUsers.loadError')}</Text>
            <Pressable
              onPress={() => refetch()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t('common.retry')}
            >
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : !blocked || blocked.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons
              name="happy-outline"
              size={32}
              color={colors.textSecondary}
              importantForAccessibility="no"
              accessibilityElementsHidden
            />
            <Text style={styles.emptyTitle} accessibilityRole="header">
              {t('blockedUsers.emptyTitle')}
            </Text>
            <Text style={styles.emptyMessage}>{t('blockedUsers.emptyMessage')}</Text>
          </View>
        ) : (
          <FlatList
            data={blocked}
            renderItem={renderRow}
            keyExtractor={(item) => item.userId}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </Screen>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    body: {
      flex: 1,
      paddingHorizontal: space[5],
      paddingTop: space[4],
    },
    listContent: {
      paddingBottom: space[8],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      paddingVertical: space[3],
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.bgSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    rowText: {
      flex: 1,
      gap: 2,
    },
    rowName: {
      ...textBase,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    rowMeta: {
      ...textSm,
      color: colors.textSecondary,
    },
    unblockButton: {
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgSecondary,
    },
    unblockButtonText: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    separator: {
      height: 1,
      backgroundColor: colors.borderDefault,
      marginVertical: space[1],
    },
    statusBox: {
      alignItems: 'center',
      gap: space[2],
      paddingVertical: space[6],
    },
    statusText: {
      ...textBase,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    retryText: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.accent,
    },
    emptyBox: {
      alignItems: 'center',
      gap: space[2],
      paddingVertical: space[8],
    },
    emptyTitle: {
      ...textBase,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    emptyMessage: {
      ...textSm,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: space[4],
    },
  });
