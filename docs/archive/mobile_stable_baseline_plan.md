# Mobile Stable Baseline Plan

Last updated: 2026-03-17

## Purpose

This plan turns the current Defensive Pedal migration into a stable mobile-first baseline that can support
normal frontend development and feature delivery without constant repo-level breakage.

## Main risks and fix plans

### Risk 1: Validation and CI are not yet aligned with the mobile-first repo

Problem:

- the default root validation path still mixes legacy web assumptions with the Expo mobile entrypoint
- local validation currently fails at the web build step because the root entry no longer matches Vite's expectations

Plan:

1. split validation into mobile-first and optional legacy-web paths if necessary
2. restore a valid root web entrypoint or remove web from default validation
3. update GitHub Actions CI to run the stable baseline command

Acceptance criteria:

- the default validation command is green locally and in CI

### Risk 2: Test discovery is noisy and non-deterministic

Problem:

- worktree and helper folders are currently being scanned by the test runner
- duplicate tests can pass while still making CI and local output confusing

Plan:

1. tighten Vitest exclusions
2. exclude worktrees, `.claude`, temp folders, output folders, and generated directories
3. confirm the intended set of source tests is the only set being executed

Acceptance criteria:

- one deterministic test set runs on every local and CI invocation

### Risk 3: The repo still has mixed legacy-web and mobile-first developer paths

Problem:

- the current scripts and docs still reflect migration overlap instead of one clear product path

Plan:

1. define the default repo posture as `mobile app + mobile API`
2. update scripts, docs, and onboarding instructions around that path
3. keep the web app only as reference or make it explicitly opt-in

Acceptance criteria:

- a new developer can follow one clear happy path to run, validate, and release the mobile app

### Risk 4: Schema changes are loose SQL files rather than managed migrations

Problem:

- root SQL files make database rollout and environment parity fragile
- `hazard_type` support exists in code but still needs a formalized migration path

Plan:

1. create a migration folder and naming convention
2. move active SQL changes into ordered migrations
3. document application steps for local, staging, and production environments

Acceptance criteria:

- the database schema path is versioned, repeatable, and matches app/backend contracts

### Risk 5: Native validation is partially complete but not yet platform-complete

Problem:

- Android release-style validation is strong
- iPhone validation is still missing
- Android debug-client instability could distract from a reliable release-style workflow

Plan:

1. keep Android release-style validation as the official default
2. defer debug-client repair unless it blocks delivery
3. run one documented iPhone smoke pass on macOS hardware

Acceptance criteria:

- both Android and iPhone have one documented smoke-tested validation path

### Risk 6: Release and staging hardening are not finished

Problem:

- release workflow exists but still needs stronger guardrails
- staging load testing at production-like settings has not yet been completed

Plan:

1. add release preflight checks for required secrets and environment sanity
2. document staged rollout and rollback expectations
3. run smoke, steady, and burst tests against staging with Redis enabled

Acceptance criteria:

- preview release can be triggered with confidence
- staging performance envelope is documented

## Execution order

1. fix validation and CI determinism
2. clean up repo workflow and docs
3. formalize migrations and backend staging expectations
4. complete native validation and release guardrails
5. declare stable baseline and hand off to normal feature delivery

## Non-goals for this branch

- broad visual redesign work
- speculative native build rewrites
- major routing-shell refactors
- unrelated product features
