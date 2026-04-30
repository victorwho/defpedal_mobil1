# Annex A — Rewritten Privacy Policy (English)

> **Counsel direction.** Replace the entirety of `apps/web/app/privacy/page.tsx` body
> content with the text below. Preserve the existing styling and layout. Remove the
> "Placeholder" warning notice — the rewritten text below is the final form, subject
> to a Romanian-qualified lawyer's confirmation. A Romanian-language version
> (Annex A bis) must accompany the English version before public launch; the
> Romanian translation is a faithful rendering of the English text below and should
> be commissioned from a competent legal translator.
>
> All bracketed `[…]` placeholders must be filled by the data controller before
> publication.

---

## Privacy Policy — Defensive Pedal

**Last updated:** [DD] [Month] 2026
**Effective from:** [Effective date — should match the date this version is published]

### 1. Who we are (Data Controller)

The data controller for Defensive Pedal is:

- **Name:** Victor Rotariu (acting in personal capacity as sole proprietor; legal
  entity to be formed)
- **Address:** [Street, postal code], Brașov, Romania
- **Privacy contact:** privacy@defensivepedal.com
- **General contact:** legal@defensivepedal.com

We have not appointed a Data Protection Officer because the processing scale and
nature do not require one under GDPR Article 37 (we are not a public authority,
we do not process special categories of data at scale, and we do not engage in
systematic monitoring of public spaces). We will reassess this if our user base
grows materially or our processing changes.

### 2. The data we collect

We collect the following categories of personal data:

| Category | Examples | Legal basis | Retention |
|---|---|---|---|
| **Account data** | Email address, display name, optional profile photo | Art. 6(1)(b) — performance of contract (you cannot use the account features without an account) | While your account is active; deleted on request |
| **Live location data** | GPS coordinates during active navigation, sampled approximately every 3 seconds | Art. 6(1)(b) — performance of contract (the navigation feature you requested) | In-memory only during the ride; not transmitted or stored on our servers |
| **Trip data** | Start/end coordinates, route taken, distance, duration, elevation, derived metrics (CO₂ saved, calories) | Art. 6(1)(b) — performance of contract (the trip-history feature) | While your account is active; raw GPS breadcrumb trails are automatically truncated to first/last 200 m after **90 days** unless you opt to keep them longer in Profile → Account |
| **Hazard reports** | Hazard location, type, description, optional photo | Art. 6(1)(f) — legitimate interest in community road safety (rider safety is the controller's legitimate interest, and reporting hazards is the user's express purpose) | 4 hours to 14 days TTL by hazard type, then 45 days post-expiry, then deleted |
| **Community content** | Comments, reactions, ride shares, votes | Art. 6(1)(b) — performance of contract (the community feed feature) | While your account is active; user-deletable; auto-hidden when reported and pending review |
| **Crash reports** | Anonymised stack traces, app version, device model, OS version. **No IP address, no user-agent, no cookies, no user identifier** is collected | Art. 6(1)(f) — legitimate interest in product safety and stability (the LIA is documented internally and available on request) | 90 days at our processor (Sentry) |
| **Product analytics (optional)** | Anonymous event names, screen names, session duration. **No GPS data, no PII** | Art. 6(1)(a) — explicit consent. **Off by default.** You may turn it on at any time in Profile → Privacy & Analytics | 12 months at our processor (PostHog) |
| **Push notification tokens** | Device push token (FCM via Expo) | Art. 6(1)(f) — legitimate interest in operational notifications, with per-channel toggles | Until token rotation, device change, or unsubscribe |
| **Server access logs** | IP address, request timestamp, request path, response code | Art. 6(1)(f) — legitimate interest in service security and abuse investigation | 12 months from collection, then deleted automatically |
| **Backups** | Point-in-time backups of our primary database | Art. 6(1)(f) — legitimate interest in service continuity and disaster recovery | [N] days; see § 8 |

We do **not** collect: financial information, advertising identifiers (the
`AD_ID` permission is removed from our app build), health data, biometric data,
your contacts, your calendar, photos beyond your chosen profile picture, or your
microphone or camera input (except when you actively choose to take or upload a
profile picture).

### 3. Why we collect it

We collect personal data only for the purposes set out in § 2 above. To
summarise:

- **To deliver the navigation, routing, and trip-history features** you signed
  up for (account, trip, location data).
- **To keep the community safe** (hazard reports, moderation of comments,
  community content visibility).
