import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Line, Text as SvgText } from 'react-native-svg';

import { darkTheme } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily, textXs } from '../tokens/typography';

type ElevationChartProps = {
  readonly elevationProfile: readonly number[];
  readonly distanceMeters: number;
};

const CHART_HEIGHT = 120;
const CHART_PADDING_LEFT = 44;
const CHART_PADDING_RIGHT = 12;
const CHART_PADDING_TOP = 12;
const CHART_PADDING_BOTTOM = 24;
const ACCENT_COLOR = '#3B82F6';
const GRID_COLOR = 'rgba(148, 163, 184, 0.2)';
const LABEL_COLOR = 'rgba(148, 163, 184, 0.7)';

const buildPath = (
  points: readonly number[],
  width: number,
  minElev: number,
  elevRange: number,
): { linePath: string; areaPath: string } => {
  const plotW = width - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
  const plotH = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;

  const coords = points.map((elev, i) => {
    const x = CHART_PADDING_LEFT + (i / (points.length - 1)) * plotW;
    const y =
      CHART_PADDING_TOP +
      plotH -
      ((elev - minElev) / (elevRange || 1)) * plotH;
    return { x, y };
  });

  const linePath = coords
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  const bottomY = CHART_PADDING_TOP + plotH;
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${bottomY} L${coords[0].x.toFixed(1)},${bottomY} Z`;

  return { linePath, areaPath };
};

const formatElevLabel = (meters: number): string => {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}k`;
  return `${Math.round(meters)}`;
};

export const ElevationChart = ({
  elevationProfile,
  distanceMeters,
}: ElevationChartProps) => {
  const chartData = useMemo(() => {
    if (elevationProfile.length < 2) return null;

    // Downsample to max 200 points for rendering performance
    const maxPoints = 200;
    let points: number[];
    if (elevationProfile.length > maxPoints) {
      const step = (elevationProfile.length - 1) / (maxPoints - 1);
      points = Array.from({ length: maxPoints }, (_, i) =>
        elevationProfile[Math.round(i * step)],
      );
    } else {
      points = [...elevationProfile];
    }

    const minElev = Math.min(...points);
    const maxElev = Math.max(...points);
    const padding = Math.max((maxElev - minElev) * 0.1, 2);
    const displayMin = Math.floor(minElev - padding);
    const displayMax = Math.ceil(maxElev + padding);
    const elevRange = displayMax - displayMin;

    // Distance labels
    const distKm = distanceMeters / 1000;
    const distLabels: { km: number; fraction: number }[] = [];
    const stepKm = distKm <= 2 ? 0.5 : distKm <= 5 ? 1 : distKm <= 20 ? 2 : 5;
    for (let km = stepKm; km < distKm; km += stepKm) {
      distLabels.push({ km, fraction: km / distKm });
    }

    // Elevation grid lines (3 lines: bottom, mid, top)
    const midElev = Math.round((displayMin + displayMax) / 2);

    return {
      points,
      displayMin,
      displayMax,
      midElev,
      elevRange,
      distLabels,
      distKm,
    };
  }, [elevationProfile, distanceMeters]);

  if (!chartData) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.header}>Elevation</Text>
      <View style={styles.chartContainer}>
        <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 360 ${CHART_HEIGHT}`}>
          <Defs>
            <LinearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={ACCENT_COLOR} stopOpacity="0.35" />
              <Stop offset="1" stopColor={ACCENT_COLOR} stopOpacity="0.05" />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
          {[chartData.displayMin, chartData.midElev, chartData.displayMax].map(
            (elev, i) => {
              const plotH = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
              const y =
                CHART_PADDING_TOP +
                plotH -
                ((elev - chartData.displayMin) / (chartData.elevRange || 1)) * plotH;
              return (
                <Line
                  key={`grid-${i}`}
                  x1={CHART_PADDING_LEFT}
                  y1={y}
                  x2={360 - CHART_PADDING_RIGHT}
                  y2={y}
                  stroke={GRID_COLOR}
                  strokeWidth={0.5}
                />
              );
            },
          )}

          {/* Y-axis labels */}
          {[chartData.displayMin, chartData.midElev, chartData.displayMax].map(
            (elev, i) => {
              const plotH = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
              const y =
                CHART_PADDING_TOP +
                plotH -
                ((elev - chartData.displayMin) / (chartData.elevRange || 1)) * plotH;
              return (
                <SvgText
                  key={`ylabel-${i}`}
                  x={CHART_PADDING_LEFT - 6}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize={9}
                  fill={LABEL_COLOR}
                  fontFamily="monospace"
                >
                  {formatElevLabel(elev)} m
                </SvgText>
              );
            },
          )}

          {/* X-axis distance labels */}
          {chartData.distLabels.map((label) => {
            const plotW = 360 - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
            const x = CHART_PADDING_LEFT + label.fraction * plotW;
            return (
              <SvgText
                key={`xlabel-${label.km}`}
                x={x}
                y={CHART_HEIGHT - 4}
                textAnchor="middle"
                fontSize={8}
                fill={LABEL_COLOR}
                letterSpacing={0.5}
              >
                {label.km % 1 === 0 ? `${label.km} km` : `${label.km.toFixed(1)} km`}
              </SvgText>
            );
          })}

          {/* Area fill */}
          <Path
            d={buildPath(chartData.points, 360, chartData.displayMin, chartData.elevRange).areaPath}
            fill="url(#elevFill)"
          />

          {/* Line stroke */}
          <Path
            d={buildPath(chartData.points, 360, chartData.displayMin, chartData.elevRange).linePath}
            stroke={ACCENT_COLOR}
            strokeWidth={1.5}
            fill="none"
          />
        </Svg>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: darkTheme.bgPrimary,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    gap: space[2],
    ...shadows.md,
  },
  header: {
    ...textXs,
    fontFamily: fontFamily.body.semiBold,
    color: darkTheme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 11,
  },
  chartContainer: {
    overflow: 'hidden',
    borderRadius: radii.md,
  },
});
