import type { AutocompleteSuggestion } from '@defensivepedal/core';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { mobileTheme } from '../lib/theme';

type PlaceSearchFieldProps = {
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
};

export const PlaceSearchField = ({
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
}: PlaceSearchFieldProps) => {
  const showSuggestions = active && (isLoading || Boolean(errorMessage) || suggestions.length > 0);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          style={styles.input}
          onChangeText={onChangeText}
          onFocus={onFocus}
          autoCorrect={false}
          autoCapitalize="words"
        />
        {value ? (
          <Pressable style={styles.clearButton} onPress={onClear}>
            <Text style={styles.clearButtonLabel}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}

      {showSuggestions ? (
        <View style={styles.suggestionSheet}>
          {isLoading ? <Text style={styles.helperText}>Searching places...</Text> : null}
          {!isLoading && errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          {!isLoading && !errorMessage && suggestions.length === 0 ? (
            <Text style={styles.helperText}>No matches yet. Keep typing or try a nearby landmark.</Text>
          ) : null}
          {!isLoading &&
            !errorMessage &&
            suggestions.map((suggestion) => (
              <Pressable
                key={suggestion.id}
                style={styles.suggestionButton}
                onPress={() => onSelectSuggestion(suggestion)}
              >
                <Text style={styles.suggestionTitle}>{suggestion.primaryText}</Text>
                <Text style={styles.suggestionSubtitle}>{suggestion.label}</Text>
              </Pressable>
            ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  label: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceMuted,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: mobileTheme.colors.textPrimary,
    fontSize: 15,
  },
  clearButton: {
    borderRadius: mobileTheme.radii.pill,
    backgroundColor: mobileTheme.colors.surfaceAccent,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  clearButtonLabel: {
    color: mobileTheme.colors.brand,
    fontWeight: '700',
  },
  statusText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  suggestionSheet: {
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    padding: 10,
    gap: 8,
  },
  helperText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: mobileTheme.colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  suggestionButton: {
    borderRadius: 16,
    backgroundColor: mobileTheme.colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  suggestionTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  suggestionSubtitle: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
});
