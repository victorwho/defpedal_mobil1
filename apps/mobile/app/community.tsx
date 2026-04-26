import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '../src/components/Screen';
import { BottomNav } from '../src/design-system/organisms/BottomNav';
import { CommunityStatsCard } from '../src/design-system/organisms/CommunityStatsCard';
import { Button } from '../src/design-system/atoms/Button';
import { Surface } from '../src/design-system/atoms/Card';
import { useTheme, type ThemeColors } from '../src/design-system';
import { fontFamily, textBase, textSm, textXs } from '../src/design-system/tokens/typography';
import { space } from '../src/design-system/tokens/spacing';
import { useCommunityStats } from '../src/hooks/useCommunityStats';
import { handleTabPress } from '../src/lib/navigation-helpers';
import { useT } from '../src/hooks/useTranslation';

export default function CommunityScreen() {
  const t = useT();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const { stats, isLoading, error } = useCommunityStats();

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Screen title={t('communityScreen.title')} subtitle={t('communityScreen.subtitle')}>
          <CommunityStatsCard stats={stats} isLoading={isLoading} error={error} />

          {/* City Heartbeat card */}
          <Surface
            variant="accent"
            onPress={() => router.push('/city-heartbeat')}
            accessibilityLabel="Open City Heartbeat dashboard"
            style={styles.heartbeatCard}
          >
            <View style={styles.heartbeatIcon}>
              <Ionicons name="pulse" size={22} color={colors.accent} />
            </View>
            <View style={styles.heartbeatText}>
              <Text style={styles.heartbeatTitle}>City Heartbeat</Text>
              <Text style={styles.heartbeatSub}>
                Live activity, trends, hazards & top riders
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Surface>

          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>{t('communityScreen.feedTitle')}</Text>
            <Text style={styles.placeholderSub}>
              {t('communityScreen.feedSub')}
            </Text>
            <Button
              variant="primary"
              size="lg"
              onPress={() => router.push('/community-feed')}
            >
              {t('communityScreen.viewFeed')}
            </Button>
          </View>
        </Screen>
      </View>
      <BottomNav activeTab="community" onTabPress={handleTabPress} />
    </View>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgDeep },
    content: { flex: 1 },
    heartbeatCard: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    heartbeatIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.bgSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heartbeatText: {
      flex: 1,
      gap: 2,
    },
    heartbeatTitle: {
      ...textSm,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
    },
    heartbeatSub: {
      ...textXs,
      color: colors.textSecondary,
    },
    placeholder: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: space[10],
      gap: space[4],
    },
    placeholderText: {
      ...textBase,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
      fontSize: 18,
    },
    placeholderSub: {
      ...textBase,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: space[6],
    },
  });
