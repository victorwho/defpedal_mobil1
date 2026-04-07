import { router } from 'expo-router';
import { Alert, Image, NativeModules } from 'react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
// expo-image-picker is a native module — lazy require to avoid crash if not in APK
const hasImagePicker = Boolean(NativeModules.ExpoImagePicker);
import { useQuery } from '@tanstack/react-query';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../src/components/Screen';
import { BottomNav } from '../src/design-system/organisms/BottomNav';
import { SettingRow } from '../src/design-system/molecules/SettingRow';
import { SectionTitle } from '../src/design-system/atoms/SectionTitle';
import { useTheme, type ThemeColors } from '../src/design-system';
import { gray } from '../src/design-system/tokens/colors';
import { fontFamily, textBase, textSm, textXs } from '../src/design-system/tokens/typography';
import { layout, space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { mobileApi } from '../src/lib/api';
import { supabaseClient } from '../src/lib/supabase';
import { mobileEnv } from '../src/lib/env';
import { useAppStore } from '../src/store/appStore';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useT } from '../src/hooks/useTranslation';
import { useBadges } from '../src/hooks/useBadges';
import { brandTints, safetyTints, surfaceTints } from '../src/design-system/tokens/tints';

const BIKE_TYPE_KEYS = [
  'profile.bikeRoad', 'profile.bikeCity', 'profile.bikeMountain',
  'profile.bikeEbike', 'profile.bikeRecumbent', 'profile.bikeOther',
] as const;

const CYCLING_FREQUENCY_KEYS = [
  'profile.freqDaily', 'profile.freqSeveralWeek', 'profile.freqOnceWeek',
  'profile.freqFewMonth', 'profile.freqOnceMonth', 'profile.freqRarely',
] as const;

