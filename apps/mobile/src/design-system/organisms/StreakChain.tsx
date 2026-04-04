/**
 * Design System v1.0 — StreakChain Organism
 *
 * Horizontal ScrollView of circular chain links representing daily streak.
 * Golden for active days, gray for missed, ice-blue for freeze-used.
 * Today pulses if not yet qualified. Milestone links are larger with shield.
 * Connector lines between circles.
 */
import type { StreakState } from '@defensivepedal/core';
import { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';

import Ionicons from '@expo/vector-icons/Ionicons';

import { brandColors, darkTheme, gray } from '../tokens/colors';
import { fontFamily } from '../tokens/typography';
import { space } from '../tokens/spacing';
import { useReducedMotion } from '../hooks/useReducedMotion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChainLinkStatus = 'active' | 'missed' | 'freeze' | 'today';

export interface DailyHistoryEntry {
  readonly date: string;
  readonly qualified: boolean;
  readonly froze: boolean;
}

export interface StreakChainProps {
  streakState: StreakState;
  dailyHistory?: readonly DailyHistoryEntry[];
  maxVisible?: number;
  scrollable?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LINK_SIZE = 32;
const MILESTONE_SIZE = 40;
const CONNECTOR_WIDTH = 12;
const MILESTONE_DAYS = new Set([7, 14, 30, 60, 100]);

const STATUS_COLORS: Record<ChainLinkStatus, string> = {
  active: brandColors.accent,
  today: 'transparent',
  missed: gray[700],
  freeze: '#93C5FD',
};

const STATUS_CONTENT: Record<ChainLinkStatus, string> = {
  active: 'check',
  today: '',
  missed: '-',
  freeze: 'F',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const buildLinksFromHistory = (
  history: readonly DailyHistoryEntry[],
  maxVisible: number,
): ReadonlyArray<{ status: ChainLinkStatus; dayIndex: number }> => {
  const recent = history.slice(-maxVisible);
  return recent.map((entry, i) => {
    const isLast = i === recent.length - 1;
    let status: ChainLinkStatus;

    if (isLast && !entry.qualified && !entry.froze) {
      status = 'today';
    } else if (entry.froze) {
      status = 'freeze';
    } else if (entry.qualified) {
      status = 'active';
    } else {
      status = 'missed';
    }

    return { status, dayIndex: i + 1 };
  });
};

const buildLinksFromStreak = (
  streakState: StreakState,
  maxVisible: number,
): ReadonlyArray<{ status: ChainLinkStatus; dayIndex: number }> => {
  const links: Array<{ status: ChainLinkStatus; dayIndex: number }> = [];

  for (let i = 0; i < maxVisible; i++) {
    const dayIndex = i + 1;
    const isWithinStreak = i < streakState.currentStreak;
    const isLeadingEdge =
      isWithinStreak && i === streakState.currentStreak - 1;

    let status: ChainLinkStatus;
    if (isLeadingEdge) {
      status = 'today';
    } else if (isWithinStreak) {
      status = 'active';
    } else {
      status = 'missed';
    }

    links.push({ status, dayIndex });
  }

  return links;
};

// ---------------------------------------------------------------------------
// Today pulsing border
// ---------------------------------------------------------------------------

const TodayPulse = ({ reducedMotion }: { reducedMotion: boolean }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reducedMotion) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [pulseAnim, reducedMotion]);

  return (
    <Animated.View
      style={[
        styles.todayBorder,
        { opacity: pulseAnim },
      ]}
    />
  );
};

// ---------------------------------------------------------------------------
// Single link
// ---------------------------------------------------------------------------

const ChainLinkItem = ({
  status,
  dayIndex,
  index,
  reducedMotion,
}: {
  status: ChainLinkStatus;
  dayIndex: number;
  index: number;
  reducedMotion: boolean;
}) => {
  const fadeAnim = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(reducedMotion ? 0 : 8)).current;

  useEffect(() => {
    if (reducedMotion) return;

    const delay = index * 40;

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim, index, reducedMotion]);

  const isMilestone = MILESTONE_DAYS.has(dayIndex);
  const size = isMilestone ? MILESTONE_SIZE : LINK_SIZE;
  const color = STATUS_COLORS[status];
  const content = STATUS_CONTENT[status];

  return (
    <Animated.View
      style={[
        styles.link,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: status === 'today' ? darkTheme.bgSecondary : color,
          opacity: status === 'missed'
            ? Animated.multiply(fadeAnim, new Animated.Value(0.5))
            : fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {status === 'today' ? <TodayPulse reducedMotion={reducedMotion} /> : null}

      {isMilestone ? (
        <>
          <Ionicons name="shield" size={14} color={gray[900]} />
          <Text style={styles.milestoneLabel}>{dayIndex}</Text>
        </>
      ) : content === 'check' ? (
        <Ionicons name="checkmark" size={16} color={gray[900]} />
      ) : content ? (
        <Text style={styles.linkContent}>{content}</Text>
      ) : null}
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Connector line
// ---------------------------------------------------------------------------

const Connector = ({ leftStatus }: { leftStatus: ChainLinkStatus }) => (
  <View
    style={[
      styles.connector,
      {
        backgroundColor:
          leftStatus === 'active' ? brandColors.accent
          : leftStatus === 'freeze' ? '#93C5FD'
          : gray[700],
        opacity: leftStatus === 'missed' ? 0.3 : 0.6,
      },
    ]}
  />
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const StreakChain = ({
  streakState,
  dailyHistory,
  maxVisible = 14,
  scrollable = true,
}: StreakChainProps) => {
  const reducedMotion = useReducedMotion();

  const links = dailyHistory
    ? buildLinksFromHistory(dailyHistory, maxVisible)
    : buildLinksFromStreak(streakState, maxVisible);

  const content = (
    <View style={styles.chainRow}>
      {links.map((link, index) => (
        <View key={link.dayIndex} style={styles.linkWithConnector}>
          {index > 0 ? <Connector leftStatus={links[index - 1].status} /> : null}
          <ChainLinkItem
            status={link.status}
            dayIndex={link.dayIndex}
            index={index}
            reducedMotion={reducedMotion}
          />
        </View>
      ))}
    </View>
  );

  if (!scrollable) return content;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {content}
    </ScrollView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space[1],
    paddingVertical: space[1],
  },
  chainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkWithConnector: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  link: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkContent: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 12,
    lineHeight: 14,
    color: gray[900],
  },
  todayBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: LINK_SIZE / 2,
    borderWidth: 2,
    borderColor: brandColors.accent,
  },
  connector: {
    width: CONNECTOR_WIDTH,
    height: 3,
    borderRadius: 1.5,
  },
  milestoneLabel: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 9,
    lineHeight: 11,
    color: gray[900],
    marginTop: 1,
  },
});