- **To detect and fix software defects** so the app remains reliable for
  rider safety (crash reports).
- **To understand product usage in aggregate**, with your consent, so we can
  improve the app (product analytics).
- **To deliver notifications** you have asked us to send (push tokens).
- **To keep our service secure** and respond to abuse (server access logs).

We do **not** sell your data. We do **not** use your data for advertising. We do
**not** share your data with third parties for marketing purposes. We do **not**
build profiles for automated decision-making with legal effect.

### 4. Recipients of your data (sub-processors)

We use the following service providers ("processors") under written Article 28
contracts. Each processes personal data only on our documented instructions.

| Processor | Role | Region | What they receive |
|---|---|---|---|
| **Supabase** | Database, authentication, file storage | Currently United States; planned migration to EU; see § 7 | Account data, trip data, GPS breadcrumbs, hazards, comments, profile photos |
| **Google Cloud Run** | API server | EU (`europe-central2`) | Transit-level access to all of the above |
| **Mapbox** | Map tiles, geocoding, routing fallback | EU and US edge locations | Route start/end coordinates, search queries (no account ID) |
| **Open-Meteo** | Weather and air-quality lookups | EU (Germany) | Approximate location (rounded for weather lookup) |
| **OSRM (self-hosted)** | Safety-scored routing | EU (`europe-central2-c`) | Route start/end coordinates |
| **Sentry** | Crash diagnostics | EU (`de.sentry.io`) | Stack traces, device model, OS version (no PII) |
| **PostHog** | Product analytics, only with your consent | EU (`eu.i.posthog.com`) | Anonymous event and screen names |
| **Expo Push Service / FCM** | Push notification delivery | US (Expo); various (FCM) | Push token and notification payload (no GPS in payload) |
| **Resend** | Transactional email (e.g., inactive-account warning) | EU | Email address only |

A detailed register of each processor agreement is maintained internally and
available to data subjects on reasoned request.

### 5. International transfers

Today, your personal data is transferred to **the United States** because our
primary database is hosted on Supabase in its US region.

- **Transfer mechanism:** Standard Contractual Clauses (Module 2,
  Commission Decision 2021/914/EU), incorporated into our written processing
  contract with Supabase.
- **Adequacy decision:** Where Supabase Inc. is a participant in the EU–US
  Data Privacy Framework (DPF), the Commission's adequacy decision of
  10 July 2023 also supports the transfer. We rely on whichever mechanism is in
  force; on request we will tell you which mechanism applies as of the date of
  your enquiry.
- **Supplementary measures:** In line with EDPB Recommendations 01/2020, we
  apply the supplementary measures documented in our Transfer Impact Assessment
  (`docs/legal/tia-supabase-us.md`), including encryption at rest, restriction
  of access to specific Supabase administrative roles, and explicit
  US-government-access response procedures.
- **Migration plan:** We intend to migrate the primary database to the EU
  region before opening the app to general public users beyond Romania. When
  this migration completes, this section will be updated.

Your data is also transferred to the United States by **Expo Push Service** for
push-notification delivery; this is similarly covered by SCCs and limited to
push tokens and notification payloads (no GPS or other personal data in
payload).

You may request a copy of the SCCs by writing to privacy@defensivepedal.com.

### 6. Retention

Retention periods are stated in the table at § 2 above. In summary:

- Account and profile data: while your account is active, deleted on request.
- Raw GPS breadcrumb trails: 90 days, then automatically truncated.
- Hazard reports: lifecycle TTL (4 hours to 14 days) plus 45 days, then deleted.
- Inactive accounts: deleted after **24 months** of no sign-in. We send a
  warning email at 23 months.
- Crash reports: 90 days at Sentry.
- Product analytics: 12 months at PostHog (only collected with consent).
- Server access logs: 12 months.
- Backups: see § 8.

### 7. Backups

Our database provider (Supabase) takes automatic point-in-time backups for
service-continuity purposes. If you delete your account or specific data, the
data is removed from our live database immediately. Backup snapshots taken
before your deletion may continue to contain a copy for up to **[N] days**
(specifically, the active PITR window of our database project), after which they
are overwritten by the normal backup-rotation cycle. If we ever restore from a
backup, we re-apply your deletion automatically.

### 8. Your rights under GDPR

You have the following rights:

- **Right of access** (Art. 15): obtain a copy of the personal data we hold
  about you.
- **Right to rectification** (Art. 16): correct inaccurate or incomplete data.
- **Right to erasure / "right to be forgotten"** (Art. 17): see
  [our account-deletion page](/account-deletion).
