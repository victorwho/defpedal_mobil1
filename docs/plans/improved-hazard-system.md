# Improved Hazard System — Implementation Plan

**Status:** Final (QA-reviewed twice; round 1: 3 blockers + 11 ambers resolved; round 2: 3 critical + 3 high + 3 medium resolved inline)
**Owner:** team-lead (hazard-system-plan team)
**Date:** 2026-04-21
**Target repo:** `C:\dev\defpedal`
**Scope:** plan only — no code changes yet

---

## 1. Executive Summary

Three coordinated improvements to the existing Waze-style hazard system:

1. **Upvote / downvote voting.** Replace the binary "Still there? Yes / No" navigation prompt with an explicit thumbs-up / thumbs-down vote exposed *everywhere* a hazard is visible (navigation alert, route-preview map tap, planning map tap). Votes map to the existing `hazard_validations.response` values (`up`→`confirm`, `down`→`deny`) and are aggregated via a new generated `score = confirm_count - deny_count` column on `hazards`. Strongly downvoted hazards (`score <= -3`) are **hidden immediately** from `/hazards/nearby` and **hard-deleted by the daily cron** once they've stayed at that score for 24h. Reuses the existing `hazard_validations` table and its `UNIQUE (hazard_id, user_id)` constraint for per-user idempotency — no parallel idempotency model, no new CHECK values, no new table.

2. **Type-aware auto-expiry.** Transient hazards (debris, accident, ice) expire in **hours**; semi-permanent hazards (pothole, construction, missing bike lane) expire in **weeks**. Upvotes reset expiry to the baseline; downvotes halve the remaining lifetime. A daily Cloud Scheduler cron (`hazards-expire-cron`) calls a new `POST /v1/hazards/expire` endpoint that deletes stale rows. Map and `/hazards/nearby` queries filter `expires_at > now()`.

3. **Marker clustering.** Switch the hazard `<Mapbox.ShapeSource>` in `HazardLayers.tsx` to `cluster={true} clusterRadius={50} clusterMaxZoom={14}`, with separate symbol layers for cluster bubbles vs. individual markers (filter-split on `has('point_count')`). Cluster bubble color reflects worst-case severity via `clusterProperties.max_severity`. Tap-to-zoom via `getClusterExpansionZoom`.

---

## 2. Database Schema Changes

**Strategy decision (resolves QA BLOCKER 1):** Reuse the existing `hazard_validations` table from `202603270001_hazard_validations.sql`. Product-level **upvote maps to `response='confirm'`** and **downvote maps to `response='deny'`**. We do NOT add new `'up'`/`'down'` CHECK values, we do NOT add parallel `upvotes`/`downvotes` columns on `hazards` — existing `confirm_count` / `deny_count` already serve that role, and `score` is derived as `confirm_count - deny_count`. This avoids a parallel idempotency model, preserves the existing `UNIQUE (hazard_id, user_id)` constraint, and lets the existing `extend_hazard_on_confirm()` trigger keep its contract (we only refine its body).

New migration file: `supabase/migrations/202604210001_hazard_score_index.sql`

```sql
-- 1. Generated score column on hazards so it can be indexed and filtered
--    on without repeatedly computing (confirm_count - deny_count).
ALTER TABLE hazards
  ADD COLUMN IF NOT EXISTS score integer
  GENERATED ALWAYS AS (confirm_count - deny_count) STORED;

-- 2. last_confirmed_at and expires_at already exist (from 202603270001).
--    No new columns beyond `score`.

-- 3. Per-type baseline TTL helper.
CREATE OR REPLACE FUNCTION hazard_baseline_ttl(p_type text)
RETURNS interval AS $$
BEGIN
  RETURN CASE p_type
    WHEN 'poor_surface'           THEN interval '4 hours'    -- transient
    WHEN 'aggressive_traffic'     THEN interval '4 hours'
    WHEN 'illegally_parked_car'   THEN interval '6 hours'
    WHEN 'blocked_bike_lane'      THEN interval '12 hours'
    WHEN 'narrow_street'          THEN interval '30 days'    -- semi-permanent
    WHEN 'missing_bike_lane'      THEN interval '30 days'
    WHEN 'dangerous_intersection' THEN interval '30 days'
    WHEN 'pothole'                THEN interval '14 days'
    WHEN 'construction'           THEN interval '21 days'
    ELSE                               interval '24 hours'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp;

-- 4. Refine the EXISTING extend_hazard_on_confirm() trigger body.
--    The function name, the binding trigger (hazard_validation_counter),
--    and the hazard_validations CHECK / UNIQUE constraints are unchanged.
--    Behavior changes:
--      (a) confirm uses the per-type baseline TTL instead of a flat +12h
--      (b) deny halves the REMAINING lifetime (new behavior)
--      (c) a resurrection guard prevents a stale queued offline vote
--          from rewinding a hard-expired hazard's expires_at.
--      (d) ** QA round 2 MEDIUM M1 **: on UPDATE (a user flips their vote),
--          decrement the OLD response's counter BEFORE applying NEW, so the
--          net change across one flip is delta-1 not delta-2. Without this,
--          a user flipping up→down would produce confirm_count=1, deny_count=1
--          (score 0) instead of confirm_count=0, deny_count=1 (score -1).
CREATE OR REPLACE FUNCTION extend_hazard_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  v_baseline    interval;
  v_type        text;
  v_expires_at  timestamptz;
BEGIN
  SELECT hazard_type, expires_at
    INTO v_type, v_expires_at
    FROM hazards
   WHERE id = NEW.hazard_id;

  -- Vote-flip reversal: on UPDATE where the response changed, undo the old one first.
  -- Pass does not touch counts on the reversal side because `pass` never impacted score
  -- beyond its own counter; but we still decrement pass_count for symmetry.
  IF TG_OP = 'UPDATE' AND OLD.response IS DISTINCT FROM NEW.response THEN
    IF OLD.response = 'confirm' THEN
      UPDATE hazards SET confirm_count = GREATEST(confirm_count - 1, 0) WHERE id = NEW.hazard_id;
    ELSIF OLD.response = 'deny' THEN
      UPDATE hazards SET deny_count    = GREATEST(deny_count    - 1, 0) WHERE id = NEW.hazard_id;
    ELSIF OLD.response = 'pass' THEN
      UPDATE hazards SET pass_count    = GREATEST(pass_count    - 1, 0) WHERE id = NEW.hazard_id;
    END IF;
  END IF;

  -- Resurrection guard: a vote queued offline >7d ago that drains now
  -- must not rewind expires_at into the future for an effectively dead hazard.
  -- Counts still update for audit; only the TTL extension is skipped.
  IF v_expires_at < now() - interval '7 days' THEN
    IF NEW.response = 'confirm' THEN
      UPDATE hazards SET confirm_count = confirm_count + 1 WHERE id = NEW.hazard_id;
    ELSIF NEW.response = 'deny' THEN
      UPDATE hazards SET deny_count    = deny_count    + 1 WHERE id = NEW.hazard_id;
    ELSIF NEW.response = 'pass' THEN
      UPDATE hazards SET pass_count    = pass_count    + 1 WHERE id = NEW.hazard_id;
    END IF;
    RETURN NEW;
  END IF;

  v_baseline := hazard_baseline_ttl(v_type);

  IF NEW.response = 'confirm' THEN            -- product: UPVOTE
    UPDATE hazards
       SET confirm_count     = confirm_count + 1,
           last_confirmed_at = now(),
           expires_at        = GREATEST(expires_at, now() + v_baseline)
     WHERE id = NEW.hazard_id;
  ELSIF NEW.response = 'deny' THEN            -- product: DOWNVOTE
    UPDATE hazards
       SET deny_count  = deny_count + 1,
           expires_at  = now() + GREATEST((expires_at - now()) / 2, interval '1 minute')
     WHERE id = NEW.hazard_id;
  ELSIF NEW.response = 'pass' THEN
    UPDATE hazards SET pass_count = pass_count + 1 WHERE id = NEW.hazard_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- 5. Update the hazard insert trigger to use the per-type baseline.
CREATE OR REPLACE FUNCTION set_hazard_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := now() + hazard_baseline_ttl(NEW.hazard_type);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- 6. Indexes for cron + map + hide-threshold queries.
CREATE INDEX IF NOT EXISTS hazards_expires_at_idx ON hazards (expires_at);
CREATE INDEX IF NOT EXISTS hazards_score_idx      ON hazards (score);
```

