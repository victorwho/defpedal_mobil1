#!/usr/bin/env bash
# Capture Play Store screenshots from a connected Android device.
#
# Usage:
#   ./scripts/capture-screenshots.sh [en-US|ro-RO]
#
# Output:
#   apps/mobile/store-listing/<locale>/screenshots/{1-planning,...,5-community}.png
#   apps/mobile/store-listing/<locale>/screenshots/_capture_metadata.txt
#
# How it works:
#   The script is a guided shutter — you navigate the app on your phone,
#   press Enter in the terminal when each screen is set up, and the script
#   captures via `adb exec-out screencap -p`. No automation of the in-app
#   navigation itself, because UI shifts faster than scripted taps can
#   keep up with — but the capture step is reproducible and the output
#   is identical regardless of who runs it on the same device.
#
# Pre-flight:
#   1. Connect the phone via USB.
#   2. Enable USB debugging on the phone (Developer options).
#   3. Run `adb devices` and confirm the phone shows as `device` (not
#      `unauthorized`).
#   4. Set the device locale to match the listing locale (`en-US` or
#      `ro-RO`) so in-app text is captured in the right language. The
#      app reads device locale via the i18n hook.

set -euo pipefail

LOCALE="${1:-en-US}"
case "$LOCALE" in
  en-US|ro-RO) ;;
  *)
    echo "Usage: $0 [en-US|ro-RO]" >&2
    echo "Got: $LOCALE" >&2
    exit 1
    ;;
esac

OUT_DIR="apps/mobile/store-listing/${LOCALE}/screenshots"
mkdir -p "$OUT_DIR"

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

if ! command -v adb >/dev/null 2>&1; then
  echo "Error: adb not found in PATH." >&2
  echo "Install Android Platform Tools or fix your PATH." >&2
  exit 1
fi

DEVICES=$(adb devices | tail -n +2 | grep -cE '\sdevice$' || true)
if [ "$DEVICES" -lt 1 ]; then
  echo "Error: no Android device connected via adb." >&2
  echo "  - Connect phone via USB, enable USB debugging, then re-run." >&2
  echo "  - 'adb devices' should show the phone as 'device' (not 'unauthorized')." >&2
  exit 1
fi
if [ "$DEVICES" -gt 1 ]; then
  echo "Warning: multiple Android devices connected. adb will use the default." >&2
  adb devices >&2
fi

# ---------------------------------------------------------------------------
# Device metadata (saved as a sidecar so we can match captures back later)
# ---------------------------------------------------------------------------

MODEL=$(adb shell getprop ro.product.model 2>/dev/null | tr -d '\r\n')
MANUFACTURER=$(adb shell getprop ro.product.manufacturer 2>/dev/null | tr -d '\r\n')
ANDROID_VERSION=$(adb shell getprop ro.build.version.release 2>/dev/null | tr -d '\r\n')
DENSITY=$(adb shell wm density 2>/dev/null | tr -d '\r\n' | awk '{print $NF}')
SIZE=$(adb shell wm size 2>/dev/null | tr -d '\r\n' | awk '{print $NF}')
APP_VERSION=$(adb shell dumpsys package com.defensivepedal.mobile.preview 2>/dev/null | grep versionName | head -1 | awk -F= '{print $NF}' | tr -d '\r\n' || echo "unknown")
DEVICE_LOCALE=$(adb shell getprop persist.sys.locale 2>/dev/null | tr -d '\r\n')
[ -z "$DEVICE_LOCALE" ] && DEVICE_LOCALE=$(adb shell getprop ro.product.locale 2>/dev/null | tr -d '\r\n')

cat <<EOF
─────────────────────────────────────────────
  Defensive Pedal — Play Store screenshots
─────────────────────────────────────────────
  Listing locale:   $LOCALE
  Output:           $OUT_DIR
  Device:           $MANUFACTURER $MODEL
  Android:          $ANDROID_VERSION
  Resolution:       $SIZE
  Density:          $DENSITY
  Device locale:    $DEVICE_LOCALE
  App version:      $APP_VERSION
