import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Email confirmed — Defensive Pedal',
  robots: { index: false, follow: false },
};

const COLORS = {
  bgDeep: '#111827',
  bgPrimary: '#1F2937',
  accent: '#FACC15',
  success: '#4ADE80',
  successBg: 'rgba(74, 222, 128, 0.15)',
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
    background: COLORS.successBg,
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

export default function EmailConfirmedPage() {
  return (
    <main style={styles.main}>
      <div style={styles.card} role="main">
        <div style={styles.badge} aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="32"
            height="32"
            fill="none"
            stroke={COLORS.success}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 style={styles.title}>Email confirmed</h1>
        <p style={styles.body}>
          Your <span style={styles.strong}>Defensive Pedal</span> account is ready.
        </p>
        <p style={styles.body}>Open the app on your phone to start riding safer.</p>
        <p style={styles.hint}>
          Looks like you opened this link on a desktop browser. The app lives on your phone — tap
          the Defensive Pedal icon there to sign in.
        </p>
      </div>
    </main>
  );
}
