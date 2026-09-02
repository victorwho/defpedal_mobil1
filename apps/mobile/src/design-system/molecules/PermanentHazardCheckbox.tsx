/**
 * Design System v1.0 — PermanentHazardCheckbox Molecule
 *
 * Optional "this hazard is permanent" opt-in shown inside the hazard
 * quick-report card on both surfaces that can file a report (route planning
 * and in-ride navigation).
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ☑  This hazard is permanent                  │
 *   │    Won't expire on its own. Removed only if  │
 *   │    10 riders say it's gone.                  │
 *   └──────────────────────────────────────────────┘
 *
 * Deliberately a checkbox rather than the `Toggle` atom: this is a one-off
 * choice attached to the report being filed, not a persisted setting, and the
 * 52 px switch would dominate a card whose whole job is a fast 2-tap report.
 *
 * The row is a single tap target (label included) so it clears the 44 pt
 * minimum without the icon itself having to.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../ThemeContext';
import { useHaptics } from '../hooks/useHaptics';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textSm, textXs } from '../tokens/typography';

export interface PermanentHazardCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Row title, e.g. "This hazard is permanent". */
  label: string;
  /** Muted second line explaining what permanence costs and how it is undone. */
  hint: string;
  disabled?: boolean;
}

export const PermanentHazardCheckbox: React.FC<PermanentHazardCheckboxProps> = ({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}) => {
  const { colors } = useTheme();
  const haptics = useHaptics();

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptics.confirm();
        onChange(!checked);
      }}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: checked ? colors.bgSecondary : 'transparent',
          borderColor: checked ? colors.accent : colors.borderDefault,
        },
        pressed && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}
    >
      <Ionicons
        name={checked ? 'checkbox' : 'square-outline'}
        size={22}
        color={checked ? colors.accent : colors.textSecondary}
      />
      <View style={styles.textWrap}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 44,
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowDisabled: {
    opacity: 0.4,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  label: {
    ...textSm,
    fontFamily: fontFamily.body.semiBold,
  },
  hint: {
    ...textXs,
  },
});
