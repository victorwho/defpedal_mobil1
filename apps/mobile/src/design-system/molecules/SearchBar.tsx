/**
 * Design System v1.0 — SearchBar Molecule
 *
 * Collapsed state: pill-shaped input with search icon.
 * Expanded state: full-width input with suggestions dropdown.
 * Built on TextInput atom + Spinner atom.
 */
import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AutocompleteSuggestion } from '@defensivepedal/core';

import { useTheme } from '../ThemeContext';
import { TextInput } from '../atoms/TextInput';
import { Spinner } from '../atoms/Spinner';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { fontFamily } from '../tokens/typography';
import { textSm, textXs, textBase, textLg } from '../tokens/typography';

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
          {isLoading ? (
            <View style={styles.helperRow}>
              <Spinner size={16} />
              <Text style={[textSm, { color: colors.textSecondary }]}>
                Searching places…
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
              No matches yet. Keep typing or try a nearby landmark.
            </Text>
          ) : null}

          {!isLoading &&
            !errorMessage &&
            suggestions.map((suggestion) => (
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
                  name="location-outline"
                  size={18}
                  color={colors.textSecondary}
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
                    {suggestion.primaryText}
                  </Text>
                  <Text
                    style={[textSm, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {suggestion.label}
                  </Text>
                </View>
              </Pressable>
            ))}
        </View>
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
});
