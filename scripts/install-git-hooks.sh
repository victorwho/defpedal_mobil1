#!/usr/bin/env bash
# install-git-hooks.sh — copy tracked hook templates from scripts/git-hooks/
# into .git/hooks/ (which is untracked by git, so each clone needs this once).
#
# Idempotent. Re-run any time scripts/git-hooks/* changes.
#
# Usage:
#   bash scripts/install-git-hooks.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$REPO_ROOT/scripts/git-hooks"
DST_DIR="$REPO_ROOT/.git/hooks"

if [ ! -d "$DST_DIR" ]; then
  echo "ERROR: $DST_DIR does not exist. Are you sure this is a git checkout?"
  exit 1
fi

if [ ! -d "$SRC_DIR" ]; then
  echo "ERROR: $SRC_DIR does not exist."
  exit 1
fi

installed=0
for src in "$SRC_DIR"/*; do
  [ -f "$src" ] || continue
  name="$(basename "$src")"
  dst="$DST_DIR/$name"
  cp -f "$src" "$dst"
  chmod +x "$dst"
  echo "  installed: .git/hooks/$name"
  installed=$((installed + 1))
done

if [ "$installed" -eq 0 ]; then
  echo "No hook templates found in $SRC_DIR — nothing to install."
  exit 0
fi

echo ""
echo "✓ Installed $installed git hook(s)."