import { handleTabPress } from '../src/lib/navigation-helpers';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { user, signOut, signInAnonymously } = useAuthSession();
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const handleAvatarPick = async () => {
    if (!user || !supabaseClient) return;

    if (!hasImagePicker) {
      Alert.alert('Rebuild required', 'Photo picker needs a native rebuild. Run: cd android && ./gradlew installDebug');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setAvatarUploading(true);
    try {
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const path = `${user.id}/avatar.${ext}`;

      // Read the image as a blob for upload
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabaseClient.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: asset.mimeType ?? 'image/jpeg' });

      if (uploadError) throw uploadError;

      // Build public URL
      const publicUrl = `${mobileEnv.supabaseUrl}/storage/v1/object/public/avatars/${path}`;
      // Append cache-bust so the Image component reloads
      const avatarUrl = `${publicUrl}?t=${Date.now()}`;

      await mobileApi.updateProfile({ avatarUrl });
      void refetchProfile();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      Alert.alert('Photo upload failed', msg);
    } finally {
      setAvatarUploading(false);
    }
  };

  const { data: profile, refetch: refetchProfile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => mobileApi.getProfile(),
    enabled: Boolean(user),
    staleTime: 120_000,
  });

  const t = useT();
  const locale = useAppStore((state) => state.locale);
  const setLocale = useAppStore((state) => state.setLocale);
  const shareTripsPublicly = useAppStore((state) => state.shareTripsPublicly);
  const setShareTripsPublicly = useAppStore((state) => state.setShareTripsPublicly);
  const bikeType = useAppStore((state) => state.bikeType);
  const setBikeType = useAppStore((state) => state.setBikeType);
  const cyclingFrequency = useAppStore((state) => state.cyclingFrequency);
  const setCyclingFrequency = useAppStore((state) => state.setCyclingFrequency);
  const avoidUnpaved = useAppStore((state) => state.avoidUnpaved);
  const setAvoidUnpaved = useAppStore((state) => state.setAvoidUnpaved);
  const showRouteComparison = useAppStore((state) => state.showRouteComparison);
  const setShowRouteComparison = useAppStore((state) => state.setShowRouteComparison);
  const notifyWeather = useAppStore((state) => state.notifyWeather);
  const setNotifyWeather = useAppStore((state) => state.setNotifyWeather);
  const notifyHazard = useAppStore((state) => state.notifyHazard);
  const setNotifyHazard = useAppStore((state) => state.setNotifyHazard);
  const notifyCommunity = useAppStore((state) => state.notifyCommunity);
  const setNotifyCommunity = useAppStore((state) => state.setNotifyCommunity);
  const quietHoursStart = useAppStore((state) => state.quietHoursStart);
  const quietHoursEnd = useAppStore((state) => state.quietHoursEnd);
  const setQuietHours = useAppStore((state) => state.setQuietHours);
  const showBicycleLanes = useAppStore((state) => state.showBicycleLanes);
  const setShowBicycleLanes = useAppStore((state) => state.setShowBicycleLanes);
  const poiVisibility = useAppStore((state) => state.poiVisibility);
  const setPoiVisibility = useAppStore((state) => state.setPoiVisibility);

  const poiCategories = [
    { key: 'hydration' as const, label: t('profile.poiWater'), description: t('profile.poiWaterDesc') },
    { key: 'repair' as const, label: t('profile.poiRepair'), description: t('profile.poiRepairDesc') },
    { key: 'bikeRental' as const, label: t('profile.poiRental'), description: t('profile.poiRentalDesc') },
    { key: 'bikeParking' as const, label: t('profile.poiParking'), description: t('profile.poiParkingDesc') },
    { key: 'restroom' as const, label: t('profile.poiRestroom'), description: t('profile.poiRestroomDesc') },
    { key: 'supplies' as const, label: t('profile.poiSupplies'), description: t('profile.poiSuppliesDesc') },
  ];

  // -- Inner components (need access to themed `styles` and `colors`) --------

  const DropdownPicker = ({ label, value, options, onSelect, placeholder = 'Select...' }: {
    label: string;
    value: string | null;
    options: readonly string[];
    onSelect: (value: string) => void;
    placeholder?: string;
  }) => {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Pressable
          style={styles.settingRow}
          onPress={() => setOpen(true)}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value ?? placeholder}`}
        >
          <View style={styles.settingTextCol}>
            <Text style={styles.settingLabel}>{label}</Text>
            <Text style={styles.settingDescription}>{value ?? placeholder}</Text>
          </View>
          <Ionicons name="chevron-down" size={18} color={gray[400]} />
        </Pressable>

        <Modal
          visible={open}
          transparent
          animationType="fade"
          onRequestClose={() => setOpen(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setOpen(false)}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Dismiss picker"
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{label}</Text>
              <ScrollView style={styles.optionsList} bounces={false}>
                {options.map((option) => (
                  <Pressable
                    key={option}
                    style={[styles.optionRow, value === option && styles.optionRowSelected]}
                    onPress={() => {
                      onSelect(option);
                      setOpen(false);
                    }}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel={option}
                    accessibilityState={{ selected: value === option }}
                  >
                    <Text style={[styles.optionText, value === option && styles.optionTextSelected]}>
                      {option}
                    </Text>
                    {value === option ? (
                      <Ionicons name="checkmark" size={20} color={colors.accent} />
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      </>
    );
  };

  const AchievementsRow = () => {
    const { data } = useBadges();
    const earned = data?.earned.length ?? 0;
    const total = data?.definitions.length ?? 0;

    return (
      <Pressable
        onPress={() => router.push('/achievements' as any)}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Achievements"
      >
        <View style={styles.achievementsCard}>
          <View style={styles.achievementsRow}>
            <Ionicons name="trophy-outline" size={24} color={colors.accent} />
            <View style={styles.achievementsTextCol}>
              <Text style={styles.achievementsCount}>
                {earned} / {total} badges earned
              </Text>
              <View style={styles.achievementsBarTrack}>
                <View
                  style={[
                    styles.achievementsBarFill,
                    { width: total > 0 ? `${Math.round((earned / total) * 100)}%` : '0%' },
                  ]}
                />
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={gray[400]} />
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Screen
          title={t('profile.title')}
          subtitle={t('profile.subtitle')}
          contentBottomPadding={insets.bottom + layout.bottomNavHeight + space[4]}
        >
          {/* ── Badges (top of profile) ──────────────────────────── */}
          <AchievementsRow />

          {/* ── Section 1: Cycling Preferences ─────────────────────── */}
          <View style={styles.section}>
            <SectionTitle variant="accent">{t('profile.sectionCycling')}</SectionTitle>

            <DropdownPicker
              label={t('profile.bikeType')}
              value={bikeType}
              options={BIKE_TYPE_KEYS.map((k) => t(k))}
              onSelect={setBikeType}
              placeholder={t('profile.selectBikeType')}
            />

            <DropdownPicker
              label={t('profile.cyclingFrequency')}
              value={cyclingFrequency}
              options={CYCLING_FREQUENCY_KEYS.map((k) => t(k))}
              onSelect={setCyclingFrequency}
              placeholder={t('profile.howOften')}
            />

            <SettingRow
              label={t('profile.avoidUnpaved')}
              description={avoidUnpaved ? t('profile.avoidUnpavedOn') : t('profile.avoidUnpavedOff')}
              checked={avoidUnpaved}
              onChange={setAvoidUnpaved}
            />

            <SettingRow
              label={t('profile.compareRoutes')}
              description={showRouteComparison ? t('profile.compareRoutesOn') : t('profile.compareRoutesOff')}
              checked={showRouteComparison}
              onChange={setShowRouteComparison}
            />
          </View>

          {/* ── Section 2: Display ────────────────────────────────── */}
          <View style={styles.section}>
            <SectionTitle variant="accent">{t('profile.sectionDisplay')}</SectionTitle>

            <View style={styles.languageRow}>
              {(['en', 'ro'] as const).map((loc) => (
                <Pressable
                  key={loc}
                  style={[styles.languagePill, locale === loc && styles.languagePillActive]}
                  onPress={() => setLocale(loc)}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel={loc === 'en' ? 'English' : 'Romana'}
                  accessibilityState={{ selected: locale === loc }}
                >
                  <Text style={[styles.languagePillText, locale === loc && styles.languagePillTextActive]}>
                    {loc === 'en' ? 'English' : 'Română'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <SettingRow
              label={t('profile.showBikeLanes')}
              description={showBicycleLanes ? t('profile.showBikeLanesOn') : t('profile.showBikeLanesOff')}
              checked={showBicycleLanes}
              onChange={setShowBicycleLanes}
            />

            {poiCategories.map((cat) => (
              <SettingRow
                key={cat.key}
                label={cat.label}
                description={cat.description}
                checked={poiVisibility[cat.key]}
                onChange={(checked) => setPoiVisibility(cat.key, checked)}
              />
            ))}

            <SettingRow
              label={t('profile.dailyWeather')}
              description={notifyWeather ? t('profile.dailyWeatherOn') : t('profile.dailyWeatherOff')}
              checked={notifyWeather}
              onChange={setNotifyWeather}
            />

            <SettingRow
              label={t('profile.hazardAlerts')}
              description={notifyHazard ? t('profile.hazardAlertsOn') : t('profile.hazardAlertsOff')}
              checked={notifyHazard}
              onChange={setNotifyHazard}
            />

            <SettingRow
              label={t('profile.community')}
              description={notifyCommunity ? t('profile.communityOn') : t('profile.communityOff')}
              checked={notifyCommunity}
              onChange={setNotifyCommunity}
            />

            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <Text style={styles.settingLabel}>{t('profile.quietHours')}</Text>
                <Text style={styles.settingDescription}>
                  {t('profile.quietHoursDesc', { start: quietHoursStart, end: quietHoursEnd })}
                </Text>
              </View>
              <Ionicons name="time-outline" size={20} color={gray[400]} />
            </View>
          </View>

          {/* ── Section 3: Account ────────────────────────────────── */}
          <View style={styles.section}>
            <SectionTitle variant="accent">{t('profile.sectionAccount')}</SectionTitle>

            {user ? (
              <View style={styles.userCard}>
                <Pressable
                  onPress={handleAvatarPick}
                  style={styles.avatarWrapper}
                  accessible={true}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="Change profile photo"
                >
                  {avatarUploading ? (
                    <View style={styles.avatarPlaceholder}>
                      <ActivityIndicator color={colors.accent} />
                    </View>
                  ) : profile?.avatarUrl ? (
                    <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Ionicons name="camera-outline" size={22} color={gray[400]} />
                    </View>
                  )}
                </Pressable>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>
                    {profile?.username ? `@${profile.username}` : user.email ?? t('profile.rider')}
                  </Text>
                  <Text style={styles.userSub}>
                    {profile?.username ? user.email ?? t('common.signedIn') : t('common.signedIn')}
                  </Text>
                  {!editingUsername ? (
                    <Pressable
                      onPress={() => {
                        setEditingUsername(true);
                        setUsernameInput(profile?.username ?? '');
                        setUsernameError(null);
                      }}
                      hitSlop={8}
                      accessible={true}
                      accessibilityRole="button"
                      accessibilityLabel={profile?.username ? t('profile.changeUsername') : t('profile.setUsername')}
                    >
                      <Text style={styles.editUsernameLink}>
                        {profile?.username ? t('profile.changeUsername') : t('profile.setUsername')}
                      </Text>
                    </Pressable>
                  ) : (
                    <View style={styles.usernameEditRow}>
                      <Text style={styles.usernameAt}>@</Text>
                      <TextInput
                        style={styles.usernameInput}
                        value={usernameInput}
                        onChangeText={(t) => { setUsernameInput(t.replace(/[^a-zA-Z0-9_]/g, '')); setUsernameError(null); }}
                        placeholder="username"
                        placeholderTextColor={gray[500]}
                        autoCapitalize="none"
                        autoCorrect={false}
                        maxLength={30}
                        autoFocus
                      />
                      <Pressable
                        onPress={async () => {
                          if (usernameInput.length < 3) { setUsernameError('Min 3 characters'); return; }
                          setUsernameSaving(true);
                          try {
                            await mobileApi.updateProfile({ username: usernameInput.toLowerCase() });
                            setEditingUsername(false);
                            void refetchProfile();
                          } catch (err: unknown) {
                            const msg = err instanceof Error ? err.message : 'Failed';
                            setUsernameError(msg.includes('taken') || msg.includes('409') ? 'Username taken' : msg);
                          } finally {
                            setUsernameSaving(false);
                          }
                        }}
                        style={styles.usernameSaveBtn}
                        disabled={usernameSaving}
                        accessible={true}
                        accessibilityRole="button"
                        accessibilityLabel="Save username"
                      >
                        <Text style={styles.usernameSaveText}>{usernameSaving ? '...' : 'Save'}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setEditingUsername(false)}
                        hitSlop={8}
                        accessible={true}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel username edit"
                      >
                        <Ionicons name="close" size={18} color={gray[400]} />
                      </Pressable>
                    </View>
                  )}
                  {usernameError ? <Text style={styles.usernameError}>{usernameError}</Text> : null}
                </View>
              </View>
            ) : (
              <Pressable
                style={styles.userCard}
                onPress={() => router.push('/auth')}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={t('profile.tapToSignIn')}
              >
                <Ionicons name="person-circle-outline" size={48} color={gray[500]} />
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{t('common.guest')}</Text>
                  <Text style={styles.userSub}>{t('profile.tapToSignIn')}</Text>
                </View>
                <Ionicons name="log-in-outline" size={24} color={colors.accent} />
              </Pressable>
            )}

            <SettingRow
              label={t('profile.shareTrips')}
              description={shareTripsPublicly ? t('profile.shareTripsOn') : t('profile.shareTripsOff')}
              checked={shareTripsPublicly}
              onChange={setShareTripsPublicly}
            />

            {user ? (
              <Pressable
                style={styles.signOutButton}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={t('profile.signOut')}
                onPress={() => {
                  Alert.alert(t('profile.signOut'), t('profile.signOutConfirm'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('profile.signOut'),
                      style: 'destructive',
                      onPress: async () => {
                        // Reset onboarding and create anonymous session,
                        // then navigate directly to onboarding
                        useAppStore.getState().setOnboardingCompleted(false);
                        await signOut();
                        await signInAnonymously();
                        router.replace('/onboarding' as any);
                      },
                    },
                  ]);
                }}
              >
                <Ionicons name="log-out-outline" size={20} color={colors.danger} />
                <Text style={styles.signOutText}>{t('profile.signOut')}</Text>
              </Pressable>
            ) : null}
          </View>
        </Screen>
      </View>
      <BottomNav activeTab="profile" onTabPress={handleTabPress} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Themed style factory — colors come from useTheme(), layout stays static
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgDeep },
    content: { flex: 1 },
    userCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[4],
      padding: space[4],
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: surfaceTints.glass,
    },
    avatarWrapper: {
      position: 'relative',
    },
    avatarImage: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 2,
      borderColor: colors.accent,
    },
    avatarPlaceholder: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 1.5,
      borderColor: gray[600],
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: surfaceTints.whiteSubtle,
    },
    userInfo: { flex: 1, gap: space[1] },
    userName: {
      ...textBase,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
      fontSize: 16,
    },
    userSub: {
      ...textSm,
      color: colors.textSecondary,
    },
    editUsernameLink: {
      ...textXs,
      color: colors.accent,
      fontFamily: fontFamily.body.medium,
      marginTop: 2,
    },
    usernameEditRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: space[1],
    },
    usernameAt: {
      fontFamily: fontFamily.mono.bold,
      fontSize: 14,
      color: colors.accent,
    },
    usernameInput: {
      flex: 1,
      fontFamily: fontFamily.mono.medium,
      fontSize: 14,
      color: colors.textPrimary,
      borderBottomWidth: 1,
      borderBottomColor: colors.accent,
      paddingVertical: 2,
    },
    usernameSaveBtn: {
      paddingHorizontal: space[2],
      paddingVertical: space[1],
      backgroundColor: colors.accent,
      borderRadius: radii.sm,
    },
    usernameSaveText: {
      fontFamily: fontFamily.body.bold,
      fontSize: 12,
      color: colors.textInverse,
    },
    usernameError: {
      ...textXs,
      color: colors.danger,
      marginTop: 2,
    },
    section: {
      gap: space[3],
    },
    languageRow: {
      flexDirection: 'row',
      gap: space[2],
    },
    languagePill: {
      paddingHorizontal: space[4],
      paddingVertical: space[2],
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: gray[600],
    },
    languagePillActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    languagePillText: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: gray[400],
    },
    languagePillTextActive: {
      color: colors.textInverse,
      fontFamily: fontFamily.body.bold,
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: space[4],
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: surfaceTints.glass,
    },
    settingTextCol: { flex: 1, gap: space[1], marginRight: space[3] },
    settingLabel: {
      ...textBase,
      fontFamily: fontFamily.body.medium,
      color: colors.textPrimary,
    },
    settingDescription: {
      ...textSm,
      color: colors.textSecondary,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: surfaceTints.scrim,
      justifyContent: 'center',
      alignItems: 'center',
      padding: space[6],
    },
    modalContent: {
      width: '100%',
      maxHeight: '70%',
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgDeep,
      padding: space[5],
      gap: space[4],
    },
    modalTitle: {
      ...textBase,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
      fontSize: 18,
      textAlign: 'center',
    },
    optionsList: {
      maxHeight: 300,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: space[3] + space[0.5],
      paddingHorizontal: space[4],
      borderRadius: radii.lg,
    },
    optionRowSelected: {
      backgroundColor: brandTints.accentLight,
    },
    optionText: {
      ...textBase,
      fontFamily: fontFamily.body.regular,
      color: colors.textPrimary,
    },
    optionTextSelected: {
      fontFamily: fontFamily.body.medium,
      color: colors.accent,
    },
    signOutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[2],
      paddingVertical: space[4],
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: safetyTints.dangerBorder,
      backgroundColor: 'rgba(239, 68, 68, 0.08)',
    },
    signOutText: {
      ...textBase,
      fontFamily: fontFamily.body.medium,
      color: colors.danger,
    },
    achievementsCard: {
      backgroundColor: surfaceTints.glass,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      padding: space[4],
    },
    achievementsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
    },
    achievementsTextCol: {
      flex: 1,
      gap: space[2],
    },
    achievementsCount: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.textPrimary,
    },
    achievementsBarTrack: {
      height: 4,
      borderRadius: radii.sm,
      backgroundColor: colors.bgTertiary,
      overflow: 'hidden',
    },
    achievementsBarFill: {
      height: 4,
      borderRadius: radii.sm,
      backgroundColor: colors.accent,
    },
  });
