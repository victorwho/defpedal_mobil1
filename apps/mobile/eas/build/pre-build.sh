#!/usr/bin/env bash
set -euo pipefail

# Inject Mapbox download token so the native build can authenticate with
# Mapbox's package registry. Android reads it from gradle.properties, iOS
# from ~/.netrc during the CocoaPods install.

if [ -z "${RNMAPBOX_MAPS_DOWNLOAD_TOKEN:-}" ]; then
  echo "[eas-hook] WARNING: RNMAPBOX_MAPS_DOWNLOAD_TOKEN not set"
  exit 0
fi

PLATFORM="${EAS_BUILD_PLATFORM:-}"

if [ "$PLATFORM" = "android" ] || [ -z "$PLATFORM" ]; then
  GRADLE_PROPS="android/gradle.properties"
  if [ -f "$GRADLE_PROPS" ]; then
    echo "" >> "$GRADLE_PROPS"
    echo "MAPBOX_DOWNLOADS_TOKEN=$RNMAPBOX_MAPS_DOWNLOAD_TOKEN" >> "$GRADLE_PROPS"
    echo "[eas-hook] Injected MAPBOX_DOWNLOADS_TOKEN into gradle.properties"
  else
    echo "[eas-hook] WARNING: $GRADLE_PROPS not found"
  fi
fi

if [ "$PLATFORM" = "ios" ] || [ -z "$PLATFORM" ]; then
  NETRC="$HOME/.netrc"
  cat >> "$NETRC" <<EOF
machine api.mapbox.com
  login mapbox
  password $RNMAPBOX_MAPS_DOWNLOAD_TOKEN
EOF
  chmod 0600 "$NETRC"
  echo "[eas-hook] Wrote ~/.netrc for Mapbox CocoaPods download"
fi
