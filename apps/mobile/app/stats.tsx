import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '../src/components/Screen';
import { StatsDashboard } from '../src/components/StatsDashboard';
import { BottomNav } from '../src/design-system/organisms/BottomNav';
import { useTheme, type ThemeColors } from '../src/design-system';
import { space } from '../src/design-system/tokens/spacing';
import { handleTabPress } from '../src/lib/navigation-helpers';

export default function StatsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Screen
          title="Statistics"
          eyebrow="Defensive Pedal"
          subtitle="Your riding insights"
          aside={
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
            </Pressable>
          }
        >
          <StatsDashboard />
        </Screen>
      </View>
      <BottomNav activeTab="history" onTabPress={handleTabPress} />
    </View>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgDeep },
    content: { flex: 1 },
    backButton: {
      padding: space[2],
    },
  });
