import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Surface } from '../../src/design-system/atoms';
import { useTheme, type ThemeColors } from '../../src/design-system';
import { useT } from '../../src/hooks/useTranslation';
import { gray, safetyColors } from '../../src/design-system/tokens/colors';
import { radii } from '../../src/design-system/tokens/radii';
import { shadows } from '../../src/design-system/tokens/shadows';
import { space } from '../../src/design-system/tokens/spacing';
import {
  fontFamily,
  text2xl,
  textBase,
  textSm,
  textXs,
} from '../../src/design-system/tokens/typography';
import { mobileApi } from '../../src/lib/api';
import { navigateAfterOnboarding } from '../../src/lib/post-onboarding-nav';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

export default function ChooseUsernameScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Defensive guard: if a returning user lands here (e.g. via deep link or
  // any future caller that forgot to check), skip the prompt instead of
  // letting them overwrite an existing username.
  const [isCheckingExisting, setIsCheckingExisting] = useState(true);

  const isValid = USERNAME_REGEX.test(username);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await mobileApi.getProfile();
        if (cancelled) return;
        if (profile.username != null && profile.username.length > 0) {
          // Returning user landed here defensively. Preserve the demo route
          // from /onboarding/first-route if it's still in store so they get
          // the same value moment as a fresh signup; otherwise fall through
          // to a clean planner.
          navigateAfterOnboarding();
          return;
        }
      } catch {
        // Network/profile failure → show the prompt rather than block the user.
      }
      if (!cancelled) setIsCheckingExisting(false);
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only guard — runs once when the screen lands.
  }, []);

  const handleSubmit = async () => {
    if (!isValid) {
      setError('Username must be 3-30 characters: letters, numbers, underscore only.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await mobileApi.updateProfile({ username: username.toLowerCase() });
      navigateToApp();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to set username.';
      if (message.includes('already taken') || message.includes('409') || message.includes('CONFLICT')) {
        setError('This username is already taken. Try another one.');
      } else {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const navigateToApp = () => {
    // Preserve the demo circuit route from /onboarding/first-route if it's
    // still in store so the user lands on /route-preview with the safe route
    // they just saw being calculated — a concrete value moment.
    navigateAfterOnboarding();
  };

  if (isCheckingExisting) {
    return (
      <View style={[styles.root, styles.loadingRoot, { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] }]}>
      <View style={styles.headerSection}>
        <Text style={styles.eyebrow}>{t('onboarding.oneMoreThing')}</Text>
        <Text style={styles.title}>{t('onboarding.chooseUsername')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.usernameCommunitySub')}</Text>
      </View>

      <Surface style={{ gap: space[2] }}>
        <View style={styles.inputRow}>
          <Text style={styles.atSign}>@</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={(text) => {
              setUsername(text.replace(/[^a-zA-Z0-9_]/g, ''));
              setError(null);
            }}
            placeholder={t('onboarding.usernamePlaceholder')}
            placeholderTextColor={gray[500]}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
            autoFocus
          />
        </View>
        {username.length > 0 && !isValid ? (
          <Text style={styles.hintText}>{t('onboarding.usernameHint')}</Text>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </Surface>

      <View style={styles.footer}>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={isSubmitting}
          onPress={() => void handleSubmit()}
          disabled={!isValid || isSubmitting}
        >
          {t('onboarding.continue')}
        </Button>
        <Pressable onPress={navigateToApp} hitSlop={12}>
          <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bgDeep,
      paddingHorizontal: space[5],
    },
    loadingRoot: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerSection: {
      gap: space[2],
      paddingTop: space[8],
      paddingBottom: space[4],
    },
    eyebrow: {
      ...textXs,
      fontFamily: fontFamily.heading.extraBold,
      textTransform: 'uppercase',
      letterSpacing: 1.4,
      color: colors.accent,
    },
    title: {
      ...text2xl,
      fontFamily: fontFamily.heading.extraBold,
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },
    subtitle: {
      ...textBase,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[1],
    },
    atSign: {
      fontFamily: fontFamily.mono.bold,
      fontSize: 20,
      color: colors.accent,
    },
    input: {
      flex: 1,
      fontFamily: fontFamily.mono.medium,
      fontSize: 18,
      color: colors.textPrimary,
      paddingVertical: space[2],
    },
    hintText: {
      ...textXs,
      color: colors.textMuted,
    },
    errorText: {
      ...textSm,
      color: safetyColors.danger,
    },
    footer: {
      flex: 1,
      justifyContent: 'flex-end',
      gap: space[3],
      alignItems: 'center',
    },
    skipText: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.textMuted,
    },
  });
