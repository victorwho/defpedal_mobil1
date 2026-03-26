import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '../src/components/Screen';
import { Button } from '../src/design-system/atoms/Button';
import { BottomNav, type TabKey } from '../src/design-system/organisms/BottomNav';
import { brandColors } from '../src/design-system/tokens/colors';
import { fontFamily, textBase } from '../src/design-system/tokens/typography';
import { space } from '../src/design-system/tokens/spacing';

const handleTabPress = (tab: TabKey) => {
  if (tab === 'map') router.replace('/route-planning');
  else if (tab === 'community') router.replace('/community');
  else if (tab === 'profile') router.replace('/profile');
};

export default function HistoryScreen() {
  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Screen title="Ride History" eyebrow="Defensive Pedal" subtitle="Your past rides">
          <View style={styles.section}>
            <Text style={styles.sectionText}>
              View all your completed rides, distances, and routes on a map.
            </Text>
            <Button variant="primary" size="md" onPress={() => router.push('/trips')}>
              View My Trips
            </Button>
          </View>
        </Screen>
      </View>
      <BottomNav activeTab="history" onTabPress={handleTabPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brandColors.bgDeep },
  content: { flex: 1 },
  section: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space[6],
    gap: space[4],
  },
  sectionText: {
    ...textBase,
    color: brandColors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: space[4],
  },
});
