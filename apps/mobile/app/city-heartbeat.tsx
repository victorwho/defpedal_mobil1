/**
 * City Heartbeat — Community pulse dashboard showing real-time cycling
 * activity, 7-day trends, hazard hotspots, and top contributors.
 *
 * Accessible from: community.tsx card.
 */
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '../src/components/Screen';
import { AnimatedCounter } from '../src/design-system/atoms/AnimatedCounter';
import { Surface } from '../src/design-system/atoms/Card';
import { FadeSlideIn } from '../src/design-system/atoms/FadeSlideIn';
import { ActivityChart } from '../src/design-system/organisms/ActivityChart';
import { LeaderboardSection } from '../src/design-system/organisms/LeaderboardSection';
import { PulseHeader } from '../src/design-system/organisms/PulseHeader';
import { useTheme, type ThemeColors } from '../src/design-system';
import { gray } from '../src/design-system/tokens/colors';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { space } from '../src/design-system/tokens/spacing';
import {
  fontFamily,
  textXs,
  textSm,
  textBase,
  textDataMd,
} from '../src/design-system/tokens/typography';
import { useCityHeartbeat } from '../src/hooks/useCityHeartbeat';
import { useT } from '../src/hooks/useTranslation';
import { HAZARD_TYPE_OPTIONS, SUPPORTED_APP_COUNTRIES, type HazardType } from '@defensivepedal/core';

// ---------------------------------------------------------------------------
// Hazard label lookup
// ---------------------------------------------------------------------------

