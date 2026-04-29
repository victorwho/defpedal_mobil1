#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# audit-release-artifacts.sh — Scan a built AAB/APK for
# dev-only artefacts that must never reach production.
#
# Fails the build if any forbidden token appears in the
# manifest, packaged JS bundle, or extra config payload.
#
# Usage:
#   bash scripts/audit-release-artifacts.sh <path-to-aab-or-apk>
#
# Returns 0 on clean, 1 on any leak.
# ──────────────────────────────────────────────────────────

set -euo pipefail

ARTIFACT="${1:-}"
if [ -z "$ARTIFACT" ] || [ ! -f "$ARTIFACT" ]; then
  echo "ERROR: usage: $0 <path-to-aab-or-apk>"
  exit 1
fi

echo "── Auditing $ARTIFACT ──"

# Forbidden tokens — must NOT appear anywhere in a release build.
# Note: "devAuthBypassEnabled":"false" IS shipped intentionally as an explicit
# safety signal, so we only flag the secret-bearing fields (token / userId /
# email) rather than every substring containing "devAuthBypass".
FORBIDDEN_TOKENS=(
  "devAuthBypassToken"
  "devAuthBypassUserId"
  "devAuthBypassEmail"
  "DEV_AUTH_BYPASS_TOKEN"
  "dev-bypass"
)

# Forbidden manifest attributes — must NOT be true in a release manifest.
# We tolerate the property name appearing if the value is "false".
FORBIDDEN_TRUE=(
  "android:debuggable=\"true\""
  "EX_DEV_CLIENT_NETWORK_INSPECTOR=true"
)

EXIT_CODE=0
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Extract the AAB/APK to inspect contents
case "$ARTIFACT" in
  *.aab) unzip -qo "$ARTIFACT" -d "$TMPDIR/extracted" ;;
  *.apk) unzip -qo "$ARTIFACT" -d "$TMPDIR/extracted" ;;
  *) echo "ERROR: artefact must be .aab or .apk"; exit 1 ;;
esac

# Locate the manifest (AAB has it at base/manifest/AndroidManifest.xml)
MANIFEST=""
if [ -f "$TMPDIR/extracted/base/manifest/AndroidManifest.xml" ]; then
  MANIFEST="$TMPDIR/extracted/base/manifest/AndroidManifest.xml"
elif [ -f "$TMPDIR/extracted/AndroidManifest.xml" ]; then
  MANIFEST="$TMPDIR/extracted/AndroidManifest.xml"
fi

if [ -z "$MANIFEST" ]; then
  echo "WARNING: could not locate AndroidManifest.xml — manifest checks skipped"
else
  echo "── Checking manifest: $MANIFEST ──"
  # Manifests in AABs are binary; aapt2 dumps them as readable XML.
  if command -v aapt2 >/dev/null 2>&1; then
    MANIFEST_TEXT=$(aapt2 dump xmltree --file AndroidManifest.xml "$ARTIFACT" 2>/dev/null || aapt2 dump xmltree "$MANIFEST" 2>/dev/null || true)
  else
    MANIFEST_TEXT=$(strings "$MANIFEST" 2>/dev/null || cat "$MANIFEST")
  fi

  if echo "$MANIFEST_TEXT" | grep -qiE 'android:debuggable.*=.*(0xffffffff|true|"-1")'; then
    echo "ERROR: android:debuggable=true in release manifest"
    EXIT_CODE=1
  fi
fi

# Scan all packaged JS bundles + assets for forbidden tokens.
echo "── Scanning packaged assets for forbidden tokens ──"
for token in "${FORBIDDEN_TOKENS[@]}"; do
  HITS=$(grep -rIl "$token" "$TMPDIR/extracted" 2>/dev/null || true)
  if [ -n "$HITS" ]; then
    echo "ERROR: forbidden token '$token' found in:"
    echo "$HITS" | sed 's/^/  /'
    EXIT_CODE=1
  fi
done

for needle in "${FORBIDDEN_TRUE[@]}"; do
  HITS=$(grep -rIl "$needle" "$TMPDIR/extracted" 2>/dev/null || true)
  if [ -n "$HITS" ]; then
    echo "ERROR: forbidden assignment '$needle' found in:"
    echo "$HITS" | sed 's/^/  /'
    EXIT_CODE=1
  fi
done

if [ "$EXIT_CODE" = 0 ]; then
  echo "✓ Audit passed — no forbidden artefacts in $ARTIFACT"
else
  echo "✗ Audit failed — see errors above"
fi

exit "$EXIT_CODE"
