import type { GuardianTier, ImpactDashboard } from '@defensivepedal/core';
import { router } from 'expo-router';
import { Alert, Image, NativeModules } from 'react-native';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
// expo-image-picker is a native module — lazy require to avoid crash if not in APK
const hasImagePicker = Boolean(NativeModules.ExpoImagePicker);
import { useQuery } from '@tanstack/react-query';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../src/components/Screen';
import { BottomNav } from '../src/design-system/organisms/BottomNav';
import { brandColors, darkTheme, gray, safetyColors } from '../src/design-system/tokens/colors';
import { fontFamily, textBase, textSm, textXs } from '../src/design-system/tokens/typography';
import { layout, space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { mobileApi } from '../src/lib/api';
import { supabaseClient } from '../src/lib/supabase';
import { mobileEnv } from '../src/lib/env';
import { useAppStore } from '../src/store/appStore';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useT } from '../src/hooks/useTranslation';

const GUARDIAN_TIER_CONFIG: Record<GuardianTier, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; min: number }> = {
  reporter: { label: 'Reporter', icon: 'clipboard-outline', color: '#9CA3AF', min: 0 },
  watchdog: { label: 'Watchdog', icon: 'eye-outline', color: '#60A5FA', min: 5 },
  sentinel: { label: 'Sentinel', icon: 'shield-outline', color: '#A78BFA', min: 15 },
  guardian_angel: { label: 'Guardian Angel', icon: 'shield-checkmark', color: '#FACC15', min: 50 },
};

const BIKE_TYPE_KEYS = [
  'profile.bikeRoad', 'profile.bikeCity', 'profile.bikeMountain',
  'profile.bikeEbike', 'profile.bikeRecumbent', 'profile.bikeOther',
] as const;

const CYCLING_FREQUENCY_KEYS = [
  'profile.freqDaily', 'profile.freqSeveralWeek', 'profile.freqOnceWeek',
  'profile.freqFewMonth', 'profile.freqOnceMonth', 'profile.freqRarely',
] as const;

import { handleTabPress } from '../src/lib/navigation-helpers';

type DropdownPickerProps = {
  label: string;
  value: string | null;
  options: readonly string[];
  onSelect: (value: string) => void;
  placeholder?: string;
};

const DropdownPicker = ({ label, value, options, onSelect, placeholder = 'Select...' }: DropdownPickerProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable style={styles.settingRow} onPress={() => setOpen(true)}>
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
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
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
                >
                  <Text style={[styles.optionText, value === option && styles.optionTextSelected]}>
                    {option}
                  </Text>
                  {value === option ? (
                    <Ionicons name="checkmark" size={20} color={brandColors.accent} />
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

const GuardianSection = () => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data } = useQuery<ImpactDashboard>({
    queryKey: ['impact-dashboard-profile'],
    queryFn: () => mobileApi.fetchImpactDashboard(tz),
    staleTime: 5 * 60_000,
  });

  if (!data) return null;

  const tier = GUARDIAN_TIER_CONFIG[data.guardianTier];
  const tiers = Object.entries(GUARDIAN_TIER_CONFIG) as [GuardianTier, typeof tier][];
  const currentIdx = tiers.findIndex(([t]) => t === data.guardianTier);
  const nextTier = tiers[currentIdx + 1];
  const remaining = nextTier ? nextTier[1].min - data.totalHazardsReported : 0;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Guardian tier</Text>
      <View style={styles.guardianCard}>
        <View style={styles.guardianRow}>
          <View style={[styles.guardianBadge, { borderColor: tier.color }]}>
            <Ionicons name={tier.icon} size={24} color={tier.color} />
          </View>
          <View style={styles.guardianTextCol}>
            <Text style={[styles.guardianTierName, { color: tier.color }]}>{tier.label}</Text>
            <Text style={styles.guardianHazards}>{data.totalHazardsReported} hazards reported</Text>
          </View>
        </View>
        {nextTier ? (
          <Text style={styles.guardianProgress}>
            {remaining} more report{remaining !== 1 ? 's' : ''} to reach {nextTier[1].label}
          </Text>
        ) : (
          <Text style={[styles.guardianProgress, { color: brandColors.accent }]}>
            Maximum tier reached!
          </Text>
        )}
      </View>
    </View>
  );
};

