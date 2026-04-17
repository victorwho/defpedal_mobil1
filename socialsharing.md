# Social Sharing — Implementation Tracker

Tracks the migration from text-only `Share.share({ message })` to image-based social sharing (Strava-style).

Created: 2026-04-17
Related PRD: https://github.com/victorwho/defpedal_mobil1/issues/8

---

## Scope

### In scope for v1

| # | Surface | Image Type | Status |
|---|---------|------------|--------|
| A | Post-ride summary (hero) | Map + stats overlay | DONE (2026-04-17) |
| B | Trip from history (`trips.tsx`) | Map + stats overlay | DONE (2026-04-17) |
| C | Trip from community feed (`community-trip.tsx`) | Map + stats overlay | DONE (2026-04-17) |
| D | Milestone share (`feedback.tsx`) | Branded card (no map) | DONE (2026-04-17) |
| E | Badge share (`BadgeDetailModal`) | Branded card (no map) | DONE (2026-04-17) |
| F | Mia level-up (`MiaShareCard` + `MiaLevelUpOverlay`) | Branded card (no map) | DONE (2026-04-17) |

### Out of scope for v1 (stays as text)

- G — Hazard alert share (`route-planning.tsx`) — speed-critical warning, text only
- H — Referral link share (`profile.tsx`) — link, not an achievement

---

## Decisions locked in

- **Q1 Scope:** Upgrade D/E/F, add new A/B/C, leave G/H as text
- **Q2 Map:** Mapbox Static Images API (public token, client-side) for ride shares (A/B/C); no map for D/E/F
- **Q3 Social targets:** OS share sheet only in v1. Explicit Instagram Stories deep link deferred (see follow-ups)

---

## Follow-ups (future work)

### FU-1 — Instagram Stories deep-link (Q3B)
Use the `instagram-stories://share` URL scheme to pre-fill a sticker + gradient background. Bypasses the share sheet for a one-tap IG Stories post. Requires:
- iOS URL scheme whitelisting in `Info.plist`
- Android intent handling
- Separate rendering pipeline for 1080×1920 story-sized image
- Fallback to OS share sheet if IG not installed
- Pre-filled attribution sticker (link back to DefensivePedal)

### FU-2 — Explicit per-network buttons (Q3C)
Custom share sheet with WhatsApp / X / Facebook / IG Stories buttons (some users find the OS sheet intimidating). Only worth doing if share-sheet analytics show drop-off at the OS picker step.

### FU-3 — Server-side image composition
If client-side `react-native-view-shot` proves unreliable on low-end Android, move composition server-side (sharp/node-canvas on Cloud Run). Higher quality control, cacheable, but more infra.

### FU-4 — Animated share (GIF/MP4 of ride playback)
Strava offers animated route draw. Would require server-side ffmpeg pipeline.

### FU-5 — Shareable web landing page per ride
Link shared in text share-fallback could resolve to a web preview of the ride (OG tags). Requires web route on defensivepedal.com.

### FU-6 — `totalKm` on Mia level-up share card
`MiaLevelUpOverlayManager` in `apps/mobile/app/_layout.tsx` hardcodes `totalKm: 0` when wiring `MiaShareCard` because `MiaJourneyState` doesn't carry total distance (distance lives in the impact dashboard, which isn't always loaded at level-up time). Result: Mia level-up shares display `0 km` on the capture card. Fix needs either a new field on `MiaJourneyState` or a cross-query at level-up time to fetch lifetime km. Surfaced by final QA as LOW/non-blocking.

### FU-7 — `impact-dashboard.tsx` Mia milestone text share
The Mia journey widget on `apps/mobile/app/impact-dashboard.tsx:143` still uses text `Share.share({message})`. Not listed in the PRD's 6 in-scope surfaces (A–F) nor the out-of-scope list (G–H). Two options: (1) upgrade to image via `useShareCard({type: 'mia', ...})` — reuses Phase 5b pipeline end-to-end, ~5 LOC diff; (2) add row "I — Mia milestone share (`impact-dashboard.tsx`) — stays text" to the out-of-scope table to close the gap in scope docs. Surfaced by final QA as LOW/non-blocking.

---

## Repair log

| Date | Change | By |
|------|--------|----|
| 2026-04-17 | File created with scope and follow-ups | Claude |
| 2026-04-17 | Full image-sharing pipeline implemented across 6 surfaces (GitHub #8, 5 phases, ~113 tests) | Claude |
| 2026-04-17 | Added FU-6 (Mia totalKm=0 on share card) and FU-7 (impact-dashboard Mia milestone still text) from final QA LOW findings | Claude |

---

## Implementation log

### 2026-04-17 — Full pipeline shipped (GitHub #8)

- **Phase 1 (core modules)**: Added `trimPrivacyZone`, `mapboxStaticImageUrl`, `buildShareCaption` to `@defensivepedal/core`. 38 pure-logic tests.
- **Phase 2 (mobile infra)**: `OffScreenCaptureHost` provider, `shareImage` service, `useShareRide` hook. 13 tests. Installed `react-native-view-shot`, `expo-sharing`, `expo-media-library` in `apps/mobile/package.json`.
- **Phase 3 (ride card)**: `RideShareCard` 1080×1080 forwardRef component + 12 tests.
- **Phase 4 (card upgrades)**: Added `variant: 'preview' | 'capture'` to `MilestoneShareCard`, `BadgeShareCard`, `MiaShareCard` + forwardRef. Removed internal `Share.share`. 44 tests.
- **Phase 5a (ride surfaces)**: Wired `useShareRide` into post-ride impact (`feedback.tsx`), trip history (`trips.tsx`), community trip detail (`community-trip.tsx`). i18n: `share.shareRide`.
- **Phase 5b (card surfaces)**: New `useShareCard` hook. Wired into `BadgeDetailModal`, `MiaLevelUpOverlay`, milestone modal in `feedback.tsx`. i18n: `share.shareLevelUp`. `_layout.tsx` wires `useMiaJourney()` stats prop. 6 tests.

**Dev APK rebuild required** (`./gradlew installDevelopmentDebug`) to activate the 3 new native modules. Until rebuilt, shareImage fails soft with a guarded warning (Error #23 pattern).
