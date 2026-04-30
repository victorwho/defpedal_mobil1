# Legal Opinion — Defensive Pedal Pre-Launch Privacy Review

**To:** Victor Rotariu, Data Controller (Defensive Pedal), Brașov
**From:** Counsel (acting in role; see disclaimer below)
**Date:** 29 April 2026
**Re:** GDPR, Law 506/2004 (ePrivacy), Law 190/2018 (Romanian GDPR implementing law), and OUG 34/2014 review of the pre-launch artefact package dated 2026-04-29
**Status:** PRIVILEGED & CONFIDENTIAL — Attorney–Client Communication (subject to disclaimer)

---

## Disclaimer (required, do not remove)

This document is an AI-generated counsel-style opinion produced at the data controller's
request to substitute, in the absence of a retained lawyer, for the analytical
deliverable a Romanian privacy lawyer would normally produce. **It is not legal
advice and it is not a substitute for retained Romanian counsel.** Before filing
this DPIA, before publishing the rewritten Privacy Policy, before flipping any
production switch on the consent screen for general-public users, and before
making any representation to ANSPDCP, the data controller must obtain a written
sign-off from a Romanian-qualified lawyer (a **avocat înscris în Baroul**)
willing to put their name and bar number on the document.

The reasoning, drafting, and remediation list in this opinion are my best
substantive read of GDPR, Law 506/2004, Law 190/2018, OUG 34/2014, the EDPB
guidelines, ANSPDCP enforcement decisions, and CJEU case law as of late 2025 /
mid-2026. Where my reasoning is contested or uncertain I have flagged it
explicitly.

---

## Executive summary

| # | Question | Disposition |
|---|---|---|
| 1 | ToS / OUG 34/2014 immediate-performance + 14-day waiver | **PROCEED with amendments.** The clause as drafted is mostly inert today (free service) but the pre-emptive waiver for unspecified future paid features is unenforceable and should be removed. Annex B contains surgical amendments. |
| 2 | Privacy Policy / Art. 13 + ANSPDCP transparency | **DO NOT PUBLISH AS DRAFTED.** The current text is materially non-compliant. Annex A contains the full rewrite to be published before any expansion beyond the closed test. A Romanian-language version (Annex A bis) must accompany it. |
| 3 | Default-ON Sentry crash reports / Art. 6(1)(f) | **PROCEED with the conditions in §III.C.** Default-ON is defensible under Art. 6(1)(f) provided (a) the LIA in Annex C is adopted, (b) `sendDefaultPii: false` remains, and (c) the consent-screen copy is reframed (Annex B) so Sentry is presented as "legitimate interest with right to object," not as "consent." |
| 4 | Default-ON PostHog product analytics | **DO NOT PROCEED. FLIP TO OFF before any expansion of the closed test beyond present 3 testers.** Default-ON is incompatible with Law 506/2004 art. 4 (ePrivacy *lex specialis*). My specific instruction is in §III.D. This is the only item in the package that I treat as a blocking finding. |
| 5 | DPIA completeness and Art. 36(1) determination | **CONDITIONAL APPROVAL.** Subject to the addenda in §V (R10–R13 added; R5 and R7 re-rated; TIA in Annex D adopted). With Q4 flipped per §III.D, **prior consultation under Art. 36(1) is NOT required.** With Q4 unflipped, prior consultation IS required. My DPIA back-page opinion is in §VI. |
| 6 | Art. 17 deletion flow | **PROCEED with documentation amendments.** The architecture (in-app + web fallback + cascade FK) is sound. Four documentation amendments are required (§III.F). |
| 7 | DSA Art. 16 / moderation | **PROCEED with three operational additions** (notifier feedback loop, Art. 11 single point of contact, Art. 12 electronic communications point). My DSA scope note is in §III.G; this question is at the edge of privacy practice and a DSA specialist (or the Romanian Digital Services Coordinator, ANCOM) should confirm. |

**Single most important action:** flip line 65 of `06-consent-screen.tsx` from `isFirstTimeConsent ? true : persistedPosthog` to `isFirstTimeConsent ? false : persistedPosthog` and ship before public exposure. Every other item in this opinion is deferable for hours or days; this one is not.

---

## I. Scope of engagement and methodology

### 1.1 Documents reviewed

- `01-dpia.md` — DPIA Draft v0.1
- `02-compliance-plan.md` — engineering compliance audit
- `03-terms-page.tsx` — Terms of Service web page (placeholder)
- `04-privacy-page.tsx` — Privacy Policy web page (placeholder)
- `05-account-deletion-page.tsx` — Account deletion fallback page
- `06-consent-screen.tsx` — Pre-collection consent UI (mobile, onboarding)
- `07-privacy-analytics-screen.tsx` — Post-onboarding revoke UI (mobile)
- `08-consent-default-on-walkthrough.md` — engineering's narrative on the default-on code
- `09-compliance-check-pre-counsel.md` — engineering's pre-counsel triage memo

### 1.2 Out-of-scope

