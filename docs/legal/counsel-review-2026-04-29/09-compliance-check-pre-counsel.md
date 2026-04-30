# Pre-counsel compliance check — Defensive Pedal

> **What this is.** A non-lawyer compliance review of the seven questions in `README.md`,
> intended to (a) sharpen what you ask counsel and (b) flag findings that, if confirmed by
> counsel, must be remediated before public launch. **This is not legal advice.** Romanian-
> qualified counsel must sign off on the DPIA and the published documents.
>
> **Tone.** You explicitly asked me not to soften answers to spare engineering work. I've
> tried to honour that — the headline finding (Q4) is "flip the default to OFF before public
> launch."
>
> **Date:** 2026-04-29

---

## Summary — proceed/condition/block

| # | Question | Verdict | Action before public launch |
|---|---|---|---|
| 1 | ToS sufficient for OUG 34/2014 immediate-performance + 14-day waiver, **including the pre-emptive waiver for future paid features**? | **Conditional — partly enforceable today; pre-emptive waiver almost certainly NOT enforceable** | Strip the "applies in advance to any future paid features" sentence; collect the waiver at the moment paid features are introduced, per-purchase |
| 2 | Privacy Policy meets GDPR Art. 13 + ANSPDCP transparency? | **No — materially incomplete** | Rewrite. Five of the twelve Art. 13 elements are missing or thin. Critical omission: Schrems-II transfer to Supabase US is not disclosed on the public page |
| 3 | Default-ON Sentry crash reports defensible under Art. 6(1)(f)? | **Yes, with conditions** | Document a written Legitimate Interest Assessment (LIA); keep `sendDefaultPii: false`; ensure the consent screen frames it as LI not consent; one-tap opt-out (already shipped) |
| 4 | Default-ON PostHog product analytics defensible? | **No — flip to OFF** | One-line code change. The default-ON posture is contrary to Law 506/2004 art. 4 (ePrivacy), CJEU *Planet49*, EDPB Guidelines 2/2023, and current ANSPDCP enforcement posture. **Highest-likelihood failure point in the package.** |
| 5 | DPIA covers everything ANSPDCP would expect; residual-risk classification justifies skipping Art. 36(1) prior consultation? | **Conditional** — most of the document is solid, but four risks are missing and three are under-rated. **If PostHog stays default-ON, R6 residual rises to High → prior consultation IS required** | Add R10 (children/age-gate), R11 (DSAR backlog at scale), R12 (breach response readiness), R13 (sub-processor DPA register). Re-rate R5 (plaintext OSRM) and R7 (US region) honestly. Add a documented Transfer Impact Assessment for Supabase US |
| 6 | In-app + web Art. 17 deletion sufficient? | **Substantially sufficient — three documented gaps** | Disclose backup retention; document the Art. 17(3)(e) basis for the IP-log retention exception; document the hazard de-identification methodology; document the email-flow identity verification process |
| 7 | DSA Art. 16 procedure documented well enough? | **Mostly yes — three small gaps** | Add: notifier feedback loop (reasoned decision back to reporter), Art. 11 single point of contact, Art. 12 electronic communications point. Confirm whether the micro-enterprise carve-outs apply at current scale |

**Bottom line:** You have one true blocker (Q4), one major rewrite (Q2), one drafting fix (Q1), and a pile of medium-effort documentation polish (Q5–Q7). With Q4 flipped and Q2 rewritten, your overall posture is defensible and Art. 36(1) prior consultation is **not** required. With Q4 unchanged, prior consultation **is** required.

---

## Q1 — ToS / OUG 34/2014 immediate-performance + 14-day-waiver

**Source under review:** `03-terms-page.tsx` § 3.

### What the clause says
The ToS § 3 says the user gives "express prior consent" that performance begins immediately and "acknowledges that you lose your right of withdrawal" under Directive 2011/83/EU Art. 16(m) and OUG 34/2014. It also says the clause "applies in advance to any future paid features so the immediate-performance consent persists if and when premium functionality is introduced."

### Today (free service)
- For a **wholly free** service, OUG 34/2014's withdrawal right doesn't bite. The Consumer Rights Directive applies to "sales contracts" and "service contracts" — both contemplate consideration. The 2019 Digital Content Directive (EU) 2019/770 extended the regime to "personal data as counter-performance," but the withdrawal right under OUG 34/2014 attaches at the point of paid contract formation.
- So today the clause is mostly inert. That's fine.

### When you introduce paid features — the pre-emptive waiver problem
- OUG 34/2014 art. 16(m) (transposing Directive 2011/83/EU Art. 16(m)) requires THREE things, **at the moment of contracting** for the digital content/service:
  1. **Express prior consent** to immediate performance.
  2. **Acknowledgement of loss of withdrawal right** as a consequence.
  3. **Confirmation of (1) and (2) on a durable medium** (Art. 7(2) of the Directive; Romanian implementation requires a durable copy).
