import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Support — Defensive Pedal',
  description:
    'Get help with Defensive Pedal: contact support, report a problem, and find answers about safe cycling routes, navigation, and your account.',
  // Indexable so App Store / Play reviewers and users can reach it.
  robots: { index: true, follow: true },
};

const COLORS = {
  bgDeep: '#111827',
  bgPrimary: '#1F2937',
  accent: '#FACC15',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0B8C1',
  textMuted: '#71717A',
  borderSoft: 'rgba(255, 255, 255, 0.08)',
} as const;

const styles: Record<string, CSSProperties> = {
  main: {
    minHeight: '100vh',
    padding: '48px 24px',
    background: `radial-gradient(ellipse at top, ${COLORS.bgPrimary} 0%, ${COLORS.bgDeep} 70%)`,
  },
  container: { maxWidth: 720, margin: '0 auto' },
  brand: {
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: COLORS.accent,
    marginBottom: 8,
  },
  h1: {
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    margin: '0 0 8px',
    color: COLORS.textPrimary,
  },
  meta: { fontSize: 14, color: COLORS.textMuted, margin: '0 0 32px' },
  intro: {
    fontSize: 16,
    lineHeight: 1.6,
    color: COLORS.textSecondary,
    margin: '0 0 32px',
  },
  card: {
    padding: '24px 28px',
    borderRadius: 14,
    background: COLORS.bgPrimary,
    border: `1px solid ${COLORS.borderSoft}`,
    marginBottom: 24,
  },
  cardLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: COLORS.accent,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '-0.01em',
    margin: '0 0 12px',
    color: COLORS.textPrimary,
  },
  body: {
    fontSize: 15,
    lineHeight: 1.65,
    color: COLORS.textSecondary,
    margin: '0 0 12px',
  },
  bodyStrong: { color: COLORS.textPrimary, fontWeight: 600 },
  h2: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '-0.01em',
    margin: '32px 0 12px',
    color: COLORS.textPrimary,
  },
  list: {
    margin: '0 0 16px',
    paddingLeft: 22,
    fontSize: 15,
    lineHeight: 1.7,
    color: COLORS.textSecondary,
  },
  hr: { height: 1, border: 0, background: COLORS.borderSoft, margin: '40px 0' },
  contact: { fontSize: 14, color: COLORS.textMuted, margin: '0 0 8px' },
  link: { color: COLORS.accent, textDecoration: 'underline' },
};

export default function SupportPage() {
  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <p style={styles.brand}>Defensive Pedal</p>
        <h1 style={styles.h1}>Support</h1>
        <p style={styles.meta}>We&rsquo;re here to help you ride safer.</p>

        <p style={styles.intro}>
          Defensive Pedal is a safety-first cycling navigation app — it routes
          you along lower-risk roads, shows community-reported hazards, and keeps
          an eye on weather and air quality. If something isn&rsquo;t working or
          you have a question, the fastest way to reach us is by email.
        </p>

        <div style={styles.card}>
          <span style={styles.cardLabel}>Contact us</span>
          <h2 style={styles.cardTitle}>Email support</h2>
          <p style={styles.body}>
            Email{' '}
            <a href="mailto:contact@defensivepedal.com" style={styles.link}>
              contact@defensivepedal.com
            </a>{' '}
            and we&rsquo;ll get back to you within{' '}
            <span style={styles.bodyStrong}>2 business days</span>.
          </p>
          <p style={styles.body}>
            To help us resolve things quickly, please include:
          </p>
          <ul style={styles.list}>
            <li>Your phone model and OS version (e.g. iPhone 14, iOS 18).</li>
            <li>The app version (Profile &rsaquo; About, or the store listing).</li>
            <li>
              A short description of what happened and what you expected, plus a
              screenshot if you have one.
            </li>
          </ul>
        </div>

        <h2 style={styles.h2}>Common topics</h2>
        <ul style={styles.list}>
          <li>
            <span style={styles.bodyStrong}>Routing &amp; navigation</span> —
            safe vs. fast vs. flat routes, turn-by-turn guidance, and rerouting.
          </li>
          <li>
            <span style={styles.bodyStrong}>Hazards</span> — reporting a hazard,
            voting on reports, and how reports expire over time.
          </li>
          <li>
            <span style={styles.bodyStrong}>Account &amp; sign-in</span> —
            anonymous use, email, Google, and Apple sign-in, and syncing your
            data across devices.
          </li>
          <li>
            <span style={styles.bodyStrong}>Privacy &amp; data</span> — what we
            collect, location permissions, and analytics choices.
          </li>
        </ul>
        <p style={styles.body}>
          Many of these are answered in the in-app{' '}
          <span style={styles.bodyStrong}>Help &amp; FAQ</span> (Settings &rsaquo;
          Help &amp; FAQ, or the History tab).
        </p>

        <h2 style={styles.h2}>Account &amp; privacy requests</h2>
        <p style={styles.body}>
          To delete your account, see{' '}
          <a href="/account-deletion" style={styles.link}>
            Delete your account
          </a>
          . For data-access, correction, or export requests, email{' '}
          <a href="mailto:privacy@defensivepedal.com" style={styles.link}>
            privacy@defensivepedal.com
          </a>
          .
        </p>

        <hr style={styles.hr} />

        <p style={styles.contact}>
          See also our{' '}
          <a href="/privacy" style={styles.link}>
            Privacy Policy
          </a>{' '}
          and{' '}
          <a href="/terms" style={styles.link}>
            Terms of Service
          </a>
          .
        </p>
      </div>
    </main>
  );
}
