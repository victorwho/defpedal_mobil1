import type { AutocompleteSuggestion, BikeTypeId, Coordinate } from '@defensivepedal/core';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from '../../src/design-system/atoms';
import { PedalSays } from '../../src/design-system/molecules/PedalSays';
import { SearchBar } from '../../src/design-system/molecules/SearchBar';
import { useTheme, type ThemeColors } from '../../src/design-system';
import { radii } from '../../src/design-system/tokens/radii';
import { space } from '../../src/design-system/tokens/spacing';
import { brandTints } from '../../src/design-system/tokens/tints';
import {
  fontFamily,
  text2xl,
  textBase,
  textSm,
  textXs,
} from '../../src/design-system/tokens/typography';
import { useCurrentLocation } from '../../src/hooks/useCurrentLocation';
import { useT } from '../../src/hooks/useTranslation';
import { useUnits } from '../../src/hooks/useUnits';
import { mobileApi } from '../../src/lib/api';
import { mobileEnv } from '../../src/lib/env';
import { resolveSuggestion } from '../../src/lib/mapbox-search';
import { telemetry } from '../../src/lib/telemetry';
import { useAppStore } from '../../src/store/appStore';

export type RideIntent = 'commute' | 'loop' | 'specific';
type BikeChoice = 'mountain' | 'roadCity' | 'ebike' | 'none';

/**
 * Only Road/City turns "Avoid unpaved roads" ON (stored as `city`, whose
 * implied default is paved), and the screen says so because it changes a
 * routing setting. Mountain implies unpaved-capable (off); e-bike and "no
 * bike yet" imply nothing and keep the setting, which is off on a fresh
 * install. All of it goes through `avoidUnpavedForBikeType` in core.
 */
const BIKE_CHOICE_TO_ID: Record<BikeChoice, BikeTypeId> = {
  mountain: 'mountain',
  roadCity: 'city',
  ebike: 'ebike',
  none: 'none',
};

const INTENTS: ReadonlyArray<{
  id: RideIntent;
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  subKey: string;
}> = [
  { id: 'commute', icon: 'briefcase-outline', titleKey: 'onboardingRide.intentCommute', subKey: 'onboardingRide.intentCommuteSub' },
  { id: 'loop', icon: 'leaf-outline', titleKey: 'onboardingRide.intentLoop', subKey: 'onboardingRide.intentLoopSub' },
  { id: 'specific', icon: 'location-outline', titleKey: 'onboardingRide.intentSpecific', subKey: 'onboardingRide.intentSpecificSub' },
];

const BIKES: ReadonlyArray<{ id: BikeChoice; labelKey: string }> = [
  { id: 'mountain', labelKey: 'onboardingRide.bikeMountain' },
  { id: 'roadCity', labelKey: 'onboardingRide.bikeRoadCity' },
  { id: 'ebike', labelKey: 'onboardingRide.bikeEbike' },
  { id: 'none', labelKey: 'onboardingRide.bikeNone' },
];

/**
 * Onboarding step 3 — "where to, and on what?"
 * (docs/plans/onboarding-first-ride.md [D3], [D5]).
 *
 * Everything routing needs is collected here, BEFORE the route is drawn: the
 * bike type changes the graph (e-bike) and the surface default (road/city), so
 * asking after the reveal would mean showing the rider the wrong route.
 *
 * E-bike is recorded even when it is a Plus feature the rider does not have
 * [D10]; the reveal then routes on Safe. No paywall anywhere in onboarding.
 */
