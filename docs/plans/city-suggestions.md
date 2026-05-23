# City Suggestions — Plan

**Status:** ✅ Shipped 2026-05-23 (session 58). Cloud Run revision `defpedal-api-00081-69b`, migration `202605230002_create_city_suggestions.sql` applied. See `progress.md` "Session 58" for the full implementation notes.
**Owner:** team-lead (planning), implemented by Claude (2026-05-23)
**Date drafted:** 2026-05-23
**Related screens:** `apps/mobile/app/route-planning.tsx` (FAB lives here — see "Scope change during implementation" below)
**Related infra:** `city_suggestions` Supabase table, `POST /v1/city-suggestions` Fastify endpoint, dedicated `citySuggestion` rate-limit bucket (5/hour)

---

## Scope change during implementation (2026-05-23)

The original brief put the entry-point FAB on `route-preview.tsx` and this plan was written against that. After the route-preview implementation shipped and the user verified the flow worked, the user revised the brief: **the FAB should live on `route-planning.tsx` instead, directly under the existing yellow hazard FAB, sharing the same accent-yellow color treatment** (not the info-blue the plan originally specified).

What changed in the implementation vs this document:
- **Host screen:** `route-planning.tsx`, not `route-preview.tsx`. All suggestion state, FAB, footer-swap, modal, and toast were removed from route-preview.
- **FAB color:** `colors.accent` (yellow) instead of `colors.info` (blue). Matches the existing hazard FAB's on/off visual treatment exactly; only the glyph differs (`bulb-outline` vs `warning`).
- **Mutex with hazard mode:** opening one cancels the other (`toggleHazardMode` / `toggleSuggestionMode` each force-off the other; `handleMapTap` and `handleMapLongPress` extended to suppress during either mode).
- **Footer cascade:** `suggestionPlacementMode ? suggestion-footer : hazardPlacementMode ? hazard-footer : normal`.
- **Crosshair:** unified `RouteMap` to `crosshairMode: 'hazard' | 'suggestion' | null`; legacy `hazardPlacementMode` boolean kept one release as a `@deprecated` alias so the route-planning hazard flow didn't have to migrate in this PR.

The Database, API, offline-queue, hook, organism, and i18n sections of this plan all shipped as-described — only the FAB host screen and color moved.

---

## Implementation deltas worth noting (vs plan)

- **Migration filename:** `202605230002_create_city_suggestions.sql` (apply-date 2026-05-23, ordinal 0002), not the `202605240001_…` placeholder in the plan.
- **`recentCitySuggestions` cap:** 5 (matches plan).
- **Suggestion body length:** 500 chars (matches plan).
- **Rate limit defaults:** 5/hour, env-overridable via `RATE_LIMIT_CITY_SUGGESTION_MAX` / `RATE_LIMIT_CITY_SUGGESTION_WINDOW_MS` (matches plan).
- **Schemas file:** lives at `services/mobile-api/src/lib/citySuggestionSchemas.ts` (matches plan).
- **Display surface still NOT shipped in v1** — `useCitySuggestionsNearby` is wired with a stable URL but the call site is intentionally omitted from any screen. The server's `GET /v1/city-suggestions/nearby` is a stub returning `[]`. This stays as a follow-up PRD as planned.
- **Mascot:** not added to this surface (plan said out-of-scope; held).

---

---

## Summary

