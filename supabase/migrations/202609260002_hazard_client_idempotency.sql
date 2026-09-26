-- P1-12 · The hazard report had no idempotency key, at any layer.
--
-- `POST /v1/hazards` is delivered by the offline queue, which is at-least-once by
-- design: a request that is delivered and then times out, or whose response is
-- lost to an app kill, is retried. `OfflineMutationSyncManager`'s own comment
-- records this firing in production. Every retry created a SECOND hazard pin at
-- the same spot — splitting the community votes that decide whether the hazard is
-- real, which interacts badly with the single-rider delete path P0-3 just closed —
-- and refired all four side effects: the streak qualifier, the
-- `post_hazard_thanks` push, `award_xp('hazard_report', 50)` and
-- `autoPublishHazardStandalone` (a duplicate activity-feed card).
--
-- ⚠️ The triage plan cited `hazardSchemas.ts:15` as a `clientSubmittedAt` that
-- "reaches the server and is never written". That line is on the hazard VOTE
-- schema, not the report. The report schema (`http.ts:590`) has no idempotency
-- field at all, and with `additionalProperties: false` plus Fastify's
-- `removeAdditional`, a client sending one would have it stripped in silence. The
-- defect is real; the prescription needed the actual key.
--
-- The key is the OFFLINE QUEUE'S OWN MUTATION ID (`createQueuedMutation` mints
-- `hazard-<uuid>` once at enqueue time and persists it), which is stable across
-- retries, app kills and re-drains by construction. That is the same shape
-- `trip_start` already uses with `client_trip_id` — an explicit identity rather
-- than a timestamp, so two genuine reports in the same millisecond stay distinct.
--
-- ⚠️ The index is deliberately NOT partial, per this repo's error-prevention rule
-- #27: PostgREST emits no `WHERE` clause, so Postgres cannot infer a partial
-- unique index for `ON CONFLICT` and every upsert would fail with "no unique or
-- exclusion constraint matching the ON CONFLICT specification". A plain unique
-- index is already NULLS DISTINCT, which gives exactly what a partial index was
-- reaching for: every pre-existing hazard and every imported one keeps
-- `client_hazard_id IS NULL` and is completely unconstrained.
--
-- ⚠️ Scoped to the id alone, NOT `(user_id, client_hazard_id)`, because
-- `user_id` is NULLABLE on this path — `POST /v1/hazards` resolves the reporter
-- as `user?.id ?? null` and accepts unauthenticated reports, and a NULL in a
-- composite NULLS DISTINCT index would leave exactly those reports undeduplicated.
-- Tampering is not a concern in exchange: the write is DO NOTHING, so a second
-- caller presenting someone else's id changes nothing and learns nothing.

ALTER TABLE public.hazards
  ADD COLUMN IF NOT EXISTS client_hazard_id text;

COMMENT ON COLUMN public.hazards.client_hazard_id IS
  'Client-minted offline-queue mutation id, stable across retries. NULL for '
  'imports and for every hazard reported before 2026-09-26. Deduplicates '
  'at-least-once delivery of POST /v1/hazards.';

CREATE UNIQUE INDEX IF NOT EXISTS hazards_client_hazard_id_key
  ON public.hazards (client_hazard_id);
