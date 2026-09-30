# Pedal Plus — nudge plan

Written 2026-09-29. **Implemented 2026-09-29** (see §8), with the launch moved to
**2026-10-02 00:00 UTC**. Not yet committed, released or device-tested. Companion to `docs/pedal-plus-offering.md` (what is in Plus)
and `docs/runbooks/pedal-plus-launch.md` (how it goes live). This file covers
**how a rider finds out Plus exists and why they would want it**.

---

## 0. The facts that shape every nudge

1. **For about 3,365 existing accounts, Plus is just E-bike + Cool.** Every
   ceiling is waived for grandfathered accounts. So for the current base,
   every nudge has to sell one of the two modes. Limit cards will never
   reach these riders.
2. **Today the modes disappear without a word.** On route planning, a free
   rider who loses E-bike/Cool gets no pill at all (`route-planning.tsx`, the
   `ebikeAvailable || coolAvailable` row). The second row vanishes and the heal
   effect quietly switches an E-bike rider back to Safe. A rider who used Cool
   all September sees it gone on 1 October and is never told why, or that it
   can be bought. **This is the biggest gap, and it isn't a nudge — it's
   missing UI.**
3. **Cool is a summer feature, and the modes become paid on 1 October.** In
   European autumn, E-bike carries the offer. Cool should be pitched when
   it's hot (see N6), not on a calendar.
4. **Volume is tiny.** About 28 production sessions per 48 h. An A/B test
   cannot reach significance. Report funnel *counts* with their N, and treat
   copy choices as judgement calls rather than experiments
   (`feedback_release-health-needs-session-counts`).
5. **A nudge must never point at a paywall that can't sell.** No purchase has
   been made on a handset yet on either platform, and the `pedal_plus`
   entitlement mapping on iOS is still unverified. Phase 0 gates everything.

## 1. Shipped 2026-09-29: the description (this change)

- **Subtitle** was "Keep the app alive, and ride with more." It sounded like
  a donation ask and named nothing. It is now **"E-bike and Cool modes, plus
  room for every ride you care about."**
- **E-bike and Cool now come first.** They were 4th and 5th, under three
  limits most existing riders never hit. A test pins the order, and it was
  mutation-checked (it fails when the old order is put back).
- **Titles use the names on the pills.** "E-bike mode" / "Cool mode"
  (RO "Modul E-bike" / "Modul Răcoros", ES "Modo E-bike" / "Modo Fresco"),
  so a rider can tell they're the buttons on the planning screen.
- **The copy says what each mode does.** E-bike: routes and ETAs for
  pedal-assist; hills the motor handles no longer force a detour. The copy
  gives no speed figure, because i18n strings must not carry a unit, and it
  never implies S-pedelec suitability. Cool: routes under trees *where we
  can*, and shows how much of the ride is shaded. That is the honest claim,
  because outside the canopy cities Cool is shade-graph routing only.
- **New reassurance line:** "Safe routing, hazard alerts and turn-by-turn
  navigation stay free for everyone." A paywall makes riders ask what will be
  taken away next. This answers it.
- **Bug fixed:** the route-preview paywall got `coolRoutingAvailable` from a
  value that already included `blockCoolRouting`. So the Cool benefit was
  hidden from every non-subscriber, the only people the sheet sells to. It
  now uses coverage only, the same as Profile.

## 2. Phase 0: preconditions (nothing below ships before these)

| # | Gate | Why |
|---|---|---|
| 0.1 | One real purchase + restore on an Android handset **and** an iPhone, with the entitlement arriving as `pedal_plus` | A nudge into broken billing charges a rider and grants nothing |
| 0.2 | `premium_ui_enabled` flipped (`202610010001_pedal_plus_go_live.sql`) | Every surface below is behind `uiEnabled` |
| 0.3 | **Decide today whether 1 October holds.** If 0.1 isn't done by then, the gates fail open (dark paywall keeps the modes free). But the app has named that date in three languages, so move `PLUS_MODES_FREE_UNTIL` + `PLUS_LAUNCH_AT_ISO` together in the next release rather than letting the date pass silently | Offering doc, "If it slips" |

## 3. The nudges, by leverage

Every surface: **never during `NAVIGATING`**, never on a hazard or safety
surface, never self-triggered on app open, always dismissible.

### P0: ships with the paywall flip

**N1. Locked mode pills instead of vanishing ones.** *(highest leverage)*
Keep the E-bike and Cool pills on route planning and in the preview cycle
pill for non-subscribers. Show them muted, with the existing `PlusBadge`
atom. Tapping one opens the paywall with that mode highlighted (N3). It does
not switch modes. Cool keeps its coverage gate: where there is no shade
graph, no pill (that's the paywall's honesty rule).
- Files: `route-planning.tsx` (second pill row), `route-preview.tsx`
  (`renderModeCyclePill`: the cycle skips locked modes, and a long-press or
  separate chip opens the paywall), `ModeTogglePill` (`locked` prop).
