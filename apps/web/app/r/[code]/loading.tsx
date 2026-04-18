import type { CSSProperties } from 'react';

const styles: Record<string, CSSProperties> = {
  main: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '24px',
    textAlign: 'center',
    background: 'radial-gradient(ellipse at top, #1F2937 0%, #111827 70%)',
  },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 18,
    background: '#FACC15',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    fontSize: 24,
    fontWeight: 800,
    color: '#111827',
    animation: 'defpedal-pulse 1.2s ease-in-out infinite',
  },
  text: {
    color: '#B0B8C1',
    fontSize: 14,
    letterSpacing: '0.04em',
    margin: 0,
  },
};

// Inline keyframes — no global CSS file in slice 0.
const KEYFRAMES = `@keyframes defpedal-pulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}`;

export default function Loading() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <main style={styles.main} aria-busy="true" aria-live="polite">
        <div style={styles.mark} aria-hidden="true">
          DP
        </div>
        <p style={styles.text}>Loading shared route…</p>
      </main>
    </>
  );
}