export default function ProfileScreen() {
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

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Screen
          title={t('profile.title')}
          eyebrow={t('profile.eyebrow')}
          subtitle={t('profile.subtitle')}
          contentBottomPadding={insets.bottom + layout.bottomNavHeight + space[4]}
        >
          {user ? (
            <View style={styles.userCard}>
              <Pressable onPress={handleAvatarPick} style={styles.avatarWrapper}>
                {avatarUploading ? (
                  <View style={styles.avatarPlaceholder}>
                    <ActivityIndicator color={brandColors.accent} />
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
                  {profile?.username ? `@${profile.username}` : user.email ?? 'Rider'}
                </Text>
                <Text style={styles.userSub}>
                  {profile?.username ? user.email ?? 'Signed in' : 'Signed in'}
                </Text>
                {!editingUsername ? (
                  <Pressable
                    onPress={() => {
                      setEditingUsername(true);
                      setUsernameInput(profile?.username ?? '');
                      setUsernameError(null);
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.editUsernameLink}>
                      {profile?.username ? 'Change username' : 'Set username'}
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
                    >
                      <Text style={styles.usernameSaveText}>{usernameSaving ? '...' : 'Save'}</Text>
                    </Pressable>
                    <Pressable onPress={() => setEditingUsername(false)} hitSlop={8}>
                      <Ionicons name="close" size={18} color={gray[400]} />
                    </Pressable>
                  </View>
                )}
                {usernameError ? <Text style={styles.usernameError}>{usernameError}</Text> : null}
              </View>
            </View>
          ) : (
            <Pressable style={styles.userCard} onPress={() => router.push('/auth')}>
              <Ionicons name="person-circle-outline" size={48} color={gray[500]} />
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{t('common.guest')}</Text>
                <Text style={styles.userSub}>{t('profile.tapToSignIn')}</Text>
              </View>
              <Ionicons name="log-in-outline" size={24} color={brandColors.accent} />
            </Pressable>
          )}

          <GuardianSection />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.language')}</Text>
            <View style={styles.languageRow}>
              {(['en', 'ro'] as const).map((loc) => (
                <Pressable
                  key={loc}
                  style={[styles.languagePill, locale === loc && styles.languagePillActive]}
                  onPress={() => setLocale(loc)}
                >
                  <Text style={[styles.languagePillText, locale === loc && styles.languagePillTextActive]}>
                    {loc === 'en' ? 'English' : 'Română'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.aboutYou')}</Text>

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
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.routingPreferences')}</Text>

            <Pressable
              style={styles.settingRow}
              onPress={() => setAvoidUnpaved(!avoidUnpaved)}
            >
              <View style={styles.settingTextCol}>
                <Text style={styles.settingLabel}>{t('profile.avoidUnpaved')}</Text>
                <Text style={styles.settingDescription}>
                  {avoidUnpaved
                    ? 'Routes will stay on paved surfaces'
                    : 'Routes may include unpaved roads'}
                </Text>
              </View>
              <View style={[styles.toggle, avoidUnpaved && styles.toggleOn]}>
                <View style={[styles.toggleThumb, avoidUnpaved && styles.toggleThumbOn]} />
              </View>
            </Pressable>

            <Pressable
              style={styles.settingRow}
              onPress={() => setShowRouteComparison(!showRouteComparison)}
            >
              <View style={styles.settingTextCol}>
                <Text style={styles.settingLabel}>{t('profile.compareRoutes')}</Text>
                <Text style={styles.settingDescription}>
                  {showRouteComparison
                    ? 'Shows how much safer your route is vs fast routing'
                    : 'Route comparison disabled'}
                </Text>
              </View>
              <View style={[styles.toggle, showRouteComparison && styles.toggleOn]}>
                <View style={[styles.toggleThumb, showRouteComparison && styles.toggleThumbOn]} />
              </View>
            </Pressable>

            <Pressable
              style={styles.settingRow}
              onPress={() => setShowBicycleLanes(!showBicycleLanes)}
            >
              <View style={styles.settingTextCol}>
                <Text style={styles.settingLabel}>{t('profile.showBikeLanes')}</Text>
                <Text style={styles.settingDescription}>
                  {showBicycleLanes
                    ? 'Cycling infrastructure is visible on the map'
                    : 'Bike lanes are hidden from the map'}
                </Text>
              </View>
              <View style={[styles.toggle, showBicycleLanes && styles.toggleOn]}>
                <View style={[styles.toggleThumb, showBicycleLanes && styles.toggleThumbOn]} />
              </View>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.pointsOfInterest')}</Text>

            {poiCategories.map((cat) => (
              <Pressable
                key={cat.key}
                style={styles.settingRow}
                onPress={() => setPoiVisibility(cat.key, !poiVisibility[cat.key])}
              >
                <View style={styles.settingTextCol}>
                  <Text style={styles.settingLabel}>{cat.label}</Text>
                  <Text style={styles.settingDescription}>{cat.description}</Text>
                </View>
                <View style={[styles.toggle, poiVisibility[cat.key] && styles.toggleOn]}>
                  <View style={[styles.toggleThumb, poiVisibility[cat.key] && styles.toggleThumbOn]} />
                </View>
              </Pressable>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.notifications')}</Text>

            <Pressable style={styles.settingRow} onPress={() => setNotifyWeather(!notifyWeather)}>
              <View style={styles.settingTextCol}>
                <Text style={styles.settingLabel}>{t('profile.dailyWeather')}</Text>
                <Text style={styles.settingDescription}>
                  {notifyWeather ? 'Daily 9am cycling weather forecast & advice' : 'Daily weather notification is off'}
                </Text>
              </View>
              <View style={[styles.toggle, notifyWeather && styles.toggleOn]}>
                <View style={[styles.toggleThumb, notifyWeather && styles.toggleThumbOn]} />
              </View>
            </Pressable>

            <Pressable style={styles.settingRow} onPress={() => setNotifyHazard(!notifyHazard)}>
              <View style={styles.settingTextCol}>
                <Text style={styles.settingLabel}>{t('profile.hazardAlerts')}</Text>
                <Text style={styles.settingDescription}>
                  {notifyHazard ? 'Get notified about hazards near your routes' : 'Hazard alerts are off'}
                </Text>
              </View>
              <View style={[styles.toggle, notifyHazard && styles.toggleOn]}>
                <View style={[styles.toggleThumb, notifyHazard && styles.toggleThumbOn]} />
              </View>
            </Pressable>

            <Pressable style={styles.settingRow} onPress={() => setNotifyCommunity(!notifyCommunity)}>
              <View style={styles.settingTextCol}>
                <Text style={styles.settingLabel}>{t('profile.community')}</Text>
                <Text style={styles.settingDescription}>
                  {notifyCommunity ? 'Get notified about likes and comments' : 'Community notifications are off'}
                </Text>
              </View>
              <View style={[styles.toggle, notifyCommunity && styles.toggleOn]}>
                <View style={[styles.toggleThumb, notifyCommunity && styles.toggleThumbOn]} />
              </View>
            </Pressable>

            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <Text style={styles.settingLabel}>{t('profile.quietHours')}</Text>
                <Text style={styles.settingDescription}>
                  No notifications {quietHoursStart} → {quietHoursEnd}
                </Text>
              </View>
              <Ionicons name="time-outline" size={20} color={gray[400]} />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.privacy')}</Text>

            <Pressable
              style={styles.settingRow}
              onPress={() => setShareTripsPublicly(!shareTripsPublicly)}
            >
              <View style={styles.settingTextCol}>
                <Text style={styles.settingLabel}>{t('profile.shareTrips')}</Text>
                <Text style={styles.settingDescription}>
                  {shareTripsPublicly
                    ? 'Your rides are shared in the community feed'
                    : 'Your rides are private and not shared'}
                </Text>
              </View>
              <View style={[styles.toggle, shareTripsPublicly && styles.toggleOn]}>
                <View style={[styles.toggleThumb, shareTripsPublicly && styles.toggleThumbOn]} />
              </View>
            </Pressable>
          </View>

          {user ? (
            <Pressable
              style={styles.signOutButton}
              onPress={() => {
                Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Sign Out',
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
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              <Text style={styles.signOutText}>{t('profile.signOut')}</Text>
            </Pressable>
          ) : null}
        </Screen>
      </View>
      <BottomNav activeTab="profile" onTabPress={handleTabPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brandColors.bgDeep },
  content: { flex: 1 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    padding: space[4],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    backgroundColor: 'rgba(17, 24, 39, 0.86)',
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: brandColors.accent,
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
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  userInfo: { flex: 1, gap: space[1] },
  userName: {
    ...textBase,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.textPrimary,
    fontSize: 16,
  },
  userSub: {
    ...textSm,
    color: brandColors.textSecondary,
  },
  editUsernameLink: {
    ...textXs,
    color: brandColors.accent,
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
    color: brandColors.accent,
  },
  usernameInput: {
    flex: 1,
    fontFamily: fontFamily.mono.medium,
    fontSize: 14,
    color: darkTheme.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: brandColors.accent,
    paddingVertical: 2,
  },
  usernameSaveBtn: {
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    backgroundColor: brandColors.accent,
    borderRadius: radii.sm,
  },
  usernameSaveText: {
    fontFamily: fontFamily.body.bold,
    fontSize: 12,
    color: '#000',
  },
  usernameError: {
    ...textXs,
    color: safetyColors.danger,
    marginTop: 2,
  },
  section: {
    gap: space[3],
  },
  sectionTitle: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.accent,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
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
    backgroundColor: brandColors.accent,
    borderColor: brandColors.accent,
  },
  languagePillText: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: gray[400],
  },
  languagePillTextActive: {
    color: '#000',
    fontFamily: fontFamily.body.bold,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space[4],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    backgroundColor: 'rgba(17, 24, 39, 0.86)',
  },
  settingTextCol: { flex: 1, gap: space[1], marginRight: space[3] },
  settingLabel: {
    ...textBase,
    fontFamily: fontFamily.body.medium,
    color: brandColors.textPrimary,
  },
  settingDescription: {
    ...textSm,
    color: brandColors.textSecondary,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: gray[600],
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleOn: {
    backgroundColor: brandColors.accent,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: space[6],
  },
  modalContent: {
    width: '100%',
    maxHeight: '70%',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    backgroundColor: brandColors.bgDeep,
    padding: space[5],
    gap: space[4],
  },
  modalTitle: {
    ...textBase,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.textPrimary,
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
    backgroundColor: 'rgba(250, 204, 21, 0.1)',
  },
  optionText: {
    ...textBase,
    fontFamily: fontFamily.body.regular,
    color: brandColors.textPrimary,
  },
  optionTextSelected: {
    fontFamily: fontFamily.body.medium,
    color: brandColors.accent,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingVertical: space[4],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  signOutText: {
    ...textBase,
    fontFamily: fontFamily.body.medium,
    color: '#EF4444',
  },
  guardianCard: {
    backgroundColor: 'rgba(17, 24, 39, 0.86)',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    padding: space[4],
    gap: space[3],
  },
  guardianRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  guardianBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  guardianTextCol: {
    flex: 1,
    gap: 2,
  },
  guardianTierName: {
    ...textBase,
    fontFamily: fontFamily.heading.bold,
  },
  guardianHazards: {
    ...textXs,
    color: gray[400],
  },
  guardianProgress: {
    ...textXs,
    color: gray[400],
  },
});
