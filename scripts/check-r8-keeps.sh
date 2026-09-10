#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# check-r8-keeps.sh — after a MINIFIED build, prove by content that the R8
# keep rules still protect the reflection-driven code paths.
#
# Reads R8's own reports for the variant: mapping.txt (what was renamed) and
# usage.txt (what was removed). A keep rule that silently stopped matching
# shows up here as a renamed class or a removed member — and nowhere else,
# because the failure it causes is a runtime exception in release builds only
# (error-log #116: the Supabase session read died on the first shrunk build
# and nothing at build time said a word).
#
# Usage:
#   bash scripts/check-r8-keeps.sh <mapping-dir>
#   e.g. .../app/build/outputs/mapping/previewRelease
#
# Returns 0 when every check passes, 1 on the first violation.
# ──────────────────────────────────────────────────────────
set -euo pipefail

DIR="${1:?mapping directory required}"
MAP="$DIR/mapping.txt"
USAGE="$DIR/usage.txt"

if [ ! -f "$MAP" ] || [ ! -f "$USAGE" ]; then
  echo "ERROR: $DIR has no mapping.txt/usage.txt — did R8 run?"
  exit 1
fi

fail=0
esc() { printf '%s' "$1" | sed 's/[.]/[.]/g'; }

echo "── R8 keep check: $DIR ──"

# 1. Classes kotlin-reflect (or the JS bridge) resolves BY NAME. They must
#    survive unrenamed. mapping.txt writes an unrenamed class as "X -> X:".
for c in   expo.modules.kotlin.records.Field   expo.modules.kotlin.records.Required   expo.modules.securestore.SecureStoreOptions   com.reactnativegooglesignin.RNGoogleSigninModule   kotlin.Metadata; do
  if grep -q -E "^$(esc "$c") -> $(esc "$c"):" "$MAP"; then
    echo "  ✓ kept unrenamed: $c"
  else
    echo "  ✗ RENAMED OR MISSING: $c"
    fail=1
  fi
done

# 2. Packages kept wholesale with { *; }. R8 still lists two harmless kinds of
#    entry under them in usage.txt: classes IT synthesised and then folded away
#    (`$$InternalSynthetic*` outlines/lambdas, `-IA` interface adapters), and
#    member lines ("X:") for compiler-generated members of kept classes. What
#    must never appear is a SOURCE class removed outright.
for p in expo.modules. kotlin.reflect.jvm.internal.; do
  removed=$(grep -a -E "^$(esc "$p")" "$USAGE" | grep -v -E ':$' | grep -v -E '\$\$InternalSynthetic|-IA$' || true)
  if [ -z "$removed" ]; then
    echo "  ✓ no source class removed under $p"
  else
    echo "  ✗ source class(es) removed under $p:"
    printf '%s
' "$removed" | awk 'NR<=5' | sed 's/^/      /'
    fail=1
  fi
done

# 3. The classes kotlin-reflect reads by name must keep EVERY member: a
#    member line for them in usage.txt means a field, constructor or the
#    synthetic `$annotations` accessor is gone.
for c in expo.modules.kotlin.records.Field expo.modules.kotlin.records.Required expo.modules.securestore.SecureStoreOptions; do
  if grep -a -q -E "^$(esc "$c"):" "$USAGE"; then
    echo "  ✗ members removed from $c:"
    grep -a -A4 -E "^$(esc "$c"):" "$USAGE" | awk 'NR<=5' | sed 's/^/      /'
    fail=1
  else
    echo "  ✓ all members kept: $c"
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "── R8 keep check FAILED — do not ship this artefact ──"
  exit 1
fi
echo "── R8 keep check passed ──"
