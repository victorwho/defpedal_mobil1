import type { CSSProperties } from 'react';

const COLORS = {
  bgDeep: '#111827',
  bgPrimary: '#1F2937',
  accent: '#FACC15',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0B8C1',
} as const;

const styles: Record<string, CSSProperties> = {
  main: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '24px',
    textAlign: 'center',
    background: `radial-gradient(ellipse at top, ${COLORS.bgPrimary} 0%, ${COLORS.bgDeep} 70%)`,
  },
  mark: {
    width: 72,
    height: 72,
    borderRadius: 20,
    background: COLORS.accent,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    boxShadow: '0 8px 32px rgba(250, 204, 21, 0.25)',
    fontSize: 28,
    fontWeight: 800,
    color: COLORS.bgDeep,
    lineHeight: 1,
    letterSpacing: '-0.02em',
  },
  title: {
    fontSize: 36,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    margin: 0,
    color: COLORS.textPrimary,
  },
  tagline: {
    fontSize: 18,
    marginTop: 12,
    marginBottom: 0,
    color: COLORS.textSecondary,
    maxWidth: 480,
    lineHeight: 1.5,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    fontSize: 13,
    color: COLORS.textSecondary,
    opacity: 0.6,
    letterSpacing: '0.04em',
  },
};

export default function HomePage() {
  return (
    <main style={styles.main}>
      <div style={styles.mark} aria-hidden="true">
        DP
      </div>
      <h1 style={styles.title}>Defensive Pedal</h1>
      <p style={styles.tagline}>Safer cycling routes, shared with the people who matter.</p>
      <p style={styles.footer}>routes.defensivepedal.com</p>
    </main>
  );
}
