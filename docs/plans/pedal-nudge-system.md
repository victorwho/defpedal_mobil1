# Pedal Nudge System — Plan

> Branch: `worktree-pedal-nudge-system` · Worktree: `.claude/worktrees/pedal-nudge-system`
> Status: SPEC LOCKED — awaiting user approval before implementation
> Authored: 2026-05-25

A Duolingo-grade streak + notification system, voiced by Pedal the dog mascot, designed to drive habit formation in a safety-positioned cycling app without compromising the safety floor.

---

## 1. Purpose & Strategic Frame

Defensive Pedal already has the substrate for a high-quality retention layer:

- A working streak engine (4 AM local cutoff, 5 qualifying actions, weekly reset)
- A 19-pose Pedal mascot with built-in safety quarantine during `NAVIGATING`
- A server-side push pipeline (`services/mobile-api/src/lib/push.ts`) with per-user prefs, quiet hours, daily budget
- A local-scheduling reference implementation (the 8:30 AM weather ping with 40 witty titles)
- An overlay-manager pattern for tap → in-app handoff (transient store field + manager component)

What's missing is the **orchestration layer** that turns those pieces into a habit-forming retention engine. This plan defines that layer.

**Brand constraint that overrides every retention lever:** Defensive Pedal is a safety product. The system NEVER nudges a ride when conditions are unsafe, and NEVER manipulates a rider into an action that could put them at risk. Streak loss is acceptable; safety regret is not.

---

## 2. Locked Specification

### 2.1 Voice & Tone