- A waiver collected **years before** the paid feature exists, for **unspecified future paid features**, **almost certainly fails the "express prior consent" requirement** because:
  - Express prior consent must be specific to the contract being formed. A blanket pre-consent to "future paid features" is not specific.
  - The user cannot acknowledge loss of withdrawal rights for a service whose nature, price, and characteristics are unknown.
  - The Directive's purpose is consumer protection at point of purchase; pre-emptive waivers undermine this and have been struck down by ECJ-aligned national authorities.
- ANSPDCP / ANPC (the Romanian consumer-protection authority that enforces OUG 34/2014, **not** ANSPDCP — this is out of scope for a privacy lawyer) would treat this as an unfair term under Law 193/2000 / Directive 93/13/EEC.

### Recommendation
- **Strip** the second paragraph of § 3 ("Defensive Pedal is offered free of charge today; this clause applies in advance to any future paid features…"). Today it adds risk and provides no benefit (you're free).
- **When you introduce paid features**, replace this clause with a per-transaction waiver: a checkbox at point of purchase that says "I agree to immediate access and I acknowledge I lose my right of withdrawal" — collected ALONG WITH durable-medium confirmation (an order confirmation email containing the consent text).
- Best-practice wording (do **not** ship without counsel review):
  > "By tapping 'Subscribe', you give your express prior consent for us to begin providing the [feature] immediately and you acknowledge that, by doing so, you waive your 14-day right of withdrawal under OUG 34/2014 art. 16(m)."

### Scope note for counsel
- This is a **consumer-law** question (ANPC), not a privacy question (ANSPDCP). If the engaged counsel is privacy-only, ask them whether their firm has a consumer-law colleague who can take Q1 in scope, or accept that Q1 sits outside the engagement and gets reviewed when paid features are designed.

---

## Q2 — Privacy Policy / Art. 13 + ANSPDCP transparency

**Source under review:** `04-privacy-page.tsx`.

### Twelve Art. 13 elements — present/absent

| # | Art. 13 element | Status in current draft | Severity |
|---|---|---|---|
| 1 | Identity and contact details of the controller | Partial — "Defensive Pedal" + email; no controller's full legal identity (Victor Rotariu, sole proprietor, Brașov address). Pre-incorporation status is fine but the actual natural-person controller name + jurisdiction must be stated | **Material gap** |
| 2 | DPO contact (if applicable) | Absent — should explicitly state "no DPO required at current processing scale (Art. 37 thresholds not met)" | Minor |
| 3 | Purposes of processing **and the legal basis** for each | Purposes ✓; **legal bases per processing activity ABSENT**. Privacy policy says "Why we collect" prose-only; doesn't map (account email → 6(1)(b)), (GPS → 6(1)(f)/6(1)(b)), (Sentry → 6(1)(f)), (PostHog → 6(1)(a) consent), etc. | **Material gap** |
| 4 | Where 6(1)(f) is the basis: identify the legitimate interest | Absent — must be stated for Sentry, hazards, server logs, push tokens | **Material gap** |
| 5 | Recipients / categories of recipients | Partial — Supabase, Cloud Run, Mapbox, Sentry listed; **PostHog, Open-Meteo, Resend, Expo Push, OSRM all missing** from public page | **Material gap** |
| 6 | International transfers and safeguards | **CRITICAL GAP** — Supabase US region is NOT disclosed on the public page. The DPIA acknowledges this as R7. SCCs are mentioned only in the DPIA. ANSPDCP transparency requires: which third country, which transfer mechanism (SCCs), how to obtain a copy of the safeguards, the existence/absence of an adequacy decision | **Critical gap** |
| 7 | Retention periods per category | Partial — has 90d / 24m / 45d retentions; missing: server-log 12m IP retention; missing: PostHog retention (states 7y default in the README/DPIA but not on public page); missing: Sentry retention; missing: backup retention | **Material gap** |
| 8 | Data subject rights — the eight named rights | Mentioned generically, not enumerated. Must list: access, rectification, erasure, restriction, portability, objection (esp. for 6(1)(f) bases), withdrawal of consent (where consent is the basis), right not to be subject to automated decisions | **Material gap** |
| 9 | Right to lodge complaint with supervisory authority | ✓ ANSPDCP mentioned with link | OK |
| 10 | Whether provision of data is statutory/contractual + consequences of non-provision | Absent | Minor (best to add) |
| 11 | Existence of automated decision-making / profiling under Art. 22 | Absent — DPIA says N/A but the policy must state this explicitly | Minor |
| 12 | If consent is the basis: right to withdraw consent at any time without affecting prior processing | Absent — required because PostHog consent (whether default-ON or default-OFF after fix) needs withdrawal disclosure | **Material gap** |

### Romanian-specific transparency

ANSPDCP, in its enforcement decisions and guidance (cf. the public sanction register on dataprotection.ro), routinely flags:
- Missing controller-identity in Romanian (the policy is English-only — for a Romania-launching app, a Romanian-language version is **strongly expected** by ANSPDCP, even if not strictly mandated by Art. 12 GDPR's "clear and plain language" standard for the relevant audience).
- Missing concrete recipients of personal data (a generic "we use sub-processors" is not enough; ANSPDCP wants names + roles + jurisdictions).
- Missing Schrems-II transfer disclosure post-2020.

### Retention-period defensibility (separate sub-question in Q2)

| Category | Stated retention | Defensible? | Comment |
|---|---|---|---|
| Account/profile | "While account active" | ✓ | Aligned with Art. 5(1)(e) data minimisation |
| Ride summaries | While account active | ✓ | Acceptable under contract basis 6(1)(b) |
| Raw GPS breadcrumb trails | 90 days, then truncated | ✓ | 90 days is **on the longer end** of what ANSPDCP would expect for "data minimisation" of precise location. Defensible because user can opt to keep longer **AND** because user can shorten/delete via in-app controls. Document the 90-day rationale in the DPIA explicitly (it isn't there yet) |
| Hazards | 4h–14d TTL + 45d post-expiry | ✓ | Defensible — community safety LI |
| Inactive accounts | 24 months with 23-month warning email | ✓ | Aligned with ANSPDCP positions on account dormancy. **Note:** the warning email mailer is not yet shipped (DPIA §4.1: Resend integration "logged-only"). Public privacy policy commits to this — operationalise it before launch |
| Server access logs (IPs) | 12 months | **Borderline** | 12 months is the upper-bound that's still defensible for security-LI under recent CNIL/EDPB positions. Many EU DPAs expect 6 months as the default; 12 months requires documented security-investigation reasoning. Counsel should confirm |
| Sentry crash reports | 90 days (Sentry default) | ✓ | Standard |
| PostHog product analytics | 7 years (PostHog default) | **Not defensible if default-ON; defensible if opt-in + necessity-justified** | Even with consent, 7 years is excessive for product analytics by ANSPDCP standards. Reduce to 12–24 months explicitly via PostHog project settings |
| Push tokens | Until rotation/unsubscribe | ✓ | Standard |

### Recommendation
- **Rewrite the privacy policy.** Use the Art. 13 checklist above as the structure; add a Romanian-language version; add the Schrems-II disclosure for Supabase US.
- **Reduce PostHog retention** in the PostHog project console from default 7y to 12 months (or 24 max). One config change.
- The current placeholder is fine to keep up DURING the closed test (3–12 testers) only because the testers are not the general public; before opening to general public the rewritten policy must be published.

---

## Q3 — Default-ON Sentry crash reports

**Source under review:** `06-consent-screen.tsx` lines 60–66; `02-compliance-plan.md` Item 8.

### The legal anchor for Sentry default-ON

GDPR Art. 6(1)(f) — legitimate interest — is the standard basis for crash diagnostics across the EU industry. The three-part LI test:

1. **Legitimate interest:** ✓ Operating a safe, debuggable cycling navigation app is a clear legitimate interest of the controller.
2. **Necessity:** ✓ Without crash reports, you cannot fix the kind of bugs that get a rider stranded mid-ride. Sampling, anonymisation, or telemetry-on-failure-only would be less effective.
3. **Balancing test:** With `sendDefaultPii: false` (no IP, no user-agent, no cookies, no user_id) and 90-day retention (Sentry default), the privacy impact on the data subject is **low**. The user's reasonable expectation is that a modern app reports crashes for diagnostics. The opt-out is one tap and immediately effective.

### Why this is defensible (as Sentry, not as analytics)

- Sentry does not persist a stable identifier on the user's device once `sendDefaultPii: false` is set. Therefore Law 506/2004 art. 4 / ePrivacy art. 5(3) — which governs **storage of and access to information on terminal equipment** — is NOT triggered for Sentry (the storage involved is transient session/breadcrumb state). Compare PostHog (Q4) which sets a persistent `posthog_distinct_id` cookie/storage entry — that DOES trigger ePrivacy.
- Recital 49 of GDPR explicitly contemplates LI for "ensuring network and information security" — debugging is adjacent enough that the industry has settled on this posture and DPAs have not generally challenged it.
- The CNIL "cookies and tracker" guidelines (2020, updated 2022) accept a strict-necessity carve-out for crash/error diagnostics that don't cross-reference users.

### Conditions for the LI defence to hold

1. **Document the LIA.** Romanian-qualified counsel should produce or sign off on a 1-page LIA covering the three-part test. Without a written LIA, the LI claim is harder to defend in an ANSPDCP audit.
2. **Frame the consent screen correctly.** The current screen presents Sentry as a "consent toggle" — that's actually slightly **more** protective than required, but it does muddy the legal basis. The screen should distinguish: "Crash reports — we rely on legitimate interest, but you can object" vs. "Product analytics — we ask for your consent." The current screen calls them both "consent" toggles which is technically incorrect.
3. **Disclose in the privacy policy:** "Legal basis: Art. 6(1)(f), legitimate interest in product safety and stability. You may object at any time via Profile → Privacy & analytics, with effect immediately."
4. **Keep `sendDefaultPii: false`.** If you ever flip it to `true` for any debugging session, the LI analysis must be redone (you'd be capturing IP + user-agent → personal data → balancing shifts).
5. **One-tap opt-out, immediately effective.** ✓ Already shipped (line 67–73 of `06-consent-screen.tsx`).

### Recommendation
- **Keep Sentry default-ON** with LI basis.
- **Write a 1-page LIA** and store at `docs/legal/lia-sentry.md`. (I can draft this on request — it's a 1-hour engineering task.)
- **Refine consent-screen copy** so Sentry is described as "we rely on legitimate interest" not "you consent" — this is both more legally accurate and better UX.

---

## Q4 — Default-ON PostHog product analytics

**Source under review:** Same as Q3.

### Verdict
**FLIP TO OFF before public launch.** Do not soften this. The one-line change is correct and should be in the production build that goes to the closed test in the next 14 days.

### Why default-ON for PostHog fails

#### Reason 1 — Law 506/2004 art. 4 (ePrivacy) requires PRIOR consent

Law 506/2004 art. 4(5), transposing Directive 2002/58/EC art. 5(3), prohibits the **storage of, or access to, information stored on a user's terminal equipment** unless:
- **(a)** the user has given **prior consent** based on clear and comprehensive information; or
- **(b)** the storage/access is **strictly necessary** for the provision of a service expressly requested by the user.

PostHog sets `posthog_distinct_id` and other state in the device's local storage (and in iOS keychain via `react-native-mmkv` or AsyncStorage). This is "information stored on the user's terminal equipment." Product analytics is **not** "strictly necessary for the service requested" — riders ask the app for navigation, not for the operator's product metrics.

→ Therefore PostHog's storage/access on the device requires **prior consent** under Law 506/2004.

A default-ON toggle is **not prior consent** — see Reason 2.

This applies **independently of GDPR Art. 6.** Even if you successfully argued LI under GDPR (you'd struggle), Law 506/2004 is *lex specialis* and consent is the only available basis.

#### Reason 2 — *Planet49* (CJEU C-673/17, 1 Oct 2019) — pre-ticked boxes are not consent

The CJEU held that consent under ePrivacy + GDPR requires "active behaviour with a clear view to giving consent." A pre-ticked box is not active consent. A toggle that is **on by default** is functionally equivalent to a pre-ticked box for first-time users.

ANSPDCP and other EU DPAs have consistently applied *Planet49* to mobile-app consent screens since 2020. Default-ON for non-essential analytics is the textbook fact pattern that gets fined.

#### Reason 3 — EDPB Guidelines 2/2023 on Article 5(3) of the ePrivacy Directive

(Adopted Nov 2023; remains current ANSPDCP-aligned guidance as of 2026.) The Guidelines explicitly hold that:
- "Operations that are not strictly necessary to perform the service expressly requested" need consent.
- Product analytics is named as an example of non-strictly-necessary processing.
- The "anonymity" of events does not save you — the storage/access on the device is what triggers ePrivacy, regardless of whether server-side data is anonymous.

#### Reason 4 — ANSPDCP enforcement posture

ANSPDCP has issued multiple decisions since 2021 fining controllers for analytics consent-by-default (mostly cookie-banner cases on web; the ePrivacy logic is identical for mobile). Public decisions on dataprotection.ro show fines from €3,000 to €70,000 range for SMEs.

A pre-launch app with three testers is unlikely to draw attention. But the **moment a complaint reaches ANSPDCP** (and one disgruntled user is enough), the default-ON posture is the first thing they look at, and it is the easiest possible finding for a reviewer to make.

#### Reason 5 — your own engineering position already concedes this

`02-compliance-plan.md` Item 8 lines 350–369 (per the README index) and the inline comment in `06-consent-screen.tsx` lines 47–58 both say "Counsel review recommended before production rollout." The engineering team already knows this. The DPIA flags R6 "may escalate to default OFF for PostHog depending on counsel's read."

### What "flip to OFF" actually requires

**Code:**

```diff
- const [productAnalytics, setProductAnalytics] = useState(
-   isFirstTimeConsent ? true : persistedPosthog,
- );
+ const [productAnalytics, setProductAnalytics] = useState(
+   isFirstTimeConsent ? false : persistedPosthog,
+ );
```

(Sentry stays default-ON, justified separately under Q3.)

**UX (also required):**

- Add a "Reject all" button or equivalent. Current screen has Continue acting as "accept current state." With PostHog defaulted OFF, Continue defaults to "Reject PostHog, accept Sentry" which is fine — but EDPB best practice is to also offer "Accept all" and "Reject all" with **equal visual prominence**. The footer's "Continue" button is the only CTA; consider:
  - "Accept analytics" (if user toggled PostHog ON)
  - "Continue without analytics" (if user left PostHog OFF) — same button, different label depending on toggle state
- The "Crash reports" toggle is technically not a consent toggle (it's an objection toggle under LI). Different copy: "Send anonymous crash reports — helps us fix bugs (you can turn this off)."

**Privacy policy update:**

- Privacy policy must say: "Product analytics: PostHog. Legal basis: Art. 6(1)(a) explicit consent. Off by default. You can turn it on in Profile → Privacy & analytics. Withdrawing consent does not affect the lawfulness of prior processing."

### What about the "anonymous events" mitigation in the DPIA?

The DPIA argues PostHog's anonymous-event posture is a partial mitigation. It is not a defence to the ePrivacy consent requirement. Anonymity at the SERVER is irrelevant to whether STORAGE on the device requires prior consent. Two separate questions; ePrivacy governs the device.

### Recommendation
- **Flip PostHog default to OFF** before the production build goes to the closed test. One-line code change.
- **Add a "Reject analytics" CTA equally prominent to "Accept."** ~30 minutes of UI work.
- **Reduce PostHog retention** from 7y default to 12 months (PostHog project setting).
- **Update the privacy policy** as in Q2.
- **Update the DPIA R6** — when default flips to OFF, residual risk drops from "Limited (pending counsel)" to "Negligible."

---

## Q5 — DPIA completeness and Art. 36(1) prior-consultation determination

**Source under review:** `01-dpia.md`.

### Strengths
- Three EDPB DPIA-required criteria correctly identified.
- Risk catalogue is structured (R1–R9) with likelihood × severity → risk level.
- Mitigations are specific and traceable to code (RLS policies, sharePrivacy.ts, retention RPCs).
- Clear acknowledgement that R6 is counsel-gated.
- Source-of-truth pointers in Appendix A.

### Risks I'd add (R10–R13)

#### R10 — Children's data / age-gate verification

- **Threat:** Romanian Law 190/2018 art. 8 sets the digital consent age at 16 (the GDPR maximum permitted by Art. 8 derogation). The Terms state "you must be at least 16" but the app has **no age-gate verification mechanism**. A 14-year-old can sign up using a parent's email or their own.
- **Likelihood:** Possible (cycling apps are popular with teenagers).
- **Severity:** Significant (children's data has special protections).
- **Mitigation options:** (a) self-declaration age check at signup with the disclosure that under-16s require parental consent, (b) reject signup if declared age < 16, (c) document the limitation and rely on the Terms.
- **Counsel call:** how robust must the age-gate be? Self-declaration is widely accepted at this scale. Robust verification (e.g., age estimation via face scan) is disproportionate.

#### R11 — DSAR fulfillment capacity

- **Threat:** Art. 15 (access), Art. 20 (portability) are admitted as "manual via email" + "export endpoint not yet implemented." If volume rises beyond closed test, the 30-day deadline (Art. 12(3)) becomes infeasible. ANSPDCP fines for missed-deadline DSARs are routine.
- **Likelihood:** Possible, rises with user count.
- **Severity:** Limited (regulatory action).
- **Mitigation:** Build a self-serve export endpoint before scaling beyond ~1,000 users. The compliance plan flags this; promote it from "post-launch" to "pre-public-launch."

#### R12 — Breach notification readiness

- **Threat:** GDPR Art. 33 requires notification to ANSPDCP within 72 hours of becoming aware of a personal data breach; Art. 34 requires notification to data subjects without undue delay if high risk. There is **no documented breach response plan, no breach register, no defined 72-hour escalation path**.
- **Likelihood:** Rare (small attack surface), but if it happens, the lack of a plan extends the 72-hour clock to "what does Victor do at 2 a.m. on a Saturday."
- **Severity:** Significant (regulatory + reputational).
- **Mitigation:** 1-page breach response runbook covering: detection sources, severity triage, 72-hour escalation, ANSPDCP submission template, breach register location.

#### R13 — Sub-processor DPA register

- **Threat:** Each processor (Supabase, Sentry, PostHog, Mapbox, Open-Meteo, Resend, Expo, Cloud Run, OSRM-self-hosted-doesn't-need-one) requires an Art. 28 DPA. **The DPIA does not list which DPAs are signed and where.** Without a DPA register, a regulator cannot verify Art. 28 compliance.
- **Likelihood:** Likely to be flagged in any audit.
- **Severity:** Limited (paperwork; ANSPDCP would normally allow remediation).
- **Mitigation:** 1-page DPA register at `docs/legal/dpa-register.md` listing each processor, contract URL/PDF location, transfer mechanism (SCC vs adequacy), date signed.

### Risks I'd re-rate

#### R5 — plaintext OSRM (re-rate from "Limited" to "Medium" residual until item-6-long ships)

The DPIA rates likelihood as "Rare." For a user on **public Wi-Fi** (cafés, coworking, hotel networks — common for cyclists), the likelihood of a network-path adversary observing plaintext route requests is "Possible," not "Rare." The argument that "Mapbox already sees the route via TLS, so OSRM adds little" is partially valid — but it doesn't extend to non-TLS network observers who weren't on Mapbox's path. Re-rate: Likelihood Possible, Severity Limited → Risk **Medium** until TLS lands.

This is not blocking for closed-test launch, but it is blocking for production with non-Romanian users (e.g., expanding to Germany on public Wi-Fi). Tighten the timeline on item 6 long-term.

#### R7 — Supabase US region (the DPIA's biggest weak spot)

The DPIA mitigation says "Privacy policy discloses US region. Supabase contract includes Standard Contractual Clauses." Post-Schrems II (CJEU C-311/18, 16 July 2020), **SCCs alone are insufficient**. The controller must also:
- Conduct a **Transfer Impact Assessment** documenting whether the legal regime of the destination country (US) provides essentially equivalent protection.
- Identify and implement **supplementary measures** to address gaps (typical: encryption at rest with controller-held keys; pseudonymisation in transit; explicit US-government-access response procedures).

The DPIA references neither. The privacy policy doesn't disclose the transfer at all (Q2 finding 6).

**This is fixable in two ways:**
1. **Document a TIA** (template available from EDPB Recommendations 01/2020). For a Romania-only app at closed-test scale, the TIA can be lightweight, but it must exist.
2. **Migrate to Supabase EU region** — then this risk drops to negligible. The DPIA flags this as a planned post-launch action; consider promoting it to pre-public-launch given the closed test is small enough that migration is tractable.

If you can migrate to EU before opening to general public, do that. It's the cleanest mitigation and removes a regulator's easiest finding.

#### R6 — depends on Q4

- If Q4 is resolved (PostHog flipped to OFF): R6 residual drops to **Negligible**.
- If Q4 is unresolved (PostHog stays default-ON): R6 residual is **High** (Likely × Limited where the impact is regulatory action against the controller; "Limited" understates this — re-rate Severity to Significant given ANSPDCP's published willingness to fine for this exact pattern). High residual → **Art. 36(1) prior consultation IS required.**

### Art. 36(1) determination

The DPIA's bottom-line conclusion ("after mitigations, no residual risk is rated High → Art. 36(1) prior consultation is not required") is **correct ONLY IF**:
1. Q4 is resolved (PostHog → default-OFF).
2. R7 is mitigated either by a documented TIA or EU migration before public launch.
3. R10–R13 are addressed.
4. R5 mitigation timeline is tightened (TLS in front of OSRM before non-Romanian launch).

If Q4 is not resolved, prior consultation IS required. **The simplest path is: flip PostHog → OFF. The Art. 36(1) question then resolves cleanly.**

### Recommendation
- Add R10–R13.
- Re-rate R5 honestly.
- Document TIA for R7 (or commit to EU migration before public).
- Counsel signs off on the Art. 36(1) determination.
- The empty sign-off block at the end gets filled.

---

## Q6 — Art. 17 deletion flow sufficiency

**Source under review:** `05-account-deletion-page.tsx`; `02-compliance-plan.md` Item 1.

### What's right
- **Two paths**: in-app immediate + web/email fallback. Meets Play Store requirement and Art. 17 best practice.
- **Cascade FK deletion** from auth.users → all tables. Architecturally clean, no orphan rows.
- **Clear retention exceptions** documented on the public page (server logs, validated hazards, aggregate stats).
- **No dark patterns**: confirmation text "DELETE" is appropriate friction, not blocking friction.
- **30-day SLA** for email path is within Art. 12(3)'s 1-month limit.
- **ANSPDCP complaint route** stated.

### What needs fixing

#### Gap 1 — Backup retention not disclosed
- Supabase has automated backups (Point-in-Time Recovery). Deleted user data persists in backups for whatever the project's PITR window is (typically 7 days on the free tier, longer on paid).
- Privacy policy / deletion page must disclose: "Your data is removed from our live database immediately. Backups taken before your deletion may retain a copy for up to [N] days; if we restore from a backup we re-apply your deletion."
- This is a standard Schrems-II-aware disclosure. Do not omit it.

#### Gap 2 — Art. 17(3)(e) basis for IP-log retention
- The deletion page states server logs are kept up to 12 months under "GDPR Art. 6(1)(f), legitimate interest." Correct as far as collection.
- For the **deletion right exception**, the proper basis is **Art. 17(3)(e)** (necessary for establishment, exercise or defence of legal claims) or Art. 17(3)(b) (compliance with legal obligation, e.g., security incident audit trail).
- Recommend the page say: "Server access logs (IP + timestamp): retained up to 12 months for security audit purposes (GDPR Art. 6(1)(f), legitimate interest in service security). When you request deletion, these logs persist until their normal expiry under Art. 17(3)(e), the right of erasure exception for establishment, exercise or defence of legal claims."

#### Gap 3 — Hazard de-identification methodology
- The page says validated hazards "remain on the map without your username." That's username-stripping, but the hazard's location + timestamp + description may still be linkable to the original poster if that user has shared other content with overlapping context.
- Counsel call: is username-stripping enough for "anonymisation" (Recital 26) or only for "pseudonymisation" (which doesn't satisfy Art. 17)?
- Industry-aligned answer: for hazards in a community-feed context with location + time + free-text description, this is closer to **pseudonymisation** than anonymisation. To be safely anonymous, you'd need to also coarsen location (round to 100m), drop the timestamp to date-only, and ensure description doesn't contain identifying detail.
- Recommendation: either tighten the de-identification (coarsen location/time and run a content scan for self-identifying language in descriptions) and call it anonymisation; OR rename it "we retain de-identified hazard reports — the username is removed but the report itself is kept on the map for community safety, on the legitimate-interest basis. You can request full removal of any specific hazard you posted."

#### Gap 4 — Email-flow identity verification process is undocumented
- "We will verify ownership of the account" — what does "verify" mean? Sending a confirmation link to the registered email? Asking for trip-history details only the account holder would know? Both are valid; pick one and document.
- Without documented verification, you risk either (a) deleting the wrong account on a false request, or (b) demanding excessive verification (Art. 12(6) limits the controller to "reasonable" verification).
- Recommendation: state on the page: "We verify by sending a confirmation link to the registered email address. Once you confirm, we complete the deletion within 5 business days."

#### Aggregate stats retention — is it actually anonymous?

- "CO₂ totals, microlives tied to past usage" — the question is whether retained values can be re-linked to a deleted user.
- If the aggregates are stored as **per-neighborhood-per-day totals with no foreign key to user_id**, that's anonymous (Recital 26 — irreversibly de-identified). ✓
- If they're stored as **per-user-anonymous-id totals** (where the anonymous ID is a hash of user_id), that's **pseudonymisation**, not anonymisation, and the hashed ID could in principle be linked back via brute force or via the original user_id if it were ever leaked. Problematic.
- Verify which one Defensive Pedal actually does. If it's the second, either delete or fully anonymise on Art. 17 request (collapse user-anonymous-id rows into per-day totals).

### Recommendation
- The deletion flow itself is sound. Four documentation gaps (backup retention, 17(3)(e) basis, hazard de-id methodology, verification process) — easy fixes.
- Verify the aggregate-stats storage architecture matches "per-neighborhood-per-day totals" not "per-user-anonymous-id totals." If the latter, this is a real Art. 17 problem and you need to coarsen on deletion.

---

## Q7 — DSA Art. 16 + moderation runbook

**Source under review:** `02-compliance-plan.md` Item 7 (per README index).

### What you have
- Two-layer auto-filter (write-time + 15-min sweep cron).
- Block + report flows on every UGC surface.
- Per-user rate limits (3 comments/15min, 5 reports/10min, 20 blocks/hour).
- Cloud Run kill-switch (`COMMENTS_ENABLED=false`).
- 24h SLA for illegal content; 48h for other policy violations.
- DSA Art. 16 documented.

### What DSA actually requires

DSA Art. 16 covers notice-and-action mechanism for hosting services. Key requirements:

| DSA requirement | Defensive Pedal status |
|---|---|
| Easily accessible notice mechanism (Art. 16(1)) | ✓ in-app report flow |
| Notices "sufficiently precise and adequately substantiated" (Art. 16(2)) | ✓ implied by report flow design |
| Confirmation of receipt to notifier (Art. 16(5)) | **Verify** — does the report flow send acknowledgement? |
| Reasoned decision communicated to notifier (Art. 16(5)) | **Likely gap** — does the notifier learn whether action was taken? |
| Information about notifier's right to redress (Art. 16(5)) | **Likely gap** |
| Diligent, non-arbitrary, objective decisions (Art. 16(6)) | ✓ rule-based + escalation path |

**Beyond Art. 16, DSA also requires (for all online platforms regardless of size, except micro/small enterprise carve-out):**

| DSA article | Requirement | Defensive Pedal status |
|---|---|---|
| Art. 11 | Single point of contact for authorities | **Probable gap** — confirm published |
| Art. 12 | Single point of contact for users (electronic) | ✓ legal@/privacy@ — confirm published |
| Art. 14 | Terms and conditions transparency | ✓ ToS exists |
| Art. 16 | Notice and action mechanism | Mostly ✓ (gaps above) |
| Art. 17 | Statement of reasons (to the affected user when content is removed) | **Probable gap** — does the user whose content is removed get a reasoned notice? |
| Art. 20 | Internal complaint-handling system | **Probable gap** — can a user appeal a content removal decision? |
| Art. 24 | Annual transparency report | Required at scale; small platforms have lighter obligations. Confirm the threshold |

### Micro-/small-enterprise carve-out

DSA Art. 19 carves out micro and small enterprises (per Recommendation 2003/361/EC: <50 employees AND ≤€10M turnover). Defensive Pedal as a sole proprietorship today clearly qualifies. The carve-out exempts from Art. 19 (trusted flaggers), Art. 20–22, Art. 24, Art. 25 obligations — but Art. 11, 12, 14, 16 (the basics) **still apply**.

### Enforcement note (for counsel scoping)

DSA enforcement in Romania is by the **Digital Services Coordinator** = ANCOM (the communications regulator), not ANSPDCP. The privacy lawyer engaged for this package may not be the right person to confirm DSA-specific points. Either:
- Ask whether their firm has a DSA practitioner who can take Q7;
- Or accept Q7 sits outside privacy scope.

### Recommendation
- Before public launch, confirm: notifier acknowledgement, notifier reasoned decision, user statement-of-reasons on content removal, internal complaint mechanism, single points of contact (Art. 11 + Art. 12).
- Add a brief "DSA compliance" section to the moderation runbook mapping each obligation to the operational mechanism.

---

## Counsel-engagement practicalities (your aside on fixed-fee vs hourly)

Customary in Romania for this kind of scoped-review package:

- **Fixed fee, four-artefact scope, ~6 hours of counsel time:** typically €1,200–€2,500 + VAT in Bucharest/Cluj for a reputable boutique privacy firm; €600–€1,200 with an early-career privacy specialist.
- **Hourly with cap:** €150–€350/hour for partner-level; €80–€150 for senior associate. Six-hour cap = €900–€2,100 partner / €480–€900 associate.
- **Best-fit profile:** boutique privacy firm or a TMT (technology-media-telecom) practice within a mid-size Romanian firm. Big-four legal arms also do this; their fixed fees are often higher.
- **What to ask for in scope:** "Written sign-off or remediation guidance on (a) the DPIA, (b) the Privacy Policy, (c) the Terms of Service incl. OUG 34/2014 wording, (d) the consent-screen default-on posture; with specific yes/no/remediate answers to the 7 questions in the README."
- **What to NOT include:** general compliance opinion, contract drafting beyond the four artefacts, tax/corporate structuring, IP. Keep the engagement letter narrow.
- **Privilege**: in Romania, attorney-client privilege under Law 51/1995 is solid for retained counsel; confirm the engagement letter covers privilege and that Q1 (consumer law) is either in scope or explicitly out.
- **Add a deliverable clause:** a 2-page memo summarising findings + a redline of the privacy policy + Terms.

---

## Approvals needed before public launch

| # | Owner | What | Status |
|---|---|---|---|
| 1 | Romanian privacy counsel | Sign-off on DPIA, Privacy Policy, ToS, default-OFF PostHog decision (or contrary ruling) | Pending engagement |
| 2 | Engineering (Victor) | Flip PostHog default to OFF — `06-consent-screen.tsx` line 65 | Pending counsel sign-off (but recommended action regardless) |
| 3 | Engineering (Victor) | Document LIA for Sentry — `docs/legal/lia-sentry.md` | Not started |
| 4 | Engineering (Victor) | Document TIA for Supabase US — `docs/legal/tia-supabase-us.md` (or migrate to EU region) | Not started |
| 5 | Engineering (Victor) | Add R10–R13 to DPIA; re-rate R5 and R7 | Not started |
| 6 | Engineering (Victor) | DPA register at `docs/legal/dpa-register.md` | Not started |
| 7 | Engineering (Victor) | Breach response runbook | Not started |
| 8 | Engineering (Victor) | Confirm DSA Art. 16(5) notifier feedback + Art. 17 statement of reasons + Art. 20 complaint flow | Not started |
| 9 | Counsel + Victor | Sign DPIA back-page block | Pending |
| 10 | Engineering (Victor) | Reduce PostHog retention from 7y default to 12mo via console | 5 minutes |

---

## Where outside counsel review is essential vs nice-to-have

**Essential:**
- Q2 — Privacy Policy rewrite needs Romanian-qualified counsel; lay drafting won't satisfy ANSPDCP transparency.
- Q4 — Need definitive Romanian-jurisdiction ruling on PostHog default-ON. (My read is "flip" with high confidence, but formal sign-off is what closes the audit risk.)
- Q5 — DPIA sign-off is the document that ANSPDCP would request first in any inquiry; needs counsel signature on the back page.

**Nice-to-have:**
- Q3 — Sentry LI defence is industry-settled; counsel review is confirmation rather than diagnosis.
- Q6 — Art. 17 deletion flow is mostly fine; counsel review for the four documentation gaps.
- Q7 — DSA points may be better addressed by a DSA-specialist rather than a privacy specialist.

**Out of scope for privacy counsel:**
- Q1 — OUG 34/2014 is consumer-protection law (ANPC), not privacy. Either expand scope or punt to a separate consumer-law review when paid features are introduced.

---

*End of pre-counsel compliance check.*
