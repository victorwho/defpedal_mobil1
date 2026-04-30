# Supporting artifacts — Annex B, C, D

This file contains:

- **Annex B** — Surgical amendments to the Terms of Service and consent-screen copy.
- **Annex C** — Legitimate Interest Assessment for Sentry crash diagnostics
  (to be saved as `docs/legal/lia-sentry.md`).
- **Annex D** — Transfer Impact Assessment for Supabase US (to be saved as
  `docs/legal/tia-supabase-us.md`).

---

## Annex B — ToS amendments and consent-screen copy

### B.1 Terms of Service amendments

**Source under amendment:** `apps/web/app/terms/page.tsx`. Counsel-recommended
amendments below are **surgical**: line-by-line changes, not a full rewrite,
because the rest of the ToS placeholder is acceptable as a minimum-binding
document for the closed-test phase.

#### Amendment 1 — § 3 (Immediate performance and waiver of withdrawal)

**Strike** the second paragraph of § 3 in its entirety. The current text reads:

> "Defensive Pedal is offered free of charge today; this clause applies in
> advance to any future paid features so the immediate-performance consent
> persists if and when premium functionality is introduced. You can stop using
> the service or delete your account at any time from Profile → Account →
> Delete account in the app."

**Replace with:**

> "You may stop using the service or delete your account at any time from
> Profile → Account → Delete account in the app. If we introduce paid
> features in the future, we will collect any waiver of withdrawal rights at
> the time you purchase the specific paid feature, with a separate
> confirmation."

The first paragraph of § 3 (the "express prior consent" language) may be
retained as a minimum binding statement covering the present (free) service,
even though it is essentially inert because the 14-day withdrawal right under
OUG 34/2014 does not apply to a wholly free service. Retaining it does no
harm and prepares the user for the framing they will see when paid features
arrive.

#### Amendment 2 — Add § 7 (Updates and material changes)

**Add a new § 7** before the contact line at the bottom:

> "## 7. Updates and material changes
>
> We may update these Terms from time to time. Where a change reduces your
> rights or imposes new material obligations, we will notify you in-app and
> by email at least 14 days before the change takes effect. Continued use of
> the service after the change takes effect constitutes acceptance. Where a
> change introduces a paid feature, the immediate-performance + waiver-of-
> withdrawal consent in § 3 will be collected separately, at the time of
> purchase, in accordance with OUG 34/2014 art. 16(m)."

#### Amendment 3 — Per-purchase model clause (for future use)

