import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Mascot } from '../atoms/Mascot';
import { useTheme, type ThemeColors } from '../ThemeContext';
import type { MascotPose } from '../tokens/mascotPoses';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textSm } from '../tokens/typography';

export interface PedalSaysProps {
  pose: MascotPose;
  /** One short line. Pedal narrates; it never carries the safety claim alone. */
  line: string;
}

/**
 * Pedal with a one-line speech bubble — the narrator of the first-ride
 * onboarding (docs/plans/onboarding-first-ride.md [D7]).
 *
 * The mascot is decorative (the atom's default); the line is real text, so a
 * screen reader reads it once as plain content. The `Mascot` atom already
 * hides itself when the rider has turned Pedal off or is navigating — the
 * bubble then stands alone, which is why it never depends on the image.
 */
export const PedalSays = ({ pose, line }: PedalSaysProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <Mascot pose={pose} size="xs" />
      <View style={styles.bubble}>
        <Text style={styles.line}>{line}</Text>
      </View>
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    bubble: {
      flex: 1,
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
    },
    line: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
  });
