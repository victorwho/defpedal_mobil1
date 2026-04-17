/**
 * RideShareCard — Offscreen-capturable 1080x1080 share card for a ride.
 *
 * Pure presentational. No fetches, no animations, no conditional hooks.
 * Outer View forwards its ref so capture hosts can `captureRef` it.
 *
 * Formatting rules:
 *   - Distance: 1 decimal, "5.37" -> "5.4 km".
 *   - Duration: "<60" shows "{m} min"; >=60 shows "{h}h {m}m" (75 -> "1h 15m").
 *   - CO2: 1 decimal, "2.37" -> "2.4 kg".
 * Optional tiles (safetyScore, microlivesGained) are hidden entirely when
 * their props are undefined; remaining tiles flex to redistribute space.
 */
import React, { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '../BrandLogo';
import { brandColors, darkTheme } from '../../design-system/tokens/colors';
import { space } from '../../design-system/tokens/spacing';
import { fontFamily } from '../../design-system/tokens/typography';

// Layout constants. Tiles region fills remainder (1080 - 96 - 560 - 56 - 80 = 288px).
const DEFAULT_SIZE = 1080;
const HEADER_HEIGHT = 96;
const MAP_HEIGHT = 560;
const LABEL_HEIGHT = 56;
const FOOTER_HEIGHT = 80;
const HEADER_BG = '#1A1A1A';
const TILE_LABEL = '#9E9E9E';
const TILE_VALUE = '#FFFFFF';
const TILE_DIVIDER = 'rgba(255, 255, 255, 0.08)';
const ACCENT = brandColors.accent; // #FACC15

// Formatting helpers (pure)
const formatDistanceKm = (km: number): string => `${(Math.round(km * 10) / 10).toFixed(1)} km`;
const formatCo2Kg = (kg: number): string => `${(Math.round(kg * 10) / 10).toFixed(1)} kg`;
const formatDuration = (minutes: number): string => {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  return `${h}h ${total - h * 60}m`;
};
const formatDateLabel = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RideShareCardProps {
  readonly mapImageUrl: string;
  readonly distanceKm: number;
  readonly durationMinutes: number;
  readonly co2SavedKg: number;
  readonly safetyScore?: number;
  readonly microlivesGained?: number;
  readonly originLabel?: string;
  readonly destinationLabel?: string;
  readonly dateIso?: string;
  readonly width?: number;
  readonly height?: number;
}

// ---------------------------------------------------------------------------
// Tile
// ---------------------------------------------------------------------------

type TileSpec = {
  readonly key: string;
  readonly value: string;
  readonly label: string;
  readonly accent?: boolean;
};

const Tile = ({ spec, isLast }: { spec: TileSpec; isLast: boolean }) => (
  <View style={[styles.tile, !isLast ? styles.tileWithDivider : null]}>
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      style={[styles.tileValue, spec.accent ? styles.tileValueAccent : null]}
    >
      {spec.value}
    </Text>
    <Text style={styles.tileLabel} numberOfLines={1}>
      {spec.label}
    </Text>
  </View>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const RideShareCard = forwardRef<View, RideShareCardProps>(
  function RideShareCard(props, ref) {
    const {
      mapImageUrl,
      distanceKm,
      durationMinutes,
      co2SavedKg,
      safetyScore,
      microlivesGained,
      originLabel,
      destinationLabel,
      dateIso,
      width = DEFAULT_SIZE,
      height = DEFAULT_SIZE,
    } = props;

    const dateLabel = formatDateLabel(dateIso);

    const tiles: TileSpec[] = [
      { key: 'distance', value: formatDistanceKm(distanceKm), label: 'Distance' },
      { key: 'duration', value: formatDuration(durationMinutes), label: 'Duration' },
      { key: 'co2', value: formatCo2Kg(co2SavedKg), label: 'CO2 saved', accent: true },
    ];
    if (typeof safetyScore === 'number') {
      tiles.push({ key: 'safety', value: `${Math.round(safetyScore)}/100`, label: 'Safety' });
    }
    if (typeof microlivesGained === 'number') {
      tiles.push({
        key: 'microlives',
        value: `${Math.round(microlivesGained)} min`,
        label: 'Life earned',
      });
    }

    const hasRouteLabel =
      typeof originLabel === 'string' && originLabel.length > 0 &&
      typeof destinationLabel === 'string' && destinationLabel.length > 0;

    return (
      <View
        ref={ref}
        collapsable={false}
        style={[styles.root, { width, height }]}
        accessible={false}
      >
        <View style={[styles.header, { height: HEADER_HEIGHT }]}>
          <View style={styles.headerLeft}>
            <BrandLogo size={56} />
            <Text style={styles.brandText}>DEFENSIVE PEDAL</Text>
          </View>
          {dateLabel ? (
            <View style={styles.datePill}>
              <Text style={styles.datePillText}>{dateLabel}</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.mapRegion, { height: MAP_HEIGHT }]}>
          <Image
            source={{ uri: mapImageUrl }}
            style={[styles.mapImage, { width, height: MAP_HEIGHT }]}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
          <View pointerEvents="none" style={styles.mapFadeOverlay} />
        </View>

        <View style={[styles.routeLabelRow, { height: LABEL_HEIGHT }]}>
          {hasRouteLabel ? (
            <Text style={styles.routeLabelText} numberOfLines={1}>
              <Text style={styles.routeLabelPlace}>{originLabel}</Text>
              <Text style={styles.routeLabelArrow}>{'  ->  '}</Text>
              <Text style={styles.routeLabelPlace}>{destinationLabel}</Text>
            </Text>
          ) : (
            <Text style={styles.routeLabelTextMuted}>A ride on Defensive Pedal</Text>
          )}
        </View>

        <View style={styles.tilesRow}>
          {tiles.map((spec, index) => (
            <Tile key={spec.key} spec={spec} isLast={index === tiles.length - 1} />
          ))}
        </View>

        <View style={[styles.footer, { height: FOOTER_HEIGHT }]}>
          <BrandLogo size={44} />
          <Text style={styles.footerUrl}>defensivepedal.com</Text>
        </View>
      </View>
    );
  },
);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { backgroundColor: darkTheme.bgDeep, overflow: 'hidden' },
  header: {
    backgroundColor: HEADER_BG,
    paddingHorizontal: space[6],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  brandText: {
    fontFamily: fontFamily.heading.extraBold,
    color: ACCENT,
    fontSize: 22,
    letterSpacing: 2,
  },
  datePill: {
    backgroundColor: 'rgba(250, 204, 21, 0.14)',
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(250, 204, 21, 0.28)',
  },
  datePillText: {
    fontFamily: fontFamily.body.semiBold,
    color: ACCENT,
    fontSize: 16,
    letterSpacing: 0.5,
  },
  mapRegion: { position: 'relative', backgroundColor: '#0B0F17' },
  mapImage: { position: 'absolute', top: 0, left: 0 },
  mapFadeOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
  },
  routeLabelRow: {
    backgroundColor: darkTheme.bgDeep,
    paddingHorizontal: space[6],
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeLabelText: {
    fontFamily: fontFamily.body.semiBold,
    color: '#FFFFFF',
    fontSize: 20,
    textAlign: 'center',
  },
  routeLabelPlace: { color: '#FFFFFF' },
  routeLabelArrow: { color: ACCENT, fontFamily: fontFamily.heading.bold },
  routeLabelTextMuted: { fontFamily: fontFamily.body.regular, color: TILE_LABEL, fontSize: 18 },
  tilesRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: darkTheme.bgDeep,
    paddingHorizontal: space[4],
    paddingVertical: space[5],
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[2],
    gap: space[2],
  },
  tileWithDivider: { borderRightWidth: 1, borderRightColor: TILE_DIVIDER },
  tileValue: {
    fontFamily: fontFamily.heading.extraBold,
    color: TILE_VALUE,
    fontSize: 56,
    lineHeight: 60,
    textAlign: 'center',
  },
  tileValueAccent: { color: ACCENT },
  tileLabel: {
    fontFamily: fontFamily.body.medium,
    color: TILE_LABEL,
    fontSize: 18,
    letterSpacing: 0.5,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  footer: {
    backgroundColor: HEADER_BG,
    paddingHorizontal: space[6],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
  },
  footerUrl: {
    fontFamily: fontFamily.body.semiBold,
    color: ACCENT,
    fontSize: 20,
    letterSpacing: 1,
  },
});