When paid features are introduced, the following model clause must be
presented at the moment of purchase, with an unticked checkbox the user must
affirmatively check, and the consent must be confirmed on a durable medium
(an order-confirmation email containing the consent text and the timestamp of
the user's affirmative act):

> "☐ By tapping 'Subscribe' (or 'Pay'), I give my **express prior consent**
> for Defensive Pedal to begin providing the [feature name] immediately, and I
> **acknowledge that I lose my 14-day right of withdrawal** under OUG 34/2014
> art. 16(m) once performance has begun."

The order-confirmation email must repeat this consent text and include the
date and time of the affirmative act.

### B.2 Consent-screen copy revisions

**Source under amendment:** `apps/mobile/app/onboarding/consent.tsx` and the
associated i18n keys (`consent.*` in `apps/mobile/src/i18n/`).

The current copy treats Sentry and PostHog as undifferentiated "consent" toggles.
This is legally inaccurate for Sentry (which relies on legitimate interest, not
consent) and creates the wrong framing for PostHog (which now defaults to OFF
and requires affirmative consent if turned on).

#### B.2.1 Revised consent-screen layout

Sections of the screen, top to bottom:

1. **Title** — "Before we start"
2. **Subtitle** — "We need you to know a few things about your data."
3. **First card — Crash reports (legitimate interest, on by default)**
   - Label: "Crash reports"
   - Description: "We send anonymous crash reports to our developer when the
     app crashes. This helps us fix bugs that affect rider safety. We do not
     collect your IP address, your location, or any identifier that links a
     crash to you. You can switch this off here or any time in
     Profile → Privacy & Analytics."
   - Toggle: **on by default**, label "Send anonymous crash reports"
4. **Second card — Product analytics (consent, off by default)**
   - Label: "Product analytics"
   - Description: "We can collect anonymous information about which screens
     you visit and which features you use, to understand how the app is used.
     We do not collect your location, your account email, or any identifier
     that links events to you. This is **off** by default. You can turn it on
     here or any time in Profile → Privacy & Analytics."
   - Toggle: **off by default**, label "Help improve the app"
5. **Assurance row (existing)** — "Your data stays in the EU. We don't sell
   it. We don't use it for advertising."
6. **Footer with two buttons of equal prominence:**
   - "Continue" — saves the current toggle state and proceeds
   - "Reject all and continue" — sets both toggles off and proceeds (note:
     "Reject all" includes Sentry; Sentry's legitimate-interest basis allows
     the user to object via this button, satisfying Art. 21)

Alternative footer if the engineering team prefers a single button: dynamically
relabel the button based on toggle state — "Continue with crash reports and
analytics" / "Continue with crash reports only" / "Continue without analytics
or crash reports." This is more concise but less clear than two equal-
prominence buttons; either is defensible.

#### B.2.2 i18n keys (English)

```yaml
onboardingConsent:
  eyebrow: "Privacy"
  title: "Before we start"
  subtitle: "We need you to know a few things about your data."
  crashLabel: "Send anonymous crash reports"
  crashDescription: "We send anonymous crash reports to our developer when the app crashes. This helps us fix bugs that affect rider safety. We do not collect your IP address, your location, or any identifier that links a crash to you. You can switch this off here or any time in Profile → Privacy & Analytics."
  analyticsLabel: "Help improve the app"
  analyticsDescription: "We can collect anonymous information about which screens you visit and which features you use, to understand how the app is used. We do not collect your location, your account email, or any identifier that links events to you. This is off by default. You can turn it on here or any time in Profile → Privacy & Analytics."
  assurance: "Your data stays in the EU. We don't sell it. We don't use it for advertising."
  continue: "Continue"
  rejectAll: "Reject all and continue"
  changeLater: "You can change these any time in Profile → Privacy & Analytics."
```

Romanian translation required for production launch; the translation keys are
the same.

#### B.2.3 Code change to support the revised UX

In `06-consent-screen.tsx`:

1. **Line 65 — flip default to OFF:**
   ```tsx
   const [productAnalytics, setProductAnalytics] = useState(
     isFirstTimeConsent ? false : persistedPosthog,
   );
   ```

2. **Add a "Reject all and continue" handler:**
   ```tsx
   const handleRejectAll = () => {
     setAnalyticsConsent({ sentry: false, posthog: false });
     router.push('/onboarding/safety-score');
   };
   ```

3. **Footer with two buttons (replace the existing single-button footer):**
   ```tsx
   <View style={styles.footer}>
     <Button variant="primary" size="lg" fullWidth onPress={handleContinue}>
       {t('onboardingConsent.continue')}
     </Button>
     <Button variant="secondary" size="lg" fullWidth onPress={handleRejectAll}>
       {t('onboardingConsent.rejectAll')}
     </Button>
     <Text style={styles.changeLater}>{t('onboardingConsent.changeLater')}</Text>
   </View>
   ```

   The "secondary" variant should be of equal visual size and contrast to the
   primary. Engineering's existing design-system tokens should support this;
   if not, add a `Button` variant where the visual hierarchy is roughly
   equal (same size, mid-contrast border, no fill — but as visible as the
   primary).

---

## Annex C — Legitimate Interest Assessment for Sentry crash diagnostics

> **Adopt as `docs/legal/lia-sentry.md`.** Update the `Reviewed by` and
> `Approved on` lines when Romanian counsel signs off.

```markdown
# Legitimate Interest Assessment — Sentry crash diagnostics

**Document version:** 1.0
**Date:** [DD] [Month] 2026
**Author:** Victor Rotariu, Data Controller
**Reviewed by:** [Romanian counsel — Avocat ____________ / Baroul ____________]
**Approved on:** [Date]

## 1. Purpose

This LIA assesses whether the controller's reliance on GDPR Article 6(1)(f)
legitimate interest as the legal basis for processing crash-diagnostic data
through the Sentry SDK is justified.

## 2. Processing operation

- **Data:** anonymised stack traces, app version, device model, OS version.
- **Configuration:** Sentry React Native SDK initialised with `sendDefaultPii: false`.
  No IP address, no user-agent, no cookies, no `setUser()` call. Server-side at Sentry,
  no user identifier links a crash event to a specific account.
- **Recipient:** Sentry GmbH (`de.sentry.io`), EU region. Standard Article 28
  processing contract in place.
- **Retention:** 90 days at Sentry (Sentry default).
- **Default state on first run:** ON. The user can switch off at the consent
  screen on first run, or in Profile → Privacy & Analytics at any time, with
  immediate effect.

## 3. Three-part LI test

### 3.1 Purpose test — is the interest legitimate?

**Yes.** The controller has a legitimate interest in operating a debuggable,
defect-resistant safety-critical app (cycling navigation). Software defects
in a navigation app can have safety consequences: a crash mid-ride leaves the
rider without guidance; a logic bug can mis-route a rider into traffic.
Effective server-side aggregation of crash reports is the industry-standard
mechanism for detecting and triaging such defects. Recital 49 of GDPR
contemplates legitimate interest for "ensuring network and information
security"; defect-prevention is closely adjacent.

### 3.2 Necessity test — is the processing necessary for the purpose?

**Yes.** The alternatives considered:

- **No crash reporting at all.** Materially worsens the controller's ability
  to detect and fix bugs. Rejected on safety grounds.
- **Manual user reports only.** Inadequate: most users do not report crashes,
  and crash reports submitted by users without stack-trace data are largely
  unactionable.
- **Self-hosted crash logging.** Technically possible but operationally
  costly for a sole-proprietor controller, and offers no privacy advantage
  over Sentry with `sendDefaultPii: false`.
- **Sampling at lower rate.** Reduces signal but does not change the
  privacy posture. Considered but not adopted; Sentry default rate is
  acceptable.

The chosen mechanism (Sentry, `sendDefaultPii: false`, default-on with one-tap
opt-out) is the least privacy-invasive option that achieves the purpose
effectively.

### 3.3 Balancing test — does the legitimate interest outweigh the data
subject's interests, rights, and freedoms?

**Yes.** Factors weighed:

- **Nature of data:** stack traces, device model, OS version are of low
  sensitivity. No special-category data. No financial data. No location.
- **Personal data?** Limited. Sentry-side data may be regarded as personal
  data because, in combination, device model + OS version + app version +
  stack-trace contents may rarely identify a single user. With
  `sendDefaultPii: false`, no IP, user-agent, or user_id is captured, which
  reduces re-identification risk to negligible.
- **Reasonable expectation:** A user installing a modern app reasonably
  expects that crashes are reported to the developer for diagnostics. Sentry
  is the most-used crash-reporting service in the React Native ecosystem; its
  use is industry-standard.
- **Impact on the data subject:** Negligible. The user is not contacted, not
  profiled, not subject to any automated decision based on crash data.
- **Right to object (Art. 21):** Effective. The Profile → Privacy & Analytics
  toggle revokes consent immediately, with on-device teardown of the Sentry
  client (verified in code).
- **Power asymmetry:** Low. The user is not a customer of the controller in
  a paid sense; the user has many alternatives (Strava, Google Maps, Komoot,
  etc.); the controller is a sole proprietor, not a market-dominant company.
- **Vulnerability:** Standard adult cyclists; no special vulnerability.
  Children under 16 are excluded by Terms.

The balancing test is satisfied. The legitimate interest in product safety and
stability outweighs the data subject's interest in not having anonymised crash
data sent to a processor, given the controller's safeguards.

## 4. Compliance with related obligations

- **Transparency (Art. 13).** Stated in the Privacy Policy § 2 row "Crash
  reports" and § 3.
- **Right to object (Art. 21).** Implemented in Profile → Privacy & Analytics.
- **Article 28 contract.** In place with Sentry GmbH.
- **International transfer.** Sentry processes in the EU (`de.sentry.io`); no
  third-country transfer arises.
- **ePrivacy / Law 506/2004.** Sentry's storage on the device with
  `sendDefaultPii: false` is transient session/breadcrumb state, strictly
  necessary for the diagnostic service the user is being asked about; the
  ePrivacy "strictly necessary" carve-out applies. (Counsel-confirmed
  position; if counsel disagrees, fallback is to flip Sentry to default-OFF.)

## 5. Conclusion

Reliance on GDPR Article 6(1)(f) for Sentry crash diagnostics is justified
under the conditions documented in this LIA. The default-ON posture is
defensible.

## 6. Re-assessment triggers

This LIA is to be re-assessed if any of the following occur:

- `sendDefaultPii` is flipped to `true` for any reason.
- Sentry retention is increased beyond 90 days.
- The controller's user base or processing scale changes materially.
- A regulatory development (CJEU ruling, EDPB guideline, ANSPDCP decision)
  substantially changes the analysis.
- Annual review (every 12 months from the date of this version).
```

---

## Annex D — Transfer Impact Assessment for Supabase US

> **Adopt as `docs/legal/tia-supabase-us.md`** unless and until the database
> is migrated to the EU region, in which case this document is archived. The
> structure follows EDPB Recommendations 01/2020 on supplementary measures.

```markdown
# Transfer Impact Assessment — Supabase (US region)

**Document version:** 1.0
**Date:** [DD] [Month] 2026
**Author:** Victor Rotariu, Data Controller
**Reviewed by:** [Romanian counsel — Avocat ____________ / Baroul ____________]
**Approved on:** [Date]
**Re-assessment trigger:** Annually, or upon CJEU ruling on US adequacy, or on
processor change.

## Step 1 — Know your transfer

- **Data exporter:** Victor Rotariu, sole proprietor (controller).
- **Data importer:** Supabase Inc., a Delaware corporation (processor).
- **Transfer purpose:** primary database hosting (Postgres + Auth + Storage),
  underpinning the navigation, trip, hazard, and community-content features
  of the Defensive Pedal app.
- **Categories of data subjects:** users of the Defensive Pedal app, located
  primarily in Romania at present.
- **Categories of personal data:** account identifiers (UUID, email, display
  name), trip data (start/end coordinates, route, distance), GPS breadcrumb
  trails (≤ 90 days), hazard reports (location, description, type),
  user-generated content (comments, reactions), profile photos, push tokens.
  No special-category data.
- **Frequency:** continuous, transactional.
- **Retention at importer:** mirrors the controller's retention schedule
  (Privacy Policy § 2 and § 6).

## Step 2 — Identify the transfer mechanism

- **Primary mechanism:** Standard Contractual Clauses (Module 2,
  Commission Decision 2021/914/EU) incorporated into the controller's written
  data-processing addendum with Supabase Inc.
- **Secondary mechanism:** to the extent Supabase Inc. is at the relevant
  time a participant in the EU–US Data Privacy Framework, the Commission's
  adequacy decision of 10 July 2023 also supports the transfer.
  *Verification:* check https://www.dataprivacyframework.gov/list at the
  time of each annual TIA review and on any material change.

## Step 3 — Assess the legal regime of the destination country

The United States is the destination. The legal landscape relevant to this
TIA includes:

- **US Foreign Intelligence Surveillance Act (FISA), § 702.** Permits the US
  government to collect electronic communications of non-US persons. CJEU
  identified this as the principal Schrems II concern.
- **Executive Order 12333.** Provides for foreign-intelligence collection
  outside the FISA framework.
- **Executive Order 14086 (2022).** Introduced safeguards including a Data
  Protection Review Court, in response to Schrems II; underpins the EU–US
  Data Privacy Framework adequacy decision.
- **Cloud Act (2018).** Permits US law-enforcement to compel US-incorporated
  service providers to produce data regardless of where it is stored.
- **State-level privacy laws** (CCPA / CPRA, various) — relevant to consumer
  rights but do not bear on the Schrems-II adequacy analysis.

The CJEU in Schrems II found, on the law as it stood in 2020, that the legal
regime of the United States did not provide essentially equivalent
protection, principally because of FISA § 702. EO 14086 and the resulting EU–
US DPF adequacy decision address this concern. The adequacy decision is
in force at the date of this TIA but is subject to ongoing legal challenge
(Schrems-III-style litigation pending). The TIA should therefore not rely
exclusively on the adequacy decision: SCCs + supplementary measures provide
the resilient backstop.

## Step 4 — Identify and adopt supplementary measures

The supplementary measures adopted are:

| Measure type | Adopted | Description |
|---|---|---|
| **Technical** | ✓ | At-rest encryption (Supabase default — AES-256). Service-role keys held server-side only (never embedded in the mobile app); client-side calls authenticate via per-user JWTs scoped by Row-Level Security (RLS) policies. RLS policies enforce per-user access at the database layer. |
| **Technical** | ✓ | TLS 1.2+ in transit between mobile client → Cloud Run API → Supabase. |
| **Technical** | Partial | No client-side encryption with controller-held keys. The controller does not currently encrypt data with keys that Supabase Inc. cannot access. This limits the supplementary-measures posture; it is acknowledged. |
| **Organisational** | ✓ | Access to the Supabase project is limited to the controller and named operational personnel (none at present). MFA is enforced on the controller's Supabase account. |
| **Organisational** | ✓ | The controller maintains a documented procedure for responding to US-government access requests (see § 5 below). |
| **Contractual** | ✓ | Supabase's standard SCC-incorporating DPA imposes obligations on Supabase to (a) notify the controller of any binding access request to the extent legally permitted, (b) challenge such requests where there is a reasonable basis, and (c) provide the minimum data necessary in response. |
| **Contractual** | ✓ | Supabase publishes a transparency report on government data requests (verify URL during annual review). |

## Step 5 — Procedural safeguards in case of access request

If Supabase Inc. notifies the controller of a US-government access request
(or if such a request is otherwise discovered), the controller will:

1. Within 24 hours: assess whether the request can be challenged on
   procedural or substantive grounds.
2. Within 72 hours: where appropriate, instruct Supabase to challenge or
   narrow the request.
3. As soon as legally permitted: notify the affected data subjects
   under Art. 14 GDPR and any concurrent obligation under Art. 33/34.
4. Notify ANSPDCP if the request results in disclosure of personal data of
   EU data subjects in circumstances that the controller assesses as
   undermining the protection of those data subjects.

## Step 6 — Re-assessment

This TIA will be re-assessed:

- Annually, on the anniversary of the date above.
- Upon any CJEU ruling on the US adequacy decision.
- Upon material change in the data flow, the data categories, or the
  processor's posture.
- Upon notification of any government access request.

## Step 7 — Mitigation plan: migration to EU region

The controller intends to migrate the Supabase project to the EU region
(`eu-central-1` or equivalent) before opening the app to general public users
beyond Romania. On completion of this migration, this TIA is archived and the
Privacy Policy is updated to reflect that no transfer outside the EEA arises.

## Conclusion

With the supplementary measures in § 4 in place, the SCCs are adequate to
provide essentially equivalent protection for the transfer of personal data
to Supabase Inc. in the United States, in line with the standard set by
Schrems II and EDPB Recommendations 01/2020. The transfer is therefore
permitted to continue while the migration to EU region is in progress.
```

---

*End of supporting artifacts.*