export default function OnboardingRideIntentScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const units = useUnits();
  const { location, permissionStatus, isLoading: locationLoading } = useCurrentLocation();

  const locale = useAppStore((s) => s.locale);
  const countryHint = useAppStore((s) => s.regionGate.countryCode) ?? undefined;

  const [intent, setIntent] = useState<RideIntent | null>(null);
  const [bike, setBike] = useState<BikeChoice | null>(null);
  const [query, setQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [destination, setDestination] = useState<{ label: string; coordinates: Coordinate } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  // No fix and none coming: nothing here can be planned "from where you are".
  const locationUnavailable = !location && !locationLoading;
  const needsSearch = intent === 'commute' || intent === 'specific';

  // A rider who loses location after picking the loop is moved off it.
  useEffect(() => {
    if (locationUnavailable && intent === 'loop') setIntent(null);
  }, [locationUnavailable, intent]);

  const autocomplete = useQuery({
    queryKey: ['autocomplete', 'onboarding', deferredQuery, location, locale, countryHint, units],
    queryFn: () =>
      mobileApi.autocomplete(
        { query: deferredQuery, proximity: location ?? undefined, locale, countryHint, limit: 5 },
        units,
      ),
    enabled:
      Boolean(mobileEnv.mapboxPublicToken) &&
      needsSearch &&
      searchActive &&
      deferredQuery.length >= 2,
  });

  const handleSelectSuggestion = async (suggestion: AutocompleteSuggestion) => {
    Keyboard.dismiss();
    setSearchActive(false);
    const resolved = await resolveSuggestion(suggestion).catch(() => null);
    if (!resolved) {
      setSearchError(t('onboardingRide.placeNotFound'));
      return;
    }
    setSearchError(null);
    setQuery(resolved.label);
    setDestination({ label: resolved.label, coordinates: resolved.coordinates });
  };

  const handleSelectIntent = (next: RideIntent) => {
    setIntent(next);
    if (next === 'loop') {
      setDestination(null);
      setQuery('');
    }
  };

  const canContinue =
    intent !== null &&
    bike !== null &&
    location !== null &&
    (intent === 'loop' || destination !== null);

  const handleContinue = () => {
    if (!canContinue || !location || !intent || !bike) return;
    const store = useAppStore.getState();
    store.setBikeType(BIKE_CHOICE_TO_ID[bike]);
    // Explicit, not inherited: a rider who went back and changed their answer
    // must not keep the previous choice's surface setting.
    store.setAvoidUnpaved(bike === 'roadCity');

    if (intent !== 'loop' && destination) {
      store.setRouteRequest({
        origin: location,
        destination: destination.coordinates,
        waypoints: [],
        startOverride: undefined,
        mode: 'safe',
        avoidHills: false,
        avoidHeat: false,
        // Gated by entitlement at request time [D10].
        isEbike: bike === 'ebike',
        locale,
        countryHint,
      });
    }

    telemetry.capture('onb_intent_selected', { intent, bikeType: BIKE_CHOICE_TO_ID[bike] });
    router.push(`/onboarding/route-reveal?intent=${intent}` as never);
  };

  const handleSkip = () => {
    telemetry.capture('onb_route_skipped', { reason: 'no_location' });
    router.replace('/onboarding/signup-prompt' as never);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[4] }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
      >
        <PedalSays pose="map" line={t('onboardingRide.pedalIntent')} />

        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {t('onboardingRide.intentTitle')}
          </Text>
          <Text style={styles.subtitle}>{t('onboardingRide.intentSub')}</Text>
        </View>

        <View style={styles.group}>
          {INTENTS.filter((item) => !(item.id === 'loop' && locationUnavailable)).map((item) => {
            const selected = intent === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => handleSelectIntent(item.id)}
                style={[styles.intentCard, selected && styles.intentCardSelected]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${t(item.titleKey)}. ${t(item.subKey)}`}
              >
                <View style={[styles.intentIcon, selected && styles.intentIconSelected]}>
                  <Ionicons name={item.icon} size={22} color={selected ? colors.textInverse : colors.accent} />
                </View>
                <View style={styles.intentText}>
                  <Text style={styles.intentTitle}>{t(item.titleKey)}</Text>
                  <Text style={styles.intentSub}>{t(item.subKey)}</Text>
                </View>
                {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.accent} /> : null}
              </Pressable>
            );
          })}
        </View>

        {needsSearch ? (
          <SearchBar
            label={t(intent === 'commute' ? 'onboardingRide.searchCommute' : 'onboardingRide.searchPlace')}
            value={query}
            placeholder={t(intent === 'commute' ? 'onboardingRide.searchCommute' : 'onboardingRide.searchPlace')}
            active={searchActive}
            isLoading={autocomplete.isFetching}
            errorMessage={searchError}
            statusText={
              searchActive && deferredQuery.length >= 2 && autocomplete.data?.suggestions.length === 0
                ? t('onboardingRide.searchNoResults')
                : undefined
            }
            suggestions={searchActive ? autocomplete.data?.suggestions ?? [] : []}
            onChangeText={(value) => {
              setQuery(value);
              setDestination(null);
              setSearchError(null);
            }}
            onFocus={() => setSearchActive(true)}
            onClear={() => {
              setQuery('');
              setDestination(null);
            }}
            onSelectSuggestion={(suggestion) => void handleSelectSuggestion(suggestion)}
          />
        ) : null}

        <View style={styles.group}>
          <Text style={styles.sectionLabel}>{t('onboardingRide.bikeTitle')}</Text>
          <View style={styles.pillRow}>
            {BIKES.map((item) => {
              const selected = bike === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setBike(item.id)}
                  style={[styles.pill, selected && styles.pillSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                    {t(item.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {bike === 'roadCity' ? (
            <Text style={styles.hint}>{t('onboarding.bikeConsequencePaved')}</Text>
          ) : null}
        </View>

        {locationUnavailable ? (
          <View style={styles.noLocation}>
            <Text style={styles.hint}>{t('onboardingRide.noLocation')}</Text>
            {permissionStatus === 'denied' ? (
              <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="link" hitSlop={8}>
                <Text style={styles.link}>{t('onboarding.openSettings')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space[4] }]}>
        <Button variant="primary" size="lg" fullWidth disabled={!canContinue} onPress={handleContinue}>
          {t('onboardingRide.showRoute')}
        </Button>
        {locationUnavailable ? (
          <Pressable onPress={handleSkip} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.link}>{t('onboardingRide.skip')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bgDeep,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: space[5],
      paddingBottom: space[6],
      gap: space[5],
    },
    header: {
      gap: space[2],
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
    group: {
      gap: space[3],
    },
    sectionLabel: {
      ...textXs,
      fontFamily: fontFamily.heading.extraBold,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      color: colors.textSecondary,
    },
    intentCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      minHeight: 64,
      padding: space[4],
      borderRadius: radii.xl,
      borderWidth: 1.5,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgPrimary,
    },
    intentCardSelected: {
      borderColor: colors.accent,
      backgroundColor: brandTints.accentLight,
    },
    intentIcon: {
      width: 40,
      height: 40,
      borderRadius: radii.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: brandTints.accentLight,
    },
    intentIconSelected: {
      backgroundColor: colors.accent,
    },
    intentText: {
      flex: 1,
      gap: 2,
    },
    intentTitle: {
      ...textBase,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    intentSub: {
      ...textSm,
      color: colors.textSecondary,
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[2],
    },
    pill: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: space[4],
      borderRadius: radii.full,
      borderWidth: 1.5,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgPrimary,
    },
    pillSelected: {
      borderColor: colors.accent,
      backgroundColor: colors.accent,
    },
    pillText: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    pillTextSelected: {
      color: colors.textInverse,
    },
    hint: {
      ...textSm,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    noLocation: {
      gap: space[2],
    },
    link: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.accent,
      textAlign: 'center',
    },
    footer: {
      gap: space[3],
      alignItems: 'center',
      paddingHorizontal: space[5],
      paddingTop: space[3],
    },
  });
