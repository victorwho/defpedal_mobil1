import type { CSSProperties } from 'react';

// Global 404 fallback. Next.js prerenders this at build time. Without an
// explicit one, Next.js 15 falls back to its internal default page, which
// ships a React element shape that collides with the locally-resolved
// React 18.3.1 (monorepo root has React 19.2.1 hoisted from apps/mobile)
// and fails the `/404` prerender with "Objects are not valid as a React
// child (found: object with keys {$$typeof, ...})". Providing our own
// not-found.tsx bypasses the internal default.
//
// Scoped not-found UI for `/r/[code]` lives at `app/r/[code]/not-found.tsx`.

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

export default function NotFound() {
  return (
    <main style={styles.main}>
      <p style={styles.code}>404</p>
      <h1 style={styles.title}>Page not found</h1>
      <p style={styles.body}>The page you&apos;re looking for doesn&apos;t exist.</p>
      <a href="/" style={styles.link}>
        Go to Defensive Pedal
      </a>
    </main>
  );
}
