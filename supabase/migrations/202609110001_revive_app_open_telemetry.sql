-- Revive first-party app-open telemetry, and make it countable.
--
-- WHY. Counting active users depended entirely on PostHog, which is
-- consent-gated — so a rider who turned product analytics off was invisible,
-- and because the opt-out state is never reported to the server the size of the
-- blind spot was not even knowable. Measured 2026-09-11: 107 of 209 users with
-- server-side proof of app use had no PostHog event under their own id
-- (docs/reviews/active-user-counting-2026-09-11.md).
--
-- NOT A NEW TABLE. `user_telemetry_events` already exists (migration
-- 202604150004) and already has an `app_open` event_type: 638 rows from 157
-- users, written by the Mia-era `AppOpenTelemetryObserver` and silent since
-- **2026-05-10**, the day Mia was retired and that observer was deleted. This
-- reconnects the existing pipe rather than laying a second one beside it.
--
-- ⚠️ LAWFUL BASIS. App opens are written REGARDLESS of the product-analytics
-- toggle, on the same footing the app already uses for Sentry crash reports:
-- legitimate interest, GDPR Art 6(1)(f), for operating and sizing the service.
-- That holds only while the data stays minimal and is disclosed:
--   * One row per foreground. No location, no device identifier, no IP, no
--     screen, nothing about what the rider DID.
--   * `event_type` is an allowlist (constraint below). Widening it toward
--     behavioural events is a PRIVACY decision, not a schema tweak, and must
--     ship with a Privacy Policy update in the same change.
--   * `properties` stays empty for app_open. It is the obvious place for
--     someone to later stuff behaviour in without re-reading any of this.
--   * Rows cascade-delete with the account, so erasure needs no extra work
--     (the live FK is ON DELETE CASCADE — the 202604150004 file omits the
--     clause, another live-vs-file drift; verified 2026-09-11).
-- The Privacy Policy (apps/web/app/privacy/page.tsx) must name this
-- processing. The ANSPDCP/ePrivacy review in .claude/CLAUDE.md is outstanding.

-- Per-row build provenance. `profiles.app_environment` (migration
-- 202609100001) records only the LAST build a user ran; counting opens per day
-- needs the build that wrote THIS row, so preview and development opens can be
-- excluded from the numbers instead of silently inflating them.
alter table public.user_telemetry_events add column if not exists app_environment text;
alter table public.user_telemetry_events add column if not exists app_version     text;
alter table public.user_telemetry_events add column if not exists app_platform    text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_telemetry_events_app_environment_check'
  ) then
    alter table public.user_telemetry_events
      add constraint user_telemetry_events_app_environment_check
      check (app_environment is null or app_environment in ('development','preview','production'));
  end if;
end $$;

-- DAU is count(distinct user_id) over a created_at range. The existing index is
-- (user_id, event_type, created_at), which cannot serve that scan.
create index if not exists user_telemetry_events_created_at_idx
  on public.user_telemetry_events (created_at desc);

comment on table public.user_telemetry_events is
  'First-party operational telemetry. app_open rows are written on every foreground REGARDLESS of the product-analytics consent toggle, under legitimate interest GDPR Art 6(1)(f), so active users can be counted at all. Minimal by design: no location, no device id, no behaviour. event_type is an allowlist — widening it is a privacy decision requiring a Privacy Policy update. RETENTION: 90 days via prune_user_telemetry_events().';
comment on column public.user_telemetry_events.created_at is
  'Server receive time (column default). THE authoritative timestamp for per-day aggregates. The client does not send a timestamp precisely so a wrong device clock cannot move a user across a day boundary.';
comment on column public.user_telemetry_events.properties is
  'Deliberately EMPTY for app_open. Putting behaviour here would turn operational telemetry into product analytics and break the legitimate-interest basis above.';

-- Retention. Data minimisation is part of the lawful basis, not housekeeping:
-- an app-open row has no value once the period it was counted in has passed.
create or replace function public.prune_user_telemetry_events(retain_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.user_telemetry_events
  where created_at < now() - make_interval(days => greatest(1, retain_days));
  get diagnostics removed = row_count;
  return removed;
end $$;

revoke all on function public.prune_user_telemetry_events(integer) from public, anon, authenticated;
