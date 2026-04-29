#!/usr/bin/env bash
# End-to-end deploy of the inactive-warning Edge Function pipeline.
#
# Idempotent: safe to re-run. Replaces the function on every run, upserts
# the Cloud Scheduler job, overwrites secrets when env vars are provided.
#
# Steps:
#   1. Pre-flight (CLI presence, working directory, env vars, secrets in env)
#   2. Apply the migration if it has not been applied yet (supabase db push)
#   3. Deploy the Edge Function
#   4. Set CRON_SECRET + RESEND_API_KEY secrets on Supabase
#   5. Upsert the retention-inactive-mailer-cron Cloud Scheduler job
#   6. Smoke test the function (auth + queue read)
#
# Usage:
#   CRON_SECRET="…" RESEND_API_KEY="re_…" ./scripts/deploy-inactive-warning.sh
#
# Pre-requisites (run these once before invoking the script):
#   - supabase login                 (Supabase CLI authenticated)
#   - supabase link --project-ref uobubaulcdcuggnetzei
#   - gcloud auth login              (Google Cloud authenticated)
#   - gcloud config set project gen-lang-client-0895796477
#
# If you would rather apply the migration manually via Supabase MCP
# `apply_migration`, run that first and pass SKIP_MIGRATION=1 to this script.

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

readonly PROJECT_REF="uobubaulcdcuggnetzei"
readonly GCP_PROJECT="gen-lang-client-0895796477"
readonly GCP_REGION="europe-central2"
readonly FUNCTION_NAME="inactive-warning"
readonly FUNCTION_URL="https://${PROJECT_REF}.supabase.co/functions/v1/${FUNCTION_NAME}"
readonly JOB_NAME="retention-inactive-mailer-cron"
readonly JOB_SCHEDULE="30 5 * * 1"
readonly JOB_TIMEZONE="Europe/Bucharest"
readonly MIGRATION_FILE="supabase/migrations/202604280002_inactive_warning_email_audit.sql"

# ANSI helpers
readonly C_RESET=$'\e[0m'
readonly C_BOLD=$'\e[1m'
readonly C_DIM=$'\e[2m'
readonly C_GREEN=$'\e[32m'
readonly C_YELLOW=$'\e[33m'
readonly C_RED=$'\e[31m'

