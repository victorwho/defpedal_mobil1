import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '../src/components/BrandLogo';
import { mobileTheme } from '../src/lib/theme';

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

  const progressLabel = useMemo(
    () => `${stepIndex + 1} / ${ONBOARDING_STEPS.length}`,
    [stepIndex],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.canvas}>
        <View style={[styles.glow, styles.glowTop]} />
        <View style={[styles.glow, styles.glowBottom]} />

        <View style={styles.header}>
          <View style={styles.brandRow}>
            <BrandLogo size={58} />
            <View style={styles.headerCopy}>
              <Text style={styles.progress}>{progressLabel}</Text>
              <Text style={styles.headerTitle}>Welcome aboard</Text>
            </View>
          </View>
          {!isLastStep ? (
            <Link href="/route-planning" asChild>
              <Pressable style={styles.skipChip}>
                <Text style={styles.skipLabel}>Skip</Text>
              </Pressable>
            </Link>
          ) : null}
        </View>

        <View style={styles.stageCard}>
          <Text style={styles.eyebrow}>{step.eyebrow}</Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.subtitle}>{step.subtitle}</Text>

          <View style={styles.showcaseShell}>
            <View style={styles.mockPhone}>
              <View style={styles.mockTopBar}>
                <View style={styles.mockPillWide} />
                <View style={styles.mockPillShort} />
              </View>
              <View style={styles.mockMap}>
                <View style={styles.mockRouteSafe} />
                <View style={styles.mockRouteFast} />
                <View style={styles.mockPuck} />
              </View>
              <View style={styles.mockBottomSheet}>
                <Text style={styles.mockBadge}>{step.accentLabel}</Text>
                <View style={styles.mockMetricsRow}>
                  <View style={styles.mockMetricTile} />
                  <View style={styles.mockMetricTile} />
                  <View style={styles.mockMetricTile} />
                </View>
                <View style={styles.mockButton} />
              </View>
            </View>
          </View>

          <View style={styles.bulletStack}>
            {step.bullets.map((bullet) => (
              <View key={bullet} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{bullet}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.dotRow}>
            {ONBOARDING_STEPS.map((_, index) => (
              <View
                key={index}
                style={[styles.dot, index === stepIndex ? styles.dotActive : null]}
              />
            ))}
          </View>

          {isLastStep ? (
            <Link href="/route-planning" asChild>
              <Pressable style={styles.primaryButton}>
                <Text style={styles.primaryLabel}>Start planning</Text>
              </Pressable>
            </Link>
          ) : (
            <Pressable
              style={styles.primaryButton}
              onPress={() => setStepIndex((current) => Math.min(current + 1, ONBOARDING_STEPS.length - 1))}
            >
              <Text style={styles.primaryLabel}>Next</Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileTheme.colors.background,
  },
  canvas: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 18,
    backgroundColor: mobileTheme.colors.background,
  },
  glow: {
    position: 'absolute',
    borderRadius: 999,
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
    gap: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerCopy: {
    gap: 2,
  },
  progress: {
    color: mobileTheme.colors.brand,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 24,
    fontWeight: '900',
  },
  skipChip: {
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  skipLabel: {
    color: mobileTheme.colors.textOnDark,
    fontWeight: '800',
  },
  stageCard: {
    flex: 1,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    padding: 22,
    gap: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.34,
    shadowRadius: 26,
    shadowOffset: {
      width: 0,
      height: 16,
    },
    elevation: 10,
  },
  eyebrow: {
    color: mobileTheme.colors.brand,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  title: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -0.9,
    lineHeight: 36,
  },
  subtitle: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  showcaseShell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  mockPhone: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 28,
    backgroundColor: '#060b16',
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(250, 204, 21, 0.18)',
  },
  mockTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  mockPillWide: {
    height: 14,
    width: '58%',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  mockPillShort: {
    height: 14,
    width: '22%',
    borderRadius: 999,
    backgroundColor: 'rgba(250, 204, 21, 0.24)',
  },
  mockMap: {
    height: 220,
    borderRadius: 22,
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
    borderWidth: 8,
    borderColor: '#facc15',
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
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#22c55e',
    borderWidth: 4,
    borderColor: '#f8fafc',
  },
  mockBottomSheet: {
    borderRadius: 22,
    backgroundColor: 'rgba(248, 250, 252, 0.96)',
    padding: 14,
    gap: 12,
  },
  mockBadge: {
    alignSelf: 'flex-start',
    color: mobileTheme.colors.brandStrong,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mockMetricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  mockMetricTile: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
  },
  mockButton: {
    height: 46,
    borderRadius: 18,
    backgroundColor: mobileTheme.colors.brand,
  },
  bulletStack: {
    gap: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  bulletDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: mobileTheme.colors.brand,
  },
  bulletText: {
    flex: 1,
    color: mobileTheme.colors.textOnDark,
    fontSize: 15,
    lineHeight: 21,
  },
  footer: {
    gap: 16,
  },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  dotActive: {
    width: 26,
    backgroundColor: mobileTheme.colors.brand,
  },
  primaryButton: {
    borderRadius: 24,
    backgroundColor: mobileTheme.colors.brand,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryLabel: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '900',
  },
});
