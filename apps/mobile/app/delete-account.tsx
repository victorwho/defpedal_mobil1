import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '../src/components/Screen';
import { useTheme, type ThemeColors } from '../src/design-system';
import { useHaptics } from '../src/design-system/hooks/useHaptics';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { fontFamily, textBase, textLg, textSm } from '../src/design-system/tokens/typography';
import { mobileApi } from '../src/lib/api';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useT } from '../src/hooks/useTranslation';

const CONFIRM_TOKEN = 'DELETE';

export default function DeleteAccountScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const haptics = useHaptics();
  const { user, isAnonymous, signOut } = useAuthSession();

  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canConfirm = typedConfirmation.trim() === CONFIRM_TOKEN;

  const handleCancel = useCallback(() => {
    router.back();
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!canConfirm || submitting) return;
    setSubmitting(true);
    haptics.warning();

    try {
      await mobileApi.deleteAccount();
      // On success: sign out (clears Supabase session locally), then route
      // to the auth gate. The provider chain resets the rest of local state
      // when the auth state flips.
      await signOut();
      Alert.alert(
        t('deleteAccount.successTitle'),
        t('deleteAccount.successMessage'),
        [{ text: 'OK', onPress: () => router.replace('/auth' as any) }],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : t('deleteAccount.errorMessage');
      haptics.error();
      Alert.alert(t('deleteAccount.errorTitle'), message);
      setSubmitting(false);
    }
  }, [canConfirm, submitting, haptics, signOut, t]);

  // Anonymous users have no server-side account to delete. Show a friendly
  // notice explaining their data is local-only and will be cleared if they
  // uninstall or wipe the app.
  if (!user) {
    return (
      <Screen title={t('deleteAccount.title')} headerVariant="back" onBack={handleCancel}>
        <View style={styles.body}>
          <Text style={styles.intro}>{t('deleteAccount.signInRequired')}</Text>
        </View>
      </Screen>
    );
  }

  if (isAnonymous) {
    return (
      <Screen title={t('deleteAccount.title')} headerVariant="back" onBack={handleCancel}>
        <View style={styles.body}>
          <Text style={styles.intro}>{t('deleteAccount.anonymousNotice')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen title={t('deleteAccount.title')} headerVariant="back" onBack={handleCancel}>
      <View style={styles.body}>
        <View style={styles.warningCard}>
          <Ionicons name="warning-outline" size={28} color={colors.danger} />
          <Text style={styles.warningTitle}>{t('deleteAccount.title')}</Text>
        </View>

        <Text style={styles.intro}>{t('deleteAccount.intro')}</Text>

        <View style={styles.bulletList}>
          {[
            t('deleteAccount.bulletTrips'),
            t('deleteAccount.bulletShares'),
            t('deleteAccount.bulletHazards'),
            t('deleteAccount.bulletSocial'),
            t('deleteAccount.bulletProgress'),
            t('deleteAccount.bulletProfile'),
          ].map((bullet, index) => (
            <View key={index} style={styles.bulletRow}>
              <Ionicons name="ellipse" size={6} color={colors.textPrimary} style={styles.bulletDot} />
              <Text style={styles.bulletText}>{bullet}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.confirmInstruction}>{t('deleteAccount.confirmInstruction')}</Text>

        <TextInput
          style={styles.confirmInput}
          value={typedConfirmation}
          onChangeText={setTypedConfirmation}
          placeholder={t('deleteAccount.confirmPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!submitting}
          accessibilityLabel={t('deleteAccount.confirmPlaceholder')}
        />

        <View style={styles.buttonRow}>
          <Pressable
            style={styles.cancelButton}
            onPress={handleCancel}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel={t('deleteAccount.cancelButton')}
          >
            <Text style={styles.cancelButtonText}>{t('deleteAccount.cancelButton')}</Text>
          </Pressable>
          <Pressable
            style={[styles.confirmButton, !canConfirm && styles.confirmButtonDisabled]}
            onPress={handleConfirm}
            disabled={!canConfirm || submitting}
            accessibilityRole="button"
            accessibilityLabel={t('deleteAccount.confirmButton')}
            accessibilityState={{ disabled: !canConfirm || submitting }}
          >
            <Text style={styles.confirmButtonText}>
              {submitting ? t('deleteAccount.confirming') : t('deleteAccount.confirmButton')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    body: {
      paddingHorizontal: space[5],
      paddingTop: space[5],
      paddingBottom: space[8],
    },
    warningCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      paddingVertical: space[4],
      paddingHorizontal: space[4],
      backgroundColor: colors.bgSecondary,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.danger,
      marginBottom: space[4],
    },
    warningTitle: {
      ...textLg,
      fontFamily: fontFamily.body.semiBold,
      color: colors.danger,
    },
    intro: {
      ...textBase,
      color: colors.textPrimary,
      marginBottom: space[4],
    },
    bulletList: {
      marginBottom: space[5],
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space[2],
      marginBottom: space[1],
    },
    bulletDot: {
      marginTop: 8,
    },
    bulletText: {
      ...textSm,
      flex: 1,
      color: colors.textPrimary,
    },
    confirmInstruction: {
      ...textBase,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
      marginBottom: space[2],
    },
    confirmInput: {
      ...textBase,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      borderRadius: radii.md,
      paddingVertical: space[2],
      paddingHorizontal: space[4],
      fontFamily: fontFamily.body.medium,
      color: colors.textPrimary,
      backgroundColor: colors.bgSecondary,
      marginBottom: space[5],
      letterSpacing: 2,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: space[2],
    },
    cancelButton: {
      flex: 1,
      paddingVertical: space[4],
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButtonText: {
      ...textBase,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    confirmButton: {
      flex: 1,
      paddingVertical: space[4],
      borderRadius: radii.md,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmButtonDisabled: {
      opacity: 0.4,
    },
    confirmButtonText: {
      ...textBase,
      fontFamily: fontFamily.body.semiBold,
      color: colors.bgPrimary,
    },
  });
