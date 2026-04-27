import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Defensive Pedal',
  description: 'Privacy Policy for Defensive Pedal.',
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
  list: {
    margin: '0 0 16px',
    paddingLeft: 22,
    fontSize: 15,
    lineHeight: 1.65,
    color: COLORS.textSecondary,
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

export default function PrivacyPage() {
  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <p style={styles.brand}>Defensive Pedal</p>
        <h1 style={styles.h1}>Privacy Policy</h1>
        <p style={styles.meta}>Last updated: 27 April 2026</p>

        <div style={styles.notice} role="note">
          <span style={styles.noticeLabel}>Placeholder</span>
          A comprehensive GDPR-compliant Privacy Policy is being prepared with
          legal counsel. The summary below describes the data practices that
          apply today; the full document will replace this page before
          additional categories of data are collected.
        </div>

        <h2 style={styles.h2}>What we collect</h2>
        <ul style={styles.list}>
          <li>Account data: email address, display name, profile photo (optional).</li>
          <li>
            Ride data: planned routes, GPS breadcrumb trail, distance, duration,
            elevation gain, route mode, and derived metrics like CO₂ savings.
          </li>
          <li>
            Community content you create: hazard reports, ride shares,
            comments, reactions, and votes.
          </li>
          <li>
            Device and crash data (only if you opt in): app version, device
            model, OS version, anonymised stack traces.
          </li>
        </ul>

        <h2 style={styles.h2}>Why we collect it</h2>
        <p style={styles.body}>
          Routing, navigation, and safety guidance are the core service. Trip
          history, badges, and the leaderboard depend on stored ride data.
          Crash reports help us fix defects faster. We do not sell your data
          and we do not use it for advertising.
        </p>

        <h2 style={styles.h2}>How long we keep it</h2>
        <ul style={styles.list}>
          <li>Account and profile: while your account is active.</li>
          <li>
            Ride summaries (distance, duration, CO₂, route mode): while your
            account is active.
          </li>
          <li>
            Raw GPS breadcrumb trails: <strong>90 days</strong>, then
            automatically truncated. You can opt to keep them longer in
            Profile → Account.
          </li>
          <li>
            Hazard reports: 45 days past their expiry, then deleted.
          </li>
          <li>
            Inactive accounts: deleted after <strong>24 months</strong> without
            sign-in. We send a warning email at 23 months.
          </li>
        </ul>

        <h2 style={styles.h2}>Your rights under GDPR</h2>
        <p style={styles.body}>
          You have the right to access your data, correct it, request deletion,
          and object to specific processing. See{' '}
          <a href="/account-deletion" style={styles.link}>
            how to delete your account
          </a>{' '}
          for the in-app and email-based deletion paths and what gets removed.
          For other rights, contact{' '}
          <a href="mailto:privacy@defensivepedal.com" style={styles.link}>
            privacy@defensivepedal.com
          </a>
          .
        </p>

        <h2 style={styles.h2}>Sub-processors</h2>
        <p style={styles.body}>
          We use Supabase (database and authentication, currently US region),
          Google Cloud Run (API hosting, EU region), Mapbox (maps and
          terrain), and Sentry (crash reports, EU region, only if you opt in).
        </p>

        <h2 style={styles.h2}>Contact</h2>
        <p style={styles.body}>
          Privacy and data-subject requests:{' '}
          <a href="mailto:privacy@defensivepedal.com" style={styles.link}>
            privacy@defensivepedal.com
          </a>
        </p>

        <hr style={styles.hr} />

        <p style={styles.contact}>
          For Romanian users, ANSPDCP (the data protection authority) is the
          competent supervisory authority:{' '}
          <a href="https://www.dataprotection.ro/" style={styles.link} rel="noopener noreferrer" target="_blank">
            dataprotection.ro
          </a>
          .
        </p>
      </div>
    </main>
  );
}
