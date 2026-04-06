import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../src/design-system/atoms';
import { useTheme, type ThemeColors } from '../../src/design-system';
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
import { useAppStore } from '../../src/store/appStore';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

export default function ChooseUsernameScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const routePreview = useAppStore((s) => s.routePreview);
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValid = USERNAME_REGEX.test(username);

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
    const hasRoute = routePreview != null && routePreview.routes.length > 0;
    router.replace(hasRoute ? '/route-preview' : '/route-planning');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] }]}>
      <View style={styles.headerSection}>
        <Text style={styles.eyebrow}>One more thing</Text>
        <Text style={styles.title}>Choose a username</Text>
        <Text style={styles.subtitle}>
          This is how other cyclists will see you in the community.
        </Text>
      </View>

      <View style={styles.inputCard}>
        <View style={styles.inputRow}>
          <Text style={styles.atSign}>@</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={(text) => {
              setUsername(text.replace(/[^a-zA-Z0-9_]/g, ''));
              setError(null);
            }}
            placeholder="your_username"
            placeholderTextColor={gray[500]}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
            autoFocus
          />
        </View>
        {username.length > 0 && !isValid ? (
          <Text style={styles.hintText}>Min 3 characters. Letters, numbers, underscore only.</Text>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <View style={styles.footer}>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={isSubmitting}
          onPress={() => void handleSubmit()}
          disabled={!isValid || isSubmitting}
        >
          Continue
        </Button>
        <Pressable onPress={navigateToApp} hitSlop={12}>
          <Text style={styles.skipText}>Skip for now</Text>
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
    inputCard: {
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      padding: space[4],
      gap: space[2],
      ...shadows.md,
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