─────────────────────────────────────────────
EOF

if [ "$LOCALE" = "ro-RO" ] && [ "${DEVICE_LOCALE#ro}" = "$DEVICE_LOCALE" ]; then
  echo
  echo "WARNING: capturing 'ro-RO' screenshots but device locale is '$DEVICE_LOCALE'."
  echo "  Set device language to Romanian first, or the app will render in English."
  echo
fi

cat > "$OUT_DIR/_capture_metadata.txt" <<EOF
Captured:        $(date -u +%Y-%m-%dT%H:%M:%SZ)
Listing locale:  $LOCALE
Device:          $MANUFACTURER $MODEL
Android:         $ANDROID_VERSION
Resolution:      $SIZE
Density:         $DENSITY
Device locale:   $DEVICE_LOCALE
App version:     $APP_VERSION
EOF

# ---------------------------------------------------------------------------
# Screen list
# ---------------------------------------------------------------------------

SCREENS=(
  "1-planning|Route planning|Search bar shown, map zoomed to your area, Safe/Fast/Flat pill visible, weather widget visible. (apps/mobile/app/route-planning.tsx)"
  "2-preview|Route preview|A route selected. Risk distribution card and elevation chart visible in the bottom sheet. (apps/mobile/app/route-preview.tsx)"
  "3-navigation|Active navigation|3D follow camera engaged, ManeuverCard with a turn instruction, GPS quality indicator visible. (apps/mobile/app/navigation.tsx)"
  "4-impact|Post-ride impact|ImpactSummaryCard after a completed ride OR Impact Dashboard showing streak + lifetime stats. (apps/mobile/app/feedback.tsx OR apps/mobile/app/impact-dashboard.tsx)"
  "5-community|Community|Community feed with at least one shared trip OR City Heartbeat dashboard with the activity chart and pulse. (apps/mobile/app/community-feed.tsx OR apps/mobile/app/city-heartbeat.tsx)"
)

# ---------------------------------------------------------------------------
# Capture loop
# ---------------------------------------------------------------------------

for ENTRY in "${SCREENS[@]}"; do
  IFS='|' read -r NAME LABEL DESC <<<"$ENTRY"
  echo
  echo "── ${NAME} — ${LABEL} ──"
  echo "${DESC}"
  echo
  echo "Set up the screen on the phone, then press Enter to capture."
  echo "(type 's' + Enter to skip, 'q' + Enter to quit)"
  read -r REPLY
  case "$REPLY" in
    s|S) echo "Skipped $NAME."; continue ;;
    q|Q) echo "Aborted by user."; exit 0 ;;
  esac

  OUT_FILE="$OUT_DIR/${NAME}.png"
  if ! adb exec-out screencap -p > "$OUT_FILE" 2>/dev/null; then
    echo "Capture failed for $NAME — adb returned an error." >&2
    rm -f "$OUT_FILE"
    continue
  fi
  if [ ! -s "$OUT_FILE" ]; then
    echo "Capture failed for $NAME — empty file." >&2
    rm -f "$OUT_FILE"
    continue
  fi
  BYTES=$(wc -c < "$OUT_FILE" | tr -d ' ')
  printf "Saved: %s (%s bytes)\n" "$OUT_FILE" "$BYTES"
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo
echo "─────────────────────────────────────────────"
echo "Captured PNGs:"
ls -1 "$OUT_DIR"/*.png 2>/dev/null || echo "  (none)"
echo
echo "Play Console requirements:"
echo "  * 16:9 landscape OR 9:16 portrait"
echo "  * 320-3840 px on each side"
echo "  * PNG or JPEG, max 8 MB each"
echo "  * 2-8 phone screenshots required for the listing"
echo
echo "Upload at: Play Console > Grow > Store presence > Main store listing >"
echo "           Phone screenshots, after switching to the $LOCALE language tab."
