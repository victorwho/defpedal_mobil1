/**
 * ShareOptionsModal — pre-share sheet for slice 6 privacy toggle.
 *
 * Appears when the user taps Share from route-preview. Lets them flip
 * `hideEndpoints` off for routes where the endpoints aren't sensitive.
 * Defaults ON (PRD: "safe default each time" — we don't persist the
 * choice across shares).
 *
 * Short-route fallback: if the route is under 400m, the toggle is
 * disabled and greyed out with helper text. Trimming 200m off each end
 * of a 300m route would leave nothing visible, so the server ignores
 * the flag anyway — the UI communicates this explicitly instead of
 * silently swallowing the intent.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, type ThemeColors } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textSm, textXs } from '../tokens/typography';

export interface ShareOptionsModalProps {
  visible: boolean;
  /** Current toggle state. Parent owns it so the native share flow sees the latest value. */
  hideEndpoints: boolean;
  /** Called when the user flips the toggle. */
  onHideEndpointsChange: (next: boolean) => void;
  /** Called on the primary "Share" button. */
  onConfirm: () => void;
  /** Called on Cancel or backdrop tap. */
  onDismiss: () => void;
  /**
   * True when the route's total length is under the safeguard (2 × trim =
   * 400m by default). Disables the toggle and shows a helper line — the
   * server-side trim is a no-op on short routes regardless.
   */
  shortRouteFallback: boolean;
  /** Optional: distance label for the route summary line. */
  distanceKm: string;
}

export const ShareOptionsModal = ({
  visible,
  hideEndpoints,
  onHideEndpointsChange,
  onConfirm,
  onDismiss,
  shortRouteFallback,
  distanceKm,
}: ShareOptionsModalProps) => {
  const { colors } = useTheme();
  const styles = createThemedStyles(colors);

  const handleToggle = useCallback(() => {
    if (shortRouteFallback) return; // disabled — route too short to trim
    onHideEndpointsChange(!hideEndpoints);
  }, [hideEndpoints, onHideEndpointsChange, shortRouteFallback]);

  // When the toggle is disabled, visually surface hideEndpoints=false
  // since that's what the server will effectively apply.
  const effectiveOn = shortRouteFallback ? false : hideEndpoints;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onDismiss}
        accessible={false}
      >
        <Pressable
          style={styles.card}
          onPress={(e) => e.stopPropagation()}
          accessible={false}
        >
          <Text style={styles.title}>Share this route</Text>
          <Text style={styles.summary}>{distanceKm} km route</Text>

          <Pressable
            style={[styles.toggleRow, shortRouteFallback && styles.toggleRowDisabled]}
            onPress={handleToggle}
            accessible
            accessibilityRole="switch"
            accessibilityState={{ checked: effectiveOn, disabled: shortRouteFallback }}
            accessibilityLabel="Hide exact start and end address"
          >
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleLabel}>Hide exact start/end address</Text>
              <Text style={styles.toggleSubtext}>
                {shortRouteFallback
                  ? 'Route too short to trim safely'
                  : 'Trims first and last 200m from the shared map'}
              </Text>
            </View>
            <View
              style={[
                styles.checkbox,
                effectiveOn && styles.checkboxOn,
                shortRouteFallback && styles.checkboxDisabled,
              ]}
            >
              {effectiveOn ? (
                <Ionicons name="checkmark" size={16} color={colors.textInverse} />
              ) : null}
            </View>
          </Pressable>

          <View style={styles.actions}>
            <Pressable
              style={styles.cancelButton}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Cancel share"
            >
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.confirmButton}
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel="Share route"
            >
              <Text style={styles.confirmLabel}>Share</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: space[4],
    },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.xl,
      padding: space[4],
      gap: space[3],
    },
    title: {
      ...textBase,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
      fontSize: 18,
    },
    summary: {
      ...textSm,
      color: colors.textSecondary,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      paddingVertical: space[2],
      paddingHorizontal: space[3],
      backgroundColor: colors.bgTertiary,
      borderRadius: radii.md,
    },
    toggleRowDisabled: {
      opacity: 0.6,
    },
    toggleCopy: {
      flex: 1,
      gap: 2,
    },
    toggleLabel: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    toggleSubtext: {
      ...textXs,
      color: colors.textSecondary,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.borderDefault,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    checkboxOn: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    checkboxDisabled: {
      opacity: 0.5,
    },
    actions: {
      flexDirection: 'row',
      gap: space[2],
      justifyContent: 'flex-end',
      marginTop: space[2],
    },
    cancelButton: {
      paddingHorizontal: space[4],
      paddingVertical: space[2],
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.borderDefault,
    },
    cancelLabel: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textSecondary,
    },
    confirmButton: {
      paddingHorizontal: space[4],
      paddingVertical: space[2],
      borderRadius: radii.full,
      backgroundColor: colors.accent,
    },
    confirmLabel: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textInverse,
    },
  });