- ⚠️ `coolAvailable` / `ebikeAvailable` currently mean both "may route" and
  "should render". Split them into `canRoute*` (entitlement + coverage,
  drives the dispatcher and the heal effects, unchanged) and `showPill*`
  (coverage only). The heal effects must keep reading the entitlement half.
  Otherwise a locked pill could be lit while the route runs on the standard
  graph (the `resolveAvoidHeat` trap from the Cool rollout).

**N2. A one-time "your mode moved to Plus" notice.** A rider who used E-bike
or Cool during the free period gets one notice after 1 October: *"E-bike is
now part of Pedal Plus. Try it free for 7 days."* It offers two actions: try
free (opens the paywall) or keep riding Safe. It replaces the silent heal to
Safe.
- Needs a new **device-scoped** memory, `plusModesUsed: { ebike?: string;
  cool?: string }` (first-use ISO timestamps), stamped in `selectRoutingMode`.
  It **must ship in a release before 1 October to capture anything.** That is
  the one time-critical item here: after 1 October there is nothing left to
  observe. If it misses, fall back to targeting `bikeTypeId === 'ebike'` for
  E-bike and skip Cool until summer.
- Reuse the `PlusModesPromoNotice` molecule's shape and its once-only flag
  pattern.

**N3. Contextual paywall focus.** Give `PaywallSheet` a
`focus?: 'ebike' | 'cool' | PremiumLimitKind` prop. The tapped benefit
renders first with an accent border, and the subtitle stays as it is. A rider
who tapped E-bike should see E-bike, not a list.

**N4. Better plan presentation (pricing, not copy).**
- Pre-select annual with a "Best value" chip and a per-month equivalent
  ("€3.00/month, billed yearly"). Compute it from the store's price, never a
  literal.
- ⚠️ The annual discount is only **16%** (EUR 35.99 vs 12 × 3.59). A "save"
  badge at 16% is weak; 30–40% is typical. Decide the price before designing
  the badge, because the badge copy depends on the number.
- Lead with the trial ("7 days free, then …"), which is already offered on
  both stores.

### P1: next release after launch

**N5. Post-ride, for e-bike owners.** On the feedback screen after a
positively-rated ride where `bikeTypeId === 'ebike'` and the ride was *not*
on E-bike mode, show an inline card: *"You ride an e-bike. E-bike mode plans
routes and times for your motor."* It must claim through `claimPromptSlot`
at the **lowest** priority (after SaveRideCard > ReviewPromptCard >
AnalyticsOptInCard), so it never competes with a celebration or another ask.
Don't show it during the first two rides.

**N6. Cool on hot days, not on a calendar.** When the forecast already
fetched for the planning screen's weather widget shows ≥ 28 °C and the rider
is in shade coverage, a single chip under the mode row reads *"Hot today —
Cool mode keeps you in the shade."* Tapping it opens the paywall focused on
Cool. From October this barely fires, and that's correct. Keep the threshold
beside `cyclingWeather.ts`'s other temperature constants.

**N7. Near-limit hints (new accounts only).** The hard-limit
`PremiumLimitCard`s already exist. Add a quiet counter one step before each
limit ("1 saved route left on Free"), inline and never a modal. The loop
meter (3/month) should always show what's left in the loop planner. The
counter is `loopSessionsLeft()`, already in `usePremium`.

**N8. Hidden history teaser.** In Trips, for a new account with rides older
than 90 days, add one row: "N older rides are kept. Plus shows them." Needs
the count from the API (the read filter is server-side), so it's a small API
change. It only applies to accounts created from 1 October, so it first fires
around 1 January 2027. Low priority.

### P2: needs a decision first

**N9. Trial-ending reminder.** A local notification two days before the
trial converts. It cuts refunds and chargebacks and builds trust. It needs a
notification channel, a `data.type` handler, and the full notification
checklist in CLAUDE.md.

**N10. Server push for Plus.** Don't build this without legal review. A
commercial push is marketing, and the current push consent
(`notify_riding_tips`, notify flags) was collected for riding content, not
sales. If approved, it becomes a Pedal nudge trigger with its own opt-in and
kill switch, never a reuse of an existing consent.

## 4. Frequency caps (one rulebook, like `analytics-optin.ts`)

A new `lib/plus-nudges.ts`, pure and unit-tested, with a device-scoped
`plusNudgeState` slice:

- At most **one unsolicited Plus surface per session** (N2, N5, N6). N1, N3
  and N7 are not counted: the rider asked, or it's where they already are.