The engagement is limited to privacy / data protection / consumer-law matters
relating to consent and digital-content withdrawal. Out of scope: corporate
formation, IP, commercial contracting, taxation, employment, IT security audit
(other than as a privacy input), and the Digital Services Act except to the
extent it overlaps with notice-and-action mechanisms touching personal data.
The DSA enforcement authority in Romania is ANCOM, not ANSPDCP; specialist DSA
counsel may be required for §III.G.

### 1.3 Posture

I treat the data controller as **Victor Rotariu, persoană fizică
autorizată în formare** (sole proprietor, pre-incorporation), domiciled in
Brașov. Romanian jurisdiction applies; Romania is the lead supervisory
authority (ANSPDCP) for the time being.

I assume the closed-test track currently has 3 testers, expanding to ~12 over
the next 14 days, with EU general-public production launch shortly after. The
present opinion is therefore in two timing horizons: **immediate (closed-test
≤ 12 testers)** where a small number of remediations are blockers, and
**pre-public-launch** where a larger set must be in place.

---

## II. Applicable legal framework (summary)

| Source | Relevance |
|---|---|
| **Regulation (EU) 2016/679 — GDPR** | Primary data-protection regime |
| **Law 190/2018** | Romanian GDPR implementing law (digital consent age 16, ANSPDCP fining powers, certain derogations) |
| **Law 506/2004** | Romanian transposition of ePrivacy Directive 2002/58/EC; governs storage and access on terminal equipment (the rule that flips Q4) |
| **Directive 2011/83/EU + OUG 34/2014** | Consumer Rights Directive — Art. 16(m) immediate-performance waiver for digital content (governs Q1) |
| **Directive (EU) 2019/770** | Digital Content and Services Directive — relevant once paid features or "personal data as counter-performance" exist |
| **Regulation (EU) 2022/2065 — Digital Services Act** | Notice-and-action obligations for hosting services (governs Q7); enforced in Romania by ANCOM |
| **CJEU C-673/17 *Planet49*** (1 Oct 2019) | Pre-ticked boxes are not consent (governs Q4) |
| **CJEU C-311/18 *Schrems II*** (16 July 2020) | Adequacy of US transfers; SCCs alone insufficient (governs R7) |
| **EDPB Guidelines 2/2023 on Article 5(3) of the ePrivacy Directive** | Confirms ePrivacy applies regardless of GDPR legal basis (governs Q4) |
| **EDPB Guidelines 9/2022 on personal data breach notification** | Art. 33/34 process (governs new R12) |
| **EDPB Recommendations 01/2020 on supplementary measures** | Post-Schrems II TIA methodology (governs R7) |
| **ANSPDCP enforcement decisions (2020–2025, public on dataprotection.ro)** | Practical baseline for Romanian fining posture |

---

## III. Findings and instructions

### A. Question 1 — Terms of Service / OUG 34/2014

**Finding.** The Terms of Service § 3 attempts to do two things simultaneously:
(i) collect an immediate-performance + waiver-of-withdrawal under OUG 34/2014
art. 16(m) for the present (free) service, and (ii) extend that consent in
advance to unspecified future paid features. The first is unobjectionable but
unnecessary today. The second is unenforceable.

**Reasoning.**

1. OUG 34/2014, transposing Directive 2011/83/EU, applies to "consumer contracts"
   characterised by consideration. A wholly free service to which the user
   provides no counter-performance (not even personal data as counter-performance
   in the sense of Directive (EU) 2019/770) is outside the immediate scope of the
   Ordinance for purposes of the 14-day withdrawal right. Thus, today, no
   waiver is needed.

2. Even where OUG 34/2014 does apply, art. 16(m) requires three contemporaneous
   elements: (a) express prior consent before performance begins; (b)
   acknowledgement that immediate performance entails loss of the right of
   withdrawal; (c) durable-medium confirmation. These elements must align with
   a specific contract for specific digital content. A waiver collected years
   in advance, before paid features are even designed, **fails the
   "specific" character required for valid express prior consent**, and would
   be assessed by ANPC (the consumer-protection authority that enforces OUG
   34/2014) as an unfair term under Law 193/2000 transposing Directive
   93/13/EEC on unfair terms in consumer contracts.

3. The Romanian Civil Code's general rules on consent (Cod civil arts. 1182,
   1183) and on standard terms (arts. 1202, 1203) reinforce the requirement of
   specificity for waivers prejudicial to consumer rights.

