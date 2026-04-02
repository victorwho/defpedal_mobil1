import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { formatCo2Saved, calculateEquivalentTreeDays } from '@defensivepedal/core';

import { Screen } from '../src/components/Screen';
import { StatsDashboard } from '../src/components/StatsDashboard';
import { Button } from '../src/design-system/atoms/Button';
import { BottomNav } from '../src/design-system/organisms/BottomNav';
import { brandColors, safetyColors } from '../src/design-system/tokens/colors';
import { fontFamily, textBase, textSm, textXs } from '../src/design-system/tokens/typography';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { mobileApi } from '../src/lib/api';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { handleTabPress } from '../src/lib/navigation-helpers';

export default function HistoryScreen() {
  const { user } = useAuthSession();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['user-stats'],
    queryFn: () => mobileApi.getUserStats(),
    enabled: Boolean(user),
    staleTime: 120_000,
  });

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Screen title="Ride History" eyebrow="Defensive Pedal" subtitle="Your past rides">
          {user ? (
            <View style={styles.impactCard}>
              <View style={styles.impactHeader}>
                <Ionicons name="leaf-outline" size={20} color={safetyColors.safe} />
                <Text style={styles.impactTitle}>Your Impact</Text>
              </View>
              {statsLoading ? (
                <ActivityIndicator size="small" color={safetyColors.safe} />
              ) : stats ? (
                <View style={styles.impactRow}>
                  <View style={styles.impactStat}>
                    <Text style={styles.impactValue}>{stats.totalTrips}</Text>
                    <Text style={styles.impactLabel}>Trips</Text>
                  </View>
                  <View style={styles.impactStat}>
                    <Text style={styles.impactValue}>
                      {(stats.totalDistanceMeters / 1000).toFixed(0)} km
                    </Text>
                    <Text style={styles.impactLabel}>Cycled</Text>
                  </View>
                  <View style={styles.impactStat}>
                    <Text style={[styles.impactValue, { color: safetyColors.safe }]}>
                      {formatCo2Saved(stats.totalCo2SavedKg)}
                    </Text>
                    <Text style={styles.impactLabel}>CO2 Saved</Text>
                  </View>
                </View>
              ) : null}
              {stats && stats.totalCo2SavedKg > 0 ? (
                <Text style={styles.impactTreeNote}>
                  Equivalent to {calculateEquivalentTreeDays(stats.totalCo2SavedKg)} days of a tree absorbing CO2
                </Text>
              ) : null}
            </View>
          ) : null}

          {user ? (
            <Button
              variant="secondary"
              size="md"
              leftIcon={<Ionicons name="bar-chart-outline" size={18} color={brandColors.accent} />}
              onPress={() => router.push('/impact-dashboard')}
            >
              Full Impact Dashboard
            </Button>
          ) : null}

          {user ? <StatsDashboard /> : null}

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
  impactCard: {
    padding: space[4],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.2)',
    backgroundColor: 'rgba(74, 222, 128, 0.05)',
    gap: space[3],
  },
  impactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  impactTitle: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    color: safetyColors.safe,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  impactRow: {
    flexDirection: 'row',
    gap: space[3],
  },
  impactStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  impactValue: {
    ...textBase,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.textPrimary,
    fontSize: 18,
  },
  impactLabel: {
    ...textXs,
    color: brandColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  impactTreeNote: {
    ...textXs,
    color: brandColors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
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
