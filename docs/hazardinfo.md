# Hazards — How They Work

Last updated: 2026-04-21 (ships with revision that deploys the Improved Hazard System).

## What a hazard is

A point on the map reported by a cyclist — pothole, debris, accident, construction, ice, flood, etc. Stored in Supabase table `hazards` with a geocoordinate, hazard type, reporter user ID, and lifecycle fields (`expires_at`, `active`, `score`, `confirm_count`, `deny_count`, `pass_count`, `last_confirmed_at`).

Hazards appear on the map in every screen that renders `RouteMap` — planning, preview, navigation, trip replay, community feed.

## Lifecycle

```
report → (active, expires_at = now + baseline TTL)
      → [community votes tick score up or down]
      → [offline cron hides / deletes / resurrection-guards]
      → gone
```

### 1. Report

User taps the hazard-report FAB (on the planning or navigation screen) → picks a type → the client calls `POST /v1/hazards` with `{ hazardType, lat, lon }`. Server inserts into `hazards`; the `set_hazard_expiry()` trigger stamps `expires_at = now() + hazard_baseline_ttl(hazardType)`:

| Hazard type | Baseline TTL |
|---|---|
| `ice`, `accident`, `flood` | 4 hours |
| `debris`, `obstacle` | 12 hours |
| `pothole` | 7 days |
| `construction` | 14 days |
| *(anything else)* | 24 hours |

Offline reports enqueue as a `hazard` mutation and drain when connectivity returns.

### 2. Community voting

Every hazard card and map-marker tap opens the **Hazard Detail Sheet**. Two buttons: thumbs-up (still there) and thumbs-down (gone). During navigation the proximity `HazardAlert` pill shows the same two buttons inline — no more "Still there? Yes/No" prompt.

