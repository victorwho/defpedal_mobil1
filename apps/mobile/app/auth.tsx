import { Link } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BrandLogo } from '../src/components/BrandLogo';
import { telemetry } from '../src/lib/telemetry';
import { mobileTheme } from '../src/lib/theme';
import { useAuthSession } from '../src/providers/AuthSessionProvider';

type AuthMode = 'sign-in' | 'sign-up';

export default function AuthScreen() {
  const {
    session,
    user,
    isLoading,
    isConfigured,
    isSupabaseConfigured,
    isDeveloperBypassAvailable,
    signInWithEmail,
    signUpWithEmail,
    signInWithDeveloperBypass,
    signOut,
  } = useAuthSession();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      setErrorMessage('Enter both email and password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const result =
        mode === 'sign-in'
          ? await signInWithEmail(email.trim(), password)
          : await signUpWithEmail(email.trim(), password);

      if (result.error) {
        telemetry.capture('auth_failed', {
          mode,
          reason: result.error.message,
        });
        telemetry.captureError(result.error, {
          feature: 'auth',
          mode,
        });
        setErrorMessage(result.error.message);
        return;
      }

      telemetry.capture(mode === 'sign-in' ? 'auth_signed_in' : 'auth_signed_up', {
        mode,
      });
      setStatusMessage(
        mode === 'sign-in'
          ? 'Signed in successfully.'
          : 'Account created. Check your email if confirmation is required.',
      );
    } catch (error) {
      telemetry.capture('auth_failed', {
        mode,
      });
      telemetry.captureError(error, {
        feature: 'auth',
        mode,
      });
      setErrorMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const signInAsDeveloper = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const result = await signInWithDeveloperBypass();
      telemetry.capture('auth_signed_in', {
        mode: 'dev-bypass',
      });
      setStatusMessage(
        `Developer session enabled for ${result.user.email ?? result.user.id}. Local validation only.`,
      );
    } catch (error) {
      telemetry.capture('auth_failed', {
        mode: 'dev-bypass',
      });
      telemetry.captureError(error, {
        feature: 'auth',
        mode: 'dev-bypass',
      });
      setErrorMessage(error instanceof Error ? error.message : 'Developer sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const accountState = isLoading ? 'Loading' : session ? 'Signed in' : 'Anonymous';
  const providerLabel = session?.provider ?? 'none';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.canvas}>
        <View style={[styles.glow, styles.glowTop]} />
        <View style={[styles.glow, styles.glowBottom]} />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <View style={styles.heroRow}>
              <BrandLogo size={62} />
              <View style={styles.heroCopy}>
                <Text style={styles.eyebrow}>Account</Text>
                <Text style={styles.title}>Welcome Back</Text>
                <Text style={styles.subtitle}>
                  Sign in to sync trips, hazard reports, and feedback while route preview stays
                  anonymous-first.
                </Text>
              </View>
            </View>
            <Link href="/route-planning" asChild>
              <Pressable style={styles.exitChip}>
                <Text style={styles.exitLabel}>Back to map</Text>
              </Pressable>
            </Link>
          </View>

          <View style={styles.statusStrip}>
            <View style={styles.statusPill}>
              <Text style={styles.statusLabel}>Session</Text>
              <Text style={styles.statusValue}>{accountState}</Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusLabel}>Provider</Text>
              <Text style={styles.statusValue}>{providerLabel}</Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusLabel}>Sync</Text>
              <Text style={styles.statusValue}>{isConfigured ? 'Ready' : 'Limited'}</Text>
            </View>
          </View>

          <View style={styles.modalShell}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{user ? 'Signed-in account' : 'Log in / Sign up'}</Text>
              <Text style={styles.modalSubtitle}>
                {user
                  ? 'This account unlocks synced ride data across devices.'
                  : 'Use email auth or the developer bypass for local validation.'}
              </Text>
            </View>

            {user ? (
              <View style={styles.accountPanel}>
                <View style={styles.accountBadge}>
                  <Text style={styles.accountBadgeLabel}>Live account</Text>
                </View>
                <Text style={styles.accountEmail}>{user.email ?? 'Unknown account'}</Text>
                <Text style={styles.accountMeta}>Provider: {providerLabel}</Text>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    void signOut();
                    telemetry.capture('auth_signed_out');
                    setStatusMessage('Signed out.');
                  }}
                >
                  <Text style={styles.secondaryLabel}>Sign out</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.formPanel}>
                {!isSupabaseConfigured ? (
                  <View style={styles.inlineNotice}>
                    <Text style={styles.inlineNoticeText}>
                      Supabase credentials are not configured for this build, so email auth is
                      unavailable.
                    </Text>
                  </View>
                ) : null}

                <View style={styles.segmentedRow}>
                  <Pressable
                    style={[styles.segmentButton, mode === 'sign-in' ? styles.segmentButtonActive : null]}
                    onPress={() => setMode('sign-in')}
                    disabled={!isSupabaseConfigured}
                  >
                    <Text
                      style={[styles.segmentLabel, mode === 'sign-in' ? styles.segmentLabelActive : null]}
                    >
                      Sign in
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.segmentButton, mode === 'sign-up' ? styles.segmentButtonActive : null]}
                    onPress={() => setMode('sign-up')}
                    disabled={!isSupabaseConfigured}
                  >
                    <Text
                      style={[styles.segmentLabel, mode === 'sign-up' ? styles.segmentLabelActive : null]}
                    >
                      Create account
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.fieldStack}>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Email</Text>
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      placeholder="you@example.com"
                      placeholderTextColor="#94a3b8"
                      style={styles.input}
                      editable={isSupabaseConfigured}
                    />
                  </View>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Password</Text>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      placeholder="Minimum 6 characters"
                      placeholderTextColor="#94a3b8"
                      style={styles.input}
                      editable={isSupabaseConfigured}
                    />
                  </View>
                </View>

                {statusMessage ? <Text style={styles.successText}>{statusMessage}</Text> : null}
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

                <Pressable
                  style={[styles.primaryButton, isSubmitting ? styles.buttonDisabled : null]}
                  disabled={isSubmitting || !isSupabaseConfigured}
                  onPress={() => {
                    void submit();
                  }}
                >
                  <Text style={styles.primaryLabel}>
                    {isSubmitting
                      ? 'Working...'
                      : mode === 'sign-in'
                        ? 'Sign in with email'
                        : 'Create account'}
                  </Text>
                </Pressable>

                {isDeveloperBypassAvailable ? (
                  <View style={styles.devPanel}>
                    <Text style={styles.devTitle}>Local validation bypass</Text>
                    <Text style={styles.devCopy}>
                      This shortcut is for local QA only and should never ship in production.
                    </Text>
                    <Pressable
                      style={[styles.secondaryButton, isSubmitting ? styles.buttonDisabled : null]}
                      disabled={isSubmitting}
                      onPress={() => {
                        void signInAsDeveloper();
                      }}
                    >
                      <Text style={styles.secondaryLabel}>Use developer auth</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoCard}>
              <Text style={styles.infoCardTitle}>Anonymous-first</Text>
              <Text style={styles.infoCardBody}>
                Riders can still search, preview routes, and navigate before signing in.
              </Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoCardTitle}>What syncs</Text>
              <Text style={styles.infoCardBody}>
                Signed-in sessions unlock synced trips, hazard submissions, and feedback writes.
              </Text>
            </View>
          </View>
        </ScrollView>
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
    backgroundColor: mobileTheme.colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 40,
    gap: 18,
  },
  glow: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.58,
  },
  glowTop: {
    top: -80,
    right: -20,
    width: 220,
    height: 220,
    backgroundColor: 'rgba(250, 204, 21, 0.14)',
  },
  glowBottom: {
    left: -70,
    bottom: -20,
    width: 220,
    height: 220,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
  },
  headerRow: {
    gap: 16,
  },
  heroRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  eyebrow: {
    color: mobileTheme.colors.brand,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    fontSize: 12,
    fontWeight: '800',
  },
  title: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.9,
  },
  subtitle: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  exitChip: {
    alignSelf: 'flex-start',
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  exitLabel: {
    color: mobileTheme.colors.textOnDark,
    fontWeight: '800',
    fontSize: 13,
  },
  statusStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statusPill: {
    minWidth: 92,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(17, 24, 39, 0.8)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  statusLabel: {
    color: mobileTheme.colors.textOnDarkMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
    fontSize: 11,
  },
  statusValue: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 15,
    fontWeight: '800',
  },
  modalShell: {
    borderRadius: 34,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    padding: 22,
    gap: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.32,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 18,
    },
    elevation: 10,
  },
  modalHeader: {
    gap: 6,
  },
  modalTitle: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  modalSubtitle: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  accountPanel: {
    gap: 12,
  },
  accountBadge: {
    alignSelf: 'flex-start',
    borderRadius: mobileTheme.radii.pill,
    backgroundColor: 'rgba(250, 204, 21, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  accountBadgeLabel: {
    color: mobileTheme.colors.brand,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  accountEmail: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 20,
    fontWeight: '800',
  },
  accountMeta: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 14,
  },
  formPanel: {
    gap: 14,
  },
  inlineNotice: {
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.35)',
    backgroundColor: 'rgba(234, 179, 8, 0.14)',
    padding: 14,
  },
  inlineNoticeText: {
    color: '#fef3c7',
    fontSize: 13,
    lineHeight: 19,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 10,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 13,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: mobileTheme.colors.surface,
  },
  segmentLabel: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontWeight: '800',
  },
  segmentLabelActive: {
    color: mobileTheme.colors.textPrimary,
  },
  fieldStack: {
    gap: 12,
  },
  fieldGroup: {
    gap: 7,
  },
  fieldLabel: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(248, 250, 252, 0.96)',
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: mobileTheme.colors.textPrimary,
    fontSize: 15,
  },
  successText: {
    color: '#99f6e4',
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    borderRadius: 22,
    backgroundColor: mobileTheme.colors.brand,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.58,
  },
  primaryLabel: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryLabel: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 15,
    fontWeight: '800',
  },
  devPanel: {
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: 16,
    gap: 10,
  },
  devTitle: {
    color: mobileTheme.colors.textOnDark,
    fontWeight: '800',
    fontSize: 15,
  },
  devCopy: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  infoGrid: {
    gap: 12,
  },
  infoCard: {
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    padding: 18,
    gap: 8,
  },
  infoCardTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  infoCardBody: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
