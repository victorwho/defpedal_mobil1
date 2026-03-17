import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '../src/components/BrandLogo';
import { useTheme } from '../src/design-system/ThemeContext';
import { Button } from '../src/design-system/atoms';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import {
  fontFamily,
  text3xl,
  textBase,
  textSm,
  textXs,
} from '../src/design-system/tokens/typography';
import { gray, safetyColors } from '../src/design-system/tokens/colors';

const ONBOARDING_STEPS = [
  {
    eyebrow: 'Defensive Pedal',
    title: 'Ride with safer route choices.',
    subtitle:
      'Compare safe and fast routing without leaving the map, then launch guidance in one tap.',
    accentLabel: 'Safer routes first',
    bullets: ['Compare route modes', 'Keep the map visible', 'Start from live GPS'],
  },
  {
    eyebrow: 'Turn-by-turn',
    title: 'Stay oriented while the phone is locked.',
    subtitle:
      'Navigation keeps progressing from live location updates, with rerouting and on-device recovery.',
    accentLabel: 'Background guidance',
    bullets: ['Follow mode and recenter', 'Reroute from current location', 'Persist live ride state'],
  },
  {
    eyebrow: 'Offline continuity',
    title: 'Keep the ride usable through signal loss.',
    subtitle:
      'Download a route pack ahead of time and queue trip, hazard, and feedback writes for later sync.',
    accentLabel: 'Offline ready',
    bullets: ['Offline route packs', 'Queued writes', 'Reconnect and drain automatically'],
  },
  {
    eyebrow: 'Account sync',
    title: 'Stay anonymous until you want sync.',
    subtitle:
      'Preview and navigation can stay anonymous-first, while signed-in sessions unlock synced trips and reports.',
    accentLabel: 'Anonymous-first',
    bullets: ['Email sign-in', 'Synced hazards and feedback', 'Optional account flow'],
  },
] as const;

