import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandLogo } from '../src/components/BrandLogo';
import { Button, TextInput } from '../src/design-system/atoms';
import { useTheme, type ThemeColors } from '../src/design-system';
import { gray } from '../src/design-system/tokens/colors';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import {
  fontFamily,
  text2xl,
  textLg,
  textSm,
  textXs,
} from '../src/design-system/tokens/typography';
import { useAuthSessionOptional } from '../src/providers/AuthSessionProvider';
import { useT } from '../src/hooks/useTranslation';

type AuthMode = 'sign-in' | 'sign-up';

export default function AuthScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const authCtx = useAuthSessionOptional();

  const session = authCtx?.session ?? null;
  const user = authCtx?.user ?? null;
  const isSupabaseConfigured = authCtx?.isSupabaseConfigured ?? false;
  const isDeveloperBypassAvailable = authCtx?.isDeveloperBypassAvailable ?? false;
  const contextAuthError = authCtx?.authError ?? null;

  const t = useT();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Merge context-level auth errors (e.g. from cold-start deep link failures)
  // into the local error state.
  const displayError = errorMessage ?? contextAuthError;

  const submit = async () => {
    if (!authCtx) return;
    if (!email.trim() || !password) {
      setErrorMessage(t('auth.enterBoth'));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);
    authCtx.clearAuthError();

    try {
      const result =
        mode === 'sign-in'
          ? await authCtx.signInWithEmail(email.trim(), password)
          : await authCtx.signUpWithEmail(email.trim(), password);

      if (result.error) {
        setErrorMessage(result.error.message);
        return;
      }

      setStatusMessage(
        mode === 'sign-in'
          ? t('auth.signedInSuccess')
          : t('auth.accountCreated'),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('auth.authFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const signInAsDeveloper = async () => {
    if (!authCtx) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const result = await authCtx.signInWithDeveloperBypass();
      setStatusMessage(
        `${t('auth.devSession')} ${result.user.email ?? result.user.id}.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('auth.devSignInFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!authCtx) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);
    authCtx.clearAuthError();

    try {
      const { error } = await authCtx.signInWithGoogle();
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      setStatusMessage('Signed in with Google.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Google sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (!authCtx) return;
    try {
      await authCtx.signOut();
      setStatusMessage('Signed out.');
      setErrorMessage(null);
    } catch {
      setErrorMessage('Sign out failed.');
    }
  };

  // --- Render ---

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('settings.account')}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar + branding */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            <BrandLogo size={64} />
          </View>
          <Text style={styles.brandName}>{t('common.appName')}</Text>
        </View>

        {/* ── Signed-in state ── */}
        {user ? (
          <View style={styles.card}>
            <View style={styles.signedInHeader}>
              <Ionicons name="checkmark-circle" size={20} color={colors.safe} />
              <Text style={styles.signedInLabel}>Logged in as</Text>
            </View>
            <Text style={styles.userEmail}>{user.email ?? user.id}</Text>
            <Text style={styles.providerText}>
              Provider: {session?.provider ?? 'unknown'}
            </Text>

            <View style={styles.signedInActions}>
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onPress={() => void handleSignOut()}
              >
                {t('profile.signOut')}
              </Button>
            </View>

            {statusMessage ? (
              <Text style={styles.successText}>{statusMessage}</Text>
            ) : null}
          </View>
        ) : (
          /* ── Sign-in / Sign-up form ── */
          <View style={styles.card}>
            {/* Mode toggle */}
            <View style={styles.segmentedRow}>
              <Pressable
                style={[
                  styles.segmentButton,
                  mode === 'sign-in' && styles.segmentButtonActive,
                ]}
                onPress={() => {
                  setMode('sign-in');
                  setErrorMessage(null);
                  setStatusMessage(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === 'sign-in' }}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    mode === 'sign-in' && styles.segmentLabelActive,
                  ]}
                >
                  {t('auth.signIn')}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.segmentButton,
                  mode === 'sign-up' && styles.segmentButtonActive,
                ]}
                onPress={() => {
                  setMode('sign-up');
                  setErrorMessage(null);
                  setStatusMessage(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === 'sign-up' }}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    mode === 'sign-up' && styles.segmentLabelActive,
                  ]}
                >
                  {t('auth.signUp')}
                </Text>
              </Pressable>
            </View>

            {/* Supabase not configured notice */}
            {!isSupabaseConfigured ? (
              <View style={styles.warningBanner}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.caution} />
                <Text style={styles.warningText}>
                  Supabase is not configured for this build. Auth is unavailable.
                </Text>
              </View>
            ) : null}

            {/* Google Sign-in */}
            <Pressable
              style={({ pressed }) => [
                styles.googleButton,
                pressed && { opacity: 0.8 },
                (!isSupabaseConfigured || isSubmitting) && { opacity: 0.4 },
              ]}
              onPress={() => void handleGoogleSignIn()}
              disabled={!isSupabaseConfigured || isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Google"
            >
              <View style={styles.googleIconWrap}>
                <Text style={styles.googleG}>G</Text>
              </View>
              <Text style={styles.googleLabel}>{t('feedback.continueGoogle')}</Text>
            </Pressable>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with email</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Email field */}
            <View style={styles.fieldStack}>
              <TextInput
                label={t('auth.email')}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com"
                disabled={!isSupabaseConfigured}
                leftIcon={
                  <Ionicons name="mail-outline" size={18} color={gray[400]} />
                }
              />
              <TextInput
                label={t('auth.password')}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Minimum 6 characters"
                disabled={!isSupabaseConfigured}
                leftIcon={
                  <Ionicons name="lock-closed-outline" size={18} color={gray[400]} />
                }
              />
            </View>

            {/* Status / error messages */}
            {statusMessage ? (
              <Text style={styles.successText}>{statusMessage}</Text>
            ) : null}
            {displayError ? (
              <Text style={styles.errorText}>{displayError}</Text>
            ) : null}

            {/* Submit button */}
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={isSubmitting || !isSupabaseConfigured}
              loading={isSubmitting}
              onPress={() => void submit()}
            >
              {mode === 'sign-in' ? t('auth.signIn') : t('auth.signUp')}
            </Button>

            {/* Mode toggle text */}
            <View style={styles.toggleRow}>
              <Text style={styles.toggleQuestion}>
                {mode === 'sign-in' ? "Don't have an account?" : 'Already have an account?'}
              </Text>
              <Pressable
                onPress={() => {
                  setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
                  setErrorMessage(null);
                  setStatusMessage(null);
                }}
              >
                <Text style={styles.toggleLink}>
                  {mode === 'sign-in' ? t('auth.signUp') : t('auth.signIn')}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Developer bypass (only in dev) */}
        {isDeveloperBypassAvailable && !user ? (
          <View style={styles.devCard}>
            <View style={styles.devHeader}>
              <Ionicons name="code-slash-outline" size={16} color={gray[400]} />
              <Text style={styles.devTitle}>Developer bypass</Text>
            </View>
            <Text style={styles.devDescription}>
              Local QA only. Should never ship in production.
            </Text>
            <Button
              variant="secondary"
              size="md"
              fullWidth
              disabled={isSubmitting}
              loading={isSubmitting}
              onPress={() => void signInAsDeveloper()}
            >
              Use developer auth
            </Button>
          </View>
        ) : null}

        {/* Info footer */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={16} color={gray[500]} />
            <Text style={styles.infoText}>
              Anonymous-first — browse and navigate without signing in.
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="sync-outline" size={16} color={gray[500]} />
            <Text style={styles.infoText}>
              Sign in to sync trips, hazard reports, and feedback.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bgDeep,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space[4],
      paddingVertical: space[3],
    },
    backButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      ...text2xl,
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },
    content: {
      paddingHorizontal: space[5],
      paddingBottom: space[10],
      gap: space[5],
    },
    // Avatar
    avatarSection: {
      alignItems: 'center',
      gap: space[3],
      paddingTop: space[2],
    },
    avatarCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: gray[700],
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    brandName: {
      fontFamily: fontFamily.heading.extraBold,
      fontSize: 18,
      color: colors.textPrimary,
      letterSpacing: -0.3,
    },
    // Card
    card: {
      borderRadius: radii['2xl'],
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgPrimary,
      padding: space[5],
      gap: space[4],
      ...shadows.lg,
    },
    // Signed-in state
    signedInHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    signedInLabel: {
      ...textSm,
      color: colors.textSecondary,
    },
    userEmail: {
      ...textLg,
      color: colors.textPrimary,
      fontFamily: fontFamily.body.bold,
    },
    providerText: {
      ...textSm,
      color: colors.textSecondary,
    },
    signedInActions: {
      marginTop: space[1],
    },
    // Segmented control
    segmentedRow: {
      flexDirection: 'row',
      gap: space[2],
      backgroundColor: colors.bgDeep,
      borderRadius: radii.xl,
      padding: 4,
    },
    segmentButton: {
      flex: 1,
      borderRadius: radii.lg,
      paddingVertical: space[2] + 2,
      alignItems: 'center',
    },
    segmentButtonActive: {
      backgroundColor: colors.bgSecondary,
    },
    segmentLabel: {
      ...textSm,
      fontFamily: fontFamily.body.bold,
      color: colors.textSecondary,
    },
    segmentLabelActive: {
      color: colors.textPrimary,
    },
    // Warning
    warningBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space[2],
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: 'rgba(234, 179, 8, 0.35)',
      backgroundColor: 'rgba(234, 179, 8, 0.10)',
      paddingHorizontal: space[3],
      paddingVertical: space[3],
    },
    warningText: {
      ...textXs,
      flex: 1,
      color: '#fef3c7',
      lineHeight: 18,
    },
    // Google button
    googleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 52,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgSecondary,
      gap: space[3],
    },
    googleIconWrap: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    googleG: {
      fontFamily: fontFamily.body.bold,
      fontSize: 14,
      color: '#4285F4',
      marginTop: -1,
    },
    googleLabel: {
      ...textSm,
      fontFamily: fontFamily.body.bold,
      color: colors.textPrimary,
    },
    // Divider
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.borderDefault,
    },
    dividerText: {
      ...textXs,
      color: gray[500],
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    // Fields
    fieldStack: {
      gap: space[3],
    },
    // Messages
    successText: {
      ...textSm,
      color: '#4ADE80',
      lineHeight: 20,
    },
    errorText: {
      ...textSm,
      color: '#F87171',
      lineHeight: 20,
    },
    // Toggle
    toggleRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: space[1],
    },
    toggleQuestion: {
      ...textSm,
      color: colors.textSecondary,
    },
    toggleLink: {
      ...textSm,
      color: colors.accent,
      fontFamily: fontFamily.body.bold,
    },
    // Dev card
    devCard: {
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: 'rgba(255, 255, 255, 0.04)',
      padding: space[4],
      gap: space[2],
    },
    devHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    devTitle: {
      ...textSm,
      color: colors.textPrimary,
      fontFamily: fontFamily.body.bold,
    },
    devDescription: {
      ...textXs,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    // Info section
    infoSection: {
      gap: space[3],
      paddingHorizontal: space[1],
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space[2],
    },
    infoText: {
      ...textSm,
      flex: 1,
      color: gray[500],
      lineHeight: 20,
    },
  });
