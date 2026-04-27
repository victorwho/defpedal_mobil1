#!/usr/bin/env bash
# Clean up leftover .claude/worktrees/* directories that the standard
# `git worktree remove` cannot delete on Windows because deeply-nested
# files inside junctioned `node_modules` blow past the 260-character path
# limit. Long-standing nuisance — see CLAUDE.md gotcha #7 and the
# "Worktree cleanup" notes from session 31 + 32.
#
# Strategy:
#   1. `git worktree prune` so git stops tracking gone-on-disk worktrees.
#   2. List what git still considers "active" — never touch those.
#   3. For each leftover directory:
#      a. Delete junction symlinks first using `cmd //c rmdir`.
#         Junctions look like directories but `rmdir` removes them
#         WITHOUT recursing into the target — so the real
#         `C:/dev/defpedal/node_modules` etc. stay intact.
#      b. Once the junctions are gone, the remaining tree only contains
#         the worktree's own short-path files, which `rm -rf` handles
#         without hitting the 260-char limit.
#   4. Final `git worktree prune` for safety.
#
# Usage:
#   ./scripts/cleanup-worktrees.sh           # interactive — confirm each dir
#   ./scripts/cleanup-worktrees.sh --all     # delete every stale dir, no prompts
#   ./scripts/cleanup-worktrees.sh --dry-run # show what would be deleted
#
# Safe to re-run. If a dir is half-cleaned (junctions gone, files left),
# the second pass just `rm -rf`s the rest.

set -euo pipefail

readonly WORKTREES_DIR=".claude/worktrees"

# Common junction relative paths we create when setting up a worktree.
# (See `npm run typecheck` setup commands in earlier session prompts.)
readonly JUNCTION_PATHS=(
  "node_modules"
  "apps/mobile/node_modules"
  "apps/web/node_modules"
  "services/mobile-api/node_modules"
  "packages/core/node_modules"
)

MODE="interactive"
case "${1:-}" in
  --all)     MODE="all" ;;
  --dry-run) MODE="dry-run" ;;
  --help|-h)
    sed -n '2,30p' "$0"
    exit 0
    ;;
  '') ;;
  *)
    echo "Unknown flag: $1" >&2
    echo "Run with --help for usage." >&2
    exit 1
    ;;
esac

# Pre-flight
if [ ! -d "$WORKTREES_DIR" ]; then
  echo "No worktrees dir at $WORKTREES_DIR — nothing to clean."
  exit 0
fi
if ! command -v cygpath >/dev/null 2>&1; then
  echo "Warning: cygpath not found. This script assumes Git Bash on Windows." >&2
  echo "On non-Windows systems, the standard 'git worktree remove --force' should suffice." >&2
fi

# Step 1 — let git release any worktrees whose disk dirs are already gone
git worktree prune

# Step 2 — collect the list git still calls "active" so we don't nuke them.
#
# Critical bug fix (2026-04-27 hotfix): the previous version compared `pwd`
# output (POSIX-style `/c/dev/...`) against `git worktree list --porcelain`
# (Windows-style `C:/dev/...`) and never matched. Result: every worktree
# was treated as inactive, every worktree got deleted. We lost some
# uncommitted work in older worktrees from prior sessions before catching
# the bug. Branch refs survived (committed work was recoverable) but
# untracked / dirty files in those worktrees were not.
#
# Fix: normalize both sides to lower-case Windows-with-forward-slashes
# form via `cygpath -m` before grep-comparing.
normalize_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    p=$(cygpath -m "$p" 2>/dev/null || printf "%s" "$p")
  fi
  printf "%s" "$p" | tr '[:upper:]' '[:lower:]'
}

ACTIVE_PATHS=$(git worktree list --porcelain | awk '/^worktree /{print $2}' \
  | while IFS= read -r p; do normalize_path "$p"; done)

remove_junctions_in() {
  local dir="$1"
  for jr in "${JUNCTION_PATHS[@]}"; do
    local junction="$dir/$jr"
    if [ -e "$junction" ]; then
      # `cmd //c rmdir` removes the junction without recursing into its
      # target. Don't substitute `rm -rf` here — that would chase the link.
      local win_path
      win_path=$(cygpath -w "$junction" 2>/dev/null || echo "$junction")
      if cmd //c "rmdir \"$win_path\"" 2>/dev/null; then
        echo "    removed junction: $jr"
      else
        # Could be a regular dir (not a junction). Skip without error.
        echo "    skipped (not a junction or already gone): $jr"
      fi
    fi
  done
}

shopt -s nullglob
declare -i CLEANED=0 SKIPPED=0

for dir in "$WORKTREES_DIR"/*/; do
  # Strip trailing slash for cleaner output
  dir="${dir%/}"

  abs_path=$(cd "$dir" && pwd)
  norm_path=$(normalize_path "$abs_path")

  if echo "$ACTIVE_PATHS" | grep -qF "$norm_path"; then
    echo "→ skipping (active worktree): $dir"
    SKIPPED+=1
    continue
  fi

  case "$MODE" in
    interactive)
      printf "→ delete '%s'? [y/N/q] " "$dir"
      read -r REPLY < /dev/tty
      case "$REPLY" in
        y|Y) ;;
        q|Q) echo "  aborted by user."; break ;;
        *)   echo "  skipped."; SKIPPED+=1; continue ;;
      esac
      ;;
    dry-run)
      echo "→ would delete: $dir"
      SKIPPED+=1
      continue
      ;;
    all)
      echo "→ deleting: $dir"
      ;;
  esac

  remove_junctions_in "$dir"

  # Now everything left in the worktree is regular files + dirs we own.
  if rm -rf "$dir" 2>&1 | sed 's/^/    /'; then
    if [ -d "$dir" ]; then
      echo "    WARNING: $dir still exists after rm -rf. Try Windows Explorer or unlock files."
    else
      echo "    cleaned."
      CLEANED+=1
    fi
  fi
done

# Step 4 — final prune in case any of the deletions affected git-known paths
git worktree prune

cat <<EOF

──────────────────────────────────────────
  cleaned : $CLEANED
  skipped : $SKIPPED
──────────────────────────────────────────
EOF
