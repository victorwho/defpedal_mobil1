#!/usr/bin/env bash
#
# Pedal Nudge System — one-shot health check.
#
# Prints a single-page status report covering:
#   - Cloud Run env (NUDGES_ENABLED)
#   - Latest revision
#   - Cloud Scheduler job state (3 jobs)
#   - Recent structured nudge_* log entries
#   - Quick gcloud commands for follow-up
#
# Requires: gcloud CLI authenticated with project gen-lang-client-0895796477
# (run `gcloud config set project gen-lang-client-0895796477` once).
#
# For SQL-based health metrics on nudge_log itself, see the queries in
# docs/ops/nudges-runbook.md (run via Supabase SQL editor or MCP).
#
# Usage: bash scripts/nudges-health.sh

set -euo pipefail

REGION="europe-central2"
SERVICE="defpedal-api"

bold()   { printf '\033[1m%s\033[0m\n' "$*"; }
dim()    { printf '\033[2m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
red()    { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

# ── 1. Cloud Run revision + kill switch ──────────────────────────────────────

bold "─── Cloud Run service ───"

REVISION=$(gcloud run services describe "$SERVICE" --region "$REGION" \
  --format='value(status.latestReadyRevisionName)' 2>/dev/null || echo "?")
echo "Latest ready revision: $REVISION"

# gcloud emits env vars as Python-dict-like records separated by ';':
#   {'name': 'NUDGES_ENABLED', 'value': 'true'}
# We grep the NUDGES_ENABLED block and pluck the 'value' field.
ENV_VARS=$(gcloud run services describe "$SERVICE" --region "$REGION" \
  --format='value(spec.template.spec.containers[0].env)' 2>/dev/null || echo "")
NUDGES_BLOCK=$(echo "$ENV_VARS" | tr ';' '\n' | grep -i "'NUDGES_ENABLED'" || true)
NUDGES_VALUE=$(echo "$NUDGES_BLOCK" | sed -n "s/.*'value': '\\([^']*\\)'.*/\\1/p")

if [[ -z "$NUDGES_BLOCK" ]]; then
  yellow "NUDGES_ENABLED: <unset> (defaults FAIL-OPEN → system live)"
elif [[ "$NUDGES_VALUE" =~ ^(false|0|off|FALSE|FALSE)$ ]]; then
  red   "NUDGES_ENABLED: $NUDGES_VALUE → KILL SWITCH ACTIVE (no nudges firing)"
else
  green "NUDGES_ENABLED: $NUDGES_VALUE → system live"
fi
echo ""

# ── 2. Cloud Scheduler jobs ──────────────────────────────────────────────────

bold "─── Cloud Scheduler ───"
printf '%-25s  %-15s  %-10s  %s\n' "JOB" "SCHEDULE" "STATE" "LAST_ATTEMPT"
for JOB in nudges-evaluate-cron nudges-attribute-cron nudges-pattern-cron; do
  ROW=$(gcloud scheduler jobs describe "$JOB" --location "$REGION" \
    --format='value(schedule,state,lastAttemptTime)' 2>/dev/null || echo "MISSING")
  if [[ "$ROW" == "MISSING" ]]; then
    red "  $JOB — not found"
    continue
  fi
  SCHEDULE=$(echo "$ROW" | awk -F'\t' '{print $1}')
  STATE=$(echo "$ROW"    | awk -F'\t' '{print $2}')
  LAST=$(echo "$ROW"     | awk -F'\t' '{print $3}')
  if [[ "$STATE" == "ENABLED" ]]; then
    green "  $(printf '%-25s  %-15s  %-10s  %s' "$JOB" "$SCHEDULE" "$STATE" "$LAST")"
  else
    yellow "  $(printf '%-25s  %-15s  %-10s  %s' "$JOB" "$SCHEDULE" "$STATE" "$LAST")"
  fi
done
echo ""

# ── 3. Recent structured nudge events (last 2 hours) ────────────────────────

bold "─── Recent structured events (last 2 h) ───"
START_TIME=$(date -u -d '2 hours ago' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null \
          || date -u -v-2H '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null \
          || python -c "from datetime import datetime, timezone, timedelta; print((datetime.now(timezone.utc) - timedelta(hours=2)).strftime('%Y-%m-%dT%H:%M:%SZ'))")

EVENTS=$(gcloud logging read "
resource.type=\"cloud_run_revision\"
AND resource.labels.service_name=\"$SERVICE\"
AND timestamp>=\"$START_TIME\"
AND jsonPayload.event=~\"nudge\"
" --limit=20 --format='table(timestamp,jsonPayload.event,jsonPayload.evaluated,jsonPayload.sent,jsonPayload.suppressed,jsonPayload.attributed,jsonPayload.scanned,jsonPayload.updated)' 2>/dev/null || true)

if [[ -z "$EVENTS" || "$EVENTS" == *"Listed 0 items"* ]]; then
  dim "  No nudge log entries in the last 2 h."
  dim "  This is healthy if (a) the kill switch is off AND (b) no eligible users yet."
  dim "  Run \`gcloud scheduler jobs run nudges-evaluate-cron --location $REGION\` to force a tick."
else
  echo "$EVENTS"
fi
echo ""

# ── 4. Tail of any errors in the same window ─────────────────────────────────

bold "─── Errors / warnings in the same window ───"
ERR=$(gcloud logging read "
resource.type=\"cloud_run_revision\"
AND resource.labels.service_name=\"$SERVICE\"
AND timestamp>=\"$START_TIME\"
AND (severity>=WARNING OR jsonPayload.event=~\"error\")
AND jsonPayload.event=~\"nudge\"
" --limit=10 --format='table(timestamp,severity,jsonPayload.event,jsonPayload.error,jsonPayload.userId)' 2>/dev/null || true)

if [[ -z "$ERR" || "$ERR" == *"Listed 0 items"* ]]; then
  green "  No warnings or errors logged for nudge_* events."
else
  red "$ERR"
fi
echo ""

# ── 5. Quick follow-up commands ──────────────────────────────────────────────

bold "─── Follow-up ───"
cat <<EOF
  # Manually fire one cron tick (useful right after a kill-switch flip)
  gcloud scheduler jobs run nudges-evaluate-cron --location $REGION

  # SQL-based health: see docs/ops/nudges-runbook.md for nudge_log queries
  # (funnel breakdown, outcome distribution, per-variant performance, etc.)

  # Roll back (one command — new revision within ~30s)
  gcloud run services update $SERVICE --region $REGION \\
    --update-env-vars NUDGES_ENABLED=false

  # Resume
  gcloud run services update $SERVICE --region $REGION \\
    --update-env-vars NUDGES_ENABLED=true
EOF