step()   { printf "\n%s→ %s%s\n" "$C_BOLD" "$1" "$C_RESET"; }
info()   { printf "  %s%s%s\n" "$C_DIM" "$1" "$C_RESET"; }
ok()     { printf "  %s✓%s %s\n" "$C_GREEN" "$C_RESET" "$1"; }
warn()   { printf "  %s⚠%s %s\n" "$C_YELLOW" "$C_RESET" "$1"; }
fail()   { printf "  %s✗%s %s\n" "$C_RED"   "$C_RESET" "$1" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Pre-flight
# ---------------------------------------------------------------------------

step "Pre-flight"

if [ ! -f "$MIGRATION_FILE" ]; then
  fail "Run from repo root. Migration not found: $MIGRATION_FILE"
fi

command -v supabase >/dev/null || fail "supabase CLI not found. Install: npm i -g supabase"
command -v gcloud   >/dev/null || fail "gcloud CLI not found. Install: https://cloud.google.com/sdk"
command -v curl     >/dev/null || fail "curl not found"

if [ -z "${CRON_SECRET:-}" ]; then
  fail "CRON_SECRET env var not set. Use the same value used by the Cloud Run retention crons."
fi
if [ -z "${RESEND_API_KEY:-}" ]; then
  fail "RESEND_API_KEY env var not set. Issue at https://resend.com/api-keys (uses the existing defensivepedal.com sending domain)."
fi
if [[ "$RESEND_API_KEY" != re_* ]]; then
  warn "RESEND_API_KEY does not start with 're_' — looks suspicious; double-check before continuing."
fi

ok "supabase CLI, gcloud CLI, curl all present"
ok "CRON_SECRET + RESEND_API_KEY present in env (not echoed)"

# ---------------------------------------------------------------------------
# 2. Migration
# ---------------------------------------------------------------------------

if [ "${SKIP_MIGRATION:-0}" = "1" ]; then
  step "Migration (skipped — SKIP_MIGRATION=1)"
  info "Assuming 202604280002_inactive_warning_email_audit.sql is already applied."
else
  step "Applying migrations to Supabase"
  info "Running 'supabase db push --project-ref $PROJECT_REF' (idempotent)"
  if ! supabase db push --project-ref "$PROJECT_REF"; then
    fail "Migration push failed. Apply manually via Supabase MCP apply_migration and re-run with SKIP_MIGRATION=1."
  fi
  ok "Migrations applied"
fi

# ---------------------------------------------------------------------------
# 3. Deploy Edge Function
# ---------------------------------------------------------------------------

step "Deploying Edge Function: $FUNCTION_NAME"
# --no-verify-jwt: this function is called by Cloud Scheduler with a Bearer
# CRON_SECRET (not a Supabase JWT). The function does its own auth check.
# Without this flag, Supabase's platform-level JWT gate returns 401 before
# our handler runs.
supabase functions deploy "$FUNCTION_NAME" --no-verify-jwt --project-ref "$PROJECT_REF"
ok "Function deployed: $FUNCTION_URL"

# ---------------------------------------------------------------------------
# 4. Set Supabase secrets
# ---------------------------------------------------------------------------

step "Setting Supabase function secrets"
# `supabase secrets set` accepts KEY=VALUE positional args. Pass via stdin to
# avoid the values landing in the process listing or shell history.
supabase secrets set --project-ref "$PROJECT_REF" \
  "CRON_SECRET=$CRON_SECRET" \
  "RESEND_API_KEY=$RESEND_API_KEY" >/dev/null
ok "CRON_SECRET + RESEND_API_KEY set on $PROJECT_REF"

# ---------------------------------------------------------------------------
# 5. Cloud Scheduler — upsert job
# ---------------------------------------------------------------------------

step "Configuring Cloud Scheduler: $JOB_NAME"

if gcloud scheduler jobs describe "$JOB_NAME" \
     --project="$GCP_PROJECT" --location="$GCP_REGION" >/dev/null 2>&1; then
  info "Job exists; updating in place"
  gcloud scheduler jobs update http "$JOB_NAME" \
    --project="$GCP_PROJECT" \
    --location="$GCP_REGION" \
    --schedule="$JOB_SCHEDULE" \
    --time-zone="$JOB_TIMEZONE" \
    --uri="$FUNCTION_URL" \
    --http-method=POST \
    --update-headers="Authorization=Bearer $CRON_SECRET" \
    --description="Retention pipeline — sends 23-month inactive-warning email via Resend Edge Function. Mon 5:30am Bucharest. compliance plan item 13."
  ok "Scheduler job updated"
else
  info "Job does not exist; creating"
  gcloud scheduler jobs create http "$JOB_NAME" \
    --project="$GCP_PROJECT" \
    --location="$GCP_REGION" \
    --schedule="$JOB_SCHEDULE" \
    --time-zone="$JOB_TIMEZONE" \
    --uri="$FUNCTION_URL" \
    --http-method=POST \
    --headers="Authorization=Bearer $CRON_SECRET" \
    --description="Retention pipeline — sends 23-month inactive-warning email via Resend Edge Function. Mon 5:30am Bucharest. compliance plan item 13."
  ok "Scheduler job created"
fi

# ---------------------------------------------------------------------------
# 6. Smoke test
# ---------------------------------------------------------------------------

step "Smoke test: POSTing to $FUNCTION_URL"
# Cap the response body so a runaway error message does not flood the terminal.
RESP=$(curl -s -o - --max-time 30 \
  -w "\n__HTTP_STATUS__%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$FUNCTION_URL" || true)

HTTP_CODE=$(printf "%s" "$RESP" | sed -n 's/.*__HTTP_STATUS__\([0-9]*\).*/\1/p')
BODY=$(printf "%s" "$RESP" | sed 's/__HTTP_STATUS__[0-9]*$//')

case "$HTTP_CODE" in
  200)
    ok "Function reachable and CRON_SECRET valid"
    info "Response: $BODY"
    if printf "%s" "$BODY" | grep -q '"queueSize"'; then
      ok "Response shape looks correct (contains queueSize)"
    else
      warn "Response shape unexpected — verify function logs"
    fi
    ;;
  401)
    fail "401 Unauthorized — CRON_SECRET on the function does not match the env var. Re-run after fixing."
    ;;
  500|502)
    warn "HTTP $HTTP_CODE from function. Body: $BODY"
    warn "Likely the migration is not yet applied or RESEND_API_KEY is wrong. Check Supabase function logs."
    ;;
  "")
    warn "No HTTP response (network or timeout). Function may be cold-starting; retry the smoke test in 30s."
    ;;
  *)
    warn "Unexpected HTTP $HTTP_CODE. Body: $BODY"
    ;;
esac

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

cat <<EOF

──────────────────────────────────────────────
${C_BOLD}Done.${C_RESET}

  Function URL : $FUNCTION_URL
  Schedule job : $JOB_NAME ($JOB_SCHEDULE $JOB_TIMEZONE)
  Next run     : Monday at 05:30 Europe/Bucharest

Tail function logs:
  supabase functions logs $FUNCTION_NAME --project-ref $PROJECT_REF

Manually trigger (e.g. before the next cron tick):
  curl -X POST -H 'Authorization: Bearer \$CRON_SECRET' $FUNCTION_URL

Disable the cron temporarily:
  gcloud scheduler jobs pause $JOB_NAME --project=$GCP_PROJECT --location=$GCP_REGION
  gcloud scheduler jobs resume $JOB_NAME --project=$GCP_PROJECT --location=$GCP_REGION

──────────────────────────────────────────────
EOF