- Each unsolicited surface: at most once per 14 days, and **two dismissals
  retire it for good**.
- Subscribing, or restoring an active subscription, retires every surface.
- If `uiEnabled` is false, nothing renders.

## 5. What we will not do

- A paywall on app open, a countdown timer, a fake discount, or a "last
  chance" message.
- Gating anything safety-related, or showing Plus on navigation, hazard,
  off-route or low-GPS surfaces.
- Pitching Cool where there is no shade graph, or implying Cool routes are
  cooler everywhere. "Routes" is not "cools".
- Implying E-bike mode suits S-pedelecs.

## 6. Measurement

PostHog events (default-on product analytics): `plus_paywall_viewed
{source, focus}`, `plus_locked_mode_tapped {mode}`, `plus_plan_tapped
{plan}`, `plus_purchase_result {plan, outcome}`, `plus_nudge_dismissed
{surface}`. The source of truth for conversions is RevenueCat plus
`POST /v1/billing/webhook`, not PostHog, which is a lower bound. Always
report counts with their denominator. At current volume, a single
conversion is a data point, not a rate.

## 7. Order of work

1. **Today, if 1 October still stands:** the `plusModesUsed` stamp (N2
   prerequisite) in the next build, plus this description change.
2. With the paywall flip: N1 (locked pills, with the `canRoute`/`showPill`
   split), N3, N2, N4. Device-test on a **preview** build with a free
   non-grandfathered test account *and* a grandfathered one. They see
   different sheets.
3. Next release: N5, N6, N7, plus the caps module.
4. Later / decisions: N8, N9, N10, annual price.

## 8. Implementation record (2026-09-29)

**Launch date moved to 2026-10-02 00:00 UTC.** `PLUS_MODES_FREE_UNTIL` and
`PLUS_LAUNCH_AT_ISO` moved together; a new test pins them to the same instant.
Fielded builds (≤ 0.2.177) still compile in 2026-10-01: deploy the API before
the paywall flip, and apply the go-live migration no earlier than
2026-10-02 00:00 UTC (runbook, top).

| Item | Where | Status |
|---|---|---|
| Description rewrite, modes lead, reassurance line | `PaywallSheet`, i18n ×3 | done |
| Paywall hid Cool from free riders (route-preview) | `route-preview.tsx` | fixed |
| One paywall host (offers, purchase/restore, telemetry, nudge retirement, platform-correct manage link) | `components/PlusPaywallHost.tsx` | done; Profile, route-preview, route-planning, feedback, course import, loop planner, layout all use it |
| N1 locked pills (`coolCovered`/`coolAvailable` split kept apart) | `ModeTogglePill` `locked`, route-planning row 2, route-preview locked row | done |
| N2 usage stamp + "moved to Plus" notice | store `plusModesUsed` (setters + rehydrate from persisted `isEbike`/`avoidHeat`), `PlusModesMovedNotice`, `_layout.tsx` manager | done |
| N3 focus | `PaywallSheet` `focus` (+ contextual course / loop rows) | done |
| N4 plan cards, annual pre-selected, per-month + saving from store numbers | `PaywallSheet`, `planPricing.ts`, `StoreOffer.price/currencyCode` | done — the 16% annual discount is unchanged (pricing decision still open) |
| N5 post-ride e-bike card | `feedback.tsx`, `PlusSuggestionCard` | done |
| N6 hot-day Cool chip (≥ 28 °C daily max) | route-planning | done |
| N7 last-free-slot hints; loop quota + loop save-limit now lead to the paywall | route-preview save modal, course import, loop planner | done (packs skipped: free limit is 1, so "one left" would show on every first download) |
| Caps + session latch + arbitration (`plus` = lowest ask) | `lib/plus-nudges.ts`, `usePlusNudge`, `prompt-arbitration.ts` | done |
| Telemetry | `plus_paywall_viewed`, `plus_plan_tapped`, `plus_purchase_result`, `plus_restore_result`, `plus_locked_mode_tapped`, `plus_nudge_shown/dismissed/accepted` | done |
| N8 hidden-history teaser | — | **not done**: needs an API count, and first fires ~Jan 2027 |
| N9 trial-ending reminder | — | **not done**: new notification channel, needs a decision |
| N10 server marketing push | — | **not done**: legal review first |

⚠️ **The usage stamp reaches nobody before the promo ends.** No build carrying
it can be in riders' hands by 2026-10-02. What still works on upgrade: the
rehydrate path reads a persisted `isEbike` / `avoidHeat` (the rider's last mode),
and E-bike falls back to `bikeTypeId === 'ebike'`. A rider who used a mode but
last routed on Safe will not be told.
