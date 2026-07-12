-- ════════════════════════════════════════════════════════════════════════════
-- 2026-07-12: Create `country_waitlist` table.
--
-- Global availability gate (feature/global-availability-gate): the store
-- listings open worldwide, but the app is only "available" in EU-27 + EEA +
-- CH + UK (see packages/core/src/appAvailability.ts). New installs outside
-- that list see an onboarding region gate where they can leave an email to
-- be notified when Defensive Pedal reaches their country.
--
-- Design notes:
--   (a) Rows are written exclusively through the API with the service-role
--       key (POST /v1/country-waitlist). RLS is enabled with NO policies —
--       deny-all for anon/authenticated. The submitting user is usually an
--       anonymous Supabase session mid-onboarding, so there is no full-user
--       FK requirement.
--   (b) `email` is stored lowercased/trimmed by the API so the plain-column
--       unique constraint (email, country_code) dedupes case-insensitively
--       and PostgREST upsert can target it via on_conflict.
--   (c) `notified_at` is the launch-announcement bookkeeping column — set it
--       when the "we're live in your country" email goes out.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.country_waitlist (
  id uuid primary key default gen_random_uuid(),
  -- Usually an anonymous session; kept so abuse response can trace a spammer.
  -- SET NULL (not CASCADE) — the waitlist signup outlives account deletion,
  -- since it is a standalone "notify this email" request, not account data.
  user_id uuid references auth.users(id) on delete set null,
  email text not null check (
    char_length(email) between 3 and 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and email = lower(email)
  ),
  -- ISO 3166-1 alpha-2, uppercased by the API.
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  -- Country resolved from GPS reverse-geocode when available; may differ
  -- from the picked `country_code` (traveler, VPN, geocode noise).
  detected_country_code text check (detected_country_code ~ '^[A-Z]{2}$'),
  locale text check (char_length(locale) <= 10),
  source text not null default 'onboarding' check (source in ('onboarding')),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  constraint country_waitlist_email_country_unique unique (email, country_code)
);

create index if not exists idx_country_waitlist_country_created
  on public.country_waitlist (country_code, created_at desc);

alter table public.country_waitlist enable row level security;

-- Deny-all RLS: no policies. All reads/writes go through the service-role
-- key (API + admin SQL editor). Revoke the Supabase default-ACL excess so
-- anon/authenticated cannot touch the table even outside RLS evaluation
-- (same trap as road_risk_data v22 — default grants are too broad).
revoke all on public.country_waitlist from anon, authenticated;

commit;