**Notes:**
- **Migration filename `202604210001_hazard_score_index.sql`** follows the `2026MMDDNNNN_*.sql` pattern (CLAUDE.md convention).
- The `hazard_validations` table, its CHECK `response IN ('confirm','deny','pass')`, its `UNIQUE (hazard_id, user_id)`, and the three count columns on `hazards` are **all unchanged** — no column drops, no CHECK swap. The only additive change is the generated `score` column and the two new indexes.
- The `extend_hazard_on_confirm` function is `CREATE OR REPLACE`-d in place, so the existing `hazard_validation_counter` trigger binding on `hazard_validations` continues to fire correctly.
- `score` is a `GENERATED ALWAYS AS (confirm_count - deny_count) STORED` column — indexable, kept in sync automatically by Postgres.
- **Resurrection guard** prevents a stale offline vote from rewinding a hard-expired hazard back to life.
- `SET search_path = public, pg_temp` on every function, per the hardening established in `202604120001_set_search_path_on_security_definer.sql`.
- **Hide threshold vs. delete threshold (documented):** `score <= -3` (i.e. `deny_count - confirm_count >= 3`) **hides** a hazard from `/v1/hazards/nearby` immediately via the endpoint's WHERE clause. The cron **hard-deletes** only if the hazard stays at `score <= -3` for 24h — a brief downvote swarm does not permanently destroy evidence a moderator might want to audit.

---

## 3. API Endpoints

### 3.1 `POST /v1/hazards/:id/vote` (new)

**Auth (resolves QA BLOCKER 3, corrected in QA round 2):** **`requireOAuthUser(request, dependencies)`** — OAuth-verified Supabase user only. Anonymous Supabase sessions are rejected with **401** (same pattern as `GET /v1/leaderboard` and `POST /v1/routes/preview` per CLAUDE.md "Security hardening" entry).

**Do NOT use `getAuthenticatedUserFromRequest`** — that helper is what `/hazards/:id/validate` currently calls, and it **accepts anonymous sessions**. Using it here would allow throwaway anonymous accounts to cast unlimited votes, defeating the per-user idempotency constraint's purpose. No dev-bypass in production (`DEV_AUTH_BYPASS_ENABLED=false` on Cloud Run per CLAUDE.md).

**Rate limit:** 1 req / sec / user (reuse existing per-route limiter; align with `/hazards/:id/validate`).

**New file — `services/mobile-api/src/lib/hazardSchemas.ts`** (resolves QA BLOCKER 2; matches the file-per-domain pattern already used in `feedSchemas.ts` and `leaderboardSchemas.ts`). Covers: POST vote request body, POST vote response, and the modified `/v1/hazards/nearby` hazard item shape. **Critical — error-log #22 (error #9 in CLAUDE.md):** Fastify silently strips response fields not listed in the schema, so every new field must be declared here or it will not reach the client.

```js
// services/mobile-api/src/lib/hazardSchemas.ts

export const hazardVoteRequestBodySchema = {
  type: 'object',
  required: ['direction'],
  properties: {
    direction:         { type: 'string', enum: ['up', 'down'] },
    clientSubmittedAt: { type: 'string', format: 'date-time' }
  },
  additionalProperties: false
};

export const hazardVoteResponseSchema = {
  type: 'object',
  required: ['hazardId', 'score', 'confirmCount', 'denyCount', 'userVote', 'expiresAt'],
  properties: {
    hazardId:        { type: 'string', format: 'uuid' },
    score:           { type: 'integer' },          // confirm_count - deny_count
    confirmCount:    { type: 'integer' },          // upvotes (existing column)
    denyCount:       { type: 'integer' },          // downvotes (existing column)
    userVote:        { type: 'string', enum: ['up', 'down'] },
    expiresAt:       { type: 'string', format: 'date-time' },
    lastConfirmedAt: { type: 'string', format: 'date-time', nullable: true }
  },
  additionalProperties: false
};

// Single hazard item shape — shared by /hazards/nearby and any other endpoint
// that surfaces hazards (feed, risk-map). Import from here to keep all
// hazard payloads field-consistent and avoid silent Fastify field-dropping.
export const nearbyHazardItemSchema = {
  type: 'object',
  required: ['id', 'hazardType', 'lat', 'lon', 'confirmCount', 'denyCount',
             'score', 'expiresAt', 'createdAt'],
  properties: {
    id:              { type: 'string', format: 'uuid' },
    hazardType:      { type: 'string' },
    lat:             { type: 'number' },
    lon:             { type: 'number' },
    confirmCount:    { type: 'integer' },
    denyCount:       { type: 'integer' },
    score:           { type: 'integer' },
    userVote:        { type: 'string', enum: ['up', 'down'], nullable: true },
    expiresAt:       { type: 'string', format: 'date-time' },
    lastConfirmedAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt:       { type: 'string' }
  },
  additionalProperties: false
};
```

