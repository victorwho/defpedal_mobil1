import { router } from 'expo-router';
import { Alert, Image, Share } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
// expo-image-picker uses Expo Modules API (not classic NativeModules bridge).
// requireOptionalNativeModule returns null if module isn't installed.
import { requireOptionalNativeModule } from 'expo-modules-core';
const hasImagePicker = Boolean(requireOptionalNativeModule('ExponentImagePicker'));
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
import { useShallow } from 'zustand/shallow';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useT } from '../src/hooks/useTranslation';
import { useConfirmation } from '../src/hooks/useConfirmation';
import { useBadges } from '../src/hooks/useBadges';
import { useTiers } from '../src/hooks/useTiers';
import { TierRankCard } from '../src/design-system/organisms/TierRankCard';
import { brandTints, safetyTints, surfaceTints } from '../src/design-system/tokens/tints';

const BIKE_TYPE_KEYS = [
  'profile.bikeRoad', 'profile.bikeCity', 'profile.bikeMountain',
  'profile.bikeEbike', 'profile.bikeRecumbent', 'profile.bikeOther',
] as const;

const CYCLING_FREQUENCY_KEYS = [
  'profile.freqDaily', 'profile.freqSeveralWeek', 'profile.freqOnceWeek',
  'profile.freqFewMonth', 'profile.freqOnceMonth', 'profile.freqRarely',
] as const;

