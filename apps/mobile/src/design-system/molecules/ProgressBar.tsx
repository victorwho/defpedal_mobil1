/**
 * Design System v1.0 — ProgressBar Molecule
 *
 * Segmented progress bar with checkmark items.
 * Shows filled segments for completed steps, unfilled for remaining.
 * Uses brand yellow for fill by default.
 */
import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import Ionicons from '@expo/vector-icons/Ionicons';

import { brandColors, gray } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily } from '../tokens/typography';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProgressStep {
  readonly label: string;
  readonly completed: boolean;
}

export interface ProgressBarProps {
  steps: readonly ProgressStep[];
  accentColor?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ProgressBar = ({
  steps,
  accentColor = brandColors.accent,
}: ProgressBarProps) => {
  const completedCount = steps.filter((s) => s.completed).length;

  return (
    <View style={styles.root}>
      {/* Segmented bar */}
      <View style={styles.barRow}>
        {steps.map((step, index) => {
          const segmentStyle: ViewStyle = {
            flex: 1,
            height: 6,
            borderRadius: radii.full,
            backgroundColor: step.completed ? accentColor : gray[700],
            marginHorizontal: index > 0 && index < steps.length - 1 ? 2 : 0,
            marginLeft: index === 0 ? 0 : 2,
            marginRight: index === steps.length - 1 ? 0 : 2,
          };

          return <View key={step.label} style={segmentStyle} />;
        })}
      </View>

      {/* Step labels */}
      <View style={styles.labelsRow}>
        {steps.map((step) => (
          <View key={step.label} style={styles.labelItem}>
            <Ionicons
              name={step.completed ? 'checkmark-circle' : 'ellipse-outline'}
              size={16}
              color={step.completed ? accentColor : gray[600]}
            />
            <Text
              style={[
                styles.labelText,
                step.completed ? { color: brandColors.textPrimary } : { color: gray[500] },
              ]}
              numberOfLines={1}
            >
              {step.label}
            </Text>
          </View>
        ))}
      </View>

      {/* Progress fraction */}
      <Text style={styles.fractionText}>
        {completedCount}/{steps.length}
      </Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    gap: space[2],
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  labelItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  labelText: {
    fontFamily: fontFamily.body.medium,
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
  },
  fractionText: {
    fontFamily: fontFamily.mono.medium,
    fontSize: 12,
    lineHeight: 16,
    color: gray[400],
    textAlign: 'right',
  },
});
