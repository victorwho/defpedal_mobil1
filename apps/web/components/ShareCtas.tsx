import type { CSSProperties } from 'react';

interface ShareCtasProps {
  code: string;
}

const COLORS = {
  bgSurface: 'rgba(31, 41, 55, 0.92)',
  border: '#374151',
  accent: '#FACC15',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0B8C1',
  bgDeep: '#111827',
} as const;

// TODO(slice-1): replace with real Play Store listing once the app ships to production.
// Canonical production package ID used as placeholder — if tapped before launch, Play Store shows
// an "unavailable in your region" screen rather than a broken link.
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.defensivepedal.mobile';

const styles: Record<string, CSSProperties> = {
  nav: {
    background: COLORS.bgSurface,
    borderTop: `1px solid ${COLORS.border}`,
    padding: '16px 24px 24px',
  },
  primary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 48,
    background: COLORS.accent,
    color: COLORS.bgDeep,
    border: 'none',
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 16,
    textDecoration: 'none',
    marginBottom: 12,
    letterSpacing: '-0.01em',
  },
  downloadRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  downloadBtn: {
    flex: '1 1 160px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    padding: '10px 14px',
    background: 'transparent',
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 14,
    textDecoration: 'none',
  },
  downloadBtnDisabled: {
    flex: '1 1 160px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    padding: '10px 14px',
    background: 'transparent',
    color: COLORS.textSecondary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 14,
    textDecoration: 'none',
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  helpText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 12,
    marginBottom: 0,
    textAlign: 'center',
    lineHeight: 1.4,
  },
};

export function ShareCtas({ code }: ShareCtasProps) {
  // Self-referencing universal-link href — the OS intercepts and opens the app if installed.
  // When the app is NOT installed, this href just reloads the same page (harmless).
  const appUrl = `https://routes.defensivepedal.com/r/${encodeURIComponent(code)}`;
  const utm = `utm_source=share&utm_medium=web&utm_campaign=r_${encodeURIComponent(code)}`;
  const playUrl = `${PLAY_STORE_URL}&referrer=${encodeURIComponent(utm)}`;

  return (
    <nav style={styles.nav} aria-label="Route sharing actions">
      <a href={appUrl} style={styles.primary}>
        Open in Defensive Pedal
      </a>
      <div style={styles.downloadRow}>
        <a
          href={playUrl}
          style={styles.downloadBtn}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Download Defensive Pedal on Google Play"
        >
          Get it on Google Play
        </a>
        <a
          href="#"
          style={styles.downloadBtnDisabled}
          aria-disabled="true"
          aria-label="Defensive Pedal is not yet available on the App Store"
          onClick={(e) => e.preventDefault()}
        >
          Coming to iOS
        </a>
      </div>
      <p style={styles.helpText}>
        Already have the app? The button above opens the route directly. No app yet? Install from
        Google Play and the route loads on first launch.
      </p>
    </nav>
  );
}