- **Right to restriction of processing** (Art. 18): request that we stop
  using your data for specific purposes pending resolution of a dispute.
- **Right to data portability** (Art. 20): receive your data in a structured,
  commonly used, machine-readable format.
- **Right to object** (Art. 21): object to any processing based on
  legitimate interest (Art. 6(1)(f)) — this includes our crash diagnostics, our
  hazard-report retention, our push-notification operation, and our server-
  access-log security retention.
- **Right to withdraw consent** (Art. 7(3)): where we rely on your consent,
  you may withdraw that consent at any time, with effect from the moment of
  withdrawal. This applies in particular to product analytics (PostHog).
  Withdrawal does not affect the lawfulness of processing based on consent
  before its withdrawal.
- **Right not to be subject to automated decisions** (Art. 22): we do not make
  decisions producing legal or similarly significant effects on the basis of
  automated processing alone.

To exercise any of these rights, write to privacy@defensivepedal.com. We will
respond within **one month** of receipt under Article 12(3); we will
acknowledge receipt within five business days. If your request is complex,
we may extend the response period by up to two further months, in which case
we will tell you within the first month.

If you believe we have not handled your request properly, you have the right
to lodge a complaint with the Romanian Data Protection Supervisory Authority
(ANSPDCP — Autoritatea Națională de Supraveghere a Prelucrării Datelor cu
Caracter Personal):

- Website: https://www.dataprotection.ro
- Address: B-dul G-ral. Gheorghe Magheru 28-30, 010336 București, Romania

You may also contact the supervisory authority of your habitual residence, your
place of work, or the place where the alleged infringement occurred.

### 9. Whether providing data is required

- **Account email and password / Google account credentials** — required to
  create and use an account. Without these you cannot use any features that
  require an account.
- **Display name** — required to use the community feed (so other riders know
  who posted a comment or hazard).
- **Profile photo** — optional.
- **Live location during navigation** — required for the navigation feature
  itself; without it the app cannot route you.
- **Crash diagnostics (Sentry)** — collected by default; you may object at any
  time in Profile → Privacy & Analytics with effect from the moment of
  objection.
- **Product analytics (PostHog)** — opt-in; off by default; never required.

You can use the app anonymously (without creating an account) for limited
features; in this case we tie your locally-stored preferences to a device-only
identifier and not to a user account.

### 10. Children

The app is intended for users aged **16 and over**. We do not knowingly collect
personal data from children under 16. If you are under 16, please do not create
an account; if you have created one, please ask a parent or legal guardian to
contact us at privacy@defensivepedal.com so we can delete the account. This age
threshold reflects Article 8 GDPR as implemented by Romanian Law 190/2018,
which sets the digital consent age at 16.

### 11. Automated decision-making

We do not make decisions producing legal effects or similarly significant
effects on you on the basis of automated processing alone. The hazard auto-
filter (which hides comments matching a slur or threat wordlist pending human
review) is a content-moderation tool, not a decision under Article 22.

### 12. Changes to this Policy

We will update this Policy when our practices change. Material changes will be
notified to you in-app and by email at least 14 days before they take effect.
We will keep an archive of previous versions accessible on reasoned request.

### 13. How to contact us

- **Privacy and data-subject requests:** privacy@defensivepedal.com
- **General contact:** legal@defensivepedal.com
- **Postal address:** [Street, postal code], Brașov, Romania

For Romanian users, the competent supervisory authority is ANSPDCP at
https://www.dataprotection.ro.

---

*Counsel notes (do not include in published version):*

1. **Bracketed values to fill:** the postal address (twice), the effective date,
   the publication date, the PITR-window value `[N]` in § 7.
2. **Romanian translation:** required before public launch; commission a
   competent legal translator and have counsel review the final text.
3. **Linking:** § 8's link to `/account-deletion` should match the existing
   account-deletion page URL.
4. **DPF participation:** in § 5, before publication, verify whether Supabase
   Inc. is on the active DPF participant list (https://www.dataprivacyframework.gov/list).
   If yes, the adequacy decision under DPF supports the transfer alongside
   SCCs. If no, rely on SCCs alone with the supplementary measures from the
   TIA.
5. **Update on EU migration:** when Supabase migrates to EU, replace § 5
   with: "We do not transfer your personal data outside the European Economic
   Area." The push-token transfer to Expo Push (US) remains and must continue
   to be disclosed.