**Wire protocol vs. storage mapping:**
- Client speaks `direction: 'up' | 'down'` over HTTP.
- Server translates: `'up'` → `response='confirm'`, `'down'` → `response='deny'` **before** inserting into `hazard_validations`.
- The DB `CHECK (response IN ('confirm','deny','pass'))` remains unchanged. This mapping lives in the route handler, not in the DB.
- Response field `userVote` is translated back to `'up' | 'down'` at the handler boundary.

**Handler logic:**

1. `requireFullUser()` → JWT validated, anonymous rejected with 401. Extract `user.id`.
2. Translate `direction` → `response` (`'up'` → `'confirm'`, `'down'` → `'deny'`).
3. Upsert `hazard_validations` with `onConflict: 'hazard_id,user_id'` using the existing unique constraint from `202603270001`.
4. The existing `extend_hazard_on_confirm` trigger fires (refined body from §2) and mutates `confirm_count` / `deny_count` / `last_confirmed_at` / `expires_at` in-band. The generated `score` column reflects the new delta automatically.
5. `SELECT id, score, confirm_count, deny_count, expires_at, last_confirmed_at FROM hazards WHERE id = :hazardId` → shape into `hazardVoteResponseSchema`, translating `'confirm'`→`'up'` for the returned `userVote`.
6. Fire-and-forget XP qualifier (`qualifyStreakAsync(user.id, 'hazard_validate', tz, log)`), reuse existing `XP_VALUES.hazard_validate`.

**Idempotency:** the `UNIQUE (hazard_id, user_id)` constraint guarantees a user's vote can only exist once. The upsert is an overwrite, so re-submitting the same direction is a no-op; flipping direction correctly updates aggregates (the trigger sees the UPDATE and applies the new response). Server is authoritative; client offline-queue collapse (§5.4) is a perf optimization, not a correctness requirement.

### 3.2 `POST /v1/hazards/expire` (new, internal cron)

**Auth:** `Authorization: Bearer ${CRON_SECRET}` — identical pattern to `/v1/leaderboard/settle`. Reproduce inline:

```ts
// Matches services/mobile-api/src/routes/leaderboard.ts:272-285
const cronSecret = process.env.CRON_SECRET ?? '';
if (!cronSecret) {
  throw new HttpError('Cron secret not configured.', { statusCode: 500, ... });
}
const auth = request.headers.authorization ?? '';
if (auth !== `Bearer ${cronSecret}`) {
  throw new HttpError('Unauthorized cron call.', { statusCode: 401, ... });
}
```

Returns `500` if `CRON_SECRET` is missing on the server, **`401`** on both missing and mismatched headers (matches leaderboard.ts:281-287 — QA round 2 HIGH H3). No `403` path is defined; the Fastify route schema does NOT need a `403` response variant. No user JWT required (cron-only).

**Request:** empty body.

**Response schema** (add to `hazardSchemas.ts`):

```js
export const hazardExpireResponseSchema = {
  type: 'object',
  required: ['deletedCount', 'purgedCount', 'runAt'],
  properties: {
    deletedCount: { type: 'integer' },  // expires_at < now - 7d
    purgedCount:  { type: 'integer' },  // score <= -3 for >= 24h
    runAt:        { type: 'string', format: 'date-time' }
  },
  additionalProperties: false
};
```

**Handler logic (pseudocode):**

```
begin transaction
  -- 1. Hard-delete hazards that have been at score <= -3 for >= 24h.
  --    The 24h dwell window is enforced by last_confirmed_at: a hazard
  --    is safe from purge if it received a confirm within the last 24h.
  DELETE FROM hazards
   WHERE score <= -3
     AND (last_confirmed_at IS NULL OR last_confirmed_at < now() - interval '24 hours')
   RETURNING id
  -- capture purgedCount

  -- 2. Hard-delete hazards past the 7-day post-expiry grace window.
  DELETE FROM hazards
   WHERE expires_at < now() - interval '7 days'
   RETURNING id
  -- capture deletedCount

  -- Soft gate: hazards with expires_at < now() but within the 7d grace are
  -- already filtered out by /v1/hazards/nearby; they stay in the table
  -- for analytics / moderator audit.
commit

log { event: 'hazards_expire_run', deletedCount, purgedCount, runAt: now() }
```

### 3.3 `GET /v1/hazards/nearby` (modified)

**Schema update** — `services/mobile-api/src/routes/v1.ts:729-740` currently defines the nearby hazards response inline. Replace the inline hazard-item definition with an import from the new `hazardSchemas.ts` so all endpoints surfacing hazards share one shape:

```ts
import { nearbyHazardItemSchema } from '../lib/hazardSchemas';

// In the route schema:
response: {
  200: {
    type: 'object',
    required: ['hazards'],
    properties: {
      hazards: {
        type: 'array',
        items: nearbyHazardItemSchema   // shared schema — see §3.1
      }
    }
  }
}
```

**Why this matters — error-log #22 + CLAUDE.md gotcha #9:** Fastify silently strips response fields not declared in the schema. Prior to this change, any new field the handler selects from Supabase (`score`, `user_vote`, `last_confirmed_at`, `expires_at`) would be dropped on the wire. The new schema declares them all.

**Query changes** (in the handler):

```sql
SELECT
  h.id, h.hazard_type, h.location, h.created_at,
  h.confirm_count, h.deny_count, h.score,
  h.expires_at, h.last_confirmed_at,
  CASE hv.response WHEN 'confirm' THEN 'up' WHEN 'deny' THEN 'down' END AS user_vote
FROM hazards h
LEFT JOIN hazard_validations hv
       ON hv.hazard_id = h.id AND hv.user_id = :caller_user_id
WHERE h.expires_at > now()
  AND h.score > -3                 -- hide strongly downvoted hazards immediately
  AND ST_DWithin(h.location, :centre, :radius_m)
```

