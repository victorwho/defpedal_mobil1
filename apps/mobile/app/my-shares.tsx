/**
 * My Shares — Slice 8b
 *
 * Lists all of the caller's route shares with per-row view/signup counts
 * and copy/revoke actions. Revoke is optimistic with rollback on failure.
 * Empty state nudges back to the route planner.
 *
 * Also the deep-link target for slice-8a first-view pushes
 * (`data.deepLink = '/my-shares'`).
 */
import { buildShareDeepLinks, PLAY_STORE_URL } from '@defensivepedal/core';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';

import { ScreenHeader } from '../src/design-system/atoms/ScreenHeader';
import { FadeSlideIn } from '../src/design-system/atoms/FadeSlideIn';
import { AmbassadorImpactCard } from '../src/design-system/organisms';
import { useTheme, type ThemeColors } from '../src/design-system';
import { radii } from '../src/design-system/tokens/radii';
import { space } from '../src/design-system/tokens/spacing';
import { stagger } from '../src/design-system/tokens/motion';
import {
  fontFamily,
  textSm,
  textXs,
  textBase,
  textDataMd,
} from '../src/design-system/tokens/typography';
import { useMyShares } from '../src/hooks/useMyShares';
import { useT } from '../src/hooks/useTranslation';
import type { MyShareRowClient, RevokeRouteShareResult } from '../src/lib/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatDate = (iso: string): string => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
};

