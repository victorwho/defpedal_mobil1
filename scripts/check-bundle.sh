#!/usr/bin/env bash
# Pre-flight bundle health check
# Verifies Metro can build the full JS bundle without errors.
# Run after code changes, before testing on phone.
#
# Usage:
#   npm run check:bundle          (requires Metro running on :8081)
#   ./scripts/check-bundle.sh

set -euo pipefail

METRO_URL="${METRO_URL:-http://localhost:8081}"
BUNDLE_URL="${METRO_URL}/index.bundle?platform=android&dev=true&minify=false"
TIMEOUT_SECONDS=120

echo "⏳ Checking Metro bundle build..."
echo "   URL: ${BUNDLE_URL}"

# Check Metro is running
if ! curl -s "${METRO_URL}/status" | grep -q "packager-status:running"; then
  echo "❌ Metro is not running on ${METRO_URL}"
  echo "   Start it with: cd apps/mobile && npx expo start"
  exit 1
fi

# Request bundle and check HTTP status
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time ${TIMEOUT_SECONDS} "${BUNDLE_URL}" 2>/dev/null || echo "000")

if [ "${HTTP_CODE}" = "200" ]; then
  echo "✅ Bundle builds successfully (HTTP ${HTTP_CODE})"
  exit 0
elif [ "${HTTP_CODE}" = "500" ]; then
  echo "❌ Bundle build FAILED (HTTP 500)"
  echo ""
  echo "Error details:"
  curl -s "${BUNDLE_URL}" 2>/dev/null | head -c 1000
  echo ""
  exit 1
elif [ "${HTTP_CODE}" = "000" ]; then
  echo "❌ Metro did not respond within ${TIMEOUT_SECONDS}s"
  echo "   Bundle may still be building. Try again in a minute."
  exit 1
else
  echo "⚠️  Unexpected HTTP ${HTTP_CODE}"
  exit 1
fi
