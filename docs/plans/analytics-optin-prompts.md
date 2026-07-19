# Product Analytics Opt-In Prompts — 3 contextual asks

> ⚠️ **Superseded in practice 2026-07-19** (PostHog default flipped ON —
> controller override, commit `a01aadb`, session 95b). These prompts no
> longer have an acquisition role: new installs start with analytics ON, and
> the gating lib gained a `hasExplicitChoice` gate that retires ALL prompts
> for anyone with an explicit Settings choice — under default-ON, analytics
> OFF means the user declined, and a decliner is never re-asked. The
> `AnalyticsOptInCard` + `analytics-optin.ts` code remains shipped but is
> expected to be dormant; if it ever fires (edge states), every anti-nagging
> cap below still binds. Kept as the design record and in case the default
> reverts after the outstanding ANSPDCP/ePrivacy review.

**Date:** 2026-07-16 · Companion to `consent-screen-simplification.md` (ship that first — these prompts replace the onboarding toggle as PostHog's acquisition surface).

**Format decision: in-app cards, NOT push/local notifications.** An OS notification asking users to change a privacy setting converts terribly, reads as spam, and burns notification goodwill needed for the activation ladder. Consent asks work when they ride an in-app moment of goodwill. All three below are inline cards using the `ReviewPromptCard` structural pattern (never blocking modals, never stacked over celebration overlays, never during `NAVIGATING`).

**Anti-nagging rules (EDPB dark-pattern guidance — repeated consent asks count as nagging):**
- Lifetime cap: **3 asks total** across all three prompts combined.
- Any dismissal → that prompt never shows again; **2 dismissals anywhere → all prompts off forever**.
- Minimum 14 days between any two asks. Never in the same session as the SaveRideCard (WP3) or ReviewPromptCard — priority order when eligible simultaneously: **SaveRideCard > ReviewPromptCard > AnalyticsOptInCard**.
- Toggle ON at any point (including via Settings) → all prompts permanently retired.
- Copy must stay honest: analytics is optional, anonymous, no GPS — never imply features depend on it.

**Shared component spec — new organism `AnalyticsOptInCard`:**
- `Card` atom base, `radii.lg`, standard `shadows`, full-width within screen padding, `space[4]` internal padding.
- Top-right ✕ (`IconButton` sm, `close-outline`, 44pt hit area) → records dismissal.
- Left: `Mascot` pose per prompt below, `width={56}` (respects the built-in NAVIGATING/showMascot quarantine).
- Title `textBase` bold `colors.textPrimary`; body `textSm` `colors.textSecondary`, max 3 lines.
- Primary `Button` size sm, label per prompt → calls `setAnalyticsConsent({ ...current, posthog: true })`, fires success `Toast` (EN `Thanks — you're shaping the roadmap now.` / RO `Mulțumim — de acum contribui la planurile noastre.` / ES `Gracias — ahora ayudas a definir el rumbo.`), card animates out (`FadeSlideIn` reverse, respects `useReducedMotion`).
- Tertiary text link `No thanks` / RO `Nu, mulțumesc` / ES `No, gracias` (`textSm`, `colors.textSecondary`) → same as ✕.
- Footer microline `textXs` muted: EN `Anonymous. No GPS tracks. Off anytime in Profile › Privacy.` RO `Anonim. Fără trasee GPS. Se poate opri oricând din Profil › Confidențialitate.` ES `Anónimo. Sin rutas GPS. Desactívalo cuando quieras en Perfil › Privacidad.`
- State in Zustand (persisted, user-scoped, cleared by `resetUserScopedState`): `analyticsPrompt: { asksShown: string[]; dismissCount: number; lastAskAt: string | null }`.
- Pure gating fn `shouldShowAnalyticsPrompt(promptId, state, now)` in a lib file + unit tests (caps, spacing, retirement, priority).

---

## Prompt 1 — "Help pick what we build" (post-second-ride)

- **Trigger:** impact summary screen (`feedback.tsx`), `completedRideCount === 2`, PostHog off, gates pass. (Ride 1 belongs to SaveRideCard for anonymous users; ride 2 catches both anonymous and registered.)
- **Placement:** below the XP/badges sections, above the final continue button — same slot family as ReviewPromptCard.
- **Mascot:** `study`.
- **Title:** EN `Help decide what Pedal builds next` · RO `Ajută-l pe Pedal să aleagă ce construim` · ES `Ayuda a decidir qué construimos`
- **Body:** EN `Two rides in — you clearly get it. Share anonymous usage stats and the features you use most get built first.` · RO `Două ture deja — clar te-ai prins. Trimite statistici anonime de utilizare și funcțiile pe care le folosești ajung primele pe listă.` · ES `Dos rutas ya — está claro que le pillas el punto. Comparte estadísticas anónimas y las funciones que más usas se construyen primero.`
- **CTA:** EN `Count me in` · RO `Mă bag` · ES `Cuenta conmigo`

## Prompt 2 — "You just helped the community" (post-first-hazard-report)

- **Trigger:** first successful hazard report (`hazard_report` mutation resolved — hook into the existing success path on `route-planning.tsx` / navigation report flow; show on the NEXT screen render, never mid-map-interaction), PostHog off, gates pass.
- **Placement:** toast-adjacent slot on route-planning after the hazard-submitted confirmation clears; if layout is contested, defer to the next `feedback.tsx` visit instead (implementer's choice, note in progress.md).
- **Mascot:** `cheer`.
- **Title:** EN `You just made the map safer` · RO `Tocmai ai făcut harta mai sigură` · ES `Acabas de hacer el mapa más seguro`
- **Body:** EN `That report helps riders nearby. Want to help us the same way? Anonymous usage stats show us what's working.` · RO `Raportul tău ajută bicicliștii din zonă. Vrei să ne ajuți și pe noi la fel? Statisticile anonime ne arată ce funcționează.` · ES `Ese aviso ayuda a ciclistas cercanos. ¿Nos ayudas igual? Las estadísticas anónimas nos muestran qué funciona.`
- **CTA:** EN `Share anonymous stats` · RO `Trimite statistici anonime` · ES `Compartir estadísticas anónimas`

## Prompt 3 — "You like data, we like data" (Impact Dashboard visit)

- **Trigger:** third-or-later visit to `impact-dashboard.tsx` (visit counter in the same store slice), PostHog off, gates pass. Rationale: someone who keeps checking their stats has revealed they value measurement — the most receptive audience for an analytics pitch.
- **Placement:** bottom of the dashboard scroll content, after Recent Badges.
- **Mascot:** `binoculars`.
- **Title:** EN `You track your stats. Let us track ours?` · RO `Tu îți urmărești statisticile. Ne lași și pe noi?` · ES `Tú sigues tus estadísticas. ¿Nos dejas seguir las nuestras?`
- **Body:** EN `Anonymous usage events tell us which safety features actually get used — so we double down on the right ones.` · RO `Evenimentele anonime de utilizare ne spun ce funcții de siguranță se folosesc cu adevărat — ca să investim în cele care contează.` · ES `Los eventos anónimos de uso nos dicen qué funciones de seguridad se usan de verdad — para apostar por las correctas.`
- **CTA:** EN `Turn on analytics` · RO `Activează analizele` · ES `Activar analíticas`

---

## Measurement
Track opt-in rate per prompt via the consent flag itself: on toggle-ON, `capturedAt` is stamped and the store records which prompt (if any) was the source (`analyticsPrompt.convertedBy: promptId | 'settings' | null`). Compare `posthog: true` share of active users before/after ship via a Supabase-free check — it's client state, so read via a Diagnostics counter or (ironically) the first PostHog event's `converted_by` property.

## Claude Code prompt (paste)
> Read `.claude/CLAUDE.md` + `.claude/error-log.md`. Implement `docs/plans/analytics-optin-prompts.md` exactly: new `AnalyticsOptInCard` organism per the shared spec, pure gating logic with unit tests, the three trigger integrations, store slice + persist wiring (user-scoped, reset in `resetUserScopedState`), i18n keys in EN/RO/ES, priority rules vs SaveRideCard/ReviewPromptCard enforced in one shared arbitration helper. `npm run check:bundle` 200 + `npm run typecheck` 0 before done; update `progress.md`.
