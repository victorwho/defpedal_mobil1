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
  code: {
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: '0.08em',
    color: COLORS.accent,
    margin: 0,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    margin: 0,
    color: COLORS.textPrimary,
    maxWidth: 420,
  },
  body: {
    fontSize: 16,
    marginTop: 12,
    marginBottom: 0,
    color: COLORS.textSecondary,
    maxWidth: 420,
    lineHeight: 1.5,
  },
  link: {
    marginTop: 28,
    fontSize: 15,
    color: COLORS.accent,
    textDecoration: 'none',
    fontWeight: 600,
  },
};

export default function RouteShareNotFound() {
  return (
    <main style={styles.main}>
      <p style={styles.code}>404</p>
      <h1 style={styles.title}>This shared route isn&apos;t available</h1>
      <p style={styles.body}>The link may have expired, been revoked, or never existed.</p>
      <a href="/" style={styles.link}>
        Go to Defensive Pedal
      </a>
    </main>
  );
}
