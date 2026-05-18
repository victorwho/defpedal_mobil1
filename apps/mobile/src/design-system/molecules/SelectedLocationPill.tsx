/**
 * Design System v1.0 — SelectedLocationPill Molecule
 *
 * Two-line "selected location" card used by route planning for origin,
 * destination, and waypoint slots once the user has picked something.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ DESTINATION                              ✎  │
 *   │ ● Strada Eroilor 42                          │
 *   │   Iosia, Oradea                              │
 *   └──────────────────────────────────────────────┘
 *
 * - Tiny uppercase label (matches SearchBar's label affordance)
 * - Colored dot or numbered badge on the left
 * - Bold primary text   — POI name or street + number
 * - Muted secondary text — city / neighborhood (no postcode, no country)
 * - Pencil edit button on the right to swap back to SearchBar mode
 * - Optional close (x) button — used for removable waypoints
 *
 * Map-overlay surface: this component is intentionally rendered on a
 * white background (MAP_OVERLAY_BG) so it stays legible over the
 * dark Mapbox basemap regardless of theme.
 */
import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../ThemeContext';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { fontFamily } from '../tokens/typography';
import { gray } from '../tokens/colors';

// ---------------------------------------------------------------------------
// Constants — kept in sync with route-planning's MAP_OVERLAY_BG
// ---------------------------------------------------------------------------

const MAP_OVERLAY_BG = '#FFFFFF';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SelectedLocationPillProps {
  /** Tiny uppercase label above the content (e.g., "FROM", "DESTINATION"). */
  label: string;
  /** Bold primary line — POI name or street + number. */
  primaryText: string;
  /** Muted secondary line — neighborhood, city. Omitted if empty. */
  secondaryText?: string;
  /** Color of the leading dot. Defaults to info blue. */
  dotColor?: string;
  /** Show a number inside the dot (used for waypoint stops). */
  dotNumber?: number;
  /** Tapping the pencil enters edit mode (swap back to SearchBar). */
  onEdit?: () => void;
  /** Optional close button — used for removable waypoint stops. */
  onRemove?: () => void;
  /** Accessibility label override; defaults to "{label}: {primary}, {secondary}". */
  accessibilityLabel?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SelectedLocationPill: React.FC<SelectedLocationPillProps> = ({
  label,
  primaryText,
  secondaryText,
  dotColor,
  dotNumber,
  onEdit,
  onRemove,
  accessibilityLabel,
}) => {
  const { colors } = useTheme();

  const resolvedDotColor = dotColor ?? colors.info;
  const derivedA11yLabel =
    accessibilityLabel ??
    [`${label}:`, primaryText, secondaryText].filter(Boolean).join(' ');

  return (
    <View style={styles.card}>
      {/* Tiny uppercase label */}
      <Text
        style={[
          styles.label,
          { color: colors.textMuted, fontFamily: fontFamily.body.semiBold },
        ]}
      >
        {label}
      </Text>

      <View style={styles.contentRow}>
        {/* Leading dot or numbered badge */}
        {dotNumber !== undefined ? (
          <View style={[styles.dotNumbered, { backgroundColor: resolvedDotColor }]}>
            <Text style={styles.dotNumberText}>{dotNumber}</Text>
          </View>
        ) : (
          <View style={[styles.dot, { backgroundColor: resolvedDotColor }]} />
        )}

        {/* Primary + secondary stack */}
        <View
          style={styles.textWrap}
          accessibilityLabel={derivedA11yLabel}
          accessible
        >
          <Text style={styles.primary} numberOfLines={1}>
            {primaryText}
          </Text>
          {secondaryText ? (
            <Text style={styles.secondary} numberOfLines={1}>
              {secondaryText}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Action buttons — pinned top-right, stacked when both present */}
      <View style={styles.actionColumn}>
        {onEdit ? (
          <Pressable
            style={styles.actionButton}
            onPress={onEdit}
            accessibilityLabel={`Edit ${label.toLowerCase()}`}
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="pencil-outline" size={18} color={gray[500]} />
          </Pressable>
        ) : null}
        {onRemove ? (
          <Pressable
            style={styles.actionButton}
            onPress={onRemove}
            accessibilityLabel={`Remove ${label.toLowerCase()}`}
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={18} color={gray[500]} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    backgroundColor: MAP_OVERLAY_BG,
    borderRadius: radii.xl,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    paddingRight: 56, // reserve room for the action column
    gap: space[2],
    ...shadows.md,
  },
  label: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 36,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  primary: {
    color: gray[800],
    fontFamily: fontFamily.body.bold,
    fontSize: 15,
  },
  secondary: {
    color: gray[500],
    fontSize: 13,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dotNumbered: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotNumberText: {
    color: '#FFFFFF',
    fontFamily: fontFamily.body.bold,
    fontSize: 12,
  },
  actionColumn: {
    position: 'absolute',
    top: space[2],
    right: space[2],
    gap: space[1],
    alignItems: 'flex-end',
  },
  actionButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
