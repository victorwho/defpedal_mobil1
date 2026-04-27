import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Delete your account — Defensive Pedal',
  description: 'How to delete your Defensive Pedal account and what data is removed.',
  // Indexable so Play reviewers and users can find this page.
  robots: { index: true, follow: true },
};

const COLORS = {
  bgDeep: '#111827',
  bgPrimary: '#1F2937',
  accent: '#FACC15',
  danger: '#F87171',
  dangerBg: 'rgba(248, 113, 113, 0.10)',
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
  steps: {
    margin: '0 0 12px',
    paddingLeft: 22,
    fontSize: 15,
    lineHeight: 1.7,
    color: COLORS.textSecondary,
  },
  body: {
    fontSize: 15,
    lineHeight: 1.65,
    color: COLORS.textSecondary,
    margin: '0 0 12px',
  },
  bodyStrong: {
    color: COLORS.textPrimary,
    fontWeight: 600,
  },
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
    lineHeight: 1.65,
    color: COLORS.textSecondary,
  },
  retentionCard: {
    padding: '16px 20px',
    borderRadius: 12,
    background: COLORS.dangerBg,
    border: `1px solid ${COLORS.danger}`,
    color: COLORS.textPrimary,
    fontSize: 14,
    lineHeight: 1.55,
    marginBottom: 24,
  },
  retentionLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: COLORS.danger,
    marginBottom: 6,
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

export default function AccountDeletionPage() {
  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <p style={styles.brand}>Defensive Pedal</p>
        <h1 style={styles.h1}>Delete your account</h1>
        <p style={styles.meta}>Last updated: 27 April 2026</p>

        <p style={styles.intro}>
          You can delete your Defensive Pedal account at any time. This page
          explains how, what data is removed immediately, and what is retained
          and for how long.
        </p>

        <div style={styles.card}>
          <span style={styles.cardLabel}>Recommended</span>
          <h2 style={styles.cardTitle}>Delete from inside the app</h2>
          <ol style={styles.steps}>
            <li>Open Defensive Pedal on your phone.</li>
            <li>Tap the profile icon in the bottom navigation.</li>
            <li>
              Scroll to the <span style={styles.bodyStrong}>Account</span>{' '}
              section.
            </li>
            <li>
              Tap <span style={styles.bodyStrong}>Delete account</span>.
            </li>
            <li>
              Type <span style={styles.bodyStrong}>DELETE</span> to confirm and
              tap the red button.
            </li>
          </ol>
          <p style={styles.body}>
            The account and all its associated data are removed immediately.
            You will be signed out and returned to the welcome screen.
          </p>
        </div>

        <div style={styles.card}>
          <span style={styles.cardLabel}>Alternative</span>
          <h2 style={styles.cardTitle}>Email request</h2>
          <p style={styles.body}>
            If you no longer have access to the app — for example, you have
            uninstalled it or lost access to your Google account — email{' '}
            <a href="mailto:privacy@defensivepedal.com" style={styles.link}>
              privacy@defensivepedal.com
            </a>{' '}
            from the address associated with your Defensive Pedal account.
          </p>
          <p style={styles.body}>
            Include the subject line{' '}
            <span style={styles.bodyStrong}>"Account deletion request"</span>.
            We will verify ownership of the account and complete the deletion
            within 30 days, in line with GDPR Article 17.
          </p>
        </div>

        <h2 style={styles.h2}>What gets deleted</h2>
        <p style={styles.body}>
          The following are removed from our database the moment you confirm
          deletion (or, for email requests, when we complete the verification):
        </p>
        <ul style={styles.list}>
          <li>Your profile (display name, email address, profile photo).</li>
          <li>
            All your trip records and raw GPS breadcrumb trails — both the
            ones you can see in trip history and any 90-day-truncated
            summaries.
          </li>
          <li>Hazard reports you submitted, including their location data.</li>
          <li>
            Comments you posted, reactions you gave (likes, loves), and trips
            you shared to the community feed.
          </li>
          <li>
            Badges, XP, rider tier, streak history, and quiz history.
          </li>
          <li>Push notification tokens registered to your account.</li>
          <li>
            Saved routes and any waypoints you stored.
          </li>
        </ul>

        <h2 style={styles.h2}>What is kept (and why)</h2>
        <p style={styles.body}>
          A small amount of data is retained for safety, integrity, or legal
          reasons. None of it identifies you after deletion:
        </p>
        <ul style={styles.list}>
          <li>
            <span style={styles.bodyStrong}>
              Aggregate community statistics
            </span>{' '}
            — daily ride counts, total CO₂ saved by neighborhood, hazard
            density per area. Your individual contribution is unlinked from
            you and folded into the totals.
          </li>
          <li>
            <span style={styles.bodyStrong}>Validated hazard reports</span>{' '}
            that other riders have confirmed remain on the map without your
            username, so the safety signal is preserved for the community.
            Reports nobody confirmed are deleted with your account.
          </li>
          <li>
            <span style={styles.bodyStrong}>Server access logs</span> — IP
            address and request timestamps — are retained for{' '}
            <span style={styles.bodyStrong}>up to 12 months</span> for
            security audit purposes (GDPR Article 6(1)(f), legitimate
            interest), then deleted automatically.
          </li>
          <li>
            <span style={styles.bodyStrong}>Crash reports</span> sent to
            Sentry while you had analytics enabled are retained according to
            Sentry's default 90-day policy and are not linked to your account
            after deletion.
          </li>
        </ul>

        <div style={styles.retentionCard} role="note">
          <span style={styles.retentionLabel}>Important</span>
          Deletion is <strong>permanent</strong>. We cannot recover a deleted
          account or its trip history. If you change your mind later, you
          will need to create a fresh account with no prior data.
        </div>

        <h2 style={styles.h2}>How long does it take?</h2>
        <ul style={styles.list}>
          <li>
            <span style={styles.bodyStrong}>In-app deletion:</span> immediate.
            The data is removed during the request and you are signed out
            within seconds.
          </li>
          <li>
            <span style={styles.bodyStrong}>Email request:</span> we respond
            within 5 business days and complete the deletion within 30 days,
            as required by GDPR Article 12.
          </li>
        </ul>

        <h2 style={styles.h2}>Your rights</h2>
        <p style={styles.body}>
          Under GDPR, you also have the right to access your data, correct it,
          export it, restrict its processing, or object to specific processing
          activities. For any of these requests, contact{' '}
          <a href="mailto:privacy@defensivepedal.com" style={styles.link}>
            privacy@defensivepedal.com
          </a>
          . If you are unhappy with our response, you can lodge a complaint
          with Romania's data-protection authority, ANSPDCP, at{' '}
          <a
            href="https://www.dataprotection.ro/"
            style={styles.link}
            rel="noopener noreferrer"
            target="_blank"
          >
            dataprotection.ro
          </a>
          .
        </p>

        <hr style={styles.hr} />

        <p style={styles.contact}>
          See also our{' '}
          <a href="/privacy" style={styles.link}>
            Privacy Policy
          </a>{' '}
          for the full picture of what data we collect and how we use it.
        </p>
      </div>
    </main>
  );
}
