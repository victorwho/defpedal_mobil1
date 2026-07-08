/**
 * Design System v1.0 — SearchBar Molecule
 *
 * Collapsed state: pill-shaped input with search icon.
 * Expanded state: full-width input with suggestions dropdown.
 * Built on TextInput atom + Spinner atom.
 */
import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AutocompleteSuggestion, SuggestionFeatureType } from '@defensivepedal/core';
import { matchSavedPlaceKeyword } from '@defensivepedal/core';

import { useTheme } from '../ThemeContext';
import { TextInput } from '../atoms/TextInput';
import { Spinner } from '../atoms/Spinner';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { fontFamily } from '../tokens/typography';
import { textSm, textXs, textBase, textLg } from '../tokens/typography';
import { useT } from '../../hooks/useTranslation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchBarProps {
  label: string;
  value: string;
  placeholder: string;
  active?: boolean;
  isLoading?: boolean;
  errorMessage?: string | null;
  statusText?: string;
  suggestions?: AutocompleteSuggestion[];
  /** Recent destinations to show when field is focused but empty */
  recentDestinations?: readonly AutocompleteSuggestion[];
  /** When provided, shows a "Current location" row at top of dropdown so user can reset to GPS */
  onSelectCurrentLocation?: () => void;
  /** Saved Home and Work places — shown as quick-pick rows in the empty dropdown */
  savedPlaces?: {
    home: AutocompleteSuggestion | null;
    work: AutocompleteSuggestion | null;
  };
  /** Called when user long-presses a suggestion and picks "Save as Home/Work" */
  onSavePlace?: (suggestion: AutocompleteSuggestion, type: 'home' | 'work') => void;
  onChangeText: (value: string) => void;
  onFocus: () => void;
  onClear: () => void;
  onSelectSuggestion: (suggestion: AutocompleteSuggestion) => void;
}

// ---------------------------------------------------------------------------
// POI icon mapping
// ---------------------------------------------------------------------------

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

/** Map Mapbox POI categories to Ionicons names. */
const CATEGORY_ICON_MAP: Readonly<Record<string, IoniconsName>> = {
  restaurant: 'restaurant-outline',
  cafe: 'cafe-outline',
  coffee: 'cafe-outline',
  bar: 'beer-outline',
  pub: 'beer-outline',
  hotel: 'bed-outline',
  lodging: 'bed-outline',
  hospital: 'medkit-outline',
  pharmacy: 'medical-outline',
  school: 'school-outline',
  university: 'school-outline',
  park: 'leaf-outline',
  garden: 'leaf-outline',
  museum: 'easel-outline',
  library: 'library-outline',
  cinema: 'film-outline',
  theater: 'film-outline',
  stadium: 'football-outline',
  gym: 'fitness-outline',
  fitness: 'fitness-outline',
  bank: 'card-outline',
  atm: 'card-outline',
  gas_station: 'car-outline',
  fuel: 'car-outline',
  parking: 'car-outline',
  bus_station: 'bus-outline',
  train_station: 'train-outline',
  airport: 'airplane-outline',
  shopping: 'cart-outline',
  supermarket: 'cart-outline',
  grocery: 'cart-outline',
  store: 'storefront-outline',
  shop: 'storefront-outline',
  mall: 'storefront-outline',
  church: 'home-outline',
  temple: 'home-outline',
  mosque: 'home-outline',
  bicycle: 'bicycle-outline',
  bike: 'bicycle-outline',
};

/** Default icons per feature type when no category match. */
const FEATURE_TYPE_ICON_MAP: Readonly<Record<string, IoniconsName>> = {
  poi: 'pin-outline',
  address: 'home-outline',
  place: 'business-outline',
  locality: 'map-outline',
  neighborhood: 'map-outline',
};

