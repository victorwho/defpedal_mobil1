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
        <p style={styles.meta}>Last updated: 6 May 2026</p>

        <h2 style={styles.h2}>Who we are</h2>
        <p style={styles.body}>
          Defensive Pedal is operated by{' '}
          <strong>Victor Rotariu</strong>, sole proprietor, based in Brașov,
          Romania. For privacy and data-subject requests, contact{' '}
          <a href="mailto:privacy@defensivepedal.com" style={styles.link}>
            privacy@defensivepedal.com
          </a>
          .
        </p>

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
            Crash diagnostics (on by default; legitimate-interest basis under
            GDPR Art 6(1)(f) for service-stability — opt out anytime in
            Profile → Privacy & analytics): app version, device model, OS
            version, anonymised stack traces. No location, no personal data.
          </li>
          <li>
            Product analytics (opt-in only, off by default): anonymous usage
            events when you explicitly enable it in Profile → Privacy &
            analytics. Helps us prioritise the roadmap. No GPS tracking.
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
          object to specific processing, and{' '}
          <strong>receive a portable copy</strong> of the data you have
          provided to us in a commonly used machine-readable format
          (Article 20). See{' '}
          <a href="/account-deletion" style={styles.link}>
            how to delete your account
          </a>{' '}
          for the in-app and email-based deletion paths and what gets removed.
          For data export or other rights, contact{' '}
          <a href="mailto:privacy@defensivepedal.com" style={styles.link}>
            privacy@defensivepedal.com
          </a>
          {' '}— we respond within 30 days.
        </p>

        <h2 style={styles.h2}>Sub-processors and third-party services</h2>
        <p style={styles.body}>
          The app and its backend rely on the following providers to deliver
          the service. Each receives only the minimum data needed for its
          function.
        </p>
        <ul style={styles.list}>
          <li>
            <strong>Supabase</strong> — database, anonymous and email-based
            authentication. Currently US region; we plan to migrate to EU.
          </li>
          <li>
            <strong>Google Cloud Run</strong> — API hosting, EU region
            (europe-central2 / Warsaw).
          </li>
          <li>
            <strong>Mapbox</strong> — map tiles, geocoding, terrain elevation,
            and the standard cycling routing engine. The Mapbox SDK&apos;s own
            anonymous-usage telemetry is <strong>disabled</strong> in our
            builds.
          </li>
          <li>
            <strong>OpenStreetMap (OSRM &amp; Overpass)</strong> — our custom
            safety-scored routing server (osrm.defensivepedal.com,
            self-hosted on Google Cloud) and the Overpass API for bicycle
            parking, rental, and bike-shop locations. Receives the GPS
            coordinates needed to compute the request.
          </li>
          <li>
            <strong>Open-Meteo</strong> — weather and air-quality data shown
            in the route preview and 9 a.m. weather notification. Receives
            the GPS coordinates of the location being queried.
          </li>
          <li>
            <strong>Google OAuth</strong> — used only when you choose
            &ldquo;Sign in with Google&rdquo;. Google sees your email and
            display name as part of the identity exchange.
          </li>
          <li>
            <strong>Expo Push Service</strong> (exp.host) — relays push
            notifications (hazard alerts, weather warnings, streak nudges) to
            your device. Receives the push token and notification payload.
          </li>
          <li>
            <strong>Google Play Install Referrer</strong> — Android system
            service that tells us which install campaign brought you to the
            app. No PII is collected.
          </li>
          <li>
            <strong>Sentry</strong> — anonymised crash reports, EU region.
            <strong> On by default</strong> under a legitimate-interest legal
            basis (GDPR Art 6(1)(f)) since crash diagnostics are essential
            to keep the routing service safe and stable. You can object and
            disable it anytime in Profile → Privacy & analytics.
          </li>
          <li>
            <strong>PostHog</strong> — anonymised product analytics, EU host
            (eu.i.posthog.com). <strong>Off by default</strong>; transmitted
            only when you explicitly opt in.
          </li>
          <li>
            <strong>Firebase App Distribution</strong> — used for tester
            preview builds only (not production). Firebase Analytics is{' '}
            <strong>not</strong> shipped in our builds.
          </li>
        </ul>

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
