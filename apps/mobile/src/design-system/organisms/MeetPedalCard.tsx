/**
 * Design System v1.0 — MeetPedalCard Organism
 *
 * One-time onboarding card that introduces Pedal's voice. Shown once
 * after the first ride save (gated upstream by hasSeenMeetPedalCard in
 * the store). Sets expectations: Pedal teases, but you can soften the
 * voice in Profile.
 *
 * Suppressed during NAVIGATING — never appears over the live nav HUD.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../atoms/Button';
import { Mascot } from '../atoms/Mascot';
import { brandColors, darkTheme } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textXl } from '../tokens/typography';
import { useT } from '../../hooks/useTranslation';

interface MeetPedalCardProps {
  visible: boolean;
  onDismiss: () => void;
}

export const MeetPedalCard = ({ visible, onDismiss }: MeetPedalCardProps) => {
  const t = useT();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        {/* Inner Pressable absorbs touches so taps on the card body don't dismiss. */}
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.mascotRow}>
            <Mascot
              pose="wave"
              size="hero"
              accessibilityLabel={t('profile.meetPedalTitle')}
            />
          </View>
          <Text style={styles.title}>{t('profile.meetPedalTitle')}</Text>
          <Text style={styles.body}>{t('profile.meetPedalBody')}</Text>
          <Button onPress={onDismiss} variant="primary" fullWidth>
            {t('profile.meetPedalCta')}
          </Button>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[5],
  },
  card: {
    backgroundColor: darkTheme.bgPrimary,
    borderRadius: radii.xl,
    padding: space[5],
    width: '100%',
    maxWidth: 420,
    gap: space[4],
    alignItems: 'center',
    ...shadows.lg,
  },
  mascotRow: {
    alignItems: 'center',
  },
  title: {
    ...textXl,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.accent,
    textAlign: 'center',
  },
  body: {
    ...textBase,
    fontFamily: fontFamily.body.regular,
    color: darkTheme.textPrimary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
