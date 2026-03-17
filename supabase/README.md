# Supabase Schema Workflow

This repo now treats `supabase/migrations/` as the authoritative source of truth for database
schema changes that are still active.

## Migration policy

- add new schema changes as ordered `.sql` files in `supabase/migrations/`
- keep migrations additive and idempotent when practical
- apply migrations in filename order
- document manual rollout notes when a migration needs coordination with app or backend releases

## Current migration set

- `202603170001_get_segmented_risk_route.sql`
- `202603170002_add_hazard_type.sql`

## Applying migrations

Use either:

- the Supabase SQL editor for one-off manual rollout, or
- your preferred Postgres migration runner / `psql` invocation in filename order

Example with `psql`:

```bash
psql "$DATABASE_URL" -f supabase/migrations/202603170001_get_segmented_risk_route.sql
psql "$DATABASE_URL" -f supabase/migrations/202603170002_add_hazard_type.sql
```

## Legacy root SQL files

The repo still contains historical SQL files at the root. Treat them as legacy artifacts, not the
default migration source of truth.

- `supabase_risk_function.sql` has been copied into `supabase/migrations/` as an ordered migration
- `supabase_add_hazard_type.sql` has been copied into `supabase/migrations/` as an ordered migration
- `supabase_fix_rls.sql` and `supabase_setup.sql` currently appear to contain corrupted or
  non-text content in this checkout, so they are preserved for reference only until a valid source
  version is recovered