The `h.score > -3` filter (§2 hide threshold) + `h.expires_at > now()` filter together enforce the visibility contract the map depends on.

**Mirror the same field additions on:**
- `GET /v1/risk-map` if it embeds hazards (grep `hazards:` in `services/mobile-api/src/routes/v1.ts`).
- Any feed endpoint returning hazard payloads (grep `hazards:` in `feedSchemas.ts`) — import `nearbyHazardItemSchema` there too.

---

## 4. Cron Job

### 4.1 Cloud Scheduler setup

Run **once** to create the cron (matches the `mia-detection-cron` / `leaderboard-settle-weekly` pattern documented in `docs/mia-implementation-plan.md:117`):

```bash
gcloud scheduler jobs create http hazards-expire-cron \
  --location=europe-central2 \
  --schedule="0 3 * * *" \
  --time-zone="Europe/Bucharest" \
  --uri="https://defpedal-api-1081412761678.europe-central2.run.app/v1/hazards/expire" \
  --http-method=POST \
  --headers="Authorization=Bearer ${CRON_SECRET},Content-Type=application/json" \
  --body="{}" \
  --attempt-deadline=300s \
  --project=gen-lang-client-0895796477
```

- **Schedule:** daily at 03:00 Europe/Bucharest (4AM local during DST, low traffic).
- **Deadline:** 300s (hazard count is small; SELECT+DELETE on two indexed columns is sub-second).

### 4.2 Env var

`CRON_SECRET` is already set on Cloud Run from the leaderboard rollout. No new env var needed.

---

## 5. Mobile Implementation

### 5.1 Files touched (enumerated)

**New files**
- `apps/mobile/src/hooks/useHazardVote.ts`
- `apps/mobile/src/design-system/organisms/HazardDetailSheet.tsx`
- `apps/mobile/src/design-system/tokens/hazardIcons.ts` (promoted from the inline map in `HazardAlert.tsx`)

**Modified files**
- `packages/core/src/contracts.ts` — extend `NearbyHazard`, add `HazardVoteDirection`, `HazardVoteRequest`, `HazardVoteResponse`, extend `QueuedMutationType` union.
- `apps/mobile/src/lib/api.ts` — add `voteHazard(hazardId, direction)` + `getHazardById(hazardId)` if detail-sheet needs fresh data.
- `apps/mobile/src/lib/offlineQueue.ts` — add `hazard_vote` to `QueuedMutationPayloadByType`, plus collapse helper (see 5.4).
- `apps/mobile/src/providers/OfflineMutationSyncManager.tsx` — dispatch `hazard_vote` → `api.voteHazard`.
- `apps/mobile/src/store/appStore.ts` — add `userHazardVotes: Record<string, 'up' | 'down'>` (persisted), action `setUserHazardVote(hazardId, direction)`.
- `apps/mobile/src/design-system/molecules/HazardAlert.tsx` — replace Yes/No with thumbs-up/-down + score display.
- `apps/mobile/src/components/map/RouteMap.tsx` — swap inline `selectedHazard` overlay for `<HazardDetailSheet />` render.
- `apps/mobile/src/components/map/layers/HazardLayers.tsx` — switch ShapeSource to clustered, add cluster symbol layer (see §6). **Additional (QA round 2 C1 + H4):** remove the existing `{features.length > 0 ? ... : null}` conditional-mount guard around the `hazards` (and `hazard-zones`) ShapeSources — render always with empty `FeatureCollection` when no data. Widen `HazardLayersProps.onHazardPress` payload type from `{ id, type, confirmCount, denyCount }` to the full `NearbyHazard` shape so `HazardDetailSheet` receives `score`, `userVote`, `expiresAt`, `lastConfirmedAt` etc. without a re-fetch.
- `apps/mobile/app/navigation.tsx` — wire `onConfirm`/`onDeny` of `HazardAlert` to `useHazardVote` (keep existing "pass" hide-alert behavior on dismiss-after-N-seconds).
- `apps/mobile/src/hooks/useNearbyHazards.ts` — accept and surface the new fields; pass `userVote` into the alert.

### 5.2 `useHazardVote` hook

TanStack Query mutation. Signature:

```
useHazardVote() -> {
  vote: (args: { hazardId: string; direction: 'up' | 'down' }) => Promise<HazardVoteResponse>,
  isVoting: boolean
}
```