**Instruction.** Adopt the surgical amendments in **Annex B**. Specifically,
strike the second paragraph of § 3 entirely. When paid features are
introduced, collect the waiver per-purchase using the model clause in Annex B,
delivered with a durable-medium confirmation (an order-confirmation email
containing the consent text and the date/time of the user's affirmative act).

**Authority for this engagement.** Note that OUG 34/2014 enforcement is the
remit of ANPC (Autoritatea Națională pentru Protecția Consumatorilor), not
ANSPDCP. This finding therefore sits at the boundary of the engagement; if the
engaged Romanian counsel is privacy-specialist only, retain a consumer-law
colleague for the implementation of paid-feature waivers when that work
arises.

---

### B. Question 2 — Privacy Policy

**Finding.** The current placeholder Privacy Policy is materially non-compliant
with GDPR Art. 13 transparency obligations and falls short of ANSPDCP's
published expectations on several points. Specifically:

1. **Controller identity is incomplete.** "Defensive Pedal" + an email is not
   sufficient. The natural-person controller's name, residence, and pre-
   incorporation status must be stated, with a future commitment to update
   when the legal entity is formed.

2. **Legal basis per processing activity is missing.** Art. 13(1)(c) requires
   the legal basis for each processing operation to be communicated. Prose-only
   "why we collect" is not Art. 13(1)(c)-compliant.

3. **Legitimate-interest disclosure is missing.** Art. 13(1)(d) requires the
   specific legitimate interest pursued, where Art. 6(1)(f) is the basis.

4. **Recipient list is incomplete.** PostHog, Open-Meteo, Resend, Expo Push
   Service, OSRM (self-hosted, named with location), and Cloud Run as a
   recipient are absent or under-specified.

5. **Schrems II disclosure is absent.** This is the most serious omission. The
   Privacy Policy must disclose that personal data is transferred to the United
   States (Supabase US region), name the transfer mechanism (Standard
   Contractual Clauses, Module 2, EU 2021/914), reference the absence of a
   current adequacy decision for the US (the EU–US Data Privacy Framework
   adequacy decision is in force as of 2026, but the controller has not
   represented that Supabase is a participant — verify), and explain the
   supplementary measures in place (encryption at rest, no access by the
   controller's US staff, etc.). See Annex D for the TIA that supports the
   privacy-policy disclosure.

6. **Retention periods need granularity.** Add: server access logs (12 months),
   PostHog analytics (currently 7 years — counsel-recommended reduction to 12
   months; see §III.D), Sentry crash reports (90 days at processor), backup
   retention (Supabase PITR window — confirm exact value with engineering).

7. **Data-subject-rights enumeration is missing.** Art. 13(2)(b) requires
   specific identification of each right available, including the right to
   withdraw consent (Art. 7(3)) where consent is the basis, and the right to
   object (Art. 21) where Art. 6(1)(f) is the basis.

8. **Right to lodge complaint reference is OK** (✓).

9. **Whether provision is statutory/contractual** (Art. 13(2)(e)) is missing.

10. **Existence of automated decision-making** (Art. 13(2)(f)) is not addressed
    explicitly even to confirm absence.

11. **Romanian-language version is missing.** Art. 12 GDPR requires "concise,
    transparent, intelligible and easily accessible form, using clear and plain
    language." For a Romania-launching app where the user-base is Romanian, the
    operative language is Romanian. ANSPDCP has, in published decisions,
    treated English-only privacy notices in Romanian-targeting services as a
    transparency breach.

**Instruction.** Adopt the rewritten Privacy Policy in **Annex A** (English
text). Commission a Romanian translation of identical scope before public
launch (a competent legal translator is sufficient; counsel should review the
RO version once produced). Publish at `routes.defensivepedal.com/privacy` with
a language toggle.

**Retention defensibility (separate sub-question).** With the changes
introduced by Annex A — specifically, reducing PostHog retention from 7 years
default to 12 months, server access logs at 12 months with documented
security-investigation rationale, and the rest as currently configured — the
retention schedule is defensible.

---

### C. Question 3 — Default-ON Sentry crash reports

**Finding.** The default-ON posture for Sentry crash reports is defensible
under GDPR Art. 6(1)(f) (legitimate interest) provided three conditions are
satisfied. I confirm those conditions can be met within engineering's
existing implementation with minor copy and documentation changes.

**Reasoning.**

1. **Three-part LI test (Art. 6(1)(f)):**
   - **Legitimate interest:** Operating a debuggable, defect-resistant safety-
     critical app (cycling navigation) is a legitimate interest of the
     controller. Recital 47 contemplates "legitimate interests of the
     controller [...] strictly necessary for the purposes of preventing fraud"
     — debugging safety-critical software is closely analogous and
     industry-accepted.
   - **Necessity:** Effective product debugging requires server-side
     aggregation of crash reports. Sampling, on-demand opt-in, or in-house
     capture without a processor are less effective alternatives that would
     materially worsen the controller's ability to fix bugs that affect rider
     safety. Necessity is satisfied.
   - **Balancing test:** With `sendDefaultPii: false` (no IP, no user-agent,
     no cookies, no user_id correlation), retention at Sentry's 90-day default,
     and a one-tap, immediately-effective opt-out reachable from both the
     onboarding screen and Profile, the impact on the data subject is **low**.
     The data subject's reasonable expectation of a modern app is that crashes
     are reported to the developer for diagnostics. Balancing favours the
     controller.

2. **ePrivacy / Law 506/2004 art. 4 analysis:**
   The Sentry React Native SDK does not persist a stable identifier on the
   user's terminal equipment when configured with `sendDefaultPii: false` and
   without explicit `setUser()` calls. Storage of and access to information on
   the terminal is **strictly necessary for the diagnostic service**
   (the ePrivacy "strictly necessary" carve-out applies). On this analysis
   Law 506/2004 art. 4 is not engaged. This conclusion is contested at the
   margins by some commentators; if the engaged counsel disagrees and treats
   Sentry as ePrivacy-engaging, the fallback is to flip Sentry to default-OFF
   (one-line change). I rate the contestation low — Sentry's diagnostic-
   storage profile is the textbook fact pattern most DPAs accept.

3. **Recital 49 GDPR:**
   "[T]he processing of personal data to the extent strictly necessary and
   proportionate for the purposes of ensuring network and information
   security ... constitutes a legitimate interest of the controller
   concerned." Crash diagnostics are adjacent to network/information security
   in the sense that defect-prevention is part of operational integrity.

4. **CJEU and EDPB:** No CJEU case directly governs Sentry-style default-ON
   crash reporting. EDPB Guidelines 5/2020 on consent (revised) and 8/2020 on
   targeting of social media users do not displace LI for diagnostic
   processing.

**Instruction.**

1. **Adopt the LIA in Annex C** as `docs/legal/lia-sentry.md`. The LIA
   formally records the three-part test, the data subject's reasonable
   expectation, the technical safeguards, and the right to object. ANSPDCP, in
   any audit, will look for this document.

2. **Reframe consent-screen copy** (Annex B § "Consent screen copy") so Sentry
   is presented as "we rely on legitimate interest; you can switch this off"
   rather than "you consent." This both reflects the legal basis accurately
   and preserves the user's right to object under Art. 21.

3. **Maintain `sendDefaultPii: false`.** If at any future point this is
   flipped (e.g., for a tricky bug investigation), the LI analysis must be
   redone because IP and user-agent are personal data, and the balancing test
   shifts.

4. **Retain the one-tap opt-out** in Profile → Privacy & Analytics. This is
   already implemented (`07-privacy-analytics-screen.tsx`).

---

### D. Question 4 — Default-ON PostHog product analytics

**Finding.** Default-ON for PostHog is **NOT defensible** under Romanian and
EU law. **Flip to default-OFF before exposing the app to any user beyond the
present three testers.** This is a blocking finding.

**Reasoning.**

1. **Law 506/2004 art. 4 is the controlling rule.** Article 4(5), transposing
   ePrivacy Directive 2002/58/EC art. 5(3), prohibits the storage of, or
   access to, information stored on a user's terminal equipment unless either
   (a) the user has given prior consent based on clear and comprehensive
   information, or (b) the storage/access is strictly necessary for a service
   the user has expressly requested.

2. **PostHog stores a persistent device identifier** (`posthog_distinct_id`)
   on the user's terminal via React Native AsyncStorage / device storage.
   This is "information stored on a user's terminal equipment."

3. **Product analytics is not strictly necessary** for the navigation service
   the user has requested. The user asks the app for routing and hazard data.
   The controller's interest in measuring product usage is the controller's
   interest, not the user's.

4. **Therefore prior consent is required.** ePrivacy is *lex specialis*
   relative to GDPR Art. 6: even if the controller could mount a plausible
   Art. 6(1)(f) legitimate-interest defence (which I doubt for marketing-grade
   product analytics; the EDPB Guidelines 2/2023 on Art. 5(3) ePrivacy
   confirms this), the ePrivacy consent obligation operates independently and
   cannot be satisfied by LI.

5. **Default-ON is not consent.** *Planet49* (CJEU C-673/17, 1 Oct 2019) holds
   that consent under Directive 2002/58/EC + GDPR requires "active behaviour
   with a clear view to giving consent." A pre-ticked checkbox is not active
   consent. A toggle that is on by default for first-time users is functionally
   identical to a pre-ticked checkbox — the user must take action to opt out,
   not to opt in. *Planet49* is binding on Romanian courts and ANSPDCP applies
   it as a matter of routine.

6. **EDPB Guidelines 2/2023 on Article 5(3) of the ePrivacy Directive**
   (Adopted Nov 2023; remains operative.) The Guidelines explicitly classify
   product-analytics-grade tracking as outside the strictly-necessary
   carve-out; consent is required; "consent" must satisfy the GDPR Art. 4(11)
   definition (freely given, specific, informed, unambiguous, by affirmative
   action). Default-ON fails the affirmative-action limb.

7. **The "anonymous events" mitigation is irrelevant to the consent question.**
   ePrivacy governs the storage on the device, not the server-side
   identifiability of the data after collection. PostHog's anonymisation
   posture might support a softer GDPR balancing test for the upstream data;
   it does not cure the consent requirement at the device.

8. **ANSPDCP enforcement posture.** ANSPDCP has issued public sanctions in
   multiple decisions (2021–2025) for cookie-banner / mobile-tracker default-on
   patterns. Fines are routinely in the €3,000–€50,000 range for SMEs, with
   higher exposure for repeat or knowing violations. The enforcement risk for
   a pre-launch app with a complaint reaching ANSPDCP is real and actionable.

9. **The controller's own engineering team has identified this as the
   highest-risk item in the package.** I concur and elevate it to a blocking
   finding.

**Instruction (binding within this opinion's scope).**

1. **Code change.** Modify `06-consent-screen.tsx` line 65 from:
   ```tsx
   const [productAnalytics, setProductAnalytics] = useState(
     isFirstTimeConsent ? true : persistedPosthog,
   );
   ```
   to:
   ```tsx
   const [productAnalytics, setProductAnalytics] = useState(
     isFirstTimeConsent ? false : persistedPosthog,
   );
   ```
   Sentry's line 62 stays default-ON, justified separately under §III.C.

2. **UX change.** Add a "Continue without analytics" or equivalent CTA of
   equal visual prominence to "Continue." If the user toggles PostHog ON, the
   button label is "Accept and continue"; if PostHog is OFF, the button label
   is "Continue without analytics." This satisfies the EDPB requirement of
   equal-prominence consent options.

3. **PostHog SDK initialisation.** PostHog must NOT be initialised before
   consent is given. Confirm with engineering that
   `posthogConfigured && consent.posthog` gates the init call. (Per
   `08-consent-default-on-walkthrough.md` § "How telemetry is gated", this
   appears already to be the case — confirm.)

4. **PostHog retention.** Reduce from 7-year default to 12 months in the
   PostHog project console. (Settings → Data Management → Data Retention.)

5. **Privacy Policy disclosure.** Annex A states: "Product analytics
   (PostHog) — legal basis Art. 6(1)(a) explicit consent. Off by default. You
   may turn it on in Profile → Privacy & analytics. Withdrawing consent does
   not affect the lawfulness of prior processing."

6. **DPIA update.** R6 residual risk drops from "Limited (pending counsel)"
   to "Negligible." The Art. 36(1) determination resolves cleanly (see §VI).

**Caveat.** If the controller wishes to push back and retain default-ON for
PostHog, my position cannot be reconciled with that choice. The fallback in
that scenario is to (a) treat R6 residual risk as **High**, (b) submit a prior-
consultation request under Art. 36(1) to ANSPDCP **before** public launch, and
(c) accept the substantial enforcement risk that the prior consultation will
result in an instruction to flip to OFF anyway. The least-cost path is to
flip now.

---

### E. Question 5 — DPIA completeness

I treat this in §V (DPIA back-page opinion). In summary: conditional approval
contingent on adopting the additions and re-ratings set out there.

---

### F. Question 6 — Art. 17 deletion flow

**Finding.** The architectural design (in-app immediate deletion + web/email
fallback + cascade FK from `auth.users`) is sound and meets Art. 17. Four
documentation amendments are required. The retention of "anonymised aggregate
metrics" is acceptable provided the methodology genuinely satisfies Recital
26.

**Reasoning and instructions.**

1. **Backup retention disclosure.** Supabase's automated backups (PITR) retain
   data for the project's PITR window after live-database deletion. This is a
   standard Schrems-II-aware disclosure and ANSPDCP expects it. **Add to the
   account-deletion page and Privacy Policy:**

   > "Your data is removed from our live database immediately upon
   > confirmation of deletion. Backups taken before your deletion may
   > continue to contain a copy for up to [N] days, after which they are
   > overwritten by the normal backup-rotation cycle. If we ever restore from
   > a backup, we re-apply your deletion automatically."

   Engineering: confirm exact value of [N] from Supabase project settings.
   For free-tier this is typically 7 days; for paid tier it is the configured
   PITR retention.

2. **Art. 17(3)(e) basis for IP-log retention exception.** The current
   account-deletion page implies that IP retention is a free-standing 6(1)(f)
   processing that survives an Art. 17 request. The legally precise framing
   is that Art. 17(3)(e) (necessary for establishment, exercise or defence of
   legal claims) and/or Art. 17(3)(b) (compliance with legal obligation, e.g.,
   security audit retention) is the **erasure exception**. **Replace the
   "Server access logs" bullet with:**

   > "Server access logs — IP address and request timestamps — are retained
   > for up to 12 months for security audit and abuse-investigation purposes
   > (legal basis Art. 6(1)(f), legitimate interest in service security). On
   > an Art. 17 erasure request, these logs persist until their normal expiry
   > under Art. 17(3)(e), the right-of-erasure exception for the
   > establishment, exercise or defence of legal claims, after which they are
   > deleted automatically."

3. **Hazard de-identification methodology.** The current text says
   "validated hazard reports remain on the map without your username." This
   is **pseudonymisation, not anonymisation**, because the report's
   coordinates, timestamp, and free-text description may, in combination,
   identify the original poster (especially for hazards near the home or
   workplace). Adopt one of two paths:

   - **Path A — strengthen to true anonymisation.** Coarsen location to
     ~100 m grid, drop timestamp to date only (or to nearest 6-hour band),
     and run an automated PII scan on the description before retention.
     Then call it anonymisation.
   - **Path B — re-frame as legitimate-interest retention.** Acknowledge that
     the retained hazard is pseudonymised, not anonymised; state that the
     legal basis for continued retention is Art. 6(1)(f) (community safety)
     even after the original poster's account is deleted; and add a UX
     mechanism to remove a specific hazard one posted ("delete just this
     hazard") if the user objects to that retention.

   I recommend **Path A** for first-party hazard reports posted by deleting
   users (the safety value of preserving the report is high; the
   re-identification risk drops sharply with coordinate coarsening); and
   **Path B** as a fallback if the engineering effort for Path A is
   non-trivial.

4. **Email-flow identity verification.** Document the verification mechanism
   on the account-deletion page:

   > "When you request deletion by email, we verify your ownership by sending
   > a confirmation link to the email address registered on your account.
   > Once you click the link, we complete the deletion within 5 business days
   > and confirm by reply email."

5. **Aggregate stats — verify they are genuinely anonymous.** Engineering
   confirms (via the controller's correspondence) that "CO₂ totals,
   microlives" are stored in tables that retain no foreign key to the
   deleted `user_id`. Verify by inspection that these tables (e.g.,
   `community_stats_daily`, `neighborhood_co2_totals` or similar) are
   keyed only on `(date, neighborhood_id)` or analogous non-personal
   dimensions, with no per-user residue. If so, Recital 26 anonymisation is
   satisfied. If not, collapse on Art. 17 deletion as part of the cascade.

6. **DSAR fulfillment timeline.** Art. 12(3) sets a 1-month deadline. The
   current 30-day commitment is acceptable. The 5-business-day initial
   response commitment is good practice.

---

### G. Question 7 — DSA Art. 16 / moderation

**Finding.** The moderation framework is operationally strong (auto-filter +
block + report + rate limits + kill-switch). Three documentation gaps need
closing, and one scope note applies.

**Instructions.**

1. **DSA Art. 16(5) — notifier feedback loop.** Confirm that the in-app
   report flow:
   - acknowledges receipt (a confirmation toast plus an entry in the
     reporter's "your reports" view, if exists);
   - communicates a reasoned decision back to the reporter ("we removed the
     content / we did not, because [reason]"); and
   - states the reporter's right to redress (e.g., re-submission, complaint
     to authorities).

   If any of these is missing, add it. The privacy-impact of this is minimal
   — the reasoned decision is communicated to the reporter, not to the
   reported user.

2. **DSA Art. 17 — statement of reasons to removed-content user.** When
   user-generated content is removed (whether by moderation cron or manually),
   the user whose content was removed is entitled to a statement of reasons
   stating: which content was removed, the legal/ToS basis, the duration of
   any account restriction (if any), the redress mechanism. Confirm the
   moderation pipeline emits an in-app notification to the user when their
   content is hidden.

3. **DSA Art. 11 + Art. 12 — single points of contact.**
   - **Art. 11** (single point of contact for authorities): publish a contact
     point on `defensivepedal.com` (e.g., `legal@defensivepedal.com` already
     exists; designate it formally as the Art. 11 point of contact; a
     separate page at `defensivepedal.com/dsa-contact` is good practice).
   - **Art. 12** (single point of contact for users / electronic
     communications): confirm `legal@defensivepedal.com` and/or
     `privacy@defensivepedal.com` are explicitly designated and published.

4. **DSA Art. 20 — internal complaint-handling system.** A user whose content
   was removed must be able to lodge an internal complaint and receive a
   response. This can be a simple email-based mechanism for a small platform
   like Defensive Pedal; it does not require a dedicated ticketing system.
   Document the process in the moderation runbook.

5. **Micro-/small-enterprise carve-out (DSA Art. 19).** Recommendation
   2003/361/EC criteria (< 50 employees AND ≤ €10M turnover): Defensive Pedal
   is well inside the carve-out at present. The carve-out exempts micro/small
   from Art. 19, 20, 22, 24 obligations. Arts. 11, 12, 14, 16 still apply.
   Once the controller exceeds the threshold (unlikely soon at Romanian
   solo-developer scale), the larger obligations attach.

6. **Scope note.** DSA enforcement in Romania falls to ANCOM (the Digital
   Services Coordinator), not ANSPDCP. The retained Romanian privacy lawyer
   may not be the right specialist for §III.G; either retain a colleague with
   DSA practice in the same firm, or accept a short separate review on this
   question.

---

## IV. Required remediation before public launch

I draw a hard line between **closed-test (≤ 12 testers)** and **public
launch / general production.** Items in tier 1 must be done before the next
build that ships to closed test. Items in tier 2 must be done before public
launch.

### Tier 1 — before next closed-test build (≤ 7 days)

1. **Flip PostHog default to OFF** in `06-consent-screen.tsx` line 65.
   (§III.D, instruction 1.) **Blocking.**
2. **Reduce PostHog retention** to 12 months in PostHog project console.
   (§III.D, instruction 4.)
3. **Reframe consent-screen copy** so Sentry is presented as
   legitimate-interest with right-to-object (Annex B § Consent screen copy).
4. **Add "Continue without analytics" CTA** of equal prominence (§III.D,
   instruction 2).
5. **Adopt the LIA for Sentry** at `docs/legal/lia-sentry.md` (Annex C).

### Tier 2 — before public launch

6. **Publish rewritten Privacy Policy** in English (Annex A) and Romanian
   (Annex A bis — translation required).
7. **Strike pre-emptive paid-feature waiver** from ToS § 3 (Annex B).
8. **Publish the TIA for Supabase US** at `docs/legal/tia-supabase-us.md`
   (Annex D), AND/OR migrate Supabase to EU region (preferred).
9. **Add R10–R13** to DPIA. Re-rate R5 and R7. Refresh sign-off block (§V,
   §VI).
10. **Document hazard de-identification methodology** (§III.F.3) — Path A or
    Path B.
11. **Document the email-flow verification process** on the account-deletion
    page (§III.F.4).
12. **Add backup retention disclosure** to account-deletion page and Privacy
    Policy (§III.F.1).
13. **Cite Art. 17(3)(e)** for IP-log retention exception (§III.F.2).
14. **DPA register** at `docs/legal/dpa-register.md` listing each processor
    (Supabase, Sentry, PostHog, Mapbox, Open-Meteo, Resend, Expo, Cloud Run),
    contract reference, transfer mechanism, date signed.
15. **Breach response runbook** at `docs/ops/breach-response.md` — 72-hour
    escalation, ANSPDCP notification template, breach register location.
16. **DSA gap-closure** (§III.G items 1–4).
17. **DSAR self-serve export endpoint** before scaling beyond ~1,000 active
    users. Manual email handling is fine for closed test; not for production
    scale.
18. **Self-declaration age-gate at signup** for under-16 rejection (§V, R10).
19. **Romanian counsel sign-off on the final DPIA, Privacy Policy, and ToS
    amendments** — this is the formal step that closes the engagement and
    fills the empty sign-off block.

### Tier 3 — within 90 days post-launch

20. **TLS in front of OSRM** (R5 long-term mitigation).
21. **Migrate Supabase to EU region** (R7 cleanest mitigation; obviates the
    TIA).
22. **Inactive-warning email mailer** (operationalise the 23-month warning
    that the Privacy Policy commits to).
23. **Annual DPIA review** (12-month re-trigger or sooner if §4.3 conditions
    fire).

---

## V. DPIA — counsel review

### V.1 Additions (R10–R13)

#### R10 — Children's data / age-gate

- **Threat:** Romanian Law 190/2018 art. 8 sets the digital consent age at
  16. The Terms state "you must be at least 16" but the app has no signup-time
  age-gate. A user under 16 may sign up.
- **Likelihood:** Possible (cycling apps appeal to teenagers).
- **Severity:** Significant (children's data has special protections under
  Art. 8 GDPR + national law).
- **Mitigation:** Self-declaration age check at signup ("Are you at least 16
  years old?" Yes/No, with rejection on No and a note that under-16s may use
  the app only with parental consent under Art. 8). The threshold of
  "reasonable efforts" under Art. 8(2) is met by self-declaration at this
  scale; biometric or document-based age verification is disproportionate.
- **Residual risk:** **Limited.**

#### R11 — DSAR fulfillment capacity

- **Threat:** Art. 15 (access), Art. 20 (portability) are admitted as manual
  via email. At scale, the 1-month deadline (Art. 12(3)) becomes infeasible.
- **Likelihood:** Possible, rises with user count.
- **Severity:** Limited (regulatory action under Art. 83(5)(b)).
- **Mitigation:** Pre-build a self-serve export endpoint (a simple Supabase
  Edge Function returning JSON of all user-keyed rows). Pre-public-launch.
- **Residual risk:** **Negligible** post-mitigation.

#### R12 — Breach notification readiness

- **Threat:** Art. 33 requires notification to ANSPDCP within 72 hours; Art. 34
  requires notification to data subjects without undue delay where high risk.
  No breach-response runbook, no breach register, no documented escalation
  path.
- **Likelihood:** Rare.
- **Severity:** Significant if the lack-of-process extends the 72-hour clock.
- **Mitigation:** 1-page breach-response runbook covering: detection sources,
  severity triage (using EDPB Guidelines 9/2022 risk matrix), 72-hour
  escalation, ANSPDCP submission template (the form is published on
  dataprotection.ro; pre-fill the static fields), breach register location.
- **Residual risk:** **Limited.**

#### R13 — Sub-processor DPA register

- **Threat:** Art. 28 requires a written contract with each processor. There
  is no centralised register confirming each processor has a current DPA in
  place.
- **Likelihood:** Likely to be flagged in any audit.
- **Severity:** Limited.
- **Mitigation:** 1-page DPA register at `docs/legal/dpa-register.md`. For
  each processor: name, role, region, DPA URL/PDF location, transfer
  mechanism (SCC vs adequacy), date signed.
- **Residual risk:** **Negligible.**

### V.2 Re-ratings

#### R5 — Plaintext OSRM (re-rate)

The DPIA's "Rare" likelihood understates the public-Wi-Fi case. Re-rate:
- Likelihood: **Possible** (any user on public Wi-Fi).
- Severity: **Limited**, as the DPIA correctly notes (route start/end already
  reach Mapbox via TLS, so the marginal information leak is to network
  observers off Mapbox's path; some marginal info, not a great deal).
- Risk before mitigation: **Medium**.
- Risk after current mitigation (per-domain cleartext exception, scoped
  privacy-policy disclosure): **Limited.**
- Risk after item 6 long-term (TLS in front of OSRM): **Negligible.**

This re-rating does not change the overall risk-matrix conclusion (no
residual high risk).

#### R7 — Supabase US region (re-rate and strengthen mitigation)

Post-Schrems II, SCCs alone are insufficient. The DPIA mitigation table must
incorporate either (a) a documented Transfer Impact Assessment, with named
supplementary measures, OR (b) a commitment to migrate to the EU region
before public launch. **My recommendation: do (b).** It is operationally
simpler than maintaining a TIA, removes the regulator's easiest finding,
and aligns the data flows with the engineering stack that already runs Cloud
Run in `europe-central2`.

Pending migration: adopt the TIA in **Annex D** as `docs/legal/tia-supabase-us.md`.

### V.3 Art. 36(1) prior-consultation determination

**Determination:** With the remediation in §III.D adopted (PostHog → default
OFF), and the additions in §V.1 + re-ratings in §V.2 reflected in the DPIA,
**no residual risk is rated High**, and Art. 36(1) prior consultation with
ANSPDCP is **NOT REQUIRED**.

If the controller declines the §III.D remediation and retains default-ON for
PostHog, R6 residual risk rises to **High** (Likely × Significant),
**Art. 36(1) prior consultation IS REQUIRED**, and public launch must be
deferred until ANSPDCP responds (Art. 36(2): up to 8 weeks, extendable by 6
weeks).

### V.4 Counsel-recommended precautionary filing

Even with default-OFF PostHog and the DPIA additions, a **precautionary
filing notice to ANSPDCP** is not legally required but may be considered.
Practical assessment: ANSPDCP does not encourage unnecessary filings and
would not view the Defensive Pedal DPIA as triggering Art. 36(1). I do not
recommend a precautionary filing.

---

## VI. Signed DPIA back-page opinion

> _The signature block in `01-dpia.md` § 6 is to be filled as below upon
> adoption of the §III.D remediation and the §V additions and re-ratings. A
> Romanian-qualified lawyer must place their actual signature, name, bar
> number, and seal — this opinion is a substitute for that work product, not
> for that signature._

```
Sign-off block (final filed version)
─────────────────────────────────────

Data controller:
    Name:        Victor Rotariu
    Address:     [Brașov, Romania — to be completed at incorporation
                 or with current residence]
    Email:       victorrotariu@gmail.com
    Signature:   ____________________________
    Date:        [DD MMMM YYYY]

Counsel review:
    Name:        [Romanian-qualified lawyer — Avocat]
    Bar:         [Baroul ____________ / Membership No.]
    Firm:        [Firm name]
    Conclusion:  After the remediation set out in counsel's opinion of
                 29 April 2026 (file 10-counsel-opinion.md, §§ III–V) is
                 adopted, the DPIA is fit for filing under GDPR Art. 35.
                 Prior consultation with ANSPDCP under Art. 36(1) is NOT
                 required.
    Signature:   ____________________________
    Date:        [DD MMMM YYYY]
```

---

## VII. Engagement deliverables and outstanding actions for the controller

| # | Deliverable | Status | Owner |
|---|---|---|---|
| 1 | This counsel opinion | Delivered (with disclaimer in §0) | Counsel |
| 2 | Rewritten Privacy Policy (English) | Annex A | Engineering to publish; Counsel sign-off on final |
| 3 | Rewritten Privacy Policy (Romanian) | Translation required | Translator + Counsel review |
| 4 | ToS amendments | Annex B | Engineering to apply |
| 5 | Consent-screen copy revisions | Annex B | Engineering to apply |
| 6 | LIA for Sentry | Annex C | Adopt as `docs/legal/lia-sentry.md` |
| 7 | TIA for Supabase US | Annex D | Adopt as `docs/legal/tia-supabase-us.md` if not migrating |
| 8 | DPIA additions (R10–R13) | §V.1 | Engineering to merge into `01-dpia.md` |
| 9 | DPIA re-ratings (R5, R7) | §V.2 | Engineering to merge into `01-dpia.md` |
| 10 | DPIA back-page sign-off | §VI | Romanian-qualified lawyer required (not me) |
| 11 | Pre-launch remediation checklist | §IV | Controller |

---

## Annex A — Rewritten Privacy Policy (English)

See `11-privacy-policy-rewrite.md` (separate file in this package).

## Annex B — ToS amendments and consent-screen copy

See `12-supporting-artifacts.md` § "Annex B" (separate file).

## Annex C — Legitimate Interest Assessment for Sentry crash reports

See `12-supporting-artifacts.md` § "Annex C" (separate file).

## Annex D — Transfer Impact Assessment for Supabase US

See `12-supporting-artifacts.md` § "Annex D" (separate file).

---

*End of opinion.*
