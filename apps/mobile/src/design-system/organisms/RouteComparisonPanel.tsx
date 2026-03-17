/**
 * Design System v1.0 — RouteComparisonPanel Organism
 *
 * Sits inside BottomSheet at half snap.
 * Sort tabs (Safest / Fastest / Shortest) + vertical RouteCard list.
 * Consumes RouteOption[] from the core package.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RouteOption } from '@defensivepedal/core';

import { useTheme } from '../ThemeContext';
import { RouteCard, type RiskBarSegment } from '../molecules/RouteCard';
import { Spinner } from '../atoms/Spinner';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { fontFamily, textBase, textSm } from '../tokens/typography';
import { riskScoreToLevel } from '../tokens/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortMode = 'safest' | 'fastest' | 'shortest';

export interface RouteComparisonPanelProps {
  routes: RouteOption[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sortRoutes = (routes: RouteOption[], mode: SortMode): RouteOption[] => {
  const copy = [...routes];
  switch (mode) {
    case 'safest':
      return copy.sort((a, b) => {
        const avgA = avgRisk(a);
        const avgB = avgRisk(b);
        return avgA - avgB;
      });
    case 'fastest':
      return copy.sort(
        (a, b) => a.adjustedDurationSeconds - b.adjustedDurationSeconds,
      );
    case 'shortest':
      return copy.sort((a, b) => a.distanceMeters - b.distanceMeters);
  }
};

const avgRisk = (route: RouteOption): number => {
  if (route.riskSegments.length === 0) return 5;
  return (
    route.riskSegments.reduce((sum, s) => sum + s.riskScore, 0) /
    route.riskSegments.length
  );
};

const formatDist = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;

const formatDur = (s: number) => {
  const min = Math.round(s / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}m`;
};

const formatClimb = (m: number | null) =>
  m !== null ? `${Math.round(m)} m` : null;

const buildRiskBar = (route: RouteOption): RiskBarSegment[] => {
  if (route.riskSegments.length === 0) return [];
  return route.riskSegments.map((seg) => ({
    weight: 1,
    level: riskScoreToLevel(seg.riskScore),
  }));
};

const bestRouteId = (routes: RouteOption[]): string | null => {
  if (routes.length === 0) return null;
  // "Best" = lowest average risk
  return [...routes].sort((a, b) => avgRisk(a) - avgRisk(b))[0].id;
};

// ---------------------------------------------------------------------------
// Sort Tabs
// ---------------------------------------------------------------------------

const SORT_MODES: { key: SortMode; label: string }[] = [
  { key: 'safest', label: 'Safest' },
  { key: 'fastest', label: 'Fastest' },
  { key: 'shortest', label: 'Shortest' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const RouteComparisonPanel: React.FC<RouteComparisonPanelProps> = ({
  routes,
  selectedRouteId,
  onSelectRoute,
  loading = false,
}) => {
  const { colors } = useTheme();
  const [sortMode, setSortMode] = useState<SortMode>('safest');

  const sorted = sortRoutes(routes, sortMode);
  const recommended = bestRouteId(routes);

  return (
    <View style={styles.root}>
      {/* Sort tabs */}
      <View style={styles.tabRow}>
        {SORT_MODES.map((m) => {
          const active = m.key === sortMode;
          return (
            <Pressable
              key={m.key}
              style={[
                styles.tab,
                {
                  backgroundColor: active ? colors.accent : colors.bgSecondary,
                },
              ]}
              onPress={() => setSortMode(m.key)}
              accessibilityRole="tab"
              accessibilityLabel={`Sort by ${m.label}`}
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: active ? colors.textInverse : colors.textSecondary,
                    fontFamily: active
                      ? fontFamily.body.bold
                      : fontFamily.body.medium,
                  },
                ]}
              >
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <Spinner size={32} />
          <Text style={[textSm, { color: colors.textSecondary }]}>
            Calculating routes…
          </Text>
        </View>
      ) : sorted.length === 0 ? (
        <View style={styles.loadingWrap}>
          <Text style={[textBase, { color: colors.textSecondary }]}>
            No routes found
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {sorted.map((route) => (
            <RouteCard
              key={route.id}
              name={routeDisplayName(route)}
              distance={formatDist(route.distanceMeters)}
              eta={formatDur(route.adjustedDurationSeconds)}
              climb={formatClimb(route.totalClimbMeters)}
              riskScore={avgRisk(route)}
              riskSegments={buildRiskBar(route)}
              recommended={route.id === recommended}
              selected={route.id === selectedRouteId}
              onPress={() => onSelectRoute(route.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Route name heuristic
// ---------------------------------------------------------------------------

const routeDisplayName = (route: RouteOption): string => {
  // Use the longest-duration step's street name as the "via" name
  if (route.steps.length === 0) return 'Route';
  const mainStep = route.steps.reduce((best, s) =>
    s.durationSeconds > best.durationSeconds ? s : best,
  );
  return mainStep.streetName?.trim()
    ? `Via ${mainStep.streetName}`
    : `Route (${route.source})`;
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    gap: space[3],
  },
  tabRow: {
    flexDirection: 'row',
    gap: space[2],
  },
  tab: {
    flex: 1,
    height: 44,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 14,
  },
  list: {
    gap: space[3],
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space[10],
    gap: space[3],
  },
});
