import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Screen } from '../src/components/Screen';
import { useTheme } from '../src/design-system';
import { Badge } from '../src/design-system/atoms';
import { MenuItem } from '../src/design-system/molecules';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { textLg, textSm, textBase, fontFamily } from '../src/design-system/tokens/typography';
import { mobileApi } from '../src/lib/api';
import { mobileEnv } from '../src/lib/env';
import { useAuthSessionOptional } from '../src/providers/AuthSessionProvider';
import { useT } from '../src/hooks/useTranslation';
import { useAppStore } from '../src/store/appStore';

export default function SettingsScreen() {
  const authCtx = useAuthSessionOptional();
  const user = authCtx?.user ?? null;
  const isConfigured = authCtx?.isConfigured ?? false;
  const session = authCtx?.session ?? null;
  const isDeveloperBypassAvailable = authCtx?.isDeveloperBypassAvailable ?? false;
  const { colors } = useTheme();
  const t = useT();
  const { persona, miaJourneyStatus } = useAppStore(
    useShallow((s) => ({ persona: s.persona, miaJourneyStatus: s.miaJourneyStatus })),
  );
  const showMiaOptOut = persona === 'mia' && miaJourneyStatus === 'active';

  const handleMiaOptOut = () => {
    useAppStore.getState().optOutMia();
    // Fire-and-forget server sync
    mobileApi.optOutMia().catch(() => {
      // Silently ignore — store is already updated
    });
  };

  return (
    <Screen
      title={t('settings.title')}
      eyebrow={t('settings.subtitle')}
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
            {user ? t('settings.signedInAccount') : t('settings.account')}
          </Text>
          <Badge variant={user ? 'accent' : 'neutral'} size="sm">
            {user ? t('settings.active') : t('settings.offline')}
          </Badge>
        </View>
        <Text style={[textSm, { color: user ? colors.textInverse : colors.textSecondary }]}>
          {user ? user.email ?? user.id : t('settings.noSession')}
        </Text>
        <Text style={[textSm, { color: user ? colors.textInverse : colors.textSecondary }]}>
          {t('settings.provider')} {session?.provider ?? 'none'}
        </Text>
        <Text style={[textSm, { color: user ? colors.textInverse : colors.textSecondary }]}>
          {t('settings.sync')} {isConfigured ? t('settings.syncReady') : t('settings.offline')}
        </Text>
      </View>

      {/* ── Menu tiles ── */}
      <View style={styles.tileGrid}>
        <Link href="/auth" asChild>
          <Pressable>
            <MenuItem
              icon="person-outline"
              label={t('settings.account')}
              description={t('settings.accountSub')}
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
              label={t('settings.offlineMaps')}
              description={t('settings.offlineMapsSub')}
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
              label={t('settings.diagnostics')}
              description={t('settings.diagnosticsSub')}
              rightAccessory={
                <Badge variant="info" size="sm">
                  QA
                </Badge>
              }
            />
          </Pressable>
        </Link>
        <Link href="/onboarding" asChild>
          <Pressable>
            <MenuItem
              icon="book-outline"
              label={t('settings.welcomeFlow')}
              description={t('settings.welcomeFlowSub')}
              rightAccessory={
                <Badge variant="neutral" size="sm">
                  Guide
                </Badge>
              }
            />
          </Pressable>
        </Link>
        <Link href="/faq" asChild>
          <Pressable>
            <MenuItem
              icon="help-circle-outline"
              label={t('settings.helpFaq')}
              description={t('settings.helpFaqSub')}
              rightAccessory={
                <Badge variant="neutral" size="sm">
                  FAQ
                </Badge>
              }
            />
          </Pressable>
        </Link>
        {showMiaOptOut ? (
          <MenuItem
            icon="exit-outline"
            label={t('mia.journey.skipAhead')}
            description={t('mia.journey.skipAheadSub')}
            onPress={handleMiaOptOut}
          />
        ) : null}
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
          {t('settings.environment')} {mobileEnv.appEnv}
        </Text>
        <Text style={[textSm, { color: colors.textSecondary }]}>
          {t('settings.variant')} {mobileEnv.appVariant}
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
