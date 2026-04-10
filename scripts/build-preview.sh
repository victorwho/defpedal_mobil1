#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# build-preview.sh — Build a preview APK from C:\dpb
#
# Handles: source sync, cache cleaning, bundle embedding,
#          and APK installation in the correct order.
#
# Usage:
#   bash scripts/build-preview.sh          # build only
#   bash scripts/build-preview.sh install  # build + install via ADB
# ──────────────────────────────────────────────────────────

set -euo pipefail

SRC="C:/dev/defpedal"
DST="C:/dpb"
APK_PATH="$DST/apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
ADB_DEVICE="R5CX61E737J"

echo "── Step 1: Sync source files ──"
# Sync all directories that contribute to the JS bundle.
# robocopy exit code 1 = files copied (success), 0 = nothing to copy.
robocopy "$SRC/apps/mobile/app"       "$DST/apps/mobile/app"       //MIR //NFL //NDL //NJH //NJS //nc //ns //np || true
robocopy "$SRC/apps/mobile/src"       "$DST/apps/mobile/src"       //MIR //NFL //NDL //NJH //NJS //nc //ns //np || true
robocopy "$SRC/apps/mobile/assets"    "$DST/apps/mobile/assets"    //MIR //NFL //NDL //NJH //NJS //nc //ns //np || true
robocopy "$SRC/packages/core/src"     "$DST/packages/core/src"     //MIR //NFL //NDL //NJH //NJS //nc //ns //np || true
robocopy "$SRC/services/mobile-api/src" "$DST/services/mobile-api/src" //MIR //NFL //NDL //NJH //NJS //nc //ns //np || true

# Sync config files that affect bundling
for f in app.config.ts metro.config.js tsconfig.json package.json; do
  cp -f "$SRC/apps/mobile/$f" "$DST/apps/mobile/$f" 2>/dev/null || true
done
cp -f "$SRC/package.json" "$DST/package.json" 2>/dev/null || true

echo "── Step 2: Clean Gradle bundle cache ──"
# This is the critical step — forces Gradle to re-run the Metro bundle task.
rm -rf "$DST/apps/mobile/android/app/build/generated/assets/"
rm -rf "$DST/apps/mobile/android/app/build/intermediates/assets/"
rm -rf "$DST/apps/mobile/android/app/build/intermediates/merged_res/"
rm -rf "$DST/apps/mobile/android/app/build/outputs/"

echo "── Step 3: Build release APK ──"
cd "$DST/apps/mobile/android"
./gradlew assembleRelease

# Verify the APK was created
if [ ! -f "$APK_PATH" ]; then
  echo "ERROR: APK not found at $APK_PATH"
  exit 1
fi

echo ""
echo "APK built: $APK_PATH"

# Step 4: Install if requested
if [ "${1:-}" = "install" ]; then
  echo "── Step 4: Installing on device ──"
  adb -s "$ADB_DEVICE" install -r "$APK_PATH"
  echo "Installed on $ADB_DEVICE"
fi

echo "Done."
