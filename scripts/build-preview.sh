#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# build-preview.sh — Build a preview APK from C:\dpb
#
# Handles: source sync, cache cleaning, bundle embedding,
#          bundle verification, and APK installation.
#
# Usage:
#   bash scripts/build-preview.sh              # preview flavor (default)
#   bash scripts/build-preview.sh install      # preview + install via ADB
#   bash scripts/build-preview.sh dev          # development flavor
#   bash scripts/build-preview.sh dev install  # development + install
#   bash scripts/build-preview.sh prod         # production flavor
# ──────────────────────────────────────────────────────────

set -euo pipefail

SRC="C:/dev/defpedal"
DST="C:/dpb"
ADB_DEVICE="R5CX61E737J"

# ── Parse arguments ──
FLAVOR="preview"
DO_INSTALL=false
for arg in "$@"; do
  case "$arg" in
    dev|development) FLAVOR="development" ;;
    prod|production) FLAVOR="production" ;;
    preview)         FLAVOR="preview" ;;
    install)         DO_INSTALL=true ;;
  esac
done

# Capitalize first letter for Gradle task name
FLAVOR_CAP="$(echo "${FLAVOR:0:1}" | tr '[:lower:]' '[:upper:]')${FLAVOR:1}"
GRADLE_TASK="assemble${FLAVOR_CAP}Release"
APK_DIR="$DST/apps/mobile/android/app/build/outputs/apk/${FLAVOR}/release"
APK_PATH="$APK_DIR/app-${FLAVOR}-release.apk"

# Marker string to verify bundle freshness — pick something unique to the current code
VERIFY_STRING="XP earned"

echo "── Build: $FLAVOR flavor ──"
echo ""

echo "── Step 1: Sync source files ──"
# Sync all directories that contribute to the JS bundle.
# robocopy exit code 1 = files copied (success), 0 = nothing to copy.
robocopy "$SRC/apps/mobile/app"       "$DST/apps/mobile/app"       //MIR //NFL //NDL //NJH //NJS //nc //ns //np || true
robocopy "$SRC/apps/mobile/src"       "$DST/apps/mobile/src"       //MIR //NFL //NDL //NJH //NJS //nc //ns //np || true
robocopy "$SRC/apps/mobile/assets"    "$DST/apps/mobile/assets"    //MIR //NFL //NDL //NJH //NJS //nc //ns //np || true
robocopy "$SRC/packages/core/src"     "$DST/packages/core/src"     //MIR //NFL //NDL //NJH //NJS //nc //ns //np || true
robocopy "$SRC/services/mobile-api/src" "$DST/services/mobile-api/src" //MIR //NFL //NDL //NJH //NJS //nc //ns //np || true

# Sync config files that affect bundling and native build
for f in app.config.ts metro.config.js tsconfig.json package.json; do
  cp -f "$SRC/apps/mobile/$f" "$DST/apps/mobile/$f" 2>/dev/null || true
done
cp -f "$SRC/package.json" "$DST/package.json" 2>/dev/null || true
cp -f "$SRC/apps/mobile/android/app/build.gradle" "$DST/apps/mobile/android/app/build.gradle" 2>/dev/null || true

echo "── Step 2: Clean Gradle bundle cache ──"
# Forces Gradle to re-run the Metro bundle task instead of reusing stale output.
rm -rf "$DST/apps/mobile/android/app/build/generated/assets/"
rm -rf "$DST/apps/mobile/android/app/build/intermediates/assets/"
rm -rf "$DST/apps/mobile/android/app/build/intermediates/merged_res/"
rm -rf "$DST/apps/mobile/android/app/build/outputs/"

echo "── Step 3: Build $FLAVOR release APK ──"
cd "$DST/apps/mobile/android"
./gradlew "$GRADLE_TASK"

# ── Step 4: Verify bundle freshness ──
# Check that the APK exists
if [ ! -f "$APK_PATH" ]; then
  # Fall back to old non-flavored path (before product flavors were added)
  APK_PATH_FALLBACK="$DST/apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
  if [ -f "$APK_PATH_FALLBACK" ]; then
    APK_PATH="$APK_PATH_FALLBACK"
  else
    echo "ERROR: APK not found at $APK_PATH"
    echo "  Available APKs:"
    find "$DST/apps/mobile/android/app/build/outputs/apk/" -name "*.apk" 2>/dev/null || echo "  (none)"
    exit 1
  fi
fi

echo ""
echo "── Step 4: Verify bundle freshness ──"
if command -v unzip &>/dev/null; then
  BUNDLE_CONTENT=$(unzip -p "$APK_PATH" assets/index.android.bundle 2>/dev/null || true)
  if echo "$BUNDLE_CONTENT" | grep -q "$VERIFY_STRING"; then
    echo "Bundle verified: contains '$VERIFY_STRING'"
  else
    echo "WARNING: Bundle may be stale — '$VERIFY_STRING' not found in APK bundle"
    echo "  The APK might contain old code. Consider running with a full clean:"
    echo "  rm -rf $DST/apps/mobile/android/app/build && rerun"
  fi
else
  echo "Skipping bundle verification (unzip not available)"
fi

echo ""
echo "APK built: $APK_PATH"

# ── Step 5: Install if requested ──
if [ "$DO_INSTALL" = true ]; then
  echo "── Step 5: Installing on device ──"
  adb -s "$ADB_DEVICE" install -r "$APK_PATH"
  echo "Installed $FLAVOR on $ADB_DEVICE"
fi

echo "Done."
