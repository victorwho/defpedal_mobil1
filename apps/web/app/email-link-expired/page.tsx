import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Link expired — Defensive Pedal',
  robots: { index: false, follow: false },
};

const COLORS = {
  bgDeep: '#111827',
  bgPrimary: '#1F2937',
  caution: '#FBBF24',
  cautionBg: 'rgba(251, 191, 36, 0.15)',
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
    background: COLORS.cautionBg,
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

export default function EmailLinkExpiredPage() {
  return (
    <main style={styles.main}>
      <div style={styles.card} role="main">
        <div style={styles.badge} aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="32"
            height="32"
            fill="none"
            stroke={COLORS.caution}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <h1 style={styles.title}>This link has expired or was already used</h1>
        <p style={styles.body}>
          Confirmation links are single-use and expire after 24 hours.
        </p>
        <p style={styles.body}>
          Good news: if it was already used, your email may be confirmed — open{' '}
          <span style={styles.strong}>Defensive Pedal</span> on your phone and just sign in.
        </p>
        <p style={styles.hint}>
          If sign-in says your email isn&apos;t confirmed yet, tap{' '}
          <span style={styles.strong}>Resend confirmation email</span> on the sign-in screen to get
          a fresh link.
        </p>
      </div>
    </main>
  );
}
