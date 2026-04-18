import type { CSSProperties } from 'react';
import type { RouteSharePublicView } from '../lib/routeShareTypes';
import {
  formatDistanceKm,
  formatDurationMin,
  formatDurationUnit,
  initials,
} from '../lib/format';

interface ShareStatsBarProps {
  share: RouteSharePublicView;
}

const COLORS = {
  bgSurface: 'rgba(31, 41, 55, 0.92)',
  border: '#374151',
  accent: '#FACC15',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0B8C1',
  textMuted: '#A0A8B0',
} as const;

const ROUTING_MODE_LABEL: Record<string, string> = {
  safe: 'Safe route',
  fast: 'Fast route',
  flat: 'Flat route',
};

function formatSafetyScore(score: number | null): { value: string; label: string } | null {
  if (score === null) return null;
  const rounded = Math.round(score);
  let label = 'Moderate';
  if (rounded >= 80) label = 'Very safe';
  else if (rounded >= 65) label = 'Safe';
  else if (rounded >= 40) label = 'Moderate';
  else if (rounded >= 20) label = 'Risky';
  else label = 'High risk';
  return { value: String(rounded), label };
}

const styles: Record<string, CSSProperties> = {
  section: {
    background: COLORS.bgSurface,
    borderTop: `1px solid ${COLORS.border}`,
    padding: '20px 24px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
    marginBottom: 16,
    maxWidth: 560,
  },
  stat: { minWidth: 0 },
  statValue: {
    fontSize: 24,
    fontWeight: 700,
    color: COLORS.textPrimary,
    lineHeight: 1.1,
    letterSpacing: '-0.01em',
    fontVariantNumeric: 'tabular-nums',
  },
  statValueMode: {
    fontSize: 18,
    fontWeight: 700,
    color: COLORS.textPrimary,
    lineHeight: 1.2,
  },
  statUnit: { fontSize: 14, fontWeight: 500, color: COLORS.textSecondary, marginLeft: 4 },
  statLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: COLORS.textMuted,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  sharer: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTop: `1px solid ${COLORS.border}`,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    background: COLORS.accent,
    color: '#111827',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 14,
    flexShrink: 0,
  },
  sharerText: { fontSize: 14, lineHeight: 1.3 },
  sharerLabel: { color: COLORS.textMuted, fontSize: 12 },
  sharerName: { color: COLORS.textPrimary, fontWeight: 600 },
  endpointsHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
};

export function ShareStatsBar({ share }: ShareStatsBarProps) {
  const { route, sharerDisplayName, endpointsHidden } = share;
  const distance = formatDistanceKm(route.distanceMeters);
  const duration = formatDurationMin(route.durationSeconds);
  const durationUnit = formatDurationUnit(route.durationSeconds);
  const modeLabel = ROUTING_MODE_LABEL[route.routingMode] ?? route.routingMode;
  const safety = formatSafetyScore(route.safetyScore);

  const name = sharerDisplayName ?? 'A Defensive Pedal rider';
  const gridColumns = safety ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)';

  return (
    <section style={styles.section} aria-label="Route details">
      <dl style={{ ...styles.grid, gridTemplateColumns: gridColumns }}>
        <div style={styles.stat}>
          <dd style={styles.statValue}>
            {distance}
            <span style={styles.statUnit}>km</span>
          </dd>
          <dt style={styles.statLabel}>Distance</dt>
        </div>
        <div style={styles.stat}>
          <dd style={styles.statValue}>
            {duration}
            {durationUnit && <span style={styles.statUnit}>{durationUnit}</span>}
          </dd>
          <dt style={styles.statLabel}>Duration</dt>
        </div>
        <div style={styles.stat}>
          <dd style={styles.statValueMode}>{modeLabel}</dd>
          <dt style={styles.statLabel}>Mode</dt>
        </div>
        {safety && (
          <div style={styles.stat}>
            <dd style={styles.statValue}>
              {safety.value}
              <span style={styles.statUnit}>/100</span>
            </dd>
            <dt style={styles.statLabel}>{safety.label}</dt>
          </div>
        )}
      </dl>

      <div style={styles.sharer}>
        <div style={styles.avatar} aria-hidden="true">
          <span>{initials(sharerDisplayName)}</span>
        </div>
        <div style={styles.sharerText}>
          <div style={styles.sharerLabel}>Shared by</div>
          <div style={styles.sharerName}>{name}</div>
          {endpointsHidden && (
            <div style={styles.endpointsHint}>Start/end points trimmed for privacy</div>
          )}
        </div>
      </div>
    </section>
  );
}