const daysUntilExpiry = (expiresAt: string | null): number | null => {
  if (!expiresAt) return null;
  try {
    const ms = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function MySharesScreen() {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const router = useRouter();

  const { query, revoke } = useMyShares();
  const data = query.data;
  const shares = data?.shares ?? [];

  const handleCopyLink = async (row: MyShareRowClient) => {
    try {
      const { webUrl } = buildShareDeepLinks(row.shortCode);
      await Clipboard.setStringAsync(webUrl);
      Alert.alert(t('myShares.linkCopiedTitle'), t('myShares.linkCopiedBody'));
    } catch {
      Alert.alert(t('myShares.copyFailedTitle'), t('myShares.copyFailedBody'));
    }
  };

  const handleShare = async (row: MyShareRowClient) => {
    try {
      const { webUrl } = buildShareDeepLinks(row.shortCode);
      // Append the Play Store install URL so recipients without the app have
      // a one-tap install path. The route share webUrl is preserved as the
      // primary CTA for users who already have the app — Android renders
      // both URLs as tappable links in any sharing surface.
      const message = `${webUrl}\nGet Defensive Pedal: ${PLAY_STORE_URL}`;
      await Share.share({ message, url: webUrl });
    } catch {
      // user dismissed — swallow silently
    }
  };

  const handleRevoke = (row: MyShareRowClient) => {
    Alert.alert(
      t('myShares.revokeConfirmTitle'),
      t('myShares.revokeConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('myShares.revoke'),
          style: 'destructive',
          onPress: () => {
            revoke.mutate(
              { id: row.id },
              {
                onSettled: (result: RevokeRouteShareResult | undefined) => {
                  if (
                    result?.status === 'network_error' ||
                    result?.status === 'auth_required'
                  ) {
                    Alert.alert(
                      t('myShares.revokeFailedTitle'),
                      result.status === 'auth_required'
                        ? t('myShares.revokeAuthRequired')
                        : t('myShares.revokeNetworkError'),
                    );
                  }
                },
              },
            );
          },
        },
      ],
    );
  };

  const renderRow = ({ item, index }: { item: MyShareRowClient; index: number }) => {
    const isRevoked = item.revokedAt !== null;
    const days = daysUntilExpiry(item.expiresAt);
    const expiryLine = isRevoked
      ? t('myShares.revokedOn', { date: formatDate(item.revokedAt!) })
      : days === null
        ? t('myShares.noExpiry')
        : days === 0
          ? t('myShares.expiresToday')
          : days === 1
            ? t('myShares.expiresTomorrow')
            : t('myShares.expiresInDays', { days });

    return (
      <FadeSlideIn
        delay={Math.min(index, stagger.maxItems) * stagger.step}
        style={[styles.row, isRevoked && styles.rowRevoked]}
      >
        <View style={styles.rowHeader}>
          <Text style={styles.rowCode}>{item.shortCode}</Text>
          {isRevoked ? (
            <View style={styles.revokedPill}>
              <Text style={styles.revokedPillText}>{t('myShares.revokedPill')}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.rowMeta}>
          {formatDate(item.createdAt)} · {expiryLine}
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{item.viewCount}</Text>
            <Text style={styles.statLabel}>{t('myShares.opens')}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{item.signupCount}</Text>
            <Text style={styles.statLabel}>{t('myShares.signups')}</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('myShares.copyLinkA11y')}
            onPress={() => handleCopyLink(item)}
            style={({ pressed }) => [
              styles.actionBtn,
              pressed && styles.actionBtnPressed,
            ]}
          >
            <Text style={styles.actionBtnText}>{t('myShares.copyLink')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('myShares.shareAgain')}
            onPress={() => handleShare(item)}
            style={({ pressed }) => [
              styles.actionBtn,
              pressed && styles.actionBtnPressed,
            ]}
          >
            <Text style={styles.actionBtnText}>{t('myShares.shareAgain')}</Text>
          </Pressable>
          {isRevoked ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('myShares.revokeA11y')}
              onPress={() => handleRevoke(item)}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnDanger,
                pressed && styles.actionBtnPressed,
              ]}
            >
              <Text style={[styles.actionBtnText, styles.actionBtnTextDanger]}>
                {t('myShares.revoke')}
              </Text>
            </Pressable>
          )}
        </View>
      </FadeSlideIn>
    );
  };

  // Don't wrap in the shared `Screen` component — its ScrollView nests
  // our FlatList and triggers the "VirtualizedLists should never be
  // nested inside plain ScrollViews" warning. Composing the header atom
  // + FlatList directly makes the FlatList the only scroller.
  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.bgDeep }]}
    >
      <ScreenHeader variant="back" title={t('myShares.title')} />

      {query.isLoading && !data ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : query.isError && !data ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{t('myShares.loadError')}</Text>
        </View>
      ) : (
        <FlatList
          data={shares}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching && !query.isLoading}
              onRefresh={() => query.refetch()}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={
            data?.ambassadorStats ? (
              <View style={styles.headerWrap}>
                <AmbassadorImpactCard
                  stats={data.ambassadorStats}
                  isLoading={false}
                  hideWhenEmpty={false}
                />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>{t('myShares.emptyTitle')}</Text>
              <Text style={styles.emptySubtitle}>
                {t('myShares.emptySubtitle')}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/route-planning')}
                style={({ pressed }) => [
                  styles.emptyCta,
                  pressed && styles.actionBtnPressed,
                ]}
              >
                <Text style={styles.emptyCtaText}>{t('myShares.emptyCta')}</Text>
              </Pressable>
            </View>
          }
          contentContainerStyle={[
            styles.listContent,
            shares.length === 0 && styles.listContentEmpty,
          ]}
          ItemSeparatorComponent={() => <View style={{ height: space[3] }} />}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
    },
    listContent: {
      padding: space[4],
      gap: space[3],
      paddingBottom: space[8],
    },
    listContentEmpty: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    headerWrap: {
      marginBottom: space[3],
    },
    centerBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: space[4],
    },
    emptyBox: {
      alignItems: 'center',
      padding: space[6],
      gap: space[3],
    },
    emptyTitle: {
      ...textBase,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
    },
    emptySubtitle: {
      ...textSm,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    emptyCta: {
      backgroundColor: colors.accent,
      paddingVertical: space[2],
      paddingHorizontal: space[4],
      borderRadius: radii.full,
      marginTop: space[2],
    },
    emptyCtaText: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.bgPrimary,
    },
    row: {
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      padding: space[4],
      gap: space[2],
    },
    rowRevoked: {
      opacity: 0.6,
    },
    rowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowCode: {
      ...textBase,
      fontFamily: fontFamily.mono.bold,
      color: colors.textPrimary,
      letterSpacing: 0.5,
    },
    rowMeta: {
      ...textXs,
      color: colors.textSecondary,
    },
    revokedPill: {
      backgroundColor: colors.danger,
      paddingVertical: 2,
      paddingHorizontal: space[2],
      borderRadius: radii.full,
    },
    revokedPillText: {
      ...textXs,
      fontFamily: fontFamily.body.bold,
      color: colors.bgPrimary,
    },
    statsRow: {
      flexDirection: 'row',
      gap: space[4],
      paddingTop: space[2],
    },
    stat: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: space[1],
    },
    statValue: {
      ...textDataMd,
      fontFamily: fontFamily.mono.bold,
      color: colors.textPrimary,
    },
    statLabel: {
      ...textXs,
      color: colors.textSecondary,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: space[2],
      paddingTop: space[2],
      flexWrap: 'wrap',
    },
    actionBtn: {
      backgroundColor: colors.bgSecondary,
      paddingVertical: space[2],
      paddingHorizontal: space[3],
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.borderDefault,
    },
    actionBtnPressed: {
      opacity: 0.7,
    },
    actionBtnDanger: {
      borderColor: colors.danger,
    },
    actionBtnText: {
      ...textXs,
      fontFamily: fontFamily.body.medium,
      color: colors.textPrimary,
    },
    actionBtnTextDanger: {
      color: colors.danger,
    },
    errorText: {
      ...textSm,
      color: colors.danger,
      textAlign: 'center',
    },
  });
