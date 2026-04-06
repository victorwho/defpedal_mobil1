import type { AutocompleteSuggestion } from '@defensivepedal/core';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { brandColors, safetyColors } from '../design-system/tokens/colors';
import { radii } from '../design-system/tokens/radii';

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
          <Pressable
            style={styles.clearButton}
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
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
                accessibilityRole="button"
                accessibilityLabel={`Select ${suggestion.primaryText}`}
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
    color: brandColors.textMuted,
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
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: brandColors.textInverse,
    fontSize: 15,
  },
  clearButton: {
    borderRadius: radii.full,
    backgroundColor: brandColors.textInverse,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  clearButtonLabel: {
    color: brandColors.accent,
    fontWeight: '700',
  },
  statusText: {
    color: brandColors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  suggestionSheet: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    padding: 10,
    gap: 8,
  },
  helperText: {
    color: brandColors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: safetyColors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  suggestionButton: {
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  suggestionTitle: {
    color: brandColors.textInverse,
    fontSize: 15,
    fontWeight: '800',
  },
  suggestionSubtitle: {
    color: brandColors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
});
