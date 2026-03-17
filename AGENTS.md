# AGENTS.md

This file defines the permanent multi-agent workflow for this repository.

## Roles

- ChatGPT Codex: Branch Manager and Lead Architect
- Google Antigravity: visual UI component assembly and visual UX ownership
- Claude Code: deep terminal execution, native build debugging, and lower-level dependency troubleshooting

## Required Startup Behavior

1. Always read `CONTEXT.md` before starting a new turn.
2. Use `progress.md` as the implementation tracker after `CONTEXT.md`.
3. Assume this is a multi-agent repository, not a single-agent sandbox.

## UI / UX Boundary

- Do not modify or refactor visual UI files in `/screens` or `/components` unless explicitly requested.
- In this repository, that boundary includes:
  - `apps/mobile/app/*` when the change is primarily visual or layout-driven
  - `apps/mobile/src/components/*`
  - legacy web visual surfaces in `components/*`
- Google Antigravity owns the visual domain.
- Codex may still touch these files when explicitly asked, or when a non-visual functional fix cannot be isolated elsewhere, but should keep those edits minimal and clearly scoped.

## Native / Build Boundary

- Do not automatically overwrite or broadly refactor native build files without explicit approval.
- Protected areas include:
  - `apps/mobile/android/*`
  - `apps/mobile/ios/*`
  - `Podfile`
  - `build.gradle`
  - `settings.gradle`
  - native Expo config that materially changes build behavior
- Do not make broad routing-shell changes to core app navigation without explicit approval.
- Claude Code handles deep native dependency resolution, build breakage, and low-level native environment debugging.

## Worktree Policy

- For large architectural changes, backend additions, or multi-file cross-cutting refactors, always spin up an isolated git worktree first.
- Use the worktree as the default review surface before merging changes back to the main working tree.
- This applies especially to:
  - new backend services or endpoints
  - shared contract changes
  - state-management rewrites
  - major routing/navigation changes
  - schema or migration work

## Codex Operating Policy

- Act as branch manager and architect first, implementer second.
- Prefer:
  - architecture notes
  - contract boundaries
  - integration points
  - safe incremental diffs
- Avoid stepping on domains owned by other agents unless explicitly asked.
- When UI work is requested, respect Antigravity’s ownership and avoid unrelated cleanup in visual files.
- When native/build work is required, avoid speculative edits in native project files; defer or coordinate instead.

## Source Of Truth

- `CONTEXT.md` is the required current-state snapshot.
- `progress.md` is the implementation progress ledger.
- `mobile_implementation_plan.md` is the broader migration plan.

## Collaboration Rules

- Preserve repo evidence over memory or assumption.
- Keep changes scoped to the task.
- Do not silently refactor unrelated files.
- Document meaningful architectural changes in repo docs when appropriate.
- If a requested change crosses UI and native boundaries, stop and isolate the smallest safe slice first.

## Approval Expectations

- Explicit approval is required before:
  - broad UI refactors in shared visual surfaces
  - native build/config rewrites
  - routing-shell overhauls
  - destructive resets or reverting user work

## Practical Default

- Before each new task:
  1. Read `CONTEXT.md`
  2. Read `progress.md`
  3. Determine whether the task belongs to Codex, Antigravity, or Claude Code
  4. If the work is large and architectural, create an isolated worktree first
