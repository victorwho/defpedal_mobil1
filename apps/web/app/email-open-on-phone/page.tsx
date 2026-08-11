import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Open on your phone — Defensive Pedal',
  robots: { index: false, follow: false },
};

const COLORS = {
  bgDeep: '#111827',
  bgPrimary: '#1F2937',
  accent: '#FACC15',
  accentBg: 'rgba(250, 204, 21, 0.15)',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0B8C1',
  textMuted: '#71717A',
  borderSoft: 'rgba(255, 255, 255, 0.08)',
} as const;

const styles: Record<string, CSSProperties> = {
  main: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '24px',
    background: `radial-gradient(ellipse at top, ${COLORS.bgPrimary} 0%, ${COLORS.bgDeep} 70%)`,
  },
  card: {
    maxWidth: 440,
    width: '100%',
    textAlign: 'center',
    padding: '40px 32px',
    borderRadius: 20,
    background: COLORS.bgPrimary,
    border: `1px solid ${COLORS.borderSoft}`,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    background: COLORS.accentBg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 24px',
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    margin: '0 0 12px',
    color: COLORS.textPrimary,
  },
  body: {
    fontSize: 15,
    lineHeight: 1.5,
    color: COLORS.textSecondary,
    margin: '0 0 8px',
  },
  hint: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 28,
    paddingTop: 20,
    borderTop: `1px solid ${COLORS.borderSoft}`,
  },
  strong: {
    color: COLORS.textPrimary,
    fontWeight: 600,
  },
};

export default function EmailOpenOnPhonePage() {
  return (
    <main style={styles.main}>
      <div style={styles.card} role="main">
        <div style={styles.badge} aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="32"
            height="32"
            fill="none"
            stroke={COLORS.accent}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="7" y="2" width="10" height="20" rx="2" />
            <line x1="11" y1="18" x2="13" y2="18" />
          </svg>
        </div>
        <h1 style={styles.title}>Almost there — open this on your phone</h1>
        <p style={styles.body}>
          This confirmation link finishes inside the{' '}
          <span style={styles.strong}>Defensive Pedal</span> app on your phone.
        </p>
        <p style={styles.body}>
          Open the same email on your phone and tap the confirmation button there.
        </p>
        <p style={styles.hint}>
          Don&apos;t worry — your link is still valid. Nothing was used up by opening it here.
        </p>
      </div>
    </main>
  );
}
