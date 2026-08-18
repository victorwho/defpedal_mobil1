/**
 * PremiumLimitCard — the in-context upsell shown when a rider meets a free-tier
 * ceiling.
 *
 * Deliberately an inline card, never a blocking modal: the rider was in the
 * middle of doing something, and a limit is not an emergency. It explains what
 * happened, says what their options are (including the free one — delete a
 * route, ride a Safe route), and offers Plus as one of them.
 *
 * It does NOT decide whether to render. The caller owns that, because only the
 * caller knows both the count and whether paywall UI is visible at all
 * (`usePremium().uiEnabled`). Rendering this without that gate would show a
 * paywall during the dark launch.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../atoms/Button';
import { PlusBadge } from '../atoms/PlusBadge';
import { useTheme } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textSm, textXs } from '../tokens/typography';
import { useT } from '../../hooks/useTranslation';

/** Which ceiling was hit. Drives the icon and the copy keys. */
export type PremiumLimitKind = 'savedRoutes' | 'offlinePacks' | 'flatRoutes' | 'history';

const ICONS: Record<PremiumLimitKind, string> = {
  savedRoutes: 'bookmark-outline',
  offlinePacks: 'cloud-download-outline',
  flatRoutes: 'trending-up-outline',
  history: 'time-outline',
};

const COPY: Record<PremiumLimitKind, { title: string; body: string }> = {
  savedRoutes: { title: 'premium.limitRoutesTitle', body: 'premium.limitRoutesBody' },
  offlinePacks: { title: 'premium.limitPacksTitle', body: 'premium.limitPacksBody' },
  flatRoutes: { title: 'premium.limitFlatTitle', body: 'premium.limitFlatBody' },
  history: { title: 'premium.limitHistoryTitle', body: 'premium.limitHistoryBody' },
};

export interface PremiumLimitCardProps {
  kind: PremiumLimitKind;
  /**
   * The free-tier number quoted in the copy — routes/packs/rides for the
   * count-based limits, days for history. Comes from the catalog via
   * `usePremium().limits`, never a literal.
   */
  limitValue: number;
  onUpgrade: () => void;
  /** Omit to render without a dismiss affordance. */
  onDismiss?: () => void;
}

export const PremiumLimitCard: React.FC<PremiumLimitCardProps> = ({
  kind,
  limitValue,
  onUpgrade,
  onDismiss,
}) => {
  const { colors } = useTheme();
  const t = useT();
  const copy = COPY[kind];
  // History quotes a window in days; the others quote a count.
  const vars: Record<string, string | number> =
    kind === 'history' ? { days: limitValue } : { count: limitValue };

  return (
    <View
      accessibilityRole="summary"
      style={[
        styles.card,
        { backgroundColor: colors.bgSecondary, borderColor: colors.borderDefault },
      ]}
    >
      <View style={styles.headerRow}>
        <Ionicons name={ICONS[kind] as never} size={18} color={colors.accent} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t(copy.title)}</Text>
        <PlusBadge size="sm" muted />
      </View>

      <Text style={[styles.body, { color: colors.textSecondary }]}>{t(copy.body, vars)}</Text>

      <View style={styles.actions}>
        <Button size="sm" variant="primary" onPress={onUpgrade}>
          {t('premium.upgrade')}
        </Button>
        {onDismiss ? (
          <Button size="sm" variant="ghost" onPress={onDismiss}>
            {t('premium.notNow')}
          </Button>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: space[4],
    gap: space[2],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  title: {
    ...textSm,
    fontFamily: fontFamily.body.semiBold,
    flexShrink: 1,
  },
  body: {
    ...textXs,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    marginTop: space[1],
  },
});
