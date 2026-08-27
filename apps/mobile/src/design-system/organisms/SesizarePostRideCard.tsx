/**
 * SesizarePostRideCard — post-ride offer to escalate hazards reported on the
 * ride that just ended.
 *
 * Renders on the feedback screen's post-submit "thank you" view, which is
 * deliberate: the ReviewPromptCard claims its slot at submit time, so by the
 * time this evaluates, the review card has already won or declined. That
 * makes the "sesizări yield to the review prompt" ordering structural rather
 * than a comment in an arbitration table.
 *
 * Renders NOTHING when no reported hazard can become a sesizare — ineligible
 * types, outside Romania, kill switch off, or the geocode hasn't resolved.
 * A header over an empty list is worse than no card.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSesizare } from '../../hooks/useSesizare';
import {
  useSesizareCandidates,
  type SesizareCandidateInput,
} from '../../hooks/useSesizareAvailability';
import { useT } from '../../hooks/useTranslation';
import { PressableScale } from '../atoms/PressableScale';
import { useTheme, type ThemeColors } from '../ThemeContext';
import { getHazardIcon } from '../tokens/hazardIcons';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textSm, textXs } from '../tokens/typography';

export interface SesizarePostRideCardProps {
  /** Hazards this rider reported during the ride that just ended. */
  reports: readonly SesizareCandidateInput[];
}

export const SesizarePostRideCard: React.FC<SesizarePostRideCardProps> = ({ reports }) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const { candidates } = useSesizareCandidates(reports);
  const { startSesizare, isStarting } = useSesizare();
  const [sentKeys, setSentKeys] = React.useState<readonly string[]>([]);

  if (candidates.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('sesizare.postRideTitle')}</Text>
      <Text style={styles.body}>{t('sesizare.postRideBody')}</Text>

      <View style={styles.list}>
        {candidates.map((candidate) => {
          // No server hazard id here — the report may still be in the offline
          // queue. The sesizare row carries its own coordinate snapshot, so
          // the escalation is recorded either way.
          const key = `${candidate.reportedAt}|${candidate.hazardType}`;
          const sent = sentKeys.includes(key);
          return (
            <PressableScale
              key={key}
              style={[styles.row, sent ? styles.rowSent : null]}
              disabled={isStarting || sent}
              hapticOnPress="confirm"
              accessibilityRole="button"
              accessibilityState={{ disabled: sent }}
              accessibilityLabel={`${t(`hazard.types.${candidate.hazardType}`)} — ${t('sesizare.cta')}`}
              onPress={() => {
                setSentKeys((previous) => [...previous, key]);
                void startSesizare({
                  hazardType: candidate.hazardType,
                  coordinate: candidate.coordinate,
                  address: candidate.address,
                  observedAt: candidate.reportedAt,
                  surface: 'post_ride',
                });
              }}
            >
              <Ionicons
                name={getHazardIcon(candidate.hazardType) as never}
                size={20}
                color={sent ? colors.textSecondary : colors.accent}
              />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {t(`hazard.types.${candidate.hazardType}`)}
                </Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  {candidate.address}
                </Text>
              </View>
              <Text style={styles.rowAction}>
                {sent ? t('sesizare.alreadyEscalated') : t('sesizare.ctaShort')}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
};

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      gap: space[2],
      padding: space[4],
      borderRadius: radii.lg,
      backgroundColor: colors.bgSecondary,
      borderWidth: 1,
      borderColor: colors.borderDefault,
    },
    title: {
      ...textBase,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    body: {
      ...textSm,
      color: colors.textSecondary,
    },
    list: {
      gap: space[2],
      marginTop: space[1],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      paddingHorizontal: space[3],
      paddingVertical: space[3],
      borderRadius: radii.md,
      backgroundColor: colors.bgPrimary,
    },
    rowSent: {
      opacity: 0.6,
    },
    rowText: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    rowSubtitle: {
      ...textXs,
      color: colors.textSecondary,
    },
    rowAction: {
      ...textXs,
      fontFamily: fontFamily.body.semiBold,
      color: colors.accent,
    },
  });