Add a "Suggest improvement" affordance on the route-preview screen so riders can flag specific spots on the map (a poorly-placed bollard, a missing bike lane, a confusing intersection, a route that didn't account for a closed road) and leave a free-text note for the dev team. UX mirrors the existing hazard-reporting crosshair flow on route-planning: tap a FAB → enter map-placement mode with a crosshair that tracks the map center → pan to position → tap "Confirm location" → modal opens with a textarea → submit. Submissions are stored in a new `city_suggestions` Supabase table independent from `hazards`, never expire, and are visible only to the user who submitted them and to the dev team via service-role queries (no public/community read in v1).

---

## Out of scope (v1)

- **Not shown during navigation.** The flow lives on `route-preview.tsx` only. The FAB does NOT appear in `navigation.tsx`; suggestions are not surfaced as proximity alerts the way hazards are. (Explicit user requirement.)
- **No expiry.** Unlike hazards (auto-TTL by type), suggestions persist indefinitely; the dev team triages and resolves them out-of-band.
- **No upvote/downvote / community moderation.** This is a private channel to the dev team, not a community surface.
- **No public/community read endpoint.** RLS allows the user to read their own rows and service-role to read all; no `GET /v1/city-suggestions` public list in v1.
- **No in-app admin UI.** Triage happens via the Supabase dashboard (or a future internal tool) using the service-role key.
- **No reverse-geocode enrichment server-side.** The mobile client may pass a best-effort `locality` hint; we don't fetch addresses on the server.
- **No image attachments.** Text + coordinate only in v1.
- **No notifications back to the user.** No "your suggestion was resolved" push in v1.
- **No FAB on `route-planning.tsx`.** That screen is for destination search; adding a third FAB there is clutter. (Decision noted in Open Questions.)
- **No flow on `navigation.tsx`.** Safety-critical screen, no taps that aren't navigation-related.

---

## UX flow

Entry state: user is on `route-preview.tsx`, has a route loaded (`selectedRoute != null`), `appState === 'ROUTE_PREVIEW'`.

1. **FAB visible.** A floating "Suggest improvement" button (bulb-outline icon) is rendered alongside the existing share/save buttons. Tap target ≥ 44pt. Haptic intent `'snap'` via `PressableScale`.
2. **Tap FAB → enter placement mode.** `suggestionPlacementMode` flips to `true`. The map exits any other mode (hazard mode is mutually exclusive, see RouteMap refactor below). The `CrosshairOverlay` appears centered over the map (50% from top, slightly above bottom-sheet peek). The MapStageScreen bottom sheet collapses to peek if currently expanded so the user can see the map. The footer Start-navigation primary button is replaced with a `Cancel | Confirm location` pair. The FAB icon swaps to `close` and its background lights up to indicate active mode (same visual pattern as the hazard FAB in route-planning).
3. **Pan to position.** As the user drags the map, `RouteMap` emits `onCenterChange({lat, lon})` which updates `suggestionCenterCoordinate` in component state on every camera move. The crosshair is purely visual (a pointer-events:none overlay); user sees it stay fixed in screen space while the map moves beneath it.
4. **Tap "Confirm location"** in the footer. `suggestionDialogVisible` flips to `true`. Map-placement mode is left intact in the background so if the user cancels the dialog they can re-pan.
5. **Modal opens.** A centered card (same pattern as the existing Save Route modal in `route-preview.tsx`) wrapped in `KeyboardAvoidingView`. Title: "Suggest an improvement". Helper text: "Tell us what's wrong here or how we could make this safer." Multiline `TextInput` (autoFocus, max 500 chars). Live character counter "N / 500" turns amber at 450 and red at 500. Two buttons: `Cancel` (ghost) and `Submit` (primary, disabled until trimmed body length ≥ 1 and ≤ 500).
6. **Tap Submit.** Online → call `mobileApi.submitCitySuggestion(payload)`, show success toast ("Suggestion sent — thanks!"). Offline → `enqueueMutation('city_suggestion', payload)`, show offline toast ("Saved — will send when you're back online"). Modal dismisses; `suggestionPlacementMode` resets to `false`; FAB returns to idle state.
7. **Tap Cancel anywhere** → exits the current step only. Cancel-in-modal → modal closes, placement mode stays. Cancel-in-footer → placement mode exits, returns to normal preview.
8. **Backstop reset.** When the screen unmounts (router pop or state-machine transition out of `ROUTE_PREVIEW`), `suggestionPlacementMode` is implicitly reset by component unmount. No persisted UI state for this flow.

**Empty trim guard.** Body is `.trim()`'d before measuring length, so 500 spaces won't pass.

**One-shot click guard.** A `useRef<boolean>(false)` flag prevents double-submit from rapid taps on the Submit button (mirrors `navigationStartedRef` in the same file).

---

## Database schema

New table `public.city_suggestions`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `user_id` | `uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` | Cascade per error-log #33; never use SET NULL — anonymous suggestions are blocked at write time anyway |
| `location` | `geography(Point, 4326) NOT NULL` | PostGIS, mirrors `trips.start_location` convention |
| `lat` | `double precision NOT NULL CHECK (lat BETWEEN -90 AND 90)` | Mirror column for cheap reads (no PostGIS function call) |
| `lon` | `double precision NOT NULL CHECK (lon BETWEEN -180 AND 180)` | Mirror column for cheap reads |
| `body` | `text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500)` | Server-side hard cap; client also enforces |
| `locality` | `text` | Optional client-supplied reverse-geocode hint; not authoritative |
| `route_context` | `jsonb` | Optional snapshot `{mode, distanceMeters, routeId}` for triage |
| `status` | `text NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','resolved','rejected'))` | Admin workflow; v1 only ever writes `'open'` |
| `admin_notes` | `text` | Internal triage; not exposed via API |
| `source` | `text NOT NULL DEFAULT 'route_preview' CHECK (source IN ('route_preview'))` | Discriminator for surface that originated the suggestion; extensible without schema change later |
| `client_submitted_at` | `timestamptz` | Client-clock timestamp; useful for offline-queue latency analytics (nullable so old rows are fine) |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | Server insert time — canonical |

**Indexes:**
- `idx_city_suggestions_created_at_desc ON city_suggestions (created_at DESC)` — admin list
- `idx_city_suggestions_location_gist ON city_suggestions USING GIST (location)` — spatial clustering
- `idx_city_suggestions_user_created ON city_suggestions (user_id, created_at DESC)` — future "My suggestions" tab

**RLS (per qa-agent HIGH finding):**
- `ENABLE ROW LEVEL SECURITY`
- `INSERT` policy: authenticated full users only — `auth.uid() = user_id AND coalesce(auth.jwt()->>'is_anonymous', 'false') <> 'true'` (matches the `requireFullUser` gate on the API; defense-in-depth at the DB layer)
- `SELECT` policy (own rows): `auth.uid() = user_id` — keeps the door open for a future "My suggestions" tab without re-opening the table
- **No public/community SELECT.** No `UPDATE`/`DELETE` policies. Admin reads/triage use the service-role key (which bypasses RLS).

No triggers, no `SECURITY DEFINER` functions in v1 → error-log #28 (search_path) is N/A for now. If a trigger is added later (e.g. to backfill `locality` from PostGIS reverse-geocode), it MUST include `SET search_path = public, auth, pg_temp`.

---

## Migration

Filename: `supabase/migrations/202605240001_create_city_suggestions.sql` (next-day timestamp; if applied same-day on 2026-05-23, rename to `202605230002_...` — error-log convention is YYYYMMDDNNNN by *apply* date, not plan date).

```sql
-- City suggestions — private, location-tagged free-text feedback from riders to
-- the dev team. Stored independently from `hazards` because:
--   (a) hazards have type-based TTL + community voting; suggestions never expire
--       and don't have a vote concept
--   (b) hazards are surfaced during navigation; suggestions are explicitly NOT
--       (user requirement, see docs/plans/city-suggestions.md)
--   (c) hazards are a community surface; suggestions are a private channel to
--       the dev team

begin;

create table if not exists public.city_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location geography(Point, 4326) not null,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  body text not null check (char_length(body) between 1 and 500),
  locality text,
  route_context jsonb,
  status text not null default 'open'
    check (status in ('open','triaged','resolved','rejected')),
  admin_notes text,
  source text not null default 'route_preview'
    check (source in ('route_preview')),
  client_submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_city_suggestions_created_at_desc
  on public.city_suggestions (created_at desc);

create index if not exists idx_city_suggestions_location_gist
  on public.city_suggestions using gist (location);

create index if not exists idx_city_suggestions_user_created
  on public.city_suggestions (user_id, created_at desc);

alter table public.city_suggestions enable row level security;

-- INSERT: full users only (no anonymous), and only as themselves.
-- Defense-in-depth: API also rejects anonymous via requireFullUser, but RLS
-- ensures the rule holds even if the API auth gate ever regresses.
create policy "city_suggestions_insert_own_full_user"
  on public.city_suggestions
  for insert
  with check (
    auth.uid() = user_id
    and coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true'
  );

-- SELECT: own rows only. No public read in v1.
create policy "city_suggestions_select_own"
  on public.city_suggestions
  for select
  using (auth.uid() = user_id);

-- No UPDATE/DELETE policies. Admin actions use the service-role key.

commit;
```

---

## API endpoint

### `POST /v1/city-suggestions`

- **File:** `services/mobile-api/src/routes/v1.ts` — declared inside the existing `buildV1Routes` Fastify plugin closure (error-log #11).
- **Auth:** `requireFullUser(request, dependencies.authenticateUser)` — anonymous Supabase sessions are rejected with 403. Matches the hazard-vote pattern (`v1.ts:1010`). This is qa-agent's CRITICAL finding: location-tagged free-text feedback to the dev team requires verified account identity for moderation/abuse response.
- **Rate limit:** new dedicated bucket `citySuggestion` — 5 requests per user per hour (vs `write`'s 20/min, which is far too generous for a deliberate, high-cost-to-review surface).

### Rate-limit config addition

In `services/mobile-api/src/config.ts` `rateLimits` block (around line 91):

```ts
citySuggestion: {
  limit: parsePositiveNumber(
    resolveConfigValue(['RATE_LIMIT_CITY_SUGGESTION_MAX'], '5'),
    5,
  ),
  windowMs: parsePositiveNumber(
    resolveConfigValue(['RATE_LIMIT_CITY_SUGGESTION_WINDOW_MS'], '3600000'),
    3600000,
  ),
},
```

Cloud Run env vars: `RATE_LIMIT_CITY_SUGGESTION_MAX=5`, `RATE_LIMIT_CITY_SUGGESTION_WINDOW_MS=3600000`.

### Request schema (`citySuggestionRequestSchema`)

```ts
const citySuggestionRequestSchema = {
  type: 'object',
  required: ['coordinate', 'body', 'submittedAt', 'source'],
  additionalProperties: false,
  properties: {
    coordinate: {
      type: 'object',
      required: ['lat', 'lon'],
      additionalProperties: false,
      properties: {
        lat: { type: 'number', minimum: -90, maximum: 90 },
        lon: { type: 'number', minimum: -180, maximum: 180 },
      },
    },
    body: { type: 'string', minLength: 1, maxLength: 500 },
    submittedAt: { type: 'string', format: 'date-time' },
    source: { type: 'string', enum: ['route_preview'] },
    locality: { type: 'string', maxLength: 200, nullable: true },
    routeContext: {
      type: 'object',
      nullable: true,
      additionalProperties: false,
      properties: {
        mode: { type: 'string', enum: ['safe', 'fast', 'flat'] },
        distanceMeters: { type: 'number', minimum: 0 },
        routeId: { type: 'string', maxLength: 64 },
      },
    },
  },
} as const;
```

`submittedAt` is the client-clock ISO timestamp at the moment the user tapped Send (useful for offline-queued submissions arriving days later). The server still uses `now()` for the canonical `created_at`; `submittedAt` is stored as `client_submitted_at` for analytics on offline-queue latency. `source` is a discriminator left in for future surfaces (history map, community feed). Add a `client_submitted_at timestamptz` column to the table (see Migration update below).

### Response schema (`citySuggestionResponseSchema`)

Per error-log #22 / Gotcha #9 — must be complete; Fastify silently drops undeclared response fields.

```ts
const citySuggestionResponseSchema = {
  type: 'object',
  required: ['id', 'createdAt', 'status'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
    status: { type: 'string', enum: ['open'] },
  },
} as const;
```

If response shape ever changes (e.g. echo back the user's own suggestion list count), every new field must be added to `properties` + `required`.

### Handler skeleton (sketch)

```ts
app.post<{ Body: CitySuggestionBody; Reply: CitySuggestionResponse | ErrorResponse }>(
  '/city-suggestions',
  {
    schema: {
      body: citySuggestionRequestSchema,
      response: {
        200: citySuggestionResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        429: errorResponseSchema,
        502: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
  },
  async (request, reply) => {
    const user = await requireFullUser(request, dependencies.authenticateUser);
    await applyRateLimit(request, reply, dependencies, 'citySuggestion', {
      userId: user.id,
    });

    const body = request.body.body.trim();
    if (body.length === 0) {
      throw new HttpError('Suggestion body cannot be empty.', {
        statusCode: 400,
        code: 'INVALID_INPUT',
      });
    }

    try {
      return await dependencies.submitCitySuggestion(
        {
          coordinate: request.body.coordinate,
          body,
          submittedAt: request.body.submittedAt,
          source: request.body.source,
          locality: request.body.locality ?? null,
          routeContext: request.body.routeContext ?? null,
        },
        user.id,
      );
    } catch (error) {
      throw new HttpError('City suggestion submission failed.', {
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
        details: [error instanceof Error ? error.message : 'Unknown upstream error.'],
      });
    }
  },
);
```

### New dependency: `submitCitySuggestion`

In `services/mobile-api/src/lib/submissions.ts`:

```ts
export interface CitySuggestionInsert {
  coordinate: { lat: number; lon: number };
  body: string;
  submittedAt: string;
  source: 'route_preview';
  locality: string | null;
  routeContext: {
    mode: 'safe' | 'fast' | 'flat';
    distanceMeters: number;
    routeId?: string;
  } | null;
}

export interface CitySuggestionResult {
  id: string;
  createdAt: string;
  status: 'open';
}

export const submitCitySuggestion = async (
  input: CitySuggestionInsert,
  userId: string,
): Promise<CitySuggestionResult> => {
  const { data, error } = await supabaseAdmin
    .from('city_suggestions')
    .insert({
      user_id: userId,
      lat: input.coordinate.lat,
      lon: input.coordinate.lon,
      location: `SRID=4326;POINT(${input.coordinate.lon} ${input.coordinate.lat})`,
      body: input.body,
      source: input.source,
      client_submitted_at: input.submittedAt,
      locality: input.locality,
      route_context: input.routeContext,
    })
    .select('id, created_at, status')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Insert failed');
  }

  return { id: data.id, createdAt: data.created_at, status: 'open' };
};
```

(Wired through `dependencies.submitCitySuggestion` in `services/mobile-api/src/lib/dependencies.ts`.)

### Mobile API client

In `apps/mobile/src/lib/api.ts`, add:

```ts
async submitCitySuggestion(payload: CitySuggestionRequest): Promise<CitySuggestionResponse> {
  return this.request('/v1/city-suggestions', { method: 'POST', body: payload });
}

async getNearbyCitySuggestions(
  lat: number,
  lon: number,
  radiusMeters = 1000,
): Promise<NearbyCitySuggestion[]> {
  return this.request(
    `/v1/city-suggestions/nearby?lat=${lat}&lon=${lon}&radius=${radiusMeters}`,
    { method: 'GET' },
  );
}
```

Types `CitySuggestionRequest` / `CitySuggestionResponse` / `NearbyCitySuggestion` exported from `packages/core/src/contracts.ts` so both server and mobile share them.

### Stub endpoint: `GET /v1/city-suggestions/nearby` (v1 returns `[]`)

Wired but stubbed so the mobile hook `useCitySuggestionsNearby` has a stable URL when a display surface ships. Returns an empty array in v1 regardless of `lat`/`lon`/`radius`. Auth: `requireAuthenticatedUser` (allows anonymous reads — they can see public suggestion previews if/when display ships). Rate limit: reuse `routePreview` bucket (30/min). Response schema returns an empty array of `NearbyCitySuggestion` items per error-log #22 (full schema must be declared even when returning `[]`).

---

## Mobile changes

### Pattern + reuse

The "FAB → quick-pick → crosshair → confirm" flow already exists for hazards on `apps/mobile/app/route-planning.tsx` (state `hazardPlacementMode`, `mapCenterCoordinate`, handler `handleHazardPlacementConfirm` at lines 215-432). We replicate this pattern on `route-preview.tsx` and **generalise the RouteMap prop** so both surfaces can drive the same crosshair atom without colliding.

Reusable pieces we get for free:
- `apps/mobile/src/components/map/overlays/CrosshairOverlay.tsx` (atom — kept props-less in v1; same yellow "+" + "Move map to position" label for both modes).
- `MapStageScreen` (bottom sheet + footer slot + right overlay slot — already mounted by `route-preview.tsx`).
- `onCenterChange` plumbing in `RouteMap.tsx:97-167` — already feeds back live map-centre coordinates from `onCameraChanged`. Gated so it only fires when crosshair mode is active (zero perf cost otherwise).

Nothing on the navigation HUD, hazard layers, hazard alert stack, hazard detail sheet, or hazard-vote queue is touched.

### RouteMap unified-prop refactor

Picks option (a) from the brief: a single `crosshairMode` prop, with the existing `hazardPlacementMode` boolean kept one release as a deprecated alias so the route-planning hazard flow doesn't have to migrate in the same PR.

```ts
// apps/mobile/src/components/map/types.ts — additive
export type CrosshairMode = 'hazard' | 'suggestion' | null;

export interface RouteMapProps {
  // ...existing props...
  crosshairMode?: CrosshairMode;
  /** @deprecated — use crosshairMode='hazard'. Retained one release so
   *  route-planning hazard flow doesn't have to migrate in the same PR. */
  hazardPlacementMode?: boolean;
}
```

```ts
// apps/mobile/src/components/map/RouteMap.tsx
// Derive a single resolved mode at the top of the component:
const resolvedCrosshairMode: CrosshairMode =
  crosshairMode ?? (hazardPlacementMode ? 'hazard' : null);

// Replace line 362 conditional:
{resolvedCrosshairMode !== null ? <CrosshairOverlay /> : null}

// Replace line 265 onCameraChanged gate:
onCameraChanged={
  (onCenterChange && resolvedCrosshairMode !== null) ? handleCameraChanged : undefined
}
```

If a future iteration needs mode-specific colour or copy on the overlay itself, lift a `mode` prop into `CrosshairOverlay` then — not now.

**Migration path** (one PR for this feature; cleanup follow-up):
- This PR: `route-preview.tsx` uses `crosshairMode='suggestion'`; `route-planning.tsx` keeps passing the legacy `hazardPlacementMode` boolean. Both work via the derivation.
- Follow-up PR: swap `route-planning.tsx` to `crosshairMode={hazardPlacementMode ? 'hazard' : null}`, then delete the deprecated boolean + the fallback line. Trivial.

### Files to create

| Absolute path | Purpose |
|---|---|
| `C:\dev\defpedal\apps\mobile\src\design-system\organisms\CitySuggestionSheet.tsx` | Modal overlay with multiline `TextInput` (maxLength 500, char counter `{n}/500`), Send/Cancel buttons, KeyboardAvoidingView. Same backdrop pattern as the hazard quick-pick in `route-planning.tsx:1296-1335`. Standalone organism so a future "suggest from history map" surface can reuse it. Pure-presentational props: `coordinate`, `value`, `onChangeText`, `onSubmit`, `onDismiss`, `submitting`. Uses `createThemedStyles(colors)` factory + `useTheme`. |
| `C:\dev\defpedal\apps\mobile\src\hooks\useCitySuggestions.ts` | Two TanStack Query hooks: `useCitySuggestionsNearby(coordinate, radiusM)` (placeholder — returns `[]` until display surfaces ship, but wired so call sites stay stable) and `useSubmitCitySuggestion()` mutation that enqueues the write into the offline queue (mirrors `useHazardVote` pattern). |
| `C:\dev\defpedal\supabase\migrations\202605240001_create_city_suggestions.sql` | Table + RLS (see Migration section). |
| `C:\dev\defpedal\services\mobile-api\src\lib\citySuggestionSchemas.ts` | Request + response JSON Schema (or append to existing `*Schemas.ts`). |
| `C:\dev\defpedal\packages\core\src\__tests__\citySuggestions.test.ts` | Type-export sanity tests. |
| `C:\dev\defpedal\services\mobile-api\src\routes\__tests__\citySuggestions.test.ts` | API endpoint tests (auth, schema, rate-limit, happy path, whitespace-only body, range checks). |
| `C:\dev\defpedal\apps\mobile\src\__tests__\citySuggestions.test.ts` | Mobile store / offline-queue / modal-validation tests. |

### Files to modify

| Absolute path | Change |
|---|---|
| `C:\dev\defpedal\apps\mobile\app\route-preview.tsx` | Add local state: `suggestionPlacementMode`, `suggestionCenterCoordinate: Coordinate \| null`, `suggestionDialogVisible`, `suggestionBody`, `submittingSuggestion`, `suggestionToast`. Add new floating FAB to right-overlay slot (`chatbubble-ellipses-outline` Ionicon, non-accent secondary surface per frontend-expert guidance). While `suggestionPlacementMode === true`: (a) pass `crosshairMode='suggestion'` + `onCenterChange={setSuggestionCenterCoordinate}` to RouteMap; (b) swap MapStageScreen `footer` to a Confirm / Cancel pair (same pattern as `route-planning.tsx:1222-1239` `hazardPlacementFooter`); (c) suppress `topOverlay` (the Safe/Fast/Flat pill is a distraction during placement). On Confirm → open `CitySuggestionSheet`, reset placement mode. On sheet Submit → call `useSubmitCitySuggestion().submit(...)`, show success Toast, clear body. **Hide the FAB when `appState === 'NAVIGATING'`** (route-preview briefly passes through that state during `router.push('/navigation')` — see `useRouteGuard` at line 78) AND when the user is anonymous (no full account). |
| `C:\dev\defpedal\apps\mobile\src\components\map\RouteMap.tsx` | Add the `resolvedCrosshairMode` derivation + the two changed lines above. |
| `C:\dev\defpedal\apps\mobile\src\components\map\types.ts` | Add `CrosshairMode` type and `crosshairMode?: CrosshairMode` to `RouteMapProps`. Mark `hazardPlacementMode` `@deprecated`. |
| `C:\dev\defpedal\apps\mobile\src\store\appStore.ts` | (Persisted) Add `recentCitySuggestions: readonly { coordinate: Coordinate; submittedAt: string; suggestionPreview: string }[]` capped at 5 — used by `CitySuggestionSheet` as a "Recently sent" hint to discourage double-submits. Action `addRecentCitySuggestion(entry)` (immutable, `.slice(0, 5)`). Reset to `[]` in `resetUserScopedState()` and include in `partialize`. |
| `C:\dev\defpedal\apps\mobile\src\lib\api.ts` | Add to `mobileApi`: `submitCitySuggestion(payload: CitySuggestionRequest) => requestJson<CitySuggestionResponse>('/v1/city-suggestions', { method: 'POST', body: JSON.stringify(payload) })`. Also `getNearbyCitySuggestions(lat, lon, radiusMeters = 1000)` — wired but server stubs `[]` until display ships. |
| `C:\dev\defpedal\apps\mobile\src\lib\offlineQueue.ts` | Add `city_suggestion: CitySuggestionRequest` to `QueuedMutationPayloadByType` map. No collapse helper (each suggestion is independent text + coordinate). |
| `C:\dev\defpedal\apps\mobile\src\providers\OfflineMutationSyncManager.tsx` | Add `case 'city_suggestion': return mobileApi.submitCitySuggestion(mutation.payload as QueuedMutationPayloadByType['city_suggestion']);` to the dispatch `switch` at line 91. |
| `C:\dev\defpedal\packages\core\src\contracts.ts` | Add `'city_suggestion'` to `QueuedMutationType` union (line 477). Add `CitySuggestionRequest`, `CitySuggestionResponse`, `NearbyCitySuggestion` interfaces. |
| `C:\dev\defpedal\apps\mobile\src\i18n\en.ts` + `C:\dev\defpedal\apps\mobile\src\i18n\ro.ts` | Add `citySuggestion.*` keys (see i18n section). |
| `C:\dev\defpedal\services\mobile-api\src\routes\v1.ts` | New endpoint inside `buildV1Routes` plugin. |
| `C:\dev\defpedal\services\mobile-api\src\lib\submissions.ts` | New `submitCitySuggestion` function. |
| `C:\dev\defpedal\services\mobile-api\src\lib\dependencies.ts` | Wire `submitCitySuggestion` into the deps container. |
| `C:\dev\defpedal\services\mobile-api\src\config.ts` | Add `citySuggestion` rate-limit bucket. |

### Type shapes (contracts.ts)

```ts
export type QueuedMutationType =
  | 'hazard' | 'trip_start' | 'trip_end' | 'trip_track'
  | 'trip_share' | 'feedback' | 'hazard_vote' | 'city_suggestion';

export interface CitySuggestionRequest {
  coordinate: Coordinate;
  body: string;                  // 1-500 chars, validated client + server
  submittedAt: string;           // ISO timestamp from client clock
  source: 'route_preview';       // discriminator; leaves room for future surfaces
  locality?: string | null;
  routeContext?: {
    mode: 'safe' | 'fast' | 'flat';
    distanceMeters: number;
    routeId?: string;
  } | null;
}

export interface CitySuggestionResponse {
  id: string;
  createdAt: string;             // server timestamp
  status: 'open';
}

export interface NearbyCitySuggestion {
  id: string;
  coordinate: Coordinate;
  suggestionPreview: string;     // server truncates to ~60 chars
  submittedAt: string;
}
```

### Zustand store additions

```ts
// Field (persisted)
recentCitySuggestions: readonly {
  coordinate: Coordinate;
  submittedAt: string;
  suggestionPreview: string;
}[];

// Action
addRecentCitySuggestion: (entry: {
  coordinate: Coordinate;
  submittedAt: string;
  suggestionPreview: string;
}) => void;
```

Initial `[]`. **Add to `resetUserScopedState()` AND `partialize` in the same commit** (error-log #30 — leaks across account switches). Selectors must be defensive against AsyncStorage rows from older versions that don't have the key: `useAppStore((s) => s.recentCitySuggestions ?? [])` (error-log #7).

### TanStack Query hooks

```ts
function useCitySuggestionsNearby(
  coordinate: Coordinate | null,
  radiusMeters?: number,
): UseQueryResult<NearbyCitySuggestion[], Error>;
// queryKey: ['city-suggestions', 'nearby', coordinate.lat, coordinate.lon, radiusMeters]
// enabled: coordinate != null && coordinate.lat !== 0 && coordinate.lon !== 0
// staleTime: 60_000

function useSubmitCitySuggestion(): {
  submit: (input: { coordinate: Coordinate; body: string }) => Promise<void>;
  isSubmitting: boolean;
  toastMessage: string | null;
  consumeToast: () => void;
};
// Always enqueues via offline queue first (offline-safe).
// Toast message switches success vs "Will sync when online" based on isOnline at submit.
// Also calls store.addRecentCitySuggestion on success.
```

### Handlers on `route-preview.tsx` (signatures)

```ts
const enterSuggestionMode = () => { /* sets placement mode true, collapses sheet */ };
const exitSuggestionMode = () => { /* resets all suggestion-* state */ };
const handleConfirmSuggestionLocation = () => { /* opens dialog */ };
const handleSubmitSuggestion = useCallback(async () => {
  // trim body, guard double-submit, build payload with routeContext, online → submit via hook,
  // offline → hook enqueues, show toast, reset state
}, [suggestionBody, suggestionCenterCoordinate, selectedRoute, isOnline]);
```

Double-submit guard pattern: prefer the mutation's own `isPending` over a manual `useRef` lock — auto-resets, no `useFocusEffect` reset needed (error-log #36 — `useEffect` cleanup doesn't fire on push navigation since the screen stays mounted).

### Map layer plan (preview)

**v1: NO display layer.** The feature only collects suggestions. User spec explicitly says "for now these suggestions are not shown during navigation like hazards", and a display surface (clustering, age-decay, moderation, vote system) is a separate follow-up PRD. The `useCitySuggestionsNearby` hook is wired but its call site is **commented out** in v1 so we don't pay the round-trip cost. When display ships later, RouteMap can grow a `citySuggestionLocations` prop + `CitySuggestionLayer.tsx` next to `HazardLayers.tsx` (filter-based hiding per error-log #12).

### Navigation-screen guarantee

`C:\dev\defpedal\apps\mobile\app\navigation.tsx` imports nothing from this feature: not `CitySuggestionSheet`, not `useCitySuggestions`, not `recentCitySuggestions`, not `addRecentCitySuggestion`. The new `crosshairMode` RouteMap prop defaults to undefined; `navigation.tsx`'s RouteMap mount does not pass it. The new FAB lives only in `route-preview.tsx`'s right-overlay — not in `MapStageScreen`, not in `NavigationHUD`, not in `RouteMap`. There is therefore no surface on the navigation screen where a suggestion entry exists, and no data path that could render submitted suggestions during navigation. Additionally we hide the FAB on `route-preview.tsx` when `appState === 'NAVIGATING'` to avoid the 100ms flash during the router race.

### Error-log pitfalls applicable to mobile

- **#1** Verify any new imports (e.g. `submitCitySuggestion` exported from `mobileApi`) before consuming.
- **#7** Existing users won't have `recentCitySuggestions` in AsyncStorage; default `[]` handles it, but selectors should be defensive: `useAppStore((s) => s.recentCitySuggestions ?? [])`.
- **#12** Filter/key-based Mapbox layer hiding — only matters when a display layer ships later; flagged for the follow-up.
- **#15** `SafeAreaView` from `react-native-safe-area-context`, NOT `react-native`. `CitySuggestionSheet` uses `useSafeAreaInsets()` for keyboard padding.
- **#20** PanResponder stale closures — no new PanResponder in this feature (`CitySuggestionSheet` is a Modal/backdrop, not swipeable). If swipe-to-dismiss is added later, follow the existing `peekContentHeightRef` pattern in `MapStageScreen.tsx`.
- **#21** `useHaptics()` already uses `hasExpoNativeModule('ExpoHaptics')`; no new native-module checks needed. Do NOT introduce any `NativeModules.Expo*` checks.
- **#30** Add `recentCitySuggestions` to `resetUserScopedState()` AND `partialize` in the same commit — otherwise account-B sees account-A's recent suggestions on sign-in.
- **#36** `route-preview.tsx` is preserved underneath `/navigation` on `router.push`. Prefer the mutation's `isPending` for the double-submit lock instead of a `useRef` that needs `useFocusEffect` reset.
- **#42** Not applicable — no new image assets (all icons via `@expo/vector-icons`).

### Component reuse summary

| Need | Reuse | New? |
|---|---|---|
| FAB | `PressableScale` + Ionicons | No new atom |
| Crosshair | Existing `CrosshairOverlay` (unchanged in v1) | No |
| Footer Cancel / Confirm row | Existing `Button` atom | No |
| Modal card | New `CitySuggestionSheet` organism (built from existing patterns) | One new organism |
| Multiline TextInput | RN `TextInput` (matches Save Route) | No |
| Character counter | Inline `<Text>` element | No new atom for v1 |
| Toast | Existing `Toast` molecule | No |
| FadeSlideIn / haptics / Safe area | Existing atoms / hooks | No |

### Bundle health

- **No new native modules.** Pure JS feature. `expo-haptics` for the Confirm tap reuses the existing `useHaptics()` hook (arch-safe via `hasExpoNativeModule('ExpoHaptics')`, error-log #21).
- After all the above is in place, `npm run check:bundle` from repo root must return HTTP 200 before phone testing.
- No `expo prebuild`, no `android/` changes, no `app.config.ts` changes, no new permissions.
- Test on dev variant first (Metro hot reload), then preview build. No new-arch / bridgeless gotchas expected since the feature has zero native-module dependencies.

---

## Design system

- **FAB color.** Per `docs/design-context.md` accent discipline: accent yellow is reserved for primary CTAs (Start navigation). The suggestion FAB should sit on `colors.bgSecondary` with an icon in `colors.textSecondary` or `colors.info` (not `colors.accent`). When active (placement mode on), the FAB background uses a subtle highlight (`safetyTints.infoLight` or similar) and the icon swaps to `close` in `colors.textPrimary`. Mirrors the hazard FAB's "off" / "on" visual states but tones it down a notch since hazards are safety-critical and suggestions are not.
- **Haptic.** `hapticOnPress="snap"` on the FAB (via `PressableScale`). Use the standard project pattern from `apps/mobile/src/lib/haptics.ts` + `useHaptics`. The haptics primitive already guards on `hasExpoNativeModule('ExpoHaptics')` so this is safe on bridgeless preview/production (error-log #21).
- **Motion.** Reuse `FadeSlideIn` on the modal card on open. Gate any custom animation behind `useReducedMotion`. Spring presets from `motion.ts` (`gentle` for the modal entry, default `PressableScale` spring for the FAB).
- **Z-index / surface.** Modal uses `surfaceTints.overlay` for the backdrop + `zIndex.modal`; toast uses `zIndex.toast`. Both already defined in tokens.
- **Pedal mascot.** Out of scope for this surface. The "Pedal" mascot system has 20 specific placements; adding a 21st for city suggestions is unjustified in v1.

---

## i18n

New keys in `apps/mobile/src/i18n/en.ts` and `ro.ts` (lockstep — missing ro strings render the key verbatim):

| Key | en | ro |
|---|---|---|
| `citySuggestion.fab.label` | "Suggest improvement" | "Sugerează o îmbunătățire" |
| `citySuggestion.fab.cancelLabel` | "Cancel suggestion" | "Anulează sugestia" |
| `citySuggestion.crosshair.helper` | "Move map to the spot you want to flag" | "Mută harta către locul pe care vrei să-l semnalezi" |
| `citySuggestion.footer.confirm` | "Add suggestion here" | "Adaugă sugestia aici" |
| `citySuggestion.footer.cancel` | "Cancel" | "Anulează" |
| `citySuggestion.modal.title` | "Suggest an improvement" | "Sugerează o îmbunătățire" |
| `citySuggestion.modal.placeholder` | "Tell us what's wrong here, or what would make this safer or better." | "Spune-ne ce e în neregulă aici sau cum ar fi mai bine / mai sigur." |
| `citySuggestion.modal.counter` | "{count} / 500" | "{count} / 500" |
| `citySuggestion.modal.submit` | "Send" | "Trimite" |
| `citySuggestion.modal.cancel` | "Cancel" | "Anulează" |
| `citySuggestion.toast.success` | "Suggestion sent — thanks!" | "Sugestie trimisă — mulțumim!" |
| `citySuggestion.toast.offline` | "Saved — will send when you're back online" | "Salvată — o trimitem când revii online" |
| `citySuggestion.toast.error` | "Couldn't send — please try again" | "Nu am putut trimite — încearcă din nou" |

(Romanian translations are first-pass; review by a native speaker before ship.)

---

## Accessibility

- FAB: `accessibilityRole="button"`, `accessibilityLabel={t('citySuggestion.fab.label')}` (swaps to cancel label when active), 44pt tap area via `hitSlop` if visual size <44pt.
- CrosshairOverlay: `accessibilityRole="image"`, `accessibilityLabel="Crosshair indicating where the suggestion will be pinned"`. The map itself remains accessible via the existing `a11ySummary`.
- Modal: when opened, focus is auto-routed to the `TextInput` via `autoFocus`. Modal backdrop is `Pressable` with `accessibilityLabel="Dismiss suggestion dialog"`. Body uses `accessibilityViewIsModal={true}` on iOS.
- Character counter: `accessibilityLiveRegion="polite"` so screen readers announce changes (avoid `assertive` — counter updates are not safety-critical, unlike hazard alerts).
- Submit button: `accessibilityState={{ disabled: !canSubmit }}`.
- Toast: `accessibilityLiveRegion="polite"`, `accessibilityRole="status"`.

---

## Telemetry / analytics

V1: **none wired.** The existing `telemetry` module (`apps/mobile/src/lib/telemetry.ts`) supports events; future events could be `city_suggestion_started`, `city_suggestion_submitted`, `city_suggestion_cancelled` with properties `{ route_id, mode, body_length }`. Not in scope for v1 — add only if the dev team needs adoption data.

---

## Error-log pitfalls to avoid

Pulled from qa-agent's cross-cutting review, indexed by error-log entry:

- **#1 — Missing imports cause blank screen.** When adding `submitCitySuggestion` to `mobileApi`, verify the import on the consuming file. Lint-pass + bundle check before any phone test.
- **#11 — Fastify routes must be declared inside the plugin closure.** The new endpoint goes inside `buildV1Routes`, not at module scope.
- **#12 — Mapbox conditional layer mount/unmount leaves ghost markers.** Not triggered here (crosshair is a non-Mapbox overlay) but a guardrail for any future iteration that adds a "pin existing suggestions on the map" feature.
- **#15 — `SafeAreaView` from `react-native` is iOS-only.** Modal must use `useSafeAreaInsets()`.
- **#21 — Native-module detection.** `useHaptics` already uses `hasExpoNativeModule('ExpoHaptics')`; no new native modules added by this feature, so #21 is already handled by existing primitives. Do not introduce any `NativeModules.Expo*` checks.
- **#22 / Gotcha #9 — Fastify response schema strips undeclared fields.** Both request and response JSON Schemas must be complete with `additionalProperties: false` and every returned field declared in `properties` + `required`.
- **#28 — SECURITY DEFINER search_path.** N/A in v1 (no definer functions). If a trigger is added later, apply `SET search_path = public, auth, pg_temp`.
- **#30 — TanStack/Zustand cache must be user-scoped.** V1 has no read query, so no cache. **If `useCitySuggestions(userId)` is added in v2**, the TanStack query key MUST include `userId` and `resetUserScopedState()` in `apps/mobile/src/store/appStore.ts` MUST clear it on sign-out.
- **#33 — FKs to `auth.users` need `ON DELETE CASCADE`.** Migration declares cascade for `user_id`.
- **#39 — Don't assume Postgres columns exist.** Handler does NOT join `profiles`; no profile-column risk in v1.
- **#42 — Vitest can't `require()` PNGs.** N/A (no new image tokens).

---

## Testing plan

### Unit tests

**Core (`packages/core/src/__tests__/`):**
- Type exports compile cleanly (`CitySuggestionRequest`, `CitySuggestionResponse`, `CitySuggestionQueuePayload`).
- `QueuedMutationType` union includes `'city_suggestion'`.

**API (`services/mobile-api/src/routes/__tests__/citySuggestions.test.ts`):**
- Anonymous Supabase session → 403.
- No auth header → 401.
- Valid full user + valid payload → 200 with `{ id, createdAt, status: 'open' }`.
- `body` empty → 400.
- `body` whitespace-only → 400 (server-side trim).
- `body` > 500 chars → 400.
- `lat` out of range (-91 / 91) → 400.
- `lon` out of range (-181 / 181) → 400.
- `routeContext.mode` not in enum → 400.
- 6th request in 1-hour window from the same user → 429.
- Supabase insert error → 502.
- Response schema strips unknown fields (regression test for error-log #22).

**Mobile (`apps/mobile/src/__tests__/citySuggestions.test.ts`):**
- `enqueueMutation('city_suggestion', payload)` produces correct queued shape with id prefix + status `'queued'`.
- `OfflineMutationSyncManager` calls `mobileApi.submitCitySuggestion` for `city_suggestion` type.
- Modal validation: body of length 0 → submit disabled; 1-500 → enabled; 501+ → disabled.
- Whitespace-only body → submit disabled.
- Double-tap submit fires once (ref guard).
- RouteMap `crosshairMode='suggestion'` renders `CrosshairOverlay` with the suggestion helper string.

### Manual phone testing (preview build, not dev)

Per CLAUDE.md: test on preview build to surface bridgeless-only failures. Bundle check (`npm run check:bundle`) must return HTTP 200 first.

1. **Golden path online.** Open route-preview → tap FAB → crosshair appears → pan map ~200m → tap "Add suggestion here" → modal opens with focused TextInput → type 80 chars → tap Send → success toast.
2. **Cancel mid-placement.** Tap FAB → crosshair appears → tap footer Cancel → returns to normal preview with start-navigation button visible; no state leak.
3. **Cancel mid-modal.** Tap FAB → confirm location → modal opens → tap modal Cancel → modal dismisses but placement mode remains; re-pan + re-confirm works.
4. **Over-500-char path.** Type 501 chars → counter turns red → Send disabled.
5. **Empty body.** Open modal → tap Send without typing → button is disabled; no submit.
6. **Whitespace-only body.** Type 10 spaces → Send disabled.
7. **Offline path.** Enable airplane mode → submit → offline toast appears → re-enable network → wait 15s for queue drain → check Cloud Run logs for insert OR check Supabase dashboard for new row.
8. **NAVIGATING quarantine.** Start navigation → verify the suggestion FAB is NOT visible during navigation. (FAB only renders in `route-preview.tsx`.)
9. **Anonymous user.** Sign out (or use a fresh install) → open route-preview → verify FAB behavior. Two acceptable options: (a) hide the FAB if anonymous, or (b) show the FAB but show a "Sign in to send suggestions" prompt when tapped. **Recommend (a)** for v1 — keeps the UI uncluttered for anonymous users; aligns with how route sharing is treated.
10. **Rate-limit.** Submit 5 suggestions in quick succession → 6th gets 429 → toast shows error message ("Couldn't send — please try again"). Wait 1h → submission works again.
11. **Account switch.** Sign out, sign in as a different user → previous user's pending offline mutations should NOT carry over (covered by `resetUserScopedState()` clearing `queuedMutations`; verify this still holds with the new type).

---

## Open questions

1. **"Preview screen" vs "Planning screen" ambiguity.** The user said "in route preview screen" and referenced "how it works for hazard reporting in preview screen". But the existing crosshair hazard flow lives on **planning**, not preview. **Decided interpretation:** replicate the planning crosshair pattern *on preview*. Rationale: (a) the preview screen has more visual space available (the bottom sheet is non-full), (b) the user has just generated a route, so suggestions about that route's quality are naturally top-of-mind, (c) the user's quote specifically asks for the button on preview. If the user actually meant "also on planning", we add a second FAB there in v1.1.
2. **Anonymous users.** The decision (above, item #9 in testing) is to **hide the FAB for anonymous users** since the API rejects anonymous writes. Confirm.
3. **Should we surface "My suggestions" anywhere in v1?** Currently no — RLS allows the user to read their own rows but no UI exposes them. Easy to add a Profile row later.
4. **Should the `route_context` snapshot include the full polyline?** No in v1 — keeps payload small. Just `mode` + `distanceMeters` + optional `routeId` is enough for triage.
5. **Should suggestions show up as map pins on the user's own subsequent route previews?** Not in v1. Could be a v2 feature ("you previously flagged this spot — still bad?").
6. **Migration timestamp.** Plan uses `202605240001_create_city_suggestions.sql` (tomorrow). If applied today (2026-05-23), rename to `202605230002_create_city_suggestions.sql` to avoid out-of-order migration history. Convention is YYYYMMDDNNNN by *apply* date.
7. **Success-toast copy: "Sent to the city" vs "Saved — thanks for noticing".** Decision: **"Suggestion sent — thanks!"** (encoded as `citySuggestion.toast.success` in i18n). Rationale: we are NOT forwarding to a municipal partner in v1, so "Sent to the city" implies a downstream routing promise the app doesn't yet keep — once a real "report to municipality" pipeline exists (e.g. an API integration with the local City Hall complaint portal), we can swap to the stronger phrasing then. Open option for the future: route specific `routeContext` categories (e.g. anything that looks like a road defect) to a municipal forwarding queue, gated by a per-city feature flag. Out of scope for v1.

---

## Rollout

Per CLAUDE.md commit workflow + error-log #18 (`gcloud builds submit` ≠ deploy):

1. **Apply Supabase migration first.** `20260524NNNN_create_city_suggestions.sql` via `supabase db push` or the dashboard. Table + RLS must exist before the API tries to insert.
2. **Deploy API to Cloud Run.** `gcloud builds submit --config cloudbuild.yaml --timeout=600` THEN `gcloud run deploy defpedal-api --image ... --region europe-central2 --platform managed --allow-unauthenticated`. Confirm new revision via `gcloud run revisions list`.
3. **Set Cloud Run env vars** (if non-default rate-limit needed): `RATE_LIMIT_CITY_SUGGESTION_MAX`, `RATE_LIMIT_CITY_SUGGESTION_WINDOW_MS`. Defaults (5/hour) are baked into config.ts so this is optional.
4. **Run `npm run check:bundle`** — must return HTTP 200 before phone test.
5. **Test on preview build.** Per CLAUDE.md Notifications guidance, preview build catches bridgeless-only failures the dev variant masks. No new native modules here, but the preview gate is still the safer test.
6. **Run `npm run typecheck`** before commit. Pre-push hook also runs typecheck + lint ratchet; if lint regresses, either fix or run `npm run lint:baseline` from `apps/mobile/` to accept the new violations.
7. **Commit + push.** Update `progress.md` with what shipped.
8. **No Play Store blocker.** No new data-collection categories (Location + App-activity already declared in the Data Safety form; this is just more text-content user-generated within the existing App-activity scope per CLAUDE.md Play Store note).
9. **No new Cloud Scheduler cron.** Suggestions never expire and have no scheduled work in v1.

**No mobile rebuild required.** No new native modules, so JS bundle ship via embedded-bundle preview APK is sufficient (`npm run build:preview:install`).
