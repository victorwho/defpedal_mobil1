/**
 * Design System v1.0 — CanopyComparisonRow Molecule
 *
 * Tree-canopy result for a shade (Cool) route, as a card matching the
 * safe-vs-fast "calmer ride" badge it sits beside.
 *
 *   ┌────────────────────────────────────────────────┐
 *   │ 🍃  +27% more shade                            │
 *   │     73% of this ride is under trees, vs 46%    │
 *   │     on the standard route.                     │
 *   └────────────────────────────────────────────────┘
 *
 * WHY THIS IS A COMPONENT AND NOT INLINE IN route-preview.tsx
 * -----------------------------------------------------------
 * `app/route-preview.tsx` has no test — no screen in `app/` does, and standing
 * one up means mocking Mapbox, expo-router, the store and TanStack Query. An
 * inline block there is unverifiable, which is exactly how `/loop-planner`
 * once shipped a screen whose content was in the bundle and never rendered
 * (error-log #106). Rendering lives here so a render test can prove the
 * numbers actually reach the screen, in every locale.
 *
 * THREE STATES, BECAUSE THE HONEST CLAIM CHANGES SHAPE
 * -----------------------------------------------------
 * A single "X% more shade" line cannot cover real data. Measured over 18
 * routes across five cities and four start points each (2026-09-18): the
 * shade route wins on 8, ties EXACTLY on 8, and loses on 2. So:
 *
 *   gain     -> the headline number, cool blue, large.
 *   similar  -> "Similar tree cover" (covers small differences both ways).
 *   no_gain  -> both absolute figures, stated plainly, no headline.
 *
 * The third state is why nothing here ever renders a signed delta: when the
 * shade route carries less canopy there is no honest headline, so the card
 * reports the two numbers and makes no claim. A negative "more shade" is the
 * one thing this component must never be able to say — and it cannot, because
 * the verdict that reaches it has no field to put a negative in.
 *
 * WHY NOT A RELATIVE PERCENTAGE
 * -----------------------------
 * `pointsMore` is a percentage-POINT difference. The same pair rendered
 * relatively reads "+58% more shade", and on a low base it inflates absurdly:
 * 2% of a ride vs 1% is "+100% more shade" for a ride that is 98% in the sun.
 * Points understate, relative overstates; understating is the safer error.
 *
 * COLOUR
 * ------
 * `coolAccent` (#2E86C1) is the one blue in the cool family clearing 3:1 on
 * BOTH the light and dark card surfaces (measured 3.29:1 / 3.05:1). It is used
 * only on the icon and on the headline, which is 20px bold — i.e. WCAG "large
 * text", where 3:1 is the bar. Supporting copy uses the theme's own text
 * colours, because this blue fails AA at body size on the light surface.
 * Meaning never rests on the colour: the icon and the words carry it.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  describeCanopyComparison,
  formatTreePct,
  type RouteCanopyComparison,
} from '@defensivepedal/core';

import { useTheme } from '../ThemeContext';
import { useT } from '../../hooks/useTranslation';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { safetyTints } from '../tokens/tints';
import { fontFamily, textXl, textSm, textXs } from '../tokens/typography';

export interface CanopyComparisonRowProps {
  /**
   * The server-gated comparison, straight off `RoutePreviewResponse.canopy`.
   * `null`/`undefined` renders nothing — callers pass it through rather than
   * deciding for themselves whether there is anything to show.
   */
  canopy: RouteCanopyComparison | null | undefined;
}

export const CanopyComparisonRow: React.FC<CanopyComparisonRowProps> = ({ canopy }) => {
  const { colors } = useTheme();
  const t = useT();

  if (!canopy) return null;

  const values = {
    shade: formatTreePct(canopy.shadeTreePct),
    standard: formatTreePct(canopy.standardTreePct),
  };
  const verdict = describeCanopyComparison(canopy);

  // Only the `gain` state gets the large cool-blue number. The other two are
  // statements rather than headlines, and take the theme's own text colour.
  const isGain = verdict.kind === 'gain';
  const headline =
    verdict.kind === 'gain'
      ? t('preview.canopy.moreShade', { points: verdict.pointsMore })
      : verdict.kind === 'similar'
        ? t('preview.canopy.similar')
        : t('preview.canopy.comparison', values);
  const detail =
    verdict.kind === 'gain'
      ? t('preview.canopy.moreShadeSub', values)
      : verdict.kind === 'similar'
        ? t('preview.canopy.similarSub', values)
        : null;

  return (
    <View
      style={styles.card}
      accessible={true}
      accessibilityLabel={
        // The no-gain line separates the two routes with "·", which a screen
        // reader announces as a symbol; its a11y variant says the same thing
        // in sentences. The other two states already read as prose.
        verdict.kind === 'no_gain'
          ? t('preview.canopy.comparisonA11y', values)
          : detail
            ? `${headline}. ${detail}`
            : headline
      }
    >
      <Ionicons name="leaf" size={20} color={safetyTints.coolAccent} />
      <View style={styles.textColumn}>
        <Text
          style={[
            isGain ? styles.headlineGain : styles.headlineStatement,
            isGain ? null : { color: colors.textPrimary },
          ]}
        >
          {headline}
        </Text>
        {detail ? (
          <Text style={[styles.detail, { color: colors.textSecondary }]}>{detail}</Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: safetyTints.coolBorder,
    backgroundColor: safetyTints.coolLight,
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  /**
   * 20px bold is load-bearing, not decoration: it is what puts `coolAccent`
   * above the WCAG "large text" line, where 3:1 is the passing bar. Shrink
   * this and the colour stops passing contrast.
   */
  headlineGain: {
    ...textXl,
    fontFamily: fontFamily.heading.bold,
    color: safetyTints.coolAccent,
  },
  headlineStatement: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
  },
  detail: {
    ...textXs,
    lineHeight: 16,
  },
});