export default function OnboardingScreen() {
  const [stepIndex, setStepIndex] = useState(0);
  const step = ONBOARDING_STEPS[stepIndex];
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;
  const { colors } = useTheme();

  const progressLabel = useMemo(
    () => `${stepIndex + 1} / ${ONBOARDING_STEPS.length}`,
    [stepIndex],
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bgDeep }]}>
      <View style={[styles.canvas, { backgroundColor: colors.bgDeep }]}>
        <View style={[styles.glow, styles.glowTop]} />
        <View style={[styles.glow, styles.glowBottom]} />

        <View style={styles.header}>
          <View style={styles.brandRow}>
            <BrandLogo size={58} />
            <View style={styles.headerCopy}>
              <Text style={[styles.progress, { color: colors.accent }]}>{progressLabel}</Text>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Welcome aboard</Text>
            </View>
          </View>
          {!isLastStep ? (
            <Link href="/route-planning" asChild>
              <Button variant="secondary" size="sm">
                Skip
              </Button>
            </Link>
          ) : null}
        </View>

        <View style={[styles.stageCard, { borderColor: colors.borderDefault, ...shadows.xl }]}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>{step.eyebrow}</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{step.title}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{step.subtitle}</Text>

          <View style={styles.showcaseShell}>
            <View style={[styles.mockPhone, { borderColor: `rgba(250, 204, 21, 0.18)` }]}>
              <View style={styles.mockTopBar}>
                <View style={styles.mockPillWide} />
                <View style={styles.mockPillShort} />
              </View>
              <View style={styles.mockMap}>
                <View style={[styles.mockRouteSafe, { borderColor: colors.accent }]} />
                <View style={styles.mockRouteFast} />
                <View style={[styles.mockPuck, { backgroundColor: safetyColors.safe, borderColor: gray[50] }]} />
              </View>
              <View style={styles.mockBottomSheet}>
                <Text style={[styles.mockBadge, { color: colors.accentHover }]}>{step.accentLabel}</Text>
                <View style={styles.mockMetricsRow}>
                  <View style={styles.mockMetricTile} />
                  <View style={styles.mockMetricTile} />
                  <View style={styles.mockMetricTile} />
                </View>
                <View style={[styles.mockButton, { backgroundColor: colors.accent }]} />
              </View>
            </View>
          </View>

          <View style={styles.bulletStack}>
            {step.bullets.map((bullet) => (
              <View key={bullet} style={styles.bulletRow}>
                <View style={[styles.bulletDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.bulletText, { color: colors.textPrimary }]}>{bullet}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.dotRow}>
            {ONBOARDING_STEPS.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  index === stepIndex && [styles.dotActive, { backgroundColor: colors.accent }],
                ]}
              />
            ))}
          </View>

          {isLastStep ? (
            <Link href="/route-planning" asChild>
              <Button variant="primary" size="lg" fullWidth>
                Start planning
              </Button>
            </Link>
          ) : (
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onPress={() => setStepIndex((current) => Math.min(current + 1, ONBOARDING_STEPS.length - 1))}
            >
              Next
            </Button>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  canvas: {
    flex: 1,
    paddingHorizontal: space[5],
    paddingTop: space[4],
    paddingBottom: space[6] + space[1],
    gap: space[4] + space[0.5],
  },
  glow: {
    position: 'absolute',
    borderRadius: radii.full,
    opacity: 0.56,
  },
  glowTop: {
    top: -60,
    right: -10,
    width: 220,
    height: 220,
    backgroundColor: 'rgba(250, 204, 21, 0.16)',
  },
  glowBottom: {
    left: -70,
    bottom: 10,
    width: 210,
    height: 210,
    backgroundColor: 'rgba(37, 99, 235, 0.13)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space[3],
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3] + space[0.5],
  },
  headerCopy: {
    gap: space[0.5],
  },
  progress: {
    ...textXs,
    fontFamily: fontFamily.heading.extraBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headerTitle: {
    ...text3xl,
    fontFamily: fontFamily.heading.extraBold,
  },
  stageCard: {
    flex: 1,
    borderRadius: radii['2xl'] + space[2],
    borderWidth: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    padding: space[5] + space[0.5],
    gap: space[4] + space[0.5],
  },
  eyebrow: {
    ...textXs,
    fontFamily: fontFamily.heading.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  title: {
    ...text3xl,
    fontFamily: fontFamily.heading.extraBold,
    fontSize: 31,
    letterSpacing: -0.9,
    lineHeight: 36,
  },
  subtitle: {
    ...textBase,
    fontSize: 15,
    lineHeight: 22,
  },
  showcaseShell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space[1] + space[0.5],
  },
  mockPhone: {
    width: '100%',
    maxWidth: 320,
    borderRadius: radii['2xl'] + space[1],
    backgroundColor: '#060b16',
    padding: space[3],
    gap: space[2] + space[0.5],
    borderWidth: 1,
  },
  mockTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space[2],
  },
  mockPillWide: {
    height: 14,
    width: '58%',
    borderRadius: radii.full,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  mockPillShort: {
    height: 14,
    width: '22%',
    borderRadius: radii.full,
    backgroundColor: 'rgba(250, 204, 21, 0.24)',
  },
  mockMap: {
    height: 220,
    borderRadius: radii['2xl'] - space[0.5],
    backgroundColor: '#122033',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mockRouteSafe: {
    position: 'absolute',
    width: '72%',
    height: 120,
    borderRadius: 80,
    borderWidth: space[2],
    transform: [{ rotate: '-18deg' }],
  },
  mockRouteFast: {
    position: 'absolute',
    width: '64%',
    height: 96,
    borderRadius: 70,
    borderWidth: 5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    transform: [{ rotate: '12deg' }],
  },
  mockPuck: {
    width: space[5],
    height: space[5],
    borderRadius: space[2] + space[0.5],
    borderWidth: space[1],
  },
  mockBottomSheet: {
    borderRadius: radii['2xl'] - space[0.5],
    backgroundColor: 'rgba(248, 250, 252, 0.96)',
    padding: space[3] + space[0.5],
    gap: space[3],
  },
  mockBadge: {
    alignSelf: 'flex-start',
    ...textXs,
    fontFamily: fontFamily.heading.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mockMetricsRow: {
    flexDirection: 'row',
    gap: space[2],
  },
  mockMetricTile: {
    flex: 1,
    height: 42,
    borderRadius: space[3] + space[0.5],
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
  },
  mockButton: {
    height: 46,
    borderRadius: radii['2xl'] - space[1] - space[0.5],
  },
  bulletStack: {
    gap: space[2] + space[0.5],
  },
  bulletRow: {
    flexDirection: 'row',
    gap: space[2] + space[0.5],
    alignItems: 'center',
  },
  bulletDot: {
    width: space[2] + space[0.5],
    height: space[2] + space[0.5],
    borderRadius: radii.full,
  },
  bulletText: {
    flex: 1,
    ...textSm,
    fontSize: 15,
    lineHeight: 21,
  },
  footer: {
    gap: space[4],
  },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space[2],
  },
  dot: {
    width: space[2] + space[0.5],
    height: space[2] + space[0.5],
    borderRadius: radii.full,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  dotActive: {
    width: space[6] + space[0.5],
  },
});
