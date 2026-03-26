import { Link } from 'expo-router';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Screen } from '../src/components/Screen';
import { StatusCard } from '../src/components/StatusCard';
import { useProfile, useUpdateProfile } from '../src/hooks/useFeed';
import { mobileEnv } from '../src/lib/env';
import { mobileTheme } from '../src/lib/theme';
import { useAuthSession } from '../src/providers/AuthSessionProvider';

function MenuTile({
  title,
  description,
  label,
  tone = 'default',
}: {
  title: string;
  description: string;
  label: string;
  tone?: 'default' | 'accent';
}) {
  return (
    <View style={[styles.tile, tone === 'accent' ? styles.tileAccent : null]}>
      <View style={styles.tileCopy}>
        <Text style={[styles.tileTitle, tone === 'accent' ? styles.tileTitleAccent : null]}>
          {title}
        </Text>
        <Text style={[styles.tileDescription, tone === 'accent' ? styles.tileDescriptionAccent : null]}>
          {description}
        </Text>
      </View>
      <View style={[styles.tileBadge, tone === 'accent' ? styles.tileBadgeAccent : null]}>
        <Text style={[styles.tileBadgeLabel, tone === 'accent' ? styles.tileBadgeLabelAccent : null]}>
          {label}
        </Text>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { user, isConfigured, session, isDeveloperBypassAvailable } = useAuthSession();

  return (
    <Screen
      title="Menu"
      eyebrow="Control room"
      subtitle="The native menu now mirrors the web app more closely: account first, then ride tools, diagnostics, and environment status."
    >
      <StatusCard title={user ? 'Signed-in account' : 'Account'} tone={user ? 'accent' : 'default'}>
        <Text style={user ? styles.darkText : styles.bodyText}>
          {user ? user.email ?? user.id : 'No active account session.'}
        </Text>
        <Text style={user ? styles.darkText : styles.bodyText}>
          Provider: {session?.provider ?? 'none'}
        </Text>
        <Text style={user ? styles.darkText : styles.bodyText}>
          Sync: {isConfigured ? 'Ready for trips, hazards, and feedback' : 'Local-only mode'}
        </Text>
      </StatusCard>

      {/* Community section */}
      {user ? <CommunitySettings /> : null}

      <View style={styles.tileGrid}>
        <Link href="/community-feed" asChild>
          <Pressable>
            <MenuTile
              title="Community Feed"
              description="See rides shared by nearby cyclists and discover safe routes in your area."
              label="Feed"
              tone="accent"
            />
          </Pressable>
        </Link>
        <Link href="/auth" asChild>
          <Pressable>
            <MenuTile
              title="Account"
              description="Sign in, create an account, or use the local developer bypass for validation."
              label={user ? 'Manage' : 'Open'}
              tone={user ? 'accent' : 'default'}
            />
          </Pressable>
        </Link>
        <Link href="/offline-maps" asChild>
          <Pressable>
            <MenuTile
              title="Offline maps"
              description="Download route packs and check whether the current ride is ready for no-signal use."
              label="Maps"
            />
          </Pressable>
        </Link>
        <Link href="/diagnostics" asChild>
          <Pressable>
            <MenuTile
              title="Diagnostics"
              description="Inspect queue health, API reachability, permissions, and background movement recovery."
              label="QA"
            />
          </Pressable>
        </Link>
        <Link href="/onboarding" asChild>
          <Pressable>
            <MenuTile
              title="Welcome flow"
              description="Replay the rider introduction and permission story with the updated native walkthrough."
              label="Guide"
            />
          </Pressable>
        </Link>
      </View>

      <StatusCard title="App wiring">
        <Text style={styles.bodyText}>Environment: {mobileEnv.appEnv}</Text>
        <Text style={styles.bodyText}>Variant: {mobileEnv.appVariant}</Text>
        <Text style={styles.bodyText}>Mobile API URL: {mobileEnv.mobileApiUrl || 'Not set'}</Text>
        <Text style={styles.bodyText}>
          Mapbox token configured: {mobileEnv.mapboxPublicToken ? 'Yes' : 'No'}
        </Text>
        <Text style={styles.bodyText}>Supabase configured: {isConfigured ? 'Yes' : 'No'}</Text>
        <Text style={styles.bodyText}>
          Sentry configured: {mobileEnv.sentryDsn ? 'Yes' : 'No'}
        </Text>
        <Text style={styles.bodyText}>
          Analytics configured: {mobileEnv.posthogApiKey ? 'Yes' : 'No'}
        </Text>
        <Text style={styles.bodyText}>
          Developer auth bypass: {isDeveloperBypassAvailable ? 'Available' : 'Disabled'}
        </Text>
      </StatusCard>

      <StatusCard title="Rider note">
        <Text style={styles.bodyText}>
          The core ride flow is now map-first and branded. This menu stays focused on tools and
          validation surfaces rather than duplicating route controls.
        </Text>
      </StatusCard>
    </Screen>
  );
}

function CommunitySettings() {
  const profile = useProfile();
  const updateProfile = useUpdateProfile();

  const autoShare = profile.data?.autoShareRides ?? false;
  const trimEndpoints = profile.data?.trimRouteEndpoints ?? false;

  return (
    <StatusCard title="Community settings">
      <View style={styles.toggleRow}>
        <View style={styles.toggleCopy}>
          <Text style={styles.toggleLabel}>Auto-share my rides</Text>
          <Text style={styles.toggleDescription}>
            Automatically share completed rides with nearby cyclists.
          </Text>
        </View>
        <Switch
          value={autoShare}
          onValueChange={(value) => updateProfile.mutate({ autoShareRides: value })}
          trackColor={{ true: mobileTheme.colors.brand, false: '#3f3f46' }}
        />
      </View>
      <View style={styles.toggleRow}>
        <View style={styles.toggleCopy}>
          <Text style={styles.toggleLabel}>Trim route endpoints</Text>
          <Text style={styles.toggleDescription}>
            Remove ~200m from start and end of shared routes for privacy.
          </Text>
        </View>
        <Switch
          value={trimEndpoints}
          onValueChange={(value) => updateProfile.mutate({ trimRouteEndpoints: value })}
          trackColor={{ true: mobileTheme.colors.brand, false: '#3f3f46' }}
        />
      </View>
    </StatusCard>
  );
}

const styles = StyleSheet.create({
  darkText: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 15,
    lineHeight: 21,
  },
  bodyText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  tileGrid: {
    gap: 12,
  },
  tile: {
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    padding: 18,
    gap: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 4,
  },
  tileAccent: {
    backgroundColor: mobileTheme.colors.surfaceAccent,
    borderColor: mobileTheme.colors.borderStrong,
  },
  tileCopy: {
    gap: 6,
  },
  tileTitle: {
    color: mobileTheme.colors.textPrimary,
    fontWeight: '900',
    fontSize: 18,
  },
  tileTitleAccent: {
    color: mobileTheme.colors.textOnDark,
  },
  tileDescription: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  tileDescriptionAccent: {
    color: mobileTheme.colors.textOnDarkMuted,
  },
  tileBadge: {
    alignSelf: 'flex-start',
    borderRadius: mobileTheme.radii.pill,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tileBadgeAccent: {
    backgroundColor: 'rgba(250, 204, 21, 0.14)',
  },
  tileBadgeLabel: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tileBadgeLabelAccent: {
    color: mobileTheme.colors.brand,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
  },
  toggleCopy: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  toggleDescription: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
});