const HAZARD_LABELS: Record<string, string> = Object.fromEntries(
  HAZARD_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

const hazardLabel = (type: HazardType | string): string =>
  HAZARD_LABELS[type] ?? type.replace(/_/g, ' ');

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CityHeartbeatScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const { heartbeat, isLoading, isRefreshing, error, refetch } = useCityHeartbeat();
  const t = useT();
  const screenTitle = t('cityHeartbeat.title');

  // ── Community-visibility ladder (honest labels). Every fallback keeps
  // the pre-ladder behavior so persisted old-shape caches render fine. ──
  const windowUsed = heartbeat?.windowUsed ?? 'today';
  const scopeUsed = heartbeat?.scopeUsed ?? 'nearby';
  const pulse = heartbeat?.pulse ?? heartbeat?.today;
  const chartMode = heartbeat?.chartMode ?? 'daily';
  const chartDaily = heartbeat?.chartDaily ?? heartbeat?.daily ?? [];
  const chartWeekly = heartbeat?.chartWeekly ?? [];

  // ── Rides started (2026-09-14) ──
  // `pulse` counts rides riders chose to SHARE; these count rides actually
  // STARTED, trial starts included. Undefined against a server/DB that predates
  // migration 202609140001 — in that case every "rides started" cell is simply
  // not rendered, rather than showing a zero that reads as "nobody rode".
  const ridesStarted = heartbeat?.ridesStarted;
  const communityRidesStarted = heartbeat?.communityRidesStarted;
  const totalsRidesStarted = heartbeat?.totalsRidesStarted;

  // ── Routes planned (2026-09-14) ──
  // Rendered ONLY when the server says recording covers the window being shown.
  // Recording began 2026-09-14 against an empty table, so before that the count
  // is a fraction of a period sitting beside complete ride counts: the first
  // render put "1 Routes planned" next to "1422 Rides", two true numbers making
  // a false point ("hardly anyone plans routes" rather than "we started
  // counting this morning"). `coversWindow` is derived from the data
  // server-side, so the cell returns by itself once a full window exists — no
  // threshold to pick, no launch date to hardcode, no follow-up release.
  //
  // The all-time variants are deliberately NOT rendered at all: `trips` reaches
  // back to 2025-12-17 and planned_routes never will, so an all-time card
  // cannot compare them fairly however long recording runs.
  const routesPlanned =
    heartbeat?.routesPlanned?.coversWindow === true ? heartbeat.routesPlanned : undefined;

  // ── Network scale (2026-09-14) ──
  // The community counts are honestly small — 822 signed-up cyclists, 552 who
  // have ridden — and no framing makes them big without lying. What IS big and
  // true is the network they ride on. These are global, not scope-resolved:
  // they answer "how much does this app know", which does not vary by where the
  // rider is standing.
  const network = heartbeat?.network;
  // Rounded to millions because the server sends a planner estimate (~0.014%
  // out on 67M rows); at this precision the error is three orders of magnitude
  // below the last digit shown, so the rendered figure is exactly as true as an
  // exact count. Do NOT render this to the unit.
  const roadSegmentsMillions = network ? network.roadSegmentsScored / 1_000_000 : 0;
  // Riding time expressed in days: 1,674 hours is the same fact as 69.8 days,
  // and the second one a rider can picture.
  const daysRidden = (heartbeat?.communityTotals?.durationSeconds ?? 0) / 86_400;
  const countriesCovered = SUPPORTED_APP_COUNTRIES.size;

  // ── Municipal cycle counts (2026-09-14) ──
  // ⚠️ NOT our activity. Real counts of real people on bicycles from city
  // counters, shown ONLY when at least one city is reporting — a zero here
  // means the ingest has not run or every source is stale, never that nobody
  // cycled. Kept in its own card and never summed with rides: conflating a
  // 1.9-million municipal count with our own 1,424 rides is precisely the
  // false impression this screen has been fixed for repeatedly.
  const cyclingInEurope =
    heartbeat?.cyclingInEurope && heartbeat.cyclingInEurope.cities > 0
      ? heartbeat.cyclingInEurope
      : undefined;
  const cyclistsMillions = cyclingInEurope ? cyclingInEurope.cyclistsCounted / 1_000_000 : 0;

  // ── Estimated daily cyclists in the rider's city (2026-09-14) ──
  // ⚠️ An ESTIMATE, and the card says so and cites it. Undefined where no
  // seeded city is close enough — correct, rather than borrowing a figure from
  // a city the rider is not in. The city is always NAMED: a rider in Râșnov is
  // shown "Brașov", never their own town's name over Brașov's number.
  const cityEstimate = heartbeat?.cityCyclingEstimate;
  // The orb is the one number read at a glance. It shows how many riders this
  // community actually has at the resolved scope — a larger and far steadier
  // figure than a windowed ride count, which at the old ladder threshold could
  // read "3" directly above an all-time card saying 232. Scope-matched
  // server-side, so it can never describe a different area than the title
  // beside it. Falls back to the ride count against a server without the field.
  const scopeRiders = heartbeat?.scopeRiders?.riders;
  const orbValue = scopeRiders ?? ridesStarted?.rides ?? pulse?.rides ?? 0;
  const orbLabel = scopeRiders === undefined ? undefined : t('cityHeartbeat.orbRiders');

  const cityLabel = heartbeat?.localityName ?? t('cityHeartbeat.cityFallback');
  // Header title follows the scope: city name nearby, honest wider labels
  // otherwise — never a city name over region/community-wide numbers.
  const headerTitle =
    scopeUsed === 'nearby'
      ? heartbeat?.localityName ?? null
      : scopeUsed === 'region'
        ? t('cityHeartbeat.scopeRegionTitle')
        : t('cityHeartbeat.scopeCommunityTitle');
  const pulseLabel = t(`cityHeartbeat.pulse_${windowUsed}_${scopeUsed}`, { city: cityLabel });
  const activeRidersLabel = t(
    `cityHeartbeat.activeRiders_${windowUsed}_${(pulse?.activeRiders ?? 0) === 1 ? 'one' : 'other'}`,
  );

  if (isLoading && !heartbeat) {
    return (
      <Screen title={screenTitle} headerVariant="back">
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.loadingText}>{t('cityHeartbeat.loading')}</Text>
        </View>
      </Screen>
    );
  }

  if (error && !heartbeat) {
    // Audit 2026-07-05 UX-3: never print the raw error string (leaks internal
    // endpoint/RPC detail and reads as a crash) and never dead-end — offer a
    // retry. The raw message still reaches Sentry via the query layer.
    return (
      <Screen title={screenTitle} headerVariant="back">
        <View style={styles.center}>
          <Text style={styles.errorText}>{t('cityHeartbeat.loadFailed')}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => refetch()}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
          >
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (!heartbeat) {
    return (
      <Screen title={screenTitle} headerVariant="back">
        <View style={styles.center}>
          <Text style={styles.loadingText}>{t('cityHeartbeat.noData')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen title={screenTitle} headerVariant="back">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading || isRefreshing}
            onRefresh={refetch}
            tintColor={colors.accent}
          />
        }
      >
        {/* Pulse header — honest window/scope labeling */}
        <FadeSlideIn delay={0}>
          <PulseHeader
            cityName={headerTitle}
            activeRidersToday={ridesStarted?.activeRiders ?? pulse?.activeRiders ?? 0}
            totalRidesToday={orbValue}
            orbLabel={orbLabel}
            activeRidersLabel={activeRidersLabel}
          />
        </FadeSlideIn>

        {/* Lifetime community totals — community-wide, only ever go up, so
            the first stat card a user reads is never a zero (Change 4) */}
        {heartbeat.communityTotals && heartbeat.communityTotals.rides > 0 && (
          <FadeSlideIn delay={50}>
            <Surface>
              <Text style={styles.sectionLabel}>{t('cityHeartbeat.communityAllTime')}</Text>
              <Text style={styles.sectionSub}>{t('cityHeartbeat.communityAllTimeSub')}</Text>
              <View style={styles.statGrid}>
                {communityRidesStarted && (
                  <StatCell
                    label={t('cityHeartbeat.ridesStarted')}
                    value={communityRidesStarted.rides}
                    suffix=""
                    decimals={0}
                    color={colors.accent}
                    styles={styles}
                  />
                )}
                <StatCell
                  label={t('cityHeartbeat.sharedRides')}
                  value={heartbeat.communityTotals.rides}
                  suffix=""
                  decimals={0}
                  color={colors.accent}
                  styles={styles}
                />
                <StatCell
                  label={t('cityHeartbeat.distance')}
                  value={heartbeat.communityTotals.distanceMeters / 1000}
                  suffix=" km"
                  decimals={0}
                  color={colors.info}
                  styles={styles}
                />
                <StatCell
                  label={t('cityHeartbeat.co2Saved')}
                  value={heartbeat.communityTotals.co2SavedKg}
                  suffix=" kg"
                  decimals={1}
                  color={colors.safe}
                  styles={styles}
                />
                <StatCell
                  label={t('cityHeartbeat.riders')}
                  // Riders who RODE, to match the Rides cell above it. Using
                  // communityTotals.uniqueRiders here counted only riders who
                  // SHARED, so the card read "1420 rides / 139 riders" when
                  // those rides came from 552 people — two populations in one
                  // card, understating the community roughly 4x.
                  value={communityRidesStarted?.activeRiders ?? heartbeat.communityTotals.uniqueRiders}
                  suffix=""
                  decimals={0}
                  color={colors.accent}
                  styles={styles}
                />
              </View>
            </Surface>
          </FadeSlideIn>
        )}

        {/* Pulse stats for the resolved (window, scope) rung */}
        <FadeSlideIn delay={100}>
          <Surface>
            <Text style={styles.sectionLabel}>{pulseLabel}</Text>
            <View style={styles.statGrid}>
              {/* Rides started comes first: it is the wider count and the one
                  the orb above shows. "Shared rides" sits beside it so the two
                  are never mistaken for each other — the km/CO2 cells are
                  computed from the SHARED rides only (trips carries no
                  distance), which is why that distinction has to stay visible. */}
              {ridesStarted && (
                <StatCell
                  label={t('cityHeartbeat.ridesStarted')}
                  value={ridesStarted.rides}
                  suffix=""
                  decimals={0}
                  color={colors.accent}
                  styles={styles}
                />
              )}
              <StatCell
                label={t('cityHeartbeat.sharedRides')}
                value={pulse?.rides ?? 0}
                suffix=""
                decimals={0}
                color={colors.accent}
                styles={styles}
              />
              {routesPlanned && (
                <StatCell
                  label={t('cityHeartbeat.routesPlanned')}
                  value={routesPlanned.routes}
                  suffix=""
                  decimals={0}
                  color={colors.info}
                  styles={styles}
                />
              )}
              <StatCell
                label={t('cityHeartbeat.distance')}
                value={(pulse?.distanceMeters ?? 0) / 1000}
                suffix=" km"
                decimals={1}
                color={colors.info}
                styles={styles}
              />
              <StatCell
                label={t('cityHeartbeat.co2Saved')}
                value={pulse?.co2SavedKg ?? 0}
                suffix=" kg"
                decimals={1}
                color={colors.safe}
                styles={styles}
              />
              <StatCell
                label={t('cityHeartbeat.donated')}
                value={pulse?.communitySeconds ?? 0}
                suffix=" sec"
                decimals={0}
                color={colors.info}
                styles={styles}
              />
            </View>
          </Surface>
        </FadeSlideIn>

        {/* Estimated daily cyclists in the rider's city.
            ⚠️ The source line is not decoration — it is the thing that makes
            this an estimate rather than an invention, and it must not be
            dropped to tidy the layout. The figure is rounded server-side so it
            cannot imply precision its inputs do not support. */}
        {cityEstimate && cityEstimate.dailyCyclists > 0 && (
          <FadeSlideIn delay={110}>
            <Surface>
              <Text style={styles.sectionLabel}>
                {t('cityHeartbeat.cityEstimateTitle', { city: cityEstimate.city })}
              </Text>
              <View style={styles.statGrid}>
                <StatCell
                  label={t('cityHeartbeat.cyclistsToday')}
                  value={cityEstimate.dailyCyclists}
                  suffix=""
                  decimals={0}
                  color={colors.accent}
                  styles={styles}
                />
              </View>
              {/* Why today differs from a typical day. This is what makes the
                  daily movement checkable — a rider can look out of the window
                  and see whether we are right. Hidden when conditions are
                  ordinary, since "today is typical" is not worth a line. */}
              {cityEstimate.conditions !== 'typical' && (
                <Text style={styles.estimateCondition}>
                  {t(`cityHeartbeat.conditions_${cityEstimate.conditions}`)}
                </Text>
              )}
              <Text style={styles.estimateSource}>
                {t('cityHeartbeat.cityEstimateSource', {
                  percent: cityEstimate.modalSharePercent,
                  year: cityEstimate.modalShareYear,
                  population: cityEstimate.population.toLocaleString(),
                })}
              </Text>
            </Surface>
          </FadeSlideIn>
        )}

        {/* Municipal cycle counts. Its own card, and worded so it cannot be
            read as our activity: these are city counters measuring everyone on
            a bike, not Defensive Pedal riders. The city count is shown beside
            the total because it is what makes the number legible — "across N
            cities" is the difference between a figure and a claim. */}
        {cyclingInEurope && (
          <FadeSlideIn delay={125}>
            <Surface>
              <Text style={styles.sectionLabel}>{t('cityHeartbeat.cyclingEuropeTitle')}</Text>
              <Text style={styles.sectionSub}>
                {t(
                  `cityHeartbeat.cyclingEuropeSub_${cyclingInEurope.cities === 1 ? 'one' : 'other'}`,
                  { cities: cyclingInEurope.cities },
                )}
              </Text>
              <View style={styles.statGrid}>
                <StatCell
                  label={t('cityHeartbeat.cyclistsCounted')}
                  value={cyclistsMillions}
                  suffix="M"
                  decimals={1}
                  color={colors.accent}
                  styles={styles}
                />
                <StatCell
                  label={t('cityHeartbeat.countersReporting')}
                  value={cyclingInEurope.counters}
                  suffix=""
                  decimals={0}
                  color={colors.info}
                  styles={styles}
                />
              </View>
            </Surface>
          </FadeSlideIn>
        )}

        {/* Network scale. Deliberately its own card rather than mixed into the
            community totals: these are not things riders near you did, they are
            the size of the map everyone rides on, and conflating the two is how
            a 67-million figure would end up implying 67 million rides. */}
        {network && network.roadSegmentsScored > 0 && (
          <FadeSlideIn delay={150}>
            <Surface>
              <Text style={styles.sectionLabel}>{t('cityHeartbeat.networkTitle')}</Text>
              <Text style={styles.sectionSub}>{t('cityHeartbeat.networkSub')}</Text>
              <View style={styles.statGrid}>
                <StatCell
                  label={t('cityHeartbeat.roadsScored')}
                  value={roadSegmentsMillions}
                  suffix="M"
                  decimals={0}
                  color={colors.accent}
                  styles={styles}
                />
                {/* "mapped", never "reported by riders" — ~99% are imported
                    from civic feeds; only 23 came from riders. */}
                <StatCell
                  label={t('cityHeartbeat.hazardsMapped')}
                  value={network.hazardsMapped}
                  suffix=""
                  decimals={0}
                  color={colors.caution}
                  styles={styles}
                />
                <StatCell
                  label={t('cityHeartbeat.countriesCovered')}
                  value={countriesCovered}
                  suffix=""
                  decimals={0}
                  color={colors.info}
                  styles={styles}
                />
                {daysRidden >= 1 && (
                  <StatCell
                    label={t('cityHeartbeat.daysRidden')}
                    value={daysRidden}
                    suffix=""
                    decimals={0}
                    color={colors.safe}
                    styles={styles}
                  />
                )}
              </View>
            </Surface>
          </FadeSlideIn>
        )}

        {/* Activity chart — daily (7 days) or weekly (4 weeks) at the resolved scope */}
        <FadeSlideIn delay={200}>
          <ActivityChart
            daily={chartDaily}
            days={7}
            mode={chartMode}
            weekly={chartWeekly}
            title={t(
              chartMode === 'weekly'
                ? 'cityHeartbeat.chartTitleWeekly'
                : 'cityHeartbeat.chartTitleDaily',
            )}
          />
        </FadeSlideIn>

        {/* Cumulative NEARBY totals. Deliberately pinned to the un-widened
            radius (migration 202607190001) — so the label must say "near
            you" and the card hides at zero: an unlabeled "ALL TIME" of
            zeros sat in the same scroll as the community-scope all-time
            card and read as a contradiction (review 2026-08-13 G-22). */}
        {heartbeat.totals.rides > 0 && (
        <FadeSlideIn delay={300}>
          <Surface>
            <Text style={styles.sectionLabel}>{t('cityHeartbeat.allTimeNearby')}</Text>
            <View style={styles.statGrid}>
              {totalsRidesStarted && (
                <StatCell
                  label={t('cityHeartbeat.ridesStarted')}
                  value={totalsRidesStarted.rides}
                  suffix=""
                  decimals={0}
                  color={colors.accent}
                  styles={styles}
                />
              )}
              <StatCell
                label={t('cityHeartbeat.sharedRides')}
                value={heartbeat.totals.rides}
                suffix=""
                decimals={0}
                color={colors.accent}
                styles={styles}
              />
              <StatCell
                label={t('cityHeartbeat.distance')}
                value={heartbeat.totals.distanceMeters / 1000}
                suffix=" km"
                decimals={0}
                color={colors.info}
                styles={styles}
              />
              <StatCell
                label={t('cityHeartbeat.co2Saved')}
                value={heartbeat.totals.co2SavedKg}
                suffix=" kg"
                decimals={1}
                color={colors.safe}
                styles={styles}
              />
              <StatCell
                label={t('cityHeartbeat.riders')}
                // Same pairing as the community card: riders who rode, so this
                // cell and the Rides cell describe one population.
                value={totalsRidesStarted?.activeRiders ?? heartbeat.totals.uniqueRiders}
                suffix=""
                decimals={0}
                color={colors.accent}
                styles={styles}
              />
            </View>
          </Surface>
        </FadeSlideIn>
        )}

        {/* Hazard hotspots */}
        {heartbeat.hazardHotspots.length > 0 && (
          <FadeSlideIn delay={400}>
            <Surface style={{ gap: space[2] }}>
              <Text style={styles.sectionLabel}>{t('cityHeartbeat.hazardHotspots')}</Text>
              <Text style={styles.sectionSub}>{t('cityHeartbeat.hazardHotspotsSub')}</Text>
              {heartbeat.hazardHotspots.map((h, i) => (
                <View key={`${h.hazardType}-${i}`} style={styles.hazardRow}>
                  <View style={styles.hazardBadge}>
                    <Text style={styles.hazardBadgeText}>{h.count}</Text>
                  </View>
                  <Text style={styles.hazardLabel}>{hazardLabel(h.hazardType)}</Text>
                </View>
              ))}
            </Surface>
          </FadeSlideIn>
        )}

        {/* Top contributors — scope-aware header: when the ladder widened to
            community scope these can be riders 1,000+ km away, so a bare
            "TOP CONTRIBUTORS" under a city title misleads (review 2026-08-13
            G-22). */}
        {heartbeat.topContributors.length > 0 && (
          <FadeSlideIn delay={500}>
            <Surface style={{ gap: space[2] }}>
              <Text style={styles.sectionLabel}>
                {t(
                  scopeUsed === 'nearby'
                    ? 'cityHeartbeat.topContributors'
                    : 'cityHeartbeat.topContributorsCommunity',
                )}
              </Text>
              {heartbeat.topContributors.map((c, i) => (
                <View key={`contributor-${i}`} style={styles.contributorRow}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>{i + 1}</Text>
                  </View>
                  {c.avatarUrl ? (
                    <Image
                      source={{ uri: c.avatarUrl }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarInitial}>
                        {c.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.contributorInfo}>
                    <Text style={styles.contributorName} numberOfLines={1}>
                      {c.displayName}
                    </Text>
                    <Text style={styles.contributorStats}>
                      {c.rideCount} {t('cityHeartbeat.rides').toLowerCase()} · {c.distanceKm} km
                    </Text>
                  </View>
                </View>
              ))}
            </Surface>
          </FadeSlideIn>
        )}

        <FadeSlideIn delay={600}>
          <LeaderboardSection />
        </FadeSlideIn>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// StatCell (internal)
// ---------------------------------------------------------------------------

interface StatCellProps {
  readonly label: string;
  readonly value: number;
  readonly suffix: string;
  readonly decimals: number;
  readonly color: string;
  readonly styles: ReturnType<typeof createThemedStyles>;
}

const StatCell = ({ label, value, suffix, decimals, color, styles }: StatCellProps) => (
  <View style={styles.statCell}>
    <AnimatedCounter
      targetValue={value}
      suffix={suffix}
      decimals={decimals}
      duration={1200}
      style={{ ...textDataMd, fontFamily: fontFamily.mono.bold, color }}
    />
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// ---------------------------------------------------------------------------
// Themed styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scrollContent: {
      gap: space[3],
      paddingBottom: space[6],
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: space[16],
      gap: space[3],
    },
    loadingText: {
      ...textSm,
      color: colors.textSecondary,
    },
    errorText: {
      ...textSm,
      color: colors.danger,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: space[3],
      minHeight: 44,
      justifyContent: 'center',
      alignSelf: 'center',
      paddingHorizontal: space[6],
      paddingVertical: space[2],
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    retryButtonText: {
      ...textSm,
      color: colors.accent,
      fontFamily: fontFamily.body.semiBold,
      textAlign: 'center',
    },

    sectionLabel: {
      ...textXs,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      fontSize: 10,
    },
    // Small, but never hidden: this line carries the source and the word
    // "estimate", which is what separates the figure above it from a made-up
    // number.
    estimateCondition: {
      ...textSm,
      color: colors.textSecondary,
      marginTop: space[2],
    },
    estimateSource: {
      ...textXs,
      color: colors.textSecondary,
      marginTop: space[2],
      lineHeight: 16,
    },
    sectionSub: {
      ...textXs,
      color: colors.textSecondary,
      marginBottom: space[1],
    },

    // Stat grid (2x2)
    statGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[2],
    },
    statCell: {
      flex: 1,
      minWidth: '45%' as unknown as number,
      backgroundColor: colors.bgSecondary,
      borderRadius: radii.lg,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      gap: 2,
    },
    statLabel: {
      ...textXs,
      fontFamily: fontFamily.body.regular,
      color: colors.textSecondary,
    },

    // Hazards
    hazardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      paddingVertical: space[1],
    },
    hazardBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hazardBadgeText: {
      ...textXs,
      fontFamily: fontFamily.mono.bold,
      color: gray[50],
      fontSize: 11,
    },
    hazardLabel: {
      ...textBase,
      fontFamily: fontFamily.body.medium,
      color: colors.textPrimary,
    },

    // Contributors
    contributorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      paddingVertical: space[1],
    },
    rankBadge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankText: {
      ...textXs,
      fontFamily: fontFamily.mono.bold,
      color: colors.textInverse,
      fontSize: 11,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
    },
    avatarPlaceholder: {
      backgroundColor: colors.bgTertiary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      ...textSm,
      fontFamily: fontFamily.heading.bold,
      color: colors.textSecondary,
    },
    contributorInfo: {
      flex: 1,
      gap: 1,
    },
    contributorName: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    contributorStats: {
      ...textXs,
      fontFamily: fontFamily.mono.medium,
      color: colors.textMuted,
    },

    bottomSpacer: {
      height: space[4],
    },
  });
