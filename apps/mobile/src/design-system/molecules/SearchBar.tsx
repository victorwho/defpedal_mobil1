/**
 * Design System v1.0 — SearchBar Molecule
 *
 * Collapsed state: pill-shaped input with search icon.
 * Expanded state: full-width input with suggestions dropdown.
 * Built on TextInput atom + Spinner atom.
 */
import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AutocompleteSuggestion, SuggestionFeatureType } from '@defensivepedal/core';

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
  onChangeText,
  onFocus,
  onClear,
  onSelectSuggestion,
}) => {
  const { colors } = useTheme();
  const t = useT();
  const showSuggestions =
    active && (isLoading || Boolean(errorMessage) || suggestions.length > 0);

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

      {/* Suggestions dropdown */}
      {showSuggestions ? (
        <ScrollView
          style={[
            styles.suggestionSheet,
            {
              backgroundColor: colors.bgSecondary,
              borderColor: colors.borderDefault,
              maxHeight: 280,
            },
            shadows.md,
          ]}
        >
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

          {!isLoading && !errorMessage && suggestions.length === 0 ? (
            <Text style={[textSm, { color: colors.textSecondary }]}>
              {t('search.noMatches')}
            </Text>
          ) : null}

          {!isLoading &&
            !errorMessage &&
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
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${suggestion.primaryText}`}
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
