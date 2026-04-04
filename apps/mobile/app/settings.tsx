import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '../src/components/Screen';
import { useTheme } from '../src/design-system';
import { Badge } from '../src/design-system/atoms';
import { MenuItem } from '../src/design-system/molecules';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { textLg, textSm, textBase, fontFamily } from '../src/design-system/tokens/typography';
import { mobileEnv } from '../src/lib/env';
import { useAuthSessionOptional } from '../src/providers/AuthSessionProvider';

export default function SettingsScreen() {
  const authCtx = useAuthSessionOptional();
  const user = authCtx?.user ?? null;
  const isConfigured = authCtx?.isConfigured ?? false;
  const session = authCtx?.session ?? null;
  const isDeveloperBypassAvailable = authCtx?.isDeveloperBypassAvailable ?? false;
  const { colors } = useTheme();

  return (
    <Screen
      title="Menu"
      eyebrow="Control room"
      subtitle="The native menu now mirrors the web app more closely: account first, then ride tools, diagnostics, and environment status."
    >
      {/* ── Account status card ── */}
      <View
        style={[
          styles.statusCard,
          {
            backgroundColor: user ? colors.accent : colors.bgSecondary,
            borderColor: user ? colors.borderAccent : colors.borderDefault,
          },
        ]}
      >
        <View style={styles.statusHeader}>
          <Text
            style={[
              textLg,
              { color: user ? colors.textInverse : colors.textPrimary },
            ]}
          >
            {user ? 'Signed-in account' : 'Account'}
          </Text>
          <Badge variant={user ? 'accent' : 'neutral'} size="sm">
            {user ? 'Active' : 'Offline'}
          </Badge>
        </View>
        <Text style={[textSm, { color: user ? colors.textInverse : colors.textSecondary }]}>
          {user ? user.email ?? user.id : 'No active account session.'}
        </Text>
        <Text style={[textSm, { color: user ? colors.textInverse : colors.textSecondary }]}>
          Provider: {session?.provider ?? 'none'}
        </Text>
        <Text style={[textSm, { color: user ? colors.textInverse : colors.textSecondary }]}>
          Sync: {isConfigured ? 'Ready for trips, hazards, and feedback' : 'Local-only mode'}
        </Text>
      </View>

      {/* ── Menu tiles ── */}
      <View style={styles.tileGrid}>
        <Link href="/auth" asChild>
          <Pressable>
            <MenuItem
              icon="person-outline"
              label="Account"
              description="Sign in, create an account, or use the local developer bypass for validation."
              rightAccessory={
                <Badge variant={user ? 'accent' : 'neutral'} size="sm">
                  {user ? 'Manage' : 'Open'}
                </Badge>
              }
            />
          </Pressable>
        </Link>
        <Link href="/offline-maps" asChild>
          <Pressable>
            <MenuItem
              icon="map-outline"
              label="Offline maps"
              description="Download route packs and check whether the current ride is ready for no-signal use."
              rightAccessory={
                <Badge variant="neutral" size="sm">
                  Maps
                </Badge>
              }
            />
          </Pressable>
        </Link>
        <Link href="/diagnostics" asChild>
          <Pressable>
            <MenuItem
              icon="pulse-outline"
              label="Diagnostics"
              description="Inspect queue health, API reachability, permissions, and background movement recovery."
              rightAccessory={
                <Badge variant="info" size="sm">
                  QA
                </Badge>
              }
            />
          </Pressable>
        </Link>
        <Link href="/onboarding/index" asChild>
          <Pressable>
            <MenuItem
              icon="book-outline"
              label="Welcome flow"
              description="Replay the rider introduction and permission story with the updated native walkthrough."
              rightAccessory={
                <Badge variant="neutral" size="sm">
                  Guide
                </Badge>
              }
            />
          </Pressable>
        </Link>
      </View>

      {/* ── App wiring card ── */}
      <View
        style={[
          styles.statusCard,
          {
            backgroundColor: colors.bgSecondary,
            borderColor: colors.borderDefault,
          },
        ]}
      >
        <Text style={[textLg, { color: colors.textPrimary }]}>App wiring</Text>
        <Text style={[textSm, { color: colors.textSecondary }]}>
          Environment: {mobileEnv.appEnv}
        </Text>
        <Text style={[textSm, { color: colors.textSecondary }]}>
          Variant: {mobileEnv.appVariant}
        </Text>
        <Text style={[textSm, { color: colors.textSecondary }]}>
          Mobile API URL: {mobileEnv.mobileApiUrl || 'Not set'}
        </Text>
        <Text style={[textSm, { color: colors.textSecondary }]}>
          Mapbox token configured: {mobileEnv.mapboxPublicToken ? 'Yes' : 'No'}
        </Text>
        <Text style={[textSm, { color: colors.textSecondary }]}>
          Supabase configured: {isConfigured ? 'Yes' : 'No'}
        </Text>
        <Text style={[textSm, { color: colors.textSecondary }]}>
          Sentry configured: {mobileEnv.sentryDsn ? 'Yes' : 'No'}
        </Text>
        <Text style={[textSm, { color: colors.textSecondary }]}>
          Analytics configured: {mobileEnv.posthogApiKey ? 'Yes' : 'No'}
        </Text>
        <Text style={[textSm, { color: colors.textSecondary }]}>
          Developer auth bypass: {isDeveloperBypassAvailable ? 'Available' : 'Disabled'}
        </Text>
      </View>

      {/* ── Rider note card ── */}
      <View
        style={[
          styles.statusCard,
          {
            backgroundColor: colors.bgSecondary,
            borderColor: colors.borderDefault,
          },
        ]}
      >
        <Text style={[textLg, { color: colors.textPrimary }]}>Rider note</Text>
        <Text style={[textBase, { color: colors.textSecondary }]}>
          The core ride flow is now map-first and branded. This menu stays focused on tools and
          validation surfaces rather than duplicating route controls.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: space[4],
    gap: space[2],
    ...shadows.md,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space[1],
  },
  tileGrid: {
    gap: space[3],
  },
});
