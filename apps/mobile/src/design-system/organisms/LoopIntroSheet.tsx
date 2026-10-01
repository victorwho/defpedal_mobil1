/**
 * LoopIntroSheet — explains recreational loops to a rider who has never used
 * them. Shown on app open by `LoopIntroManager` (app/_layout.tsx); when and
 * how often lives in `src/lib/loop-intro.ts`. This component only renders.
 *
 * One primary action ("Try it", opens /loop-planner) and one way out (the X,
 * Android back, or the backdrop). Copy makes only claims that hold for every
 * loop: you pick a distance, it returns to the start, out-of-town or nearby,
 * routed on the safety profile, with turn-by-turn.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../atoms/Button';
import { Mascot } from '../atoms/Mascot';
import { useTheme } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textLg, textSm } from '../tokens/typography';
import { useT } from '../../hooks/useTranslation';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

export interface LoopIntroSheetProps {
  visible: boolean;
  onClose: () => void;
  onTry: () => void;
}

const POINTS: ReadonlyArray<{ icon: IoniconsName; key: string }> = [
  { icon: 'navigate-circle-outline', key: 'loop.intro.pointPlacement' },
  { icon: 'shield-checkmark-outline', key: 'loop.intro.pointSafety' },
  { icon: 'arrow-undo-outline', key: 'loop.intro.pointGuidance' },
];

export const LoopIntroSheet: React.FC<LoopIntroSheetProps> = ({ visible, onClose, onTry }) => {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View
        style={[
          styles.root,
          { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[4] },
        ]}
      >
        {/*
          Backdrop is a SIBLING behind the card, not its parent: a tap on the X
          must never also reach the backdrop, or one close would count as two
          of the rider's three dismissals. Not an accessibility control either —
          screen readers get the X (and Android back), not a second "Close".
        */}
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessible={false}
          testID="loop-intro-backdrop"
        />

        <View
          style={[styles.card, { backgroundColor: colors.bgPrimary, borderColor: colors.borderDefault }]}
        >
          <Pressable
            style={styles.close}
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <Ionicons name="close" size={24} color={colors.textMuted} />
          </Pressable>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.mascot}>
              <Mascot pose="ride" size="md" />
            </View>

            <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
              {t('loop.intro.title')}
            </Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>{t('loop.intro.body')}</Text>

            <View style={styles.points}>
              {POINTS.map((point) => (
                <View key={point.key} style={styles.point}>
                  <Ionicons name={point.icon} size={20} color={colors.accent} />
                  <Text style={[styles.pointText, { color: colors.textPrimary }]}>{t(point.key)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Outside the ScrollView so the one action can never fall below the fold. */}
          <Button fullWidth variant="primary" size="lg" onPress={onTry}>
            {t('loop.intro.cta')}
          </Button>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space[5],
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    // 55%: inside the 40-60% band that keeps the card legible.
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '100%',
    alignSelf: 'center',
    borderRadius: radii['2xl'],
    borderWidth: 1,
    padding: space[5],
    gap: space[4],
  },
  close: {
    position: 'absolute',
    top: space[2],
    right: space[2],
    zIndex: 1,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { gap: space[3], paddingTop: space[2] },
  mascot: { alignItems: 'center' },
  title: { ...textLg, fontFamily: fontFamily.heading.bold, textAlign: 'center' },
  body: { ...textBase, lineHeight: 24, textAlign: 'center' },
  points: { gap: space[3], marginTop: space[1] },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  pointText: { ...textSm, lineHeight: 20, flex: 1 },
});