import { useFollowRequests, useApproveFollowRequest, useDeclineFollowRequest } from '../src/hooks/useFollow';
import { FollowRequestItem } from '../src/design-system/molecules/FollowRequestItem';
import { handleTabPress } from '../src/lib/navigation-helpers';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { user, isAnonymous, signOut, signInAnonymously } = useAuthSession();
  const confirm = useConfirmation();
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

      // Use new expo-file-system File class (implements Blob) for Supabase upload
      const { File: ExpoFile } = require('expo-file-system') as typeof import('expo-file-system');
      const file = new ExpoFile(asset.uri);
      const bytes = await file.bytes();

      const { error: uploadError } = await supabaseClient.storage
        .from('avatars')
        .upload(path, bytes, { upsert: true, contentType: asset.mimeType ?? 'image/jpeg' });

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

  // ---------------------------------------------------------------------------
  // Consolidated store selectors (batched for performance)
  // ---------------------------------------------------------------------------

  // State values - grouped by section with shallow comparison
  const {
    locale, bikeType, cyclingFrequency, avoidUnpaved, avoidHills, showRouteComparison,
    shareTripsPublicly, themePreference, showBicycleLanes, poiVisibility,
    notifyWeather, notifyHazard, notifyCommunity, quietHoursStart, quietHoursEnd,
    shareConversionFeedOptin,
  } = useAppStore(useShallow((state) => ({
    locale: state.locale,
    bikeType: state.bikeType,
    cyclingFrequency: state.cyclingFrequency,
    avoidUnpaved: state.avoidUnpaved,
    avoidHills: state.avoidHills,
    showRouteComparison: state.showRouteComparison,
    shareTripsPublicly: state.shareTripsPublicly,
    themePreference: state.themePreference,
    showBicycleLanes: state.showBicycleLanes,
    poiVisibility: state.poiVisibility,
    notifyWeather: state.notifyWeather,
    notifyHazard: state.notifyHazard,
    notifyCommunity: state.notifyCommunity,
    quietHoursStart: state.quietHoursStart,
    quietHoursEnd: state.quietHoursEnd,
    shareConversionFeedOptin: state.shareConversionFeedOptin,
  })));

  // Actions - stable references, single selector with shallow comparison
  const {
    setLocale, setBikeType, setCyclingFrequency, setAvoidUnpaved, setAvoidHills,
    setShowRouteComparison, setShareTripsPublicly, setThemePreference,
    setShowBicycleLanes, setPoiVisibility, setNotifyWeather,
    setNotifyHazard, setNotifyCommunity, setQuietHours,
    setShareConversionFeedOptin,
  } = useAppStore(useShallow((state) => ({
    setLocale: state.setLocale,
    setBikeType: state.setBikeType,
    setCyclingFrequency: state.setCyclingFrequency,
    setAvoidUnpaved: state.setAvoidUnpaved,
    setAvoidHills: state.setAvoidHills,
    setShowRouteComparison: state.setShowRouteComparison,
    setShareTripsPublicly: state.setShareTripsPublicly,
    setThemePreference: state.setThemePreference,
    setShowBicycleLanes: state.setShowBicycleLanes,
    setPoiVisibility: state.setPoiVisibility,
    setNotifyWeather: state.setNotifyWeather,
    setNotifyHazard: state.setNotifyHazard,
    setNotifyCommunity: state.setNotifyCommunity,
    setQuietHours: state.setQuietHours,
    setShareConversionFeedOptin: state.setShareConversionFeedOptin,
  })));

  // Sync a single notification preference to the backend (fire-and-forget).
  // Always includes the device timezone so quiet hours are enforced in the
  // correct zone.
  const syncNotifPref = useCallback(
    (fields: Record<string, unknown>) => {
      if (!user) return;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      mobileApi
        .updateProfile({ ...fields, quietHoursTimezone: tz } as Parameters<typeof mobileApi.updateProfile>[0])
        .catch(() => {/* best-effort sync */});
    },
    [user],
  );

  // On first load, push local notification prefs + device timezone to the
  // server so quiet hours enforcement uses the correct values.
  const initialSyncDone = useRef(false);
  useEffect(() => {
    if (!user || initialSyncDone.current) return;
    initialSyncDone.current = true;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    mobileApi
      .updateProfile({
        notifyWeather,
        notifyHazard,
        notifyCommunity,
        quietHoursStart,
        quietHoursEnd,
        quietHoursTimezone: tz,
        shareConversionFeedOptin,
      })
      .catch(() => {/* best-effort */});
  }, [user, notifyWeather, notifyHazard, notifyCommunity, quietHoursStart, quietHoursEnd, shareConversionFeedOptin]);

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

  const TierRankSection = () => {
    const { data: tiersData } = useTiers();
    if (!tiersData) return null;

    return (
      <View style={{ marginBottom: space[3] }}>
        <TierRankCard
          totalXp={tiersData.totalXp}
          riderTier={tiersData.riderTier as any}
          showMascot={true}
        />
      </View>
    );
  };

  const MiaJourneyRow = () => {
    const persona = useAppStore((s) => s.persona);
    const miaJourneyStatus = useAppStore((s) => s.miaJourneyStatus);
    const miaJourneyLevel = useAppStore((s) => s.miaJourneyLevel);

    if (persona !== 'mia' && miaJourneyStatus !== 'completed') return null;

    // Completed journey — show static "Confident Cyclist" row
    if (miaJourneyStatus === 'completed') {
      return (
        <View style={styles.achievementsCard}>
          <View style={styles.achievementsRow}>
            <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
            <View style={styles.achievementsTextCol}>
              <Text style={styles.achievementsCount}>Confident Cyclist</Text>
            </View>
          </View>
          {/* Referral row */}
          <Pressable
            onPress={() => {
              const referralUrl = Linking.createURL('/', { queryParams: { persona: 'mia' } });
              void Share.share({
                message: `Start your cycling journey with Defensive Pedal! ${referralUrl} #DefensivePedal`,
              });
            }}
            style={styles.helpFaqRow}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Help a friend start their journey"
          >
            <Ionicons name="heart-outline" size={22} color={colors.accent} />
            <View style={styles.settingTextCol}>
              <Text style={styles.settingLabel}>Help a friend start their journey</Text>
              <Text style={styles.settingDescription}>Share a referral link with ?persona=mia</Text>
            </View>
            <Ionicons name="share-social-outline" size={18} color={gray[400]} />
          </Pressable>
        </View>
      );
    }

    // Active journey — show "My Cycling Journey" row
    if (miaJourneyStatus === 'active') {
      const levelIcons: Record<number, keyof typeof Ionicons.glyphMap> = {
        1: 'bicycle', 2: 'shield-checkmark', 3: 'cafe', 4: 'compass', 5: 'star',
      };
      return (
        <Pressable
          onPress={() => router.push('/impact-dashboard' as any)}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="My Cycling Journey"
        >
          <View style={styles.achievementsCard}>
            <View style={styles.achievementsRow}>
              <Ionicons
                name={levelIcons[miaJourneyLevel] ?? 'bicycle'}
                size={24}
                color={colors.accent}
              />
              <View style={styles.achievementsTextCol}>
                <Text style={styles.achievementsCount}>My Cycling Journey</Text>
                <Text style={[styles.settingDescription, { marginTop: 2 }]}>
                  Level {miaJourneyLevel}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={gray[400]} />
            </View>
          </View>
        </Pressable>
      );
    }

    return null;
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
          {/* ── User card (signed-in or guest prompt) ──────────── */}
          {user && !isAnonymous ? (
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
                <Text style={styles.userName}>{isAnonymous ? 'Anonymous' : t('common.guest')}</Text>
                <Text style={styles.userSub}>{t('profile.tapToSignIn')}</Text>
              </View>
              <Ionicons name="log-in-outline" size={24} color={colors.accent} />
            </Pressable>
          )}

          {/* ── Progression ─────────────────────────────────────────── */}
          <TierRankSection />
          <AchievementsRow />
          <MiaJourneyRow />

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

            {/* Theme picker */}
            <View style={styles.languageRow}>
              {(['dark', 'light', 'system'] as const).map((pref) => (
                <Pressable
                  key={pref}
                  style={[styles.languagePill, themePreference === pref && styles.languagePillActive]}
                  onPress={() => setThemePreference(pref)}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel={`${pref} theme`}
                  accessibilityState={{ selected: themePreference === pref }}
                >
                  <Text style={[styles.languagePillText, themePreference === pref && styles.languagePillTextActive]}>
                    {pref === 'dark' ? t('profile.themeDark') : pref === 'light' ? t('profile.themeLight') : t('profile.themeSystem')}
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
              onChange={(checked) => { setNotifyWeather(checked); syncNotifPref({ notifyWeather: checked }); }}
            />

            <SettingRow
              label={t('profile.hazardAlerts')}
              description={notifyHazard ? t('profile.hazardAlertsOn') : t('profile.hazardAlertsOff')}
              checked={notifyHazard}
              onChange={(checked) => { setNotifyHazard(checked); syncNotifPref({ notifyHazard: checked }); }}
            />

            <SettingRow
              label={t('profile.community')}
              description={notifyCommunity ? t('profile.communityOn') : t('profile.communityOff')}
              checked={notifyCommunity}
              onChange={(checked) => { setNotifyCommunity(checked); syncNotifPref({ notifyCommunity: checked }); }}
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

            <SettingRow
              label={t('profile.shareTrips')}
              description={shareTripsPublicly ? t('profile.shareTripsOn') : t('profile.shareTripsOff')}
              checked={shareTripsPublicly}
              onChange={setShareTripsPublicly}
            />

            {/* Slice 8: sharer controls whether successful claims publish
                a route_share_signup card to their activity feed. XP/badges
                ship regardless — this is only the feed fork. */}
            <SettingRow
              label="Share activity feed"
              description={
                shareConversionFeedOptin
                  ? 'Your followers see when someone signs up via your shared routes.'
                  : 'Signups via your shares stay private — you still earn XP and badges.'
              }
              checked={shareConversionFeedOptin}
              onChange={(checked) => {
                setShareConversionFeedOptin(checked);
                void mobileApi
                  .updateProfile({ shareConversionFeedOptin: checked })
                  .catch(() => {/* best-effort */});
              }}
            />

            {/* Compliance plan item 13: by default we auto-truncate raw GPS
                breadcrumbs from rides older than 90 days. This toggle opts
                the user into keeping the full breadcrumb stream forever
                (until account deletion). Trip summaries — distance, CO2,
                badges, XP — are unaffected either way. */}
            <SettingRow
              label={t('profile.keepFullGpsHistory')}
              description={
                profile?.keepFullGpsHistory
                  ? t('profile.keepFullGpsHistoryOn')
                  : t('profile.keepFullGpsHistoryOff')
              }
              checked={Boolean(profile?.keepFullGpsHistory)}
              onChange={(checked) => {
                void mobileApi
                  .updateProfile({ keepFullGpsHistory: checked })
                  .then(() => refetchProfile())
                  .catch(() => {/* best-effort */});
              }}
            />

            <Pressable
              style={styles.helpFaqRow}
              onPress={() => router.push('/my-shares' as any)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="My shared routes"
            >
              <Ionicons name="share-social-outline" size={22} color={colors.accent} />
              <View style={styles.settingTextCol}>
                <Text style={styles.settingLabel}>My shared routes</Text>
                <Text style={styles.settingDescription}>See opens, signups, and revoke stale links.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={gray[400]} />
            </Pressable>

            <PrivateProfileSection
              isPrivate={profile?.isPrivate ?? false}
              onToggle={(value) => {
                void mobileApi.updateProfile({ isPrivate: value });
                void refetchProfile();
              }}
              styles={styles}
              colors={colors}
            />

            <Pressable
              style={styles.helpFaqRow}
              onPress={() => router.push('/privacy-analytics' as any)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={t('privacyAnalytics.title')}
            >
              <Ionicons name="analytics-outline" size={22} color={colors.accent} />
              <View style={styles.settingTextCol}>
                <Text style={styles.settingLabel}>{t('privacyAnalytics.title')}</Text>
                <Text style={styles.settingDescription}>{t('privacyAnalytics.profileRowSub')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={gray[400]} />
            </Pressable>

            {user && !isAnonymous ? (
              <Pressable
                style={styles.helpFaqRow}
                onPress={() => router.push('/blocked-users' as any)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={t('blockedUsers.title')}
              >
                <Ionicons name="ban-outline" size={22} color={colors.accent} />
                <View style={styles.settingTextCol}>
                  <Text style={styles.settingLabel}>{t('blockedUsers.title')}</Text>
                  <Text style={styles.settingDescription}>{t('blockedUsers.profileRowSub')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={gray[400]} />
              </Pressable>
            ) : null}

            <Pressable
              style={styles.helpFaqRow}
              onPress={() => router.push('/faq' as any)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={t('settings.helpFaq')}
            >
              <Ionicons name="help-circle-outline" size={22} color={colors.accent} />
              <View style={styles.settingTextCol}>
                <Text style={styles.settingLabel}>{t('settings.helpFaq')}</Text>
                <Text style={styles.settingDescription}>{t('settings.helpFaqSub')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={gray[400]} />
            </Pressable>

            {mobileEnv.appVariant !== 'production' ? (
              <Pressable
                style={styles.helpFaqRow}
                onPress={() => router.push('/diagnostics' as any)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Diagnostics"
              >
                <Ionicons name="pulse-outline" size={22} color={colors.accent} />
                <View style={styles.settingTextCol}>
                  <Text style={styles.settingLabel}>Diagnostics</Text>
                  <Text style={styles.settingDescription}>Signup-gate state, connectivity, and app internals for QA</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={gray[400]} />
              </Pressable>
            ) : null}

            {user && !isAnonymous ? (
              <Pressable
                style={styles.signOutButton}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={t('profile.signOut')}
                onPress={() => {
                  confirm({
                    title: t('profile.signOut'),
                    message: t('profile.signOutConfirm'),
                    confirmLabel: t('profile.signOut'),
                    onConfirm: async () => {
                      useAppStore.getState().setOnboardingCompleted(false);
                      await signOut();
                      await signInAnonymously();
                      router.replace('/onboarding' as any);
                    },
                  });
                }}
              >
                <Ionicons name="log-out-outline" size={20} color={colors.danger} />
                <Text style={styles.signOutText}>{t('profile.signOut')}</Text>
              </Pressable>
            ) : null}

            {/* Compliance: Play Store User Data policy + GDPR Art. 17 require
                an in-app account deletion path. The destination screen handles
                the typed-DELETE confirmation, the API call, and the post-delete
                sign-out + redirect. Visible to authenticated (non-anonymous)
                users only — anonymous accounts have nothing server-side to delete. */}
            {user && !isAnonymous ? (
              <Pressable
                style={styles.helpFaqRow}
                onPress={() => router.push('/delete-account' as any)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={t('profile.deleteAccount')}
              >
                <Ionicons name="trash-outline" size={22} color={colors.danger} />
                <View style={styles.settingTextCol}>
                  <Text style={[styles.settingLabel, { color: colors.danger }]}>
                    {t('profile.deleteAccount')}
                  </Text>
                  <Text style={styles.settingDescription}>{t('profile.deleteAccountSub')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={gray[400]} />
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
// PrivateProfileSection — toggle + follow requests list
// ---------------------------------------------------------------------------

interface PrivateProfileSectionProps {
  isPrivate: boolean;
  onToggle: (value: boolean) => void;
  styles: ReturnType<typeof createThemedStyles>;
  colors: ThemeColors;
}

function PrivateProfileSection({ isPrivate, onToggle, styles, colors }: PrivateProfileSectionProps) {
  const t = useT();
  const { data: requestsData } = useFollowRequests();
  const approveRequest = useApproveFollowRequest();
  const declineRequest = useDeclineFollowRequest();

  const requests = requestsData?.requests ?? [];

  const handleApprove = useCallback(
    (id: string) => { approveRequest.mutate(id); },
    [approveRequest],
  );

  const handleDecline = useCallback(
    (id: string) => { declineRequest.mutate(id); },
    [declineRequest],
  );

  return (
    <>
      <SettingRow
        label="Private Profile"
        description={
          isPrivate
            ? 'Only approved followers can see your rides'
            : 'Anyone can follow you and see your rides'
        }
        checked={isPrivate}
        onChange={onToggle}
      />

      {isPrivate && requests.length > 0 && (
        <View style={styles.followRequestsSection}>
          <View style={styles.followRequestsHeader}>
            <Text style={styles.followRequestsTitle}>Follow Requests</Text>
            <View style={styles.followRequestsBadge}>
              <Text style={styles.followRequestsBadgeText}>{requests.length}</Text>
            </View>
          </View>
          {requests.map((req) => (
            <FollowRequestItem
              key={req.id}
              request={req}
              onApprove={handleApprove}
              onDecline={handleDecline}
              context={req.context}
            />
          ))}
        </View>
      )}
    </>
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
      backgroundColor: colors.bgPrimary,
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
      borderColor: colors.borderDefault,
    },
    languagePillActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    languagePillText: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.textSecondary,
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
      backgroundColor: colors.bgPrimary,
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
    helpFaqRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      padding: space[4],
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgPrimary,
    },
    achievementsCard: {
      backgroundColor: colors.bgPrimary,
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
    followRequestsSection: {
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgPrimary,
      overflow: 'hidden',
    },
    followRequestsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      paddingHorizontal: space[4],
      paddingTop: space[3],
      paddingBottom: space[2],
    },
    followRequestsTitle: {
      ...textBase,
      fontFamily: fontFamily.body.medium,
      color: colors.textPrimary,
    },
    followRequestsBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space[1],
    },
    followRequestsBadgeText: {
      fontSize: 12,
      fontFamily: fontFamily.body.bold,
      color: colors.textInverse,
    },
  });
