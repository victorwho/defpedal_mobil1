import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '../src/components/Screen';
import { BottomNav } from '../src/design-system/organisms/BottomNav';
import { CommunityStatsCard } from '../src/design-system/organisms/CommunityStatsCard';
import { Button } from '../src/design-system/atoms/Button';
import { brandColors } from '../src/design-system/tokens/colors';
import { fontFamily, textBase } from '../src/design-system/tokens/typography';
import { space } from '../src/design-system/tokens/spacing';
import { useCommunityStats } from '../src/hooks/useCommunityStats';
import { handleTabPress } from '../src/lib/navigation-helpers';

export default function CommunityScreen() {
  const { stats, isLoading, error } = useCommunityStats();

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Screen title="Community" eyebrow="Defensive Pedal" subtitle="Connect with fellow cyclists">
          <CommunityStatsCard stats={stats} isLoading={isLoading} error={error} />
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Cyclist Community Feed</Text>
            <Text style={styles.placeholderSub}>
              See rides shared by cyclists in your area, give likes, and leave comments.
            </Text>
            <Button
              variant="primary"
              size="lg"
              onPress={() => router.push('/community-feed')}
            >
              View Community Feed
            </Button>
          </View>
        </Screen>
      </View>
      <BottomNav activeTab="community" onTabPress={handleTabPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brandColors.bgDeep },
  content: { flex: 1 },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space[10],
    gap: space[4],
  },
  placeholderText: {
    ...textBase,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.textPrimary,
    fontSize: 18,
  },
  placeholderSub: {
    ...textBase,
    color: brandColors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: space[6],
  },
});
