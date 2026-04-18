'use client';

import type { CSSProperties } from 'react';
import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

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
  eyebrow: {
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.08em',
    color: '#EF4444',
    margin: 0,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    margin: 0,
    color: COLORS.textPrimary,
    maxWidth: 480,
  },
  body: {
    fontSize: 16,
    marginTop: 12,
    marginBottom: 24,
    color: COLORS.textSecondary,
    maxWidth: 480,
    lineHeight: 1.5,
  },
  actions: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  primary: {
    background: COLORS.accent,
    color: COLORS.bgDeep,
    border: 'none',
    padding: '12px 24px',
    borderRadius: 12,
    fontWeight: 600,
    fontSize: 15,
    cursor: 'pointer',
  },
  link: {
    fontSize: 15,
    color: COLORS.accent,
    textDecoration: 'none',
    fontWeight: 600,
    padding: '12px 16px',
  },
};

export default function ShareErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    // TODO(slice-7): send to Sentry once NEXT_PUBLIC_SENTRY_DSN is wired.
  }, [error]);

  return (
    <main style={styles.main}>
      <p style={styles.eyebrow}>Something went wrong</p>
      <h1 style={styles.title}>We couldn&apos;t load this shared route</h1>
      <p style={styles.body}>
        The connection to our servers failed. Check your internet and try again, or open the app to
        plan your own route.
      </p>
      <div style={styles.actions}>
        <button type="button" onClick={reset} style={styles.primary}>
          Try again
        </button>
        <a href="/" style={styles.link}>
          Go to Defensive Pedal
        </a>
      </div>
    </main>
  );
}