| Decision | Locked value |
|---|---|
| Tone register | **Adaptive** — friendly default, dramatic escalation only for streaks ≥7 days at risk + milestones |
| Voice charter | **Witty/sarcastic**, extending the existing 40 weather-ping titles into the canonical Pedal voice |
| Personalization | **Name + learned ride pattern + city** in every message that can carry context |
| Locales at launch | **EN + RO** together (both already exist in the app's i18n stack) |
| Voice default for new users | **Sassy ON**, profile toggle to soften |
| Per-trigger mascot pose | **One Pedal pose per trigger** in the in-app overlay |

### 2.2 Streak Mechanics

| Decision | Locked value |
|---|---|
| What counts as a day | Existing 5-qualifying-action engine (no change) |
| Loss policy | **Hard reset to 0** — no freezes, no grace, no repair |
| First risk-eligibility day | Day 4 (3-day streak at risk → mild reminder) |
| Dramatic-mode threshold | Streak ≥7 at risk |
| Post-loss recovery | **Apology + 3-day mini-streak challenge** |
| Milestone ladder | **7 / 21 / 30 / 42 / 88 / 100 / 365** (standard + Pedal-themed quirks) |

### 2.3 Triggers (all 8 in v1.0)

| # | Trigger | Priority | Channel |
|---|---|---|---|
| 1 | Post-ride celebration | P0 | Local push, fires from mobile API or client immediately on save |
| 2 | Post-hazard thank-you | P0 | Local push, fires immediate |
| 3 | Streak-at-risk reminder | P1 if streak ≥7, P3 if 4–6 | Server cron, adaptive timing |
| 4 | Daily ride reminder | P2 | Server cron, learned typical ride time -1h |
| 5 | Milestone celebration | P0 | Server cron, triggers on streak-day crossing milestone |
| 6 | Badge proximity | P2 | Server cron, when within 1 unit of unlocking |
| 7 | Lapsed re-engagement | P3 | Server cron, day 3 / 7 / 14 / 30 since last open |
| 8 | Friend / community signal | P3 | Server cron, neighborhood streak leaderboard + CO₂ rank changes |

### 2.4 Governance

| Decision | Locked value |
|---|---|
| Daily push cap | **2 per user** (weather 8:30 = slot 1; nudge = slot 2). P0 events bypass the cap. |
| Quiet hours | User-configurable, default **22:00–07:00** local |
| Safety floor | **No pushes during bad weather** (storm / snow / extreme cold / strong wind / heavy or moderate rain / freezing / windy) **AND no pushes after sunset**. Locally evaluated against the same forecast helpers as `daily-weather-messages.ts`. |
| Anonymous users | **No streak, no nudges.** Sign-up unlocks the system (becomes a conversion lever). |
| Auto-mute on crashes | **Deferred** — ship a single feature-flag kill-switch; add Sentry release-health hook in v1.1. |
| App-icon badge dot | **Unused** in v1.0. Decision is reversible. |

### 2.5 Architecture

| Decision | Locked value |
|---|---|
| Priority-queue location | **Server-side** Cloud Run cron (Hybrid for P0 events fired by the mobile API on ride/hazard save) |
| Queue cadence | `nudges-evaluate-cron` runs **every 30 min**, evaluates users whose local evening window is currently open |
| Scope | **v1.0 = all 4 trigger bundles**, complete mechanics, both locales |
| Telemetry | **Funnel + 2-h action attribution** (sent → delivered → tapped → action-completed-within-2h) + 3-variant copy A/B per trigger |
| Timeline | **6–8 weeks**, 6 phases |

### 2.6 Race-condition policy

User qualifies for streak AFTER an at-risk push fires but BEFORE they see it. **Accept the rare miss.** Estimated ≤2% of pushes. Telemetry will surface this if it becomes a real problem.

---

## 3. Visual System

### 3.1 Streak surfaces (where the number lives in-app)

1. **Impact Dashboard `StreakCard`** — primary, full-width, refreshed for v1.0 (existing organism enlarged + animated)
2. **Post-ride impact summary** — streak +1 animation on save (extends existing impact-summary card)
3. NOT on route-planning top-right — keeps the safety screen uncluttered

### 3.2 Flame tiers (color + Pedal pose)

| Streak day | Flame color | Pedal pose | Notes |
|---|---|---|---|
| 1–6 | Yellow | `stand` | Default new-rider tier |
| 7–20 | Orange | `cheer` | First milestone unlocked |
| 21–41 | Red | `ride` | Pedal-theme: "commute habit" |
| 42–87 | Blue | `climb` | Pedal-theme: "half-marathon riding" |
| 88–99 | Purple | `trophy` | Pedal-theme: "binary year" |
| 100–364 | Gold | `podium` | Centennial tier |
| 365+ | Rainbow | `legend` | Annual badge |

Visual cross-references:
- Flame asset: new SVG with color variants, lives at `apps/mobile/assets/streak-flame/`
- Pedal poses already exist in `apps/mobile/assets/mascot/` per session-58 mascot work
- Pose-to-tier mapping defined in `packages/core/src/streakTiers.ts` (new pure module)

### 3.3 Sharing

**Rally-friends-when-at-risk** pattern only. No vanity sharing.

- When streak is at risk on day ≥7, in-app overlay (on push tap) shows: "Want a friend to ride with you?" → opens system share sheet with pre-filled invite text.
- Share text includes the Play Store URL (per CLAUDE.md rule about `PLAY_STORE_URL`).
- Image share card is OPTIONAL for v1 — text-share is sufficient. May add a small render in v1.1 if telemetry shows demand.

### 3.4 Post-loss recovery flow

When the daily cron detects a streak just broke (was X yesterday, 0 today):

1. **Day +1 push** (deferred 24h to avoid same-day pile-on with the streak-loss event itself): "Pedal misses you. Your X-day streak was incredible. Want a soft restart?"
2. **In-app overlay on tap:** `MiniStreakChallengeOverlay` — Pedal in `ride-point` pose, copy: "3 days, no pressure. Get the engine warm again." [Accept / Maybe later]
3. **If accepted:** A `mini_streak_active` flag in `streakState`. UI shows a 3-day progress dots instead of flame until they hit 3, then transitions back to the normal flame at the same number.
4. **If declined:** Flag suppressed; next streak grows normally from 0.

---

## 4. Server Architecture

### 4.1 New tables

```sql
-- New: persistent log of every nudge sent, with attribution columns
CREATE TABLE nudge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_id text NOT NULL,            -- e.g. 'streak_at_risk_dramatic'
  variant_id text NOT NULL,            -- copy variant for A/B
  priority smallint NOT NULL,
  scheduled_at timestamptz NOT NULL,   -- when cron decided to send
  sent_at timestamptz,                 -- when Expo Push accepted it
  delivered_at timestamptz,            -- if/when Expo confirms delivery
  tapped_at timestamptz,               -- when user opens via tap
  action_completed_at timestamptz,     -- did rider take the intended action within 2h
  outcome text,                        -- 'sent' | 'suppressed_weather' | 'suppressed_quiet_hours' | 'suppressed_cap' | 'cancelled_qualified'
  context jsonb,                       -- {city, ride_pattern_hour, streak_count, ...}
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX nudge_log_user_time_idx ON nudge_log (user_id, scheduled_at DESC);
CREATE INDEX nudge_log_trigger_idx ON nudge_log (trigger_id, scheduled_at DESC);

-- New: learned ride pattern per user (for adaptive timing)
CREATE TABLE user_ride_pattern (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  typical_start_hour smallint,         -- 0-23 in user's local TZ
  confidence numeric(3,2),             -- 0.00-1.00 based on sample size
  sample_count integer NOT NULL DEFAULT 0,
  last_computed_at timestamptz NOT NULL DEFAULT now()
);
```

RLS:
- `nudge_log`: `SELECT` own rows, no client `INSERT/UPDATE/DELETE` (service role only)
- `user_ride_pattern`: `SELECT` own rows, no client mutations

### 4.2 New endpoints

| Endpoint | Caller | Purpose |
|---|---|---|
| `POST /v1/nudges/evaluate` | Cron only (Bearer `CRON_SECRET`) | Walks all eligible users, evaluates queue, sends slot-2 pushes |
| `POST /v1/nudges/event` | Mobile API internal call | Real-time P0 trigger (post-ride / post-hazard) — fires immediate push if user not muted |
| `POST /v1/nudges/telemetry` | Mobile app | Records `tapped_at` + scans `trips` / `hazards` to set `action_completed_at` if within 2h |
| `POST /v1/nudges/recompute-pattern` | Cron, daily 4 AM UTC | Recomputes `user_ride_pattern` from last 14 days of `trip_tracks` |

All endpoints use existing `requireFullUser` auth (except cron). Full Fastify request + response JSON Schemas per error-log #9.

### 4.3 Cron schedule

- `nudges-evaluate-cron` — every 30 min, Europe/Bucharest (Cloud Scheduler)
- `nudges-pattern-cron` — daily 04:00 Europe/Bucharest

### 4.4 Priority queue algorithm (single-user evaluation)

```
For user U at evaluation time T (in U's local TZ):
  1. If U is anonymous → SKIP
  2. If U.quiet_hours covers T → SKIP
  3. If today.push_count >= 2 AND no P0 pending → SKIP
  4. If weather forecast for U.city at T+1h is "bad" → SKIP
  5. If sunset for U.lat/lon has passed AND trigger isn't milestone/lapsed → SKIP
  6. Compute eligible triggers in priority order:
       P0: post-ride (already fired by /event), milestone, post-hazard
       P1: streak-at-risk if streak >=7 AND not qualified today AND T near U.ride_pattern_hour
       P2: badge-proximity, daily-ride-reminder
       P3: lapsed (3/7/14/30 since last_opened_at), social, streak-at-risk if streak 4-6
  7. Pick highest-priority eligible trigger
  8. Pick a random variant_id from that trigger's 3 copy variants
  9. Render message via packages/core/src/pedalVoice.ts with U's context
 10. Send via Expo Push API
 11. Log to nudge_log
```

### 4.5 Mobile API integration (P0 path)

When `POST /v1/feedback` (ride save) succeeds:
- Mobile API extracts `tripId`, `userId`, `streakAfter`, `xpEarned`, `badgesEarned`
- Calls internal `nudgesService.fireEvent({ userId, trigger: 'post_ride_celebration', context })` (non-blocking, fire-and-forget)
- Same path for `POST /v1/hazards` (calls with `'post_hazard_thanks'`)

This sidesteps cron latency for P0 events — the user gets push within seconds of save.

---

## 5. Mobile Architecture

### 5.1 New code

| Module | Purpose |
|---|---|
| `packages/core/src/pedalVoice.ts` | Pure helper: `pickMessage(triggerId, context, locale, riderName)` → `{ title, body }` |
| `packages/core/src/streakTiers.ts` | Pure helper: `getTierForStreak(days)` → `{ tier, flameColor, mascotPose, label }` |
| `apps/mobile/src/store/streakSlice.ts` | New Zustand slice (or extension of `appStore`) — `streakState`, `pedalVoiceSassy`, `nudgeQuietHours` |
| `apps/mobile/src/providers/NudgeOverlayManager.tsx` | Renders Pedal-pose-themed overlay when notification tapped |
| `apps/mobile/src/design-system/atoms/StreakFlame.tsx` | Animated flame + Pedal pose + number |
| `apps/mobile/src/design-system/organisms/MiniStreakChallengeOverlay.tsx` | Post-loss recovery |
| `apps/mobile/src/design-system/organisms/RallyFriendsOverlay.tsx` | Streak-at-risk rally-share |
| `apps/mobile/src/lib/nudge-telemetry.ts` | Posts to `/v1/nudges/telemetry` on tap + on action complete |

### 5.2 Existing code to modify

| File | Change |
|---|---|
| `apps/mobile/src/design-system/organisms/StreakCard.tsx` | Enlarge, animate, integrate `StreakFlame` atom |
| `apps/mobile/src/design-system/organisms/ImpactSummaryCard.tsx` | Add streak +1 animation on save |
| `apps/mobile/src/providers/NotificationProvider.tsx` | Add nudge `type` cases to `handleNotificationResponse`; route to `NudgeOverlayManager` |
| `apps/mobile/app/_layout.tsx` | Mount `NudgeOverlayManager` (suppressed during `NAVIGATING`, per the mascot quarantine pattern) |
| `apps/mobile/app/profile.tsx` | Add three settings under Display: "Pedal voice (sassy/neutral)", "Quiet hours", "Nudge categories" (granular off-switches) |
| `apps/mobile/src/i18n/en.ts` + `ro.ts` | ~120 new keys for message catalog |

### 5.3 Notification payload contract

```typescript
type NudgePayload = {
  type: 'nudge';
  triggerId:
    | 'post_ride_celebration'
    | 'post_hazard_thanks'
    | 'streak_at_risk_mild'
    | 'streak_at_risk_dramatic'
    | 'daily_ride_reminder'
    | 'milestone_celebration'
    | 'badge_proximity'
    | 'lapsed_reengagement'
    | 'community_signal'
    | 'streak_lost_apology';
  variantId: string;
  context: {
    streakCount?: number;
    milestoneDay?: number;
    badgeId?: string;
    riderName?: string;
    city?: string;
  };
  nudgeLogId: string;  // for telemetry callback
};
```

`content.data` carries the payload (per error-log invariant about always setting `type` discriminator). `NotificationProvider.handleNotificationResponse` switches on `type === 'nudge'`, pushes payload into a transient `pendingNudge` slot in Zustand (NON-persisted, per the cold-start pattern), and `NudgeOverlayManager` renders the matching overlay.

### 5.4 Native-module guard

Per error-log #21 + #2b, all calls to `expo-notifications` MUST go through `hasNotificationsNativeModule()`. No changes to this contract — existing helpers in `apps/mobile/src/lib/notificationNativeModule.ts` are reused.

---

## 6. Message Catalog (Pedal Voice Charter)

### 6.1 Voice rules

1. **Conversational, witty, never cruel.** Pedal teases but never insults.
2. **Self-aware mascot.** Pedal can break the fourth wall ("I know I'm a dog but…").
3. **Cycling-knowledgeable.** Pedal references the rider's last route, climb, neighborhood.
4. **No emoji as load-bearing semantics.** Per CLAUDE.md rule + Mapbox SymbolLayer constraint (error #13). Pedal poses carry the visual signal.
5. **Romanian register:** slightly more formal than EN, but keeps the wit. Pedal is still cheeky in RO.

### 6.2 Examples (final copy in `apps/mobile/src/i18n/{en,ro}.ts`)

**Post-ride celebration (P0, fires within seconds of save):**
- Sassy EN: "Look at you. {streakCount} days in a row. I'm not crying, you're crying."
- Neutral EN: "Streak day {streakCount}. Nicely done."
- Sassy RO: "Uite-l! {streakCount} zile la rând. Eu? Nu plâng deloc."

**Streak-at-risk MILD (day 4–6, gentle):**
- Sassy EN: "Hey {riderName} — short ride, big deal. {streakCount} days riding. Don't let me ruin the spreadsheet."
- Neutral EN: "Your {streakCount}-day streak needs a ride today, {riderName}."

**Streak-at-risk DRAMATIC (day 7+ at risk):**
- Sassy EN: "{riderName}. {streakCount} days. Cluj is dry. I am sitting by the window. I am waiting."
- Neutral EN: "{streakCount}-day streak ending soon. Time to ride, {riderName}."

**Milestone (day 30):**
- Sassy EN: "30 days. THIRTY. {riderName}, you're officially a habit. I'm getting a tattoo of you."
- Neutral EN: "30-day streak unlocked. Congratulations, {riderName}."

**Post-loss apology (24h after reset):**
- Sassy EN: "{riderName}. About yesterday. Look. It happens. Want to try 3 days, no pressure? I'll keep it chill."
- Neutral EN: "Your streak reset. Ready for a fresh start, {riderName}? Three days, then we see."

**Lapsed (day 7 since open):**
- Sassy EN: "I checked. The bike is still where you left it. Just saying."

**Lapsed (day 30 since open, final attempt):**
- Sassy EN: "OK, last one from me. The city's still here when you want it back. Pedal out."

### 6.3 Variant testing

Each trigger ships with **3 copy variants** (sassy register only — neutral users get the first variant always). Server randomly assigns variant on first eligibility; sticks to that variant for the user thereafter (sticky bucket via hash on `user_id + trigger_id`). After 4 weeks, daily aggregation surfaces win-rate per variant in a Looker/Metabase dashboard. Auto-winnow is **not** done in v1 — human reviews and promotes winners in code.

---

## 7. Telemetry & Measurement

### 7.1 Tracked events (server-side, in `nudge_log`)

| Column | When set | Meaning |
|---|---|---|
| `scheduled_at` | At cron decision | Slot was assigned |
| `sent_at` | Expo Push 200 | Delivered to Expo's queue |
| `delivered_at` | Webhook (best-effort) | Expo confirmed delivery to device |
| `tapped_at` | Mobile callback | User opened the push |
| `action_completed_at` | Cron sweep | Within 2h of `sent_at`, user took the action |
| `outcome` | At evaluation | Why a non-send happened |

### 7.2 Funnel metrics

- **Reach rate** = `sent_at` / eligible-evaluations (catches quiet-hours, weather, cap suppression)
- **Open rate** = `tapped_at` / `sent_at`
- **Action rate** = `action_completed_at` / `sent_at` (the metric that matters)
- **Retention lift** = 30-day rolling retention of users receiving nudges vs. a held-out 5% control (added in v1.1)

### 7.3 Per-variant tracking

Each row in `nudge_log` carries `variant_id`. Weekly aggregation by `(trigger_id, variant_id)` surfaces winning copy.

### 7.4 Alerting

- Sentry breadcrumb on every failed Expo Push call (`outcome = 'expo_error'`)
- Manual dashboard review weekly; no auto-pause in v1.0
- Kill-switch: a single feature flag `nudges.enabled` in Supabase `app_config` table (or env var) flips the cron behavior to no-op

---

## 8. Profile Settings (new UX)

Profile > **Display** gains three rows:

1. **Pedal voice** — segmented control: `Sassy / Neutral`, default Sassy
2. **Quiet hours** — time-range picker, default 22:00 – 07:00
3. **Nudge categories** — multi-toggle (4 toggles, all default ON):
   - Streak reminders
   - Ride celebrations
   - Achievement milestones
   - Community signals

A "Meet Pedal" first-time onboarding card appears once after the first ride is saved: explains the voice, points at the Profile toggle for users who prefer neutral.

EN + RO copy for all of the above.

---

## 9. Implementation Phases

| Phase | Weeks | Deliverables |
|---|---|---|
| **Phase 1: Server foundation** | 1–2 | `nudge_log` + `user_ride_pattern` migrations · `/v1/nudges/{evaluate,event,telemetry,recompute-pattern}` endpoints · Cloud Scheduler jobs · Priority-queue algorithm with 3 highest-priority triggers wired (post-ride, streak-at-risk, milestone) |
| **Phase 2: Remaining triggers + telemetry** | 3–4 | All 8 triggers · 2-h action attribution sweep · 3-variant A/B scaffolding · Sentry hooks · Kill-switch flag |
| **Phase 3: Streak visual refresh** | 5 | `StreakFlame` atom · Tier mapping in `streakTiers.ts` · Refreshed `StreakCard` · Post-ride impact `+1` animation · Flame asset pipeline |
| **Phase 4: Voice charter & i18n** | 6 | Full message catalog in EN + RO · `pedalVoice.ts` core helper · 3 variants per trigger · Voice + quiet-hours profile settings |
| **Phase 5: Edge cases & flows** | 7 | Post-loss apology · `MiniStreakChallengeOverlay` · `RallyFriendsOverlay` · Anonymous-gated signup nudge · "Meet Pedal" onboarding card · Lapsed-user cadence |
| **Phase 6: Hardening + soft launch** | 8 | Bundle check passes · 80%+ test coverage on new code · Preview APK validation · Soft-launch to 10% via Play staged rollout · Telemetry dashboard ready · Tune + ramp to 100% |

---

## 10. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Nudges fire on a release with high crash-free drop | HIGH | Manual kill-switch in v1.0; auto-detect in v1.1 |
| RO copy lands wrong / feels American-translated | MEDIUM | Have a native RO speaker review every string before launch; use the existing RO weather-ping titles as a tonal reference |
| Sassy voice causes opt-outs | MEDIUM | Onboarding card explains voice; profile toggle is one tap |
| Streak hard-reset feels punishing | MEDIUM | Post-loss apology + mini-streak challenge specifically designed to absorb the blow |
| Anonymous users see streak teaser, churn at signup | LOW | UX shows streak only AFTER signup; teaser is sign-up-time only |
| Server-side queue mispicks priority | LOW | All eligibility checks log `outcome` to `nudge_log` — debuggable post-hoc |
| 2/day cap causes streak-at-risk to lose to milestone | LOW | Priority order P0 > P1 > P2 > P3; milestone IS P0, this is intentional |
| Expo Push API rate-limits during a milestone day mass-celebration | LOW | Existing per-user budget + Expo's own queue absorb this; monitor `nudge_log.outcome = 'expo_error'` |

---

## 11. Out of Scope (v1.0)

- App-icon badge counter (deferred)
- Auto-pause on Sentry crash spike (v1.1)
- Streak freezes / grace period / paid repair (locked OUT by Wave 1)
- Image-based share cards (v1.1 if telemetry warrants)
- Streak leaderboard as a separate screen (existing neighborhood leaderboard suffices)
- Friend-following streak feeds (not in scope)
- Pedal-level system beyond tier rank (existing 10-tier system already covers progression)

---

## 12. Approval Checklist

Before code work begins, user confirms:
- [ ] Spec summary reflects intent
- [ ] Voice & tone direction is on-brand for v0.3.x → v1.0
- [ ] 6–8 week timeline is acceptable
- [ ] Worktree branch `worktree-pedal-nudge-system` is the implementation surface
- [ ] No additional triggers / mechanics need to be added before kickoff