- **Client → API:** `POST /v1/hazards/:id/vote` with `{ direction: 'up' | 'down' }`. Auth is `requireFullUser` — anonymous Supabase sessions are rejected with 403. One vote per user per hazard (DB-enforced via `UNIQUE (hazard_id, user_id)` on `hazard_validations`).
- **Rate limit:** 5 votes per user per 10 minutes (env-overridable via `RATE_LIMIT_HAZARD_VOTE_MAX` / `RATE_LIMIT_HAZARD_VOTE_WINDOW_MS`). The 6th vote inside the window → HTTP 429 with `code: "RATE_LIMITED"` and a `Retry-After` header. The mobile client surfaces this through the normal `onError` path (optimistic vote rolls back).
- **Wire vs storage mapping:** `'up'` → `response='confirm'`, `'down'` → `response='deny'` in the `hazard_validations` table. The existing CHECK constraint is untouched.
- **Flip handling:** if a user changes their vote, the trigger undoes the prior counter increment before applying the new one (so flipping up→down isn't double-counted).
- **Score:** `hazards.score` is a PostgreSQL generated column — `confirm_count - deny_count`, kept in sync automatically, indexed.
- **Offline votes:** queue as `hazard_vote` mutations, drain when online. Queue-collapse drops stale entries for the same hazard (status=queued, retryCount=0), so fast up→down→up tapping produces one request, not three.
- **Optimistic UI:** `userHazardVotes[hazardId]` in the Zustand store, persisted, cleared by `resetUserScopedState()` on sign-out so user A's votes don't leak to user B.

### 3. Expiry & hiding

Two forces shrink the map over time:

- **TTL expiry** — every hazard has `expires_at`. Upvotes bump it (`expires_at = GREATEST(expires_at, now() + baseline)`). Downvotes halve the remaining time. Once `expires_at < now()`, the hazard drops out of `/v1/hazards/nearby`.
- **Score-based hiding** — `/v1/hazards/nearby` filters `WHERE score > -3`. A hazard with `deny_count - confirm_count >= 3` disappears from the map immediately — a brief downvote swarm doesn't destroy evidence a moderator might want to audit.

### 4. Cron — `POST /v1/hazards/expire`

Daily Cloud Scheduler job (`hazards-expire-cron`, 03:00 Europe/Bucharest) with `Authorization: Bearer $CRON_SECRET`. It:

1. **Hard-deletes** hazards where `score <= -3` has held for ≥24 hours.
2. **Hard-deletes** hazards where `expires_at < now() - interval '45 days'` (45-day grace period — aligned with the trigger's resurrection-guard window so a hazard can never be deleted while a late offline vote could still legitimately revive it).
3. Returns `{ deletedScoreDrop: N, deletedStale: N }`.

### 5. Resurrection guard

If a vote was queued offline a long time ago and drains now, the `extend_hazard_on_confirm()` trigger checks: is `expires_at < now() - interval '45 days'`? If yes, the trigger still records the counter bump (for audit) but does **not** extend `expires_at` back into the future. A dead hazard cannot be resurrected by a very stale queued vote. Within the 45-day window, late votes are honored and do extend the TTL.

## How hazards render on the map

Everything lives in `apps/mobile/src/components/map/layers/HazardLayers.tsx`:

- **Individual markers** — `ShapeSource` always mounted (empty FeatureCollection when no hazards; never conditionally unmounted — avoids ghost-marker bug #12). Each feature carries `severity`, `score`, `expiresAt`, `lastConfirmedAt` in its properties.
- **Clustering** — `cluster={true}`, `clusterRadius={50}`, `clusterMaxZoomLevel={14}`. Zoomed out in dense areas, markers collapse into a single cluster bubble with a count. The bubble color reflects the worst hazard inside the cluster via `clusterProperties.max_severity` (danger = red, caution = amber).
- **Cluster bubble radius** scales with count: 16 px (< 5), 22 px (5–14), 28 px (≥ 15).
- **Cluster label** uses Mapbox's built-in `point_count_abbreviated` — ASCII digits and `K` suffix only, never emoji (avoids Android rendering bug #13).
- **Navigation camera** (zoom 16, pitch 45) is above the cluster threshold, so clusters never appear mid-ride — only individual markers and proximity alerts.
- **Tap behavior** — cluster tap triggers `getClusterExpansionZoom` and a smooth camera fly-to. Individual marker tap opens the `HazardDetailSheet` with the full vote UI, score, reporter timestamp, distance.
- **Emissive strength = 1** on every overlay layer so hazards stay visible during Shield Mode's day/night auto-lighting.

## Data paths at a glance

```
apps/mobile/src/design-system/
├── tokens/hazardIcons.ts        # shared icon map
├── molecules/HazardAlert.tsx    # nav pill — thumbs up/down + score
├── molecules/HazardAlertPill.tsx
└── organisms/HazardDetailSheet.tsx  # bottom sheet — full detail + vote

apps/mobile/src/components/map/layers/HazardLayers.tsx  # clustered ShapeSource
apps/mobile/src/components/map/RouteMap.tsx             # wires marker tap → sheet

apps/mobile/src/hooks/useHazardVote.ts        # optimistic mutation, offline-aware
apps/mobile/src/hooks/useNearbyHazards.ts     # fetch + client-side expiry filter + vote overlay
apps/mobile/src/store/appStore.ts             # userHazardVotes (persisted)
apps/mobile/src/lib/api.ts                    # voteHazard(hazardId, direction)
apps/mobile/src/lib/offlineQueue.ts           # hazard_vote payload type

services/mobile-api/src/lib/hazardSchemas.ts  # Fastify JSON Schemas
services/mobile-api/src/routes/v1.ts          # POST /v1/hazards/:id/vote, cron, nearby

packages/core/src/contracts.ts                # NearbyHazard, HazardVoteResponse, QueuedMutationType

supabase/migrations/202604210001_hazard_score_index.sql
```

## Why this shape

- **Reuses existing `hazard_validations` table** — no parallel vote table, no CHECK-constraint rewrite, no data migration. Upvote/downvote is a UX rename of the existing confirm/deny flow.
- **`score` is generated, not computed in code** — always in sync, indexable, one source of truth.
- **Per-type TTL** — a pothole that's been there for years doesn't deserve the same expiry as black ice that'll melt by noon.
- **Community self-cleaning** — downvotes shorten TTL and feed the hide threshold; upvotes extend TTL. No manual moderation needed for most churn.
- **Clustering** — a city centre with 50 hazards in 200 m used to be an unreadable mess of red dots. Now it's a single "50" bubble until you zoom in.
- **Offline-first** — vote while in a tunnel, the queue drains on reconnect, optimistic UI shows your vote immediately, collapse rule stops stale retries.