- **TanStack key scoping (error-log #30):** use a **user-scoped** query key everywhere hazards are fetched: `['nearby-hazards', userId, lat, lon, radiusMeters]`. Updating `useNearbyHazards.ts` to include `userId` in its key prevents cached hazard payloads (which carry the caller's `userVote`) from leaking across accounts on sign-out / sign-in.
- **Optimistic update:** on `onMutate`, patch the `['nearby-hazards', userId, ...]` cache for matching radii: bump `score`, `confirmCount` or `denyCount` (depending on direction), set `userVote`. Also call `appStore.setUserHazardVote(hazardId, direction)` so the UI reflects the vote even offline. Capture the prior `userHazardVotes[hazardId]` value in context for rollback.
- **Rollback:** `onError`, revert the cache snapshot and restore the previous `userHazardVotes` entry.
- **Invalidation:** `onSuccess`, invalidate `['nearby-hazards', userId]` to pull server truth (handles server-side vote-flip deltas: e.g. if the user had previously voted `'up'` and is now switching to `'down'`, the server decrements `confirm_count` and increments `deny_count` — `score` moves by 2, which our optimistic single-delta patch got wrong).
- **Offline:** if `ConnectivityMonitor.isOnline === false`, enqueue a `hazard_vote` mutation via `castHazardVote()` and synthesize a response from the optimistic patch. Do **NOT** invalidate in that branch — a refetch would race the queue drain and revert the optimistic state.

### 5.3 Zustand additions

```ts
userHazardVotes: Record<string, 'up' | 'down'>   // persisted

setUserHazardVote: (id, dir) => set((state) => ({
  userHazardVotes: { ...state.userHazardVotes, [id]: dir }
})),

// QA round 2 BLOCKER C3: `delete next[id]` mutates. Use rest-destructuring
// to produce a new object without the key — strictly immutable.
clearUserHazardVote: (id) => set((state) => {
  const { [id]: _discarded, ...rest } = state.userHazardVotes;
  return { userHazardVotes: rest };
}),
```

Immutable updates only (CLAUDE.md rule). Persist via existing `zustand/persist` config — add `userHazardVotes` to the whitelist.

**`resetUserScopedState()` must clear `userHazardVotes`** (QA round 2 HIGH H1; rn-mobile-dev §6). The existing sign-out / account-switch reset helper in `appStore.ts` wipes per-user caches (queued mutations, feed caches, etc.). Add `userHazardVotes: {}` to its reset payload. Concretely:

```ts
// Inside the existing resetUserScopedState action:
set((state) => ({
  ...state,
  queuedMutations: [],
  // ...other per-user fields already reset here...
  userHazardVotes: {},       // <-- add this
}));
```

Without this, user A signs out and user B signs in on the same device and inherits user A's vote-highlight UI state on any hazard A had voted on.

### 5.4 Offline queue additions

`packages/core/src/contracts.ts`:

```
QueuedMutationType = 'hazard' | 'trip_start' | 'trip_end' | 'trip_track'
                   | 'trip_share' | 'feedback' | 'hazard_vote'

HazardVoteQueuePayload {
  hazardId: string
  direction: 'up' | 'down'
  clientSubmittedAt: string  // ISO timestamp
}
```

`apps/mobile/src/lib/offlineQueue.ts`:
- Extend `QueuedMutationPayloadByType` with `hazard_vote: HazardVoteQueuePayload`.
- Add a **collapse helper `castHazardVote(hazardId, direction)`** (rn-mobile-dev §5). Spec, quoted from the mobile plan:

  > *Before enqueueing, scan `queuedMutations` for any `type === 'hazard_vote'` entry with the same `hazardId` whose `status === 'queued'` and `retryCount === 0` — drop it (produce a new array without it), then append the fresh entry. Never touch entries that are `in_flight`, already `failed`, or have `retryCount > 0`; those are owned by the drain loop and collapsing them would race with the in-flight POST.*

  Server is last-write-wins per `(user, hazard)`; dragging ten vote flips across the wire is waste, but a vote that is already being drained must complete or retry as its own entity.

`apps/mobile/src/providers/OfflineMutationSyncManager.tsx`:
- Add a `case 'hazard_vote':` branch that calls `api.voteHazard(payload.hazardId, payload.direction)`; on success, dequeue; on `401/403`, stop and surface auth recovery (same behavior as existing branches); on network error, increment `retryCount` and leave queued.

### 5.5 `HazardDetailSheet` organism

Path: `apps/mobile/src/design-system/organisms/HazardDetailSheet.tsx`.

Props (from rn-mobile-dev spec):

```
interface HazardDetailSheetProps {
  hazard: NearbyHazard            // extended to include score/confirmCount/denyCount/userVote/expiresAt/lastConfirmedAt
  visible: boolean
  onDismiss: () => void
  onVote: (direction: 'up' | 'down') => void
  isVoting: boolean
}
```

**Visual spec (from frontend-expert):**
- `Modal` from `react-native` with `transparent` + `animationType="fade"`, backed by `Pressable` backdrop at `rgba(0,0,0,0.55)`.
- Sheet container: bottom-anchored, `backgroundColor: colors.surface`, `borderTopLeftRadius` / `borderTopRightRadius: radii.xl`, `paddingHorizontal: space[4]`, `paddingTop: space[3]`, `paddingBottom: insets.bottom + space[4]`.
- **Safe area (CLAUDE.md "Never" rule):** use `useSafeAreaInsets()` from `react-native-safe-area-context` to read `insets.bottom`. **Do NOT use `SafeAreaView` from `react-native`** — it is iOS-only and a no-op on Android. Wrap the sheet contents in a `<View>` with manual `paddingBottom: insets.bottom + space[4]`.
- `PanResponder` on the drag handle: translate-Y; on `dy > 120 || vy > 0.6`, call `onDismiss`; else spring back.
- Drag handle: 36×4 pill at top, `gray[400]`.
- `useReducedMotion()` guard: if true, skip spring translate + disable backdrop fade.
- Content: hazard icon (from `hazardIcons.ts` token), localized type label, age ("reported 2h ago"), current score (prominent, color-tokened per §6.2), thumbs-up / thumbs-down buttons (44pt min hit target), reporter display name (only if `trip_shares.public = true` on origin trip).

### 5.6 Navigation alert behavior

During `NAVIGATING`, `HazardAlert` renders (unchanged from caller's perspective) but internally the Yes/No buttons are replaced by upvote/downvote. Upvote fires `useHazardVote({ direction: 'up' })` — the server translates `'up'` → `'confirm'` (§3.1 wire-protocol mapping) and the existing `extend_hazard_on_confirm` trigger (§2) resets `expires_at = GREATEST(current, now() + baseline)` for the hazard type, so a confirmed hazard is back to full TTL. Downvote (`'down'` → `'deny'`) halves the remaining lifetime (trigger). Auto-dismissal after 10s without response remains `'pass'` (no score impact, metrics only).

---

## 6. Map Clustering (from frontend-expert spec)

### 6.1 `HazardLayers.tsx` changes

**Current:** a single `<Mapbox.ShapeSource id="hazards" shape={hazardFeatureCollection}>` feeding one `SymbolLayer`.

**After:**

```
<Mapbox.ShapeSource
  id="hazards"
  shape={hazardFeatureCollection}
  cluster={true}
  clusterRadius={50}
  clusterMaxZoom={14}
  clusterProperties={{
    max_severity: ['max', ['case',
      ['in', ['get', 'hazardType'], ['literal', ['accident','poor_surface','ice']]], 3,
      ['in', ['get', 'hazardType'], ['literal', ['pothole','dangerous_intersection','blocked_bike_lane']]], 2,
      1
    ]]
  }}
  onPress={(e) => {
    const feat = e.features?.[0];
    if (feat?.properties?.cluster) {
      // Tap-to-zoom via getClusterExpansionZoom ref method.
      clusterRef.current?.getClusterExpansionZoom(feat.properties.cluster_id)
        .then((zoom) => cameraRef.current?.setCamera({
          centerCoordinate: feat.geometry.coordinates,
          zoomLevel: zoom,
          animationDuration: 300
        }));
    } else {
      onHazardPress(feat.properties);
    }
  }}
>
  {/* Cluster bubbles */}
  <Mapbox.CircleLayer
    id="hazard-cluster-bubble"
    filter={['has', 'point_count']}
    style={{
      circleRadius: ['step', ['get', 'point_count'], 16, 5, 20, 15, 26],  // 3 size tiers
      circleColor: ['step', ['get', 'max_severity'],
        safetyColors.caution, 2, safetyColors.warning, 3, safetyColors.danger],
      circleStrokeWidth: 2,
      circleStrokeColor: brandColors.surface,
      circleEmissiveStrength: 1
    }}
  />
  <Mapbox.SymbolLayer
    id="hazard-cluster-count"
    filter={['has', 'point_count']}
    style={{
      textField: ['get', 'point_count_abbreviated'],
      textFont: ['Open Sans Bold'],
      textSize: 13,
      textColor: brandColors.textInverse,
      textEmissiveStrength: 1
    }}
  />

  {/* Individual markers (existing style) */}
  <Mapbox.SymbolLayer
    id="hazard-marker"
    filter={['!', ['has', 'point_count']]}
    style={{ /* existing icon / emissive-strength:1 config */ }}
  />
</Mapbox.ShapeSource>
```

**Remove the existing conditional-mount guard (QA round 2 BLOCKER C1):** `HazardLayers.tsx:86-103` currently wraps both sources in `{features.length > 0 ? ... : null}`. That is exactly error-log #12 — unmounting a ShapeSource leaves ghost markers because Mapbox RN caches rendered features. Fix:

- Delete the `{features.length > 0 ? ... : null}` guard around the `hazards` ShapeSource.
- Always render the source. When there are no hazards, pass an empty `FeatureCollection` (`{ type: 'FeatureCollection', features: [] }`) as `shape`. An empty collection renders zero symbols; the source stays mounted and no ghost state can accumulate.
- For POI-toggle-style hiding (future: user turns off hazards entirely via preference), use `key={hazardsVisible ? 'on' : 'off'}` to force a clean remount instead of a conditional unmount — same pattern CLAUDE.md documents under "Filter-based layer hiding".
- **Same fix applies to the `hazard-zones` ShapeSource** in `HazardLayers.tsx`. Flag as follow-up scope for this PR (small, related, and in the same file).

**`HazardLayersProps.onHazardPress` signature must widen (QA round 2 HIGH H4):** today `HazardLayers.tsx:56` types the callback payload as `{ id, type, confirmCount, denyCount }`. Widen to the full `NearbyHazard` shape (must additionally include `score`, `userVote`, `expiresAt`, `lastConfirmedAt`, `hazardType`, `lat`, `lon`, `createdAt`) so that a tap on a hazard marker can open `HazardDetailSheet` with every field it needs to render — without a second API round-trip to re-fetch the same data. Added to §5.1 modified-files note for `HazardLayers.tsx`.

**Critical CLAUDE.md rules respected:**
- **Filter-based layer visibility (error-log #12):** the `<Mapbox.ShapeSource id="hazards" ...>` stays mounted at all times — no conditional unmount, even when the feature list is empty. Cluster vs. marker visibility is controlled entirely by the `filter` expression on each child layer (`['has', 'point_count']` vs. `['!', ['has', 'point_count']]`).
- **No emoji in SymbolLayer textField (error-log #13):** `textField` uses `point_count_abbreviated` (plain digits + `K` suffix for 1K+). No emoji, no special characters.
- `textEmissiveStrength: 1` / `circleEmissiveStrength: 1` on all layers (immune to day/night lighting).
- Fonts use `Open Sans Bold` (Mapbox Studio default), not design-system font files.

### 6.2 Design tokens (proposed)

Add to `apps/mobile/src/design-system/tokens/colors.ts`:

```
export const hazardScore = {
  positive: safetyColors.safe,       // #34C759-ish, score >= +3
  neutral:  gray[300],                // -2 .. +2
  negative: safetyColors.danger,      // #E53935, score <= -3
};

export const hazardCluster = {
  low:      safetyColors.caution,     // max_severity = 1
  medium:   '#F57C00',                // max_severity = 2 (add as safetyColors.warning)
  high:     safetyColors.danger,      // max_severity = 3
};
```

Add missing `safetyColors.warning` (amber-orange, between caution and danger) while we're there.

Promote inline `HAZARD_ICONS` map from `HazardAlert.tsx` into new token file `apps/mobile/src/design-system/tokens/hazardIcons.ts` so `HazardDetailSheet` can reuse.

### 6.3 Vote-button visual design

`HazardAlert.tsx` vote row:
- Thumbs-up button: `Ionicons thumbs-up-outline` (size 20), 44×44 hit target, `radii.lg`. Active (user voted up): fill to `thumbs-up` solid + ring in `brandColors.accent`. Pressed: opacity 0.6.
- Thumbs-down button: symmetric with `thumbs-down-outline`.
- Score display between the two buttons: center text, bold, color from `hazardScore.positive|neutral|negative`. Include sign (`+3`, `0`, `-2`).
- Disabled state while `isVoting`: opacity 0.5, `pointerEvents="none"`.
- Accessibility labels: "Upvote hazard, still there" / "Downvote hazard, no longer present", `accessibilityState={{ selected: userVote === 'up' }}`.

Same button cluster is reused inside `HazardDetailSheet`.

---

## 7. Test Plan

### 7.1 Unit tests (vitest) — `packages/core`

`packages/core/src/__tests__/hazardExpiry.test.ts`:
- `calculateExpiry('pothole')` → `now + 14d ± 1s`.
- `calculateExpiry('poor_surface')` → `now + 4h ± 1s`.
- `calculateExpiry('unknown')` → `now + 24h` (fallback).

### 7.2 Integration tests (vitest + mocked supabase) — `services/mobile-api`

`services/mobile-api/src/__tests__/hazards-vote.test.ts`:

| Test name | Assertion |
|---|---|
| `vote_rejects_anonymous` | `POST /v1/hazards/:id/vote` without JWT → 401 |
| `vote_rejects_anon_supabase_token` | anonymous Supabase session (non-OAuth) → 401 (matches `requireFullUser`) |
| `vote_rejects_invalid_direction` | body `{ direction: 'sideways' }` → 400 |
| `vote_maps_up_to_confirm_response` | body `{direction:'up'}` → `hazard_validations.response === 'confirm'` |
| `vote_maps_down_to_deny_response` | body `{direction:'down'}` → `hazard_validations.response === 'deny'` |
| `vote_upserts_validation_row` | second POST from same user overwrites existing row |
| `vote_up_increments_confirm_count_and_score` | confirm_count +1, generated score = confirm_count - deny_count |
| `vote_down_halves_remaining_expiry` | `new expires_at ≈ now + (old_expires_at - now)/2` (± 1s) |
| `vote_flip_up_to_down_updates_aggregates` | after one flip from `up` → `down`, final state is `confirm_count=0, deny_count=1, score=-1` (QA round 2 M1 — trigger decrements OLD response before applying NEW). Not `1/1/0`, not `0/1/-2`. |
| `vote_response_returns_required_fields` | `hazardId, score, confirmCount, denyCount, userVote, expiresAt` all present |
| `vote_awards_xp_qualifier` | `qualifyStreakAsync` called with `'hazard_validate'` |
| `vote_resurrection_guard` | hazard with `expires_at < now - 7d` + confirm → counts bump, `expires_at` NOT rewound |
| `expired_hazard_vote_does_not_resurrect` | QA round 2 M3: hazard with `expires_at < now()` but inside 7d grace → confirm updates `confirm_count` but the trigger's resurrection branch is NOT entered (it fires only past the 7d window); however the standard branch still bumps `expires_at = GREATEST(expires_at, now + baseline)`, so a vote WITHIN the grace window legitimately extends. Test pairs with the guard: covers both sides of the 7d boundary. |

`services/mobile-api/src/__tests__/hazards-expire.test.ts`:

| Test name | Assertion |
|---|---|
| `expire_rejects_missing_cron_secret` | no auth header → 401 |
| `expire_rejects_wrong_cron_secret` | `Bearer wrong` → 401 (matches leaderboard.ts:282-284) |
| `expire_500_when_cron_secret_not_configured` | env var unset on server → 500 |
| `expire_purges_score_below_threshold_after_dwell` | `score = -3` + `last_confirmed_at > now-24h` → kept; after 24h → deleted |
| `expire_deletes_past_grace_window` | `expires_at < now - 7d` → deleted |
| `expire_spares_within_grace_window` | `expires_at < now` but within 7d → kept (hidden from nearby but retained) |
| `expire_returns_counts` | `{ deletedCount, purgedCount, runAt }` shape |

`services/mobile-api/src/__tests__/hazards-nearby.test.ts`:

| Test name | Assertion |
|---|---|
| `nearby_filters_expired_hazards` | hazard with `expires_at < now()` not returned |
| `nearby_filters_hidden_hazards` | hazard with `score <= -3` not returned (hide threshold) |
| `nearby_includes_score_fields` | response payload carries `score`, `confirmCount`, `denyCount`, `userVote`, `expiresAt`, `lastConfirmedAt` |
| `nearby_strips_unscheme_fields` | negative control: a field NOT in `nearbyHazardItemSchema` added by the handler is dropped by Fastify (locks in error-log #22 protection) |
| `nearby_sets_userVote_to_null_when_no_validation_row` | for caller without prior vote |
| `nearby_maps_confirm_to_up_in_userVote` | caller's prior `response='confirm'` → `userVote='up'` in response |

### 7.3 Mobile tests (vitest + @testing-library/react-native) — `apps/mobile`

`apps/mobile/src/hooks/__tests__/useHazardVote.test.ts`:

| Test name | Assertion |
|---|---|
| `optimistic_update_patches_cache` | `useNearbyHazards` cache mutated before server responds |
| `rollback_on_error_restores_cache` | 500 response → cache + store reverted |
| `offline_enqueues_hazard_vote` | `ConnectivityMonitor` offline → queue gains 1 entry |
| `vote_collapse_overwrites_pending_queue_entry` | queueing up then down → 1 entry with direction=down |

`apps/mobile/src/design-system/molecules/__tests__/HazardAlert.test.tsx`:

| Test name | Assertion |
|---|---|
| `renders_thumbs_up_and_down_buttons` | a11y role + labels present |
| `highlights_active_vote_direction` | `userVote='up'` → upvote button has `accessibilityState.selected` |
| `disables_buttons_while_voting` | `isVoting=true` → both buttons `pointerEvents=none` |
| `score_color_matches_token_for_positive_range` | score=+3 → `hazardScore.positive` |

`apps/mobile/src/design-system/organisms/__tests__/HazardDetailSheet.test.tsx`:

| Test name | Assertion |
|---|---|
| `renders_when_visible` | modal visible + backdrop present |
| `swipe_down_beyond_threshold_dismisses` | PanResponder release with `dy=150` → `onDismiss` called |
| `reduced_motion_skips_animations` | `useReducedMotion()=true` → no spring Animated.Value calls |

`apps/mobile/src/components/map/layers/__tests__/HazardLayers.test.tsx` (snapshot + filter assertions):

| Test name | Assertion |
|---|---|
| `cluster_layer_has_point_count_filter` | `hazard-cluster-bubble` filter === `['has', 'point_count']` |
| `marker_layer_has_negated_filter` | `hazard-marker` filter === `['!', ['has', 'point_count']]` |
| `cluster_radius_is_50` | ShapeSource prop |
| `tap_on_cluster_calls_camera_setCamera` | simulate onPress with `cluster: true` feature |

### 7.4 E2E / manual QA (phone)

- Drop a hazard → upvote from navigation alert → verify `expires_at` extends in DB.
- Drop a hazard → downvote twice → verify deletion by next day's cron (or manual `POST /v1/hazards/expire`).
- Zoom out past `clusterMaxZoom=14` → verify bubbles appear. Tap → verify camera zooms in.
- Go offline → vote → go online → verify OfflineMutationSyncManager drains the queue.
- Kill app between enqueue and drain → verify queue survives restart (existing Zustand persist behavior).

---

## 8. Rollout Plan

### Phase order
1. **Migration first** (additive-only, backward-compatible). Apply via Supabase MCP `apply_migration`. The migration adds a `GENERATED ALWAYS AS (confirm_count - deny_count) STORED` column (Postgres fills it automatically — **no backfill needed**), two indexes, and refines the body of the already-existing `extend_hazard_on_confirm()` trigger. Zero column drops, zero CHECK changes, zero data mutations — safe to apply while the old API is still serving.
2. **API deploy — TWO steps (CLAUDE.md gotcha: `builds submit` alone does NOT deploy):**
   ```bash
   # Step A — build + push image to Artifact Registry (does NOT create a new revision)
   gcloud builds submit --config cloudbuild.yaml --timeout=600 \
     --project=gen-lang-client-0895796477

   # Step B — create a new Cloud Run revision that serves the new image
   gcloud run deploy defpedal-api \
     --image europe-central2-docker.pkg.dev/gen-lang-client-0895796477/defpedal-api/mobile-api:latest \
     --region europe-central2 \
     --platform managed \
     --allow-unauthenticated \
     --project=gen-lang-client-0895796477
   ```
   Expected new revision: `defpedal-api-00051-*` (next after `00050-n2k` from the Mia rollout). Verify by hitting `GET /v1/healthz` and checking `X-Cloud-Revision` in the response headers.
3. **Cloud Scheduler cron creation** (see §4.1). Create with `--paused` first, manually trigger once via `gcloud scheduler jobs run hazards-expire-cron --location=europe-central2 --project=gen-lang-client-0895796477`, verify response in Cloud Run logs, then `gcloud scheduler jobs resume hazards-expire-cron --location=europe-central2 --project=gen-lang-client-0895796477`.
4. **Mobile release** — `npm run check:bundle` (MUST be 200), then `npm run typecheck`, then `npm run build:preview:install` for preview APK. Dev APK flow: `cd apps/mobile/android && ./gradlew installDebug`.
5. **Commit + push** — CLAUDE.md workflow: bundle check → phone test → commit → update `progress.md` → push (pre-push hook runs typecheck).

### Feature flags
Not required. The voting endpoint is additive; old Yes/No alert code is replaced in a single PR. Migration is backward-compatible with the current mobile app — stragglers on old builds keep posting `'confirm'` / `'deny'` to `/hazards/:id/validate`, which is unchanged and still triggers the (refined) aggregate logic.

### Backfill
**None required.** The new `score` column is `GENERATED ALWAYS AS (confirm_count - deny_count) STORED` — Postgres populates it at `ALTER TABLE` time and keeps it in sync on every write. No manual `UPDATE hazards SET score = ...` is needed or valid (you cannot `UPDATE` a generated column).

---

## 9. Open Questions / Risks

1. **Abuse / Sybil voting.** One vote per authenticated user per hazard is enforced by the unique constraint, but anonymous Supabase users can create multiple accounts. Mitigation deferred; we may add `score` weighting by `profiles.total_xp` or cap votes from accounts < 7 days old.
2. **Cluster icon semantics.** When a cluster contains mixed hazard types, we color by worst severity (`max_severity`). Is that more informative than a neutral brand color? The frontend-expert recommendation is worst-severity; revisit after 2 weeks of user feedback.
3. **Downvote expiry halving.** Halving the remaining lifetime (not the baseline) means a freshly-reported hazard with one downvote is still nearly at full lifetime, while an older hazard with a downvote gets aggressively shortened. Intended behavior, but worth monitoring.
4. **Offline vote reconciliation.** If a user votes up offline, then later flips to down offline, the collapse rule keeps only the latest — but if the *server* saw a real concurrent vote via another device, the drain will overwrite. Last-write-wins per `(user, hazard)` is acceptable but worth noting in the docs.
5. **Cluster tap-to-zoom on pitched camera during navigation.** The 3D follow camera in `NAVIGATING` (`pitch=45, zoom=16`) is above `clusterMaxZoom=14`, so clusters shouldn't appear during navigation. Verify on phone; if clusters do appear, either **lower `clusterMaxZoom`** (so individual markers take over at lower zoom levels) or **pass `cluster={false}` when `appState === 'NAVIGATING'`** to disable clustering entirely while the follow camera is active. (Raising `clusterMaxZoom` would do the opposite — force clustering at higher zooms — which is the wrong fix.)
6. **TanStack Query cache invalidation race with optimistic update.** Offline branch must NOT call `queryClient.invalidateQueries` — doing so would trigger a refetch that overwrites the optimistic patch before the queue drains. Specified in §5.2; call out in code review.
7. **Badge integration follow-up (not v1).** The existing `check_and_award_badges` RPC evaluates badge criteria on ride completion / dashboard visit / Trophy Case visit. With a real voting signal, a "Trusted Reporter" criterion (e.g., *≥10 of your reported hazards received ≥3 confirm votes*) becomes cheap to evaluate off the new `score`/`confirm_count` columns. Flag as a v2 follow-up — not in scope for this plan, no migration / API work required upfront.
8. **Sybil / anonymous-account abuse.** One vote per authenticated user per hazard is enforced by the unique constraint, and `requireFullUser()` already rejects anonymous Supabase sessions on `POST /hazards/:id/vote`. But a bad actor could still create multiple OAuth accounts. Mitigation deferred; candidates include weighting `score` by `profiles.total_xp` or disallowing votes from accounts < 7 days old.

---

## 10. Effort Estimate

| Phase | Scope | Est. engineer-days |
|---|---|---|
| 1. Migration (additive-only, generated column auto-populates) | Single SQL file, ~130 lines; test via Supabase MCP sandbox first | 0.5 |
| 2. API endpoints | `/hazards/:id/vote` + `/hazards/expire` + schema updates to `/nearby` + tests | 1.5 |
| 3. Cron + Cloud Run deploy | Scheduler command + verify `CRON_SECRET` + smoke | 0.5 |
| 4. Mobile — hook + store + queue | `useHazardVote`, Zustand additions, queue type + sync manager branch + collapse rule | 1.5 |
| 5. Mobile — HazardAlert + HazardDetailSheet | Rewrite alert UI, build sheet organism w/ PanResponder | 2.0 |
| 6. Mobile — clustering | `HazardLayers.tsx` rewrite, tap-to-zoom, camera interop | 1.0 |
| 7. Tests | Unit + integration + mobile component tests (~20 new tests) | 1.5 |
| 8. Manual QA + phone testing | Bundle check, flow coverage, offline / cluster / vote | 1.0 |
| **Total** | | **~9.5 engineer-days** |

Stretch: Sybil mitigations, abuse logging dashboards, and per-hazard-type TTL tuning from real data — another 2-3 days, not in scope for v1.
