/**
 * Set-new-password screen (review 2026-06-12, P1: forgot-password flow).
 *
 * Reached via the password-recovery email deep link: AuthSessionProvider
 * exchanges the recovery code into a session, detects recovery (explicit
 * type=recovery or the persisted reset-requested flag), and routes here.
 * The user holds a valid recovery session, so updatePassword
 * (supabase.auth.updateUser) is all that's needed.
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button, Surface, TextInput, ScreenHeader } from '../src/design-system/atoms';
import { useTheme, type ThemeColors } from '../src/design-system';
import { gray } from '../src/design-system/tokens/colors';
import { space } from '../src/design-system/tokens/spacing';
import { textLg, textSm } from '../src/design-system/tokens/typography';
import { updatePassword } from '../src/lib/supabase';
import { useAuthSessionOptional } from '../src/providers/AuthSessionProvider';
import { useT } from '../src/hooks/useTranslation';

const MIN_PASSWORD_LENGTH = 6; // matches the Supabase project minimum + signup hint

export default function ResetPasswordScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const authCtx = useAuthSessionOptional();
  const t = useT();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // No recovery session (link expired before the exchange, or the user
  // navigated here manually) — nothing to update against.
  const hasSession = Boolean(authCtx?.session);

  const submit = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(t('auth.resetPasswordTooShort'));
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage(t('auth.resetPasswordMismatch'));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      setDone(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('auth.authFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScreenHeader variant="close" title={t('auth.resetPasswordTitle')} onBack={() => router.replace('/')} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Surface style={styles.card}>
          {done ? (
            <>
              <Ionicons name="checkmark-circle" size={40} color={colors.safe} />
              <Text style={styles.title}>{t('auth.resetPasswordDoneTitle')}</Text>
              <Text style={styles.subtitle}>{t('auth.resetPasswordDoneBody')}</Text>
              <Button variant="primary" size="lg" fullWidth onPress={() => router.replace('/')}>
                {t('auth.resetPasswordContinue')}
              </Button>
            </>
          ) : hasSession ? (
            <>
              <Text style={styles.title}>{t('auth.resetPasswordTitle')}</Text>
              <Text style={styles.subtitle}>{t('auth.resetPasswordSubtitle')}</Text>
              <TextInput
                label={t('auth.resetPasswordNew')}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                leftIcon={<Ionicons name="lock-closed-outline" size={18} color={gray[400]} />}
              />
              <TextInput
                label={t('auth.resetPasswordConfirm')}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                leftIcon={<Ionicons name="lock-closed-outline" size={18} color={gray[400]} />}
              />
              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={isSubmitting}
                loading={isSubmitting}
                onPress={() => void submit()}
              >
                {t('auth.resetPasswordSubmit')}
              </Button>
            </>
          ) : (
            <>
              <Text style={styles.title}>{t('auth.resetPasswordExpiredTitle')}</Text>
              <Text style={styles.subtitle}>{t('auth.resetPasswordExpiredBody')}</Text>
              {/* `email=1` pre-opens /auth's collapsed email form — the user is
                  here to sign in with email + their (reset) password. */}
              <Button variant="primary" size="lg" fullWidth onPress={() => router.replace('/auth?email=1')}>
                {t('auth.resetPasswordBackToSignIn')}
              </Button>
            </>
          )}
        </Surface>
      </ScrollView>
    </SafeAreaView>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.bgDeep,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: space[4],
    },
    card: {
      gap: space[4],
      padding: space[5],
      alignItems: 'stretch',
    },
    title: {
      ...textLg,
      color: colors.textPrimary,
      fontWeight: '700',
    },
    subtitle: {
      ...textSm,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    errorText: {
      ...textSm,
      color: colors.danger,
    },
  });