const getSuggestionIcon = (
  featureType?: SuggestionFeatureType,
  category?: string,
  maki?: string,
): IoniconsName => {
  // Try maki icon first (most specific for POIs)
  if (maki) {
    const normalized = maki.toLowerCase().replace(/[\s-]/g, '_');
    const match = CATEGORY_ICON_MAP[normalized];
    if (match) return match;
  }

  if (category) {
    const normalized = category.toLowerCase().replace(/[\s-]/g, '_');
    const match = CATEGORY_ICON_MAP[normalized];
    if (match) return match;
  }

  if (featureType) {
    const match = FEATURE_TYPE_ICON_MAP[featureType];
    if (match) return match;
  }

  return 'location-outline';
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SearchBar: React.FC<SearchBarProps> = ({
  label,
  value,
  placeholder,
  active = false,
  isLoading = false,
  errorMessage,
  statusText,
  suggestions = [],
  recentDestinations = [],
  onSelectCurrentLocation,
  savedPlaces,
  onSavePlace,
  onChangeText,
  onFocus,
  onClear,
  onSelectSuggestion,
}) => {
  const { colors } = useTheme();
  const t = useT();

  // Show recent destinations when field is active but user hasn't typed anything
  const showRecents = active && value.length === 0 && recentDestinations.length > 0;

  // Show dropdown when: loading, error, has suggestions, OR no results after searching (value >= 2 chars)
  const hasSearchedWithNoResults = !isLoading && !errorMessage && value.length >= 2 && suggestions.length === 0;
  const showSuggestions =
    active && (isLoading || Boolean(errorMessage) || suggestions.length > 0 || hasSearchedWithNoResults);

  // Show "Current location" row at top of whichever dropdown is visible, or standalone if none
  const showCurrentLocation = active && !!onSelectCurrentLocation;
  const showStandaloneCurrentLocation = showCurrentLocation && !showRecents && !showSuggestions;

  // Saved places — Home/Work quick-pick rows
  const hasSavedPlaces = !!(savedPlaces?.home || savedPlaces?.work);
  // Keyword override: when user types 'home'/'work' (or a localized synonym —
  // audit 2026-07-05 UX-17), inject the saved place as the only suggestion.
  // Shared matcher keeps this in sync with route-planning's fetch-suppression.
  const keywordType = matchSavedPlaceKeyword(value);
  const keywordPlace = keywordType ? savedPlaces?.[keywordType] ?? null : null;
  const showSavedPlacesSection = active && hasSavedPlaces && value.length === 0;
  const showSavedPlacesStandalone = showSavedPlacesSection && !showRecents && !showStandaloneCurrentLocation;

  // Helper: show save-as alert for a suggestion
  const handleLongPress = onSavePlace
    ? (suggestion: AutocompleteSuggestion) => {
        Alert.alert(t('search.saveAs'), suggestion.primaryText, [
          { text: t('search.saveAsHome'), onPress: () => onSavePlace(suggestion, 'home') },
          { text: t('search.saveAsWork'), onPress: () => onSavePlace(suggestion, 'work') },
          { text: t('common.cancel'), style: 'cancel' },
        ]);
      }
    : undefined;

  return (
    <View style={styles.wrap}>
      {/* Label */}
      <Text
        style={[
          styles.label,
          { color: colors.textMuted, fontFamily: fontFamily.body.semiBold },
        ]}
      >
        {label}
      </Text>

      {/* Input row */}
      <View style={styles.inputRow}>
        <View style={{ flex: 1 }}>
          <TextInput
            variant="search"
            value={value}
            placeholder={placeholder}
            onChangeText={onChangeText}
            onFocus={onFocus}
            autoCorrect={false}
            autoCapitalize="words"
            leftIcon={
              <Ionicons
                name="search-outline"
                size={20}
                color={colors.textMuted}
              />
            }
          />
        </View>
        {value.length > 0 ? (
          <Pressable
            style={[styles.clearButton, { backgroundColor: `${colors.accent}18` }]}
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close" size={18} color={colors.accent} />
          </Pressable>
        ) : null}
      </View>

      {/* Status text */}
      {statusText ? (
        <Text
          style={[
            textSm,
            { color: colors.textSecondary },
          ]}
        >
          {statusText}
        </Text>
      ) : null}

      {/* Standalone mini-dropdown: Current location + Saved places (no recents, no suggestions) */}
      {(showStandaloneCurrentLocation || showSavedPlacesStandalone) ? (
        <View
          style={[
            styles.suggestionSheet,
            {
              backgroundColor: colors.bgSecondary,
              borderColor: colors.borderDefault,
            },
            shadows.md,
          ]}
        >
          {showCurrentLocation ? (
            <Pressable
              style={({ pressed }) => [
                styles.suggestionButton,
                { backgroundColor: pressed ? colors.bgTertiary : colors.bgPrimary },
              ]}
              onPress={onSelectCurrentLocation}
              accessibilityRole="button"
              accessibilityLabel={t('search.currentLocation')}
            >
              <Ionicons name="locate-outline" size={20} color={colors.accent} style={styles.suggestionIcon} />
              <Text style={[textBase, { color: colors.accent, fontFamily: fontFamily.body.semiBold }]}>
                {t('search.currentLocation')}
              </Text>
            </Pressable>
          ) : null}
          {hasSavedPlaces ? (
            <Text style={[textXs, { color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: space[2], paddingTop: space[1], paddingBottom: space[1] }]}>
              {t('search.savedPlaces')}
            </Text>
          ) : null}
          {(['home', 'work'] as const).map((type) => {
            const place = savedPlaces?.[type];
            const isHome = type === 'home';
            return (
              <Pressable
                key={type}
                style={({ pressed }) => [
                  styles.suggestionButton,
                  { backgroundColor: pressed ? colors.bgTertiary : colors.bgPrimary },
                ]}
                onPress={place ? () => onSelectSuggestion(place) : undefined}
                accessibilityRole="button"
                accessibilityLabel={isHome ? t('search.home') : t('search.work')}
              >
                <Ionicons
                  name={isHome ? 'home-outline' : 'briefcase-outline'}
                  size={20}
                  color={place ? colors.accent : colors.textMuted}
                  style={styles.suggestionIcon}
                />
                <View style={styles.suggestionText}>
                  <Text style={[textBase, { color: place ? colors.textPrimary : colors.textMuted, fontFamily: fontFamily.body.semiBold }]}>
                    {isHome ? t('search.home') : t('search.work')}
                  </Text>
                  {place ? (
                    <Text style={[textSm, { color: colors.textSecondary }]} numberOfLines={1}>
                      {place.primaryText}
                    </Text>
                  ) : (
                    <Text style={[textSm, { color: colors.textMuted }]}>
                      {isHome ? t('search.setHome') : t('search.setWork')}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* Recent destinations (shown when field is focused but empty) */}
      {showRecents ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={[
            styles.suggestionSheet,
            {
              backgroundColor: colors.bgSecondary,
              borderColor: colors.borderDefault,
              maxHeight: Math.min(280, Dimensions.get('window').height * 0.35),
            },
            shadows.md,
          ]}
        >
          {showCurrentLocation ? (
            <Pressable
              style={({ pressed }) => [
                styles.suggestionButton,
                { backgroundColor: pressed ? colors.bgTertiary : colors.bgPrimary },
              ]}
              onPress={onSelectCurrentLocation}
              accessibilityRole="button"
              accessibilityLabel={t('search.currentLocation')}
            >
              <Ionicons name="locate-outline" size={20} color={colors.accent} style={styles.suggestionIcon} />
              <Text style={[textBase, { color: colors.accent, fontFamily: fontFamily.body.semiBold }]}>
                {t('search.currentLocation')}
              </Text>
            </Pressable>
          ) : null}
          {hasSavedPlaces ? (
            <Text style={[textXs, { color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: space[2], paddingTop: space[1], paddingBottom: space[1] }]}>
              {t('search.savedPlaces')}
            </Text>
          ) : null}
          {(['home', 'work'] as const).map((type) => {
            const place = savedPlaces?.[type];
            const isHome = type === 'home';
            if (!place) return null;
            return (
              <Pressable
                key={type}
                style={({ pressed }) => [
                  styles.suggestionButton,
                  { backgroundColor: pressed ? colors.bgTertiary : colors.bgPrimary },
                ]}
                onPress={() => onSelectSuggestion(place)}
                accessibilityRole="button"
                accessibilityLabel={isHome ? t('search.home') : t('search.work')}
              >
                <Ionicons
                  name={isHome ? 'home-outline' : 'briefcase-outline'}
                  size={20}
                  color={colors.accent}
                  style={styles.suggestionIcon}
                />
                <View style={styles.suggestionText}>
                  <Text style={[textBase, { color: colors.textPrimary, fontFamily: fontFamily.body.semiBold }]}>
                    {isHome ? t('search.home') : t('search.work')}
                  </Text>
                  <Text style={[textSm, { color: colors.textSecondary }]} numberOfLines={1}>
                    {place.primaryText}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          <Text
            style={[
              textXs,
              {
                color: colors.textMuted,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                paddingHorizontal: space[2],
                paddingBottom: space[1],
              },
            ]}
          >
            {t('search.recent')}
          </Text>
          {recentDestinations.map((recent) => {
            const iconName = getSuggestionIcon(
              recent.featureType,
              recent.category,
              recent.maki,
            );

            return (
              <Pressable
                key={`recent-${recent.id}`}
                style={({ pressed }) => [
                  styles.suggestionButton,
                  { backgroundColor: pressed ? colors.bgTertiary : colors.bgPrimary },
                ]}
                onPress={() => onSelectSuggestion(recent)}
                accessibilityRole="button"
                accessibilityLabel={`Select recent ${recent.primaryText}`}
              >
                <Ionicons
                  name="time-outline"
                  size={20}
                  color={colors.textMuted}
                  style={styles.suggestionIcon}
                />
                <View style={styles.suggestionText}>
                  <Text
                    style={[
                      textBase,
                      {
                        color: colors.textPrimary,
                        fontFamily: fontFamily.body.semiBold,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {recent.primaryText}
                  </Text>
                  {recent.secondaryText ? (
                    <Text
                      style={[textSm, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {recent.secondaryText}
                    </Text>
                  ) : recent.label ? (
                    <Text
                      style={[textSm, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {recent.label}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Suggestions dropdown */}
      {showSuggestions ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={[
            styles.suggestionSheet,
            {
              backgroundColor: colors.bgSecondary,
              borderColor: colors.borderDefault,
              maxHeight: Math.min(280, Dimensions.get('window').height * 0.35),
            },
            shadows.md,
          ]}
        >
          {showCurrentLocation ? (
            <Pressable
              style={({ pressed }) => [
                styles.suggestionButton,
                { backgroundColor: pressed ? colors.bgTertiary : colors.bgPrimary },
              ]}
              onPress={onSelectCurrentLocation}
              accessibilityRole="button"
              accessibilityLabel={t('search.currentLocation')}
            >
              <Ionicons
                name="locate-outline"
                size={20}
                color={colors.accent}
                style={styles.suggestionIcon}
              />
              <Text
                style={[textBase, { color: colors.accent, fontFamily: fontFamily.body.semiBold }]}
              >
                {t('search.currentLocation')}
              </Text>
            </Pressable>
          ) : null}

          {isLoading ? (
            <View style={styles.helperRow}>
              <Spinner size={16} />
              <Text style={[textSm, { color: colors.textSecondary }]}>
                {t('search.searching')}
              </Text>
            </View>
          ) : null}

          {!isLoading && errorMessage ? (
            <Text style={[textSm, { color: colors.danger }]}>
              {errorMessage}
            </Text>
          ) : null}

          {/* Keyword place: user typed 'home'/'work' and the place is saved */}
          {keywordPlace && !isLoading ? (
            <Pressable
              style={({ pressed }) => [
                styles.suggestionButton,
                { backgroundColor: pressed ? colors.bgTertiary : colors.bgPrimary },
              ]}
              onPress={() => onSelectSuggestion(keywordPlace)}
              accessibilityRole="button"
              accessibilityLabel={keywordType === 'home' ? t('search.home') : t('search.work')}
            >
              <Ionicons
                name={keywordType === 'home' ? 'home-outline' : 'briefcase-outline'}
                size={20}
                color={colors.accent}
                style={styles.suggestionIcon}
              />
              <View style={styles.suggestionText}>
                <Text style={[textBase, { color: colors.accent, fontFamily: fontFamily.body.semiBold }]}>
                  {keywordType === 'home' ? t('search.home') : t('search.work')}
                </Text>
                <Text style={[textSm, { color: colors.textSecondary }]} numberOfLines={1}>
                  {keywordPlace.primaryText}
                </Text>
              </View>
            </Pressable>
          ) : null}

          {!isLoading && !errorMessage && suggestions.length === 0 && !keywordPlace ? (
            <Text style={[textSm, { color: colors.textSecondary }]}>
              {t('search.noMatches')}
            </Text>
          ) : null}

          {!isLoading &&
            !errorMessage &&
            !keywordPlace &&
            suggestions.map((suggestion) => {
              const iconName = getSuggestionIcon(
                suggestion.featureType,
                suggestion.category,
                suggestion.maki,
              );

              return (
                <Pressable
                  key={suggestion.id}
                  style={({ pressed }) => [
                    styles.suggestionButton,
                    { backgroundColor: pressed ? colors.bgTertiary : colors.bgPrimary },
                  ]}
                  onPress={() => onSelectSuggestion(suggestion)}
                  onLongPress={handleLongPress ? () => handleLongPress(suggestion) : undefined}
                  delayLongPress={500}
                  accessibilityRole="button"
                  accessibilityLabel={t('search.selectA11y', { name: suggestion.primaryText })}
                  accessibilityHint={handleLongPress ? t('search.saveHintA11y') : undefined}
                >
                  <Ionicons
                    name={iconName}
                    size={20}
                    color={
                      suggestion.featureType === 'poi'
                        ? colors.accent
                        : colors.textSecondary
                    }
                    style={styles.suggestionIcon}
                  />
                  <View style={styles.suggestionText}>
                    <View style={styles.suggestionPrimaryRow}>
                      <Text
                        style={[
                          textBase,
                          {
                            flex: 1,
                            color: colors.textPrimary,
                            fontFamily: fontFamily.body.semiBold,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {suggestion.primaryText}
                      </Text>
                      {suggestion.distanceLabel ? (
                        <Text
                          style={[
                            textXs,
                            {
                              color: colors.textMuted,
                              fontFamily: fontFamily.mono.medium,
                              marginLeft: space[2],
                            },
                          ]}
                        >
                          {suggestion.distanceLabel}
                        </Text>
                      ) : null}
                    </View>
                    {suggestion.secondaryText ? (
                      <Text
                        style={[textSm, { color: colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        {suggestion.secondaryText}
                      </Text>
                    ) : (
                      <Text
                        style={[textSm, { color: colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        {suggestion.label}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
        </ScrollView>
      ) : null}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  wrap: {
    gap: space[2],
  },
  label: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  clearButton: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionSheet: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: space[2],
    gap: space[2],
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingVertical: space[2],
    paddingHorizontal: space[2],
  },
  suggestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    gap: space[3],
  },
  suggestionIcon: {
    marginTop: 2,
  },
  suggestionText: {
    flex: 1,
    gap: 2,
  },
  suggestionPrimaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
