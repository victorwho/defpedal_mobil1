import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Defensive Pedal',
  description: 'Terms of Service for Defensive Pedal.',
  // Allow indexing — legal pages need to be reachable by Play / regulators.
  robots: { index: true, follow: true },
};

const COLORS = {
  bgDeep: '#111827',
  bgPrimary: '#1F2937',
  accent: '#FACC15',
  warning: '#F59E0B',
  warningBg: 'rgba(245, 158, 11, 0.12)',
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
  container: {
    maxWidth: 720,
    margin: '0 auto',
  },
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
  meta: {
    fontSize: 14,
    color: COLORS.textMuted,
    margin: '0 0 32px',
  },
  notice: {
    padding: '16px 20px',
    borderRadius: 12,
    background: COLORS.warningBg,
    border: `1px solid ${COLORS.warning}`,
    color: COLORS.textPrimary,
    fontSize: 14,
    lineHeight: 1.55,
    marginBottom: 32,
  },
  noticeLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: COLORS.warning,
    marginBottom: 6,
  },
  h2: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '-0.01em',
    margin: '32px 0 12px',
    color: COLORS.textPrimary,
  },
  body: {
    fontSize: 15,
    lineHeight: 1.65,
    color: COLORS.textSecondary,
    margin: '0 0 16px',
  },
  bodyStrong: {
    color: COLORS.textPrimary,
    fontWeight: 600,
  },
  hr: {
    height: 1,
    border: 0,
    background: COLORS.borderSoft,
    margin: '40px 0',
  },
  contact: {
    fontSize: 14,
    color: COLORS.textMuted,
    margin: 0,
  },
  link: {
    color: COLORS.accent,
    textDecoration: 'underline',
  },
};

export default function TermsPage() {
  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <p style={styles.brand}>Defensive Pedal</p>
        <h1 style={styles.h1}>Terms of Service</h1>
        <p style={styles.meta}>Last updated: 27 April 2026</p>

        <div style={styles.notice} role="note">
          <span style={styles.noticeLabel}>Placeholder</span>
          A comprehensive Terms of Service is being prepared with legal counsel.
          The clauses below are the minimum binding terms that apply when you
          create an account today. The full document will replace this page
          before paid features are introduced.
        </div>

        <h2 style={styles.h2}>1. Service description</h2>
        <p style={styles.body}>
          Defensive Pedal is a cycling navigation application that calculates
          safety-scored routes, surfaces community-reported hazards, and
          displays weather and air-quality information. The app is currently
          offered free of charge.
        </p>

        <h2 style={styles.h2}>2. Account and eligibility</h2>
        <p style={styles.body}>
          You may use the app anonymously or create an account using Google
          sign-in or email and password. You are responsible for maintaining
          the security of your sign-in credentials. You must be at least 16
          years old to create an account.
        </p>

        <h2 style={styles.h2}>3. Immediate performance and waiver of withdrawal</h2>
        <p style={styles.body}>
          By creating an account or otherwise using the service, you give your{' '}
          <span style={styles.bodyStrong}>express prior consent</span> that we
          begin providing the service immediately upon account creation, and
          you{' '}
          <span style={styles.bodyStrong}>
            acknowledge that you lose your right of withdrawal
          </span>{' '}
          under Articles 9 and 16(m) of EU Directive 2011/83/EU on consumer
          rights and under Romanian Government Emergency Ordinance 34/2014
          (OUG 34/2014).
        </p>
        <p style={styles.body}>
          Defensive Pedal is offered free of charge today; this clause applies
          in advance to any future paid features so the immediate-performance
          consent persists if and when premium functionality is introduced.
          You can stop using the service or delete your account at any time
          from Profile → Account → Delete account in the app.
        </p>

        <h2 style={styles.h2}>4. Acceptable use</h2>
        <p style={styles.body}>
          You agree not to submit false hazard reports, harass other users
          through comments, attempt to reverse-engineer the routing engine, or
          interfere with the safety guidance provided to other riders. We
          remove user-generated content that violates these rules and may
          terminate accounts engaged in repeated violations. See our{' '}
          <a href="/privacy" style={styles.link}>
            Privacy Policy
          </a>{' '}
          for how reports are handled.
        </p>

        <h2 style={styles.h2}>5. Safety disclaimer</h2>
        <p style={styles.body}>
          Defensive Pedal provides routing and hazard information based on
          publicly available road data and community reports. Conditions on
          the road may differ from what the app shows. You are solely
          responsible for your own safety, for following traffic laws, and
          for evaluating whether a recommended route is appropriate for the
          current conditions. The app is not a substitute for attentive
          riding.
        </p>

        <h2 style={styles.h2}>6. Changes to these terms</h2>
        <p style={styles.body}>
          When the full Terms of Service is published it will supersede this
          placeholder. We will notify you in-app before any change that
          materially reduces your rights.
        </p>

        <hr style={styles.hr} />

        <p style={styles.contact}>
          Questions:{' '}
          <a href="mailto:legal@defensivepedal.com" style={styles.link}>
            legal@defensivepedal.com
          </a>
        </p>
      </div>
    </main>
  );
}
