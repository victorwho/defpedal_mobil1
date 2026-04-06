/**
 * Design System v1.0 — SettingRow Molecule
 *
 * A row with label, description, and toggle switch.
 * Used for boolean settings throughout the app.
 * Combines settingRow pattern from profile.tsx with Toggle atom.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Toggle } from '../atoms/Toggle';
import { brandColors, gray } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textSm } from '../tokens/typography';
import { surfaceTints } from '../tokens/tints';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SettingRowProps {
  /** Primary label text */
  label: string;
  /** Secondary description text */
  description: string;
  /** Current toggle state */
  checked: boolean;
  /** Called when toggle state changes */
  onChange: (checked: boolean) => void;
  /** Disables the toggle and dims the row */
  disabled?: boolean;
  /** Accessibility label for the toggle (defaults to label) */
  accessibilityLabel?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SettingRow: React.FC<SettingRowProps> = ({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  accessibilityLabel,
}) => {
  return (
    <Pressable
      style={[styles.container, disabled && styles.containerDisabled]}
      onPress={() => !disabled && onChange(!checked)}
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <View style={styles.textColumn}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <Toggle
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel ?? label}
      />
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space[4],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    backgroundColor: surfaceTints.glass,
  },
  containerDisabled: {
    opacity: 0.5,
  },
  textColumn: {
    flex: 1,
    gap: space[1],
    marginRight: space[3],
  },
  label: {
    ...textBase,
    fontFamily: fontFamily.body.medium,
    color: brandColors.textPrimary,
  },
  description: {
    ...textSm,
    color: brandColors.textSecondary,
  },
});
